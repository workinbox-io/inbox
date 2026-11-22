import { handler } from "@/lib/server/api";
import { exportRecords, getCollection } from "@/lib/server/collections";
import { recordsToCsv } from "@/lib/collections/csv";

/** The whole collection as CSV (person fields as e-mails), ready to import again. */
export const GET = handler(async ({ orgId, role, locals, params }) => {
  const collection = await getCollection({ orgId, role, userId: locals.user?.id ?? null }, params.id!);
  const { records, people } = await exportRecords(orgId, collection);
  const name = collection.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "collection";
  return new Response("﻿" + recordsToCsv(collection.fields, records, people), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name.replace(/[^\w -]/g, "") || "collection"}.csv"; filename*=UTF-8''${encodeURIComponent(name)}.csv`,
      "cache-control": "no-store",
    },
  });
});
