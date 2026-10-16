// Actual local workerd/D1 and current Site TypeScript. Synthetic articles only.
// Counts real D1 calls; optional latency/budget are explicitly test injections.
// Never logs SQL, binds, tokens, source paragraphs or production identifiers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {createSyntheticHarness,sha256,withDeadline} from './word-recovery-harness.mjs';

const baselineCommit='35b3c623a5ccc886cf5558a7eaedc7de2a74a577';
const migrationFixture=fs.mkdtempSync(path.join(os.tmpdir(),'worklist-preexisting-upload-'));
const args=process.argv.slice(2),baselineAt=args.indexOf('--baseline-root');
const baseline=baselineAt>=0||args.includes('--baseline');
if(baselineAt>=0&&!args[baselineAt+1])throw Error('A local baseline root is required');
let projectRoot=baselineAt>=0?path.resolve(args[baselineAt+1]):process.cwd();
if(baseline&&baselineAt<0){
 projectRoot=path.join(migrationFixture,'baseline-source');fs.mkdirSync(projectRoot,{recursive:true});
 const files=execFileSync('git',['ls-tree','-r','--name-only',baselineCommit,'lib'],{cwd:process.cwd(),encoding:'utf8'}).trim().split('\n');
 for(const name of [...files,'package.json']){
  assert.ok(name==='package.json'||name.startsWith('lib/')&&!name.split('/').includes('..'));
  const target=path.join(projectRoot,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,execFileSync('git',['show',baselineCommit+':'+name],{cwd:process.cwd()}));
 }
 fs.symlinkSync(path.join(process.cwd(),'node_modules'),path.join(projectRoot,'node_modules'),'dir');
}
const stages=['read_source','collect_images','confirm_images','generate_word','inspect_pages','save_final'];
const labels=['读取原文','搜集图片','确定配图','生成 Word','逐页检查','保存成品'];
const empty=()=>stages.map((id,i)=>({id,label:labels[i],state:'pending',action:null,counts:null,evidence:null}));
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("SYNTHETIC READ BUDGET ONLY")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'synthetic-article-worklist-read-budget',OUTLIER:'synthetic-preexisting-upload-outlier',METADATA:'synthetic-preexisting-upload-metadata'}});
const h=createSyntheticHarness({projectRoot,migrate:false});
let passed=0;
const pass=label=>{passed++;console.log('PASS '+label);};

function instrument(raw){
 let current=null;
 const pending=new Set();
 const start=({cap=50,delay=0}={})=>{
  assert.equal(pending.size,0,'Each measured request must settle before the next one');
  current={cap,delay,calls:0,sql_statements:0,denied:0,writes:0,methods:{},started:performance.now()};return current;
 };
 const stop=async()=>{while(pending.size)await Promise.allSettled([...pending]);const result=current;current=null;return result;};
 function invoke(method,statements,operation){
  const session=current;
  if(!session)return operation();
  session.calls++;session.sql_statements+=statements.length;
  session.methods[method]=(session.methods[method]||0)+1;
  if(statements.some(source=>!/^\s*(?:SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(source))){session.writes++;return Promise.reject(Error('SYNTHETIC_READ_WROTE_DB'));}
  if(session.calls>session.cap){session.denied++;return Promise.reject(Error('SYNTHETIC_DB_REQUEST_BUDGET_EXCEEDED'));}
  const promise=(async()=>{if(session.delay)await new Promise(resolve=>setTimeout(resolve,session.delay));return operation();})();
  pending.add(promise);promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;
 }
 function prepare(source,values=[]){
  const native=raw.prepare(source).bind(...values),statement={native,source,bind:(...bound)=>prepare(source,bound)};
  for(const method of ['first','all','run'])statement[method]=(...params)=>invoke(method,[source],()=>native[method](...params));
  return statement;
 }
 return {start,stop,d1:{prepare,batch:statements=>invoke('batch',statements.map(s=>s.source),()=>raw.batch(statements.map(s=>s.native))),exec:source=>invoke('exec',[source],()=>raw.exec(source))}};
}

function insert(db,table,values){
 const keys=Object.keys(values);return db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(values));
}

async function migrateThrough(raw,tag){
 const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8')),at=journal.entries.findIndex(x=>x.tag===tag);assert.ok(at>=0);
 const old={...journal,entries:journal.entries.slice(0,at+1)},folder=path.join(migrationFixture,tag);fs.mkdirSync(path.join(folder,'meta'),{recursive:true});fs.writeFileSync(path.join(folder,'meta/_journal.json'),JSON.stringify(old));
 for(const entry of old.entries)fs.copyFileSync('drizzle/'+entry.tag+'.sql',path.join(folder,entry.tag+'.sql'));
 await migrate(drizzle(raw),{migrationsFolder:folder});
}

