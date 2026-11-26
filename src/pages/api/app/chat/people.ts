import { handler, json } from "@/lib/server/api";
import { notePeople } from "@/lib/server/notes/notes";

/** Members of the organization: authors, DMs and @mentions. */
export const GET = handler(async ({ orgId }) => json({ people: await notePeople(orgId) }));
