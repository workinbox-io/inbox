/** Subject and plain-text body of invitation mails (the text/calendar part carries the data). */
import { appLocale, t } from "@/lib/i18n/panel";

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
export function whenText(e: InviteFacts, locale = appLocale() === "en" ? "en-US" : appLocale()) {
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

const prefix = (kind: InviteKind) =>
  ({
    new: t("Invitation"),
    update: t("Updated invitation"),
    cancel: t("Cancelled"),
    accepted: t("Accepted"),
    declined: t("Declined"),
    tentative: t("Tentatively accepted"),
  })[kind];

export function inviteSubject(kind: InviteKind, e: InviteFacts) {
  return `${prefix(kind)}: ${e.title || t("(no title)")} @ ${whenText(e)}`;
}

export function inviteBody(kind: InviteKind, e: InviteFacts, who?: string) {
  if (kind === "accepted" || kind === "declined" || kind === "tentative")
    return `${{
      accepted: t("{who} accepted this invitation.", { who: who ?? t("An attendee") }),
      declined: t("{who} declined this invitation.", { who: who ?? t("An attendee") }),
      tentative: t("{who} tentatively accepted this invitation.", { who: who ?? t("An attendee") }),
    }[kind]}\n\n${e.title || t("(no title)")}\n${whenText(e)}`;
  const lines = [
    kind === "cancel" ? t("This event has been cancelled.") : kind === "update" ? t("This event has been changed.") : "",
    e.title || t("(no title)"),
    t("When: {when}", { when: whenText(e) }) + (e.rrule ? ` ${t("(repeats)")}` : ""),
    e.location ? t("Where: {where}", { where: e.location }) : "",
    e.url ? t("Join: {url}", { url: e.url }) : "",
    e.description ? `\n${e.description}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
