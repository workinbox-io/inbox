ALTER TABLE invitation ADD COLUMN mailbox_address TEXT;
ALTER TABLE invitation ADD COLUMN mailbox_domain_id TEXT;
ALTER TABLE invitation ADD COLUMN mailbox_provisioned INTEGER NOT NULL DEFAULT 0;
CREATE INDEX invitation_mailbox_address_idx ON invitation(mailbox_address);
CREATE TABLE mail_account_security (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 must_change_password INTEGER NOT NULL DEFAULT 0,
 recovery_email TEXT,
 recovery_verified_at INTEGER,
 pending_recovery_email TEXT,
 recovery_token_hash TEXT,
 recovery_token_expires_at INTEGER
);
-- Address reservations are the pending, unexpired invitation itself.
CREATE TRIGGER invitation_mailbox_reserve_insert BEFORE INSERT ON invitation
WHEN NEW.mailbox_address IS NOT NULL AND NEW.status = 'pending'
BEGIN
 SELECT RAISE(ABORT, 'Mailbox address is unavailable')
 WHERE EXISTS(SELECT 1 FROM mailboxes WHERE address = NEW.mailbox_address)
 OR EXISTS(SELECT 1 FROM mail_aliases WHERE address = NEW.mailbox_address)
 OR EXISTS(SELECT 1 FROM invitation WHERE mailbox_address = NEW.mailbox_address AND status='pending' AND expires_at > unixepoch()*1000);
END;
CREATE TRIGGER invitation_mailbox_reserve_update BEFORE UPDATE OF status, expires_at ON invitation
WHEN NEW.mailbox_address IS NOT NULL AND NEW.status = 'pending'
BEGIN
 SELECT RAISE(ABORT, 'Mailbox address is unavailable')
 WHERE EXISTS(SELECT 1 FROM mailboxes WHERE address = NEW.mailbox_address)
 OR EXISTS(SELECT 1 FROM mail_aliases WHERE address = NEW.mailbox_address)
 OR EXISTS(SELECT 1 FROM invitation WHERE id != NEW.id AND mailbox_address = NEW.mailbox_address AND status='pending' AND expires_at > unixepoch()*1000);
END;
CREATE TRIGGER mailbox_reserved_address BEFORE INSERT ON mailboxes BEGIN
 SELECT RAISE(ABORT, 'Mailbox address is reserved')
 WHERE EXISTS(SELECT 1 FROM invitation WHERE mailbox_address=NEW.address AND status='pending' AND expires_at > unixepoch()*1000);
END;
CREATE TRIGGER alias_reserved_address BEFORE INSERT ON mail_aliases BEGIN
 SELECT RAISE(ABORT, 'Mailbox address is reserved')
 WHERE EXISTS(SELECT 1 FROM invitation WHERE mailbox_address=NEW.address AND status='pending' AND expires_at > unixepoch()*1000);
END;
-- Runs in the membership statement, so failure rolls back membership creation too.
CREATE TRIGGER member_mailbox_provision AFTER INSERT ON member BEGIN
 SELECT RAISE(ABORT, 'Mailbox domain is no longer active')
 WHERE EXISTS(SELECT 1 FROM invitation i JOIN user u ON u.id=NEW.user_id
 WHERE i.organization_id=NEW.organization_id AND lower(i.email)=lower(u.email) AND i.status='accepted'
 AND i.mailbox_address IS NOT NULL AND i.mailbox_provisioned=0
 AND NOT EXISTS(SELECT 1 FROM mail_domains d WHERE d.id=i.mailbox_domain_id AND d.org_id=NEW.organization_id AND d.status='active'));
 INSERT INTO mailboxes(id, org_id, domain_id, address, kind, user_id, display_name, signature, uid_validity, uid_next, modseq, created_at, updated_at)
 SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))), NEW.organization_id, i.mailbox_domain_id, i.mailbox_address, 'personal', NEW.user_id, u.name, '', unixepoch(), 1, 1, unixepoch()*1000, unixepoch()*1000
 FROM invitation i JOIN user u ON u.id=NEW.user_id JOIN mail_domains d ON d.id=i.mailbox_domain_id AND d.org_id=NEW.organization_id
 WHERE i.organization_id=NEW.organization_id AND lower(i.email)=lower(u.email)
 AND i.status='accepted' AND i.mailbox_address IS NOT NULL AND i.mailbox_provisioned=0 AND d.status='active'
 AND NOT EXISTS(SELECT 1 FROM mailboxes b WHERE b.org_id=NEW.organization_id AND b.user_id=NEW.user_id AND b.kind='personal');
 UPDATE invitation SET mailbox_provisioned=1 WHERE organization_id=NEW.organization_id
 AND lower(email)=(SELECT lower(email) FROM user WHERE id=NEW.user_id)
 AND status='accepted' AND mailbox_address IS NOT NULL AND mailbox_provisioned=0;
END;
-- Covers remove-member, leave, direct API calls and account deletion.
CREATE TRIGGER member_mailbox_handover BEFORE DELETE ON member BEGIN
 UPDATE mailboxes SET kind='shared', user_id=NULL, updated_at=unixepoch()*1000, modseq=modseq+1
 WHERE org_id=OLD.organization_id AND user_id=OLD.user_id AND kind='personal';
 DELETE FROM mailbox_access WHERE user_id=OLD.user_id AND mailbox_id IN (SELECT id FROM mailboxes WHERE org_id=OLD.organization_id);
END;

CREATE TRIGGER user_mailbox_handover BEFORE DELETE ON user BEGIN
 UPDATE mailboxes SET kind='shared', user_id=NULL, updated_at=unixepoch()*1000, modseq=modseq+1
 WHERE user_id=OLD.id AND kind='personal';
END;
