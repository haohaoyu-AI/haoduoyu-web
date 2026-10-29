CREATE TABLE `matrix_note_entry_label_overrides` (
  `user_id` text NOT NULL,
  `entry_id` text NOT NULL,
  `labels_json` text NOT NULL,
  PRIMARY KEY (`user_id`, `entry_id`),
  FOREIGN KEY (`user_id`, `entry_id`) REFERENCES `matrix_note_entries` (`user_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT "matrix_note_entry_override_json" CHECK (json_valid(`labels_json`) AND json_type(`labels_json`) = 'array')
);
