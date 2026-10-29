CREATE TABLE `matrix_note_label_archives` (
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `archived_at` text NOT NULL,
  PRIMARY KEY (`user_id`, `name`),
  FOREIGN KEY (`user_id`) REFERENCES `matrix_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT "matrix_note_label_archive_name" CHECK (length(`name`) BETWEEN 1 AND 32)
);
