/**
 * Who may open a note or a drive item: just the owner, chosen people (view or edit) or everyone in the organization.
 * PUTs { sharing, teamRole, people } to `endpoint`; `children` adds a section below (the drive's public links).
 */
import * as React from "react"
import { Globe, Lock, Users, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api-client"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"
import { useListKeys } from "@/hooks/use-list-keys"
import { useNotePeople } from "@/components/notes/editor/people"
import { UserAvatar } from "@/components/app/user-avatar"

type Sharing = "private" | "people" | "team"

type Role = "view" | "edit"

export interface Shareable {
  sharing: Sharing
  teamRole: Role
  ownerId: string | null
  people: { userId: string; role: Role; name?: string; email?: string }[]
}

export function ShareDialog<T extends Shareable>({
  note,
  endpoint,
  title,
  description,
  open,
  onOpenChange,
  onSaved,
  children,
}: {
  note: T
  endpoint: string
  title: string
  description: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (n: T) => void
  children?: React.ReactNode
}) {
  const everyone = useNotePeople()
  const [sharing, setSharing] = React.useState<Sharing>(note.sharing)
  const [teamRole, setTeamRole] = React.useState<Role>(note.teamRole)
  const [people, setPeople] = React.useState(note.people.map((p) => ({ userId: p.userId, role: p.role as Role })))
  const [query, setQuery] = React.useState("")
  const [focused, setFocused] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setSharing(note.sharing)
    setTeamRole(note.teamRole)
    setPeople(note.people.map((p) => ({ userId: p.userId, role: p.role as Role })))
    setQuery("")
  }, [open, note])

  const byId = new Map(everyone.map((p) => [p.id, p]))
  const q = query.trim().toLowerCase()
  // Shown as soon as the field has focus, filtered as you type.
  const candidates = q || focused
    ? everyone.filter((p) => p.id !== note.ownerId && !people.some((x) => x.userId === p.id) && (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))).slice(0, 6)
    : []
  const owner = note.ownerId ? byId.get(note.ownerId) : undefined
  const keys = useListKeys(candidates.length, "share-people")
  const pick = (p: { id: string }) => {
    setPeople((list) => [...list, { userId: p.id, role: "edit" }])
    setQuery("")
    keys.reset()
  }

  async function save() {
    setSaving(true)
    try {
      const saved = await api<T>("PUT", endpoint, { sharing, teamRole, people: sharing === "people" ? people : [] })
      onSaved(saved)
      onOpenChange(false)
      toast.success(t("Sharing saved"))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const options: { value: Sharing; icon: typeof Lock; title: string; hint: string }[] = [
    { value: "private", icon: Lock, title: t("Only me"), hint: t("Nobody else can open it, admins included.") },
    { value: "people", icon: Users, title: t("Chosen people"), hint: t("People you add below.") },
    { value: "team", icon: Globe, title: t("Everyone in the organization"), hint: t("All members can find and open it.") },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div role="radiogroup" className="grid gap-1.5">
            {options.map(({ value, icon: Icon, title, hint }) => (
              <div
                key={value}
                role="radio"
                tabIndex={0}
                aria-checked={sharing === value}
                onClick={() => setSharing(value)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget || (e.key !== " " && e.key !== "Enter")) return
                  e.preventDefault()
                  setSharing(value)
                }}
                className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50", sharing === value && "border-primary bg-primary/5")}
              >
                <Icon className="mt-0.5 size-4 text-muted-foreground" />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{title}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </span>
                {value === "people" && people.length > 0 && (
                  <span className="ml-auto flex -space-x-1.5" aria-label={t("{n} people", { n: people.length })}>
                    {people.slice(0, 4).map((p) => <UserAvatar key={p.userId} seed={byId.get(p.userId)?.email ?? p.userId} size={22} className="ring-background ring-2" />)}
                    {people.length > 4 && <span className="bg-muted ring-background grid size-[22px] place-items-center rounded-full text-[10px] font-medium ring-2">+{people.length - 4}</span>}
                  </span>
                )}
                {value === "team" && sharing === "team" && (
                  <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                    <RoleSelect value={teamRole} onChange={setTeamRole} />
                  </span>
                )}
              </div>
            ))}
          </div>

          {sharing === "people" && (
            <div className="grid gap-2">
              <div className="relative">
                <input
                  value={query}
                  {...keys.inputProps}
                  aria-label={t("Add people by name or e-mail")}
                  onChange={(e) => (setQuery(e.target.value), keys.reset())}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => {
                    if (keys.onKeyDown(e)) return
                    if (e.key === "Enter" && keys.open) {
                      e.preventDefault()
                      pick(candidates[Math.max(keys.active, 0)]!)
                    }
                  }}
                  placeholder={t("Add people by name or e-mail")}
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                {keys.open && (
                  <div {...keys.listProps} className="absolute inset-x-0 top-full z-10 mt-1 rounded-md border bg-popover p-1 shadow-md">
                    {candidates.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        tabIndex={-1}
                        {...keys.optionProps(i)}
                        className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm", i === keys.active && "bg-accent")}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(p)}
                      >
                        <UserAvatar seed={p.email} size={22} />
                        <span className="truncate">{p.name || p.email}</span>
                        <span className="truncate text-xs text-muted-foreground">{p.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ul className="grid gap-1">
                {owner && (
                  <li className="flex items-center gap-2.5 rounded-md px-1 py-1">
                    <UserAvatar seed={owner.email} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{owner.name || owner.email}</span>
                      <span className="block truncate text-xs text-muted-foreground">{owner.email}</span>
                    </span>
                    <span className="pr-2 text-xs text-muted-foreground">{t("Owner")}</span>
                  </li>
                )}
                {people.length === 0 && <li className="px-1 py-1 text-sm text-muted-foreground">{t("Nobody added yet. Pick people above.")}</li>}
                {people.map((p) => {
                  const person = byId.get(p.userId) ?? note.people.find((x) => x.userId === p.userId)
                  return (
                    <li key={p.userId} className="flex items-center gap-2.5 rounded-md px-1 py-1">
                      <UserAvatar seed={person?.email ?? p.userId} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{person?.name ?? p.userId}</span>
                        <span className="block truncate text-xs text-muted-foreground">{person?.email}</span>
                      </span>
                      <RoleSelect value={p.role} onChange={(role) => setPeople((list) => list.map((x) => (x.userId === p.userId ? { ...x, role } : x)))} />
                      <Button variant="ghost" size="icon-sm" aria-label={t("Remove")} onClick={() => setPeople((list) => list.filter((x) => x.userId !== p.userId))}>
                        <X />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {children}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {t("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)}>
      <SelectTrigger size="sm" className="w-[110px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="edit">{t("Can edit")}</SelectItem>
        <SelectItem value="view">{t("Can view")}</SelectItem>
      </SelectContent>
    </Select>
  )
}
