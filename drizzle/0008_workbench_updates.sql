CREATE TABLE `matrix_account_profiles` (
	`account_id` text PRIMARY KEY NOT NULL,
	`profile_url` text NOT NULL,
	`platform_identity` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `matrix_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_account_profile_url` ON `matrix_account_profiles` (`profile_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_account_profile_identity` ON `matrix_account_profiles` (`platform_identity`);--> statement-breakpoint
CREATE TABLE `matrix_note_entries` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`category` text NOT NULL,
	`date` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`version` integer NOT NULL,
	`change_seq` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "matrix_note_entry_category" CHECK("matrix_note_entries"."category" IN ('life','work')),
	CONSTRAINT "matrix_note_entry_version" CHECK("matrix_note_entries"."version" >= 1),
	CONSTRAINT "matrix_note_entry_changes" CHECK("matrix_note_entries"."change_seq" >= 1)
);
--> statement-breakpoint
CREATE INDEX `matrix_note_entry_day` ON `matrix_note_entries` (`user_id`,`category`,`date`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `matrix_work_reminders` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`date` text NOT NULL,
	`source_key` text NOT NULL,
	`summary` text NOT NULL,
	`version` integer NOT NULL,
	`change_seq` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "matrix_work_reminder_version" CHECK("matrix_work_reminders"."version" >= 1),
	CONSTRAINT "matrix_work_reminder_changes" CHECK("matrix_work_reminders"."change_seq" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_work_reminder_source` ON `matrix_work_reminders` (`user_id`,`date`,`source_key`);