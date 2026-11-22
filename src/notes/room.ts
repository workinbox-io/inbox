/**
 * NoteRoom: one Durable Object per note (named by the note id) holding the live Yjs document.
 *
 * - Browsers connect over WebSocket through src/worker.ts, which verifies the ticket (lib/notes/ticket.ts)
 *   and passes it in the `x-note-ticket` header; read-only tickets can't change the document.
 * - The Yjs state is kept in the object's SQLite storage. A new room starts from the note's row in D1
 *   (content written by the API or an older snapshot).
 * - Every save (debounced by y-partyserver, and when the last person leaves) writes the content, plain text
 *   and title back to D1 for lists, search, the API and MCP.
 * - Internal requests from lib/server/notes/room.ts: POST /apply (markdown from the API, applied live),
 *   POST /kick (close every socket so clients reconnect with fresh tickets), POST /destroy (note deleted).
 *   The worker only forwards WebSocket upgrades here, so these are never reachable from outside.
 */
import type { Connection, ConnectionContext } from "partyserver";
import { YServer } from "y-partyserver";
import * as Y from "yjs";
import { db, eq, notes } from "@/db";
import { plainText, titleFrom } from "@/lib/notes/access";
import { noteMentions } from "@/lib/notifications";
import { notifyNoteMentions } from "@/lib/server/notes/notes";
import { EMPTY_NOTE, isValue } from "@/lib/notes/plate";
import type { NoteTicket } from "@/lib/notes/ticket";
import { appendDoc, readDoc, seedDoc } from "@/lib/notes/ydoc";
import type { Value } from "platejs";

/** Below SQLite's 2 MB row limit. */
const CHUNK = 1_000_000;

interface ConnState {
  userId?: string;
  canEdit?: boolean;
}

export interface ApplyRequest {
  mode: "replace" | "append" | "title";
  value?: Value;
  title?: string;
  userId?: string | null;
}

export class NoteRoom extends YServer {
  static options = { hibernate: true };
  static callbackOptions = { debounceWait: 2000, debounceMaxWait: 10_000, timeout: 5000 };

  /** The last person who changed the document, for notes.updated_by. */
  private lastEditor: string | null = null;
  /** What was last written to D1, so unchanged saves skip the write. */
  private savedKey = "";
  /** Set by /destroy: a pending debounced save must not bring the note back. */
  private deleted = false;

  private table() {
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS ydoc (i INTEGER PRIMARY KEY, data BLOB NOT NULL)");
    return sql;
  }

  async onLoad() {
    const rows = this.table().exec<{ data: ArrayBuffer }>("SELECT data FROM ydoc ORDER BY i").toArray();
    const doc = new Y.Doc();
    if (rows.length) {
      const parts = rows.map((r) => new Uint8Array(r.data));
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) {
        all.set(p, at);
        at += p.length;
      }
      Y.applyUpdate(doc, all);
      return doc;
    }
    // First time this note is opened: start from its last snapshot in D1.
    const [row] = await db.select({ content: notes.content, title: notes.title }).from(notes).where(eq(notes.id, this.name));
    seedDoc(doc, isValue(row?.content) ? (row.content as Value) : EMPTY_NOTE, row?.title ?? "");
    return doc;
  }

  async onSave() {
    if (this.deleted) return;
    const update = Y.encodeStateAsUpdate(this.document);
    const sql = this.table();
    sql.exec("DELETE FROM ydoc");
    for (let i = 0; i * CHUNK < update.length; i++) sql.exec("INSERT INTO ydoc (i, data) VALUES (?, ?)", i, update.slice(i * CHUNK, (i + 1) * CHUNK));
    await this.snapshot();
  }

  /** People @mentioned in the content last saved; the first save reads them from D1. */
  private mentioned: Set<string> | null = null;

  /** Writes the content, text and title to D1 when they changed, and tells people newly @mentioned. */
  private async snapshot() {
    const { value, title } = readDoc(this.document);
    const text = plainText(value);
    const key = `${title}\u0000${JSON.stringify(value)}`;
    if (key === this.savedKey) return;
    if (!this.mentioned) {
      const [row] = await db.select({ content: notes.content }).from(notes).where(eq(notes.id, this.name));
      this.mentioned = noteMentions(row?.content);
    }
    const now = noteMentions(value);
    const added = [...now].filter((id) => !this.mentioned!.has(id) && id !== this.lastEditor);
    this.mentioned = now;
    await db
      .update(notes)
      .set({ content: value, text, title: title.trim() || titleFrom(text, ""), updatedBy: this.lastEditor ?? undefined })
      .where(eq(notes.id, this.name));
    this.savedKey = key;
    await notifyNoteMentions(this.name, added, this.lastEditor);
  }

  getConnectionTags(_connection: Connection, ctx: ConnectionContext) {
    const ticket = readTicket(ctx.request);
    return ticket ? [`user:${ticket.userId}`] : [];
  }

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const ticket = readTicket(ctx.request);
    if (!ticket) {
      connection.close(4401, "Unauthorized");
      return;
    }
    connection.setState((prev: ConnState | null) => ({ ...prev, userId: ticket.userId, canEdit: ticket.canEdit }));
    super.onConnect(connection, ctx);
  }

  isReadOnly(connection: Connection) {
    return (connection.state as ConnState | null)?.canEdit !== true;
  }

  async onStart() {
    await super.onStart();
    // Remote changes carry the sending connection as their origin.
    this.document.on("update", (_update: Uint8Array, origin: unknown) => {
      const userId = (origin as Connection | null)?.state && ((origin as Connection).state as ConnState).userId;
      if (userId) this.lastEditor = userId;
    });
  }

  async onClose(connection: Connection, code: number, reason: string, wasClean: boolean) {
    super.onClose(connection, code, reason, wasClean);
    // The last one out saves right away instead of waiting for the debounce.
    if ([...this.getConnections()].every((c) => c === connection)) await this.onSave().catch((e) => console.error("[notes] save", e));
  }

  async onRequest(request: Request) {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST") return new Response("Not found", { status: 404 });
    if (path.endsWith("/apply")) {
      const body = (await request.json()) as ApplyRequest;
      if (body.userId) this.lastEditor = body.userId;
      if (body.mode === "replace" && body.value) seedDoc(this.document, body.value, body.title);
      else if (body.mode === "append" && body.value) {
        appendDoc(this.document, body.value);
        if (body.title !== undefined) seedTitle(this.document, body.title);
      } else if (body.mode === "title" && body.title !== undefined) seedTitle(this.document, body.title);
      await this.onSave();
      return Response.json(readDoc(this.document));
    }
    if (path.endsWith("/kick")) {
      for (const c of this.getConnections()) c.close(4000, "Access changed");
      return Response.json({ ok: true });
    }
    if (path.endsWith("/destroy")) {
      for (const c of this.getConnections()) c.close(4404, "Note deleted");
      this.deleted = true;
      await this.ctx.storage.deleteAll();
      return Response.json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  }
}

function seedTitle(doc: Y.Doc, title: string) {
  doc.transact(() => {
    const t = doc.getText("title");
    t.delete(0, t.length);
    t.insert(0, title);
  });
}

function readTicket(request: Request): NoteTicket | null {
  const raw = request.headers.get("x-note-ticket");
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as NoteTicket;
  } catch {
    return null;
  }
}
