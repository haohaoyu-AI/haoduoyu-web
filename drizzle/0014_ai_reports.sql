CREATE TABLE `matrix_ai_reports` (
  `user_id` text NOT NULL REFERENCES `matrix_users`(`id`) ON DELETE cascade,
  `id` text NOT NULL,
  `author` text NOT NULL,
  `content` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `matrix_ai_reports_owner_time` ON `matrix_ai_reports` (`user_id`, `created_at`, `id`);
