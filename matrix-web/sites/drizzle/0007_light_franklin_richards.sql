DROP INDEX `writing_owner_day_writer`;--> statement-breakpoint
ALTER TABLE `writing_runs` ADD `run_kind` text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE `writing_runs` ADD `style_version` text;--> statement-breakpoint
CREATE UNIQUE INDEX `writing_owner_day_writer_kind` ON `writing_runs` (`owner`,`day`,`writer`,`run_kind`);--> statement-breakpoint
UPDATE writing_runs SET run_kind='sample',style_version='试稿·旧版风格' WHERE article_id='f14a14ff-a2b6-4585-9e85-48311fdc91b1' AND day='2026-10-05' AND writer='xiaoyu';
