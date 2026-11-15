import { handler, json, HttpError } from "@/lib/server/api";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { hostedAccountsRequest } from "@/lib/server/mail/bridge";
export const GET=handler(async ctx=>{
  if(!ctx.locals.user||ctx.locals.apiKeyId)throw new HttpError(403,"Sign in to manage mail clients");
  const [boxes,response]=await Promise.all([viewerMailboxes(mailViewer(ctx)),hostedAccountsRequest(ctx,"GET")]);
  const bridge=await response.json() as {configured:boolean;connections:{mailboxId:string}[]};
  return json({configured:bridge.configured,mailboxes:boxes.map(box=>({id:box.id,address:box.address,connection:bridge.connections.find(connection=>connection.mailboxId===box.id)??null}))});
});
