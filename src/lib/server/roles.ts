export type OrgRole = "owner" | "admin" | "member";

/** Unknown roles (e.g. custom ones added later) get the least access. */
export const toRole = (role: string | null | undefined): OrgRole =>
  role === "owner" || role === "admin" ? role : "member";

/**
 * Owners and admins manage what costs money or changes security: billing, API keys,
 * the organization itself. Members do the day-to-day work.
 */
export const canManage = (role: OrgRole | null | undefined) => role === "owner" || role === "admin";

export const MANAGE_ONLY = "Only owners and admins of this organization can do this.";
