import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { synchronizeImap } from '/app/services/mail-bridge/src/imap-sync.mjs';
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
