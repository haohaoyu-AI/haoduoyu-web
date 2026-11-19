import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backup,DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {auditReviewRecovery} from '../scripts/review-recovery-audit.mjs';

const schemaDir=new URL('../drizzle/',import.meta.url);
const now='2026-11-06T12:00:00.000Z';
const owner='2f2cbad5-7645-419f-bf0c-0d39aa9af235';
const draft='cc784d04-f0fd-4038-84b4-3cd33503bc22';
const canonical='1523a728-db99-4b8f-9352-5b55ac11e86b';
const alias='bd604731-cff4-4d5f-bbe1-b4a4cd2f0edb';
const snap='c81063d6-d264-4c00-9cc8-314b8288e826';
const privateMarker='SYNTHETIC_PRIVATE_RECOVERY_TITLE';
const add=(db,name,row)=>{
  const columns=Object.keys(row);
  db.prepare('INSERT INTO matrix_'+name+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')')
    .run(...Object.values(row));
};
async function originalDb(t,stem) {
  const folder=await mkdtemp(join(tmpdir(),stem));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const file=join(folder,'source.sqlite'),db=new DatabaseSync(file);
  t.after(()=>db.close());
  const journal=JSON.parse(await readFile(new URL('meta/_journal.json',schemaDir),'utf8'));
  for(const {tag} of journal.entries.slice(0,29))db.exec(await readFile(new URL(tag+'.sql',schemaDir),'utf8'));
  add(db,'control',{id:1,initialized:1,revision:7});
  add(db,'users',{id:owner,username:'synthetic-recovery',password_hash:'SYNTHETIC-HASH',created_at:now});
  for(const [id,status] of [[draft,'pending'],[canonical,'published'],[alias,'unmatched']]) {
    add(db,'review_articles',{user_id:owner,id,title:privateMarker,created_at:now,updated_at:now,
      publish_status:status,draft_saved_at:now,alternate_titles_json:'["替代标题","备选二","备选三","备选四"]'});
  }
  const receipt={actor:'review-publication:'+owner,request_hash:'synthetic-receipt',status:200,created_at:now};
  add(db,'idempotency',{...receipt,key:canonical,response_json:JSON.stringify({
    original_draft_title:privateMarker,draft_evidence:{body:'合成原稿证据'}})});
  add(db,'idempotency',{...receipt,key:alias,response_json:JSON.stringify({canonical_id:canonical})});
  add(db,'review_snapshots',{user_id:owner,id:snap,article_id:canonical,snapshot_date:'2026-11-06',reads:19,ctr:12.5});
  return {db,file,folder};
}
async function clone(t,source,name) {
  const file=join(source.folder,name+'.sqlite');
  await backup(source.db,file);
  const db=new DatabaseSync(file);
  t.after(()=>db.close());
  return {file,db};
}

test('native recovery checks the complete local restore and the additive 0029 rehearsal without revealing row evidence',async t=>{
  const source=await originalDb(t,'review-recovery-');
  const target=await clone(t,source,'restored');
  const restored=auditReviewRecovery(source.db,target.db);
  assert.equal(restored.tables_checked,42);
  assert.equal(restored.review.present.publish_status,3);
  assert.equal(restored.review.present.draft_saved_at,3);
  assert.equal(restored.review.present.alternate_titles_json,3);
  assert.equal(restored.review.receipts.count,2);
  assert.equal(restored.review.aliases.count,1);
  assert.equal(restored.review.aliases_needing_review,0);
  assert.equal(restored.review.snapshots.count,1);
  target.db.exec(await readFile(new URL('0029_review_archive.sql',schemaDir),'utf8'));
  assert.deepEqual(auditReviewRecovery(source.db,target.db,{phase:'migrate'}).table_digests,restored.table_digests);

  const cli=fileURLToPath(new URL('../scripts/review-recovery-audit.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[cli,'migrate',source.file,target.file],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).verified,true);
  assert.doesNotMatch(result.stdout+result.stderr,new RegExp([privateMarker,owner,snap,source.folder].join('|')));

  target.db.exec('DROP INDEX matrix_review_archive_ref_primary');
  assert.throws(()=>auditReviewRecovery(source.db,target.db,{phase:'migrate'}),
    error=>error.section==='table_schema'&&error.table==='matrix_review_archive_refs');
});

test('unchanged row counts cannot hide lost draft fields, a retargeted receipt, or changed history',async t=>{
  const source=await originalDb(t,'review-recovery-tamper-');
  const target=await clone(t,source,'restored');
  for(const [table,write,undo] of [
    ['matrix_review_articles',()=>target.db.prepare('UPDATE matrix_review_articles SET publish_status=NULL,draft_saved_at=NULL,alternate_titles_json=NULL WHERE id=?').run(draft),
      ()=>target.db.prepare('UPDATE matrix_review_articles SET publish_status=?,draft_saved_at=?,alternate_titles_json=? WHERE id=?')
        .run('pending',now,'["替代标题","备选二","备选三","备选四"]',draft)],
    ['matrix_idempotency',()=>target.db.prepare('UPDATE matrix_idempotency SET response_json=? WHERE key=?')
      .run(JSON.stringify({canonical_id:draft}),alias),
      ()=>target.db.prepare('UPDATE matrix_idempotency SET response_json=? WHERE key=?').run(JSON.stringify({canonical_id:canonical}),alias)],
    ['matrix_review_snapshots',()=>target.db.prepare('UPDATE matrix_review_snapshots SET reads=20 WHERE id=?').run(snap),
      ()=>target.db.prepare('UPDATE matrix_review_snapshots SET reads=19 WHERE id=?').run(snap)],
    ['matrix_review_snapshots',()=>target.db.prepare('UPDATE matrix_review_snapshots SET id=? WHERE id=?').run(alias,snap),
      ()=>target.db.prepare('UPDATE matrix_review_snapshots SET id=? WHERE id=?').run(snap,alias)]
  ]) {
    write();
    assert.throws(()=>auditReviewRecovery(source.db,target.db),error=>error.section==='table_rows'&&error.table===table);
    undo();
  }
  assert.equal(auditReviewRecovery(source.db,target.db).verified,true);
});
