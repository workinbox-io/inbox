CREATE TABLE `notification_dismissals` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
