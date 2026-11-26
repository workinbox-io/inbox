import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { isChunkLoadError, recoverChunkLoad } from "@/lib/panel-load-error"

const reload = vi.fn()
let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  reload.mockClear()
  vi.stubGlobal("window", { location: { reload } })
  vi.stubGlobal("navigator", { onLine: true })
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it("recovers a stale module once and prevents a reload loop", () => {
  const error = new TypeError("Failed to fetch dynamically imported module: https://workinbox.io/_astro/notes.old.js")
  expect(recoverChunkLoad(error)).toBe(true)
  expect(recoverChunkLoad(error)).toBe(false)
  expect(reload).toHaveBeenCalledTimes(1)
  storage.set("panel:chunk-reload", String(Date.now() - 60_001))
  expect(recoverChunkLoad(error)).toBe(true)
})

it("does not reload for render errors, HTTP errors, or offline failures", () => {
  expect(recoverChunkLoad(new TypeError("Cannot read properties of undefined"))).toBe(false)
  expect(recoverChunkLoad(new Response(null, { status: 503 }))).toBe(false)
  vi.stubGlobal("navigator", { onLine: false })
  expect(recoverChunkLoad(new Error("Loading chunk 42 failed"))).toBe(false)
  expect(reload).not.toHaveBeenCalled()
})

it("keeps the manual recovery screen usable when storage is blocked", () => {
  vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("Storage blocked") } })
  expect(recoverChunkLoad(new Error("Importing a module script failed."))).toBe(false)
  expect(reload).not.toHaveBeenCalled()
  expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true)
})
