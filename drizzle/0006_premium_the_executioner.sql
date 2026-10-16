CREATE TABLE `claude_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`day` text NOT NULL,
	`state` text NOT NULL,
	`response` text,
	`created` text NOT NULL
);