async function seed(raw,owner,size){
 const records=[],statements=[],now=Date.now(),updated=new Date(now-60000).toISOString(),created=new Date(now-1800000).toISOString(),expires=new Date(now+3600000).toISOString();
 const recentCount=Math.min(5,Math.max(1,size-25)),pendingCount=size-recentCount;
 for(let index=0;index<size;index++){
  const id=randomUUID(),claim=randomUUID(),paragraphs=JSON.stringify(['Synthetic worklist title','Synthetic worklist body']),input=sha256(paragraphs),attemptId=randomUUID(),previousId=randomUUID(),shape=index<pendingCount?index%10:10;
  const record={id,owner,shape,input,claim,attemptId,updated,created,expected:null};records.push(record);
  const article={id,owner,title:'Synthetic worklist title',filename:'synthetic.txt',source_key:`articles/${id}/source`,paragraphs,created:new Date(now-index*1000).toISOString(),state:shape===10?'uploaded':shape===3?'failed':shape===9?'word_ready':'processing',claim_token:shape===10?null:claim,claim_expires:shape===10?null:expires};
  if(shape===6||shape===9){
   const output=sha256('synthetic-output-'+id),outputId=randomUUID();record.outputHash=output;
   article.result_key=shape===9?`articles/${id}/result-${output}.docx`:null;
   article.result_meta=JSON.stringify({output_id:outputId,sha256:output,size:15,chunks:2,parts:shape===9?[{size:7,sha256:sha256('part-a')},{size:8,sha256:sha256('part-b')}]:[{size:7,sha256:sha256('part-a')}],progress_input_sha256:input,progress_updated_at:updated,...(shape===9?{completed_at:updated}:{})});
   if(shape===9)h.objects.set(article.result_key,{bytes:new Uint8Array(15),version:'synthetic-output-version'});
  }
  if(shape===8)article.word_claim_origin_hash=sha256(claim);
  statements.push(insert(raw,'articles',article));
  if(shape===5||shape===6||shape===8||shape===10){
   if(shape===8)statements.push(insert(raw,'word_claim_origins',{owner,target_kind:'article',target_id:id,claim_hash:sha256(claim),origin:'fresh_claim',proof_reference:'synthetic-first-claim',created}));
   continue;
  }
  const generation=shape===4?2:1,state=shape===4?'queued':shape===7?'waiting_safe_stop':'paused_safe';
  if(generation===2)statements.push(insert(raw,'word_attempts',{owner,target_kind:'article',target_id:id,attempt_id:previousId,generation:1,input_sha256:input,creation_request_key:randomUUID(),previous_attempt_id:null,strategy_sha256:sha256('old-strategy'),strategy_reference:'synthetic-previous-attempt',state:'ended',started_at:created,active_elapsed_ms:800000,active_started_at:null,ended_at:updated,reason:'executor_ended',initial_manifest_json:null,created,updated}));
  statements.push(insert(raw,'word_attempts',{owner,target_kind:'article',target_id:id,attempt_id:attemptId,generation,input_sha256:input,creation_request_key:randomUUID(),previous_attempt_id:generation===2?previousId:null,strategy_sha256:sha256('current-strategy'),strategy_reference:'synthetic-current-attempt',state,started_at:shape===4?null:created,active_elapsed_ms:shape===4?0:shape===7?3601000:45000,active_started_at:null,stop_requested_at:shape===7?updated:null,reason:shape===7?'timeout':shape===4?'new_attempt_queued':'none',initial_manifest_json:null,created,updated}));
  statements.push(insert(raw,'word_recovery',{owner,target_kind:'article',target_id:id,input_sha256:input,claim_hash:sha256(claim),version:4,epoch:1,desired:shape===4?'run':'paused',execution_id:null,request_key:null,token_hash:null,lease_until:null,heartbeat_at:updated,status:shape===4?'queued':'paused',reason:shape===7?'timeout':shape===4?'new_attempt_queued':'none',retry_count:0,retry_after:null,minimum_images:null,legacy_output_binding:null,updated,attempt_id:attemptId,execution_scope:'prepare',queue_revision:0}));
  const steps=empty();let stage='collect_images',runState=shape===3?'failed':'waiting',reason='waiting_for_images',observations={};
  steps[0]={...steps[0],state:'completed',action:'已读取冻结原文',evidence:'executor_report'};
  steps[1]={...steps[1],state:'current',counts:{completed:23+index,total:null,unit:'candidates'},action:'正在搜集公开图片',evidence:'executor_report'};
  if(shape===1||shape===2){
   steps[1].state='completed';steps[2]={...steps[2],state:shape===1?'current':'completed',counts:{completed:18,total:shape===1?22:18,unit:'images'},action:'正在检查实际像素',evidence:'executor_report'};
   const inspected=Array.from({length:18},(_,imageIndex)=>({sha256:sha256(`synthetic-image-${id}-${imageIndex}`),width:100,height:100,after_paragraph:1}));
   observations.confirm_images={action:'check_pixels',reason:'none',images_total:shape===1?22:18,inspected_images:inspected};
   for(const image of inspected)statements.push(insert(raw,'word_checkpoints',{owner,target_kind:'article',target_id:id,input_sha256:input,attempt_id:attemptId,asset_id:randomUUID(),kind:'image',sha256:image.sha256,size:10,chunks:1,metadata_json:'{}',verification_json:JSON.stringify({pixel_decode_verified:true,decode_version:1,format:'png',width:100,height:100}),parts_json:'[]',state:'ready',created}));
   stage='confirm_images';reason='none';
   if(shape===2){steps[3]={...steps[3],state:'completed',action:'已生成 Word',evidence:'executor_report'};steps[4]={...steps[4],state:'current',counts:{completed:8,total:12,unit:'pages'},action:'正在逐页检查',evidence:'executor_report'};observations.inspect_pages={action:'check_pages',reason:'none',rendered_pages:12,checked_pages:[1,2,3,4,5,6,7,8]};stage='inspect_pages';}
  }
  if(shape===4){steps[1].counts={completed:99,total:null,unit:'candidates'};steps[4].counts={completed:44,total:44,unit:'pages'};record.expected='generation-two-no-borrow';}
  const snapshot={attempt_id:shape===4?previousId:attemptId,generation:shape===4?1:1,steps,stage,state:runState,reason,observations,output_sha256:null,started_at:created,updated_at:updated,executor_updated_at:updated};
  statements.push(insert(raw,'word_progress_events',{owner,target_kind:'article',target_id:id,attempt_id:shape===4?previousId:attemptId,version:7,event_id:randomUUID(),input_sha256:input,payload_sha256:sha256(JSON.stringify(snapshot)),snapshot_json:JSON.stringify(snapshot),created:updated}));
 }
 for(let at=0;at<statements.length;at+=40)await raw.batch(statements.slice(at,at+40));
 // Same IDs and larger versions in a different owner must never decorate this list.
 const first=records[0],alien=empty();alien[1].counts={completed:999,total:999,unit:'candidates'};
 const foreignSnapshot={steps:alien,stage:'collect_images',state:'running',reason:'none',observations:{},output_sha256:null,started_at:created,updated_at:updated};
 await insert(raw,'word_progress_events',{owner:'SYNTHETIC-FOREIGN-OWNER',target_kind:'article',target_id:first.id,attempt_id:null,version:999,event_id:randomUUID(),input_sha256:first.input,payload_sha256:sha256(JSON.stringify(foreignSnapshot)),snapshot_json:JSON.stringify(foreignSnapshot),created:updated}).run();
 return records;
}

