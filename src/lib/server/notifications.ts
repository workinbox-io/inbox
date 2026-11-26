/**
 * The bell (pure rules: lib/notifications.ts). Three sources, one list of groups:
 * - mail: `mail_notifications`, one row per message, grouped by thread;
 * - chat: mentions and direct messages (chat/messages.ts `chatNotifications`), read once the conversation is read,
 *   grouped by conversation or thread;
 * - the other apps: `notifications`, written by `notify()` (shares, invitations, assignments, mentions in notes,
 *   automations), grouped by `group_key`.
 * Group keys: `mail:<threadId>`, `chat:<channelId>:<threadRootId|>`, `app:<groupKey>`. Every change is announced to the
 * person's open tabs through the chat room (`{ type: "notification" }`), so bells update at once.
 */
import { env } from "cloudflare:workers";
import { and, chatFollows, chatMembers, chatMessages, db, desc, eq, inArray, isNull, lt, member, ne, notificationDismissals, notificationPrefs, notifications, sql, user } from "@/db";
import { NOTIFY_KINDS, placeGroup, type NotifyApp, type NotifyKind } from "@/lib/notifications";
import type { ModuleId } from "@/config/modules";
import { HttpError } from "./api";
import { sendEmail } from "./email";
import { userLocale, withLocale } from "./i18n";
import { reportError } from "./errors";
import { viewerMailboxes } from "./mail/access";
import { disabledModules } from "./modules";
import type { OrgRole } from "./roles";

export type NotifyViewer = { orgId: string; userId: string; role: OrgRole };

// Loaded when used: modules that only write notifications (calendar, notes…) don't pull in the chat room's client.
const publish: typeof import("./chat/sync").publish = async (...args) => (await import("./chat/sync")).publish(...args);
const chatNotifications: typeof import("./chat/messages").chatNotifications = async (...args) => (await import("./chat/messages")).chatNotifications(...args);

export interface NotifyInput {
  kind: NotifyKind;
  app: NotifyApp;
  /** Who did it; they aren't notified. Null for automations. */
  actorId: string | null;
  title: string;
  body?: string;
  href: string;
  groupKey: string;
}

/** Tells people about something in an app. Never fails the change that caused it. */
export async function notify(orgId: string, userIds: (string | null | undefined)[], n: NotifyInput) {
  try {
    const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== n.actorId))].slice(0, 200);
    if (!ids.length) return;
    // Stored lists (automations, sharing) can still name people who left the org.
    const [prefs, members] = await Promise.all([
      db.select({ userId: notificationPrefs.userId, muted: notificationPrefs.muted }).from(notificationPrefs).where(inArray(notificationPrefs.userId, ids)),
      db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, orgId), inArray(member.userId, ids))),
    ]);
    const inOrg = new Set(members.map((m) => m.userId));
    const to = ids.filter((id) => inOrg.has(id) && !prefs.find((p) => p.userId === id)?.muted.includes(n.kind));
    if (!to.length) return;
    const now = new Date();
    await db.insert(notifications).values(to.map((userId) => ({ orgId, userId, kind: n.kind, app: n.app, actorId: n.actorId, title: n.title.slice(0, 200) || "Untitled", body: (n.body ?? "").slice(0, 300), href: n.href, groupKey: n.groupKey, createdAt: now })));
    await publish(orgId, { type: "notification" }, to);
  } catch (e) {
    await reportError("web", e, { route: "notify", orgId });
  }
}

/** Announces a change of the bell (mail arrived, something was read) to the person's open tabs. */
export const announce = (orgId: string, userIds: string[]) => (userIds.length ? publish(orgId, { type: "notification" }, userIds).then(() => undefined) : Promise.resolve());

export type GroupKind = "mail" | "dm" | "chat-mention" | "thread" | NotifyKind;

