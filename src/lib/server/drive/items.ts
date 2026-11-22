/**
 * Drive items: list (a folder, my drive, shared with me, recent, trash, search), folders, rename and move, trash,
 * sharing and deleting for good. Files arrive through ./uploads; their bytes live in R2 under `r2Key`.
 */
import { notify } from "@/lib/server/notifications";
import { env } from "cloudflare:workers";
import { and, db, desc, driveAccess, driveItems, driveLinks, driveStars, eq, inArray, isNotNull, isNull, lt, member, or, sql, user } from "@/db";
import { cleanName, MAX_DEPTH, uniqueName, type DriveRole } from "@/lib/drive/access";
import { HttpError } from "@/lib/server/api";
import { enqueue } from "@/lib/server/queue";
import type { DriveList, DriveShare, DriveUpdate } from "@/lib/validation-drive";
import { requireDriveSpace } from "./quota";
import { abortStaleUploads } from "./uploads";
import { requireFolder, requireItem, rolesFor, visibleItems, type DriveItem, type DriveViewer } from "./access";

export interface DriveSummary {
  id: string;
  parentId: string | null;
  kind: DriveItem["kind"];
  name: string;
  size: number;
  mediaType: string | null;
  sharing: DriveItem["sharing"];
  ownerId: string | null;
  ownerName: string | null;
  role: DriveRole;
  manage: boolean;
  trashed: boolean;
  starred: boolean;
  updatedAt: string;
}

/** Trash is emptied for good after this long (daily task). */
export const TRASH_DAYS = 30;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
export const depthOf = (path: string) => path.split("/").filter(Boolean).length;

async function ownerNames(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map<string, string>();
  const rows = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Summaries of the items the viewer can open, in the given order. */
async function starsOf(v: DriveViewer, ids: string[]) {
  if (!v.userId || !ids.length) return new Set<string>();
  const rows = await db.select({ id: driveStars.itemId }).from(driveStars).where(and(eq(driveStars.userId, v.userId), inArray(driveStars.itemId, ids)));
  return new Set(rows.map((r) => r.id));
}

export async function summarize(v: DriveViewer, items: DriveItem[], opts: { trashed?: boolean } = {}): Promise<DriveSummary[]> {
  const [roles, names, stars] = await Promise.all([rolesFor(v, items), ownerNames(items.map((i) => i.ownerId)), starsOf(v, items.map((i) => i.id))]);
  return items.flatMap((i) => {
    const r = roles.get(i.id);
    if (!r?.role || (r.trashed && !opts.trashed)) return [];
    return [
      {
        id: i.id,
        parentId: i.parentId,
        kind: i.kind,
        name: i.name,
        size: i.size,
        mediaType: i.mediaType,
        sharing: i.sharing,
        ownerId: i.ownerId,
        ownerName: i.ownerId ? (names.get(i.ownerId) ?? null) : null,
        role: r.role,
        manage: r.manage,
        trashed: r.trashed,
        starred: stars.has(i.id),
        updatedAt: i.updatedAt.toISOString(),
      },
    ];
  });
}

const folderFirst = (a: DriveItem, b: DriveItem) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) : a.kind === "folder" ? -1 : 1);

export async function listItems(v: DriveViewer, q: DriveList) {
  if (q.q) {
    const rows = await db
      .select()
      .from(driveItems)
      .where(and(visibleItems(v), sql`${driveItems.name} LIKE ${`%${escapeLike(q.q)}%`} ESCAPE '\\'`))
      .orderBy(desc(driveItems.updatedAt))
      .limit(100);
    return { items: await summarize(v, rows) };
  }
  if (q.folder) {
    const { item } = await requireItem(v, q.folder);
    if (item.kind !== "folder") throw new HttpError(422, "Not a folder");
    const rows = await db
      .select()
      .from(driveItems)
      .where(and(eq(driveItems.orgId, v.orgId), eq(driveItems.parentId, item.id), isNull(driveItems.trashedAt)));
    return { items: await summarize(v, rows.sort(folderFirst)) };
  }
  if (q.view === "recent") {
    const rows = await db
      .select()
      .from(driveItems)
      .where(and(visibleItems(v), eq(driveItems.kind, "file")))
      .orderBy(desc(driveItems.updatedAt))
      .limit(50);
    return { items: await summarize(v, rows) };
  }
  if (q.view === "trash") {
    if (!v.userId) return { items: [] };
    // What the viewer put in the trash, or owns, or (as a manager) ownerless items: each one they may restore.
    const rows = await db
      .select()
      .from(driveItems)
      .where(and(eq(driveItems.orgId, v.orgId), isNotNull(driveItems.trashedAt), or(eq(driveItems.trashedBy, v.userId), eq(driveItems.ownerId, v.userId), isNull(driveItems.ownerId))))
      .orderBy(desc(driveItems.trashedAt))
      .limit(500);
    return { items: (await summarize(v, rows, { trashed: true })).filter((i) => i.manage) };
  }
  if (q.view === "shared") return { items: await sharedWithMe(v) };
  if (q.view === "starred") {
    if (!v.userId) return { items: [] };
    const starred = db.select({ id: driveStars.itemId }).from(driveStars).where(eq(driveStars.userId, v.userId));
    const rows = await db.select().from(driveItems).where(and(visibleItems(v), inArray(driveItems.id, starred))).limit(500);
    return { items: await summarize(v, rows.sort(folderFirst)) };
  }
  if (!v.userId) return { items: [] };
  const rows = await db
    .select()
    .from(driveItems)
    .where(and(eq(driveItems.orgId, v.orgId), isNull(driveItems.parentId), eq(driveItems.ownerId, v.userId), isNull(driveItems.trashedAt)));
  return { items: await summarize(v, rows.sort(folderFirst)) };
}

