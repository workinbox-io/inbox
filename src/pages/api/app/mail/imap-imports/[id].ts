import { HttpError, manageHandler } from "@/lib/server/api";
import { imapImportsRequest } from "@/lib/server/mail/bridge";

const action = (method: string) => manageHandler(ctx => {
  const id = ctx.params.id ?? "";
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new HttpError(404, "Not found");
  return imapImportsRequest(ctx, method, `/${id}`);
});
export const POST = action("POST");
export const DELETE = action("DELETE");
