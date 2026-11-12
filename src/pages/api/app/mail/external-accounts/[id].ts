import { handler, HttpError, parseBody, type HandlerContext } from "@/lib/server/api";
import { externalAccountsRequest } from "@/lib/server/mail/bridge";
import { externalMailAccountSchema } from "@/lib/validation-mail-external";

function accountPath(ctx: HandlerContext) {
  const id = ctx.params.id ?? "";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new HttpError(404, "Not found");
  return `/${id}`;
}
export const PUT = handler(async ctx => externalAccountsRequest(ctx, "PUT", accountPath(ctx), await parseBody(ctx.request, externalMailAccountSchema)));
export const GET = handler(ctx => externalAccountsRequest(ctx, "GET", accountPath(ctx)));
export const DELETE = handler(ctx => externalAccountsRequest(ctx, "DELETE", accountPath(ctx)));
export const POST = handler(ctx => externalAccountsRequest(ctx, "POST", `${accountPath(ctx)}/test`));
