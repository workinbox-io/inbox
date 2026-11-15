CREATE TABLE `mail_native_changes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mailbox_id` text NOT NULL,
	`message_id` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_native_changes_box_seq` ON `mail_native_changes` (`mailbox_id`,`seq`);--> statement-breakpoint
CREATE TABLE `mail_native_gc` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`keys` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mail_native_watchers` (
	`mailbox_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`mailbox_id`, `user_id`),
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TRIGGER mail_native_insert AFTER INSERT ON mail_messages
WHEN EXISTS(SELECT 1 FROM mail_native_watchers WHERE mailbox_id=new.mailbox_id) BEGIN
 INSERT INTO mail_native_changes(mailbox_id,message_id,deleted) VALUES(new.mailbox_id,new.id,0);
END;
--> statement-breakpoint
CREATE TRIGGER mail_native_delete AFTER DELETE ON mail_messages
WHEN EXISTS(SELECT 1 FROM mail_native_watchers WHERE mailbox_id=old.mailbox_id) BEGIN
 INSERT INTO mail_native_changes(mailbox_id,message_id,deleted) VALUES(old.mailbox_id,old.id,1);
END;
--> statement-breakpoint
CREATE TRIGGER mail_native_raw AFTER UPDATE OF raw_key ON mail_messages
WHEN old.raw_key IS NOT new.raw_key AND EXISTS(SELECT 1 FROM mail_native_watchers WHERE mailbox_id=new.mailbox_id) BEGIN
 INSERT INTO mail_native_changes(mailbox_id,message_id,deleted) VALUES(new.mailbox_id,new.id,0);
END;
--> statement-breakpoint
CREATE TRIGGER mail_native_thread AFTER UPDATE OF unread,starred,spam,archived_at,trashed_at,snoozed_until ON mail_threads
WHEN (old.unread IS NOT new.unread OR old.starred IS NOT new.starred OR old.spam IS NOT new.spam OR old.archived_at IS NOT new.archived_at OR old.trashed_at IS NOT new.trashed_at OR old.snoozed_until IS NOT new.snoozed_until)
AND EXISTS(SELECT 1 FROM mail_native_watchers WHERE mailbox_id=new.mailbox_id) BEGIN
 INSERT INTO mail_native_changes(mailbox_id,message_id,deleted) SELECT new.mailbox_id,id,0 FROM mail_messages WHERE thread_id=new.id;
END;
--> statement-breakpoint
CREATE TRIGGER mail_native_label_add AFTER INSERT ON mail_thread_labels BEGIN
 INSERT INTO mail_native_changes(mailbox_id,message_id,deleted) SELECT mailbox_id,id,0 FROM mail_messages m WHERE m.thread_id=new.thread_id AND EXISTS(SELECT 1 FROM mail_native_watchers WHERE mailbox_id=m.mailbox_id);
END;
--> statement-breakpoint
CREATE TRIGGER mail_native_label_remove AFTER DELETE ON mail_thread_labels BEGIN
 INSERT INTO mail_native_changes(mailbox_id,message_id,deleted) SELECT mailbox_id,id,0 FROM mail_messages m WHERE m.thread_id=old.thread_id AND EXISTS(SELECT 1 FROM mail_native_watchers WHERE mailbox_id=m.mailbox_id);
END;
