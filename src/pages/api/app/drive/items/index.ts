import { HttpError, handler, json, parseBody } from "@/lib/server/api";
import { driveViewer } from "@/lib/server/drive/access";
import { createFolder, listItems } from "@/lib/server/drive/items";
import { driveFolderSchema, driveListSchema } from "@/lib/validation-drive";

/** A folder's contents (?folder=), or a view: mine (default), shared, recent, trash; ?q= searches names. */
export const GET = handler(async (ctx) => {
  const query = driveListSchema.safeParse(Object.fromEntries(ctx.url.searchParams));
  if (!query.success) throw new HttpError(422, query.error.issues[0]?.message ?? "Invalid query");
  return json(await listItems(driveViewer(ctx), query.data));
});

/** A new folder. */
export const POST = handler(async (ctx) => {
  const folder = await createFolder(driveViewer(ctx), await parseBody(ctx.request, driveFolderSchema));
  ctx.audit("drive.folder_create", { target: folder.name });
  return json(folder, 201);
});
