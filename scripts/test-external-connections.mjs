import { build } from 'esbuild';
import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Component integration test: the API fixture does not represent a synchronized mailbox.
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ExternalAccounts} from './src/components/mailbox/external-accounts'; import {ExternalMailbox} from './src/components/mailbox/external-mailbox'; createRoot(document.getElementById('root')).render(location.pathname==='/mail'?<ExternalMailbox connectionId='browser' draftScope='browser-owner' />:<ExternalAccounts />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'esm',
  define: { 'process.env.NODE_ENV': '"production"' },
});
let saved = [], rejectSave = true, submitted;
let queuedMessages = [], outgoingInputs = new Map();
const mail = { id: 'email1', blobId: 'blob1', threadId: 'thread1', mailboxIds: { inbox: true }, keywords: {}, receivedAt: '2026-01-01T00:00:00Z', size: 200, subject: 'Browser mail', preview: 'Message body', from: [{name:'Alice',email:'alice@example.com'}],to:[],cc:[],textBody:[],htmlBody:[{partId:'h',blobId:'html'}],bodyValues:{h:{value:'<p>Safe message body</p><script>parent.window.externalMailXss=true</script><img src="https://tracker.invalid/pixel">',isTruncated:false}},attachments:[] };
const mailFolders=[{id:'inbox',name:'Inbox',role:'inbox'},{id:'trash',name:'Trash',role:'trash'}];
const server = createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/bundle.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(bundle.outputFiles[0].text); return; }
  if (!req.url.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>'); return; }
  if (req.url.startsWith('/api/app/mail/external-accounts/browser/mail')) {
    const url=new URL(req.url,'http://test');
    if (url.pathname.endsWith('/folders')) { send(200,{list:mailFolders,canSend:true,hasOutbox:true});return; }
    if (url.pathname.endsWith('/send') && req.method==='POST') {
      const chunks=[];for await (const chunk of req) chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks).toString());
      outgoingInputs.set(input.id,input);const job={id:input.id,state:'queued',subject:input.subject,createdAt:Date.now(),sendAt:Date.now()+10000,error:null,draftAvailable:true};
      queuedMessages.unshift(job);send(202,job);return;
    }
    if (url.pathname.endsWith('/outbox')) {send(200,{jobs:queuedMessages});return;}
    if (url.pathname.includes('/outbox/')) {
      const segments=url.pathname.split('/');const isDraft=segments.at(-1)==='draft';const id=isDraft?segments.at(-2):segments.at(-1);
      const job=queuedMessages.find(job=>job.id===id);
      if (isDraft) {job.draftAvailable=false;send(200,{ok:true});return;}
      job.state='cancelled';send(200,{...job,draft:outgoingInputs.get(id)});return;
    }
    if (url.pathname.endsWith('/messages')) { send(200,{list:mail.mailboxIds[url.searchParams.get('folder')]?[mail]:[],hasMore:false});return; }
    if (req.method==='PATCH') {
      const chunks=[];for await (const chunk of req) chunks.push(chunk);const patch=JSON.parse(Buffer.concat(chunks).toString());
      if (patch.unread!==undefined) mail.keywords.$seen=!patch.unread;
      if (patch.starred!==undefined) mail.keywords.$flagged=patch.starred;
      if (patch.folderId) mail.mailboxIds={[patch.folderId]:true};
      send(200,{state:'changed'});return;
    }
    if (req.method==='DELETE') { mail.mailboxIds={};send(200,{state:'deleted'});return; }
    send(200,{state:'current',message:mail});return;
  }
  if (req.url==='/api/app/mail/external-accounts/browser') {send(200,{address:'anna@example.com'});return;}
  if (req.method === 'GET') { send(200, saved); return; }
  if (req.method === 'PUT') {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    submitted = JSON.parse(Buffer.concat(chunks).toString());
    if (rejectSave) { rejectSave = false; send(502, { error: 'Mail server connection failed' }); return; }
    saved = [{ id: req.url.split('/').at(-1), address: submitted.address }];
    send(200, saved[0]); return;
  }
  if (req.method === 'DELETE') { saved = []; send(200, { ok: true }); return; }
  send(200, { ok: true });
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: 'Add connection' }).click();
  await page.getByLabel('Email address', { exact: true }).fill('anna@example.com');
  for (const protocol of ['imap', 'smtp']) {
    await page.locator(`#${protocol}-host`).fill(`${protocol}.example.com`);
    await page.locator(`#${protocol}-user`).fill('anna');
    await page.locator(`#${protocol}-password`).fill('test-only-password');
  }
  await page.getByRole('button', { name: 'Verify and save' }).click();
  await page.getByRole('alert').filter({ hasText: 'Mail server connection failed' }).waitFor();
  assert.equal(await page.locator('#imap-password').inputValue(), 'test-only-password');
  await page.getByRole('button', { name: 'Verify and save' }).click();
  await page.getByRole('status').filter({ hasText: 'Connection verified and saved' }).waitFor();
  assert.equal(submitted.imap.port, 993); assert.equal(submitted.smtp.port, 465);
  assert.equal(await page.locator('input[type=password]').count(), 0);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('test-only-password')), false);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByRole('status').filter({ hasText: 'Connection to anna@example.com verified' }).waitFor();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByText('No external connections.', { exact: true }).waitFor();
  await page.goto(`http://127.0.0.1:${server.address().port}/mail`);
  let tracking=0;await page.route('https://tracker.invalid/**',route=>{tracking++;return route.abort();});
  await page.getByRole('button',{name:/Browser mail/}).click();
  await page.getByRole('heading',{name:'Browser mail'}).waitFor();
  await page.frameLocator('iframe[title="E-mail"]').getByText('Safe message body').waitFor();
  assert.equal(await page.evaluate(()=>window.externalMailXss),undefined);assert.equal(tracking,0);
  await page.getByRole('button',{name:'Compose',exact:true}).click();
  await page.getByLabel('To',{exact:true}).fill('bob@example.com');
  await page.getByLabel('Subject',{exact:true}).fill('Browser compose');
  await page.getByLabel('Message',{exact:true}).fill('Persistent draft body');
  await page.getByLabel('Attachments',{exact:true}).setInputFiles({name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('browser attachment')});
  await page.getByRole('button',{name:'Save and close',exact:true}).click();
  await page.getByRole('button',{name:'Compose',exact:true}).click();
  assert.equal(await page.getByLabel('Message',{exact:true}).inputValue(),'Persistent draft body');
  await page.getByRole('button',{name:'Remove note.txt',exact:true}).waitFor();
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Message queued.'}).waitFor();
  const firstJob=queuedMessages[0];assert.equal(outgoingInputs.get(firstJob.id).files[0].content,Buffer.from('browser attachment').toString('base64'));
  await page.getByRole('button',{name:'Undo send',exact:true}).click();
  await page.getByLabel('Subject',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Message',{exact:true}).inputValue(),'Persistent draft body');
  await page.getByRole('button',{name:'Remove note.txt',exact:true}).waitFor();
  await page.getByRole('button',{name:'Discard draft',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Delete',exact:true}).click();
  await page.getByRole('button',{name:'Send',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Star',exact:true}).click();
  await page.getByRole('button',{name:'Unstar',exact:true}).waitFor();
  await page.getByRole('button',{name:'Move to Trash',exact:true}).click();
  await page.getByText('No messages in this folder.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Trash',exact:true}).click();
  await page.getByRole('button',{name:/Browser mail/}).click();
  await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Delete',exact:true}).click();
  await page.getByText('No messages in this folder.',{exact:true}).waitFor();
  assert.deepEqual(errors, []);
  console.log('External connections and mailbox browser integration: passed');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
