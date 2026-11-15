/**
 * JSON fetch for our /api/app routes; throws an Error with the server's message.
 * Always sends a JSON content type: Astro's CSRF check treats body-less
 * DELETEs as form submissions and rejects them behind a TLS-terminating proxy.
 */
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? `Request failed (${res.status})`), { status: res.status })
  return data as T
}
