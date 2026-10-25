import type { APIRoute } from "astro";
import { db, sql } from "@/db";

/** Uptime probe: answers 503 when D1 isn't reachable, so monitors can alert. */
export const GET: APIRoute = async () => {
  try {
    await db.run(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};
