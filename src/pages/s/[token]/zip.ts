import type { APIRoute } from "astro";
import { HttpError } from "@/lib/server/api";
import { openLink, unlockCookieName } from "@/lib/server/drive/links";
import { zipResponse } from "@/lib/server/drive/zip";

/** "Download all" on a public folder link (?item= a folder inside it). */
export const GET: APIRoute = async ({ params, url, cookies }) => {
  const token = params.token!;
  const open = await openLink(token, { itemId: url.searchParams.get("item"), cookie: cookies.get(unlockCookieName(token))?.value });
  if (open.state !== "open" || open.item.kind !== "folder") return new Response("Not found", { status: 404 });
  try {
    return await zipResponse([open.item], open.item.name);
  } catch (e) {
    if (e instanceof HttpError) return new Response(e.message, { status: e.status });
    throw e;
  }
};
