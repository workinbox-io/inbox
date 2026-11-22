import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
const state=vi.hoisted(()=>({sql:null as import("node:sqlite").DatabaseSync|null,failDelete:false,deleted:[] as string[],files:new Map<string,Uint8Array>(),cfSend:vi.fn()}));
vi.mock("cloudflare:workers",()=>({env:{EMAIL:{send:(...args:any[])=>state.cfSend(...args)},MAIL_BRIDGE_TOKEN:'native-test-token',DB:{prepare:(query:string)=>({bind:(...params:any[])=>({query,params,first:async()=>state.sql!.prepare(query).get(...params)??null,all:async()=>({results:state.sql!.prepare(query).all(...params)})}),first:async()=>state.sql!.prepare(query).get()??null}),batch:async(statements:{query:string;params:any[]}[])=>{
 state.sql!.exec('BEGIN');try{const result=statements.map(statement=>({results:state.sql!.prepare(statement.query).all(...statement.params)}));state.sql!.exec('COMMIT');return result;}catch(error){state.sql!.exec('ROLLBACK');throw error;}
}},FILES:{head:async(key:string)=>state.files.has(key)?{size:state.files.get(key)!.byteLength}:null,put:async(key:string,body:any)=>{state.files.set(key,typeof body==='string'?new TextEncoder().encode(body):body instanceof Uint8Array?body:new Uint8Array(body));},get:async(key:string)=>{const body=state.files.get(key);return body?{size:body.byteLength,body:new Blob([Uint8Array.from(body).buffer]).stream(),arrayBuffer:async()=>Uint8Array.from(body).buffer,text:async()=>new TextDecoder().decode(body)}:null;},delete:async(input:string|string[])=>{const keys=typeof input==='string'?[input]:input;if(state.failDelete)throw new Error('R2 unavailable');state.deleted.push(...keys);for(const key of keys)state.files.delete(key);}}}}));
vi.mock("@/db",async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {drizzle}=await import('drizzle-orm/sqlite-proxy');const operators=await import('drizzle-orm');const schema=await import('@/db/schema');
 const sqlite=new DatabaseSync(':memory:');state.sql=sqlite;sqlite.exec('PRAGMA foreign_keys=ON');const directory=new URL('../migrations/',import.meta.url);
 for(const file of readdirSync(directory).filter(file=>file.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(file,directory),'utf8'));
 const db=drizzle(async(query,params,method)=>{const stmt=sqlite.prepare(query);if(method==='run'){stmt.run(...params);return{rows:[]};}stmt.setReturnArrays(true);return{rows:stmt.all(...params) as unknown as unknown[][]};},async statements=>{sqlite.exec('BEGIN');try{const results=statements.map(({sql,params,method})=>{const statement=sqlite.prepare(sql);if(method==='run'){statement.run(...params);return {rows:[]};}statement.setReturnArrays(true);return {rows:statement.all(...params) as unknown as unknown[][]};});sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}},{schema});return{...operators,...schema,db};
});
import {db,user,organization,member,mailDomains,mailboxes,mailThreads,mailMessages,mailLabels,mailThreadLabels,eq} from '@/db';
import {queueRawSend,deliverOutboxJob} from '@/lib/server/mail/outbox';
import {sendSesRaw} from '@/lib/server/ses';
import {nativeMailboxContext,nativeSnapshot,nativeChanges,nativePatch,nativeRemove,cleanupNativeGarbage,nativeImport} from '@/lib/server/mail/native';
import {sha256Hex} from '@/lib/server/crypto';
import type {Mailbox} from '@/lib/server/mail/access';
let box:Mailbox;
vi.mock('@/lib/server/ses',async original=>({...await original<typeof import('@/lib/server/ses')>(),sendSesRaw:vi.fn(async()=> 'provider-smtp-id')}));
vi.mock('cloudflare:email',()=>({EmailMessage:class{constructor(public from:string,public to:string,public raw:ReadableStream){}}}));
vi.mock('@/lib/server/queue',()=>({enqueue:vi.fn(async()=>{})}));
vi.mock('@/lib/server/org',async original=>({...await original<typeof import('@/lib/server/org')>(),requireMailPlan:vi.fn(async()=>{})}));
beforeEach(async()=>{
 state.cfSend.mockReset().mockResolvedValue({messageId:'cf-message-id'});
 vi.mocked(sendSesRaw).mockReset().mockResolvedValue('provider-smtp-id');
 state.sql!.exec('DELETE FROM mail_native_gc; DELETE FROM organization; DELETE FROM user');state.failDelete=false;state.deleted=[];state.files.clear();
 const now=new Date();await db.insert(user).values({id:'person',email:'person@example.test',name:'Person',createdAt:now,updatedAt:now});
 await db.insert(organization).values({id:'org',name:'Org',slug:'org',createdAt:now});await db.insert(member).values({id:'membership',organizationId:'org',userId:'person',role:'member',createdAt:now});
 await db.insert(mailDomains).values({id:'domain',orgId:'org',domain:'example.test'});
 await db.insert(mailboxes).values({id:'box',orgId:'org',domainId:'domain',address:'person@example.test',kind:'personal',userId:'person',uidNext:2,modseq:1});
 await db.insert(mailThreads).values({id:'thread',orgId:'org',mailboxId:'box',contactEmail:'sender@example.test',modseq:1});
 await db.insert(mailMessages).values({id:'message',orgId:'org',mailboxId:'box',threadId:'thread',uid:1,direction:'in',fromEmail:'sender@example.test',messageId:'<native-source@example.test>',rawKey:'mail-raw/org/box/message.eml',storageKeys:['mail-raw/org/box/message.eml']});
 box=(await db.select().from(mailboxes).where(eq(mailboxes.id,'box')))[0];
 const scope=await sha256Hex(JSON.stringify(['org','person']));await nativeMailboxContext(new Request('https://workinbox.test',{headers:{authorization:'Bearer native-test-token','x-workinbox-org':'org','x-workinbox-user':'person','x-workinbox-scope':scope}}),'box');
});
it('captures inserts, flag changes and tombstones in their original database transactions',async()=>{
 const snapshot=await nativeSnapshot(box,0);expect(snapshot.messages).toHaveLength(1);const after=snapshot.head;
 await db.update(mailThreads).set({starred:true}).where(eq(mailThreads.id,'thread'));
 await db.delete(mailMessages).where(eq(mailMessages.id,'message'));
 const changes=await nativeChanges(box,after);expect(changes.changes.length).toBe(2);expect(changes.changes.every(change=>change.message===null)).toBe(true);
 expect(changes.next).toBeGreaterThan(after);expect((await nativeChanges(box,changes.next)).changes).toEqual([]);
});
it('applies native flags atomically and rejects stale web state without changing it',async()=>{
 const original=(await nativeSnapshot(box,0)).messages[0];
 const changed=await nativePatch(box,'message',original.version,{seen:true,starred:true,role:'archive',labels:[]});expect(changed.role).toBe('archive');expect(changed.starred).toBe(true);
 await expect(nativePatch(box,'message',original.version,{seen:false,starred:false,role:'inbox',labels:[]})).rejects.toThrow('Conversation changed');
 const current=(await nativeSnapshot(box,0)).messages[0];expect(current.role).toBe('archive');expect(current.starred).toBe(true);
});
it('expunge moves an inbox conversation to Trash before permanently deleting, with durable R2 cleanup',async()=>{
 const original=(await nativeSnapshot(box,0)).messages[0];const trashed=await nativeRemove(box,'message',original.version);expect(trashed.deleted).toBe(false);
 const current=(await nativeSnapshot(box,0)).messages[0];expect(current.role).toBe('trash');state.failDelete=true;
 expect((await nativeRemove(box,'message',current.version)).deleted).toBe(true);expect((await nativeSnapshot(box,0)).messages).toEqual([]);
 expect(state.sql!.prepare('SELECT id FROM mail_native_gc').all()).toHaveLength(1);state.failDelete=false;await cleanupNativeGarbage();expect(state.deleted).toEqual(['mail-raw/org/box/message.eml']);
 expect(state.sql!.prepare('SELECT id FROM mail_native_gc').all()).toEqual([]);
});
it('refuses a foreign mailbox or forged actor despite a valid service token',async()=>{
 const scope=await sha256Hex(JSON.stringify(['org','person']));const headers={authorization:'Bearer native-test-token','x-workinbox-org':'org','x-workinbox-user':'person','x-workinbox-scope':scope};
 await expect(nativeMailboxContext(new Request('https://workinbox.test',{headers}),'foreign')).rejects.toThrow('Mailbox not found');
 await expect(nativeMailboxContext(new Request('https://workinbox.test',{headers:{...headers,'x-workinbox-user':'other'}}),'box')).rejects.toThrow('Access denied');
 await expect(nativeMailboxContext(new Request('https://workinbox.test',{headers:{...headers,authorization:'Bearer wrong'}}),'box')).rejects.toThrow('Unauthorized');
});

