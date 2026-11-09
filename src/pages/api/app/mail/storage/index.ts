import { db, eq, mailboxes } from "@/db";
import { canManage } from "@/lib/server/roles";
import { z } from "zod";
import { handler,manageHandler,json,parseBody } from "@/lib/server/api";
import { resolveMailboxes } from "@/lib/server/mail/access";
import { mailViewer } from "@/lib/server/mail/viewer";
import { listStorage,setStorageQuota } from "@/lib/server/mail/storage";
export const GET=handler(async ctx=>{const boxes=canManage(ctx.role)?await db.select({id:mailboxes.id}).from(mailboxes).where(eq(mailboxes.orgId,ctx.orgId)):await resolveMailboxes(mailViewer(ctx));return json({storage:await listStorage(boxes.map(b=>b.id))});});
export const POST=manageHandler(async ctx=>{const body=await parseBody(ctx.request,z.object({mailboxId:z.string().uuid(),quotaBytes:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}));await setStorageQuota(ctx.orgId,body.mailboxId,body.quotaBytes);ctx.audit("mail_storage.quota",{target:body.mailboxId,details:{quotaBytes:body.quotaBytes}});return json({ok:true});});
