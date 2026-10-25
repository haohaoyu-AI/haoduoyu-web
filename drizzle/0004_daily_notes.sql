CREATE TABLE `matrix_daily_notes` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`version` integer NOT NULL,
	`change_seq` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "matrix_daily_notes_version" CHECK("matrix_daily_notes"."version" >= 1),
	CONSTRAINT "matrix_daily_notes_change_seq" CHECK("matrix_daily_notes"."change_seq" >= 1)
);
--> statement-breakpoint
CREATE INDEX `matrix_daily_notes_user_changes` ON `matrix_daily_notes` (`user_id`,`change_seq`,`date`);