CREATE TABLE `drive_access` (
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'view' NOT NULL,
	PRIMARY KEY(`item_id`, `user_id`),
	FOREIGN KEY (`item_id`) REFERENCES `drive_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drive_access_user_idx` ON `drive_access` (`user_id`);--> statement-breakpoint
CREATE TABLE `drive_items` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`parent_id` text,
	`path` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`owner_id` text,
	`sharing` text DEFAULT 'private' NOT NULL,
	`team_role` text DEFAULT 'view' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`media_type` text,
	`r2_key` text,
	`trashed_at` integer,
	`trashed_by` text,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `drive_items_parent_idx` ON `drive_items` (`org_id`,`parent_id`,`trashed_at`);--> statement-breakpoint
CREATE INDEX `drive_items_path_idx` ON `drive_items` (`org_id`,`path`);--> statement-breakpoint
CREATE INDEX `drive_items_owner_idx` ON `drive_items` (`owner_id`);--> statement-breakpoint
CREATE TABLE `drive_links` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`item_id` text NOT NULL,
	`token` text NOT NULL,
	`password_hash` text,
	`expires_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `drive_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_links_token_idx` ON `drive_links` (`token`);--> statement-breakpoint
CREATE INDEX `drive_links_item_idx` ON `drive_links` (`item_id`);--> statement-breakpoint
CREATE TABLE `drive_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text,
	`parent_id` text,
	`name` text NOT NULL,
	`media_type` text NOT NULL,
	`size` integer NOT NULL,
	`r2_key` text NOT NULL,
	`upload_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drive_uploads_org_idx` ON `drive_uploads` (`org_id`,`created_at`);