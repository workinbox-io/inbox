import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import type { AuditAction } from "@/config/audit";
import { db, eq, user } from "@/db";
import { recordAudit } from "./audit";

type Row = Record<string, unknown> & { organizationId?: string; userId?: string; email?: string; role?: string };

const userLabel = async (id: string | undefined) => {
  if (!id) return null;
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, id));
  return u?.email ?? null;
};

/** Team endpoints of the organization plugin → audit action, org and target. */
const TEAM: Record<string, (r: Row & { member?: Row; invitation?: Row }) => Promise<[AuditAction, Row | undefined, string | null, object?]>> = {
  "/organization/invite-member": async (r) => ["member.invite", r, r.email ?? null, { role: r.role }],
  "/organization/cancel-invitation": async (r) => ["member.invite_cancel", r, r.email ?? null],
  "/organization/accept-invitation": async (r) => ["member.join", r.member, null, { role: r.member?.role }],
  "/organization/remove-member": async (r) => ["member.remove", r.member, await userLabel(r.member?.userId)],
  "/organization/update-member-role": async (r) => ["member.role", r, await userLabel(r.userId), { role: r.role }],
  "/organization/leave": async (r) => ["member.leave", r, null],
};

/**
 * Better Auth `hooks.after`: records successful team changes. The actor is the signed-in user;
 * the org comes from what the endpoint returned, so it's right even without an active org.
 */
export const auditTeamChange = createAuthMiddleware(async (ctx) => {
  const describe = TEAM[ctx.path];
  const returned = ctx.context.returned;
  if (!describe || !returned || returned instanceof Error || returned instanceof Response) return;
  const session = ctx.context.session ?? (await getSessionFromCtx(ctx).catch(() => null));
  if (!session) return;
  const [action, row, target, details] = await describe(returned as Row);
  if (!row?.organizationId) return;
  const ip = ctx.headers?.get("cf-connecting-ip") ?? null;
  await recordAudit({
    orgId: row.organizationId,
    actor: { type: "user", id: session.user.id, name: session.user.name, email: session.user.email },
    action,
    target,
    details: details as Record<string, unknown> | undefined,
    ip,
  });
});
