// Offline combined-schema migration check: published 0035 remains byte-for-byte intact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
const current=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));
const index=current.entries.findIndex(e=>e.tag==='0036_article_list_clear');assert.ok(index>0);assert.equal(current.entries[index-1].tag,'0035_local_word_queue');
const old=JSON.parse(fs.readFileSync('drizzle/meta/0035_snapshot.json','utf8')),next=JSON.parse(fs.readFileSync('drizzle/meta/0036_snapshot.json','utf8'));assert.equal(next.prevId,old.id);
assert.deepEqual(Object.keys(next.tables).filter(k=>JSON.stringify(next.tables[k])!==JSON.stringify(old.tables[k])).sort(),['article_deletions','article_list_deletions']);
const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'list-clear-migration-'));
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("OFFLINE SYNTHETIC ONLY");}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'list-clear-combined-schema'}});
try{
 const journal={...current,entries:current.entries.slice(0,index)};fs.mkdirSync(path.join(baseline,'meta'));fs.writeFileSync(path.join(baseline,'meta/_journal.json'),JSON.stringify(journal));for(const entry of journal.entries)fs.copyFileSync('drizzle/'+entry.tag+'.sql',path.join(baseline,entry.tag+'.sql'));
 const d1=await mf.getD1Database('DB'),orm=drizzle(d1);await migrate(orm,{migrationsFolder:baseline});
 await d1.prepare("INSERT INTO local_word_queue_claims(owner,claim_request_key,execution_id,created) VALUES('OFFLINE-OWNER','OFFLINE-KEY','OFFLINE-EXEC','2026-10-08')").run();
 await d1.prepare("INSERT INTO local_word_jobs(id,owner,request_key,source_kind,output_mode,destinations_json,filename,title,source_sha256,original_sha256,input_sha256,input_json,artifact_manifest,state,created,updated,dispatch_state) VALUES('localword_00000000-0000-4000-8000-000000000001','OFFLINE-OWNER','OFFLINE-LOCAL','local_desktop','word_only','[]','synthetic.docx','OFFLINE TITLE','SOURCE-HASH','ORIGINAL-HASH','INPUT-HASH','{}','{}','queued','2026-01-01','2026-01-01','pending')").run();
 await d1.prepare("INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES('00000000-0000-4000-8000-000000000001','OFFLINE-OWNER','OFFLINE','offline.txt','articles/00000000-0000-4000-8000-000000000001/source','[\"OFFLINE_BODY\"]','2026-10-08','queued')").run();
 const unaffected=async()=>(await d1.prepare("SELECT name,sql FROM sqlite_master WHERE tbl_name NOT IN ('article_deletions','article_list_deletions') AND name NOT IN ('article_deleted_insert_fence','article_deleting_content_fence') ORDER BY name").all()).results;
 const before=await unaffected();const local=await d1.prepare('SELECT * FROM local_word_jobs').all(),receipt=await d1.prepare('SELECT * FROM local_word_queue_claims').all(),article=await d1.prepare('SELECT * FROM articles').all();
 // Isolate the historical 0036 step even when later migrations intentionally change other triggers.
 const through0036={...current,entries:current.entries.slice(0,index+1)};fs.writeFileSync(path.join(baseline,'meta/_journal.json'),JSON.stringify(through0036));fs.copyFileSync('drizzle/0036_article_list_clear.sql',path.join(baseline,'0036_article_list_clear.sql'));
 await migrate(orm,{migrationsFolder:baseline});await migrate(orm,{migrationsFolder:baseline});
 assert.deepEqual(await unaffected(),before);assert.deepEqual((await d1.prepare('SELECT * FROM local_word_jobs').all()).results,local.results);assert.deepEqual((await d1.prepare('SELECT * FROM local_word_queue_claims').all()).results,receipt.results);assert.deepEqual((await d1.prepare('SELECT * FROM articles').all()).results,article.results);
 assert.equal((await d1.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name IN ('article_deleted_insert_fence','article_deleting_content_fence')").first()).n,2);
 await assert.rejects(d1.prepare("DELETE FROM local_word_queue_claims WHERE owner='OFFLINE-OWNER'").run(),/local_word_queue_receipt_retained/);
 console.log('PASS combined 0035→0036 actual local D1/Drizzle migration, exact parent snapshot, only two changed table definitions, queue/job/article sentinels and all unrelated schema preserved, queue receipt trigger retained, both deletion triggers installed, idempotent reapply. No remote calls.');
}finally{await mf.dispose();fs.rmSync(baseline,{recursive:true,force:true});}
