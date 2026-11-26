CREATE TABLE `matrix_diary_titles` (
  `user_id` text NOT NULL,
  `date` text NOT NULL,
  `title` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `date`),
  FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "matrix_diary_titles_title" CHECK(length("title") <= 40),
  CONSTRAINT "matrix_diary_titles_version" CHECK(typeof("version")='integer' AND "version" >= 1),
  CONSTRAINT "matrix_diary_titles_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("date",'+0 days') IS NOT NULL AND date("date",'+0 days') = "date")
);
