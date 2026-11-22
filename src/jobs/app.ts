/**
 * Your product's queue jobs. Enqueue with `enqueue("mail.send", { id })`.
 * The template never edits this file.
 */
import type { JobHandlers } from ".";
import { deliverOutboxJob } from "@/lib/server/mail/outbox";
import { receiveSesMail } from "@/lib/server/mail/ses-inbound";
import { runImport } from "@/lib/server/mail/import";
import { syncSeats } from "@/lib/server/seats";
import { recheckDomain } from "@/lib/server/mail/admin";
import { purgeSubtree } from "@/lib/server/drive/items";
import { runAutomation } from "@/lib/server/collection-automations";
import { applyGitEvents } from "@/lib/server/collection-git";
import type { GitEvent } from "@/lib/collections/git";
import { memberLeft } from "@/lib/server/member-left";

export interface AppJobs {
  "mail.send": { id: string };
  /** A mail SES received and stored in S3 (api/ses/webhook.ts); `recover` = found by the S3 sweep, envelope from headers. */
  "mail.inbound": { bucket: string; key: string; from: string; recipients: string[]; recover?: boolean };
  /** The next batch of a mail import (lib/server/mail/import.ts). */
  "mail.import": { id: string };
  "billing.seats": { orgId: string };
  /** Re-check a new domain until it verifies (lib/server/mail/admin.ts claimSubdomain). */
  "mail.domainCheck": { orgId: string; domainId: string; attempt: number };
  /** Delete a drive item and everything under its path for good (lib/server/drive/items.ts). */
  "drive.purge": { orgId: string; path: string };
  /** One collection automation for one record write (lib/server/collection-automations.ts). */
  "collections.automation": { orgId: string; automationId: string; recordId: string };
  /** Branches, commits, PRs and deploys from a collection's GitHub webhook or the API (lib/server/collection-git.ts). */
  "collections.git": { orgId: string; collectionId: string; events: GitEvent[] };
  /** Someone left or was removed from an org (lib/server/member-left.ts). */
  "org.memberLeft": { orgId: string; userId: string };
}

export const appJobs: JobHandlers<AppJobs> = {
  "mail.send": ({ id }) => deliverOutboxJob(id),
  "mail.inbound": (job) => receiveSesMail(job),
  "mail.import": ({ id }) => runImport(id),
  "billing.seats": ({ orgId }) => syncSeats(orgId),
  "mail.domainCheck": (job) => recheckDomain(job),
  "drive.purge": ({ orgId, path }) => purgeSubtree(orgId, path),
  "collections.automation": (job) => runAutomation(job),
  "collections.git": (job) => applyGitEvents(job),
  "org.memberLeft": ({ orgId, userId }) => memberLeft(orgId, userId),
};
