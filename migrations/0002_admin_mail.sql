CREATE TABLE `admin_mail_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`direction` text NOT NULL,
	`from_email` text NOT NULL,
	`from_name` text,
	`to` text DEFAULT '' NOT NULL,
	`cc` text DEFAULT '' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`html` text,
	`message_id` text,
	`in_reply_to` text,
	`references` text,
	`files` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `admin_mail_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_mail_messages_thread_idx` ON `admin_mail_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_mail_messages_message_id_idx` ON `admin_mail_messages` (`message_id`);--> statement-breakpoint
CREATE TABLE `admin_mail_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`contact_email` text NOT NULL,
	`contact_name` text,
	`unread` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`trashed_at` integer,
	`snoozed_until` integer,
	`last_message_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_mail_threads_mailbox_idx` ON `admin_mail_threads` (`mailbox`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `admin_mail_threads_contact_idx` ON `admin_mail_threads` (`mailbox`,`contact_email`);--> statement-breakpoint
CREATE TABLE `admin_mailboxes` (
	`mailbox` text PRIMARY KEY NOT NULL,
	`signature` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