it('replays a native import without duplicating MIME or overwriting later web edits',async()=>{
 const raw=new TextEncoder().encode('From: sender@example.test\r\nTo: person@example.test\r\nSubject: Imported\r\nMessage-ID: <import-native@example.test>\r\n\r\nOriginal MIME body');
 const flags={seen:true,starred:false,role:'inbox' as const,labels:[]};const operation=crypto.randomUUID();const scope=await sha256Hex(JSON.stringify(['org','person']));
 const first=await nativeImport(box,raw,'2026-01-01T00:00:00Z',operation,scope,flags);expect(first.role).toBe('inbox');
 await db.update(mailThreads).set({starred:true}).where(eq(mailThreads.id,first.threadId));
 const replay=await nativeImport(box,raw,'2026-01-01T00:00:00Z',operation,scope,flags);expect(replay.id).toBe(first.id);expect(replay.starred).toBe(true);
 expect(state.sql!.prepare('SELECT id FROM mail_messages WHERE native_import_id=?').all(operation)).toHaveLength(1);
 await expect(nativeImport(box,new TextEncoder().encode('changed body'),'2026-01-01T00:00:00Z',operation,scope,flags)).rejects.toThrow('Import id already used');
});

it('queues SMTP idempotently, preserves MIME, strips Bcc at the provider boundary and uses the existing recipient quota',async()=>{
 await db.update(mailDomains).set({provider:'ses'}).where(eq(mailDomains.id,'domain'));
 const raw=new TextEncoder().encode('From: Person <person@example.test>\r\nTo: visible@example.test\r\nBcc: secret@example.test\r\nSubject: Native SMTP\r\nMessage-ID: <native-smtp@example.test>\r\n\r\nBody stays exactly as submitted');
 const recipients=['visible@example.test','secret@example.test'];
 const first=await queueRawSend(box,raw,recipients,'person'),replay=await queueRawSend(box,raw,recipients,'person');expect(replay.id).toBe(first.id);
 const queued=state.sql!.prepare('SELECT * FROM mail_outbox WHERE id=?').get(first.id) as any;expect(queued.recipient_count).toBe(2);expect(queued.actor_user_id).toBe('person');expect(state.sql!.prepare('SELECT id FROM mail_outbox').all()).toHaveLength(1);
 await expect(queueRawSend(box,new TextEncoder().encode(new TextDecoder().decode(raw)+' changed'),recipients,'person')).rejects.toThrow('Idempotency');
 state.sql!.prepare("UPDATE mail_outbox SET send_at=? WHERE id=?").run(Date.now()-1000,first.id);
 await deliverOutboxJob(first.id);expect(state.sql!.prepare('SELECT status FROM mail_outbox WHERE id=?').get(first.id)).toMatchObject({status:'sent'});
 const call=vi.mocked(sendSesRaw).mock.calls.at(-1)!;expect(call[1]).toEqual(['secret@example.test','visible@example.test']);expect(new TextDecoder().decode(call[2] as Uint8Array)).toBe(new TextDecoder().decode(raw).replace('Bcc: secret@example.test\r\n',''));
 const sent=state.sql!.prepare("SELECT raw_key FROM mail_messages WHERE message_id='<native-smtp@example.test>'").get() as any;expect(state.files.get(sent.raw_key)).toEqual(raw);
});

