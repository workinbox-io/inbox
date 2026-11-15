import { adminMailboxes, isAdmin } from "@/lib/server/admin";
import { getMailboxSettings, setMailboxSignature } from "@/lib/server/admin-mail";
import { handler, HttpError, json, parseBody } from "@/lib/server/api";
import { adminMailSignatureSchema } from "@/lib/validation-admin-mail";

/** Staff only: each mailbox's signature. */
export const GET = handler(async ({ locals }) => {
  if (!isAdmin(locals.user)) throw new HttpError(404, "Not found");
  return json({ settings: await getMailboxSettings(adminMailboxes()) });
});

export const PUT = handler(async ({ locals, request }) => {
  if (!isAdmin(locals.user)) throw new HttpError(404, "Not found");
  const body = await parseBody(request, adminMailSignatureSchema);
  if (!adminMailboxes().includes(body.mailbox)) throw new HttpError(404, "Not found");
  await setMailboxSignature(body.mailbox, body.signature);
  return json({ ok: true });
});
