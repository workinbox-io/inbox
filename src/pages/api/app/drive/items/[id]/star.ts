import { handler, json, parseBody } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { starItem } from "@/lib/server/drive/items";
import { driveStarSchema } from "@/lib/validation-drive";

/** Stars are the viewer's own (the Starred view); not audited. */
export const PUT = handler(async (ctx) => {
  const { starred } = await parseBody(ctx.request, driveStarSchema);
  await starItem(driveViewer(ctx), ctx.params.id!, starred);
  return json({ starred });
});
