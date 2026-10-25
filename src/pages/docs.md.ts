import type { APIRoute } from "astro";
import { getDocs } from "@/lib/docs";
import { docMarkdown } from "@/lib/llms";

export const prerender = true;

export const GET: APIRoute = async () => docMarkdown((await getDocs()).find((doc) => doc.id === "index")!);
