import { handler, json, parseBody } from "@/lib/server/api";
import { createFolder, listFolders } from "@/lib/server/notes/notes";
import { noteFolderSchema } from "@/lib/validation-notes";

export const GET = handler(async ({ orgId }) => json({ folders: await listFolders(orgId) }));

export const POST = handler(async ({ request, orgId, audit }) => {
  const folder = await createFolder(orgId, (await parseBody(request, noteFolderSchema)).name);
  audit("note_folder.change", { target: folder.name, details: { action: "create" } });
  return json(folder, 201);
});
