// RFC 9728 metadata for /mcp: tells MCP clients which authorization server issues its tokens.
// Served by Better Auth's mcp plugin, which answers this path before routing.
import type { APIRoute } from "astro";
import { getAuth } from "@/lib/server/auth";

export const GET: APIRoute = ({ request }) => getAuth().handler(request);
