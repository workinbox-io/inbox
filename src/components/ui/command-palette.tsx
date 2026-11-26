"use client"

import * as React from "react"
import { CornerDownLeftIcon, Loader2Icon } from "@/config/icons"

import { cn } from "@/lib/utils"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  CommandFooter,
  CommandKbd,
  CommandShortcutKeys,
} from "@/components/ui/command"
import { t } from "@/lib/i18n/panel"

export interface CommandPaletteItem {
  id: string
  label: string
  description?: string
  icon?: React.ReactNode
  shortcut?: React.ReactNode
  keywords?: string[]
  disabled?: boolean
  /** Shown whatever is typed (an item made from the query, like a quick event). */
  alwaysShow?: boolean
  onSelect?: () => void
}

export interface CommandPaletteGroup {
  heading?: string
  items: CommandPaletteItem[]
}

export interface CommandPaletteProps {
  groups: CommandPaletteGroup[]
  variant?: "dialog" | "inline"
  /** Arrange results as familiar command rows or as an app-launcher grid. */
  layout?: "list" | "grid"
  /** Tighten list rows for dense navigation menus. */
  density?: "compact" | "default"
  size?: "compact" | "default" | "wide"
  open?: boolean
  onOpenChange?: (open: boolean) => void
  placeholder?: string
  emptyLabel?: React.ReactNode
  title?: string
  description?: string
  footer?: React.ReactNode
  className?: string
  onSelect?: (item: CommandPaletteItem) => void
  /** The typed text, for items made from it. */
  onQueryChange?: (query: string) => void
  /** Results for the typed text are still coming: a spinner in place of the search icon, "Searching…" instead of the empty label. */
  loading?: boolean
}

const sizeClasses = {
  compact: "sm:max-w-md",
  default: "sm:max-w-xl",
  wide: "sm:max-w-2xl",
}

/** Let the current workspace app provide its own commands before opening the global menu. */
export function openAppSearch(fallback: () => void) {
  if (window.dispatchEvent(new Event("app:search-commands", { cancelable: true }))) fallback()
}

/** Bind Command/Ctrl+K to a controlled command palette without stealing input shortcuts. */
function useCommandPaletteShortcut(
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>,
  enabled = true
) {
  React.useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) return

      event.preventDefault()
      openAppSearch(() => onOpenChange((open) => !open))
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [enabled, onOpenChange])
}

function CommandPaletteContent({
  groups,
  placeholder,
  emptyLabel,
  footer,
  onSelect,
  layout,
  density,
  onQueryChange,
  loading,
}: Pick<
  CommandPaletteProps,
  | "loading"
  | "onQueryChange"
  | "groups"
  | "placeholder"
  | "emptyLabel"
  | "footer"
  | "onSelect"
  | "layout"
  | "density"
>) {
  return (
    <>
      <CommandInput placeholder={placeholder} onValueChange={onQueryChange} loading={loading} />
      <CommandList aria-busy={loading || undefined} className="max-h-[min(420px,60vh)] scroll-py-2">
        {groups.some((g) => g.items.some((i) => i.alwaysShow)) ? null : (
          <CommandEmpty className="text-muted-foreground px-6 py-12 text-center text-sm">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2Icon className="size-4 animate-spin" />
                {t("Searching…")}
              </span>
            ) : emptyLabel}
          </CommandEmpty>
        )}
        {groups.map((group, groupIndex) => (
          <React.Fragment key={group.heading ?? groupIndex}>
            {groupIndex > 0 ? <CommandSeparator /> : null}
            <CommandGroup
              heading={group.heading}
              forceMount={group.items.some((i) => i.alwaysShow) || undefined}
              className={cn(
                layout === "grid" &&
                  "p-2 [&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-2 [&_[cmdk-group-items]]:gap-2 sm:[&_[cmdk-group-items]]:grid-cols-3"
              )}
            >
              {group.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={[item.label, item.description, ...(item.keywords ?? [])].filter(Boolean).join(" ")}
                  disabled={item.disabled}
                  forceMount={item.alwaysShow}
                  onSelect={() => {
                    item.onSelect?.()
                    onSelect?.(item)
                  }}
                  className={cn(
                    "group/item gap-3",
                    density === "compact" ? "py-1.5" : "py-2.5",
                    layout === "grid" &&
                      "h-auto min-h-28 flex-col items-start justify-between gap-4 rounded-lg border bg-card p-3 data-[selected=true]:border-ring data-[selected=true]:bg-accent"
                  )}
                >
                  {item.icon ? (
                    <span
                      className={cn(
                        "bg-muted group-data-[selected=true]/item:bg-background flex shrink-0 items-center justify-center rounded-md border [&>svg]:size-4",
                        density === "compact" ? "size-7" : "size-8",
                        layout === "grid" && "size-9"
                      )}
                    >
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    {item.description ? (
                      <span className="text-muted-foreground block truncate text-xs">{item.description}</span>
                    ) : null}
                  </span>
                  {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
      {footer !== null ? (
        <CommandFooter>{footer}</CommandFooter>
      ) : null}
    </>
  )
}

/** A data-driven command menu that renders as a modal palette or an embedded search surface. */
function CommandPalette({
  groups,
  variant = "dialog",
  layout = "list",
  density = "default",
  size = "default",
  open,
  onOpenChange,
  placeholder = t("Type a command or search…"),
  emptyLabel = t("No commands found."),
  title = t("Command palette"),
  description = t("Search for a command to run."),
  footer = (
    <span className="flex items-center gap-2">
      <CommandPaletteKbd><CornerDownLeftIcon /></CommandPaletteKbd>
      Select
    </span>
  ),
  className,
  onSelect,
  onQueryChange,
  loading,
}: CommandPaletteProps) {
  const content = (
    <CommandPaletteContent
      groups={groups}
      placeholder={placeholder}
      emptyLabel={emptyLabel}
      footer={footer}
      onSelect={onSelect}
      layout={layout}
      density={density}
      onQueryChange={onQueryChange}
      loading={loading}
    />
  )

  if (variant === "inline") {
    return (
      <Command
        data-slot="command-palette"
        className={cn("h-auto rounded-xl border shadow-sm", className)}
      >
        {content}
      </Command>
    )
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      showCloseButton={false}
      className={cn(
        "gap-0 overflow-hidden rounded-xl border bg-popover p-0 shadow-2xl",
        sizeClasses[size],
        className
      )}
    >
      {content}
    </CommandDialog>
  )
}

/** Kept for products that import the palette's names; the caps live in `command.tsx` now. */
const CommandPaletteKbd = CommandKbd
const CommandPaletteShortcutKeys = CommandShortcutKeys

export {
  CommandPalette,
  CommandPaletteKbd,
  CommandPaletteShortcutKeys,
  useCommandPaletteShortcut,
}
