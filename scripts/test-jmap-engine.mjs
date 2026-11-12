import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:https';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'workinbox-jmap-e2e-'));
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const authorization = `Basic ${Buffer.from('admin:local-e2e-only-long-password').toString('base64')}`;
let container, server;
try {
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost']);
  container = run('docker', ['run', '-d', '--rm', '-p', '127.0.0.1::8080', '-e', 'STALWART_RECOVERY_ADMIN=admin:local-e2e-only-long-password',
    'stalwartlabs/stalwart@sha256:f772aa6ef8cd8018969fa491640f1436b0270eb14e2c219b5f37f1a77020837e']);
  const port = run('docker', ['port', container, '8080/tcp']).split(':').at(-1);
  let origin = `http://127.0.0.1:${port}`;
  async function wait() {
    const deadline = Date.now() + 30000;
    while (true) {
      try { if ((await fetch(`${origin}/jmap/session`, { headers: { authorization }, signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
      if (Date.now() > deadline) throw new Error('Stalwart startup timed out');
      await setTimeout(250);
    }
  }
  await wait();
  const bootstrap = await fetch(`${origin}/jmap/`, { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({
    using: ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'], methodCalls: [['x:Bootstrap/set', { update: { singleton: {
      defaultHostname: 'localhost', defaultDomain: 'example.test', requestTlsCertificate: false, generateDkimKeys: false, tracer: { '@type': 'Stdout' },
    } } }, '0']],
  }) });
  const configured = await bootstrap.json();
  if (!configured.methodResponses?.[0]?.[1]?.updated?.singleton) throw new Error('Stalwart bootstrap failed');
  run('docker', ['restart', container]);
  origin = `http://127.0.0.1:${run('docker', ['port', container, '8080/tcp']).split(':').at(-1)}`;
  await wait();
  const session = await (await fetch(`${origin}/jmap/session`, { headers: { authorization } })).json();
  const accountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];
  server = createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const response = await fetch(`${origin}${req.url}`, { method: req.method, headers: { authorization: req.headers.authorization ?? '', 'content-type': req.headers['content-type'] ?? 'application/json' }, body: req.method === 'GET' ? undefined : Buffer.concat(chunks) });
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json' }); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(502); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `https://localhost:${server.address().port}`;
  await build({ stdin: { contents: "export {JmapClient} from './src/lib/mail/jmap.ts'; export {EngineIndex} from './services/mail-bridge/src/engine-sync.mjs'; export {EngineAdmin} from './services/mail-bridge/src/engine-admin.mjs'; export {Accounts} from './services/mail-bridge/src/accounts.mjs'; export {engineMail} from './services/mail-bridge/src/engine-mail.mjs'; export {MailQueue} from './services/mail-bridge/src/mail-queue.mjs';", resolveDir: process.cwd(), loader: 'ts' }, outfile: join(dir, 'client.mjs'), bundle: true, platform: 'node', format: 'esm', banner: { js: "import {createRequire as nodeRequire} from 'node:module';const require=nodeRequire(import.meta.url);" } });
  const fixture = `
    import assert from 'node:assert/strict';
    import {JmapClient,EngineIndex,EngineAdmin,Accounts,engineMail,MailQueue} from './client.mjs';
    import {createServer} from 'node:http';
    import {once} from 'node:events';
    import {DatabaseSync} from 'node:sqlite';
    const base=process.env.E2E_ENGINE_URL, authorization=process.env.E2E_ENGINE_AUTH, accountId=process.env.E2E_ENGINE_ACCOUNT;
    const response=await fetch(base+'/jmap/',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({using:['urn:ietf:params:jmap:core','urn:ietf:params:jmap:mail'],methodCalls:[['Mailbox/set',{accountId,create:{inbox:{name:'E2E Inbox'}}},'0']]})});
    const created=await response.json();
    const mailboxId=created.methodResponses[0][1].created.inbox.id;
    const client=new JmapClient(base+'/jmap/',authorization,accountId);
    const db=new DatabaseSync(':memory:');
    const index=new EngineIndex(db);
    await index.sync('test',accountId,client);
    const before=await client.emails([]);
    const raw=new TextEncoder().encode('From: alice@example.test\\r\\nTo: bob@example.test\\r\\nSubject: E2E\\r\\nMessage-ID: <engine-e2e@example.test>\\r\\n\\r\\nOriginal body');
    const imported=await client.importMessage(base+'/jmap/upload/{accountId}/',raw,mailboxId,'2026-01-01T00:00:00Z');
    const list=await client.emails([imported.id]); assert.equal(list.list.length,1);
    assert.ok(list.list[0].mailboxIds[mailboxId]);
    await index.sync('test',accountId,client);
    assert.equal(index.messages('test',accountId).length,1);
    const changes=await client.changes(before.state); assert.ok(changes.created.includes(imported.id));
    await client.update(imported.id,{'keywords/$seen':true},list.state);
    const updated=await client.emails([imported.id]); assert.equal(updated.list[0].keywords.$seen,true);
    await assert.rejects(client.update(imported.id,{'keywords/$flagged':true},list.state),{type:'stateMismatch'});
    assert.ok((await client.folders()).list.some(f=>f.id===mailboxId));
    await index.sync('test',accountId,client);
    assert.equal(index.messages('test',accountId)[0].keywords.$seen,true);
    db.close();
    const adminTransport=(url,options={})=>fetch(url,{...options,headers:{...options.headers,authorization:options.headers?.authorization?.startsWith('Bearer ')?authorization:options.headers?.authorization}});
    const domainResponse=await adminTransport(base+'/jmap/',{method:'POST',headers:{authorization:'Bearer test-admin','content-type':'application/json'},body:JSON.stringify({using:['urn:ietf:params:jmap:core','urn:stalwart:jmap'],methodCalls:[['x:Domain/query',{filter:{name:'example.test'}},'0']]})});
    const domains=await domainResponse.json();
    const admin=new EngineAdmin({url:base+'/jmap/',token:'test-admin',domainId:domains.methodResponses[0][1].ids[0],domain:'example.test',imapHost:'localhost'},adminTransport);
    const accounts=new Accounts(':memory:','ab'.repeat(32));
    accounts.put('scope','connection',{address:'alice@example.com',imap:{host:'imap.example.com',port:993,username:'alice',password:'source-secret'},smtp:{host:'smtp.example.com',port:465,username:'alice',password:'source-secret'}});
    const binding=await admin.ensure(accounts,'scope','connection');
    assert.equal((await admin.ensure(accounts,'scope','connection')).accountId,binding.accountId);
    const mailbox=await admin.mail(binding);
    const folder=await mailbox.client.createFolder('E2E external');
    const external=await mailbox.client.importMessage(base+'/jmap/upload/{accountId}/',raw,folder,'2026-01-01T00:00:00Z');
    const deliveries=[];
    const outbox=new MailQueue(accounts,admin,{deliver:async(_account,payload)=>deliveries.push(payload)});
    const app=createServer(async(req,res)=>{
      const url=new URL(req.url,'http://bridge');
      await engineMail({accounts,engine:admin,org:'scope',connectionId:'connection',readOnly:accounts.connectionInfo('scope','connection')?.readOnly,outbox,path:url.pathname.slice(1),url,req,res,send:(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});
    });
    app.listen(0,'127.0.0.1');await once(app,'listening');
    const request=(path,method='GET',body)=>fetch('http://127.0.0.1:'+app.address().port+'/'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    try {
      const listed=await (await request('messages?folder='+folder)).json();assert.equal(listed.list.length,1);
      const detail=await (await request('messages/'+external.id)).json();assert.ok(detail.message.bodyValues);
      assert.equal((await request('messages/'+external.id,'PATCH',{starred:true,unread:false})).status,200);
      const changed=await (await request('messages/'+external.id)).json();assert.equal(changed.message.keywords.$flagged,true);
      const original=await request('messages/'+external.id+'/raw');assert.equal(original.status,200);assert.match(await original.text(),/Original body/);
      const jobId='1479fba3-a32f-44ac-a3b7-64754ebf5fa3';
      const queued=await request('send','POST',{id:jobId,to:['bob@example.com'],subject:'Reply E2E',text:'Reply body',replyToId:external.id});assert.equal(queued.status,202);
      accounts.db.exec('UPDATE outgoing_mail SET send_at=0,attempted_at=0');await outbox.tick();
      assert.equal(outbox.list('scope','connection')[0].state,'sent');assert.equal(deliveries.length,1);
      assert.match(Buffer.from(deliveries[0].raw,'base64').toString(),/In-Reply-To:/);
      assert.equal((await request('messages/'+external.id,'DELETE')).status,409);
      const allFolders=await (await request('folders')).json();const trash=allFolders.list.find(item=>item.role==='trash');assert.ok(trash);
      assert.equal((await request('messages/'+external.id,'PATCH',{folderId:trash.id})).status,200);
      assert.equal((await request('messages/'+external.id,'DELETE')).status,200);
      assert.equal((await request('messages/'+external.id)).status,404);
      const retained=await mailbox.client.importMessage(base+'/jmap/upload/{accountId}/',raw,folder,'2026-01-01T00:00:00Z');
      accounts.remove('scope','connection');accounts.remove('scope','connection');assert.equal(accounts.get('scope','connection'),null);
      assert.equal((await (await request('folders')).json()).readOnly,true);
      assert.equal((await request('messages/'+retained.id)).status,200);
      assert.equal((await request('messages/'+retained.id,'PATCH',{starred:true})).status,403);
      assert.equal((await request('send','POST',{id:'1479fba3-a32f-44ac-a3b7-64754ebf5fa4',to:['bob@example.com'],subject:'Blocked',text:'Blocked'})).status,403);
    } finally { await outbox.stop(); await new Promise(resolve=>app.close(resolve)); accounts.close(); }
    console.log('Stalwart JMAP and external mailbox API E2E: passed');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', fixture], { cwd: dir, stdio: 'inherit', env: {
    ...process.env, NODE_EXTRA_CA_CERTS: join(dir, 'cert.pem'), E2E_ENGINE_URL: base, E2E_ENGINE_AUTH: authorization, E2E_ENGINE_ACCOUNT: accountId,
  } });
  const [status] = await once(child, 'exit');
  process.exitCode = status ?? 1;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (container) run('docker', ['rm', '-f', container]);
  rmSync(dir, { recursive: true, force: true });
}
