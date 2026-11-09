/** Your product's daily tasks, run by the same cron as the template's (jobs/cron.ts). */
import { reconcileSeats } from "@/lib/server/seats";

export const appDailyTasks: Record<string, () => Promise<unknown>> = {
  /** Paddle quantities = personal mailboxes, in case a change was missed. */
  seats: reconcileSeats,
};
