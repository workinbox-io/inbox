/**
 * Plate's Yjs plugin talks to "providers"; this one connects to the note's Durable Object
 * (src/notes/room.ts) with y-partyserver. Every (re)connect asks /api/app/notes/:id/ticket for a fresh
 * ticket, so a changed role, an archived note or revoked access takes effect on the next connect.
 */
import { registerProviderType, type ProviderConstructorProps, type UnifiedProvider } from "@platejs/yjs"
import YProvider from "y-partyserver/provider"
import type { Awareness } from "y-protocols/awareness"
import type * as Y from "yjs"

export interface NoteTicketResponse {
  ticket: string
  canEdit: boolean
  user: { id: string; name: string; color: string }
}

export interface NoteProviderOptions {
  noteId: string
  /** Gets a ticket; returns null when the viewer lost access (the provider then stops reconnecting). */
  getTicket: () => Promise<NoteTicketResponse | null>
}

export const NOTE_PROVIDER = "note-room"

class NoteRoomProvider implements UnifiedProvider {
  readonly type = NOTE_PROVIDER
  readonly provider: YProvider
  private _connected = false
  private _synced = false
  private readonly props: ProviderConstructorProps<NoteProviderOptions>

  constructor(props: ProviderConstructorProps<NoteProviderOptions>) {
    this.props = props
    const { noteId, getTicket } = props.options
    this.provider = new YProvider(location.host, noteId, props.doc, {
      prefix: `/notes-sync/${noteId}`,
      protocol: location.protocol === "https:" ? "wss" : "ws",
      connect: false,
      awareness: props.awareness,
      // One tab per note is enough: BroadcastChannel sync would bypass the ticket's read-only flag.
      disableBc: true,
      params: async () => {
        const res = await getTicket()
        if (!res) {
          // No access any more: stop the reconnect loop.
          queueMicrotask(() => this.provider.disconnect())
          return { ticket: "" }
        }
        return { ticket: res.ticket }
      },
    })
    this.provider.on("status", ({ status }: { status: string }) => {
      const connected = status === "connected"
      if (connected === this._connected) return
      this._connected = connected
      if (connected) props.onConnect?.()
      else props.onDisconnect?.()
    })
    this.provider.on("sync", (synced: boolean) => {
      if (synced === this._synced) return
      this._synced = synced
      props.onSyncChange?.(synced)
    })
    this.provider.on("connection-error", () => props.onError?.(new Error("Connection error")))
  }

  get awareness(): Awareness {
    return this.provider.awareness
  }
  get document(): Y.Doc {
    return this.provider.doc
  }
  get isConnected() {
    return this._connected
  }
  get isSynced() {
    return this._synced
  }

  connect = () => {
    void this.provider.connect()
  }
  disconnect = () => {
    this.provider.disconnect()
    if (this._synced) {
      this._synced = false
      this.props.onSyncChange?.(false)
    }
  }
  destroy = () => {
    this.provider.destroy()
  }
}

registerProviderType(NOTE_PROVIDER, NoteRoomProvider)
