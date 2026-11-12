import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { z } from 'zod';
import { publicHost } from './accounts.mjs';
import { scheduledTime } from '../../../src/lib/mail/outbox-policy.ts';

export const sendSchema = z.object({
  id: z.uuid(), to: z.array(z.email()).min(1).max(20), cc: z.array(z.email()).max(20).default([]),
  subject: z.string().min(1).max(300).regex(/^[^\r\n]+$/), text: z.string().min(1).max(50000),
  files: z.array(z.object({ name: z.string().min(1).max(200), type: z.string().max(200).regex(/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/), content: z.string().max(14 * 1024 * 1024) }).strict()).max(5).default([]),
  replyToId: z.string().regex(/^[a-zA-Z0-9_-]{1,255}$/).optional(),
}).strict();
export class QueueConflict extends Error {}

export async function deliverSmtp(account, payload, resolveHost = publicHost) {
  const ip = await resolveHost(account.smtp.host);
  const smtp = nodemailer.createTransport({ host: ip, port: account.smtp.port, secure: account.smtp.port !== 587, requireTLS: true,
    tls: { servername: account.smtp.host, rejectUnauthorized: true }, auth: { user: account.smtp.username, pass: account.smtp.password },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000, disableFileAccess: true, disableUrlAccess: true });
  try { await smtp.sendMail({ raw: Buffer.from(payload.raw, 'base64'), envelope: payload.envelope }); }
  finally { smtp.close(); }
}

