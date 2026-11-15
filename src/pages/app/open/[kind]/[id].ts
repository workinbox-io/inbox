import type { APIRoute } from "astro";
import { and, db, driveItems, eq } from "@/db";

/**
 * Where a mention chip (lib/mentions.ts `refHref`) opens: the right app's address. Access is each app's job, so this
 * only looks up a file's folder.
 */
export const GET: APIRoute = async ({ params, locals, redirect }) => {
  const id = params.id!;
  const to = async () => {
    switch (params.kind) {
      case "file": {
        const [item] = await db.select({ kind: driveItems.kind, parentId: driveItems.parentId }).from(driveItems).where(and(eq(driveItems.id, id), eq(driveItems.orgId, locals.orgId!)));
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
      default:
        return "/app";
    }
  };
  return redirect(await to(), 302);
};
