/**
 * Public status page (/status, /api/status), ported from CloudFile: the every-minute cron probes each
 * component, a change sticks after CONFIRM_CHECKS identical results, opens or closes an incident and
 * e-mails ALERT_EMAIL. Rules in lib/status.ts.
 */
import { env } from "cloudflare:workers";
import { and, db, desc, eq, gte, isNull, sql, statusComponents, statusDays, statusIncidents } from "@/db";
import { appUrl } from "@/emails/urls";
import {
  STATUS_COMPONENTS, STATUS_LABELS, STATUS_STALE_MS, nextStatus, worstStatus,
  type ServiceStatus, type StatusComponentId,
} from "@/lib/status";
import { sendEmail } from "./email";

export interface ProbeResult {
  status: ServiceStatus;
  /** Internal detail for alerts; never shown on the public page. */
  detail?: string;
}

/** The mail apps row only exists where the mail bridge is set up. */
const components = () => STATUS_COMPONENTS.filter((c) => c.id !== "bridge" || !!env.MAIL_BRIDGE_URL);

const withTimeout = <T>(ms: number, p: Promise<T>) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms))]);

const failed = (what: string, e: unknown): ProbeResult => ({ status: "down", detail: `${what}: ${(e as Error).message}` });

async function probeApp(): Promise<ProbeResult> {
  const started = Date.now();
  try {
    await withTimeout(10_000, db.run(sql`select 1`));
    const ms = Date.now() - started;
    return ms > 3000 ? { status: "degraded", detail: `database took ${ms} ms` } : { status: "ok" };
  } catch (e) {
    return failed("database", e);
  }
}

async function probeStorage(): Promise<ProbeResult> {
  try {
    await withTimeout(10_000, env.FILES.list({ prefix: "_status/", limit: 1 }));
    return { status: "ok" };
  } catch (e) {
    return failed("R2", e);
  }
}

/** recoverOutbox picks up due mail every minute, so mail due 5+ minutes ago is stuck. */
async function probeSending(): Promise<ProbeResult> {
  const row = await env.DB.prepare("SELECT count(*) AS n FROM mail_outbox WHERE status='pending' AND send_at<?")
    .bind(Date.now() - 5 * 60_000).first<{ n: number }>();
  const stuck = row?.n ?? 0;
  return stuck ? { status: "degraded", detail: `${stuck} messages waiting over 5 minutes` } : { status: "ok" };
}

async function probeBridge(): Promise<ProbeResult> {
  try {
    const res = await fetch(new URL("/health", env.MAIL_BRIDGE_URL), { headers: { authorization: `Bearer ${env.MAIL_BRIDGE_TOKEN ?? ""}` }, signal: AbortSignal.timeout(10_000) });
    return res.ok ? { status: "ok" } : { status: "down", detail: `mail bridge /health returned ${res.status}` };
  } catch (e) {
    return failed("mail bridge", e);
  }
}

const PROBES: Record<StatusComponentId, () => Promise<ProbeResult>> = { app: probeApp, storage: probeStorage, sending: probeSending, bridge: probeBridge };

export async function runStatusChecks(now = new Date()) {
  const list = components();
  const results = await Promise.all(list.map((c) => PROBES[c.id]().catch((e) => failed(c.id, e))));
  for (const [i, c] of list.entries()) await recordStatus(c.id, results[i]!, now);
}

export async function recordStatus(component: StatusComponentId, result: ProbeResult, now = new Date()) {
  const [cur] = await db.select().from(statusComponents).where(eq(statusComponents.component, component));
  const next = nextStatus(cur ?? null, result.status);
  const row = {
    status: next.status,
    detail: result.detail ?? null,
    checkedAt: now,
    pendingStatus: next.pendingStatus,
    pendingCount: next.pendingCount,
    ...(next.changed || !cur ? { since: now } : {}),
  };
  const col = statusDays[next.status];
  await db.batch([
    cur
      ? db.update(statusComponents).set(row).where(eq(statusComponents.component, component))
      : db.insert(statusComponents).values({ component, since: now, ...row }),
    db.insert(statusDays)
      .values({ component, day: isoDay(now), [next.status]: 1 })
      .onConflictDoUpdate({ target: [statusDays.component, statusDays.day], set: { [next.status]: sql`${col} + 1` } }),
  ]);
  if (!next.changed) return;

  await db.update(statusIncidents).set({ resolvedAt: now }).where(and(eq(statusIncidents.component, component), isNull(statusIncidents.resolvedAt)));
  if (next.status !== "ok") await db.insert(statusIncidents).values({ component, status: next.status, detail: result.detail ?? null, startedAt: now });
  await sendStatusAlert(component, cur?.status ?? "ok", next.status, result.detail, cur?.since ?? now, now);
}

