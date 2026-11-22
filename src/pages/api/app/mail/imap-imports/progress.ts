import { HttpError, manageHandler } from "@/lib/server/api";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { imapImportsRequest } from "@/lib/server/mail/bridge";

/** Only this person's imports, narrowed to mailboxes they can still open; no source credentials or identity. */
export const GET = manageHandler(async ctx => {
  if (!ctx.locals.user || ctx.locals.apiKeyId) throw new HttpError(403, "Sign in to view mail imports");
  let response: Response;
  try { response = await imapImportsRequest(ctx,"GET"); }
  catch (error) { if (error instanceof HttpError && error.status === 503) return Response.json([], { headers: { "cache-control": "no-store" } }); throw error; }
  const data = await response.json() as { imports: { id: string; mailboxId: string; status: string; copied: number; skipped: number; total?: number | null; etaSeconds?: number | null }[] };
  const boxes = await viewerMailboxes({ orgId: ctx.orgId, userId: ctx.locals.user.id, role: ctx.role });
  return Response.json(data.imports.flatMap(job => {
    const box = boxes.find(box => box.id === job.mailboxId);
    if (!box || !["queued","running","failed"].includes(job.status)) return [];
    return [{ id: job.id, mailbox: box.address, status: job.status, processed: job.copied+job.skipped, total: job.total ?? null, etaSeconds: job.etaSeconds ?? null }];
  }), { headers: { "cache-control": "no-store" } });
});
