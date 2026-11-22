CREATE TABLE mail_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES mail_threads(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  UNIQUE(user_id, message_id)
);
CREATE INDEX mail_notifications_user_idx ON mail_notifications(org_id, user_id, created_at);
