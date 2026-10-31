import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reviewView} from '../src/content-review-validation.mjs';
import {reviewResourcesMigrationTag,reviewLegacyExtensionsMigrationTag,validateReviewResourcesMigrationSource,validateReviewLegacyExtensionsMigrationSource} from '../scripts/migration-contract.mjs';

const source=tag=>readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8');
test('v1.2 additive migrations preserve synthetic v1.1 rows and content hashes',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('PRAGMA foreign_keys=ON');
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries.slice(0,17))db.exec(source(tag).replaceAll('--> statement-breakpoint',''));
  const user=randomUUID(),article=randomUUID(),snapshot=randomUUID(),report=randomUUID(),playbook=randomUUID();
  const time='2026-10-30T00:00:00.000Z';
  db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(user,'legacy-fixture','synthetic',time);
  db.prepare('INSERT INTO matrix_review_articles(user_id,id,title,sample_title,sample_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(user,article,'旧文章','旧样本','https://example.invalid/old',time,time);
  db.prepare('INSERT INTO matrix_review_snapshots(user_id,id,article_id,snapshot_date,reads) VALUES(?,?,?,?,?)').run(user,snapshot,article,'2026-10-30',100);
  db.prepare('INSERT INTO matrix_review_reports(user_id,id,period_type,period_start,period_end,summary_md,created_at) VALUES(?,?,?,?,?,?,?)').run(user,report,'daily','2026-10-30','2026-10-30','历史。一。二。三。',time);
  db.prepare('INSERT INTO matrix_review_playbooks(user_id,id,version,published_on,rules_json,created_at) VALUES(?,?,?,?,?,?)').run(user,playbook,1,'2026-10-30','[{"rule_id":"r1","section":"title","text":"历史"}]',time);
  const kinds=['articles','snapshots','reports','playbooks'];
  const rows=Object.fromEntries(kinds.map(kind=>[kind,db.prepare('SELECT * FROM matrix_review_'+kind).get()]));
  const hashes=Object.fromEntries(kinds.map(kind=>[kind,reviewView(kind,rows[kind]).content_hash]));
  for(const statement of validateReviewResourcesMigrationSource(reviewResourcesMigrationTag,source(reviewResourcesMigrationTag)))db.exec(statement);
  for(const statement of validateReviewLegacyExtensionsMigrationSource(reviewLegacyExtensionsMigrationTag,source(reviewLegacyExtensionsMigrationTag)))db.exec(statement);
  for(const kind of kinds) {
    const now=db.prepare('SELECT * FROM matrix_review_'+kind).get();
    assert.deepEqual(Object.fromEntries(Object.keys(rows[kind]).map(key=>[key,now[key]])),{...rows[kind]});
    assert.equal(reviewView(kind,now).content_hash,hashes[kind]);
  }
  assert.equal(db.prepare('SELECT reference_article_id FROM matrix_review_articles').get().reference_article_id,null);
  assert.equal(db.prepare('SELECT status FROM matrix_review_playbooks').get().status,null);
  assert.throws(()=>db.prepare("UPDATE matrix_review_playbooks SET status='invalid'").run());
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
