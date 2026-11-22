import type { APIRoute } from "astro";
import { z } from "zod";
import { db, eq, mailDomains } from "@/db";
import { listStorage } from "@/lib/server/mail/storage";
import { HttpError } from "@/lib/server/api";
import { queueRawSend } from "@/lib/server/mail/outbox";
import { nativeDraftDelete, nativeDraftRaw, nativeDrafts, nativeDraftSave } from "@/lib/server/mail/native-drafts";
import { mailDraftKey } from "@/lib/validation-mail";
import { nativeMailboxContext, nativeSnapshot, nativeChanges, nativeRaw, nativePatch, nativeRemove, nativeImport, nativeFolders, nativeLabel, nativeVersion, nativeFlags } from "@/lib/server/mail/native";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const nonnegative = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
async function bytes(request: Request, max: number) {
  let size = 0; const chunks: Uint8Array[] = [];
  if (request.body) for await (const chunk of request.body) { size += chunk.byteLength; if (size > max) throw new HttpError(413, "Body too large"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
const route: APIRoute = async ({ request, params, url }) => {
  try {
    const boxId = id.parse(params.id), path = params.path?.split("/") ?? [];
    const { mailbox, scope, userId } = await nativeMailboxContext(request, boxId);
    let result: unknown;
    if (request.method === "GET" && path.length === 1 && path[0] === "snapshot") {
      result = await nativeSnapshot(mailbox, nonnegative.parse(url.searchParams.get("after") ?? 0), url.searchParams.has("upper") ? nonnegative.parse(url.searchParams.get("upper")) : undefined);
    } else if (request.method === "GET" && path.length === 1 && path[0] === "changes") {
      result = await nativeChanges(mailbox, nonnegative.parse(url.searchParams.get("after") ?? 0));
    } else if (request.method === "GET" && path.length === 1 && path[0] === "folders") {
      const [domain] = await db.select({provider:mailDomains.provider}).from(mailDomains).where(eq(mailDomains.id,mailbox.domainId));
      result = { folders: await nativeFolders(mailbox), address: mailbox.address, submission:!!domain, quotaBytes:(await listStorage([mailbox.id]))[0].quotaBytes };
    } else if (request.method === "GET" && path.length === 2 && path[0] === "raw") {
      const raw = await nativeRaw(mailbox, id.parse(path[1]));
      return new Response(raw.body, { headers: { "content-type": "message/rfc822", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    } else if (request.method === "POST" && path.length === 1 && path[0] === "submit") {
      const recipients = z.array(z.email().max(320)).min(1).max(40).parse(JSON.parse(url.searchParams.get("recipients")??"null"));
      const data = await bytes(request,10*1024*1024);
      result = await queueRawSend(mailbox,new Uint8Array(data.buffer as ArrayBuffer,data.byteOffset,data.byteLength),recipients,userId);
    } else if (request.method === "POST" && path.length === 1 && path[0] === "import") {
      const receivedAt = z.iso.datetime().parse(url.searchParams.get("receivedAt"));
      const data = await bytes(request, 25 * 1024 * 1024);
      const importId=z.uuid().parse(url.searchParams.get("id"));
      const flags=nativeFlags.parse(JSON.parse(url.searchParams.get("flags")??"null"));
      result = await nativeImport(mailbox, new Uint8Array(data.buffer as ArrayBuffer,data.byteOffset,data.byteLength), receivedAt, importId, scope, flags);
    } else if (request.method === "GET" && path.length === 1 && path[0] === "drafts") {
      result = await nativeDrafts(mailbox, userId);
    } else if (request.method === "GET" && path.length === 3 && path[0] === "drafts" && path[2] === "raw") {
      const raw = await nativeDraftRaw(mailbox, userId, mailDraftKey.parse(path[1]));
      return new Response(raw, { headers: { "content-type": "message/rfc822", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    } else if (request.method === "POST" && path.length === 1 && path[0] === "drafts") {
      const key = url.searchParams.has("key") ? mailDraftKey.parse(url.searchParams.get("key")) : undefined;
      const expected = key ? nonnegative.parse(url.searchParams.get("expected")) : undefined;
      const data = await bytes(request, 25 * 1024 * 1024);
      result = await nativeDraftSave(mailbox, userId, new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength), key, expected);
    } else if (request.method === "DELETE" && path.length === 2 && path[0] === "drafts") {
      result = await nativeDraftDelete(mailbox, userId, mailDraftKey.parse(path[1]), nonnegative.parse(url.searchParams.get("expected")));
    } else if (request.method === "POST" && path.length === 2 && path[0] === "messages") {
      const input = z.object({ expected: nativeVersion, flags: nativeFlags.optional(), remove: z.boolean().optional() }).strict().parse(JSON.parse((await bytes(request, 32768)).toString()));
      if (input.remove) result = await nativeRemove(mailbox, id.parse(path[1]), input.expected);
      else if (input.flags) result = await nativePatch(mailbox, id.parse(path[1]), input.expected, input.flags);
      else throw new HttpError(422, "Choose a mutation");
    } else if (request.method === "POST" && path.length === 2 && path[0] === "folders") {
      const input = z.object({ name: z.string().trim().min(1).max(255).regex(/^[^\x00-\x1f\x7f]+$/), remove: z.boolean().default(false) }).strict().parse(JSON.parse((await bytes(request, 32768)).toString()));
      await nativeLabel(mailbox, id.parse(path[1]), input.name, input.remove); result = { ok: true };
    } else throw new HttpError(404, "Not found");
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "Invalid native mail request" }, { status: 422 });
    throw error;
  }
};
export const GET = route;
export const POST = route;
export const DELETE = route;
