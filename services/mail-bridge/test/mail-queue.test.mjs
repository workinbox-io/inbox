import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Accounts } from '../src/accounts.mjs';
import { MailQueue } from '../src/mail-queue.mjs';

const account = { address: 'alice@example.com', imap: { host: 'imap.example.com', port: 993, username: 'alice', password: 'private-password' }, smtp: { host: 'smtp.example.com', port: 465, username: 'alice', password: 'private-password' } };
const input = () => ({ id: randomUUID(), to: ['bob@example.com'], cc: ['carol@example.com'], subject: 'Queued mail', text: 'Private body', files: [{ name: 'test.txt', type: 'text/plain', content: Buffer.from('file content').toString('base64') }] });
function fixture() {
  const accounts = new Accounts(':memory:', 'ab'.repeat(32)); accounts.put('org', 'connection', account);
  accounts.setBinding('org', 'connection', { accountId: 'engine', username: 'internal', password: 'internal-password' });
  const saved = new Set(), copies = [];
  const engine = { mail: async () => ({ uploadUrl: 'https://engine/upload', client: {
    query: async (_position, _limit, filter) => ({ ids: filter.hasKeyword && saved.has(filter.hasKeyword) ? ['copy'] : [] }),
    folders: async () => ({ list: [{ id: 'sent', role: 'sent' }] }),
    importMessage: async (_url, raw, _folder, _date, keywords) => { copies.push(raw); saved.add(Object.keys(keywords).find(key => key.startsWith('wi-outbox-'))); return { id: 'copy' }; },
  } }) };
  const due = () => accounts.db.exec('UPDATE outgoing_mail SET send_at=0,attempted_at=0');
  return { accounts, engine, copies, saved, due };
}

test('durable admission, MIME attachments, envelope and duplicate admission', async () => {
  const f = fixture(), delivered = [];
  const queue = new MailQueue(f.accounts, f.engine, { deliver: async (_account, payload) => delivered.push(payload) });
  try {
    const message = input(), job = await queue.enqueue('org', 'connection', message);
    assert.equal(job.state, 'queued'); assert.ok(job.sendAt >= job.createdAt + 10000);
    assert.equal(delivered.length, 0);
    assert.equal((await queue.enqueue('org', 'connection', message)).id, job.id);
    await assert.rejects(queue.enqueue('org', 'connection', { ...message, text: 'different' }), /already used/);
    const stored = f.accounts.db.prepare('SELECT payload FROM outgoing_mail').get().payload;
    assert.equal(stored.includes('Private body'), false);
    f.due(); await queue.tick();
    assert.equal(delivered.length, 1);
    assert.deepEqual(delivered[0].envelope, { from: account.address, to: ['bob@example.com', 'carol@example.com'] });
    const raw = Buffer.from(delivered[0].raw, 'base64').toString();
    assert.match(raw, /From: alice@example.com/); assert.match(raw, /test.txt/);
    assert.match(raw, new RegExp(Buffer.from('file content').toString('base64')));
    assert.equal(f.copies.length, 1); assert.equal(queue.list('org', 'connection')[0].state, 'sent');
    assert.equal(f.accounts.db.prepare('SELECT payload FROM outgoing_mail').get().payload, '');
  } finally { await queue.stop(); f.accounts.close(); }
});

test('an ambiguous SMTP response is not resent after a restart or duplicate request', async () => {
  const f = fixture(); let deliveries = 0;
  let queue = new MailQueue(f.accounts, f.engine, { deliver: async () => { deliveries++; throw new Error('connection dropped after DATA'); } });
  try {
    const message = input(); await queue.enqueue('org', 'connection', message); f.due(); await queue.tick();
    assert.equal(queue.list('org', 'connection')[0].state, 'uncertain');
    queue = new MailQueue(f.accounts, f.engine, { deliver: async () => { deliveries++; } });
    f.due(); await queue.tick();
    assert.equal((await queue.enqueue('org', 'connection', message)).state, 'uncertain');
    assert.equal(deliveries, 1);
  } finally { await queue.stop(); f.accounts.close(); }
});

test('accepted mail retries only Sent persistence, including a lost import response', async () => {
  const f = fixture(); let deliveries = 0, copies = 0;
  const original = f.engine.mail;
  f.engine.mail = async () => {
    const session = await original();
    const importMessage = session.client.importMessage;
    session.client.importMessage = async (...args) => { copies++; await importMessage(...args); throw new Error('lost import response'); };
    return session;
  };
  let queue = new MailQueue(f.accounts, f.engine, { deliver: async () => { deliveries++; } });
  try {
    await queue.enqueue('org', 'connection', input()); f.due(); await queue.tick();
    assert.equal(queue.list('org', 'connection')[0].state, 'accepted');
    queue = new MailQueue(f.accounts, f.engine, { deliver: async () => { deliveries++; } });
    f.due(); await queue.tick();
    assert.equal(deliveries, 1); assert.equal(copies, 1);
    assert.equal(queue.list('org', 'connection')[0].state, 'sent');
  } finally { await queue.stop(); f.accounts.close(); }
});

test('undo cancels only caller-owned queued mail', async () => {
  const f = fixture(); let deliveries = 0;
  const queue = new MailQueue(f.accounts, f.engine, { deliver: async () => { deliveries++; } });
  try {
    const job = await queue.enqueue('org', 'connection', input());
    assert.throws(() => queue.cancelJob('other', 'connection', job.id));
    assert.equal(queue.cancelJob('org', 'connection', job.id).state, 'cancelled');
    f.due(); await queue.tick(); assert.equal(deliveries, 0);
    assert.deepEqual(queue.list('other', 'connection'), []);
  } finally { await queue.stop(); f.accounts.close(); }
});

test('invalid addresses, extra From and invalid attachment encoding never enter the queue', async () => {
  const f = fixture(), queue = new MailQueue(f.accounts, f.engine);
  try {
    await assert.rejects(queue.enqueue('org', 'connection', { ...input(), from: 'spoof@example.com' }));
    await assert.rejects(queue.enqueue('org', 'connection', { ...input(), to: ['invalid'] }));
    await assert.rejects(queue.enqueue('org', 'connection', { ...input(), files: [{ name: 'a', type: 'text/plain', content: 'not-base64' }] }));
    assert.deepEqual(queue.list('org', 'connection'), []);
  } finally { await queue.stop(); f.accounts.close(); }
});

test('a failure recording SMTP acceptance cannot turn a delivery into a safe-to-retry failure', async () => {
  const f = fixture(), queue = new MailQueue(f.accounts, f.engine, { deliver: async () => {} });
  try {
    await queue.enqueue('org', 'connection', input());
    f.accounts.db.exec("CREATE TRIGGER fail_accept BEFORE UPDATE ON outgoing_mail WHEN NEW.state='accepted' BEGIN SELECT RAISE(ABORT,'storage unavailable'); END");
    f.due(); await queue.tick();
    assert.equal(queue.list('org', 'connection')[0].state, 'uncertain');
  } finally { await queue.stop(); f.accounts.close(); }
});
