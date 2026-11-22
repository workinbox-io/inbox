CREATE TABLE `mail_signature_brands` (
	`org_id` text PRIMARY KEY NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`logo_url` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `mailboxes` ADD `signature_card` text;