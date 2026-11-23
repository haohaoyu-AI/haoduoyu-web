# 好多鱼图文 V1 implementation contract

Independent Node.js 24 application, built-in node:sqlite, no production dependencies. Durable SQLite volume; old application and database untouched. No seeded business metrics. Initial 3 platform accounts are configuration, not fabricated data.

## Data model / SQLite schema (root owns src/db.mjs)

accounts(id TEXT PK,platform TEXT,name TEXT,active INTEGER,created_at TEXT).
articles(id TEXT PK,account_id TEXT,title TEXT,url TEXT,platform_article_id TEXT,published_at TEXT,started_at TEXT nullable,production_mode TEXT:manual|automatic|mixed|unknown,summary TEXT,notes TEXT,version INTEGER,created_at TEXT,updated_at TEXT).
observations(id TEXT PK,article_id TEXT,as_of TEXT,collected_at TEXT,kind TEXT:latest|d1|d3|d7,metrics_json TEXT,source TEXT,note TEXT,created_at TEXT). Append-only. metrics_json object metric -> nonnegative number. Observations cumulative snapshots; latest by as_of. target labels never assert exact collection.
daily_metrics(id TEXT PK,account_id TEXT,article_id TEXT nullable,date TEXT YYYY-MM-DD Beijing day,metrics_json TEXT,source TEXT,updated_at TEXT, UNIQUE(account_id,article_id,date)). NULL article_id means account overall, distinct from article detail; idempotent upsert, no summing both. A means Beijing today + preceding 2 days, today unfinished. Daily observed period data only, no inferred cumulative sums. Account-level daily wins for a day; article fallback explicitly marked coverage.
users(id,username,password_hash,created_at); sessions(token_hash,user_id,expires_at); api_keys(id,name,token_hash,account_ids_json,permissions_json,created_at,revoked_at,last_used_at); audit(id,actor,action,entity_id,detail_json,created_at); idempotency(actor,key,request_hash,response_json,status,created_at,PK(actor,key)); login_attempts(bucket,attempts,window_start).

## HTTP /api/v1 (root owns src/server.mjs and auth)

All responses JSON: success {data:...}; errors {error:{code,message,details?}}. Protected routes use admin session cookie or scoped Bearer token. Sessions all permissions. Key permissions read/write; constrained account_ids. Browser session writes require same Origin plus X-CSRF-Token from GET /auth/me. POST login is same-origin. POST/PUT API writes allow Idempotency-Key. PUT article additionally body.version (409 conflict).

GET /health (public, no data); GET /openapi.json and /api-docs public.
POST /auth/login {username,password}; POST /auth/logout; GET /auth/me -> {username,csrfToken}; PUT /auth/password {currentPassword,newPassword}.
GET /accounts -> array; POST /accounts {platform: toutiao|zhihu|wechat|other,name}; PUT /accounts/:id {name,active}.
GET /articles?account_id=&q=&mode=&from=&to=&sort=published_at|reads|duration&order=desc|asc -> array articles enriched with account_name,platform,latest_metrics,latest_as_of,duration_seconds.
POST /articles {account_id,title,url,published_at,started_at?,production_mode?,summary?,notes?,platform_article_id?}; PUT /articles/:id same fields + version.
GET /articles/:id -> enriched article + observations.
GET /observations?article_id=&account_id= -> array; POST /observations {article_id,as_of,collected_at?,kind,metrics:{reads?,impressions?,likes?,comments?,favorites?,shares?,approvals?,reading_users?},source,note?}.
POST /daily-metrics {account_id,article_id?,date,metrics:{...},source}; GET /daily-metrics?account_id=&from=&to= -> array.
GET /dashboard?account_id= -> summary for last 3 Beijing days {window:{from,to,timezone,todayIncomplete},accounts:[{id,name,platform,article_count,period_metrics,coverage:{...},last_updated}],totals:{article_count,automatic_count,unknown_mode_count,median_duration_seconds},top_articles:[enriched],due_reviews:[{id,title,account_id,account_name,due_kind,due_at}],trend:[{date,accounts:[{account_id,metrics,coverage}]}]}. No cross-platform fabricated unified reach/engagement rate. Missing period metrics null/empty, not zero.
GET /api-keys -> metadata only; POST /api-keys {name,account_ids:[...],permissions:[read,write]} -> {id,token,...} token once; DELETE /api-keys/:id (revoke). Keys cannot manage auth/accounts/keys/audit.
GET /audit -> recent rows (admin only). GET /export -> CSV articles (admin). No deletion API for articles.

## Ownership

Root: db/auth/server/security and project/deployment setup. Agent metrics: src/records.mjs only (accounts/articles/observations/daily dashboard pure database service exports, exported interface to coordinate). Agent UI: public/index.html,public/app.js,public/style.css only. Reviewer/docs agent: tests/metrics.test.mjs and docs only once service contract exists. No Git commits by agents. No secret files.
