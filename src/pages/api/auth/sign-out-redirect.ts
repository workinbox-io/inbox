import type { APIRoute } from "astro";
import { getAuth } from "@/lib/server/auth";

export const GET: APIRoute = async ({ request, redirect }) => {
  const res = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
  const out = redirect("/login");
  for (const cookie of res.headers.getSetCookie()) out.headers.append("set-cookie", cookie);
  return out;
};
