/**
 * A record's links: pull requests, issues, commits, design files, Linear issues, any URL (collection_record_links,
 * kinds from lib/collections/links.ts). Paste a URL and press Enter; the × removes one. GitHub pull requests and issues
 * show their state (open, draft, merged, closed), read by lib/server/github-links.ts.
 */
import * as React from "react"
import { CircleDot, GitCommitHorizontal, GitPullRequest, Hash, Link2, PenTool, X, type LucideIcon } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { api } from "@/lib/api-client"
import type { LinkKind } from "@/lib/collections/links"
import { msg, t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import type { RecordLink } from "@/lib/server/collections"

/** GitHub's states (lib/server/github-links.ts). */
const STATE_LABEL: Record<string, string> = { open: msg("pr|Open"), draft: msg("pr|Draft"), merged: msg("pr|Merged"), closed: msg("pr|Closed") }
const STATE_CLASS: Record<string, string> = { open: "bg-green-500/10 text-green-700 dark:text-green-400", draft: "bg-muted text-muted-foreground", merged: "bg-violet-500/10 text-violet-700 dark:text-violet-400", closed: "bg-red-500/10 text-red-700 dark:text-red-400" }

export const LINK_ICON: Record<LinkKind, LucideIcon> = { url: Link2, github_pr: GitPullRequest, github_issue: CircleDot, github_commit: GitCommitHorizontal, figma: PenTool, linear: Hash }

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

export function RecordLinks({ path, readOnly, version }: { path: string; readOnly: boolean; version: string }) {
  const [links, setLinks] = React.useState<RecordLink[]>([])
  const [url, setUrl] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    api<{ links: RecordLink[] }>("GET", `${path}/links`).then((r) => setLinks(r.links), () => {})
  }, [path, version])

  async function add() {
    if (!url.trim()) return
    setBusy(true)
    try {
      const link = await api<RecordLink>("POST", `${path}/links`, { url })
      setLinks((list) => (list.some((l) => l.id === link.id) ? list : [...list, link]))
      setUrl("")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (readOnly && !links.length) return null
  return (
    <section className="mt-6" aria-label={t("Links")}>
      <h3 className="text-muted-foreground mb-1.5 text-xs font-medium">{t("Links")}</h3>
      <ul className="space-y-0.5">
        {links.map((l) => {
          const Icon = LINK_ICON[l.kind] ?? Link2
          const state = typeof l.state?.state === "string" ? l.state.state : null
          return (
            <li key={l.id} className="group hover:bg-accent flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px]">
              <Icon className="text-muted-foreground size-3.5 shrink-0" />
              <a href={l.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate">
                {l.title}
                {l.kind === "url" ? null : <span className="text-muted-foreground ml-2 text-xs">{host(l.url)}</span>}
              </a>
              {state ? <span className={cn("rounded px-1.5 text-[11px]", STATE_CLASS[state] ?? "bg-muted")}>{STATE_LABEL[state] ? t(STATE_LABEL[state]) : state}</span> : null}
              {readOnly ? null : (
                <button type="button" aria-label={t("Remove link {title}", { title: l.title })} title={t("Remove")}
                  onClick={() => api("DELETE", `${path}/links/${l.id}`).then(() => setLinks((list) => list.filter((x) => x.id !== l.id)), (e: Error) => void toast.error(e.message))}
                  className="text-muted-foreground hover:text-foreground grid size-5 place-items-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {readOnly ? null : (
        <input
          type="url"
          value={url}
          disabled={busy}
          placeholder={t("Paste a link to a pull request, design or document…")}
          aria-label={t("Add a link")}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.preventDefault(), void add())
            if (e.key === "Escape") (e.stopPropagation(), setUrl(""), e.currentTarget.blur())
          }}
          className="placeholder:text-muted-foreground/60 hover:bg-foreground/[0.03] focus-visible:bg-background focus-visible:border-ring mt-1 h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[13px] outline-none"
        />
      )}
    </section>
  )
}
