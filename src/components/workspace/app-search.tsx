import { navigatePanel, PANEL_NAVIGATION } from "@/lib/panel-history"
import * as React from "react"
import { LayoutGrid, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommandPalette, openAppSearch, useCommandPaletteShortcut, type CommandPaletteGroup } from "@/components/ui/command-palette"
import { ADMIN_NAV, APP_ACTIONS, APP_HELP, WORKSPACE_NAV } from "@/config/nav"
import { withoutDisabled } from "@/config/modules"
import { t } from "@/lib/i18n/panel"
import { useOpenCommandPalette, usePaletteGroups } from "./app-commands"

/**
 * The apps' ⌘K: the rail/header button and the palette with the apps and "new" actions. On phones it is also
 * the app switcher, since AppRail is hidden there.
 */
/** `admin`: owners and admins also find the admin console's pages. */
export function AppSearch({ compact = false, disabled = [], admin = false }: { compact?: boolean; disabled?: string[]; admin?: boolean }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener(PANEL_NAVIGATION, close)
    return () => window.removeEventListener(PANEL_NAVIGATION, close)
  }, [])
  useCommandPaletteShortcut(setOpen)
  useOpenCommandPalette(React.useCallback(() => setOpen(true), []))
  const go = (href: string) => () => {
    setOpen(false)
    navigatePanel(href)
  }
  const shared: CommandPaletteGroup[] = [
    {
      heading: t("Navigate"),
      items: [...withoutDisabled(WORKSPACE_NAV, disabled), ...APP_HELP].map((n) => ({
        id: n.href,
        label: t(n.label),
        icon: <n.icon />,
        onSelect: go(n.href),
      })),
    },
    ...(admin ? [{
      heading: t("Admin console"),
      items: ADMIN_NAV.map((n) => ({ id: n.href, label: t(n.label), icon: <n.icon />, onSelect: go(n.href) })),
    }] : []),
    {
      heading: t("Actions"),
      items: withoutDisabled(APP_ACTIONS, disabled).map((a) => ({ id: a.href, label: t(a.label), icon: <a.icon />, onSelect: go(a.href) })),
    },
  ]
  const palette = usePaletteGroups(shared, open)
  return (
    <>
      {/* Phones (not compact) get a grid like Google's app launcher: it's how they switch apps, and apps like Mail have their own search field. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={compact ? t("Search pages") : t("Apps")}
        title={compact ? `${t("Search…")} (⌘K)` : t("Apps")}
        onClick={() => openAppSearch(() => setOpen(true))}
      >
        {compact ? <Search /> : <LayoutGrid />}
      </Button>
      <CommandPalette groups={palette.groups} loading={palette.loading} onQueryChange={palette.onQueryChange} onSelect={() => setOpen(false)} open={open} onOpenChange={setOpen} size="wide" placeholder={palette.placeholder ?? t("Search everything…")} />
    </>
  )
}
