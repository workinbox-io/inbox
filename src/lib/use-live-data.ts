import * as React from "react"

/**
 * Server-rendered data a panel can re-fetch after an edit instead of reloading the page.
 * `pick` maps the endpoint's JSON to the same shape as `initial`.
 */
export function useLiveData<T>(url: string, initial: T, pick: (json: unknown) => T = (json) => json as T) {
  const [data, setData] = React.useState(initial)
  const pickRef = React.useRef(pick)
  pickRef.current = pick

  const refresh = React.useCallback(async () => {
    const res = await fetch(url)
    if (res.ok) setData(pickRef.current(await res.json()))
  }, [url])

  return [data, refresh, setData] as const
}
