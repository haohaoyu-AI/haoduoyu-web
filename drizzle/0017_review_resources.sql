CREATE TABLE matrix_review_benchmark_accounts (
  user_id TEXT NOT NULL, id TEXT NOT NULL, account TEXT NOT NULL, platform TEXT NOT NULL, name TEXT NOT NULL,
  profile_url TEXT, fans INTEGER, is_featured_author INTEGER, posting_cadence TEXT, topic_focus TEXT,
  title_patterns_json TEXT, structure_notes_md TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  PRIMARY KEY (user_id,id), FOREIGN KEY (user_id) REFERENCES matrix_users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX review_benchmark_account_key ON matrix_review_benchmark_accounts(user_id,account,platform,name);
--> statement-breakpoint
CREATE TABLE matrix_review_benchmark_articles (
  user_id TEXT NOT NULL, id TEXT NOT NULL, benchmark_account_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL,
  reads INTEGER, published_at TEXT, title_pattern TEXT, topic TEXT, news_hook TEXT, word_count INTEGER, image_count INTEGER,
  collected_on TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  PRIMARY KEY (user_id,id), FOREIGN KEY (user_id,benchmark_account_id) REFERENCES matrix_review_benchmark_accounts(user_id,id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX review_benchmark_article_key ON matrix_review_benchmark_articles(user_id,benchmark_account_id,url);
--> statement-breakpoint
CREATE TABLE matrix_review_notes (
  user_id TEXT NOT NULL, id TEXT NOT NULL, account TEXT NOT NULL, note_date TEXT NOT NULL, kind TEXT NOT NULL,
  title TEXT NOT NULL, body_md TEXT, tags_json TEXT, related_article_ids_json TEXT, related_rule_ids_json TEXT, decided_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(user_id,id),
  FOREIGN KEY (user_id) REFERENCES matrix_users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX review_notes_account_date ON matrix_review_notes(user_id,account,note_date,id);
--> statement-breakpoint
CREATE TABLE matrix_review_account_health (
  user_id TEXT NOT NULL, id TEXT NOT NULL, account TEXT NOT NULL, platform TEXT NOT NULL, observed_on TEXT NOT NULL,
  impressions_per_day INTEGER, reads_per_day INTEGER, ctr REAL, since_date TEXT, platform_notice_json TEXT,
  judgement TEXT, action TEXT, resume_on TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  PRIMARY KEY(user_id,id), FOREIGN KEY(user_id) REFERENCES matrix_users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX review_health_account_date ON matrix_review_account_health(user_id,account,observed_on,id);
