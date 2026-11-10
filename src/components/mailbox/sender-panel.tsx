import * as React from "react"
import { AtSign, BookUser, Building2, CalendarClock, Copy, Inbox, Mail, MessagesSquare, PenSquare, Phone, Trash2, UserPlus, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { UserAvatar } from "@/components/app/user-avatar"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import { shortDate } from "./message-view"
import { mailboxColor } from "./mail-ui"
import type { ThreadDetail } from "./types"

/** Who the thread is with, laid out like a calendar event's details: one property per row, then their other threads. */
export function SenderPanel({ detail, multipleMailboxes, onOpen, onCompose }: { detail: ThreadDetail; multipleMailboxes: boolean; onOpen: (id: string) => void; onCompose: (to: string) => void }) {
  const { thread, messages, related } = detail
  const first = [thread.lastMessageAt, ...related.map((r) => r.lastMessageAt), ...messages.map((m) => m.createdAt)].sort()[0]!
  const count = related.length + 1
  const [contact, setContact] = React.useState(detail.contact ?? null)
  React.useEffect(() => setContact(detail.contact ?? null), [detail.contact])
  async function saveContact() {
    try {
      const saved = await api<NonNullable<ThreadDetail["contact"]>>("POST", "/api/app/contacts", { name: thread.contactName ?? "", emails: [{ value: thread.contactEmail }] })
      setContact(saved)
      toast.success(t("Contact added"))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="grid gap-5 px-4 py-4">
      <div className="flex items-center gap-3">
        <UserAvatar seed={thread.contactEmail} size={36} />
        <div className="grid min-w-0">
          <span className="truncate text-[15px] font-semibold tracking-tight">{contact?.name || thread.contactName || thread.contactEmail.split("@")[0]}</span>
          <span className="text-muted-foreground truncate text-xs">{thread.contactEmail.split("@")[1]}</span>
        </div>
      </div>

      <ul className="grid gap-px text-[13px]">
        <Row icon={Mail}>
          <span className="min-w-0 flex-1 truncate">{thread.contactEmail}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground rounded p-0.5 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
            aria-label="Copy address"
            title="Copy address"
            onClick={() => navigator.clipboard.writeText(thread.contactEmail).then(() => toast.success("Copied"))}
          >
            <Copy className="size-3.5" />
          </button>
        </Row>
        {contact?.company || contact?.title ? (
          <Row icon={Building2}>
            <span className="min-w-0 truncate">{[contact.title, contact.company].filter(Boolean).join(" · ")}</span>
          </Row>
        ) : null}
        {contact?.phones[0] ? (
          <Row icon={Phone}>
            <a className="min-w-0 truncate hover:underline" href={`tel:${contact.phones[0].value.replace(/[^\d+]/g, "")}`}>
              {contact.phones[0].value}
            </a>
          </Row>
        ) : null}
        <Row icon={MessagesSquare}>
          {count} {count === 1 ? "thread" : "threads"}
        </Row>
        <Row icon={CalendarClock}>
          <span className="text-muted-foreground">First mail</span>&nbsp;{shortDate(first)}
        </Row>
        <Row icon={Inbox}>
          <span className="size-2 shrink-0 rounded-[3px]" style={{ background: mailboxColor(thread.mailbox) }} aria-hidden />
          <span className="min-w-0 truncate">{thread.mailbox}</span>
        </Row>
        <li>
          <button
            type="button"
            onClick={() => onCompose(thread.contactEmail)}
            className="hover:bg-foreground/[0.035] flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left font-medium"
          >
            <PenSquare className="text-muted-foreground size-4" /> New e-mail
          </button>
        </li>
        <li>
          {contact ? (
            <a href={`/app/contacts/${contact.id}`} className="hover:bg-foreground/[0.035] flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left font-medium">
              <BookUser className="text-muted-foreground size-4" /> {t("Open contact")}
            </a>
          ) : (
            <button type="button" onClick={saveContact} className="hover:bg-foreground/[0.035] flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left font-medium">
              <UserPlus className="text-muted-foreground size-4" /> {t("Save contact")}
            </button>
          )}
        </li>
      </ul>

      <div className="grid gap-1">
        <h2 className="text-muted-foreground px-2 text-xs font-medium">Other threads</h2>
        {related.length ? (
          <ul className="grid gap-px">
            {related.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="hover:bg-foreground/[0.035] relative grid w-full gap-0.5 rounded-md py-1.5 pr-2 pl-4 text-left">
                  <span className="absolute top-2 bottom-2 left-1.5 w-[3px] rounded-full" style={{ background: mailboxColor(r.mailbox), opacity: r.trashedAt ? 0.3 : 0.8 }} aria-hidden />
                  <span className="truncate text-[13px] font-medium">{r.subject || "(no subject)"}</span>
                  <span className="text-muted-foreground flex gap-2 text-xs">
                    <span>{shortDate(r.lastMessageAt)}</span>
                    {multipleMailboxes ? (
                      <span className="flex min-w-0 items-center gap-0.5 truncate">
                        <AtSign className="size-3 shrink-0" />
                        {r.mailbox.split("@")[0]}
                      </span>
                    ) : null}
                    {r.trashedAt ? (
                      <span className="flex items-center gap-0.5">
                        <Trash2 className="size-3" /> in the trash
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-2 text-[13px]">This is the only one.</p>
        )}
      </div>
    </div>
  )
}

function Row({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="group/row flex h-8 items-center gap-2.5 rounded-md px-2">
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    </li>
  )
}
