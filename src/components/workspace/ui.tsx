/**
 * Small pieces shared by the workspace apps (Mail, Notes, and the ones to come): key chips, tints, a client-only
 * media query and "is the user typing" for single-key shortcuts.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

/** A key chip, e.g. the "C" next to "New e-mail". */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "border-border/80 text-muted-foreground bg-background inline-grid h-[18px] min-w-[18px] place-items-center rounded-[5px] border px-1 font-mono text-[10px] leading-none font-medium shadow-[0_1px_0_var(--border)]",
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/** A calendar-event tint of a colour, for selected rows and chips. */
export const tint = (color: string, pct = 12) => `color-mix(in oklab, ${color} ${pct}%, transparent)`

/** The palette rows and chips wear (mailboxes, note sharing kinds…). */
export const WORKSPACE_COLORS = ["#2bb3a3", "#8b7cf6", "#f0793a", "#4caf6e", "#e66aa8", "#e6a23c", "#4f8ff7", "#ef5a5a"] as const

/** Client-only media query; renders the wide layout on the server (no hydration mismatch). */
export function useMediaQuery(query: string) {
  return React.useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query)
      mq.addEventListener("change", notify)
      return () => mq.removeEventListener("change", notify)
    },
    () => window.matchMedia(query).matches,
    () => true,
  )
}

/** An element's width, kept current: layouts that depend on the room an app really has (sidebars and rails take part of the window). */
export function useWidth<T extends HTMLElement>() {
  const [width, setWidth] = React.useState<number>()
  // A callback ref: the element may mount after the component (e.g. once its data loads).
  const ref = React.useCallback((el: T | null) => {
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Room for an app's rail (224px) next to a list (260) and its detail (360), and for a third column (`wide`), judged by
 * the app frame's own width: the dashboard sidebar and the app rail take part of the window. Pass `ref` to `AppFrame`.
 * The media queries only cover the first render, before the frame is measured.
 */
export function useAppLayout() {
  const [ref, width] = useWidth<HTMLDivElement>()
  const desktopQuery = useMediaQuery("(min-width: 768px)")
  const wideQuery = useMediaQuery("(min-width: 1280px)")
  return {
    ref,
    desktop: width === undefined ? desktopQuery : width >= 860,
    wide: width === undefined ? wideQuery : width >= 1100,
  }
}

/** True while focus is in a field or editor, so single-key shortcuts stay out of the way. */
export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))

/** Relative times only after hydration (the server's "now" differs from the browser's). */
export function useMounted() {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

/**
 * Single-key shortcuts pause while a dialog or menu is open: Escape then closes the menu, not the item behind it.
 */
export const shortcutsPaused = (e: KeyboardEvent) =>
  e.defaultPrevented ||
  e.metaKey ||
  e.ctrlKey ||
  e.altKey ||
  isTyping(e.target) ||
  !!document.querySelector("[role=dialog][data-state=open]:not([data-compose-window]), [role=alertdialog], [role=menu]")
