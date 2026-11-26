import * as React from "react"
import { KeyRound, RefreshCw, User } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import type { AuditRow } from "@/lib/server/audit"
import { AUDIT_ACTIONS, AUDIT_RETENTION_DAYS, type AuditAction } from "@/config/audit"
import { timeAgo } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { SettingsSection } from "@/components/app/settings-section"
import { DocsLink } from "@/components/app/docs-link"
import { appLocale, t } from "@/lib/i18n/panel"

interface Page {
  rows: AuditRow[]
  nextCursor: string | null
}

async function fetchPage(cursor?: string | null): Promise<Page> {
  const res = await fetch(`/api/app/audit-log${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)
  if (!res.ok) throw new Error(t("Could not load the audit log"))
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
  // The labels live in config/audit.ts; their translations are keyed by the same English text (i18n/app/account).
  const text = label ? t(label) : action
  return text[0]!.toLowerCase() + text.slice(1)
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
      title={t("Audit log")}
      description={
        <>
          {t("Who changed what, from the dashboard or with an API key. Kept {days} days.", { days: AUDIT_RETENTION_DAYS })}{" "}
          <DocsLink href="/docs/team#audit-log">{t("Learn more")}</DocsLink>
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
                    <span className="text-muted-foreground break-words text-xs">
                      <time dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString(appLocale())} suppressHydrationWarning>
                        {timeAgo(r.createdAt)}
                      </time>
                      {r.actorType === "api_key" ? ` · ${t("API key")}` : ""}
                      {r.ip ? ` · ${r.ip}` : ""}
                    </span>
                    {extra && <details className="text-muted-foreground text-xs"><summary className="w-fit cursor-pointer">{t("Details")}</summary><p className="mt-1 break-all">{extra}</p></details>}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t("Nothing yet. Changes to mail settings, API keys and the team show up here.")}</p>
        )}
        <div className="flex gap-2">
          {page.nextCursor ? (
            <Button size="sm" variant="outline" loading={loading === "more"} disabled={!!loading} onClick={() => load("more")}>
              {t("Load more")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" loading={loading === "refresh"} disabled={!!loading} onClick={() => load("refresh")}>
            {loading === "refresh" ? null : <RefreshCw />}
            {t("Refresh")}
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
