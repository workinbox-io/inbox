CREATE TABLE `calendar_access` (
	`calendar_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'view' NOT NULL,
	PRIMARY KEY(`calendar_id`, `user_id`),
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calendar_access_user_idx` ON `calendar_access` (`user_id`);--> statement-breakpoint
CREATE TABLE `calendar_attendees` (
	`event_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'needs-action' NOT NULL,
	`optional` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`event_id`, `email`),
	FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `calendar_attendees_user_idx` ON `calendar_attendees` (`user_id`);--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`uid` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`rrule` text,
	`exdates` text DEFAULT '[]' NOT NULL,
	`recur_until` integer,
	`parent_id` text,
	`original_start` integer,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`busy` integer DEFAULT true NOT NULL,
	`organizer_email` text,
	`organizer_user_id` text,
	`sequence` integer DEFAULT 0 NOT NULL,
	`reminders` text DEFAULT '[]' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calendar_events_range_idx` ON `calendar_events` (`org_id`,`calendar_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `calendar_events_uid_idx` ON `calendar_events` (`org_id`,`uid`);--> statement-breakpoint
CREATE INDEX `calendar_events_parent_idx` ON `calendar_events` (`parent_id`);--> statement-breakpoint
CREATE TABLE `calendar_feeds` (
	`token` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_feeds_user_idx` ON `calendar_feeds` (`org_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `calendar_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`timezones` text DEFAULT '[]' NOT NULL,
	`week_start` integer DEFAULT 1 NOT NULL,
	`work_start` integer DEFAULT 540 NOT NULL,
	`work_end` integer DEFAULT 1020 NOT NULL,
	`default_reminder` integer DEFAULT 10,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `calendar_reminder_log` (
	`key` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	`personal` integer DEFAULT false NOT NULL,
	`sharing` text DEFAULT 'private' NOT NULL,
	`team_role` text DEFAULT 'view' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `calendars_org_idx` ON `calendars` (`org_id`);--> statement-breakpoint
CREATE INDEX `calendars_owner_idx` ON `calendars` (`owner_id`);