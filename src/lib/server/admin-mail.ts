/**
 * Staff mailboxes (ADMIN_MAILBOXES, e.g. plugins@luxivo.app), read and answered at /app/admin-mail.
 * Email Routing sends their mail to the Worker's email() handler: it is forwarded to
 * ADMIN_MAIL_FORWARD, stored, and threaded like the e-mail channel does (Message-IDs, then subject).
 * Threads move between folders (inbox, snoozed, sent, archived, trash; rules in lib/admin-mail/rules.ts).
 * Replies and forwards go out right away through sendNow from the mailbox's own address.
 */
import { env } from "cloudflare:workers";
import PostalMime, { type Address, type Attachment } from "postal-mime";
import { siteConfig } from "@/config/site";
import {
  adminMailboxes,
  adminMailMessages,
  adminMailThreads,
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
  ne,
  or,
  sql,
  type AdminMailFile,
  type SQL,
} from "@/db";
import { forwardHeaders, forwardSubject, forwardText, type MailFolder } from "@/lib/admin-mail/rules";
import { attachmentUrl, ATTACHMENT_URL_PREFIX, safeFilename, type AttachmentInput } from "@/lib/uploads";
import { matchThread, replySubject, senderName, type ThreadCandidate } from "@/lib/mail/threading";
import { splitQuotedReply } from "@/lib/mail/quotes";
import { HttpError } from "./api";
import { randomBase64Url } from "./crypto";
import { sendNow } from "./email";
import { reportError } from "./errors";
import { mailBodyText } from "@/lib/mail/text";

/** Email Routing takes up to 25 MB per message. */
const MAX_RAW_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 100_000;
const MAX_HTML_CHARS = 500_000;
const MAX_CANDIDATES = 10;
const PAGE_SIZE = 50;

/** Message-ID form: angle brackets around the id. */
const msgId = (id: string) => (id.startsWith("<") ? id : `<${id}>`);

const mailboxes = (list: Address[] | Address | undefined) =>
  (Array.isArray(list) ? list : list ? [list] : []).flatMap((a) => (a.group ? a.group : [a])).filter((m) => m.address);

const addressList = (list: Address[] | undefined) => mailboxes(list).map((m) => m.address.toLowerCase()).join(", ");

