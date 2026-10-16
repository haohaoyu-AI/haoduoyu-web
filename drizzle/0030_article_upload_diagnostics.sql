CREATE TABLE `article_upload_diagnostics` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`article_id` text NOT NULL,
	`platform` text NOT NULL,
	`executor_id` text NOT NULL,
	`attempt_id` text,
	`stage` text NOT NULL,
	`outcome` text NOT NULL,
	`cause` text NOT NULL,
	`observed_at` text NOT NULL,
	`created` text NOT NULL,
	CONSTRAINT "article_upload_diagnostic_platform" CHECK("article_upload_diagnostics"."platform" IN ('toutiao','zhihu')),
	CONSTRAINT "article_upload_diagnostic_stage" CHECK("article_upload_diagnostics"."stage" IN ('file_handoff','chooser_wait','file_submission','platform_import','draft_readback')),
	CONSTRAINT "article_upload_diagnostic_outcome" CHECK("article_upload_diagnostics"."outcome" IN ('started','returned','failed')),
	CONSTRAINT "article_upload_diagnostic_cause" CHECK("article_upload_diagnostics"."cause" IN ('none','timeout','tool_unavailable','permission_denied','browser_disconnected','platform_rejected','unknown')),
	CONSTRAINT "article_upload_diagnostic_failure" CHECK(("article_upload_diagnostics"."outcome"='failed' AND "article_upload_diagnostics"."cause"<>'none') OR ("article_upload_diagnostics"."outcome"<>'failed' AND "article_upload_diagnostics"."cause"='none')),
	CONSTRAINT "article_upload_diagnostic_rejection" CHECK("article_upload_diagnostics"."cause"<>'platform_rejected' OR "article_upload_diagnostics"."stage"='platform_import')
);
--> statement-breakpoint
CREATE INDEX `article_upload_diagnostics_article` ON `article_upload_diagnostics` (`owner`,`article_id`,`observed_at`);
--> statement-breakpoint
CREATE TRIGGER article_upload_diagnostics_no_update BEFORE UPDATE ON article_upload_diagnostics BEGIN SELECT RAISE(ABORT,'Upload diagnostic is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER article_upload_diagnostics_no_delete BEFORE DELETE ON article_upload_diagnostics BEGIN SELECT RAISE(ABORT,'Upload diagnostic is immutable'); END;
