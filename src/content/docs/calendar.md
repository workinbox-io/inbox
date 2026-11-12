---
title: Calendar
description: Team calendars, invitations, time zones, availability and the subscription link.
section: Guides
order: 3
updated: 2026-11-12
---

Open **Calendar** from the app rail. Everyone has a calendar of their own; add more (for example "Holidays") in the
left column and share them like notes: private, with chosen people (view or edit) or with the whole team.

Choose **Year** for a twelve-month overview, with today highlighted. Click a month or date to open that month’s
events. The arrows move between years; **Today** returns to the current year.

## Shortcuts

| Key | Does |
| --- | --- |
| `c` | New event |
| `t` | Today |
| `j` / `k` or `←` / `→` | Next / previous day, week, month or year |
| `d` / `w` / `m` / `y` | Day, week, month, year view |
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
Open **Calendar settings** from the gear in the toolbar to choose a **24-hour** or **12-hour** clock.
The preference is saved to your account and applies to the grid, event labels, sunrise/sunset and copied availability.
Add a colleague under **People** to see their calendar over yours; events you can't open show as busy.

## Sharing your availability

Press `a` or choose **Availability**. From the month or year view this opens the week grid. Click for 30 minutes, or drag
to select a longer range. Busy events in the visible calendars (including overlaid colleagues) are excluded;
events marked free, cancelled events and invitations you declined do not block the selection.

Overlapping or adjacent selections merge. Move between days or weeks to add more times. Click a selected block
or its button in the bottom bar to remove it, or **Clear** to start again. The bar previews the exact text in your
chosen time zone; **Copy availability** copies it for an e-mail. **Done** or `Esc` leaves the mode.

These times are suggestions: they do not create events or reserve time. Booking links are planned separately.

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
