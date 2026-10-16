// Synthetic isolated workerd/D1/R2 verification. No real Codex, 得到, small-fish
// event, remote I/O or user manuscript. Completion here is orchestration only.
import ts from 'typescript';import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createHash,webcrypto} from 'node:crypto';import {createRequire} from 'node:module';import {zipSync,strToU8} from 'fflate';import {Miniflare} from 'miniflare';import {drizzle} from 'drizzle-orm/d1';import {migrate} from 'drizzle-orm/d1/migrator';
const require=createRequire(import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex'),uuid=()=>webcrypto.randomUUID();
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("SYNTHETIC ONLY")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'dedao-offline'},r2Buckets:['BUCKET']});
let checks=0,dispatches=0,helpCalls=0,unknown=false,connected=true,frozenTime=null;
class TestDate extends Date{constructor(...args){super(...(args.length?args:[frozenTime??Date.now()]));}static now(){return frozenTime??Date.now();}}
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
try{
 const d1=await mf.getD1Database('DB'),r2=await mf.getR2Bucket('BUCKET');await migrate(drizzle(d1),{migrationsFolder:'drizzle'});await migrate(drizzle(d1),{migrationsFolder:'drizzle'});
 let cache={},onPut=null;const fencedBucket={get:(...a)=>r2.get(...a),delete:(...a)=>r2.delete(...a),put:async(...a)=>{if(onPut)await onPut(...a);return r2.put(...a);}};const mocks={
  './test-store':{db:()=>d1},'cloudflare:workers':{env:{DB:d1,BUCKET:fencedBucket}},'./writing-input':{hashText:async s=>hash(s)},
  './events':{readiness:async()=>({connected}),dispatchDedao:async()=>{dispatches++;return false;}},
  './article-list-policy':{},'./article-output-mode':{},'./article-recovery-view':{},'./article-upload-diagnostics':{},'./article-deliveries':{},'./word-progress':{},
  './article-handoff':{notifyArticle:async(owner,id)=>{helpCalls++;const at=new Date().toISOString();await d1.prepare('INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,?,?,?,?)').bind(uuid(),owner,id,'SYNTHETIC-'+uuid(),unknown?'unknown':'delivered',at,at,at).run();await d1.prepare("UPDATE articles SET state='queued' WHERE id=?").bind(id).run();},reconcileArticleHandoff:async(owner,id,hand)=>{await d1.prepare("UPDATE article_handoffs SET state='delivered' WHERE owner=? AND article_id=? AND id=?").bind(owner,id,hand).run();}}
 };
 function load(name){if(cache[name])return cache[name];const out={};cache[name]=out;const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports:out,require:n=>mocks[n]||(n.startsWith('./')?load(n.slice(2)):require(n)),crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,File,Date:TestDate,Error,URL,Set,Map,atob,btoa,structuredClone,fetch:()=>{throw Error('NO REMOTE I/O')}});return out;}
 let api=load('dedao');const constants=load('dedao-contract'),owner='SYNTHETIC-DEDAO',executor='synthetic-host';
 for(const bad of [0,-1,1.5,'1',null,true,Number.MAX_SAFE_INTEGER+1,NaN]){assert.throws(()=>constants.positiveCount(bad));checks++;}
 check(constants.positiveCount(1)===1&&constants.positiveCount(5)===5,'positive integers');
 await assert.rejects(()=>api.startDedao(owner,{execution_mode:'cli_cdp',total:1,request_key:uuid()}));checks++;
 await api.registerDedaoExecutor(owner,{executor_id:executor,browser_session:'synthetic-browser',capabilities:{conversation_url:constants.DEDAO_URL,checked_at:new Date().toISOString(),codex_available:true,browser_connected:true,logged_in:true,download_readable:true}});
 const keys=Array.from({length:8},uuid),starts=await Promise.all(keys.map(request_key=>api.startDedao(owner,{execution_mode:'cli_cdp',total:3,request_key})));
 let id=starts[0].batch.id;check(starts.every(s=>s.batch.id===id),'8 different start keys share one active batch');check((await d1.prepare('SELECT count(*) AS n FROM dedao_batches').first()).n===1,'one durable batch');check(dispatches===1,'one wake');
 await assert.rejects(()=>api.readDedao('OTHER-OWNER',id));checks++;
 const launches=Array.from({length:8},(_,n)=>({batch_id:id,executor_id:executor,launcher_id:'synthetic-launcher-'+n,claim_token:uuid(),queue_revision:starts[0].batch.queue_revision}));
 const reservations=await Promise.all(launches.map(a=>api.reserveDedaoLaunch(owner,a)));check(reservations.filter(r=>r.reserved).length===1,'only one launcher may start a real Codex process');
 const launch=launches[reservations.findIndex(r=>r.reserved)];check((await api.reserveDedaoLaunch(owner,launch)).duplicate,'unknown launch receipt recovers same reservation');
 const claims=Array.from({length:8},(_,n)=>({...launch,execution_id:'synthetic-exec-'+n}));
 const claimed=await Promise.all(claims.map(a=>api.claimDedao(owner,a)));check(claimed.filter(r=>r.claimed).length===1,'one winning execution');let grant=claims[claimed.findIndex(r=>r.claimed)];
 check((await api.claimDedao(owner,grant)).duplicate,'same execution claim retry');
 await assert.rejects(()=>api.beginDedaoAction(owner,{...grant,ordinal:1,action:'framework'}));checks++;
 await assert.rejects(()=>api.progressDedao(owner,{...grant,ordinal:1,stage:6,response_ref:'synthetic'}));checks++;
 const attempts=await Promise.all(Array.from({length:8},()=>api.beginDedaoAction(owner,{...grant,ordinal:1,action:'recommend'})));check(attempts.filter(r=>r.execute_action).length===1,'one message intent permission');
 cache={};api=load('dedao');check(!(await api.beginDedaoAction(owner,{...grant,ordinal:1,action:'recommend'})).execute_action,'process restart cannot replay message');
 function doc(title){return zipSync({'[Content_Types].xml':strToU8('<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'_rels/.rels':strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),'word/document.xml':strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${title}</w:t></w:r></w:p><w:p><w:r><w:t>Synthetic body only.</w:t></w:r></w:p></w:body></w:document>`)});}
 async function prepare(ordinal){
  let title='Synthetic article '+ordinal,version='synthetic-final-'+ordinal;
  for(const action of ['recommend','adopt','framework','finalize']){
   const r=await api.beginDedaoAction(owner,{...grant,ordinal,action}),a={...grant,ordinal,action,action_id:r.action.action_id,observation:{conversation_url:constants.DEDAO_URL,result:action==='adopt'?'auto_advanced':'response_completed',response_ref:'synthetic-response-'+ordinal+'-'+action,observed_at:new Date().toISOString(),...(action==='finalize'?{title,final_version_ref:version}:{})}};
   if(action==='finalize'){
    const race=await Promise.allSettled([api.confirmDedaoAction(owner,a),api.confirmDedaoAction(owner,{...a,observation:{...a.observation,title:title+' conflict',final_version_ref:version+' conflict'}})]);
    check(race.filter(r=>r.status==='fulfilled').length===1,'conflicting final confirmations have one winner');
    const row=await d1.prepare('SELECT title,final_ref FROM dedao_items WHERE batch_id=? AND ordinal=?').bind(id,ordinal).first(),intent=await d1.prepare("SELECT observation_json FROM dedao_actions WHERE batch_id=? AND ordinal=? AND action='finalize'").bind(id,ordinal).first(),o=JSON.parse(intent.observation_json);
    check(row.title===o.title&&row.final_ref===o.final_version_ref,'winning final title and version cannot be overwritten');
    // Deterministic test ordering: if the conflicting request wins, continue
    // using its genuine frozen identity rather than rewriting the winner.
    title=row.title;version=row.final_ref;
   }else await api.confirmDedaoAction(owner,a);
  }
  const download=await api.beginDedaoAction(owner,{...grant,ordinal,action:'download'}),bytes=doc(title),metadata={filename:'synthetic-'+ordinal+'.docx',path:'/synthetic-downloads/'+ordinal+'.docx',sha256:hash(bytes),size:bytes.length,title,final_version_ref:version,browser_session:'synthetic-browser'};
  await assert.rejects(()=>api.recordDedaoDownload(owner,{...grant,ordinal,action_id:download.action.action_id,download:{...metadata,title:'wrong-title'}}));checks++;
  await api.recordDedaoDownload(owner,{...grant,ordinal,action_id:download.action.action_id,download:metadata});
  await assert.rejects(()=>api.finalizeDedaoUpload(owner,{...grant,ordinal}));checks++;
  const chunk={...grant,ordinal,offset:0,base64:Buffer.from(bytes).toString('base64')};await api.uploadDedaoChunk(owner,chunk);check((await api.uploadDedaoChunk(owner,chunk)).duplicate,'chunk retry same bytes');
  await assert.rejects(()=>api.uploadDedaoChunk(owner,{...chunk,base64:Buffer.from('wrong').toString('base64')}));checks++;
  const uploaded=await api.finalizeDedaoUpload(owner,{...grant,ordinal});await api.finalizeDedaoUpload(owner,{...grant,ordinal});
  const a=await d1.prepare('SELECT * FROM articles WHERE id=?').bind(uploaded.batch.current.article_id).first();check(a.filename===metadata.filename&&a.title===title,'actual parser filename/title correspondence');
  check(hash(new Uint8Array(await (await r2.get(a.source_key)).arrayBuffer()))===metadata.sha256,'actual R2 bytes match downloaded SHA');return a.id;
 }
 const first=await prepare(1);check((await d1.prepare('SELECT count(*) AS n FROM articles').first()).n===1,'lost upload response cannot create another article');
 const submitted=await api.submitDedaoItem(owner,{...grant,ordinal:1});check(submitted.batch.completed===1&&submitted.batch.current_ordinal===2,'server handoff advances exactly one item');check(submitted.message==='已提交，等待小鱼接手。无需再次点击。','accurate submission message');
 await assert.rejects(()=>api.submitDedaoItem(owner,{...grant,ordinal:1}));checks++;
 check(helpCalls===1,'submitted article never re-helped');
 const secondBegin=await api.beginDedaoAction(owner,{...grant,ordinal:2,action:'recommend'});
 await api.confirmDedaoAction(owner,{...grant,ordinal:2,action:'recommend',action_id:secondBegin.action.action_id,observation:{conversation_url:constants.DEDAO_URL,result:'response_completed',response_ref:'synthetic-response-2-recommend',observed_at:new Date().toISOString()}});
 await api.pauseDedao(owner,{...grant,reason:'login_expired'});const paused=await api.readDedao(owner,id);check(paused.batch.completed===1&&!paused.batch.can_resume,'paused batch retains completed item and blocks new execution');
 const again=await api.startDedao(owner,{execution_mode:'cli_cdp',total:9,request_key:uuid()});check(again.batch.id===id&&again.batch.total===3,'pause also holds active batch lock');
 await assert.rejects(()=>api.resumeDedao(owner,id));checks++;
 await api.endDedaoExecution(owner,{...grant,process_exited:true});await api.resumeDedao(owner,id);
 const old=grant;grant={batch_id:id,executor_id:executor,execution_id:'synthetic-resume-exec',claim_token:uuid()};grant.queue_revision=(await api.readDedao(owner,id)).batch.queue_revision;await api.claimDedao(owner,grant);
 await assert.rejects(()=>api.heartbeatDedao(owner,old));checks++;
 check(!(await api.beginDedaoAction(owner,{...grant,ordinal:2,action:'recommend'})).execute_action,'confirmed message survives pause/resume');
 const second=await prepare(2);unknown=true;
 await assert.rejects(()=>api.submitDedaoItem(owner,{...grant,ordinal:2}));checks++;
 check((await api.readDedao(owner,id)).batch.completed===1,'unknown help never increments count');
 const oldH=(await d1.prepare('SELECT * FROM article_handoffs WHERE article_id=?').bind(second).first());
 await api.endDedaoExecution(owner,{...grant,process_exited:true});await api.resumeDedao(owner,id);grant={batch_id:id,executor_id:executor,execution_id:'synthetic-reconcile-exec',claim_token:uuid()};grant.queue_revision=(await api.readDedao(owner,id)).batch.queue_revision;await api.claimDedao(owner,grant);
 await d1.prepare("UPDATE articles SET state='word_ready',claim_token='synthetic-genuine-claim' WHERE id=?").bind(second).run();await api.submitDedaoItem(owner,{...grant,ordinal:2});check(helpCalls===2,'unknown help with actual advanced claim uses same existing event rather than new request');check((await d1.prepare('SELECT count(*) AS n FROM article_handoffs WHERE article_id=?').bind(second).first()).n===1,'one persisted second-item handoff');check((await d1.prepare('SELECT id FROM article_handoffs WHERE article_id=?').bind(second).first()).id===oldH.id,'original handoff identity preserved');
 unknown=false;await prepare(3);await api.submitDedaoItem(owner,{...grant,ordinal:3});const final=await api.readDedao(owner,id);check(final.batch.state==='completed'&&final.batch.completed===3,'N=3 fully serial and correct completed count');check((await d1.prepare('SELECT count(*) AS n FROM dedao_items').first()).n===3,'only exactly N item records');check(helpCalls===3,'one logical small-fish help per item');check((await d1.prepare('SELECT count(*) AS n FROM articles').first()).n===3,'one fixed uploaded object per item');
 check(final.batch.items.every(i=>i.submitted&&i.submitted_handoff_id&&i.download),'every count backed by file and handoff identity');
 const uploads=load('articles'),source=doc('Synthetic deletion test'),deleted=uuid(),key='articles/'+deleted+'/source';await d1.prepare("INSERT INTO article_deletions(id,owner,state,started_at) VALUES(?,?,'deleted',?)").bind(deleted,owner,new Date().toISOString()).run();
 await assert.rejects(()=>uploads.createArticle(owner,new File([source],'deleted.docx'),{id:deleted,sha256:hash(source),title:'Synthetic deletion test'}));checks++;check(!await r2.get(key),'deleted ID never restores source bytes');
 const late=uuid();onPut=async()=>{onPut=null;await d1.prepare("INSERT INTO article_deletions(id,owner,state,started_at) VALUES(?,?,'deleted',?)").bind(late,owner,new Date().toISOString()).run();};await assert.rejects(()=>uploads.createArticle(owner,new File([source],'late.docx'),{id:late,sha256:hash(source),title:'Synthetic deletion test'}));checks++;check(!await r2.get('articles/'+late+'/source'),'late R2 put is compensated after deletion');
 check(final.batch.executor_ended===0&&final.batch.execution_message.includes('等待执行端确认结束'),'submission is not process exit evidence');await api.endDedaoExecution(owner,{...grant,process_exited:true});
 frozenTime=Date.now();
 const next=await api.startDedao(owner,{execution_mode:'cli_cdp',total:1,request_key:uuid()}),revision=next.batch.queue_revision;id=next.batch.id;const cancelled={batch_id:id,executor_id:executor,launcher_id:'synthetic-cancelled',execution_id:'synthetic-cancelled',queue_revision:revision,process_exited:true};await api.endDedaoExecution(owner,cancelled);check((await api.readDedao(owner,id)).batch.state==='paused','uncertain queued launch is durably closed');await api.resumeDedao(owner,id);check(!(await api.reserveDedaoLaunch(owner,{...cancelled,claim_token:uuid()})).reserved,'delayed old reserve cannot take a resumed queue');
 const originalQueue=revision;const launching={batch_id:id,executor_id:executor,launcher_id:'synthetic-pause-launch',claim_token:uuid(),queue_revision:(await api.readDedao(owner,id)).batch.queue_revision};check(launching.queue_revision!==originalQueue,'same frozen clock produces a different queue generation');check((await api.reserveDedaoLaunch(owner,launching)).reserved,'new queue can reserve');await api.requestDedaoPause(owner,id);check(!(await api.readDedao(owner,id)).batch.can_resume,'manual pause while launching awaits actual exit');check(!(await api.claimDedao(owner,{...launching,execution_id:'synthetic-real-thread'})).claimed,'late actual thread cannot claim manually paused batch');await api.endDedaoExecution(owner,{...launching,execution_id:'synthetic-real-thread',process_exited:true});check((await api.readDedao(owner,id)).batch.can_resume,'paused original launcher exit unlocks recovery');await api.resumeDedao(owner,id);check(!(await api.reserveDedaoLaunch(owner,launching)).reserved,'old generation cannot reserve after second same-clock resume');frozenTime=null;
 grant={batch_id:id,executor_id:executor,execution_id:'synthetic-delete-test',claim_token:uuid()};grant.queue_revision=(await api.readDedao(owner,id)).batch.queue_revision;await api.claimDedao(owner,grant);const pending=await prepare(1);await mocks['./article-handoff'].notifyArticle(owner,pending);await d1.prepare("INSERT INTO article_deletions(id,owner,state,started_at) VALUES(?,?,'deleted',?)").bind(pending,owner,new Date().toISOString()).run();await d1.prepare('DELETE FROM articles WHERE id=?').bind(pending).run();await assert.rejects(()=>api.submitDedaoItem(owner,{...grant,ordinal:1}));checks++;check((await api.readDedao(owner,id)).batch.completed===0,'old delivered handoff cannot count a deleted article');
 connected=false;check(!(await api.readDedao(owner,id)).connection.connected,'disconnection reflected without rewriting completed progress');
 console.log(`PASS ${checks} synthetic checks: real D1/R2 migrations, validation, 8-way start/claim/action races, persistent restart, original DOCX parser and bytes, idempotent upload, serial N=3, unknown same-event reconciliation, login pause, end acknowledgement, fenced recovery and owner isolation. No real 得到/Codex/small-fish execution.`);
}finally{await mf.dispose();}
