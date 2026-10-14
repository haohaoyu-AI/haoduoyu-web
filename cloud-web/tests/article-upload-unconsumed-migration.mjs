// Actual offline workerd/D1 + Drizzle migrator. No remote tools or platforms.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8')),index=journal.entries.findIndex(e=>e.tag==='0037_article_upload_unconsumed_continuation');assert.equal(journal.entries[index-1].tag,'0036_article_list_clear');
const old=JSON.parse(fs.readFileSync('drizzle/meta/0036_snapshot.json','utf8')),next=JSON.parse(fs.readFileSync('drizzle/meta/0037_snapshot.json','utf8'));assert.equal(next.prevId,old.id);assert.deepEqual(next.tables,old.tables);
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'unconsumed-d1-'));
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("OFFLINE ONLY");}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'unconsumed-local-migration'}});
try{
 fs.mkdirSync(path.join(folder,'meta'));fs.writeFileSync(path.join(folder,'meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,index)}));for(const e of journal.entries.slice(0,index))fs.copyFileSync('drizzle/'+e.tag+'.sql',path.join(folder,e.tag+'.sql'));
 const d1=await mf.getD1Database('DB'),orm=drizzle(d1);await migrate(orm,{migrationsFolder:folder});
 for(const [n,state,consumed] of [[1,'reserved',null],[2,'outcome_unknown','2026-01-01'],[3,'verified','2026-01-01']])await d1.prepare("INSERT INTO article_upload_attempts(id,owner,article_id,platform,target_account,word_sha256,word_size,authorization_kind,claim_hash,preflight,baseline,state,editor_urls,created,updated,consumed_at) VALUES(?,'OFFLINE-OWNER',?,'toutiao','61556093362',?,100,'new_word',?,'{}','{}',?,'[]','2026-01-01','2026-01-01',?)").bind('OFFLINE-ATTEMPT-'+n,'OFFLINE-ARTICLE-'+n,'a'.repeat(64),'b'.repeat(64),state,consumed).run();
 const before=(await d1.prepare('SELECT * FROM article_upload_attempts ORDER BY id').all()).results;
 const unrelated=async()=>(await d1.prepare("SELECT name,sql FROM sqlite_master WHERE name!='article_upload_child_lineage' ORDER BY name").all()).results,priorSchema=await unrelated();
 // Bound this migration regression to 0037 even after later unrelated schema
 // changes have been added to the production journal.
 fs.writeFileSync(path.join(folder,'meta/_journal.json'),JSON.stringify({...journal,entries:journal.entries.slice(0,index+1)}));
 fs.copyFileSync('drizzle/'+journal.entries[index].tag+'.sql',path.join(folder,journal.entries[index].tag+'.sql'));
 await migrate(orm,{migrationsFolder:folder});await migrate(orm,{migrationsFolder:folder});
 assert.deepEqual((await d1.prepare('SELECT * FROM article_upload_attempts ORDER BY id').all()).results,before);assert.deepEqual(await unrelated(),priorSchema);
 const trigger=await d1.prepare("SELECT sql FROM sqlite_master WHERE name='article_upload_child_lineage'").first();assert.ok(trigger.sql.includes("NEW.authorization_kind='owner_confirmed_reimport'"));assert.ok(trigger.sql.includes("NEW.authorization_kind='unconsumed_continuation'"));assert.ok(trigger.sql.includes('parent_snapshot.consume_token_sha256'));
 await assert.rejects(d1.prepare("UPDATE article_upload_attempts SET claim_hash='changed' WHERE id='OFFLINE-ATTEMPT-1'").run(),/immutable/);await assert.rejects(d1.prepare("DELETE FROM article_upload_attempts WHERE id='OFFLINE-ATTEMPT-1'").run(),/deleted/);
 console.log('PASS actual local D1/Drizzle 0036→0037 twice: only child-lineage trigger changes; all old reserved/unknown/verified rows, columns/indexes/other triggers and immutable history remain intact; external calls=0.');
}finally{await mf.dispose();fs.rmSync(folder,{recursive:true,force:true});}
