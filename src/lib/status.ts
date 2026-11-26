/** Public status page: components, labels and the flip rule (pure, tested in test/status.test.ts). */
export const SERVICE_STATUSES = ["ok", "degraded", "down"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const STATUS_COMPONENTS = [
  { id: "app", name: "Web app and API", description: "Mail, chat, notes, calendar, drive and contacts in the browser, sign-in and the API." },
  { id: "storage", name: "Files and attachments", description: "Attachments, Drive files and stored messages." },
  { id: "sending", name: "Sending mail", description: "Outgoing mail leaving on time." },
  { id: "bridge", name: "Mail apps (IMAP and SMTP)", description: "Apple Mail, Outlook, Thunderbird and phones." },
] as const;

export type StatusComponentId = (typeof STATUS_COMPONENTS)[number]["id"];

export const STATUS_LABELS: Record<ServiceStatus | "unknown", string> = {
  ok: "Operational",
  degraded: "Degraded",
  down: "Outage",
  unknown: "No data",
};

const RANK: Record<ServiceStatus, number> = { ok: 0, degraded: 1, down: 2 };

/** The worse of the given statuses; "ok" for none. */
export const worstStatus = (statuses: ServiceStatus[]) =>
  statuses.reduce<ServiceStatus>((worst, s) => (RANK[s] > RANK[worst] ? s : worst), "ok");

/** A changed result must repeat this many checks in a row before the status flips. */
export const CONFIRM_CHECKS = 2;
/** Older results mean the checker itself (the every-minute cron) has stopped. */
export const STATUS_STALE_MS = 5 * 60_000;

interface Current { status: ServiceStatus; pendingStatus: ServiceStatus | null; pendingCount: number }

/** Decides the next confirmed status: a change only sticks after CONFIRM_CHECKS identical results. */
export function nextStatus(cur: Current | null, result: ServiceStatus) {
  if (!cur) return { status: result, changed: result !== "ok", pendingStatus: null, pendingCount: 0 };
  if (result === cur.status) return { status: cur.status, changed: false, pendingStatus: null, pendingCount: 0 };
  const count = cur.pendingStatus === result ? cur.pendingCount + 1 : 1;
  if (count >= CONFIRM_CHECKS) return { status: result, changed: true, pendingStatus: null, pendingCount: 0 };
  return { status: cur.status, changed: false, pendingStatus: result, pendingCount: count };
}
