/** Drafts in mail apps (IMAP Drafts folder, through the mail bridge): a Work Inbox draft as an .eml and back. Pure. */
import { draftMessageId } from "./draft-key";
import { buildEml, type EmlInput } from "./mime";
import { splitQuotedReply } from "./quotes";
import { mailBodyText } from "./text";

/** The draft as an .eml; `X-Workinbox-Draft` and the Message-ID carry the key so a re-saved copy finds its draft. */
export function draftEml(key: string, input: Omit<EmlInput, "messageId">) {
  return `X-Workinbox-Draft: ${key}\r\n${buildEml({ ...input, messageId: draftMessageId(key) })}`;
}

type Address = { address?: string; group?: Address[] };
const addresses = (list: Address[] | undefined) =>
  (list ?? []).flatMap((a) => (a.group ? a.group : [a])).map((a) => a.address?.trim().toLowerCase() ?? "").filter(Boolean).slice(0, 50);

/** Fields of a draft from a parsed .eml (postal-mime). Replies keep only the new part: the app adds the quote on send. */
export function draftFields(parsed: { to?: Address[]; cc?: Address[]; subject?: string; text?: string; html?: string; inReplyTo?: string }) {
  const body = mailBodyText(parsed).replace(/\r\n/g, "\n");
  return {
    mode: parsed.inReplyTo ? "reply" as const : "new" as const,
    to: addresses(parsed.to),
    cc: addresses(parsed.cc),
    subject: (parsed.subject ?? "").slice(0, 300),
    text: (parsed.inReplyTo ? splitQuotedReply(body).body : body).trim().slice(0, 50_000),
  };
}
