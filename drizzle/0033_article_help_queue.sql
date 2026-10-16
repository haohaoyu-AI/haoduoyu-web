CREATE TABLE `article_help_queue_claims` (
 `owner` text NOT NULL,
 `request_key` text NOT NULL,
 `article_id` text,
 `handoff_id` text,
 `event_id` text,
 `claim_hash` text,
 `created` text NOT NULL,
 PRIMARY KEY (`owner`,`request_key`),
 CONSTRAINT `article_help_queue_identity` CHECK (
  (`article_id` IS NULL AND `handoff_id` IS NULL AND `event_id` IS NULL AND `claim_hash` IS NULL)
  OR (`article_id` IS NOT NULL AND `handoff_id` IS NOT NULL AND `event_id` IS NOT NULL AND `claim_hash` IS NOT NULL AND length(`claim_hash`)=64)
 )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_help_queue_article` ON `article_help_queue_claims` (`owner`,`article_id`);
--> statement-breakpoint
CREATE TRIGGER `article_help_queue_frozen` BEFORE UPDATE ON `article_help_queue_claims`
BEGIN SELECT RAISE(ABORT, 'article_help_queue_frozen'); END;
