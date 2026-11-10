/**
 * Work Inbox's hooks into the Worker entry (src/worker.ts, template): org mail, shared notes' WebSockets,
 * delivery events from Email Service and the every-minute mail tasks.
 */
import { handleOrgMail, wakeDueSnoozed } from "@/lib/server/mail/store";
import { backfillMailBodies } from "@/lib/server/mail/storage";
import { backfillSentRaw } from "@/lib/server/mail/raw";
import { recoverOutbox, handleDeliveryEvent } from "@/lib/server/mail/outbox";
import { noteSync } from "@/lib/server/notes/sync";
import { reportError } from "@/lib/server/errors";

// Durable Objects must be exported from the entry module (wrangler.jsonc → durable_objects).
export { NoteRoom } from "@/notes/room";

export interface AppWorker {
  fetch?(request: Request): Response | undefined | Promise<Response | undefined>;
  email?(message: ForwardableEmailMessage): Promise<boolean>;
  queues?: Record<string, (batch: MessageBatch<unknown>) => Promise<void>>;
  crons?: Record<string, Record<string, () => Promise<unknown>>>;
}

export default {
  // Shared notes' WebSockets go straight to the note's Durable Object (lib/server/notes/sync.ts).
  fetch: (request) => (new URL(request.url).pathname.startsWith("/notes-sync/") ? noteSync(request) : undefined),
  // Organizations' mailboxes before the staff mailboxes (lib/server/mail/store.ts).
  email: handleOrgMail,
  queues: {
    "inbox-mail-events": async (batch) => {
      for (const msg of batch.messages) {
        try {
          await handleDeliveryEvent(msg.body);
          msg.ack();
        } catch (e) {
          await reportError("queue", e, { job: "mail.delivery" });
          msg.retry({ delaySeconds: 60 });
        }
      }
    },
  },
  crons: { "* * * * *": { wakeDueSnoozed, recoverOutbox, backfillMailBodies, backfillSentRaw } },
} satisfies AppWorker as AppWorker;
