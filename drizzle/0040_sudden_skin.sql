ALTER TABLE `dedao_batches` ADD `queue_revision` text;
--> statement-breakpoint
UPDATE `dedao_batches` SET `queue_revision` = `updated` WHERE `queue_revision` IS NULL;
