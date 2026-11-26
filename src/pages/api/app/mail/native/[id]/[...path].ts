import { handler, HttpError, parseBody } from "@/lib/server/api";
import { z } from "zod";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { hostedAccountsRequest } from "@/lib/server/mail/bridge";
const route=handler(async ctx=>{
  if(!ctx.locals.user||ctx.locals.apiKeyId)throw new HttpError(403,"Sign in to manage mail clients");
  const id=ctx.params.id??"",path=ctx.params.path??"";
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id)||!/^client-passwords(?:\/[a-zA-Z0-9_-]{1,255})?$/.test(path))throw new HttpError(404,"Not found");
  if(!(await viewerMailboxes(mailViewer(ctx))).some(box=>box.id===id))throw new HttpError(404,"Not found");
  const body=ctx.request.method==='POST'?await parseBody(ctx.request,z.object({description:z.string().trim().min(1).max(100).regex(/^[^\x00-\x1f\x7f]+$/)}).strict()):undefined;
  return hostedAccountsRequest(ctx,ctx.request.method,`/${id}/${path}`,body);
});
export const GET=route;export const POST=route;export const DELETE=route;
