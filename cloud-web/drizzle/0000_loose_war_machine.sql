CREATE TABLE `connection_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created` text NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tests_owner_created` ON `connection_tests` (`owner`,`created`);