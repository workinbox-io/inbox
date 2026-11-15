import { z } from 'zod';
import { createServer } from 'node:http';
import { HostedMirror, HostedScheduler } from './hosted-sync.mjs';
import { RootMail } from './root-mail.mjs';
import { hostedRoutes } from './hosted-routes.mjs';
import { AccessPolicy } from './access-policy.mjs';
import { ImapGateway } from './imap-gateway.mjs';
import { Submission } from './submission.mjs';
import { timingSafeEqual } from 'node:crypto';
import { verify } from './verify.mjs';
import { Accounts, accountSchema } from './accounts.mjs';
import { EngineAdmin } from './engine-admin.mjs';
import { SyncScheduler } from './scheduler.mjs';
import { engineMail } from './engine-mail.mjs';
import { MailQueue } from './mail-queue.mjs';
import { clientTls } from './client-tls.mjs';

const token = process.env.MAIL_BRIDGE_TOKEN;
if (!token || token.length < 32) throw new Error('MAIL_BRIDGE_TOKEN must contain at least 32 characters');
const accounts = new Accounts(process.env.MAIL_BRIDGE_DB ?? '/data/accounts.sqlite', process.env.MAIL_BRIDGE_KEY ?? '');
const engineConfigured = [process.env.MAIL_ENGINE_URL, process.env.MAIL_ENGINE_TOKEN, process.env.MAIL_ENGINE_DOMAIN_ID, process.env.MAIL_ENGINE_DOMAIN, process.env.MAIL_ENGINE_IMAP_HOST].every(Boolean);
const engine = process.env.MAIL_SYNC_ENABLED === 'true' || engineConfigured ? new EngineAdmin({
  url: process.env.MAIL_ENGINE_URL, token: process.env.MAIL_ENGINE_TOKEN,
  domainId: process.env.MAIL_ENGINE_DOMAIN_ID, domain: process.env.MAIL_ENGINE_DOMAIN, imapHost: process.env.MAIL_ENGINE_IMAP_HOST,
  imapTarget: process.env.MAIL_ENGINE_IMAP_TARGET,
}) : null;
const clientHost = process.env.MAIL_CLIENT_IMAP_HOST;
if (clientHost && (!engine || !/^[a-zA-Z0-9.-]{1,253}$/.test(clientHost))) throw new Error('Configure a valid public IMAPS hostname and engine first');
if (clientHost && (!process.env.MAIL_CLIENT_TLS_KEY || !process.env.MAIL_CLIENT_TLS_CERT)) throw new Error('Configure the client TLS certificate and private key first');
const tlsOptions = clientHost ? clientTls() : null;
const gateway = clientHost ? new ImapGateway({
  ...tlsOptions,
  host: engine.imapTarget, servername: engine.imapHost,
}) : null;
if (gateway) {
  gateway.setAccepting(false);
  engine.onClientRevoked = () => gateway.disconnectAll();
  await gateway.listen(Number(process.env.MAIL_CLIENT_IMAP_PORT ?? 1993), process.env.MAIL_BRIDGE_BIND ?? '0.0.0.0');
}
if ((clientHost || process.env.MAIL_SYNC_ENABLED === 'true' || process.env.MAIL_SEND_ENABLED === 'true') && !process.env.MAIL_AUTHORIZATION_URL) throw new Error('Configure Workinbox membership authorization first');
const scheduler = process.env.MAIL_SYNC_ENABLED === 'true' ? new SyncScheduler(accounts, engine) : null;
if (process.env.MAIL_SEND_ENABLED === 'true' && !scheduler) throw new Error('Enable synchronization before outbound mail');
const outbox = process.env.MAIL_SEND_ENABLED === 'true' ? new MailQueue(accounts, engine, { beforeSend: scope => policy.authorize(scope), beforeCopy: async (org, id) => {
  const running = scheduler.active.get(scheduler.key(org, id))?.promise ?? scheduler.run(org, id);
  if (!running) throw new Error('Synchronization is busy');
  await running;
  if (accounts.status(org, id)?.state !== 'ready') throw new Error('Sent reconciliation deferred');
} }) : null;
async function disconnectAccount(org, id, replacementId) {
  return accounts.exclusive(org, id, async () => {
    await scheduler?.pause(org, id);
    try {
      await outbox?.pause(org, id); await outbox?.cancel(org, id);
      if (replacementId) {
        const previous = accounts.replacement(org, id);
        if (previous) return previous;
        const account = accounts.get(org, id);
        if (!account) throw new Error('Connection not found');
        await verify(account);
      }
      const binding = accounts.binding(org, id);
      if (binding?.accountId && engine) await engine.revokeClientPasswords(binding);
      return replacementId ? accounts.recover(org, id, replacementId) : accounts.remove(org, id);
    } finally { scheduler?.resume(org, id); outbox?.resume(org, id); }
  });
}
const hostedEnabled=process.env.MAIL_HOSTED_ENABLED==='true';
if(hostedEnabled && (!engine || !gateway || !process.env.MAIL_AUTHORIZATION_URL))throw new Error('Configure engine, gateway and Workinbox authorization before hosted mail');
const submission=hostedEnabled?new Submission({accounts,engine,...tlsOptions,sourceConfig:{url:process.env.MAIL_AUTHORIZATION_URL,token}}):null;
if(submission)await submission.listen(Number(process.env.MAIL_CLIENT_SMTP_PORT??1465),process.env.MAIL_BRIDGE_BIND??'0.0.0.0');
if(engine)engine.onClientRevoked=()=>{gateway?.disconnectAll();submission?.disconnectAll();};
const clientAccess={setAccepting:value=>{gateway?.setAccepting(value);submission?.setAccepting(value);}};
async function revokeHosted(scope,id){
  gateway?.disconnectAll();submission?.disconnectAll();
  await accounts.exclusive(scope,id,async()=>{const binding=accounts.binding(scope,id);if(binding?.accountId)await engine.revokeClientPasswords(binding);accounts.disableHosted(scope,id);});
}
if(!hostedEnabled)for(const row of accounts.db.prepare('SELECT scope,id FROM hosted_accounts WHERE active=1').all()) {
  if(!engine)throw new Error('Configure the engine to revoke previously enabled hosted access');
  await revokeHosted(row.scope,row.id);
}
const hostedMirror=hostedEnabled?new HostedMirror(accounts,engine,{url:process.env.MAIL_AUTHORIZATION_URL,token}):null;
const hostedScheduler=hostedEnabled?new HostedScheduler(accounts,hostedMirror,revokeHosted):null;
async function disconnectHosted(scope,id){
  await hostedScheduler?.pause(scope,id);
  try{await revokeHosted(scope,id);}finally{hostedScheduler?.resume(scope,id);}
}
const policy = process.env.MAIL_AUTHORIZATION_URL ? new AccessPolicy(accounts, {
  url: process.env.MAIL_AUTHORIZATION_URL, token, gateway:clientAccess, disconnect: disconnectAccount, disconnectHosted,
}) : null;
if (scheduler) scheduler.authorize = scope => policy.authorize(scope);
function bindOwner(org, req) {
  const orgId = req.headers['x-workinbox-org'], userId = req.headers['x-workinbox-user'];
  if (orgId || userId) {
    if (typeof orgId !== 'string' || typeof userId !== 'string') throw new Error('Invalid owner headers');
    accounts.setOwner(org, orgId, userId);
  }
}
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
    const hostedPath=/^\/orgs\/([a-zA-Z0-9_-]{1,128})\/hosted(?:\/([a-zA-Z0-9_-]{1,128}))?(?:\/(client-passwords)(?:\/([a-zA-Z0-9_-]{1,255}))?)?$/.exec(url.pathname);
    if(hostedPath){
      const [,scope,mailboxId,passwords,passwordId]=hostedPath;bindOwner(scope,req);
      await hostedRoutes({accounts,engine,scheduler:hostedScheduler,enabled:hostedEnabled,scope,mailboxId,passwords,passwordId,req,send,disconnect:disconnectHosted,clientHost,sourceConfig:{url:process.env.MAIL_AUTHORIZATION_URL,token}});return;
    }
    const mailPath = /^\/orgs\/([a-zA-Z0-9_-]{1,128})\/accounts\/([a-zA-Z0-9_-]{1,128})\/mail\/(.+)$/.exec(url.pathname);
    if (mailPath) {
      const [, org, connectionId, path] = mailPath;
      bindOwner(org, req);
      const info = accounts.connectionInfo(org, connectionId);
      if (!info) { send(404, { error: 'Not found' }); return; }
      await engineMail({ accounts, engine, org, connectionId, path, url, req, res, send, readOnly: info.readOnly, outbox, clientHost }); return;
    }
    const match = /^\/orgs\/([a-zA-Z0-9_-]{1,128})\/accounts(?:\/([a-zA-Z0-9_-]{1,128}))?(\/(?:test|sync|recover))?$/.exec(url.pathname);
    if (!match) { send(404, { error: 'Not found' }); return; }
    const [, org, id, test] = match;
    bindOwner(org, req);
    if (req.method === 'GET' && !id) { send(200, accounts.list(org).map(connection => ({ ...connection, clientAccess: !!clientHost && connection.sync?.state !== 'disconnected' && !!accounts.binding(org, connection.id)?.accountId }))); return; }
    if (req.method === 'GET' && id && !test) {
      const info = accounts.connectionInfo(org, id);
      if (!info) { send(404, { error: 'Not found' }); return; }
      send(200, info); return;
    }
    if (req.method === 'DELETE' && id && !test) {
      await disconnectAccount(org, id);
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
      const saved = await accounts.exclusive(org, id, async () => {
        await scheduler?.pause(org, id);
        try { await outbox?.pause(org, id); return accounts.put(org, id, parsed.data); }
        finally { scheduler?.resume(org, id); outbox?.resume(org, id); }
      });
      scheduler?.run(org, id);
      send(200, { ...saved, syncEnabled: !!scheduler }); return;
    }
    if (req.method === 'POST' && id && test === '/recover') {
      const previous = accounts.replacement(org, id);
      if (previous) { send(200, { connectionId: previous }); return; }
      const status = accounts.status(org, id);
      if (status?.state !== 'error') { send(409, { error: 'Recovery is available only for a failed synchronization' }); return; }
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 32768) { send(413, { error: 'Body too large' }); return; } chunks.push(chunk); }
      let input;
      try { input = z.object({ newId: z.uuid() }).strict().parse(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { send(422, { error: 'Invalid recovery request' }); return; }
      const connectionId = await disconnectAccount(org, id, input.newId);
      scheduler?.run(org, connectionId);
      send(200, { connectionId }); return;
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
  policy?.start();
  hostedScheduler?.start();
  scheduler?.start();
  outbox?.start();
  if (process.send) process.send({ port: server.address().port });
});
process.once('SIGTERM', async () => { clientAccess.setAccepting(false);await policy?.stop(); await hostedScheduler?.stop(); await submission?.close();await gateway?.close(); await scheduler?.stop(); await outbox?.stop(); server.close(() => { accounts.close(); process.exit(0); }); });
