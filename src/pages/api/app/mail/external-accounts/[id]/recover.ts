import { z } from "zod";
import { handler, HttpError, parseBody } from "@/lib/server/api";
import { externalAccountsRequest } from "@/lib/server/mail/bridge";

export const POST = handler(async ctx => {
  const id = ctx.params.id ?? "";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new HttpError(404, "Not found");
  const input = await parseBody(ctx.request, z.object({ newId: z.uuid() }).strict());
  return externalAccountsRequest(ctx, "POST", `/${id}/recover`, input);
});
