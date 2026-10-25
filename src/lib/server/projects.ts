/**
 * Example resource: the pattern for your product's domain logic. Routes stay thin and call these;
 * everything is scoped to the org, and plan limits are checked here, not in the UI.
 */
import { withinLimit } from "@/config/plans";
import { and, count, db, desc, eq, projects } from "@/db";
import type { ProjectInput } from "@/lib/validation";
import { HttpError } from "./api";
import { requireActivePlan } from "./org";
import { enqueue } from "./queue";

export async function listProjects(orgId: string) {
  return db.select().from(projects).where(eq(projects.orgId, orgId)).orderBy(desc(projects.createdAt));
}

export async function getProject(orgId: string, id: string | undefined) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id ?? ""), eq(projects.orgId, orgId)));
  if (!row) throw new HttpError(404, "Project not found");
  return row;
}

export async function createProject(orgId: string, input: ProjectInput) {
  const plan = await requireActivePlan(orgId);
  const [used] = await db.select({ n: count() }).from(projects).where(eq(projects.orgId, orgId));
  if (!withinLimit(plan, "projects", used?.n ?? 0)) {
    throw new HttpError(402, `Your ${plan.name} plan includes ${plan.projects} projects. Upgrade to add more.`);
  }
  const [row] = await db.insert(projects).values({ orgId, ...input }).returning();
  await enqueue("project.created", { projectId: row!.id });
  return row!;
}

export async function updateProject(orgId: string, id: string | undefined, input: ProjectInput) {
  await getProject(orgId, id);
  const [row] = await db
    .update(projects)
    .set(input)
    .where(and(eq(projects.id, id!), eq(projects.orgId, orgId)))
    .returning();
  return row!;
}

export async function deleteProject(orgId: string, id: string | undefined) {
  const project = await getProject(orgId, id);
  await db.delete(projects).where(and(eq(projects.id, project.id), eq(projects.orgId, orgId)));
  return project;
}

export type Project = typeof projects.$inferSelect;
