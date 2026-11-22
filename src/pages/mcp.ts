// MCP server for AI apps (Claude, ChatGPT, Cursor…): see lib/server/mcp.ts and src/mcp.
import type { APIRoute } from "astro";
import { handleMcpRequest } from "@/lib/server/mcp";

export const ALL: APIRoute = ({ request }) => handleMcpRequest(request);
