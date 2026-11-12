/** What the mail pages get from /api/app/mail (dates as ISO strings). */

export interface MailThread {
  id: string
  mailbox: string
  subject: string
  labels?: {id:string;name:string}[]
  contactEmail: string
  contactName: string | null
  unread: boolean
  starred: boolean
  spam: boolean
  archivedAt: string | null
  trashedAt: string | null
  snoozedUntil: string | null
  lastMessageAt: string
  /** List rows only. */
  snippet?: string
  messageCount?: number
  /** Who wrote last: "out" shows "you replied" in the list. */
  lastDirection?: "in" | "out" | null
  hasFiles?: boolean
}

export interface MailFile {
  url: string
  filename: string
  mediaType: string
  size: number
}

export interface MailMessage {
  deliveryStatus?: string | null
  deliveryError?: string | null
  id: string
  threadId: string
  direction: "in" | "out"
  fromEmail: string
  fromName: string | null
  to: string
  cc: string
  subject: string
  text: string
  html: string | null
  files: MailFile[]
  /** Why the spam check flagged it. */
  spamReasons?: string[]
  /** The original .eml is kept ("Show original"). */
  hasRaw?: boolean
  /** A calendar invitation (.ics) in the message. */
  invite?: MailInvite | null
  createdAt: string
}

export type RsvpStatus = "needs-action" | "accepted" | "declined" | "tentative"

export interface MailInvite {
  method: string | null
  title: string
  start: number
  end: number
  allDay: boolean
  timezone: string
  location: string
  url: string
  organizer: string | null
  /** Our copy of the event in the org's calendars. */
  eventId: string | null
  /** The viewer's answer, when they're invited. */
  myStatus: RsvpStatus | null
}

export interface RelatedThread {
  id: string
  mailbox: string
  subject: string
  lastMessageAt: string
  trashedAt: string | null
}

export interface ThreadDetail {
  thread: MailThread
  messages: MailMessage[]
  related: RelatedThread[]
  /** The person in the team address book, if they're in it. */
  contact?: { id: string; name: string; company: string; title: string; phones: { value: string; label?: string }[] } | null
}

export type ReplyMode = "reply" | "replyAll" | "forward"

/** A message being written; kept in the browser per thread ("new" for a new e-mail) until it's sent or discarded. */
export interface Draft {
  sendAt?: number
  idempotencyKey?: string
  mode: "new" | ReplyMode
  from: string
  to: string[]
  cc: string[]
  subject: string
  text: string
  /** The message a reply answers or a forward carries. */
  messageId?: string
  /** Sent without the mailbox's signature (the composer's "Signature" box unticked). */
  noSignature?: boolean
}

export interface ThreadPatch {
  archived?: boolean
  unread?: boolean
  trashed?: boolean
  starred?: boolean
  spam?: boolean
  snoozedUntil?: number | null
}

/** What the list can show: the server's folders plus Drafts and Outbox, which list drafts and send jobs instead of threads. */
export type MailView = import("@/lib/mail/rules").UserMailFolder | "drafts" | "outbox"
export const isVirtualFolder = (f: MailView): f is "drafts" | "outbox" => f === "drafts" || f === "outbox"
