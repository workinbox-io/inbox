import { createServer } from "node:http";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { appRoute, appScreenKey, panelArea } from "@/lib/app-routes";
import { contacts, panelFixture, prefs, usage } from "./helpers/panel-fixtures";

describe("panel routes", () => {
  it("recognizes screens without treating endpoints or malformed paths as screens", () => {
    expect(appRoute("/admin")).toEqual({ screen: "overview", id: null });
    expect(appRoute("/admin/people")).toEqual({ screen: "admin-settings", id: "people" });
    expect(appRoute("/staff/mail")).toEqual({ screen: "staff-mail", id: null });
    expect(appRoute("/app/mail/external/account-1")).toEqual({ screen: "external-mail", id: "account-1" });
    // Old addresses (/app, /app/billing, /app/admin…) are redirects in appPage, not screens.
    for (const path of ["/app", "/app/view", "/app/billing", "/app/admin", "/app/admin-mail", "/application", "/administrator", "/admin/nope", "/admin/team", "/admin/people/x", "/staff/other", "/app/contacts/not-an-id", "/app/mail/other"]) expect(appRoute(path)).toBeNull();
    expect(panelArea("/admin/people")).toBe("admin");
    expect(panelArea("/administrator")).toBeNull();
    expect(appScreenKey("/admin/people")).not.toBe(appScreenKey("/admin/audit"));
    expect(appScreenKey("/app/notes/00000000-0000-0000-0000-000000000001")).toBe(appScreenKey("/app/notes"));
    expect(appScreenKey("/app/mail/external/one")).not.toBe(appScreenKey("/app/mail/external/two"));
    expect(appScreenKey("/app/collections/00000000-0000-0000-0000-000000000001")).not.toBe(appScreenKey("/app/collections/00000000-0000-0000-0000-000000000002"));
  });
});

