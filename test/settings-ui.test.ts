import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { fixtures, prefs } from "./helpers/settings-fixtures";

it("shows every settings section on one page, follows the scroll, protects drafts, and opens the admin console pages", async () => {
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {SettingsScreen,SettingsPage} from './src/components/settings/settings-page';window.setThemeMode=()=>{};const root=createRoot(document.getElementById('root'));root.render(<SettingsScreen canManage={false}/>);window.hideSettings=()=>root.unmount();const admin=createRoot(document.getElementById('admin'));window.showAdmin=page=>admin.render(<SettingsPage key={page} page={page}/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<div id="root"></div><div id="admin"></div><script type="module" src="/bundle.js"></script>'); });
  let browser, releaseSave: (() => void) | undefined;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    browser = await chromium.launch(); const page = await browser.newPage();
    await page.addInitScript(() => Object.defineProperty(Notification, "permission", { value: "denied", configurable: true }));
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const missing: string[] = [], writes: { path: string; body: any }[] = [];
    let rejectSave = true, holdSave = false;
    await page.route("**/bundle.js", route => route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text }));
    await page.route("**/api/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() !== "GET") {
        const body = request.postDataJSON(); writes.push({ path, body });
        if (path === "/api/app/mail/mailboxes") {
          if (rejectSave) return route.fulfill({ status: 500, json: { error: "Save failed" } });
          if (holdSave) await new Promise<void>(resolve => { releaseSave = resolve });
          return route.fulfill({ json: {} });
        }
        if (path === "/api/app/mail/auto-reply") return route.fulfill({ json: body });
        if (path === "/api/app/calendar/prefs") return route.fulfill({ json: { ...prefs, ...body } });
      }
      if (path in fixtures) return route.fulfill({ json: fixtures[path] });
      missing.push(path); return route.fulfill({ status: 404, json: { error: `Missing fixture: ${path}` } });
    });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    const nav = page.getByRole("navigation", { name: "Settings", exact: true });
    const sec = (id: string) => page.locator(`[data-section="${id}"]`);
    const go = async (label: string) => { await nav.getByRole("link", { name: label, exact: true }).click(); await expect.poll(() => nav.getByRole("link", { name: label, exact: true }).getAttribute("aria-current")).toBe("location"); };
    await expect.poll(() => page.getByText("Loading…", { exact: true }).count()).toBe(0);
    // Every section is on the one page; the nav follows the scroll.
    for (const id of ["signature", "labels", "filters", "auto-reply", "templates", "forwarding", "storage", "calendar", "calendar-feed", "appearance", "account", "notifications", "mail-clients", "ai-apps", "organization", "team"]) expect(await sec(id).count()).toBe(1);
    expect(await nav.getByRole("link", { name: "API keys", exact: true }).count()).toBe(0);
    await go("Team");
    await go("Signature");

    const signature = sec("signature");
    await page.locator("#sig-name").fill("Unsaved name");
    await page.getByRole("combobox", { name: "Mailbox", exact: true }).click();
    page.once("dialog", dialog => void dialog.dismiss()); await page.getByRole("option", { name: "team@example.test", exact: true }).click();
    expect(await page.locator("#sig-name").inputValue()).toBe("Unsaved name");
    await signature.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => signature.getByRole("button", { name: "Save", exact: true }).isEnabled()).toBe(true);
    expect(await page.locator("#sig-name").inputValue()).toBe("Unsaved name");
    rejectSave = false; holdSave = true;
    await signature.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => !!releaseSave).toBe(true);
    // A save in progress blocks switching the mailbox.
    await page.getByRole("combobox", { name: "Mailbox", exact: true }).click();
    await page.getByRole("option", { name: "team@example.test", exact: true }).click();
    expect(await page.locator("#sig-name").inputValue()).toBe("Unsaved name");
    releaseSave!(); holdSave = false;
    await expect.poll(() => signature.getByRole("button", { name: "Save", exact: true }).isDisabled()).toBe(true);

    await go("Account");
    await page.locator("#account-name").fill("New profile name");
    await sec("account").getByRole("tab", { name: "Security", exact: true }).click();
    await page.getByRole("heading", { name: "Password", exact: true }).waitFor();
    await sec("account").getByRole("tab", { name: "Profile", exact: true }).click();
    expect(await page.locator("#account-name").inputValue()).toBe("New profile name");

    await go("Out of office");
    const away = sec("auto-reply");
    await away.getByRole("switch", { name: "Reply automatically", exact: true }).click();
    expect(writes.filter(write => write.path.endsWith("auto-reply"))).toHaveLength(0);
    await away.getByRole("button", { name: "Save changes", exact: true }).click();
    await away.getByText("Active", { exact: true }).waitFor();
    await away.getByRole("switch", { name: "Reply automatically", exact: true }).click();
    expect(writes.filter(write => write.path.endsWith("auto-reply"))).toHaveLength(1);
    await away.getByRole("button", { name: "Save changes", exact: true }).click();
    await away.getByText("Off", { exact: true }).waitFor();

    await go("Time zones and week");
    const calendar = sec("calendar");
    await calendar.getByRole("combobox", { name: "Your time zone", exact: true }).click();
    await page.getByPlaceholder("Search cities or time zones…").fill("Tokyo");
    await page.getByRole("option", { name: "Asia/Tokyo", exact: true }).click();
    await calendar.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => writes.find(write => write.path.endsWith("calendar/prefs"))?.body.timezones).toEqual(["Asia/Tokyo"]);
    await expect.poll(() => calendar.getByRole("button", { name: "Save", exact: true }).isDisabled()).toBe(true);
    await go("Notifications");
    await sec("notifications").getByRole("button", { name: "Blocked in browser", exact: true }).waitFor();
    await page.getByText("Allow notifications in your browser's site settings, then reload this page.", { exact: true }).waitFor();

    await go("Organization");
    await page.locator("#org-name").fill("Unsaved organization name");
    page.once("dialog", dialog => void dialog.dismiss()); await sec("organization").getByRole("button", { name: "Switch", exact: true }).click();
    expect(writes.some(write => write.path.includes("set-active"))).toBe(false);
    expect(await page.locator("#org-name").inputValue()).toBe("Unsaved organization name");

    await page.evaluate(() => (window as any).hideSettings());
    await nav.waitFor({ state: "detached" });
    // The admin console's pages render the same sections.
    for (const [key, label] of [["team", "Team"], ["mail", "Domains and mailboxes"], ["api-keys", "API keys"], ["audit", "Audit log"], ["organization", "Organization"]]) {
      await page.evaluate((key) => (window as any).showAdmin(key), key);
      await page.getByRole("heading", { level: 1, name: label, exact: true }).waitFor();
      await expect.poll(() => page.getByText("Loading…", { exact: true }).count()).toBe(0);
    }
    expect(missing).toEqual([]); expect(errors).toEqual([]);
  } finally {
    releaseSave?.(); await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 60_000);
