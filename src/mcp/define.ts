/**
 * MCP tools: what AI apps (Claude, ChatGPT, Cursor…) can do in the product through /mcp. A tool is a
 * thin wrapper over lib/server, like an API route. Pure module: no cloudflare:workers imports.
 */
import type { z } from "zod";
import type { AuditAction } from "@/config/audit";
import type { McpScope } from "@/lib/server/oauth";
import type { OrgRole } from "@/lib/server/roles";

export interface McpAuditNote {
  target?: string | null;
  /** Non-secret extras only. */
  details?: Record<string, unknown>;
}

/** Who is calling: a user through an OAuth-connected app, or an organization API key. */
export interface McpContext {
  orgId: string;
  role: OrgRole;
  /** Null for API keys. */
  userId: string | null;
  apiKeyId?: string;
  /** Notes a change for the audit log; it's written only if the tool succeeds. */
  audit: (action: AuditAction, note?: McpAuditNote) => void;
}

/** Any zod object schema; tool arguments are always an object. */
type InputSchema = z.ZodObject<z.ZodRawShape>;

export interface ToolDef<S extends InputSchema | undefined = InputSchema | undefined> {
  title: string;
  /** Written for the model: when to use the tool and what it returns. */
  description: string;
  input?: S;
  /** Scope the token needs. Defaults to "read"; tools that change anything need "write". */
  scope?: McpScope;
  /** Owners and admins only (like manageHandler). Hidden from everyone else. */
  manage?: boolean;
  /** Deletes or overwrites data; clients ask the user before calling it. */
  destructive?: boolean;
  /** Name of a widget in WIDGETS (mcp/index.ts) that renders the result in Claude and ChatGPT. */
  widget?: string;
  /** Returns the result as an object: the model reads it as JSON, widgets get it as structuredContent. */
  run: (input: S extends InputSchema ? z.output<S> : Record<string, never>, ctx: McpContext) => Promise<Record<string, unknown>>;
}

/** Keeps the input type of each tool when tools are collected in a record. */
export const defineTool = <S extends InputSchema | undefined = undefined>(tool: ToolDef<S>) => tool;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tools = Record<string, ToolDef<any>>;

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export const toolResult = (data: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
});

/** Tool failures are results the model can read and explain, not protocol errors. */
export const toolError = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/** True when a caller with these scopes and role may see and call the tool. */
export function canUseTool(tool: Pick<ToolDef, "scope" | "manage">, scopes: ReadonlySet<string>, role: OrgRole) {
  if (!scopes.has(tool.scope ?? "read")) return false;
  return !tool.manage || role === "owner" || role === "admin";
}
