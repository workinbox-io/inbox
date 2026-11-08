/**
 * Organizations' mail: storing incoming mail (Email Routing → email() → handleOrgMail), folders,
 * threads, sending from a mailbox. Modeled on lib/server/admin-mail.ts, but scoped to an org and to
 * the mailboxes a viewer may open (access.ts), with UIDs and modseq for later IMAP sync.
 */
import { env } from "cloudflare:workers";
import PostalMime, { type Address, type Attachment } from "postal-mime";
import {
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  mailAliases,
  mailDomains,
  mailboxes,
  mailMessages,
  mailSenderRules,
  mailThreads,
  ne,
  or,
  sql,
  type MailFileRef,
  type SQL,
} from "@/db";
import { forwardHeaders, forwardSubject, forwardText } from "@/lib/admin-mail/rules";
import { splitQuotedReply } from "@/lib/mail/quotes";
import { baseAddress, parseAuthResults, parseQuery, senderVerdict, spamScore, type UserMailFolder } from "@/lib/mail/rules";
import { mailBodyText } from "@/lib/mail/text";
import { isAutomatedMail, matchThread, replySubject, senderName, type ThreadCandidate } from "@/lib/mail/threading";
import { attachmentUrl, ATTACHMENT_URL_PREFIX, safeFilename, type AttachmentInput } from "@/lib/uploads";
import { HttpError } from "@/lib/server/api";
import { randomBase64Url } from "@/lib/server/crypto";
import { sendNow } from "@/lib/server/email";
import type { Mailbox } from "./access";

const MAX_RAW_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 100_000;
const MAX_HTML_CHARS = 500_000;
const MAX_CANDIDATES = 10;
const PAGE_SIZE = 50;

const msgId = (id: string) => (id.startsWith("<") ? id : `<${id}>`);

const addrs = (list: Address[] | Address | undefined) =>
  (Array.isArray(list) ? list : list ? [list] : []).flatMap((a) => (a.group ? a.group : [a])).filter((m) => m.address);
const addressList = (list: Address[] | undefined) => addrs(list).map((m) => m.address.toLowerCase()).join(", ");

const t = mailThreads;
const m = mailMessages;

/** Hands out the mailbox's next UID and bumps its modseq in one statement (D1 has no transactions). */
async function nextUid(mailboxId: string) {
  const [row] = await db
    .update(mailboxes)
    .set({ uidNext: sql`${mailboxes.uidNext} + 1`, modseq: sql`${mailboxes.modseq} + 1` })
    .where(eq(mailboxes.id, mailboxId))
    .returning({ uid: sql<number>`${mailboxes.uidNext} - 1`, modseq: mailboxes.modseq });
  return row!;
}

/** Bumps the modseq of the mailboxes behind these threads and stamps the threads with it. */
async function touchThreads(threadIds: string[]) {
  if (!threadIds.length) return;
  const rows = await db.selectDistinct({ id: t.mailboxId }).from(t).where(inArray(t.id, threadIds));
  for (const { id } of rows) {
    const [mb] = await db
      .update(mailboxes)
      .set({ modseq: sql`${mailboxes.modseq} + 1` })
      .where(eq(mailboxes.id, id))
      .returning({ modseq: mailboxes.modseq });
    await db.update(t).set({ modseq: mb!.modseq }).where(and(inArray(t.id, threadIds), eq(t.mailboxId, id)));
  }
}

// ---------------------------------------------------------------------------
// Incoming mail
// ---------------------------------------------------------------------------

/** The mailbox an address delivers to: the mailbox itself, an alias, or the domain's catch-all. */
export async function findRecipient(address: string): Promise<Mailbox | null> {
  const to = baseAddress(address);
  const [direct] = await db.select().from(mailboxes).where(eq(mailboxes.address, to));
  if (direct) return direct;
  const [alias] = await db
    .select({ mb: mailboxes })
    .from(mailAliases)
    .innerJoin(mailboxes, eq(mailboxes.id, mailAliases.mailboxId))
    .where(eq(mailAliases.address, to));
  if (alias) return alias.mb;
  const domain = to.split("@")[1] ?? "";
  const [d] = await db
    .select({ mb: mailboxes })
    .from(mailDomains)
    .innerJoin(mailboxes, eq(mailboxes.id, mailDomains.catchAllMailboxId))
    .where(eq(mailDomains.domain, domain));
  return d?.mb ?? null;
}

