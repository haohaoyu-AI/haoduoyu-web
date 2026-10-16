// Real local workerd/D1 migration and queue transactions. No remote I/O.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {webcrypto} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {createSyntheticHarness,sha256} from './word-recovery-harness.mjs';
const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'help-queue-d1-'));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("OFFLINE");}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'help-queue-offline'}});
const h=createSyntheticHarness({projectRoot:process.cwd(),migrate:false});
try {
 const full=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));
 const index=full.entries.findIndex(entry=>entry.tag==='0033_article_help_queue');assert.ok(index>=0);
 const journal={...full,entries:full.entries.slice(0,index)};
 const target={...full,entries:full.entries.slice(0,index+1)};
 const targetFolder=path.join(baseline,'target');fs.mkdirSync(path.join(targetFolder,'meta'),{recursive:true});
 fs.writeFileSync(path.join(targetFolder,'meta/_journal.json'),JSON.stringify(target));
 for(const entry of target.entries)fs.copyFileSync('drizzle/'+entry.tag+'.sql',path.join(targetFolder,entry.tag+'.sql'));
 fs.mkdirSync(path.join(baseline,'meta'));fs.writeFileSync(path.join(baseline,'meta/_journal.json'),JSON.stringify(journal));
 for(const entry of journal.entries)fs.copyFileSync('drizzle/'+entry.tag+'.sql',path.join(baseline,entry.tag+'.sql'));
 const d1=await mf.getD1Database('DB'),orm=drizzle(d1);
 await migrate(orm,{migrationsFolder:baseline});
 const oldSchema=(await d1.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all()).results;
 await migrate(orm,{migrationsFolder:targetFolder});
 const newSchema=(await d1.prepare("SELECT name,sql FROM sqlite_master WHERE tbl_name <> 'article_help_queue_claims' ORDER BY name").all()).results;
 assert.deepEqual(newSchema,oldSchema);
 // Preserve the historical 0033-only prior-schema assertion above, then run the
 // current real TypeScript modules against full 0046 workerd/D1 storage. Helpers
 // are loaded normally; their origin behavior is never mocked or reimplemented.
 await migrate(orm,{migrationsFolder:'drizzle'});
 await migrate(orm,{migrationsFolder:'drizzle'});
 h.env.DB=d1;const api=h.loader()('article-help-queue');
 const call=(owner,key,name='claim_next_article_help')=>api.articleHelpQueueCall(owner,name,{request_key:key});
 const uuid=()=>webcrypto.randomUUID();
 async function seed(owner,state='queued'){
  const id=uuid(),handoff=uuid(),now=new Date().toISOString();
  await d1.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,?,?,?,?,?,?)').bind(id,owner,'Synthetic','synthetic.txt','articles/'+id+'/source','["Synthetic","Body"]',now,state).run();
  await d1.prepare('INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,?,?,?,?)').bind(handoff,owner,id,'event_'+handoff,'delivered',now,now,now).run();
  return id;
 }
 const owner='OFFLINE-OWNER',id=await seed(owner),key=uuid();
 const results=await Promise.all(Array.from({length:8},()=>call(owner,key)));
 assert.equal(results.filter(r=>r.new_execution_grant).length,1);
 assert.ok(results.every(r=>r.article_id===id&&r.claimed));
 assert.ok(results.every(r=>r.claim_token===results[0].claim_token));
 assert.equal((await d1.prepare('SELECT count(*) AS n FROM article_help_queue_claims').first()).n,1);
 const origin=await d1.prepare("SELECT * FROM word_claim_origins WHERE owner=? AND target_kind='article' AND target_id=?").bind(owner,id).first();
 assert.equal(origin.claim_hash,sha256(results[0].claim_token));assert.equal(origin.origin,'fresh_claim');
 assert.equal(origin.proof_reference,'article_help_queue_claim:'+sha256(key));
 assert.equal((await d1.prepare('SELECT word_claim_origin_hash FROM articles WHERE id=?').bind(id).first()).word_claim_origin_hash,origin.claim_hash);
 assert.ok(!JSON.stringify(origin).includes(results[0].claim_token));
 assert.equal((await d1.prepare('SELECT count(*) AS n FROM word_claim_origins').first()).n,1);
 assert.equal((await call('OTHER-OWNER',key,'read_article_help_claim')).status,'not_recorded');
 const second=await seed(owner),third=await seed(owner);
 const separate=await Promise.all([call(owner,uuid()),call(owner,uuid())]);
 assert.deepEqual(new Set(separate.map(r=>r.article_id)),new Set([second,third]));
 assert.ok(separate.every(r=>r.new_execution_grant));
 assert.equal((await d1.prepare('SELECT count(*) AS n FROM word_claim_origins').first()).n,3);
 await seed(owner,'processing');await seed(owner,'completed');
 const emptyKey=uuid();assert.equal((await call(owner,emptyKey)).status,'empty');
 await seed(owner);assert.equal((await call(owner,emptyKey)).status,'empty');
 assert.equal((await d1.prepare('SELECT count(*) AS n FROM word_claim_origins').first()).n,3,'historical processing/completed and empty retries do not backfill proof');
 await assert.rejects(()=>d1.prepare('UPDATE article_help_queue_claims SET event_id=? WHERE owner=? AND request_key=?').bind('changed',owner,key).run());
 await assert.rejects(()=>d1.prepare('UPDATE word_claim_origins SET proof_reference=? WHERE owner=? AND target_id=?').bind('changed',owner,id).run());
 await d1.prepare("UPDATE articles SET state='completed' WHERE id=?").bind(id).run();
 const completed=await call(owner,key,'read_article_help_claim');assert.equal(completed.claimed,false);assert.equal(Object.hasOwn(completed,'claim_token'),false);
 const rollbackOwner='OFFLINE-ROLLBACK',rollbackId=await seed(rollbackOwner),rollbackKey=uuid();
 await d1.prepare("CREATE TRIGGER offline_fail_hash BEFORE INSERT ON article_claim_credential_hashes BEGIN SELECT RAISE(ABORT,'OFFLINE_ROLLBACK'); END").run();
 await assert.rejects(()=>call(rollbackOwner,rollbackKey));
 assert.equal((await call(rollbackOwner,rollbackKey,'read_article_help_claim')).status,'not_recorded');
 assert.equal((await d1.prepare('SELECT state FROM articles WHERE id=?').bind(rollbackId).first()).state,'queued');
 assert.equal((await d1.prepare('SELECT word_claim_origin_hash FROM articles WHERE id=?').bind(rollbackId).first()).word_claim_origin_hash,null);
 assert.equal((await d1.prepare('SELECT count(*) AS n FROM word_claim_origins WHERE owner=?').bind(rollbackOwner).first()).n,0,'origin hook rolls back with actual claim and receipt');
 await d1.prepare('DROP TRIGGER offline_fail_hash').run();
 await migrate(orm,{migrationsFolder:'drizzle'});
 assert.equal((await call(rollbackOwner,rollbackKey)).new_execution_grant,true);
 assert.equal((await d1.prepare('SELECT count(*) AS n FROM word_claim_origins WHERE owner=?').bind(rollbackOwner).first()).n,1);
 assert.equal(h.externalCalls,0);
 console.log('PASS real local workerd/D1: original 0033 migration/prior-schema assertion plus full 0046 current module loader, same-key 8-way race, different-key race, owner isolation, empty receipt stability, immutable one-time fresh claim origins/native hash binding, no historical backfill, terminal credential suppression, full claim/receipt/origin rollback and same-key retry, idempotent migration. No remote/model/production I/O.');
} finally {h.close();await mf.dispose();fs.rmSync(baseline,{recursive:true,force:true});}
