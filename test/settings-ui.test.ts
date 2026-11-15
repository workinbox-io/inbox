import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it("protects settings drafts, preserves tab state, and opens every settings section", async () => {
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {SettingsHost} from './src/components/settings/settings-dialog';import {openSettings} from './src/components/settings/open-settings';window.openSettings=openSettings;window.setThemeMode=()=>{};createRoot(document.getElementById('root')).render(<SettingsHost canManage/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<div id="root"></div><script type="module" src="/bundle.js"></script>'); });
  let browser, releaseSave: (() => void) | undefined;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    browser = await chromium.launch(); const page = await browser.newPage();
    await page.addInitScript(() => Object.defineProperty(Notification, "permission", { value: "denied", configurable: true }));
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const missing: string[] = [], writes: { path: string; body: any }[] = [];
    const brand = { company: "Example", website: "example.test", logoUrl: "", color: "#445566", footer: "" };
    const boxes = ["me@example.test", "team@example.test"].map((address, i) => ({ id: `box-${i}`, address, storage: { usedBytes: 1024, quotaBytes: 10 * 1024 ** 3 } }));
    const prefs = { timezones: ["Europe/Warsaw"], weekStart: 1, hourCycle: "h23", workStart: 9, workEnd: 17, defaultReminder: null };
    const fixtures: Record<string, unknown> = {
      "/api/app/settings/mailbox": { mailboxes: boxes.map(box => box.address), signatures: {}, signatureBrand: brand },
      "/api/app/settings/calendar": { prefs },
      "/api/app/settings/account": { user: { name: "Test", email: boxes[0].address, twoFactorEnabled: false }, hasPassword: true, googleEnabled: false, googleAccountId: null, sessions: [], deletionBlockers: [] },
      "/api/app/settings/organization": { orgId: "org", name: "Example", role: "owner", canManage: true, billingDetails: { legalName: "", vatId: "", addressLine1: "", addressLine2: "", postalCode: "", city: "", region: "", country: "" }, others: [], orgs: [] },
      "/api/app/settings/team": { members: [], invitations: [], canManage: true, canChangeRoles: true, seats: { limit: 5, plan: "free" }, orgs: [] },
      "/api/app/settings/mail-admin": { setup: { domains: [], mailboxes: [], aliases: [], members: [], signatureBrand: brand, subdomainBase: null } },
      "/api/app/settings/mail-clients": { configured: true },
      "/api/app/settings/ai-apps": { apps: [], mcpUrl: "https://example.test/mcp", upsell: null },
      "/api/app/settings/api-keys": { keys: [] },
      "/api/app/settings/audit": { initial: { rows: [], nextCursor: null } },
      "/api/app/mail/mailboxes": { mailboxes: boxes },
      "/api/app/mail/labels": { labels: [] },
      "/api/app/mail/filters": { filters: [], targets: [] },
      "/api/app/mail/templates": { templates: [] },
      "/api/app/mail/auto-reply": { enabled: false, subject: "", text: "I am away", startsAt: null, endsAt: null },
      "/api/app/account/recovery": { email: null, pending: null },
      "/api/app/calendar/calendars": { calendars: [] },
      "/api/app/calendar/feed": { url: null },
      "/api/app/mail/native": { configured: true, mailboxes: [] },
      "/api/app/mail/external-accounts": [],
      "/api/app/mail/settings/sending": { orgId: "org", limits: [], caps: { mailbox: 500, organization: 5000, newUntil: null }, reputation: { paused: null, sent: 0, bounced: 0, complained: 0 } },
      "/api/app/mail/storage": { storage: [] },
      "/api/app/mail/imports": [],
    };
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
    await page.evaluate(() => (window as any).openSettings("signature"));
    const nav = page.getByRole("navigation", { name: "Settings", exact: true });
    const go = async (label: string) => { await nav.getByRole("button", { name: label, exact: true }).click(); await page.getByRole("heading", { name: label, exact: true }).waitFor(); };
    await page.locator("#sig-name").fill("Unsaved name");
    page.once("dialog", dialog => void dialog.dismiss()); await nav.getByRole("button", { name: "Labels", exact: true }).click();
    expect(await page.locator("#sig-name").inputValue()).toBe("Unsaved name");
    await page.getByRole("combobox", { name: "Mailbox", exact: true }).click();
    page.once("dialog", dialog => void dialog.dismiss()); await page.getByRole("option", { name: "team@example.test", exact: true }).click();
    expect(await page.locator("#sig-name").inputValue()).toBe("Unsaved name");
    page.once("dialog", dialog => void dialog.dismiss()); await page.keyboard.press("Escape");
    expect(await nav.count()).toBe(1);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => page.getByRole("button", { name: "Save", exact: true }).isEnabled()).toBe(true);
    page.once("dialog", dialog => void dialog.dismiss()); await nav.getByRole("button", { name: "Labels", exact: true }).click();
    expect(await page.locator("#sig-name").inputValue()).toBe("Unsaved name");
    rejectSave = false; holdSave = true;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => !!releaseSave).toBe(true);
    await nav.getByRole("button", { name: "Labels", exact: true }).click();
    expect(await page.locator("#sig-name").count()).toBe(1);
    releaseSave!(); holdSave = false;
    await expect.poll(() => page.getByRole("button", { name: "Save", exact: true }).isDisabled()).toBe(true);
    await go("Labels");

    await go("Account");
    await page.locator("#account-name").fill("New profile name");
    await page.getByRole("tab", { name: "Security", exact: true }).click();
    await page.getByRole("heading", { name: "Password", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    expect(await page.locator("#account-name").inputValue()).toBe("New profile name");
    page.once("dialog", dialog => void dialog.accept()); await go("Out of office");
    await page.getByRole("switch", { name: "Reply automatically", exact: true }).click();
    expect(writes.filter(write => write.path.endsWith("auto-reply"))).toHaveLength(0);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Active", { exact: true }).waitFor();
    await page.getByRole("switch", { name: "Reply automatically", exact: true }).click();
    expect(writes.filter(write => write.path.endsWith("auto-reply"))).toHaveLength(1);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Off", { exact: true }).waitFor();

    await go("Time zones and week");
    await page.getByRole("combobox", { name: "Your time zone", exact: true }).click();
    await page.getByPlaceholder("Search cities or time zones…").fill("Tokyo");
    await page.getByRole("option", { name: "Asia/Tokyo", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => writes.find(write => write.path.endsWith("calendar/prefs"))?.body.timezones).toEqual(["Asia/Tokyo"]);
    await expect.poll(() => page.getByRole("button", { name: "Save", exact: true }).isDisabled()).toBe(true);
    await go("Notifications");
    await page.getByRole("button", { name: "Blocked in browser", exact: true }).waitFor();
    await page.getByText("Allow notifications in your browser's site settings, then reload this page.", { exact: true }).waitFor();

    for (const label of ["Signature", "Labels", "Filters", "Out of office", "Templates", "Forwarding", "Storage", "Time zones and week", "Google Calendar", "Notifications", "Appearance", "Account", "Mail clients", "AI apps", "Organization", "Team", "Domains and mailboxes", "API keys", "Audit log"]) {
      await go(label);
      await expect.poll(() => page.getByText("Loading…", { exact: true }).count()).toBe(0);
    }
    expect(missing).toEqual([]); expect(errors).toEqual([]);
  } finally {
    releaseSave?.(); await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 60_000);
