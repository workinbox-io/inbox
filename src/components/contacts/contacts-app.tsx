/**
 * /app/contacts on the workspace kit: the team address book (lib/server/contacts.ts). Rail with views and groups,
 * the list with search, and the open contact (details, or the edit form). The directory (our own people and shared
 * mailboxes) is read-only. Import parses the file here (lib/contacts/import.ts) and sends it in chunks.
 */
import * as React from "react"
import {
  AtSign,
  BookUser,
  Building2,
  Clock,
  Copy,
  Download,
  Mail,
  Pencil,
  PenSquare,
  Phone,
  Plus,
  SearchX,
  Tag,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"
import { EmptyState } from "@/components/app/empty-state"
import { UserAvatar } from "@/components/app/user-avatar"
import { AccountMenu, type MailUser } from "@/components/mailbox/account-menu"
import { shortDate } from "@/components/mailbox/message-view"
import { mailboxColor } from "@/components/mailbox/mail-ui"
import { PixelBanner } from "./pixel-banner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ActionMenuButton, cleanActions, type MenuAction } from "@/components/workspace/action-menu"
import { AppFrame } from "@/components/workspace/app-frame"
import { DetailHeader, IconAction } from "@/components/workspace/detail-header"
import { ListBody, ListEmpty, ListHeader, ListPane, ListRow, ListSearch } from "@/components/workspace/list-pane"
import { Rail, RailAction, RailItem, RailList, RailSection, RailSectionButton } from "@/components/workspace/rail"
import { SplitView } from "@/components/workspace/split-view"
import { foldAway, Kbd, shortcutsPaused, tint, useAppLayout, useMounted, WORKSPACE_COLORS } from "@/components/workspace/ui"
import { api } from "@/lib/api-client"
import { IMPORT_MAX_BYTES, parseContactsFile } from "@/lib/contacts/import"
import { t, tp } from "@/lib/i18n/panel"
import { navigatePanel, PANEL_NAVIGATION, pushUrl } from "@/lib/panel-history"
import type { Contact, DirectoryEntry } from "@/lib/server/contacts"

export type ContactGroup = { id: string; name: string; count: number }
type View = "all" | "recent" | "directory"
type Value = { value: string; label?: string }

export interface ContactsAppProps {
  contacts: Contact[]
  hasMore: boolean
  groups: ContactGroup[]
  selectedId: string | null
  canManage: boolean
  /** The user view: full screen, the account menu at the bottom of the rail. */
  account?: MailUser
}

const VIEWS: { value: View; label: string; icon: typeof Users }[] = [
  { value: "all", label: "All contacts", icon: BookUser },
  { value: "recent", label: "Recently e-mailed", icon: Clock },
  { value: "directory", label: "Directory", icon: Building2 },
]

const PAGE = 100
const LABELS = ["work", "home", "mobile", "other"]
const name = (c: Contact) => c.name || c.emails[0]?.value.split("@")[0] || c.phones[0]?.value || t("No name")
const letterOf = (c: Contact) => {
  const ch = name(c).normalize("NFD").charAt(0).toUpperCase()
  return /[A-Z]/.test(ch) ? ch : "#"
}
const compose = (email: string) => `/app/mail?compose=1&to=${encodeURIComponent(email)}`
const color = (c: Contact) => (c.source === "sent" && !c.name ? "#9ca3af" : WORKSPACE_COLORS[0])

export function ContactsApp(props: ContactsAppProps) {
  const [contacts, setContacts] = React.useState(props.contacts)
  const [directory, setDirectory] = React.useState<DirectoryEntry[]>([])
  const [hasMore, setHasMore] = React.useState(props.hasMore)
  const [groups, setGroups] = React.useState(props.groups)
  const [view, setView] = React.useState<View>("all")
  const [groupId, setGroupId] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  /** A contact id, "new", or "dir:<mailbox id>". */
  const [selectedId, setSelectedId] = React.useState<string | null>(props.selectedId)
  const [loading, setLoading] = React.useState(false)
  const [groupDialog, setGroupDialog] = React.useState<boolean | ContactGroup>(false)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const mounted = useMounted()
  const { ref: frameRef, desktop } = useAppLayout()
  const userView = !!props.account

  const listUrl = React.useCallback(
    (offset = 0) => {
      const p = new URLSearchParams({ view, limit: String(PAGE), offset: String(offset) })
      if (groupId) p.set("groupId", groupId)
      if (query.trim()) p.set("q", query.trim())
      return `/api/app/contacts?${p}`
    },
    [view, groupId, query],
  )

  const refresh = React.useCallback(async () => {
    try {
      const res = await api<{ contacts: Contact[]; directory: DirectoryEntry[]; hasMore: boolean }>("GET", listUrl())
      setContacts(res.contacts)
      setDirectory(res.directory)
      setHasMore(res.hasMore)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [listUrl])

  const refreshGroups = React.useCallback(async () => {
    try {
      setGroups((await api<{ groups: ContactGroup[] }>("GET", "/api/app/contacts/groups")).groups)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [])

  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setLoading(true)
    const timer = setTimeout(() => void refresh().finally(() => setLoading(false)), query ? 250 : 0)
    return () => clearTimeout(timer)
  }, [refresh, query])

  async function loadMore() {
    const res = await api<{ contacts: Contact[]; hasMore: boolean }>("GET", listUrl(contacts.length))
    setContacts((list) => [...list, ...res.contacts])
    setHasMore(res.hasMore)
  }

  const open = React.useCallback((id: string | null) => {
    setSelectedId(id)
    const url = new URL(location.href)
    url.pathname = id && /^[0-9a-f-]{36}$/.test(id) ? `/app/contacts/${id}` : "/app/contacts"
    pushUrl(url)
  }, [])

  React.useEffect(() => {
    const onPop = () => setSelectedId(/^\/app\/contacts\/([0-9a-f-]{36})/.exec(location.pathname)?.[1] ?? null)
    window.addEventListener(PANEL_NAVIGATION, onPop)
    return () => window.removeEventListener(PANEL_NAVIGATION, onPop)
  }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutsPaused(e)) return
      if (e.key === "c") {
        e.preventDefault()
        open("new")
      } else if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === "Escape" && selectedId) open(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, selectedId])

  function pickView(v: View) {
    setView(v)
    setGroupId(null)
  }

  const onSaved = (c: Contact, created: boolean) => {
    setContacts((list) => (created ? [c, ...list] : list.map((x) => (x.id === c.id ? c : x))))
    if (created) open(c.id)
    void refreshGroups()
  }

  async function patch(c: Contact, body: Partial<Contact>) {
    try {
      onSaved(await api<Contact>("PATCH", `/api/app/contacts/${c.id}`, body), false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function remove(c: Contact) {
    try {
      await api("DELETE", `/api/app/contacts/${c.id}`)
      foldAway([c.id], () => setContacts((list) => list.filter((x) => x.id !== c.id)))
      if (selectedId === c.id) open(null)
      void refreshGroups()
      toast.success(t("Contact deleted"))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("Copied"))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function importFile(file: File) {
    if (file.size > IMPORT_MAX_BYTES) return void toast.error(t("The file is too big (2 MB at most)."))
    const rows = parseContactsFile(await file.text())
    if (!rows.length) return void toast.error(t("No contacts found in that file. Use a CSV or vCard (.vcf) export."))
    const id = toast.loading(t("Importing {count} contacts…", { count: rows.length }))
    const total = { created: 0, updated: 0, skipped: 0 }
    try {
      for (let i = 0; i < rows.length; i += 200) {
        const r = await api<typeof total>("POST", "/api/app/contacts/import", { contacts: rows.slice(i, i + 200) })
        total.created += r.created
        total.updated += r.updated
        total.skipped += r.skipped
      }
      toast.success(t("Imported: {created} new, {updated} updated.", total), { id })
    } catch (e) {
      toast.error((e as Error).message, { id })
    }
    await Promise.all([refresh(), refreshGroups()])
  }

  async function saveGroup(groupName: string) {
    try {
      if (typeof groupDialog === "object") await api("PATCH", `/api/app/contacts/groups/${groupDialog.id}`, { name: groupName })
      else await api("POST", "/api/app/contacts/groups", { name: groupName })
      await refreshGroups()
      setGroupDialog(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function removeGroup(g: ContactGroup) {
    try {
      await api("DELETE", `/api/app/contacts/groups/${g.id}`)
      if (groupId === g.id) setGroupId(null)
      setGroups((list) => list.filter((x) => x.id !== g.id))
      setContacts((list) => list.map((c) => ({ ...c, groupIds: c.groupIds.filter((x) => x !== g.id) })))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const contactActions = (c: Contact, where: "list" | "detail"): MenuAction[] =>
    cleanActions([
      where === "list" && { label: t("Open"), icon: BookUser, onSelect: () => open(c.id) },
      c.emails[0] && { label: t("Write e-mail"), icon: Mail, onSelect: () => void (navigatePanel(compose(c.emails[0]!.value))) },
      c.emails[0] && { label: t("Copy e-mail"), icon: Copy, onSelect: () => copy(c.emails[0]!.value) },
      groups.length > 0 && {
        label: t("Groups"),
        icon: Tag,
        items: groups.map((g) => {
          const on = c.groupIds.includes(g.id)
          return { label: on ? `✓ ${g.name}` : g.name, onSelect: () => patch(c, { groupIds: on ? c.groupIds.filter((x) => x !== g.id) : [...c.groupIds, g.id] }) }
        }),
      },
      { separator: true },
      {
        label: t("Delete"),
        icon: Trash2,
        destructive: true,
        confirm: { title: t("Delete {name}?", { name: name(c) }), description: t("It's removed from the address book for everyone in the organization."), confirmLabel: t("Delete") },
        onSelect: () => remove(c),
      },
    ])

  const groupActions = (g: ContactGroup): MenuAction[] => [
    { label: t("Open"), icon: Users, onSelect: () => (setGroupId(g.id), setView("all")) },
    { label: t("Rename…"), icon: Pencil, onSelect: () => setGroupDialog(g) },
    { separator: true },
    {
      label: t("Delete group"),
      icon: Trash2,
      destructive: true,
      confirm: { title: t("Delete the group \"{name}\"?", { name: g.name }), description: t("Its contacts stay in the address book."), confirmLabel: t("Delete group") },
      onSelect: () => removeGroup(g),
    },
  ]

  const listActions: MenuAction[] = [
    { label: t("Import CSV or vCard…"), icon: Upload, onSelect: () => fileRef.current?.click() },
    { label: t("Export as vCard"), icon: Download, onSelect: () => void (location.href = "/api/app/contacts/export?format=vcf") },
    { label: t("Export as CSV"), icon: Download, onSelect: () => void (location.href = "/api/app/contacts/export?format=csv") },
  ]

  const group = groups.find((g) => g.id === groupId)
  // A, B, C… headers in the alphabetical list (the server sorts by name, or the address when there's none).
  const letters = view === "all" && !query.trim()
  const title = query ? t("Search") : group ? group.name : t(VIEWS.find((v) => v.value === view)!.label)

  const rail = (
    <Rail
      label={t("Contacts")}
      hint={
        <>
          <Kbd>C</Kbd> {t("New contact")} <Kbd>/</Kbd> {t("Search")}
        </>
      }
      footer={props.account ? <AccountMenu user={props.account} canManage={props.canManage} /> : undefined}
    >
      <RailAction icon={UserPlus} label={t("New contact")} shortcut="C" onClick={() => open("new")} />
      <RailList>
        {VIEWS.map(({ value, label, icon }) => (
          <RailItem key={value} icon={icon} label={t(label)} active={view === value && !groupId} onClick={() => pickView(value)} />
        ))}
      </RailList>
      <RailSection
        title={t("Groups")}
        action={
          <RailSectionButton label={t("New group")} onClick={() => setGroupDialog(true)}>
            <Plus />
          </RailSectionButton>
        }
      >
        {groups.length ? (
          <RailList>
            {groups.map((g) => (
              <RailItem
                key={g.id}
                icon={Tag}
                label={g.name}
                title={g.name}
                count={g.count || undefined}
                active={groupId === g.id}
                onClick={() => (setGroupId(g.id), setView("all"))}
                actions={() => groupActions(g)}
              />
            ))}
          </RailList>
        ) : (
          <p className="text-muted-foreground px-2 text-xs">{t("No groups yet.")}</p>
        )}
      </RailSection>
    </Rail>
  )

  const list = (
    <ListPane label={t("Contacts")}>
      <ListHeader
        title={title}
        loading={loading}
        actions={
          <>
            {desktop ? null : (
              <>
                <Select
                  value={groupId ? `g:${groupId}` : view}
                  onValueChange={(v) => (v.startsWith("g:") ? (setGroupId(v.slice(2)), setView("all")) : pickView(v as View))}
                >
                  <SelectTrigger size="sm" className="max-w-36" aria-label={t("Contacts views")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIEWS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {t(v.label)}
                      </SelectItem>
                    ))}
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={`g:${g.id}`}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="rounded-full" onClick={() => open("new")}>
                  <UserPlus /> {t("New")}
                </Button>
              </>
            )}
            <ActionMenuButton actions={listActions} label={t("Import and export")} />
            {!desktop && props.account ? <AccountMenu user={props.account} canManage={props.canManage} compact /> : null}
          </>
        }
      >
        <ListSearch ref={searchRef} value={query} onChange={setQuery} placeholder={t("Search contacts")} />
      </ListHeader>
      <ListBody dimmed={loading}>
        {group && contacts.some((c) => c.emails.length) ? (
          <li className="mx-2 mb-1">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <a href={compose(contacts.flatMap((c) => c.emails.slice(0, 1).map((e) => e.value)).join(","))}>
                <Mail /> {t("Write to everyone in {name}", { name: group.name })}
              </a>
            </Button>
          </li>
        ) : null}
        {contacts.map((c, i) => (
          <React.Fragment key={c.id}>
          {letters && letterOf(c) !== (i ? letterOf(contacts[i - 1]!) : "") ? (
            <li className="text-muted-foreground px-5 pt-3 pb-1 text-[11px] font-semibold tracking-wide" aria-hidden>
              {letterOf(c)}
            </li>
          ) : null}
          <ListRow
            rowId={c.id}
            color={color(c)}
            selected={selectedId === c.id}
            title={
              <span className="flex items-center gap-2">
                <UserAvatar seed={c.emails[0]?.value ?? c.id} size={18} />
                <span className="truncate">{name(c)}</span>
              </span>
            }
            time={c.company || (view === "recent" && mounted && c.lastContactedAt ? shortDate(c.lastContactedAt) : undefined)}
            snippet={c.emails[0]?.value ?? c.phones[0]?.value ?? ""}
            onClick={() => open(c.id)}
            actions={() => contactActions(c, "list")}
            menuLabel={t("Contact actions")}
          />
          </React.Fragment>
        ))}
        {directory.length && view !== "directory" ? <li className="text-muted-foreground px-5 pt-3 pb-1 text-xs font-medium">{t("Directory")}</li> : null}
        {directory.map((d) => (
          <ListRow
            key={d.id}
            color={WORKSPACE_COLORS[1]}
            selected={selectedId === `dir:${d.id}`}
            title={
              <span className="flex items-center gap-2">
                <UserAvatar seed={d.email} size={18} />
                <span className="truncate">{d.name || d.email.split("@")[0]}</span>
              </span>
            }
            time={d.kind === "shared" ? t("Shared mailbox") : undefined}
            snippet={d.email}
            onClick={() => open(`dir:${d.id}`)}
            actions={[
              { label: t("Write e-mail"), icon: Mail, onSelect: () => void (navigatePanel(compose(d.email))) },
              { label: t("Copy e-mail"), icon: Copy, onSelect: () => copy(d.email) },
            ]}
          />
        ))}
        {contacts.length === 0 && directory.length === 0 && !loading ? (
          <ListEmpty
            icon={query ? <SearchX /> : <BookUser />}
            title={query ? t("Nothing matches that search") : view === "recent" ? t("Nobody e-mailed yet") : t("No contacts here yet")}
            description={
              !query && view === "all" && !groupId ? t("People you write to are added here automatically. You can also import a CSV or vCard file.") : undefined
            }
            action={
              !query && view === "all" ? (
                <Button size="sm" variant="outline" onClick={() => open("new")}>
                  <Plus /> {t("New contact")}
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {hasMore ? (
          <li className="p-3 text-center">
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading}>
              {t("Load more")}
            </Button>
          </li>
        ) : null}
      </ListBody>
    </ListPane>
  )

  const dir = selectedId?.startsWith("dir:") ? directory.find((d) => `dir:${d.id}` === selectedId) : undefined
  const detail =
    selectedId === "new" ? (
      <ContactForm key="new" groups={groups} onBack={() => open(null)} onSaved={(c) => onSaved(c, true)} />
    ) : dir ? (
      <DirectoryPane entry={dir} onBack={() => open(null)} />
    ) : selectedId && !selectedId.startsWith("dir:") ? (
      <ContactPane key={selectedId} id={selectedId} initial={contacts.find((c) => c.id === selectedId)} groups={groups} actions={(c) => contactActions(c, "detail")} onBack={() => open(null)} onSaved={(c) => onSaved(c, false)} />
    ) : (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          variant="plain"
          icon={<BookUser />}
          title={t("No contact open")}
          description={
            <>
              {t("Pick one on the left, or press")} <kbd className="bg-muted rounded px-1 font-mono text-xs">C</kbd> {t("for a new contact.")}
            </>
          }
        />
      </div>
    )

  return (
    <AppFrame ref={frameRef} userView={userView}>
      {desktop ? rail : null}
      <SplitView list={list} detail={detail} showDetail={!!selectedId} />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.vcf,.vcard,text/csv,text/vcard"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) void importFile(file)
        }}
      />
      <GroupDialog group={typeof groupDialog === "object" ? groupDialog : null} open={!!groupDialog} onOpenChange={(o) => !o && setGroupDialog(false)} onSave={saveGroup} />
    </AppFrame>
  )
}

const SOURCE: Record<Contact["source"], string> = { manual: "Added by hand", import: "Imported", sent: "Added from sent mail" }
const labelText = (label: string | undefined, fallback: string) => {
  const s = t(label || fallback)
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t("Copied"))
  } catch (e) {
    toast.error((e as Error).message)
  }
}

/** Avatar (overlapping the pixel banner), name and what they do. */
function Hero({ seed, title, subtitle, children }: { seed: string; title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="relative">
      <div className="relative flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:gap-5 sm:text-left">
        {/* Overlaps the pixel banner above. */}
        <span className="bg-background -mt-12 flex shrink-0 rounded-full p-1 shadow-sm ring-1 ring-black/5 md:-mt-14 dark:ring-white/10">
          <UserAvatar seed={seed} size={84} />
        </span>
        <div className="grid min-w-0 gap-1.5 sm:pt-3">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-sm sm:justify-start">{subtitle}</p> : null}
          {children}
        </div>
      </div>
    </section>
  )
}

function QuickAction({ icon: Icon, label, href, onClick }: { icon: typeof Mail; label: string; href?: string; onClick?: () => void }) {
  const className = "hover:bg-foreground/[0.035] focus-visible:ring-ring/50 flex flex-col items-center gap-1.5 bg-background/60 min-w-0 flex-1 rounded-xl border px-3 py-3 text-xs font-medium outline-none focus-visible:ring-[3px] sm:max-w-28"
  const body = (
    <>
      <span className="flex size-8 items-center justify-center rounded-full" style={{ background: tint(WORKSPACE_COLORS[0], 14), color: WORKSPACE_COLORS[0] }}>
        <Icon className="size-4" />
      </span>
      {label}
    </>
  )
  return href ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  )
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      <header className="flex items-center gap-2 px-4 pt-3 pb-1">
        <h2 className="text-muted-foreground text-xs font-medium">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </header>
      {children}
    </section>
  )
}

function DetailRow({ icon: Icon, value, label, href }: { icon: typeof Mail; value: string; label: string; href: string }) {
  return (
    <li className="group/row flex items-center gap-3 px-4 py-2.5">
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1">
        <a href={href} className="truncate text-sm font-medium hover:underline">
          {value}
        </a>
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
      <button
        type="button"
        onClick={() => copyText(value)}
        aria-label={t("Copy")}
        title={t("Copy")}
        className="text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] rounded-md p-1.5 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
      >
        <Copy className="size-3.5" />
      </button>
    </li>
  )
}

type ContactThread = { id: string; subject: string; mailbox: string; unread: boolean; lastMessageAt: string }

function Conversations({ id, email }: { id: string; email?: string }) {
  const [threads, setThreads] = React.useState<ContactThread[] | null>(null)
  const mounted = useMounted()
  React.useEffect(() => {
    api<{ threads: ContactThread[] }>("GET", `/api/app/contacts/${id}/threads`)
      .then((r) => setThreads(r.threads))
      .catch(() => setThreads([]))
  }, [id])
  return (
    <Card
      title={t("Conversations")}
      action={
        email ? (
          <a href={compose(email)} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
            <PenSquare className="size-3" /> {t("New e-mail")}
          </a>
        ) : undefined
      }
    >
      {threads === null ? (
        <div className="grid gap-2 px-4 py-3">
          <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
          <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
        </div>
      ) : threads.length ? (
        <ul className="grid gap-px px-2 pb-2">
          {threads.map((th) => (
            <li key={th.id}>
              <a href={`/app/mail?t=${th.id}`} className="hover:bg-foreground/[0.035] relative grid gap-0.5 rounded-md py-2 pr-2 pl-5">
                <span className="absolute top-2.5 bottom-2.5 left-2 w-[3px] rounded-full" style={{ background: mailboxColor(th.mailbox) }} aria-hidden />
                <span className="flex items-center gap-2">
                  <span className={th.unread ? "truncate text-sm font-semibold" : "truncate text-sm"}>{th.subject || t("(no subject)")}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-[11px] tabular-nums" suppressHydrationWarning>
                    {mounted ? shortDate(th.lastMessageAt) : null}
                  </span>
                </span>
                <span className="text-muted-foreground flex items-center gap-1 truncate text-xs">
                  <AtSign className="size-3 shrink-0" />
                  {th.mailbox}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground px-4 pt-1 pb-4 text-sm">{t("No conversations in your mailboxes yet.")}</p>
      )}
    </Card>
  )
}

function ContactPane({
  id,
  initial,
  groups,
  actions,
  onBack,
  onSaved,
}: {
  id: string
  initial?: Contact
  groups: ContactGroup[]
  actions: (c: Contact) => MenuAction[]
  onBack: () => void
  onSaved: (c: Contact) => void
}) {
  const [contact, setContact] = React.useState<Contact | null>(initial ?? null)
  const [editing, setEditing] = React.useState(false)
  React.useEffect(() => {
    if (initial) setContact(initial)
  }, [initial])
  React.useEffect(() => {
    if (initial) return
    api<Contact>("GET", `/api/app/contacts/${id}`)
      .then(setContact)
      .catch((e: Error) => toast.error(e.message))
  }, [id, initial])

  if (!contact) return <div className="text-muted-foreground grid h-full place-items-center text-sm">{t("Loading…")}</div>
  if (editing)
    return (
      <ContactForm
        contact={contact}
        groups={groups}
        onBack={() => setEditing(false)}
        onSaved={(c) => {
          setContact(c)
          setEditing(false)
          onSaved(c)
        }}
      />
    )
  const email = contact.emails[0]?.value
  const phone = contact.phones[0]?.value
  const inGroups = groups.filter((g) => contact.groupIds.includes(g.id))
  const role = [contact.title, contact.company].filter(Boolean).join(" · ")
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader onBack={onBack}>
        <div className="ml-auto flex items-center gap-1">
          <IconAction label={t("Edit")} onClick={() => setEditing(true)}>
            <Pencil />
          </IconAction>
          <ActionMenuButton actions={actions(contact)} label={t("Contact actions")} />
        </div>
      </DetailHeader>
      <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <PixelBanner email={email ?? contact.name ?? contact.id} />
        <div className="relative mx-auto grid max-w-2xl gap-5 px-4 pb-10 md:px-8 md:pb-12">
          <Hero
            seed={email ?? contact.id}
            title={name(contact)}
            subtitle={
              role ? (
                <>
                  {contact.company ? <Building2 className="size-3.5 shrink-0" /> : null}
                  <span className="truncate">{role}</span>
                </>
              ) : undefined
            }
          >
            {inGroups.length ? (
              <span className="flex flex-wrap justify-center gap-1 pt-0.5 sm:justify-start">
                {inGroups.map((g) => (
                  <span key={g.id} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                    <Tag className="text-muted-foreground size-3" /> {g.name}
                  </span>
                ))}
              </span>
            ) : null}
          </Hero>

          <div className="relative flex gap-2">
            {email ? <QuickAction icon={Mail} label={t("E-mail")} href={compose(email)} /> : null}
            {phone ? <QuickAction icon={Phone} label={t("Call")} href={telHref(phone)} /> : null}
            {email ? <QuickAction icon={Copy} label={t("Copy e-mail")} onClick={() => copyText(email)} /> : null}
          </div>

          {contact.emails.length || contact.phones.length ? (
            <Card title={t("Contact details")}>
              <ul className="divide-y">
                {contact.emails.map((e) => (
                  <DetailRow key={e.value} icon={Mail} value={e.value} label={labelText(e.label, "e-mail")} href={compose(e.value)} />
                ))}
                {contact.phones.map((p) => (
                  <DetailRow key={p.value} icon={Phone} value={p.value} label={labelText(p.label, "phone")} href={telHref(p.value)} />
                ))}
              </ul>
            </Card>
          ) : null}

          {contact.note ? (
            <Card title={t("Note")}>
              <p className="text-foreground/85 px-4 pt-1 pb-4 text-sm leading-6 whitespace-pre-wrap">{contact.note}</p>
            </Card>
          ) : null}

          {email ? <Conversations id={contact.id} email={email} /> : null}

          <p className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs sm:justify-start">
            <span>{t(SOURCE[contact.source])}</span>
            {contact.contactCount ? (
              <>
                <span aria-hidden>·</span>
                <span>{tp(contact.contactCount, { one: "E-mailed once", other: "E-mailed {count} times" })}</span>
              </>
            ) : null}
            {contact.lastContactedAt ? (
              <>
                <span aria-hidden>·</span>
                <span suppressHydrationWarning>{t("last on {date}", { date: new Date(contact.lastContactedAt).toLocaleDateString() })}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  )
}

function DirectoryPane({ entry, onBack }: { entry: DirectoryEntry; onBack: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader onBack={onBack}>
        <span className="text-muted-foreground px-2 text-xs">{t("Directory")}</span>
      </DetailHeader>
      <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <PixelBanner email={entry.email} />
        <div className="relative mx-auto grid max-w-2xl gap-5 px-4 pb-10 md:px-8 md:pb-12">
          <Hero
            seed={entry.email}
            title={entry.name || entry.email.split("@")[0]!}
            subtitle={
              <>
                {entry.kind === "shared" ? <Users className="size-3.5 shrink-0" /> : <Building2 className="size-3.5 shrink-0" />}
                {entry.kind === "shared" ? t("Shared mailbox in your organization") : t("Person in your organization")}
              </>
            }
          />
          <div className="relative flex gap-2">
            <QuickAction icon={Mail} label={t("E-mail")} href={compose(entry.email)} />
            <QuickAction icon={Copy} label={t("Copy e-mail")} onClick={() => copyText(entry.email)} />
          </div>
          <Card title={t("Contact details")}>
            <ul>
              <DetailRow icon={Mail} value={entry.email} label={entry.kind === "shared" ? t("Shared mailbox") : t("Work")} href={compose(entry.email)} />
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ValueRows({ label, kind, values, onChange, placeholder }: { label: string; kind: "email" | "tel"; values: Value[]; onChange: (v: Value[]) => void; placeholder: string }) {
  const rows = values.length ? values : [{ value: "" }]
  const set = (i: number, v: Partial<Value>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...v } : r)))
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input type={kind} value={r.value} placeholder={placeholder} aria-label={label} onChange={(e) => set(i, { value: e.target.value })} className="flex-1" />
          <Select value={r.label ?? "none"} onValueChange={(v) => set(i, { label: v === "none" ? undefined : v })}>
            <SelectTrigger className="w-28" aria-label={t("Label")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("No label")}</SelectItem>
              {[...new Set([...LABELS, ...(r.label ? [r.label] : [])])].map((l) => (
                <SelectItem key={l} value={l}>
                  {t(l)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="ghost" size="icon" aria-label={t("Remove")} onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length === 1 && !r.value}>
            <Trash2 />
          </Button>
        </div>
      ))}
      {rows.length < 10 ? (
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => onChange([...rows, { value: "" }])}>
          <Plus /> {t("Add another")}
        </Button>
      ) : null}
    </div>
  )
}

function ContactForm({ contact, groups, onBack, onSaved }: { contact?: Contact; groups: ContactGroup[]; onBack: () => void; onSaved: (c: Contact) => void }) {
  const [form, setForm] = React.useState({
    name: contact?.name ?? "",
    company: contact?.company ?? "",
    title: contact?.title ?? "",
    note: contact?.note ?? "",
    emails: contact?.emails ?? [],
    phones: contact?.phones ?? [],
    groupIds: contact?.groupIds ?? [],
  })
  const [saving, setSaving] = React.useState(false)
  const set = (v: Partial<typeof form>) => setForm((f) => ({ ...f, ...v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body = { ...form, emails: form.emails.filter((x) => x.value.trim()), phones: form.phones.filter((x) => x.value.trim()) }
    try {
      onSaved(await api<Contact>(contact ? "PATCH" : "POST", contact ? `/api/app/contacts/${contact.id}` : "/api/app/contacts", body))
      toast.success(contact ? t("Contact saved") : t("Contact added"))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="flex h-full min-h-0 flex-col">
      <DetailHeader onBack={onBack} backLabel={t("Cancel")}>
        <span className="px-2 text-sm font-medium">{contact ? t("Edit contact") : t("New contact")}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="max-md:hidden">
            {t("Cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {t("Save")}
          </Button>
        </div>
      </DetailHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-xl gap-5 px-6 py-6">
          <div className="grid gap-2">
            <Label htmlFor="contact-name">{t("Name")}</Label>
            <Input id="contact-name" value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="contact-company">{t("Company")}</Label>
              <Input id="contact-company" value={form.company} onChange={(e) => set({ company: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-title">{t("Job title")}</Label>
              <Input id="contact-title" value={form.title} onChange={(e) => set({ title: e.target.value })} />
            </div>
          </div>
          <ValueRows label={t("E-mail")} kind="email" values={form.emails} onChange={(emails) => set({ emails })} placeholder="name@company.com" />
          <ValueRows label={t("Phone")} kind="tel" values={form.phones} onChange={(phones) => set({ phones })} placeholder="+48 600 000 000" />
          {groups.length ? (
            <div className="grid gap-2">
              <Label>{t("Groups")}</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {groups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.groupIds.includes(g.id)}
                      onCheckedChange={(on) => set({ groupIds: on ? [...form.groupIds, g.id] : form.groupIds.filter((x) => x !== g.id) })}
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="contact-note">{t("Note")}</Label>
            <Textarea id="contact-note" value={form.note} onChange={(e) => set({ note: e.target.value })} rows={4} />
          </div>
        </div>
      </div>
    </form>
  )
}

function GroupDialog({ group, open, onOpenChange, onSave }: { group: ContactGroup | null; open: boolean; onOpenChange: (o: boolean) => void; onSave: (name: string) => Promise<void> }) {
  const [value, setValue] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    if (open) setValue(group?.name ?? "")
  }, [open, group])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!value.trim()) return
            setSaving(true)
            await onSave(value.trim())
            setSaving(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{group ? t("Rename group") : t("New group")}</DialogTitle>
          </DialogHeader>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t("e.g. Clients")} aria-label={t("Group name")} autoFocus maxLength={80} />
          <DialogFooter>
            <Button type="submit" disabled={saving || !value.trim()}>
              {group ? t("Save") : t("Create group")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
