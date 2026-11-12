import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Accounts } from '../src/accounts.mjs';
import { EngineAdmin } from '../src/engine-admin.mjs';
import { SyncScheduler } from '../src/scheduler.mjs';

const input = { address: 'a@example.com', imap: { host: 'imap.example.com', port: 993, username: 'a', password: 'external-secret' }, smtp: { host: 'smtp.example.com', port: 465, username: 'a', password: 'external-secret' } };
const binding = { accountId: 'engine-id', username: 'internal@example.test', password: 'engine-secret' };
const store = () => new Accounts(':memory:', 'ab'.repeat(32));
const engine = { imapHost: 'engine.example.com', ensure: async (accounts, scope, id) => { accounts.setBinding(scope, id, binding); return binding; } };

test('engine credentials survive failed creation and are reconciled without replacement', async () => {
  const accounts = store(); accounts.put('org', 'id', input);
  let first = true, originalSecret;
  const transport = async (_url, request) => {
    const [method, args] = JSON.parse(request.body).methodCalls[0];
    if (method === 'x:Account/query') return Response.json({ methodResponses: [[method, { ids: first ? [] : ['existing'] }, '0']] });
    if (method === 'x:Account/set') { originalSecret = args.create.connection.credentials['0'].secret; first = false; throw new Error('lost response'); }
    const saved = accounts.binding('org', 'id');
    return Response.json({ methodResponses: [[method, { list: [{ id: 'existing', name: saved.name, domainId: 'domain' }] }, '0']] });
  };
  const admin = new EngineAdmin({ url: 'https://engine.example.com/jmap/', token: 'admin-token', domainId: 'domain', domain: 'example.test', imapHost: 'engine.example.com' }, transport);
  try {
    await assert.rejects(admin.ensure(accounts, 'org', 'id'), /lost response/);
    const recovered = await admin.ensure(accounts, 'org', 'id');
    assert.equal(recovered.accountId, 'existing'); assert.equal(recovered.password, originalSecret);
    assert.equal(JSON.stringify(accounts.list('org')).includes(originalSecret), false);
    const encrypted = accounts.db.prepare('SELECT encrypted FROM engine_bindings').get().encrypted;
    assert.equal(encrypted.includes(originalSecret), false);
  } finally { accounts.close(); }
});

test('scheduler uses saved credentials and records a successful checkpoint', async () => {
  const accounts = store(); accounts.put('org', 'id', input);
  let called;
  const scheduler = new SyncScheduler(accounts, { ...engine, imapTarget: 'stalwart' }, async options => { called = options; }, async host => {
    assert.equal(host, 'stalwart'); return '127.0.0.1';
  });
  try {
    await scheduler.run('org', 'id');
    assert.equal(called.far.password, input.imap.password);
    assert.equal(called.near.password, binding.password);
    assert.equal(called.near.host, 'engine.example.com');
    assert.equal(accounts.status('org', 'id').state, 'ready');
    assert.ok(accounts.status('org', 'id').syncedAt > 0);
  } finally { await scheduler.stop(); accounts.close(); }
});

test('cancel waits for the running task before credentials can be removed', async () => {
  const accounts = store(); accounts.put('org', 'id', input);
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let stopped = false;
  const scheduler = new SyncScheduler(accounts, engine, ({ signal }) => new Promise((resolve, reject) => {
    started(); signal.addEventListener('abort', () => { stopped = true; reject(new Error('cancel')); }, { once: true });
  }), async () => '127.0.0.1');
  try {
    scheduler.run('org', 'id'); await ready;
    await scheduler.cancel('org', 'id');
    assert.equal(stopped, true); assert.equal(scheduler.active.size, 0);
    accounts.remove('org', 'id');
    assert.equal(accounts.get('org', 'id'), null); assert.deepEqual(accounts.binding('org', 'id'), binding);
    assert.equal(accounts.list('org')[0].sync.state, 'disconnected');
    assert.equal(accounts.connectionInfo('org', 'id').readOnly, true);
    assert.equal(JSON.stringify(accounts.connectionInfo('org', 'id')).includes('external-secret'), false);
    assert.throws(() => accounts.put('org', 'id', input), /new connection id/);
  } finally { await scheduler.stop(); accounts.close(); }
});

test('failing accounts do not starve other accounts and errors cannot expose credentials', async () => {
  const accounts = store(); for (const id of ['a', 'b', 'c']) accounts.put('org', id, input);
  const seen = [];
  const scheduler = new SyncScheduler(accounts, engine, async ({ id }) => { seen.push(id); throw new Error('engine-secret external-secret'); }, async () => '127.0.0.1');
  try {
    scheduler.tick(); await Promise.all([...scheduler.active.values()].map(task => task.promise));
    scheduler.tick(); await Promise.all([...scheduler.active.values()].map(task => task.promise));
    assert.ok(seen.includes('c'));
    assert.equal(JSON.stringify(accounts.list('org')).includes('secret'), false);
  } finally { await scheduler.stop(); accounts.close(); }
});

test('changing source identity cannot reuse an existing UID journal', () => {
  const accounts = store(); accounts.put('org', 'id', input);
  try {
    assert.throws(() => accounts.put('org', 'id', { ...input, imap: { ...input.imap, username: 'someone-else' } }), /different mailbox/);
    accounts.put('org', 'id', { ...input, imap: { ...input.imap, password: 'rotated-password' } });
    assert.equal(accounts.get('org', 'id').imap.password, 'rotated-password');
  } finally { accounts.close(); }
});
