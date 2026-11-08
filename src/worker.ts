/**
 * The Worker's entry point (main in wrangler.jsonc): Astro serves HTTP, and the same Worker
 * consumes the JOBS queue, runs the cron triggers and receives mail for the staff mailboxes
 * (Email Routing "Send to Worker", lib/server/admin-mail.ts).
 */
import { handle } from "@astrojs/cloudflare/handler";
import { jobHandlers } from "@/jobs";
import { adminMailboxes } from "@/lib/server/admin";
import { handleAdminMail } from "@/lib/server/admin-mail";
import { handleOrgMail } from "@/lib/server/mail/store";
import { dailyTasks } from "@/jobs/cron";
import { reportError } from "@/lib/server/errors";
import type { JobMessage } from "@/lib/server/queue";

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),

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

  async queue(batch: MessageBatch<JobMessage>) {
    for (const msg of batch.messages) {
      const { type, data } = msg.body;
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
    for (const [name, task] of Object.entries(dailyTasks)) {
      try {
        await task();
      } catch (e) {
        await reportError("cron", e, { task: name, cron: controller.cron });
      }
    }
  },
} satisfies ExportedHandler<Env, JobMessage>;
