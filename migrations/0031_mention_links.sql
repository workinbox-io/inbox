CREATE TABLE `note_links` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`note_id` text NOT NULL,
	`token` text NOT NULL,
	`mode` text DEFAULT 'live' NOT NULL,
	`snapshot_title` text,
	`snapshot_content` text,
	`expires_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_links_token_idx` ON `note_links` (`token`);--> statement-breakpoint
CREATE INDEX `note_links_note_idx` ON `note_links` (`note_id`);--> statement-breakpoint
ALTER TABLE `drive_links` ADD `mode` text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE `drive_links` ADD `snapshot_key` text;--> statement-breakpoint
ALTER TABLE `drive_links` ADD `snapshot_name` text;--> statement-breakpoint
ALTER TABLE `drive_links` ADD `snapshot_type` text;--> statement-breakpoint
ALTER TABLE `drive_links` ADD `snapshot_size` integer;