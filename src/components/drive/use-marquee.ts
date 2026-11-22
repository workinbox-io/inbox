/**
 * The selection rectangle: press on an empty spot of the list and drag; what the rectangle touches is selected
 * (added to the selection with ⌘/Shift). A press without a drag clears the selection.
 */
import * as React from "react"
import { boxFrom, marqueeHits, type Box } from "@/lib/drive/explorer"

export function useMarquee(container: React.RefObject<HTMLElement | null>, onSelect: (ids: string[], additive: boolean) => void, onClear: () => void) {
  const [rect, setRect] = React.useState<Box | null>(null)

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      const el = container.current
      if (!el || e.button !== 0 || e.pointerType === "touch") return
      if ((e.target as HTMLElement).closest("[data-drive-id], button, input, a, [role=menu]")) return
      const origin = el.getBoundingClientRect()
      const sx = e.clientX - origin.left + el.scrollLeft
      const sy = e.clientY - origin.top + el.scrollTop
      const additive = e.metaKey || e.ctrlKey || e.shiftKey
      const base = [...el.querySelectorAll<HTMLElement>("[data-drive-id][aria-selected=true]")].map((n) => n.dataset.driveId!)
      let moved = false
      const move = (ev: PointerEvent) => {
        const o = el.getBoundingClientRect()
        const x = ev.clientX - o.left + el.scrollLeft
        const y = ev.clientY - o.top + el.scrollTop
        if (!moved && Math.hypot(x - sx, y - sy) < 4) return
        moved = true
        const box = boxFrom(sx, sy, x, y)
        setRect(box)
        const boxes = [...el.querySelectorAll<HTMLElement>("[data-drive-id]")].map((n) => {
          const r = n.getBoundingClientRect()
          return { id: n.dataset.driveId!, box: boxFrom(r.left - o.left + el.scrollLeft, r.top - o.top + el.scrollTop, r.right - o.left + el.scrollLeft, r.bottom - o.top + el.scrollTop) }
        })
        const hits = marqueeHits(box, boxes)
        onSelect(additive ? [...new Set([...base, ...hits])] : hits, false)
      }
      const up = () => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        setRect(null)
        if (!moved && !additive) onClear()
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
    },
    [container, onSelect, onClear],
  )

  return { rect, onPointerDown }
}
