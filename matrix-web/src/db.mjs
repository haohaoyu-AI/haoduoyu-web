import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openDatabase(file = process.env.MATRIX_DB_PATH || './data/matrix.sqlite') {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') chmodSync(file, 0o600);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec('BEGIN IMMEDIATE');
  try {
    const schema = [
      "CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,platform TEXT NOT NULL,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS articles(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),title TEXT NOT NULL,url TEXT NOT NULL,platform_article_id TEXT,published_at TEXT NOT NULL,started_at TEXT,production_mode TEXT NOT NULL DEFAULT 'unknown' CHECK(production_mode IN ('manual','automatic','mixed','unknown')),summary TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(account_id,url))",
      "CREATE UNIQUE INDEX IF NOT EXISTS article_platform_id ON articles(account_id,platform_article_id) WHERE platform_article_id IS NOT NULL AND platform_article_id != ''",
      "CREATE INDEX IF NOT EXISTS article_account_date ON articles(account_id,published_at)",
      "CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,article_id TEXT NOT NULL REFERENCES articles(id),as_of TEXT NOT NULL,collected_at TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('latest','d1','d3','d7')),metrics_json TEXT NOT NULL,source TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS observation_article_time ON observations(article_id,as_of)",
      "CREATE TABLE IF NOT EXISTS daily_metrics(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),article_id TEXT REFERENCES articles(id),date TEXT NOT NULL,metrics_json TEXT NOT NULL,source TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(account_id,article_id,date))",
      "CREATE UNIQUE INDEX IF NOT EXISTS daily_metric_scope ON daily_metrics(account_id,coalesce(article_id,''),date)",
      "CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,account_ids_json TEXT NOT NULL,permissions_json TEXT NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT,last_used_at TEXT)",
      "CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,entity_id TEXT,detail_json TEXT NOT NULL,created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS idempotency(actor TEXT NOT NULL,key TEXT NOT NULL,request_hash TEXT NOT NULL,response_json TEXT NOT NULL,status INTEGER NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(actor,key))",
      "CREATE TABLE IF NOT EXISTS login_attempts(bucket TEXT PRIMARY KEY,attempts INTEGER NOT NULL,window_start INTEGER NOT NULL)",
      "INSERT OR IGNORE INTO schema_versions VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
    ];
    db.exec(schema.join(';\n') + ';');
    const insert = db.prepare('INSERT OR IGNORE INTO accounts(id,platform,name,active,created_at) VALUES(?,?,?,1,?)');
    const stamp = new Date().toISOString();
    for (const [id, platform, name] of [
      ['toutiao-haoduoyu', 'toutiao', '好多鱼'],
      ['zhihu-haoduoyu', 'zhihu', '好多鱼'],
      ['wechat-xiaoyuer', 'wechat', '小鱼儿真保鲜'],
    ]) insert.run(id, platform, name, stamp);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); db.close(); throw e; }
  return db;
}
