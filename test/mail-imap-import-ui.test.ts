import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it("queues an IMAP-only import, clears the password, shows progress and resumes or cancels", async () => {
  const mailboxId = "00000000-0000-4000-a000-000000000001";
  const bundle = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ImapImport} from './src/components/mailbox/imap-import';createRoot(document.getElementById('root')).render(<ImapImport mailboxes={[{id:'${mailboxId}',address:'me@example.test'}]}/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "esm", define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end('<div id="root"></div><script type="module" src="/bundle.js"></script>'); });
  let browser;
  try {
    server.listen(0,"127.0.0.1"); await once(server,"listening");
    browser = await chromium.launch(); const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror",error => errors.push(error.message));
    const writes: {method: string; body: any}[] = []; let jobs: any[] = [], reject = true;
    await page.route("**/bundle.js",route => route.fulfill({contentType:"text/javascript",body:bundle.outputFiles[0].text}));
    await page.route("**/api/app/mail/imap-imports**",async route => {
      const req=route.request();
      if(req.method()==="GET") return route.fulfill({json:{configured:true,imports:jobs}});
      const body=req.postData()?req.postDataJSON():null; writes.push({method:req.method(),body});
      if(body) {
        if(reject) { reject=false; return route.fulfill({status:502,json:{error:"Temporary outage"}}); }
        jobs=[{id:body.id,mailboxId,host:body.imap.host,username:body.imap.username,status:"failed",copied:1234,skipped:1,error:"The destination mailbox is full."}];
      } else if(req.method()==="POST") jobs[0].status="queued";
      else jobs[0].status="cancelled";
      return route.fulfill({json:{ok:true}});
    });
    await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}`);
    await page.getByLabel("Source IMAP server",{exact:true}).fill("imap.example.com");
    await page.getByLabel("Username",{exact:true}).fill("anna@example.com");
    await page.getByLabel("Password or app password",{exact:true}).fill("secret");
    const start=page.getByRole("button",{name:"Start one-time import",exact:true});
    await start.click(); await expect.poll(()=>start.isEnabled()).toBe(true);
    expect(await page.getByLabel("Password or app password",{exact:true}).inputValue()).toBe("secret");
    await start.click();
    await page.getByText("The destination mailbox is full.",{exact:true}).waitFor();
    expect(writes[0].body.id).toBe(writes[1].body.id);
    expect(writes[1].body).toEqual({id:expect.any(String),mailboxId,imap:{host:"imap.example.com",port:993,username:"anna@example.com",password:"secret"}});
    expect(await page.getByLabel("Password or app password",{exact:true}).inputValue()).toBe("");
    expect(await page.getByText(/1234 processed/).count()).toBe(1);
    await page.getByRole("button",{name:"Resume import",exact:true}).click();
    await expect.poll(()=>page.getByRole("button",{name:"Resume import",exact:true}).count()).toBe(0);
    await page.getByRole("button",{name:"Cancel import",exact:true}).click();
    await page.getByText("Cancelled", {exact:true}).waitFor();
    expect(writes.map(write=>write.method)).toEqual(["POST","POST","POST","DELETE"]);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
},30_000);
