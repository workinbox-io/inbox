import { env } from "cloudflare:workers";
import type { Jobs } from "@/jobs";

export type JobType = keyof Jobs;
export interface JobMessage<T extends JobType = JobType> {
  type: T;
  data: Jobs[T];
}

/**
 * Puts a job on the `JOBS` queue; src/worker.ts consumes it with the handlers in src/jobs.
 * Handlers must be idempotent: a failed message is retried (max_retries in wrangler.jsonc).
 */
export async function enqueue<T extends JobType>(type: T, data: Jobs[T], opts: { delaySeconds?: number } = {}) {
  await env.JOBS.send({ type, data } satisfies JobMessage<T>, { delaySeconds: opts.delaySeconds });
}
