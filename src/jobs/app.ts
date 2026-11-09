/**
 * Your product's queue jobs. Enqueue with `enqueue("project.created", { projectId })`.
 * The template never edits this file.
 */
import type { JobHandlers } from ".";
import { deliverOutboxJob } from "@/lib/server/mail/outbox";

export interface AppJobs {
  "mail.send": { id: string };
  "project.created": { projectId: string };
}

export const appJobs: JobHandlers<AppJobs> = {
  "mail.send": ({ id }) => deliverOutboxJob(id),
  "project.created": async ({ projectId }) => {
    // Example: provision something, call a webhook, send a follow-up e-mail…
    console.log(`[jobs] project ${projectId} created`);
  },
};
