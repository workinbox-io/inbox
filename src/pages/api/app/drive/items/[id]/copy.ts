import { handler, json, parseBody } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { copyItem } from "@/lib/server/drive/items";
import { driveCopySchema } from "@/lib/validation-drive";

/** "Make a copy": next to the original (or in parentId), owned by the viewer. */
export const POST = handler(async (ctx) => {
  const { parentId } = await parseBody(ctx.request, driveCopySchema);
  const item = await copyItem(driveViewer(ctx), ctx.params.id!, parentId);
  ctx.audit("drive.copy", { target: item.name });
  return json(item, 201);
});
