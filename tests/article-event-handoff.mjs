// Real migration-backed SQLite + real MCP route; entirely synthetic, no live events.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const time='2026-10-08T00:00:00.000Z',now=Date.parse(time),owner='synthetic-owner';
let queries=0,network=0,forcePrivateError=false;
const db={prepare(query){queries++;assert.match(query,/^SELECT\s/i,'diagnostic storage must be read-only');if(forcePrivateError)throw Error('PRIVATE_STORAGE_ERROR');return {bind:(...args)=>({all:async()=>({results:sql.prepare(query).all(...args)})})};}};
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const store={db:()=>db,owner:r=>r.headers.get('oai-authenticated-user-id')};
const policy={},recovery={},diagnostics={};
vm.runInNewContext(compile('lib/article-output-mode.ts'),{exports:policy,require:()=>store});
vm.runInNewContext(compile('lib/article-recovery-view.ts'),{exports:recovery,Date:Clock});
vm.runInNewContext(compile('lib/article-event-handoff.ts'),{exports:diagnostics,require:name=>name==='./test-store'?store:name==='./article-output-mode'?policy:recovery,Date:Clock,Error,TextEncoder,TextDecoder,Uint8Array,btoa,atob});
const call=(name,args={},user=owner)=>diagnostics.articleEventHandoffCall(user,name,args);
const read=(f,args={})=>call('read_article_event_handoff',{event_id:f.event_id,...args},f.owner);
const list=(args={},user=owner)=>call('list_article_event_handoffs',args,user);
let sequence=0;
const uuid=()=>`00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12,'0')}`;
function wake(f,state='delivered',created=time){const id=uuid(),event_id='article_wake_'+id;sql.prepare('INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,?,?,?,?)').run(id,f.owner,f.id,event_id,state,created,created,new Date(Date.parse(created)+60000).toISOString());return {...f,handoff_id:id,event_id};}
function fixture(state='queued',user=owner){const id=uuid();sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,?,?,?,?,?,?)').run(id,user,'合成标题','synthetic.txt','articles/'+id+'/source','["合成标题","合成正文"]',time,state);return wake({id,owner:user});}
const update=(f,values)=>sql.prepare('UPDATE articles SET '+Object.keys(values).map(k=>k+'=?').join(',')+' WHERE id=?').run(...Object.values(values),f.id);
function delivery(f,state='pending',token=null,expiry=null){sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,claim_token,claim_expires,updated) VALUES(?,?,?,?,?,?,?,?)').run(uuid(),f.owner,f.id,'zhihu',state,token,expiry,time);}
function attempt(f,state='outcome_unknown',ended=false){const id=uuid();sql.prepare('INSERT INTO article_upload_attempts(id,owner,article_id,platform,target_account,word_sha256,word_size,authorization_kind,claim_hash,preflight,baseline,state,editor_urls,created,updated,consumed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,f.owner,f.id,'toutiao','synthetic-account','a'.repeat(64),1,'verify_existing','b'.repeat(64),'{}','{}',state,'[]',time,time,time);if(ended)sql.prepare('INSERT INTO article_upload_executor_ends(attempt_id,owner,article_id,platform,attempt_sha256,attempt_snapshot,claim_sha256,execution_end_reference,created) VALUES(?,?,?,?,?,?,?,?,?)').run(id,f.owner,f.id,'toutiao','c'.repeat(64),'{}','b'.repeat(64),'synthetic execution-end attestation',time);return id;}
const fresh=fixture(),secondWake=wake(fresh,'unknown');
const exact=(await read(fresh,{expected_article_id:fresh.id})).item;
assert.equal(exact.article_id,fresh.id);assert.equal(exact.event_id,fresh.event_id);assert.equal(exact.handoff_id,fresh.handoff_id);assert.equal(exact.data.article_id,fresh.id);
assert.equal(exact.assessment,'pending_unclaimed');assert.equal(exact.handoff_consumption,'not_recorded');assert.equal(exact.receiver_ack,'unavailable');assert.equal(exact.delivered_means,'callback_acceptance_only');
assert.equal((await call('read_article_event_handoff',{handoff_id:secondWake.handoff_id})).item.event_id,secondWake.event_id);
await assert.rejects(read(fresh,{expected_article_id:uuid()}));
await assert.rejects(call('read_article_event_handoff',{event_id:fresh.event_id,handoff_id:fresh.handoff_id}));
await assert.rejects(call('read_article_event_handoff',{}));
await assert.rejects(call('read_article_event_handoff',{event_id:fresh.event_id},'foreign-owner'));
await assert.rejects(call('read_article_event_handoff',{event_id:'unknown-event'}));
await assert.rejects(list({},''));
const foreign=fixture('queued','foreign-owner'),broken=wake({...foreign,owner});
await assert.rejects(read(broken),'same-owner join rejects an inconsistent article binding');
const missing=fixture();sql.prepare('DELETE FROM articles WHERE id=?').run(missing.id);await assert.rejects(read(missing),'orphan handoff is retained in DB but its article ownership is unavailable');
const live=fixture();update(live,{claim_token:'synthetic-lease',claim_expires:new Date(now+100000).toISOString()});assert.equal((await read(live)).item.assessment,'in_flight');
const expired=fixture();update(expired,{claim_token:'synthetic-expired',claim_expires:new Date(now-1).toISOString()});assert.equal((await read(expired)).item.assessment,'recovery_required');
for(const expiry of [null,'invalid']){const f=fixture();update(f,{claim_token:'synthetic-invalid',claim_expires:expiry});const v=(await read(f)).item;assert.equal(v.assessment,'recovery_required');assert.equal(v.leases[0].status,'invalid');}
const partial=fixture();update(partial,{result_meta:'{"output_id":"synthetic-partial"}'});assert.equal((await read(partial)).item.assessment,'review_existing_progress');
const frozen=fixture();update(frozen,{artifact_manifest:'{"contract_version":1}'});assert.equal((await read(frozen)).item.assessment,'review_existing_progress');
const history=fixture();attempt(history,'verified');const hv=(await read(history)).item;assert.equal(hv.assessment,'recovery_required');assert.equal(hv.upload_history[0].unended_consumed,1,'verified outcome alone does not establish executor termination');
const completed=fixture('completed');update(completed,{result_key:'synthetic-word',claim_token:'synthetic-terminal',claim_expires:new Date(now+100000).toISOString()});delivery(completed,'saved','synthetic-saved',new Date(now+100000).toISOString());assert.equal((await read(completed)).item.assessment,'protected_complete');
const continuation=fixture('completed');update(continuation,{result_key:'synthetic-word'});delivery(continuation);const cv=(await read(continuation)).item;assert.equal(cv.assessment,'continuation_needed');assert.deepEqual(Array.from(cv.continuation.remaining_platforms),['zhihu']);assert.equal(cv.continuation.next_tool,null);
const liveDestination=fixture('completed');delivery(liveDestination,'pending','synthetic-destination',new Date(now+100000).toISOString());assert.equal((await read(liveDestination)).item.assessment,'in_flight');
const text=fixture('text_saved'),textManifest=fixture();update(textManifest,{artifact_manifest:'{"output_mode":"text_only"}'});
const generated=fixture();sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(),owner,'2026-10-08','xiaoyu','daily','ready',generated.id,time,time);
const nonmanual=fixture();update(nonmanual,{source_key:'synthetic/nonmanual-source'});
for(const f of [text,textManifest,generated,nonmanual]){const v=(await read(f)).item;assert.equal(v.assessment,'protected_source');assert.equal(v.continuation.next_tool,null);}
for(const state of ['sending','unknown']){const f=fixture();sql.prepare('UPDATE article_handoffs SET state=?,expires=? WHERE id=?').run(state,new Date(now-1).toISOString(),f.handoff_id);assert.equal((await read(f)).item.handoff_state,state,'expiry causes no update or redispatch');}
const first=await list({limit:2}),next=await list({limit:2,cursor:first.next_cursor});assert.equal(first.items.length,2);assert.equal(next.items.length,2);assert.equal(new Set([...first.items,...next.items].map(v=>v.handoff_id)).size,4);
await assert.rejects(list({cursor:first.next_cursor},'foreign-owner'));await assert.rejects(list({cursor:first.next_cursor,scope:'all'}));
for(const args of [{limit:0},{limit:26},{limit:null},{scope:null},{cursor:'invalid'},{claim_token:'synthetic-token'},{owner:'foreign-owner'}])await assert.rejects(list(args));
let page=await list(),items=[...page.items];while(page.next_cursor){page=await list({cursor:page.next_cursor});items.push(...page.items);}
assert.equal(items.filter(v=>v.article_id===fresh.id).length,2,'same article wakes preserve separate exact event identities');
for(const f of [completed,text,textManifest,generated,nonmanual,missing,broken])assert.ok(!items.some(v=>v.handoff_id===f.handoff_id));
assert.ok(items.some(v=>v.handoff_id===live.handoff_id&&v.assessment==='in_flight'));
const historyPage=await list({scope:'all'});assert.ok(historyPage.items.some(v=>v.handoff_id===completed.handoff_id));
for(const item of [...items,...historyPage.items]){assert.equal(item.execute_import,false);assert.equal(item.claim_performed,false);assert.equal(item.dispatch_performed,false);assert.equal(item.continuation.next_tool,null);assert.ok(!JSON.stringify(item).includes('synthetic-lease'));assert.ok(!JSON.stringify(item).includes('claim_token'));assert.ok(!JSON.stringify(item).includes('source_key'));}
const snapshot=()=>JSON.stringify(sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>({name,rows:sql.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()})));
const before=snapshot();await read(fresh);await list({scope:'all'});assert.equal(snapshot(),before,'every diagnostic read preserves the full database');
const route={};
const emptyModule=new Proxy({},{get:(_,key)=>key.endsWith('Tools')?[]:key==='retiredGenerationNames'?new Set():key.endsWith('Error')?class extends Error{}:()=>{throw Error('Unexpected dependency call');}});
vm.runInNewContext(compile('app/mcp/route.ts'),{exports:route,require:name=>name.endsWith('/article-event-handoff')?diagnostics:name.endsWith('/test-store')?store:emptyModule,Request,Response,URL,Error,TextEncoder,console:{info(){}},fetch:()=>{network++;throw Error('No network allowed');}});
const invoke=(name,args={},headers={})=>route.POST(new Request('https://synthetic.test/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));
for(const name of diagnostics.articleEventHandoffTools.map(t=>t.name)){
 const args=name.startsWith('list_')?{}:{event_id:fresh.event_id};
 const count=queries;for(const credential of [{},{authorization:'Bearer synthetic-token'},{'x-xiaoyu-claim-token':'synthetic-token'}])assert.equal((await invoke(name,{...args,claim_token:'synthetic-token'},credential)).status,401);
 assert.equal(queries,count,'credentials never substitute for normal owner authentication');
 assert.equal((await invoke(name,args,{'oai-authenticated-user-id':owner,origin:'https://foreign.test'})).status,403);
 const response=await invoke(name,args,{'oai-authenticated-user-id':owner});assert.equal(response.headers.get('cache-control'),'private, no-store');const out=await response.json();assert.equal(out.result.structuredContent.read_only,true);assert.deepEqual(out.result.structuredContent,JSON.parse(out.result.content[0].text));
}
const discovered=await(await route.POST(new Request('https://synthetic.test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})}))).json();
for(const t of diagnostics.articleEventHandoffTools){assert.ok(discovered.result.tools.some(x=>x?.name===t.name));assert.equal(t.annotations.readOnlyHint,true);assert.equal(t.inputSchema.additionalProperties,false);assert.ok(!('owner' in t.inputSchema.properties));assert.ok(!('claim_token' in t.inputSchema.properties));}
forcePrivateError=true;const safe=await(await invoke('read_article_event_handoff',{event_id:fresh.event_id},{'oai-authenticated-user-id':owner})).json();forcePrivateError=false;assert.equal(safe.result.isError,true);assert.ok(!JSON.stringify(safe).includes('PRIVATE_STORAGE_ERROR'));
assert.equal(snapshot(),before);assert.equal(network,0);
console.log('PASS real SQLite exact durable identity, owner/binding checks, scoped pagination, separate wakes, terminal/source/lease/output/history protections, zero writes/dispatch/claims, real MCP authentication/origin/no-store/structured result and safe errors; live calls=0.');
