import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it("shows mailbox progress and ETA even when collapsed, links paused imports to settings, and removes finished imports", async () => {
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {FolderRail} from './src/components/mailbox/folder-rail';import {notifySaved} from './src/components/settings/open-settings';const root=createRoot(document.getElementById('root'));window.refreshImports=()=>notifySaved({kind:'mail-imports'});window.renderRail=(single=false,canManage=true)=>root.render(<FolderRail canManage={canManage} mailboxes={single?['me@example.test']:['me@example.test','team@example.test']} mailbox="me@example.test" folder="inbox" onOpen={()=>{}} unread={{}} onCompose={()=>{}} onSettings={()=>{}} outboxJobs={[]}/>);window.renderRail();`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = createServer((_req,res) => {res.setHeader("Content-Type","text/html");res.end('<div id="root"></div><script type="module" src="/bundle.js"></script>');});
  let browser;
  try {
    server.listen(0,"127.0.0.1");await once(server,"listening");
    browser=await chromium.launch();const page=await browser.newPage();page.setDefaultTimeout(5000);
    const errors: string[]=[];page.on("pageerror",error=>errors.push(error.message));
    let jobs=[{id:"job",mailbox:"me@example.test",status:"running",processed:12400,total:30000 as number|null,etaSeconds:480 as number|null}],requests=0;
    await page.route("**/bundle.js",route=>route.fulfill({contentType:"text/javascript",body:bundle.outputFiles[0].text}));
    await page.route("**/api/app/mail/imap-imports/progress",route=>{requests++;return route.fulfill({json:jobs});});
    await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}`);
    const progress=page.getByRole("progressbar",{name:"Import progress for me@example.test",exact:true});
    await progress.waitFor({state:"attached"});expect(await progress.getAttribute("aria-valuenow")).toBe("41");
    expect(await page.getByText("~8 min left",{exact:true}).count()).toBe(1);
    expect(await page.getByText("12,400 / 30,000",{exact:true}).count()).toBe(1);
    expect(await page.getByRole("link",{name:"View import for team@example.test"}).count()).toBe(0);
    await page.getByRole("button",{name:"Collapse me@example.test",exact:true}).click();
    expect(await progress.count()).toBe(1);
    const refresh=()=>page.evaluate(()=>(window as any).refreshImports());
    jobs=[{...jobs[0],status:"failed",etaSeconds:null}];await refresh();
    const resume=page.getByRole("link",{name:"Resume import for me@example.test",exact:true});
    await resume.waitFor();expect(await resume.getAttribute("href")).toBe("/admin/mail#import");
    expect(await page.getByText("~8 min left",{exact:true}).count()).toBe(0);
    await page.evaluate(()=>(window as any).renderRail(true));
    expect(await resume.count()).toBe(1);
    jobs=[{...jobs[0],status:"queued",processed:0,total:null}];await refresh();
    await page.getByText("Preparing import",{exact:true}).waitFor();
    expect(await progress.count()).toBe(0);
    jobs=[];await refresh();
    await expect.poll(()=>page.getByRole("link",{name:/import for me@example.test/}).count()).toBe(0);
    const previousRequests=requests;
    await page.evaluate(()=>(window as any).renderRail(false,false));await refresh();
    expect(requests).toBe(previousRequests);
    expect(errors).toEqual([]);
  } finally {await browser?.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},30_000);
