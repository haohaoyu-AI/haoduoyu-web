CREATE TABLE outline_flows (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, authorization_key TEXT NOT NULL,
 snapshot TEXT NOT NULL, snapshot_sha256 TEXT NOT NULL, state TEXT NOT NULL,
 outline_json TEXT, outline_sha256 TEXT, review_json TEXT, writing_input TEXT,
 article_id TEXT NOT NULL, expires TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL
);
CREATE UNIQUE INDEX outline_owner_authorization ON outline_flows(owner,authorization_key);
CREATE TABLE outline_flow_stages (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, run_id TEXT NOT NULL,
 stage TEXT NOT NULL, token TEXT NOT NULL, expires TEXT NOT NULL,
 input_json TEXT NOT NULL, input_sha256 TEXT NOT NULL, state TEXT NOT NULL, created TEXT NOT NULL
);
CREATE UNIQUE INDEX outline_owner_run_stage ON outline_flow_stages(owner,run_id,stage);
