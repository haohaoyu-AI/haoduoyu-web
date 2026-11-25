CREATE TABLE `matrix_review_articles` (
  `user_id` text NOT NULL,
  `id` text NOT NULL,
  `account` text DEFAULT 'V字' NOT NULL,
  `platform` text DEFAULT 'toutiao' NOT NULL,
  `platform_article_id` text,
  `title` text NOT NULL,
  `url` text,
  `published_at` text,
  `topic_category` text,
  `title_pattern` text,
  `sample_title` text,
  `sample_url` text,
  `image_count` integer,
  `source_chat` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `id`),
  FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "matrix_review_article_platform" CHECK("matrix_review_articles"."platform" = 'toutiao'),
  CONSTRAINT "matrix_review_article_image_count" CHECK("matrix_review_articles"."image_count" IS NULL OR (typeof("matrix_review_articles"."image_count")='integer' AND "matrix_review_articles"."image_count" BETWEEN 0 AND 9007199254740991))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_review_article_platform_id` ON `matrix_review_articles` (`user_id`, `account`, `platform_article_id`);
--> statement-breakpoint
CREATE INDEX `matrix_review_article_account_date` ON `matrix_review_articles` (`user_id`, `account`, `published_at`, `id`);
--> statement-breakpoint
CREATE TABLE `matrix_review_snapshots` (
  `user_id` text NOT NULL,
  `id` text NOT NULL,
  `article_id` text NOT NULL,
  `snapshot_date` text NOT NULL,
  `impressions` integer,
  `fan_impressions` integer,
  `reads` integer,
  `fan_reads` integer,
  `ctr` real,
  `completion_rate` real,
  `avg_read_seconds` real,
  `likes` integer,
  `comments` integer,
  `reposts` integer,
  `shares` integer,
  `favorites` integer,
  `revenue` real,
  `traffic_sources_json` text,
  `completion_curve_json` text,
  `audience_json` text,
  PRIMARY KEY(`user_id`, `id`),
  FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`, `article_id`) REFERENCES `matrix_review_articles`(`user_id`, `id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "matrix_review_snapshot_counts" CHECK(("matrix_review_snapshots"."impressions" IS NULL OR (typeof("matrix_review_snapshots"."impressions")='integer' AND "matrix_review_snapshots"."impressions" BETWEEN 0 AND 9007199254740991)) AND ("matrix_review_snapshots"."fan_impressions" IS NULL OR (typeof("matrix_review_snapshots"."fan_impressions")='integer' AND "matrix_review_snapshots"."fan_impressions" BETWEEN 0 AND 9007199254740991)) AND ("matrix_review_snapshots"."reads" IS NULL OR (typeof("matrix_review_snapshots"."reads")='integer' AND "matrix_review_snapshots"."reads" BETWEEN 0 AND 9007199254740991)) AND ("matrix_review_snapshots"."fan_reads" IS NULL OR (typeof("matrix_review_snapshots"."fan_reads")='integer' AND "matrix_review_snapshots"."fan_reads" BETWEEN 0 AND 9007199254740991)) AND ("matrix_review_snapshots"."likes" IS NULL OR (typeof("matrix_review_snapshots"."likes")='integer' AND "matrix_review_snapshots"."likes" BETWEEN 0 AND 9007199254740991)) AND ("matrix_review_snapshots"."comments" IS NULL OR (typeof("matrix_review_snapshots"."comments")='integer' AND "matrix_review_snapshots"."comments" BETWEEN 0 AND 9007199254740991)) AND ("matrix_review_snapshots"."reposts" IS NULL OR (typeof("matrix_review_snapshots"."reposts")='integer' AND "matrix_review_snapshots"."reposts" BETWEEN 0 AND 9007199254740991)) AND ("matrix_review_snapshots"."shares" IS NULL OR (typeof("matrix_review_snapshots"."shares")='integer' AND "matrix_review_snapshots"."shares" BETWEEN 0 AND 9007199254740991)) AND ("matrix_review_snapshots"."favorites" IS NULL OR (typeof("matrix_review_snapshots"."favorites")='integer' AND "matrix_review_snapshots"."favorites" BETWEEN 0 AND 9007199254740991))),
  CONSTRAINT "matrix_review_snapshot_rates" CHECK(("matrix_review_snapshots"."ctr" IS NULL OR "matrix_review_snapshots"."ctr" >= 0) AND ("matrix_review_snapshots"."completion_rate" IS NULL OR "matrix_review_snapshots"."completion_rate" >= 0) AND ("matrix_review_snapshots"."avg_read_seconds" IS NULL OR "matrix_review_snapshots"."avg_read_seconds" >= 0) AND ("matrix_review_snapshots"."revenue" IS NULL OR "matrix_review_snapshots"."revenue" >= 0)),
  CONSTRAINT "matrix_review_snapshot_traffic_json" CHECK("matrix_review_snapshots"."traffic_sources_json" IS NULL OR json_valid("matrix_review_snapshots"."traffic_sources_json")),
  CONSTRAINT "matrix_review_snapshot_curve_json" CHECK("matrix_review_snapshots"."completion_curve_json" IS NULL OR json_valid("matrix_review_snapshots"."completion_curve_json")),
  CONSTRAINT "matrix_review_snapshot_audience_json" CHECK("matrix_review_snapshots"."audience_json" IS NULL OR json_valid("matrix_review_snapshots"."audience_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_review_snapshot_article_date` ON `matrix_review_snapshots` (`user_id`, `article_id`, `snapshot_date`);
--> statement-breakpoint
CREATE TABLE `matrix_review_reports` (
  `user_id` text NOT NULL,
  `id` text NOT NULL,
  `account` text DEFAULT 'V字' NOT NULL,
  `period_type` text NOT NULL,
  `period_start` text NOT NULL,
  `period_end` text NOT NULL,
  `verdicts_json` text DEFAULT '{}' NOT NULL,
  `findings_json` text DEFAULT '{}' NOT NULL,
  `summary_md` text DEFAULT '' NOT NULL,
  `metrics_json` text DEFAULT '{}' NOT NULL,
  `playbook_version` integer,
  `created_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `id`),
  FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "matrix_review_report_period_type" CHECK("matrix_review_reports"."period_type" IN ('daily','three_day','weekly')),
  CONSTRAINT "matrix_review_report_period_order" CHECK("matrix_review_reports"."period_start" <= "matrix_review_reports"."period_end"),
  CONSTRAINT "matrix_review_report_playbook_version" CHECK("matrix_review_reports"."playbook_version" IS NULL OR (typeof("matrix_review_reports"."playbook_version")='integer' AND "matrix_review_reports"."playbook_version" BETWEEN 1 AND 9007199254740991)),
  CONSTRAINT "matrix_review_report_verdicts_json" CHECK(CASE WHEN json_valid("matrix_review_reports"."verdicts_json") THEN json_type("matrix_review_reports"."verdicts_json")='object' ELSE 0 END),
  CONSTRAINT "matrix_review_report_findings_json" CHECK(CASE WHEN json_valid("matrix_review_reports"."findings_json") THEN json_type("matrix_review_reports"."findings_json")='object' ELSE 0 END),
  CONSTRAINT "matrix_review_report_metrics_json" CHECK(CASE WHEN json_valid("matrix_review_reports"."metrics_json") THEN json_type("matrix_review_reports"."metrics_json")='object' ELSE 0 END)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_review_report_account_period` ON `matrix_review_reports` (`user_id`, `account`, `period_type`, `period_start`);
--> statement-breakpoint
CREATE INDEX `matrix_review_report_account_date` ON `matrix_review_reports` (`user_id`, `account`, `period_start`, `id`);
--> statement-breakpoint
CREATE TABLE `matrix_review_playbooks` (
  `user_id` text NOT NULL,
  `id` text NOT NULL,
  `account` text DEFAULT 'V字' NOT NULL,
  `version` integer NOT NULL,
  `published_on` text NOT NULL,
  `content_md` text DEFAULT '' NOT NULL,
  `rules_json` text DEFAULT '[]' NOT NULL,
  `changelog_md` text DEFAULT '' NOT NULL,
  `sent_to_gemini_at` text,
  `created_at` text NOT NULL,
  PRIMARY KEY(`user_id`, `id`),
  FOREIGN KEY (`user_id`) REFERENCES `matrix_users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "matrix_review_playbook_version" CHECK(typeof("matrix_review_playbooks"."version")='integer' AND "matrix_review_playbooks"."version" BETWEEN 1 AND 9007199254740991),
  CONSTRAINT "matrix_review_playbook_rules_json" CHECK(CASE WHEN json_valid("matrix_review_playbooks"."rules_json") THEN json_type("matrix_review_playbooks"."rules_json")='array' ELSE 0 END)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_review_playbook_account_version` ON `matrix_review_playbooks` (`user_id`, `account`, `version`);
