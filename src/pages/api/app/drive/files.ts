import { HttpError, handler, json } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { DRIVE_PART_BYTES, putFile } from "@/lib/server/drive/uploads";
import { displayName } from "@/lib/server/uploads";
import { driveUploadSchema } from "@/lib/validation-drive";

/** A small file in one request: the raw bytes as the body, its name URI-encoded in X-Filename, ?parentId= the folder. */
export const PUT = handler(async (ctx) => {
  const size = Number(ctx.request.headers.get("content-length") ?? 0);
  if (!ctx.request.body || !size) throw new HttpError(422, "The file is empty");
  if (size > DRIVE_PART_BYTES) throw new HttpError(413, "Upload larger files in parts");
  const parsed = driveUploadSchema.safeParse({
    name: displayName(ctx.request.headers.get("x-filename")) || "file",
    parentId: ctx.url.searchParams.get("parentId") || null,
    size,
    mediaType: ctx.request.headers.get("content-type") || undefined,
  });
  if (!parsed.success) throw new HttpError(422, parsed.error.issues[0]?.message ?? "Invalid file");
  const item = await putFile(driveViewer(ctx), parsed.data, ctx.request.body);
  ctx.audit("drive.upload", { target: item.name, details: { size: item.size } });
  return json(item, 201);
});
