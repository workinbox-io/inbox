import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it("folds other mailboxes, collapses the selected one, remembers both, and keeps compose available", async () => {
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {FolderRail} from './src/components/mailbox/folder-rail';createRoot(document.getElementById('root')).render(<FolderRail mailboxes={['me@example.test','team@example.test']} mailbox="me@example.test" folder="inbox" onOpen={(mailbox,folder)=>{window.opened=[mailbox,folder]}} unread={{'me@example.test':3}} onCompose={()=>{window.composed=true}} onSettings={()=>{}} outboxJobs={[]}/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = createServer((req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); return; }
    res.setHeader("Content-Type", "text/html");
    res.end('<div id="root"></div><script type="module" src="/bundle.js"></script>');
  });
  let browser;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    browser = await chromium.launch(); const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
    const inboxes = page.getByRole("button").filter({ has: page.getByText("Inbox", { exact: true }) });
    // "All mailboxes" and the open mailbox; team@ starts folded.
    await expect.poll(() => inboxes.count()).toBe(2);
    await page.getByRole("button", { name: "Collapse me@example.test", exact: true }).click();
    await expect.poll(() => inboxes.count()).toBe(1);
    expect(await page.getByRole("button", { name: "Expand me@example.test", exact: true }).getAttribute("aria-expanded")).toBe("false");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mail-rail-collapsed")!))).toEqual(["me@example.test"]);
    await page.reload();
    await page.getByRole("button", { name: "Expand me@example.test", exact: true }).waitFor();
    expect(await inboxes.count()).toBe(1);
    await page.getByRole("button", { name: "Expand me@example.test", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => inboxes.count()).toBe(2);
    await inboxes.nth(1).click();
    expect(await page.evaluate(() => (window as any).opened)).toEqual(["me@example.test", "inbox"]);
    await page.getByRole("button", { name: "Expand team@example.test", exact: true }).click();
    await expect.poll(() => inboxes.count()).toBe(3);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mail-rail-expanded")!))).toEqual(["team@example.test"]);
    await page.getByRole("button", { name: "New e-mail" }).click();
    expect(await page.evaluate(() => (window as any).composed)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 30_000);
