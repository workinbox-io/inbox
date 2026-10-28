import * as React from "react"
import { AtSign, CalendarClock, Copy, Mail, MessagesSquare, PenSquare, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/app/user-avatar"
import { shortDate } from "./message-view"
import type { ThreadDetail } from "./types"

/** Who the thread is with: their address, every other thread with them, and a quick new e-mail (like Front and Missive). */
export function SenderPanel({ detail, multipleMailboxes, onOpen, onCompose }: { detail: ThreadDetail; multipleMailboxes: boolean; onOpen: (id: string) => void; onCompose: (to: string) => void }) {
  const { thread, messages, related } = detail
  const first = [thread.lastMessageAt, ...related.map((r) => r.lastMessageAt), ...messages.map((m) => m.createdAt)].sort()[0]!
  return (
    <div className="grid gap-6 p-5">
      <div className="grid justify-items-center gap-2 text-center">
        <UserAvatar seed={thread.contactEmail} size={56} />
        <div className="grid gap-0.5">
          {thread.contactName ? <span className="font-semibold">{thread.contactName}</span> : null}
          <span className="text-muted-foreground text-sm break-all">{thread.contactEmail}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onCompose(thread.contactEmail)}>
            <PenSquare /> New e-mail
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Copy address"
            title="Copy address"
            onClick={() => navigator.clipboard.writeText(thread.contactEmail).then(() => toast.success("Copied"))}
          >
            <Copy />
          </Button>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-center text-sm">
        <div className="bg-muted/50 rounded-xl p-3">
          <dt className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
            <MessagesSquare className="size-3.5" /> Threads
          </dt>
          <dd className="font-semibold">{related.length + 1}</dd>
        </div>
        <div className="bg-muted/50 rounded-xl p-3">
          <dt className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
            <CalendarClock className="size-3.5" /> Since
          </dt>
          <dd className="font-semibold">{shortDate(first)}</dd>
        </div>
      </dl>
      <div className="grid gap-2">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Other threads</h2>
        {related.length ? (
          <ul className="grid gap-1">
            {related.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="hover:bg-muted/60 grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 rounded-lg px-2 py-1.5 text-left">
                  {r.trashedAt ? <Trash2 className="text-muted-foreground row-span-2 mt-0.5 size-4" /> : <Mail className="text-muted-foreground row-span-2 mt-0.5 size-4" />}
                  <span className="truncate text-sm font-medium">{r.subject || "(no subject)"}</span>
                  <span className="text-muted-foreground flex gap-2 text-xs">
                    <span>{shortDate(r.lastMessageAt)}</span>
                    {multipleMailboxes ? (
                      <span className="flex min-w-0 items-center gap-0.5 truncate">
                        <AtSign className="size-3 shrink-0" />
                        {r.mailbox.split("@")[0]}
                      </span>
                    ) : null}
                    {r.trashedAt ? <span>in the trash</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">This is the only one.</p>
        )}
      </div>
    </div>
  )
}
