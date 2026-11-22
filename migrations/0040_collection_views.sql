CREATE TABLE `collection_views` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`owner_id` text,
	`position` real DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collection_views_collection_idx` ON `collection_views` (`collection_id`,`position`);