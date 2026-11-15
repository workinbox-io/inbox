import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Accounts, accountSchema, publicHost } from '../src/accounts.mjs';

const account = { address: 'anna@example.com',
  imap: { host: 'imap.example.com', port: 993, username: 'anna', password: 'private-password' },
  smtp: { host: 'smtp.example.com', port: 587, username: 'anna', password: 'private-password' } };

test('credentials are encrypted and scoped to their organization', () => {
  const store = new Accounts(':memory:', 'ab'.repeat(32));
  try {
    store.put('org', 'id', account);
    assert.deepEqual(store.get('org', 'id'), account);
    assert.equal(store.get('other', 'id'), null);
    assert.deepEqual(store.list('org'), [{ id: 'id', address: account.address }]);
    const row = store.db.prepare('SELECT encrypted FROM accounts').get();
    assert.equal(row.encrypted.includes('private-password'), false);
    store.db.prepare('UPDATE accounts SET org_id=?').run('other');
    assert.throws(() => store.get('other', 'id'));
  } finally { store.close(); }
});
test('disconnect deletes credentials without contacting the provider', () => {
  const store = new Accounts(':memory:', 'ab'.repeat(32));
  try {
    store.put('org', 'id', account);
    store.remove('other', 'id');
    assert.ok(store.get('org', 'id'));
    store.remove('org', 'id');
    assert.equal(store.get('org', 'id'), null);
  } finally { store.close(); }
});
test('only encrypted IMAP and SMTP submission ports are allowed', () => {
  assert.equal(accountSchema.safeParse(account).success, true);
  assert.equal(accountSchema.safeParse({ ...account, imap: { ...account.imap, port: 143 } }).success, false);
  assert.equal(accountSchema.safeParse({ ...account, smtp: { ...account.smtp, port: 25 } }).success, false);
});
test('rejects internal, mapped, link-local and mixed DNS answers', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1']) {
    await assert.rejects(publicHost('mail.example', async () => [{ address }]));
  }
  await assert.rejects(publicHost('mail.example', async () => [{ address: '8.8.8.8' }, { address: '10.0.0.1' }]));
  assert.equal(await publicHost('mail.example', async () => [{ address: '8.8.8.8' }]), '8.8.8.8');
});

test('disconnect waits for client password creation and later mutations see disconnected state', async () => {
  const accounts = new Accounts(':memory:', 'ab'.repeat(32));
  let finish, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { finish = resolve; });
  accounts.put('org', 'connection', account);
  const operations = [];
  try {
    const creation = accounts.exclusive('org', 'connection', async () => { entered(); await pending; operations.push('created'); });
    await started;
    const removal = accounts.exclusive('org', 'connection', () => { operations.push('revoked'); accounts.remove('org', 'connection'); });
    await accounts.exclusive('different-org', 'connection', () => operations.push('independent'));
    assert.deepEqual(operations, ['independent']);
    finish(); await Promise.all([creation, removal]);
    assert.deepEqual(operations, ['independent', 'created', 'revoked']);
    await assert.rejects(accounts.exclusive('org', 'connection', () => { throw new Error('failed mutation'); }));
    assert.equal(await accounts.exclusive('org', 'connection', () => accounts.get('org', 'connection')), null);
    assert.equal(accounts.mutations.size, 0);
  } finally { accounts.close(); }
});

test('recovery starts an independent journal identity and retains the old read-only copy', () => {
  const accounts=new Accounts(':memory:','ab'.repeat(32));accounts.put('org','old',account);accounts.setBinding('org','old',{accountId:'engine-old',password:'internal-secret'});
  try {
    assert.equal(accounts.recover('org','old','new'),'new');assert.equal(accounts.get('org','old'),null);assert.deepEqual(accounts.get('org','new'),account);
    assert.equal(accounts.binding('org','old').accountId,'engine-old');assert.equal(accounts.binding('org','new'),null);assert.equal(accounts.connectionInfo('org','old').readOnly,true);
    assert.equal(accounts.recover('org','old','new'),'new');assert.equal(accounts.recover('org','old','retry-with-another-id'),'new');assert.equal(accounts.get('org','retry-with-another-id'),null);
    assert.throws(()=>accounts.recover('other-org','old','foreign'));assert.equal(accounts.get('other-org','foreign'),null);
  }finally{accounts.close();}
});

test('recovery cannot overwrite another connection and rolls back a failed retention write', () => {
  const accounts=new Accounts(':memory:','ab'.repeat(32));accounts.put('org','old',account);accounts.put('org','occupied',account);
  try {
    assert.throws(()=>accounts.recover('org','old','occupied'),/already used/);assert.deepEqual(accounts.get('org','old'),account);
    accounts.db.exec("CREATE TRIGGER reject_recovery BEFORE INSERT ON disconnected_accounts BEGIN SELECT RAISE(ABORT,'fixture write failed'); END");
    assert.throws(()=>accounts.recover('org','old','new'),/fixture write failed/);assert.deepEqual(accounts.get('org','old'),account);assert.equal(accounts.get('org','new'),null);assert.equal(accounts.replacement('org','old'),null);
  }finally{accounts.close();}
});
