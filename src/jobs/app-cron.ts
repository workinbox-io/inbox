/** Your product's daily tasks, run by the same cron as the template's (jobs/cron.ts). */
export const appDailyTasks: Record<string, () => Promise<unknown>> = {};
