/**
 * Your product's hooks into the Worker entry (src/worker.ts). The template never edits this file.
 * Named exports are re-exported from the entry: put Durable Object classes here
 * (`export { MyRoom } from "@/rooms/my-room"`), with their binding in wrangler.jsonc.
 */
export interface AppWorker {
  /** Runs before Astro; return a Response to answer the request yourself (e.g. a WebSocket upgrade). */
  fetch?(request: Request): Response | undefined | Promise<Response | undefined>;
  /** Incoming mail, before the staff mailboxes; return true when you handled it. */
  email?(message: ForwardableEmailMessage): Promise<boolean>;
  /** Consumers for extra queues (wrangler.jsonc → queues.consumers), by queue name. */
  queues?: Record<string, (batch: MessageBatch<unknown>) => Promise<void>>;
  /** Tasks for cron triggers other than the daily one, by cron expression, then by task name. */
  crons?: Record<string, Record<string, () => Promise<unknown>>>;
}

export default {} satisfies AppWorker as AppWorker;
