import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Accounts } from '../src/accounts.mjs';
import { ImapImports, imapImportSchema, imapImportRoutes } from '../src/imap-import.mjs';
import { SourceError } from '../src/root-mail.mjs';

const input = () => ({ id: randomUUID(), mailboxId: randomUUID(), imap: { host: 'imap.example.com', port: 993, username: 'anna', password: 'source-secret' } });
function fixture(count = 1) {
  const accounts = new Accounts(':memory:', 'ab'.repeat(32));
  const state = { validity: 12n, count, gap: 0, copies: new Map(), calls: [], connections: 0, denied: false, failCopy: false, failAfterCopy: false, seen: false, size: 80 };
  const options = {
    resolveHost: async host => { assert.equal(host,'imap.example.com'); return '8.8.8.8'; },
    client: options => {
      assert.equal(options.host,'8.8.8.8'); assert.equal(options.tls.servername,'imap.example.com'); assert.equal(options.tls.rejectUnauthorized,true);
      return { on() {}, close() {}, async connect() { state.connections++; },
        async list() { return [{path:'INBOX',specialUse:'\\Inbox',flags:new Set()}, {path:'Drafts',specialUse:'\\Drafts',flags:new Set()}, {path:'Parent',flags:new Set(['\\Noselect'])}]; },
        async mailboxOpen(path, options) { assert.equal(path,'INBOX'); assert.deepEqual(options,{readOnly:true}); return { uidValidity:state.validity,uidNext:state.count+state.gap+1,exists:state.count }; },
        async fetchOne(sequence) { return {uid:Number(sequence)+state.gap}; },
        async fetchAll(range, query, options) {
          assert.equal(query.source,undefined); assert.deepEqual(options,{uid:true});
          const [start,end] = range.split(':').map(Number);
          const first=Math.max(start,state.gap+1);
          return Array.from({length:Math.max(0,Math.min(end,state.count+state.gap)-first+1)},(_,n)=>({uid:first+n,size:state.size,internalDate:new Date('2020-01-02T03:04:05Z'),flags:new Set(state.seen?['\\Seen','\\Flagged']:[])}));
        },
        async download(uid, part, options) { assert.equal(part,undefined); assert.equal(options.uid,true); return {content:Readable.from([Buffer.from(`Message ${uid}`)])}; },
      };
    },
    source: () => ({ async json(path, method, raw) {
      if(state.denied) throw new SourceError(403,path);
      if(path==='folders') return {address:'anna@workinbox.test'};
      state.calls.push({path,method});
      if(path.startsWith('import?')) {
        const query = new URLSearchParams(path.split('?')[1]);
        const id = query.get('id');
        const payload = {raw:String(raw),date:query.get('receivedAt'),flags:JSON.parse(query.get('flags'))};
        if(state.failCopy) throw new SourceError(507,path);
        if(state.copies.has(id)) assert.deepEqual(state.copies.get(id),payload);
        state.copies.set(id,payload);
        if(state.failAfterCopy) throw new Error('response lost');
      }
      return {ok:true};
    } }),
  };
  const imports = new ImapImports(accounts,{},options);
  const run = async (scope,id) => { await imports.run(imports.get(scope,id)); };
  const finish = async (scope,id) => {
    for(let n=0;n<20;n++) { if(!['queued','running'].includes(imports.get(scope,id).status)) return; await run(scope,id); }
    assert.fail('Import did not finish');
  };
  return {accounts,imports,state,options,run,finish};
}

test('finite, batched import passes 200 messages, preserves metadata and removes encrypted credentials',async()=>{
  const f=fixture(205), data=input();
  try {
    await f.imports.create('alice',data);
    assert.equal(f.imports.get('alice',data.id).encrypted.includes('source-secret'),false);
    assert.equal(JSON.stringify(f.imports.list('alice')).includes('source-secret'),false);
    assert.deepEqual(f.imports.list('bob'),[]);
    await f.run('alice',data.id);
    assert.equal(f.imports.get('alice',data.id).copied,100);
    f.state.count=210; // Arrivals after the snapshot are left for normal mail delivery.
    await f.finish('alice',data.id);
    const row=f.imports.get('alice',data.id);
    assert.equal(row.status,'done'); assert.equal(row.copied,205); assert.equal(row.encrypted,null);
    assert.equal(row.total,205);
    assert.equal(f.state.copies.size,205);
    assert.deepEqual([...f.state.copies.values()][0],{raw:'Message 1',date:'2020-01-02T03:04:05.000Z',flags:{seen:false,starred:false,role:'inbox',labels:[]}});
  } finally { await f.imports.stop(); f.accounts.close(); }
});

