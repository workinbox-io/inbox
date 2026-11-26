CREATE TABLE `status_components` (
	`component` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`since` integer NOT NULL,
	`checked_at` integer NOT NULL,
	`pending_status` text,
	`pending_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `status_days` (
	`component` text NOT NULL,
	`day` text NOT NULL,
	`ok` integer DEFAULT 0 NOT NULL,
	`degraded` integer DEFAULT 0 NOT NULL,
	`down` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`component`, `day`)
);
--> statement-breakpoint
CREATE TABLE `status_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`component` text NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`started_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `status_incidents_started_idx` ON `status_incidents` (`started_at`);