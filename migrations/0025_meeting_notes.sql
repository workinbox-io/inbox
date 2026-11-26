CREATE TABLE `calendar_event_notes` (
	`event_id` text NOT NULL,
	`occurrence` integer DEFAULT 0 NOT NULL,
	`note_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `occurrence`),
	FOREIGN KEY (`event_id`) REFERENCES `calendar_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_event_notes_note_idx` ON `calendar_event_notes` (`note_id`);