/**
 * Saved views of a collection: a person's own ones (anyone who can view the collection) and the team's (made and
 * changed by those who manage it). The config is normalized against the collection's fields on every write and read
 * (lib/collections/view-config.ts), so a removed field never breaks a view.
 */
import { and, asc, collectionViews, db, eq, isNull, or } from "@/db";
import { normalizeView, type ViewConfig } from "@/lib/collections/view-config";
import { HttpError } from "./api";
import type { Collection, CollectionViewer } from "./collections";

export type SavedView = { id: string; name: string; config: ViewConfig; team: boolean; mine: boolean };

const MAX_VIEWS = 50;

const toView = (c: Collection, userId: string | null) => (r: typeof collectionViews.$inferSelect): SavedView => ({
  id: r.id,
  name: r.name,
  config: normalizeView(r.config, c.fields),
  team: r.ownerId === null,
  mine: r.ownerId !== null && r.ownerId === userId,
});

const visible = (v: CollectionViewer, c: Collection) =>
  and(eq(collectionViews.orgId, v.orgId), eq(collectionViews.collectionId, c.id), v.userId ? or(isNull(collectionViews.ownerId), eq(collectionViews.ownerId, v.userId)) : isNull(collectionViews.ownerId));

export async function listViews(v: CollectionViewer, c: Collection) {
  const rows = await db.select().from(collectionViews).where(visible(v, c)).orderBy(asc(collectionViews.position), asc(collectionViews.createdAt));
  return rows.map(toView(c, v.userId));
}

async function requireView(v: CollectionViewer, c: Collection, id: string) {
  const [row] = await db.select().from(collectionViews).where(and(visible(v, c), eq(collectionViews.id, id)));
  if (!row) throw new HttpError(404, "View not found");
  if (row.ownerId === null ? !c.canManage : row.ownerId !== v.userId) throw new HttpError(403, "You can't change this view");
  return row;
}

export async function createView(v: CollectionViewer, c: Collection, input: { name: string; config: unknown; team: boolean }) {
  if (input.team && !c.canManage) throw new HttpError(403, "Only people who manage the collection can save team views");
  if (!input.team && !v.userId) throw new HttpError(403, "Personal views need a signed-in person");
  const existing = await listViews(v, c);
  if (existing.length >= MAX_VIEWS) throw new HttpError(422, "Too many views");
  const [row] = await db
    .insert(collectionViews)
    .values({ orgId: v.orgId, collectionId: c.id, name: input.name, config: normalizeView(input.config, c.fields), ownerId: input.team ? null : v.userId, position: existing.length, createdBy: v.userId })
    .returning();
  return toView(c, v.userId)(row!);
}

export async function updateView(v: CollectionViewer, c: Collection, id: string, input: { name?: string; config?: unknown }) {
  await requireView(v, c, id);
  const [row] = await db
    .update(collectionViews)
    .set({ ...(input.name ? { name: input.name } : {}), ...(input.config ? { config: normalizeView(input.config, c.fields) } : {}) })
    .where(eq(collectionViews.id, id))
    .returning();
  return toView(c, v.userId)(row!);
}

export async function deleteView(v: CollectionViewer, c: Collection, id: string) {
  const row = await requireView(v, c, id);
  await db.delete(collectionViews).where(eq(collectionViews.id, id));
  return row;
}
