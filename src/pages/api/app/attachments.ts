import { handler, json } from "@/lib/server/api";
import { storeAttachment } from "@/lib/server/uploads";

/** A signed-in user uploads a file to attach (e-mails in the staff mailbox): raw body plus an X-Filename header. */
export const POST = handler(async ({ request, orgId }) => json(await storeAttachment(orgId, request), 201));
