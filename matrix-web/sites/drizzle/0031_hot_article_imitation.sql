CREATE TABLE hot_article_batches (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, request_key TEXT NOT NULL,
 writer TEXT NOT NULL, authority_id TEXT, state TEXT NOT NULL,
 input_json TEXT, input_sha256 TEXT, result_json TEXT, result_sha256 TEXT,
 selected_reference_id TEXT, selected_topic TEXT, claim_hash TEXT, claim_expires TEXT,
 created TEXT NOT NULL, updated TEXT NOT NULL, error TEXT, dispatch_state TEXT NOT NULL DEFAULT 'pending'
);
--> statement-breakpoint
CREATE UNIQUE INDEX hot_article_owner_request ON hot_article_batches(owner,request_key);
--> statement-breakpoint
CREATE INDEX hot_article_owner_created ON hot_article_batches(owner,created);
--> statement-breakpoint
CREATE UNIQUE INDEX hot_article_owner_writer_reference ON hot_article_batches(owner,writer,selected_reference_id) WHERE selected_reference_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE hot_article_outbox (
 batch_id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, event_id TEXT NOT NULL,
 state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until TEXT, created TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE hot_article_editorial_links (
 batch_id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, writer TEXT NOT NULL,
 run_id TEXT NOT NULL, batch_sha256 TEXT NOT NULL, reference_id TEXT NOT NULL, created TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX hot_article_owner_batch_writer ON hot_article_editorial_links(owner,batch_id,writer);
--> statement-breakpoint
CREATE UNIQUE INDEX hot_article_run_unique ON hot_article_editorial_links(run_id);
--> statement-breakpoint
CREATE TABLE hot_article_transport_acceptance (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, authority_id TEXT NOT NULL,
 source_message_id TEXT NOT NULL, evidence_sha256 TEXT NOT NULL, evidence_json TEXT NOT NULL,
 created TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX hot_article_transport_owner_authority ON hot_article_transport_acceptance(owner,authority_id);
--> statement-breakpoint
CREATE TABLE hot_article_transport_probes (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, authority_id TEXT NOT NULL,
 result_json TEXT NOT NULL, created TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE hot_article_topic_reservations (
 owner TEXT NOT NULL, topic_key TEXT NOT NULL, batch_id TEXT NOT NULL, expires TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX hot_article_owner_topic_reservation ON hot_article_topic_reservations(owner,topic_key);
