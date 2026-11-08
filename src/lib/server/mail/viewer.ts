/** The signed-in member as a mail viewer (session only: mail isn't on the API-key API yet). */
import { HttpError, type HandlerContext } from "@/lib/server/api";
import type { MailViewer } from "./access";

export function mailViewer(ctx: Pick<HandlerContext, "locals" | "orgId" | "role">): MailViewer {
  const user = ctx.locals.user;
  if (!user) throw new HttpError(401, "Unauthorized");
  return { orgId: ctx.orgId, userId: user.id, role: ctx.role };
}
