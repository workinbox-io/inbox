/**
 * Your product's MCP tools and widgets. The projects tools are the example: they call the same
 * lib/server functions as the API routes, so limits, org scoping and audit work the same way.
 * The template never edits this file.
 */
import { z } from "zod";
import { mailTools } from "./mail";
import { notesTools } from "./notes";
import { contactsTools } from "./contacts";
import { createProject, deleteProject, getProject, listProjects, updateProject, type Project } from "@/lib/server/projects";
import { projectSchema } from "@/lib/validation";
import { defineTool, type Tools } from "./define";
import projectsWidget from "./widgets/projects.tsx?widget";

const projectOut = (p: Project) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  createdAt: p.createdAt.toISOString(),
});

const projectId = z.object({ id: z.string().min(1).describe("Project id from list_projects") });

export const appTools: Tools = {
  ...mailTools,
  ...notesTools,
  ...contactsTools,
  list_projects: defineTool({
    title: "List projects",
    description: "All projects in the organization, newest first, with their ids, names and descriptions.",
    input: z.object({}),
    widget: "projects",
    async run(_, { orgId }) {
      return { projects: (await listProjects(orgId)).map(projectOut) };
    },
  }),

  get_project: defineTool({
    title: "Get project",
    description: "One project by id.",
    input: projectId,
    async run({ id }, { orgId }) {
      return projectOut(await getProject(orgId, id));
    },
  }),

  create_project: defineTool({
    title: "Create project",
    description: "Creates a project. Fails when the plan's project limit is reached; the error says which plan allows more.",
    input: projectSchema,
    scope: "write",
    async run(input, { orgId, audit }) {
      const project = await createProject(orgId, input);
      audit("project.create", { target: project.name });
      return projectOut(project);
    },
  }),

  update_project: defineTool({
    title: "Update project",
    description: "Renames a project or changes its description. Send both fields; get_project returns the current values.",
    input: projectId.extend(projectSchema.shape),
    scope: "write",
    async run({ id, ...input }, { orgId, audit }) {
      const project = await updateProject(orgId, id, input);
      audit("project.update", { target: project.name });
      return projectOut(project);
    },
  }),

  delete_project: defineTool({
    title: "Delete project",
    description: "Deletes a project for good. Confirm with the user first.",
    input: projectId,
    scope: "write",
    destructive: true,
    async run({ id }, { orgId, audit }) {
      const project = await deleteProject(orgId, id);
      audit("project.delete", { target: project.name });
      return { deleted: projectOut(project) };
    },
  }),
};

/**
 * Widgets (MCP Apps): HTML that Claude and ChatGPT render inline for a tool's result. Files under
 * ./widgets are bundled into one HTML document when imported with `?widget` (see astro.config.mjs).
 */
export const appWidgets: Record<string, { title: string; html: string }> = {
  projects: { title: "Projects", html: projectsWidget },
};
