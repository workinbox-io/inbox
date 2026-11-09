/** List and detail side by side and resizable from md up; on phones one of them, like Mail. */
import * as React from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { useMediaQuery } from "./ui"

export function SplitView({ list, detail, showDetail }: { list: React.ReactNode; detail: React.ReactNode; showDetail: boolean }) {
  const desktop = useMediaQuery("(min-width: 768px)")
  const wide = useMediaQuery("(min-width: 1280px)")
  if (!desktop) return <div className="h-full min-w-0 flex-1">{showDetail ? detail : list}</div>
  return (
    <div className="h-full min-w-0 flex-1">
      <ResizablePanelGroup key={wide ? "wide" : "narrow"} orientation="horizontal">
        <ResizablePanel id="list" defaultSize={wide ? "28%" : "36%"} minSize="260px" maxSize="50%">
          {list}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="detail" minSize="360px">
          {detail}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
