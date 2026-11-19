import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {applyLocalSchemaMigrations} from '../scripts/migration-contract.mjs';

export const stamp = '2026-11-08T01:02:03.000Z';
export const archiveTables = ['items', 'refs', 'snapshots', 'events', 'imports', 'import_pages'];

export async function localDatabase(t, {through = Infinity} = {}) {
  const runtime = JSON.parse(await readFile(new URL('../runtime.json', import.meta.url), 'utf8'));
  const miniflare = new Miniflare({
    modules: true, cf: false, script: 'export default {fetch(){return new Response(null,{status:404})}}',
    compatibilityDate: runtime.compatibility_date, compatibilityFlags: runtime.compatibility_flags,
    d1Databases: ['DB'], d1Persist: false, outboundService: () => new Response(null, {status: 502}),
  });
  t.after(() => miniflare.dispose());
  const db = await miniflare.getD1Database('DB');
  await applyLocalSchemaMigrations(db, {through});
  return db;
}

export async function seedLegacy(db, owner, article, snapshot, {draftFields = true} = {}) {
  await db.prepare('INSERT OR IGNORE INTO matrix_control(id,initialized,revision) VALUES(1,1,18)').run();
  await db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
    .bind(owner, `synthetic-${owner.slice(0, 8)}`, 'synthetic-password-hash', stamp).run();
  await db.prepare(`INSERT INTO matrix_review_articles(user_id,id,platform_article_id,title,sample_url,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`).bind(owner, article, `synthetic-${article}`, '合成旧稿', 'https://example.test/sample', stamp, stamp).run();
  if (draftFields) {
    await db.prepare("UPDATE matrix_review_articles SET publish_status='pending',draft_saved_at=?,alternate_titles_json=? WHERE user_id=? AND id=?")
      .bind(stamp, '["合成备选标题"]', owner, article).run();
  }
  await db.prepare('INSERT INTO matrix_review_snapshots(user_id,id,article_id,snapshot_date,reads,ctr) VALUES(?,?,?,?,?,?)')
    .bind(owner, snapshot, article, '2026-11-08', 503, null).run();
  await db.prepare('INSERT INTO matrix_idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,?,?)')
    .bind('review-publication:' + owner, article, 'synthetic-draft-proof', JSON.stringify({article}), 200, stamp).run();
}
