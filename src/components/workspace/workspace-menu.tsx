import * as React from "react"
import { Building2, Check, Plus } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { authClient } from "@/lib/auth-client"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { leaveDrafts } from "@/components/mailbox/drafts"
import { DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu"

export interface Workspaces {
  orgs: { id: string; name: string; active: boolean }[]
  canCreateOrg: boolean
}

const WorkspacesContext = React.createContext<(Workspaces & { create: () => void }) | null>(null)

/** Around the panel (panel-router.tsx): the workspaces from the page context and the "New workspace" dialog. */
export function WorkspacesProvider({ value, children }: { value: Workspaces; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const ctx = React.useMemo(() => ({ ...value, create: () => setOpen(true) }), [value])
  return (
    <WorkspacesContext.Provider value={ctx}>
      {children}
      {value.canCreateOrg && <NewWorkspaceDialog open={open} onOpenChange={setOpen} />}
    </WorkspacesContext.Provider>
  )
}

/** The whole app belongs to one workspace at a time; switching reloads so nothing of the other company stays in memory. */
export async function switchWorkspace(id: string, name: string) {
  try {
    await leaveDrafts()
  } catch (e) {
    return void toast.error(t((e as Error).message))
  }
  const { error } = await authClient.organization.setActive({ organizationId: id })
  if (error) return void toast.error(error.message ?? t("Something went wrong"))
  toast.success(t("Switched to {name}", { name }))
  window.location.reload()
}

/** Account menus' "Workspace" submenu: hidden for people in one workspace who can't make another. */
export function WorkspaceMenu() {
  const ws = React.useContext(WorkspacesContext)
  if (!ws || (ws.orgs.length < 2 && !ws.canCreateOrg)) return null
  const current = ws.orgs.find((o) => o.active)
  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Building2 className="text-muted-foreground size-4" />
          <span className="truncate">{current?.name ?? t("Workspace")}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-w-64">
          {ws.orgs.map((o) => (
            <DropdownMenuItem key={o.id} onSelect={() => { if (!o.active) void switchWorkspace(o.id, o.name) }}>
              <Check className={o.active ? "" : "invisible"} />
              <span className="truncate">{o.name}</span>
            </DropdownMenuItem>
          ))}
          {ws.canCreateOrg && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={ws.create}>
                <Plus /> {t("New workspace…")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  )
}

function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending(true)
    try {
      await leaveDrafts()
      await api("POST", "/api/app/org/workspaces", { name })
      // Its admin console first: domain, people, plan.
      window.location.href = "/admin"
    } catch (err) {
      toast.error(t((err as Error).message))
      setPending(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("New workspace")}</DialogTitle>
            <DialogDescription>{t("A separate company with its own domains, people, mail and plan. You'll be its owner.")}</DialogDescription>
          </DialogHeader>
          <Input autoFocus required maxLength={64} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Company name")} aria-label={t("Company name")} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={pending} disabled={pending || !name.trim()}>{t("Create workspace")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
