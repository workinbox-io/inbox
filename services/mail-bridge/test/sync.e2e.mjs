import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { synchronizeImap } from '/app/services/mail-bridge/src/imap-sync.mjs';
import { MailQueue, deliverSmtp } from '/app/services/mail-bridge/src/mail-queue.mjs';
import { Accounts } from '/app/services/mail-bridge/src/accounts.mjs';
const require = createRequire('/app/services/mail-bridge/package.json');
const { ImapFlow } = require('imapflow');

test('bidirectional sync preserves new messages, flags, moves, expunges and restart state', { timeout: 90000 }, async () => {
  const connect = async user => {
    const client = new ImapFlow({ host: '127.0.0.1', port: 3993, secure: true, tls: { servername: 'localhost' }, auth: { user, pass: 'secret' }, logger: false });
    client.on('error', () => {}); await client.connect(); return client;
  };
  const alice = await connect('alice'), bob = await connect('bob');
  const endpoint = user => ({ host: 'localhost', ip: '127.0.0.1', port: 3993, username: user, password: 'secret' });
  const sync = () => synchronizeImap({ scope: 'test', id: 'one', far: endpoint('alice'), near: endpoint('bob'),
    dataDir: '/tmp/sync-state', caFile: '/tmp/e2e/cert.pem', resolveFar: async () => '127.0.0.1' });
  const marker = randomUUID();
  const raw = title => Buffer.from(`From: alice@example.com\r\nTo: bob@example.com\r\nSubject: ${marker}-${title}\r\nMessage-ID: <${marker}-${title}@example.com>\r\n\r\nOriginal body`);
  const find = async (client, folder, title) => { await client.mailboxOpen(folder); return client.search({ header: { subject: `${marker}-${title}` } }, { uid: true }); };
  try {
    await alice.append('INBOX', raw('first'), ['\\Seen'], new Date('2026-01-01T00:00:00Z'));
    await sync();
    let found = await find(bob, 'INBOX', 'first'); assert.equal(found.length, 1);
    const message = await bob.fetchOne(String(found[0]), { source: true, flags: true, internalDate: true }, { uid: true });
    assert.match(message.source.toString(), /Original body/); assert.ok(message.flags.has('\\Seen'));
    assert.equal(message.internalDate.toISOString(), '2026-01-01T00:00:00.000Z');
    await bob.messageFlagsAdd(String(found[0]), ['\\Flagged'], { uid: true });
    await sync();
    found = await find(alice, 'INBOX', 'first');
    assert.ok((await alice.fetchOne(String(found[0]), { flags: true }, { uid: true })).flags.has('\\Flagged'));
    await alice.mailboxCreate('Archive');
    await alice.messageMove(String(found[0]), 'Archive', { uid: true });
    await sync();
    assert.equal((await find(bob, 'INBOX', 'first')).length, 0);
    found = await find(bob, 'Archive', 'first'); assert.equal(found.length, 1);
    await bob.messageDelete(String(found[0]), { uid: true });
    await sync();
    assert.equal((await find(alice, 'Archive', 'first')).length, 0);
    await bob.append('INBOX', raw('reverse'));
    await sync(); await sync();
    assert.equal((await find(alice, 'INBOX', 'reverse')).length, 1);
    assert.equal((await find(bob, 'INBOX', 'reverse')).length, 1);
    await assert.rejects(synchronizeImap({ scope: 'test', id: 'one', far: { ...endpoint('alice'), password: 'wrong' }, near: endpoint('bob'), dataDir: '/tmp/sync-state', caFile: '/tmp/e2e/cert.pem', resolveFar: async () => '127.0.0.1' }));
    await sync();
    assert.equal((await find(alice, 'INBOX', 'reverse')).length, 1);
  } finally { alice.close(); bob.close(); }
});

test('durable queue sends MIME and attachments through real SMTPS and saves one Sent copy', { timeout: 30000 }, async () => {
  const connect = async user => {
    const client = new ImapFlow({ host: '127.0.0.1', port: 3993, secure: true, tls: { servername: 'localhost' }, auth: { user, pass: 'secret' }, logger: false });
    client.on('error', () => {}); await client.connect(); return client;
  };
  const canonical = await connect('engine'), recipient = await connect('bob');
  const accounts = new Accounts(':memory:', 'ab'.repeat(32));
  accounts.put('scope', 'account', { address: 'alice@example.com', imap: { host: 'localhost', port: 993, username: 'alice', password: 'secret' }, smtp: { host: 'localhost', port: 465, username: 'alice', password: 'secret' } });
  accounts.setBinding('scope', 'account', { accountId: 'canonical' });
  await canonical.mailboxCreate('Sent');
  const markers = new Set();
  const engine = { mail: async () => ({ uploadUrl: 'unused', client: {
    query: async (_position, _limit, filter) => ({ ids: filter.hasKeyword && markers.has(filter.hasKeyword) ? ['saved'] : [] }),
    folders: async () => ({ list: [{ id: 'sent', role: 'sent' }] }),
    importMessage: async (_url, raw, _folder, date, flags) => { await canonical.append('Sent', Buffer.from(raw), ['\\Seen'], new Date(date)); markers.add(Object.keys(flags).find(flag => flag.startsWith('wi-outbox-'))); return { id: 'saved' }; },
  } }) };
  const queue = new MailQueue(accounts, engine, { deliver: (account, payload) => deliverSmtp({ ...account, smtp: { ...account.smtp, port: 3465 } }, payload, async () => '127.0.0.1') });
  try {
    const id = randomUUID();
    await queue.enqueue('scope', 'account', { id, to: ['bob@example.com'], subject: id, text: 'Queue delivery body', files: [{ name: 'queue.txt', type: 'text/plain', content: Buffer.from('queue attachment').toString('base64') }] });
    accounts.db.exec('UPDATE outgoing_mail SET send_at=0,attempted_at=0');
    await queue.tick();
    assert.equal(queue.list('scope', 'account')[0].state, 'sent');
    await recipient.mailboxOpen('INBOX');
    const received = await recipient.search({ header: { subject: id } }, { uid: true }); assert.equal(received.length, 1);
    const raw = await recipient.fetchOne(String(received[0]), { source: true }, { uid: true });
    assert.match(raw.source.toString(), /Queue delivery body/); assert.match(raw.source.toString(), /queue.txt/);
    await canonical.mailboxOpen('Sent');
    assert.equal((await canonical.search({ header: { subject: id } }, { uid: true })).length, 1);
    assert.equal((await queue.enqueue('scope', 'account', { id, to: ['bob@example.com'], subject: id, text: 'Queue delivery body', files: [{ name: 'queue.txt', type: 'text/plain', content: Buffer.from('queue attachment').toString('base64') }] })).state, 'sent');
  } finally { await queue.stop(); accounts.close(); canonical.close(); recipient.close(); }
});
