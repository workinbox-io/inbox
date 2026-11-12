import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Accounts } from '../src/accounts.mjs';

test('bridge HTTP lifecycle: auth, isolation, validation, SSRF and disconnect', { timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-bridge-'));
  const key = 'ab'.repeat(32), token = 'cd'.repeat(32);
  const db = join(dir, 'accounts.sqlite');
  const store = new Accounts(db, key);
  store.put('alice', 'one', { address: 'alice@example.com',
    imap: { host: 'imap.example.com', port: 993, username: 'alice', password: 'never-return-this' },
    smtp: { host: 'smtp.example.com', port: 465, username: 'alice', password: 'never-return-this' } });
  store.close();
  const child = fork(new URL('../src/server.mjs', import.meta.url), [], {
    env: { ...process.env, PORT: '0', MAIL_BRIDGE_BIND: '127.0.0.1', MAIL_BRIDGE_TOKEN: token, MAIL_BRIDGE_KEY: key, MAIL_BRIDGE_DB: db },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  try {
    const { port } = await new Promise((resolve, reject) => {
      child.once('message', resolve);
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Bridge exited before readiness (${code})`)));
    });
    const request = (path, method = 'GET', body, auth = true) => fetch(`http://127.0.0.1:${port}${path}`, {
      method, signal: AbortSignal.timeout(5000), headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal((await request('/health', 'GET', undefined, false)).status, 401);
    assert.equal((await request('/health')).status, 200);
    const list = await (await request('/orgs/alice/accounts')).text();
    assert.equal(list.includes('never-return-this'), false);
    assert.deepEqual(JSON.parse(list), [{ id: 'one', address: 'alice@example.com' }]);
    assert.deepEqual(await (await request('/orgs/bob/accounts')).json(), []);
    assert.equal((await request('/orgs/alice/accounts/new', 'PUT', {})).status, 422);
    const unsafe = { address: 'a@example.com', imap: { host: '127.0.0.1', port: 993, username: 'a', password: 'p' }, smtp: { host: '127.0.0.1', port: 465, username: 'a', password: 'p' } };
    assert.equal((await request('/orgs/alice/accounts/new', 'PUT', unsafe)).status, 502);
    assert.equal((await request('/orgs/alice/accounts/one', 'DELETE')).status, 200);
    assert.deepEqual(await (await request('/orgs/alice/accounts')).json(), []);
    assert.equal((await request('/orgs/alice/accounts/one/test', 'POST')).status, 404);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
