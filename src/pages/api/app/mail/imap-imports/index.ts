import { z } from "zod";
import { env } from "cloudflare:workers";
import { HttpError, json, manageHandler, parseBody } from "@/lib/server/api";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { imapImportsRequest } from "@/lib/server/mail/bridge";

// Without the mail bridge (most self-hosted installs) the section just says it's off: no 503 in the console.
export const GET = manageHandler(ctx =>
  env.MAIL_BRIDGE_URL && env.MAIL_BRIDGE_TOKEN ? imapImportsRequest(ctx, "GET") : Promise.resolve(json({ configured: false, imports: [] })));

const schema = z.object({
  id: z.uuid(), mailboxId: z.uuid(),
  imap: z.object({
    host: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/), port: z.literal(993),
    username: z.string().min(1).max(320).regex(/^[^\x00-\x1f\x7f]+$/), password: z.string().min(1).max(4096),
  }),
});

export const POST = manageHandler(async ctx => {
  if (!ctx.locals.user || ctx.locals.apiKeyId) throw new HttpError(403, "Sign in to import mail");
  const input = await parseBody(ctx.request, schema);
  const boxes = await viewerMailboxes({ orgId: ctx.orgId, userId: ctx.locals.user.id, role: ctx.role });
  if (!boxes.some(box => box.id === input.mailboxId)) throw new HttpError(404, "Not found");
  const response = await imapImportsRequest(ctx, "POST", "", input);
  ctx.audit("mail_import.start", { target: input.imap.host, details: { mailboxId: input.mailboxId, source: "imap" } });
  return response;
});
