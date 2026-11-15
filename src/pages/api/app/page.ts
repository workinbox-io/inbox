import type { APIContext } from "astro";
import { appPage } from "@/lib/server/app-page";
import { handler, HttpError } from "@/lib/server/api";

const load = handler(async (ctx) => {
  const path = ctx.url.searchParams.get("path");
  if (!path || !path.startsWith("/app") || path.startsWith("//")) throw new HttpError(404, "Not found");
  const page = await appPage(ctx, new URL(path, ctx.url));
  return Response.json(page, { headers: { "Cache-Control": "no-store" } });
});

export async function GET(ctx: APIContext) {
  const response = await load(ctx);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
