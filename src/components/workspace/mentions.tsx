/**
 * "@ anything" in the browser: icons (avatars for people, file-type tiles for files), the chip a mention renders as,
 * the picker's search and list (chat composer, mail editor), and the "they can't open it" dialog shown on send.
 * Tokens: lib/mentions.ts; server: lib/server/mentions.ts.
 */
import * as React from "react"
import { CalendarDays, Database, Folder, Hash, Lock, Mail, StickyNote } from "lucide-react"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileBadge } from "@/components/workspace/file-viewer"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import { refHref, type Mentionable, type MentionKind, type Ref } from "@/lib/mentions"
import { cn } from "@/lib/utils"

const KIND_ICON = {
  note: { icon: StickyNote, tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  event: { icon: CalendarDays, tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  thread: { icon: Mail, tone: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400" },
  channel: { icon: Hash, tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" },
  record: { icon: Database, tone: "bg-violet-500/12 text-violet-700 dark:text-violet-400" },
} as const

export const KIND_LABEL = (): Record<MentionKind, string> => ({
  person: t("People"),
  file: t("Files"),
  note: t("Notes"),
  event: t("Events"),
  contact: t("Contacts"),
  thread: t("Mail"),
  channel: t("Channels"),
  record: t("Records"),
})

/** Avatar for people and contacts, the file's type tile, else the app's icon. `size` in px. */
export function MentionIcon({ item, size = 18, className }: { item: Pick<Mentionable, "kind" | "id" | "title" | "mediaType" | "folder" | "seed">; size?: number; className?: string }) {
  if (item.kind === "person" || item.kind === "contact") return <UserAvatar seed={item.seed ?? item.id} size={size} className={className} />
  const box = { width: size, height: size }
  if (item.kind === "file") {
    if (item.folder)
      return (
        <span style={box} className={cn("grid shrink-0 place-items-center rounded bg-slate-500/12 text-slate-600 dark:text-slate-300", className)}>
          <Folder style={{ width: size * 0.65, height: size * 0.65 }} />
        </span>
      )
    return <FileBadge file={{ mediaType: item.mediaType ?? "", name: item.title }} className={cn("rounded [&_svg]:!size-[65%]", className)} style={box} />
  }
  const { icon: Icon, tone } = KIND_ICON[item.kind]
  return (
    <span style={box} className={cn("grid shrink-0 place-items-center rounded", tone, className)}>
      <Icon style={{ width: size * 0.65, height: size * 0.65 }} />
    </span>
  )
}

/**
 * The icon inside running text, centred on the capitals (Figtree's are 0.7em tall). An inline-block that clips has
 * its baseline at its bottom edge whatever is inside (an avatar, a tile with a smaller icon), so the offset holds.
 */
export function InlineMentionIcon({ item }: { item: Parameters<typeof MentionIcon>[0]["item"] }) {
  return (
    <span className="mr-[0.3em] inline-block size-3.5 overflow-hidden rounded-[3px] align-[calc(0.35em-7px)] *:align-top">
      <MentionIcon item={item} size={14} className="rounded-[3px]" />
    </span>
  )
}

/**
 * A mention inside a message, written like a link in the text (as Macro and Notion do): the item's icon, then its
 * title underlined lightly; no box, so long titles wrap and lines keep their height. Opens the item in its app (or the
 * public link made for it).
 */
export function MentionChip({ value: r, className }: { value: Ref; className?: string }) {
  const outside = !!r.url
  return (
    <a
      href={refHref(r)}
      target={outside ? "_blank" : undefined}
      rel={outside ? "noopener noreferrer" : undefined}
      data-astro-reload
      title={outside ? t("Shared link") : undefined}
      className={cn("text-foreground font-medium break-words underline decoration-foreground/25 decoration-1 underline-offset-[3px] transition-colors hover:decoration-foreground/70", className)}
    >
      <InlineMentionIcon item={{ kind: r.kind, id: r.id, title: r.title }} />
      {r.title}
      {outside ? <span className="text-muted-foreground ml-0.5 text-[0.8em] no-underline" aria-hidden>↗</span> : null}
    </a>
  )
}

/** Debounced picker search; `null` = closed. */
export function useMentionSearch(query: string | null) {
  return useMentionLookup(query).results
}

/** `useMentionSearch` plus whether results for `query` are still on their way. */
export function useMentionLookup(query: string | null) {
  const [results, setResults] = React.useState<Mentionable[]>([])
  const [loading, setLoading] = React.useState(false)
  React.useEffect(() => {
    if (query === null) {
      setLoading(false)
      return setResults([])
    }
    setLoading(true)
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/app/mentions?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ results: Mentionable[] }>) : { results: [] }))
        .then((d: { results: Mentionable[] }) => setResults(d.results))
        .catch(() => {})
        .finally(() => !ctrl.signal.aborted && setLoading(false))
    }, 120)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query])
  return { results, loading }
}

