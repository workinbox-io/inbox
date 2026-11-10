/** MCP tools for the drive: the same lib/server functions as /api/app/drive, so access works the same way. Reading only. */
import { env } from "cloudflare:workers";
import { z } from "zod";
import { previewKind } from "@/lib/drive/access";
import { requireItem, type DriveViewer } from "@/lib/server/drive/access";
import { getItem, listItems, type DriveSummary } from "@/lib/server/drive/items";
import { driveListSchema } from "@/lib/validation-drive";
import { defineTool, type McpContext, type McpModule, type Tools } from "./define";

/** Connected apps act as the user; API keys see team items only. */
const viewer = (ctx: McpContext): DriveViewer => ({ orgId: ctx.orgId, role: ctx.role, userId: ctx.userId ?? "" });

/** Text read from one file, so a large log doesn't fill the model's context. */
const MAX_CHARS = 50_000;

const row = ({ ownerId: _o, role: _r, manage: _m, trashed: _t, parentId: _p, ...i }: DriveSummary) => i;

export const driveTools: Tools = {
  drive_search: defineTool({
    title: "Search drive",
    description:
      "Lists drive files and folders the user may open. `q` searches names everywhere; `folder` lists one folder (an id from an earlier result); otherwise `view` is mine (the user's own drive, default), shared (shared with them) or recent (files changed lately).",
    input: driveListSchema.pick({ q: true, folder: true }).extend({ view: z.enum(["mine", "shared", "recent"]).optional() }),
    async run(input, ctx) {
      const { items } = await listItems(viewer(ctx), input);
      return { items: items.slice(0, 100).map(row) };
    },
  }),

  drive_read: defineTool({
    title: "Read drive file",
    description: `One drive item. For text files (txt, csv, markdown, json…) the content, up to ${MAX_CHARS} characters; for a folder what's in it; for other files (PDF, images, office documents) only the details.`,
    input: z.object({ id: z.string().uuid().describe("Item id from drive_search") }),
    async run({ id }, ctx) {
      const v = viewer(ctx);
      const { item } = await requireItem(v, id);
      const { crumbs, people: _people, ...details } = await getItem(v, id);
      const out = { ...row(details), folder: crumbs.map((c) => c.name).join(" / ") || null };
      if (item.kind === "folder") return { ...out, items: (await listItems(v, { folder: id })).items.slice(0, 100).map(row) };
      if (previewKind(item.mediaType) !== "text" || !item.r2Key) return { ...out, content: null, note: "Not a text file: open it in Work Inbox to view it." };
      const object = await env.FILES.get(item.r2Key, { range: { offset: 0, length: MAX_CHARS * 4 } });
      const text = object ? (await object.text()).slice(0, MAX_CHARS) : "";
      return { ...out, content: text, truncated: item.size > text.length };
    },
  }),
};

export const driveModule: McpModule = {
  name: "drive",
  instructions: "Drive: drive_search finds files and folders by name or lists a folder; drive_read reads a text file or lists a folder.",
  tools: driveTools,
};
