---
title: Calendar
description: Team calendars, invitations, time zones, availability and the subscription link.
section: Guides
order: 3
updated: 2026-11-12
---

Open **Calendar** from the app rail. Everyone has a calendar of their own; add more (for example "Holidays") in the
left column and share them like notes: private, with chosen people (view or edit) or with the whole team.

## Shortcuts

| Key | Does |
| --- | --- |
| `c` | New event |
| `t` | Today |
| `j` / `k` or `←` / `→` | Next / previous day, week or month |
| `d` / `w` / `m` | Day, week, month view |
| `a` | Pick free times to share |
| `/` | Show a colleague's calendar next to yours |
| `Enter` / `Esc` | Open / close the event |
| `⌫` | Delete the selected event |

Drag in the grid to create an event, drag an event to move it and its bottom edge to change its length.

## Recurring events

Pick a repeat in the event panel. Changing or deleting one occurrence asks whether it applies to **this event**,
**this and following** or **all events**. Times follow the event's time zone, so a 9:00 meeting stays at 9:00 when
the clocks change.

## Invitations

Add people in **Guests**. Colleagues see the event in their calendar right away and answer there. People outside
your organization get an e-mail invitation from your mailbox that Gmail, Outlook and Apple Mail show with
Accept / Decline; their answers update the guest list. Changes and cancellations reach them the same way.

Invitations you receive from Google or Outlook land in your calendar as "not answered yet", and the mail shows
Accept, Maybe and Decline.

## Time zones and colleagues

In the calendar settings, choose your time zone and up to two more: they show side by side next to the hours.
Add a colleague under **People** to see their calendar over yours; events you can't open show as busy.

## Sharing your availability

Press `a`, click or drag the free times you want to offer, then **Copy**: you get one line per day, such as
"Tue, Nov 17 · 10:00 AM–11:30 AM CET", ready to paste in an e-mail, in the time zone you pick.

## Subscription link and import

**Subscribe** in the calendar settings gives you a private `.ics` link for Google Calendar, Apple Calendar or
Outlook (read-only; they refresh it every few hours). Anyone with the link sees your events, so **New link** makes
the old one stop working. **Import** reads an `.ics` file (for example a Google Calendar export) into a calendar;
importing it again updates the same events.

There is no CalDAV sync yet, so phone calendar apps can subscribe but not edit.

## Reminders

Events remind you 10 minutes before by default (change it per event or in the settings). Reminders arrive as
browser notifications: turn them on in Mail's notification settings.

## AI apps and API

Claude and ChatGPT can list your events, find a time that works for you and colleagues, and add events
([AI apps](/docs/mcp)). Invitations to people outside the organization are only sent from the app. The REST API
has `/api/v1/calendar/events` ([API](/docs/api)).
