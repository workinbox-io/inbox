CREATE TABLE mail_api_access (
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  PRIMARY KEY (api_key_id, mailbox_id)
);
CREATE TABLE mail_push_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
CREATE INDEX mail_push_org ON mail_push_subscriptions(org_id);

CREATE UNIQUE INDEX mail_push_identity ON mail_push_subscriptions(org_id,user_id,endpoint);
