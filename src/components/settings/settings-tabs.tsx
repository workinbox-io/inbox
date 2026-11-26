import * as React from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

/** Tabs that follow the URL hash (#id, or an old id listed in `aliases`), so links and in-page `href="#id"` open a tab. */
export function SettingsTabs({ label, tabs, aliases = {} }: { label: string; tabs: { id: string; label: string; content: React.ReactNode }[]; aliases?: Record<string, string> }) {
  const fromHash = () => {
    if (typeof location === "undefined") return undefined
    const hash = location.hash.slice(1)
    return tabs.find(tab => tab.id === (aliases[hash] ?? hash))?.id
  }
  const [active, setActive] = React.useState(() => fromHash() ?? tabs[0]!.id)
  React.useEffect(() => {
    const onHash = () => { const id = fromHash(); if (id) setActive(id) }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  })
  return <Tabs value={active} onValueChange={setActive} className="gap-6">
    <TabsList aria-label={label} className="h-auto! max-w-full justify-start gap-1 overflow-x-auto">
      {tabs.map(tab => <TabsTrigger key={tab.id} value={tab.id} className="flex-none">{tab.label}</TabsTrigger>)}
    </TabsList>
    {tabs.map(tab => <TabsContent key={tab.id} value={tab.id} forceMount hidden={active !== tab.id} className="flex flex-col gap-6 data-[state=inactive]:hidden">{tab.content}</TabsContent>)}
  </Tabs>
}
