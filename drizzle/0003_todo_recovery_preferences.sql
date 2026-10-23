CREATE TABLE `matrix_todo_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`completed_mode` text DEFAULT 'strike' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "matrix_todo_completed_mode" CHECK("matrix_todo_preferences"."completed_mode" IN ('strike','hide')),
	CONSTRAINT "matrix_todo_preferences_version" CHECK("matrix_todo_preferences"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE `matrix_todo_template_links` ADD `created_with_todo` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `matrix_todos` ADD `deleted_at` text;