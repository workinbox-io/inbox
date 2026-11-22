CREATE TABLE `notification_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`digest` integer DEFAULT true NOT NULL,
	`muted` text DEFAULT '[]' NOT NULL,
	`last_digest_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`app` text NOT NULL,
	`actor_id` text,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`href` text NOT NULL,
	`group_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	`digested_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_digest_idx` ON `notifications` (`read_at`,`digested_at`,`created_at`);