/** One line to ALERT_EMAIL (comma-separated) when a component changes; never throws. */
async function sendStatusAlert(component: StatusComponentId, from: ServiceStatus, to: ServiceStatus, detail: string | undefined, since: Date, at: Date) {
  const name = STATUS_COMPONENTS.find((c) => c.id === component)?.name ?? component;
  const minutes = Math.max(1, Math.round((at.getTime() - since.getTime()) / 60_000));
  const line = to === "ok"
    ? `✅ ${name} recovered after ${minutes} min (${STATUS_LABELS[from].toLowerCase()}).`
    : `🔴 ${name}: ${STATUS_LABELS[to].toLowerCase()}${detail ? ` – ${detail}` : ""}`;
  console.log(`[status] ${line}`);
  const recipients = (env.ALERT_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const page = appUrl("/status");
  const text = `${line}\n\n${page}`;
  const html = `<p>${escapeHtml(line)}</p><p><a href="${page}">${page}</a></p>`;
  for (const to of recipients) {
    await sendEmail({ to, subject: `[status] ${line}`.slice(0, 200), text, html }).catch((e) => console.error("[status] alert failed:", (e as Error).message));
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---------------------------------------------------------------------------
// Public page
// ---------------------------------------------------------------------------

export interface StatusDay {
  day: string;
  /** null when there is no data for the day. */
  status: ServiceStatus | null;
  /** Share of checks that were up (ok or degraded); null without data. */
  uptime: number | null;
  /** Minutes (checks) the component was down. */
  downMinutes: number;
}

export interface StatusOverview {
  status: ServiceStatus | "unknown";
  updatedAt: string | null;
  components: {
    id: StatusComponentId;
    name: string;
    description: string;
    status: ServiceStatus | "unknown";
    since: string | null;
    uptime: number | null;
    days: StatusDay[];
  }[];
  incidents: { id: string; component: string; status: ServiceStatus; startedAt: string; resolvedAt: string | null }[];
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function getStatusOverview(days = 90, now = new Date()): Promise<StatusOverview> {
  const first = new Date(now.getTime() - (days - 1) * 86_400_000);
  const [current, counts, recent] = await Promise.all([
    db.select().from(statusComponents),
    db.select().from(statusDays).where(gte(statusDays.day, isoDay(first))),
    db.select().from(statusIncidents)
      .where(gte(statusIncidents.startedAt, new Date(now.getTime() - 30 * 86_400_000)))
      .orderBy(desc(statusIncidents.startedAt))
      .limit(50),
  ]);

  const dayList = Array.from({ length: days }, (_, i) => isoDay(new Date(first.getTime() + i * 86_400_000)));
  const list = components().map((c) => {
    const cur = current.find((r) => r.component === c.id);
    const stale = !cur || now.getTime() - cur.checkedAt.getTime() > STATUS_STALE_MS;
    let up = 0;
    let total = 0;
    const perDay = dayList.map((day): StatusDay => {
      const r = counts.find((x) => x.component === c.id && x.day === day);
      const n = r ? r.ok + r.degraded + r.down : 0;
      if (!r || !n) return { day, status: null, uptime: null, downMinutes: 0 };
      up += r.ok + r.degraded;
      total += n;
      return { day, status: r.down ? "down" : r.degraded ? "degraded" : "ok", uptime: (r.ok + r.degraded) / n, downMinutes: r.down };
    });
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      status: stale ? ("unknown" as const) : cur.status,
      since: cur && !stale ? cur.since.toISOString() : null,
      uptime: total ? up / total : null,
      days: perDay,
    };
  });

  const known = list.flatMap((c) => (c.status === "unknown" ? [] : [c.status]));
  const updated = current.reduce<Date | null>((max, r) => (!max || r.checkedAt > max ? r.checkedAt : max), null);
  return {
    status: known.length === list.length ? worstStatus(known) : "unknown",
    updatedAt: updated?.toISOString() ?? null,
    components: list,
    incidents: recent.map((i) => ({
      id: i.id,
      component: STATUS_COMPONENTS.find((c) => c.id === i.component)?.name ?? i.component,
      status: i.status,
      startedAt: i.startedAt.toISOString(),
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
    })),
  };
}
