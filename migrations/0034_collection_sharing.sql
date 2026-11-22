CREATE TABLE `collection_access` (
	`collection_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'edit' NOT NULL,
	PRIMARY KEY(`collection_id`, `user_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_access_user_idx` ON `collection_access` (`user_id`);--> statement-breakpoint
ALTER TABLE `collections` ADD `sharing` text DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE `collections` ADD `team_role` text DEFAULT 'edit' NOT NULL;