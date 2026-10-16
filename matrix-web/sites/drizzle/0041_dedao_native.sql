CREATE TABLE IF NOT EXISTS dedao_native_sessions (
 owner TEXT NOT NULL, executor_id TEXT NOT NULL, thread_id TEXT NOT NULL, session_id TEXT NOT NULL,
 turn_id TEXT, state TEXT NOT NULL DEFAULT 'pending', credential_hash TEXT NOT NULL, credential_expires TEXT NOT NULL,
 hooks_ready INTEGER NOT NULL DEFAULT 0, wake_ready INTEGER NOT NULL DEFAULT 0, wake_id TEXT, hooks_config_sha256 TEXT,
 lifecycle_source TEXT, observation_ref TEXT,
 last_observed_at TEXT NOT NULL, updated TEXT NOT NULL,
 PRIMARY KEY(owner,executor_id), UNIQUE(credential_hash),
 CHECK(state IN ('pending','active','idle','interrupted','ended'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dedao_batch_runtime (
 batch_id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, runtime TEXT NOT NULL,
 thread_id TEXT, session_id TEXT, claimed_turn_id TEXT, safe_boundary INTEGER NOT NULL DEFAULT 1,
 boundary_reason TEXT, updated TEXT NOT NULL,
 CHECK(runtime IN ('native_codex','cli_cdp')),
 CHECK(runtime='cli_cdp' OR (thread_id IS NOT NULL AND session_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dedao_native_lifecycle (
 owner TEXT NOT NULL,event_id TEXT NOT NULL,executor_id TEXT NOT NULL,session_id TEXT NOT NULL,turn_id TEXT NOT NULL,
 event TEXT NOT NULL,payload_sha256 TEXT NOT NULL,observed_at TEXT NOT NULL,created TEXT NOT NULL,
 PRIMARY KEY(owner,event_id),CHECK(event IN ('Stop','Interrupt','SessionEnd','UserPromptSubmit'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dedao_native_observations (
 owner TEXT NOT NULL,event_id TEXT NOT NULL,executor_id TEXT NOT NULL,session_id TEXT NOT NULL,turn_id TEXT NOT NULL,
 state TEXT NOT NULL,payload_sha256 TEXT NOT NULL,observation_ref TEXT NOT NULL,observed_at TEXT NOT NULL,created TEXT NOT NULL,
 PRIMARY KEY(owner,event_id),CHECK(state IN ('active','completed','interrupted','idle','ended'))
);
--> statement-breakpoint
INSERT OR IGNORE INTO dedao_batch_runtime(batch_id,owner,runtime,safe_boundary,updated)
 SELECT id,owner,'cli_cdp',executor_ended,updated FROM dedao_batches;
