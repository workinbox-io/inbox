ALTER TABLE `mail_forward_targets` ADD `created_by` text REFERENCES user(id) ON DELETE cascade;