/** Attachments to R2 under attachments/admin-mail/…, so /api/files serves them (random, unguessable URLs). */
async function storeFiles(attachments: Attachment[]) {
  const files: (AdminMailFile & { contentId?: string; inline: boolean })[] = [];
  for (const a of attachments) {
    const content = typeof a.content === "string" ? new TextEncoder().encode(a.content) : a.content;
    if (!content.byteLength) continue;
    const name = a.filename || "attachment";
    const key = `attachments/admin-mail/${randomBase64Url(12)}/${safeFilename(name)}`;
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

/** Recent threads of this mailbox with this person, with what matchThread needs. */
async function threadCandidates(mailbox: string, contact: string): Promise<ThreadCandidate[]> {
  const threads = await db
    .select({ id: adminMailThreads.id, subject: adminMailThreads.subject })
    .from(adminMailThreads)
    .where(and(eq(adminMailThreads.mailbox, mailbox), eq(adminMailThreads.contactEmail, contact)))
    .orderBy(desc(adminMailThreads.lastMessageAt))
    .limit(MAX_CANDIDATES);
  if (!threads.length) return [];
  const ids = await db
    .select({ threadId: adminMailMessages.threadId, messageId: adminMailMessages.messageId })
    .from(adminMailMessages)
    .where(and(inArray(adminMailMessages.threadId, threads.map((t) => t.id)), isNotNull(adminMailMessages.messageId)));
  return threads.map((t) => ({ id: t.id, subject: t.subject, messageIds: ids.filter((m) => m.threadId === t.id).map((m) => m.messageId!) }));
}

/** One incoming mail for a staff mailbox: forward a copy, store it, thread it. */
export async function handleAdminMail(message: ForwardableEmailMessage, mailbox: string) {
  if (message.rawSize > MAX_RAW_BYTES) return message.setReject("Message too large");
  const raw = await new Response(message.raw).arrayBuffer();
  // The copy goes first: if storing fails, the mail still reaches a person.
  if (env.ADMIN_MAIL_FORWARD) {
    await message.forward(env.ADMIN_MAIL_FORWARD).catch((e) => reportError("web", e, { where: "admin-mail.forward", to: mailbox }));
  }
  const parsed = await PostalMime.parse(raw);
  const messageId = msgId(parsed.messageId ?? message.headers.get("message-id") ?? `<${crypto.randomUUID()}@${mailbox.split("@")[1]}>`);
  if ((await db.select({ id: adminMailMessages.id }).from(adminMailMessages).where(eq(adminMailMessages.messageId, messageId)))[0]) return;

  const [from] = mailboxes(parsed.from);
  const fromEmail = (from?.address ?? message.from).toLowerCase();
  const fromName = senderName(from?.name, fromEmail);
  // Answers go to Reply-To when the sender set one (e.g. noreply@ systems pointing at a person).
  const contact = mailboxes(parsed.replyTo)[0]?.address.toLowerCase() ?? fromEmail;
  const subject = (parsed.subject ?? "").replace(/\s+/g, " ").trim().slice(0, 300);

  const stored = await storeFiles(parsed.attachments);
  let html = parsed.html?.slice(0, MAX_HTML_CHARS) ?? null;
  for (const f of stored) if (html && f.contentId) html = html.replaceAll(`cid:${f.contentId}`, f.url);
  const files = stored.filter((f) => !f.inline).map(({ url, filename, mediaType, size }) => ({ url, filename, mediaType, size }));

  const now = new Date();
  let threadId = matchThread({ subject, inReplyTo: parsed.inReplyTo, references: parsed.references }, await threadCandidates(mailbox, contact));
  if (threadId) {
    // New mail brings a thread back to the inbox from anywhere: archive, snooze or trash.
    await db
      .update(adminMailThreads)
      .set({ unread: true, archivedAt: null, trashedAt: null, snoozedUntil: null, lastMessageAt: now })
      .where(eq(adminMailThreads.id, threadId));
  } else {
    const [t] = await db
      .insert(adminMailThreads)
      .values({ mailbox, subject, contactEmail: contact, contactName: contact === fromEmail ? fromName : null, unread: true, lastMessageAt: now })
      .returning({ id: adminMailThreads.id });
    threadId = t!.id;
  }
  await db
    .insert(adminMailMessages)
    .values({
      threadId,
      direction: "in",
      fromEmail,
      fromName,
      to: addressList(parsed.to),
      cc: addressList(parsed.cc),
      subject,
      text: mailBodyText(parsed).slice(0, MAX_TEXT_CHARS),
      html,
      messageId,
      inReplyTo: parsed.inReplyTo ?? null,
      references: parsed.references ?? null,
      files,
      createdAt: now,
    })
    .onConflictDoNothing();
}

export type AdminMailThread = typeof adminMailThreads.$inferSelect;
export type AdminMailMessage = typeof adminMailMessages.$inferSelect;

const t = adminMailThreads;
const m = adminMailMessages;

/** Snoozed threads whose time has come go back to the inbox, unread and on top. Runs before lists are read, so no cron is needed. */
async function wakeSnoozed() {
  await db
    .update(t)
    .set({ unread: true, lastMessageAt: sql`${t.snoozedUntil}`, snoozedUntil: null })
    .where(and(isNotNull(t.snoozedUntil), lte(t.snoozedUntil, new Date())));
}



/**
 * Subqueries over a thread's messages. Written with explicit aliases: inside a subquery Drizzle's
 * unqualified column names would resolve to the messages table ("id" = the message's own id).
 */
const sentSomething = () => sql.raw(`exists (select 1 from admin_mail_messages mm where mm.thread_id = admin_mail_threads.id and mm.direction = 'out')`);
const receivedSomething = () => sql.raw(`exists (select 1 from admin_mail_messages mm where mm.thread_id = admin_mail_threads.id and mm.direction = 'in')`);
/** The inbox: not archived, trashed or snoozed, and with mail from the other side (a thread we started waits in Sent until they answer). */
const inInbox = () => and(isNull(t.trashedAt), isNull(t.archivedAt), isNull(t.snoozedUntil), receivedSomething());

function folderWhere(folder: MailFolder): SQL | undefined {
  switch (folder) {
    case "inbox":
      return inInbox();
    case "snoozed":
      return and(isNull(t.trashedAt), isNotNull(t.snoozedUntil));
    case "sent":
      return and(isNull(t.trashedAt), sentSomething());
    case "archived":
      return and(isNull(t.trashedAt), isNotNull(t.archivedAt));
    case "trash":
      return isNotNull(t.trashedAt);
  }
}

/** LIKE pattern with the user's % and _ taken literally. */
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** What the list shows of a thread's newest mail: its new text, quoted history and whitespace removed. */
function snippetOf(text: string | null) {
  return splitQuotedReply(text ?? "").body.replace(/\s+/g, " ").trim().slice(0, 160);
}

export interface ThreadQuery {
  mailboxes: string[];
  folder: MailFolder;
  /** Searches subject, people and text in every folder but the trash. */
  q?: string;
  /** Older than this lastMessageAt (ms), for "Load more". */
  before?: number;
}

export async function listAdminThreads(query: ThreadQuery) {
  if (!query.mailboxes.length) return { threads: [], hasMore: false };
  await wakeSnoozed();
  const q = query.q?.trim();
  const conds: (SQL | undefined)[] = [inArray(t.mailbox, query.mailboxes)];
  if (q) {
    const like = likeOf(q.toLowerCase());
    conds.push(
      query.folder === "trash" ? isNotNull(t.trashedAt) : isNull(t.trashedAt),
      or(
        sql`lower(${t.subject}) like ${like} escape '\\'`,
        sql`${t.contactEmail} like ${like} escape '\\'`,
        sql`lower(coalesce(${t.contactName}, '')) like ${like} escape '\\'`,
        sql`exists (select 1 from admin_mail_messages mm where mm.thread_id = admin_mail_threads.id and (lower(mm.text) like ${like} escape '\\' or mm.from_email like ${like} escape '\\' or mm."to" like ${like} escape '\\' or mm.cc like ${like} escape '\\'))`,
      ),
    );
  } else {
    conds.push(folderWhere(query.folder));
  }
  if (query.before) conds.push(lt(t.lastMessageAt, new Date(query.before)));
  const order = query.folder === "snoozed" && !q ? [asc(t.snoozedUntil)] : [desc(t.lastMessageAt)];
  const rows = await db
    .select({
      thread: t,
      last: sql<string | null>`(select substr(mm.text, 1, 2000) from admin_mail_messages mm where mm.thread_id = admin_mail_threads.id order by mm.created_at desc limit 1)`,
      lastDirection: sql<"in" | "out" | null>`(select mm.direction from admin_mail_messages mm where mm.thread_id = admin_mail_threads.id order by mm.created_at desc limit 1)`,
      count: sql<number>`(select count(*) from admin_mail_messages mm where mm.thread_id = admin_mail_threads.id)`,
      files: sql<number>`exists (select 1 from admin_mail_messages mm where mm.thread_id = admin_mail_threads.id and mm.files != '[]')`,
    })
    .from(t)
    .where(and(...conds))
    .orderBy(...order)
    .limit(PAGE_SIZE + 1);
  return {
    threads: rows.slice(0, PAGE_SIZE).map((r) => ({ ...r.thread, snippet: snippetOf(r.last), lastDirection: r.lastDirection, messageCount: r.count, hasFiles: !!r.files })),
    hasMore: rows.length > PAGE_SIZE,
  };
}

/** Unread threads in the inbox, per mailbox (the switcher and the sidebar badge). */
export async function adminUnreadCounts(boxes: string[]) {
  if (!boxes.length) return {} as Record<string, number>;
  await wakeSnoozed();
  const rows = await db
    .select({ mailbox: t.mailbox, n: sql<number>`count(*)` })
    .from(t)
    .where(and(inArray(t.mailbox, boxes), eq(t.unread, true), inInbox()))
    .groupBy(t.mailbox);
  return Object.fromEntries(rows.map((r) => [r.mailbox, r.n])) as Record<string, number>;
}

export async function adminUnreadCount(boxes: string[]) {
  return Object.values(await adminUnreadCounts(boxes)).reduce((a, b) => a + b, 0);
}

/** A thread with its messages, oldest first, and the other threads with the same person; opening it marks it read. */
export async function getAdminThread(id: string, boxes: string[]) {
  const [thread] = await db.select().from(t).where(and(eq(t.id, id), inArray(t.mailbox, boxes)));
  if (!thread) throw new HttpError(404, "Not found");
  if (thread.unread) await db.update(t).set({ unread: false }).where(eq(t.id, id));
  const [messages, related] = await Promise.all([
    db.select().from(m).where(eq(m.threadId, id)).orderBy(m.createdAt),
    db
      .select({ id: t.id, mailbox: t.mailbox, subject: t.subject, lastMessageAt: t.lastMessageAt, trashedAt: t.trashedAt })
      .from(t)
      .where(and(eq(t.contactEmail, thread.contactEmail), inArray(t.mailbox, boxes), ne(t.id, id)))
      .orderBy(desc(t.lastMessageAt))
      .limit(20),
  ]);
  return { thread: { ...thread, unread: false }, messages, related };
}

export interface ThreadPatch {
  archived?: boolean;
  unread?: boolean;
  trashed?: boolean;
  /** Ms; null wakes it now. */
  snoozedUntil?: number | null;
}

/** Archive, trash, snooze or mark several threads at once. */
export async function updateAdminThreads(ids: string[], boxes: string[], patch: ThreadPatch) {
  const set: Partial<AdminMailThread> = {};
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
  if (patch.trashed !== undefined) set.trashedAt = patch.trashed ? new Date() : null;
  if (patch.unread !== undefined) set.unread = patch.unread;
  if (patch.snoozedUntil !== undefined) {
    if (patch.snoozedUntil !== null && patch.snoozedUntil <= Date.now()) throw new HttpError(422, "Pick a time in the future");
    set.snoozedUntil = patch.snoozedUntil === null ? null : new Date(patch.snoozedUntil);
  }
  // Back to the inbox means out of every other folder.
  if (patch.archived === false || patch.trashed === false) set.snoozedUntil ??= null;
  if (!Object.keys(set).length || !ids.length) return 0;
  const rows = await db.update(t).set(set).where(and(inArray(t.id, ids), inArray(t.mailbox, boxes))).returning({ id: t.id });
  return rows.length;
}

/** Deletes threads from the trash for good, with the incoming files in R2 (sent files belong to the org's uploads). */
export async function deleteAdminThreads(ids: string[], boxes: string[]) {
  const threads = await db
    .select({ id: t.id })
    .from(t)
    .where(and(inArray(t.id, ids), inArray(t.mailbox, boxes), isNotNull(t.trashedAt)));
  const found = threads.map((x) => x.id);
  if (!found.length) return 0;
  const rows = await db.select({ files: m.files }).from(m).where(and(inArray(m.threadId, found), eq(m.direction, "in")));
  const prefix = `${ATTACHMENT_URL_PREFIX}attachments/admin-mail/`;
  const keys = rows.flatMap((r) => r.files.filter((f) => f.url.startsWith(prefix)).map((f) => f.url.slice(ATTACHMENT_URL_PREFIX.length)));
  for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));
  await db.batch([db.delete(m).where(inArray(m.threadId, found)), db.delete(t).where(inArray(t.id, found))]);
  return found.length;
}

