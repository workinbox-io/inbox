/**
 * Drafts for mail apps: the mail bridge mirrors each person's `mail_drafts` of a mailbox into its IMAP Drafts folder
 * and saves what the app writes there back here. Writes go through drafts.ts with the version the bridge last saw,
 * so a stale app copy never overwrites a newer edit made in Work Inbox (409).
 */
import { env } from "cloudflare:workers";
import PostalMime from "postal-mime";
import { and, db, desc, eq, mailMessages, type MailDraftPayload } from "@/db";
import { HttpError } from "@/lib/server/api";
import { storeAttachment } from "@/lib/server/uploads";
import { draftEml, draftFields } from "@/lib/mail/draft-eml";
import { docToHtml } from "@/lib/mail/doc-render";
import { ATTACHMENT_MAX_FILES, ATTACHMENT_URL_PREFIX } from "@/lib/uploads";
import { deleteDraft, getDraft, listDrafts, saveDraft, type DraftOwner } from "./drafts";
import type { Mailbox } from "./access";

const ownerOf = (box: Mailbox, userId: string): DraftOwner => ({ orgId: box.orgId, userId, boxes: [box] });

export async function nativeDrafts(box: Mailbox, userId: string) {
  const out: { key: string; updatedAt: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await listDrafts(ownerOf(box, userId), { limit: 200, cursor });
    out.push(...page.drafts.map((d) => ({ key: d.key, updatedAt: d.updatedAt })));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { drafts: out };
}

export async function nativeDraftRaw(box: Mailbox, userId: string, key: string) {
  const { draft, threadId, updatedAt } = await getDraft(ownerOf(box, userId), key);
  const [last] = threadId
    ? await db.select({ messageId: mailMessages.messageId, references: mailMessages.references }).from(mailMessages)
      .where(and(eq(mailMessages.threadId, threadId), eq(mailMessages.mailboxId, box.id))).orderBy(desc(mailMessages.createdAt)).limit(1)
    : [];
  const attachments = (await Promise.all((draft.files ?? []).map(async (f) => {
    const object = f.url.startsWith(ATTACHMENT_URL_PREFIX) ? await env.FILES.get(f.url.slice(ATTACHMENT_URL_PREFIX.length)) : null;
    return object ? { filename: f.filename, mediaType: f.mediaType, content: new Uint8Array(await object.arrayBuffer()) } : null;
  }))).filter((a) => a !== null);
  return draftEml(key, {
    from: { email: box.address, name: box.displayName }, to: draft.to.join(", "), cc: draft.cc.join(", "), subject: draft.subject,
    date: new Date(updatedAt), text: draft.text, html: draft.doc ? docToHtml(draft.doc, env.PUBLIC_APP_URL) : null,
    inReplyTo: last?.messageId ?? null, references: last?.messageId ? [last.references, last.messageId].filter(Boolean).join(" ") : null,
    attachments,
  });
}

/** An app's draft: `key` + `expected` when it replaces our copy of that draft, else a new draft (a reply's thread when free). */
export async function nativeDraftSave(box: Mailbox, userId: string, raw: Uint8Array<ArrayBuffer>, key?: string, expected?: number) {
  const owner = ownerOf(box, userId);
  const parsed = await PostalMime.parse(raw);
  const fields = draftFields(parsed);
  const replied = parsed.inReplyTo
    ? (await db.select({ id: mailMessages.id, threadId: mailMessages.threadId }).from(mailMessages)
      .where(and(eq(mailMessages.mailboxId, box.id), eq(mailMessages.messageId, parsed.inReplyTo.trim()))).limit(1))[0]
    : undefined;
  const attached = parsed.attachments.filter((a) => a.disposition !== "inline");
  if (attached.length > ATTACHMENT_MAX_FILES) throw new HttpError(413, "Up to 5 files per message");
  // shortcut: every re-save uploads the files again; earlier copies stay in R2 like other abandoned draft uploads.
  const files = await Promise.all(attached.map(async (a) => {
    const { size: _, ...file } = await storeAttachment(box.orgId, new Request("https://attachment.local", {
      method: "POST", headers: { "x-filename": encodeURIComponent(a.filename ?? "file"), "content-type": a.mimeType }, body: a.content as ArrayBuffer,
    }));
    return file;
  }));
  const current = key ? await getDraft(owner, key) : null;
  const payload: MailDraftPayload = {
    mode: current?.draft.mode ?? (replied ? "reply" : "new"), from: box.address, to: fields.to, cc: fields.cc, subject: fields.subject, text: fields.text,
    ...(files.length ? { files } : {}), ...(current?.draft.noSignature ? { noSignature: true } : {}),
    ...(current ? (current.draft.messageId ? { messageId: current.draft.messageId } : {}) : replied ? { messageId: replied.id } : {}),
  };
  if (key) return saveDraft(owner, key, payload, { expectedUpdatedAt: expected ?? null, source: "app" });
  if (replied) {
    const saved = await saveDraft(owner, replied.threadId, payload, { keepExisting: true });
    if (saved) return saved;
  }
  return saveDraft(owner, `d-${crypto.randomUUID()}`, { ...payload, mode: "new" });
}

export async function nativeDraftDelete(box: Mailbox, userId: string, key: string, expected: number) {
  const owner = ownerOf(box, userId);
  await getDraft(owner, key);
  await deleteDraft(owner, key, expected);
  return { ok: true };
}
