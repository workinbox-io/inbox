import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from 'node:tls';
import { setTimeout } from 'node:timers/promises';

const dir = mkdtempSync(join(tmpdir(), 'workinbox-protocol-e2e-'));
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let container;
try {
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost']);
  run('openssl', ['pkcs12', '-export', '-inkey', join(dir, 'key.pem'), '-in', join(dir, 'cert.pem'), '-out', join(dir, 'test.p12'), '-passout', 'pass:changeit']);
  chmodSync(dir, 0o755);
  chmodSync(join(dir, 'test.p12'), 0o644);
  container = run('docker', ['create', '--rm', '-p', '127.0.0.1::3993', '-p', '127.0.0.1::3465',
    '-e', 'GREENMAIL_OPTS=-Dgreenmail.setup.test.all -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.users=alice:secret@example.com,bob:secret@example.com -Dgreenmail.tls.keystore.file=/test.p12 -Dgreenmail.tls.keystore.password=changeit',
    'greenmail/standalone@sha256:d6db42a4fc258fec0948b1ae7b579fd06947cc92087c162ec0597972a6c36850']);
  run('docker', ['cp', join(dir, 'test.p12'), `${container}:/test.p12`]);
  run('docker', ['start', container]);
  const port = (inside) => run('docker', ['port', container, `${inside}/tcp`]).split(':').at(-1);
  const imapPort = port(3993), smtpPort = port(3465);
  const deadline = Date.now() + 30000;
  while (true) {
    const ready = await new Promise(resolve => {
      const socket = connect({ host: '127.0.0.1', port: Number(imapPort), servername: 'localhost', ca: readFileSync(join(dir, 'cert.pem')) });
      socket.setTimeout(500);
      socket.once('data', () => { socket.destroy(); resolve(true); });
      socket.once('secureConnect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    if (ready) break;
    if (Date.now() > deadline) throw new Error('GreenMail startup timed out');
    await setTimeout(250);
  }
  const result = spawnSync(process.execPath, ['--test', 'test/protocol.e2e.mjs'], {
    cwd: new URL('..', import.meta.url), stdio: 'inherit',
    env: { ...process.env, NODE_EXTRA_CA_CERTS: join(dir, 'cert.pem'), E2E_IMAP_PORT: imapPort, E2E_SMTP_PORT: smtpPort },
  });
  process.exitCode = result.status ?? 1;
  if (result.status === 0) {
    const worker = run('docker', ['create', '--rm', '--network', `container:${container}`, '-e', 'NODE_EXTRA_CA_CERTS=/tmp/e2e/cert.pem',
      'workinbox-mail-bridge:test', 'node', '--test', '/tmp/e2e/sync.e2e.mjs']);
    try {
      run('docker', ['cp', new URL('./sync.e2e.mjs', import.meta.url).pathname, `${worker}:/tmp/sync.e2e.mjs`]);
      run('docker', ['cp', dir, `${worker}:/tmp/e2e`]);
      run('docker', ['cp', new URL('./sync.e2e.mjs', import.meta.url).pathname, `${worker}:/tmp/e2e/sync.e2e.mjs`]);
      const synchronized = spawnSync('docker', ['start', '-a', worker], { stdio: 'inherit' });
      process.exitCode = synchronized.status ?? 1;
    } finally { try { run('docker', ['rm', '-f', worker]); } catch {} }
  }
} catch (error) {
  if (container) console.error(run('docker', ['logs', container]));
  throw error;
} finally {
  if (container) run('docker', ['rm', '-f', container]);
  rmSync(dir, { recursive: true, force: true });
}