async function storeFiles(orgId: string, attachments: Attachment[]) {
  const files: (MailFileRef & { contentId?: string; inline: boolean })[] = [];
  for (const a of attachments) {
    const content = typeof a.content === "string" ? new TextEncoder().encode(a.content) : a.content;
    if (!content.byteLength) continue;
    const name = a.filename || "attachment";
    // Under the org's attachments, so a forward can attach it again (checkAttachments).
    const key = `attachments/${orgId}/${randomBase64Url(12)}/${safeFilename(name)}`;
    await env.FILES.put(key, content, { httpMetadata: { contentType: a.mimeType || "application/octet-stream" } });
    files.push({
      url: attachmentUrl(key),
      filename: name.slice(0, 100),
      mediaType: a.mimeType || "application/octet-stream",
      size: content.byteLength,
      contentId: a.contentId?.replace(/^<|>$/g, ""),
      inline: a.disposition === "inline" && !!a.contentId,
    });
  }
  return files;
}

async function threadCandidates(mailboxId: string, contact: string): Promise<ThreadCandidate[]> {
  const threads = await db
    .select({ id: t.id, subject: t.subject })
    .from(t)
    .where(and(eq(t.mailboxId, mailboxId), eq(t.contactEmail, contact)))
    .orderBy(desc(t.lastMessageAt))
    .limit(MAX_CANDIDATES);
  if (!threads.length) return [];
  const ids = await db
    .select({ threadId: m.threadId, messageId: m.messageId })
    .from(m)
    .where(and(inArray(m.threadId, threads.map((x) => x.id)), isNotNull(m.messageId)));
  return threads.map((x) => ({ id: x.id, subject: x.subject, messageIds: ids.filter((i) => i.threadId === x.id).map((i) => i.messageId!) }));
}

