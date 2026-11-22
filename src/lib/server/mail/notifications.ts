import { env } from "cloudflare:workers";
import { db, eq, member } from "@/db";
import { viewerMailboxes } from "./access";
import { toRole } from "../roles";

export async function recordMailNotifications(orgId: string, mailboxId: string, messageId: string, threadId: string) {
  const members = await db.select().from(member).where(eq(member.organizationId, orgId));
  const told: string[] = [];
  for (const membership of members) {
    const boxes = await viewerMailboxes({ orgId, userId: membership.userId, role: toRole(membership.role) });
    if (!boxes.some(box => box.id === mailboxId && box.followed)) continue;
    await env.DB.prepare("INSERT OR IGNORE INTO mail_notifications (id, org_id, user_id, mailbox_id, message_id, thread_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), orgId, membership.userId, mailboxId, messageId, threadId, Date.now()).run();
    told.push(membership.userId);
  }
  // Open bells update at once (lib/server/notifications.ts).
  const { announce } = await import("../notifications");
  await announce(orgId, told);
}
