import { lookup } from 'node:dns/promises';
import { synchronizeImap } from './imap-sync.mjs';

/** Two accounts at a time; mbsync keeps the UID journal between retries and service restarts. */
export class SyncScheduler {
  constructor(accounts, engine, synchronize = synchronizeImap, resolveEngine = async host => (await lookup(host)).address) {
    this.accounts = accounts; this.engine = engine; this.synchronize = synchronize; this.resolveEngine = resolveEngine;
    this.active = new Map(); this.blocked = new Set(); this.stopped = false;
  }
  key(scope, id) { return JSON.stringify([scope, id]); }
  async cancel(scope, id) {
    const task = this.active.get(this.key(scope, id));
    if (task) { task.controller.abort(); await task.promise; }
  }
  async pause(scope, id) { this.blocked.add(this.key(scope, id)); await this.cancel(scope, id); }
  resume(scope, id) { this.blocked.delete(this.key(scope, id)); }
  run(scope, id) {
    const key = this.key(scope, id);
    if (this.stopped || this.blocked.has(key) || this.active.has(key) || this.active.size >= 2) return;
    const controller = new AbortController();
    const task = { controller, promise: null };
    this.active.set(key, task);
    task.promise = (async () => {
      let timeout;
      try {
        const account = this.accounts.get(scope, id);
        if (!account) return;
        const binding = await this.engine.ensure(this.accounts, scope, id);
        controller.signal.throwIfAborted();
        this.accounts.setStatus(scope, id, 'syncing');
        timeout = setTimeout(() => controller.abort(), 300000);
        await this.synchronize({ scope, id, far: account.imap,
          near: { host: this.engine.imapHost, ip: await this.resolveEngine(this.engine.imapTarget ?? this.engine.imapHost), port: 993, username: binding.username, password: binding.password },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) this.accounts.setStatus(scope, id, 'ready', Date.now());
      } catch { this.accounts.setStatus(scope, id, 'error'); }
      finally { clearTimeout(timeout); this.active.delete(key); }
    })();
    return task.promise;
  }
  tick() {
    if (this.stopped) return;
    const rows = this.accounts.db.prepare(`SELECT a.org_id,a.id FROM accounts a LEFT JOIN engine_bindings e ON e.org_id=a.org_id AND e.id=a.id ORDER BY coalesce(e.attempted_at,0),a.created_at`).all();
    for (const row of rows) this.run(row.org_id, row.id);
  }
  start() { this.tick(); this.timer = setInterval(() => this.tick(), 30000); }
  async stop() {
    this.stopped = true; clearInterval(this.timer);
    for (const { controller } of this.active.values()) controller.abort();
    await Promise.all([...this.active.values()].map(task => task.promise));
  }
}
