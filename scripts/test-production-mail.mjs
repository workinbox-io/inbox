import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { hashPassword } from 'better-auth/crypto';
import PostalMime from 'postal-mime';
import { buildEml } from '../src/lib/mail/mime.ts';

// Production smoke test: only synthetic identities/mailboxes on our own workinbox.io domain.
const require=createRequire(new URL('../services/mail-bridge/package.json',import.meta.url));
const {ImapFlow}=require('imapflow'),nodemailer=require('nodemailer');
const directory=mkdtempSync(join(tmpdir(),'workinbox-production-mail-'));
const fixture={userId:randomUUID(),senderId:randomUUID(),receiverId:randomUUID(),password:randomBytes(32).toString('base64url')};
fixture.login=`native-login-${fixture.userId}@workinbox.invalid`;
fixture.sender=`native-send-${fixture.userId}@workinbox.io`;
fixture.receiver=`native-recv-${fixture.userId}@workinbox.io`;
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
function sql(query) {
  const file=join(directory,'query.sql');writeFileSync(file,query,{mode:0o600});
  const input=/^\s*SELECT\b/i.test(query)?['--command',query]:['--file',file];
  const output=execFileSync('./node_modules/.bin/wrangler',['d1','execute','DB','--remote',...input,'--json'],{encoding:'utf8',maxBuffer:4*1024*1024,timeout:60000});
  const start=output.search(/^\[/m);assert(start>=0,'D1 returned no JSON result');const result=JSON.parse(output.slice(start));
  assert(result.every(group=>group.success));return result.flatMap(group=>group.results??[]);
}
async function until(action,timeout=120000) {
  const deadline=Date.now()+timeout;let error;
  do {try{const value=await action();if(value)return value;}catch(cause){error=cause;}await delay(2000);}while(Date.now()<deadline);
  throw error??new Error('Timed out waiting for production mail');
}
let browser,context,page,senderImap,receiverImap,smtp,seeded=false;
const api=async(method,path,data)=>{
  const response=await context.request.fetch('https://workinbox.io'+path,{method,data,timeout:20000});
  if(!response.ok())throw new Error(`${method} ${path}: HTTP ${response.status()} ${await response.text()}`);
  return response.json();
};
try {
  const [domain]=sql("SELECT id,org_id FROM mail_domains WHERE domain='workinbox.io' AND status='active'");assert(typeof domain?.id==='string'&&typeof domain?.org_id==='string','Our own active workinbox.io domain is required');fixture.orgId=domain.org_id;
  writeFileSync(join(directory,'fixture.json'),JSON.stringify(fixture),{mode:0o600});
  const now=Date.now(),password=await hashPassword(fixture.password);seeded=true;
  sql(`INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(${quote(fixture.userId)},'Mail deployment test',${quote(fixture.login)},1,${now},${now});
    INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES(${quote(randomUUID())},${quote(fixture.userId)},'credential',${quote(fixture.userId)},${quote(password)},${now},${now});
    INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(${quote(randomUUID())},${quote(domain.org_id)},${quote(fixture.userId)},'member',${now});
    INSERT INTO mailboxes(id,org_id,domain_id,address,kind,user_id,uid_validity,created_at,updated_at) VALUES
    (${quote(fixture.senderId)},${quote(domain.org_id)},${quote(domain.id)},${quote(fixture.sender)},'personal',${quote(fixture.userId)},${Math.floor(now/1000)},${now},${now}),
    (${quote(fixture.receiverId)},${quote(domain.org_id)},${quote(domain.id)},${quote(fixture.receiver)},'shared',NULL,${Math.floor(now/1000)},${now},${now});
    INSERT INTO mailbox_access(mailbox_id,user_id,created_at) VALUES(${quote(fixture.receiverId)},${quote(fixture.userId)},${now});`);
  console.log('Production canary: isolated synthetic mailboxes created');
  browser=await chromium.launch();context=await browser.newContext();page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>console.error('Canary browser error:',error.message));
  await page.goto('https://workinbox.io/login');
  await page.waitForFunction(()=>document.querySelector('astro-island[component-export="AuthForm"]')?.hasAttribute('ssr')===false,undefined,{timeout:45000});
  await page.getByLabel('Email',{exact:true}).fill(fixture.login);await page.getByLabel('Password',{exact:true}).fill(fixture.password);
  const signingIn=page.waitForResponse(response=>response.url().includes('/api/auth/sign-in/email')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();const signIn=await signingIn;
  if(!signIn.ok())throw new Error('Production sign-in HTTP '+signIn.status()+': '+(await signIn.json()).message);
  await page.waitForURL(url=>url.pathname==='/app'||url.pathname.startsWith('/app/'),{waitUntil:'domcontentloaded',timeout:45000});
  await page.goto('https://workinbox.io/app/mail?settings=mail-clients');
  await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();
  const setup=await api('GET','/api/app/mail/native');assert(setup.configured);assert(setup.mailboxes.some(box=>box.id===fixture.senderId));
  for(const [id,address] of [[fixture.senderId,fixture.sender],[fixture.receiverId,fixture.receiver]]) {
    const [enabled]=await Promise.all([
      page.waitForResponse(response=>response.url().endsWith(`/api/app/mail/native/${id}`)&&response.request().method()==='POST',{timeout:90000}),
      page.getByRole('dialog',{name:'Settings',exact:true}).getByText(address,{exact:true}).last().locator('..').getByRole('button',{name:'Enable mail clients',exact:true}).click(),
    ]);
    if(!enabled.ok())throw new Error('Native enable HTTP '+enabled.status()+': '+await enabled.text());
  }
  await until(async()=>{const result=await api('GET','/api/app/mail/native');return [fixture.senderId,fixture.receiverId].every(id=>result.mailboxes.find(box=>box.id===id)?.connection?.initialized);});
  const clients={};
  for(const [id,address] of [[fixture.senderId,fixture.sender],[fixture.receiverId,fixture.receiver]]) {
    await page.goto('https://workinbox.io/app/mail?settings=mail-clients');await page.getByRole('dialog',{name:'Settings',exact:true}).waitFor();const row=page.getByRole('dialog',{name:'Settings',exact:true}).getByText(address,{exact:true}).last().locator('..');await row.getByRole('button',{name:'IMAP clients',exact:true}).click();
    await page.getByLabel('Device name',{exact:true}).fill('Production smoke test');const creating=page.waitForResponse(response=>response.url().endsWith(`/api/app/mail/native/${id}/client-passwords`)&&response.request().method()==='POST',{timeout:90000});await page.getByRole('button',{name:'Create password',exact:true}).click();const created=await creating;if(!created.ok())throw new Error('Device password HTTP '+created.status()+': '+await created.text());
    const secret=page.getByLabel('New password · shown only now',{exact:true});await secret.waitFor();const password=await secret.inputValue();assert(password);
    clients[id]={...await api('GET',`/api/app/mail/native/${id}/client-passwords`),password};
    assert.equal(clients[id].host,'mail.workinbox.io');
    assert.equal(clients[id].smtp?.host,'mail.workinbox.io');
    await page.getByRole('dialog',{name:'Connect a mail client'}).getByRole('button',{name:'Close',exact:true}).click();
  }
  console.log('Production canary: real login, member settings and device passwords passed');
  const imap=async info=>{const client=new ImapFlow({host:info.host,port:info.port,secure:true,auth:{user:info.username,pass:info.password},logger:false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});client.on('error',()=>{});await client.connect();return client;};
  senderImap=await imap(clients[fixture.senderId]);receiverImap=await imap(clients[fixture.receiverId]);await receiverImap.mailboxOpen('INBOX');
  const binary=Uint8Array.of(0,255,128,13,10,65),subject=`Workinbox SMTP canary ${fixture.userId}`;
  const raw='Bcc: '+fixture.receiver+'\r\n'+buildEml({from:{email:fixture.sender},to:fixture.sender,subject,date:new Date(),messageId:`<${fixture.userId}@workinbox.io>`,text:'Production SMTP and IMAP roundtrip.',attachments:[{filename:'canary.bin',mediaType:'application/octet-stream',content:binary}]});
  const settings=clients[fixture.senderId];assert(settings.smtp);
  smtp=nodemailer.createTransport({host:settings.smtp.host,port:settings.smtp.port,secure:true,auth:{user:settings.username,pass:settings.password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000});
  const accepted=await smtp.sendMail({envelope:{from:fixture.sender,to:[fixture.receiver]},raw});const jobId=/Queued as ([a-f0-9-]+)/i.exec(accepted.response)?.[1];assert(jobId,'SMTP must acknowledge a durable job');
  const sent=(await senderImap.list()).find(folder=>folder.specialUse==='\\Sent');assert(sent);await senderImap.append(sent.path,Buffer.from(raw),['\\Seen']);
  await until(async()=>{const job=await api('GET',`/api/app/mail/outbox/${jobId}`);assert(!['failed','uncertain'].includes(job.status),job.error);return job.status==='sent';});
  console.log('Production canary: SMTP accepted and Workinbox/provider queue completed');
  const received=await until(async()=>{
    await receiverImap.noop();if(!receiverImap.mailbox?.exists)return;
    for await(const message of receiverImap.fetch('1:*',{source:true})) {const parsed=await PostalMime.parse(message.source);if(parsed.subject===subject)return{parsed,raw:message.source};}
  },180000);
  assert.equal(received.parsed.attachments.length,1);assert.deepEqual(new Uint8Array(received.parsed.attachments[0].content),binary);assert(!received.parsed.headers.some(header=>header.key==='bcc'));
  const web=await api('GET',`/api/app/mail/threads?mailbox=${encodeURIComponent(fixture.receiver)}&folder=inbox`);assert(web.threads.some(thread=>thread.subject===subject));
  await until(async()=>{const result=await api('GET',`/api/app/mail/threads?mailbox=${encodeURIComponent(fixture.sender)}&folder=sent`);return result.threads.some(thread=>thread.subject===subject);});
  console.log('Production canary: actual provider delivery, binary attachment, Bcc privacy and web/IMAP visibility passed');
  await api('DELETE',`/api/app/mail/native/${fixture.senderId}`);await assert.rejects(smtp.verify());
  console.log('Production canary: revoked device access rejected');
} catch(error) {
  if(page){await page.screenshot({path:join(directory,'failure.png'),fullPage:true}).catch(()=>{});console.error('Canary diagnostic:',new URL(page.url()).pathname,'screenshot:',join(directory,'failure.png'));}
  throw error;
} finally {
  smtp?.close();senderImap?.close();receiverImap?.close();
  if(seeded) {
    if(context)for(const id of [fixture.senderId,fixture.receiverId])await api('DELETE',`/api/app/mail/native/${id}`).catch(()=>{});
    const boxes=[fixture.senderId,fixture.receiverId].map(quote).join(',');
    sql(`INSERT OR IGNORE INTO mail_native_gc(id,mailbox_id,keys) SELECT id,mailbox_id,storage_keys FROM mail_messages WHERE mailbox_id IN (${boxes});
      DELETE FROM contacts WHERE org_id=${quote(fixture.orgId)} AND source='sent' AND id IN (SELECT contact_id FROM contact_emails WHERE org_id=${quote(fixture.orgId)} AND email IN (${quote(fixture.sender)},${quote(fixture.receiver)}));
      DELETE FROM mailboxes WHERE id IN (${boxes}) AND org_id=${quote(fixture.orgId)};DELETE FROM user WHERE id=${quote(fixture.userId)};`);
    const scope=createHash('sha256').update(JSON.stringify([fixture.orgId,fixture.userId])).digest('hex');
    const cleanup=`import assert from 'node:assert/strict';import {Accounts} from './src/accounts.mjs';import {EngineAdmin} from './src/engine-admin.mjs';const scope=${JSON.stringify(scope)},ids=${JSON.stringify([fixture.senderId,fixture.receiverId])};const accounts=new Accounts('/data/accounts.sqlite',process.env.MAIL_BRIDGE_KEY);const owner=accounts.owner(scope);if(owner){assert.equal(owner.userId,${JSON.stringify(fixture.userId)});const engine=new EngineAdmin({url:process.env.MAIL_ENGINE_URL,token:process.env.MAIL_ENGINE_TOKEN,domainId:process.env.MAIL_ENGINE_DOMAIN_ID,domain:process.env.MAIL_ENGINE_DOMAIN,imapHost:process.env.MAIL_ENGINE_IMAP_HOST});for(const id of ids){const key='hosted-'+id,profile=accounts.hosted(scope,key),binding=accounts.binding(scope,key);if(!profile)continue;assert.equal(profile.mailbox_id,id);if(binding?.accountId){await engine.revokeClientPasswords(binding);const result=await engine.call('x:Account/set',{destroy:[binding.accountId]});assert(result.destroyed?.includes(binding.accountId)||result.notDestroyed?.[binding.accountId]?.type==='notFound');}for(const table of ['hosted_mapping','hosted_folders','hosted_pending'])accounts.db.prepare('DELETE FROM '+table+' WHERE scope=? AND connection_id=?').run(scope,key);accounts.db.prepare('DELETE FROM hosted_accounts WHERE scope=? AND id=?').run(scope,key);accounts.db.prepare('DELETE FROM engine_bindings WHERE org_id=? AND id=?').run(scope,key);}for(const table of ['engine_messages','engine_cursors','engine_locks'])accounts.db.prepare('DELETE FROM '+table+' WHERE scope=?').run(scope);accounts.db.prepare('DELETE FROM scope_owners WHERE scope=?').run(scope);}accounts.close();console.log('Production canary: synthetic engine users and credentials removed');`;
    execFileSync('ssh',['-o','BatchMode=yes','root@nbg1.cloudfile.dev','docker exec -i workinbox-mail-bridge-1 node --input-type=module'],{input:cleanup,stdio:['pipe','inherit','inherit'],timeout:90000});
    console.log('Production canary: synthetic Workinbox identities removed; object cleanup queued');
  }
  await browser?.close();
}
