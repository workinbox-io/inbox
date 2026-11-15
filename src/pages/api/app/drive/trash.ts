import { handler, json } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { emptyTrash } from "@/lib/server/drive/items";

/** Empties what the viewer may delete from the trash. */
export const DELETE = handler(async (ctx) => {
  const { count } = await emptyTrash(driveViewer(ctx));
  if (count) ctx.audit("drive.delete", { target: "Trash", details: { count } });
  return json({ count });
});
