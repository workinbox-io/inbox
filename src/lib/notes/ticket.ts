/**
 * Short-lived tickets for the notes WebSocket. /api/app/notes/:id/ticket checks the session and the note's
 * access and signs one; src/worker.ts verifies it before handing the socket to the note's Durable Object, so
 * the socket path never needs cookies or a database read. Pure (Web Crypto only), the secret is passed in.
 */
export interface NoteTicket {
  noteId: string;
  orgId: string;
  userId: string;
  name: string;
  color: string;
  canEdit: boolean;
  /** Expiry, ms since epoch. */
  exp: number;
}

export const TICKET_TTL_MS = 60_000;

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const key = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(`notes-ticket:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function signTicket(ticket: NoteTicket, secret: string) {
  const body = b64url(enc.encode(JSON.stringify(ticket)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** The ticket when it is signed with `secret`, unexpired and for `noteId`; otherwise null. */
export async function verifyTicket(token: string, noteId: string, secret: string, now = Date.now()): Promise<NoteTicket | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const ticket = JSON.parse(new TextDecoder().decode(fromB64url(body))) as NoteTicket;
    if (ticket.noteId !== noteId || typeof ticket.exp !== "number" || ticket.exp < now) return null;
    return ticket;
  } catch {
    return null;
  }
}

/** A stable cursor colour per user. */
export function userColor(userId: string) {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 70% 45%)`;
}