export interface NotificationGroup {
  key: string;
  source: "mail" | "chat" | "app";
  kind: GroupKind;
  app: "mail" | "chat" | NotifyApp;
  title: string;
  preview: string;
  /** Latest first, distinct. */
  actors: { name: string; email: string }[];
  count: number;
  unread: number;
  at: number;
  href: string;
  /** "For you" (mentions, direct messages, assignments, invitations, shares, mail to one's own mailbox); else "Watching". */
  direct: boolean;
  /** The latest few items, newest first, for the stacked preview. */
  items: { name: string; text: string; at: number }[];
  /** Snoozed: when it comes back. */
  until?: number;
  /** In "Done" because it was muted. */
  muted?: boolean;
}

const MENTION_KINDS: GroupKind[] = ["dm", "chat-mention", "mention", "assign", "invite", "share"];
const STACK = 3;

function addActor(list: NotificationGroup["actors"], name: string, email: string) {
  if (!list.some((a) => a.email === email && a.name === name)) list.push({ name, email });
}

async function mailGroups(v: NotifyViewer): Promise<NotificationGroup[]> {
  const boxes = await viewerMailboxes(v);
  if (!boxes.length) return [];
  const marks = boxes.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT n.thread_id AS threadId, n.mailbox_id AS mailboxId, n.created_at AS createdAt, n.read_at AS readAt, m.subject, m.from_email AS sender, m.from_name AS senderName, substr(m.text, 1, 300) AS preview
     FROM mail_notifications n JOIN mail_messages m ON m.id = n.message_id
     WHERE n.org_id = ? AND n.user_id = ? AND n.mailbox_id IN (${marks})
       AND n.thread_id NOT IN (SELECT id FROM mail_threads WHERE spam = 1) ORDER BY n.created_at DESC LIMIT 200`,
  ).bind(v.orgId, v.userId, ...boxes.map((b) => b.id)).all<{ threadId: string; mailboxId: string; createdAt: number; readAt: number | null; subject: string | null; sender: string; senderName: string | null; preview: string | null }>();
  const groups = new Map<string, NotificationGroup>();
  for (const r of rows.results) {
    let g = groups.get(r.threadId);
    if (!g) {
      const box = boxes.find((b) => b.id === r.mailboxId);
      const personal = box?.kind === "personal" && box.userId === v.userId;
      g = { key: `mail:${r.threadId}`, source: "mail", kind: "mail", app: "mail", title: r.subject || "(No subject)", preview: quoteless(r.preview ?? ""), actors: [], count: 0, unread: 0, at: r.createdAt, href: `/app/mail?t=${encodeURIComponent(r.threadId)}`, direct: personal, items: [] };
      groups.set(r.threadId, g);
    }
    if (g.items.length < STACK) g.items.push({ name: r.senderName || r.sender, text: quoteless(r.preview ?? ""), at: r.createdAt });
    g.count++;
    if (!r.readAt) g.unread++;
    addActor(g.actors, r.senderName || r.sender, r.sender);
  }
  return [...groups.values()];
}

/** The reply, without the quoted history under it. */
const quoteless = (text: string) => text.split(/\n(?:On .{4,120} wrote:|-{2,} ?Original Message|>)/)[0]!.replace(/\s+/g, " ").trim().slice(0, 200);

async function chatGroups(v: NotifyViewer): Promise<NotificationGroup[]> {
  const { notifications: items } = await chatNotifications(v, 100);
  const groups = new Map<string, NotificationGroup>();
  for (const n of items) {
    const key = `chat:${n.channelId}:${n.parentId ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      const kind: GroupKind = n.dm ? "dm" : n.mention ? "chat-mention" : "thread";
      g = { key, source: "chat", kind, app: "chat", title: n.title, preview: n.preview, actors: [], count: 0, unread: 0, at: n.createdAt, href: n.href, direct: true, items: [] };
      groups.set(key, g);
    }
    if (g.items.length < STACK) g.items.push({ name: n.senderName, text: n.preview, at: n.createdAt });
    g.count++;
    if (!n.read) g.unread++;
    addActor(g.actors, n.senderName, n.sender);
  }
  return [...groups.values()];
}