/** Items shared with the viewer directly or with the team, that aren't theirs and aren't inside a folder they already see. */
async function sharedWithMe(v: DriveViewer) {
  const direct = v.userId ? db.select({ id: driveAccess.itemId }).from(driveAccess).where(eq(driveAccess.userId, v.userId)) : null;
  const rows = await db
    .select()
    .from(driveItems)
    .where(
      and(
        eq(driveItems.orgId, v.orgId),
        isNull(driveItems.trashedAt),
        or(eq(driveItems.sharing, "team"), direct ? and(eq(driveItems.sharing, "people"), inArray(driveItems.id, direct)) : undefined),
        v.userId ? or(isNull(driveItems.ownerId), sql`${driveItems.ownerId} <> ${v.userId}`) : undefined,
      ),
    )
    .limit(500);
  const parentIds = [...new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x))];
  const parents = parentIds.length ? await db.select().from(driveItems).where(and(eq(driveItems.orgId, v.orgId), inArray(driveItems.id, parentIds))) : [];
  const parentRoles = await rolesFor(v, parents);
  const seen = new Set(parents.filter((p) => parentRoles.get(p.id)?.role).map((p) => p.id));
  return summarize(v, rows.filter((r) => !r.parentId || !seen.has(r.parentId)).sort(folderFirst));
}

/** Breadcrumbs: the folders above the item that the viewer can open, root first. */
async function crumbs(v: DriveViewer, chain: DriveItem[]) {
  const above = chain.slice(0, -1);
  const roles = await rolesFor(v, above);
  const start = above.findIndex((i) => roles.get(i.id)?.role);
  return start < 0 ? [] : above.slice(start).map((i) => ({ id: i.id, name: i.name }));
}

export async function getItem(v: DriveViewer, id: string) {
  const { item, chain, manage } = await requireItem(v, id, "view", { trashed: true });
  const [summary] = await summarize(v, [item], { trashed: true });
  const people = manage
    ? await db
        .select({ userId: driveAccess.userId, role: driveAccess.role })
        .from(driveAccess)
        .where(eq(driveAccess.itemId, id))
    : [];
  // Where it sits: in the owner's drive from the root, or reached through a share.
  const mine = !!v.userId && chain[0]?.ownerId === v.userId;
  return { ...summary!, teamRole: item.teamRole, people, crumbs: await crumbs(v, chain), root: mine ? ("mine" as const) : ("shared" as const) };
}

/** Names already used in a folder (or at the root of `ownerId`'s drive), for uniqueName. */
export async function takenNames(orgId: string, parentId: string | null, ownerId: string | null) {
  const where = parentId
    ? and(eq(driveItems.orgId, orgId), eq(driveItems.parentId, parentId), isNull(driveItems.trashedAt))
    : and(eq(driveItems.orgId, orgId), isNull(driveItems.parentId), ownerId ? eq(driveItems.ownerId, ownerId) : isNull(driveItems.ownerId), isNull(driveItems.trashedAt));
  const rows = await db.select({ name: driveItems.name }).from(driveItems).where(where);
  return new Set(rows.map((r) => r.name));
}

