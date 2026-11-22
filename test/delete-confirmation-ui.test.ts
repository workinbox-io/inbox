import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { prefs } from "./helpers/settings-fixtures";

it("calendar deletion waits for confirmation, including keyboard and repeating events", async () => {
  const calendar = { id: "calendar", name: "Team", color: "blue", personal: false, ownerId: "me", sharing: "team", teamRole: "edit", role: "owner", manage: true, people: [], sync: null };
  const event = { id: "event", seriesId: "event", occurrence: null, calendarId: "calendar", uid: "event", title: "Team meeting", description: "", location: "", url: "", start: Date.parse("2026-11-16T10:00Z"), end: Date.parse("2026-11-16T11:00Z"), allDay: false, timezone: "Europe/Warsaw", rrule: null as string | null, status: "confirmed", busy: true, organizer: null, sequence: 0, reminders: [], attendees: [], role: "owner", myStatus: null };
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CalendarApp} from './src/components/calendar/calendar-app';createRoot(document.getElementById('root')).render(<CalendarApp calendars={${JSON.stringify([calendar])}} prefs={${JSON.stringify(prefs)}} canManage account={{name:"Test",email:"test@example.test"}} approximateLocation={null}/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<div id="root"></div><script type="module" src="/bundle.js"></script>'); });
  let browser;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    browser = await chromium.launch(); const page = await browser.newPage();
    const deletes: string[] = [];
    await page.route("**/bundle.js", route => route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text }));
    await page.route("**/api/**", route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === "DELETE") { deletes.push(url.pathname + url.search); return route.fulfill({ json: {} }); }
      if (url.pathname === "/api/app/calendar/events/event") return route.fulfill({ json: event });
      if (url.pathname === "/api/app/calendar/events") return route.fulfill({ json: { events: [event] } });
      return route.fulfill({ json: { people: [], notes: [], calendars: [calendar] } });
    });
    const address = `http://127.0.0.1:${(server.address() as { port: number }).port}/?event=event`;
    await page.goto(address);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const confirmation = page.getByRole("alertdialog");
    await confirmation.waitFor(); expect(deletes).toEqual([]);
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(deletes).toEqual([]);
    // Keyboard deletion reaches the same confirmation as the event panel.
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    await page.keyboard.press("Delete");
    await confirmation.waitFor(); expect(deletes).toEqual([]);
    await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(() => deletes.length).toBe(1);
    expect(deletes[0]).toBe("/api/app/calendar/events/event");

    event.rrule = "FREQ=WEEKLY";
    await page.goto(`${address}:${event.start}`);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "This and following events", exact: true }).click();
    await confirmation.waitFor(); expect(deletes).toHaveLength(1);
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(deletes).toHaveLength(1);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "This and following events", exact: true }).click();
    await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(() => deletes.length).toBe(2);
    expect(deletes[1]).toBe(`/api/app/calendar/events/event?scope=following&occurrence=${event.start}`);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 60_000);
