import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncConfig } from '../src/imap-sync.mjs';

const endpoint = { host: 'imap.example.com', ip: '1.1.1.1', port: 993, username: 'anna', password: 'never-put-in-config' };
test('sync uses pinned IP, verified TLS, environment credentials and an explicit durable journal', () => {
  const config = syncConfig(endpoint, endpoint, '/data/sync/a', '/etc/ssl/cert.pem');
  assert.match(config, /-connect '1\.1\.1\.1:993'/);
  assert.match(config, /-verify_hostname 'imap\.example\.com'/);
  assert.match(config, /-verify_return_error/);
  assert.equal(config.includes(endpoint.password), false);
  assert.match(config, /WI_FAR_PASSWORD/);
  assert.match(config, /SyncState "\/data\/sync\/a\/"/);
  assert.match(config, /ExpungeSolo Both/);
});
test('user-controlled config cannot introduce options or shell commands', () => {
  assert.throws(() => syncConfig({ ...endpoint, username: 'anna\nPass stolen' }, endpoint, '/data', '/ca'));
  assert.throws(() => syncConfig({ ...endpoint, host: "example.com'; touch /tmp/file" }, endpoint, '/data', '/ca'));
  assert.throws(() => syncConfig({ ...endpoint, ip: '127.0.0.1;ls' }, endpoint, '/data', '/ca'));
  const config = syncConfig({ ...endpoint, username: 'a"b\\c' }, endpoint, '/data', '/ca');
  assert.ok(config.includes('User "a\\"b\\\\c"'));
});
