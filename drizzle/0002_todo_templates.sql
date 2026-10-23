CREATE TABLE `matrix_todo_template_links` (
	`user_id` text NOT NULL,
	`todo_id` text NOT NULL,
	`template_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `todo_id`),
	FOREIGN KEY (`user_id`,`todo_id`) REFERENCES `matrix_todos`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`template_id`) REFERENCES `matrix_todo_templates`(`user_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `matrix_todo_template_link` ON `matrix_todo_template_links` (`user_id`,`template_id`);--> statement-breakpoint
CREATE TABLE `matrix_todo_templates` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`text` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "matrix_todo_template_text" CHECK(length("matrix_todo_templates"."text") BETWEEN 1 AND 500),
	CONSTRAINT "matrix_todo_template_version" CHECK("matrix_todo_templates"."version" >= 1)
);
--> statement-breakpoint
CREATE INDEX `matrix_todo_template_user` ON `matrix_todo_templates` (`user_id`,`deleted_at`,`created_at`);