CREATE TABLE `matrix_openai_review_config` (
  `user_id` text NOT NULL REFERENCES `matrix_users`(`id`),
  `account` text NOT NULL DEFAULT 'V字',
  `instructions` text NOT NULL,
  `version` integer NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`user_id`,`account`),
  CONSTRAINT `matrix_openai_review_config_account` CHECK (account = 'V字'),
  CONSTRAINT `matrix_openai_review_config_version` CHECK (typeof(version)='integer' AND version BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE `matrix_openai_review_runs` (
  `user_id` text NOT NULL REFERENCES `matrix_users`(`id`),
  `id` text NOT NULL,
  `account` text NOT NULL DEFAULT 'V字',
  `status` text NOT NULL,
  `mode` text NOT NULL,
  `requested_mode` text NOT NULL,
  `beijing_date` text NOT NULL,
  `created_at` text NOT NULL,
  `completed_at` text,
  `released_at` text,
  `model` text NOT NULL,
  `instruction_version` integer NOT NULL,
  `instructions` text NOT NULL,
  `baseline_run_id` text,
  `source_revision` integer NOT NULL,
  `source_manifest_json` text NOT NULL,
  `source_data_json` text NOT NULL,
  `input_json` text NOT NULL,
  `report_markdown` text NOT NULL DEFAULT '',
  `summary_json` text,
  `error_code` text,
  `error_message` text,
  `provider_response_id` text,
  `provider_calls` integer NOT NULL DEFAULT 0,
  PRIMARY KEY(`user_id`,`id`),
  CONSTRAINT `matrix_openai_review_runs_account` CHECK (account = 'V字'),
  CONSTRAINT `matrix_openai_review_runs_status` CHECK (status IN ('running','succeeded','failed','uncertain')),
  CONSTRAINT `matrix_openai_review_runs_mode` CHECK (mode IN ('full','incremental')),
  CONSTRAINT `matrix_openai_review_runs_requested_mode` CHECK (requested_mode IN ('full','incremental')),
  CONSTRAINT `matrix_openai_review_runs_date` CHECK (beijing_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(beijing_date,'+0 days') IS NOT NULL AND date(beijing_date,'+0 days') = beijing_date),
  CONSTRAINT `matrix_openai_review_runs_id` CHECK (length(id)=36 AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-' AND length(replace(id,'-',''))=32 AND lower(replace(id,'-','')) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT `matrix_openai_review_runs_instruction_version` CHECK (typeof(instruction_version)='integer' AND instruction_version BETWEEN 1 AND 9007199254740991),
  CONSTRAINT `matrix_openai_review_runs_source_revision` CHECK (typeof(source_revision)='integer' AND source_revision BETWEEN 0 AND 9007199254740991),
  CONSTRAINT `matrix_openai_review_runs_provider_calls` CHECK (typeof(provider_calls)='integer' AND provider_calls BETWEEN 0 AND 9007199254740991),
  CONSTRAINT `matrix_openai_review_runs_source_manifest_json` CHECK (json_valid(source_manifest_json)),
  CONSTRAINT `matrix_openai_review_runs_source_data_json` CHECK (json_valid(source_data_json)),
  CONSTRAINT `matrix_openai_review_runs_input_json` CHECK (json_valid(input_json)),
  CONSTRAINT `matrix_openai_review_runs_summary_json` CHECK (summary_json IS NULL OR json_valid(summary_json))
);
--> statement-breakpoint
CREATE INDEX `matrix_openai_review_owner_day` ON `matrix_openai_review_runs` (`user_id`,`account`,`beijing_date`,`created_at`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `matrix_openai_review_unresolved` ON `matrix_openai_review_runs` (`user_id`,`account`) WHERE status IN ('running','uncertain') AND released_at IS NULL;