test('lost response and restart replay the same receipt and flags without duplicating a copy',async()=>{
  const f=fixture(),data=input();
  let restarted;
  try {
    await f.imports.create('alice',data); f.state.failAfterCopy=true;
    await f.run('alice',data.id);
    assert.equal(f.imports.get('alice',data.id).status,'failed'); assert.equal(f.imports.get('alice',data.id).uid,0);
    const pending=f.imports.get('alice',data.id).pending;
    f.state.failAfterCopy=false; f.state.seen=true;
    // A crashed worker leaves the running state; startup requeues it with its pending receipt.
    f.accounts.db.prepare("UPDATE imap_imports SET status='running' WHERE id=?").run(data.id);
    restarted=new ImapImports(f.accounts,{},f.options);
    assert.equal(restarted.get('alice',data.id).status,'queued'); assert.equal(restarted.get('alice',data.id).pending,pending);
    await restarted.run(restarted.get('alice',data.id));
    assert.equal(f.state.copies.size,1); assert.equal(restarted.get('alice',data.id).copied,1);
  } finally { await restarted?.stop(); await f.imports.stop(); f.accounts.close(); }
});

test('full destination stops without advancing, and can resume after space is freed',async()=>{
  const f=fixture(),data=input();
  try {
    await f.imports.create('alice',data); f.state.failCopy=true; await f.run('alice',data.id);
    let row=f.imports.get('alice',data.id);
    assert.equal(row.status,'failed'); assert.equal(row.uid,0); assert.match(row.error,/mailbox is full/); assert.ok(row.encrypted);
    f.imports.retry('bob',data.id); assert.equal(f.imports.get('alice',data.id).status,'failed');
    f.state.failCopy=false; f.imports.retry('alice',data.id); await f.finish('alice',data.id);
    assert.equal(f.imports.get('alice',data.id).status,'done'); assert.equal(f.state.copies.size,1);
  } finally { await f.imports.stop(); f.accounts.close(); }
});

test('UIDVALIDITY changes fail safely, and cancelling deletes credentials without deleting copies',async()=>{
  const f=fixture(101),data=input();
  try {
    await f.imports.create('alice',data); await f.run('alice',data.id); f.state.validity=13n;
    await f.run('alice',data.id);
    assert.equal(f.imports.get('alice',data.id).status,'failed'); assert.match(f.imports.get('alice',data.id).error,/identity changed/);
    await f.imports.cancel('bob',data.id); assert.ok(f.imports.get('alice',data.id).encrypted);
    await f.imports.cancel('alice',data.id);
    assert.equal(f.imports.get('alice',data.id).status,'cancelled'); assert.equal(f.imports.get('alice',data.id).encrypted,null);
    assert.equal(f.state.copies.size,100);
  } finally { await f.imports.stop(); f.accounts.close(); }
});

test('oversized messages are counted and skipped, never downloaded or silently marked copied',async()=>{
  const f=fixture(),data=input();
  try {
    f.state.size=26*1024*1024; await f.imports.create('alice',data); await f.finish('alice',data.id);
    const row=f.imports.get('alice',data.id); assert.equal(row.skipped,1); assert.equal(row.copied,0); assert.equal(row.status,'done');
  } finally { await f.imports.stop(); f.accounts.close(); }
});

test('access is checked before credentials are saved and again before source login',async()=>{
  const f=fixture(),data=input();
  try {
    f.state.denied=true; await assert.rejects(f.imports.create('alice',data)); assert.equal(f.imports.get('alice',data.id),undefined);
    f.state.denied=false; await f.imports.create('alice',data); f.state.denied=true; await f.run('alice',data.id);
    assert.equal(f.state.connections,0); assert.equal(f.imports.get('alice',data.id).status,'cancelled');
    assert.equal(f.imports.get('alice',data.id).encrypted,null);
    assert.equal(JSON.stringify(f.imports.list('alice')).includes('source-secret'),false);
  } finally { await f.imports.stop(); f.accounts.close(); }
});

test('import creation is idempotent, requires secure IMAP and needs no SMTP credentials',async()=>{
  const f=fixture(),data=input();
  try {
    assert.equal(imapImportSchema.safeParse(data).success,true);
    assert.equal(imapImportSchema.safeParse({...data,imap:{...data.imap,port:143}}).success,false);
    await f.imports.create('alice',data); await f.imports.create('alice',data); assert.equal(f.imports.list('alice').length,1);
    const original=f.imports.get('alice',data.id).encrypted;
    await f.imports.create('alice',{...data,imap:{...data.imap,password:'changed'}});
    assert.equal(f.imports.get('alice',data.id).encrypted,original);
  } finally { await f.imports.stop(); f.accounts.close(); }
});

test('large UID gaps do not require millions of empty batches',async()=>{
  const f=fixture(101),data=input();
  try {
    f.state.gap=2000000000;
    await f.imports.create('alice',data); await f.finish('alice',data.id);
    assert.equal(f.imports.get('alice',data.id).status,'done');
    assert.equal(f.state.copies.size,101); assert.equal(f.state.connections,2);
  } finally { await f.imports.stop(); f.accounts.close(); }
});

