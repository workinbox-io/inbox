CREATE TABLE `mail_native_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`scope` text NOT NULL,
	`fingerprint` text NOT NULL,
	`complete` integer DEFAULT false NOT NULL,
	`root_id` text,
	`revision` integer,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
