import type { APIRoute } from "astro";
import { getAuth } from "@/lib/server/auth";

export const GET: APIRoute = async ({ request, redirect }) => {
  // A GET any page could embed: only our own pages may sign people out.
  if (request.headers.get("sec-fetch-site") === "cross-site") return redirect("/app");
  const res = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
  const out = redirect("/login");
  for (const cookie of res.headers.getSetCookie()) out.headers.append("set-cookie", cookie);
  return out;
};
