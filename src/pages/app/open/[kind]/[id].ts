import type { APIRoute } from "astro";
import { openHref } from "@/lib/server/open";

/** A mention chip's link (full page load); in-app navigation is redirected by `appPage`. */
export const GET: APIRoute = async ({ params, locals, redirect }) => redirect(await openHref(locals.orgId!, params.kind!, params.id!), 302);
