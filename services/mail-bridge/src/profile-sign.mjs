import { spawn } from 'node:child_process';

const MAX_BYTES = 1024 * 1024;

/**
 * Signs an Apple configuration profile (PKCS#7, content attached) with the client TLS certificate, so iOS and macOS
 * show it as Verified. The certificate file is read on every call, so renewals need no restart.
 */
export function signProfile(xml, { cert, key }, run = spawn) {
  if (!Buffer.isBuffer(xml) || !xml.length || xml.length > MAX_BYTES || !xml.subarray(0, 64).toString().startsWith('<?xml')) return Promise.reject(new Error('Invalid profile'));
  return new Promise((resolve, reject) => {
    const child = run('openssl', ['smime', '-sign', '-binary', '-nodetach', '-outform', 'der', '-md', 'sha256', '-signer', cert, '-inkey', key, '-certfile', cert], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks = []; let size = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 4 * MAX_BYTES) child.kill('SIGKILL'); else chunks.push(chunk); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 && size ? resolve(Buffer.concat(chunks)) : reject(new Error('Profile signing failed')); });
    child.stdin.on('error', () => {});
    child.stdin.end(xml);
  });
}
