/**
 * Work that takes a while (uploads, ZIPs, copies, moving many items) shows as one Ding toast that morphs in place:
 * loading with an optional progress bar, then success or error in the same pill, as Mail's "Sending…" → "Sent".
 */
import { toast } from "@yusufceng1z/ding-react"

type ToastAction = { label: string; onClick: () => void }

export function task(title: string, opts: { progress?: boolean } = {}) {
  const id = toast.loading(title, opts.progress ? { progress: 0 } : undefined)
  return {
    progress: (fraction: number, next?: string) => toast.update(id, { progress: Math.max(0, Math.min(1, fraction)), ...(next ? { title: next } : {}) }),
    done: (next: string, more: { description?: string; action?: ToastAction } = {}) =>
      toast.update(id, { type: "success", title: next, description: more.description, action: more.action ?? null, progress: null, duration: 5000 }),
    fail: (next: string, description?: string) => toast.update(id, { type: "error", title: next, description, progress: null, duration: 0 }),
    dismiss: () => toast.dismiss(id),
  }
}

/** Runs `work` as a task: loading, then success or the error's message. Returns the result, or undefined on failure. */
export async function runTask<T>(title: string, work: () => Promise<T>, done: (value: T) => string) {
  const t = task(title)
  try {
    const value = await work()
    t.done(done(value))
    return value
  } catch (e) {
    t.fail((e as Error).message)
    return undefined
  }
}
