import { createHash, randomBytes } from 'node:crypto';
import { JmapClient } from '../../../src/lib/mail/jmap.ts';

const clientPermissions = Object.fromEntries([
  'authenticate', 'imapAuthenticate', 'imapCapability', 'imapId', 'imapEnable',
  'imapList', 'imapLsub', 'imapNamespace', 'imapSelect', 'imapExamine', 'imapStatus',
  'imapFetch', 'imapSearch', 'imapSort', 'imapThread', 'imapIdle', 'imapStore',
  'imapAppend', 'imapCopy', 'imapMove', 'imapCreate', 'imapDelete', 'imapRename',
  'imapExpunge', 'imapSubscribe', 'imapMyRights', 'imapListRights',
].map(permission => [permission, true]));

/** Privileged operations stay on the bridge. Browser callers cannot choose engine account IDs. */
export class EngineAdmin {
  constructor({ url, token, domainId, domain, imapHost, imapTarget }, transport = fetch) {
    if (!url || new URL(url).protocol !== 'https:' || !token || !domainId || !domain || !imapHost) throw new Error('Complete HTTPS engine configuration required');
    this.url = url; this.token = token; this.domainId = domainId; this.domain = domain; this.imapHost = imapHost; this.transport = transport;
    this.imapTarget = imapTarget ?? imapHost;
  }
  async call(method, args) {
    const response = await this.transport(this.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ using: ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'], methodCalls: [[method, args, '0']] }),
    });
    if (!response.ok) throw new Error(`Engine administration HTTP ${response.status}`);
    const body = await response.json();
    const result = body.methodResponses?.find(item => item[2] === '0');
    if (!result || result[0] !== method) throw new Error('Engine administration failed');
    return result[1];
  }
  async ensure(accounts, scope, id) {
    let binding = accounts.binding(scope, id);
    if (!binding) {
      const name = `wi-${createHash('sha256').update(JSON.stringify([scope, id])).digest('hex').slice(0, 48)}`;
      binding = { name, username: `${name}@${this.domain}`, password: randomBytes(32).toString('base64url') };
      // Persist credentials before the remote call, so a lost create response can be reconciled safely.
      accounts.setBinding(scope, id, binding);
    }
    if (binding.accountId) return binding;
    const query = await this.call('x:Account/query', { filter: { name: binding.name, domainId: this.domainId } });
    if (query.ids?.length) {
      const found = await this.call('x:Account/get', { ids: query.ids, properties: ['id', 'name', 'domainId'] });
      const exact = found.list?.filter(account => account.name === binding.name && account.domainId === this.domainId);
      if (exact?.length !== 1) throw new Error('Engine account identity conflict');
      binding.accountId = exact[0].id;
    } else {
      const created = await this.call('x:Account/set', { create: { connection: {
        '@type': 'User', name: binding.name, domainId: this.domainId,
        credentials: { '0': { '@type': 'Password', secret: binding.password } },
        roles: { '@type': 'User' }, permissions: { '@type': 'Inherit' }, encryptionAtRest: { '@type': 'Disabled' },
      } } });
      if (!created.created?.connection?.id) throw new Error('Engine account creation failed');
      binding.accountId = created.created.connection.id;
    }
    accounts.setBinding(scope, id, binding);
    return binding;
  }
  async setDiskQuota(accounts, scope, id, binding, bytes) {
    if(!Number.isSafeInteger(bytes)||bytes<=0)throw new Error('A positive mailbox quota is required');
    if(binding.diskQuota===bytes)return;
    const result=await this.call('x:Account/set',{update:{[binding.accountId]:{'quotas/maxDiskQuota':bytes}}});
    if(!Object.hasOwn(result.updated??{},binding.accountId))throw new Error('Engine storage quota update failed');
    binding.diskQuota=bytes;accounts.setBinding(scope,id,binding);
  }
  async clientPasswords(binding) {
    const result = await this.call('x:AppPassword/get', { accountId: binding.accountId });
    if (result.accountId !== binding.accountId || !Array.isArray(result.list)) throw new Error('Engine password listing failed');
    return result.list.map(({ id, description }) => ({ id, description }));
  }
  async createClientPassword(binding, description, allowFolderChanges = true) {
    if ((await this.clientPasswords(binding)).length >= 20) throw new Error('Revoke an unused client password first');
    const permissions={...clientPermissions};
    if(!allowFolderChanges)for(const name of ['imapCreate','imapDelete','imapRename'])delete permissions[name];
    const result = await this.call('x:AppPassword/set', { accountId: binding.accountId, create: { device: {
      description, permissions: { '@type': 'Replace', permissions },
    } } });
    const password = result.created?.device;
    if (result.accountId !== binding.accountId || !password?.id || !password.secret) throw new Error('Engine password creation failed');
    return { id: password.id, secret: password.secret, description };
  }
  async revokeClientPassword(binding, id) {
    let result;
    try { result = await this.call('x:AppPassword/set', { accountId: binding.accountId, destroy: [id] }); }
    finally { this.onClientRevoked?.(); }
    if (result.accountId !== binding.accountId || (!result.destroyed?.includes(id) && result.notDestroyed?.[id]?.type !== 'notFound')) throw new Error('Engine password revocation failed');
  }
  async revokeClientPasswords(binding) {
    for (const password of await this.clientPasswords(binding)) await this.revokeClientPassword(binding, password.id);
  }
  async mail(binding) {
    const url = new URL(this.url); url.pathname = '/jmap/session'; url.search = '';
    const authorization = `Basic ${Buffer.from(`${binding.username}:${binding.password}`).toString('base64')}`;
    const response = await this.transport(url, { headers: { authorization }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Engine mailbox sign-in failed');
    const session = await response.json();
    if (session.primaryAccounts?.['urn:ietf:params:jmap:mail'] !== binding.accountId) throw new Error('Engine mailbox identity mismatch');
    const download = new URL(session.downloadUrl);
    const path = download.pathname.replace(/%7B(accountId|blobId|name)%7D/g, '{$1}');
    const upload = new URL(session.uploadUrl);
    return { client: new JmapClient(this.url, authorization, binding.accountId, this.transport), downloadUrl: `${new URL(this.url).origin}${path}${download.search}`,
      uploadUrl: `${new URL(this.url).origin}${upload.pathname.replace(/%7BaccountId%7D/g, '{accountId}')}${upload.search}` };
  }
}
