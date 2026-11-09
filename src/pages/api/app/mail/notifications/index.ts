import { env } from "cloudflare:workers";
import { z } from "zod";
import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";

export const GET = handler(async ctx => {
  if (!ctx.locals.user || ctx.locals.apiKeyId) throw new HttpError(401, "Unauthorized");
  const boxes = await viewerMailboxes(mailViewer(ctx));
  if (!boxes.length) return json({ notifications: [], unread: 0 });
  const placeholders = boxes.map(() => "?").join(",");
  const args = [ctx.orgId, ctx.locals.user.id, ...boxes.map(b => b.id)];
  const where = `n.org_id = ? AND n.user_id = ? AND n.mailbox_id IN (${placeholders})`;
  const rows = await env.DB.prepare(`SELECT n.id, n.thread_id AS threadId, n.created_at AS createdAt, n.read_at AS readAt, m.subject, m.from_email AS sender FROM mail_notifications n JOIN mail_messages m ON m.id = n.message_id WHERE ${where} ORDER BY n.created_at DESC LIMIT 100`).bind(...args).all();
  const count = await env.DB.prepare(`SELECT count(*) AS total FROM mail_notifications n WHERE ${where} AND n.read_at IS NULL`).bind(...args).first<{ total: number }>();
  return json({ notifications: rows.results, unread: count?.total ?? 0 });
});
export const PATCH = handler(async ctx => {
  if (!ctx.locals.user || ctx.locals.apiKeyId) throw new HttpError(401, "Unauthorized");
  const { id } = await parseBody(ctx.request, z.object({ id: z.string().min(1).max(100) }));
  const boxes = await viewerMailboxes(mailViewer(ctx));
  if (!boxes.length) throw new HttpError(404, "Not found");
  const result = await env.DB.prepare(`UPDATE mail_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND org_id = ? AND user_id = ? AND mailbox_id IN (${boxes.map(() => "?").join(",")})`).bind(Date.now(), id, ctx.orgId, ctx.locals.user.id, ...boxes.map(b => b.id)).run();
  if (!result.meta.changes) throw new HttpError(404, "Not found");
  return json({ ok: true });
});