it("keeps the real shell and icons mounted across apps, history, errors, and pending saves", async () => {
  const navigationCss = readFileSync("src/styles/global.css", "utf8").split("/* Shared moving background for the dashboard sidebar and workspace app rail. */")[1];
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import PanelRouter from './src/components/app/panel-router';import {navigatePanel,pushUrl,guardLeaving} from './src/lib/panel-history';const root=createRoot(document.getElementById('root'));window.mountPanel=initial=>root.render(<PanelRouter initial={initial}/>);window.goPanel=navigatePanel;window.pushPanel=pushUrl;window.pendingPanel=()=>guardLeaving(()=>true);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' },
  });
  let fail = false;
  let expired = false;
  let hold = false;
  let release: (() => void) | undefined;
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://panel.test");
    const send = (data: unknown, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname === "/bundle.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(bundle.outputFiles[0]!.text); return; }
    if (url.pathname === "/mail-sw.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(""); return; }
    if (url.pathname === "/api/app/page") {
      const path = url.searchParams.get("path")!; requests.push(path);
      if (expired) { send({ error: "Unauthorized" }, 401); return; }
      if (fail) { send({ error: "Unavailable" }, 503); return; }
      if (hold && path === "/app/notes") { release = () => send(panelFixture(path)); return; }
      if (!appRoute(new URL(path, url).pathname)) { send({ error: "Not found" }, 404); return; }
      send(panelFixture(path)); return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname.includes("/calendar/prefs")) { send(prefs); return; }
      if (url.pathname.includes("/drive/usage")) { send(usage); return; }
      if (url.pathname.includes("/settings/")) { send({ error: "No fixture" }, 503); return; }
      send({ total: 0, notifications: [], unread: {}, channels: [], counts: { threads: 0 }, messages: [], threads: [], events: [], notes: [], folders: [], items: [], jobs: [], groups: [], contacts, directory: [], hasMore: false, people: [], list: [], address: "person@example.test" }); return;
    }
    if (!panelArea(url.pathname)) { res.writeHead(404); res.end(); return; }
    const initial = panelFixture(url.pathname + url.search);
    res.writeHead(appRoute(url.pathname) ? 200 : 404, { "Content-Type": "text/html" });
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><style>${navigationCss}</style><div id="root"></div><script type="module">import '/bundle.js';window.mountPanel(${JSON.stringify(initial)});</script>`);
  });
  let browser;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    const documents: string[] = []; page.on("request", (r) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents.push(r.url()); });
    await page.goto(origin + "/app/mail");
    await page.getByRole("navigation", { name: "Applications" }).waitFor();
    await page.evaluate(() => {
      const w = window as any; w.rail = document.querySelector('nav[aria-label="Applications"]'); w.icon = w.rail.querySelector('a[href="/app/chat"] svg');
    });
    expect(requests).toHaveLength(0);
    const rail = page.getByRole("navigation", { name: "Applications" });
    expect(await page.locator('[data-slot="sidebar-inset"] > header').count()).toBe(0);
    await rail.getByRole("button", { name: "Search pages", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await rail.getByRole("button", { name: /^Notifications/ }).click();
    await page.locator('[data-radix-popper-content-wrapper] [data-side="right"]').waitFor();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    const header = page.locator('[data-slot="sidebar-inset"] > header');
    await header.getByRole("button", { name: "Apps", exact: true }).waitFor();
    expect(await page.getByRole("button", { name: /^Notifications/ }).count()).toBe(1);
    expect(await rail.getByRole("button", { name: "Search pages", exact: true }).count()).toBe(0);
    await header.getByRole("button", { name: "Apps", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await header.getByRole("button", { name: /^Notifications/ }).click();
    await page.locator('[data-radix-popper-content-wrapper] [data-side="bottom"]').waitFor();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await rail.getByRole("button", { name: "Search pages", exact: true }).waitFor();
    const checkIndicator = async () => {
      await page.locator('[data-slot="navigation-indicator"]').evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished));
      });
      expect(await page.locator('[data-slot="navigation-indicator"]').evaluate((element) => {
        const marker = element.getBoundingClientRect();
        const active = element.parentElement!.querySelector('a[aria-current="page"]')!.getBoundingClientRect();
        return Math.abs(marker.x - active.x) < 1 && Math.abs(marker.y - active.y) < 1 && Math.abs(marker.width - active.width) < 1 && Math.abs(marker.height - active.height) < 1;
      })).toBe(true);
    };
    for (const name of ["Chat", "Calendar", "Notes", "Contacts", "Drive", "Mail"]) {
      await page.getByRole("navigation", { name: "Applications" }).getByRole("link", { name, exact: true }).click();
      await page.waitForFunction((name) => document.title.toLowerCase().startsWith(name.toLowerCase()), name);
      await page.waitForFunction(() => !document.querySelector('main[aria-busy="true"]'));
      expect(await page.evaluate(() => { const w = window as any; return w.rail === document.querySelector('nav[aria-label="Applications"]') && w.icon === w.rail.querySelector('a[href="/app/chat"] svg'); })).toBe(true);
      await checkIndicator();
    }
    // A long move must start gently, rather than cover a third of its distance in the first 24ms.
    await page.evaluate(() => (window as any).goPanel("/app/drive"));
    await page.waitForURL("**/app/drive");
    await page.waitForFunction(() => document.querySelector('[data-slot="navigation-indicator"]')?.getAnimations().length);
    const motion = await page.locator('[data-slot="navigation-indicator"]').evaluate((element) => {
      const animation = element.getAnimations()[0]!;
      animation.pause();
      animation.currentTime = 0;
      const start = element.getBoundingClientRect();
      animation.currentTime = 24;
      const early = element.getBoundingClientRect();
      animation.finish();
      const end = element.getBoundingClientRect();
      return { fraction: Math.hypot(early.x - start.x, early.y - start.y) / Math.hypot(end.x - start.x, end.y - start.y), properties: getComputedStyle(element).transitionProperty, layer: getComputedStyle(element).willChange };
    });
    expect(motion.fraction).toBeGreaterThan(0);
    expect(motion.fraction).toBeLessThan(0.1);
    expect(motion.properties).toBe("transform");
    expect(motion.layer).toBe("transform");
    await page.goBack(); await page.waitForURL("**/app/mail");
    await checkIndicator();
    expect(await page.locator('[data-slot="navigation-indicator"]').evaluate((element) => getComputedStyle(element).transitionDuration)).toContain("0.24s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.locator('[data-slot="navigation-indicator"]').evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(documents).toHaveLength(1);
    await page.goBack(); await page.waitForURL("**/app/drive"); await page.goForward(); await page.waitForURL("**/app/mail");
    await page.evaluate(() => (window as any).goPanel("/app/does-not-exist"));
    await page.getByRole("heading", { name: "Page not found", exact: true }).waitFor();
    expect(await page.getByRole("navigation", { name: "Applications" }).count()).toBe(1);
    await page.getByRole("main").getByRole("button", { name: "Search pages", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Back to mail", exact: true }).click();
    await page.waitForURL("**/app/mail");
    expect(documents).toHaveLength(1);
    // Opening contacts and traversing their history keeps the list mounted and avoids a page fetch.
    await page.evaluate(() => (window as any).goPanel("/app/contacts"));
    await page.waitForSelector(`[data-row="${contacts[0]!.id}"]`);
    await page.evaluate(() => { (window as any).contactRow = document.querySelector('[data-row]'); });
    const contactRequests = requests.length;
    await page.locator(`[data-row="${contacts[0]!.id}"] > button`).click();
    await page.waitForURL(`**/app/contacts/${contacts[0]!.id}`);
    await page.locator(`[data-row="${contacts[1]!.id}"] > button`).click();
    await page.waitForURL(`**/app/contacts/${contacts[1]!.id}`);
    await page.goBack(); await page.waitForURL(`**/app/contacts/${contacts[0]!.id}`);
    await page.waitForSelector(`[data-row="${contacts[0]!.id}"] > button[aria-current="true"]`);
    expect(requests).toHaveLength(contactRequests);
    expect(await page.evaluate(() => (window as any).contactRow === document.querySelector('[data-row]'))).toBe(true);
    await page.evaluate(() => (window as any).goPanel("/app/mail"));
    await page.waitForURL("**/app/mail");
    // Settings is a page in the same shell.
    await page.evaluate(() => (window as any).goPanel("/app/settings/appearance"));
    await page.getByRole("navigation", { name: "Settings", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Appearance", exact: true }).waitFor();
    await page.evaluate(() => (window as any).goPanel("/app/mail"));
    await page.waitForURL("**/app/mail");
    // Local address updates don't run the whole page loader again.
    const before = requests.length;
    await page.evaluate(() => (window as any).pushPanel("/app/mail?t=missing"));
    await page.waitForURL("**/app/mail?t=missing"); expect(requests).toHaveLength(before);
    await page.goBack(); await page.waitForURL("**/app/mail");
    // The same guard covers links, palette actions and browser history.
    await page.evaluate(() => { (window as any).clearPending = (window as any).pendingPanel(); });
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.evaluate(() => (window as any).goPanel("/app/contacts"));
    await page.waitForTimeout(100); expect(new URL(page.url()).pathname).toBe("/app/mail");
    await page.evaluate(() => (window as any).clearPending());
    await page.evaluate(() => (window as any).goPanel("/app/contacts"));
    await page.waitForURL("**/app/contacts");
    await page.evaluate(() => { (window as any).clearPending = (window as any).pendingPanel(); });
    const backBlocked = page.waitForEvent("dialog");
    await page.evaluate(() => history.back());
    await (await backBlocked).dismiss();
    await page.waitForURL("**/app/contacts");
    await page.evaluate(() => (window as any).clearPending());
    await page.evaluate(() => (window as any).goPanel("/app/mail"));
    await page.waitForURL("**/app/mail");
    fail = true;
    await page.evaluate(() => (window as any).goPanel("/app/contacts"));
    await page.getByText("Could not load this page.", { exact: true }).waitFor();
    expect(await page.getByRole("navigation", { name: "Applications" }).count()).toBe(1);
    fail = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.waitForFunction(() => document.title.startsWith("contacts"));
    expect(documents).toHaveLength(1);
    expect(errors).toEqual([]);
    // Superseded requests are aborted and cannot replace the screen selected afterwards.
    hold = true;
    const held = page.waitForRequest((r) => r.url().includes("/api/app/page?path=%2Fapp%2Fnotes"));
    await page.evaluate(() => (window as any).goPanel("/app/notes"));
    await held;
    const aborted = page.waitForEvent("requestfailed", { predicate: (r) => r.url().includes("%2Fapp%2Fnotes") });
    await page.evaluate(() => (window as any).goPanel("/app/drive"));
    await aborted;
    await page.waitForURL("**/app/drive");
    release?.(); hold = false;
    await page.waitForFunction(() => document.title.startsWith("drive"));
    // The admin console's sidebar is equally persistent, keeps its collapsed state, and carries on into the staff tools.
    await page.goto(origin + "/admin");
    await page.waitForFunction(() => document.title.startsWith("overview"));
    await page.getByText("Welcome, Test", { exact: true }).waitFor();
    expect(await page.getByRole("navigation", { name: "Applications" }).count()).toBe(0);
    await checkIndicator();
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
    await page.waitForSelector('[data-slot="sidebar"][data-state="collapsed"]');
    await page.evaluate(() => { const w = window as any; w.sidebar = document.querySelector('[data-slot="sidebar"]'); w.backIcon = w.sidebar.querySelector('a[href="/app/mail"] svg'); });
    for (const path of ["/admin/billing", "/admin/people", "/admin/audit", "/staff", "/staff/mail", "/admin"]) {
      await page.evaluate((path) => (window as any).goPanel(path), path);
      await page.waitForURL(origin + path);
      await page.waitForFunction(() => !document.querySelector('main[aria-busy="true"]'));
      expect(await page.evaluate(() => { const w = window as any; return w.sidebar === document.querySelector('[data-slot="sidebar"]') && w.sidebar.dataset.state === "collapsed" && w.backIcon === w.sidebar.querySelector('a[href="/app/mail"] svg'); })).toBe(true);
      await checkIndicator();
    }
    // Back to the apps without a page load: the rail replaces the sidebar.
    await page.evaluate(() => (window as any).goPanel("/app/chat"));
    await page.getByRole("navigation", { name: "Applications" }).waitFor();
    expect(await page.locator('[data-slot="sidebar"]').count()).toBe(0);
    expect(documents).toHaveLength(2);
    expect(errors).toEqual([]);
    // On phones the sidebar sheet closes after navigation.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + "/admin");
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
    await page.getByRole("dialog").getByRole("link", { name: "People", exact: true }).click();
    await page.waitForURL("**/admin/people");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    expect(documents).toHaveLength(3);
    expect(errors).toEqual([]);
    expired = true;
    await page.evaluate(() => (window as any).goPanel("/app/contacts"));
    await page.waitForURL("**/login?next=%2Fapp%2Fcontacts");
    expired = false;
    for (const path of ["/app/does-not-exist", "/admin/does-not-exist"]) {
      const response = await page.goto(origin + path);
      expect(response?.status()).toBe(404);
      await page.getByRole("heading", { name: "Page not found", exact: true }).waitFor();
      if (path.startsWith("/app/")) expect(await page.getByRole("navigation", { name: "Applications" }).count()).toBe(1);
      else expect(await page.getByRole("button", { name: "Toggle sidebar", exact: true }).count()).toBe(1);
    }
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 60_000);
