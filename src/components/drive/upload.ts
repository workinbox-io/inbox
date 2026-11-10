/**
 * Uploading to the drive from the browser: one PUT up to partBytes, above that a multipart upload in parts
 * (/api/app/drive/uploads). XHR, because only XHR reports upload progress.
 */
import type { DriveDetail } from "./types"

const PART_BYTES = 10 * 1024 * 1024

function send(method: string, url: string, body: Blob, headers: Record<string, string>, onProgress: (loaded: number) => void) {
  return new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => {
      let data: { error?: string } = {}
      try {
        data = JSON.parse(xhr.responseText)
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data.error ?? `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."))
    xhr.send(body)
  })
}

async function json<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
  return data as T
}

/** Uploads `file` into `parentId` (null = My drive); `onProgress` gets 0 to 1. */
export async function uploadToDrive(file: File, parentId: string | null, onProgress: (fraction: number) => void): Promise<DriveDetail> {
  const mediaType = file.type || "application/octet-stream"
  if (file.size <= PART_BYTES) {
    const q = parentId ? `?parentId=${parentId}` : ""
    return (await send("PUT", `/api/app/drive/files${q}`, file, { "Content-Type": mediaType, "X-Filename": encodeURIComponent(file.name) }, (n) => onProgress(n / file.size))) as DriveDetail
  }
  const { id, partBytes } = await json<{ id: string; partBytes: number }>("POST", "/api/app/drive/uploads", { name: file.name, parentId, size: file.size, mediaType })
  try {
    const parts: { partNumber: number; etag: string }[] = []
    for (let start = 0, n = 1; start < file.size; start += partBytes, n++) {
      const done = start
      parts.push((await send("PUT", `/api/app/drive/uploads/${id}?part=${n}`, file.slice(start, start + partBytes), {}, (loaded) => onProgress((done + loaded) / file.size))) as { partNumber: number; etag: string })
    }
    return await json<DriveDetail>("POST", `/api/app/drive/uploads/${id}`, { parts })
  } catch (e) {
    void json("DELETE", `/api/app/drive/uploads/${id}`).catch(() => {})
    throw e
  }
}
