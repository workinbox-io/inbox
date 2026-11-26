/** A tab opened before deployment can reference a JavaScript chunk no longer served by the current release. */
export const isChunkLoadError = (error: unknown): error is Error =>
  error instanceof Error && /dynamically imported module|Loading chunk|Importing a module script/.test(error.message)

export function recoverChunkLoad(error: unknown) {
  if (!isChunkLoadError(error) || !navigator.onLine) return false
  try {
    const key = "panel:chunk-reload"
    const now = Date.now()
    // An unavailable asset or repeated network failure must leave a usable error screen, not a reload loop.
    if (now - Number(sessionStorage.getItem(key)) < 60_000) return false
    sessionStorage.setItem(key, String(now))
    window.location.reload()
    return true
  } catch {
    return false
  }
}
