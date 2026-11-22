import { handler, json, parseBody } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { deleteForever, getItem, updateItem } from "@/lib/server/drive/items";
import { driveUpdateSchema } from "@/lib/validation-drive";

export const GET = handler(async (ctx) => json(await getItem(driveViewer(ctx), ctx.params.id!)));

/** Rename, move (parentId, null = My drive), trash or restore (trashed). */
export const PATCH = handler(async (ctx) => {
  const input = await parseBody(ctx.request, driveUpdateSchema);
  const item = await updateItem(driveViewer(ctx), ctx.params.id!, input);
  if (input.trashed !== undefined) ctx.audit(input.trashed ? "drive.trash" : "drive.restore", { target: item.name });
  else ctx.audit("drive.update", { target: item.name, details: { moved: input.parentId !== undefined } });
  return json(item);
});

/** Deletes a trashed item and everything in it for good. */
export const DELETE = handler(async (ctx) => {
  const item = await deleteForever(driveViewer(ctx), ctx.params.id!);
  ctx.audit("drive.delete", { target: item.name });
  return json({ ok: true });
});
