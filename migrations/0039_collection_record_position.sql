ALTER TABLE `collection_records` ADD `position` real DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing records keep their order: newest change on top.
UPDATE `collection_records` SET `position` = -`updated_at`;