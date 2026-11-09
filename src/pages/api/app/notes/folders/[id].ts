import { handler, json, manageHandler, parseBody } from "@/lib/server/api";
import { deleteFolder, renameFolder } from "@/lib/server/notes/notes";
import { noteFolderSchema } from "@/lib/validation-notes";

export const PATCH = handler(async ({ request, orgId, params, audit }) => {
  const folder = await renameFolder(orgId, params.id!, (await parseBody(request, noteFolderSchema)).name);
  audit("note_folder.change", { target: folder.name, details: { action: "rename" } });
  return json(folder);
});

/** Owners and admins: the folder's notes stay, without a folder. */
export const DELETE = manageHandler(async ({ orgId, params, audit }) => {
  const folder = await deleteFolder(orgId, params.id!);
  audit("note_folder.change", { target: folder.name, details: { action: "delete" } });
  return json({ ok: true });
});
