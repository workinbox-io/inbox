CREATE TABLE `collection_comment_reactions` (
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`comment_id`, `user_id`, `emoji`),
	FOREIGN KEY (`comment_id`) REFERENCES `collection_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collection_recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`title` text NOT NULL,
	`values` text DEFAULT '{}' NOT NULL,
	`description` text,
	`every` integer DEFAULT 1 NOT NULL,
	`unit` text NOT NULL,
	`next_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_recurrences_next_idx` ON `collection_recurrences` (`next_at`);--> statement-breakpoint
CREATE INDEX `collection_recurrences_collection_idx` ON `collection_recurrences` (`collection_id`);--> statement-breakpoint
CREATE TABLE `collection_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_id`) REFERENCES `collection_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_id`) REFERENCES `collection_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_relations_pair_idx` ON `collection_relations` (`from_id`,`to_id`,`kind`);--> statement-breakpoint
CREATE INDEX `collection_relations_to_idx` ON `collection_relations` (`to_id`);--> statement-breakpoint
CREATE TABLE `collection_subscriptions` (
	`record_id` text NOT NULL,
	`user_id` text NOT NULL,
	`on` integer NOT NULL,
	PRIMARY KEY(`record_id`, `user_id`),
	FOREIGN KEY (`record_id`) REFERENCES `collection_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_subscriptions_user_idx` ON `collection_subscriptions` (`user_id`);--> statement-breakpoint
ALTER TABLE `collection_comments` ADD `parent_id` text REFERENCES collection_comments(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `collection_records` ADD `parent_id` text REFERENCES collection_records(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `collection_records` ADD `triage` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `collection_records` ADD `cycle` integer;--> statement-breakpoint
ALTER TABLE `collection_records` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `collection_records` ADD `sla_notified_at` integer;--> statement-breakpoint
CREATE INDEX `collection_records_parent_idx` ON `collection_records` (`parent_id`);--> statement-breakpoint
ALTER TABLE `collections` ADD `settings` text DEFAULT '{}' NOT NULL;