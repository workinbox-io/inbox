import { MAX_OWNED_ORGS } from "@/config/plans";
import type { OrgRole } from "@/lib/server/roles";

/** Another workspace: hosted only (self-hosted = one company per install), made by an owner or admin, under the cap. */
export const canCreateWorkspace = ({ mode, role, owned }: { mode: string | undefined; role: OrgRole; owned: number }) =>
  mode === "cloud" && (role === "owner" || role === "admin") && owned < MAX_OWNED_ORGS;