/** Returns false when no mailbox takes the address, so email() can try the staff mailboxes or reject. */
export async function handleOrgMail(message: ForwardableEmailMessage): Promise<boolean> {
  const mailbox = await findRecipient(message.to);
  if (!mailbox) return false;
  if (message.rawSize > MAX_RAW_BYTES) {
    message.setReject("Message too large");
    return true;
  }
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(raw);
  const domain = mailbox.address.split("@")[1];
  const messageId = msgId(parsed.messageId ?? message.headers.get("message-id") ?? `<${crypto.randomUUID()}@${domain}>`);
  const [dupe] = await db.select({ id: m.id }).from(m).where(and(eq(m.mailboxId, mailbox.id), eq(m.messageId, messageId)));
  if (dupe) return true;

  const [from] = addrs(parsed.from);
  const fromEmail = (from?.address ?? message.from).toLowerCase();
  const fromName = senderName(from?.name, fromEmail);
  const contact = addrs(parsed.replyTo)[0]?.address.toLowerCase() ?? fromEmail;
  const subject = (parsed.subject ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const text = mailBodyText(parsed).slice(0, MAX_TEXT_CHARS);

  const rules = await db
    .select({ pattern: mailSenderRules.pattern, action: mailSenderRules.action, mailboxId: mailSenderRules.mailboxId })
    .from(mailSenderRules)
    .where(and(eq(mailSenderRules.orgId, mailbox.orgId), or(isNull(mailSenderRules.mailboxId), eq(mailSenderRules.mailboxId, mailbox.id))));
  const verdict = senderVerdict(rules, fromEmail, mailbox.id);
  const scored = spamScore({
    auth: parseAuthResults(message.headers.get("authentication-results")),
    headers: { "x-spam-flag": message.headers.get("x-spam-flag") },
    subject,
    text,
    fromEmail,
  });
  const spam = verdict === "block" || (verdict !== "allow" && scored.spam);
  const reasons = verdict === "block" ? ["Blocked sender"] : verdict === "allow" ? [] : scored.reasons;

  const rawKey = `mail-raw/${mailbox.orgId}/${mailbox.id}/${crypto.randomUUID()}.eml`;
  await env.FILES.put(rawKey, raw, { httpMetadata: { contentType: "message/rfc822" } });
  const stored = await storeFiles(mailbox.orgId, parsed.attachments);
  let html = parsed.html && parsed.html.length <= MAX_HTML_CHARS ? parsed.html : null;
  for (const f of stored) if (html && f.contentId) html = html.replaceAll(`cid:${f.contentId}`, f.url);
  const files = stored.filter((f) => !f.inline).map(({ url, filename, mediaType, size }) => ({ url, filename, mediaType, size }));

  const now = new Date();
  const { uid, modseq } = await nextUid(mailbox.id);
  // Bounces and auto-replies join a thread but never open one in the inbox on their own.
  const automated = isAutomatedMail(message.headers);
  let threadId = matchThread({ subject, inReplyTo: parsed.inReplyTo, references: parsed.references }, await threadCandidates(mailbox.id, contact));
  if (threadId) {
    await db
      .update(t)
      .set(spam ? { lastMessageAt: now, modseq } : { unread: true, archivedAt: null, trashedAt: null, snoozedUntil: null, lastMessageAt: now, modseq })
      .where(eq(t.id, threadId));
  } else {
    const [row] = await db
      .insert(t)
      .values({
        orgId: mailbox.orgId,
        mailboxId: mailbox.id,
        subject,
        contactEmail: contact,
        contactName: contact === fromEmail ? fromName : null,
        unread: !automated || spam,
        spam,
        lastMessageAt: now,
        modseq,
      })
      .returning({ id: t.id });
    threadId = row!.id;
  }
  await db
    .insert(m)
    .values({
      orgId: mailbox.orgId,
      mailboxId: mailbox.id,
      threadId,
      uid,
      direction: "in",
      fromEmail,
      fromName,
      to: addressList(parsed.to),
      cc: addressList(parsed.cc),
      subject,
      text,
      html,
      messageId,
      inReplyTo: parsed.inReplyTo ?? null,
      references: parsed.references ?? null,
      files,
      rawKey,
      size: raw.byteLength,
      spamReasons: reasons,
      createdAt: now,
    })
    .onConflictDoNothing();
  return true;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type MailThreadRow = typeof mailThreads.$inferSelect;
export type MailMessageRow = typeof mailMessages.$inferSelect;

async function wakeSnoozed(ids: string[]) {
  await db
    .update(t)
    .set({ unread: true, lastMessageAt: sql`${t.snoozedUntil}`, snoozedUntil: null })
    .where(and(inArray(t.mailboxId, ids), isNotNull(t.snoozedUntil), lte(t.snoozedUntil, new Date())));
}

const sentSomething = () => sql.raw(`exists (select 1 from mail_messages mm where mm.thread_id = mail_threads.id and mm.direction = 'out')`);
const receivedSomething = () => sql.raw(`exists (select 1 from mail_messages mm where mm.thread_id = mail_threads.id and mm.direction = 'in')`);
const notSpamOrTrash = () => and(isNull(t.trashedAt), eq(t.spam, false));
const inInbox = () => and(notSpamOrTrash(), isNull(t.archivedAt), isNull(t.snoozedUntil), receivedSomething());

function folderWhere(folder: UserMailFolder): SQL | undefined {
  switch (folder) {
    case "inbox":
      return inInbox();
    case "starred":
      return and(notSpamOrTrash(), eq(t.starred, true));
    case "snoozed":
      return and(notSpamOrTrash(), isNotNull(t.snoozedUntil));
    case "sent":
      return and(isNull(t.trashedAt), sentSomething());
    case "archived":
      return and(notSpamOrTrash(), isNotNull(t.archivedAt));
    case "spam":
      return and(isNull(t.trashedAt), eq(t.spam, true));
    case "trash":
      return isNotNull(t.trashedAt);
  }
}

const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const snippetOf = (text: string | null) => splitQuotedReply(text ?? "").body.replace(/\s+/g, " ").trim().slice(0, 160);

const esc = (like: string) => sql`${like} escape '\\'`;

function searchWhere(q: string): SQL[] {
  const p = parseQuery(q);
  const conds: SQL[] = [];
  for (const w of p.text) {
    const like = likeOf(w);
    conds.push(
      or(
        sql`lower(${t.subject}) like ${esc(like)}`,
        sql`${t.contactEmail} like ${esc(like)}`,
        sql`lower(coalesce(${t.contactName}, '')) like ${esc(like)}`,
        sql`exists (select 1 from mail_messages mm where mm.thread_id = mail_threads.id and (lower(mm.text) like ${esc(like)} or mm.from_email like ${esc(like)} or mm."to" like ${esc(like)} or mm.cc like ${esc(like)}))`,
      )!,
    );
  }
  for (const f of p.from) conds.push(sql`exists (select 1 from mail_messages mm where mm.thread_id = mail_threads.id and (mm.from_email like ${esc(likeOf(f))} or lower(coalesce(mm.from_name, '')) like ${esc(likeOf(f))}))`);
  for (const x of p.to) conds.push(sql`exists (select 1 from mail_messages mm where mm.thread_id = mail_threads.id and (mm."to" like ${esc(likeOf(x))} or mm.cc like ${esc(likeOf(x))}))`);
  for (const s of p.subject) conds.push(sql`lower(${t.subject}) like ${esc(likeOf(s))}`);
  if (p.hasAttachment) conds.push(sql`exists (select 1 from mail_messages mm where mm.thread_id = mail_threads.id and mm.files != '[]')`);
  if (p.unread) conds.push(eq(t.unread, true));
  if (p.starred) conds.push(eq(t.starred, true));
  return conds;
}

export interface ThreadQuery {
  boxes: Mailbox[];
  folder: UserMailFolder;
  q?: string;
  before?: number;
}

export async function listThreads(query: ThreadQuery) {
  if (!query.boxes.length) return { threads: [], hasMore: false };
  const ids = query.boxes.map((b) => b.id);
  const address = new Map(query.boxes.map((b) => [b.id, b.address]));
  await wakeSnoozed(ids);
  const q = query.q?.trim();
  const conds: (SQL | undefined)[] = [inArray(t.mailboxId, ids)];
  if (q) conds.push(query.folder === "trash" ? isNotNull(t.trashedAt) : isNull(t.trashedAt), ...searchWhere(q));
  else conds.push(folderWhere(query.folder));
  if (query.before) conds.push(lt(t.lastMessageAt, new Date(query.before)));
  const order = query.folder === "snoozed" && !q ? [asc(t.snoozedUntil)] : [desc(t.lastMessageAt)];
  const rows = await db
    .select({
      thread: t,
      last: sql<string | null>`(select substr(mm.text, 1, 2000) from mail_messages mm where mm.thread_id = mail_threads.id order by mm.created_at desc limit 1)`,
      lastDirection: sql<"in" | "out" | null>`(select mm.direction from mail_messages mm where mm.thread_id = mail_threads.id order by mm.created_at desc limit 1)`,
      count: sql<number>`(select count(*) from mail_messages mm where mm.thread_id = mail_threads.id)`,
      files: sql<number>`exists (select 1 from mail_messages mm where mm.thread_id = mail_threads.id and mm.files != '[]')`,
    })
    .from(t)
    .where(and(...conds))
    .orderBy(...order)
    .limit(PAGE_SIZE + 1);
  return {
    threads: rows.slice(0, PAGE_SIZE).map((r) => ({
      ...r.thread,
      mailbox: address.get(r.thread.mailboxId)!,
      snippet: snippetOf(r.last),
      lastDirection: r.lastDirection,
      messageCount: r.count,
      hasFiles: !!r.files,
    })),
    hasMore: rows.length > PAGE_SIZE,
  };
}

/** Unread threads in the inbox, per mailbox address. */
export async function unreadCounts(boxes: Mailbox[]) {
  if (!boxes.length) return {} as Record<string, number>;
  const ids = boxes.map((b) => b.id);
  await wakeSnoozed(ids);
  const rows = await db
    .select({ mailboxId: t.mailboxId, n: sql<number>`count(*)` })
    .from(t)
    .where(and(inArray(t.mailboxId, ids), eq(t.unread, true), inInbox()))
    .groupBy(t.mailboxId);
  const address = new Map(boxes.map((b) => [b.id, b.address]));
  return Object.fromEntries(rows.map((r) => [address.get(r.mailboxId)!, r.n])) as Record<string, number>;
}

export async function getThread(id: string, boxes: Mailbox[]) {
  const ids = boxes.map((b) => b.id);
  const [thread] = ids.length ? await db.select().from(t).where(and(eq(t.id, id), inArray(t.mailboxId, ids))) : [];
  if (!thread) throw new HttpError(404, "Not found");
  if (thread.unread) {
    await db.update(t).set({ unread: false }).where(eq(t.id, id));
    await touchThreads([id]);
  }
  const address = new Map(boxes.map((b) => [b.id, b.address]));
  const [messages, related] = await Promise.all([
    db.select().from(m).where(eq(m.threadId, id)).orderBy(m.createdAt),
    db
      .select({ id: t.id, mailboxId: t.mailboxId, subject: t.subject, lastMessageAt: t.lastMessageAt, trashedAt: t.trashedAt })
      .from(t)
      .where(and(eq(t.contactEmail, thread.contactEmail), inArray(t.mailboxId, ids), ne(t.id, id)))
      .orderBy(desc(t.lastMessageAt))
      .limit(20),
  ]);
  return {
    thread: { ...thread, unread: false, mailbox: address.get(thread.mailboxId)! },
    messages: messages.map(({ rawKey, ...msg }) => ({ ...msg, hasRaw: !!rawKey })),
    related: related.map((r) => ({ ...r, mailbox: address.get(r.mailboxId)! })),
  };
}

/** The original .eml of a message the viewer may open ("Show original", download). */
export async function getRawMessage(messageId: string, boxes: Mailbox[]) {
  const ids = boxes.map((b) => b.id);
  const [row] = ids.length ? await db.select({ rawKey: m.rawKey }).from(m).where(and(eq(m.id, messageId), inArray(m.mailboxId, ids))) : [];
  if (!row?.rawKey) throw new HttpError(404, "Not found");
  const object = await env.FILES.get(row.rawKey);
  if (!object) throw new HttpError(404, "Not found");
  return object;
}

export interface ThreadPatch {
  archived?: boolean;
  unread?: boolean;
  trashed?: boolean;
  starred?: boolean;
  spam?: boolean;
  snoozedUntil?: number | null;
}

export async function updateThreads(ids: string[], boxes: Mailbox[], patch: ThreadPatch) {
  const set: Partial<MailThreadRow> = {};
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
  if (patch.trashed !== undefined) set.trashedAt = patch.trashed ? new Date() : null;
  if (patch.unread !== undefined) set.unread = patch.unread;
  if (patch.starred !== undefined) set.starred = patch.starred;
  if (patch.spam !== undefined) set.spam = patch.spam;
  if (patch.snoozedUntil !== undefined) {
    if (patch.snoozedUntil !== null && patch.snoozedUntil <= Date.now()) throw new HttpError(422, "Pick a time in the future");
    set.snoozedUntil = patch.snoozedUntil === null ? null : new Date(patch.snoozedUntil);
  }
  if (patch.archived === false || patch.trashed === false || patch.spam === false) set.snoozedUntil ??= null;
  const boxIds = boxes.map((b) => b.id);
  if (!Object.keys(set).length || !ids.length || !boxIds.length) return 0;
  const rows = await db.update(t).set(set).where(and(inArray(t.id, ids), inArray(t.mailboxId, boxIds))).returning({ id: t.id });
  await touchThreads(rows.map((r) => r.id));
  return rows.length;
}

/** Deletes trashed threads for good, with their raw messages and incoming files. */
export async function deleteThreads(ids: string[], boxes: Mailbox[]) {
  const boxIds = boxes.map((b) => b.id);
  if (!boxIds.length) return 0;
  const threads = await db
    .select({ id: t.id })
    .from(t)
    .where(and(inArray(t.id, ids), inArray(t.mailboxId, boxIds), isNotNull(t.trashedAt)));
  const found = threads.map((x) => x.id);
  if (!found.length) return 0;
  const rows = await db.select({ files: m.files, rawKey: m.rawKey }).from(m).where(and(inArray(m.threadId, found), eq(m.direction, "in")));
  const keys = rows.flatMap((r) => [...r.files.map((f) => f.url.slice(ATTACHMENT_URL_PREFIX.length)), ...(r.rawKey ? [r.rawKey] : [])]);
  for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));
  await touchThreads(found);
  await db.batch([db.delete(m).where(inArray(m.threadId, found)), db.delete(t).where(inArray(t.id, found))]);
  return found.length;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const formatDate = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const FONT = "font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5";

function renderMail(text: string, extra: { quote?: MailMessageRow; forward?: MailMessageRow }) {
  const body = `<div style="${FONT};white-space:pre-wrap">${escapeHtml(text)}</div>`;
  if (extra.forward) {
    const f = extra.forward;
    const head = forwardHeaders(f, formatDate);
    const html = `${body}<div style="margin-top:24px;${FONT};font-size:14px"><p style="margin:0 0 8px;color:#666">---------- Forwarded message ----------<br>${head
      .map(([k, v]) => `${k}: ${escapeHtml(v)}`)
      .join("<br>")}</p>${f.html ?? `<div style="white-space:pre-wrap">${escapeHtml(f.text)}</div>`}</div>`;
    return { text: `${text}\n\n${forwardText(f, formatDate)}`.trim(), html };
  }
  const q = extra.quote;
  const quoted = q?.text.trim().slice(0, 10_000) ?? "";
  if (!q || !quoted) return { text, html: body };
  const intro = `On ${formatDate(q.createdAt)}, ${q.fromName ?? q.fromEmail} wrote:`;
  return {
    text: `${text}\n\n${intro}\n${quoted.split("\n").map((l) => `> ${l}`).join("\n")}`,
    html: `${body}<p style="margin:20px 0 6px;color:#666;font-size:13px">${escapeHtml(intro)}</p><blockquote style="margin:0;padding-left:12px;border-left:3px solid #ddd;color:#555;white-space:pre-wrap">${escapeHtml(quoted)}</blockquote>`,
  };
}

export interface SendInput {
  mailbox?: string;
  threadId?: string;
  forwardOf?: string;
  to: string;
  cc?: string[];
  subject?: string;
  text: string;
  files?: AttachmentInput[];
}

/** Sends from one of the viewer's mailboxes and stores the mail: a reply in its thread, or a new thread. */
export async function sendMail(input: SendInput, boxes: Mailbox[], senderFallbackName: string) {
  const boxIds = boxes.map((b) => b.id);
  if (!boxIds.length) throw new HttpError(422, "You have no mailbox yet");
  const [thread] = input.threadId ? await db.select().from(t).where(and(eq(t.id, input.threadId), inArray(t.mailboxId, boxIds))) : [];
  if (input.threadId && !thread) throw new HttpError(404, "Not found");
  const [forward] = input.forwardOf ? await db.select().from(m).where(and(eq(m.id, input.forwardOf), inArray(m.mailboxId, boxIds))) : [];
  if (input.forwardOf && !forward) throw new HttpError(404, "Not found");
  const mailbox = boxes.find((b) => b.id === (thread?.mailboxId ?? forward?.mailboxId)) ?? boxes.find((b) => b.address === input.mailbox);
  if (!mailbox) throw new HttpError(422, "Pick a mailbox");

  const history = thread ? await db.select().from(m).where(eq(m.threadId, thread.id)).orderBy(desc(m.createdAt)).limit(30) : [];
  const lastIn = history.find((x) => x.direction === "in");
  const subject = (forward ? forwardSubject(input.subject || forward.subject) : thread ? replySubject(thread.subject) : input.subject?.trim()) || "(no subject)";
  const ids = history.flatMap((x) => (x.messageId ? [x.messageId] : [])).reverse();
  const headers = ids.length ? { "In-Reply-To": ids.at(-1)!, References: ids.slice(-10).join(" ") } : undefined;
  const { text, html } = renderMail(input.text, { quote: forward ? undefined : lastIn, forward });
  const files = [...(forward?.files ?? []).map((f) => ({ url: f.url, mediaType: f.mediaType, filename: f.filename })), ...(input.files ?? [])];
  const fromName = mailbox.displayName || senderFallbackName;

  const sentId = await sendNow({ to: input.to, cc: input.cc, subject, text, html, fromEmail: mailbox.address, fromName, replyTo: mailbox.address, headers, files });

  const now = new Date();
  const { uid, modseq } = await nextUid(mailbox.id);
  let threadId = thread?.id;
  if (threadId) {
    await db.update(t).set({ lastMessageAt: now, modseq }).where(eq(t.id, threadId));
  } else {
    const [row] = await db
      .insert(t)
      .values({ orgId: mailbox.orgId, mailboxId: mailbox.id, subject, contactEmail: input.to.toLowerCase(), lastMessageAt: now, modseq })
      .returning({ id: t.id });
    threadId = row!.id;
  }
  const [row] = await db
    .insert(m)
    .values({
      orgId: mailbox.orgId,
      mailboxId: mailbox.id,
      threadId,
      uid,
      direction: "out",
      fromEmail: mailbox.address,
      fromName,
      to: input.to.toLowerCase(),
      cc: (input.cc ?? []).join(", "),
      subject,
      text,
      messageId: msgId(sentId),
      inReplyTo: headers?.["In-Reply-To"] ?? null,
      references: headers?.References ?? null,
      files: files.map((f) => ({ url: f.url, filename: f.filename, mediaType: f.mediaType, size: 0 })),
      size: text.length,
      createdAt: now,
    })
    .returning();
  return { threadId, message: row! };
}

/** Senders' addresses to block or allow, for the org or one mailbox ("Report spam" adds a block). */
export async function addSenderRule(orgId: string, rule: { pattern: string; action: "block" | "allow"; mailboxId: string | null }) {
  await db.insert(mailSenderRules).values({ orgId, ...rule });
}
