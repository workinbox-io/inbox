import { handler, json } from "@/lib/server/api";
import { driveUsage } from "@/lib/server/drive/quota";

/** Bytes used by the org's drive and its limit (null = unlimited). */
export const GET = handler(async ({ orgId }) => json(await driveUsage(orgId)));
