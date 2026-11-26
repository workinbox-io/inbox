import type { APIRoute } from "astro";
import { getAuth } from "@/lib/server/auth";
import { isDemoOrg } from "@/lib/server/demo/guard";
import { serveAttachment } from "@/lib/server/uploads";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Uploaded files (lib/server/uploads.ts): the keys are random, so they need no session. Except the public demo's:
 * anyone can make a demo org, so its files open only for its own session (no free anonymous file hosting).
 */
export const GET: APIRoute = async ({ params, request }) => {
  const path = params.path ?? "";
  const orgId = path.split("/")[1];
  if (orgId && (await isDemoOrg(orgId))) {
    const s = await getAuth().api.getSession({ headers: request.headers });
    if (s?.session.activeOrganizationId !== orgId) return notFound();
  }
  return (await serveAttachment(path, request)) ?? notFound();
};
