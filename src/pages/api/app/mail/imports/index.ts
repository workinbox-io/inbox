import { z } from "zod";
import { json, manageHandler, parseBody } from "@/lib/server/api";
import { listImports, startImport } from "@/lib/server/mail/import";

/** Imports of old mail (owners and admins): the latest ones with their progress, or a new upload. */
export const GET = manageHandler(async ({ orgId }) => json(await listImports(orgId)));

const startSchema = z.object({ mailboxId: z.string().uuid(), filename: z.string().trim().min(1).max(300), size: z.number().int().positive() });

export const POST = manageHandler(async ({ orgId, request, audit }) => {
  const body = await parseBody(request, startSchema);
  const started = await startImport(orgId, body);
  audit("mail_import.start", { target: body.filename, details: { size: body.size } });
  return json(started, 201);
});
