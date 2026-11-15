import { handler, json, parseBody } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { startUpload } from "@/lib/server/drive/uploads";
import { driveUploadSchema } from "@/lib/validation-drive";

/** Starts a large upload; the browser then PUTs parts of `partBytes` to /uploads/[id]?part=n and POSTs them to complete. */
export const POST = handler(async (ctx) => json(await startUpload(driveViewer(ctx), await parseBody(ctx.request, driveUploadSchema)), 201));
