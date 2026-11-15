import { worthRecording } from "@/lib/contacts/rules";
import { isAutomatedMail } from "./threading";

/** One out-of-office reply per sender in this window, like Gmail. */
export const AUTO_REPLY_EVERY_MS = 4 * 86_400_000;

export interface AutoReplySettings { enabled: boolean; startsAt: Date | null; endsAt: Date | null; text: string }

/** Whether this incoming message gets the mailbox's out-of-office reply. */
export function shouldAutoReply(a: {
  settings: AutoReplySettings | null | undefined;
  now: Date;
  sender: string;
  mailboxAddress: string;
  headers: { get(name: string): string | null; has(name: string): boolean };
  lastSentAt?: Date | null;
}) {
  const s = a.settings;
  if (!s?.enabled || !s.text.trim()) return false;
  const now = a.now.getTime();
  if ((s.startsAt && now < s.startsAt.getTime()) || (s.endsAt && now >= s.endsAt.getTime())) return false;
  const sender = a.sender.toLowerCase();
  if (!sender.includes("@") || sender === a.mailboxAddress.toLowerCase() || !worthRecording(sender, [])) return false;
  if (isAutomatedMail(a.headers) || a.headers.has("list-id") || a.headers.has("list-unsubscribe") || a.headers.has("x-workinbox-forwarded")) return false;
  return !a.lastSentAt || now - a.lastSentAt.getTime() >= AUTO_REPLY_EVERY_MS;
}
