ALTER TABLE `mail_domains` ADD `provider` text DEFAULT 'cloudflare' NOT NULL;--> statement-breakpoint
ALTER TABLE `mail_domains` ADD `dkim_tokens` text;