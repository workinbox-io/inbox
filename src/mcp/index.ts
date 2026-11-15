/**
 * The MCP server: template tools (./core.ts) plus your product's (./app.ts), built per request for
 * the caller, so tools they can't use aren't even listed. HTTP and auth: lib/server/mcp.ts.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { siteConfig } from "@/config/site";
import { HttpError } from "@/lib/server/api";
import { recordAudit, type AuditActor } from "@/lib/server/audit";
import { reportError } from "@/lib/server/errors";
import { requireFeature } from "@/lib/server/org";
import type { OrgRole } from "@/lib/server/roles";
import { appModules } from "./app";
import { coreTools } from "./core";
import { canUseTool, needsPlan, toolError, toolResult, toolVisibility, type McpAuditNote, type ToolDef, type ToolResult, type Tools } from "./define";
import type { AuditAction } from "@/config/audit";

export const TOOLS: Tools = Object.assign({ ...coreTools }, ...appModules.map((m) => m.tools));
export const WIDGETS: Record<string, { title: string; html: string }> = Object.assign({}, ...appModules.map((m) => m.widgets ?? {}));

/** The caller of one /mcp request, resolved by lib/server/mcp.ts. */
export interface McpPrincipal {
  orgId: string;
  role: OrgRole;
  userId: string | null;
  apiKeyId?: string;
  scopes: string[];
  /** Who the audit log names: the user, or the API key. */
  actor: AuditActor;
  /** The connected app, e.g. "Claude"; recorded with each change. */
  via: string;
  ip: string | null;
}

const widgetUri = (name: string) => `ui://widgets/${name}.html`;

async function runTool(name: string, tool: ToolDef, args: unknown, p: McpPrincipal): Promise<ToolResult> {
  const notes: (McpAuditNote & { action: AuditAction })[] = [];
  try {
    // Reading is free. Changes are checked per call; the message stays neutral (ChatGPT's rules forbid upsells in apps).
    if (needsPlan(tool)) {
      const allowed = await requireFeature(p.orgId, "mcpAccess").then(() => true, (e) => (e instanceof HttpError ? false : Promise.reject(e)));
      if (!allowed) return toolError("This organization's plan doesn't include changes from AI apps. An owner can change that in Work Inbox settings.");
    }
    const data = await tool.run((args ?? {}) as never, {
      orgId: p.orgId,
      role: p.role,
      userId: p.userId,
      apiKeyId: p.apiKeyId,
      via: p.via,
      audit: (action, note = {}) => void notes.push({ action, ...note }),
    });
    for (const n of notes) {
      await recordAudit({ orgId: p.orgId, actor: p.actor, ip: p.ip, action: n.action, target: n.target, details: { ...n.details, via: p.via } });
    }
    return toolResult(data);
  } catch (e) {
    if (e instanceof HttpError) return toolError(e.message);
    await reportError("web", e, { route: `MCP ${name}`, orgId: p.orgId });
    return toolError("Something went wrong on our side. It has been reported; try again in a moment.");
  }
}

export function buildMcpServer(p: McpPrincipal) {
  const server = new McpServer(
    { name: siteConfig.name, version: "1.0.0" },
    {
      instructions: [
        `${siteConfig.name}: ${siteConfig.description} Every tool works inside one organization, the one the user connected; call get_organization to see which.`,
        ...appModules.map((m) => m.instructions),
      ].join("\n"),
    },
  );
  const scopes = new Set(p.scopes);
  const widgets = new Set<string>();

  for (const [name, tool] of Object.entries(TOOLS)) {
    if (!canUseTool(tool, scopes, p.role)) continue;
    const widget = tool.widget && WIDGETS[tool.widget] ? tool.widget : null;
    if (widget) widgets.add(widget);
    const ui = { ...(widget ? { resourceUri: widgetUri(widget) } : {}), ...(tool.appOnly ? { visibility: toolVisibility(tool, Boolean(p.apiKeyId)) } : {}) };
    server.registerTool(
      name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input ?? z.object({}),
        annotations: {
          title: tool.title,
          readOnlyHint: (tool.scope ?? "read") === "read" && !tool.persists,
          destructiveHint: Boolean(tool.destructive),
          openWorldHint: Boolean(tool.openWorld),
        },
        // MCP Apps: the host renders this widget with the tool's structuredContent.
        _meta: Object.keys(ui).length ? { ui, ...(widget ? { [RESOURCE_URI_META_KEY]: widgetUri(widget) } : {}) } : undefined,
      },
      (args: unknown) => runTool(name, tool, args, p),
    );
  }

  for (const name of widgets) {
    const { title, html } = WIDGETS[name]!;
    server.registerResource(name, widgetUri(name), { title, mimeType: RESOURCE_MIME_TYPE }, async (uri) => ({
      contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: html }],
    }));
  }

  return server;
}
