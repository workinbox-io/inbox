import { randomUUID } from 'node:crypto';
import { JmapError } from '../../../src/lib/mail/jmap.ts';

/** Engine state and its message index commit together; interrupted snapshots never replace live data. */
export class EngineIndex {
  constructor(db) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS engine_cursors (
        scope TEXT NOT NULL, account_id TEXT NOT NULL, state TEXT NOT NULL,
        synced_at INTEGER NOT NULL, PRIMARY KEY(scope,account_id));
      CREATE TABLE IF NOT EXISTS engine_messages (
        scope TEXT NOT NULL, account_id TEXT NOT NULL, id TEXT NOT NULL, message TEXT NOT NULL,
        PRIMARY KEY(scope,account_id,id));
      CREATE TABLE IF NOT EXISTS engine_snapshot (
        run TEXT NOT NULL, id TEXT NOT NULL, message TEXT NOT NULL, PRIMARY KEY(run,id));
      CREATE TABLE IF NOT EXISTS engine_locks (
        scope TEXT NOT NULL, account_id TEXT NOT NULL, owner TEXT NOT NULL,
        expires_at INTEGER NOT NULL, PRIMARY KEY(scope,account_id));
    `);
    db.prepare('DELETE FROM engine_snapshot WHERE run NOT IN (SELECT owner FROM engine_locks WHERE expires_at>=?)').run(Date.now());
  }
  state(scope, account) {
    return this.db.prepare('SELECT state FROM engine_cursors WHERE scope=? AND account_id=?').get(scope, account)?.state;
  }
  messages(scope, account) {
    return this.db.prepare('SELECT message FROM engine_messages WHERE scope=? AND account_id=? ORDER BY id').all(scope, account).map(row => JSON.parse(row.message));
  }
  transaction(fn, lease) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const now = Date.now();
      if (lease && this.db.prepare('UPDATE engine_locks SET expires_at=? WHERE scope=? AND account_id=? AND owner=? AND expires_at>=?')
        .run(now + 120000, lease.scope, lease.account, lease.owner, now).changes !== 1) throw new Error('Engine synchronization lease expired');
      fn(); this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  cursor(scope, account, state) {
    this.db.prepare(`INSERT INTO engine_cursors VALUES (?,?,?,?) ON CONFLICT(scope,account_id) DO UPDATE SET state=excluded.state,synced_at=excluded.synced_at`).run(scope, account, state, Date.now());
  }
  async sync(scope, account, client) {
    const owner = randomUUID(), now = Date.now();
    const acquired = this.db.prepare(`INSERT INTO engine_locks VALUES (?,?,?,?) ON CONFLICT(scope,account_id)
      DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE engine_locks.expires_at<? RETURNING owner`)
      .get(scope, account, owner, now + 120000, now);
    if (acquired?.owner !== owner) throw new Error('Engine synchronization already running');
    try { await this.syncLocked(scope, account, client, { scope, account, owner }); }
    finally { this.db.prepare('DELETE FROM engine_locks WHERE scope=? AND account_id=? AND owner=?').run(scope, account, owner); }
  }
  async syncLocked(scope, account, client, lease) {
    const state = this.state(scope, account);
    if (state === undefined) return this.snapshot(scope, account, client, lease);
    try {
      let current = state;
      for (let page = 0; page < 100; page++) {
        const changes = await client.changes(current);
        if (changes.oldState !== current || typeof changes.newState !== 'string' || (changes.hasMoreChanges && changes.newState === current)) throw new Error('Invalid engine change cursor');
        const ids = [...new Set([...changes.created, ...changes.updated])];
        const result = ids.length ? await client.emails(ids) : { list: [], notFound: [] };
        // A disappeared item is safe only when a later change page confirms destruction.
        if (result.notFound.length || result.list.length !== ids.length) throw new Error('Engine changed during synchronization');
        this.transaction(() => {
          const upsert = this.db.prepare(`INSERT INTO engine_messages VALUES (?,?,?,?) ON CONFLICT(scope,account_id,id) DO UPDATE SET message=excluded.message`);
          for (const message of result.list) {
            if (!ids.includes(message.id)) throw new Error('Unexpected engine message');
            upsert.run(scope, account, message.id, JSON.stringify(message));
          }
          const remove = this.db.prepare('DELETE FROM engine_messages WHERE scope=? AND account_id=? AND id=?');
          for (const id of changes.destroyed) remove.run(scope, account, id);
          this.cursor(scope, account, changes.newState);
        }, lease);
        current = changes.newState;
        if (!changes.hasMoreChanges) return;
      }
      // shortcut: process at most 100 delta pages per run, the scheduler resumes from the committed cursor.
    } catch (error) {
      if (!(error instanceof JmapError) || error.type !== 'cannotCalculateChanges') throw error;
      await this.snapshot(scope, account, client, lease);
    }
  }
  async snapshot(scope, account, client, lease) {
    const run = lease.owner;
    try {
      const initial = await client.emails([]);
      let position = 0, queryState;
      while (true) {
        const query = await client.query(position, 100);
        if (query.position !== position || (queryState !== undefined && queryState !== query.queryState)) throw new Error('Engine query changed during snapshot');
        queryState = query.queryState;
        if (!query.ids.length) break;
        const result = await client.emails(query.ids);
        if (result.state !== initial.state || result.notFound.length || result.list.length !== query.ids.length) throw new Error('Engine changed during snapshot');
        this.transaction(() => {
          const insert = this.db.prepare('INSERT INTO engine_snapshot VALUES (?,?,?)');
          for (const message of result.list) {
            if (!query.ids.includes(message.id)) throw new Error('Unexpected engine message');
            insert.run(run, message.id, JSON.stringify(message));
          }
        }, lease);
        position += query.ids.length;
      }
      const final = await client.emails([]);
      if (final.state !== initial.state) throw new Error('Engine changed during snapshot');
      this.transaction(() => {
        this.db.prepare('DELETE FROM engine_messages WHERE scope=? AND account_id=?').run(scope, account);
        this.db.prepare('INSERT INTO engine_messages SELECT ?,?,id,message FROM engine_snapshot WHERE run=?').run(scope, account, run);
        this.cursor(scope, account, final.state);
      }, lease);
    } finally { this.db.prepare('DELETE FROM engine_snapshot WHERE run=?').run(run); }
  }
}
