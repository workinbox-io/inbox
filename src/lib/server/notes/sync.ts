/**
 * The way into a note's Durable Object (src/notes/room.ts).
 *
 * - `noteSync`: /notes-sync/<noteId>?ticket=… from src/worker.ts. Only WebSocket upgrades with a valid
 *   ticket (lib/notes/ticket.ts, signed by /api/app/notes/:id/ticket) get through.
 * - `roomCall`: internal requests from the API (apply markdown, close sockets after an access change,
 *   wipe a deleted note).
 */
import { env } from "cloudflare:workers";
import { getServerByName, type Server } from "partyserver";
import type { Value } from "platejs";
import { verifyTicket } from "@/lib/notes/ticket";
import type { ApplyRequest } from "@/notes/room";

/** partyserver types the namespace by its base class. */
const rooms = () => env.NOTE_ROOM as unknown as DurableObjectNamespace<Server>;

const NOTE_ID = /^\/notes-sync\/([0-9a-f-]{36})\/?$/;

export async function noteSync(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const noteId = NOTE_ID.exec(url.pathname)?.[1];
  if (!noteId) return new Response("Not found", { status: 404 });
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
  const ticket = await verifyTicket(url.searchParams.get("ticket") ?? "", noteId, env.BETTER_AUTH_SECRET);
  if (!ticket) return new Response("Unauthorized", { status: 401 });
  const forward = new Request(request);
  forward.headers.set("x-note-ticket", encodeURIComponent(JSON.stringify(ticket)));
  const room = await getServerByName(rooms(), noteId);
  return room.fetch(forward);
}

async function roomCall<T>(noteId: string, action: "apply" | "kick" | "destroy", body: unknown = {}): Promise<T> {
  const room = await getServerByName(rooms(), noteId);
  const res = await room.fetch(new Request(`https://note-room/${action}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  if (!res.ok) throw new Error(`Note room ${action} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Changes the live document (connected editors see it) and saves it to D1; returns the new content. */
export const applyToRoom = (noteId: string, req: ApplyRequest) => roomCall<{ value: Value; title: string }>(noteId, "apply", req);

/** Closes every socket of the note; editors reconnect with a fresh ticket (new role, archived, revoked). */
export const kickRoom = (noteId: string) => roomCall(noteId, "kick").catch((e) => console.error("[notes] kick", e));

export const destroyRoom = (noteId: string) => roomCall(noteId, "destroy");
