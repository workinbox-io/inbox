/**
 * Notifications, the pure part: what kinds there are (each can be muted in Settings → Notifications), how a group's
 * people read ("Diana and 2 others"), the day headings, and the people mentioned in a note. The bell merges three
 * sources (lib/server/notifications.ts): mail (mail_notifications), chat (mentions and DMs) and the other apps
 * (`notifications`: shares, invitations, assignments, mentions in notes, automations). Tested in test/notifications.test.ts.
 */
import { msg } from "@/lib/i18n/panel";
export const NOTIFY_KINDS = ["share", "invite", "assign", "mention", "comment", "update", "automation"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export type NotifyApp = "notes" | "drive" | "collections" | "calendar";

/** Settings → Notifications, one switch each. */
export const KIND_LABELS: Record<NotifyKind, { title: string; hint: string }> = {
  share: { title: msg("Shared with you"), hint: msg("Notes, files, collections and calendars someone shares with you.") },
  invite: { title: msg("Invitations"), hint: msg("Events a colleague invites you to.") },
  assign: { title: msg("Assigned to you"), hint: msg("Records where someone puts you in a person field.") },
  mention: { title: msg("Mentions in notes"), hint: msg("Someone @mentions you in a note.") },
  comment: { title: msg("Comments"), hint: msg("New comments on records you're assigned to, created or commented on.") },
  update: { title: msg("Record updates"), hint: msg("Status changes on records you follow, requests waiting in triage, missed SLAs.") },
  automation: { title: msg("Automations"), hint: msg("Collection rules that notify you in the app.") },
};

/** "Diana", "Diana and Tomasz", "Diana, Tomasz and Anna", "Diana and 3 others"; `t` translates the joining words. */
export function actorsText(names: string[], t: (s: string, v?: Record<string, string | number>) => string = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? ""))) {
  const list = [...new Set(names.filter(Boolean))];
  if (!list.length) return t("Someone");
  if (list.length === 1) return list[0]!;
  if (list.length === 2) return t("{a} and {b}", { a: list[0]!, b: list[1]! });
  if (list.length === 3) return t("{a}, {b} and {c}", { a: list[0]!, b: list[1]!, c: list[2]! });
  return t("{a} and {n} others", { a: list[0]!, n: list.length - 1 });
}

/** Which heading a time goes under, in the viewer's local days. */
export function dayBucket(ms: number, now = Date.now()): "today" | "yesterday" | "earlier" {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (ms >= start.getTime()) return "today";
  if (ms >= start.getTime() - 86_400_000) return "yesterday";
  return "earlier";
}

/** A group's row in `notification_dismissals`. */
export type Dismissal = { at: number; until: number | null; muted: boolean };

/**
 * Where a group sits: in the inbox, snoozed (until its time), done (until something newer happens in it) or muted
 * (for good, until restored).
 */
export function placeGroup(d: Dismissal | undefined, groupAt: number, now = Date.now()): "inbox" | "snoozed" | "done" | "muted" {
  if (!d) return "inbox";
  if (d.muted) return "muted";
  if (d.until) return d.until > now ? "snoozed" : "inbox";
  return d.at >= groupAt ? "done" : "inbox";
}

/** Snooze choices in the viewer's local time: later today at 17:00 (in 3 hours after 14:00), tomorrow and next Monday at 9:00. */
export function snoozeTimes(now = Date.now()) {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  const early = new Date(now).getHours() < 14;
  const toMonday = (8 - new Date(now).getDay()) % 7 || 7;
  return [
    { id: early ? "later" : "in3h", at: early ? at(0, 17) : now + 3 * 3600_000 },
    { id: "tomorrow", at: at(1, 9) },
    { id: "nextWeek", at: at(toMonday, 9) },
  ] as const;
}

/** The ids of people @mentioned in a note (Plate mention nodes: `{ type: "mention", key: userId }`). */
export function noteMentions(value: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as { type?: unknown; key?: unknown; children?: unknown };
    if (n.type === "mention" && typeof n.key === "string" && n.key) out.add(n.key);
    walk(n.children);
  };
  walk(value);
  return out;
}
