CREATE TABLE mail_outbox (
 id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
 actor_user_id TEXT, api_key_id TEXT, idempotency_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','cancelled','failed','uncertain')),
 send_at INTEGER NOT NULL, quota_day TEXT NOT NULL, recipient_count INTEGER NOT NULL CHECK(recipient_count>0),
 provider_id TEXT, thread_id TEXT, message_id TEXT, error TEXT, delivery_status TEXT,
 updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX mail_outbox_idempotency_idx ON mail_outbox(org_id,idempotency_key);
CREATE INDEX mail_outbox_due_idx ON mail_outbox(status,send_at);
CREATE INDEX mail_outbox_quota_idx ON mail_outbox(org_id,quota_day,status);
CREATE TABLE mail_send_limits (org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE, scope_id TEXT PRIMARY KEY NOT NULL, daily_recipients INTEGER NOT NULL CHECK(daily_recipients>=0));
CREATE TABLE mail_suppressions (id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE, recipient TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX mail_suppressions_recipient_idx ON mail_suppressions(org_id,recipient);
CREATE TABLE mail_delivery_events (id TEXT PRIMARY KEY NOT NULL, org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE, outbox_id TEXT NOT NULL REFERENCES mail_outbox(id) ON DELETE CASCADE, recipient TEXT NOT NULL, type TEXT NOT NULL, occurred_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
