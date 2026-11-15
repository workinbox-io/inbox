/**
 * The way into the org's ChatRoom (src/chat/room.ts).
 *
 * - `chatSync`: /chat-sync?ticket=… from src/app-worker.ts. Only WebSocket upgrades with a valid ticket
 *   (lib/chat/ticket.ts, signed by /api/app/chat/ticket) get through.
 * - `publish`: events from the API after a write; returns who has a socket open.
 */
import { env } from "cloudflare:workers";
import { getServerByName, type Server } from "partyserver";
import { verifyChatTicket } from "@/lib/chat/ticket";
import type { ChatEvent } from "@/lib/chat/types";

const rooms = () => env.CHAT_ROOM as unknown as DurableObjectNamespace<Server>;

export async function chatSync(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
  const ticket = await verifyChatTicket(url.searchParams.get("ticket") ?? "", env.BETTER_AUTH_SECRET);
  if (!ticket) return new Response("Unauthorized", { status: 401 });
  const forward = new Request(request);
  forward.headers.set("x-chat-ticket", encodeURIComponent(JSON.stringify(ticket)));
  const room = await getServerByName(rooms(), ticket.orgId);
  return room.fetch(forward);
}

/** Sends an event to the org's sockets (`to` = these people only); never fails the write that caused it. */
export async function publish(orgId: string, event: ChatEvent, to?: string[]): Promise<Set<string>> {
  try {
    const room = await getServerByName(rooms(), orgId);
    const res = await room.fetch(
      new Request("https://chat-room/publish", { method: "POST", body: JSON.stringify({ event, to }), headers: { "content-type": "application/json" } }),
    );
    if (!res.ok) throw new Error(`Chat room publish failed: ${res.status}`);
    return new Set(((await res.json()) as { online: string[] }).online);
  } catch (e) {
    console.error("[chat] publish", e);
    return new Set();
  }
}
