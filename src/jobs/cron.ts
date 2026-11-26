/**
 * Daily housekeeping (crons in wrangler.jsonc → scheduled() in src/worker.ts). Every task is
 * idempotent and runs on its own, so one failing doesn't stop the rest.
 */
import { cleanupAuditLog } from "@/lib/server/audit";
import { cleanupAppErrors } from "@/lib/server/errors";
import { cleanupPageViews } from "@/lib/server/analytics";
import { cleanupExpiredAuth } from "@/lib/server/auth-cleanup";
import { sendTrialReminders } from "@/lib/server/billing";
import { appDailyTasks } from "./app-cron";

export const dailyTasks: Record<string, () => Promise<unknown>> = {
  cleanupAuditLog: () => cleanupAuditLog(),
  cleanupAppErrors: () => cleanupAppErrors(),
  cleanupPageViews: () => cleanupPageViews(),
  cleanupExpiredAuth,
  sendTrialReminders,
  ...appDailyTasks,
};
