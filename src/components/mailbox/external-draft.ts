export interface ExternalDraft {
  id: string; to: string; cc: string; subject: string; text: string; files: File[]; replyToId?: string
}
export const newExternalDraft = (): ExternalDraft => ({ id: crypto.randomUUID(), to: "", cc: "", subject: "", text: "", files: [] })

/** IndexedDB preserves File objects without putting mail or attachment bytes in localStorage. */
export async function externalDraft(key: string, write?: ExternalDraft | null): Promise<ExternalDraft | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("workinbox-external-drafts", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("drafts")
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error("Draft storage is unavailable. Keep this page open."))
  })
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("drafts", write === undefined ? "readonly" : "readwrite")
      const store = transaction.objectStore("drafts")
      const request = write === undefined ? store.get(key) : write === null ? store.delete(key) : store.put(write, key)
      let value: ExternalDraft | null = null
      if (write === undefined) request.onsuccess = () => { value = request.result ?? null }
      transaction.oncomplete = () => resolve(write === undefined ? value : write)
      transaction.onerror = () => reject(new Error("Draft could not be saved. Keep this page open."))
      transaction.onabort = transaction.onerror
    })
  } finally { db.close() }
}
