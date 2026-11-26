/** Your product's daily tasks, run by the same cron as the template's (jobs/cron.ts). */
import { cleanDrive } from "@/lib/server/drive/items";
import { reconcileSeats } from "@/lib/server/seats";
import { purgeTrash } from "@/lib/server/collections";
import { rollCycles } from "@/lib/server/collection-planning";

export const appDailyTasks: Record<string, () => Promise<unknown>> = {
  /** Paddle quantities = personal mailboxes, in case a change was missed. */
  seats: reconcileSeats,
  /** Drive trash older than 30 days, and multipart uploads never completed. */
  drive: cleanDrive,
  /** Collections: the trash after 30 days; open records of ended cycles into the current one. */
  collectionsTrash: purgeTrash,
  collectionsCycles: rollCycles,
};
