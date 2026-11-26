/** List and detail side by side and resizable when they fit (list 260px + detail 360); otherwise one of them, like Mail. */
import * as React from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { cn } from "@/lib/utils"
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
        <div className="h-full motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-8 motion-safe:duration-200">{detail}</div>
      ) : (
        list
      )}
    </div>
  )
}

/**
 * A panel beside the content that slides its width open and shut, so what's next to it resizes smoothly instead of
 * jumping. Keeps showing the last content while it closes (or while it's open but empty, e.g. loading). The transition only runs on open/close, not while resizing.
 */
export function SidePanel({ open, width, className, children }: { open: boolean; width: number | string; className?: string; children: React.ReactNode }) {
  const last = React.useRef(children)
  if (open && children) last.current = children
  const [was, setWas] = React.useState(open)
  const [moving, setMoving] = React.useState(false)
  // With reduced motion there's no transition, so no transitionend to wait for.
  if (was !== open) (setWas(open), setMoving(!matchMedia("(prefers-reduced-motion: reduce)").matches))
  return (
    <div
      inert={!open || undefined}
      aria-hidden={!open || undefined}
      className={cn("relative shrink-0", (open || moving) && "border-l", (!open || moving) && "overflow-hidden", moving && "transition-[width] duration-200 ease-out", className)}
      style={{ width: open ? width : 0 }}
      onTransitionEnd={(e) => e.target === e.currentTarget && setMoving(false)}
    >
      <div className="h-full" style={{ width }}>
        {open || moving ? last.current : null}
      </div>
    </div>
  )
}
