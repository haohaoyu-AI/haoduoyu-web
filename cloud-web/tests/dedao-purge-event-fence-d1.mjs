// Real isolated workerd D1. Only callback transport is intercepted; no remote
// requests, subscriptions or user manuscripts are accessed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto,createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
const uuid=()=>webcrypto.randomUUID(),stamp=()=>new Date().toISOString(),future=()=>new Date(Date.now()+3600000).toISOString();
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){throw Error("NO REMOTE I/O")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'synthetic-dedao-event-fence'}});
let calls=0,checks=0,afterSign=null;
const check=(value,label)=>{assert.ok(value,label);checks++;};
try{
 const d1=await mf.getD1Database('DB');await migrate(drizzle(d1),{migrationsFolder:'drizzle'});
 const exports={},source=fs.readFileSync('lib/events.ts','utf8');
 const crypto={subtle:{digest:(...a)=>webcrypto.subtle.digest(...a),importKey:(...a)=>webcrypto.subtle.importKey(...a),sign:async(...a)=>{const value=await webcrypto.subtle.sign(...a);if(afterSign){const f=afterSign;afterSign=null;await f();}return value;}}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({db:()=>d1}),crypto,URL,TextEncoder,TextDecoder,Uint8Array,btoa,atob,Response,AbortSignal,Date,console:{info:()=>{}},fetch:async()=>{calls++;return new Response('',{status:202});}});
 async function seed(){
  const f={owner:'synthetic-'+uuid(),batch:uuid(),revision:uuid(),article:uuid(),item:uuid()};const at=stamp();
  await d1.batch([
   d1.prepare("INSERT INTO dedao_batches(id,owner,request_key,queue_revision,total,state,created,updated) VALUES(?,?,?,?,1,'queued',?,?)").bind(f.batch,f.owner,uuid(),f.revision,at,at),
   d1.prepare('INSERT INTO dedao_items(batch_id,owner,ordinal,id,article_id,created,updated) VALUES(?,?,1,?,?,?,?)').bind(f.batch,f.owner,f.item,f.article,at,at),
   d1.prepare("INSERT INTO event_subscriptions(id,owner,callback,secret,expires,active,generation,event_name) VALUES(?,?,? ,?,?,'active',?,'dedao.writing_requested')").bind('sub_'+createHash('sha256').update(f.owner).digest('hex'),f.owner,'https://synthetic-receiver.example.org/cb','whsec_'+Buffer.alloc(32,7).toString('base64'),future(),uuid())
  ]);return f;
 }
 async function fence(f){
  const operation=uuid(),lock=uuid(),at=stamp(),expires=future(),snapshot=JSON.stringify([{id:f.article,include_dedao_articles:true,dedao_pairs:[{batch_id:f.batch,ordinal:1,article_id:f.article}],graph:[]}]);
  await d1.batch([
   d1.prepare("INSERT INTO article_list_deletions(id,owner,scope,request_key,state,snapshot_json,snapshot_sha256,created,expires,confirmed_at,lock_token,lock_expires) VALUES(?,?,'all_articles',?,'deleting',?,?,?,?,?,?,?)").bind(operation,f.owner,uuid(),snapshot,createHash('sha256').update(snapshot).digest('hex'),at,expires,at,lock,expires),
   d1.prepare("INSERT INTO article_deletions(id,owner,state,started_at,operation_id,lock_token,lock_expires) VALUES(?,?,'deleting',?,?,?,?)").bind(f.article,f.owner,at,operation,lock,expires),
   d1.prepare("INSERT INTO article_content_fences(owner,entity_kind,entity_key,article_id,operation_id,created) VALUES(?,'dedao_items.batch_ordinal',?,?,?,?)").bind(f.owner,JSON.stringify([f.batch,1]),f.article,operation,at)
  ]);
 }
 const send=f=>exports.dispatchDedao(f.owner,f.batch,stamp(),f.revision);
 {const f=await seed();check(await send(f),'ordinary writable current callback accepted');check(calls===1,'one actual intercepted transport invocation');}
 {const f=await seed();const before=calls;check(!await exports.dispatchDedao(f.owner,f.batch,stamp(),uuid()),'wrong queue revision rejects');check(calls===before,'wrong generation sends nothing');}
 {const f=await seed();await fence(f);const before=calls;check(!await send(f),'fenced current rejects pending callback');check(calls===before,'fenced current sends nothing');}
 {const f=await seed(),before=calls;afterSign=()=>fence(f);check(!await send(f),'fence after signing rejects callback');check(calls===before,'final D1 guard after HMAC sends nothing');check(!afterSign,'race occurred after actual signature');}
 {const f=await seed(),before=calls;await d1.prepare("UPDATE dedao_batches SET state='paused' WHERE id=?").bind(f.batch).run();check(!await send(f),'paused current rejects stale callback');check(calls===before,'paused batch sends nothing');}
 {const f=await seed(),before=calls;check(!await exports.dispatchDedao('other-owner',f.batch,stamp(),f.revision),'wrong owner rejects');check(calls===before,'owner mismatch sends nothing');}
 {const f=await seed();check(await exports.dispatchDedao(f.owner,f.batch,stamp()),'CLI wake without revision preserves ordinary current source path');await fence(f);const before=calls;check(!await exports.dispatchDedao(f.owner,f.batch,stamp()),'CLI wake without revision rejects purged current');check(calls===before,'purged CLI wake sends nothing');}
 check((await d1.prepare('SELECT count(*) n FROM event_subscriptions').first()).n===7,'all synthetic subscriptions preserved');
 console.log(`PASS ${checks} actual workerd D1 Dedao pre-send checks; migrations 0000–0048; callback transport intercepted; remote calls=0; already-sent external actions not observed.`);
}finally{await mf.dispose();}
