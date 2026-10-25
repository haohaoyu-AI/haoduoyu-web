CREATE TABLE `matrix_memo_groups` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`version` integer NOT NULL,
	`change_seq` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "matrix_memo_group_title" CHECK(length("matrix_memo_groups"."title") BETWEEN 1 AND 120),
	CONSTRAINT "matrix_memo_group_position" CHECK(typeof("matrix_memo_groups"."position")='integer' AND "matrix_memo_groups"."position" BETWEEN 0 AND 1000000),
	CONSTRAINT "matrix_memo_group_version" CHECK(typeof("matrix_memo_groups"."version")='integer' AND "matrix_memo_groups"."version" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "matrix_memo_group_change_seq" CHECK(typeof("matrix_memo_groups"."change_seq")='integer' AND "matrix_memo_groups"."change_seq" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX `matrix_memo_group_owner_order` ON `matrix_memo_groups` (`user_id`,`deleted_at`,`position`,`id`);--> statement-breakpoint
CREATE TABLE `matrix_memo_notes` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`group_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`version` integer NOT NULL,
	`change_seq` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`,`group_id`) REFERENCES `matrix_memo_groups`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "matrix_memo_note_title" CHECK(length("matrix_memo_notes"."title") BETWEEN 1 AND 120),
	CONSTRAINT "matrix_memo_note_body" CHECK(length(CAST("matrix_memo_notes"."body" AS BLOB)) <= 65536),
	CONSTRAINT "matrix_memo_note_position" CHECK(typeof("matrix_memo_notes"."position")='integer' AND "matrix_memo_notes"."position" BETWEEN 0 AND 1000000),
	CONSTRAINT "matrix_memo_note_version" CHECK(typeof("matrix_memo_notes"."version")='integer' AND "matrix_memo_notes"."version" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "matrix_memo_note_change_seq" CHECK(typeof("matrix_memo_notes"."change_seq")='integer' AND "matrix_memo_notes"."change_seq" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX `matrix_memo_note_owner_order` ON `matrix_memo_notes` (`user_id`,`group_id`,`deleted_at`,`position`,`id`);