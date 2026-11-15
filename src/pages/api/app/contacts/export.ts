import { handler } from "@/lib/server/api";
import { exportContacts } from "@/lib/server/contacts";
import { toCsv, toVcards } from "@/lib/contacts/import";

/** The whole address book as ?format=vcf (vCard 3.0) or csv (Google Contacts columns). */
export const GET = handler(async (ctx) => {
  const csv = ctx.url.searchParams.get("format") === "csv";
  const list = await exportContacts(ctx.orgId);
  return new Response(csv ? toCsv(list) : toVcards(list), {
    headers: {
      "content-type": csv ? "text/csv; charset=utf-8" : "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="contacts.${csv ? "csv" : "vcf"}"`,
      "cache-control": "no-store",
    },
  });
});
