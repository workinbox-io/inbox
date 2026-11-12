import { build } from 'esbuild';
import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Component integration test: the API fixture does not represent a synchronized mailbox.
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ExternalAccounts} from './src/components/mailbox/external-accounts'; createRoot(document.getElementById('root')).render(<ExternalAccounts />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'esm',
  define: { 'process.env.NODE_ENV': '"production"' },
});
let saved = [], rejectSave = true, submitted;
const server = createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/bundle.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(bundle.outputFiles[0].text); return; }
  if (!req.url.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>'); return; }
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
  assert.deepEqual(errors, []);
  console.log('External connections browser integration: passed');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
