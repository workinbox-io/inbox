ALTER TABLE mail_messages ADD COLUMN html_key text;
ALTER TABLE mail_messages ADD COLUMN storage_keys text NOT NULL DEFAULT '[]';
ALTER TABLE mail_messages ADD COLUMN storage_version integer NOT NULL DEFAULT 0;
CREATE TABLE mail_storage_usage (mailbox_id text PRIMARY KEY REFERENCES mailboxes(id) ON DELETE CASCADE, used_bytes integer NOT NULL DEFAULT 0 CHECK(used_bytes >= 0), quota_bytes integer NOT NULL DEFAULT 10737418240 CHECK(quota_bytes > 0));
CREATE TABLE mail_storage_reservations (id text PRIMARY KEY, mailbox_id text NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE, bytes integer NOT NULL CHECK(bytes >= 0), created_at integer NOT NULL);
CREATE INDEX mail_storage_reservations_mailbox_idx ON mail_storage_reservations(mailbox_id);
INSERT INTO mail_storage_usage(mailbox_id, used_bytes) SELECT id,0 FROM mailboxes;
INSERT INTO mail_storage_reservations(id,mailbox_id,bytes,created_at)
SELECT id,mailbox_id,max(0,size)+length(CAST(text AS blob))+coalesce(length(CAST(html AS blob)),0)+coalesce((SELECT sum(coalesce(json_extract(value,'$.size'),0)) FROM json_each(mail_messages.files)),0),created_at FROM mail_messages;
UPDATE mail_storage_usage SET used_bytes=coalesce((SELECT sum(bytes) FROM mail_storage_reservations WHERE mailbox_id=mail_storage_usage.mailbox_id),0);
CREATE TRIGGER mail_storage_reserve BEFORE INSERT ON mail_storage_reservations WHEN NOT EXISTS(SELECT 1 FROM mail_storage_reservations WHERE id=new.id) BEGIN
 INSERT OR IGNORE INTO mail_storage_usage(mailbox_id) VALUES(new.mailbox_id);
 SELECT CASE WHEN (SELECT used_bytes+new.bytes>quota_bytes FROM mail_storage_usage WHERE mailbox_id=new.mailbox_id) THEN RAISE(ABORT,'Mailbox storage quota exceeded') END;
END;
CREATE TRIGGER mail_storage_reserved AFTER INSERT ON mail_storage_reservations BEGIN
 UPDATE mail_storage_usage SET used_bytes=used_bytes+new.bytes WHERE mailbox_id=new.mailbox_id;
END;
CREATE TRIGGER mail_storage_resize BEFORE UPDATE OF bytes ON mail_storage_reservations WHEN new.bytes>old.bytes AND NOT EXISTS(SELECT 1 FROM mail_messages WHERE id=new.id AND storage_version=0) BEGIN
 SELECT CASE WHEN (SELECT used_bytes+new.bytes-old.bytes>quota_bytes FROM mail_storage_usage WHERE mailbox_id=new.mailbox_id) THEN RAISE(ABORT,'Mailbox storage quota exceeded') END;
END;
CREATE TRIGGER mail_storage_resized AFTER UPDATE OF bytes ON mail_storage_reservations BEGIN
 UPDATE mail_storage_usage SET used_bytes=used_bytes+new.bytes-old.bytes WHERE mailbox_id=new.mailbox_id;
END;
CREATE TRIGGER mail_storage_released AFTER DELETE ON mail_storage_reservations BEGIN
 UPDATE mail_storage_usage SET used_bytes=max(0,used_bytes-old.bytes) WHERE mailbox_id=old.mailbox_id;
END;
CREATE TRIGGER mail_storage_message_deleted AFTER DELETE ON mail_messages BEGIN
 DELETE FROM mail_storage_reservations WHERE id=old.id;
END;
CREATE TABLE mail_labels(id text PRIMARY KEY,mailbox_id text NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,name text NOT NULL,created_at integer NOT NULL);
CREATE INDEX mail_labels_mailbox_idx ON mail_labels(mailbox_id);
CREATE UNIQUE INDEX mail_labels_name_idx ON mail_labels(mailbox_id,name COLLATE NOCASE);
CREATE TABLE mail_thread_labels(thread_id text NOT NULL REFERENCES mail_threads(id) ON DELETE CASCADE,label_id text NOT NULL REFERENCES mail_labels(id) ON DELETE CASCADE,PRIMARY KEY(thread_id,label_id));
CREATE TABLE mail_filters(id text PRIMARY KEY,mailbox_id text NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,name text NOT NULL,position integer NOT NULL DEFAULT 0,enabled integer NOT NULL DEFAULT 1,conditions text NOT NULL,actions text NOT NULL,created_at integer NOT NULL);
CREATE INDEX mail_filters_mailbox_idx ON mail_filters(mailbox_id,position);
CREATE TABLE mail_forward_targets(id text PRIMARY KEY,mailbox_id text NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,address text NOT NULL,token_hash text,expires_at integer,verified_at integer,created_at integer NOT NULL);
CREATE TABLE mail_filter_runs(message_id text NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,filter_id text NOT NULL REFERENCES mail_filters(id) ON DELETE CASCADE,created_at integer NOT NULL,PRIMARY KEY(message_id,filter_id));
