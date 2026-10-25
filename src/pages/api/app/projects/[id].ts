import { handler, json, parseBody } from "@/lib/server/api";
import { deleteProject, getProject, updateProject } from "@/lib/server/projects";
import { projectSchema } from "@/lib/validation";

export const GET = handler(async ({ orgId, params }) => json(await getProject(orgId, params.id)));

export const PUT = handler(async ({ request, orgId, params, audit }) => {
  const project = await updateProject(orgId, params.id, await parseBody(request, projectSchema));
  audit("project.update", { target: project.name });
  return json(project);
});

export const DELETE = handler(async ({ orgId, params, audit }) => {
  const project = await deleteProject(orgId, params.id);
  audit("project.delete", { target: project.name });
  return json({ ok: true });
});
