import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { and, db, eq, member } from "@/db";
import { viewerMailboxes } from "@/lib/server/mail/access";
import { toRole } from "@/lib/server/roles";
import { mustChangePassword } from "@/lib/server/mail/account-security";
import { sha256Hex } from "@/lib/server/crypto";

const owners = z.object({ owners: z.array(z.object({ scope: z.string().regex(/^[a-f0-9]{64}$/), orgId: z.string().min(1).max(255), userId: z.string().min(1).max(255), mailboxIds:z.array(z.string().min(1).max(128)).max(1000).optional() }).strict()).max(40) }).strict();
export const POST: APIRoute = async ({ request }) => {
  const expected = Buffer.from(`Bearer ${env.MAIL_BRIDGE_TOKEN ?? ""}`), actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (!env.MAIL_BRIDGE_TOKEN || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let bytes = 0; const chunks: Uint8Array[] = [];
  if (request.body) for await (const chunk of request.body) {
    bytes += chunk.byteLength;
    if (bytes > 32768) return Response.json({ error: "Body too large" }, { status: 413 });
    chunks.push(chunk);
  }
  let parsed;
  try { parsed = owners.safeParse(JSON.parse(Buffer.concat(chunks).toString())); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!parsed.success) return Response.json({ error: "Invalid owners" }, { status: 422 });
  const mailboxes:Record<string,string[]>={};
  const valid = await Promise.all(parsed.data.owners.map(async owner => {
    if (owner.scope !== await sha256Hex(JSON.stringify([owner.orgId, owner.userId])) || await mustChangePassword(owner.userId)) return null;
    const [membership] = await db.select({ role: member.role }).from(member).where(and(eq(member.organizationId, owner.orgId), eq(member.userId, owner.userId))).limit(1);
    if(membership && owner.mailboxIds)mailboxes[owner.scope]=(await viewerMailboxes({orgId:owner.orgId,userId:owner.userId,role:toRole(membership.role)})).filter(box=>owner.mailboxIds!.includes(box.id)).map(box=>box.id);
    return membership ? owner.scope : null;
  }));
  return Response.json({ valid: valid.filter((scope): scope is string => scope !== null), ...(parsed.data.owners.some(owner=>owner.mailboxIds)?{mailboxes}:{}) }, { headers: { "cache-control": "no-store" } });
};