/** Signatures per mailbox; a mailbox without a row has none. */
export async function getMailboxSettings(boxes: string[]) {
  const rows = boxes.length ? await db.select().from(adminMailboxes).where(inArray(adminMailboxes.mailbox, boxes)) : [];
  return Object.fromEntries(boxes.map((b) => [b, { signature: rows.find((r) => r.mailbox === b)?.signature ?? "" }])) as Record<string, { signature: string }>;
}

export async function setMailboxSignature(mailbox: string, signature: string) {
  await db
    .insert(adminMailboxes)
    .values({ mailbox, signature })
    .onConflictDoUpdate({ target: adminMailboxes.mailbox, set: { signature, updatedAt: new Date() } });
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatDate = (d: Date) =>
  d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });

const FONT = "font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5";

/** Plain text and simple HTML of what we send: the text, then the last incoming mail quoted (reply) or the forwarded mail. */
function renderMail(text: string, extra: { quote?: AdminMailMessage; forward?: AdminMailMessage }) {
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

export interface AdminSend {
  /** For a new e-mail; a reply goes out from its thread's mailbox, a forward from the forwarded mail's. */
  mailbox?: string;
  /** Reply in this thread. */
  threadId?: string;
  /** Forward this message (with its files) as a new thread. */
  forwardOf?: string;
  to: string;
  cc?: string[];
  subject?: string;
  text: string;
  files?: AttachmentInput[];
}

/**
 * Sends from a staff mailbox and stores the mail: a reply in its thread, a new e-mail or a forward
 * as a new thread. Sent right away, not through the queue: staff see a failure, and the provider's
 * Message-ID is kept so the answer threads back.
 */
export async function sendAdminMail(input: AdminSend, boxes: string[]) {
  const [thread] = input.threadId ? await db.select().from(t).where(and(eq(t.id, input.threadId), inArray(t.mailbox, boxes))) : [];
  if (input.threadId && !thread) throw new HttpError(404, "Not found");
  const [forward] = input.forwardOf
    ? await db
        .select({ msg: m, mailbox: t.mailbox })
        .from(m)
        .innerJoin(t, eq(t.id, m.threadId))
        .where(and(eq(m.id, input.forwardOf), inArray(t.mailbox, boxes)))
    : [];
  if (input.forwardOf && !forward) throw new HttpError(404, "Not found");
  const mailbox = thread?.mailbox ?? input.mailbox ?? forward?.mailbox;
  if (!mailbox || !boxes.includes(mailbox)) throw new HttpError(422, "Pick a mailbox");

  const history = thread ? await db.select().from(m).where(eq(m.threadId, thread.id)).orderBy(desc(m.createdAt)).limit(30) : [];
  const lastIn = history.find((x) => x.direction === "in");
  const subject = (forward ? forwardSubject(input.subject || forward.msg.subject) : thread ? replySubject(thread.subject) : input.subject?.trim()) || "(no subject)";
  const ids = history.flatMap((x) => (x.messageId ? [x.messageId] : [])).reverse();
  const headers = ids.length ? { "In-Reply-To": ids.at(-1)!, References: ids.slice(-10).join(" ") } : undefined;
  const { text, html } = renderMail(input.text, { quote: forward ? undefined : lastIn, forward: forward?.msg });
  // A forward carries the original's files; they are ours (attachments/admin-mail), so sendNow can attach them.
  const files = [...(forward?.msg.files ?? []).map((f) => ({ url: f.url, mediaType: f.mediaType, filename: f.filename })), ...(input.files ?? [])];

  const sentId = await sendNow({
    to: input.to,
    cc: input.cc,
    subject,
    text,
    html,
    fromEmail: mailbox,
    fromName: siteConfig.name,
    replyTo: mailbox,
    headers,
    files,
  });

  const now = new Date();
  let threadId = thread?.id;
  if (threadId) {
    await db.update(t).set({ lastMessageAt: now }).where(eq(t.id, threadId));
  } else {
    const [row] = await db.insert(t).values({ mailbox, subject, contactEmail: input.to.toLowerCase(), lastMessageAt: now }).returning({ id: t.id });
    threadId = row!.id;
  }
  const [row] = await db
    .insert(m)
    .values({
      threadId,
      direction: "out",
      fromEmail: mailbox,
      fromName: siteConfig.name,
      to: input.to.toLowerCase(),
      cc: (input.cc ?? []).join(", "),
      subject,
      text,
      messageId: msgId(sentId),
      inReplyTo: headers?.["In-Reply-To"] ?? null,
      references: headers?.References ?? null,
      files: files.map((f) => ({ url: f.url, filename: f.filename, mediaType: f.mediaType, size: 0 })),
      createdAt: now,
    })
    .returning();
  return { threadId, message: row! };
}
