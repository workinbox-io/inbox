/**
 * Your product's queue jobs. Enqueue with `enqueue("project.created", { projectId })`.
 * The template never edits this file.
 */
import type { JobHandlers } from ".";

export interface AppJobs {
  "project.created": { projectId: string };
}

export const appJobs: JobHandlers<AppJobs> = {
  "project.created": async ({ projectId }) => {
    // Example: provision something, call a webhook, send a follow-up e-mail…
    console.log(`[jobs] project ${projectId} created`);
  },
};
