import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';

const server = z.object({
  host: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/),
  port: z.number().int(),
  username: z.string().min(1).max(320).regex(/^[^\x00-\x1f\x7f]+$/),
  password: z.string().min(1).max(4096),
});
export const accountSchema = z.object({
  address: z.email().max(320),
  imap: server.extend({ port: z.literal(993) }),
  smtp: server.extend({ port: z.union([z.literal(465), z.literal(587)]) }),
});

/** Resolve once and connect to that IP, retaining the hostname for TLS validation. */
export async function publicHost(host, resolver = lookup) {
  const addresses = await resolver(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => ipaddr.process(address).range() !== 'unicast')) {
    throw new Error('Public mail server required');
  }
  return addresses[0].address;
}

export class Accounts {
  constructor(path, key) {
    this.key = Buffer.from(key, 'hex');
    if (!/^[a-f0-9]{64}$/i.test(key) || this.key.length !== 32) throw new Error('Invalid encryption key');
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS accounts (
        org_id TEXT NOT NULL, id TEXT NOT NULL, encrypted TEXT NOT NULL,
        created_at INTEGER NOT NULL, PRIMARY KEY(org_id,id));
      CREATE TABLE IF NOT EXISTS engine_bindings (
        org_id TEXT NOT NULL, id TEXT NOT NULL, encrypted TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', synced_at INTEGER, error TEXT, attempted_at INTEGER,
        PRIMARY KEY(org_id,id));
      CREATE TABLE IF NOT EXISTS disconnected_accounts (org_id TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(org_id,id));`);
    if (!this.db.prepare('PRAGMA table_info(engine_bindings)').all().some(column => column.name === 'attempted_at')) this.db.exec('ALTER TABLE engine_bindings ADD COLUMN attempted_at INTEGER');
    if (!this.db.prepare('PRAGMA table_info(disconnected_accounts)').all().some(column => column.name === 'profile')) this.db.exec('ALTER TABLE disconnected_accounts ADD COLUMN profile TEXT');
  }
  put(org, id, input) {
    if (this.db.prepare('SELECT 1 FROM disconnected_accounts WHERE org_id=? AND id=?').get(org, id)) throw new Error('Reconnect using a new connection id');
    const account = accountSchema.parse(input);
    const previous = this.get(org, id);
    if (previous && (previous.address !== account.address || previous.imap.host !== account.imap.host || previous.imap.username !== account.imap.username)) {
      throw new Error('Reconnect a different mailbox using a new connection');
    }
    const encrypted = this.encrypt(org, id, account);
    this.db.prepare(`INSERT INTO accounts VALUES (?,?,?,?) ON CONFLICT(org_id,id) DO UPDATE SET encrypted=excluded.encrypted`).run(org, id, encrypted, Date.now());
    return { id, address: account.address };
  }
  encrypt(org, id, value, namespace) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify(namespace ? [org, id, namespace] : [org, id])));
    return Buffer.concat([nonce, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString('base64');
  }
  decrypt(org, id, encrypted, namespace) {
    const data = Buffer.from(encrypted, 'base64');
    const cipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    cipher.setAAD(Buffer.from(JSON.stringify(namespace ? [org, id, namespace] : [org, id])));
    cipher.setAuthTag(data.subarray(-16));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString());
  }
  get(org, id) {
    const row = this.db.prepare('SELECT encrypted FROM accounts WHERE org_id=? AND id=?').get(org, id);
    return row ? accountSchema.parse(this.decrypt(org, id, row.encrypted)) : null;
  }
  binding(org, id) {
    const row = this.db.prepare('SELECT encrypted FROM engine_bindings WHERE org_id=? AND id=?').get(org, id);
    return row ? this.decrypt(org, id, row.encrypted, 'engine') : null;
  }
  setBinding(org, id, binding) {
    if (!this.get(org, id)) throw new Error('Connection not found');
    this.db.prepare(`INSERT INTO engine_bindings(org_id,id,encrypted) VALUES (?,?,?) ON CONFLICT(org_id,id) DO UPDATE SET encrypted=excluded.encrypted`)
      .run(org, id, this.encrypt(org, id, binding, 'engine'));
  }
  status(org, id) {
    return this.db.prepare('SELECT state,synced_at AS syncedAt,error FROM engine_bindings WHERE org_id=? AND id=?').get(org, id) ?? null;
  }
  connectionInfo(org, id) {
    const account = this.get(org, id);
    if (account) {
      const { password: _imap, ...imap } = account.imap;
      const { password: _smtp, ...smtp } = account.smtp;
      return { address: account.address, imap, smtp, readOnly: false };
    }
    const row = this.db.prepare('SELECT profile FROM disconnected_accounts WHERE org_id=? AND id=?').get(org, id);
    return row?.profile && this.binding(org, id) ? this.decrypt(org, id, row.profile, 'disconnected') : null;
  }
  setStatus(org, id, state, syncedAt = null) {
    this.db.prepare('UPDATE engine_bindings SET state=?,synced_at=coalesce(?,synced_at),error=?,attempted_at=? WHERE org_id=? AND id=?')
      .run(state, syncedAt, state === 'error' ? 'Synchronization failed. Check credentials and server availability.' : null, Date.now(), org, id);
  }
  list(org) {
    const active = this.db.prepare('SELECT id FROM accounts WHERE org_id=? ORDER BY created_at').all(org).map(({ id }) => {
      const sync = this.status(org, id);
      return { id, address: this.get(org, id).address, ...(sync ? { sync } : {}) };
    });
    const disconnected = this.db.prepare('SELECT d.id FROM disconnected_accounts d JOIN engine_bindings e ON e.org_id=d.org_id AND e.id=d.id WHERE d.org_id=? AND d.profile IS NOT NULL').all(org).map(({ id }) => ({ id, address: this.connectionInfo(org, id).address, sync: this.status(org, id) }));
    return [...active, ...disconnected];
  }
  remove(org, id) {
    const account = this.get(org, id);
    if (!account) return;
    const { password: _imap, ...imap } = account.imap;
    const { password: _smtp, ...smtp } = account.smtp;
    const profile = this.encrypt(org, id, { address: account.address, imap, smtp, readOnly: true }, 'disconnected');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare("UPDATE engine_bindings SET state='disconnected',error=NULL WHERE org_id=? AND id=?").run(org, id);
      const deleted = this.db.prepare('DELETE FROM accounts WHERE org_id=? AND id=?').run(org, id);
      if (deleted.changes) this.db.prepare('INSERT INTO disconnected_accounts(org_id,id,profile) VALUES (?,?,?) ON CONFLICT(org_id,id) DO UPDATE SET profile=excluded.profile').run(org, id, profile);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
