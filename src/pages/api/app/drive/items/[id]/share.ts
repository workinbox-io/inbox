import { handler, json, parseBody } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { shareItem } from "@/lib/server/drive/items";
import { driveShareSchema } from "@/lib/validation-drive";

/** Who may open the item and everything in it: private, chosen people (view or edit) or the whole team. */
export const PUT = handler(async (ctx) => {
  const input = await parseBody(ctx.request, driveShareSchema);
  const item = await shareItem(driveViewer(ctx), ctx.params.id!, input);
  ctx.audit("drive.share", { target: item.name, details: { sharing: input.sharing, people: input.people.length } });
  return json(item);
});
