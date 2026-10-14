CREATE TABLE `claude_settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`secret` text NOT NULL,
	`enabled` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
DROP INDEX `writing_owner_day`;--> statement-breakpoint
ALTER TABLE `writing_runs` ADD `writer` text DEFAULT 'xiaoyu' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `writing_owner_day_writer` ON `writing_runs` (`owner`,`day`,`writer`);