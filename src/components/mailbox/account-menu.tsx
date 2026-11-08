import * as React from "react"
import { ChevronsUpDown, KeyRound, LogOut, Monitor, Moon, PenLine, Sun } from "lucide-react"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UserAvatar } from "@/components/app/user-avatar"

export interface MailUser {
  name: string
  email: string
}

/**
 * The account corner of the mail-only view (members): signature, password, theme, sign out.
 * `compact` is the avatar alone, for the phone layout's list header.
 */
export function AccountMenu({ user, onSignature, compact = false }: { user: MailUser; onSignature?: () => void; compact?: boolean }) {
  const [passwordOpen, setPasswordOpen] = React.useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {compact ? (
            <button type="button" className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]" aria-label="Account">
              <UserAvatar seed={user.email} size={28} />
            </button>
          ) : (
            <button
              type="button"
              className="hover:bg-foreground/[0.035] focus-visible:ring-ring/50 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-[3px]"
            >
              <UserAvatar seed={user.email} size={26} />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[13px] font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-[11px]">{user.email}</span>
              </span>
              <ChevronsUpDown className="text-muted-foreground size-3.5" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-56">
          <DropdownMenuLabel className="grid font-normal">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="text-muted-foreground truncate text-xs">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {onSignature ? (
            <DropdownMenuItem onSelect={onSignature}>
              <PenLine /> Signature
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <KeyRound /> Change password
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => {
            e.preventDefault()
            window.setThemeMode(window.nextThemeMode())
          }}>
            <Monitor className="hidden in-data-[theme-mode=system]:block" />
            <Sun className="hidden in-data-[theme-mode=light]:block" />
            <Moon className="hidden in-data-[theme-mode=dark]:block" />
            Theme
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await authClient.signOut()
              location.href = "/login"
            }}
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  )
}

function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [signOutOthers, setSignOutOthers] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!open) return
    setCurrent("")
    setNext("")
    setError(null)
  }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Got a temporary one from your admin? Pick your own here. At least 10 characters.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setPending(true)
            setError(null)
            const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: signOutOthers })
            setPending(false)
            if (error) return setError(error.message ?? "Couldn't change the password")
            toast.success("Password changed")
            onOpenChange(false)
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="pw-current">Current password</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pw-next">New password</Label>
            <Input id="pw-next" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={signOutOthers} onCheckedChange={(v) => setSignOutOthers(v === true)} />
            Sign out on other devices
          </label>
          {error ? <p className={cn("text-destructive text-sm")}>{error}</p> : null}
          <DialogFooter>
            <Button type="submit" loading={pending} disabled={pending || !current || next.length < 10}>
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
