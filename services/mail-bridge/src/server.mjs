import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { verify } from './verify.mjs';
import { Accounts, accountSchema } from './accounts.mjs';
import { EngineAdmin } from './engine-admin.mjs';
import { SyncScheduler } from './scheduler.mjs';
import { engineMail } from './engine-mail.mjs';
import { MailQueue } from './mail-queue.mjs';

const token = process.env.MAIL_BRIDGE_TOKEN;
if (!token || token.length < 32) throw new Error('MAIL_BRIDGE_TOKEN must contain at least 32 characters');
const accounts = new Accounts(process.env.MAIL_BRIDGE_DB ?? '/data/accounts.sqlite', process.env.MAIL_BRIDGE_KEY ?? '');
const engineConfigured = [process.env.MAIL_ENGINE_URL, process.env.MAIL_ENGINE_TOKEN, process.env.MAIL_ENGINE_DOMAIN_ID, process.env.MAIL_ENGINE_DOMAIN, process.env.MAIL_ENGINE_IMAP_HOST].every(Boolean);
const engine = process.env.MAIL_SYNC_ENABLED === 'true' || engineConfigured ? new EngineAdmin({
  url: process.env.MAIL_ENGINE_URL, token: process.env.MAIL_ENGINE_TOKEN,
  domainId: process.env.MAIL_ENGINE_DOMAIN_ID, domain: process.env.MAIL_ENGINE_DOMAIN, imapHost: process.env.MAIL_ENGINE_IMAP_HOST,
  imapTarget: process.env.MAIL_ENGINE_IMAP_TARGET,
}) : null;
const scheduler = process.env.MAIL_SYNC_ENABLED === 'true' ? new SyncScheduler(accounts, engine) : null;
if (process.env.MAIL_SEND_ENABLED === 'true' && !scheduler) throw new Error('Enable synchronization before outbound mail');
const outbox = process.env.MAIL_SEND_ENABLED === 'true' ? new MailQueue(accounts, engine, { beforeCopy: async (org, id) => {
  const running = scheduler.active.get(scheduler.key(org, id))?.promise ?? scheduler.run(org, id);
  if (!running) throw new Error('Synchronization is busy');
  await running;
  if (accounts.status(org, id)?.state !== 'ready') throw new Error('Sent reconciliation deferred');
} }) : null;
const authorized = (value) => {
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(value ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};


let active = 0;
const server = createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (!authorized(req.headers.authorization)) { send(401, { error: 'Unauthorized' }); return; }
  if (active >= 8) { send(503, { error: 'Busy' }); return; }
  active++;
  try {
    const url = new URL(req.url, 'http://bridge');
    if (req.method === 'GET' && url.pathname === '/health') { send(200, { ok: true }); return; }
    const mailPath = /^\/orgs\/([a-zA-Z0-9_-]{1,128})\/accounts\/([a-zA-Z0-9_-]{1,128})\/mail\/(.+)$/.exec(url.pathname);
    if (mailPath) {
      const [, org, connectionId, path] = mailPath;
      const info = accounts.connectionInfo(org, connectionId);
      if (!info) { send(404, { error: 'Not found' }); return; }
      await engineMail({ accounts, engine, org, connectionId, path, url, req, res, send, readOnly: info.readOnly, outbox }); return;
    }
    const match = /^\/orgs\/([a-zA-Z0-9_-]{1,128})\/accounts(?:\/([a-zA-Z0-9_-]{1,128}))?(\/(?:test|sync))?$/.exec(url.pathname);
    if (!match) { send(404, { error: 'Not found' }); return; }
    const [, org, id, test] = match;
    if (req.method === 'GET' && !id) { send(200, accounts.list(org)); return; }
    if (req.method === 'GET' && id && !test) {
      const info = accounts.connectionInfo(org, id);
      if (!info) { send(404, { error: 'Not found' }); return; }
      send(200, info); return;
    }
    if (req.method === 'DELETE' && id && !test) {
      await scheduler?.pause(org, id);
      try { await outbox?.pause(org, id); await outbox?.cancel(org, id); accounts.remove(org, id); }
      finally { scheduler?.resume(org, id); outbox?.resume(org, id); }
      send(200, { ok: true }); return;
    }
    if (req.method === 'PUT' && id && !test) {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 32768) { send(413, { error: 'Body too large' }); return; } chunks.push(chunk); }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { send(400, { error: 'Invalid JSON' }); return; }
      const parsed = accountSchema.safeParse(body);
      if (!parsed.success) { send(422, { error: 'Invalid account settings' }); return; }
      const previous = accounts.get(org, id);
      if (previous && (previous.address !== parsed.data.address || previous.imap.host !== parsed.data.imap.host || previous.imap.username !== parsed.data.imap.username)) {
        send(422, { error: 'Use a new connection for a different mailbox' }); return;
      }
      await verify(parsed.data);
      await scheduler?.pause(org, id);
      let saved;
      try { await outbox?.pause(org, id); saved = accounts.put(org, id, parsed.data); }
      finally { scheduler?.resume(org, id); outbox?.resume(org, id); }
      scheduler?.run(org, id);
      send(200, { ...saved, syncEnabled: !!scheduler }); return;
    }
    if (req.method === 'POST' && id && test) {
      const account = accounts.get(org, id);
      if (!account) { send(404, { error: 'Not found' }); return; }
      if (test === '/sync') {
        if (!scheduler) { send(503, { error: 'Synchronization is not configured' }); return; }
        scheduler.run(org, id); send(202, { queued: true }); return;
      }
      send(200, await verify(account)); return;
    }
    send(405, { error: 'Method not allowed' });
  } catch { send(502, { error: 'Mail server connection failed' }); }
  finally { active--; }
});
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT ?? 8090), process.env.MAIL_BRIDGE_BIND ?? '0.0.0.0', () => {
  scheduler?.start();
  outbox?.start();
  if (process.send) process.send({ port: server.address().port });
});
process.once('SIGTERM', async () => { await scheduler?.stop(); await outbox?.stop(); server.close(() => { accounts.close(); process.exit(0); }); });
