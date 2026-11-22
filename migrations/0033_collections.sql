CREATE TABLE `collection_records` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`values` text DEFAULT '{}' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collection_records_list_idx` ON `collection_records` (`collection_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `collection_records_org_idx` ON `collection_records` (`org_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`fields` text DEFAULT '[]' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collections_org_idx` ON `collections` (`org_id`,`name`);