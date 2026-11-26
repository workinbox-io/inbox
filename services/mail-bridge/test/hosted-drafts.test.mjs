import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { HostedMirror } from '../src/hosted-sync.mjs';
import { SourceError } from '../src/root-mail.mjs';

const K1 = 'd-11111111-1111-4111-8111-111111111111';
const eml = (key, text) => Buffer.from(`${key ? `X-Workinbox-Draft: ${key}\r\n` : ''}Subject: s\r\n\r\n${text}`);
const body = buffer => [buffer];

function world() {
  const app = new Map(); let clock = 1000;
  const source = {
    async json(path, method = 'GET', raw) {
      const url = new URL(path, 'https://x/');
      if (method === 'GET' && url.pathname === '/drafts') return { drafts: [...app].map(([key, d]) => ({ key, updatedAt: d.updatedAt })) };
      if (method === 'POST' && url.pathname === '/drafts') {
        const text = raw.toString().split('\r\n\r\n')[1];
        const key = url.searchParams.get('key');
        if (key) {
          const current = app.get(key);
          if (!current) throw new SourceError(404, path);
          if (current.updatedAt !== Number(url.searchParams.get('expected'))) throw new SourceError(409, path);
          app.set(key, { text, updatedAt: ++clock }); return { key, updatedAt: clock };
        }
        const fresh = `d-${randomUUID()}`; app.set(fresh, { text, updatedAt: ++clock }); return { key: fresh, updatedAt: clock };
      }
      if (method === 'DELETE') {
        const key = url.pathname.split('/')[2], current = app.get(key);
        if (!current) throw new SourceError(404, path);
        if (current.updatedAt !== Number(url.searchParams.get('expected'))) throw new SourceError(409, path);
        app.delete(key); return { ok: true };
      }
      throw new Error(`unexpected ${method} ${path}`);
    },
    async request(path) { const key = path.split('/')[1]; const d = app.get(key); if (!d) throw new SourceError(404, path); return { body: body(eml(key, d.text)) }; },
  };
  const mail = new Map(); let state = 0;
  const client = {
    async query(_p, _l, filter) { return { ids: [...mail].filter(([, e]) => e.mailboxIds[filter.inMailbox]).map(([id]) => id) }; },
    async emails(ids) { return { state: String(state), list: ids.filter(id => mail.has(id)).map(id => structuredClone(mail.get(id))) }; },
    async raw(_url, blobId) { return { body: body([...mail.values()].find(e => e.blobId === blobId).raw) }; },
    async update(id, patch) { for (const [k, v] of Object.entries(patch)) mail.get(id).keywords[k.slice('keywords/'.length)] = v; state++; },
    async remove(id) { mail.delete(id); state++; },
    async importMessage(_u, raw, folder, _r, keywords) { const id = randomUUID(); mail.set(id, { id, blobId: id, raw: Buffer.from(raw), mailboxIds: { [folder]: true }, keywords: { ...keywords } }); state++; return { id }; },
  };
  const mirror = new HostedMirror({ db: new DatabaseSync(':memory:') }, null, {});
  const sync = () => mirror.syncDrafts('scope', 'conn', { client, session: {}, source, draftsFolder: 'drafts', check() {} });
  /** What a mail app does when it re-saves or writes a draft: a new message (keywords dropped), the old one expunged. */
  const save = (raw, replaces) => { if (replaces) mail.delete(replaces); const id = randomUUID(); mail.set(id, { id, blobId: id, raw, mailboxIds: { drafts: true }, keywords: { $draft: true } }); return id; };
  const texts = () => [...mail.values()].map(e => e.raw.toString().split('\r\n\r\n')[1]).sort();
  return { app, mail, sync, save, texts };
}

test('an app draft shows up in Drafts once, and leaves when sent in Work Inbox', async () => {
  const w = world(); w.app.set(K1, { text: 'hello', updatedAt: 1 });
  await w.sync(); await w.sync();
  assert.deepEqual(w.texts(), ['hello']);
  w.app.delete(K1); await w.sync();
  assert.equal(w.mail.size, 0);
});

test('a re-save in the mail app updates the same draft; a discard there deletes it', async () => {
  const w = world(); w.app.set(K1, { text: 'hello', updatedAt: 1 });
  await w.sync();
  w.save(eml(K1, 'hello world'), [...w.mail.keys()][0]);
  await w.sync(); await w.sync();
  assert.deepEqual([...w.app.keys()], [K1]);
  assert.equal(w.app.get(K1).text, 'hello world');
  assert.deepEqual(w.texts(), ['hello world']);
  w.mail.clear(); await w.sync();
  assert.equal(w.app.size, 0);
});

test('a draft written in the mail app becomes a Work Inbox draft', async () => {
  const w = world(); w.save(eml(null, 'from thunderbird'));
  await w.sync(); await w.sync();
  assert.deepEqual([...w.app.values()].map(d => d.text), ['from thunderbird']);
  assert.equal(w.mail.size, 1);
});

test('edits on both sides keep both drafts', async () => {
  const w = world(); w.app.set(K1, { text: 'v1', updatedAt: 1 });
  await w.sync();
  w.app.set(K1, { text: 'web edit', updatedAt: 5 });
  w.save(eml(K1, 'app edit'), [...w.mail.keys()][0]);
  await w.sync(); await w.sync();
  assert.deepEqual([...w.app.values()].map(d => d.text).sort(), ['app edit', 'web edit']);
  assert.deepEqual(w.texts(), ['app edit', 'web edit']);
});
