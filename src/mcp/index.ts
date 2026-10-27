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
import { appTools, appWidgets } from "./app";
import { coreTools } from "./core";
import { canUseTool, toolError, toolResult, type McpAuditNote, type ToolDef, type ToolResult, type Tools } from "./define";
import type { AuditAction } from "@/config/audit";

export const TOOLS: Tools = { ...coreTools, ...appTools };
export const WIDGETS = appWidgets;

/** The caller of one /mcp request, resolved by lib/server/mcp.ts. */
export interface McpPrincipal {
  orgId: string;
  role: OrgRole;
  userId: string | null;
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
    // Checked per call rather than at connect time, so the model can tell the user what to upgrade.
    await requireFeature(p.orgId, "mcpAccess");
    const data = await tool.run((args ?? {}) as never, {
      orgId: p.orgId,
      role: p.role,
      userId: p.userId,
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
      instructions: `${siteConfig.name}: ${siteConfig.description} Every tool works inside one organization, the one the user connected; call get_organization to see which and what its plan allows.`,
    },
  );
  const scopes = new Set(p.scopes);
  const widgets = new Set<string>();

  for (const [name, tool] of Object.entries(TOOLS)) {
    if (!canUseTool(tool, scopes, p.role)) continue;
    const widget = tool.widget && WIDGETS[tool.widget] ? tool.widget : null;
    if (widget) widgets.add(widget);
    server.registerTool(
      name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input ?? z.object({}),
        annotations: {
          title: tool.title,
          readOnlyHint: (tool.scope ?? "read") === "read",
          destructiveHint: Boolean(tool.destructive),
          openWorldHint: false,
        },
        // MCP Apps: the host renders this widget with the tool's structuredContent.
        _meta: widget ? { ui: { resourceUri: widgetUri(widget) }, [RESOURCE_URI_META_KEY]: widgetUri(widget) } : undefined,
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
