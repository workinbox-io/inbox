import { handler, json } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { getThread } from "@/lib/server/mail/store";
import { contactByEmail } from "@/lib/server/contacts";
import { mailViewer } from "@/lib/server/mail/viewer";
import { mailInvite } from "@/lib/server/calendar/inbound";

/** A thread with its messages, the person's other threads and their address-book entry; opening it marks it read. */
export const GET = handler(async (ctx) => {
  const detail = await getThread(ctx.params.id!, await resolveMailboxes(mailViewer(ctx)));
  const userId = ctx.locals.user?.id ?? "";
  // Invitations (.ics) get a card with RSVP buttons above the message body.
  const messages = await Promise.all(
    detail.messages.map(async (msg) => ({ ...msg, invite: await mailInvite(ctx.orgId, userId, msg.files).catch(() => null) })),
  );
  return json({ ...detail, messages, contact: await contactByEmail(ctx.orgId, detail.thread.contactEmail) });
});
