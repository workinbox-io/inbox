import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { deleteThreads, listThreads, sendMail, unreadCounts, updateThreads } from "@/lib/server/mail/store";
import { mailViewer } from "@/lib/server/mail/viewer";
import { announce, readMailThreadNotifications } from "@/lib/server/notifications";
import { checkDraftFiles } from "@/lib/server/mail/draft-files";
import { requireDraftVersion } from "@/lib/server/mail/drafts";
import { ALL_MAILBOXES } from "@/lib/admin-mail/rules";
import { USER_MAIL_FOLDERS, type UserMailFolder } from "@/lib/mail/rules";
import { mailDeleteSchema, mailSendSchema, mailUpdateSchema } from "@/lib/validation-mail";

/** Threads of one mailbox or all (?mailbox=all), in a folder (?folder=, ?unread=1 = unread only), or matching ?q=; ?before= pages. */
export const GET = handler(async (ctx) => {
  const viewer = mailViewer(ctx);
  const all = await resolveMailboxes(viewer);
  const mailbox = ctx.url.searchParams.get("mailbox") ?? ALL_MAILBOXES;
  const boxes = mailbox === ALL_MAILBOXES ? all.filter((b) => b.followed !== false) : all.filter((b) => b.address === mailbox);
  if (!boxes.length && mailbox !== ALL_MAILBOXES) throw new HttpError(404, "Not found");
  const param = ctx.url.searchParams.get("folder") as UserMailFolder | null;
  const folder = param && USER_MAIL_FOLDERS.includes(param) ? param : "inbox";
  const before = Number(ctx.url.searchParams.get("before")) || undefined;
  const [list, unread] = await Promise.all([listThreads({ boxes, folder, q: ctx.url.searchParams.get("q") ?? undefined, before, unread: ctx.url.searchParams.get("unread") === "1" }), unreadCounts(all)]);
  return json({ ...list, unread });
});

/** A new e-mail, or a forward (forwardOf), from one of the viewer's mailboxes. */
export const POST = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  const body = await parseBody(ctx.request, mailSendSchema);
  if (!body.forwardOf && !body.subject) throw new HttpError(422, "Add a subject");
  const owner = { orgId: ctx.orgId, userId: ctx.locals.user!.id, role: ctx.role, boxes };
  if (body.draftKey) {
    if (body.expectedUpdatedAt === undefined) throw new HttpError(422, "Provide the draft version");
    await requireDraftVersion(owner, body.draftKey, body.expectedUpdatedAt);
  }
  const files = await checkDraftFiles(owner, body.files);
  const job = await sendMail({ ...body, files }, boxes, ctx.locals.user!.name, { actorUserId: ctx.locals.user!.id, idempotencyKey: ctx.request.headers.get("Idempotency-Key") ?? body.idempotencyKey });
  return json(job, 202);
});

export const PATCH = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  const { ids, ...patch } = await parseBody(ctx.request, mailUpdateSchema);
  const updated = await updateThreads(ids, boxes, patch);
  // The person's other tabs and the bell recount; reading here clears the threads' notifications like opening them.
  const userId = ctx.locals.user?.id;
  if (userId) await (patch.unread === false ? readMailThreadNotifications(ctx.orgId, userId, ids) : announce(ctx.orgId, [userId]));
  return json({ updated });
});

export const DELETE = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  const { ids } = await parseBody(ctx.request, mailDeleteSchema);
  return json({ deleted: await deleteThreads(ids, boxes) });
});
