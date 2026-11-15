CREATE TABLE `note_access` (
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'edit' NOT NULL,
	PRIMARY KEY(`note_id`, `user_id`),
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_access_user_idx` ON `note_access` (`user_id`);--> statement-breakpoint
CREATE TABLE `note_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_folders_org_idx` ON `note_folders` (`org_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`owner_id` text,
	`title` text DEFAULT '' NOT NULL,
	`icon` text,
	`folder_id` text,
	`sharing` text DEFAULT 'private' NOT NULL,
	`team_role` text DEFAULT 'edit' NOT NULL,
	`content` text,
	`text` text DEFAULT '' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`folder_id`) REFERENCES `note_folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notes_org_idx` ON `notes` (`org_id`,`archived_at`,`updated_at`);--> statement-breakpoint
CREATE INDEX `notes_owner_idx` ON `notes` (`owner_id`);