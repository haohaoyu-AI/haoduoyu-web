CREATE TABLE matrix_review_prompt_versions (
  user_id text NOT NULL REFERENCES matrix_users(id),
  id text NOT NULL,
  prompt_key text NOT NULL,
  scope text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  content_md text NOT NULL,
  changelog_md text NOT NULL DEFAULT '',
  created_at text NOT NULL,
  updated_at text NOT NULL,
  PRIMARY KEY(user_id,id),
  CONSTRAINT review_prompt_id CHECK(length(id)=36 AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-' AND length(replace(id,'-',''))=32 AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT review_prompt_key CHECK(length(prompt_key) BETWEEN 1 AND 64 AND substr(prompt_key,1,1) GLOB '[a-z]' AND prompt_key NOT GLOB '*[^a-z0-9_-]*' AND substr(prompt_key,-1) NOT IN ('-','_') AND instr(prompt_key,'--')=0 AND instr(prompt_key,'__')=0 AND instr(prompt_key,'-_')=0 AND instr(prompt_key,'_-')=0),
  CONSTRAINT review_prompt_scope CHECK(scope IN ('global','toutiao','vzi','yujian','wechat')),
  CONSTRAINT review_prompt_status CHECK(status IN ('draft','active','archived')),
  CONSTRAINT review_prompt_version CHECK(typeof(version)='integer' AND version BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX review_prompt_version ON matrix_review_prompt_versions(user_id,prompt_key,scope,version);
--> statement-breakpoint
CREATE UNIQUE INDEX review_prompt_active ON matrix_review_prompt_versions(user_id,prompt_key,scope) WHERE status='active';
--> statement-breakpoint
CREATE INDEX review_prompt_history ON matrix_review_prompt_versions(user_id,scope,prompt_key,version,id);
