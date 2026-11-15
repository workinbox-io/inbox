import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it("updates the open editor without autosave, preserves conflicting text and attachments, and blocks stale sends", async () => {
  const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ComposeWindow} from './src/components/mailbox/composer';import {syncDrafts} from './src/components/mailbox/drafts';window.syncDrafts=syncDrafts;await syncDrafts();createRoot(document.getElementById('root')).render(<ComposeWindow open inline draftKey="d-11111111-1111-4111-8111-111111111111" prefill={null} mailboxes={['me@example.test']} mailbox="me@example.test" contacts={[]} signatures={{}} signatureBrand={{}} schedule={job=>{job.run().catch(e=>{window.sendError=e.message;job.failed()})}} onClose={()=>{window.closedDraft=true}}/>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' } });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<div id="root"></div><script type="module" src="/bundle.js"></script>'); });
  let browser;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    browser = await chromium.launch(); const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    let remote = { key: "d-11111111-1111-4111-8111-111111111111", updatedAt: 1, source: "ai", via: null, threadId: null, threadSubject: null, draft: { mode: "new", from: "me@example.test", to: ["you@example.test"], cc: [], subject: "Subject", text: "Original", files: [{ url: "/api/files/attachments/org/test/report.txt", filename: "report.txt", mediaType: "text/plain" }] } };
    const puts: unknown[] = []; let sent = false;
    await page.route("**/bundle.js", route => route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text }));
    await page.route("**/api/**", async route => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      if (path === "/api/app/mail/drafts") return route.fulfill({ json: { drafts: [remote], hasMore: false, nextCursor: null } });
      if (path.startsWith("/api/app/mail/drafts/")) {
        if (request.method() === "GET") return route.fulfill({ json: remote });
        const data = request.postDataJSON(); puts.push(data);
        if (data.expectedUpdatedAt !== remote.updatedAt) return route.fulfill({ status: 409, json: { error: "Draft conflict" } });
        remote = { ...remote, draft: data, updatedAt: remote.updatedAt + 1 };
        return route.fulfill({ json: { key: remote.key, updatedAt: remote.updatedAt } });
      }
      if (path === "/api/app/mail/threads") {
        if (request.postDataJSON().expectedUpdatedAt !== remote.updatedAt) return route.fulfill({ status: 409, json: { error: "Draft changed or was deleted" } });
        sent = true; return route.fulfill({ json: { id: "job" } });
      }
      return route.fulfill({ json: { suggestions: [], templates: [] } });
    });
    await page.goto(origin);
    const body = page.getByRole("textbox", { name: "Message", exact: true });
    await expect.poll(() => body.inputValue()).toBe("Original");
    await page.getByText("report.txt", { exact: true }).waitFor();
    expect(puts).toHaveLength(0);
    remote = { ...remote, updatedAt: 2, draft: { ...remote.draft, text: "MCP edit" } };
    await page.evaluate(() => (window as any).syncDrafts());
    await expect.poll(() => body.inputValue()).toBe("MCP edit"); expect(puts).toHaveLength(0);
    await body.fill("Unsaved local text");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("inbox:mail:draft:d-11111111-1111-4111-8111-111111111111")!).text)).toBe("Unsaved local text");
    remote = { ...remote, updatedAt: 3, draft: { ...remote.draft, text: "Newer server" } };
    await page.evaluate(() => (window as any).syncDrafts());
    await page.getByRole("button", { name: "Load server version", exact: true }).waitFor();
    expect(await body.inputValue()).toBe("Unsaved local text");
    await page.getByRole("button", { name: "Load server version", exact: true }).click();
    await expect.poll(() => body.inputValue()).toBe("Newer server"); expect(puts).toHaveLength(0);
    await page.getByText("report.txt", { exact: true }).waitFor();
    remote = { ...remote, updatedAt: 4 };
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as any).sendError)).toBe("Draft changed or was deleted");
    expect(sent).toBe(false); expect(errors).toEqual([]);
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 30_000);
