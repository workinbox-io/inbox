/**
 * Which drive items a viewer may see (lib/drive/access.ts has the rules). Every drive query goes through
 * `visibleItems` or `requireItem`.
 */
import { and, db, driveAccess, driveItems, eq, inArray, sql, type SQL } from "@/db";
import { ancestorIds, atLeast, driveRole, type DriveRole } from "@/lib/drive/access";
import { HttpError } from "@/lib/server/api";
import { notesViewer, type NotesViewer } from "@/lib/server/notes/access";
import { canManage } from "@/lib/server/roles";

export type DriveItem = typeof driveItems.$inferSelect;
export type DriveViewer = NotesViewer;
/** Same viewer as notes: API keys (empty userId) see team items only. */
export const driveViewer = notesViewer;

/**
 * WHERE for the items a viewer may open, outside the trash: some item on its path (itself or a folder above) is
 * theirs, shared with the team, or shared with them, and none is trashed.
 * shortcut: EXISTS with instr() over the org's items, fine for teams; if it gets slow, materialise viewer→root rows.
 */
export function visibleItems(v: DriveViewer): SQL {
  const shared = v.userId
    ? sql`(a.owner_id = ${v.userId} OR a.sharing = 'team' OR (a.sharing = 'people' AND a.id IN (SELECT item_id FROM drive_access WHERE user_id = ${v.userId})))`
    : sql`a.sharing = 'team'`;
  return and(
    eq(driveItems.orgId, v.orgId),
    sql`EXISTS (SELECT 1 FROM drive_items a WHERE a.org_id = ${v.orgId} AND instr(${driveItems.path}, a.path) = 1 AND ${shared})`,
    sql`NOT EXISTS (SELECT 1 FROM drive_items t WHERE t.org_id = ${v.orgId} AND instr(${driveItems.path}, t.path) = 1 AND t.trashed_at IS NOT NULL)`,
  )!;
}

async function grantsFor(v: DriveViewer, ids: string[]) {
  if (!v.userId || !ids.length) return new Map<string, "view" | "edit">();
  const rows = await db
    .select({ itemId: driveAccess.itemId, role: driveAccess.role })
    .from(driveAccess)
    .where(and(eq(driveAccess.userId, v.userId), inArray(driveAccess.itemId, ids)));
  return new Map(rows.map((r) => [r.itemId, r.role]));
}

/** The item's ancestors (root first) and the item itself. */
async function chainOf(item: DriveItem) {
  const ids = ancestorIds(item.path);
  if (!ids.length) return [item];
  const rows = await db.select().from(driveItems).where(and(eq(driveItems.orgId, item.orgId), inArray(driveItems.id, ids)));
  return [...rows.sort((a, b) => a.path.length - b.path.length), item];
}

/** Roles for many items at once (one query for all their ancestors and one for the grants). */
export async function rolesFor(v: DriveViewer, items: DriveItem[]) {
  const ids = new Set(items.flatMap((i) => ancestorIds(i.path)));
  const ancestors = ids.size ? await db.select().from(driveItems).where(and(eq(driveItems.orgId, v.orgId), inArray(driveItems.id, [...ids]))) : [];
  const byId = new Map([...ancestors, ...items].map((i) => [i.id, i]));
  const grants = await grantsFor(v, [...byId.keys()]);
  const viewer = { userId: v.userId, manager: canManage(v.role) };
  return new Map(
    items.map((i) => {
      const chain = [...ancestorIds(i.path).map((id) => byId.get(id)).filter((x): x is DriveItem => !!x), i];
      return [i.id, driveRole(chain, viewer, grants)];
    }),
  );
}

/**
 * The item with the viewer's role, or 404 when they can't open it (or it's in the trash, unless `trashed` is allowed),
 * 403 when they lack `need` ("manage": share, rename, move, trash, delete).
 */
export async function requireItem(v: DriveViewer, id: string, need: DriveRole | "manage" = "view", opts: { trashed?: boolean } = {}) {
  const [item] = await db.select().from(driveItems).where(and(eq(driveItems.id, id), eq(driveItems.orgId, v.orgId)));
  if (!item) throw new HttpError(404, "Not found");
  const chain = await chainOf(item);
  const grants = await grantsFor(v, chain.map((i) => i.id));
  const { role, manage, trashed } = driveRole(chain, { userId: v.userId, manager: canManage(v.role) }, grants);
  if (!role || (trashed && !opts.trashed)) throw new HttpError(404, "Not found");
  if (need === "manage" ? !manage : !atLeast(role, need)) throw new HttpError(403, "You can't change this item");
  return { item, chain, role, manage, trashed };
}

/** A folder the viewer may add to (edit), or the root of their own drive when `id` is null. */
export async function requireFolder(v: DriveViewer, id: string | null | undefined) {
  if (!id) {
    if (!v.userId) throw new HttpError(422, "Choose a team folder");
    return null;
  }
  const { item } = await requireItem(v, id, "edit");
  if (item.kind !== "folder") throw new HttpError(422, "Choose a folder");
  return item;
}
