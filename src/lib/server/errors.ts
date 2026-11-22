import { env } from "cloudflare:workers";
import { and, appErrors, db, eq, isNull, lt, or, sql } from "@/db";
import { emails } from "@/emails";
import { sendEmail } from "./email";

export type ErrorService = "web" | "queue" | "cron";

export interface ErrorInfo {
  name: string;
  message: string;
  stack?: string | null;
}

/** A known error keeps quiet for this long after an alert, however often it happens. */
export const ERROR_REALERT_MS = 24 * 3600_000;
export const ERROR_RETENTION_DAYS = 30;

export function toErrorInfo(e: unknown): ErrorInfo {
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack ?? null };
  if (e && typeof e === "object" && typeof (e as ErrorInfo).message === "string") {
    const { name, message, stack } = e as ErrorInfo;
    return { name: typeof name === "string" ? name : "Error", message, stack: typeof stack === "string" ? stack : null };
  }
  return { name: "NonError", message: typeof e === "string" ? e : (JSON.stringify(e) ?? String(e)) };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The first stack frame in our own code, without line numbers or build hashes. */
function originFrame(stack: string | null | undefined) {
  const frames = (stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at "));
  const frame = frames.find((l) => !l.includes("node_modules") && !l.includes("node:")) ?? frames[0] ?? "";
  const fn = frame.replace(/^at (async )?/, "").replace(/\s*\(.*\)$/, "");
  if (!fn.includes("/") && !fn.includes(":")) return fn;
  return (fn.split("/").pop() ?? fn).replace(/:\d+(:\d+)?$/, "").replace(/[._-][\w-]{8}(?=\.m?[jt]s$)/, "");
}

/** Same bug, same fingerprint: ids and numbers in the message and code positions don't count. */
export async function errorFingerprint(service: ErrorService, e: ErrorInfo) {
  const message = e.message.replace(UUID, "<id>").replace(/\d+/g, "#").slice(0, 300);
  const data = new TextEncoder().encode([service, e.name, message, originFrame(e.stack)].join("\n"));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Records an unexpected error and e-mails ALERT_EMAIL the first time it happens, then at most
 * once per ERROR_REALERT_MS. Never throws, so callers can fire and forget.
 */
export async function reportError(service: ErrorService, error: unknown, context?: Record<string, unknown>) {
  const e = toErrorInfo(error);
  console.error(`[${service}]`, error, context ?? "");
  try {
    const now = new Date();
    const values = {
      message: e.message.slice(0, 2000),
      stack: e.stack?.slice(0, 8000) ?? null,
      context: context ?? null,
      lastSeenAt: now,
    };
    const [row] = await db
      .insert(appErrors)
      .values({ fingerprint: await errorFingerprint(service, e), service, name: e.name, ...values, firstSeenAt: now })
      .onConflictDoUpdate({ target: appErrors.fingerprint, set: { ...values, count: sql`${appErrors.count} + 1` } })
      .returning();
    if (!row || !env.ALERT_EMAIL) return;

    // Claiming the alert in the same statement keeps concurrent reports from all sending one.
    const [claimed] = await db
      .update(appErrors)
      .set({ alertedAt: now })
      .where(and(eq(appErrors.id, row.id), or(isNull(appErrors.alertedAt), lt(appErrors.alertedAt, new Date(now.getTime() - ERROR_REALERT_MS)))))
      .returning({ id: appErrors.id });
    if (!claimed) return;
    await sendEmail({ to: env.ALERT_EMAIL, ...(await emails.errorAlert({ ...row, isNew: row.alertedAt === null })) });
  } catch (err) {
    console.error("[errors] could not record error:", (err as Error).message);
  }
}

export async function cleanupAppErrors(days = ERROR_RETENTION_DAYS) {
  await db.delete(appErrors).where(lt(appErrors.lastSeenAt, new Date(Date.now() - days * 86_400_000)));
}
