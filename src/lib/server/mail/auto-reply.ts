import { db, eq, lt } from "@/db";
import { mailAutoReplies, mailAutoReplyLog } from "@/db/schema/mail-storage";
import { AUTO_REPLY_EVERY_MS, shouldAutoReply } from "@/lib/mail/auto-reply";
import { HttpError } from "@/lib/server/api";
import type { Mailbox } from "./access";

const own = (id: string, boxes: Mailbox[]) => {
  const b = boxes.find((b) => b.id === id);
  if (!b) throw new HttpError(404, "Not found");
  return b;
};
const OFF = { enabled: false, subject: "", text: "", startsAt: null, endsAt: null };

export async function getAutoReply(boxes: Mailbox[], mailboxId: string) {
  own(mailboxId, boxes);
  const [row] = await db.select().from(mailAutoReplies).where(eq(mailAutoReplies.mailboxId, mailboxId));
  return row ?? { mailboxId, ...OFF };
}

export async function saveAutoReply(
  boxes: Mailbox[],
  input: { mailboxId: string; enabled: boolean; subject: string; text: string; startsAt: Date | null; endsAt: Date | null },
) {
  own(input.mailboxId, boxes);
  const { mailboxId, ...values } = input;
  const [row] = await db
    .insert(mailAutoReplies)
    .values(input)
    .onConflictDoUpdate({ target: mailAutoReplies.mailboxId, set: { ...values, updatedAt: new Date() } })
    .returning();
  return row!;
}

/** Called for each stored incoming message (handleOrgMail); idempotent per message through the outbox key. */
export async function maybeAutoReply(mailbox: Mailbox, messageId: string, threadId: string, sender: string, headers: Headers) {
  const [settings] = await db.select().from(mailAutoReplies).where(eq(mailAutoReplies.mailboxId, mailbox.id));
  const now = new Date();
  if (!shouldAutoReply({ settings, now, sender, mailboxAddress: mailbox.address, headers })) return;
  // Claim the sender for this window; a concurrent delivery or one inside the window gets nothing back.
  const claimed = await db
    .insert(mailAutoReplyLog)
    .values({ mailboxId: mailbox.id, sender: sender.toLowerCase(), sentAt: now })
    .onConflictDoUpdate({
      target: [mailAutoReplyLog.mailboxId, mailAutoReplyLog.sender],
      set: { sentAt: now },
      setWhere: lt(mailAutoReplyLog.sentAt, new Date(now.getTime() - AUTO_REPLY_EVERY_MS)),
    })
    .returning({ sentAt: mailAutoReplyLog.sentAt });
  if (!claimed.length) return;
  const { sendMail } = await import("./store");
  await sendMail(
    { threadId, to: sender, subject: settings!.subject, text: settings!.text, autoReply: true, idempotencyKey: `auto-reply:${messageId}` },
    [mailbox],
    mailbox.displayName,
  );
}