test('progress counts skipped mail and ETA waits for a useful sample, then resets after a resume',async()=>{
  const f=fixture(205),data=input();
  try {
    await f.imports.create('alice',data);
    assert.equal(f.imports.list('alice')[0].total,null);
    assert.equal(f.imports.list('alice')[0].etaSeconds,null);
    await f.run('alice',data.id);
    f.accounts.db.prepare('UPDATE imap_imports SET copied=90,skipped=10,elapsed_ms=40000 WHERE id=?').run(data.id);
    let progress=f.imports.list('alice')[0];
    assert.equal(progress.total,205); assert.equal(progress.etaSeconds,42);
    assert.equal('elapsed_ms' in progress,false); assert.equal('estimate_from' in progress,false);
    f.accounts.db.prepare('UPDATE imap_imports SET elapsed_ms=20000 WHERE id=?').run(data.id);
    assert.equal(f.imports.list('alice')[0].etaSeconds,null);
    f.accounts.db.prepare("UPDATE imap_imports SET status='failed',elapsed_ms=40000 WHERE id=?").run(data.id);
    assert.equal(f.imports.list('alice')[0].etaSeconds,null);
    f.imports.retry('alice',data.id);
    assert.equal(f.imports.get('alice',data.id).estimate_from,100);
    assert.equal(f.imports.list('alice')[0].etaSeconds,null);
    f.accounts.db.prepare('UPDATE imap_imports SET copied=110,elapsed_ms=40000 WHERE id=?').run(data.id);
    assert.equal(f.imports.list('alice')[0].etaSeconds,170);
    f.accounts.db.prepare('UPDATE imap_imports SET copied=300 WHERE id=?').run(data.id);
    assert.equal(f.imports.list('alice')[0].etaSeconds,null);
  } finally { await f.imports.stop(); f.accounts.close(); }
});

test('progress migrates an existing import database without changing its durable checkpoint',async()=>{
  const f=fixture(205),data=input(); let restarted;
  try {
    await f.imports.create('alice',data); await f.run('alice',data.id);
    f.accounts.db.exec('ALTER TABLE imap_imports DROP COLUMN total; ALTER TABLE imap_imports DROP COLUMN elapsed_ms; ALTER TABLE imap_imports DROP COLUMN estimate_from');
    restarted=new ImapImports(f.accounts,{},f.options);
    const row=restarted.get('alice',data.id);
    assert.equal(row.uid,100); assert.equal(row.copied,100); assert.ok(row.encrypted);
    assert.equal(restarted.list('alice')[0].total,null); assert.equal(restarted.list('alice')[0].etaSeconds,null);
    f.state.count=210; // Recount only the saved snapshot, excluding later arrivals.
    await restarted.run(row);
    assert.equal(restarted.get('alice',data.id).copied,200);
    assert.equal(restarted.get('alice',data.id).total,205);
  } finally { await restarted?.stop(); await f.imports.stop(); f.accounts.close(); }
});

test('custom folders become labels and Inbox is copied before archive, spam and trash',async()=>{
  const f=fixture(),data=input();
  const baseClient=f.options.client;
  f.imports.client=options=>{
    const client=baseClient(options);
    client.list=async()=>[
      {path:'Archive',specialUse:'\\Archive',flags:new Set()},
      {path:'Projects',flags:new Set()},
      {path:'INBOX',specialUse:'\\Inbox',flags:new Set()},
      {path:'Spam',specialUse:'\\Junk',flags:new Set()},
      {path:'Trash',specialUse:'\\Trash',flags:new Set()},
    ];
    client.mailboxOpen=async(_path,options)=>{
      assert.deepEqual(options,{readOnly:true}); return {uidValidity:12n,uidNext:2,exists:1};
    };
    return client;
  };
  try {
    await f.imports.create('alice',data); await f.finish('alice',data.id);
    const copies=[...f.state.copies.values()];
    assert.deepEqual(copies.map(copy=>copy.flags.role),['inbox','archive','archive','junk','trash']);
    assert.equal(copies[1].flags.labels.length,1);
    assert.equal(f.state.calls.some(call=>call.path===`folders/${copies[1].flags.labels[0]}`),true);
    assert.equal(f.imports.get('alice',data.id).encrypted,null);
  } finally { await f.imports.stop(); f.accounts.close(); }
});

test('routes expose configuration, validate requests and isolate job actions by scope',async()=>{
  const f=fixture(),data=input(); let response;
  const send=(status,body)=>{response={status,body};};
  const request=(method,body)=>Object.assign(Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]),{method});
  try {
    await imapImportRoutes({imports:null,scope:'alice',req:request('GET'),send}); assert.deepEqual(response,{status:200,body:{configured:false,imports:[]}});
    await imapImportRoutes({imports:f.imports,scope:'alice',req:request('POST',{}),send}); assert.equal(response.status,422);
    await imapImportRoutes({imports:f.imports,scope:'alice',req:request('POST',data),send}); assert.equal(response.status,202);
    await imapImportRoutes({imports:f.imports,scope:'bob',id:data.id,req:request('DELETE'),send}); assert.equal(response.status,404);
    assert.ok(f.imports.get('alice',data.id).encrypted);
    await imapImportRoutes({imports:f.imports,scope:'alice',id:data.id,req:request('DELETE'),send}); assert.equal(response.status,200);
  } finally { await f.imports.stop(); f.accounts.close(); }
});
