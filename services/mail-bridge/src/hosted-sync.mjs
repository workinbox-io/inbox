import { randomUUID } from 'node:crypto';
import { EngineIndex } from './engine-sync.mjs';
import { RootMail, SourceError, boundedBytes } from './root-mail.mjs';
import { sameSubmission } from '../../../src/lib/mail/submission.ts';
import { draftKeyOfRaw } from '../../../src/lib/mail/draft-key.ts';

const flags = value => ({seen:value.seen,starred:value.starred,role:value.role,labels:[...value.labels].sort()});
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
/** The canonical mailbox stays in Workinbox. Checkpoints follow durable imports and conditional writes. */
export class HostedMirror {
  constructor(accounts,engine,config) {
    this.accounts=accounts;this.db=accounts.db;this.engine=engine;this.config=config;this.index=new EngineIndex(this.db);
    this.db.exec(`CREATE TABLE IF NOT EXISTS hosted_pending(scope TEXT NOT NULL,connection_id TEXT NOT NULL,engine_id TEXT NOT NULL,import_id TEXT NOT NULL UNIQUE,flags TEXT NOT NULL,PRIMARY KEY(scope,connection_id,engine_id));
      CREATE TABLE IF NOT EXISTS hosted_mapping(scope TEXT NOT NULL,connection_id TEXT NOT NULL,root_id TEXT NOT NULL,engine_id TEXT NOT NULL,root TEXT NOT NULL,engine TEXT NOT NULL,PRIMARY KEY(scope,connection_id,root_id),UNIQUE(scope,connection_id,engine_id));
      CREATE TABLE IF NOT EXISTS hosted_drafts(scope TEXT NOT NULL,connection_id TEXT NOT NULL,key TEXT NOT NULL,engine_id TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(scope,connection_id,key),UNIQUE(scope,connection_id,engine_id));
      CREATE TABLE IF NOT EXISTS hosted_folders(scope TEXT NOT NULL,connection_id TEXT NOT NULL,root_id TEXT NOT NULL,engine_id TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(scope,connection_id,root_id),UNIQUE(scope,connection_id,engine_id));`);
  }
  async sync(scope,id,signal) {
    const profile=this.accounts.hosted(scope,id);if(!profile?.active)return;
    const source=new RootMail(this.accounts,scope,profile.mailbox_id,{...this.config,signal},this.config.transport);
    const sourceFolders=await source.json('folders');
    if(sourceFolders.address!==profile.address)this.db.prepare('UPDATE hosted_accounts SET address=? WHERE scope=? AND id=?').run(sourceFolders.address,scope,id);
    const binding=await this.engine.ensure(this.accounts,scope,id);
    await this.engine.setDiskQuota(this.accounts,scope,id,binding,sourceFolders.quotaBytes);
    const session=await this.engine.mail(binding),client=session.client;
    const check=()=>signal?.throwIfAborted();
    const saved=rootId=>this.db.prepare('SELECT * FROM hosted_mapping WHERE scope=? AND connection_id=? AND root_id=?').get(scope,id,rootId);
    const save=(root,email)=>this.db.prepare('INSERT INTO hosted_mapping VALUES (?,?,?,?,?,?) ON CONFLICT(scope,connection_id,root_id) DO UPDATE SET engine_id=excluded.engine_id,root=excluded.root,engine=excluded.engine').run(scope,id,root.id,email.id,JSON.stringify(root),JSON.stringify(comparable(email)));
    const forget=rootId=>this.db.prepare('DELETE FROM hosted_mapping WHERE scope=? AND connection_id=? AND root_id=?').run(scope,id,rootId);
    const roles=new Map(),labels=new Map();
    let engineFolders=(await client.folders()).list;
    for(const role of ['inbox','sent','archive','trash','junk']) {
      let folder=engineFolders.find(folder=>folder.role===role);
      if(!folder) {const folderId=await client.createFolder(role==='archive'?'Archive':role==='junk'?'Spam':role,null,role);folder={id:folderId,role,name:role};}
      roles.set(role,folder.id);
    }
    const draftsFolder=engineFolders.find(folder=>folder.role==='drafts')?.id??await client.createFolder('Drafts',null,'drafts');
    for(const label of sourceFolders.folders) {
      let stored=this.db.prepare('SELECT * FROM hosted_folders WHERE scope=? AND connection_id=? AND root_id=?').get(scope,id,label.id);
      if(!stored) {
        // Reconcile a lost create reply by name before creating another folder.
        const name=`${label.name} [${label.id}]`;
        const existing=engineFolders.find(folder=>folder.name===name&&!folder.role);
        const engineId=existing?.id??await client.createFolder(name);
        this.db.prepare('INSERT INTO hosted_folders VALUES (?,?,?,?,?)').run(scope,id,label.id,engineId,label.name);
        stored={engine_id:engineId};
      }else if(stored.name!==label.name) {
        const fresh=await client.folders();await client.renameFolder(stored.engine_id,`${label.name} [${label.id}]`,fresh.state);
        this.db.prepare('UPDATE hosted_folders SET name=? WHERE scope=? AND connection_id=? AND root_id=?').run(label.name,scope,id,label.id);
      }
      labels.set(label.id,stored.engine_id);
    }
    const comparable=email=>{
      const role=['trash','junk','inbox','sent','archive'].find(role=>email.mailboxIds[roles.get(role)])??'archive';
      return {seen:!!email.keywords.$seen,starred:!!email.keywords.$flagged,role,labels:[...labels].filter(([,engineId])=>email.mailboxIds[engineId]).map(([rootId])=>rootId).sort()};
    };
    const mailboxIds=root=>Object.fromEntries([roles.get(root.role),...root.labels.map(label=>labels.get(label))].filter(Boolean).map(id=>[id,true]));
    const update=async(email,root)=>{
      const fresh=await client.emails([email.id]),current=fresh.list[0];
      if(!current || !same(comparable(current),comparable(email)) || !same(Object.keys(current.mailboxIds).sort(),Object.keys(email.mailboxIds).sort()))throw new Error('Native mailbox changed; retry');
      const keywords={...current.keywords};if(root.seen)keywords.$seen=true;else delete keywords.$seen;if(root.starred)keywords.$flagged=true;else delete keywords.$flagged;
      const folders=mailboxIds(root);
      await client.update(email.id,{keywords,mailboxIds:folders},fresh.state);
      return{...current,keywords,mailboxIds:folders};
    };
    const push=async root=>{
      check();const previous=saved(root.id);
      if(root.importId && this.db.prepare('SELECT 1 FROM hosted_pending WHERE scope=? AND connection_id=? AND import_id=?').get(scope,id,root.importId))return;
      let email;
      if(previous)email=(await client.emails([previous.engine_id])).list[0];
      if(previous && same(JSON.parse(previous.root),root)) return;
      if(!email) {
        const marked=await client.query(0,2,{hasKeyword:`wi-hosted-${root.id}`});
        if(marked.ids.length>1)throw new Error('Duplicate native source marker');
        if(marked.ids.length)email=(await client.emails(marked.ids)).list[0];
      }
      if(!email) {
        let raw;try{raw=await source.raw(root.id);}catch(error){if(error instanceof SourceError&&error.status===404)return;throw error;}
        const imported=await client.importMessage(session.uploadUrl,raw,roles.get(root.role),root.receivedAt,{['wi-hosted-'+root.id]:true,...(root.seen?{$seen:true}:{}),...(root.starred?{$flagged:true}:{})});
        email=(await client.emails([imported.id])).list[0];
        if(!email)throw new Error('Imported native copy unavailable');
      }
      if(!same(comparable(email),flags(root)) || !same(Object.keys(email.mailboxIds).sort(),Object.keys(mailboxIds(root)).sort()))email=await update(email,root);
      save(root,email);
    };
    const remove=async rootId=>{
      const previous=saved(rootId);if(!previous)return;
      const fresh=await client.emails([previous.engine_id]);
      if(fresh.list.length)await client.remove(previous.engine_id,fresh.state);
      forget(rootId);
    };
    if(profile.phase==='seed') {
      const first=await source.json('snapshot?after=0');
      this.db.prepare("UPDATE hosted_accounts SET phase='backfill',cursor=?,upper_uid=?,uid_validity=?,after_uid=0 WHERE scope=? AND id=?").run(first.head,first.upperUid,first.uidValidity,scope,id);
    }
    let current=this.accounts.hosted(scope,id);
    let copied=0;
    while(current.phase==='backfill') {
      check();const page=await source.json(`snapshot?after=${current.after_uid}&upper=${current.upper_uid}`);
      if(page.uidValidity!==current.uid_validity)throw new Error('Source UIDVALIDITY changed; retain the old copy');
      for(const root of page.messages){await push(root);this.db.prepare('UPDATE hosted_accounts SET after_uid=? WHERE scope=? AND id=?').run(root.uid,scope,id);if(++copied>=20)return;}
      if(!page.hasMore)this.db.prepare("UPDATE hosted_accounts SET phase='delta' WHERE scope=? AND id=?").run(scope,id);
      current=this.accounts.hosted(scope,id);
    }
    let caughtUp=false;
    for(let page=0;page<10;page++) {
      check();const delta=await source.json(`changes?after=${current.cursor}`);
      if(delta.uidValidity!==current.uid_validity)throw new Error('Source UIDVALIDITY changed; retain the old copy');
      for(const event of delta.changes){if(event.message)await push(event.message);else await remove(event.id);this.db.prepare('UPDATE hosted_accounts SET cursor=? WHERE scope=? AND id=?').run(event.seq,scope,id);}
      this.db.prepare('UPDATE hosted_accounts SET cursor=? WHERE scope=? AND id=?').run(delta.next,scope,id);
      current=this.accounts.hosted(scope,id);if(!delta.hasMore){caughtUp=true;break;}
    }
    await this.index.sync(scope,binding.accountId,client);
    let after='';
    while(true) {
      check();const rows=this.db.prepare('SELECT id,message FROM engine_messages WHERE scope=? AND account_id=? AND id>? ORDER BY id LIMIT 100').all(scope,binding.accountId,after);if(!rows.length)break;
      for(const row of rows) {
        check();after=row.id;let email=JSON.parse(row.message);
        const mapping=this.db.prepare('SELECT * FROM hosted_mapping WHERE scope=? AND connection_id=? AND engine_id=?').get(scope,id,email.id);
        if(mapping) {
          const previous=JSON.parse(mapping.root),native=comparable(email);
          if(!same(native,JSON.parse(mapping.engine))) {
            let root;
            try{root=await source.json(`messages/${previous.id}`,'POST',{expected:previous.version,flags:native});}
            catch(error){if(error instanceof SourceError&&[404,409].includes(error.status))continue;throw error;}
            email=await update(email,root);save(root,email);
          }
        } else {
          if(email.keywords.$draft || engineFolders.some(folder=>folder.role==='drafts'&&email.mailboxIds[folder.id]))continue;
          if(Object.keys(email.keywords).some(key=>key.startsWith('wi-hosted-')))continue;
          let pending=this.db.prepare('SELECT * FROM hosted_pending WHERE scope=? AND connection_id=? AND engine_id=?').get(scope,id,email.id);
          if(!pending){this.db.prepare('INSERT INTO hosted_pending VALUES (?,?,?,?,?)').run(scope,id,email.id,randomUUID(),JSON.stringify(comparable(email)));pending=this.db.prepare('SELECT * FROM hosted_pending WHERE scope=? AND connection_id=? AND engine_id=?').get(scope,id,email.id);}
          const raw=await boundedBytes((await client.raw(session.downloadUrl,email.blobId)).body);
          let root;
          try{root=await source.json(`import?receivedAt=${encodeURIComponent(email.receivedAt)}&id=${pending.import_id}&flags=${encodeURIComponent(pending.flags)}`,'POST',raw);}
          catch(error){
            if(!(error instanceof SourceError&&error.status===410))throw error;
            const fresh=await client.emails([email.id]);if(fresh.list.length)await client.remove(email.id,fresh.state);
            this.db.prepare('DELETE FROM hosted_pending WHERE scope=? AND connection_id=? AND engine_id=?').run(scope,id,email.id);continue;
          }
          const duplicate=saved(root.id);
          if(duplicate && duplicate.engine_id!==email.id){
            if(!sameSubmission(raw,await source.raw(root.id)))throw new Error('Conflicting native copy retained; identical Message-ID has different MIME');
            const canonical=(await client.emails([duplicate.engine_id])).list[0];
            if(canonical){const normalized=await update(canonical,root);const redundant=await client.emails([email.id]);if(redundant.list.length)await client.remove(email.id,redundant.state);save(root,normalized);this.db.prepare('DELETE FROM hosted_pending WHERE scope=? AND connection_id=? AND engine_id=?').run(scope,id,email.id);continue;}
          }
          email=await update(email,root);
          const fresh=await client.emails([email.id]);await client.update(email.id,{[`keywords/wi-hosted-${root.id}`]:true},fresh.state);
          this.db.exec('BEGIN IMMEDIATE');try{save(root,email);this.db.prepare('DELETE FROM hosted_pending WHERE scope=? AND connection_id=? AND engine_id=?').run(scope,id,email.id);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
        }
      }
    }
    await this.syncDrafts(scope,id,{client,session,source,draftsFolder,check});
    // Confirm actual expunges; a missing item in an interrupted index cannot delete canonical mail.
    for(const mapping of this.db.prepare('SELECT * FROM hosted_mapping m WHERE scope=? AND connection_id=? AND NOT EXISTS(SELECT 1 FROM engine_messages e WHERE e.scope=m.scope AND e.account_id=? AND e.id=m.engine_id)').all(scope,id,binding.accountId)) {
      check();if((await client.emails([mapping.engine_id])).list.length)continue;
      const previous=JSON.parse(mapping.root);
      try{const result=await source.json(`messages/${previous.id}`,'POST',{expected:previous.version,remove:true});forget(previous.id);if(!result.deleted)await push(result.message);}
      catch(error){if(!(error instanceof SourceError&&[404,409].includes(error.status)))throw error;}
    }
    if(caughtUp){
      for(const folder of this.db.prepare('SELECT * FROM hosted_folders WHERE scope=? AND connection_id=?').all(scope,id))if(!labels.has(folder.root_id)) {
        const fresh=await client.folders();
        if(fresh.list.some(item=>item.id===folder.engine_id)) {
          const remaining=await client.query(0,1,{inMailbox:folder.engine_id});
          if(remaining.ids.length)continue;
          await client.removeFolder(folder.engine_id,fresh.state);
        }
        this.db.prepare('DELETE FROM hosted_folders WHERE scope=? AND connection_id=? AND root_id=?').run(scope,id,folder.root_id);
      }
      this.db.prepare('UPDATE hosted_accounts SET initialized=1,synced_at=?,error=NULL WHERE scope=? AND id=?').run(Date.now(),scope,id);
    }
  }
}

const draftMarker=(key,updatedAt)=>`wi-draft-${key}-${updatedAt}`;
const ownDraft=keywords=>{for(const keyword of Object.keys(keywords)){const match=/^wi-draft-(.+)-(\d+)$/.exec(keyword);if(match)return{key:match[1],updatedAt:Number(match[2])};}return null;};

/**
 * Drafts both ways: Workinbox keeps each person's drafts (canonical, versioned by updatedAt); the Drafts folder holds a
 * copy of each, marked wi-draft-<key>-<updatedAt>. IMAP apps never edit in place: a re-save is a new message plus an
 * expunge, paired back to its draft by the X-Workinbox-Draft header. Writes carry the version last seen, so a 409
 * keeps both edits (the app's as a new draft) instead of overwriting one.
 */
HostedMirror.prototype.syncDrafts=async function(scope,id,{client,session,source,draftsFolder,check}) {
  const rows=()=>this.db.prepare('SELECT * FROM hosted_drafts WHERE scope=? AND connection_id=?').all(scope,id);
  const keep=(key,engineId,updatedAt)=>{
    this.db.prepare('DELETE FROM hosted_drafts WHERE scope=? AND connection_id=? AND engine_id=? AND key<>?').run(scope,id,engineId,key);
    this.db.prepare('INSERT INTO hosted_drafts VALUES (?,?,?,?,?) ON CONFLICT(scope,connection_id,key) DO UPDATE SET engine_id=excluded.engine_id,updated_at=excluded.updated_at').run(scope,id,key,engineId,updatedAt);
  };
  const forget=key=>this.db.prepare('DELETE FROM hosted_drafts WHERE scope=? AND connection_id=? AND key=?').run(scope,id,key);
  const drop=async engineId=>{const fresh=await client.emails([engineId]);if(fresh.list.length)await client.remove(engineId,fresh.state);};
  const root=new Map((await source.json('drafts')).drafts.map(draft=>[draft.key,draft.updatedAt]));
  const ids=[];let complete=false;
  for(let position=0;position<1000;position+=100){check();const page=await client.query(position,100,{inMailbox:draftsFolder});ids.push(...page.ids);if(page.ids.length<100){complete=true;break;}}
  const native=ids.length?(await client.emails(ids)).list:[];
  // Our own copy whose mapping write was lost: adopt the newest, drop older duplicates.
  for(const email of native) {
    const own=ownDraft(email.keywords);if(!own||rows().some(row=>row.engine_id===email.id))continue;
    const mapped=rows().find(row=>row.key===own.key);
    if(mapped&&mapped.updated_at>=own.updatedAt){await drop(email.id);continue;}
    if(mapped)await drop(mapped.engine_id);
    keep(own.key,email.id,own.updatedAt);
  }
  const live=new Set(native.map(email=>email.id)),mapped=rows();
  const known=new Set(mapped.map(row=>row.engine_id));
  // A mapped copy that left the folder was edited (re-saved below), sent or discarded in the app.
  const gone=new Map(mapped.filter(row=>!live.has(row.engine_id)).map(row=>[row.key,row]));
  for(const email of native) {
    if(known.has(email.id)||ownDraft(email.keywords))continue;
    check();
    const raw=await boundedBytes((await client.raw(session.downloadUrl,email.blobId)).body);
    const key=draftKeyOfRaw(raw),previous=key?gone.get(key):undefined;
    let saved;
    try{saved=previous?await source.json(`drafts?key=${previous.key}&expected=${previous.updated_at}`,'POST',raw):await source.json('drafts','POST',raw);}
    catch(error){
      if(!(error instanceof SourceError))throw error;
      // Changed or removed in Work Inbox meanwhile: keep this edit as a draft of its own.
      if(previous&&[404,409].includes(error.status))saved=await source.json('drafts','POST',raw);
      // shortcut: a draft Work Inbox can't hold (too many or unsupported files) stays in the mail app only; retried each run.
      else if([413,415,422].includes(error.status))continue;
      else throw error;
    }
    if(previous&&saved.key===previous.key)gone.delete(previous.key);
    const fresh=await client.emails([email.id]);if(!fresh.list.length)continue;
    await client.update(email.id,{[`keywords/${draftMarker(saved.key,saved.updatedAt)}`]:true},fresh.state);
    keep(saved.key,email.id,saved.updatedAt);root.set(saved.key,saved.updatedAt);
  }
  // A partial folder listing must never delete drafts.
  if(complete)for(const row of gone.values()) {
    check();
    try{await source.json(`drafts/${row.key}?expected=${row.updated_at}`,'DELETE');root.delete(row.key);}
    catch(error){if(!(error instanceof SourceError&&[404,409].includes(error.status)))throw error;}
    forget(row.key);
  }
  for(const [key,updatedAt] of root) {
    const row=rows().find(item=>item.key===key);if(row&&row.updated_at===updatedAt)continue;
    check();
    let raw;try{raw=await boundedBytes((await source.request(`drafts/${key}/raw`)).body);}catch(error){if(error instanceof SourceError&&error.status===404)continue;throw error;}
    const imported=await client.importMessage(session.uploadUrl,raw,draftsFolder,new Date(updatedAt).toISOString(),{$draft:true,$seen:true,[draftMarker(key,updatedAt)]:true});
    if(row)await drop(row.engine_id);
    keep(key,imported.id,updatedAt);
  }
  for(const row of rows())if(!root.has(row.key)){check();await drop(row.engine_id);forget(row.key);}
};

export class HostedScheduler {
  constructor(accounts,mirror,onDenied) {this.accounts=accounts;this.mirror=mirror;this.onDenied=onDenied;this.blocked=new Set();this.active=null;this.stopped=false;}
  key(scope,id){return JSON.stringify([scope,id]);}
  run(scope,id){
    if(this.stopped||this.active||this.blocked.has(this.key(scope,id)))return;
    const profile=this.accounts.hosted(scope,id);if(!profile?.active)return;
    const controller=new AbortController(),task={scope,id,controller,promise:null};this.active=task;
    this.accounts.db.prepare('UPDATE hosted_accounts SET attempted_at=? WHERE scope=? AND id=?').run(Date.now(),scope,id);
    task.promise=(async()=>{
      const deadline=setTimeout(()=>controller.abort(),300000);
      try{await this.mirror.sync(scope,id,controller.signal);}
      catch(error){
        this.accounts.db.prepare('UPDATE hosted_accounts SET error=? WHERE scope=? AND id=?').run('Synchronization paused. Existing native mail is retained; retry after checking access and source availability.',scope,id);
        if(error instanceof SourceError&&(error.status===403 || (error.status===404&&error.path==='folders')))await this.onDenied(scope,id);
      }finally{clearTimeout(deadline);this.active=null;}
    })();return task.promise;
  }
  tick(){if(this.stopped||this.active)return;const row=this.accounts.db.prepare('SELECT scope,id FROM hosted_accounts WHERE active=1 AND (initialized=0 OR attempted_at<=?) ORDER BY attempted_at LIMIT 100').all(Date.now()-30000).find(row=>!this.blocked.has(this.key(row.scope,row.id))); if(row)this.run(row.scope,row.id);}
  start(){this.tick();this.timer=setInterval(()=>this.tick(),1000);}
  async pause(scope,id){this.blocked.add(this.key(scope,id));if(this.active?.scope===scope&&this.active.id===id){this.active.controller.abort();await this.active.promise;}}
  resume(scope,id){this.blocked.delete(this.key(scope,id));}
  async stop(){this.stopped=true;clearInterval(this.timer);this.active?.controller.abort();await this.active?.promise;}
}
