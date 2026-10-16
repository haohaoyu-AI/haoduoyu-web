// Local workerd D1/R2 only. This process has no Site/production credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
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
  vm.runInNewContext(code,{exports:ex,require:dependency=>dependency==='./test-store'?{db:()=>db}:dependency==='./articles'?{bucket:()=>bucket}:load(path.join(path.dirname(file),dependency+'.ts')),crypto:webcrypto,TextEncoder,Date,Error,Set,Map,JSON});return ex;}
 const {previewListDeletion,confirmListDeletion,readListDeletion}=load('lib/article-list-deletion.ts');
 const uuid=()=>webcrypto.randomUUID(),now=()=>new Date().toISOString();
 async function seed(owner){const id=uuid(),source=`articles/${id}/source`,result=`articles/${id}/result-${'a'.repeat(64)}.docx`;
  await d1.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,result_key,result_meta,draft_url) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,owner,'Isolated','isolated.docx',source,'["Isolated","ISOLATED_BODY"]',now(),'completed',result,'{}','https://example.test/private').run();
  await d1.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,draft_url,updated) VALUES(?,?,?,?,?,?,?)').bind(uuid(),owner,id,'zhihu','saved','https://example.test/private',now()).run();
  await r2.put(source,'ISOLATED_SOURCE');await r2.put(result,'ISOLATED_WORD');return {owner,id,source,result};}
 const args=p=>({operation_id:p.operation_id,confirm_owner:p.owner,confirm_scope:p.scope,confirm_ids:p.items.map(r=>r.article_id),snapshot_sha256:p.snapshot_sha256,confirm_permanent:true});
 const row=r=>d1.prepare('SELECT * FROM articles WHERE owner=? AND id=?').bind(r.owner,r.id).first();
 const a=await seed('LOCAL-A'),p=await previewListDeletion(a.owner,'publish',uuid(),[a.id]),other=await seed('LOCAL-B'),late=await seed(a.owner);
 assert.equal(p.file_count,2);assert.ok(p.items[0].files.every(f=>f.etag));assert.ok(await row(a));
 const result=await confirmListDeletion(a.owner,args(p));assert.equal(result.content_deleted,true);assert.equal(await row(a),null);assert.equal(await r2.head(a.source),null);assert.equal(await r2.head(a.result),null);assert.ok(await row(other));assert.ok(await row(late));
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
 console.log('PASS local workerd D1/R2: complete migrations including replay/content triggers; exact-snapshot deletion, owner and new-record isolation, idempotent readback, atomic ALL-target rollback when claim wins, partial-file resume, duplicate leases, retained minimal audit and late-object truthful readback. Remote calls=0.');
} finally {await mf.dispose();}
