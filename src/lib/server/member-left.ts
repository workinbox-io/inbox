/**
 * Someone left an org or was removed (auth.ts hooks.after → job `org.memberLeft`): what still reached them goes.
 * Their chat memberships, mailbox grants and unread notifications in the org, their open chat sockets and the note
 * rooms they could edit in (closed, so everyone reconnects with a ticket that re-checks access). Idempotent.
 */
import { and, chatMembers, db, eq, inArray, isNull, mailboxAccess, mailboxes, member, noteAccess, notes, notifications, or } from "@/db";
import { kickChatUser } from "./chat/sync";
import { kickRoom } from "./notes/sync";
import { seatsChanged } from "./seats";

export async function memberLeft(orgId: string, userId: string) {
  // Back in the org already (removed and re-invited before the job ran): nothing to undo.
  const [back] = await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  if (back) return;
  const orgBoxes = db.select({ id: mailboxes.id }).from(mailboxes).where(eq(mailboxes.orgId, orgId));
  const shared = db.select({ id: noteAccess.noteId }).from(noteAccess).where(eq(noteAccess.userId, userId));
  const [, , , rooms] = await db.batch([
    db.delete(chatMembers).where(and(eq(chatMembers.orgId, orgId), eq(chatMembers.userId, userId))),
    db.delete(mailboxAccess).where(and(eq(mailboxAccess.userId, userId), inArray(mailboxAccess.mailboxId, orgBoxes))),
    db.delete(notifications).where(and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), isNull(notifications.readAt))),
    db.select({ id: notes.id }).from(notes).where(and(eq(notes.orgId, orgId), or(eq(notes.sharing, "team"), eq(notes.ownerId, userId), inArray(notes.id, shared)))),
  ]);
  await seatsChanged(orgId);
  await kickChatUser(orgId, userId);
  for (const n of rooms) await kickRoom(n.id);
}
