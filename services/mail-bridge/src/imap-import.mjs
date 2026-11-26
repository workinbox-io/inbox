import { createHash, randomUUID } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { z } from 'zod';
import { imapSchema, publicHost } from './accounts.mjs';
import { boundedBytes, RootMail, SourceError } from './root-mail.mjs';

export const imapImportSchema = z.object({ id: z.uuid(), mailboxId: z.uuid(), imap: imapSchema }).strict();
const MAX_BYTES = 25 * 1024 * 1024;
const identifier = value => {
  const hex = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
class ImportError extends Error {}

async function uidAt(client, sequence) {
  const message = await client.fetchOne(String(sequence), { uid: true });
  if (!message?.uid) throw new Error('Source folder changed while paging');
  return message.uid;
}

async function firstAfter(client, box, uid) {
  let first = 1, last = box.exists + 1;
  while (first < last) {
    const middle = Math.floor((first + last) / 2);
    if (await uidAt(client,middle) <= uid) first = middle + 1;
    else last = middle;
  }
  return first;
}

async function batchEnd(client, box, after, upper) {
  // Locate 100 live messages by sequence, then copy by UID so gaps and expunges cannot skip mail.
  const first = await firstAfter(client,box,after);
  return first > box.exists ? upper : Math.min(upper, await uidAt(client,Math.min(first + 99, box.exists)));
}

/** A finite, read-only source snapshot. Each acknowledged copy advances a durable UID checkpoint. */
export class ImapImports {
  constructor(accounts, sourceConfig, { resolveHost = publicHost, client = options => new ImapFlow(options), source = (scope, mailboxId, signal) => new RootMail(accounts, scope, mailboxId, { ...sourceConfig, signal }) } = {}) {
    this.accounts = accounts; this.db = accounts.db; this.resolveHost = resolveHost; this.client = client; this.source = source;
    this.active = new Map(); this.stopped = false;
    this.db.exec(`CREATE TABLE IF NOT EXISTS imap_imports (
      id TEXT PRIMARY KEY,scope TEXT NOT NULL,mailbox_id TEXT NOT NULL,host TEXT NOT NULL,username TEXT NOT NULL,
      encrypted TEXT,status TEXT NOT NULL DEFAULT 'queued',folders TEXT,folder INTEGER NOT NULL DEFAULT 0,
      uid INTEGER NOT NULL DEFAULT 0,pending TEXT,copied INTEGER NOT NULL DEFAULT 0,skipped INTEGER NOT NULL DEFAULT 0,
      error TEXT,created_at INTEGER NOT NULL,attempted_at INTEGER NOT NULL DEFAULT 0);
      UPDATE imap_imports SET status='queued' WHERE status='running';`);
    const columns = this.db.prepare('PRAGMA table_info(imap_imports)').all().map(column => column.name);
    for (const [name, definition] of [['total','INTEGER'],['elapsed_ms','INTEGER NOT NULL DEFAULT 0'],['estimate_from','INTEGER NOT NULL DEFAULT 0']]) {
      if (!columns.includes(name)) this.db.exec(`ALTER TABLE imap_imports ADD COLUMN ${name} ${definition}`);
    }
    this.db.exec("UPDATE imap_imports SET elapsed_ms=0,estimate_from=copied+skipped WHERE status='queued'");
  }
  get(scope, id) { return this.db.prepare('SELECT * FROM imap_imports WHERE scope=? AND id=?').get(scope, id); }
  list(scope) {
    return this.db.prepare(`SELECT id,mailbox_id AS mailboxId,host,username,status,copied,skipped,error,created_at AS createdAt,
      total,elapsed_ms,estimate_from,attempted_at FROM imap_imports WHERE scope=?
      ORDER BY CASE WHEN status IN ('queued','running','failed') THEN 0 ELSE 1 END,created_at DESC LIMIT 20`).all(scope).map(row => {
      const { elapsed_ms, estimate_from, attempted_at, ...job } = row;
      const elapsed = elapsed_ms + (row.status === 'running' ? Math.max(0,Date.now()-attempted_at) : 0);
      const processed = row.copied + row.skipped;
      const samples = processed - estimate_from;
      const active = ['queued','running'].includes(row.status);
      const remaining = row.total === null ? null : Math.max(0,row.total-processed);
      return { ...job, etaSeconds: active && remaining > 0 && samples >= 20 && elapsed >= 30000 ? Math.ceil(remaining * elapsed / samples / 1000) : null };
    });
  }
  async create(scope, input) {
    const { id, mailboxId, imap } = imapImportSchema.parse(input);
    // Check destination access before retaining any source credentials.
    await this.source(scope, mailboxId).json('folders');
    await this.resolveHost(imap.host);
    const existing = this.get(scope, id);
    if (existing) return { id: existing.id };
    this.db.prepare('INSERT INTO imap_imports(id,scope,mailbox_id,host,username,encrypted,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, scope, mailboxId, imap.host, imap.username, this.accounts.encrypt(scope, id, imap, 'imap-import'), Date.now());
    return { id };
  }
  retry(scope, id) {
    this.db.prepare("UPDATE imap_imports SET status='queued',error=NULL,elapsed_ms=0,estimate_from=copied+skipped WHERE scope=? AND id=? AND status='failed' AND encrypted IS NOT NULL").run(scope,id);
  }
  async cancel(scope, id) {
    const task = this.active.get(id);
    if (task?.scope === scope) { task.controller.abort(); await task.promise; }
    this.db.prepare("UPDATE imap_imports SET status='cancelled',encrypted=NULL,pending=NULL,error=NULL WHERE scope=? AND id=? AND status NOT IN ('done','cancelled')").run(scope,id);
  }
  async batch(row, signal) {
    const imap = this.accounts.decrypt(row.scope, row.id, row.encrypted, 'imap-import');
    const target = this.source(row.scope, row.mailbox_id, signal);
    await target.json('folders'); // Recheck membership and mailbox access on every batch.
    const client = this.client({ host: await this.resolveHost(imap.host), port: imap.port, secure: true,
      tls: { servername: imap.host, rejectUnauthorized: true }, auth: { user: imap.username, pass: imap.password },
      logger: false, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000 });
    client.on('error', () => {});
    const abort = () => client.close();
    signal.addEventListener('abort', abort, { once: true });
    try {
      signal.throwIfAborted();
      await client.connect();
      let folders = row.folders ? JSON.parse(row.folders) : null;
      if (!folders) {
        folders = [];
        // shortcut: messages in several folders keep the first placement; merge labels when multi-label migration is needed.
        const priority = folder => folder.path.toUpperCase() === 'INBOX' ? 0 : folder.specialUse === '\\Sent' ? 1 : !folder.specialUse ? 2 : 3;
        const listed = (await client.list()).sort((a,b) => priority(a)-priority(b));
        for (const folder of listed) {
          if (folder.flags.has('\\Noselect') || folder.specialUse === '\\Drafts') continue;
          const box = await client.mailboxOpen(folder.path, { readOnly: true });
          const role = folder.path.toUpperCase() === 'INBOX' ? 'inbox' : ({ '\\Sent': 'sent', '\\Trash': 'trash', '\\Junk': 'junk' }[folder.specialUse] ?? 'archive');
          const label = !folder.specialUse && role === 'archive' ? identifier([row.scope, row.mailbox_id, imap.host, imap.username, folder.path]) : null;
          folders.push({ path: folder.path, validity: String(box.uidValidity), upper: box.uidNext - 1, count: box.exists, role, label });
        }
        this.db.prepare('UPDATE imap_imports SET folders=?,total=? WHERE id=?').run(JSON.stringify(folders),folders.reduce((sum,folder) => sum+folder.count,0),row.id);
      }
      if (row.folders && row.total === null) {
        // Older jobs have a UID snapshot but no counts: count the remaining UID ranges without downloading mail.
        let remaining = 0;
        for (let index = row.folder; index < folders.length; index++) {
          signal.throwIfAborted();
          const snapshot = folders[index];
          const box = await client.mailboxOpen(snapshot.path, { readOnly: true });
          if (String(box.uidValidity) !== snapshot.validity) throw new ImportError('The source folder identity changed. Start a new import; existing copies are retained.');
          const after = index === row.folder ? row.uid : 0;
          if (after < snapshot.upper) remaining += Math.max(0,await firstAfter(client,box,snapshot.upper)-await firstAfter(client,box,after));
        }
        this.db.prepare('UPDATE imap_imports SET total=? WHERE id=?').run(row.copied+row.skipped+remaining,row.id);
      }
      const folder = folders[row.folder];
      if (!folder) {
        this.db.prepare("UPDATE imap_imports SET status='done',encrypted=NULL,pending=NULL WHERE id=?").run(row.id);
        return;
      }
      const box = await client.mailboxOpen(folder.path, { readOnly: true });
      if (String(box.uidValidity) !== folder.validity) throw new ImportError('The source folder identity changed. Start a new import; existing copies are retained.');
      if (folder.label) await target.json(`folders/${folder.label}`, 'POST', { name: folder.path.slice(0,255) });
      const end = await batchEnd(client, box, row.uid, folder.upper);
      if (row.uid < end) {
        const messages = await client.fetchAll(`${row.uid + 1}:${end}`, { uid: true, size: true, internalDate: true, flags: true }, { uid: true });
        messages.sort((a,b) => a.uid-b.uid);
        for (const message of messages) {
          signal.throwIfAborted();
          let skipped = message.size > MAX_BYTES;
          if (!skipped) {
            const pending = row.pending ? JSON.parse(row.pending) : {
              uid: message.uid, id: randomUUID(), receivedAt: new Date(message.internalDate || row.created_at).toISOString(),
              flags: { seen: message.flags.has('\\Seen'), starred: message.flags.has('\\Flagged'), role: folder.role, labels: folder.label ? [folder.label] : [] },
            };
            if (pending.uid !== message.uid) throw new ImportError('The source message disappeared during a retry. Start a new import; existing copies are retained.');
            this.db.prepare('UPDATE imap_imports SET pending=? WHERE id=?').run(JSON.stringify(pending),row.id);
            const download = await client.download(String(message.uid), undefined, { uid: true, maxBytes: MAX_BYTES + 1 });
            if (!download.content) throw new Error('Source message unavailable');
            const raw = await boundedBytes(download.content, MAX_BYTES + 1);
            skipped = raw.length > MAX_BYTES;
            if (!skipped) {
              const query = new URLSearchParams({ id: pending.id, receivedAt: pending.receivedAt, flags: JSON.stringify(pending.flags) });
              try { await target.json(`import?${query}`, 'POST', raw); }
              catch (error) { if (error instanceof SourceError && error.status === 410) skipped = true; else throw error; }
            }
          }
          this.db.prepare('UPDATE imap_imports SET uid=?,copied=copied+?,skipped=skipped+?,pending=NULL WHERE id=?').run(message.uid,+!skipped,+skipped,row.id);
          row.pending = null;
        }
      }
      if (row.pending) throw new ImportError('The source message disappeared during a retry. Start a new import; existing copies are retained.');
      if (end >= folder.upper && row.folder === folders.length - 1) {
        this.db.prepare("UPDATE imap_imports SET status='done',encrypted=NULL,pending=NULL WHERE id=?").run(row.id);
        return;
      }
      if (end >= folder.upper) this.db.prepare('UPDATE imap_imports SET folder=folder+1,uid=0 WHERE id=?').run(row.id);
      else this.db.prepare('UPDATE imap_imports SET uid=? WHERE id=?').run(end,row.id);
      this.db.prepare("UPDATE imap_imports SET status='queued' WHERE id=?").run(row.id);
    } finally { signal.removeEventListener('abort', abort); client.close(); }
  }
  run(row) {
    if (this.stopped || this.active.has(row.id) || this.active.size >= 2) return;
    const controller = new AbortController();
    const task = { scope: row.scope, controller, promise: null };
    this.active.set(row.id,task);
    const started = Date.now();
    this.db.prepare("UPDATE imap_imports SET status='running',attempted_at=? WHERE id=?").run(started,row.id);
    task.promise = this.batch(row,controller.signal).catch(error => {
      if (error instanceof SourceError && [403,404].includes(error.status)) {
        this.db.prepare("UPDATE imap_imports SET status='cancelled',encrypted=NULL,pending=NULL,error=? WHERE id=?")
          .run('Destination access was removed. The import was cancelled; existing copies are retained.',row.id);
        return;
      }
      const message = error instanceof ImportError ? error.message : error instanceof SourceError && error.status === 507 ? 'The destination mailbox is full. Free space and resume the import.' : 'Import stopped. Check source credentials, server availability and destination access, then resume.';
      this.db.prepare('UPDATE imap_imports SET status=?,error=? WHERE id=?').run(controller.signal.aborted ? 'queued' : 'failed',controller.signal.aborted ? null : message,row.id);
    }).finally(() => {
      this.db.prepare('UPDATE imap_imports SET elapsed_ms=elapsed_ms+? WHERE id=?').run(Math.max(0,Date.now()-started),row.id);
      this.active.delete(row.id);
    });
    return task.promise;
  }
  tick() {
    for (const row of this.db.prepare("SELECT * FROM imap_imports WHERE status='queued' ORDER BY attempted_at,created_at").all()) this.run(row);
  }
  start() { this.tick(); this.timer = setInterval(() => this.tick(), 1000); }
  async stop() {
    this.stopped = true; clearInterval(this.timer);
    for (const task of this.active.values()) task.controller.abort();
    await Promise.all([...this.active.values()].map(task => task.promise));
  }
}

export async function imapImportRoutes({ imports, scope, id, req, send }) {
  if (req.method === 'GET' && !id) { send(200,{ configured: !!imports, imports: imports?.list(scope) ?? [] }); return; }
  if (!imports) { send(503,{ error: 'Mail import is not configured' }); return; }
  if (id) {
    if (!imports.get(scope,id)) { send(404,{error:'Not found'}); return; }
    if (req.method === 'POST') { imports.retry(scope,id); send(202,{ok:true}); return; }
    if (req.method === 'DELETE') { await imports.cancel(scope,id); send(200,{ok:true}); return; }
  } else if (req.method === 'POST') {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 32768) { send(413,{error:'Body too large'}); return; } chunks.push(chunk); }
    let input;
    try { input = imapImportSchema.parse(JSON.parse(Buffer.concat(chunks).toString())); }
    catch { send(422,{error:'Invalid IMAP import settings'}); return; }
    send(202,await imports.create(scope,input)); return;
  }
  send(405,{error:'Method not allowed'});
}
