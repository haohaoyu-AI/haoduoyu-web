// Local workerd D1/R2 only. This process has no Site/production credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("LOCAL ISOLATED FIXTURE");}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'list-clear-offline'},r2Buckets:{BUCKET:'list-clear-offline-files'}});
try {
 const d1=await mf.getD1Database('DB'),r2=await mf.getR2Bucket('BUCKET');
 await migrate(drizzle(d1),{migrationsFolder:'drizzle'});
 let beforeBatch=null,failAt=0,deletes=0;
 const db={prepare:source=>d1.prepare(source),async batch(statements){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;await hook();}return d1.batch(statements);}};
 const bucket={list:args=>r2.list(args),head:key=>r2.head(key),async delete(key){if(failAt&&++deletes===failAt)throw Error('isolated R2 failure');return r2.delete(key);}};
 const modules=new Map();
 function load(file){file=path.normalize(file);if(modules.has(file))return modules.get(file);const ex={};modules.set(file,ex);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports:ex,require:dependency=>dependency==='cloudflare:workers'?{env:{DB:db,BUCKET:bucket}}:dependency==='./writing-input'?{hashText:async s=>createHash('sha256').update(s).digest('hex')}:dependency==='./test-store'?{db:()=>db}:dependency==='./articles'?{bucket:()=>bucket}:load(path.join(path.dirname(file),dependency+'.ts')),crypto:webcrypto,TextEncoder,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,Date,Error,Set,Map,JSON});return ex;}
 const {previewListDeletion,confirmListDeletion,readListDeletion}=load('lib/article-list-deletion.ts');
 const uuid=()=>webcrypto.randomUUID(),now=()=>new Date().toISOString();
 async function seed(owner){const id=uuid(),source=`articles/${id}/source`,result=`articles/${id}/result-${'a'.repeat(64)}.docx`;
  await d1.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,result_key,result_meta,draft_url) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,owner,'Isolated','isolated.docx',source,'["Isolated","ISOLATED_BODY"]',now(),'completed',result,'{}','https://example.test/private').run();
  await d1.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,draft_url,updated) VALUES(?,?,?,?,?,?,?)').bind(uuid(),owner,id,'zhihu','saved','https://example.test/private',now()).run();
  await d1.prepare('INSERT INTO word_progress_events(owner,target_kind,target_id,version,event_id,input_sha256,payload_sha256,snapshot_json,created) VALUES(?,?,?,?,?,?,?,?,?)').bind(owner,'article',id,1,uuid(),'a'.repeat(64),'b'.repeat(64),JSON.stringify({observations:{collect_images:{action:'search_public_images',reason:'none',candidate_urls:['https://images.example.org/search?q=SYNTHETIC_PRIVATE_LOOKUP_MARKER']}}}),now()).run();await r2.put(source,'ISOLATED_SOURCE');await r2.put(result,'ISOLATED_WORD');return {owner,id,source,result};}
 const args=p=>({operation_id:p.operation_id,confirm_owner:p.owner,confirm_scope:p.scope,confirm_ids:p.items.map(r=>r.article_id),snapshot_sha256:p.snapshot_sha256,confirm_permanent:true});
 const row=r=>d1.prepare('SELECT * FROM articles WHERE owner=? AND id=?').bind(r.owner,r.id).first();
 const a=await seed('LOCAL-A'),p=await previewListDeletion(a.owner,'publish',uuid(),[a.id]),other=await seed('LOCAL-B'),late=await seed(a.owner);
 assert.equal(p.file_count,2);assert.ok(p.items[0].files.every(f=>f.etag));assert.ok(await row(a));
 await assert.rejects(d1.prepare('DELETE FROM word_progress_events WHERE owner=? AND target_id=?').bind(a.owner,a.id).run(),/word_progress_append_only/);
 await assert.rejects(d1.prepare("UPDATE word_progress_events SET snapshot_json='{}' WHERE owner=? AND target_id=?").bind(a.owner,a.id).run(),/word_progress_append_only/);
 await assert.rejects(d1.prepare('DELETE FROM articles WHERE owner=? AND id=?').bind(a.owner,a.id).run(),/word_progress_delete_requires_confirmed_article/);
 assert.ok(await row(a),'unauthorized article deletion rolls back atomically');
 for(const [progressOwner,kind] of [['LOCAL-FOREIGN-PROGRESS','article'],[a.owner,'local_word']])await d1.prepare('INSERT INTO word_progress_events(owner,target_kind,target_id,version,event_id,input_sha256,payload_sha256,snapshot_json,created) VALUES(?,?,?,?,?,?,?,?,?)').bind(progressOwner,kind,a.id,1,uuid(),'a'.repeat(64),'b'.repeat(64),'{}',now()).run();
 console.log('PASS ordinary progress UPDATE/DELETE and unconfirmed article DELETE reject; original article survives rollback.');
 const result=await confirmListDeletion(a.owner,args(p));assert.equal(result.content_deleted,true);const retained=await d1.prepare("SELECT snapshot_json FROM word_progress_events WHERE target_kind='article' AND owner=? AND target_id=?").bind(a.owner,a.id).first();assert.equal(retained,null,'confirmed article deletion must purge its detailed progress observations');assert.ok(await d1.prepare("SELECT 1 FROM word_progress_events WHERE owner='LOCAL-FOREIGN-PROGRESS' AND target_id=?").bind(a.id).first(),'foreign owner progress remains');assert.ok(await d1.prepare("SELECT 1 FROM word_progress_events WHERE owner=? AND target_kind='local_word' AND target_id=?").bind(a.owner,a.id).first(),'local_word progress never cascades');await assert.rejects(load('lib/word-progress.ts').wordProgressCall(a.owner,'read_word_progress',{target_kind:'article',target_id:a.id}),/没有找到/);console.log('PASS confirmed deletion purges exact owner/article progress, preserves foreign owner and local_word, and denies deleted article reads.');assert.equal(await row(a),null);assert.equal(await r2.head(a.source),null);assert.equal(await r2.head(a.result),null);assert.ok(await row(other));assert.ok(await row(late));
 assert.equal((await confirmListDeletion(a.owner,args(p))).state,'deleted');await assert.rejects(readListDeletion(other.owner,p.operation_id));
 await assert.rejects(d1.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,?,?,?,?,?,?)').bind(a.id,a.owner,'Replay','x',a.source,'["Replayed body"]',now(),'queued').run(),/ARTICLE_PERMANENTLY_DELETED/);
 const b=await seed('LOCAL-RACE'),sibling=await seed(b.owner),preview=await previewListDeletion(b.owner,'publish',uuid(),[b.id,sibling.id]);
 beforeBatch=()=>d1.prepare("UPDATE articles SET state='processing',claim_token=?,claim_expires=? WHERE id=?").bind(uuid(),new Date(Date.now()+3600000).toISOString(),b.id).run();
 await assert.rejects(confirmListDeletion(b.owner,args(preview)),/状态已变化/);assert.equal((await row(b)).state,'processing');assert.equal((await row(sibling)).state,'completed');assert.equal((await readListDeletion(b.owner,preview.operation_id)).state,'previewed');assert.ok(await r2.head(sibling.source));
 const c=await seed('LOCAL-FAIL'),partial=await previewListDeletion(c.owner,'publish',uuid(),[c.id]);deletes=0;failAt=2;
 await assert.rejects(confirmListDeletion(c.owner,args(partial)),/isolated R2 failure/);assert.equal((await row(c)).state,'deleting');assert.equal((await readListDeletion(c.owner,partial.operation_id)).content_deleted,false);
 await assert.rejects(d1.prepare("UPDATE articles SET paragraphs='[\"late mutation\"]' WHERE id=?").bind(c.id).run(),/ARTICLE_DELETION_IN_PROGRESS/);
 failAt=0;assert.equal((await confirmListDeletion(c.owner,args(partial))).state,'deleted');assert.equal(await row(c),null);
 const d=await seed('LOCAL-DOUBLE'),twice=await previewListDeletion(d.owner,'publish',uuid(),[d.id]);await Promise.all([confirmListDeletion(d.owner,args(twice)),confirmListDeletion(d.owner,args(twice))]);assert.equal((await readListDeletion(d.owner,twice.operation_id)).state,'deleted');
 // No read may claim that a tombstone alone proves the bytes are absent.
 await r2.put(d.source,'ISOLATED_LATE_WRITE');const unknown=await readListDeletion(d.owner,twice.operation_id);assert.equal(unknown.content_deleted,false);assert.equal(unknown.state,'needs_verification');assert.equal(unknown.remaining_object_count,1);
 await assert.rejects(confirmListDeletion(d.owner,args(twice)),/原确认快照/);assert.ok(await r2.head(d.source));await r2.put(d.source,'ISOLATED_SOURCE');assert.equal((await confirmListDeletion(d.owner,args(twice))).content_deleted,true);assert.equal(await r2.head(d.source),null);
 // Confirmed list deletion has an operation binding in addition to its tombstone.
 for(const failure of ['unconfirmed','wrong_owner','wrong_snapshot','expired_lock']){
  const candidate=await seed('LOCAL-GUARD-'+failure),operation=uuid(),request=uuid(),time=now(),until=new Date(Date.now()+3600000).toISOString();
  await d1.prepare('INSERT INTO article_list_deletions(id,owner,scope,request_key,state,snapshot_json,snapshot_sha256,created,expires,confirmed_at,lock_token,lock_expires) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(operation,failure==='wrong_owner'?'OTHER-OWNER':candidate.owner,'publish',request,'deleting',JSON.stringify([{id:failure==='wrong_snapshot'?uuid():candidate.id}]),'a'.repeat(64),time,until,failure==='unconfirmed'?null:time,uuid(),failure==='expired_lock'?'2000-01-01T00:00:00.000Z':until).run();
  await d1.prepare("UPDATE articles SET state='deleting' WHERE id=?").bind(candidate.id).run();
  await d1.prepare("INSERT INTO article_deletions(id,owner,state,started_at,deleted_at,operation_id) VALUES(?,?,'deleted',?,?,?)").bind(candidate.id,candidate.owner,time,time,operation).run();
  await assert.rejects(d1.prepare('DELETE FROM articles WHERE id=? AND owner=?').bind(candidate.id,candidate.owner).run(),/word_progress_delete_requires_confirmed_article/);
  assert.ok(await row(candidate));assert.ok(await d1.prepare('SELECT 1 FROM word_progress_events WHERE owner=? AND target_id=?').bind(candidate.owner,candidate.id).first());
 }
 console.log('PASS list purge rejects unconfirmed operation, wrong owner, wrong exact snapshot and expired lock; every failed DELETE rolls back.');
 // The older single-article path is still explicitly confirmed, without a list operation.
 const single=await seed('LOCAL-SINGLE');await r2.delete(single.result);await d1.prepare("UPDATE articles SET state='failed',result_key=NULL,result_meta=NULL,draft_url=NULL WHERE id=?").bind(single.id).run();await d1.prepare('DELETE FROM article_deliveries WHERE owner=? AND article_id=?').bind(single.owner,single.id).run();
 const singleResult=await load('lib/article-deletion.ts').deleteArticlePermanently(single.owner,{article_id:single.id,confirm_article_id:single.id,confirm_title:'Isolated',confirm_permanent:true});
 assert.equal(singleResult.deleted,true);assert.equal(await row(single),null);assert.equal(await d1.prepare('SELECT 1 FROM word_progress_events WHERE owner=? AND target_id=?').bind(single.owner,single.id).first(),null);
 console.log('PASS existing explicitly confirmed single-article deletion purges its exact progress without a new permission path.');
 console.log('PASS local workerd D1/R2: complete migrations including replay/content triggers; exact-snapshot deletion, owner and new-record isolation, idempotent readback, atomic ALL-target rollback when claim wins, partial-file resume, duplicate leases, retained minimal audit and late-object truthful readback. Remote calls=0.');
} finally {await mf.dispose();}
