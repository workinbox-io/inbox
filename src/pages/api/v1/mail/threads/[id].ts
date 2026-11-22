import { handler, json } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { getThread } from "@/lib/server/mail/store";
import { mailViewer } from "@/lib/server/mail/viewer";

/** Public reads do not change read flags; the web UI marks its own opened threads read. */
export const GET = handler(async ctx => json(await getThread(ctx.params.id!, await resolveMailboxes(mailViewer(ctx)), { markRead: false })));
