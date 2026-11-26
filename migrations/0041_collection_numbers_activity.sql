CREATE TABLE `collection_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`record_id` text NOT NULL,
	`actor_id` text,
	`field` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`record_id`) REFERENCES `collection_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `collection_activity_record_idx` ON `collection_activity` (`record_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `collection_records` ADD `number` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `collections` ADD `prefix` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `collections` ADD `next_number` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Existing records are numbered by creation, oldest first; each collection continues after its last number.
UPDATE `collection_records` SET `number` = (
	SELECT `n` FROM (SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `collection_id` ORDER BY `created_at`, `id`) AS `n` FROM `collection_records`) AS `numbered`
	WHERE `numbered`.`id` = `collection_records`.`id`
);--> statement-breakpoint
UPDATE `collections` SET `next_number` = 1 + COALESCE((SELECT MAX(`number`) FROM `collection_records` WHERE `collection_records`.`collection_id` = `collections`.`id`), 0);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_records_number_idx` ON `collection_records` (`collection_id`,`number`);
