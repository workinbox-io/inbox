import { HttpError, handler, json } from "@/lib/server/api";
import { driveViewer, requireItem } from "@/lib/server/drive/access";
import { zipPlan, zipResponse } from "@/lib/server/drive/zip";
import { driveZipSchema } from "@/lib/validation-drive";

/** ?ids=a,b,c (up to 100; a folder brings everything in it) as one ZIP, streamed. ?check=1: only its size, or the error. */
export const GET = handler(async (ctx) => {
  const parsed = driveZipSchema.safeParse({ ids: ctx.url.searchParams.get("ids") ?? "" });
  if (!parsed.success) throw new HttpError(422, "Choose up to 100 items");
  const v = driveViewer(ctx);
  const tops = [];
  for (const id of new Set(parsed.data.ids)) tops.push((await requireItem(v, id)).item);
  if (ctx.url.searchParams.has("check")) {
    const { files, bytes } = await zipPlan(tops);
    return json({ files, bytes });
  }
  return zipResponse(tops, tops.length === 1 ? tops[0]!.name : "Drive");
});
