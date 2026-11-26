import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineAdmin } from '../src/engine-admin.mjs';

const binding = { accountId: 'owned-account' };
const admin = transport => new EngineAdmin({ url: 'https://engine.example/jmap/', token: 'admin-token', domainId: 'domain', domain: 'example.test', imapHost: 'imap.example.test' }, transport);

test('device passwords grant IMAP commands without SMTP, JMAP or administration privileges', async () => {
  let permissions;
  const engine = admin(async (_url, request) => {
    const [method, args] = JSON.parse(request.body).methodCalls[0];
    assert.equal(args.accountId, binding.accountId);
    let result;
    if (method.endsWith('/get')) result = { list: [{ id: 'old', description: 'Old device', secret: 'never-return-this' }] };
    else { permissions = args.create.device.permissions; result = { created: { device: { id: 'new', secret: 'one-time-secret', permissions: { '@type': 'Inherit' } } } }; }
    return Response.json({ methodResponses: [[method, { accountId: binding.accountId, ...result }, '0']] });
  });
  assert.deepEqual(await engine.clientPasswords(binding), [{ id: 'old', description: 'Old device' }]);
  assert.deepEqual(await engine.createClientPassword(binding, 'Laptop'), { id: 'new', secret: 'one-time-secret', description: 'Laptop' });
  assert.equal(permissions['@type'], 'Replace');
  assert.equal(permissions.permissions.imapEnable, true);
  assert.equal(permissions.permissions.imapFetch, true);
  assert.equal(permissions.permissions.imapStore, true);
  assert.ok(Object.keys(permissions.permissions).every(name => name === 'authenticate' || name.startsWith('imap')));
  assert.equal(permissions.permissions.imapAclSet, undefined);
});

test('foreign-account responses and failed revocation cannot report success', async () => {
  const engine = admin(async (_url, request) => {
    const [method] = JSON.parse(request.body).methodCalls[0];
    return Response.json({ methodResponses: [[method, { accountId: 'other', list: [], destroyed: ['device'], created: { device: { id: 'device', secret: 'foreign-secret' } } }, '0']] });
  });
  await assert.rejects(engine.clientPasswords(binding), /listing failed/);
  await assert.rejects(engine.createClientPassword(binding, 'Laptop'), /listing failed/);
  await assert.rejects(engine.revokeClientPassword(binding, 'device'), /revocation failed/);
  engine.call = async () => ({ accountId: binding.accountId, notDestroyed: { device: { type: 'serverFail' } } });
  await assert.rejects(engine.revokeClientPassword(binding, 'device'), /revocation failed/);
  engine.call = async () => ({ accountId: binding.accountId, notDestroyed: { device: { type: 'notFound' } } });
  await engine.revokeClientPassword(binding, 'device');
});
