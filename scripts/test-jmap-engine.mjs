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
let container, restored, server;
try {
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost']);
  container = run('docker', ['run', '-d', '-p', '127.0.0.1::8080', '-p', '127.0.0.1::143', '-e', 'STALWART_RECOVERY_ADMIN=admin:local-e2e-only-long-password',
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
  // Only the disposable engine accepts plaintext behind this loopback TLS test proxy.
  const protocolSetup=await fetch(origin+'/jmap/',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({using:['urn:ietf:params:jmap:core','urn:stalwart:jmap'],methodCalls:[
    ['x:NetworkListener/set',{create:{test:{name:'test-imap',protocol:'imap',bind:{'0.0.0.0:143':true},useTls:false}}},'listener'],
    ['x:Imap/set',{update:{singleton:{allowPlainTextAuth:true}}},'imap'],
  ]})});
  const protocolResult=await protocolSetup.json();
  if(!protocolResult.methodResponses?.[0]?.[1]?.created?.test || !Object.hasOwn(protocolResult.methodResponses?.[1]?.[1]?.updated??{},'singleton'))throw new Error('Test IMAP setup failed: '+JSON.stringify(protocolResult));
  run('docker', ['restart', container]);
  origin = `http://127.0.0.1:${run('docker', ['port', container, '8080/tcp']).split(':').at(-1)}`;
  await wait();
  const session = await (await fetch(`${origin}/jmap/session`, { headers: { authorization } })).json();
  const accountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];
  server = createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      if (req.url === '/authorize') {
        if(req.headers.authorization !== 'Bearer local-bridge-token-at-least-32-characters'){res.writeHead(401);res.end();return;}
        const input=JSON.parse(Buffer.concat(chunks).toString());res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({valid:input.owners.map(owner=>owner.scope)}));return;
      }
      const response = await fetch(`${origin}${req.url}`, { method: req.method, headers: { authorization: req.headers.authorization === 'Bearer test-admin' ? authorization : req.headers.authorization ?? '', 'content-type': req.headers['content-type'] ?? 'application/json' }, body: req.method === 'GET' ? undefined : Buffer.concat(chunks) });
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json' }); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(502); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `https://localhost:${server.address().port}`;
  const imapPort=Number(run('docker',['port',container,'143/tcp']).split(':').at(-1));
  await build({ stdin: { contents: "export {JmapClient} from './src/lib/mail/jmap.ts'; export {EngineIndex} from './services/mail-bridge/src/engine-sync.mjs'; export {EngineAdmin} from './services/mail-bridge/src/engine-admin.mjs'; export {Accounts} from './services/mail-bridge/src/accounts.mjs'; export {engineMail} from './services/mail-bridge/src/engine-mail.mjs'; export {ImapGateway} from './services/mail-bridge/src/imap-gateway.mjs'; export {MailQueue} from './services/mail-bridge/src/mail-queue.mjs';", resolveDir: process.cwd(), loader: 'ts' }, outfile: join(dir, 'client.mjs'), bundle: true, platform: 'node', format: 'esm', banner: { js: "import {createRequire as nodeRequire} from 'node:module';const require=nodeRequire(import.meta.url);" } });
  const fixture = `
    import assert from 'node:assert/strict';
    import {JmapClient,EngineIndex,EngineAdmin,Accounts,engineMail,MailQueue,ImapGateway} from './client.mjs';
    import {createServer} from 'node:http';
    import {spawn} from 'node:child_process';
    import {resolve} from 'node:path';
    import {readFileSync} from 'node:fs';
    import {connect} from 'node:net';
    import {createServer as createTlsServer} from 'node:tls';
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
    const accounts=new Accounts(resolve('bridge.sqlite'),'ab'.repeat(32));
    accounts.setOwner('3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','fixture-org','fixture-user');
    accounts.put('3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','connection',{address:'alice@example.com',imap:{host:'imap.example.com',port:993,username:'alice',password:'source-secret'},smtp:{host:'smtp.example.com',port:465,username:'alice',password:'source-secret'}});
    const binding=await admin.ensure(accounts,'3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','connection');
    assert.equal((await admin.ensure(accounts,'3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','connection')).accountId,binding.accountId);
    const mailbox=await admin.mail(binding);
    const nativeInbox=(await mailbox.client.folders()).list.find(folder=>folder.role==='inbox');
    await mailbox.client.importMessage(base+'/jmap/upload/{accountId}/',raw,nativeInbox.id,'2026-01-01T00:00:00Z');
    // Wrap the fixture's private IMAP listener; both gateway TLS legs use the trusted localhost certificate.
    const tlsKey=readFileSync(process.env.E2E_TLS_KEY),tlsCert=readFileSync(process.env.E2E_TLS_CERT),backendSockets=new Set();
    const backend=createTlsServer({key:tlsKey,cert:tlsCert},socket=>{
      const upstream=connect({host:'127.0.0.1',port:Number(process.env.E2E_ENGINE_IMAP_PLAIN)});
      backendSockets.add(socket);backendSockets.add(upstream);
      const close=()=>{socket.destroy();upstream.destroy();backendSockets.delete(socket);backendSockets.delete(upstream);};
      socket.on('error',close);upstream.on('error',close);socket.on('close',close);upstream.on('close',close);socket.pipe(upstream).pipe(socket);
    });
    backend.listen(0,'127.0.0.1');await once(backend,'listening');
    const gateway=new ImapGateway({key:tlsKey,cert:tlsCert,host:'127.0.0.1',servername:'localhost',port:backend.address().port});
    await gateway.listen(0,'127.0.0.1');
    admin.onClientRevoked=()=>gateway.disconnectAll();
    const appPassword=await admin.createClientPassword(binding,'Native E2E');
    assert.ok(appPassword.secret);
    const passwordList=await admin.clientPasswords(binding);
    assert.deepEqual(passwordList,[{id:appPassword.id,description:'Native E2E'}]);
    const forbidden=await fetch(base+'/jmap/',{method:'POST',headers:{'content-type':'application/json',authorization:'Basic '+Buffer.from(binding.username+':'+appPassword.secret).toString('base64')},body:JSON.stringify({using:['urn:ietf:params:jmap:core','urn:ietf:params:jmap:mail','urn:stalwart:jmap'],methodCalls:[['Email/query',{accountId:binding.accountId},'mail'],['x:Account/query',{},'admin']]})});
    if(forbidden.ok){const denied=await forbidden.json();assert.equal(denied.methodResponses.length,2);for(const result of denied.methodResponses){assert.equal(result[0],'error');assert.equal(result[1].type,'forbidden');}}
    else assert.ok([401,403].includes(forbidden.status));
    const {createRequire}=await import('node:module');const {ImapFlow}=createRequire(process.env.E2E_BRIDGE_PACKAGE)('imapflow');
    const device=new ImapFlow({host:'127.0.0.1',port:gateway.server.address().port,secure:true,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:5000,tls:{servername:'localhost'},auth:{user:binding.username,pass:appPassword.secret},logger:false});device.on('error',()=>{});
    try {
      await device.connect();assert.equal(typeof (await device.status('INBOX',{messages:true})).messages,'number');
      await device.mailboxOpen('INBOX');assert.match((await device.fetchOne('*',{source:true})).source.toString(),/Original body/);
      await admin.revokeClientPassword(binding,appPassword.id);
      const deadline=setTimeout(()=>device.close(),4000);
      try{assert.equal(await device.fetchOne('*',{source:true}).catch(()=>false),false);const status=await device.status('INBOX',{messages:true}).catch(()=>false);assert.equal(status,false);}finally{clearTimeout(deadline);device.close();}
      console.log('Native app-password revocation: existing session cannot read');
      const rejected=new ImapFlow({host:'127.0.0.1',port:gateway.server.address().port,secure:true,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:5000,tls:{servername:'localhost'},auth:{user:binding.username,pass:appPassword.secret},logger:false});rejected.on('error',()=>{});
      try{await assert.rejects(rejected.connect());}finally{rejected.close();}
    }finally{device.close();await gateway.close();for(const socket of backendSockets)socket.destroy();await new Promise(resolve=>backend.close(resolve));}
    const folder=await mailbox.client.createFolder('E2E external');
    const external=await mailbox.client.importMessage(base+'/jmap/upload/{accountId}/',raw,folder,'2026-01-01T00:00:00Z');
    const deliveries=[];
    const outbox=new MailQueue(accounts,admin,{deliver:async(_account,payload)=>deliveries.push(payload)});
    const app=createServer(async(req,res)=>{
      const url=new URL(req.url,'http://bridge');
      await engineMail({accounts,engine:admin,org:'3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229',connectionId:'connection',readOnly:accounts.connectionInfo('3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','connection')?.readOnly,outbox,clientHost:'imap.example.test',path:url.pathname.slice(1),url,req,res,send:(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});
    });
    app.listen(0,'127.0.0.1');await once(app,'listening');
    const request=(path,method='GET',body)=>fetch('http://127.0.0.1:'+app.address().port+'/'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    try {
      const clientSettings=await (await request('client-passwords')).json();assert.equal(clientSettings.username,binding.username);assert.deepEqual(clientSettings.passwords,[]);
      assert.equal((await request('client-passwords','POST',{description:'Injected',accountId:'other'})).status,422);
      const createdPassword=await (await request('client-passwords','POST',{description:'Mail on laptop'})).json();assert.ok(createdPassword.secret);
      const listedPasswords=await (await request('client-passwords')).json();assert.equal(listedPasswords.passwords.length,1);assert.equal(JSON.stringify(listedPasswords).includes(createdPassword.secret),false);
      assert.equal((await request('client-passwords/'+createdPassword.id,'DELETE')).status,200);
      assert.equal((await request('client-passwords/'+createdPassword.id,'DELETE')).status,200);
      const listed=await (await request('messages?folder='+folder)).json();assert.equal(listed.list.length,1);
      const detail=await (await request('messages/'+external.id)).json();assert.ok(detail.message.bodyValues);
      assert.equal((await request('messages/'+external.id,'PATCH',{starred:true,unread:false})).status,200);
      const changed=await (await request('messages/'+external.id)).json();assert.equal(changed.message.keywords.$flagged,true);
      const original=await request('messages/'+external.id+'/raw');assert.equal(original.status,200);assert.match(await original.text(),/Original body/);
      const jobId='1479fba3-a32f-44ac-a3b7-64754ebf5fa3';
      const queued=await request('send','POST',{id:jobId,to:['bob@example.com'],subject:'Reply E2E',text:'Reply body',replyToId:external.id});assert.equal(queued.status,202);
      accounts.db.exec('UPDATE outgoing_mail SET send_at=0,attempted_at=0');await outbox.tick();
      assert.equal(outbox.list('3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','connection')[0].state,'sent');assert.equal(deliveries.length,1);
      assert.match(Buffer.from(deliveries[0].raw,'base64').toString(),/In-Reply-To:/);
      assert.equal((await request('messages/'+external.id,'DELETE')).status,409);
      const allFolders=await (await request('folders')).json();const trash=allFolders.list.find(item=>item.role==='trash');assert.ok(trash);
      assert.equal((await request('messages/'+external.id,'PATCH',{folderId:trash.id})).status,200);
      assert.equal((await request('messages/'+external.id,'DELETE')).status,200);
      assert.equal((await request('messages/'+external.id)).status,404);
      const retained=await mailbox.client.importMessage(base+'/jmap/upload/{accountId}/',raw,folder,'2026-01-01T00:00:00Z');
      const recoveryDraft='1479fba3-a32f-44ac-a3b7-64754ebf5fa5';
      await outbox.enqueue('3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','connection',{id:recoveryDraft,to:['bob@example.com'],subject:'Recover me',text:'Retained draft'});
      const bridgeToken='local-bridge-token-at-least-32-characters';
      const bridge=spawn(process.execPath,[process.env.E2E_BRIDGE_SERVER],{stdio:['ignore','inherit','inherit','ipc'],env:{...process.env,PORT:'0',MAIL_BRIDGE_BIND:'127.0.0.1',MAIL_BRIDGE_DB:resolve('bridge.sqlite'),MAIL_BRIDGE_TOKEN:bridgeToken,MAIL_BRIDGE_KEY:'ab'.repeat(32),MAIL_ENGINE_URL:base+'/jmap/',MAIL_ENGINE_TOKEN:'test-admin',MAIL_ENGINE_DOMAIN_ID:admin.domainId,MAIL_ENGINE_DOMAIN:'example.test',MAIL_ENGINE_IMAP_HOST:'localhost',MAIL_SYNC_ENABLED:'false',MAIL_SEND_ENABLED:'false',MAIL_AUTHORIZATION_URL:base+'/authorize',MAIL_CLIENT_IMAP_HOST:'imap.example.test',MAIL_CLIENT_IMAP_PORT:'0',MAIL_CLIENT_TLS_KEY:process.env.E2E_TLS_KEY,MAIL_CLIENT_TLS_CERT:process.env.E2E_TLS_CERT}});
      try {
        const ready=await Promise.race([once(bridge,'message',{signal:AbortSignal.timeout(10000)}),once(bridge,'exit').then(()=>{throw new Error('Bridge exited before readiness');})]);
        const bridgeRequest=(path,method='GET',body,token=bridgeToken)=>fetch('http://127.0.0.1:'+ready[0].port+'/orgs/3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229/accounts/connection'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json','x-workinbox-org':'fixture-org','x-workinbox-user':'fixture-user'},body:body===undefined?undefined:JSON.stringify(body)});
        assert.equal((await bridgeRequest('/mail/client-passwords','GET',undefined,'invalid')).status,401);
        const device=await (await bridgeRequest('/mail/client-passwords','POST',{description:'Disconnect device'})).json();assert.ok(device.secret);
        const secondDevice=await (await bridgeRequest('/mail/client-passwords','POST',{description:'Second device'})).json();assert.ok(secondDevice.secret);
        assert.equal((await bridgeRequest('','DELETE')).status,200);
        assert.deepEqual(await admin.clientPasswords(binding),[]);
        assert.equal((await bridgeRequest('/mail/client-passwords','POST',{description:'Late creation'})).status,403);
        assert.equal((await bridgeRequest('','DELETE')).status,200);
      } finally {bridge.kill('SIGTERM');await once(bridge,'exit');}
      accounts.remove('3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','connection');assert.equal(accounts.get('3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','connection'),null);
      await outbox.cancel('3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','connection');
      assert.equal((await request('outbox/'+recoveryDraft+'/draft')).status,200);
      assert.equal((await request('outbox/'+recoveryDraft+'/draft','DELETE')).status,200);
      assert.equal(outbox.list('3907ced5a261804466fb349604cd52fd555817930d87c52a3610848ff39ac229','connection').find(job=>job.id===recoveryDraft).draftAvailable,false);
      assert.equal((await (await request('folders')).json()).readOnly,true);
      assert.equal((await request('messages/'+retained.id)).status,200);
      assert.equal((await request('messages/'+retained.id,'PATCH',{starred:true})).status,403);
      assert.equal((await request('send','POST',{id:'1479fba3-a32f-44ac-a3b7-64754ebf5fa4',to:['bob@example.com'],subject:'Blocked',text:'Blocked'})).status,403);
    } finally { await outbox.stop(); await new Promise(resolve=>app.close(resolve)); accounts.close(); }
    console.log('Stalwart JMAP and external mailbox API E2E: passed');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', fixture], { cwd: dir, stdio: 'inherit', env: {
    ...process.env, NODE_EXTRA_CA_CERTS: join(dir, 'cert.pem'), E2E_ENGINE_URL: base, E2E_ENGINE_AUTH: authorization, E2E_ENGINE_ACCOUNT: accountId, E2E_ENGINE_IMAP_PLAIN:String(imapPort), E2E_TLS_KEY:join(dir,'key.pem'), E2E_TLS_CERT:join(dir,'cert.pem'), E2E_BRIDGE_SERVER:new URL('../services/mail-bridge/src/server.mjs',import.meta.url).pathname, E2E_BRIDGE_PACKAGE:new URL('../services/mail-bridge/package.json',import.meta.url).pathname,
  } });
  const [status] = await once(child, 'exit');
  if(status) execFileSync('docker',['logs','--tail','100',container],{stdio:'inherit'});
  process.exitCode = status ?? 1;
  if (status === 0) {
    const hostedTest=spawn('pnpm',['exec','vitest','run','test/mail-native.test.ts'],{cwd:process.cwd(),stdio:'inherit',env:{...process.env,NODE_EXTRA_CA_CERTS:join(dir,'cert.pem'),E2E_HOSTED_ENGINE_URL:base,E2E_HOSTED_ENGINE_AUTH:authorization,E2E_HOSTED_IMAP_PORT:String(imapPort),E2E_HOSTED_TLS_KEY:join(dir,'key.pem'),E2E_HOSTED_TLS_CERT:join(dir,'cert.pem')}});
    const [hostedStatus]=await once(hostedTest,'exit');if(hostedStatus!==0)process.exitCode=hostedStatus??1;
  }
  if (status === 0) {
    const mailSnapshot = async () => {
      const response = await fetch(origin+'/jmap/', {method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({using:['urn:ietf:params:jmap:core','urn:ietf:params:jmap:mail'],methodCalls:[['Email/get',{accountId,ids:null,properties:['id','subject','keywords','mailboxIds','bodyValues'],fetchAllBodyValues:true},'snapshot']]})});
      const result = await response.json();
      if (result.methodResponses?.[0]?.[0] !== 'Email/get') throw new Error('Restore snapshot failed');
      return result.methodResponses[0][1].list;
    };
    const beforeRestore = await mailSnapshot();
    if (!beforeRestore.length) throw new Error('Restore must verify actual mail');
    run('docker',['stop',container]);
    restored=run('docker',['create','-p','127.0.0.1::8080','-p','127.0.0.1::443','-p','127.0.0.1::993','-e','STALWART_RECOVERY_ADMIN=admin:local-e2e-only-long-password',
      'stalwartlabs/stalwart@sha256:f772aa6ef8cd8018969fa491640f1436b0270eb14e2c219b5f37f1a77020837e']);
    for (const directory of ['/etc/stalwart','/var/lib/stalwart']) {
      const archive=execFileSync('docker',['cp',container+':'+directory+'/.','-'],{maxBuffer:128*1024*1024});
      execFileSync('docker',['cp','-',restored+':'+directory],{input:archive,stdio:['pipe','pipe','pipe']});
    }
    run('docker',['start',restored]);
    origin=`http://127.0.0.1:${run('docker',['port',restored,'8080/tcp']).split(':').at(-1)}`;
    await wait();
    const {isDeepStrictEqual}=await import('node:util');
    if(!isDeepStrictEqual(await mailSnapshot(),beforeRestore)) throw new Error('Restored engine lost or changed mail');
    console.log('Stalwart fresh-container restore: passed');
    run('docker',['exec','-u','0',restored,'mkdir','-p','/run/mail-tls']);
    for(const file of ['cert.pem','key.pem'])run('docker',['cp',join(dir,file),`${restored}:/run/mail-tls/${file}`]);
    run('docker',['exec','-u','0',restored,'chmod','644','/run/mail-tls/cert.pem','/run/mail-tls/key.pem']);
    const {configureMailEngine}=await import('./configure-mail-engine.mjs');
    const provisioned=await configureMailEngine({origin,authorization,hostname:'localhost',domain:'example.test',certificateFile:'/run/mail-tls/cert.pem',keyFile:'/run/mail-tls/key.pem'});
    run('docker',['restart',restored]);origin=`http://127.0.0.1:${run('docker',['port',restored,'8080/tcp']).split(':').at(-1)}`;await wait();
    provisioned.MAIL_ENGINE_URL=`https://localhost:${run('docker',['port',restored,'443/tcp']).split(':').at(-1)}/jmap/`;
    const tlsTest=spawn(process.execPath,['--input-type=module','-e',`
      import {createRequire} from 'node:module';import {EngineAdmin} from './services/mail-bridge/src/engine-admin.mjs';import {Accounts} from './services/mail-bridge/src/accounts.mjs';
      const {ImapFlow}=createRequire(new URL('./services/mail-bridge/package.json',import.meta.url))('imapflow');const settings=JSON.parse(process.env.E2E_PROVISIONED);
      const engine=new EngineAdmin({url:settings.MAIL_ENGINE_URL,token:settings.MAIL_ENGINE_TOKEN,domainId:settings.MAIL_ENGINE_DOMAIN_ID,domain:settings.MAIL_ENGINE_DOMAIN,imapHost:'localhost'});
      const accounts=new Accounts(':memory:','ab'.repeat(32));const id=accounts.putHosted('tls-test','box','tls@example.test');const binding=await engine.ensure(accounts,'tls-test',id);const password=await engine.createClientPassword(binding,'TLS deployment test',false);
      const imap=new ImapFlow({host:'127.0.0.1',port:Number(process.env.E2E_NATIVE_TLS_PORT),secure:true,tls:{servername:'localhost',rejectUnauthorized:true},auth:{user:binding.username,pass:password.secret},logger:false,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000});imap.on('error',()=>{});
      try{await imap.connect();await imap.mailboxOpen('INBOX');}finally{imap.close();accounts.close();}
      console.log('Production engine provisioning, service API key and native TLS listeners: passed');
    `],{cwd:process.cwd(),stdio:'inherit',env:{...process.env,NODE_EXTRA_CA_CERTS:join(dir,'cert.pem'),E2E_PROVISIONED:JSON.stringify(provisioned),E2E_NATIVE_TLS_PORT:run('docker',['port',restored,'993/tcp']).split(':').at(-1)}});
    const [tlsStatus]=await once(tlsTest,'exit');if(tlsStatus!==0)process.exitCode=tlsStatus??1;
  }
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (restored) run('docker', ['rm', '-fv', restored]);
  if (container) run('docker', ['rm', '-fv', container]);
  rmSync(dir, { recursive: true, force: true });
}
