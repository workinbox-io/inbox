/**
 * Mail results (MCP Apps) for mail_search: threads newest first; a click reads the thread as text
 * through mail_read_thread, "Reply" asks the model to draft one (mail_draft shows the draft card).
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react"
import "./widget.css"
import "./mail.css"

interface Thread {
  id: string
  subject: string
  contactName: string | null
  contactEmail: string
  snippet: string
  unread: boolean
  lastMessageAt: string | number
  messageCount: number
}

interface Message {
  id: string
  from: { email: string; name: string | null }
  text: string
  createdAt: string | number
}

const date = (v: string | number) => new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" })

function ThreadsWidget() {
  const [threads, setThreads] = React.useState<Thread[] | null>(null)
  const [open, setOpen] = React.useState<{ id: string; messages: Message[] | null } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const { app, error: connectError } = useApp({
    appInfo: { name: "Work Inbox mail", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = (result) => {
        const list = (result.structuredContent as { threads?: Thread[] } | undefined)?.threads
        setThreads(Array.isArray(list) ? list : [])
      }
    },
  })
  useHostStyles(app, app?.getHostContext())

  async function toggle(id: string) {
    if (!app) return
    if (open?.id === id) return setOpen(null)
    setOpen({ id, messages: null })
    setError(null)
    const res = await app.callServerTool({ name: "mail_read_thread", arguments: { id } })
    if (res.isError) return setError("Couldn't open this thread.")
    setOpen({ id, messages: (res.structuredContent as { messages: Message[] }).messages })
  }

  function reply(t: Thread) {
    void app?.sendMessage({ role: "user", content: [{ type: "text", text: `Draft a reply to the thread "${t.subject}" (id ${t.id}).` }] })
  }

  if (connectError) return <p className="error">{connectError.message}</p>
  if (!threads) return <p className="muted">Searching mail…</p>
  if (!threads.length) return <p className="muted">No mail found.</p>

  return (
    <div className="widget">
      <ul className="list">
        {threads.map((t) => (
          <li key={t.id} className="item">
            <button type="button" className="row" aria-expanded={open?.id === t.id} onClick={() => toggle(t.id)}>
              <span className={t.unread ? "name" : undefined}>{t.contactName || t.contactEmail}</span>
              <span className="muted">{date(t.lastMessageAt)}</span>
            </button>
            <span className={t.unread ? "name" : undefined}>{t.subject || "(no subject)"}{t.messageCount > 1 ? <span className="muted"> · {t.messageCount}</span> : null}</span>
            <span className="muted clamp">{t.snippet}</span>
            {open?.id === t.id ? (
              <div className="thread">
                {open.messages === null ? (
                  <p className="muted">Opening…</p>
                ) : (
                  open.messages.map((m) => (
                    <div key={m.id} className="message">
                      <span className="muted">{m.from.name || m.from.email} · {date(m.createdAt)}</span>
                      <p className="text">{m.text}</p>
                    </div>
                  ))
                )}
                <div className="form">
                  <button type="button" className="button" onClick={() => reply(t)}>Reply</button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<ThreadsWidget />)