it('rejects SMTP sender spoofing and rechecks mailbox access before dispatch',async()=>{
 await db.update(mailDomains).set({provider:'ses'}).where(eq(mailDomains.id,'domain'));
 const raw=(from:string)=>new TextEncoder().encode(`From: ${from}\r\nTo: visible@example.test\r\nMessage-ID: <smtp-access@example.test>\r\n\r\nPrivate body`);
 await expect(queueRawSend(box,raw('forged@example.test'),['visible@example.test'],'person')).rejects.toThrow('sender');
 await expect(queueRawSend(box,raw('person@example.test, forged@example.test'),['visible@example.test'],'person')).rejects.toThrow('sender');
 const job=await queueRawSend(box,raw(box.address),['visible@example.test'],'person');
 state.sql!.prepare('UPDATE mail_outbox SET send_at=? WHERE id=?').run(Date.now()-1000,job.id);await db.delete(member).where(eq(member.id,'membership'));
 await deliverOutboxJob(job.id);expect(state.sql!.prepare('SELECT status FROM mail_outbox WHERE id=?').get(job.id)).toMatchObject({status:'failed'});expect(sendSesRaw).not.toHaveBeenCalled();
});

it('retains an uncertain SMTP outcome without automatically resending it',async()=>{
 await db.update(mailDomains).set({provider:'ses'}).where(eq(mailDomains.id,'domain'));
 const raw=new TextEncoder().encode('From: person@example.test\r\nTo: visible@example.test\r\nMessage-ID: <smtp-uncertain@example.test>\r\n\r\nPrivate body');
 const job=await queueRawSend(box,raw,['visible@example.test'],'person');state.sql!.prepare('UPDATE mail_outbox SET send_at=? WHERE id=?').run(Date.now()-1000,job.id);
 vi.mocked(sendSesRaw).mockRejectedValueOnce(new Error('Connection lost after provider acceptance'));
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});try{await deliverOutboxJob(job.id);await deliverOutboxJob(job.id);}finally{error.mockRestore();}
 expect(state.sql!.prepare('SELECT status FROM mail_outbox WHERE id=?').get(job.id)).toMatchObject({status:'uncertain'});expect(sendSesRaw).toHaveBeenCalledTimes(1);expect((await queueRawSend(box,raw,['visible@example.test'],'person')).id).toBe(job.id);
});

