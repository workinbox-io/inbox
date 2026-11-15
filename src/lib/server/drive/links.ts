/**
 * Public links to a drive item (/s/<token>): anyone with the link sees the file, or browses the folder and downloads
 * what's in it, until it expires or is deleted. With a password, the browser gets a signed cookie for 12 hours after
 * entering it. A link dies with its item, and stops working while the item (or a folder above it) is in the trash.
 */
import { env } from "cloudflare:workers";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, asc, db, driveItems, driveLinks, eq, inArray, isNull } from "@/db";
import { ancestorIds, isWithin } from "@/lib/drive/access";
import { HttpError } from "@/lib/server/api";
import { randomBase64Url } from "@/lib/server/crypto";
import { requireItem, type DriveItem, type DriveViewer } from "./access";

export const LINK_UNLOCK_MS = 12 * 3600_000;

const linkView = (l: typeof driveLinks.$inferSelect) => ({
  id: l.id,
  token: l.token,
  hasPassword: !!l.passwordHash,
  expiresAt: l.expiresAt?.toISOString() ?? null,
  createdAt: l.createdAt.toISOString(),
});
export type DriveLinkView = ReturnType<typeof linkView>;

export async function listLinks(v: DriveViewer, itemId: string) {
  await requireItem(v, itemId, "manage");
  const rows = await db.select().from(driveLinks).where(eq(driveLinks.itemId, itemId)).orderBy(asc(driveLinks.createdAt));
  return rows.map(linkView);
}

export async function createLink(v: DriveViewer, itemId: string, input: { password?: string; expiresAt?: number | null }) {
  const { item } = await requireItem(v, itemId, "manage");
  if (input.expiresAt && input.expiresAt <= Date.now()) throw new HttpError(422, "Pick an expiry date in the future");
  const [row] = await db
    .insert(driveLinks)
    .values({
      orgId: v.orgId,
      itemId,
      token: randomBase64Url(16),
      passwordHash: input.password ? await hashPassword(input.password) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdBy: v.userId || null,
    })
    .returning();
  return { item, link: linkView(row!) };
}

export async function deleteLink(v: DriveViewer, linkId: string) {
  const [row] = await db.select().from(driveLinks).where(and(eq(driveLinks.id, linkId), eq(driveLinks.orgId, v.orgId)));
  if (!row) throw new HttpError(404, "Not found");
  const { item } = await requireItem(v, row.itemId, "manage", { trashed: true });
  await db.delete(driveLinks).where(eq(driveLinks.id, linkId));
  return item;
}

// The unlock cookie: "<expiry>.<HMAC(token.expiry)>", so a password unlocks one link for a while.
const enc = new TextEncoder();
const hmacKey = () => crypto.subtle.importKey("raw", enc.encode(`drive-link:${env.BETTER_AUTH_SECRET}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export const unlockCookieName = (token: string) => `dl_${token}`;

export async function unlockValue(token: string, now = Date.now()) {
  const exp = now + LINK_UNLOCK_MS;
  return `${exp}.${hex(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(`${token}.${exp}`)))}`;
}

async function unlocked(token: string, cookie: string | undefined, now = Date.now()) {
  const [exp, sig] = (cookie ?? "").split(".");
  if (!exp || !sig || Number(exp) < now) return false;
  const bytes = Uint8Array.from(sig.match(/../g) ?? [], (h) => parseInt(h, 16));
  return crypto.subtle.verify("HMAC", await hmacKey(), bytes, enc.encode(`${token}.${exp}`));
}

export type PublicLink =
  | { state: "missing" }
  | { state: "locked"; name: string }
  | { state: "open"; link: typeof driveLinks.$inferSelect; root: DriveItem; item: DriveItem };

/**
 * What a visitor of /s/<token> may see: the shared item, or `itemId` inside a shared folder. "locked" until the
 * password cookie is there. Expired, deleted, trashed and outside-the-folder all look the same: missing.
 */
export async function openLink(token: string, opts: { itemId?: string | null; cookie?: string } = {}): Promise<PublicLink> {
  if (!/^[\w-]{16,40}$/.test(token)) return { state: "missing" };
  const [link] = await db.select().from(driveLinks).where(eq(driveLinks.token, token));
  if (!link || (link.expiresAt && link.expiresAt.getTime() < Date.now())) return { state: "missing" };
  const [root] = await db.select().from(driveItems).where(eq(driveItems.id, link.itemId));
  if (!root) return { state: "missing" };
  if (link.passwordHash && !(await unlocked(token, opts.cookie))) return { state: "locked", name: root.name };
  let item = root;
  if (opts.itemId && opts.itemId !== root.id) {
    const [inner] = await db.select().from(driveItems).where(and(eq(driveItems.id, opts.itemId), eq(driveItems.orgId, root.orgId)));
    if (!inner || !isWithin(inner.path, root.path)) return { state: "missing" };
    item = inner;
  }
  // Nothing on the way from the drive's root to the item may be in the trash.
  const above = ancestorIds(item.path);
  const trashed = above.length
    ? await db.select({ id: driveItems.id, trashedAt: driveItems.trashedAt }).from(driveItems).where(and(eq(driveItems.orgId, root.orgId), inArray(driveItems.id, above)))
    : [];
  if (item.trashedAt || trashed.some((t) => t.trashedAt)) return { state: "missing" };
  return { state: "open", link, root, item };
}

export async function checkLinkPassword(token: string, password: string) {
  const [link] = await db.select().from(driveLinks).where(eq(driveLinks.token, token));
  if (!link?.passwordHash) return false;
  return verifyPassword({ hash: link.passwordHash, password });
}

/** A shared folder's contents for the public page (no owners, no internal details). */
export async function publicChildren(folder: DriveItem) {
  const rows = await db
    .select({ id: driveItems.id, kind: driveItems.kind, name: driveItems.name, size: driveItems.size, mediaType: driveItems.mediaType, updatedAt: driveItems.updatedAt })
    .from(driveItems)
    .where(and(eq(driveItems.orgId, folder.orgId), eq(driveItems.parentId, folder.id), isNull(driveItems.trashedAt)));
  return rows.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.kind === "folder" ? -1 : 1));
}
