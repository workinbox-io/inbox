/**
 * Short-lived tickets for the chat WebSocket (/chat-sync), signed by /api/app/chat/ticket after the session check;
 * lib/server/chat/sync.ts verifies them before handing the socket to the org's ChatRoom. Same HMAC as notes'
 * tickets (lib/notes/ticket.ts), another key so a note ticket never opens chat.
 */
export interface ChatTicket {
  orgId: string;
  userId: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

export const CHAT_TICKET_TTL_MS = 60_000;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const key = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(`chat-ticket:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function signChatTicket(ticket: ChatTicket, secret: string) {
  const body = b64url(enc.encode(JSON.stringify(ticket)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifyChatTicket(token: string, secret: string, now = Date.now()): Promise<ChatTicket | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig), enc.encode(body)))) return null;
    const ticket = JSON.parse(new TextDecoder().decode(fromB64url(body))) as ChatTicket;
    if (typeof ticket.exp !== "number" || ticket.exp < now || !ticket.orgId || !ticket.userId) return null;
    return ticket;
  } catch {
    return null;
  }
}
