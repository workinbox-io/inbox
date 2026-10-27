/**
 * Projects widget (MCP Apps): renders list_projects in Claude and ChatGPT, and creates projects
 * through the host with create_project. Bundled into HTML by scripts/mcp-widgets.ts.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react"
import "./widget.css"

interface Project {
  id: string
  name: string
  description: string
  createdAt: string
}

const projectsOf = (data: unknown): Project[] | null => {
  const list = (data as { projects?: unknown } | undefined)?.projects
  return Array.isArray(list) ? (list as Project[]) : null
}

const textOf = (result: { content?: { type: string; text?: string }[] }) =>
  result.content?.find((c) => c.type === "text")?.text ?? "Something went wrong"

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

function ProjectsWidget() {
  const [projects, setProjects] = React.useState<Project[] | null>(null)
  const [name, setName] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const { app, error: connectError } = useApp({
    appInfo: { name: "Projects", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = (result) => setProjects(projectsOf(result.structuredContent))
    },
  })
  useHostStyles(app, app?.getHostContext())

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!app || !name.trim()) return
    setPending(true)
    setError(null)
    try {
      const created = await app.callServerTool({ name: "create_project", arguments: { name: name.trim(), description: "" } })
      if (created.isError) return setError(textOf(created))
      setName("")
      const list = await app.callServerTool({ name: "list_projects", arguments: {} })
      setProjects(projectsOf(list.structuredContent) ?? projects)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  if (connectError) return <p className="error">{connectError.message}</p>
  if (!projects) return <p className="muted">Loading projects…</p>

  return (
    <div className="widget">
      <div className="header">
        <h2 className="title">Projects</h2>
        <span className="muted">{projects.length}</span>
      </div>
      {projects.length ? (
        <ul className="list">
          {projects.map((p) => (
            <li key={p.id} className="item">
              <span className="name">{p.name}</span>
              <span className="muted">{p.description || `Created ${date(p.createdAt)}`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No projects yet.</p>
      )}
      <form className="form" onSubmit={create}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New project name" maxLength={80} aria-label="New project name" />
        <button className="button" type="submit" disabled={pending || !name.trim()}>
          {pending ? "Adding…" : "Add"}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<ProjectsWidget />)
