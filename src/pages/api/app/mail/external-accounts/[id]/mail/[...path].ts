import { handler, HttpError, parseBody, type HandlerContext } from "@/lib/server/api";
import { externalAccountsRequest } from "@/lib/server/mail/bridge";
import { z } from "zod";

const forward = handler(async (ctx: HandlerContext) => {
  const id = ctx.params.id ?? "", path = ctx.params.path ?? "";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !/^[a-zA-Z0-9_/-]{1,1024}$/.test(path)) throw new HttpError(404, "Not found");
  const body = ["POST", "PATCH"].includes(ctx.request.method) ? await parseBody(ctx.request, z.record(z.string(), z.unknown())) : undefined;
  return externalAccountsRequest(ctx, ctx.request.method, `/${id}/mail/${path}`, body);
});
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
