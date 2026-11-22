/** Paddle webhook signature check; no Workers imports, so it runs in plain unit tests. */

export interface PaddleEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: Record<string, unknown> & { id: string };
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Checks the `Paddle-Signature: ts=…;h1=…` header (HMAC-SHA256 of `ts:body`) and returns the event,
 * or null when it doesn't verify or is older than five minutes.
 */
export async function verifyWebhook(body: string, header: string | null, secret: string, now = Date.now()) {
  const parts = Object.fromEntries((header ?? "").split(";").map((p) => p.split("=") as [string, string]));
  const ts = Number(parts.ts);
  if (!ts || !parts.h1 || Math.abs(now / 1000 - ts) > 300) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.ts}:${body}`)));
  // Constant-time compare.
  if (expected.length !== parts.h1.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.h1.charCodeAt(i);
  return diff === 0 ? (JSON.parse(body) as PaddleEvent) : null;
}
