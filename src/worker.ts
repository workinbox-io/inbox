/**
 * The Worker's entry point (main in wrangler.jsonc): Astro serves HTTP, and the same Worker
 * consumes the JOBS queue, runs the cron triggers and receives mail for the staff mailboxes
 * (Email Routing "Send to Worker", lib/server/admin-mail.ts).
 */
import { handle } from "@astrojs/cloudflare/handler";
import { jobHandlers } from "@/jobs";
import { adminMailboxes } from "@/lib/server/admin";
import { handleAdminMail } from "@/lib/server/admin-mail";
import { handleOrgMail, wakeDueSnoozed } from "@/lib/server/mail/store";
import { dailyTasks } from "@/jobs/cron";
import { reportError } from "@/lib/server/errors";
import { backfillMailBodies } from "@/lib/server/mail/storage";
import { recoverOutbox, handleDeliveryEvent } from "@/lib/server/mail/outbox";
import type { JobMessage } from "@/lib/server/queue";
import { noteSync } from "@/lib/server/notes/sync";

// Durable Objects must be exported from the entry module (wrangler.jsonc → durable_objects).
export { NoteRoom } from "@/notes/room";

export default {
  async fetch(request, env, ctx) {
    // Shared notes' WebSockets go straight to the note's Durable Object (lib/server/notes/sync.ts).
    if (new URL(request.url).pathname.startsWith("/notes-sync/")) return noteSync(request);
    return handle(request, env, ctx);
  },

  async email(message) {
    const to = message.to.toLowerCase();
    try {
      // Organizations' mailboxes first (lib/server/mail/store.ts), then the staff mailboxes.
      if (await handleOrgMail(message)) return;
      if (!adminMailboxes().includes(to)) return message.setReject("Unknown address");
      await handleAdminMail(message, to);
    } catch (e) {
      await reportError("web", e, { where: "email", to });
      // Let the sender's server retry later instead of losing the mail.
      throw e;
    }
  },

  async queue(batch: MessageBatch<JobMessage | unknown>) {
    if (batch.queue === "inbox-mail-events") {
      for (const msg of batch.messages) {
        try { await handleDeliveryEvent(msg.body); msg.ack(); }
        catch (e) { await reportError("queue", e, { job: "mail.delivery" }); msg.retry({ delaySeconds: 60 }); }
      }
      return;
    }
    for (const msg of batch.messages) {
      const { type, data } = msg.body as JobMessage;
      const run = jobHandlers[type] as ((data: unknown) => Promise<void>) | undefined;
      if (!run) {
        console.error(`[queue] unknown job ${type}`);
        msg.ack();
        continue;
      }
      try {
        await run(data);
        msg.ack();
      } catch (e) {
        // Backoff: 30 s, 2 min, 8 min… until max_retries, then the message is dropped.
        await reportError("queue", e, { job: type, attempt: msg.attempts });
        msg.retry({ delaySeconds: Math.min(30 * 4 ** (msg.attempts - 1), 3600) });
      }
    }
  },

  async scheduled(controller) {
    if (controller.cron === "* * * * *") {
      for (const [name, task] of Object.entries({ wakeDueSnoozed, recoverOutbox, backfillMailBodies })) {
        try { await task(); }
        catch (error) { await reportError("cron", error, { task: name, cron: controller.cron }); }
      }
      return;
    }
    for (const [name, task] of Object.entries(dailyTasks)) {
      try {
        await task();
      } catch (e) {
        await reportError("cron", e, { task: name, cron: controller.cron });
      }
    }
  },
} satisfies ExportedHandler<Env, JobMessage | unknown>;
