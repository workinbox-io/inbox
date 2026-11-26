/** Membership is checked fresh before SMTP and periodically for already connected IMAP clients. */
export class AccessPolicy {
  constructor(accounts, { url, token, gateway, disconnect, disconnectHosted }, transport = fetch) {
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('HTTPS Workinbox authorization endpoint required');
    this.accounts = accounts; this.url = endpoint; this.token = token; this.gateway = gateway; this.disconnect = disconnect; this.disconnectHosted=disconnectHosted; this.transport = transport;
  }
  async check(scopes) {
    const owners = scopes.map(scope => ({ scope, ...this.accounts.owner(scope), ...(this.accounts.hostedList(scope).some(profile=>profile.active)?{mailboxIds:this.accounts.hostedList(scope).filter(profile=>profile.active).map(profile=>profile.mailboxId)}:{}) }));
    if (owners.some(owner => !owner.orgId || !owner.userId)) throw new Error('Connection owner must be confirmed by Workinbox');
    const response = await this.transport(this.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ owners }) });
    if (!response.ok) throw new Error('Workinbox authorization unavailable');
    const result = await response.json();
    if (!Array.isArray(result.valid) || result.valid.some(scope => !scopes.includes(scope))) throw new Error('Invalid authorization response');
    return {valid:new Set(result.valid),mailboxes:result.mailboxes??{}};
  }
  async authorize(scope) {
    try { return (await this.check([scope])).valid.has(scope); }
    catch (error) { this.gateway?.setAccepting(false); throw error; }
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const observedAt = Date.now();
        const scopes = this.accounts.db.prepare('SELECT org_id FROM accounts UNION SELECT scope AS org_id FROM hosted_accounts WHERE active=1').all().map(row => row.org_id);
        const valid = new Set();
        const mailboxes={};
        for (let offset = 0; offset < scopes.length; offset += 20) {const checked=await this.check(scopes.slice(offset, offset + 20));for(const scope of checked.valid)valid.add(scope);Object.assign(mailboxes,checked.mailboxes);}
        for(const scope of scopes)for(const profile of this.accounts.hostedList(scope).filter(profile=>profile.active)) {
          if(!valid.has(scope)||!mailboxes[scope]?.includes(profile.mailboxId)){this.gateway?.setAccepting(false);await this.disconnectHosted(scope,profile.id);}
        }
        for (const scope of scopes.filter(scope => !valid.has(scope))) {
          this.gateway?.setAccepting(false);
          const connections = this.accounts.db.prepare('SELECT id FROM accounts WHERE org_id=?').all(scope);
          for (const { id } of connections) await this.disconnect(scope, id);
        }
        if (this.gateway) {
          clearTimeout(this.lease);
          const remaining = 45000 - (Date.now() - observedAt);
          if (remaining <= 0) { this.gateway.setAccepting(false); return; }
          this.gateway.setAccepting(true);
          this.lease = setTimeout(() => this.gateway.setAccepting(false), remaining);
          this.lease.unref();
        }
      } catch { this.gateway?.setAccepting(false); }
    })();
    try { await this.refreshing; } finally { this.refreshing = null; }
  }
  start() { void this.refresh(); this.timer = setInterval(() => void this.refresh(), 30000); }
  async stop() { clearInterval(this.timer); await this.refreshing; clearTimeout(this.lease); }
}
