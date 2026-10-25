-- CANDIDATE ONLY: not in the active Drizzle journal or build.
-- Execute only with the reviewed preflight/catalog guard and same-batch ledger.
CREATE TABLE `matrix_article_pipeline_assert` (`ok` integer NOT NULL CHECK(`ok`=1));
--> statement-breakpoint
CREATE TABLE `matrix_articles_next` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`platform_article_id` text,
	`published_at` text,
	`started_at` text,
	`production_mode` text DEFAULT 'unknown' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text DEFAULT 'published',
	`slot` text,
	`run_dir` text,
	`run_date` text,
	`series_no` integer,
	`writer` text,
	`illustrator` text,
	`sample_json` text,
	`char_count` integer,
	`subheading_count` integer,
	`image_count` integer,
	`cover_desc` text,
	`draft_ref_json` text,
	`timings_json` text,
	`reruns_json` text,
	`blockers_json` text,
	`verify_items_json` text,
	FOREIGN KEY (`account_id`) REFERENCES `matrix_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "matrix_article_mode" CHECK("matrix_articles_next"."production_mode" IN ('manual','automatic','mixed','unknown')),
	CONSTRAINT `matrix_article_pipeline_status` CHECK(`status` IS NULL OR `status` IN ('drafting','illustrated','draft_saved','published','failed')),
	CONSTRAINT `matrix_article_pipeline_slot` CHECK(`slot` IS NULL OR `slot` IN ('zh1','zh2','tt1','tt2','zh3','tt3','gzh')),
	CONSTRAINT `matrix_article_pipeline_writer` CHECK(`writer` IS NULL OR `writer` IN ('dedao','gemini_web','human','other')),
	CONSTRAINT `matrix_article_pipeline_illustrator` CHECK(`illustrator` IS NULL OR `illustrator` IN ('codex','pil','human')),
	CONSTRAINT `matrix_article_pipeline_series_no` CHECK(`series_no` IS NULL OR (typeof(`series_no`)='integer' AND `series_no` BETWEEN 1 AND 9007199254740991)),
	CONSTRAINT `matrix_article_pipeline_char_count` CHECK(`char_count` IS NULL OR (typeof(`char_count`)='integer' AND `char_count` BETWEEN 0 AND 9007199254740991)),
	CONSTRAINT `matrix_article_pipeline_subheading_count` CHECK(`subheading_count` IS NULL OR (typeof(`subheading_count`)='integer' AND `subheading_count` BETWEEN 0 AND 9007199254740991)),
	CONSTRAINT `matrix_article_pipeline_image_count` CHECK(`image_count` IS NULL OR (typeof(`image_count`)='integer' AND `image_count` BETWEEN 0 AND 9007199254740991)),
	CONSTRAINT `matrix_article_pipeline_sample_json` CHECK(`sample_json` IS NULL OR CASE WHEN json_valid(`sample_json`) THEN json_type(`sample_json`)='object' ELSE 0 END),
	CONSTRAINT `matrix_article_pipeline_draft_ref_json` CHECK(`draft_ref_json` IS NULL OR CASE WHEN json_valid(`draft_ref_json`) THEN json_type(`draft_ref_json`)='object' ELSE 0 END),
	CONSTRAINT `matrix_article_pipeline_timings_json` CHECK(`timings_json` IS NULL OR CASE WHEN json_valid(`timings_json`) THEN json_type(`timings_json`)='object' ELSE 0 END),
	CONSTRAINT `matrix_article_pipeline_reruns_json` CHECK(`reruns_json` IS NULL OR CASE WHEN json_valid(`reruns_json`) THEN json_type(`reruns_json`)='object' ELSE 0 END),
	CONSTRAINT `matrix_article_pipeline_blockers_json` CHECK(`blockers_json` IS NULL OR CASE WHEN json_valid(`blockers_json`) THEN json_type(`blockers_json`)='array' ELSE 0 END),
	CONSTRAINT `matrix_article_pipeline_verify_items_json` CHECK(`verify_items_json` IS NULL OR CASE WHEN json_valid(`verify_items_json`) THEN json_type(`verify_items_json`)='array' ELSE 0 END)
);
--> statement-breakpoint
INSERT INTO `matrix_articles_next` (`rowid`,`id`,`account_id`,`title`,`url`,`platform_article_id`,`published_at`,`started_at`,`production_mode`,`summary`,`notes`,`version`,`created_at`,`updated_at`,`status`) SELECT `rowid`,`id`,`account_id`,`title`,`url`,`platform_article_id`,`published_at`,`started_at`,`production_mode`,`summary`,`notes`,`version`,`created_at`,`updated_at`,'published' FROM `matrix_articles`;
--> statement-breakpoint
CREATE TABLE `matrix_observations_next` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`as_of` text NOT NULL,
	`collected_at` text NOT NULL,
	`kind` text NOT NULL,
	`metrics_json` text NOT NULL,
	`source` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `matrix_articles_next`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "matrix_observation_kind" CHECK("matrix_observations_next"."kind" IN ('latest','d1','d3','d7'))
);
--> statement-breakpoint
INSERT INTO `matrix_observations_next` (`rowid`,`id`,`article_id`,`as_of`,`collected_at`,`kind`,`metrics_json`,`source`,`note`,`created_at`) SELECT `rowid`,`id`,`article_id`,`as_of`,`collected_at`,`kind`,`metrics_json`,`source`,`note`,`created_at` FROM `matrix_observations`;
--> statement-breakpoint
CREATE TABLE `matrix_daily_metrics_next` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`article_id` text,
	`date` text NOT NULL,
	`metrics_json` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `matrix_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `matrix_articles_next`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `matrix_daily_metrics_next` (`rowid`,`id`,`account_id`,`article_id`,`date`,`metrics_json`,`source`,`updated_at`) SELECT `rowid`,`id`,`account_id`,`article_id`,`date`,`metrics_json`,`source`,`updated_at` FROM `matrix_daily_metrics`;