/** The picker's rows grouped by kind; `active` is an index into `items`. */

/** A result's second line: an event's start (sent as ISO) as a short local date, else the server's text. */
export function mentionSubtitle(m: Mentionable) {
  if (!m.subtitle) return ""
  return m.kind === "event" && /^\d{4}-/.test(m.subtitle) ? new Date(m.subtitle).toLocaleDateString([], { month: "short", day: "numeric" }) : t(m.subtitle)
}

export function MentionList({ items, active, onPick, onHover, className }: { items: Mentionable[]; active: number; onPick: (m: Mentionable) => void; onHover?: (i: number) => void; className?: string }) {
  const labels = KIND_LABEL()
  return (
    <ul role="listbox" aria-label={t("Mention")} className={cn("bg-popover max-h-80 w-72 overflow-y-auto rounded-lg border p-1 shadow-md", className)}>
      {items.map((m, i) => (
        <React.Fragment key={`${m.kind}:${m.id}`}>
          {i === 0 || items[i - 1]!.kind !== m.kind ? <li className="text-muted-foreground px-2 pt-1.5 pb-0.5 text-[11px] font-medium">{labels[m.kind]}</li> : null}
          <li
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(m)
            }}
            onMouseMove={() => i !== active && onHover?.(i)}
            className={cn("flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px]", i === active && "bg-accent")}
          >
            <MentionIcon item={m} />
            <span className="truncate font-medium">{m.title}</span>
            {m.subtitle ? <span className="text-muted-foreground ml-auto max-w-[45%] shrink-0 truncate text-xs">{mentionSubtitle(m)}</span> : null}
          </li>
        </React.Fragment>
      ))}
    </ul>
  )
}

// ---- On send: who can't open what ----

export interface AccessGap {
  ref: Ref
  users: { id: string; name: string; email: string }[]
  external: string[]
  can: { grant: boolean; live: boolean; snapshot: boolean }
}
export interface MentionAudience {
  channelId?: string
  emails?: string[]
}
type Choice = "grant" | "live" | "snapshot" | "none"
type Outside = "live" | "snapshot" | "none"

function choicesFor(g: AccessGap): Choice[] {
  const grant = g.can.grant && (g.users.length > 0 || (g.ref.kind === "event" && g.external.length > 0))
  return [...(grant ? (["grant"] as const) : []), ...(g.can.live ? (["live"] as const) : []), ...(g.can.snapshot ? (["snapshot"] as const) : []), "none"]
}

const grantLabel = (g: AccessGap) => (g.ref.kind === "event" ? t("Invite them") : g.ref.kind === "channel" ? t("Add them to the channel") : t("Give them view access"))

/**
 * `check(refs, audience)` asks the server who can't open what; when someone can't, it shows the dialog and resolves
 * with the refs that got a link (to put back into the message), or null when the sender cancels.
 */
export function useMentionAccess() {
  const [open, setOpen] = React.useState<{ gaps: AccessGap[]; resolve: (refs: Ref[] | null) => void } | null>(null)
  const check = React.useCallback(async (refs: Ref[], audience: MentionAudience): Promise<Ref[] | null> => {
    const todo = refs.filter((r) => !r.url && r.kind !== "contact")
    if (!todo.length) return []
    const { gaps } = await api<{ gaps: AccessGap[] }>("POST", "/api/app/mentions/access", { refs: todo, audience })
    if (!gaps.length) return []
    return new Promise((resolve) => setOpen({ gaps, resolve }))
  }, [])
  const dialog = open ? (
    <AccessDialog
      gaps={open.gaps}
      onDone={(refs) => {
        open.resolve(refs)
        setOpen(null)
      }}
    />
  ) : null
  return { check, dialog }
}

