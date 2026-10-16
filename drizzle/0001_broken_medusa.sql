CREATE TABLE `event_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`callback` text NOT NULL,
	`secret` text,
	`previous_secret` text,
	`previous_until` text,
	`expires` text NOT NULL,
	`active` text NOT NULL,
	`generation` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscriptions_owner` ON `event_subscriptions` (`owner`);