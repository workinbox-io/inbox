// ChatGPT plugin portal domain check: the token from the portal, as plain text (secret OPENAI_APPS_CHALLENGE).
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = () =>
  env.OPENAI_APPS_CHALLENGE ? new Response(env.OPENAI_APPS_CHALLENGE.trim(), { headers: { "Content-Type": "text/plain" } }) : new Response("Not found", { status: 404 });
