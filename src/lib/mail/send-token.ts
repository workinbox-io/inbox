/**
 * Send tokens for AI apps: mail_draft hands one to its draft card in the result's `_meta` (hosts don't show
 * `_meta` to the model), and mail_send from an OAuth-connected app needs it. So only the person's click in the
 * card sends, even in hosts that ignore MCP Apps tool visibility. Pure (Web Crypto only), the secret is passed in.
 */
export interface SendToken {
  userId: string;
  orgId: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

export const SEND_TOKEN_TTL_MS = 60 * 60_000;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const key = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(`mail-send-token:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function signSendToken(token: SendToken, secret: string) {
  const body = b64url(enc.encode(JSON.stringify(token)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** True when the token is signed with `secret`, unexpired and for this user in this org. */
export async function verifySendToken(token: string | undefined, userId: string, orgId: string, secret: string, now = Date.now()) {
  const [body, sig] = (token ?? "").split(".");
  if (!body || !sig) return false;
  try {
    if (!(await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig), enc.encode(body)))) return false;
    const t = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SendToken;
    return t.userId === userId && t.orgId === orgId && typeof t.exp === "number" && t.exp >= now;
  } catch {
    return false;
  }
}
