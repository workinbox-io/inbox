/**
 * ChatRoom: one Durable Object per organization (named by the org id) holding everyone's chat sockets. It stores
 * nothing: D1 is the source of truth and the API posts events here after each write (lib/server/chat/realtime.ts).
 *
 * - Browsers connect through lib/server/chat/sync.ts, which verifies the ticket and passes it in `x-chat-ticket`.
 *   Connections are tagged `user:<id>`, so an event for a private channel reaches its members only.
 * - Presence: who has a socket open, and who said their tabs are hidden (`{ type: "away" | "active" }`).
 * - POST /publish `{ event, to? }` (internal only: the worker forwards WebSocket upgrades alone) sends the event
 *   and answers with the users that have a socket, so push goes to the others.
 */
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import type { ChatEvent } from "@/lib/chat/types";
import type { ChatTicket } from "@/lib/chat/ticket";

interface ConnState {
  userId: string;
  away: boolean;
}

const readTicket = (request: Request): ChatTicket | null => {
  const raw = request.headers.get("x-chat-ticket");
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as ChatTicket;
  } catch {
    return null;
  }
};

export class ChatRoom extends Server {
  static options = { hibernate: true };

  getConnectionTags(_connection: Connection, ctx: ConnectionContext) {
    const ticket = readTicket(ctx.request);
    return ticket ? [`user:${ticket.userId}`] : [];
  }

  onConnect(connection: Connection<ConnState>, ctx: ConnectionContext) {
    const ticket = readTicket(ctx.request);
    if (!ticket) return connection.close(4401, "Unauthorized");
    connection.setState({ userId: ticket.userId, away: false });
    this.sendPresence();
  }

  onMessage(connection: Connection<ConnState>, message: WSMessage) {
    if (typeof message !== "string" || !connection.state) return;
    const type = message === '{"type":"away"}' ? "away" : message === '{"type":"active"}' ? "active" : null;
    if (!type) return;
    connection.setState({ ...connection.state, away: type === "away" });
    this.sendPresence();
  }

  onClose() {
    this.sendPresence();
  }

  private presence() {
    const active = new Set<string>();
    const all = new Set<string>();
    for (const c of this.getConnections<ConnState>()) {
      if (!c.state) continue;
      all.add(c.state.userId);
      if (!c.state.away) active.add(c.state.userId);
    }
    return { online: [...active], away: [...all].filter((u) => !active.has(u)), all };
  }

  private sendPresence() {
    const { online, away } = this.presence();
    this.broadcast(JSON.stringify({ type: "presence", online, away } satisfies ChatEvent));
  }

  async onRequest(request: Request) {
    if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/publish")) return new Response("Not found", { status: 404 });
    const { event, to } = (await request.json()) as { event: ChatEvent; to?: string[] };
    const data = JSON.stringify(event);
    if (to) for (const userId of new Set(to)) for (const c of this.getConnections(`user:${userId}`)) c.send(data);
    else this.broadcast(data);
    return Response.json({ online: [...this.presence().all] });
  }
}