try{
 const raw=await mf.getD1Database('DB');await migrate(drizzle(raw),{migrationsFolder:'drizzle'});await migrate(drizzle(raw),{migrationsFolder:'drizzle'});
 const meter=instrument(raw);h.env.DB=meter.d1;
 const bucketCounts={head:0,get:0,put:0,delete:0};
 h.env.BUCKET={head:async key=>{bucketCounts.head++;return h.bucket.head(key);},get:async()=>{bucketCounts.get++;throw Error('SYNTHETIC_LIST_WORD_GET_FORBIDDEN');},put:async()=>{bucketCounts.put++;throw Error('SYNTHETIC_LIST_R2_WRITE_FORBIDDEN');},delete:async()=>{bucketCounts.delete++;throw Error('SYNTHETIC_LIST_R2_WRITE_FORBIDDEN');}};
 const load=h.loader(),api=load('articles');
 const fixtures=new Map();for(const size of [26,30,50])fixtures.set(size,await seed(raw,'SYNTHETIC-READ-BUDGET-'+size,size));
 async function measure(label,call,{cap=50,delay=0}={}){
  const session=meter.start({cap,delay});let result,error=null;const began=performance.now();
  try{result=await withDeadline(Promise.resolve().then(call),20000);}catch(e){
   // Fixed categories only, including for malformed synthetic fixture records.
   error=e?.message==='SYNTHETIC_DB_REQUEST_BUDGET_EXCEEDED'?'synthetic_db_request_budget_exceeded':e?.message==='SYNTHETIC_DEADLINE_EXCEEDED'?'synthetic_deadline_exceeded':e?.name==='SyntaxError'?'stored_json_invalid':api.articleListReadFailureCode?.(e)||'read_failed';
  }
  const responseMs=performance.now()-began;await meter.stop();
  const items=Array.isArray(result)?result:result?.items||[];
  const metrics={label,cap:Number.isFinite(cap)?cap:'unlimited',injected_read_delay_ms:delay,response_ms:Math.round(responseMs),settled_ms:Math.round(performance.now()-began),d1_calls:session.calls,sql_statements:session.sql_statements,denied_calls:session.denied,db_writes:session.writes,methods:session.methods,items:items.length,progress_available:items.filter(x=>x.word_progress!==null&&x.word_progress!==undefined).length,error};
  console.log('METRICS '+JSON.stringify(metrics));return {result,items,metrics};
 }
 function route(relative='app/api/articles/[id]/word-progress/route.ts',logs=[]){
  const filename=path.join(projectRoot,relative),exports={};
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{exports,require:requested=>{
   const resolved=path.resolve(path.dirname(filename),requested);assert.ok(resolved.startsWith(path.join(projectRoot,'lib')+path.sep));
   return load(path.relative(path.join(projectRoot,'lib'),resolved));
  },Error,Request,Response,URL,Promise,Date,console:{error:(...values)=>logs.push(values)}},{filename});return exports.GET;
 }
 async function malformedLegacyUpload(){
  // Seed a genuinely preexisting 0018 row, then apply every current migration.
  // No guard is removed or bypassed in the database used for runtime reads.
  const outlier=await mf.getD1Database('OUTLIER');await migrateThrough(outlier,'0018_article_upload_attempts');
  const record={id:randomUUID(),owner:'SYNTHETIC-PREEXISTING-UPLOAD-OUTLIER',claim:randomUUID(),input:sha256('["Synthetic legacy title","Synthetic legacy body"]')},stamp=new Date().toISOString();
  await insert(outlier,'articles',{id:record.id,owner:record.owner,title:'Synthetic legacy title',filename:'synthetic.txt',source_key:`articles/${record.id}/source`,paragraphs:'["Synthetic legacy title","Synthetic legacy body"]',created:stamp,state:'processing',claim_token:record.claim,claim_expires:new Date(Date.now()+3600000).toISOString()}).run();
  await insert(outlier,'article_upload_attempts',{id:randomUUID(),owner:record.owner,article_id:record.id,platform:'toutiao',target_account:'synthetic-account',word_sha256:sha256('synthetic-word'),word_size:10,authorization_kind:'synthetic-fixture',claim_hash:sha256(record.claim),preflight:'{}',baseline:'{}',state:'reserved',editor_urls:'INVALID_SYNTHETIC_JSON',created:stamp,updated:stamp}).run();
  await migrate(drizzle(outlier),{migrationsFolder:'drizzle'});await migrate(drizzle(outlier),{migrationsFolder:'drizzle'});
  return {record,raw:outlier,meter:instrument(outlier)};
 }
 async function metadataFixture(){
  const db=await mf.getD1Database('METADATA');await migrateThrough(db,'0018_article_upload_attempts');
  const owner='SYNTHETIC-METADATA-OWNER',foreign='SYNTHETIC-METADATA-FOREIGN',stamp=new Date().toISOString(),past=new Date(Date.now()-60000).toISOString(),records=[];
  for(let index=0;index<4;index++){
   const record={id:randomUUID(),claim:randomUUID(),index};records.push(record);
   await insert(db,'articles',{id:record.id,owner,title:'Synthetic metadata title',filename:'synthetic.txt',source_key:`articles/${record.id}/source`,paragraphs:'["Synthetic metadata title","Synthetic metadata body"]',created:stamp,state:'processing',claim_token:record.claim,claim_expires:new Date(Date.now()+3600000).toISOString(),error:index===0?'Synthetic error with '+record.claim:'Synthetic benign error'}).run();
  }
  const roots=[];
  for(const [index,platform,who] of [[0,'toutiao',owner],[0,'zhihu',owner],[1,'toutiao',owner],[2,'zhihu',owner],[3,'toutiao',owner],[0,'toutiao',foreign]]){
   const id=randomUUID(),record=records[index],value={id,owner:who,article_id:record.id,platform,target_account:'synthetic-account',word_sha256:sha256('synthetic-metadata-word'),word_size:10,authorization_kind:'new_word',claim_hash:sha256(record.claim),preflight:'{}',baseline:'{}',state:who===foreign?'SYNTHETIC-EXCLUDED-FOREIGN-ATTEMPT':'consumed',editor_urls:JSON.stringify(['https://example.test/synthetic-old-editor']),created:past,consumed_at:past,updated:past};roots.push(value);await insert(db,'article_upload_attempts',value).run();
  }
  // Existing valid linked histories are seeded while the 0026 consumed-only
  // lineage guard is active, then upgraded normally through the latest schema.
  await migrateThrough(db,'0026_article_upload_reimport_history');
  let childId=null;
  for(const root of roots.filter(x=>x.owner===owner&&x.article_id===records[0].id&&x.platform==='toutiao')){
   await insert(db,'article_upload_executor_ends',{attempt_id:root.id,owner,article_id:root.article_id,platform:root.platform,attempt_sha256:sha256(JSON.stringify(root)),attempt_snapshot:JSON.stringify(root),claim_sha256:root.claim_hash,execution_end_reference:'synthetic-preexisting-executor-end',created:past}).run();
   childId=randomUUID();await insert(db,'article_upload_attempts',{...root,id:childId,attempt_version:2,previous_attempt_id:root.id,authorization_kind:'owner_confirmed_reimport',authorization_key:randomUUID(),reimport_authorization:'{}',consume_token_sha256:sha256(randomUUID()),confirmation_message_id:'synthetic-linked-reimport',state:'verified',editor_urls:JSON.stringify(['https://example.test/synthetic-current-editor']),created:past,updated:stamp}).run();
  }
  await migrate(drizzle(db),{migrationsFolder:'drizzle'});await migrate(drizzle(db),{migrationsFolder:'drizzle'});
  const pending=[];let latestTie=null;
  for(const record of records){
   pending.push(insert(db,'article_claim_credential_hashes',{owner,sha256:sha256(record.claim),created:stamp}));
   pending.push(insert(db,'article_deliveries',{id:randomUUID(),owner,article_id:record.id,platform:'zhihu',state:'pending',draft_url:null,message:record.index===0?'Synthetic delivery with '+record.claim:'Synthetic benign delivery',updated:stamp}));
   pending.push(insert(db,'article_deliveries',{id:randomUUID(),owner:foreign,article_id:record.id,platform:'zhihu',state:'blocked',draft_url:null,message:'SYNTHETIC-EXCLUDED-FOREIGN-DELIVERY',updated:stamp}));
   for(let index=0;index<60;index++){
    const operation=randomUUID(),target=record.index===0?childId:record.index===1&&index===0?roots.find(x=>x.owner===owner&&x.article_id===record.id).id:randomUUID();
    if(record.index===0&&index===59)latestTie=operation;
    pending.push(insert(db,'article_upload_diagnostics',{id:operation,owner,article_id:record.id,platform:record.index===2?'zhihu':'toutiao',executor_id:randomUUID(),attempt_id:target,stage:'chooser_wait',outcome:index===59?'failed':'returned',cause:index===59?'timeout':'none',observed_at:past,created:past}));
    pending.push(insert(db,'article_upload_diagnostics',{id:randomUUID(),owner:foreign,article_id:record.id,platform:'toutiao',executor_id:randomUUID(),attempt_id:null,stage:'file_handoff',outcome:'returned',cause:'none',observed_at:stamp,created:stamp}));
   }
  }
  for(let at=0;at<pending.length;at+=40)await db.batch(pending.slice(at,at+40));
  return {db,owner,foreign,records,childId,latestTie,meter:instrument(db)};
 }
 const sourceHash=sha256(fs.readFileSync(path.join(projectRoot,'lib/articles.ts')));
 if(baseline)assert.equal(sourceHash,sha256(execFileSync('git',['show',baselineCommit+':lib/articles.ts'],{cwd:process.cwd()})),'Historical article source must match the pinned formal baseline');
 console.log('SOURCE '+JSON.stringify({mode:baseline?'pinned-formal-baseline':'current-runtime',baseline_commit:baselineCommit,articles_sha256:sourceHash,storage:'actual local Miniflare/workerd D1',fixture:'synthetic only'}));
 if(baseline){
  const records=fixtures.get(26),who=records[0].owner;
  await measure('baseline-list-26',()=>api.articleList(who,26),{cap:Infinity});
  await measure('baseline-worklist-26',()=>api.articleWorklist(who),{cap:Infinity});
  const thirty=fixtures.get(30)[0].owner;
  await measure('baseline-worklist-30-exact25plus5',()=>api.articleWorklist(thirty),{cap:Infinity});
  await measure('baseline-list-26-cap50',()=>api.articleList(who,26));
  await measure('baseline-worklist-26-cap50',()=>api.articleWorklist(who));
  await measure('baseline-list-26-delayed-real-D1',()=>api.articleList(who,26),{cap:Infinity,delay:230});
  const outlier=await malformedLegacyUpload();h.env.DB=outlier.meter.d1;
  const session=outlier.meter.start({cap:Infinity});let corruptCode=null;
  try{await api.articleWorklist(outlier.record.owner);}catch(e){corruptCode=e?.name==='SyntaxError'?'stored_json_invalid':'read_failed';}await outlier.meter.stop();
  console.log('MALFORMED '+JSON.stringify({fixture_preexisting_migration:'0018_article_upload_attempts',current_migrations_applied:true,whole_list_failed:corruptCode!==null,failure_category:corruptCode,d1_calls:session.calls,db_writes:session.writes,raw_error_logged:false}));
 }else{
  const GET=route();
  const endpoint=(owner,id)=>GET(new Request('https://synthetic.invalid/api/articles/'+id+'/word-progress',{headers:{'oai-authenticated-user-id':owner}}),{params:Promise.resolve({id})});
  function checkProgress(fixture,p){
   assert.equal(p.target_id,fixture.id);assert.equal(p.input_sha256,fixture.input);assert.equal(p.steps.length,6);assert.equal(p.save.independently_confirmed,false);assert.equal(p.save.desktop_saved,null);
   assert.ok(!JSON.stringify(p).includes(fixture.claim),'No claim credential is returned in progress projection');
   if([0,3,7].includes(fixture.shape)){assert.equal(p.steps[1].counts.completed,23+fixtures.get(Number(fixture.owner.split('-').at(-1))).indexOf(fixture));assert.equal(p.steps[1].counts.unit,'candidates');assert.equal(p.updated_at,fixture.updated);assert.equal(p.attempt.active_elapsed_ms,fixture.shape===7?3601000:45000);}
   if(fixture.shape===1)assert.deepEqual(p.steps[2].counts,{completed:18,total:22,unit:'images'});
   if(fixture.shape===2)assert.deepEqual(p.steps[4].counts,{completed:8,total:12,unit:'pages'});
   if(fixture.shape===3)assert.equal(p.execution.state,'failed');
   if(fixture.shape===4){assert.equal(p.attempt.generation,2);assert.equal(p.attempt.started_at,null);assert.equal(p.attempt.active_elapsed_ms,0);assert.equal(p.started_at,null);assert.ok(p.steps.every(x=>x.counts===null&&x.state==='pending'),'Generation two cannot borrow prior counts');}
   if(fixture.shape===5){assert.equal(p.legacy,true);assert.equal(p.started_at,null);assert.equal(p.attempt,null);assert.ok(p.steps.every(x=>x.counts===null&&x.state==='unrecorded'),'Legacy record does not invent image/page counts or elapsed time');}
   if(fixture.shape===6){assert.equal(p.started_at,null);assert.equal(p.attempt,null);assert.equal(p.steps[1].counts,null);assert.equal(p.steps[2].counts,null);assert.equal(p.steps[4].counts,null);assert.equal(p.steps[5].counts.completed,1);}
   if(fixture.shape===7){assert.equal(p.attempt.state,'waiting_safe_stop');assert.equal(p.recovery.status,'waiting_safe_stop');}
   if(fixture.shape===8){assert.equal(p.legacy,false);assert.equal(p.started_at,null);assert.ok(p.steps.every(x=>x.counts===null&&x.state==='pending'));}
   if(fixture.shape===9){assert.equal(p.save.state,'readback_pending');assert.equal(p.execution.reason,'saved_readback_pending');assert.equal(p.steps[5].state,'current');}
  }
  const tableNames=(await raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND substr(lower(name),1,4)<>'_cf_' ORDER BY name").all()).results.map(x=>x.name);
  const snapshot=async()=>sha256(JSON.stringify(await Promise.all(tableNames.map(async table=>[table,(await raw.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results]))));
  const scopeOwner='SYNTHETIC-ROUTE-SCOPE',scope=[];
  for(const state of ['deleting','text_saved','completed']){
   const id=randomUUID(),stamp=new Date().toISOString();scope.push({id,state});
   await insert(raw,'articles',{id,owner:scopeOwner,title:'Synthetic route scope',filename:'synthetic.txt',source_key:`articles/${id}/source`,paragraphs:'["Synthetic route scope","Synthetic route body"]',created:stamp,state,artifact_manifest:state==='text_saved'?'{"output_mode":"text_only"}':null}).run();
  }
  const before=await snapshot();
  for(const size of [26,30,50]){
   const records=fixtures.get(size),who=records[0].owner;
   const first=await measure('worklist-'+size+'-page1',()=>api.articleWorklist(who),{cap:Infinity});
   assert.equal(first.metrics.error,null);assert.equal(first.metrics.progress_available,0);assert.equal(first.metrics.db_writes,0);
   assert.ok(first.items.every(x=>x.word_progress_deferred===true&&x.word_progress===null&&x.word_progress_unavailable===false),'Deferred progress must not be described as an outage');
   let all=[...first.items];if(first.result.next_offset!==null){const second=await measure('worklist-'+size+'-page2',()=>api.articleWorklist(who,first.result.next_offset),{cap:Infinity});assert.equal(second.metrics.error,null);assert.equal(second.metrics.progress_available,0);all.push(...second.items);assert.equal(second.result.next_offset,null);}
   assert.equal(all.length,size);assert.equal(new Set(all.map(x=>x.id)).size,size);assert.deepEqual(new Set(all.map(x=>x.id)),new Set(records.map(x=>x.id)));
   assert.equal(first.items.filter(x=>x.list_section==='work').length,25);assert.equal(first.items.filter(x=>x.list_section==='recent').length,size===26?1:5);
   pass(`worklist ${size} preserves pending/recent separation, bounded pagination and explicit deferred progress`);
   const counts=[],times=[],began=performance.now();
   for(const record of records){
    const session=meter.start();const response=await withDeadline(endpoint(who,record.id),20000),value=await response.json();await meter.stop();
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(value.word_progress_unavailable,false);assert.ok(value.word_progress);assert.equal(session.denied,0);assert.equal(session.writes,0);checkProgress(record,value.word_progress);counts.push(session.calls);times.push(Math.round(performance.now()-session.started));
   }
   console.log('INDEPENDENT_READS '+JSON.stringify({items:size,restored_progress:size,d1_calls_total:counts.reduce((a,b)=>a+b,0),d1_calls_per_request_min:Math.min(...counts),d1_calls_per_request_max:Math.max(...counts),request_ms_max:Math.max(...times),total_ms:Math.round(performance.now()-began),synthetic_request_cap:50}));
   pass(`${size} independent normal GETs restore every owner-scoped durable observation, current attempt, generation-two isolation, legacy truth and save-readback boundary`);
  }
  const records=fixtures.get(26),who=records[0].owner;
  const capSimulation=await measure('current-worklist-30-injected-cap50',()=>api.articleWorklist(fixtures.get(30)[0].owner));
  assert.equal(capSimulation.metrics.error,null);assert.equal(capSimulation.metrics.denied_calls,0);assert.equal(capSimulation.items.length,30);
  console.log('BUDGET_SIMULATION '+JSON.stringify({native_platform_limit_confirmed:false,request_failed:!!capSimulation.metrics.error,ordinary_d1_calls:capSimulation.metrics.d1_calls,synthetic_cap:50}));
  const slow=meter.start({delay:230}),slowResponse=await endpoint(who,records[0].id);await meter.stop();assert.equal(slowResponse.status,200);const slowValue=await slowResponse.json();checkProgress(records[0],slowValue.word_progress);assert.ok(performance.now()-slow.started>1000);pass('normal owner GET retains a durable observation after more than one second of explicitly injected D1 latency');
  const unauth=meter.start(),unauthResponse=await GET(new Request('https://synthetic.invalid/api/articles/'+records[0].id+'/word-progress'),{params:Promise.resolve({id:records[0].id})});await meter.stop();assert.equal(unauthResponse.status,401);assert.equal(unauth.calls,0);
  const alien=meter.start(),alienResponse=await endpoint('SYNTHETIC-FOREIGN-OWNER',records[0].id);await meter.stop();assert.equal(alienResponse.status,404);assert.ok(!(await alienResponse.text()).includes(records[0].claim));pass('actual normal route refuses missing owner and foreign-owner article reads');
  const invalid=meter.start(),invalidResponse=await endpoint(scopeOwner,'invalid-synthetic-id');await meter.stop();assert.equal(invalidResponse.status,400);assert.equal(invalid.calls,0);
  for(const record of scope){
   const session=meter.start(),response=await endpoint(scopeOwner,record.id),value=await response.json();await meter.stop();assert.equal(session.writes,0);
   assert.equal(response.status,record.state==='deleting'?404:200);
   if(record.state==='text_saved'){assert.equal(value.output_mode,'text_only');assert.equal(value.word_progress,null);assert.equal(value.word_progress_unavailable,false);assert.equal(session.calls,1);}
   if(record.state==='completed'){assert.equal(value.word_progress.can_control_word,false);assert.equal(value.word_progress.save.independently_confirmed,false);}
  }
  pass('actual route returns deleting 404, invalid ID 400, text-only 200 without Word stages and completed read-only progress');
  assert.equal(await snapshot(),before,'Every list, normal GET and budget/latency simulation must preserve the complete D1 state');
  pass('complete D1 snapshot remains unchanged: no grants, claims, origin backfill, attempt transitions, stop writes or dispatch');
  const metadata=await metadataFixture();h.env.DB=metadata.meter.d1;
  const originalSource=execFileSync('git',['show',baselineCommit+':lib/article-upload-diagnostics.ts'],{cwd:process.cwd(),encoding:'utf8'}),original={};
  vm.runInNewContext(ts.transpileModule(originalSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:original,require:requested=>load(requested.slice(2)),Date,Error,JSON},{filename:'baseline-HEAD/article-upload-diagnostics.ts'});
  const oldDelivery=load('article-deliveries').deliveryList,redact=load('word-credentials').redactWordCredentialText,metadataSnapshot=async()=>sha256(JSON.stringify(await Promise.all(['articles','article_upload_attempts','article_upload_diagnostics','article_deliveries','article_claim_credential_hashes','word_recovery','word_attempts','word_execution_receipts'].map(async table=>[table,(await metadata.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results])))),metadataBefore=await metadataSnapshot();
  const metadataSession=metadata.meter.start(),selected=metadata.records.slice(0,3),projected=await api.articleList(metadata.owner,50,selected.map(x=>x.id),true);await metadata.meter.stop();
  assert.equal(projected.length,3);assert.equal(metadataSession.denied,0);assert.equal(metadataSession.writes,0);
  for(const record of selected){
   const actual=projected.find(x=>x.id===record.id),oldRaw=await metadata.db.prepare('SELECT error FROM articles WHERE owner=? AND id=?').bind(metadata.owner,record.id).first();assert.ok(actual);
   const expected={error:await redact(metadata.owner,oldRaw.error,[record.claim]),deliveries:await oldDelivery(metadata.owner,record.id),upload_progress:await original.uploadProgress(metadata.owner,record.id)};
   assert.deepEqual(JSON.parse(JSON.stringify({error:actual.error,deliveries:actual.deliveries,upload_progress:actual.upload_progress})),JSON.parse(JSON.stringify(expected)),'Sectioned metadata must exactly match the original per-article persisted projection');
   assert.ok(!JSON.stringify(actual).includes(record.claim));assert.ok(!JSON.stringify(actual).includes('SYNTHETIC-EXCLUDED-FOREIGN'));
  }
  const tied=projected.find(x=>x.id===metadata.records[0].id).upload_progress.find(x=>x.platform==='toutiao');assert.equal(tied.attempt.attempt_version,2);assert.equal(tied.attempt.attempt_id,metadata.childId);assert.equal(tied.diagnostic.operation_id,metadata.latestTie);assert.equal(tied.diagnostic_superseded,true);
  const limited=projected.find(x=>x.id===metadata.records[1].id).upload_progress.find(x=>x.platform==='toutiao');assert.equal(limited.diagnostic,null,'The 60th-oldest matching diagnostic is outside the original per-article newest-50 boundary');
  assert.ok(projected.every(x=>x.id!==metadata.records[3].id));assert.equal(await metadataSnapshot(),metadataBefore);
  console.log('METADATA_EQUIVALENCE '+JSON.stringify({baseline_commit:baselineCommit,original_source:'lib/article-upload-diagnostics.ts',original_sha256:sha256(originalSource),selected_articles:3,diagnostics_per_article:60,foreign_diagnostics_per_article:60,latest_linked_attempt_version:2,current_d1_calls:metadataSession.calls,db_writes:metadataSession.writes,exact_deep_equal:true}));
  pass('actual D1 bulk metadata exactly equals original helper bodies for multiple platforms, linked latest attempt, >50 diagnostics, rowid timestamp ties, owner/selected-ID isolation and credential redaction');
  const outlier=await malformedLegacyUpload();h.env.DB=outlier.meter.d1;
  const logs=[],GETList=route('app/api/articles/route.ts',logs),outlierBefore=await outlier.raw.prepare('SELECT editor_urls FROM article_upload_attempts').first();
  const corruptSession=outlier.meter.start({cap:Infinity}),corruptResponse=await GETList(new Request('https://synthetic.invalid/api/articles',{headers:{'oai-authenticated-user-id':outlier.record.owner}})),corruptValue=await corruptResponse.json();await outlier.meter.stop();
  assert.equal(corruptResponse.status,503);assert.deepEqual(corruptValue,{error:'暂时无法读取文章'});assert.equal(logs.length,1);assert.equal(logs[0][0],'article_worklist_read_failed');assert.deepEqual(JSON.parse(JSON.stringify(logs[0][1])),{stage:'worklist',code:'stored_json_invalid'});
  assert.ok(!JSON.stringify(logs).includes(outlier.record.claim));assert.ok(!JSON.stringify(logs).includes('INVALID_SYNTHETIC_JSON'));assert.equal(corruptSession.writes,0);
  console.log('MALFORMED '+JSON.stringify({fixture_preexisting_migration:'0018_article_upload_attempts',current_migrations_applied:true,whole_list_status:corruptResponse.status,failure_category:logs[0][1].code,d1_calls:corruptSession.calls,db_writes:corruptSession.writes,raw_error_logged:false}));
  const unaffected=outlier.meter.start(),unaffectedResponse=await endpoint(outlier.record.owner,outlier.record.id);await outlier.meter.stop();assert.equal(unaffectedResponse.status,200);assert.equal((await unaffectedResponse.json()).word_progress.target_id,outlier.record.id);assert.equal(unaffected.writes,0);assert.deepEqual(await outlier.raw.prepare('SELECT editor_urls FROM article_upload_attempts').first(),outlierBefore);
  pass('actual list route categorizes a preexisting malformed upload row as 503/stored_json_invalid without SQL/raw message/token leakage; normal persisted progress route remains readable');
  assert.equal(bucketCounts.get,0);assert.equal(bucketCounts.put,0);assert.equal(bucketCounts.delete,0);assert.equal(h.externalCalls,0);
  pass('zero DB/R2 writes, Word GETs, external/model/dispatch calls; only cached evidence and immutable source bindings are read');
 }
 console.log('SUMMARY '+JSON.stringify({passed,bucket:bucketCounts,external_calls:h.externalCalls,production_calls:0,browser_visual_verification:false}));
}finally{h.close();await mf.dispose();fs.rmSync(migrationFixture,{recursive:true,force:true});}
