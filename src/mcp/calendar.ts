/**
 * MCP tools for the calendar: the same lib/server functions as /api/app/calendar. Invitations to people outside
 * the organization never go out on the model's word: those addresses come back as "not invited yet" for the person
 * to add in the app.
 */
import { z } from "zod";
import { availabilityText } from "@/lib/calendar/availability";
import { isTimeZone, parseInZone } from "@/lib/calendar/time";
import { findFreeSlots } from "@/lib/calendar/free-time";
import type { CalendarViewer } from "@/lib/server/calendar/access";
import { deleteEvent, getEvent, updateEvent, hasExternalParticipants, createEvent, getPrefs, listEvents, orgUsersByEmail, type EventView } from "@/lib/server/calendar/events";
import { eventUpdateFieldsSchema } from "@/lib/validation-calendar";
import { HttpError } from "@/lib/server/api";
import { env } from "cloudflare:workers";
import { defineTool, type McpContext, type McpModule, type Tools } from "./define";

const viewer = (ctx: McpContext): CalendarViewer => ({ orgId: ctx.orgId, role: ctx.role, userId: ctx.userId ?? "" });

const when = z.string().max(40).refine((s) => !Number.isNaN(parseInZone(s, "UTC")), "Use an ISO 8601 date-time, e.g. 2026-11-17T10:00:00+01:00");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
/** Times without an offset are read in this zone: the user's first calendar zone. */
const userZone = async (ctx: McpContext) => (await getPrefs(ctx.userId ?? "")).timezones[0] ?? "UTC";

function range(tz: string, from?: string, to?: string, days = 7) {
  const start = from ? parseInZone(from, tz) : Date.now();
  const end = to ? parseInZone(to, tz) : start + days * DAY;
  if (end <= start) throw new HttpError(422, "`to` must be after `from`");
  return { from: start, to: end };
}

async function peopleIds(ctx: McpContext, emails: string[] = []) {
  const found = await orgUsersByEmail(ctx.orgId, emails.map((e) => e.toLowerCase()));
  const unknown = emails.filter((e) => !found.has(e.toLowerCase()));
  if (unknown.length) throw new HttpError(422, `Not people of this organization: ${unknown.join(", ")}`);
  return { ids: [...found.values()], byId: new Map([...found].map(([email, id]) => [id, email])) };
}

const out = (e: EventView, byId: Map<string, string> = new Map()) => ({
  id: e.id, seriesId: e.seriesId, occurrence: e.occurrence === null ? null : iso(e.occurrence),
  title: e.role === "busy" ? "(busy)" : e.title,
  start: iso(e.start),
  end: iso(e.end),
  allDay: e.allDay,
  ...(e.location ? { location: e.location } : {}),
  ...(e.url ? { meetingLink: e.url } : {}),
  ...(e.rrule ? { repeats: e.rrule } : {}),
  ...(e.organizer ? { organizer: e.organizer.email } : {}),
  ...(e.attendees.length ? { attendees: e.attendees.map((a) => ({ email: a.email, status: a.status })) } : {}),
  ...(e.myStatus ? { myAnswer: e.myStatus } : {}),
  ...(e.person ? { calendarOf: byId.get(e.person) ?? "colleague" } : {}),
});

const eventLink = (id: string) => `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/app/calendar?event=${encodeURIComponent(id)}`;
const eventTarget = z.object({ id: z.string().uuid(), scope: z.enum(["this", "following", "all"]).optional(), occurrence: when.optional() });
async function mutationTarget(ctx: McpContext, input: z.infer<typeof eventTarget>) {
  const v = viewer(ctx);
  const event = await getEvent(v, input.id);
  if (event.rrule && !input.scope) throw new HttpError(422, "Choose this, following or all for a series");
  if (event.rrule && input.scope !== "all" && !input.occurrence) throw new HttpError(422, "Provide the occurrence's original start");
  return { v, event, scope: input.scope ?? "all" as const, occurrence: input.occurrence ? Date.parse(input.occurrence) : undefined };
}

