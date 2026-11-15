/**
 * Drafts kept on the server, per person (table mail_drafts): the composer syncs them so they follow the person
 * across devices, and AI apps' mail_draft lands here so it can be finished and sent in Work Inbox.
 */
import { and, db, desc, eq, inArray, lt, or, sql, mailDrafts, mailThreads, type MailDraftPayload } from "@/db";
import { HttpError } from "@/lib/server/api";
import { checkDraftFiles } from "./draft-files";
import type { Mailbox } from "./access";

export interface DraftOwner {
  orgId: string;
  userId: string;
  boxes: Mailbox[];
  role?: import("@/lib/server/roles").OrgRole;
}

export interface DraftListQuery { q?: string; limit?: number; cursor?: string }

export async function listDrafts({ orgId, userId, boxes }: DraftOwner, query: DraftListQuery = {}) {
  const limit = Math.min(200, Math.max(1, query.limit ?? 50));
  let cursor: { updatedAt: number; key: string } | undefined;
  if (query.cursor) {
    try {
      cursor = JSON.parse(atob(query.cursor));
      if (!cursor || !Number.isSafeInteger(cursor.updatedAt) || cursor.updatedAt < 0 || typeof cursor.key !== "string") throw new Error();
    } catch { throw new HttpError(422, "Invalid draft cursor"); }
  }
  if (!userId || !boxes.length) return { drafts: [], hasMore: false, nextCursor: null };
  const q = query.q?.trim().toLowerCase();
  const rows = await db.select({ draft: mailDrafts, threadSubject: mailThreads.subject })
    .from(mailDrafts).leftJoin(mailThreads, eq(mailThreads.id, mailDrafts.threadId))
    .where(and(eq(mailDrafts.orgId, orgId), eq(mailDrafts.userId, userId), inArray(mailDrafts.mailboxId, boxes.map((b) => b.id)),
      q ? sql`instr(lower(coalesce(${mailThreads.subject}, '') || ' ' || json_extract(${mailDrafts.payload}, '$.subject') || ' ' || json_extract(${mailDrafts.payload}, '$.text') || ' ' || json_extract(${mailDrafts.payload}, '$.from') || ' ' || json_extract(${mailDrafts.payload}, '$.to') || ' ' || json_extract(${mailDrafts.payload}, '$.cc')), ${q}) > 0` : undefined,
      cursor ? or(lt(mailDrafts.updatedAt, new Date(cursor.updatedAt)), and(eq(mailDrafts.updatedAt, new Date(cursor.updatedAt)), lt(mailDrafts.key, cursor.key))) : undefined))
    .orderBy(desc(mailDrafts.updatedAt), desc(mailDrafts.key)).limit(limit + 1);
  const drafts = rows.slice(0, limit).map(({ draft, threadSubject }) => ({ key: draft.key, threadId: draft.threadId, threadSubject,
    draft: draft.payload, source: draft.source, via: draft.via, updatedAt: draft.updatedAt.getTime() }));
  const last = drafts.at(-1);
  const hasMore = rows.length > limit;
  return { drafts, hasMore, nextCursor: hasMore && last ? btoa(JSON.stringify({ updatedAt: last.updatedAt, key: last.key })) : null };
}

export async function requireDraftVersion(owner: DraftOwner, key: string, expectedUpdatedAt: number) {
  const current = await getDraft(owner, key).catch((e) => {
    if (e instanceof HttpError && e.status === 404) throw new HttpError(409, "Draft changed or was deleted. Read it again.");
    throw e;
  });
  if (current.updatedAt !== expectedUpdatedAt) throw new HttpError(409, "Draft changed or was deleted. Read it again.");
  return current;
}

/** Read one saved draft without the list's 200-item limit. */
export async function getDraft({ orgId, userId, boxes }: DraftOwner, key: string) {
  if (!userId) throw new HttpError(403, "Drafts belong to a person");
  if (!boxes.length) throw new HttpError(404, "Not found");
  const [row] = await db.select().from(mailDrafts).where(and(
    eq(mailDrafts.orgId, orgId), eq(mailDrafts.userId, userId), eq(mailDrafts.key, key),
    inArray(mailDrafts.mailboxId, boxes.map((b) => b.id)),
  ));
  if (!row) throw new HttpError(404, "Not found");
  return { key: row.key, threadId: row.threadId, draft: row.payload, source: row.source, via: row.via, updatedAt: row.updatedAt.getTime() };
}

