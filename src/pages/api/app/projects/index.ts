import { handler, json, parseBody } from "@/lib/server/api";
import { createProject, listProjects } from "@/lib/server/projects";
import { projectSchema } from "@/lib/validation";

export const GET = handler(async ({ orgId }) => json({ projects: await listProjects(orgId) }));

export const POST = handler(async ({ request, orgId, audit }) => {
  const project = await createProject(orgId, await parseBody(request, projectSchema));
  audit("project.create", { target: project.name });
  return json(project, 201);
});
