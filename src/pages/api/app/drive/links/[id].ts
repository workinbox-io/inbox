import { handler, json } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { deleteLink } from "@/lib/server/drive/links";

/** Deletes a public link: it stops working at once. */
export const DELETE = handler(async (ctx) => {
  const item = await deleteLink(driveViewer(ctx), ctx.params.id!);
  ctx.audit("drive.link_delete", { target: item.name });
  return json({ ok: true });
});
