import * as React from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export function SettingsTabs({ label, tabs }: { label: string; tabs: { id: string; label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = React.useState(() => tabs.find(tab => typeof location !== "undefined" && tab.id === location.hash.slice(1))?.id ?? tabs[0]!.id)
  return <Tabs value={active} onValueChange={setActive} className="gap-6">
    <TabsList aria-label={label} className="h-auto w-full flex-wrap justify-start gap-1">
      {tabs.map(tab => <TabsTrigger key={tab.id} value={tab.id} className="flex-none">{tab.label}</TabsTrigger>)}
    </TabsList>
    {tabs.map(tab => <TabsContent key={tab.id} value={tab.id} forceMount hidden={active !== tab.id} className="flex flex-col gap-6 data-[state=inactive]:hidden">{tab.content}</TabsContent>)}
  </Tabs>
}