async function appGroups(v: NotifyViewer, off: ModuleId[]): Promise<NotificationGroup[]> {
  const rows = await db
    .select({ n: notifications, actorName: user.name, actorEmail: user.email })
    .from(notifications)
    .leftJoin(user, eq(user.id, notifications.actorId))
    .where(and(eq(notifications.orgId, v.orgId), eq(notifications.userId, v.userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(200);
  const groups = new Map<string, NotificationGroup>();
  for (const { n, actorName, actorEmail } of rows) {
    if (off.includes(n.app as ModuleId)) continue;
    let g = groups.get(n.groupKey);
    if (!g) {
      g = { key: `app:${n.groupKey}`, source: "app", kind: n.kind, app: n.app, title: n.title, preview: n.body, actors: [], count: 0, unread: 0, at: n.createdAt.getTime(), href: n.href, direct: MENTION_KINDS.includes(n.kind), items: [] };
      groups.set(n.groupKey, g);
    }
    if (g.items.length < STACK) g.items.push({ name: actorName || actorEmail || "", text: n.body || n.title, at: n.createdAt.getTime() });
    g.count++;
    if (!n.readAt) g.unread++;
    if (actorEmail) addActor(g.actors, actorName || actorEmail, actorEmail);
  }
  return [...groups.values()];
}

/**
 * The bell: newest group first. `unread` counts unread "For you" groups (the bell's badge), `watching` the others';
 * `snoozed` and `done` (the latest 30, muted ones included) are the two side views.
 */
export async function listNotifications(v: NotifyViewer, filter: "all" | "unread" | "mentions" = "all") {
  const off = await disabledModules(v.orgId);
  const [mail, chat, app] = await Promise.all([
    mailGroups(v).catch(() => []),
    off.includes("chat") ? Promise.resolve([]) : chatGroups(v).catch(() => []),
    appGroups(v, off),
  ]);
  const rows = await db.select().from(notificationDismissals).where(eq(notificationDismissals.userId, v.userId)).limit(1000);
  const dismissed = new Map(rows.map((d) => [d.key, { at: d.at.getTime(), until: d.until?.getTime() ?? null, muted: d.muted }]));
  const all: NotificationGroup[] = [];
  const snoozed: NotificationGroup[] = [];
  const done: (NotificationGroup & { doneAt: number })[] = [];
  const now = Date.now();
  for (const g of [...mail, ...chat, ...app].sort((a, b) => b.at - a.at)) {
    const d = dismissed.get(g.key);
    const place = placeGroup(d, g.at, now);
    if (place === "inbox") all.push(g);
    else if (place === "snoozed") snoozed.push({ ...g, until: d!.until! });
    else done.push({ ...g, unread: 0, muted: place === "muted", doneAt: d!.at });
  }
  const shown = filter === "unread" ? all.filter((g) => g.unread) : filter === "mentions" ? all.filter((g) => g.direct) : all;
  return {
    groups: shown.slice(0, 80),
    unread: all.filter((g) => g.unread && g.direct).length,
    watching: all.filter((g) => g.unread && !g.direct).length,
    snoozed: snoozed.sort((a, b) => a.until! - b.until!).slice(0, 50),
    done: done.sort((a, b) => b.doneAt - a.doneAt).slice(0, 30).map(({ doneAt: _, ...g }) => g),
  };
}

/** Marks groups read or unread (unread: their latest item only, as mail and chat do). */
export async function markNotifications(v: NotifyViewer, keys: string[], read: boolean) {
  const now = new Date();
  for (const key of keys.slice(0, 100)) {
    const [source, a = "", b = ""] = key.split(":");
    if (source === "mail") {
      if (read) await env.DB.prepare("UPDATE mail_notifications SET read_at = ? WHERE org_id = ? AND user_id = ? AND thread_id = ? AND read_at IS NULL").bind(now.getTime(), v.orgId, v.userId, a).run();
      else await env.DB.prepare("UPDATE mail_notifications SET read_at = NULL WHERE id = (SELECT id FROM mail_notifications WHERE org_id = ? AND user_id = ? AND thread_id = ? ORDER BY created_at DESC LIMIT 1)").bind(v.orgId, v.userId, a).run();
    } else if (source === "chat") {
      // Unread: back to just before the latest message from someone else in the conversation (or thread).
      let at = now;
      if (!read) {
        const [last] = await db
          .select({ at: chatMessages.createdAt })
          .from(chatMessages)
          .where(and(eq(chatMessages.channelId, a), b ? eq(chatMessages.parentId, b) : isNull(chatMessages.parentId), ne(chatMessages.authorId, v.userId), isNull(chatMessages.deletedAt)))
          .orderBy(desc(chatMessages.createdAt))
          .limit(1);
        if (!last) continue;
        at = new Date(last.at.getTime() - 1);
      }
      if (b) await db.update(chatFollows).set({ lastReadAt: at }).where(and(eq(chatFollows.userId, v.userId), eq(chatFollows.messageId, b)));
      else await db.update(chatMembers).set({ lastReadAt: at }).where(and(eq(chatMembers.userId, v.userId), eq(chatMembers.channelId, a)));
    } else if (source === "app") {
      const groupKey = key.slice(4);
      const mine = and(eq(notifications.orgId, v.orgId), eq(notifications.userId, v.userId), eq(notifications.groupKey, groupKey));
      if (read) await db.update(notifications).set({ readAt: now }).where(and(mine, isNull(notifications.readAt)));
      else {
        const [last] = await db.select({ id: notifications.id }).from(notifications).where(mine).orderBy(desc(notifications.createdAt)).limit(1);
        if (last) await db.update(notifications).set({ readAt: null }).where(eq(notifications.id, last.id));
      }
    } else throw new HttpError(422, "Unknown notification");
  }
  await announce(v.orgId, [v.userId]);
}

/** "Mark all as read": every unread group of the three sources. */
export async function markAllNotifications(v: NotifyViewer) {
  const { groups } = await listNotifications(v, "unread");
  await markNotifications(v, groups.map((g) => g.key), true);
}

/**
 * Takes groups off the bell: "Done" until something new happens in them, snoozed until `until`, or muted for good.
 * Done and muted ones are read too, so badges agree; snoozed ones come back as they were.
 */
export async function dismissNotifications(v: NotifyViewer, keys: string[], opts: { until?: number; muted?: boolean } = {}) {
  if (!keys.length) return;
  if (!opts.until) await markNotifications(v, keys, true);
  const now = new Date();
  const set = { at: now, until: opts.until ? new Date(opts.until) : null, muted: !!opts.muted };
  await db.batch(keys.slice(0, 100).map((key) => db.insert(notificationDismissals).values({ userId: v.userId, key, ...set }).onConflictDoUpdate({ target: [notificationDismissals.userId, notificationDismissals.key], set })) as [never, ...never[]]);
}

/** Back to the inbox from "Done", "Snoozed" or muted. */
export async function restoreNotifications(v: NotifyViewer, keys: string[]) {
  if (keys.length) await db.delete(notificationDismissals).where(and(eq(notificationDismissals.userId, v.userId), inArray(notificationDismissals.key, keys.slice(0, 100))));
}

/** "Clear read": every group with nothing unread. */
export async function clearReadNotifications(v: NotifyViewer) {
  const { groups } = await listNotifications(v);
  await dismissNotifications(v, groups.filter((g) => !g.unread).map((g) => g.key));
}

/** Opening a mail thread reads its notifications too. */
export async function readMailThreadNotifications(orgId: string, userId: string, threadIds: string | string[]) {
  const ids = Array.isArray(threadIds) ? threadIds : [threadIds];
  if (!ids.length) return;
  const res = await env.DB.prepare(`UPDATE mail_notifications SET read_at = ? WHERE org_id = ? AND user_id = ? AND thread_id IN (${ids.map(() => "?").join(",")}) AND read_at IS NULL`).bind(Date.now(), orgId, userId, ...ids).run();
  if (res.meta.changes) await announce(orgId, [userId]);
}

// ---- Settings ----

export async function getNotificationPrefs(userId: string) {
  const [row] = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  return { digest: row?.digest ?? true, muted: (row?.muted ?? []).filter((k) => NOTIFY_KINDS.includes(k)) };
}

export async function saveNotificationPrefs(userId: string, input: { digest: boolean; muted: NotifyKind[] }) {
  const muted = [...new Set(input.muted)].filter((k) => NOTIFY_KINDS.includes(k));
  await db.insert(notificationPrefs).values({ userId, digest: input.digest, muted }).onConflictDoUpdate({ target: notificationPrefs.userId, set: { digest: input.digest, muted } });
  return { digest: input.digest, muted };
}

// ---- E-mail summary ----

const DIGEST_AFTER = 4 * 3600_000;
const DIGEST_EVERY = 20 * 3600_000;

/**
 * Hourly: people with app notifications unread for 4 hours get one e-mail listing them (at most one a day, unless
 * they turned it off). Mail is already in their inbox; chat isn't summed up (shortcut: add its mentions and DMs here
 * if people miss them).
 */
export async function sendNotificationDigests(now = Date.now()) {
  const due = await db
    .selectDistinct({ orgId: notifications.orgId, userId: notifications.userId })
    .from(notifications)
    .where(and(isNull(notifications.readAt), isNull(notifications.digestedAt), lt(notifications.createdAt, new Date(now - DIGEST_AFTER))))
    .limit(200);
  const { notificationDigestEmail } = await import("@/emails/notifications");
  for (const { orgId, userId } of due) {
    try {
      const [prefs] = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
      // Only what has waited 4 hours; newer items wait for the next summary.
      const pending = and(eq(notifications.orgId, orgId), eq(notifications.userId, userId), isNull(notifications.readAt), isNull(notifications.digestedAt), lt(notifications.createdAt, new Date(now - DIGEST_AFTER)));
      if (prefs?.lastDigestAt && now - prefs.lastDigestAt.getTime() < DIGEST_EVERY) continue;
      if (prefs && !prefs.digest) {
        await db.update(notifications).set({ digestedAt: new Date(now) }).where(pending);
        continue;
      }
      const off = await disabledModules(orgId);
      const rows = (
        await db
          .select({ n: notifications, actorName: user.name })
          .from(notifications)
          .leftJoin(user, eq(user.id, notifications.actorId))
          .where(pending)
          .orderBy(desc(notifications.createdAt))
          .limit(30)
      ).filter((r) => !off.includes(r.n.app as ModuleId));
      const [person] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, userId));
      if (rows.length && person) {
        await sendEmail({ to: person.email, ...(await withLocale(await userLocale({ id: userId }), () => notificationDigestEmail({ name: person.name, items: rows.map(({ n, actorName }) => ({ kind: n.kind, title: n.title, body: n.body, actor: actorName, href: n.href })) }))) });
      }
      await db.batch([
        db.update(notifications).set({ digestedAt: new Date(now) }).where(pending),
        db.insert(notificationPrefs).values({ userId, lastDigestAt: new Date(now) }).onConflictDoUpdate({ target: notificationPrefs.userId, set: { lastDigestAt: new Date(now) } }),
      ]);
    } catch (e) {
      await reportError("cron", e, { route: "notification digest", orgId });
    }
  }
}

/** Keeps the table small: read notifications go after 60 days. */
export async function pruneNotifications(now = Date.now()) {
  await db.delete(notifications).where(and(lt(notifications.createdAt, new Date(now - 60 * 86_400_000)), sql`${notifications.readAt} IS NOT NULL`));
  // Muted and still-snoozed groups stay.
  await db.delete(notificationDismissals).where(and(lt(notificationDismissals.at, new Date(now - 60 * 86_400_000)), eq(notificationDismissals.muted, false), sql`(${notificationDismissals.until} IS NULL OR ${notificationDismissals.until} < ${now})`));
}