export const calendarTools: Tools = {
  calendar_get_event: defineTool({
    title: "Read calendar event", description: "Reads an accessible event or series master, with event id, seriesId and original occurrence time.",
    input: z.object({ id: z.string().uuid() }),
    async run({ id }, ctx) { const event = await getEvent(viewer(ctx), id); return { ...out(event), description: event.description, timeZone: event.timezone, link: eventLink(id) }; },
  }),
  calendar_update_event: defineTool({
    title: "Update calendar event", scope: "write", destructive: true,
    description: "Changes an event. A recurring series requires explicit scope this/following/all; this and following require occurrence (original ISO start). External organizers or attendees anywhere in the series return an app link without changes or notifications. Changes use the same fields as the calendar API (start/end are milliseconds).",
    input: eventTarget.extend({ changes: eventUpdateFieldsSchema.omit({ scope: true, occurrence: true }).refine(v => v.start === undefined || v.end === undefined || v.end >= v.start, "The event ends before it starts") }),
    async run(input, ctx) {
      const target = await mutationTarget(ctx, input);
      const emails = (input.changes.attendees ?? []).map(a => a.email.toLowerCase());
      const internal = await orgUsersByEmail(ctx.orgId, emails);
      if (emails.some(email => !internal.has(email)) || await hasExternalParticipants(target.v, input.id)) return { changed: false, link: eventLink(input.id), note: "Review this change in the app to notify external participants." };
      // Always address the master so scope also works when the caller read an exception row.
      const event = await updateEvent(target.v, target.event.seriesId, { ...input.changes, scope: target.scope, occurrence: target.occurrence }, true);
      ctx.audit("event.update", { target: event.title }); return { changed: true, event: out(event), link: eventLink(event.id) };
    },
  }),
  calendar_delete_event: defineTool({
    title: "Delete calendar event", scope: "write", destructive: true,
    description: "Deletes an event. Series require explicit this/following/all scope; this/following also require occurrence (original ISO start). External participants anywhere in the series return an app link without changing data or notifying anyone.",
    input: eventTarget,
    async run(input, ctx) {
      const target = await mutationTarget(ctx, input);
      if (await hasExternalParticipants(target.v, input.id)) return { deleted: false, link: eventLink(input.id), note: "Review deletion in the app to notify external participants." };
      await deleteEvent(target.v, target.event.seriesId, { scope: target.scope, occurrence: target.occurrence }, true);
      ctx.audit("event.delete", { target: target.event.title }); return { deleted: true, id: target.event.id, seriesId: target.event.seriesId, occurrence: input.occurrence ?? null };
    },
  }),
  calendar_list_events: defineTool({
    title: "List calendar events",
    description:
      "Events in a time range (default: the next 7 days) from the calendars the user can see and the events they're invited to; recurring events come as their occurrences. `people` (e-mail addresses of colleagues) adds their calendars: events the user can't see show as busy only.",
    input: z.object({ from: when.optional(), to: when.optional(), people: z.array(z.string().email()).max(10).optional() }),
    async run(input, ctx) {
      const { ids, byId } = await peopleIds(ctx, input.people);
      const events = await listEvents(viewer(ctx), { ...range(await userZone(ctx), input.from, input.to), people: ids });
      return { events: events.filter((e) => e.status !== "cancelled").slice(0, 200).map((e) => out(e, byId)) };
    },
  }),

  calendar_find_free_time: defineTool({
    title: "Find free time",
    description:
      "Times when the user and the given colleagues are all free, within the user's working hours on weekdays (default range: the next 7 days). Returns up to 10 slots and a ready-to-paste text in the user's time zone.",
    input: z.object({
      people: z.array(z.string().email()).max(10).default([]),
      duration: z.number().int().min(5).max(480).default(30).describe("Minutes"),
      from: when.optional(),
      to: when.optional(),
    }),
    async run(input, ctx) {
      const v = viewer(ctx);
      const { ids } = await peopleIds(ctx, input.people);
      const prefs = await getPrefs(v.userId);
      const tz = prefs.timezones[0] ?? "UTC";
      const { from, to } = range(tz, input.from, input.to);
      const events = await listEvents(v, { from, to, people: ids });
      const busy = events
        .filter((e) => e.busy && e.status !== "cancelled" && e.myStatus !== "declined" && (e.person || e.role !== "busy"))
        .map((e) => ({ start: e.start, end: e.end }));
      const slots = findFreeSlots({ busy, from, to, duration: input.duration, tz, workStart: prefs.workStart, workEnd: prefs.workEnd });
      return { timeZone: tz, slots: slots.map((s) => ({ start: iso(s.start), end: iso(s.end) })), text: availabilityText(slots, tz) };
    },
  }),

  calendar_create_event: defineTool({
    title: "Create calendar event",
    description:
      "Adds an event to the user's own calendar. Colleagues from the organization in `attendees` are invited right away (they see it in their calendars). Addresses outside the organization are NOT invited: they come back in `notInvitedYet`, and the user adds them in the app, which sends the invitation.",
    input: z.object({
      title: z.string().trim().min(1).max(500),
      start: when,
      end: when,
      allDay: z.boolean().optional(),
      timeZone: z.string().max(64).refine(isTimeZone, "Unknown time zone").optional()
        .describe("IANA zone, e.g. Europe/Warsaw; default: the user's. start/end without an offset are wall-clock times in it"),
      location: z.string().trim().max(500).optional(),
      meetingLink: z.string().url().max(2000).optional(),
      description: z.string().max(20_000).optional(),
      attendees: z.array(z.string().email()).max(50).optional(),
    }),
    scope: "write",
    async run(input, ctx) {
      const v = viewer(ctx);
      if (!v.userId) throw new HttpError(403, "Events are created for a person; connect with a user account, not an API key");
      const emails = (input.attendees ?? []).map((e) => e.toLowerCase());
      const inside = await orgUsersByEmail(ctx.orgId, emails);
      const tz = input.timeZone ?? (await userZone(ctx));
      const event = await createEvent(v, {
        title: input.title,
        start: parseInZone(input.start, tz),
        end: parseInZone(input.end, tz),
        allDay: input.allDay,
        timezone: input.timeZone,
        location: input.location,
        url: input.meetingLink,
        description: input.description,
        attendees: emails.filter((e) => inside.has(e)).map((email) => ({ email })),
      });
      ctx.audit("event.create", { target: event.title });
      const notInvitedYet = emails.filter((e) => !inside.has(e));
      return {
        event: out(event),
        link: `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/app/calendar?event=${event.id}`,
        ...(notInvitedYet.length ? { notInvitedYet, note: "Add these people in the app to send them the invitation." } : {}),
      };
    },
  }),
};

export const calendarModule: McpModule = {
  name: "calendar",
  instructions:
    "Calendar: list and read events, find common free time, create, update and delete events; invitations to people outside the organization are sent only from the app.",
  tools: calendarTools,
};
