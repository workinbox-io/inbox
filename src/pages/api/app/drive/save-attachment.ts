import { handler, json, parseBody } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { saveAttachment } from "@/lib/server/drive/mail";
import { driveSaveAttachmentSchema } from "@/lib/validation-drive";

/** Copies a mail attachment of this org into the drive (My drive, or parentId). */
export const POST = handler(async (ctx) => {
  const item = await saveAttachment(driveViewer(ctx), await parseBody(ctx.request, driveSaveAttachmentSchema));
  ctx.audit("drive.save_attachment", { target: item.name, details: { size: item.size } });
  return json(item, 201);
});
