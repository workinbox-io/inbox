import { handler, HttpError } from "@/lib/server/api";
import { externalAccountsRequest } from "@/lib/server/mail/bridge";

export const POST = handler(ctx => {
  const id = ctx.params.id ?? "";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new HttpError(404, "Not found");
  return externalAccountsRequest(ctx, "POST", `/${id}/sync`);
});
