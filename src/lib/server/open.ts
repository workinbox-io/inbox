import { and, collectionRecords, db, driveItems, eq } from "@/db";

/**
 * Where a mention chip or ⌘K result (lib/mentions.ts `refHref`, `/app/open/<kind>/<id>`) opens: the right app's
 * address. Access is each app's job, so this only looks up a file's folder and a record's collection.
 */
export async function openHref(orgId: string, kind: string, id: string): Promise<string> {
  switch (kind) {
    case "file": {
      const [item] = await db.select({ kind: driveItems.kind, parentId: driveItems.parentId }).from(driveItems).where(and(eq(driveItems.id, id), eq(driveItems.orgId, orgId)));
      if (item?.kind === "folder") return `/app/drive/${id}`;
      return `/app/drive${item?.parentId ? `/${item.parentId}` : ""}?file=${encodeURIComponent(id)}`;
    }
    case "note":
      return `/app/notes/${encodeURIComponent(id)}`;
    case "event":
      return `/app/calendar?event=${encodeURIComponent(id.replace("~", ":"))}`;
    case "contact":
      return `/app/contacts/${encodeURIComponent(id)}`;
    case "thread":
      return `/app/mail?t=${encodeURIComponent(id)}`;
    case "channel":
      return `/app/chat/${encodeURIComponent(id)}`;
    case "record": {
      const [r] = await db.select({ collectionId: collectionRecords.collectionId }).from(collectionRecords).where(and(eq(collectionRecords.id, id), eq(collectionRecords.orgId, orgId)));
      return r ? `/app/collections/${r.collectionId}?record=${encodeURIComponent(id)}` : "/app/collections";
    }
    default:
      return "/app";
  }
}
