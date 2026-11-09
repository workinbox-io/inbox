import { env } from "cloudflare:workers";
import { and, asc, db, eq, inArray, mailboxes, mailMessages, mailThreads, sql } from "@/db";
import { mailLabels, mailThreadLabels, mailFilters, mailForwardTargets, mailFilterRuns } from "@/db/schema/mail-storage";
import { isAutomatedMail } from "@/lib/mail/threading";
import { HttpError } from "@/lib/server/api";
import { matchesMailFilter } from "@/lib/mail/filters";
import { sendEmail } from "@/lib/server/email";
import type { z } from "zod";
import type { filterInput } from "@/lib/validation-mail-filters";
import type { Mailbox } from "./access";

const own = (id: string, boxes: Mailbox[]) => { const b = boxes.find(b => b.id === id); if (!b) throw new HttpError(404, "Not found"); return b; };
async function stampLabelThreads(mailboxId: string, threadIds: string[]) {
  if (!threadIds.length) return;
  const [box] = await db.update(mailboxes).set({modseq:sql`${mailboxes.modseq}+1`}).where(eq(mailboxes.id,mailboxId)).returning({modseq:mailboxes.modseq});
  if(!box)return;
  for(let i=0;i<threadIds.length;i+=50)await db.update(mailThreads).set({modseq:box.modseq}).where(and(eq(mailThreads.mailboxId,mailboxId),inArray(mailThreads.id,threadIds.slice(i,i+50))));
}
export async function listLabels(boxes: Mailbox[]) { return boxes.length ? db.select().from(mailLabels).where(inArray(mailLabels.mailboxId, boxes.map(b => b.id))) : []; }
export async function saveLabel(boxes: Mailbox[], input: { id?: string; mailboxId: string; name: string }) {
  own(input.mailboxId, boxes);
  if (input.id) {
    const [row] = await db.update(mailLabels).set({ name: input.name }).where(and(eq(mailLabels.id,input.id),eq(mailLabels.mailboxId,input.mailboxId))).returning();
    if (!row) throw new HttpError(404,"Not found"); return row;
  }
  const [row] = await db.insert(mailLabels).values({ mailboxId: input.mailboxId, name: input.name }).returning(); return row;
}
export async function deleteLabel(boxes: Mailbox[], id: string) {
  if (!boxes.length) throw new HttpError(404,"Not found");
  await db.delete(mailLabels).where(and(eq(mailLabels.id,id),inArray(mailLabels.mailboxId,boxes.map(b=>b.id))));
}
export async function assignLabel(boxes: Mailbox[], input: { labelId: string; threadIds: string[]; remove: boolean }) {
  const [label] = await db.select().from(mailLabels).where(eq(mailLabels.id,input.labelId));
  if (!label) throw new HttpError(404,"Not found"); own(label.mailboxId, boxes);
  const threads = await db.select({id:mailThreads.id}).from(mailThreads).where(and(inArray(mailThreads.id,input.threadIds),eq(mailThreads.mailboxId,label.mailboxId)));
  if (threads.length !== new Set(input.threadIds).size) throw new HttpError(404,"Not found");
  if(input.remove) await db.delete(mailThreadLabels).where(and(eq(mailThreadLabels.labelId,label.id),inArray(mailThreadLabels.threadId,input.threadIds)));
  else await db.insert(mailThreadLabels).values(threads.map(t=>({threadId:t.id,labelId:label.id}))).onConflictDoNothing();
  await stampLabelThreads(label.mailboxId,threads.map(t=>t.id));
}
export async function listFilters(boxes: Mailbox[]) {
  if(!boxes.length)return {filters:[],targets:[]}; const ids=boxes.map(b=>b.id);
  const [filters,targets] = await Promise.all([
    db.select().from(mailFilters).where(inArray(mailFilters.mailboxId,ids)).orderBy(asc(mailFilters.position),asc(mailFilters.id)),
    db.select({id:mailForwardTargets.id,mailboxId:mailForwardTargets.mailboxId,address:mailForwardTargets.address,verifiedAt:mailForwardTargets.verifiedAt}).from(mailForwardTargets).where(inArray(mailForwardTargets.mailboxId,ids)),
  ]); return {filters,targets};
}
export async function saveFilter(boxes: Mailbox[], input: z.output<typeof filterInput>) {
  own(input.mailboxId,boxes);
  if(input.actions.labelId){const [r]=await db.select().from(mailLabels).where(and(eq(mailLabels.id,input.actions.labelId),eq(mailLabels.mailboxId,input.mailboxId)));if(!r)throw new HttpError(422,"Choose a label from this mailbox");}
  if(input.actions.forwardTargetId){const [r]=await db.select().from(mailForwardTargets).where(and(eq(mailForwardTargets.id,input.actions.forwardTargetId),eq(mailForwardTargets.mailboxId,input.mailboxId)));if(!r?.verifiedAt)throw new HttpError(422,"Verify the forwarding address first");}
  const {id,...values}=input;
  if(id){const [row]=await db.update(mailFilters).set(values).where(and(eq(mailFilters.id,id),eq(mailFilters.mailboxId,input.mailboxId))).returning();if(!row)throw new HttpError(404,"Not found");return row;}
  const [row]=await db.insert(mailFilters).values(values).returning();return row;
}
export async function deleteFilter(boxes: Mailbox[], id: string) {
  if(!boxes.length)throw new HttpError(404,"Not found");await db.delete(mailFilters).where(and(eq(mailFilters.id,id),inArray(mailFilters.mailboxId,boxes.map(b=>b.id))));
}
const hash = async (value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,"0")).join("");
export async function requestForwardTarget(boxes:Mailbox[], input:{mailboxId:string;address:string}) {
  const box=own(input.mailboxId,boxes); if(input.address===box.address)throw new HttpError(422,"Choose a different forwarding address");
  const [existing]=await db.select().from(mailForwardTargets).where(and(eq(mailForwardTargets.mailboxId,box.id),eq(mailForwardTargets.address,input.address)));
  if(existing?.verifiedAt)return {id:existing.id,address:existing.address,verifiedAt:existing.verifiedAt};
  if(existing?.expiresAt && existing.expiresAt.getTime()>Date.now())throw new HttpError(409,"A confirmation has already been sent; check the destination mailbox");
  const token=crypto.randomUUID()+crypto.randomUUID();const id=crypto.randomUUID();
  await db.insert(mailForwardTargets).values({id,...input,tokenHash:await hash(token),expiresAt:new Date(Date.now()+86400000)});
  const url=new URL("/mail/verify-forward",env.PUBLIC_APP_URL);url.searchParams.set("id",id);url.searchParams.set("token",token);
  await sendEmail({to:input.address,subject:"Confirm mail forwarding",text:`Confirm forwarding from ${box.address}: ${url}`,html:`<p>Confirm mail forwarding using this link:</p><p><a href="${url.toString().replaceAll('&','&amp;')}">Confirm forwarding</a></p>`});
  return {id,address:input.address,verifiedAt:null};
}
export async function verifyForwardTarget(id:string,token:string){
  const [row]=await db.select().from(mailForwardTargets).where(eq(mailForwardTargets.id,id));
  if(!row?.tokenHash||row.tokenHash!==await hash(token)||!row.expiresAt||row.expiresAt.getTime()<Date.now())throw new HttpError(422,"This verification link is invalid or expired");
  await db.update(mailForwardTargets).set({verifiedAt:new Date(),tokenHash:null,expiresAt:null}).where(and(eq(mailForwardTargets.id,id),eq(mailForwardTargets.tokenHash,row.tokenHash)));return row.address;
}
/** Non-forwarding actions are repeatable; forwarding uses an outbox idempotency key per filter/message. */
export async function applyMailFilters(mailbox:Mailbox,messageId:string,headers:Headers, spam=false){
  const [message]=await db.select().from(mailMessages).where(and(eq(mailMessages.id,messageId),eq(mailMessages.mailboxId,mailbox.id)));
  if(!message||spam)return;
  const [thread]=await db.select().from(mailThreads).where(eq(mailThreads.id,message.threadId));if(!thread||thread.spam)return;
  const filters=await db.select().from(mailFilters).where(and(eq(mailFilters.mailboxId,mailbox.id),eq(mailFilters.enabled,true))).orderBy(asc(mailFilters.position),asc(mailFilters.id));
  for(const filter of filters){
    if(!matchesMailFilter(filter.conditions,{from:message.fromEmail,to:message.to+", "+message.cc,subject:message.subject,text:message.text,hasAttachment:message.files.length>0}))continue;
    const [done]=await db.select().from(mailFilterRuns).where(and(eq(mailFilterRuns.messageId,messageId),eq(mailFilterRuns.filterId,filter.id)));if(done)continue;
    if(filter.actions.labelId){const [label]=await db.select().from(mailLabels).where(and(eq(mailLabels.id,filter.actions.labelId),eq(mailLabels.mailboxId,mailbox.id)));if(label)await db.insert(mailThreadLabels).values({threadId:message.threadId,labelId:label.id}).onConflictDoNothing();}
    if(filter.actions.archive)await db.update(mailThreads).set({archivedAt:new Date()}).where(eq(mailThreads.id,message.threadId));
    if(filter.actions.forwardTargetId&&!headers.has("x-workinbox-forwarded")&&!isAutomatedMail(headers)&&!headers.has("list-id")){
      const [target]=await db.select().from(mailForwardTargets).where(and(eq(mailForwardTargets.id,filter.actions.forwardTargetId),eq(mailForwardTargets.mailboxId,mailbox.id)));
      if(target?.verifiedAt){
        const {sendMail}=await import("./store");
        await sendMail({mailbox:mailbox.address,forwardOf:messageId,to:target.address,text:"",automatedForward:true,idempotencyKey:`filter:${filter.id}:${messageId}`},[mailbox],mailbox.displayName);
      }
    }
    if(filter.actions.labelId||filter.actions.archive)await stampLabelThreads(mailbox.id,[message.threadId]);
    await db.insert(mailFilterRuns).values({messageId,filterId:filter.id}).onConflictDoNothing();
  }
}
