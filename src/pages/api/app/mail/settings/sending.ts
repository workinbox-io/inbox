import { z } from "zod";
import { manageHandler, json, parseBody } from "@/lib/server/api";
import { getSendingLimits, orgReputation, orgSendingCaps, setSendingLimit } from "@/lib/server/mail/outbox";
export const GET = manageHandler(async ctx => {
  const [limits, caps, reputation] = await Promise.all([getSendingLimits(ctx.orgId), orgSendingCaps(ctx.orgId), orgReputation(ctx.orgId)]);
  return json({ orgId: ctx.orgId, limits, defaults: { mailbox: 500, organization: 5000 }, caps, reputation });
});
export const POST = manageHandler(async ctx => {
  const body = await parseBody(ctx.request, z.object({ mailboxId: z.string().uuid().nullable(), dailyRecipients: z.number().int().min(0).max(1_000_000) }));
  await setSendingLimit(ctx.orgId, body.mailboxId, body.dailyRecipients);
  ctx.audit("mail_send.limit", { target: body.mailboxId ?? "organization", details: { dailyRecipients: body.dailyRecipients } });
  return json({ ok: true });
});
