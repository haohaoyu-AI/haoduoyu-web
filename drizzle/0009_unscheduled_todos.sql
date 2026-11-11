CREATE TABLE `matrix_unscheduled_todos` (
  `user_id` text NOT NULL,
  `id` text NOT NULL,
  `text` text NOT NULL,
  `completed` integer DEFAULT 0 NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `deleted_at` text,
  PRIMARY KEY (`user_id`, `id`),
  FOREIGN KEY (`user_id`) REFERENCES `matrix_users` (`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "matrix_unscheduled_todo_completed" CHECK (`completed` IN (0,1)),
  CONSTRAINT "matrix_unscheduled_todo_text" CHECK (length(`text`) BETWEEN 1 AND 500),
  CONSTRAINT "matrix_unscheduled_todo_version" CHECK (`version` >= 1)
);
--> statement-breakpoint
CREATE INDEX `matrix_unscheduled_todo_user_created` ON `matrix_unscheduled_todos` (`user_id`,`created_at`,`id`);
