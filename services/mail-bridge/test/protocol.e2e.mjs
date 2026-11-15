import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { verify } from '../src/verify.mjs';

// Local fixture only: production verification always resolves and checks public DNS.
const account = {
  address: 'alice@example.com',
  imap: { host: 'localhost', port: Number(process.env.E2E_IMAP_PORT ?? 19993), username: 'alice', password: 'secret' },
  smtp: { host: 'localhost', port: Number(process.env.E2E_SMTP_PORT ?? 1465), username: 'alice', password: 'secret' },
};
test('TLS IMAP/SMTP roundtrip, flags, move, delete and bad credentials', { timeout: 60000 }, async () => {
  assert.ok(process.env.NODE_EXTRA_CA_CERTS, 'Trust the local fixture certificate with NODE_EXTRA_CA_CERTS');
  const checked = await verify(account, async () => '127.0.0.1');
  assert.equal(checked.ok, true);
  assert.ok(checked.folders.some(folder => folder.path === 'INBOX'));
  await assert.rejects(verify({ ...account, imap: { ...account.imap, password: 'wrong' } }, async () => '127.0.0.1'));
  const imap = new ImapFlow({ host: '127.0.0.1', port: Number(process.env.E2E_IMAP_PORT ?? 19993), secure: true, tls: { servername: 'localhost' },
    auth: { user: 'alice', pass: 'secret' }, logger: false });
  imap.on('error', () => {});
  const smtp = nodemailer.createTransport({ host: '127.0.0.1', port: Number(process.env.E2E_SMTP_PORT ?? 1465), secure: true, tls: { servername: 'localhost' },
    auth: { user: 'alice', pass: 'secret' }, disableFileAccess: true, disableUrlAccess: true });
  const id = randomUUID();
  const folder = `e2e-${id}`;
  try {
    await smtp.sendMail({ from: account.address, to: account.address, subject: id, text: 'Roundtrip body',
      attachments: [{ filename: 'test.txt', content: Buffer.from('attachment-content') }] });
    await imap.connect();
    await imap.mailboxOpen('INBOX');
    const uids = await imap.search({ header: { subject: id } }, { uid: true });
    assert.equal(uids.length, 1);
    const uid = uids[0];
    const fetched = await imap.fetchOne(String(uid), { source: true }, { uid: true });
    assert.match(fetched.source.toString(), /Roundtrip body/);
    assert.match(fetched.source.toString(), /test.txt/);
    await imap.messageFlagsAdd(String(uid), ['\\Seen', '\\Flagged'], { uid: true });
    const flagged = await imap.fetchOne(String(uid), { flags: true }, { uid: true });
    assert.ok(flagged.flags.has('\\Seen'));
    assert.ok(flagged.flags.has('\\Flagged'));
    await imap.mailboxCreate(folder);
    await imap.messageMove(String(uid), folder, { uid: true });
    await imap.mailboxOpen(folder);
    const moved = await imap.search({ all: true }, { uid: true });
    assert.equal(moved.length, 1);
    await imap.messageDelete(String(moved[0]), { uid: true });
    assert.deepEqual(await imap.search({ all: true }, { uid: true }), []);
    await imap.mailboxOpen('INBOX');
    await imap.mailboxDelete(folder);
  } finally { imap.close(); smtp.close(); }
});