it('sends Cloudflare raw MIME to every envelope recipient without exposing Bcc, and never retries a partial outcome',async()=>{
 const raw=new TextEncoder().encode('From: person@example.test\r\nTo: visible@example.test\r\nBcc: secret@example.test\r\nMessage-ID: <cf-smtp@example.test>\r\n\r\nBody');
 const received:{to:string;raw:string}[]=[];state.cfSend.mockImplementation(async(message:any)=>{received.push({to:message.to,raw:await new Response(message.raw).text()});return{messageId:'cf-'+received.length};});
 const job=await queueRawSend(box,raw,['visible@example.test','secret@example.test'],'person');state.sql!.prepare('UPDATE mail_outbox SET send_at=? WHERE id=?').run(Date.now()-1000,job.id);await deliverOutboxJob(job.id);
 expect(state.sql!.prepare('SELECT status FROM mail_outbox WHERE id=?').get(job.id)).toMatchObject({status:'sent'});expect(received.map(mail=>mail.to)).toEqual(['secret@example.test','visible@example.test']);expect(received.every(mail=>!mail.raw.includes('Bcc:'))).toBe(true);expect(sendSesRaw).not.toHaveBeenCalled();
 const second=await queueRawSend(box,new TextEncoder().encode(new TextDecoder().decode(raw).replace('<cf-smtp@','<cf-partial@')),['visible@example.test','secret@example.test'],'person');state.sql!.prepare('UPDATE mail_outbox SET send_at=? WHERE id=?').run(Date.now()-1000,second.id);
 state.cfSend.mockResolvedValueOnce({messageId:'first-accepted'}).mockRejectedValueOnce(new Error('Second recipient outcome lost'));
 const error=vi.spyOn(console,'error').mockImplementation(()=>{});try{await deliverOutboxJob(second.id);await deliverOutboxJob(second.id);}finally{error.mockRestore();}
 expect(state.sql!.prepare('SELECT status FROM mail_outbox WHERE id=?').get(second.id)).toMatchObject({status:'uncertain'});expect(state.cfSend).toHaveBeenCalledTimes(4);
});

