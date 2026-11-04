import type { APIContext } from "astro";
import type { z } from "zod";
import type { AuditAction } from "@/config/audit";
import { apiKeys, db, eq } from "@/db";
import { recordAudit, type AuditActor } from "./audit";
import { reportError } from "./errors";
import { MANAGE_ONLY, canManage, type OrgRole } from "./roles";
import { t } from "@/lib/i18n/panel";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export interface AuditNote {
  /** What was changed, e.g. the project name. */
  target?: string | null;
  /** Non-secret extras only; never passwords, keys or tokens. */
  details?: Record<string, unknown>;
}

export type HandlerContext = APIContext & {
  orgId: string;
  role: OrgRole;
  /** Notes a change for the audit log; it's written only if the endpoint succeeds. */
  audit: (action: AuditAction, note?: AuditNote) => void;
};

/** The visitor's IP as Cloudflare saw it; can't be spoofed with X-Forwarded-For. */
export function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}

async function auditActor(locals: App.Locals): Promise<AuditActor | null> {
  if (locals.apiKeyId) {
    const [key] = await db.select({ name: apiKeys.name }).from(apiKeys).where(eq(apiKeys.id, locals.apiKeyId));
    return { type: "api_key", id: locals.apiKeyId, name: key?.name ?? "API key" };
  }
  if (locals.user) return { type: "user", id: locals.user.id, name: locals.user.name, email: locals.user.email };
  return null;
}

/**
 * Wraps an endpoint under /api/app or /api/v1 so thrown HttpErrors become JSON responses and
 * unexpected errors are reported. `manage: true` limits it to owners and admins (see roles.ts).
 */
export function handler(fn: (ctx: HandlerContext) => Promise<Response>, opts: { manage?: boolean } = {}) {
  return async (ctx: APIContext) => {
    const orgId = ctx.locals.orgId;
    const role = ctx.locals.role ?? "member";
    if (!orgId) return json({ error: t("Unauthorized") }, 401);
    if (opts.manage && !canManage(role)) return json({ error: t(MANAGE_ONLY) }, 403);
    const notes: (AuditNote & { action: AuditAction })[] = [];
    const audit = (action: AuditAction, note: AuditNote = {}) => void notes.push({ action, ...note });
    try {
      const res = await fn(Object.assign(ctx, { orgId, role, audit }));
      if (res.ok && notes.length) {
        const actor = await auditActor(ctx.locals);
        const ip = clientIp(ctx.request) || null;
        if (actor) for (const n of notes) await recordAudit({ orgId, actor, ip, ...n });
      }
      return res;
    } catch (e) {
      // Messages in the user's language where the dictionaries have them (/api/app runs in the request's locale).
      if (e instanceof HttpError) return json({ error: t(e.message), details: e.details }, e.status);
      await reportError("web", e, { route: `${ctx.request.method} ${ctx.url.pathname}`, orgId });
      return json({ error: t("Internal error") }, 500);
    }
  };
}

/** `handler` for owners and admins only. */
export const manageHandler = (fn: Parameters<typeof handler>[0]) => handler(fn, { manage: true });

export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(422, first?.message ?? "Invalid input", parsed.error.issues);
  }
  return parsed.data;
}
