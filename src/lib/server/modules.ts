/** Which apps an organization has turned off (config/modules.ts). */
import { and, db, eq, orgModules } from "@/db";
import { OPTIONAL_MODULES, type ModuleId } from "@/config/modules";

export async function disabledModules(orgId: string): Promise<ModuleId[]> {
  const rows = await db.select({ id: orgModules.moduleId }).from(orgModules).where(and(eq(orgModules.orgId, orgId), eq(orgModules.enabled, false)));
  return rows.map((r) => r.id as ModuleId).filter((id) => OPTIONAL_MODULES.includes(id));
}

export const moduleOn = async (orgId: string, id: ModuleId) => !(await disabledModules(orgId)).includes(id);

export async function listModules(orgId: string) {
  const off = await disabledModules(orgId);
  return OPTIONAL_MODULES.map((id) => ({ id, enabled: !off.includes(id) }));
}

/** Returns whether anything changed. */
export async function setModule(orgId: string, moduleId: ModuleId, enabled: boolean) {
  const before = !(await disabledModules(orgId)).includes(moduleId);
  if (before === enabled) return false;
  await db
    .insert(orgModules)
    .values({ orgId, moduleId, enabled })
    .onConflictDoUpdate({ target: [orgModules.orgId, orgModules.moduleId], set: { enabled, updatedAt: new Date() } });
  return true;
}