const EXPIRY = [
  { id: "never", label: () => t("Links never expire"), ms: null },
  { id: "7", label: () => t("Links expire in 7 days"), ms: 7 * 86_400_000 },
  { id: "30", label: () => t("Links expire in 30 days"), ms: 30 * 86_400_000 },
] as const

function AccessDialog({ gaps, onDone }: { gaps: AccessGap[]; onDone: (refs: Ref[] | null) => void }) {
  const [choice, setChoice] = React.useState<Choice[]>(() =>
    gaps.map((g) => {
      const c = choicesFor(g)
      return g.users.length === 0 && g.external.length && c.includes("live") ? "live" : c[0]!
    }),
  )
  const [outside, setOutside] = React.useState<Outside[]>(() => gaps.map((g) => (g.can.live ? "live" : "none")))
  const [expiry, setExpiry] = React.useState<(typeof EXPIRY)[number]["id"]>("never")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  const apply = async () => {
    setBusy(true)
    setError("")
    const ms = EXPIRY.find((e) => e.id === expiry)!.ms
    const expiresAt = ms ? Date.now() + ms : null
    const share = (g: AccessGap, action: Choice | Outside) =>
      api<{ ref: Ref }>("POST", "/api/app/mentions/share", { ref: g.ref, action, userIds: g.users.map((u) => u.id), emails: g.external, expiresAt }).then((r) => r.ref)
    try {
      const linked: Ref[] = []
      for (const [i, g] of gaps.entries()) {
        const c = choice[i]!
        if (c === "none") continue
        if (c !== "grant") {
          linked.push(await share(g, c))
          continue
        }
        await share(g, "grant")
        const o = outside[i]!
        if (g.external.length && g.ref.kind !== "event" && o !== "none") linked.push(await share(g, o))
      }
      onDone(linked)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const names = (g: AccessGap) => [...g.users.map((u) => u.name || u.email), ...g.external].slice(0, 4).join(", ") + (g.users.length + g.external.length > 4 ? ` +${g.users.length + g.external.length - 4}` : "")
  const hasLinks = gaps.some((g, i) => choice[i] === "live" || choice[i] === "snapshot" || (choice[i] === "grant" && g.external.length && outside[i] !== "none"))

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onDone(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Not everyone can open what you mentioned")}</DialogTitle>
          <DialogDescription>{t("Pick what they get. A live link always shows the current version; a snapshot is a copy as it is now.")}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-3">
          {gaps.map((g, i) => {
            const options = choicesFor(g)
            return (
              <li key={`${g.ref.kind}:${g.ref.id}`} className="grid gap-2 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <MentionIcon item={g.ref} size={20} />
                  <span className="truncate text-sm font-medium">{g.ref.title}</span>
                  <Lock className="text-muted-foreground ml-auto size-3.5 shrink-0" />
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("Can't open it")}: {names(g)}
                </p>
                <Select value={choice[i]} onValueChange={(v) => setChoice((c) => c.map((x, j) => (j === i ? (v as Choice) : x)))}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o === "grant" ? grantLabel(g) : o === "live" ? t("Live link (always current)") : o === "snapshot" ? t("Snapshot link (as it is now)") : t("Send without access")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {choice[i] === "grant" && g.external.length > 0 && g.ref.kind !== "event" && g.can.live ? (
                  <Select value={outside[i]} onValueChange={(v) => setOutside((c) => c.map((x, j) => (j === i ? (v as Outside) : x)))}>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">{t("People outside get a live link")}</SelectItem>
                      {g.can.snapshot ? <SelectItem value="snapshot">{t("People outside get a snapshot")}</SelectItem> : null}
                      <SelectItem value="none">{t("Nothing for people outside")}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
                {options.length === 1 ? <p className="text-muted-foreground text-xs">{t("Only its owner can share it.")}</p> : null}
              </li>
            )
          })}
        </ul>
        {hasLinks ? (
          <Select value={expiry} onValueChange={(v) => setExpiry(v as typeof expiry)}>
            <SelectTrigger size="sm" className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.label()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onDone(null)}>
            {t("Back to editing")}
          </Button>
          <Button disabled={busy} onClick={() => void apply()}>
            {t("Send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
