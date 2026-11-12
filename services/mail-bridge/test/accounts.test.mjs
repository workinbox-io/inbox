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
