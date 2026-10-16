CREATE TABLE `manual_writing_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`authorization_key` text NOT NULL,
	`day` text NOT NULL,
	`input_hash` text NOT NULL,
	`snapshot` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manual_owner_authorization` ON `manual_writing_batches` (`owner`,`authorization_key`);