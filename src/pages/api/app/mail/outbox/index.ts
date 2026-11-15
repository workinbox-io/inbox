import { handler, json } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { listOutboxJobs } from "@/lib/server/mail/outbox";
export const GET = handler(async ctx => json({ jobs: await listOutboxJobs(await resolveMailboxes(mailViewer(ctx))) }));
