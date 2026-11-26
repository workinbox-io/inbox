import type { APIRoute } from "astro";
import { llmsTxt } from "@/lib/llms";

export const prerender = true;

export const GET: APIRoute = async ({ site }) => llmsTxt(site!);
