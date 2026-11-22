import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(onChange: () => void, breakpoint: number) {
  const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getServerSnapshot() {
  return false
}

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const subscribeToBreakpoint = React.useCallback((onChange: () => void) => subscribe(onChange, breakpoint), [breakpoint])
  return React.useSyncExternalStore(subscribeToBreakpoint, () => window.innerWidth < breakpoint, getServerSnapshot)
}
