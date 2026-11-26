/** Source ids are reauthorized on every save/send; attachment URLs alone never grant source access. */
import { env } from "cloudflare:workers";
import { and, db, eq, inArray, mailMessages } from "@/db";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, ATTACHMENT_URL_PREFIX, type AttachmentInput } from "@/lib/uploads";
import { HttpError } from "@/lib/server/api";
import { requireItem } from "@/lib/server/drive/access";
import { checkAttachments, storeAttachment } from "@/lib/server/uploads";
import type { DraftOwner } from "./drafts";

type Source = NonNullable<AttachmentInput["source"]>;
export async function sourceFile(owner: DraftOwner, source: Source) {
  if ("driveId" in source) {
    const { item } = await requireItem({ orgId: owner.orgId, userId: owner.userId, role: owner.role ?? "member" }, source.driveId);
    if (item.kind !== "file" || !item.r2Key) throw new HttpError(422, "Not a file");
    return { key: item.r2Key, filename: item.name, mediaType: item.mediaType ?? "application/octet-stream" };
  }
  if (!owner.boxes.length) throw new HttpError(404, "Not found");
  const [message] = await db.select({ files: mailMessages.files }).from(mailMessages).where(and(
    eq(mailMessages.id, source.messageId), inArray(mailMessages.mailboxId, owner.boxes.map(b => b.id)),
  ));
  const file = message?.files?.[source.attachmentIndex];
  if (!file) throw new HttpError(404, "Attachment not found");
  return { key: file.url.slice(ATTACHMENT_URL_PREFIX.length), filename: file.filename, mediaType: file.mediaType };
}

export async function attachSource(owner: DraftOwner, source: Source): Promise<AttachmentInput> {
  const file = await sourceFile(owner, source);
  const head = await env.FILES.head(file.key);
  if (!head) throw new HttpError(422, "Attachment is no longer available");
  if (head.size > ATTACHMENT_MAX_BYTES) throw new HttpError(413, "Files can be up to 10 MB");
  const object = await env.FILES.get(file.key);
  if (!object) throw new HttpError(422, "Attachment is no longer available");
  const copy = await storeAttachment(owner.orgId, new Request("https://attachment.local", {
    method: "POST", headers: { "x-filename": encodeURIComponent(file.filename), "content-type": file.mediaType }, body: object.body,
  }));
  return { url: copy.url, mediaType: copy.mediaType, filename: copy.filename, source };
}

export async function checkDraftFiles(owner: DraftOwner, files: AttachmentInput[] = []) {
  if (files.length > ATTACHMENT_MAX_FILES) throw new HttpError(422, "Up to 5 files per message");
  for (const file of files) {
    if (file.source) {
      const source = await sourceFile(owner, file.source);
      const head = await env.FILES.head(source.key);
      if (!head) throw new HttpError(422, "Attachment source is no longer available");
      if (head.size > ATTACHMENT_MAX_BYTES) throw new HttpError(413, "Files can be up to 10 MB");
    }
  }
  const checked = await checkAttachments(owner.orgId, files);
  return checked.map((file, i) => ({ ...file, ...(files[i]?.source ? { source: files[i]!.source } : {}) }));
}
