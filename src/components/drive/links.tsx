/** The share dialog's "Public links" section: anyone with a link can view and download, with an optional password and expiry. */
import * as React from "react"
import { Copy, Link2, Lock, Trash2 } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import type { DriveLinkView } from "./types"

const linkUrl = (token: string) => `${location.origin}/s/${token}`

export function PublicLinks({ itemId }: { itemId: string }) {
  const [links, setLinks] = React.useState<DriveLinkView[]>([])
  const [adding, setAdding] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [expires, setExpires] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    api<{ links: DriveLinkView[] }>("GET", `/api/app/drive/items/${itemId}/links`)
      .then((r) => setLinks(r.links))
      .catch((e) => toast.error((e as Error).message))
  }, [itemId])

  async function create() {
    setBusy(true)
    try {
      // The end of the chosen day, in the viewer's time zone.
      const expiresAt = expires ? new Date(`${expires}T23:59:59`).getTime() : null
      const link = await api<DriveLinkView>("POST", `/api/app/drive/items/${itemId}/links`, { password: password || undefined, expiresAt })
      setLinks((l) => [...l, link])
      setAdding(false)
      setPassword("")
      setExpires("")
      await navigator.clipboard.writeText(linkUrl(link.token)).catch(() => {})
      toast.success(t("Link created and copied"))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    try {
      await api("DELETE", `/api/app/drive/links/${id}`)
      setLinks((l) => l.filter((x) => x.id !== id))
      toast.success(t("Link deleted"))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <section className="grid gap-2 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{t("Public links")}</h3>
          <p className="text-muted-foreground text-xs">{t("Anyone with the link can view and download, no account needed.")}</p>
        </div>
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Link2 /> {t("New link")}
          </Button>
        ) : null}
      </div>
      {adding ? (
        <div className="grid gap-2 rounded-md border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="password" autoComplete="new-password" placeholder={t("Password (optional)")} aria-label={t("Password (optional)")} value={password} onChange={(e) => setPassword(e.target.value)} />
            <Input type="date" aria-label={t("Expires (optional)")} title={t("Expires (optional)")} min={new Date().toISOString().slice(0, 10)} value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {t("Cancel")}
            </Button>
            <Button size="sm" onClick={create} disabled={busy || (!!password && password.length < 4)}>
              {t("Create link")}
            </Button>
          </div>
        </div>
      ) : null}
      {links.length ? (
        <ul className="grid gap-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm">
              {l.hasPassword ? <Lock className="text-muted-foreground size-3.5 shrink-0" aria-label={t("Password")} /> : <Link2 className="text-muted-foreground size-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{linkUrl(l.token).replace(/^https?:\/\//, "")}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{l.expiresAt ? t("until {date}", { date: new Date(l.expiresAt).toLocaleDateString() }) : t("no expiry")}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("Copy link")}
                onClick={() => navigator.clipboard.writeText(linkUrl(l.token)).then(() => toast.success(t("Link copied")), (e) => toast.error((e as Error).message))}
              >
                <Copy />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={t("Delete link")} onClick={() => remove(l.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
