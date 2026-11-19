CREATE TABLE `matrix_review_archive_items` (
  `user_id` text NOT NULL REFERENCES `matrix_users`(`id`) ON DELETE cascade,
  `id` text NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('article','micro')),
  `production_status` text NOT NULL CHECK (`production_status` IN ('unfinished','complete','unknown')),
  `publication_status` text NOT NULL CHECK (`publication_status` IN ('unpublished','pending','scheduled','published','deleted','unknown')),
  `association_status` text NOT NULL CHECK (`association_status` IN ('pending','matched','ambiguous','not_needed')),
  `payload_json` text NOT NULL CHECK (CASE WHEN json_valid(`payload_json`) THEN json_type(`payload_json`)='object' ELSE 0 END),
  `verified_json` text NOT NULL CHECK (CASE WHEN json_valid(`verified_json`) THEN json_type(`verified_json`)='object' ELSE 0 END),
  `legacy_id` text,
  `merged_into` text CHECK (`merged_into` IS NULL OR `merged_into`<>`id`),
  `version` integer NOT NULL CHECK (typeof(`version`)='integer' AND `version` BETWEEN 1 AND 9007199254740991),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`user_id`,`id`),
  FOREIGN KEY (`user_id`,`legacy_id`) REFERENCES `matrix_review_articles`(`user_id`,`id`),
  FOREIGN KEY (`user_id`,`merged_into`) REFERENCES `matrix_review_archive_items`(`user_id`,`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_review_archive_item_legacy` ON `matrix_review_archive_items` (`user_id`,`legacy_id`);
--> statement-breakpoint
CREATE INDEX `matrix_review_archive_item_recent` ON `matrix_review_archive_items` (`user_id`,`updated_at`,`id`);
--> statement-breakpoint
CREATE TABLE `matrix_review_archive_refs` (
  `user_id` text NOT NULL,
  `id` text NOT NULL,
  `item_id` text NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('draft','publication')),
  `platform_id` text NOT NULL CHECK (length(`platform_id`)>0),
  `role` text NOT NULL CHECK (`role` IN ('primary','duplicate','other')),
  `payload_json` text NOT NULL CHECK (CASE WHEN json_valid(`payload_json`) THEN json_type(`payload_json`)='object' ELSE 0 END),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`user_id`,`id`),
  FOREIGN KEY (`user_id`,`item_id`) REFERENCES `matrix_review_archive_items`(`user_id`,`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_review_archive_ref_platform` ON `matrix_review_archive_refs` (`user_id`,`kind`,`platform_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_review_archive_ref_primary` ON `matrix_review_archive_refs` (`user_id`,`item_id`,`kind`) WHERE `role`='primary';
--> statement-breakpoint
CREATE INDEX `matrix_review_archive_ref_item` ON `matrix_review_archive_refs` (`user_id`,`item_id`,`kind`,`id`);
--> statement-breakpoint
CREATE TABLE `matrix_review_archive_snapshots` (
  `user_id` text NOT NULL,
  `id` text NOT NULL,
  `item_id` text NOT NULL,
  `observed_at` text,
  `source` text NOT NULL,
  `source_key` text NOT NULL,
  `metrics_json` text NOT NULL CHECK (CASE WHEN json_valid(`metrics_json`) THEN json_type(`metrics_json`)='object' ELSE 0 END),
  `created_at` text NOT NULL,
  PRIMARY KEY (`user_id`,`id`),
  FOREIGN KEY (`user_id`,`item_id`) REFERENCES `matrix_review_archive_items`(`user_id`,`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_review_archive_snapshot_source` ON `matrix_review_archive_snapshots` (`user_id`,`source`,`source_key`);
--> statement-breakpoint
CREATE INDEX `matrix_review_archive_snapshot_item` ON `matrix_review_archive_snapshots` (`user_id`,`item_id`,`observed_at`,`id`);
--> statement-breakpoint
CREATE TABLE `matrix_review_archive_events` (
  `user_id` text NOT NULL REFERENCES `matrix_users`(`id`) ON DELETE cascade,
  `id` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `version` integer NOT NULL CHECK (typeof(`version`)='integer' AND `version` BETWEEN 1 AND 9007199254740991),
  `action` text NOT NULL,
  `details_json` text NOT NULL CHECK (CASE WHEN json_valid(`details_json`) THEN json_type(`details_json`)='object' ELSE 0 END),
  `created_at` text NOT NULL,
  PRIMARY KEY (`user_id`,`id`)
);
--> statement-breakpoint
CREATE INDEX `matrix_review_archive_event_entity` ON `matrix_review_archive_events` (`user_id`,`entity_type`,`entity_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `matrix_review_archive_imports` (
  `user_id` text NOT NULL REFERENCES `matrix_users`(`id`) ON DELETE cascade,
  `id` text NOT NULL,
  `kind` text NOT NULL,
  `source` text NOT NULL,
  `source_key` text NOT NULL,
  `scope_json` text NOT NULL CHECK (CASE WHEN json_valid(`scope_json`) THEN json_type(`scope_json`)='object' ELSE 0 END),
  `started_at` text NOT NULL,
  `completed_at` text,
  PRIMARY KEY (`user_id`,`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_review_archive_import_source` ON `matrix_review_archive_imports` (`user_id`,`kind`,`source`,`source_key`);
--> statement-breakpoint
CREATE TABLE `matrix_review_archive_import_pages` (
  `user_id` text NOT NULL,
  `run_id` text NOT NULL,
  `page` integer NOT NULL CHECK (typeof(`page`)='integer' AND `page` BETWEEN 0 AND 9007199254740991),
  `request_hash` text NOT NULL,
  `result_json` text NOT NULL CHECK (CASE WHEN json_valid(`result_json`) THEN json_type(`result_json`)='object' ELSE 0 END),
  `committed_at` text NOT NULL,
  PRIMARY KEY (`user_id`,`run_id`,`page`),
  FOREIGN KEY (`user_id`,`run_id`) REFERENCES `matrix_review_archive_imports`(`user_id`,`id`)
);
