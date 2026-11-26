ALTER TABLE `notification_dismissals` ADD `until` integer;--> statement-breakpoint
ALTER TABLE `notification_dismissals` ADD `muted` integer DEFAULT false NOT NULL;