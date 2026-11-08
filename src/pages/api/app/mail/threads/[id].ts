import { handler, json } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { getThread } from "@/lib/server/mail/store";
import { mailViewer } from "@/lib/server/mail/viewer";

/** A thread with its messages and the person's other threads; opening it marks it read. */
export const GET = handler(async (ctx) => json(await getThread(ctx.params.id!, await resolveMailboxes(mailViewer(ctx)))));
