import { handler, json } from "@/lib/server/api";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
export const GET = handler(async ctx => json({ mailboxes: (await viewerMailboxes(mailViewer(ctx))).map(b => ({ id: b.id, address: b.address, displayName: b.displayName, kind: b.kind })) }));
