CREATE TABLE `matrix_todos` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`date` text NOT NULL,
	`text` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "matrix_todo_completed" CHECK("matrix_todos"."completed" IN (0,1)),
	CONSTRAINT "matrix_todo_text" CHECK(length("matrix_todos"."text") BETWEEN 1 AND 500),
	CONSTRAINT "matrix_todo_version" CHECK("matrix_todos"."version" >= 1)
);
--> statement-breakpoint
CREATE INDEX `matrix_todo_user_date` ON `matrix_todos` (`user_id`,`date`,`created_at`);