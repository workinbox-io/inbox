import { AUDIT_RETENTION_DAYS, type AuditAction } from "@/config/audit";
import { and, auditLog, db, desc, eq, lt, or, type SQL } from "@/db";

/**
 * Audit log of changes in the dashboard and API. Entries are written by `handler()` after a change
 * succeeds and by the Better Auth hooks for team changes (auth-audit.ts).
 */

export interface AuditActor {
  type: "user" | "api_key";
  id: string | null;
  name: string;
  email?: string | null;
}

export interface AuditEntry {
  orgId: string;
  actor: AuditActor;
  action: AuditAction;
  target?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

/** Never throws: a failed audit write must not fail the change it describes. */
export async function recordAudit(e: AuditEntry) {
  try {
    await db.insert(auditLog).values({
      orgId: e.orgId,
      actorType: e.actor.type,
      actorId: e.actor.id,
      actorName: e.actor.name,
      actorEmail: e.actor.email ?? null,
      action: e.action,
      target: e.target ?? null,
      details: e.details && Object.keys(e.details).length ? e.details : null,
      ip: e.ip ?? null,
    });
  } catch (err) {
    console.error(`[audit] ${e.action}: ${(err as Error).message}`);
  }
}

export interface AuditRow {
  id: string;
  createdAt: string;
  actorType: "user" | "api_key";
  actorName: string;
  actorEmail: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
}

const cursorOf = (r: { createdAt: Date; id: string }) => `${r.createdAt.getTime()}_${r.id}`;

/** Newest first; pass `nextCursor` back as `cursor` for the next page. */
export async function listAudit(
  orgId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<{ rows: AuditRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where: SQL[] = [eq(auditLog.orgId, orgId)];
  const [at, id] = opts.cursor?.split("_") ?? [];
  const before = at ? new Date(Number(at)) : null;
  if (before && !Number.isNaN(before.getTime()) && id) {
    where.push(or(lt(auditLog.createdAt, before), and(eq(auditLog.createdAt, before), lt(auditLog.id, id)))!);
  }
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...where))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    rows: page.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      actorType: r.actorType,
      actorName: r.actorName,
      actorEmail: r.actorEmail,
      action: r.action,
      target: r.target,
      details: r.details ?? null,
      ip: r.ip,
    })),
    nextCursor: rows.length > limit ? cursorOf(page.at(-1)!) : null,
  };
}

export async function cleanupAuditLog(days = AUDIT_RETENTION_DAYS) {
  await db.delete(auditLog).where(lt(auditLog.createdAt, new Date(Date.now() - days * 86_400_000)));
}