/** Path and owner fields for a new item in `parent` (null = the viewer's root). */
export function placement(v: DriveViewer, id: string, parent: DriveItem | null) {
  if (parent && depthOf(parent.path) >= MAX_DEPTH) throw new HttpError(422, `Folders can be nested ${MAX_DEPTH} deep`);
  return {
    id,
    orgId: v.orgId,
    parentId: parent?.id ?? null,
    path: `${parent?.path ?? "/"}${id}/`,
    ownerId: v.userId || null,
    // Made with an API key: nobody owns it, so it belongs to the team (managers run it).
    sharing: v.userId ? ("private" as const) : ("team" as const),
    createdBy: v.userId || null,
    updatedBy: v.userId || null,
  };
}

export async function createFolder(v: DriveViewer, input: { parentId?: string | null; name: string }) {
  const parent = await requireFolder(v, input.parentId);
  const name = cleanName(input.name);
  if (!name) throw new HttpError(422, "Enter a name");
  const id = crypto.randomUUID();
  await db.insert(driveItems).values({ ...placement(v, id, parent), kind: "folder", name: uniqueName(name, await takenNames(v.orgId, parent?.id ?? null, v.userId || null)) });
  return getItem(v, id);
}

export async function updateItem(v: DriveViewer, id: string, input: DriveUpdate) {
  if (input.trashed !== undefined) return input.trashed ? trashItem(v, id) : restoreItem(v, id);
  const moving = input.parentId !== undefined;
  const { item } = await requireItem(v, id, moving ? "manage" : "edit");
  const set: Partial<DriveItem> = { updatedBy: v.userId || null, updatedAt: new Date() };
  let target: DriveItem | null = null;
  if (moving && input.parentId !== item.parentId) {
    target = await requireFolder(v, input.parentId);
    if (target && target.path.startsWith(item.path)) throw new HttpError(422, "A folder can't go inside itself");
    if (!target && item.ownerId !== v.userId) throw new HttpError(422, "Only the owner can move it to My drive");
    const [deepest] = await db
      .select({ d: sql<number>`max(length(${driveItems.path}) - length(replace(${driveItems.path}, '/', '')) - 1)` })
      .from(driveItems)
      .where(and(eq(driveItems.orgId, v.orgId), sql`instr(${driveItems.path}, ${item.path}) = 1`));
    const below = Number(deepest?.d ?? depthOf(item.path)) - depthOf(item.path);
    if ((target ? depthOf(target.path) : 0) + 1 + below > MAX_DEPTH) throw new HttpError(422, `Folders can be nested ${MAX_DEPTH} deep`);
  }
  const parentId = moving ? (input.parentId ?? null) : item.parentId;
  if (input.name !== undefined || (moving && parentId !== item.parentId)) {
    const name = cleanName(input.name ?? item.name);
    if (!name) throw new HttpError(422, "Enter a name");
    const taken = await takenNames(v.orgId, parentId, item.ownerId);
    taken.delete(item.name);
    set.name = uniqueName(name, taken);
  }
  if (moving && parentId !== item.parentId) {
    const path = `${target?.path ?? "/"}${item.id}/`;
    await db.batch([
      db.update(driveItems).set({ ...set, parentId }).where(eq(driveItems.id, id)),
      db
        .update(driveItems)
        .set({ path: sql`${path} || substr(${driveItems.path}, ${item.path.length + 1})` })
        .where(and(eq(driveItems.orgId, v.orgId), sql`instr(${driveItems.path}, ${item.path}) = 1`)),
    ]);
  } else {
    await db.update(driveItems).set(set).where(eq(driveItems.id, id));
  }
  return getItem(v, id);
}

async function trashItem(v: DriveViewer, id: string) {
  await requireItem(v, id, "manage");
  await db.update(driveItems).set({ trashedAt: new Date(), trashedBy: v.userId || null }).where(eq(driveItems.id, id));
  return getItem(v, id);
}

async function restoreItem(v: DriveViewer, id: string) {
  const { item, chain } = await requireItem(v, id, "manage", { trashed: true });
  if (!item.trashedAt) throw new HttpError(409, "Restore the folder it's in");
  const set: Partial<DriveItem> = { trashedAt: null, trashedBy: null };
  // The folder it was in went to the trash too: it comes back at the root of the owner's drive.
  if (chain.slice(0, -1).some((i) => i.trashedAt)) {
    if (item.ownerId !== v.userId) throw new HttpError(409, "Restore the folder it's in");
    await db.batch([
      db.update(driveItems).set({ ...set, parentId: null }).where(eq(driveItems.id, id)),
      db
        .update(driveItems)
        .set({ path: sql`${`/${item.id}/`} || substr(${driveItems.path}, ${item.path.length + 1})` })
        .where(and(eq(driveItems.orgId, v.orgId), sql`instr(${driveItems.path}, ${item.path}) = 1`)),
    ]);
  } else {
    await db.update(driveItems).set(set).where(eq(driveItems.id, id));
  }
  return getItem(v, id);
}

