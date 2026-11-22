import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';

const server = z.object({
  host: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/),
  port: z.number().int(),
  username: z.string().min(1).max(320).regex(/^[^\x00-\x1f\x7f]+$/),
  password: z.string().min(1).max(4096),
});
export const imapSchema = server.extend({ port: z.literal(993) });
export const accountSchema = z.object({
  address: z.email().max(320),
  imap: imapSchema,
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

const TAG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const loginTag = () => [...randomBytes(10)].map(byte => TAG_CHARS[byte % 36]).join('');

export class Accounts {
  constructor(path, key) {
    this.mutations = new Map();
    this.key = Buffer.from(key, 'hex');
    if (!/^[a-f0-9]{64}$/i.test(key) || this.key.length !== 32) throw new Error('Invalid encryption key');
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS hosted_accounts (
        scope TEXT NOT NULL,id TEXT NOT NULL,mailbox_id TEXT NOT NULL,address TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,
        phase TEXT NOT NULL DEFAULT 'seed',after_uid INTEGER NOT NULL DEFAULT 0,upper_uid INTEGER NOT NULL DEFAULT 0,cursor INTEGER NOT NULL DEFAULT 0,uid_validity INTEGER,
        initialized INTEGER NOT NULL DEFAULT 0,attempted_at INTEGER NOT NULL DEFAULT 0,synced_at INTEGER,error TEXT,
        PRIMARY KEY(scope,id),UNIQUE(scope,mailbox_id));
      CREATE TABLE IF NOT EXISTS scope_owners (scope TEXT PRIMARY KEY, encrypted TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts (
        org_id TEXT NOT NULL, id TEXT NOT NULL, encrypted TEXT NOT NULL,
        created_at INTEGER NOT NULL, PRIMARY KEY(org_id,id));
      CREATE TABLE IF NOT EXISTS engine_bindings (
        org_id TEXT NOT NULL, id TEXT NOT NULL, encrypted TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', synced_at INTEGER, error TEXT, attempted_at INTEGER,
        PRIMARY KEY(org_id,id));
      CREATE TABLE IF NOT EXISTS disconnected_accounts (org_id TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(org_id,id));`);
    if (!this.db.prepare('PRAGMA table_info(engine_bindings)').all().some(column => column.name === 'attempted_at')) this.db.exec('ALTER TABLE engine_bindings ADD COLUMN attempted_at INTEGER');
    if (!this.db.prepare('PRAGMA table_info(engine_bindings)').all().some(column => column.name === 'username_hash')) this.db.exec('ALTER TABLE engine_bindings ADD COLUMN username_hash TEXT');
    this.db.exec('CREATE INDEX IF NOT EXISTS engine_username_hash ON engine_bindings(username_hash)');
    for(const row of this.db.prepare('SELECT org_id,id FROM engine_bindings WHERE username_hash IS NULL').all()) {
      const binding=this.binding(row.org_id,row.id);
      if(binding?.username)this.db.prepare('UPDATE engine_bindings SET username_hash=? WHERE org_id=? AND id=?').run(this.usernameHash(binding.username),row.org_id,row.id);
    }
    if (!this.db.prepare('PRAGMA table_info(hosted_accounts)').all().some(column => column.name === 'login_tag')) this.db.exec('ALTER TABLE hosted_accounts ADD COLUMN login_tag TEXT');
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS hosted_login_tag ON hosted_accounts(login_tag)');
    for(const row of this.db.prepare('SELECT scope,id FROM hosted_accounts WHERE login_tag IS NULL').all())this.db.prepare('UPDATE hosted_accounts SET login_tag=? WHERE scope=? AND id=?').run(loginTag(),row.scope,row.id);
    if (!this.db.prepare('PRAGMA table_info(disconnected_accounts)').all().some(column => column.name === 'profile')) this.db.exec('ALTER TABLE disconnected_accounts ADD COLUMN profile TEXT');
    if (!this.db.prepare('PRAGMA table_info(disconnected_accounts)').all().some(column => column.name === 'replacement_id')) this.db.exec('ALTER TABLE disconnected_accounts ADD COLUMN replacement_id TEXT');
  }
  hosted(scope, id) { return this.db.prepare('SELECT * FROM hosted_accounts WHERE scope=? AND id=?').get(scope, id) ?? null; }
  hostedList(scope) { return this.db.prepare('SELECT id,mailbox_id AS mailboxId,address,active,initialized,synced_at AS syncedAt,error FROM hosted_accounts WHERE scope=?').all(scope); }
  putHosted(scope, mailboxId, address) {
    const id = `hosted-${mailboxId}`;
    const existing = this.hosted(scope, id);

    this.db.prepare("INSERT INTO hosted_accounts(scope,id,mailbox_id,address,login_tag) VALUES (?,?,?,?,?) ON CONFLICT(scope,id) DO UPDATE SET active=1,address=excluded.address,error=NULL").run(scope,id,mailboxId,address,loginTag());
    return id;
  }
  disableHosted(scope, id) { this.db.prepare('UPDATE hosted_accounts SET active=0 WHERE scope=? AND id=?').run(scope,id); }
  owner(scope) {
    const row = this.db.prepare('SELECT encrypted FROM scope_owners WHERE scope=?').get(scope);
    return row ? this.decrypt(scope, scope, row.encrypted, 'owner') : null;
  }
  setOwner(scope, orgId, userId) {
    if (!orgId || !userId || orgId.length > 255 || userId.length > 255 || createHash('sha256').update(JSON.stringify([orgId, userId])).digest('hex') !== scope) throw new Error('Invalid connection owner');
    if (this.owner(scope)) return;
    this.db.prepare('INSERT INTO scope_owners VALUES (?,?)').run(scope, this.encrypt(scope, scope, { orgId, userId }, 'owner'));
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
  async exclusive(org, id, action) {
    const key = JSON.stringify([org, id]);
    const previous = this.mutations.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    this.mutations.set(key, current);
    try { return await current; }
    finally { if (this.mutations.get(key) === current) this.mutations.delete(key); }
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
    if (!this.get(org, id) && !this.hosted(org, id)?.active) throw new Error('Connection not found');
    this.db.prepare(`INSERT INTO engine_bindings(org_id,id,encrypted,username_hash) VALUES (?,?,?,?) ON CONFLICT(org_id,id) DO UPDATE SET encrypted=excluded.encrypted,username_hash=excluded.username_hash`)
      .run(org, id, this.encrypt(org, id, binding, 'engine'), binding.username?this.usernameHash(binding.username):null);
  }
  usernameHash(username) { return createHash('sha256').update(username.toLowerCase()).digest('hex'); }
  /** Device passwords are `<login_tag>.<engine secret>`: the tag picks the engine account, so people log in with the mailbox address. */
  loginAccount(username, password) {
    const match = typeof password === 'string' && /^([a-z0-9]{10})\.(.+)$/s.exec(password);
    if (!match || typeof username !== 'string') return null;
    const row = this.db.prepare('SELECT scope,id,address FROM hosted_accounts WHERE login_tag=? AND active=1').get(match[1]);
    const binding = row && this.binding(row.scope, row.id);
    if (!binding?.username) return null;
    const name = username.toLowerCase();
    if (name !== row.address.toLowerCase() && name !== binding.username.toLowerCase()) return null;
    return { username: binding.username, password: match[2] };
  }
  loginTag(scope, id) { return this.hosted(scope, id)?.login_tag ?? null; }
  submissionAccount(username) {
    const rows=this.db.prepare('SELECT h.* FROM hosted_accounts h JOIN engine_bindings b ON b.org_id=h.scope AND b.id=h.id WHERE b.username_hash=? AND h.active=1 AND h.initialized=1').all(this.usernameHash(username));
    return rows.length===1?rows[0]:null;
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
    this.db.exec('SAVEPOINT disconnect_account');
    try {
      this.db.prepare("UPDATE engine_bindings SET state='disconnected',error=NULL WHERE org_id=? AND id=?").run(org, id);
      const deleted = this.db.prepare('DELETE FROM accounts WHERE org_id=? AND id=?').run(org, id);
      if (deleted.changes) this.db.prepare('INSERT INTO disconnected_accounts(org_id,id,profile) VALUES (?,?,?) ON CONFLICT(org_id,id) DO UPDATE SET profile=excluded.profile').run(org, id, profile);
      this.db.exec('RELEASE disconnect_account');
    } catch (error) { this.db.exec('ROLLBACK TO disconnect_account; RELEASE disconnect_account'); throw error; }
  }
  replacement(org, id) {
    return this.db.prepare('SELECT replacement_id FROM disconnected_accounts WHERE org_id=? AND id=?').get(org, id)?.replacement_id ?? null;
  }
  recover(org, id, replacementId) {
    const previous = this.replacement(org, id);
    if (previous) return previous;
    const account = this.get(org, id);
    if (!account) throw new Error('Connection not found');
    if (this.db.prepare('SELECT 1 FROM accounts WHERE org_id=? AND id=? UNION ALL SELECT 1 FROM disconnected_accounts WHERE org_id=? AND id=?').get(org,replacementId,org,replacementId)) throw new Error('Replacement id already used');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.put(org, replacementId, account);
      this.remove(org, id);
      this.db.prepare('UPDATE disconnected_accounts SET replacement_id=? WHERE org_id=? AND id=?').run(replacementId, org, id);
      this.db.exec('COMMIT'); return replacementId;
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
