/** Subject and plain-text body of invitation mails (the text/calendar part carries the data). */

export interface InviteFacts {
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  timezone: string;
  location?: string;
  url?: string;
  description?: string;
  rrule?: string | null;
}

export type InviteKind = "new" | "update" | "cancel" | "accepted" | "declined" | "tentative";

/** "Tue, Nov 17, 2026 3:00 PM – 3:30 PM (CET)" in the event's zone; dates only for all-day events. */
export function whenText(e: InviteFacts, locale = "en-US") {
  if (e.allDay) {
    const day = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
    // All-day starts are midnight in the event zone; shift into UTC to print that calendar day.
    const offsetDay = (ms: number) => {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: e.timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(ms);
      const n = (t: string) => Number(p.find((x) => x.type === t)!.value);
      return Date.UTC(n("year"), n("month") - 1, n("day"));
    };
    const first = offsetDay(e.start);
    const last = offsetDay(e.end - 1);
    return first === last ? day.format(first) : `${day.format(first)} – ${day.format(last)}`;
  }
  const date = new Intl.DateTimeFormat(locale, { timeZone: e.timezone, weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const time = new Intl.DateTimeFormat(locale, { timeZone: e.timezone, hour: "numeric", minute: "2-digit" });
  const zone = new Intl.DateTimeFormat(locale, { timeZone: e.timezone, timeZoneName: "short" }).formatToParts(e.start).find((p) => p.type === "timeZoneName")?.value ?? e.timezone;
  const sameDay = date.format(e.start) === date.format(e.end);
  return sameDay
    ? `${date.format(e.start)} ${time.format(e.start)} – ${time.format(e.end)} (${zone})`
    : `${date.format(e.start)} ${time.format(e.start)} – ${date.format(e.end)} ${time.format(e.end)} (${zone})`;
}

const PREFIX: Record<InviteKind, string> = {
  new: "Invitation",
  update: "Updated invitation",
  cancel: "Cancelled",
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Tentatively accepted",
};

export function inviteSubject(kind: InviteKind, e: InviteFacts) {
  return `${PREFIX[kind]}: ${e.title || "(no title)"} @ ${whenText(e)}`;
}

export function inviteBody(kind: InviteKind, e: InviteFacts, who?: string) {
  if (kind === "accepted" || kind === "declined" || kind === "tentative")
    return `${who ?? "An attendee"} ${kind === "tentative" ? "tentatively accepted" : kind} this invitation.\n\n${e.title || "(no title)"}\n${whenText(e)}`;
  const lines = [
    kind === "cancel" ? "This event has been cancelled." : kind === "update" ? "This event has been changed." : "",
    e.title || "(no title)",
    `When: ${whenText(e)}${e.rrule ? " (repeats)" : ""}`,
    e.location ? `Where: ${e.location}` : "",
    e.url ? `Join: ${e.url}` : "",
    e.description ? `\n${e.description}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