it('reports a completed import that was later deleted instead of resurrecting it on retry',async()=>{
 const raw=new TextEncoder().encode('From: sender@example.test\r\nTo: person@example.test\r\nMessage-ID: <deleted-import@example.test>\r\n\r\nBody');
 const flags={seen:true,starred:false,role:'inbox' as const,labels:[]},operation=crypto.randomUUID(),scope=await sha256Hex(JSON.stringify(['org','person']));
 const first=await nativeImport(box,raw,'2026-01-01T00:00:00Z',operation,scope,flags);await db.delete(mailMessages).where(eq(mailMessages.id,first.id));
 await expect(nativeImport(box,raw,'2026-01-01T00:00:00Z',operation,scope,flags)).rejects.toMatchObject({status:410});
});

it.runIf(!!process.env.E2E_HOSTED_ENGINE_URL)('hosted mailbox roundtrip through real Stalwart and IMAP with the actual Workinbox SQL handlers',async()=>{
 const {createRequire}=await import('node:module');const {ImapFlow}=createRequire(new URL('../services/mail-bridge/package.json',import.meta.url))('imapflow');
 const {createServer}=await import('node:tls');const {connect}=await import('node:net');const {once}=await import('node:events');
 const {Accounts}=await import(new URL('../services/mail-bridge/src/accounts.mjs',import.meta.url).href);
 const {EngineAdmin}=await import(new URL('../services/mail-bridge/src/engine-admin.mjs',import.meta.url).href);
 const {HostedMirror}=await import(new URL('../services/mail-bridge/src/hosted-sync.mjs',import.meta.url).href);
 const {ImapGateway}=await import(new URL('../services/mail-bridge/src/imap-gateway.mjs',import.meta.url).href);
 const {POST,GET}=await import('@/pages/api/internal/mail-bridge/mailboxes/[id]/[...path]');
 const {buildEml}=await import('@/lib/mail/mime');const {updateThreads}=await import('@/lib/server/mail/store');
 const original=buildEml({from:{email:'sender@example.test'},to:box.address,subject:'Native source',date:new Date('2026-01-01T00:00:00Z'),messageId:'<native-source@example.test>',text:'Original MIME body',attachments:[{filename:'source.txt',mediaType:'text/plain',content:new TextEncoder().encode('preserved attachment')}]});
 state.files.set('mail-raw/org/box/message.eml',new TextEncoder().encode(original));
 const base=process.env.E2E_HOSTED_ENGINE_URL!,auth=process.env.E2E_HOSTED_ENGINE_AUTH!;
 const transport=(url:any,options:any={})=>fetch(url,{...options,headers:{...options.headers,authorization:options.headers?.authorization?.startsWith('Bearer ')?auth:options.headers?.authorization}});
 const engine=new EngineAdmin({url:base+'/jmap/',token:'test-admin',domainId:'pending',domain:'example.test',imapHost:'localhost'},transport);
 engine.domainId=(await engine.call('x:Domain/query',{filter:{name:'example.test'}})).ids[0];
 const accounts=new Accounts(':memory:','ab'.repeat(32)),scope=await sha256Hex(JSON.stringify(['org','person']));accounts.setOwner(scope,'org','person');
 const connection=accounts.putHosted(scope,box.id,box.address);
 const source=async(url:any,options:any)=>{
   const request=new Request(url,options);const parsed=new URL(url);const path=parsed.pathname.split('/mailboxes/')[1].split('/');
   return (request.method==='GET'?GET:POST)({request,url:parsed,params:{id:path.shift(),path:path.join('/')}} as any);
 };
 const mirror=new HostedMirror(accounts,engine,{url:'https://workinbox.test/api/internal/mail-bridge/authorize',token:'native-test-token',transport:source});
 const key=readFileSync(process.env.E2E_HOSTED_TLS_KEY!),cert=readFileSync(process.env.E2E_HOSTED_TLS_CERT!),sockets=new Set<any>();
 const backend=createServer({key,cert},socket=>{const upstream=connect({host:'127.0.0.1',port:Number(process.env.E2E_HOSTED_IMAP_PORT)});sockets.add(socket);sockets.add(upstream);const close=()=>{socket.destroy();upstream.destroy();sockets.delete(socket);sockets.delete(upstream);};socket.on('error',close);upstream.on('error',close);socket.on('close',close);upstream.on('close',close);socket.pipe(upstream).pipe(socket);});
 backend.listen(0,'127.0.0.1');await once(backend,'listening');const gateway=new ImapGateway({key,cert,host:'127.0.0.1',servername:'localhost',port:(backend.address() as any).port});await gateway.listen(0,'127.0.0.1');
 let native:any,submission:any,smtp:any;
 try{
   await mirror.sync(scope,connection);expect(accounts.hosted(scope,connection).initialized).toBe(1);
   const binding=accounts.binding(scope,connection),password=await engine.createClientPassword(binding,'Hosted E2E',false);engine.onClientRevoked=()=>gateway.disconnectAll();
   native=new ImapFlow({host:'127.0.0.1',port:gateway.server.address().port,secure:true,tls:{servername:'localhost'},auth:{user:binding.username,pass:password.secret},logger:false,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:15000});native.on('error',()=>{});await native.connect();
   await db.insert(mailLabels).values({id:'native-label',mailboxId:'box',name:'Team'});await db.insert(mailThreadLabels).values({threadId:'thread',labelId:'native-label'});await mirror.sync(scope,connection);
   const labelSession=await engine.mail(binding);expect((await labelSession.client.folders()).list.some((folder:any)=>folder.name==='Team [native-label]')).toBe(true);
   await db.update(mailLabels).set({name:'Renamed'}).where(eq(mailLabels.id,'native-label'));await mirror.sync(scope,connection);expect((await labelSession.client.folders()).list.some((folder:any)=>folder.name==='Renamed [native-label]')).toBe(true);
   await db.delete(mailLabels).where(eq(mailLabels.id,'native-label'));
   await mirror.sync(scope,connection);expect((await labelSession.client.folders()).list.filter((folder:any)=>folder.name.endsWith('[native-label]'))).toEqual([]);
   await native.mailboxOpen('INBOX');const ids=[(await native.fetchOne('1',{uid:true})).uid];
   const fetched=await native.fetchOne(String(ids[0]),{source:true},{uid:true});expect(fetched.source.toString()).toBe(original);
   await native.messageFlagsAdd(String(ids[0]),['\\Seen','\\Flagged'],{uid:true});await mirror.sync(scope,connection);
   expect((await db.select().from(mailThreads).where(eq(mailThreads.id,'thread')))[0].starred).toBe(true);
   await updateThreads(['thread'],[box],{archived:true,starred:false});await mirror.sync(scope,connection);
   const session=await engine.mail(binding),folders=(await session.client.folders()).list,archive=folders.find((folder:any)=>folder.role==='archive');expect(archive).toBeTruthy();
   await native.mailboxOpen(archive.name);const archived=[(await native.fetchOne('1',{uid:true})).uid];
   const appended='From: sender@example.test\r\nTo: person@example.test\r\nSubject: Client append\r\nMessage-ID: <native-append@example.test>\r\n\r\nFrom the real client';
   await native.append('INBOX',Buffer.from(appended),['\\Seen']);await mirror.sync(scope,connection);await mirror.sync(scope,connection);
   expect(state.sql!.prepare("SELECT id FROM mail_messages WHERE message_id='<native-append@example.test>'").all()).toHaveLength(1);
   const trash=folders.find((folder:any)=>folder.role==='trash');await native.messageMove(String(archived[0]),trash.name,{uid:true});await mirror.sync(scope,connection);
   expect((await nativeSnapshot(box,0)).messages.find(message=>message.id==='message')!.role).toBe('trash');
   await native.mailboxOpen(trash.name);await native.messageDelete('1:*');await mirror.sync(scope,connection);
   expect(state.sql!.prepare("SELECT id FROM mail_messages WHERE id='message'").get()).toBeUndefined();
   await db.update(mailDomains).set({provider:'ses'}).where(eq(mailDomains.id,'domain'));
   const {Submission}=await import(new URL('../services/mail-bridge/src/submission.mjs',import.meta.url).href);
   engine.imapTarget='127.0.0.1';engine.imapPort=(backend.address() as any).port;
   submission=new Submission({accounts,engine,key,cert,sourceConfig:{url:'https://workinbox.test/api/internal/mail-bridge/authorize',token:'native-test-token',transport:source}});
   submission.setAccepting(true);await submission.listen(0,'127.0.0.1');
   engine.onClientRevoked=()=>{gateway.disconnectAll();submission.disconnectAll();};
   const nodemailer=createRequire(new URL('../services/mail-bridge/package.json',import.meta.url))('nodemailer');
   const smtpOptions={host:'127.0.0.1',port:submission.server.server.address().port,secure:true,tls:{servername:'localhost'},auth:{user:binding.username,pass:password.secret},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000};
   smtp=nodemailer.createTransport(smtpOptions);
   const bad=nodemailer.createTransport({...smtpOptions,auth:{user:binding.username,pass:'wrong-password'}});try{await expect(bad.verify()).rejects.toThrow();}finally{bad.close();}
   const outgoing=buildEml({from:{email:box.address},to:'visible@example.test',subject:'SMTP roundtrip',date:new Date('2026-01-02T00:00:00Z'),messageId:'<smtp-roundtrip@example.test>',text:'Original SMTP body',attachments:[{filename:'smtp.bin',mediaType:'application/octet-stream',content:Uint8Array.of(0,255,128,65)}]});
   await expect(smtp.sendMail({envelope:{from:'forged@example.test',to:['visible@example.test']},raw:outgoing})).rejects.toThrow();
   const submitted=await smtp.sendMail({envelope:{from:box.address,to:['visible@example.test','secret@example.test']},raw:outgoing});expect(submitted.response).toContain('Queued as');
   await smtp.sendMail({envelope:{from:box.address,to:['visible@example.test','secret@example.test']},raw:outgoing});
   const jobs=state.sql!.prepare('SELECT id FROM mail_outbox').all() as any[];expect(jobs).toHaveLength(1);
   const sentFolder=folders.find((folder:any)=>folder.role==='sent');await native.append(sentFolder.name,Buffer.from('Bcc: secret@example.test\r\n'+outgoing),['\\Seen']);await mirror.sync(scope,connection);
   state.sql!.prepare('UPDATE mail_outbox SET send_at=? WHERE id=?').run(Date.now()-1000,jobs[0].id);await deliverOutboxJob(jobs[0].id);
   expect(state.sql!.prepare('SELECT status FROM mail_outbox WHERE id=?').get(jobs[0].id)).toMatchObject({status:'sent'});
   expect(state.sql!.prepare("SELECT id FROM mail_messages WHERE message_id='<smtp-roundtrip@example.test>'").all()).toHaveLength(1);
   expect(new TextDecoder().decode(vi.mocked(sendSesRaw).mock.calls.at(-1)![2] as Uint8Array)).toBe(outgoing);
   await mirror.sync(scope,connection);
   await expect(native.mailboxCreate('client-created')).rejects.toThrow();
   const {nativeBrowser}=await import('./helpers/native-browser');await nativeBrowser({accounts,engine,key,cert});
   await engine.revokeClientPasswords(binding);
   await expect(smtp.verify()).rejects.toThrow();
 }finally{smtp?.close();await submission?.close();native?.close();await gateway.close();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>backend.close(()=>resolve()));accounts.close();}
},120000);
