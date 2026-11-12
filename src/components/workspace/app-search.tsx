import * as React from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommandPalette, useCommandPaletteShortcut, type CommandPaletteGroup } from "@/components/ui/command-palette"
import { APP_ACTIONS, APP_HELP, APP_NAV } from "@/config/nav"
import { t } from "@/lib/i18n/panel"

/** The workspace apps the user view switches between (AppRail's list). */
const USER_APPS = new Set(["/app/mail", "/app/calendar", "/app/notes", "/app/contacts", "/app/drive"])

/**
 * The user view's ⌘K: the button in AppTopBar and the palette with the apps and "new" actions. On phones it is also
 * the app switcher, since AppRail is hidden there. MailLayout has no ClientRouter, so links load the page.
 */
export function AppSearch() {
  const [open, setOpen] = React.useState(false)
  useCommandPaletteShortcut(setOpen)
  const go = (href: string) => () => {
    setOpen(false)
    window.location.href = href
  }
  const groups: CommandPaletteGroup[] = [
    {
      heading: t("Navigate"),
      items: [...APP_NAV.filter((n) => USER_APPS.has(n.href)), ...APP_HELP].map((n) => ({
        id: n.href,
        label: t(n.label),
        icon: <n.icon />,
        onSelect: go(n.href),
      })),
    },
    {
      heading: t("Actions"),
      items: APP_ACTIONS.map((a) => ({ id: a.href, label: t(a.label), icon: <a.icon />, onSelect: go(a.href) })),
    },
  ]
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground w-9 justify-start gap-2 px-0 max-sm:justify-center sm:w-64 sm:px-3"
        onClick={() => setOpen(true)}
      >
        <Search />
        <span className="max-sm:sr-only">{t("Search…")}</span>
        <kbd className="bg-muted ml-auto rounded px-1.5 font-mono text-[10px] max-sm:hidden">⌘K</kbd>
      </Button>
      <CommandPalette groups={groups} open={open} onOpenChange={setOpen} placeholder={t("Search pages and actions…")} />
    </>
  )
}
