import { adminMailboxes, isAdmin } from "@/lib/server/admin";
import { adminUnreadCounts, deleteAdminThreads, listAdminThreads, sendAdminMail, updateAdminThreads } from "@/lib/server/admin-mail";
import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { checkAttachments } from "@/lib/server/uploads";
import { ALL_MAILBOXES, MAIL_FOLDERS, type MailFolder } from "@/lib/admin-mail/rules";
import { adminMailDeleteSchema, adminMailSendSchema, adminMailUpdateSchema } from "@/lib/validation-admin-mail";

/** Staff only (404 for everyone else): every route here works on the ADMIN_MAILBOXES. */
function staff(user: App.Locals["user"]) {
  if (!isAdmin(user)) throw new HttpError(404, "Not found");
  return adminMailboxes();
}

/** Threads of one mailbox or all (?mailbox=all), in a folder (?folder=), or matching ?q=; ?before= pages. */
export const GET = handler(async ({ locals, url }) => {
  const boxes = staff(locals.user);
  const mailbox = url.searchParams.get("mailbox") ?? ALL_MAILBOXES;
  if (mailbox !== ALL_MAILBOXES && !boxes.includes(mailbox)) throw new HttpError(404, "Not found");
  const param = url.searchParams.get("folder") as MailFolder | null;
  const folder = param && MAIL_FOLDERS.includes(param) ? param : "inbox";
  const before = Number(url.searchParams.get("before")) || undefined;
  const [list, unread] = await Promise.all([
    listAdminThreads({ mailboxes: mailbox === ALL_MAILBOXES ? boxes : [mailbox], folder, q: url.searchParams.get("q") ?? undefined, before }),
    adminUnreadCounts(boxes),
  ]);
  return json({ ...list, unread });
});

/** A new e-mail, or a forward (forwardOf), from one of the mailboxes. */
export const POST = handler(async ({ locals, request, orgId }) => {
  const boxes = staff(locals.user);
  const body = await parseBody(request, adminMailSendSchema);
  if (!body.forwardOf && !body.subject) throw new HttpError(422, "Add a subject");
  const files = await checkAttachments(orgId, body.files);
  return json(await sendAdminMail({ mailbox: body.mailbox, forwardOf: body.forwardOf, to: body.to, cc: body.cc, subject: body.subject, text: body.text, files }, boxes), 201);
});

/** Archive, trash, snooze or mark read/unread, one thread or many. */
export const PATCH = handler(async ({ locals, request }) => {
  const boxes = staff(locals.user);
  const { ids, ...patch } = await parseBody(request, adminMailUpdateSchema);
  return json({ updated: await updateAdminThreads(ids, boxes, patch) });
});

/** Deletes threads from the trash for good. */
export const DELETE = handler(async ({ locals, request }) => {
  const boxes = staff(locals.user);
  const { ids } = await parseBody(request, adminMailDeleteSchema);
  return json({ deleted: await deleteAdminThreads(ids, boxes) });
});
