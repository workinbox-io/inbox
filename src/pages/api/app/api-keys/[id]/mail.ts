import { z } from "zod";
import { and, apiKeys, db, eq, inArray, mailboxes } from "@/db";
import { mailApiAccess } from "@/db/schema/mail-integrations";
import { HttpError, json, manageHandler, parseBody } from "@/lib/server/api";
async function key(orgId: string, id: string) {
  const [found] = await db.select().from(apiKeys).where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.id, id)));
  if (!found) throw new HttpError(404, "Not found");
}
export const GET = manageHandler(async ctx => {
  await key(ctx.orgId, ctx.params.id!);
  const [boxes, grants] = await Promise.all([
    db.select({ id: mailboxes.id, address: mailboxes.address }).from(mailboxes).where(eq(mailboxes.orgId, ctx.orgId)),
    db.select().from(mailApiAccess).where(eq(mailApiAccess.apiKeyId, ctx.params.id!)),
  ]);
  return json({ mailboxes: boxes, selected: grants.map(g => g.mailboxId) });
});
export const PUT = manageHandler(async ctx => {
  await key(ctx.orgId, ctx.params.id!);
  const { mailboxIds } = await parseBody(ctx.request, z.object({ mailboxIds: z.array(z.string().uuid()).max(500) }));
  const ids = [...new Set(mailboxIds)];
  const allowed = ids.length ? await db.select({ id: mailboxes.id }).from(mailboxes).where(and(eq(mailboxes.orgId, ctx.orgId), inArray(mailboxes.id, ids))) : [];
  if (allowed.length !== ids.length) throw new HttpError(404, "Mailbox not found");
  await db.batch([
    db.delete(mailApiAccess).where(eq(mailApiAccess.apiKeyId, ctx.params.id!)),
    ...ids.map(mailboxId => db.insert(mailApiAccess).values({ apiKeyId: ctx.params.id!, mailboxId })),
  ]);
  ctx.audit("api_key.mail_access", { target: ctx.params.id!, details: { mailboxIds: ids } });
  return json({ selected: ids });
});
