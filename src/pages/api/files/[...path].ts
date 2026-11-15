import type { APIRoute } from "astro";
import { serveAttachment } from "@/lib/server/uploads";

/** Uploaded files (lib/server/uploads.ts): the keys are random, so they need no session. */
export const GET: APIRoute = async ({ params, request }) => (await serveAttachment(params.path ?? "", request)) ?? new Response("Not found", { status: 404 });
