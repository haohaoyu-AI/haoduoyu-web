CREATE TABLE `matrix_note_labels` (
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`user_id`, `name`),
  FOREIGN KEY (`user_id`) REFERENCES `matrix_users` (`id`) ON DELETE CASCADE,
  CHECK (length(`name`) BETWEEN 1 AND 32)
);
--> statement-breakpoint
CREATE TABLE `matrix_note_entry_labels` (
  `user_id` text NOT NULL,
  `entry_id` text NOT NULL,
  `label` text NOT NULL,
  PRIMARY KEY (`user_id`, `entry_id`),
  FOREIGN KEY (`user_id`, `entry_id`) REFERENCES `matrix_note_entries` (`user_id`, `id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`, `label`) REFERENCES `matrix_note_labels` (`user_id`, `name`)
);
--> statement-breakpoint
CREATE INDEX `matrix_note_entry_label_lookup` ON `matrix_note_entry_labels` (`user_id`, `label`, `entry_id`);