--> statement-breakpoint
INSERT INTO `matrix_article_pipeline_assert` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `matrix_articles`)=(SELECT count(*) FROM `matrix_articles_next`) AND NOT EXISTS(SELECT `rowid`,`id`,`account_id`,`title`,`url`,`platform_article_id`,`published_at`,`started_at`,`production_mode`,`summary`,`notes`,`version`,`created_at`,`updated_at` FROM `matrix_articles` EXCEPT SELECT `rowid`,`id`,`account_id`,`title`,`url`,`platform_article_id`,`published_at`,`started_at`,`production_mode`,`summary`,`notes`,`version`,`created_at`,`updated_at` FROM `matrix_articles_next`) AND NOT EXISTS(SELECT `rowid`,`id`,`account_id`,`title`,`url`,`platform_article_id`,`published_at`,`started_at`,`production_mode`,`summary`,`notes`,`version`,`created_at`,`updated_at` FROM `matrix_articles_next` EXCEPT SELECT `rowid`,`id`,`account_id`,`title`,`url`,`platform_article_id`,`published_at`,`started_at`,`production_mode`,`summary`,`notes`,`version`,`created_at`,`updated_at` FROM `matrix_articles`) THEN 1 ELSE 0 END;
--> statement-breakpoint
INSERT INTO `matrix_article_pipeline_assert` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `matrix_observations`)=(SELECT count(*) FROM `matrix_observations_next`) AND NOT EXISTS(SELECT `rowid`,`id`,`article_id`,`as_of`,`collected_at`,`kind`,`metrics_json`,`source`,`note`,`created_at` FROM `matrix_observations` EXCEPT SELECT `rowid`,`id`,`article_id`,`as_of`,`collected_at`,`kind`,`metrics_json`,`source`,`note`,`created_at` FROM `matrix_observations_next`) AND NOT EXISTS(SELECT `rowid`,`id`,`article_id`,`as_of`,`collected_at`,`kind`,`metrics_json`,`source`,`note`,`created_at` FROM `matrix_observations_next` EXCEPT SELECT `rowid`,`id`,`article_id`,`as_of`,`collected_at`,`kind`,`metrics_json`,`source`,`note`,`created_at` FROM `matrix_observations`) THEN 1 ELSE 0 END;
--> statement-breakpoint
INSERT INTO `matrix_article_pipeline_assert` (`ok`) SELECT CASE WHEN (SELECT count(*) FROM `matrix_daily_metrics`)=(SELECT count(*) FROM `matrix_daily_metrics_next`) AND NOT EXISTS(SELECT `rowid`,`id`,`account_id`,`article_id`,`date`,`metrics_json`,`source`,`updated_at` FROM `matrix_daily_metrics` EXCEPT SELECT `rowid`,`id`,`account_id`,`article_id`,`date`,`metrics_json`,`source`,`updated_at` FROM `matrix_daily_metrics_next`) AND NOT EXISTS(SELECT `rowid`,`id`,`account_id`,`article_id`,`date`,`metrics_json`,`source`,`updated_at` FROM `matrix_daily_metrics_next` EXCEPT SELECT `rowid`,`id`,`account_id`,`article_id`,`date`,`metrics_json`,`source`,`updated_at` FROM `matrix_daily_metrics`) THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE `matrix_observations`;
--> statement-breakpoint
DROP TABLE `matrix_daily_metrics`;
--> statement-breakpoint
DROP TABLE `matrix_articles`;
--> statement-breakpoint
ALTER TABLE `matrix_articles_next` RENAME TO `matrix_articles`;
--> statement-breakpoint
ALTER TABLE `matrix_observations_next` RENAME TO `matrix_observations`;
--> statement-breakpoint
ALTER TABLE `matrix_daily_metrics_next` RENAME TO `matrix_daily_metrics`;
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_article_url` ON `matrix_articles` (`account_id`,`url`);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_article_platform_id` ON `matrix_articles` (`account_id`,`platform_article_id`) WHERE "matrix_articles"."platform_article_id" IS NOT NULL AND "matrix_articles"."platform_article_id" != '';
--> statement-breakpoint
CREATE INDEX `matrix_article_account_date` ON `matrix_articles` (`account_id`,`published_at`);
--> statement-breakpoint
CREATE INDEX `matrix_observation_article_time` ON `matrix_observations` (`article_id`,`as_of`);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_daily_account_day` ON `matrix_daily_metrics` (`account_id`,`date`) WHERE "matrix_daily_metrics"."article_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_daily_article_day` ON `matrix_daily_metrics` (`account_id`,`article_id`,`date`) WHERE "matrix_daily_metrics"."article_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_article_run_dir` ON `matrix_articles` (`run_dir`) WHERE `run_dir` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_article_slot_date` ON `matrix_articles` (`slot`,`run_date`) WHERE `slot` IS NOT NULL AND `run_date` IS NOT NULL;
--> statement-breakpoint
DROP TABLE `matrix_article_pipeline_assert`;
