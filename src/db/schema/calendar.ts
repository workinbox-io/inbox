/**
 * Calendar: calendars shared like notes (lib/notes/access.ts rules), events stored once and seen by their
 * attendees through `calendar_attendees.user_id`, recurring series as an RRULE on the master plus override rows
 * (`parent_id` + `original_start`). Times are UTC ms; `timezone` keeps the wall clock a series repeats in.
 */
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, id, organization, time, updatedAt, user } from "./core";

export const calendars = sqliteTable(
  "calendars",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Null for calendars made with an API key or whose owner left (run by the managers, like notes). */
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("blue"),
    /** The owner's own calendar: invitations land here, colleagues see its free/busy. One per person. */
    personal: integer("personal", { mode: "boolean" }).notNull().default(false),
    sharing: text("sharing", { enum: ["private", "people", "team"] }).notNull().default("private"),
    teamRole: text("team_role", { enum: ["view", "edit"] }).notNull().default("view"),
    createdAt: createdAt(),
  },
  (t) => [index("calendars_org_idx").on(t.orgId), index("calendars_owner_idx").on(t.ownerId)],
);

export const calendarAccess = sqliteTable(
  "calendar_access",
  {
    calendarId: text("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["view", "edit"] }).notNull().default("view"),
  },
  (t) => [primaryKey({ columns: [t.calendarId, t.userId] }), index("calendar_access_user_idx").on(t.userId)],
);

export const calendarEvents = sqliteTable(
  "calendar_events",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    /** iCalendar UID, shared by a series' master and its overrides. */
    uid: text("uid").notNull(),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    location: text("location").notNull().default(""),
    /** Meeting link ("Join"). */
    url: text("url").notNull().default(""),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    /** All-day events span whole days in `timezone` (ends_at exclusive). */
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    timezone: text("timezone").notNull().default("UTC"),
    /** RRULE value without the "RRULE:" prefix, masters only. */
    rrule: text("rrule"),
    /** Removed occurrences (their original start, ms). */
    exdates: text("exdates", { mode: "json" }).$type<number[]>().notNull().default([]),
    /** Last occurrence's start for bounded series, null when it repeats forever; for range queries. */
    recurUntil: time("recur_until"),
    /** Overrides ("only this occurrence"): the master and the occurrence they replace. */
    parentId: text("parent_id"),
    originalStart: time("original_start"),
    status: text("status", { enum: ["confirmed", "tentative", "cancelled"] }).notNull().default("confirmed"),
    /** TRANSP: false = shows as free. */
    busy: integer("busy", { mode: "boolean" }).notNull().default(true),
    organizerEmail: text("organizer_email"),
    organizerUserId: text("organizer_user_id"),
    /** iTIP SEQUENCE, bumped on changes attendees must hear about. */
    sequence: integer("sequence").notNull().default(0),
    /** Minutes before the start. */
    reminders: text("reminders", { mode: "json" }).$type<number[]>().notNull().default([]),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("calendar_events_range_idx").on(t.orgId, t.calendarId, t.startsAt),
    index("calendar_events_uid_idx").on(t.orgId, t.uid),
    index("calendar_events_parent_idx").on(t.parentId),
  ],
);

export const calendarAttendees = sqliteTable(
  "calendar_attendees",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    /** Set for people in the org: they see the event without a copy. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    status: text("status", { enum: ["needs-action", "accepted", "declined", "tentative"] })
      .notNull()
      .default("needs-action"),
    optional: integer("optional", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.email] }), index("calendar_attendees_user_idx").on(t.userId)],
);

export const calendarPrefs = sqliteTable("calendar_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** IANA zones shown in the gutter; the first is the user's own. */
  timezones: text("timezones", { mode: "json" }).$type<string[]>().notNull().default([]),
  /** 0 = Sunday, 1 = Monday. */
  weekStart: integer("week_start").notNull().default(1),
  /** Minutes from midnight. */
  workStart: integer("work_start").notNull().default(540),
  workEnd: integer("work_end").notNull().default(1020),
  defaultReminder: integer("default_reminder").default(10),
  updatedAt: updatedAt(),
});

/** Secret read-only .ics feeds (`/cal/<token>.ics`): the token is the only credential, rotate = delete + insert. */
export const calendarFeeds = sqliteTable(
  "calendar_feeds",
  {
    token: text("token").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("calendar_feeds_user_idx").on(t.orgId, t.userId)],
);

/** Reminders already pushed, so the every-minute task never repeats one. */
export const calendarReminderLog = sqliteTable(
  "calendar_reminder_log",
  {
    key: text("key").primaryKey(),
    sentAt: createdAt(),
  },
);
