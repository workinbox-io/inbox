import { handler, HttpError } from "@/lib/server/api";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { hostedAccountsRequest } from "@/lib/server/mail/bridge";
const route=handler(async ctx=>{
  if(!ctx.locals.user||ctx.locals.apiKeyId)throw new HttpError(403,"Sign in to manage mail clients");
  const id=ctx.params.id??"";if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw new HttpError(404,"Not found");
  if(ctx.request.method!=="DELETE"&&!(await viewerMailboxes(mailViewer(ctx))).some(box=>box.id===id))throw new HttpError(404,"Not found");
  return hostedAccountsRequest(ctx,ctx.request.method,`/${id}`);
});
export const POST=route;export const DELETE=route;
