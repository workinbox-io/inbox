import type { APIRoute } from "astro";
import { getStatusOverview } from "@/lib/server/status";

/** Public, machine-readable version of /status. */
export const GET: APIRoute = async () =>
  Response.json(await getStatusOverview(), { headers: { "Cache-Control": "public, max-age=30" } });
