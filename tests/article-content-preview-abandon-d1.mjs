// Real isolated workerd D1/R2 and actual production preview/confirm/abandon dispatch.
// Synthetic text only; no Site credentials, provider calls or production data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
const native=createRequire(import.meta.url),modules=new Map(),uuid=()=>webcrypto.randomUUID();
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("ISOLATED");}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'purge-preview-abandon-isolated'},r2Buckets:{BUCKET:'purge-preview-abandon-isolated'}});
let external=0,holdDelete=null,afterAbandon=null;
try{
 const d1=await mf.getD1Database('DB'),r2=await mf.getR2Bucket('BUCKET');await migrate(drizzle(d1),{migrationsFolder:'drizzle'});
 const statement=(sql,nativeStatement)=>({bind:(...args)=>statement(sql,nativeStatement.bind(...args)),first:(...a)=>nativeStatement.first(...a),all:(...a)=>nativeStatement.all(...a),raw:(...a)=>nativeStatement.raw(...a),_native:nativeStatement,async run(...a){const result=await nativeStatement.run(...a);if(afterAbandon&&sql.startsWith("UPDATE article_list_deletions SET state='cancelled'")){const f=afterAbandon;afterAbandon=null;await f();}return result;}});
 const db={prepare:sql=>statement(sql,d1.prepare(sql)),batch:rows=>d1.batch(rows.map(r=>r._native))};
 const bucket={list:a=>r2.list(a),head:k=>r2.head(k),get:(k,a)=>r2.get(k,a),put:(...a)=>r2.put(...a),async delete(key){if(holdDelete){const f=holdDelete;holdDelete=null;await f();}return r2.delete(key);}};
 function load(file){file=path.normalize(file.endsWith('.ts')?file:file+'.ts');if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='cloudflare:workers'?{env:{DB:db,BUCKET:bucket}}:n==='./test-store'?{db:()=>db}:n==='./articles'?{bucket:()=>bucket}:n.startsWith('./')?load(path.join(path.dirname(file),n)):native(n),crypto:webcrypto,Date,Error,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Buffer,URL,Set,Map,JSON,structuredClone,setTimeout,clearTimeout,fetch(){external++;throw Error('REMOTE_FORBIDDEN');}});return exports;}
 const {articleContentDeletionCall:call}=load('lib/article-content-deletion-tools.ts');
 const preview=(owner,key=uuid())=>call(owner,'preview_all_article_deletion',{request_key:key});
 const abandon=(owner,id)=>call(owner,'abandon_article_deletion_preview',{operation_id:id});
 const read=(owner,id)=>call(owner,'read_all_article_deletion',{operation_id:id});
 const confirm=(owner,p)=>call(owner,'delete_all_articles_permanently',{operation_id:p.operation_id,confirm_owner:owner,confirm_scope:'all_articles',confirm_ids:p.items.map(i=>i.article_id),snapshot_sha256:p.snapshot_sha256,confirm_permanent:true});
 async function seed(owner){const id=uuid(),source=`articles/${id}/source`;await d1.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,?,?,?,?,?,?)').bind(id,owner,'SYNTHETIC','synthetic.txt',source,'["SYNTHETIC_PREVIEW_BODY"]',new Date().toISOString(),'queued').run();await r2.put(source,'SYNTHETIC_PREVIEW_BYTES');return{id,source};}
 let cases=0;
 const a=await seed('ABANDON-A'),p=await preview('ABANDON-A');
 await assert.rejects(abandon('OTHER-OWNER',p.operation_id),e=>e.status===404);assert.equal((await read('ABANDON-A',p.operation_id)).state,'previewed');cases++;
 assert.equal((await abandon('ABANDON-A',p.operation_id)).state,'cancelled');assert.equal((await abandon('ABANDON-A',p.operation_id)).state,'cancelled');assert.ok(await r2.head(a.source));assert.ok(await d1.prepare('SELECT 1 FROM articles WHERE id=?').bind(a.id).first());await assert.rejects(confirm('ABANDON-A',p),e=>e.status===409);cases++;
 const expired=await preview('ABANDON-A');await d1.prepare('UPDATE article_list_deletions SET expires=? WHERE id=?').bind('2000-01-01T00:00:00.000Z',expired.operation_id).run();await assert.rejects(confirm('ABANDON-A',expired),e=>e.status===409);assert.equal((await abandon('ABANDON-A',expired.operation_id)).state,'cancelled');const fresh=await preview('ABANDON-A');assert.notEqual(fresh.operation_id,expired.operation_id);assert.deepEqual(fresh.items.map(i=>i.article_id),expired.items.map(i=>i.article_id));cases++;
 const lost=await preview('ABANDON-A');afterAbandon=()=>{throw Error('SYNTHETIC_CANCEL_RESPONSE_UNKNOWN');};await assert.rejects(abandon('ABANDON-A',lost.operation_id),/UNKNOWN/);assert.equal((await read('ABANDON-A',lost.operation_id)).state,'cancelled');assert.ok(await r2.head(a.source));cases++;
 const active=await seed('ABANDON-ACTIVE'),busy=await preview('ABANDON-ACTIVE');let release,started;const pending=new Promise(r=>release=r),entered=new Promise(r=>started=r);holdDelete=async()=>{started();await pending;};const work=confirm('ABANDON-ACTIVE',busy);await entered;await assert.rejects(abandon('ABANDON-ACTIVE',busy.operation_id),e=>e.status===409);assert.equal((await read('ABANDON-ACTIVE',busy.operation_id)).state,'deleting');assert.ok(await r2.head(active.source));release();assert.equal((await work).content_deleted,true);await assert.rejects(abandon('ABANDON-ACTIVE',busy.operation_id),e=>e.status===409);cases++;
 for(let i=0;i<3;i++){const owner=`ABANDON-RACE-${i}`,target=await seed(owner),scope=await preview(owner);await Promise.allSettled([confirm(owner,scope),abandon(owner,scope.operation_id)]);const result=await read(owner,scope.operation_id);assert.ok(['cancelled','deleted'].includes(result.state));if(result.state==='cancelled'){assert.ok(await r2.head(target.source));assert.ok(await d1.prepare('SELECT 1 FROM articles WHERE id=?').bind(target.id).first());}else{assert.equal(result.content_deleted,true);assert.equal(await r2.head(target.source),null);}}cases++;
 assert.equal(external,0);console.log(`PASS ${cases} actual D1/R2 unconfirmed preview abandonment cases: owner isolation, idempotent no-content mutation, expired fresh preview, lost reply readback, active/completed rejection and confirm-vs-abandon atomic races; remote calls=0.`);
}finally{await mf.dispose();}
