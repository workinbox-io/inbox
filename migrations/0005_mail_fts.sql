-- External-content index: no extra copy of message bodies.
CREATE VIRTUAL TABLE mail_messages_fts USING fts5(
  subject, from_email, from_name, "to", cc, text,
  content='mail_messages', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER mail_messages_fts_insert AFTER INSERT ON mail_messages BEGIN
  INSERT INTO mail_messages_fts(rowid, subject, from_email, from_name, "to", cc, text)
  VALUES (new.rowid, new.subject, new.from_email, new.from_name, new."to", new.cc, new.text);
END;
CREATE TRIGGER mail_messages_fts_delete AFTER DELETE ON mail_messages BEGIN
  INSERT INTO mail_messages_fts(mail_messages_fts, rowid, subject, from_email, from_name, "to", cc, text)
  VALUES ('delete', old.rowid, old.subject, old.from_email, old.from_name, old."to", old.cc, old.text);
END;
CREATE TRIGGER mail_messages_fts_update AFTER UPDATE ON mail_messages BEGIN
  INSERT INTO mail_messages_fts(mail_messages_fts, rowid, subject, from_email, from_name, "to", cc, text)
  VALUES ('delete', old.rowid, old.subject, old.from_email, old.from_name, old."to", old.cc, old.text);
  INSERT INTO mail_messages_fts(rowid, subject, from_email, from_name, "to", cc, text)
  VALUES (new.rowid, new.subject, new.from_email, new.from_name, new."to", new.cc, new.text);
END;
INSERT INTO mail_messages_fts(mail_messages_fts) VALUES ('rebuild');
