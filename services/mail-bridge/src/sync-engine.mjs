import { DatabaseSync } from 'node:sqlite';
import { JmapClient } from '../../../src/lib/mail/jmap.ts';
import { EngineIndex } from './engine-sync.mjs';

// Operator-only pilot command. Account IDs are assigned by the server operator, never accepted from an app user.
const { MAIL_ENGINE_URL: url, MAIL_ENGINE_TOKEN: token, MAIL_ENGINE_SCOPE: scope, MAIL_ENGINE_ACCOUNT_ID: account } = process.env;
if (!url || !token || !scope || !account) throw new Error('Set MAIL_ENGINE_URL, MAIL_ENGINE_TOKEN, MAIL_ENGINE_SCOPE and MAIL_ENGINE_ACCOUNT_ID');
const db = new DatabaseSync(process.env.MAIL_BRIDGE_DB ?? '/data/accounts.sqlite');
try {
  const index = new EngineIndex(db);
  await index.sync(scope, account, new JmapClient(url, `Bearer ${token}`, account));
  console.log(JSON.stringify({ synced: true, messages: db.prepare('SELECT count(*) AS n FROM engine_messages WHERE scope=? AND account_id=?').get(scope, account).n }));
} finally { db.close(); }
