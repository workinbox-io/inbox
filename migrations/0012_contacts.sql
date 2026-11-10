CREATE TABLE `contact_emails` (
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`contact_id` text NOT NULL,
	PRIMARY KEY(`org_id`, `email`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_emails_contact_idx` ON `contact_emails` (`contact_id`);--> statement-breakpoint
CREATE TABLE `contact_group_members` (
	`group_id` text NOT NULL,
	`contact_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `contact_id`),
	FOREIGN KEY (`group_id`) REFERENCES `contact_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_group_members_contact_idx` ON `contact_group_members` (`contact_id`);--> statement-breakpoint
CREATE TABLE `contact_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_groups_org_idx` ON `contact_groups` (`org_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`emails` text DEFAULT '[]' NOT NULL,
	`phones` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`contact_count` integer DEFAULT 0 NOT NULL,
	`last_contacted_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contacts_org_idx` ON `contacts` (`org_id`,`name`);--> statement-breakpoint
CREATE INDEX `contacts_recent_idx` ON `contacts` (`org_id`,`last_contacted_at`);