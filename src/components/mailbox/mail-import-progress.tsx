import * as React from "react"
import { ArrowUpRight, CirclePause, LoaderCircle } from "lucide-react"
import { api } from "@/lib/api-client"
import { onSettingsSaved } from "@/components/settings/open-settings"
import { Progress } from "@/components/ui/progress"
import { appLocale, t } from "@/lib/i18n/panel"

export interface MailImportProgress {
  id: string
  mailbox: string
  status: "queued" | "running" | "failed"
  processed: number
  total: number | null
  etaSeconds: number | null
}

/** One poll for the whole rail; settings changes refresh it immediately. */
export function useMailImportProgress(enabled: boolean) {
  const [imports, setImports] = React.useState<MailImportProgress[]>([])
  const active = imports.some(job => job.status !== "failed")
  React.useEffect(() => {
    if (!enabled) return
    let disposed = false, loading = false
    const refresh = async () => {
      if (loading) return
      loading = true
      try {
        const jobs = await api<MailImportProgress[]>("GET", "/api/app/mail/imap-imports/progress")
        if (!Array.isArray(jobs)) throw new Error("Invalid import progress")
        if (!disposed) setImports(jobs)
      } catch {
        // Keep the last checkpoint during network failures, without a stale time estimate.
        if (!disposed) setImports(jobs => jobs.map(job => ({ ...job, etaSeconds: null })))
      } finally { loading = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), active ? 5000 : 30000)
    const unsubscribe = onSettingsSaved(event => { if (event.kind === "mail-imports") void refresh() })
    window.addEventListener("focus", refresh)
    return () => { disposed = true; window.clearInterval(timer); unsubscribe(); window.removeEventListener("focus", refresh) }
  }, [enabled, active])
  return enabled ? imports : []
}

export function MailboxImportProgress({ jobs }: { jobs: MailImportProgress[] }) {
  return <>{jobs.map(job => {
    const paused = job.status === "failed"
    const total = job.total
    const percent = total !== null && total > 0 ? Math.min(99, Math.round(job.processed / total * 100)) : null
    const minutes = job.etaSeconds === null ? null : Math.max(1, Math.ceil(job.etaSeconds / 60))
    return <a key={job.id} href="/admin/mail#import" aria-label={paused ? t("Resume import for {mailbox}", { mailbox: job.mailbox }) : t("View import for {mailbox}", { mailbox: job.mailbox })}
      className="hover:bg-accent focus-visible:ring-ring/50 mx-1 my-1 grid min-w-0 gap-1.5 rounded-md px-2 py-2 text-xs outline-none focus-visible:ring-[3px]">
      <span className="flex items-center gap-1.5">
        {paused ? <CirclePause className="text-muted-foreground size-3 shrink-0" aria-hidden="true" /> : <LoaderCircle className="text-muted-foreground size-3 shrink-0 animate-spin" aria-hidden="true" />}
        <span className="min-w-0 flex-1">{paused ? t("Import paused") : job.processed > 0 ? t("Importing mail") : total === null ? t("Preparing import") : t("Import queued")}</span>
        {paused ? <span className="text-muted-foreground">{t("Resume")}</span> : <ArrowUpRight className="text-muted-foreground size-3 shrink-0" aria-hidden="true" />}
      </span>
      {percent !== null && <Progress value={percent} className="h-1" aria-label={t("Import progress for {name}", { name: job.mailbox })} />}
      <span className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-2 gap-y-1 tabular-nums">
        <span>{job.processed.toLocaleString(appLocale())}{total !== null ? ` / ${total.toLocaleString(appLocale())}` : " " + t("processed")}</span>
        {!paused && minutes !== null && <span>{minutes < 60 ? t("~{n} min left", { n: minutes }) : t("~{n} hr left", { n: Math.ceil(minutes / 60) })}</span>}
      </span>
    </a>
  })}</>
}
