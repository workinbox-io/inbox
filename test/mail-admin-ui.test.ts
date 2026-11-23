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

const team = {
  members: [
    { id: "m1", userId: "u1", name: "Anna", email: "anna@acme.test", role: "owner", isMe: true },
    { id: "m2", userId: "u2", name: "Bob", email: "bob@gmail.test", role: "member", isMe: false },
  ],
  invitations: [], canManage: true, canChangeRoles: true, seats: { limit: null, plan: "Business" },
};

it("lists people with their mailboxes, opens a person in a sheet, keeps shared mailboxes apart, and points to Domains when there are none", async () => {
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MailSettings} from './src/components/mailbox/mail-settings';import {PeoplePanel} from './src/components/app/people-panel';const root=createRoot(document.getElementById('root'));window.show=(setup,team)=>root.render(<PeoplePanel key={JSON.stringify(setup)} setup={setup} team={team}/>);window.showMail=setup=>root.render(<MailSettings initial={setup}/>);`, resolveDir: process.cwd(), loader: "tsx" },
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
      if (path === "/api/app/team") return route.fulfill({ json: team });
      return route.fulfill({ json: fixtures[path] ?? {} });
    });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    await page.evaluate(([s, t]) => (window as any).show(s, t), [setup, team]);

    // One row per person, with their mailbox address; someone without one is flagged.
    const list = page.getByRole("tabpanel");
    await list.getByText("anna@acme.test", { exact: true }).waitFor();
    await list.getByText("No mailbox", { exact: true }).waitFor();
    expect(await list.getByText("support@acme.test", { exact: true }).count()).toBe(0);

    // A person's sheet holds their role and everything about their mailbox.
    await page.getByRole("button", { name: /^Anna/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("heading", { name: "anna@acme.test" }).waitFor();
    for (const heading of ["Role", "Who can open it", "Aliases", "Manage mailbox"]) await sheet.getByRole("heading", { name: heading, exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "hidden" });
    // Bob has none yet: the sheet offers one, shows the shared mailboxes he answers, and lets an owner remove him.
    await page.getByRole("button", { name: /^Bob/ }).click();
    await sheet.getByRole("button", { name: "Give a mailbox", exact: true }).waitFor();
    await sheet.getByText("support@acme.test", { exact: true }).waitFor();
    await sheet.getByRole("button", { name: "Remove", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "hidden" });

    // Adding someone: an account on the domain or an invitation, from one button.
    await page.getByRole("button", { name: "Add person", exact: true }).click();
    for (const label of ["Create an account on your domain", "Invite by e-mail"]) await page.getByRole("menuitem", { name: new RegExp(label) }).waitFor();
    await page.keyboard.press("Escape");

    // Shared mailboxes have their own tab and sheet.
    await page.getByRole("tab", { name: "Shared mailboxes", exact: true }).click();
    await page.getByRole("tabpanel").getByText("1 alias", { exact: true }).waitFor();
    await page.getByRole("button", { name: "More for support@acme.test", exact: true }).click();
    for (const label of ["Settings", "Delete mailbox"]) await page.getByRole("menuitem", { name: label }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /support@acme\.test/ }).first().click();
    await sheet.getByRole("heading", { name: "support@acme.test" }).waitFor();
    await sheet.getByText("hello@acme.test", { exact: true }).waitFor();
    expect(await sheet.getByRole("checkbox", { checked: true }).count()).toBe(1);
    await page.keyboard.press("Escape");

    // A domain waiting for DNS says which records are still missing, in words.
    await page.evaluate(s => { location.hash = ""; (window as any).showMail(s) }, setup);
    await page.getByRole("tab", { name: "Domains", exact: true }).waitFor();
    await page.getByText("Not found yet", { exact: true }).waitFor();
    await page.getByText("Waiting for DNS records", { exact: true }).waitFor();

    // With no domain, shared mailboxes send you to Domains instead of showing disabled buttons.
    current = { ...setup, domains: [], mailboxes: [], aliases: [] };
    await page.evaluate(([s, t]) => { location.hash = "shared"; (window as any).show(s, t) }, [current, team]);
    await page.getByText("Add a domain first", { exact: true }).waitFor();
    expect(await page.getByRole("button", { name: "New shared mailbox", exact: true }).count()).toBe(0);
    expect(await page.getByRole("link", { name: "Go to Domains", exact: true }).getAttribute("href")).toBe("/admin/mail#domains");
    expect(errors).toEqual([]);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 60_000);
