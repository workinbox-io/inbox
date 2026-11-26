/** MCP tools for the drive: the same lib/server functions as /api/app/drive, so access works the same way. Uses existing permissions, quotas and audit. */
import { env } from "cloudflare:workers";
import { z } from "zod";
import { previewKind } from "@/lib/drive/access";
import { requireItem, type DriveViewer } from "@/lib/server/drive/access";
import { createFolder, updateItem, getItem, listItems, type DriveSummary } from "@/lib/server/drive/items";
import { putFile } from "@/lib/server/drive/uploads";
import { driveFolderSchema, driveUpdateSchema, driveListSchema } from "@/lib/validation-drive";
import { defineTool, type McpContext, type McpModule, type Tools } from "./define";

/** Connected apps act as the user; API keys see team items only. */
const viewer = (ctx: McpContext): DriveViewer => ({ orgId: ctx.orgId, role: ctx.role, userId: ctx.userId ?? "" });

/** Text read from one file, so a large log doesn't fill the model's context. */
const MAX_CHARS = 50_000;

const row = ({ ownerId: _o, role: _r, manage: _m, trashed: _t, parentId: _p, ...i }: DriveSummary) => i;

export const driveTools: Tools = {
  drive_create_folder: defineTool({
    title: "Create Drive folder", scope: "write", description: "Creates a folder; duplicate names get a free name. Never overwrites.",
    input: driveFolderSchema,
    async run(input, ctx) { const item = await createFolder(viewer(ctx), input); ctx.audit("drive.folder_create", { target: item.name }); return item; },
  }),
  drive_create_text_file: defineTool({
    title: "Create text file", scope: "write", description: "Creates a UTF-8 text file (up to 50,000 characters), optionally in parentId. Never overwrites; duplicate names get a free name.",
    input: driveFolderSchema.extend({ content: z.string().max(MAX_CHARS) }),
    async run({ content, ...input }, ctx) {
      const body = new Blob([content]);
      const item = await putFile(viewer(ctx), { ...input, size: body.size, mediaType: "text/plain" }, body.stream());
      ctx.audit("drive.upload", { target: item.name }); return item;
    },
  }),
  drive_update_item: defineTool({
    title: "Rename or move Drive item", scope: "write", destructive: true,
    description: "Rename, move (parentId null means My drive), trash (trashed true), or restore (trashed false). No permanent deletion or public sharing.",
    input: z.object({ id: z.string().uuid(), changes: driveUpdateSchema }),
    async run({ id, changes }, ctx) {
      const item = await updateItem(viewer(ctx), id, changes);
      ctx.audit(changes.trashed === true ? "drive.trash" : changes.trashed === false ? "drive.restore" : "drive.update", { target: item.name }); return item;
    },
  }),
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
  instructions: "Drive: drive_search finds files and folders by name or lists a folder; drive_read reads text or lists a folder. Create folders and text files; rename, move, trash or restore with drive_update_item.",
  tools: driveTools,
};
