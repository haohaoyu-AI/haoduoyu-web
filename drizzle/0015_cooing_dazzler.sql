CREATE TABLE `workflow_controls` (
	`owner` text NOT NULL,
	`scope` text NOT NULL,
	`run_id` text NOT NULL,
	`state` text NOT NULL,
	`reason` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_controls_owner_scope_run` ON `workflow_controls` (`owner`,`scope`,`run_id`);