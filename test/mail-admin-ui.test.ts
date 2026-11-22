import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { fixtures } from "./helpers/settings-fixtures";

const brand = { company: "Example", website: "example.test", logoUrl: "", color: "#445566", footer: "" };
const record = (purpose: string, type: string, name: string, value: string) => ({ purpose, type, name, value });
const setup = {
  domains: [
    { id: "d1", domain: "acme.test", status: "active", provider: "ses", kind: "custom", checks: { mx: true }, checkedAt: "2026-11-01T10:00:00Z", catchAllMailboxId: null, records: [record("mx", "MX", "acme.test", "inbound.example.test")] },
    { id: "d2", domain: "new.test", status: "pending", provider: "ses", kind: "custom", checks: { mx: false }, checkedAt: null, catchAllMailboxId: null, records: [record("mx", "MX", "new.test", "inbound.example.test")] },
  ],
  mailboxes: [
    { id: "b1", domainId: "d1", address: "anna@acme.test", kind: "personal", userId: "u1", displayName: "Anna", access: [] },
    { id: "b2", domainId: "d1", address: "support@acme.test", kind: "shared", userId: null, displayName: "Support", access: ["u2"] },
  ],
  aliases: [{ id: "a1", address: "hello@acme.test", mailboxId: "b2" }],
  members: [{ userId: "u1", name: "Anna", email: "anna@acme.test", role: "owner" }, { userId: "u2", name: "Bob", email: "bob@acme.test", role: "member" }],
  signatureBrand: brand,
  subdomainBase: null,
};

it("lists mailboxes, opens one mailbox's settings in a sheet, guides DNS, and points to Domains when there are none", async () => {
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MailSettings} from './src/components/mailbox/mail-settings';const root=createRoot(document.getElementById('root'));window.show=setup=>root.render(<MailSettings key={JSON.stringify(setup)} initial={setup}/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<div id="root"></div><script type="module" src="/bundle.js"></script>'); });
  let browser;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    browser = await chromium.launch(); const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    let current: unknown = setup;
    await page.route("**/bundle.js", route => route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text }));
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/app/mail/settings") return route.fulfill({ json: current });
      return route.fulfill({ json: fixtures[path] ?? {} });
    });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    await page.evaluate(s => (window as any).show(s), setup);

    // Mailboxes come first; a row says what it has without opening it.
    const list = page.getByRole("tabpanel");
    await list.getByText("support@acme.test", { exact: true }).waitFor();
    expect(await list.getByText("1 alias", { exact: true }).count()).toBe(1);
    // One "…" menu per row, with the risky actions inside it.
    await page.getByRole("button", { name: "More for anna@acme.test", exact: true }).click();
    for (const label of ["Settings", "Make shared", "Delete mailbox"]) await page.getByRole("menuitem", { name: label }).waitFor();
    await page.keyboard.press("Escape");

    // A row opens everything about that mailbox in one sheet.
    await page.getByRole("button", { name: /support@acme\.test/ }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("heading", { name: "support@acme.test" }).waitFor();
    for (const heading of ["Who can open it", "Aliases", "Manage"]) await sheet.getByRole("heading", { name: heading, exact: true }).waitFor();
    await sheet.getByText("hello@acme.test", { exact: true }).waitFor();
    expect(await sheet.getByRole("checkbox", { checked: true }).count()).toBe(1);
    await page.keyboard.press("Escape");

    // A domain waiting for DNS says which records are still missing, in words.
    await page.getByRole("tab", { name: "Domains", exact: true }).click();
    await page.getByText("Not found yet", { exact: true }).waitFor();
    await page.getByText("Waiting for DNS records", { exact: true }).waitFor();

    // With no domain, the mailboxes tab sends you to Domains instead of showing disabled buttons.
    current = { ...setup, domains: [], mailboxes: [], aliases: [] };
    await page.evaluate(s => { location.hash = ""; (window as any).show(s) }, current);
    await page.getByText("Add a domain first", { exact: true }).waitFor();
    expect(await page.getByRole("button", { name: "New mailbox", exact: true }).count()).toBe(0);
    await page.getByRole("link", { name: "Go to Domains", exact: true }).click();
    await expect.poll(() => page.getByRole("tab", { name: "Domains", exact: true }).getAttribute("aria-selected")).toBe("true");
    expect(errors).toEqual([]);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 60_000);
