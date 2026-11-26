CREATE TABLE `mail_drafts` (
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`thread_id` text,
	`payload` text NOT NULL,
	`source` text DEFAULT 'app' NOT NULL,
	`via` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`org_id`, `user_id`, `key`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `mail_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_drafts_user_idx` ON `mail_drafts` (`user_id`,`updated_at`);