/** MCP tools for the workspace itself: which apps the organization has on (config/modules.ts). */
import { z } from "zod";
import { OPTIONAL_MODULES } from "@/config/modules";
import { listModules, setModule } from "@/lib/server/modules";
import { defineTool, type McpModule, type Tools } from "./define";

export const workspaceTools: Tools = {
  workspace_apps_list: defineTool({
    title: "List workspace apps",
    description: "The organization's optional apps (chat, calendar, notes, contacts, drive, collections) and whether each is on. Mail is always on. A turned-off app's tools are not available.",
    async run(_input, ctx) {
      return { apps: await listModules(ctx.orgId) };
    },
  }),

  workspace_app_set: defineTool({
    title: "Turn a workspace app on or off",
    description: "Turns one optional app on or off for the whole organization. Turning it off hides it for everyone and blocks its API; its data is kept and comes back when it is turned on again.",
    input: z.object({ app: z.enum(OPTIONAL_MODULES), enabled: z.boolean() }),
    scope: "write",
    manage: true,
    async run({ app, enabled }, ctx) {
      if (await setModule(ctx.orgId, app, enabled)) ctx.audit("org.module", { target: app, details: { enabled } });
      return { apps: await listModules(ctx.orgId) };
    },
  }),
};

export const workspaceModule: McpModule = {
  name: "workspace",
  instructions: "Workspace: owners and admins can turn the optional apps on or off; call workspace_apps_list first.",
  tools: workspaceTools,
};
