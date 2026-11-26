import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"
import { Switch } from "@/components/ui/switch"
import { WORKSPACE_NAV } from "@/config/nav"
import type { ModuleId } from "@/config/modules"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import { navigatePanel } from "@/lib/panel-history"

type ModuleRow = { id: ModuleId; enabled: boolean }

/** Settings → Organization → Apps: owners and admins turn the optional apps on or off for everyone. */
export function ModulesPanel({ modules: initial }: { modules: ModuleRow[] }) {
  const [modules, setModules] = React.useState(initial)
  const [busy, setBusy] = React.useState<ModuleId | null>(null)
  const toggle = async (id: ModuleId, enabled: boolean) => {
    setBusy(id)
    try {
      const res = await api<{ modules: ModuleRow[] }>("PUT", "/api/app/org/modules", { module: id, enabled })
      setModules(res.modules)
      // Reload the page's context so the rail, sidebar and ⌘K follow.
      navigatePanel(window.location.href)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <ul className="divide-y rounded-md border">
      <li className="flex items-center justify-between gap-4 p-3">
        <span className="text-sm font-medium">{t("Mail")}</span>
        <span className="text-muted-foreground text-xs">{t("Always on")}</span>
      </li>
      {modules.map((m) => {
        const app = WORKSPACE_NAV.find((n) => n.href === `/app/${m.id}`)
        const label = t(app?.label ?? m.id)
        return (
          <li key={m.id} className="flex items-center justify-between gap-4 p-3">
            <label htmlFor={`module-${m.id}`} className="flex items-center gap-2 text-sm font-medium">
              {app && <app.icon className="text-muted-foreground size-4" aria-hidden />}
              {label}
            </label>
            <Switch id={`module-${m.id}`} checked={m.enabled} disabled={busy !== null} onCheckedChange={(on) => void toggle(m.id, on)} />
          </li>
        )
      })}
    </ul>
  )
}
