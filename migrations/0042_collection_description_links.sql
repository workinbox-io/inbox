CREATE TABLE `collection_record_links` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`record_id` text NOT NULL,
	`url` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`state` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`record_id`) REFERENCES `collection_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collection_record_links_record_idx` ON `collection_record_links` (`record_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `collection_records` ADD `description` text;--> statement-breakpoint
ALTER TABLE `collection_records` ADD `description_text` text DEFAULT '' NOT NULL;