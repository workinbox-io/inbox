import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it("shows connection states, keeps management behind a disclosure, and verifies credentials before saving", async () => {
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ExternalAccounts} from './src/components/mailbox/external-accounts';createRoot(document.getElementById('root')).render(<ExternalAccounts/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<div id="root"></div><script type="module" src="/bundle.js"></script>'); });
  let browser;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const connections = [
      { id: "ready", address: "ready@example.test", sync: { state: "ready", syncedAt: 1, error: null } },
      { id: "broken", address: "broken@example.test", sync: { state: "error", syncedAt: null, error: "App password expired" } },
      { id: "old", address: "old@example.test", sync: { state: "disconnected", syncedAt: 1, error: null } },
    ];
    const requests: { method: string; path: string; body: any }[] = [];
    let rejectSave = true;
    await page.route("**/bundle.js", route => route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text }));
    await page.route("**/api/app/mail/external-accounts**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      requests.push({ method: request.method(), path, body: request.postDataJSON() });
      if (request.method() === "PUT") {
        if (rejectSave) return route.fulfill({ status: 400, json: { error: "Invalid IMAP password" } });
        return route.fulfill({ json: { syncEnabled: true } });
      }
      if (path.endsWith("/ready") && request.method() === "GET") return route.fulfill({ json: { address: "ready@example.test", imap: { host: "imap.example.test", username: "ready@example.test" }, smtp: { host: "smtp.example.test", username: "ready@example.test", port: 587 } } });
      if (request.method() === "DELETE") connections.splice(0, 1);
      return route.fulfill({ json: request.method() === "GET" ? connections : {} });
    });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    const ready = page.getByRole("group", { name: "ready@example.test", exact: true });
    await ready.getByText("Up to date", { exact: true }).waitFor();
    expect(await ready.getByRole("link", { name: "Open mail" }).getAttribute("href")).toBe("/app/mail/external/ready");
    expect(await ready.getByRole("button", { name: "Disconnect", exact: true }).count()).toBe(0);
    await page.getByText("App password expired", { exact: true }).waitFor();
    const old = page.getByRole("group", { name: "old@example.test", exact: true });
    await old.getByText("Your saved messages are available as a read-only copy.", { exact: true }).waitFor();
    await old.getByRole("button", { name: "Manage old@example.test", exact: true }).click();
    expect(await old.getByRole("button", { name: "Test connection" }).isDisabled()).toBe(true);
    expect(await old.getByRole("button", { name: "Disconnect", exact: true }).count()).toBe(0);
    await ready.getByRole("button", { name: "Manage ready@example.test", exact: true }).focus();
    await page.keyboard.press("Enter");
    await ready.getByRole("button", { name: "Reconnect", exact: true }).click();
    await page.getByText("Reconnect account", { exact: true }).waitFor();
    expect(await page.getByLabel("Email address", { exact: true }).inputValue()).toBe("ready@example.test");
    expect(await page.locator("#imap-host").getAttribute("readonly")).not.toBeNull();
    expect(await page.locator("#imap-password").inputValue()).toBe("");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Add connection", exact: true }).click();
    await page.getByLabel("Email address", { exact: true }).fill("new@example.test");
    for (const protocol of ["imap", "smtp"]) {
      await page.locator(`#${protocol}-host`).fill(`${protocol}.example.test`);
      await page.locator(`#${protocol}-user`).fill("new@example.test");
      await page.locator(`#${protocol}-password`).fill("app-password");
    }
    await page.getByRole("button", { name: "Verify and save", exact: true }).click();
    await page.getByRole("alert").getByText("Invalid IMAP password", { exact: true }).waitFor();
    expect(await page.locator("#imap-password").inputValue()).toBe("app-password");
    rejectSave = false;
    await page.getByRole("button", { name: "Verify and save", exact: true }).click();
    await page.getByText("Connection verified and saved. Synchronization queued.", { exact: true }).waitFor();
    const saves = requests.filter(request => request.method === "PUT");
    expect(saves).toHaveLength(2);
    expect(saves[0].path).toBe(saves[1].path);
    expect(saves[1].body).toEqual({ address: "new@example.test", imap: { host: "imap.example.test", port: 993, username: "new@example.test", password: "app-password" }, smtp: { host: "smtp.example.test", port: 465, username: "new@example.test", password: "app-password" } });
    await ready.getByRole("button", { name: "Disconnect", exact: true }).click();
    const confirmation = page.getByRole("alertdialog");
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(requests.some(request => request.method === "DELETE")).toBe(false);
    await ready.getByRole("button", { name: "Disconnect", exact: true }).click();
    await confirmation.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect.poll(() => ready.count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 30_000);
