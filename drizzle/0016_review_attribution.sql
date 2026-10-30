ALTER TABLE `matrix_review_articles` ADD `playbook_version_used` integer CONSTRAINT "matrix_review_article_playbook_version_used" CHECK("playbook_version_used" IS NULL OR (typeof("playbook_version_used")='integer' AND "playbook_version_used" BETWEEN 1 AND 9007199254740991));
--> statement-breakpoint
ALTER TABLE `matrix_review_articles` ADD `applied_rule_ids_json` text CONSTRAINT "matrix_review_article_applied_rule_ids_json" CHECK("applied_rule_ids_json" IS NULL OR CASE WHEN json_valid("applied_rule_ids_json") THEN json_type("applied_rule_ids_json")='array' ELSE 0 END);
--> statement-breakpoint
ALTER TABLE `matrix_review_snapshots` ADD `age_hours` integer CONSTRAINT "matrix_review_snapshot_age_hours" CHECK("age_hours" IS NULL OR (typeof("age_hours")='integer' AND "age_hours" BETWEEN 0 AND 9007199254740991));
--> statement-breakpoint
ALTER TABLE `matrix_review_snapshots` ADD `source` text CONSTRAINT "matrix_review_snapshot_source" CHECK("source" IS NULL OR "source" IN ('toutiao_excel','manual'));
