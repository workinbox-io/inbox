import * as React from "react"
import { FolderKanban, Plus } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import type { Project } from "@/lib/server/projects"
import { api } from "@/lib/api-client"
import { timeAgo } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmButton } from "@/components/app/confirm-button"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"

/** Dates arrive as ISO strings once the server data is serialized into the island. */
type ProjectRow = Omit<Project, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }

/**
 * Example resource UI: list, create, edit and delete through /api/app/projects. Copy this file as
 * the starting point for your product's first screen.
 */
export function ProjectsPanel(props: { projects: ProjectRow[]; openNew?: boolean }) {
  const [projects, setProjects] = React.useState(props.projects)
  const [editing, setEditing] = React.useState<ProjectRow | "new" | null>(props.openNew ? "new" : null)

  async function refresh() {
    const { projects } = await api<{ projects: ProjectRow[] }>("GET", "/api/app/projects")
    setProjects(projects)
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Projects"
        description="An example resource. Replace it with your product's own."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus />
            New project
          </Button>
        }
      />
      {projects.length ? (
        <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="grid min-w-0 gap-0.5">
                <span className="truncate font-medium">{p.name}</span>
                <span className="text-muted-foreground truncate text-sm">
                  {p.description || "No description"} · created {timeAgo(p.createdAt)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <ConfirmButton
                  title={`Delete ${p.name}?`}
                  description="This can't be undone."
                  confirmLabel="Delete"
                  onConfirm={async () => {
                    try {
                      await api("DELETE", `/api/app/projects/${p.id}`)
                      toast.success(`${p.name} deleted`)
                      await refresh()
                    } catch (e) {
                      toast.error((e as Error).message)
                    }
                  }}
                >
                  <Button size="sm" variant="ghost" className="text-destructive">
                    Delete
                  </Button>
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<FolderKanban />}
          title="No projects yet"
          description="Create your first one to see how resources, plan limits and the audit log fit together."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus />
              New project
            </Button>
          }
        />
      )}
      {editing ? (
        <ProjectDialog
          project={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function ProjectDialog({ project, onClose, onSaved }: { project: ProjectRow | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [pending, setPending] = React.useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const body = { name: String(form.get("name")), description: String(form.get("description")) }
    setPending(true)
    try {
      if (project) await api("PUT", `/api/app/projects/${project.id}`, body)
      else await api("POST", "/api/app/projects", body)
      toast.success(project ? "Project saved" : "Project created")
      await onSaved()
    } catch (e) {
      toast.error((e as Error).message)
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
            <DialogDescription>Names show up in the audit log.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" name="name" defaultValue={project?.name} required maxLength={80} autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea id="project-description" name="description" defaultValue={project?.description} maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {project ? "Save" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
