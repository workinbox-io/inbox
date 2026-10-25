/**
 * The Worker's entry point (main in wrangler.jsonc): Astro serves HTTP, and the same Worker
 * consumes the JOBS queue and runs the cron triggers.
 */
import { handle } from "@astrojs/cloudflare/handler";
import { jobHandlers } from "@/jobs";
import { dailyTasks } from "@/jobs/cron";
import { reportError } from "@/lib/server/errors";
import type { JobMessage } from "@/lib/server/queue";

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),

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
