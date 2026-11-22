import * as React from "react"
import { cn } from "@/lib/utils"

/** One background follows the active link, including sidebar resizing and mobile sheets. */
export function NavigationIndicator({ pathname, className }: { pathname: string; className: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useLayoutEffect(() => {
    const indicator = ref.current
    const container = indicator?.parentElement
    const active = container?.querySelector<HTMLElement>('a[aria-current="page"]')
    if (!indicator) return
    if (!container || !active) { indicator.dataset.ready = "false"; return }
    let frame: number | undefined
    const measure = () => {
      const firstPosition = indicator.dataset.ready !== "true"
      if (firstPosition) indicator.dataset.animate = "false"
      const parent = container.getBoundingClientRect()
      const item = active.getBoundingClientRect()
      // ResizeObserver follows the button's existing size transition; a second transition would lag behind it.
      indicator.style.width = `${item.width}px`
      indicator.style.height = `${item.height}px`
      indicator.style.transform = `translate3d(${item.left - parent.left + container.scrollLeft - container.clientLeft}px, ${item.top - parent.top + container.scrollTop - container.clientTop}px, 0)`
      indicator.dataset.ready = "true"
      if (firstPosition) {
        // Returning from a 404 has no previous selection to slide from.
        indicator.getBoundingClientRect()
        frame = requestAnimationFrame(() => { indicator.dataset.animate = "true" })
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(active)
    return () => { observer.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame) }
  }, [pathname])

  return <span ref={ref} aria-hidden data-slot="navigation-indicator" className={cn("navigation-active-indicator rounded-md", className)} />
}
