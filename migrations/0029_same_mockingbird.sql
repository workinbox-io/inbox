ALTER TABLE `calendars` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `calendars` ADD `synced_at` integer;--> statement-breakpoint
ALTER TABLE `calendars` ADD `sync_hash` text;--> statement-breakpoint
ALTER TABLE `calendars` ADD `sync_error` text;