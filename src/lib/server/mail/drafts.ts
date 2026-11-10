/**
 * Drafts kept on the server, per person (table mail_drafts): the composer syncs them so they follow the person
 * across devices, and AI apps' mail_draft lands here so it can be finished and sent in Work Inbox.
 */
import { and, db, desc, eq, inArray, mailDrafts, mailThreads, type MailDraftPayload } from "@/db";
import { HttpError } from "@/lib/server/api";
import type { Mailbox } from "./access";

export interface DraftOwner {
  orgId: string;
  userId: string;
  boxes: Mailbox[];
}

/** The person's drafts in mailboxes they can still open, newest first. */
export async function listDrafts({ orgId, userId, boxes }: DraftOwner) {
  if (!userId || !boxes.length) return [];
  const rows = await db
    .select({ draft: mailDrafts, threadSubject: mailThreads.subject })
    .from(mailDrafts)
    .leftJoin(mailThreads, eq(mailThreads.id, mailDrafts.threadId))
    .where(and(eq(mailDrafts.orgId, orgId), eq(mailDrafts.userId, userId), inArray(mailDrafts.mailboxId, boxes.map((b) => b.id))))
    .orderBy(desc(mailDrafts.updatedAt))
    .limit(200);
  return rows.map(({ draft, threadSubject }) => ({
    key: draft.key,
    threadId: draft.threadId,
    threadSubject,
    draft: draft.payload,
    source: draft.source,
    via: draft.via,
    updatedAt: draft.updatedAt.getTime(),
  }));
}

/** Creates or replaces a draft. Replies (`key` = thread id) must be in a thread the person can open. */
export async function saveDraft(owner: DraftOwner, key: string, payload: MailDraftPayload, origin: { source?: "app" | "ai"; via?: string | null } = {}) {
  if (!owner.userId) throw new HttpError(403, "Drafts belong to a person");
  const ids = owner.boxes.map((b) => b.id);
  const isThread = key !== "new" && !key.startsWith("d-");
  const [thread] = isThread && ids.length ? await db.select({ id: mailThreads.id, mailboxId: mailThreads.mailboxId }).from(mailThreads).where(and(eq(mailThreads.id, key), inArray(mailThreads.mailboxId, ids))) : [];
  if (isThread && !thread) throw new HttpError(404, "Not found");
  const mailbox = thread ? owner.boxes.find((b) => b.id === thread.mailboxId) : owner.boxes.find((b) => b.address === payload.from);
  if (!mailbox) throw new HttpError(422, "Pick a mailbox");
  const now = new Date();
  const values = { mailboxId: mailbox.id, threadId: thread?.id ?? null, payload, source: origin.source ?? "app", via: origin.via ?? null, updatedAt: now };
  await db
    .insert(mailDrafts)
    .values({ orgId: owner.orgId, userId: owner.userId, key, ...values, createdAt: now })
    .onConflictDoUpdate({ target: [mailDrafts.orgId, mailDrafts.userId, mailDrafts.key], set: values });
  return { key, updatedAt: now.getTime() };
}

export async function deleteDraft({ orgId, userId }: Pick<DraftOwner, "orgId" | "userId">, key: string) {
  if (!userId) return;
  await db.delete(mailDrafts).where(and(eq(mailDrafts.orgId, orgId), eq(mailDrafts.userId, userId), eq(mailDrafts.key, key)));
}