export async function shareItem(v: DriveViewer, id: string, input: DriveShare) {
  const { item } = await requireItem(v, id, "manage");
  if (!v.userId && input.sharing !== "team") throw new HttpError(422, "API keys can only keep items shared with the team");
  const people = input.sharing === "people" ? input.people.filter((p) => p.userId !== item.ownerId) : [];
  if (people.length) {
    const ids = people.map((p) => p.userId);
    const members = await db
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, v.orgId), inArray(member.userId, ids)));
    if (members.length !== new Set(ids).size) throw new HttpError(422, "Share with members of this organization only");
  }
  const before = new Set((await db.select({ userId: driveAccess.userId }).from(driveAccess).where(eq(driveAccess.itemId, id))).map((r) => r.userId));
  await db.batch([
    db.update(driveItems).set({ sharing: input.sharing, teamRole: input.teamRole }).where(eq(driveItems.id, id)),
    db.delete(driveAccess).where(eq(driveAccess.itemId, id)),
    ...(people.length ? [db.insert(driveAccess).values(people.map((p) => ({ itemId: id, userId: p.userId, role: p.role })))] : []),
  ]);
  await notify(v.orgId, people.filter((p) => !before.has(p.userId)).map((p) => p.userId), {
    kind: "share", app: "drive", actorId: v.userId || null, title: item.name, body: item.kind === "folder" ? "a folder" : "a file", href: `/app/open/file/${id}`, groupKey: `file:${id}`,
  });
  return getItem(v, id);
}

/** Deletes a trashed item and everything inside it for good (R2 objects too), through the queue. */
export async function deleteForever(v: DriveViewer, id: string) {
  const { item, trashed } = await requireItem(v, id, "manage", { trashed: true });
  if (!trashed) throw new HttpError(409, "Move it to the trash first");
  await enqueue("drive.purge", { orgId: v.orgId, path: item.path });
  return item;
}

export async function emptyTrash(v: DriveViewer) {
  const { items } = await listItems(v, { view: "trash" });
  for (const i of items.filter((i) => i.manage)) {
    const [row] = await db.select({ path: driveItems.path }).from(driveItems).where(eq(driveItems.id, i.id));
    if (row) await enqueue("drive.purge", { orgId: v.orgId, path: row.path });
  }
  return { count: items.length };
}

const PURGE_BATCH = 500;

/** Job drive.purge: removes the subtree at `path` in batches; re-runs are safe (deleted rows are gone). */
export async function purgeSubtree(orgId: string, path: string) {
  for (;;) {
    const rows = await db
      .select({ id: driveItems.id, r2Key: driveItems.r2Key })
      .from(driveItems)
      .where(and(eq(driveItems.orgId, orgId), sql`instr(${driveItems.path}, ${path}) = 1`))
      .limit(PURGE_BATCH);
    if (!rows.length) return;
    const snapshots = await db.select({ key: driveLinks.snapshotKey }).from(driveLinks).where(inArray(driveLinks.itemId, rows.map((r) => r.id)));
    const keys = [...rows.map((r) => r.r2Key), ...snapshots.map((s) => s.key)].filter((k): k is string => !!k);
    if (keys.length) await env.FILES.delete(keys);
    await db.delete(driveItems).where(inArray(driveItems.id, rows.map((r) => r.id)));
    if (rows.length < PURGE_BATCH) return;
  }
}

/** Daily: trash older than TRASH_DAYS goes for good, and uploads left unfinished for a day are aborted. */
export async function cleanDrive() {
  const old = await db
    .select({ orgId: driveItems.orgId, path: driveItems.path })
    .from(driveItems)
    .where(lt(driveItems.trashedAt, new Date(Date.now() - TRASH_DAYS * 86_400_000)))
    .limit(1000);
  for (const o of old) await enqueue("drive.purge", o);
  const aborted = await abortStaleUploads();
  return { purged: old.length, aborted };
}

/** Stars are personal: anyone who can open an item may star it. */
export async function starItem(v: DriveViewer, id: string, starred: boolean) {
  if (!v.userId) throw new HttpError(403, "Sign in to star items");
  await requireItem(v, id);
  if (starred) await db.insert(driveStars).values({ userId: v.userId, itemId: id }).onConflictDoNothing();
  else await db.delete(driveStars).where(and(eq(driveStars.userId, v.userId), eq(driveStars.itemId, id)));
}

