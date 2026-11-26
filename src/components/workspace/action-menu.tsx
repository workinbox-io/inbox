/**
 * A row's actions, defined once and shown two ways: the right-click menu (long press on touch) and the "…" button that
 * appears on hover. Mail threads, notes, rail items and messages all use it.
 */
import * as React from "react"
import { MoreHorizontal, type LucideIcon } from "lucide-react"
import { ConfirmDialog } from "@/components/app/confirm-button"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface MenuConfirm {
  title: string
  description: React.ReactNode
  confirmLabel?: string
}

export type MenuAction =
  | {
      label: string
      icon?: LucideIcon
      /** The keyboard shortcut that does the same, shown on the right. */
      shortcut?: string
      destructive?: boolean
      disabled?: boolean
      /** Ask first (deleting for good…). */
      confirm?: MenuConfirm
      onSelect: () => void | Promise<void>
    }
  | { separator: true }
  | { heading: string }
  | { label: string; icon?: LucideIcon; items: MenuAction[] }

/** Drops leading, trailing and doubled separators left by hidden actions. */
export function cleanActions(actions: (MenuAction | false | null | undefined)[]): MenuAction[] {
  const out: MenuAction[] = []
  for (const a of actions) {
    if (!a) continue
    if ("separator" in a && (!out.length || "separator" in out[out.length - 1]!)) continue
    out.push(a)
  }
  while (out.length && "separator" in out[out.length - 1]!) out.pop()
  return out
}

const KITS = {
  context: {
    Item: ContextMenuItem,
    Label: ContextMenuLabel,
    Separator: ContextMenuSeparator,
    Shortcut: ContextMenuShortcut,
    Sub: ContextMenuSub,
    SubContent: ContextMenuSubContent,
    SubTrigger: ContextMenuSubTrigger,
  },
  dropdown: {
    Item: DropdownMenuItem,
    Label: DropdownMenuLabel,
    Separator: DropdownMenuSeparator,
    Shortcut: DropdownMenuShortcut,
    Sub: DropdownMenuSub,
    SubContent: DropdownMenuSubContent,
    SubTrigger: DropdownMenuSubTrigger,
  },
} as const

type Kit = (typeof KITS)[keyof typeof KITS]

function Items({ actions, kit, onConfirm }: { actions: MenuAction[]; kit: Kit; onConfirm: (c: MenuConfirm, run: () => void | Promise<void>) => void }) {
  const { Item, Label, Separator, Shortcut, Sub, SubContent, SubTrigger } = kit
  return (
    <>
      {actions.map((a, i) => {
        if ("separator" in a) return <Separator key={i} />
        if ("heading" in a)
          return (
            <Label key={i} className="text-muted-foreground text-xs font-medium">
              {a.heading}
            </Label>
          )
        const Icon = a.icon
        if ("items" in a)
          return (
            <Sub key={i}>
              <SubTrigger className="gap-2">
                {Icon ? <Icon /> : null}
                {a.label}
              </SubTrigger>
              <SubContent className="max-h-80 min-w-44 overflow-y-auto">
                <Items actions={a.items} kit={kit} onConfirm={onConfirm} />
              </SubContent>
            </Sub>
          )
        return (
          <Item
            key={i}
            variant={a.destructive ? "destructive" : "default"}
            disabled={a.disabled}
            onSelect={() => {
              if (a.confirm) onConfirm(a.confirm, a.onSelect)
              else void a.onSelect()
            }}
          >
            {Icon ? <Icon /> : null}
            <span className="flex-1">{a.label}</span>
            {a.shortcut ? <Shortcut className="font-mono text-[11px] uppercase">{a.shortcut}</Shortcut> : null}
          </Item>
        )
      })}
    </>
  )
}

/** Confirmation for actions with `confirm`, opened after the menu closes. */
function useConfirm() {
  const [pending, setPending] = React.useState<{ confirm: MenuConfirm; run: () => void | Promise<void> } | null>(null)
  const dialog = pending ? (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && setPending(null)}
      title={pending.confirm.title}
      description={pending.confirm.description}
      confirmLabel={pending.confirm.confirmLabel}
      onConfirm={async () => {
        await pending.run()
        setPending(null)
      }}
    />
  ) : null
  return { ask: (confirm: MenuConfirm, run: () => void | Promise<void>) => setPending({ confirm, run }), dialog }
}

/**
 * Right-click (long press on touch) on `children` opens the actions. Without actions it renders `children` alone, so
 * rows can pass `undefined` for viewers with nothing to do.
 */
export function ActionMenu({
  actions,
  children,
  onOpenChange,
}: {
  actions?: MenuAction[] | (() => MenuAction[])
  children: React.ReactElement
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = React.useState(false)
  // A long press opens the menu; the tap the browser sends on release must not also open the row underneath.
  const openedAt = React.useRef(0)
  const touch = React.useRef(false)
  const justOpenedByTouch = () => touch.current && Date.now() - openedAt.current < 1000
  const { ask, dialog } = useConfirm()
  if (!actions) return children
  // Built when the menu opens, so rows don't compute menus they never show.
  const list = open ? (typeof actions === "function" ? actions() : actions) : []
  return (
    <>
      <ContextMenu
        modal={false}
        onOpenChange={(o) => {
          if (o) openedAt.current = Date.now()
          setOpen(o)
          onOpenChange?.(o)
        }}
      >
        <ContextMenuTrigger
          asChild
          onPointerDownCapture={(e) => {
            touch.current = e.pointerType !== "mouse"
          }}
          onClickCapture={(e) => {
            if (justOpenedByTouch()) {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent
          className="min-w-52"
          // Lifting the finger after a long press must not count as tapping outside the menu.
          onPointerDownOutside={(e) => justOpenedByTouch() && e.preventDefault()}
          onFocusOutside={(e) => justOpenedByTouch() && e.preventDefault()}
        >
          {open ? <Items actions={list} kit={KITS.context} onConfirm={ask} /> : null}
        </ContextMenuContent>
      </ContextMenu>
      {dialog}
    </>
  )
}

/** The same actions behind a "…" button (shown on hover by the row, always while open). */
export function ActionMenuButton({
  actions,
  label = "More",
  className,
  size = "icon-xs",
  align = "end",
  onOpenChange,
}: {
  actions: MenuAction[] | (() => MenuAction[])
  label?: string
  className?: string
  size?: "icon-xs" | "icon-sm"
  align?: "start" | "end"
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = React.useState(false)
  const { ask, dialog } = useConfirm()
  const list = open ? (typeof actions === "function" ? actions() : actions) : []
  return (
    <>
      <DropdownMenu
        modal={false}
        onOpenChange={(o) => {
          setOpen(o)
          onOpenChange?.(o)
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={size}
            aria-label={label}
            title={label}
            data-open={open || undefined}
            className={cn("data-[open]:bg-accent data-[open]:opacity-100", className)}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="min-w-52">
          {open ? <Items actions={list} kit={KITS.dropdown} onConfirm={ask} /> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </>
  )
}
