CREATE TABLE `mail_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`address` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_aliases_address_idx` ON `mail_aliases` (`address`);--> statement-breakpoint
CREATE INDEX `mail_aliases_mailbox_idx` ON `mail_aliases` (`mailbox_id`);--> statement-breakpoint
CREATE TABLE `mail_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`domain` text NOT NULL,
	`kind` text DEFAULT 'custom' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`checks` text DEFAULT '{}' NOT NULL,
	`checked_at` integer,
	`catch_all_mailbox_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_domains_domain_idx` ON `mail_domains` (`domain`);--> statement-breakpoint
CREATE INDEX `mail_domains_org_idx` ON `mail_domains` (`org_id`);--> statement-breakpoint
CREATE TABLE `mail_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`uid` integer NOT NULL,
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
	`raw_key` text,
	`size` integer DEFAULT 0 NOT NULL,
	`spam_reasons` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `mail_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_messages_thread_idx` ON `mail_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `mail_messages_message_id_idx` ON `mail_messages` (`mailbox_id`,`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mail_messages_uid_idx` ON `mail_messages` (`mailbox_id`,`uid`);--> statement-breakpoint
CREATE TABLE `mail_sender_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`mailbox_id` text,
	`pattern` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_sender_rules_org_idx` ON `mail_sender_rules` (`org_id`);--> statement-breakpoint
CREATE TABLE `mail_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`contact_email` text NOT NULL,
	`contact_name` text,
	`unread` integer DEFAULT false NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`spam` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`trashed_at` integer,
	`snoozed_until` integer,
	`last_message_at` integer NOT NULL,
	`modseq` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_threads_mailbox_idx` ON `mail_threads` (`mailbox_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `mail_threads_contact_idx` ON `mail_threads` (`mailbox_id`,`contact_email`);--> statement-breakpoint
CREATE INDEX `mail_threads_org_idx` ON `mail_threads` (`org_id`);--> statement-breakpoint
CREATE TABLE `mailbox_access` (
	`mailbox_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`mailbox_id`, `user_id`),
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mailbox_access_user_idx` ON `mailbox_access` (`user_id`);--> statement-breakpoint
CREATE TABLE `mailboxes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`domain_id` text NOT NULL,
	`address` text NOT NULL,
	`kind` text NOT NULL,
	`user_id` text,
	`display_name` text DEFAULT '' NOT NULL,
	`signature` text DEFAULT '' NOT NULL,
	`uid_validity` integer NOT NULL,
	`uid_next` integer DEFAULT 1 NOT NULL,
	`modseq` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`domain_id`) REFERENCES `mail_domains`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailboxes_address_idx` ON `mailboxes` (`address`);--> statement-breakpoint
CREATE INDEX `mailboxes_org_idx` ON `mailboxes` (`org_id`);--> statement-breakpoint
CREATE INDEX `mailboxes_user_idx` ON `mailboxes` (`user_id`);