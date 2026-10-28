import * as React from "react"
import { KeyRound, RefreshCw, User } from "lucide-react"
import { toast } from "sonner"

import type { AuditRow } from "@/lib/server/audit"
import { AUDIT_ACTIONS, AUDIT_RETENTION_DAYS, type AuditAction } from "@/config/audit"
import { timeAgo } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { SettingsSection } from "@/components/app/settings-section"
import { DocsLink } from "@/components/app/docs-link"

interface Page {
  rows: AuditRow[]
  nextCursor: string | null
}

async function fetchPage(cursor?: string | null): Promise<Page> {
  const res = await fetch(`/api/app/audit-log${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)
  if (!res.ok) throw new Error("Could not load the audit log")
  return res.json()
}

/** "fields: name, quotaBytes" and similar, from the entry's non-secret details. */
function detailText(details: AuditRow["details"]) {
  if (!details) return null
  const parts = Object.entries(details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
  return parts.length ? parts.join(" · ") : null
}

/** "Created project" → "created project", to read after the actor's name. */
function actionText(action: string) {
  const label = AUDIT_ACTIONS[action as AuditAction]
  return label ? label[0]!.toLowerCase() + label.slice(1) : action
}

export function AuditLogPanel(props: { initial: Page }) {
  const [page, setPage] = React.useState(props.initial)
  const [loading, setLoading] = React.useState<"more" | "refresh" | null>(null)

  async function load(kind: "more" | "refresh") {
    setLoading(kind)
    try {
      const next = await fetchPage(kind === "more" ? page.nextCursor : null)
      setPage(kind === "more" ? { rows: [...page.rows, ...next.rows], nextCursor: next.nextCursor } : next)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  return (
    <SettingsSection
      title="Audit log"
      description={
        <>
          Who changed what, from the dashboard or with an API key. Kept {AUDIT_RETENTION_DAYS} days.{" "}
          <DocsLink href="/docs/team#audit-log">Learn more</DocsLink>
        </>
      }
    >
      <div className="grid gap-3">
        {page.rows.length ? (
          <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
            {page.rows.map((r) => {
              const extra = detailText(r.details)
              return (
                <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                  {r.actorType === "api_key" ? (
                    <KeyRound className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  ) : (
                    <User className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  )}
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm">
                      <span className="font-medium" title={r.actorEmail ?? undefined}>
                        {r.actorName}
                      </span>{" "}
                      <span className="text-muted-foreground">{actionText(r.action)}</span>
                      {r.target ? <span className="font-mono text-xs break-all"> {r.target}</span> : null}
                    </span>
                    <span className="text-muted-foreground truncate text-xs" title={extra ?? undefined}>
                      <time dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString()} suppressHydrationWarning>
                        {timeAgo(r.createdAt)}
                      </time>
                      {r.actorType === "api_key" ? " · API key" : ""}
                      {r.ip ? ` · ${r.ip}` : ""}
                      {extra ? ` · ${extra}` : ""}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Nothing yet. Changes to projects, API keys and the team show up here.</p>
        )}
        <div className="flex gap-2">
          {page.nextCursor ? (
            <Button size="sm" variant="outline" loading={loading === "more"} disabled={!!loading} onClick={() => load("more")}>
              Load more
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" loading={loading === "refresh"} disabled={!!loading} onClick={() => load("refresh")}>
            {loading === "refresh" ? null : <RefreshCw />}
            Refresh
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
