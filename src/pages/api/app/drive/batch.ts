import { handler, json, parseBody } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { batchItems } from "@/lib/server/drive/items";
import { driveBatchSchema } from "@/lib/validation-drive";

const AUDIT = { move: "drive.update", trash: "drive.trash", restore: "drive.restore", delete: "drive.delete" } as const;

/** One action over many items: move (parentId, null = My drive), trash, restore, delete for good, star, unstar. */
export const POST = handler(async (ctx) => {
  const input = await parseBody(ctx.request, driveBatchSchema);
  const result = await batchItems(driveViewer(ctx), input.ids, input.action, input.parentId);
  const action = AUDIT[input.action as keyof typeof AUDIT];
  if (action && result.done.length) ctx.audit(action, { target: `${result.done.length} items`, details: { count: result.done.length, moved: input.action === "move" || undefined } });
  return json(result);
});
