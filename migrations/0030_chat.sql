CREATE TABLE `chat_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text DEFAULT 'channel' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`private` integer DEFAULT false NOT NULL,
	`dm_key` text,
	`created_by` text,
	`last_message_at` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_channels_org_idx` ON `chat_channels` (`org_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_channels_name_idx` ON `chat_channels` (`org_id`,`kind`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_channels_dm_idx` ON `chat_channels` (`org_id`,`dm_key`);--> statement-breakpoint
CREATE TABLE `chat_follows` (
	`user_id` text NOT NULL,
	`message_id` text NOT NULL,
	`last_read_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `message_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_members` (
	`channel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`last_read_at` integer NOT NULL,
	`muted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `user_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `chat_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_members_user_idx` ON `chat_members` (`user_id`,`org_id`);--> statement-breakpoint
CREATE TABLE `chat_mentions` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`message_id`, `user_id`),
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_mentions_user_idx` ON `chat_mentions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`parent_id` text,
	`author_id` text,
	`text` text DEFAULT '' NOT NULL,
	`files` text,
	`reply_count` integer DEFAULT 0 NOT NULL,
	`last_reply_at` integer,
	`edited_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `chat_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chat_messages_channel_idx` ON `chat_messages` (`channel_id`,`parent_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `chat_messages_org_idx` ON `chat_messages` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_pins` (
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`pinned_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `message_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `chat_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_reactions` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`message_id`, `user_id`, `emoji`),
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_saved` (
	`user_id` text NOT NULL,
	`message_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `message_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
