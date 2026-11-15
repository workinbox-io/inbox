import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { abortUpload, completeUpload, DRIVE_PART_BYTES, uploadPart } from "@/lib/server/drive/uploads";
import { driveCompleteSchema } from "@/lib/validation-drive";

/** One part (?part=1…), the raw bytes as the body. */
export const PUT = handler(async (ctx) => {
  if (!ctx.request.body) throw new HttpError(422, "Empty part");
  if (Number(ctx.request.headers.get("content-length") ?? 0) > DRIVE_PART_BYTES) throw new HttpError(413, "Part too large");
  return json(await uploadPart(driveViewer(ctx), ctx.params.id!, Number(ctx.url.searchParams.get("part")), ctx.request.body));
});

/** All parts are up: the file joins the drive. */
export const POST = handler(async (ctx) => {
  const { parts } = await parseBody(ctx.request, driveCompleteSchema);
  const item = await completeUpload(driveViewer(ctx), ctx.params.id!, parts);
  ctx.audit("drive.upload", { target: item.name, details: { size: item.size } });
  return json(item, 201);
});

export const DELETE = handler(async (ctx) => {
  await abortUpload(driveViewer(ctx), ctx.params.id!);
  return json({ ok: true });
});