/** Durable admission precedes SMTP; an ambiguous SMTP result is never retried automatically. */
export class MailQueue {
  constructor(accounts, engine, { deliver = deliverSmtp, beforeCopy = async () => {} } = {}) {
    this.accounts = accounts; this.db = accounts.db; this.engine = engine; this.deliver = deliver; this.beforeCopy = beforeCopy;
    this.active = null; this.blocked = new Set(); this.stopped = false;
    this.db.exec(`CREATE TABLE IF NOT EXISTS outgoing_mail (
      scope TEXT NOT NULL,id TEXT NOT NULL,connection_id TEXT NOT NULL,fingerprint TEXT NOT NULL,payload TEXT NOT NULL,
      state TEXT NOT NULL,created_at INTEGER NOT NULL,send_at INTEGER NOT NULL,subject TEXT NOT NULL,
      attempted_at INTEGER NOT NULL DEFAULT 0,error TEXT,
      PRIMARY KEY(scope,id));
      UPDATE outgoing_mail SET state='uncertain',error='Service interrupted during SMTP; verify delivery before sending again' WHERE state='sending';`);
  }
  view(row) { return { id: row.id, state: row.state, subject: row.subject, sendAt: row.send_at, createdAt: row.created_at, error: row.error, draftAvailable: row.payload !== undefined ? row.payload.length > 0 : !!row.draft_available }; }
  list(scope, connection) { return this.db.prepare('SELECT id,state,subject,send_at,created_at,error,length(payload)>0 AS draft_available FROM outgoing_mail WHERE scope=? AND connection_id=? ORDER BY created_at DESC LIMIT 100').all(scope, connection).map(row => this.view(row)); }
  async enqueue(scope, connection, input) {
    if (this.admitting) throw new QueueConflict('Queue is busy; retry shortly');
    this.admitting = true;
    try { return await this.admit(scope, connection, input); }
    finally { this.admitting = false; }
  }
  async admit(scope, connection, input) {
    if (this.blocked.has(JSON.stringify([scope, connection]))) throw new QueueConflict('Connection is changing; retry shortly');
    const message = sendSchema.parse(input), account = this.accounts.get(scope, connection);
    if (!account) throw new QueueConflict('Connection is not active');
    const fingerprint = createHash('sha256').update(JSON.stringify(message)).digest('hex');
    const existing = this.db.prepare('SELECT * FROM outgoing_mail WHERE scope=? AND id=?').get(scope, message.id);
    if (existing) {
      if (existing.connection_id !== connection || existing.fingerprint !== fingerprint) throw new QueueConflict('Send id already used');
      return this.view(existing);
    }
    let bytes = 0;
    const attachments = message.files.map(file => {
      const content = Buffer.from(file.content, 'base64');
      bytes += content.length;
      if (content.toString('base64') !== file.content || bytes > 10 * 1024 * 1024) throw new RangeError('Attachments exceed 10 MB or have invalid encoding');
      return { filename: file.name, contentType: file.type, content };
    });
    const created = Date.now(), messageId = `<${message.id}@${account.address.split('@')[1]}>`;
    let inReplyTo;
    if (message.replyToId) {
      const binding = this.accounts.binding(scope, connection);
      const { client } = await this.engine.mail(binding);
      const original = (await client.contents([message.replyToId])).list[0];
      if (!original) throw new QueueConflict('Original message unavailable');
      const reference = original.messageId?.[0]?.replace(/^<|>$/g, '');
      if (reference && /^[^\s<>]+@[^\s<>]+$/.test(reference)) inReplyTo = `<${reference}>`;
    }
    const raw = await new MailComposer({ from: account.address, to: message.to, cc: message.cc, subject: message.subject, text: message.text,
      date: new Date(created), messageId, inReplyTo, references: inReplyTo, attachments, disableFileAccess: true, disableUrlAccess: true }).compile().build();
    const payload = this.accounts.encrypt(scope, message.id, { raw: raw.toString('base64'), envelope: { from: account.address, to: [...new Set([...message.to, ...message.cc])] }, messageId, draft: message }, `outbox:${connection}`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const repeated = this.db.prepare('SELECT * FROM outgoing_mail WHERE scope=? AND id=?').get(scope, message.id);
      if (repeated) {
        if (repeated.connection_id !== connection || repeated.fingerprint !== fingerprint) throw new QueueConflict('Send id already used');
        this.db.exec('COMMIT'); return this.view(repeated);
      }
      const pending = this.db.prepare("SELECT sum(CASE WHEN state IN ('queued','sending','accepted') THEN 1 ELSE 0 END) AS n,coalesce(sum(length(payload)),0) AS bytes FROM outgoing_mail").get();
      if (pending.n >= 1000 || pending.bytes + payload.length > 256 * 1024 * 1024) throw new QueueConflict('Sending queue is full');
      this.db.prepare("INSERT INTO outgoing_mail(scope,id,connection_id,fingerprint,payload,state,created_at,send_at,subject) VALUES (?,?,?,?,?,'queued',?,?,?) ON CONFLICT(scope,id) DO NOTHING")
        .run(scope, message.id, connection, fingerprint, payload, created, scheduledTime(undefined, created), message.subject);
      const stored = this.db.prepare('SELECT * FROM outgoing_mail WHERE scope=? AND id=?').get(scope, message.id);
      if (stored.fingerprint !== fingerprint || stored.connection_id !== connection) throw new QueueConflict('Send id already used');
      this.db.exec('COMMIT'); return this.view(stored);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  update(job, state, error = null) {
    this.db.prepare("UPDATE outgoing_mail SET state=?,error=?,attempted_at=?,payload=CASE WHEN ?='sent' THEN '' ELSE payload END WHERE scope=? AND id=?").run(state, error, Date.now(), state, job.scope, job.id);
  }
  async copySent(job, payload) {
    if (this.accounts.get(job.scope, job.connection_id)) await this.beforeCopy(job.scope, job.connection_id);
    const binding = this.accounts.binding(job.scope, job.connection_id);
    if (!binding?.accountId) throw new Error('Engine binding unavailable');
    const { client, uploadUrl } = await this.engine.mail(binding);
    const marker = `wi-outbox-${job.id}`;
    if ((await client.query(0, 1, { hasKeyword: marker })).ids.length) return;
    const folders = await client.folders(), sent = folders.list.find(folder => folder.role === 'sent');
    if (!sent) throw new Error('Sent folder unavailable');
    if ((await client.query(0, 1, { inMailbox: sent.id, header: ['Message-ID', payload.messageId] })).ids.length) return;
    await client.importMessage(uploadUrl, Buffer.from(payload.raw, 'base64'), sent.id, new Date(job.created_at).toISOString(), { $seen: true, [marker]: true });
  }
  tick() {
    if (this.stopped || this.active) return;
    const job = this.db.prepare("SELECT * FROM outgoing_mail WHERE state IN ('queued','accepted') AND send_at<=? AND attempted_at<=? ORDER BY CASE WHEN state='queued' THEN 0 ELSE 1 END,attempted_at,created_at LIMIT 100").all(Date.now(), Date.now() - 30000).find(row => !this.blocked.has(JSON.stringify([row.scope, row.connection_id])));
    if (!job) return;
    const task = { scope: job.scope, connection: job.connection_id, promise: null }; this.active = task;
    task.promise = (async () => {
      let deliveryStarted = false;
      try {
        const payload = this.accounts.decrypt(job.scope, job.id, job.payload, `outbox:${job.connection_id}`);
        if (job.state === 'queued') {
          const account = this.accounts.get(job.scope, job.connection_id);
          if (!account) { this.update(job, 'cancelled'); return; }
          const claimed = this.db.prepare("UPDATE outgoing_mail SET state='sending',attempted_at=? WHERE scope=? AND id=? AND state='queued'").run(Date.now(), job.scope, job.id);
          if (!claimed.changes) return;
          deliveryStarted = true;
          try { await this.deliver(account, payload); }
          catch { this.update(job, 'uncertain', 'SMTP outcome uncertain; verify delivery before sending again'); return; }
          this.update(job, 'accepted');
        }
        try { await this.copySent(job, payload); this.update(job, 'sent'); }
        catch { this.update(job, 'accepted', 'Delivered; Sent copy is still being saved'); }
      } catch { this.update(job, deliveryStarted ? 'uncertain' : job.state === 'accepted' ? 'accepted' : 'failed', deliveryStarted ? 'SMTP outcome uncertain; verify delivery before sending again' : 'Sending data unavailable'); }
      finally { this.active = null; }
    })();
    return task.promise;
  }
  async cancel(scope, connection) {
    this.db.prepare("UPDATE outgoing_mail SET state='cancelled' WHERE scope=? AND connection_id=? AND state='queued'").run(scope, connection);
    if (this.active?.scope === scope && this.active.connection === connection) await this.active.promise;
  }
  async pause(scope, connection) {
    this.blocked.add(JSON.stringify([scope, connection]));
    if (this.active?.scope === scope && this.active.connection === connection) await this.active.promise;
  }
  resume(scope, connection) { this.blocked.delete(JSON.stringify([scope, connection])); }
  cancelJob(scope, connection, id) {
    const previous = this.db.prepare("SELECT * FROM outgoing_mail WHERE scope=? AND connection_id=? AND id=? AND state='queued'").get(scope, connection, id);
    if (!previous) throw new QueueConflict('Sending already started or job not found');
    const { draft } = this.accounts.decrypt(scope, id, previous.payload, `outbox:${connection}`);
    const row = this.db.prepare("UPDATE outgoing_mail SET state='cancelled' WHERE scope=? AND connection_id=? AND id=? AND state='queued' RETURNING *").get(scope, connection, id);
    if (!row) throw new QueueConflict('Sending already started or job not found');
    return { ...this.view(row), draft };
  }
  recoverDraft(scope, connection, id) {
    const row = this.db.prepare("SELECT payload FROM outgoing_mail WHERE scope=? AND connection_id=? AND id=? AND state IN ('cancelled','failed','uncertain') AND payload!=''").get(scope, connection, id);
    if (!row) throw new QueueConflict('Draft is not available');
    return this.accounts.decrypt(scope, id, row.payload, `outbox:${connection}`).draft;
  }
  clearDraft(scope, connection, id) {
    const changed = this.db.prepare("UPDATE outgoing_mail SET payload='' WHERE scope=? AND connection_id=? AND id=? AND state IN ('cancelled','failed','uncertain')").run(scope, connection, id);
    if (!changed.changes) throw new QueueConflict('Draft cannot be cleared while delivery is pending');
  }
  start() {
    const run = () => { void this.tick()?.catch(() => console.error('Outbox persistence failed; delivery is not retried automatically')); };
    run(); this.timer = setInterval(run, 1000);
  }
  async stop() { this.stopped = true; clearInterval(this.timer); await this.active?.promise; }
}
