/**
 * Your product's queue jobs. Enqueue with `enqueue("project.created", { projectId })`.
 * The template never edits this file.
 */
import type { JobHandlers } from ".";
import { deliverOutboxJob } from "@/lib/server/mail/outbox";
import { receiveSesMail } from "@/lib/server/mail/ses-inbound";
import { runImport } from "@/lib/server/mail/import";
import { syncSeats } from "@/lib/server/seats";

export interface AppJobs {
  "mail.send": { id: string };
  /** A mail SES received and stored in S3 (api/ses/webhook.ts). */
  "mail.inbound": { bucket: string; key: string; from: string; recipients: string[] };
  /** The next batch of a mail import (lib/server/mail/import.ts). */
  "mail.import": { id: string };
  "billing.seats": { orgId: string };
  "project.created": { projectId: string };
}

export const appJobs: JobHandlers<AppJobs> = {
  "mail.send": ({ id }) => deliverOutboxJob(id),
  "mail.inbound": (job) => receiveSesMail(job),
  "mail.import": ({ id }) => runImport(id),
  "billing.seats": ({ orgId }) => syncSeats(orgId),
  "project.created": async ({ projectId }) => {
    // Example: provision something, call a webhook, send a follow-up e-mail…
    console.log(`[jobs] project ${projectId} created`);
  },
};
