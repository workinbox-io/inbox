/**
 * The org's chat socket (src/chat/room.ts): a fresh ticket per connect, reconnects with backoff, tells the room when
 * the tab is hidden (presence "away") and calls `onReconnect` so the app refetches what it missed.
 */
import * as React from "react"
import { api } from "@/lib/api-client"
import type { ChatEvent } from "@/lib/chat/types"

export function useChatSocket(onEvent: (e: ChatEvent) => void, onReconnect: () => void) {
  const handlers = React.useRef({ onEvent, onReconnect })
  handlers.current = { onEvent, onReconnect }
  const [connected, setConnected] = React.useState(false)

  React.useEffect(() => {
    let socket: WebSocket | null = null
    let stopped = false
    let attempt = 0
    let timer: number | undefined
    let opened = false

    const state = () => (document.visibilityState === "hidden" ? '{"type":"away"}' : '{"type":"active"}')
    const onVisibility = () => socket?.readyState === WebSocket.OPEN && socket.send(state())

    const connect = async () => {
      try {
        const { ticket } = await api<{ ticket: string }>("POST", "/api/app/chat/ticket")
        if (stopped) return
        const url = new URL("/chat-sync", location.href)
        url.protocol = location.protocol === "https:" ? "wss:" : "ws:"
        url.searchParams.set("ticket", ticket)
        socket = new WebSocket(url)
        socket.onopen = () => {
          attempt = 0
          setConnected(true)
          socket?.send(state())
          if (opened) handlers.current.onReconnect()
          opened = true
        }
        socket.onmessage = (msg) => {
          try {
            handlers.current.onEvent(JSON.parse(String(msg.data)) as ChatEvent)
          } catch (e) {
            console.error("[chat] event", e)
          }
        }
        socket.onclose = () => {
          setConnected(false)
          retry()
        }
      } catch {
        retry()
      }
    }
    const retry = () => {
      if (stopped) return
      window.clearTimeout(timer)
      timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++))
    }

    void connect()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
      socket?.close()
    }
  }, [])

  return connected
}
