import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { EngineIndex } from '../src/engine-sync.mjs';
import { JmapError } from '../../../src/lib/mail/jmap.ts';

const email = id => ({ id, keywords: {}, mailboxIds: { inbox: true } });
const client = (rows, state = 's1') => ({
  emails: async ids => ({ state, list: rows.filter(row => ids.includes(row.id)), notFound: ids.filter(id => !rows.some(row => row.id === id)) }),
  query: async position => ({ queryState: 'q1', position, ids: position === 0 ? rows.map(row => row.id) : [] }),
});

test('snapshot and delta persist atomically and stay isolated by account', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const index = new EngineIndex(db);
    await index.sync('org', 'a', client([email('one'), email('two')]));
    assert.equal(index.state('org', 'a'), 's1');
    assert.deepEqual(index.messages('other', 'a'), []);
    const changed = { ...email('two'), keywords: { $seen: true } };
    const delta = client([changed, email('three')], 's2');
    delta.changes = async since => { assert.equal(since, 's1'); return { oldState: 's1', newState: 's2', created: ['three'], updated: ['two'], destroyed: ['one'], hasMoreChanges: false }; };
    await index.sync('org', 'a', delta);
    assert.equal(index.state('org', 'a'), 's2');
    assert.deepEqual(index.messages('org', 'a'), [email('three'), changed]);
  } finally { db.close(); }
});

test('a failed fetch never advances the cursor or deletes live messages', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const index = new EngineIndex(db);
    await index.sync('org', 'a', client([email('one')]));
    const delta = client([], 's2');
    delta.changes = async () => ({ oldState: 's1', newState: 's2', created: ['missing'], updated: [], destroyed: ['one'], hasMoreChanges: false });
    await assert.rejects(index.sync('org', 'a', delta));
    assert.equal(index.state('org', 'a'), 's1');
    assert.deepEqual(index.messages('org', 'a'), [email('one')]);
  } finally { db.close(); }
});

test('expired cursors rebuild through a fenced snapshot', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const index = new EngineIndex(db);
    await index.sync('org', 'a', client([email('old')]));
    const replacement = client([email('new')], 's2');
    replacement.changes = async () => { throw new JmapError('cannotCalculateChanges'); };
    await index.sync('org', 'a', replacement);
    assert.equal(index.state('org', 'a'), 's2');
    assert.deepEqual(index.messages('org', 'a'), [email('new')]);
  } finally { db.close(); }
});

test('an inconsistent replacement snapshot leaves the old index untouched', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const index = new EngineIndex(db);
    await index.sync('org', 'a', client([email('old')]));
    const unstable = client([email('new')], 's2');
    unstable.changes = async () => { throw new JmapError('cannotCalculateChanges'); };
    let calls = 0;
    unstable.emails = async ids => ({ state: ++calls === 1 ? 's2' : 's3', list: ids.map(email), notFound: [] });
    await assert.rejects(index.sync('org', 'a', unstable), /changed during snapshot/);
    assert.deepEqual(index.messages('org', 'a'), [email('old')]);
    assert.equal(index.state('org', 'a'), 's1');
    assert.equal(db.prepare('SELECT count(*) AS n FROM engine_snapshot').get().n, 0);
  } finally { db.close(); }
});

test('database failures roll back messages and their checkpoint together', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const index = new EngineIndex(db);
    await index.sync('org', 'a', client([email('one')]));
    db.exec("CREATE TRIGGER fail_checkpoint BEFORE UPDATE ON engine_cursors BEGIN SELECT RAISE(ABORT,'disk failure'); END");
    const delta = client([], 's2');
    delta.changes = async () => ({ oldState: 's1', newState: 's2', created: [], updated: [], destroyed: ['one'], hasMoreChanges: false });
    await assert.rejects(index.sync('org', 'a', delta), /disk failure/);
    assert.deepEqual(index.messages('org', 'a'), [email('one')]);
    assert.equal(index.state('org', 'a'), 's1');
  } finally { db.close(); }
});

test('concurrent workers cannot publish the same account snapshot', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const index = new EngineIndex(db), source = client([email('one')]);
    let release;
    const paused = new Promise(resolve => { release = resolve; });
    source.query = async position => { await paused; return { queryState: 'q1', position, ids: position === 0 ? ['one'] : [] }; };
    const running = index.sync('org', 'a', source);
    await assert.rejects(index.sync('org', 'a', client([])), /already running/);
    release(); await running;
    assert.deepEqual(index.messages('org', 'a'), [email('one')]);
  } finally { db.close(); }
});

test('an expired worker cannot publish after another worker takes over', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const index = new EngineIndex(db), source = client([email('old')]);
    let release;
    const paused = new Promise(resolve => { release = resolve; });
    source.query = async position => { await paused; return { queryState: 'q1', position, ids: position === 0 ? ['old'] : [] }; };
    const running = index.sync('org', 'a', source);
    const rejected = assert.rejects(running, /lease expired/);
    db.exec('UPDATE engine_locks SET expires_at=0');
    await index.sync('org', 'a', client([email('new')], 's2'));
    release(); await rejected;
    assert.deepEqual(index.messages('org', 'a'), [email('new')]);
    assert.equal(index.state('org', 'a'), 's2');
  } finally { db.close(); }
});
