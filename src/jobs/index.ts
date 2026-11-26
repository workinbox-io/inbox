/**
 * Queue jobs: the payload type of each job and its handler. Template jobs are here; add your
 * product's in ./app.ts. Handlers run in src/worker.ts and must be safe to retry.
 */
import type { EmailMessage } from "@/lib/server/email";
import { deliverEmail } from "@/lib/server/email";
import { notifySignup } from "@/lib/server/notify";
import { appJobs, type AppJobs } from "./app";

interface CoreJobs {
  email: EmailMessage;
  /** Heads-up to NOTIFY_EMAIL about a new account. */
  signup: { userId: string };
}

export type Jobs = CoreJobs & AppJobs;

export type JobHandlers<T> = { [K in keyof T]: (data: T[K]) => Promise<void> };

const coreJobs: JobHandlers<CoreJobs> = {
  email: deliverEmail,
  signup: ({ userId }) => notifySignup(userId),
};

export const jobHandlers: JobHandlers<Jobs> = { ...coreJobs, ...appJobs };
