/**
 * Work Inbox's hooks into the Worker entry (src/worker.ts, template): org mail, shared notes' WebSockets,
 * delivery events from Email Service and the every-minute mail tasks.
 */
import { handleOrgMail, wakeDueSnoozed } from "@/lib/server/mail/store";
import { backfillMailBodies } from "@/lib/server/mail/storage";
import { backfillSentRaw } from "@/lib/server/mail/raw";
import { recoverOutbox, handleDeliveryEvent } from "@/lib/server/mail/outbox";
import { sweepInboundMail } from "@/lib/server/mail/ses-inbound";
import { noteSync } from "@/lib/server/notes/sync";
import { chatSync } from "@/lib/server/chat/sync";
import { sendEventReminders } from "@/lib/server/calendar/reminders";
import { syncSubscribedCalendars } from "@/lib/server/calendar/import";
import { reportError } from "@/lib/server/errors";

// Durable Objects must be exported from the entry module (wrangler.jsonc → durable_objects).
export { NoteRoom } from "@/notes/room";
export { ChatRoom } from "@/chat/room";

export interface AppWorker {
  fetch?(request: Request): Response | undefined | Promise<Response | undefined>;
  email?(message: ForwardableEmailMessage): Promise<boolean>;
  queues?: Record<string, (batch: MessageBatch<unknown>) => Promise<void>>;
  crons?: Record<string, Record<string, () => Promise<unknown>>>;
}

export default {
  // Shared notes' and chat's WebSockets go straight to their Durable Objects (lib/server/notes/sync.ts, lib/server/chat/sync.ts).
  fetch: (request) => {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/notes-sync/")) return noteSync(request);
    if (path === "/chat-sync") return chatSync(request);
    return undefined;
  },
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
    // Jobs that used up their retries: logged with their payload so they can be replayed by hand. A dead
    // `mail.inbound` needs no replay, its mail is still in S3 and the hourly sweep queues it again.
    "inbox-jobs-dlq": async (batch) => {
      for (const msg of batch.messages) {
        const { type, data } = (msg.body ?? {}) as { type?: string; data?: unknown };
        await reportError("queue", new Error(`Job ${type} gave up after its retries`), { job: type, data: JSON.stringify(data).slice(0, 2000) });
        msg.ack();
      }
    },
  },
  crons: { "* * * * *": { wakeDueSnoozed, recoverOutbox, backfillMailBodies, backfillSentRaw, sendEventReminders: () => sendEventReminders(), syncSubscribedCalendars }, "41 * * * *": { sweepInboundMail } },
} satisfies AppWorker as AppWorker;
