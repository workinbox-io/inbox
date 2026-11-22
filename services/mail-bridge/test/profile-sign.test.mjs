import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signProfile } from '../src/profile-sign.mjs';

const dir = mkdtempSync(join(tmpdir(), 'profile-sign-'));
const cert = join(dir, 'cert.pem'), key = join(dir, 'key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=mail.example.test', '-keyout', key, '-out', cert], { stdio: 'ignore' });
const xml = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict/></plist>\n');

test('signs a profile with the content attached', async () => {
  const signed = await signProfile(xml, { cert, key });
  writeFileSync(join(dir, 'signed.der'), signed);
  const content = execFileSync('openssl', ['smime', '-verify', '-noverify', '-inform', 'der', '-in', join(dir, 'signed.der')], { stdio: ['ignore', 'pipe', 'ignore'] });
  assert.deepEqual(content, xml);
});

test('refuses anything that is not a profile, and a missing key', async () => {
  await assert.rejects(signProfile(Buffer.from('not xml'), { cert, key }), /Invalid profile/);
  await assert.rejects(signProfile(xml, { cert, key: join(dir, 'missing.pem') }), /signing failed/);
});
