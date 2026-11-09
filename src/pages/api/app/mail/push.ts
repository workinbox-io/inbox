import { z } from "zod";
import { and, db, eq, inArray, mailThreads } from "@/db";
import { mailPushSubscriptions } from "@/db/schema/mail-integrations";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { pushConfig, validPushEndpoint } from "@/lib/server/mail/push";
const schema = z.object({ endpoint: z.string().max(2048).refine(validPushEndpoint, "Unsupported push service"), keys: z.object({ p256dh: z.string().regex(/^[\w-]+$/).min(80).max(100), auth: z.string().regex(/^[\w-]+$/).min(20).max(30) }) });
export const GET = handler(async ctx => {
  const threadId = ctx.url.searchParams.get("threadId");
  if (threadId) {
    if (ctx.locals.user?.id !== ctx.url.searchParams.get("userId")) return json({ allowed: false });
    const boxes = await viewerMailboxes(mailViewer(ctx));
    if (!boxes.length) return json({ allowed: false });
    const [thread] = await db.select({ id: mailThreads.id }).from(mailThreads).where(and(eq(mailThreads.id, threadId), inArray(mailThreads.mailboxId, boxes.map(b => b.id)), eq(mailThreads.spam, false)));
    return json({ allowed: !!thread });
  }
  return json({ publicKey: pushConfig().publicKey ?? null });
});
export const POST = handler(async ctx => {
  if (!ctx.locals.user) throw new HttpError(401, "Unauthorized");
  const input = await parseBody(ctx.request, schema);
  const userId = ctx.locals.user.id;
  const existing = await db.select().from(mailPushSubscriptions).where(and(eq(mailPushSubscriptions.orgId, ctx.orgId), eq(mailPushSubscriptions.userId, userId), eq(mailPushSubscriptions.endpoint, input.endpoint)));
  if (existing.length) await db.update(mailPushSubscriptions).set(input.keys).where(eq(mailPushSubscriptions.id, existing[0]!.id));
  else await db.insert(mailPushSubscriptions).values({ id: crypto.randomUUID(), orgId: ctx.orgId, userId, endpoint: input.endpoint, ...input.keys });
  return json({ enabled: true });
});
export const DELETE = handler(async ctx => {
  if (!ctx.locals.user) throw new HttpError(401, "Unauthorized");
  const { endpoint } = await parseBody(ctx.request, z.object({ endpoint: z.string().max(2048) }));
  await db.delete(mailPushSubscriptions).where(and(eq(mailPushSubscriptions.orgId, ctx.orgId), eq(mailPushSubscriptions.userId, ctx.locals.user.id), eq(mailPushSubscriptions.endpoint, endpoint)));
  return json({ enabled: false });
});