/** Patch a saved draft only if nobody changed it since the caller read it. Never recreate a deleted draft. */
export async function updateDraft(owner: DraftOwner, key: string, patch: Partial<Pick<MailDraftPayload, "from" | "to" | "cc" | "subject" | "text" | "files">>, expectedUpdatedAt: number) {
  const current = await requireDraftVersion(owner, key, expectedUpdatedAt);
  // New text (MCP, API) replaces the rich body too, or the stale document would be what gets sent.
  const payload = { ...current.draft, ...patch, ...(patch.text !== undefined ? { doc: undefined } : {}) };
  if (payload.files?.length) payload.files = await checkDraftFiles(owner, payload.files);
  const mailbox = owner.boxes.find((b) => b.address === payload.from);
  if (!mailbox) throw new HttpError(422, "Pick a mailbox");
  if (current.threadId && payload.from !== current.draft.from) throw new HttpError(422, "A reply must stay in its thread's mailbox");
  const updatedAt = new Date(Math.max(Date.now(), current.updatedAt + 1));
  const rows = await db.update(mailDrafts).set({ payload, mailboxId: mailbox.id, updatedAt }).where(and(
    eq(mailDrafts.orgId, owner.orgId), eq(mailDrafts.userId, owner.userId), eq(mailDrafts.key, key),
    eq(mailDrafts.updatedAt, new Date(expectedUpdatedAt)),
  )).returning({ key: mailDrafts.key });
  if (!rows.length) throw new HttpError(409, "Draft changed or was deleted. Read it again before editing.");
  return { ...current, draft: payload, updatedAt: updatedAt.getTime() };
}

/** Creates a draft, or updates exactly the expected version. Replies (`key` = thread id) must be in a thread the person can open. */
/** Null when `keepExisting` is set and the person already has a draft under that key. */
export async function saveDraft(owner: DraftOwner, key: string, payload: MailDraftPayload, origin: { source?: "app" | "ai"; via?: string | null; keepExisting?: boolean; expectedUpdatedAt?: number | null } = {}) {
  if (!owner.userId) throw new HttpError(403, "Drafts belong to a person");
  if (payload.files?.length) payload = { ...payload, files: await checkDraftFiles(owner, payload.files) };
  const ids = owner.boxes.map((b) => b.id);
  const isThread = key !== "new" && !key.startsWith("d-");
  const [thread] = isThread && ids.length ? await db.select({ id: mailThreads.id, mailboxId: mailThreads.mailboxId }).from(mailThreads).where(and(eq(mailThreads.id, key), inArray(mailThreads.mailboxId, ids))) : [];
  if (isThread && !thread) throw new HttpError(404, "Not found");
  const mailbox = thread ? owner.boxes.find((b) => b.id === thread.mailboxId) : owner.boxes.find((b) => b.address === payload.from);
  if (!mailbox) throw new HttpError(422, "Pick a mailbox");
  if (thread && payload.from !== mailbox.address) throw new HttpError(422, "A reply must stay in its thread mailbox");
  if (origin.expectedUpdatedAt !== undefined && origin.expectedUpdatedAt !== null) {
    const current = await requireDraftVersion(owner, key, origin.expectedUpdatedAt);
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt + 1));
    const rows = await db.update(mailDrafts).set({ payload, mailboxId: mailbox.id, updatedAt }).where(and(
      eq(mailDrafts.orgId, owner.orgId), eq(mailDrafts.userId, owner.userId), eq(mailDrafts.key, key),
      eq(mailDrafts.updatedAt, new Date(origin.expectedUpdatedAt)),
    )).returning({ key: mailDrafts.key });
    if (!rows.length) throw new HttpError(409, "Draft changed or was deleted. Read it again.");
    return { key, updatedAt: updatedAt.getTime() };
  }
  const now = new Date();
  const values = { mailboxId: mailbox.id, threadId: thread?.id ?? null, payload, source: origin.source ?? "app", via: origin.via ?? null, updatedAt: now };
  const insert = db.insert(mailDrafts).values({ orgId: owner.orgId, userId: owner.userId, key, ...values, createdAt: now });
  const rows = await insert.onConflictDoNothing().returning({ key: mailDrafts.key });
  if (!rows.length) {
    if (!origin.keepExisting) throw new HttpError(409, "Draft already exists. Read it again.");
    return null;
  }
  return { key, updatedAt: now.getTime() };
}

export async function deleteDraft({ orgId, userId }: Pick<DraftOwner, "orgId" | "userId">, key: string, expectedUpdatedAt: number) {
  if (!userId) return;
  const rows = await db.delete(mailDrafts).where(and(
    eq(mailDrafts.orgId, orgId), eq(mailDrafts.userId, userId), eq(mailDrafts.key, key),
    eq(mailDrafts.updatedAt, new Date(expectedUpdatedAt)),
  )).returning({ key: mailDrafts.key });
  if (!rows.length) throw new HttpError(409, "Draft changed or was deleted. Read it again before deleting.");
}
