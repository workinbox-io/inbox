/** Resolve a session or an explicitly granted API key as a mail viewer. */
import { HttpError, type HandlerContext } from "@/lib/server/api";
import type { MailViewer } from "./access";

export function mailViewer(ctx: Pick<HandlerContext, "locals" | "orgId" | "role">): MailViewer {
  if (ctx.locals.apiKeyId) return { orgId: ctx.orgId, role: ctx.role, userId: "", apiKeyId: ctx.locals.apiKeyId };
  const user = ctx.locals.user;
  if (!user) throw new HttpError(401, "Unauthorized");
  return { orgId: ctx.orgId, userId: user.id, role: ctx.role };
}
