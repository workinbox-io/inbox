import { handler, HttpError, type HandlerContext } from "@/lib/server/api";
import { externalAccountsRequest } from "@/lib/server/mail/bridge";

const forward = handler(async (ctx: HandlerContext) => {
  const id = ctx.params.id ?? "", path = ctx.params.path ?? "";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !/^[a-zA-Z0-9_/-]{1,1024}$/.test(path)) throw new HttpError(404, "Not found");
  let exceeded = false;
  let bytes = 0;
  const max = path === "send" ? 16 * 1024 * 1024 : 32768;
  const body = ["POST", "PATCH"].includes(ctx.request.method) ? ctx.request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > max) { exceeded = true; throw new Error("Body too large"); }
      controller.enqueue(chunk);
    },
  })) : undefined;
  try { return await externalAccountsRequest(ctx, ctx.request.method, `/${id}/mail/${path}`, body); }
  catch (error) { if (exceeded) throw new HttpError(413, "Body too large"); throw error; }
});
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
