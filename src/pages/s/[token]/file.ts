import type { APIRoute } from "astro";
import { openLink, unlockCookieName } from "@/lib/server/drive/links";
import { serveFile } from "@/lib/server/drive/serve";

/** A file behind a public link (?item= inside a shared folder, ?download=1 to save it). Range works for video. */
export const GET: APIRoute = async ({ params, url, cookies, request }) => {
  const token = params.token!;
  const open = await openLink(token, { itemId: url.searchParams.get("item"), cookie: cookies.get(unlockCookieName(token))?.value });
  if (open.state !== "open" || open.item.kind !== "file") return new Response("Not found", { status: 404 });
  return serveFile(open.item, request, { download: url.searchParams.has("download"), cache: "no-store" });
};
