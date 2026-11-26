import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:tls';
import { clientTls } from '../src/client-tls.mjs';
import { ImapGateway } from '../src/imap-gateway.mjs';
import { Submission } from '../src/submission.mjs';

test('IMAP and SMTP present trusted new and legacy certificates through SNI', { timeout: 15000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'mail-client-tls-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const certificate = hostname => {
    const key = join(directory, hostname + '.key'), cert = join(directory, hostname + '.crt');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
      '-days', '1', '-subj', '/CN=' + hostname, '-addext', 'subjectAltName=DNS:' + hostname], { stdio: 'ignore' });
    return { key, cert };
  };
  const current = certificate('mail.test'), legacy = certificate('legacy.test');
  const env = { MAIL_CLIENT_TLS_KEY: current.key, MAIL_CLIENT_TLS_CERT: current.cert };
  assert.equal(clientTls(env).SNICallback, undefined);
  assert.throws(() => clientTls({ ...env, MAIL_CLIENT_TLS_LEGACY_CERT: legacy.cert }));
  const tls = clientTls({ ...env, MAIL_CLIENT_TLS_LEGACY_KEY: legacy.key, MAIL_CLIENT_TLS_LEGACY_CERT: legacy.cert });
  const gateway = new ImapGateway({ ...tls, host: '127.0.0.1', servername: 'legacy.test', port: 9 });
  const smtp = new Submission({ ...tls, accounts: {}, engine: {}, sourceConfig: {} });
  smtp.setAccepting(true);
  t.after(() => gateway.close()); t.after(() => smtp.close());
  await gateway.listen(0, '127.0.0.1'); await smtp.listen(0, '127.0.0.1');
  const handshake = (port, servername) => new Promise((resolve, reject) => {
    let cn, error;
    const socket = connect({ host: '127.0.0.1', port, servername, ca: [readFileSync(current.cert), readFileSync(legacy.cert)], rejectUnauthorized: true });
    socket.setTimeout(3000, () => socket.destroy(new Error('TLS handshake timed out')));
    socket.on('data', () => {});
    socket.once('error', cause => { error = cause; });
    socket.once('close', () => error ? reject(error) : resolve(cn));
    socket.once('secureConnect', () => { cn = socket.getPeerCertificate().subject.CN; socket.end(); });
  });
  for (const port of [gateway.server.address().port, smtp.server.server.address().port]) {
    assert.equal(await handshake(port, 'mail.test'), 'mail.test');
    assert.equal(await handshake(port, 'legacy.test'), 'legacy.test');
    await assert.rejects(handshake(port, 'unknown.test'), /Hostname\/IP does not match/);
    assert.equal(await handshake(port, 'mail.test'), 'mail.test');
  }
});
