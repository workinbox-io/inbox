import type { APIRoute } from "astro";
import { getAuth } from "@/lib/server/auth";

export const prerender = false;

export const ALL: APIRoute = (ctx) => getAuth().handler(ctx.request);
