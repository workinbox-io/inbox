import { z } from "zod";
import { HttpError } from "@/lib/server/api";
import { defineTool, type McpContext, type Tools } from "./define";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { listThreads, getThread } from "@/lib/server/mail/store";
import { queueMailSend } from "@/lib/server/mail/outbox";
import { mailSendSchema } from "@/lib/validation-mail";
import { checkAttachments } from "@/lib/server/uploads";
const boxes = (ctx: McpContext) => {
  if (!ctx.userId && !ctx.apiKeyId) throw new HttpError(401, "A mail identity is required");
  return viewerMailboxes({ orgId: ctx.orgId, role: ctx.role, userId: ctx.userId ?? "", apiKeyId: ctx.apiKeyId });
};
export const mailTools: Tools = {
  mail_search: defineTool({
    title: "Search mail", description: "Search accessible mailboxes using from:, to:, subject:, has:attachment, is:unread and is:starred.",
    input: z.object({ q: z.string().max(2000), before: z.number().int().positive().optional() }),
    async run(input, ctx) { return listThreads({ ...input, folder: "inbox", boxes: await boxes(ctx) }); },
  }),
  mail_read_thread: defineTool({
    title: "Read mail thread", description: "Read an accessible thread without changing its read status.",
    scope: "read", input: z.object({ id: z.string().uuid() }),
    async run({ id }, ctx) { return getThread(id, await boxes(ctx), { markRead: false }); },
  }),
  mail_send: defineTool({
    title: "Send mail", description: "Queue a message from an explicitly accessible mailbox; returns a durable send job with a 10-second undo window.",
    scope: "write", input: z.object({ message: mailSendSchema, idempotencyKey: z.string().min(1).max(200) }),
    async run({ message, idempotencyKey }, ctx) {
      const files = await checkAttachments(ctx.orgId, message.files);
      const job = await queueMailSend({ ...message, files }, await boxes(ctx), "", { actorUserId: ctx.userId ?? undefined, apiKeyId: ctx.apiKeyId, idempotencyKey });
      ctx.audit("mail_send.queue", { target: job.id });
      return job;
    },
  }),
};
