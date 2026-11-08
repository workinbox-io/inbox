import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { deleteThreads, listThreads, sendMail, unreadCounts, updateThreads } from "@/lib/server/mail/store";
import { mailViewer } from "@/lib/server/mail/viewer";
import { checkAttachments } from "@/lib/server/uploads";
import { ALL_MAILBOXES } from "@/lib/admin-mail/rules";
import { USER_MAIL_FOLDERS, type UserMailFolder } from "@/lib/mail/rules";
import { mailDeleteSchema, mailSendSchema, mailUpdateSchema } from "@/lib/validation-mail";

/** Threads of one mailbox or all (?mailbox=all), in a folder (?folder=), or matching ?q=; ?before= pages. */
export const GET = handler(async (ctx) => {
  const viewer = mailViewer(ctx);
  const all = await resolveMailboxes(viewer);
  const mailbox = ctx.url.searchParams.get("mailbox") ?? ALL_MAILBOXES;
  const boxes = mailbox === ALL_MAILBOXES ? all : all.filter((b) => b.address === mailbox);
  if (!boxes.length && mailbox !== ALL_MAILBOXES) throw new HttpError(404, "Not found");
  const param = ctx.url.searchParams.get("folder") as UserMailFolder | null;
  const folder = param && USER_MAIL_FOLDERS.includes(param) ? param : "inbox";
  const before = Number(ctx.url.searchParams.get("before")) || undefined;
  const [list, unread] = await Promise.all([listThreads({ boxes, folder, q: ctx.url.searchParams.get("q") ?? undefined, before }), unreadCounts(all)]);
  return json({ ...list, unread });
});

/** A new e-mail, or a forward (forwardOf), from one of the viewer's mailboxes. */
export const POST = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  const body = await parseBody(ctx.request, mailSendSchema);
  if (!body.forwardOf && !body.subject) throw new HttpError(422, "Add a subject");
  const files = await checkAttachments(ctx.orgId, body.files);
  return json(await sendMail({ ...body, files }, boxes, ctx.locals.user!.name), 201);
});

export const PATCH = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  const { ids, ...patch } = await parseBody(ctx.request, mailUpdateSchema);
  return json({ updated: await updateThreads(ids, boxes, patch) });
});

export const DELETE = handler(async (ctx) => {
  const boxes = await resolveMailboxes(mailViewer(ctx));
  const { ids } = await parseBody(ctx.request, mailDeleteSchema);
  return json({ deleted: await deleteThreads(ids, boxes) });
});
