/**
 * Draft card (MCP Apps) for mail_draft: the person checks the message and clicks Send. mail_send and
 * mail_cancel_send are app-only for connected apps, so mail leaves only through this button.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react"
import "./widget.css"
import "./mail.css"

interface Draft {
  threadId: string | null
  mailbox: string
  to: string
  cc: string[]
  subject: string
  text: string
}

type Status = { kind: "editing" } | { kind: "sending" } | { kind: "sent"; jobId: string; undoUntil: number } | { kind: "cancelled" } | { kind: "final" }

const UNDO_MS = 10_000

const textOf = (result: { content?: { type: string; text?: string }[] }) =>
  result.content?.find((c) => c.type === "text")?.text ?? "Something went wrong"

function ComposeWidget() {
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [mailboxes, setMailboxes] = React.useState<string[]>([])
  const [status, setStatus] = React.useState<Status>({ kind: "editing" })
  const [error, setError] = React.useState<string | null>(null)
  // One key per card: a double click or a retry after a lost response never sends twice.
  const key = React.useRef(crypto.randomUUID())
  const { app, error: connectError } = useApp({
    appInfo: { name: "Work Inbox draft", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = (result) => {
        const data = result.structuredContent as { draft?: Draft; mailboxes?: string[] } | undefined
        if (data?.draft) setDraft(data.draft)
        if (data?.mailboxes) setMailboxes(data.mailboxes)
      }
    },
  })
  useHostStyles(app, app?.getHostContext())

  React.useEffect(() => {
    if (status.kind !== "sent") return
    const t = setTimeout(() => setStatus({ kind: "final" }), Math.max(0, status.undoUntil - Date.now()))
    return () => clearTimeout(t)
  }, [status])

  if (connectError) return <p className="error">{connectError.message}</p>
  if (!draft) return <p className="muted">Preparing the message…</p>

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const editable = status.kind === "editing" || status.kind === "cancelled"

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!app || !draft) return
    setStatus({ kind: "sending" })
    setError(null)
    try {
      const message = {
        mailbox: draft.mailbox,
        to: draft.to,
        cc: draft.cc.filter(Boolean),
        ...(draft.threadId ? {} : { subject: draft.subject }),
        text: draft.text,
      }
      const res = await app.callServerTool({ name: "mail_send", arguments: { message, threadId: draft.threadId ?? undefined, idempotencyKey: key.current } })
      if (res.isError) {
        setError(textOf(res))
        return setStatus({ kind: "editing" })
      }
      const job = res.structuredContent as { id: string; sendAt?: number }
      setStatus({ kind: "sent", jobId: job.id, undoUntil: job.sendAt ?? Date.now() + UNDO_MS })
    } catch (err) {
      setError((err as Error).message)
      setStatus({ kind: "editing" })
    }
  }

  async function undo() {
    if (!app || status.kind !== "sent") return
    const res = await app.callServerTool({ name: "mail_cancel_send", arguments: { id: status.jobId } })
    if (res.isError) return setError(textOf(res))
    // A changed message after Undo is a new request: it needs a new key.
    key.current = crypto.randomUUID()
    setStatus({ kind: "cancelled" })
  }

  return (
    <form className="widget" onSubmit={send}>
      <div className="header">
        <h2 className="title">{draft.threadId ? "Reply" : "New message"}</h2>
        <span className="muted">{status.kind === "final" ? "Sent" : status.kind === "sent" ? "Sending…" : "Not sent yet"}</span>
      </div>
      <div className="fields">
        <label className="field">
          <span className="muted">From</span>
          {mailboxes.length > 1 && !draft.threadId ? (
            <select className="input" value={draft.mailbox} disabled={!editable} onChange={(e) => set({ mailbox: e.target.value })}>
              {mailboxes.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <span>{draft.mailbox}</span>
          )}
        </label>
        <label className="field">
          <span className="muted">To</span>
          <input className="input" type="email" required value={draft.to} disabled={!editable} onChange={(e) => set({ to: e.target.value })} />
        </label>
        <label className="field">
          <span className="muted">Cc</span>
          <input className="input" value={draft.cc.join(", ")} disabled={!editable} onChange={(e) => set({ cc: e.target.value.split(",").map((s) => s.trim()) })} />
        </label>
        <label className="field">
          <span className="muted">Subject</span>
          <input className="input" value={draft.subject} disabled={!editable || !!draft.threadId} onChange={(e) => set({ subject: e.target.value })} />
        </label>
        <textarea className="input body" aria-label="Message" required rows={8} value={draft.text} disabled={!editable} onChange={(e) => set({ text: e.target.value })} />
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="form">
        {status.kind === "sent" ? (
          <button className="button" type="button" onClick={undo}>Undo</button>
        ) : status.kind === "final" ? (
          <span className="muted">Delivered to the outbox. You'll find it in Work Inbox under Sent.</span>
        ) : (
          <button className="button" type="submit" disabled={status.kind === "sending" || !draft.to || !draft.text.trim()}>
            {status.kind === "sending" ? "Sending…" : "Send"}
          </button>
        )}
      </div>
    </form>
  )
}

createRoot(document.getElementById("root")!).render(<ComposeWidget />)
