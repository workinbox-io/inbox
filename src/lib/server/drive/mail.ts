/**
 * Mail → drive: saving a mail attachment copies it into the drive. (Attaching from the drive happens in the browser:
 * the composer fetches the file and uploads it like any other, components/drive/attach-from-drive.tsx.)
 */
import { env } from "cloudflare:workers";
import { db, driveItems } from "@/db";
import { cleanName, uniqueName } from "@/lib/drive/access";
import { HttpError } from "@/lib/server/api";
import { ATTACHMENT_URL_PREFIX, isOrgAttachmentUrl } from "@/lib/uploads";
import { requireFolder, type DriveViewer } from "./access";
import { getItem, placement, takenNames } from "./items";
import { requireDriveSpace } from "./quota";
import { driveKey } from "./uploads";

export async function saveAttachment(v: DriveViewer, input: { url: string; filename: string; parentId?: string | null }) {
  if (!isOrgAttachmentUrl(input.url, v.orgId)) throw new HttpError(422, "Unknown attachment");
  const parent = await requireFolder(v, input.parentId);
  const object = await env.FILES.get(input.url.slice(ATTACHMENT_URL_PREFIX.length));
  if (!object) throw new HttpError(404, "The attachment is no longer available");
  await requireDriveSpace(v.orgId, object.size);
  const id = crypto.randomUUID();
  const key = driveKey(v.orgId, id);
  const mediaType = object.httpMetadata?.contentType ?? "application/octet-stream";
  await env.FILES.put(key, object.body, { httpMetadata: { contentType: mediaType } });
  const name = uniqueName(cleanName(input.filename) ?? "attachment", await takenNames(v.orgId, parent?.id ?? null, v.userId || null));
  await db.insert(driveItems).values({ ...placement(v, id, parent), kind: "file", name, size: object.size, mediaType, r2Key: key });
  return getItem(v, id);
}
