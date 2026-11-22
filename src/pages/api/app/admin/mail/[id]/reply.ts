import { adminMailboxes, isAdmin } from "@/lib/server/admin";
import { sendAdminMail } from "@/lib/server/admin-mail";
import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { checkAttachments } from "@/lib/server/uploads";
import { adminMailSendSchema } from "@/lib/validation-admin-mail";

/** Staff only: a reply in a thread, from the thread's mailbox. */
export const POST = handler(async ({ locals, params, request, orgId }) => {
  if (!isAdmin(locals.user)) throw new HttpError(404, "Not found");
  const body = await parseBody(request, adminMailSendSchema);
  if (!body.text) throw new HttpError(422, "Write a message");
  const files = await checkAttachments(orgId, body.files);
  return json(await sendAdminMail({ threadId: params.id!, to: body.to, cc: body.cc, text: body.text, files }, adminMailboxes()), 201);
});
