import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publicHost } from './accounts.mjs';

function quoted(value) {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid IMAP configuration value');
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
const shell = value => `'${value.replaceAll("'", "'\\''")}'`;

/** All endpoints, including the trusted engine, use verified TLS. Only resolved IPs reach the tunnel. */
export function syncConfig(far, near, stateDir, caFile) {
  const store = (name, server) => {
    if (!/^[a-zA-Z0-9.-]+$/.test(server.host) || !/^[a-fA-F0-9:.]+$/.test(server.ip) || !Number.isInteger(server.port) || server.port < 1 || server.port > 65535) throw new Error('Invalid IMAP endpoint');
    const address = server.ip.includes(':') ? `[${server.ip}]` : server.ip;
    const tunnel = `openssl s_client -quiet -connect ${shell(`${address}:${server.port}`)} -servername ${shell(server.host)} -verify_hostname ${shell(server.host)} -verify_return_error -CAfile ${shell(caFile)}`;
    return `IMAPAccount ${name}\nHost ${quoted(server.host)}\nUser ${quoted(server.username)}\nPassCmd ${quoted(`printf '%s' "$WI_${name.toUpperCase()}_PASSWORD"`)}\nTunnel ${quoted(tunnel)}\nTLSType None\nAuthMechs LOGIN\n\nIMAPStore ${name}\nAccount ${name}\n\n`;
  };
  return store('far', far) + store('near', near) + `Channel account\nFar :far:\nNear :near:\nPatterns *\nSync All\nCreate Both\nRemove Both\nExpungeSolo Both\nCopyArrivalDate yes\nSyncState ${quoted(`${stateDir}/`)}\n`;
}

/** mbsync owns its UID journal and locking; never delete this state while an account is connected. */
export async function synchronizeImap({ scope, id, far, near, dataDir = '/data/sync', resolveFar = publicHost, caFile = '/etc/ssl/certs/ca-certificates.crt', executable = 'mbsync', signal }) {
  const key = createHash('sha256').update(JSON.stringify([scope, id])).digest('hex');
  const state = join(dataDir, key);
  await mkdir(state, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(tmpdir(), 'wi-sync-'));
  try {
    const config = syncConfig({ ...far, ip: await resolveFar(far.host) }, near, state, caFile);
    signal?.throwIfAborted();
    const file = join(temporary, 'config');
    await writeFile(file, config, { mode: 0o600 });
    await new Promise((resolve, reject) => {
      // Secrets are inherited only by this process, never interpolated into shell text or arguments.
      const child = spawn(executable, ['-c', file, '-a', '-q'], {
        env: { PATH: process.env.PATH, LANG: 'C.UTF-8', WI_FAR_PASSWORD: far.password, WI_NEAR_PASSWORD: near.password },
        stdio: ['ignore', 'ignore', 'ignore'], detached: true,
      });
      let timer;
      const kill = type => { if (child.pid) { try { process.kill(-child.pid, type); } catch (error) { if (error.code !== 'ESRCH') throw error; } } };
      const abort = () => { kill('SIGTERM'); timer = setTimeout(() => kill('SIGKILL'), 5000); timer.unref(); };
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.once('error', error => { cleanup(); reject(error); });
      child.once('exit', (code, killed) => {
        cleanup();
        if (signal?.aborted) reject(new Error('IMAP synchronization cancelled'));
        else if (code === 0) resolve();
        else reject(new Error(`IMAP synchronization failed (${killed ?? code})`));
      });
    });
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
