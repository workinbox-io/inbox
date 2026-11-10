/** List and detail side by side and resizable when they fit (list 260px + detail 360); otherwise one of them, like Mail. */
import * as React from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { useMediaQuery, useWidth } from "./ui"

export function SplitView({ list, detail, showDetail }: { list: React.ReactNode; detail: React.ReactNode; showDetail: boolean }) {
  // Its own width, not the window's: rails and the dashboard sidebar take part of it. The queries cover the first render.
  const [ref, width] = useWidth<HTMLDivElement>()
  const desktopQuery = useMediaQuery("(min-width: 768px)")
  const wideQuery = useMediaQuery("(min-width: 1280px)")
  const split = width === undefined ? desktopQuery : width >= 640
  const wide = width === undefined ? wideQuery : width >= 1000
  return (
    <div ref={ref} className="h-full min-w-0 flex-1">
      {split ? (
        <ResizablePanelGroup key={wide ? "wide" : "narrow"} orientation="horizontal">
          <ResizablePanel id="list" defaultSize={wide ? "28%" : "36%"} minSize="260px" maxSize="50%">
            {list}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="detail" minSize="360px">
            {detail}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : showDetail ? (
        detail
      ) : (
        list
      )}
    </div>
  )
}
