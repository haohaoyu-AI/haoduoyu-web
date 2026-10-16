ALTER TABLE `articles` ADD `artifact_manifest` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `draft_readback` text;--> statement-breakpoint
ALTER TABLE `article_deliveries` ADD `readback` text;--> statement-breakpoint
ALTER TABLE `writing_runs` ADD `input_snapshot` text;