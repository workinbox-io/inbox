import { HttpError, handler } from "@/lib/server/api";
import { driveViewer, requireItem } from "@/lib/server/drive/access";
import { zipResponse } from "@/lib/server/drive/zip";
import { driveZipSchema } from "@/lib/validation-drive";

/** ?ids=a,b,c (up to 100; a folder brings everything in it) as one ZIP, streamed. */
export const GET = handler(async (ctx) => {
  const parsed = driveZipSchema.safeParse(Object.fromEntries(ctx.url.searchParams));
  if (!parsed.success) throw new HttpError(422, "Choose up to 100 items");
  const v = driveViewer(ctx);
  const tops = [];
  for (const id of new Set(parsed.data.ids)) tops.push((await requireItem(v, id)).item);
  return zipResponse(tops, tops.length === 1 ? tops[0]!.name : "Drive");
});