/** A copy is made synchronously up to this much; larger ones need splitting for now. */
const COPY_MAX_ITEMS = 200;
const COPY_MAX_BYTES = 1024 ** 3;

/**
 * "Make a copy": the item (and for a folder, everything in it the viewer can see) as new private items of the viewer,
 * in `parentId` (default: next to the original if they may add there, else My drive). R2 objects are copied.
 * shortcut: synchronous up to COPY_MAX_ITEMS / COPY_MAX_BYTES; move to a queue job if teams copy bigger trees.
 */
export async function copyItem(v: DriveViewer, id: string, parentId?: string | null) {
  if (!v.userId) throw new HttpError(403, "Sign in to make copies");
  const { item } = await requireItem(v, id);
  let parent: DriveItem | null;
  if (parentId !== undefined) parent = await requireFolder(v, parentId);
  else parent = item.parentId ? await requireFolder(v, item.parentId).catch(() => null) : null;
  const rows =
    item.kind === "folder"
      ? await db
          .select()
          .from(driveItems)
          .where(and(eq(driveItems.orgId, v.orgId), sql`instr(${driveItems.path}, ${item.path}) = 1`, isNull(driveItems.trashedAt)))
          .limit(COPY_MAX_ITEMS + 1)
      : [item];
  if (rows.length > COPY_MAX_ITEMS) throw new HttpError(422, `Folders with up to ${COPY_MAX_ITEMS} items can be copied`);
  const bytes = rows.reduce((n, r) => n + r.size, 0);
  if (bytes > COPY_MAX_BYTES) throw new HttpError(422, "Copies can be up to 1 GB; copy smaller parts");
  if (parent && depthOf(parent.path) + Math.max(...rows.map((r) => depthOf(r.path))) - depthOf(item.path) + 1 > MAX_DEPTH)
    throw new HttpError(422, `Folders can be nested ${MAX_DEPTH} deep`);
  await requireDriveSpace(v.orgId, bytes);
  // Parents before children, so every copy finds its new parent's path.
  const ids = new Map(rows.map((r) => [r.id, crypto.randomUUID()]));
  const paths = new Map<string, string>();
  const values: (typeof driveItems.$inferInsert)[] = [];
  const top = uniqueName(`Copy of ${item.name}`.slice(0, 200), await takenNames(v.orgId, parent?.id ?? null, v.userId));
  for (const r of [...rows].sort((a, b) => a.path.length - b.path.length)) {
    const newId = ids.get(r.id)!;
    const newParent = r.id === item.id ? (parent?.id ?? null) : ids.get(r.parentId!)!;
    const base = r.id === item.id ? (parent?.path ?? "/") : paths.get(newParent!);
    if (!base) continue;
    const path = `${base}${newId}/`;
    paths.set(newId, path);
    let r2Key: string | null = null;
    if (r.kind === "file" && r.r2Key) {
      const object = await env.FILES.get(r.r2Key);
      if (!object) continue;
      r2Key = `drive/${v.orgId}/${newId}`;
      await env.FILES.put(r2Key, object.body, { httpMetadata: object.httpMetadata });
    }
    values.push({
      ...placement(v, newId, null),
      parentId: newParent,
      path,
      kind: r.kind,
      name: r.id === item.id ? top : r.name,
      size: r.size,
      mediaType: r.mediaType,
      r2Key,
    });
  }
  // D1 caps bound parameters per statement: insert in chunks.
  for (let i = 0; i < values.length; i += 20) await db.insert(driveItems).values(values.slice(i, i + 20));
  return getItem(v, ids.get(item.id)!);
}

export type BatchAction = "move" | "trash" | "restore" | "delete" | "star" | "unstar";

/** One action over many items; each is checked on its own, so one without access doesn't stop the rest. */
export async function batchItems(v: DriveViewer, ids: string[], action: BatchAction, parentId?: string | null) {
  const done: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of new Set(ids)) {
    try {
      if (action === "move") await updateItem(v, id, { parentId: parentId ?? null });
      else if (action === "trash" || action === "restore") await updateItem(v, id, { trashed: action === "trash" });
      else if (action === "delete") await deleteForever(v, id);
      else await starItem(v, id, action === "star");
      done.push(id);
    } catch (e) {
      failed.push({ id, error: e instanceof HttpError ? e.message : "Failed" });
    }
  }
  return { done, failed };
}
