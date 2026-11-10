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
  /** The connected app, e.g. "ChatGPT", or the API key's name. */
  via?: string;
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
  /** Reaches outside the organization (sends mail to the world). */
  openWorld?: boolean;
  /** Saves something (e.g. a draft) though it needs no write scope: reported as not read-only. */
  persists?: boolean;
  /**
   * Connected apps (OAuth) only let their widgets call it, so a person has to click; the model can't call it
   * on its own, even when a received mail asks it to. API keys (scripts, CLIs) keep calling it directly.
   */
  appOnly?: boolean;
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
  _meta?: Record<string, unknown>;
  isError?: boolean;
}

/** A `_meta` key in a tool's data goes to the widget only (hosts don't show result `_meta` to the model). */
export const toolResult = ({ _meta, ...data }: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: data,
  ...(_meta && typeof _meta === "object" ? { _meta: _meta as Record<string, unknown> } : {}),
});

/** Tool failures are results the model can read and explain, not protocol errors. */
export const toolError = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/** An app area (mail, notes, contacts…): its tools, widgets and one line for the model. Listed in ./app.ts. */
export interface McpModule {
  name: string;
  /** Appended to the server's instructions, e.g. "Mail: …". */
  instructions: string;
  tools: Tools;
  widgets?: Record<string, { title: string; html: string }>;
}

/** Reading is free; changes from AI apps need the mcpAccess plan feature. */
export const needsPlan = (tool: Pick<ToolDef, "scope">) => (tool.scope ?? "read") === "write";

/** MCP Apps tool visibility: app-only tools stay hidden from the model of OAuth-connected apps. */
export const toolVisibility = (tool: Pick<ToolDef, "appOnly">, apiKey: boolean): ("model" | "app")[] =>
  tool.appOnly && !apiKey ? ["app"] : ["model", "app"];

/** True when a caller with these scopes and role may see and call the tool. */
export function canUseTool(tool: Pick<ToolDef, "scope" | "manage">, scopes: ReadonlySet<string>, role: OrgRole) {
  if (!scopes.has(tool.scope ?? "read")) return false;
  return !tool.manage || role === "owner" || role === "admin";
}
