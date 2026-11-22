import { z } from "zod";
import { HttpError, json, manageHandler, parseBody } from "@/lib/server/api";
import { completeImport, IMPORT_PART_BYTES, uploadImportPart } from "@/lib/server/mail/import";

/** One part of the file (?part=1…), the raw bytes as the body. */
export const PUT = manageHandler(async ({ orgId, params, request, url }) => {
  if (!request.body) throw new HttpError(422, "Empty part");
  if (Number(request.headers.get("content-length") ?? 0) > IMPORT_PART_BYTES) throw new HttpError(413, "Part too large");
  return json(await uploadImportPart(orgId, params.id!, Number(url.searchParams.get("part")), request.body));
});

const completeSchema = z.object({ parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().max(200) })).min(1).max(10_000) });

/** All parts are up: the file is put together and the import is queued. */
export const POST = manageHandler(async ({ orgId, params, request }) => {
  const { parts } = await parseBody(request, completeSchema);
  await completeImport(orgId, params.id!, parts);
  return json({ ok: true });
});
