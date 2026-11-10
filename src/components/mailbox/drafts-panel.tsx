import * as React from "react"
import { ArrowLeft, FilePen, Loader2, Sparkles, Trash2 } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/components/ui/date-time-picker"
import { ConfirmButton } from "@/components/app/confirm-button"
import { EmptyState } from "@/components/app/empty-state"
import { draftMeta, readDraft, syncDrafts, useDraftKeys, writeDraft } from "./drafts"
import type { Draft } from "./types"

interface Row {
  key: string
  draft: Draft & { updatedAt?: number }
  threadId: string | null
  subject: string
  via: string | null
  ai: boolean
}

const isThread = (key: string) => key !== "new" && !key.startsWith("d-")

/** Drafts with something in them, newest first; empty ones (a reply opened and left) are skipped. */
function rows(keys: Set<string>): Row[] {
  const out: Row[] = []
  for (const key of keys) {
    const draft = readDraft(key) as Row["draft"] | null
    if (!draft || (!draft.text.trim() && !draft.subject.trim() && !draft.to.length)) continue
    const meta = draftMeta(key)
    out.push({
      key,
      draft,
      threadId: isThread(key) ? key : null,
      subject: draft.subject.trim() || meta?.threadSubject || "(No subject)",
      via: meta?.via ?? null,
      ai: meta?.source === "ai",
    })
  }
  return out.sort((a, b) => (b.draft.updatedAt ?? 0) - (a.draft.updatedAt ?? 0))
}

/** Count for "Drafts" in the rail. */
export function useDraftCount() {
  const keys = useDraftKeys()
  return React.useMemo(() => rows(keys).length, [keys])
}

/**
 * Drafts inside the mail app, in place of the thread list: the person's own (synced across devices) and the ones
 * AI apps wrote with mail_draft. A reply opens its thread with the draft; a new e-mail opens the compose window.
 */
export function DraftsPanel({ onOpen, onBack }: { onOpen: (key: string, threadId: string | null) => void; onBack?: () => void }) {
  const keys = useDraftKeys()
  const [loading, setLoading] = React.useState(true)
  React.useEffect(() => {
    const load = () => syncDrafts().catch((e) => toast.error((e as Error).message)).finally(() => setLoading(false))
    load()
    const timer = setInterval(() => syncDrafts().catch(() => {}), 15_000)
    return () => clearInterval(timer)
  }, [])
  const list = React.useMemo(() => rows(keys), [keys])

  return (
    <section className="@container flex h-full min-h-0 flex-col">
      <div className="flex h-8 items-center gap-2 p-3 px-4 pt-5 pb-5">
        {onBack ? (
          <Button variant="ghost" size="icon-sm" className="-ml-1" onClick={onBack} aria-label="Back to mail">
            <ArrowLeft />
          </Button>
        ) : null}
        <h2 className="text-lg font-semibold tracking-tight">Drafts</h2>
        <span className="text-muted-foreground truncate text-[13px]">Yours and the ones AI apps wrote for you</span>
        {loading ? <Loader2 className="text-muted-foreground ml-auto size-3.5 animate-spin" /> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {!loading && !list.length ? (
          <EmptyState
            variant="plain"
            density="compact"
            className="py-14"
            icon={<FilePen />}
            title="No drafts"
            description="Unsent e-mails and replies wait here, on every device. So do drafts from Claude or ChatGPT."
          />
        ) : (
          <ul className="flex max-w-3xl flex-col divide-y rounded-xl border empty:hidden">
            {list.map((row) => (
              <li key={row.key} className="flex items-start gap-3 p-3">
                <button type="button" className="grid min-w-0 flex-1 gap-0.5 text-left" onClick={() => onOpen(row.key, row.threadId)}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {row.threadId ? "Re: " : ""}
                      {row.subject}
                    </span>
                    {row.ai ? (
                      <Badge variant="info" className="shrink-0">
                        <Sparkles /> {row.via ? `From ${row.via}` : "From an AI app"}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground truncate text-[13px]">
                    To {row.draft.to[0] || "—"}
                    {row.draft.to.length > 1 ? ` +${row.draft.to.length - 1}` : ""}
                    {row.draft.text.trim() ? ` · ${row.draft.text.trim().replace(/\s+/g, " ").slice(0, 120)}` : ""}
                  </span>
                  {row.draft.updatedAt ? (
                    <span className="text-muted-foreground text-xs" suppressHydrationWarning>
                      Saved {formatDateTime(row.draft.updatedAt)}
                    </span>
                  ) : null}
                </button>
                <ConfirmButton title="Discard this draft?" description="It's removed on every device." confirmLabel="Discard" onConfirm={() => writeDraft(row.key, null)}>
                  <Button variant="ghost" size="icon-sm" aria-label="Discard draft" title="Discard draft">
                    <Trash2 />
                  </Button>
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
