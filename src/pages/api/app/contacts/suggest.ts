import { handler, json } from "@/lib/server/api";
import { suggestContacts } from "@/lib/server/contacts";

/** Composer autocomplete: ?q= (contacts, our own people and shared mailboxes, groups). */
export const GET = handler(async (ctx) => {
  const q = (ctx.url.searchParams.get("q") ?? "").trim().slice(0, 100);
  return json({ suggestions: q ? await suggestContacts(ctx.orgId, q) : [] });
});
