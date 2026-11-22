ALTER TABLE `mail_messages` ADD `native_import_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `mail_messages_native_import_idx` ON `mail_messages` (`native_import_id`);--> statement-breakpoint
CREATE TRIGGER mail_native_import_revision AFTER INSERT ON mail_messages WHEN new.native_import_id IS NOT NULL BEGIN
 UPDATE mail_native_imports SET root_id=new.id,revision=(SELECT modseq FROM mail_threads WHERE id=new.thread_id)
 WHERE id=new.native_import_id AND mailbox_id=new.mailbox_id AND complete=0;
END;
