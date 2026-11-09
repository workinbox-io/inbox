import * as React from "react"
import { ApiKeyMailAccess } from "./api-key-mail-access"
import { KeyRound, Plus } from "lucide-react"
import { toast } from "sonner"

import type { ApiKeyRow } from "@/lib/server/api-keys"
import { api } from "@/lib/api-client"
import { siteConfig } from "@/config/site"
import { useLiveData } from "@/lib/use-live-data"
import { timeAgo } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmButton } from "@/components/app/confirm-button"
import { CopyField } from "@/components/app/copy-field"
import { SettingsSection } from "@/components/app/settings-section"

type KeyRole = "admin" | "member"

const ROLE_HINT: Record<KeyRole, string> = {
  member: "Everything a team member can do.",
  admin: "Everything a member key can, plus what only owners and admins can do.",
}

export function ApiKeysPanel(props: { keys: ApiKeyRow[] }) {
  const [keys, refresh] = useLiveData("/api/app/api-keys", props.keys, (json) => (json as { keys: ApiKeyRow[] }).keys)
  const [creating, setCreating] = React.useState(false)
  const [created, setCreated] = React.useState<{ name: string; key: string } | null>(null)

  return (
    <SettingsSection
      title="API keys"
      description={
        <>
          Automate {siteConfig.name} from scripts and CI. Keys belong to the organization and keep working when people leave.{" "}
          <a className="hover:text-foreground underline underline-offset-2" href="/docs/api">
            API docs
          </a>
        </>
      }
    >
      <div className="grid gap-3">
        {keys.length ? (
          <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="text-muted-foreground size-3.5" />
                    {k.name}
                    <span className="text-muted-foreground bg-background rounded-full px-2 py-0.5 text-[10px] font-normal capitalize">{k.role}</span>
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    <span className="font-mono">{k.prefix}…</span> · created {timeAgo(k.createdAt)}
                    {k.createdBy ? ` by ${k.createdBy}` : ""} · {k.lastUsedAt ? `last used ${timeAgo(k.lastUsedAt)}` : "never used"}
                  </span>
                </div>
                <ApiKeyMailAccess id={k.id} />
                <ConfirmButton
                  title={`Revoke ${k.name}?`}
                  description="Requests with this key fail right away. This can't be undone."
                  confirmLabel="Revoke key"
                  onConfirm={async () => {
                    await api("DELETE", `/api/app/api-keys/${k.id}`)
                    await refresh()
                  }}
                >
                  <Button size="sm" variant="ghost" className="text-destructive">
                    Revoke
                  </Button>
                </ConfirmButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No API keys yet.</p>
        )}
        <div>
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus />
            Create API key
          </Button>
        </div>
      </div>

      {creating ? (
        <CreateKeyDialog
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false)
            setCreated(c)
            void refresh()
          }}
        />
      ) : null}

      {created ? (
        <Dialog open onOpenChange={(open) => !open && setCreated(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{created.name} is ready</DialogTitle>
              <DialogDescription>Copy the key now. It won't be shown again.</DialogDescription>
            </DialogHeader>
            <CopyField label="API key" value={created.key} secret />
            <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">
              {`curl ${window.location.origin}/api/v1/projects \\\n  -H "Authorization: Bearer ${created.key.slice(0, 10)}…"`}
            </pre>
          </DialogContent>
        </Dialog>
      ) : null}
    </SettingsSection>
  )
}

function CreateKeyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: { name: string; key: string }) => void }) {
  const [name, setName] = React.useState("")
  const [role, setRole] = React.useState<KeyRole>("member")
  const [pending, setPending] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const { key } = await api<{ key: string }>("POST", "/api/app/api-keys", { name, role })
      toast.success("API key created")
      onCreated({ name, key })
    } catch (err) {
      toast.error((err as Error).message)
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>Name it after where it's used, so you know what breaks when you revoke it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="key-name">Name</Label>
            <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GitHub Actions" maxLength={64} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="key-role">Access</Label>
            <Select value={role} onValueChange={(v) => setRole(v as KeyRole)}>
              <SelectTrigger id="key-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{ROLE_HINT[role]}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={pending} type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
