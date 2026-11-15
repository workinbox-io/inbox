import { json, manageHandler } from "@/lib/server/api";
import { listAudit } from "@/lib/server/audit";

/** Newest first: GET ?cursor=&limit= */
export const GET = manageHandler(async ({ orgId, url }) =>
  json(await listAudit(orgId, { cursor: url.searchParams.get("cursor"), limit: Number(url.searchParams.get("limit")) || undefined })),
);
