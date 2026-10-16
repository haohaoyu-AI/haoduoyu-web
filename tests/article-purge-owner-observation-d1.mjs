// Real isolated workerd D1/R2 with production TypeScript helpers. Every article,
// claim, original receipt, cloud-thread observation and action attestation here
// is SYNTHETIC. This never observes an external executor or calls production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,webcrypto} from 'node:crypto';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {png} from './word-recovery-artifact-fixture.mjs';

const root=path.resolve(import.meta.dirname,'..'),nativeRequire=createRequire(import.meta.url);
const uuid=()=>webcrypto.randomUUID(),now=()=>new Date().toISOString();
const future=()=>new Date(Date.now()+3_600_000).toISOString();
const hash=value=>createHash('sha256').update(value).digest('hex');
const BODY='SYNTHETIC_OWNER_OBSERVATION_BODY_ONLY',checks=[];
const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-purge-observation-baseline-'));
let remoteCalls=0;
const mf=new Miniflare({cf:false,modules:true,
  script:'export default {fetch(){return new Response("SYNTHETIC OWNER OBSERVATION ONLY")}}',
  compatibilityDate:'2026-05-22',d1Databases:{DB:'article-purge-observation-isolated'},
  r2Buckets:{BUCKET:'article-purge-observation-isolated-files'}});

try {
  const d1=await mf.getD1Database('DB'),r2=await mf.getR2Bucket('BUCKET');
  let concurrentPrior=null,concurrentEmptyPriorReads=0;
  // A race barrier delays two real D1 read results; it never fabricates a row,
  // changes SQL, rewrites a write, or replaces the actual transaction engine.
  function statementWithReadBarrier(statement,sql,bindings=[]){
    return new Proxy(statement,{get(target,key){
      if(key==='bind')return(...values)=>statementWithReadBarrier(target.bind(...values),sql,values);
      if(key==='first')return async(...args)=>{
        const result=await target.first(...args),gate=concurrentPrior;
        if(gate&&sql==='SELECT payload_sha256 FROM article_purge_executor_observations WHERE owner=? AND request_key=?'
          &&bindings[0]===gate.owner&&bindings[1]===gate.request_key){
          assert.equal(result,null,'each concurrent pre-read is an actually absent D1 receipt');
          concurrentEmptyPriorReads++;gate.reads++;if(gate.reads===2)gate.release();await gate.ready;
        }
        return result;
      };
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});
  }
  const runtimeD1=new Proxy(d1,{get(target,key){
    if(key==='prepare')return sql=>statementWithReadBarrier(target.prepare(sql),sql);
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
  const sourceWitness=new Map(journal.entries.map(entry=>{
    const file=path.join(root,'drizzle',entry.tag+'.sql');return [file,hash(fs.readFileSync(file))];
  }));
  sourceWitness.set(path.resolve(import.meta.dirname,'article-purge-owner-observation-d1.mjs'),hash(fs.readFileSync(path.resolve(import.meta.dirname,'article-purge-owner-observation-d1.mjs'))));
  sourceWitness.set(path.join(root,'drizzle/meta/_journal.json'),hash(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'))));
  const oldEntries=journal.entries.filter(entry=>entry.idx<=48);
  assert.equal(oldEntries.at(-1).idx,48,'baseline includes exact pre-recovery migrations');
  fs.mkdirSync(path.join(baseline,'meta'));
  fs.writeFileSync(path.join(baseline,'meta/_journal.json'),JSON.stringify({...journal,entries:oldEntries}));
  for(const entry of oldEntries)fs.copyFileSync(path.join(root,'drizzle',entry.tag+'.sql'),path.join(baseline,entry.tag+'.sql'));
  await migrate(drizzle(d1),{migrationsFolder:baseline});
  const oldTriggers=(await d1.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).results;
  const modules=new Map();
  function load(name,from=path.join(root,'lib')){
    const file=path.resolve(from,name.endsWith('.ts')?name:name+'.ts');
    assert.ok(file.startsWith(path.join(root,'lib')+path.sep));
    if(modules.has(file))return modules.get(file);
    const exports={};modules.set(file,exports);
    const source=fs.readFileSync(file,'utf8');sourceWitness.set(file,hash(source));
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports,module:{exports},
      require:dependency=>dependency==='cloudflare:workers'?{env:{DB:runtimeD1,BUCKET:r2}}:
        dependency.startsWith('./')?load(dependency,path.dirname(file)):nativeRequire(dependency),
      crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,Buffer,
      Date,Error,Set,Map,JSON,URL,File,Blob,ReadableStream,Request,Response,Headers,
      AbortSignal,AbortController,structuredClone,atob,btoa,setTimeout,clearTimeout,
      console:{info(){}},fetch(){remoteCalls++;throw Error('REMOTE_CALL_FORBIDDEN');}
    },{filename:file});
    return exports;
  }
  const articles=load('articles'),article=load('article-tools'),queue=load('article-help-queue');
  const deletion=load('article-content-deletion'),word=load('word-recovery');
  const attempts=load('word-attempts');
  const count=async(table,owner)=>Number((await d1.prepare(`SELECT count(*) n FROM ${table} WHERE owner=?`).bind(owner).first()).n);
  const blockFor=(owner,id)=>d1.prepare('SELECT * FROM article_purge_serial_blocks WHERE owner=? AND article_id=?').bind(owner,id).first();
  const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
  const bindingArgs=b=>Object.fromEntries(Object.entries(b).filter(([key])=>!['owner','epoch','attempt_id'].includes(key)));
  async function seedArticle(owner,{historical=false}={}){
    const created=await articles.createArticle(owner,new File(['Synthetic title\n'+BODY],'synthetic.txt'));
    if(historical){
      const token=uuid();await d1.prepare("UPDATE articles SET state='processing',claim_token=?,claim_expires=? WHERE owner=? AND id=?").bind(token,future(),owner,created.id).run();
      return {owner,id:created.id,claim_token:token,input_sha256:hash(JSON.stringify(['Synthetic title',BODY]))};
    }
    await d1.prepare("UPDATE articles SET state='queued' WHERE owner=? AND id=?").bind(owner,created.id).run();
    return {owner,id:created.id};
  }
  async function manualArticle(owner){
    const a=await seedArticle(owner),handoff=uuid(),event='article_wake_'+handoff,acquisition=uuid();
    await d1.prepare("INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,'delivered',?,?,?)").bind(handoff,owner,a.id,event,now(),now(),future()).run();
    const claimed=await queue.articleHelpQueueCall(owner,'claim_next_article_help',{request_key:acquisition});
    assert.equal(claimed.claimed,true);assert.equal(claimed.article_id,a.id);
    // Preserve only the exact original seven-field receipt in volatile memory.
    // This is a synthetic normal queue acquisition, never a fabricated end.
    const originalReceipt=await d1.prepare('SELECT owner,request_key,article_id,handoff_id,event_id,claim_hash,created FROM article_help_queue_claims WHERE owner=? AND request_key=?').bind(owner,acquisition).first();
    assert.deepEqual(Object.keys(originalReceipt).sort(),['owner','request_key','article_id','handoff_id','event_id','claim_hash','created'].sort());
    assert.equal(originalReceipt.claim_hash,hash(claimed.claim_token));
    const row=await d1.prepare('SELECT * FROM articles WHERE owner=? AND id=?').bind(owner,a.id).first();
    const b={owner,target_kind:'article',target_id:a.id,claim_token:claimed.claim_token,input_sha256:hash(row.paragraphs),
      execution_token:uuid(),execution_id:uuid(),request_key:uuid(),execution_scope:'heavy'};
    return {...a,b,acquisition,originalReceipt};
  }
  async function historicalManualArticle(owner,{uuidEvent=false}={}){
    // Explicit pre-origin history fixture, matching the existing settlement
    // harness. We never remove or weaken an immutable fresh-claim marker.
    // Its receipt/holder are SYNTHETIC, not a current queue acquisition or a
    // claim that an actual historical external executor was observed.
    const a=await seedArticle(owner,{historical:true}),handoff=uuid(),event=uuidEvent?uuid():'article_wake_'+handoff,acquisition=uuid();
    await d1.prepare("INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,'delivered',?,?,?)")
      .bind(handoff,owner,a.id,event,now(),now(),future()).run();
    const originalReceipt={owner,request_key:acquisition,article_id:a.id,handoff_id:handoff,event_id:event,claim_hash:hash(a.claim_token),created:now()};
    await d1.prepare('INSERT INTO article_help_queue_claims(owner,request_key,article_id,handoff_id,event_id,claim_hash,created) VALUES(?,?,?,?,?,?,?)')
      .bind(...Object.values(originalReceipt)).run();
    const row=await d1.prepare('SELECT paragraphs FROM articles WHERE owner=? AND id=?').bind(owner,a.id).first();
    const b={owner,target_kind:'article',target_id:a.id,claim_token:a.claim_token,input_sha256:hash(row.paragraphs),
      execution_token:uuid(),execution_id:uuid(),request_key:uuid(),execution_scope:'heavy'};
    assert.equal(await d1.prepare('SELECT count(*) n FROM word_claim_origins WHERE owner=? AND target_id=?').bind(owner,a.id).first('n'),0);
    return {...a,b,acquisition,originalReceipt};
  }
  async function acquire(b){
    const result=await word.wordRecoveryCall(b.owner,'acquire_word_execution',bindingArgs(b));
    if(result.acquired){b.epoch=result.epoch;b.attempt_id=result.recovery.attempt.attempt_id;}
    return result;
  }
  async function purge(owner){
    const preview=await deletion.previewArticleContentDeletion(owner,uuid());
    const args={operation_id:preview.operation_id,confirm_owner:owner,confirm_scope:'all_articles',
      confirm_ids:preview.items.map(item=>item.article_id),snapshot_sha256:preview.snapshot_sha256,confirm_permanent:true};
    for(let i=0;i<12;i++){
      await deletion.confirmArticleContentDeletion(owner,args);
      const read=await deletion.readArticleContentDeletion(owner,preview.operation_id);
      if(read.content_deleted){assert.equal(read.state,'deleted');return {...preview,read};}
      assert.equal(read.resume_required,true);
    }
    throw Error('SYNTHETIC_PURGE_CONTINUATION_BOUND');
  }
  async function heartbeat(b){
    const result=await word.wordRecoveryCall(b.owner,'heartbeat_word_execution',{target_kind:b.target_kind,target_id:b.target_id,
      claim_token:b.claim_token,input_sha256:b.input_sha256,execution_token:b.execution_token,epoch:b.epoch,request_key:uuid()});
    assert.equal(result.recovery.status,'running');assert.equal(result.progress_advanced,false);
  }
  async function checkpoint(b){
    const bytes=png(),asset=uuid(),scope={target_kind:b.target_kind,target_id:b.target_id,claim_token:b.claim_token,
      input_sha256:b.input_sha256,execution_token:b.execution_token,asset_id:asset};
    const metadata={source_url:'https://images.example.org/synthetic.png',source_title:'Synthetic raster',after_paragraph:0};
    await word.checkpointCall(b.owner,'begin_word_checkpoint',{...scope,kind:'image',sha256:hash(bytes),size:bytes.length,chunks:1,metadata});
    await word.checkpointCall(b.owner,'put_word_checkpoint_chunk',{...scope,index:0,data_base64:bytes.toString('base64')});
    const finalized=await word.checkpointCall(b.owner,'finalize_word_checkpoint',scope);assert.equal(finalized.state,'ready');
    const cp=await d1.prepare('SELECT * FROM word_checkpoints WHERE owner=? AND target_id=? AND asset_id=?').bind(b.owner,b.target_id,asset).first();
    const part=JSON.parse(cp.parts_json)[0];assert.ok(await r2.head(part.key));return cp;
  }
  const existing=await manualArticle('synthetic-existing-holder-end-'+uuid());
  assert.equal((await acquire(existing.b)).acquired,true);
  const priorPurge=await purge(existing.owner);
  await deletion.settleArticlePurgeExecutor(existing.owner,{article_id:existing.id,operation_id:priorPurge.operation_id,request_key:uuid(),
    claim_token:existing.b.claim_token,input_sha256:existing.b.input_sha256,execution_id:existing.b.execution_id,
    execution_token:existing.b.execution_token,epoch:existing.b.epoch,grant_request_key:existing.b.request_key,
    original_acquisition_request_key:existing.acquisition,evidence_kind:'holder_acknowledgement',
    confirm_all_actions_stopped:true,confirm_all_actions_settled:true,
    end_reference:'synthetic original holder ended',settled_reference:'synthetic original actions settled'});
  const existingEnds=(await d1.prepare('SELECT * FROM article_purge_executor_ends WHERE owner=?').bind(existing.owner).all()).results;
  assert.equal(existingEnds.length,1);

  // New recovery API scenarios are below; migration integration deliberately
  // starts with a genuinely recorded old-protocol acknowledgement in place.
  assert.equal(journal.entries.at(-1).idx,49,'recovery migration is required; never test a missing migration');
  await migrate(drizzle(d1),{migrationsFolder:path.join(root,'drizzle')});
  await migrate(drizzle(d1),{migrationsFolder:path.join(root,'drizzle')});
  const observation=load('article-purge-recovery');
  const deletionTools=load('article-content-deletion-tools');
  for(const fn of ['previewDeletedArticleExecutorRecovery','recordDeletedArticleExecutorObservation','readDeletedArticleExecutorObservation'])
    assert.equal(typeof observation[fn],'function','actual owner observation API is required');
  const preview=(owner,id)=>observation.previewDeletedArticleExecutorRecovery(owner,id);
  const record=(owner,args)=>observation.recordDeletedArticleExecutorObservation(owner,args);
  const read=(owner,id,key)=>observation.readDeletedArticleExecutorObservation(owner,id,key);
  const admission=b=>deletionTools.articleContentDeletionCall(b.owner,'read_word_serial_admission',{target_kind:b.target_kind,target_id:b.target_id});
  const ownerProtocolRows=async owner=>{
    const tables=['articles','local_word_jobs','article_purge_serial_blocks','article_purge_executor_ends','article_purge_executor_observations',
      'word_recovery','word_execution_queue','word_execution_requests','word_execution_receipts','word_attempts','word_attempt_requests','word_serial_slots'];
    return JSON.stringify(await Promise.all(tables.map(async table=>[table,(await d1.prepare(`SELECT * FROM ${table} WHERE owner=?`).bind(owner).all()).results])));
  };
  const unresolved=owner=>d1.prepare(`SELECT ${attempts.articlePurgeUnresolvedSql('?')} unresolved`).bind(owner).first('unresolved');
  const functionText=(source,name)=>{
    const file=ts.createSourceFile('source.ts',source,ts.ScriptTarget.Latest,true);
    const node=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
    assert.ok(node,'existing guard/helper exists: '+name);return node.getText(file);
  };
  await check('0049 preserves every old trigger byte-for-byte and existing original-holder ends across repeated actual D1 migration',async()=>{
    const after=(await d1.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all()).results;
    const byName=new Map(after.map(row=>[row.name,row.sql]));
    for(const row of oldTriggers)assert.equal(byName.get(row.name),row.sql,'old trigger unchanged: '+row.name);
    const ends=(await d1.prepare('SELECT * FROM article_purge_executor_ends WHERE owner=?').bind(existing.owner).all()).results;
    assert.deepEqual(ends,existingEnds);assert.equal(await unresolved(existing.owner),0);
    for(const [file,names] of [['lib/article-content-deletion.ts',['settleArticlePurgeExecutor']],
      ['lib/word-attempts.ts',['articlePurgeUnresolvedSql','wordSerialCapacitySql']]]){
      const before=execFileSync('git',['show','ab95ebb30adaec2efcf2c4a5b263c2aa22f16f8e:'+file],{cwd:root,encoding:'utf8'});
      const current=fs.readFileSync(path.join(root,file),'utf8');
      for(const name of names)assert.equal(functionText(current,name),functionText(before,name),'old guard/helper byte-identical: '+name);
    }
  });
  await check('genuine current fresh unstarted queue claim creates no unknown legacy safety block when deleted',async()=>{
    const fresh=await manualArticle('synthetic-fresh-unstarted-'+uuid());
    assert.equal(await count('word_claim_origins',fresh.owner),1);
    await purge(fresh.owner);assert.equal(await count('article_purge_serial_blocks',fresh.owner),0);
    assert.equal(await unresolved(fresh.owner),0);assert.equal(await count('article_purge_executor_ends',fresh.owner),0);
    const next=await manualArticle(fresh.owner);assert.equal((await acquire(next.b)).acquired,true);
  });
  const old=await historicalManualArticle('synthetic-owner-observed-'+uuid()),oldPurge=await purge(old.owner);
  const context=await preview(old.owner,old.id);
  const observationArgs=(a,p,c,extra={})=>{
    const execution=uuid(),end=now();
    return {article_id:a.id,operation_id:p.operation_id,request_key:uuid(),expected_snapshot_sha256:c.context_sha256,
      input_sha256:a.b.input_sha256,original_acquisition_request_key:a.acquisition,
      receipt_handoff_id:a.originalReceipt.handoff_id,receipt_event_id:a.originalReceipt.event_id,
      receipt_created:a.originalReceipt.created,execution_id:execution,thread_id:execution,turn_id:uuid(),
      evidence_source:'codex_app_tools',terminal_state:'completed',ended_at:end,observed_at:end,
      execution_mapping_reference:'synthetic original Codex tool message maps the exact queue receipt to this thread',
      end_reference:'synthetic Codex tool read returned the exact original turn terminal result',
      settled_reference:'synthetic exact original turn has no outstanding issued actions',
      confirm_all_actions_stopped:true,confirm_all_actions_settled:true,...extra};
  };
  const valid=observationArgs(old,oldPurge,context);
  const newJob=await manualArticle(old.owner),originalQueueKey=newJob.b.request_key;
  await check('explicit synthetic pre-origin manual receipt survives only as the retained seven-field fingerprint after actual purge; read never releases',async()=>{
    const b=await blockFor(old.owner,old.id);assert.equal(b.holder_mode,'manual_help');
    assert.equal(b.claim_sha256,old.originalReceipt.claim_hash);assert.equal(b.acquisition_request_key,old.acquisition);
    assert.equal(await count('article_help_queue_claims',old.owner),1,'only the new live synthetic help receipt remains');
    assert.equal(await d1.prepare('SELECT count(*) n FROM article_help_queue_claims WHERE owner=? AND request_key=?').bind(old.owner,old.acquisition).first('n'),0);
    assert.equal(context.eligible_for_observation,true);assert.equal(context.requires_real_execution_mapping,true);
    assert.equal(context.new_execution_grant,false);assert.equal(context.input_sha256,old.b.input_sha256);
    assert.equal(context.original_acquisition_request_key,old.acquisition);
    assert.equal(context.original_receipt_sha256,hash(JSON.stringify(old.originalReceipt)));
    const unseen=await read(old.owner,old.id,valid.request_key);assert.equal(unseen.recorded,false);assert.equal(unseen.new_execution_grant,false);
    assert.equal(await unresolved(old.owner),1);assert.equal(await count('article_purge_executor_ends',old.owner),0);
    const result=await acquire(newJob.b);assert.equal(result.acquired,false);assert.equal(result.queued,true);
    assert.equal(result.new_execution_grant,false);assert.equal(result.recovery.queue_reason,'total_capacity');
    assert.equal(await count('word_serial_slots',old.owner),0);assert.equal(await count('word_execution_receipts',old.owner),0);
    const beforeRead=await ownerProtocolRows(old.owner),gate=await admission(newJob.b);
    assert.equal(gate.serial_admission_possible,false);assert.equal(gate.business_claim_live,true);
    assert.equal(gate.unresolved_purge_count,1);assert.equal(gate.owner_slot_present,false);
    assert.equal(gate.new_execution_grant,false);assert.equal(gate.read_only,true);assert.equal(gate.automatic_dispatch_available,false);
    assert.equal(await ownerProtocolRows(old.owner),beforeRead,'blocked diagnostic is a genuine read with no protocol mutation');
  });
  await check('wrong owner/operation/input/context/acquisition/each original receipt field/invalid identity/terminal/time/source/flags reject without an end',async()=>{
    await assert.rejects(record('synthetic-foreign-owner',valid));
    const variants=[{article_id:uuid()},{operation_id:uuid()},{input_sha256:'a'.repeat(64)},
      {expected_snapshot_sha256:'b'.repeat(64)},{original_acquisition_request_key:uuid()},
      {receipt_handoff_id:uuid()},{receipt_event_id:uuid()},{receipt_created:new Date(Date.parse(valid.receipt_created)-1).toISOString()},
      {thread_id:''},{execution_id:''},{turn_id:''},{terminal_state:'idle'},{terminal_state:'running'},
      {terminal_state:'timeout'},{ended_at:new Date(Date.parse(valid.receipt_created)-1).toISOString()},
      {observed_at:new Date(Date.parse(valid.ended_at)-1).toISOString()},{ended_at:'invalid-time'},
      {observed_at:new Date(Date.now()+3_600_000).toISOString()},{evidence_source:'owner_assertion'},
      {confirm_all_actions_stopped:false},{confirm_all_actions_settled:false},
      {execution_mapping_reference:''},{end_reference:''},{settled_reference:''},{unexpected:'not authorized'}];
    for(const extra of variants)await assert.rejects(record(old.owner,{...valid,...extra}),JSON.stringify(Object.keys(extra))+' must reject');
    assert.equal(await count('article_purge_executor_ends',old.owner),0);assert.equal(await unresolved(old.owner),1);
    assert.equal((await acquire(newJob.b)).new_execution_grant,false);
  });
  await check('missing historical acquisition/execution mapping, idle, expiry and old reads cannot free owner capacity',async()=>{
    const unknown=await seedArticle('synthetic-unknown-observation-'+uuid(),{historical:true});
    await d1.prepare('UPDATE articles SET claim_expires=? WHERE owner=? AND id=?').bind(new Date(Date.now()-86_400_000).toISOString(),unknown.owner,unknown.id).run();
    const unknownPurge=await purge(unknown.owner),unknownContext=await preview(unknown.owner,unknown.id);
    assert.equal(unknownContext.eligible_for_observation,false);assert.equal(unknownContext.new_execution_grant,false);
    await assert.rejects(record(unknown.owner,{...valid,article_id:unknown.id,operation_id:unknownPurge.operation_id,
      input_sha256:unknown.input_sha256,request_key:uuid(),expected_snapshot_sha256:unknownContext.context_sha256}));
    await deletion.readArticlePurgeExecutorEnd(unknown.owner,unknown.id);await read(unknown.owner,unknown.id,uuid());
    assert.equal(await count('article_purge_executor_ends',unknown.owner),0);assert.equal(await unresolved(unknown.owner),1);
    const blocked=await manualArticle(unknown.owner);assert.equal((await acquire(blocked.b)).acquired,false);
    await assert.rejects(record(old.owner,{...valid,execution_mapping_reference:undefined}));
    assert.equal(await unresolved(old.owner),1);
  });
  await check('exact synthetic externally observed terminal and settled actions append an independently read end; unknown response same-key replay is idempotent',async()=>{
    // Deliberately discard the first result, modelling a transport response lost
    // after the real D1 write, then independently read the same durable key.
    await record(old.owner,valid);
    const readBack=await read(old.owner,old.id,valid.request_key);
    assert.equal(readBack.recorded,true);assert.equal(readBack.new_execution_grant,false);
    assert.equal(readBack.serial_safety_block_resolved,true);
    const replay=await record(old.owner,valid);assert.equal(replay.recorded,true);assert.equal(replay.duplicate,true);
    assert.equal(replay.evidence_kind,'owner_observed_codex_terminal');assert.equal(replay.server_verified,false);
    assert.equal(replay.serial_safety_block_resolved,true);assert.equal(replay.new_execution_grant,false);
    await assert.rejects(record(old.owner,{...valid,end_reference:'different synthetic terminal evidence'}));
    await assert.rejects(record(old.owner,{...valid,settled_reference:'different synthetic actions evidence'}));
    for(const extra of [{execution_id:uuid()},{thread_id:uuid()},{turn_id:uuid()},{execution_mapping_reference:'different synthetic mapping'}])
      await assert.rejects(record(old.owner,{...valid,...extra}),'same request cannot replace the observed identity/mapping');
    assert.equal(await count('article_purge_executor_ends',old.owner),1);assert.equal(await unresolved(old.owner),0);
    const foreign=await read('synthetic-foreign-owner',old.id,valid.request_key);assert.equal(foreign.recorded,false);assert.equal(foreign.new_execution_grant,false);
    await assert.rejects(read(old.owner,newJob.id,valid.request_key));
    const absent=await read(old.owner,old.id,uuid());assert.equal(absent.recorded,false);assert.equal(absent.new_execution_grant,false);
    const beforeRead=await ownerProtocolRows(old.owner),gate=await admission(newJob.b);
    assert.equal(gate.serial_admission_possible,true);assert.equal(gate.business_claim_live,true);
    assert.equal(gate.unresolved_purge_count,0);assert.equal(gate.owner_slot_present,false);
    assert.equal(gate.new_execution_grant,false);assert.equal(gate.read_only,true);
    assert.equal(await count('word_execution_receipts',old.owner),0,'possible diagnostic is never an actual grant');
    assert.equal(await ownerProtocolRows(old.owner),beforeRead,'possible diagnostic never modifies the original queued request');
  });
  await check('original queued request receives its first actual grant after observation; same-key retries never duplicate execution',async()=>{
    const result=await acquire(newJob.b);assert.equal(result.acquired,true);assert.equal(result.new_execution_grant,true);
    assert.equal(newJob.b.request_key,originalQueueKey);await heartbeat(newJob.b);await checkpoint(newJob.b);
    const replay=await acquire(newJob.b);assert.equal(replay.duplicate,true);assert.equal(replay.new_execution_grant,false);
    assert.equal(await count('word_serial_slots',old.owner),1);assert.equal(await count('word_execution_receipts',old.owner),1);
    const beforeRead=await ownerProtocolRows(old.owner),gate=await admission(newJob.b);
    assert.equal(gate.current_target_owns_slot,true);assert.equal(gate.owner_slot_present,true);assert.equal(gate.serial_admission_possible,true);
    assert.equal(gate.new_execution_grant,false);assert.equal(await ownerProtocolRows(old.owner),beforeRead);
  });
  await check('normal read-only serial admission tool rejects foreign/bad scope and needs a nonnull live business claim without creating authority',async()=>{
    const definition=deletionTools.articleContentDeletionTools.find(tool=>tool.name==='read_word_serial_admission');
    assert.ok(definition);assert.equal(definition.annotations.readOnlyHint,true);
    await assert.rejects(deletionTools.articleContentDeletionCall('synthetic-foreign-owner','read_word_serial_admission',
      {target_kind:'article',target_id:newJob.id}));
    await assert.rejects(deletionTools.articleContentDeletionCall(old.owner,'read_word_serial_admission',
      {target_kind:'article',target_id:newJob.id,unexpected:'extra'}));
    await assert.rejects(deletionTools.articleContentDeletionCall(old.owner,'read_word_serial_admission',
      {target_kind:'unknown',target_id:newJob.id}));
    const unclaimed=await seedArticle('synthetic-readonly-no-claim-'+uuid());
    await d1.prepare("UPDATE articles SET state='processing',claim_expires=? WHERE owner=? AND id=?")
      .bind(future(),unclaimed.owner,unclaimed.id).run();
    const b={owner:unclaimed.owner,target_kind:'article',target_id:unclaimed.id};
    const beforeRead=await ownerProtocolRows(b.owner),gate=await admission(b);
    assert.equal(gate.business_claim_live,false,'future expiry without a claim token is not a live claim');
    assert.equal(gate.new_execution_grant,false);assert.equal(gate.read_only,true);assert.equal(await ownerProtocolRows(b.owner),beforeRead);
    const raw=JSON.stringify(gate);for(const token of [old.b.claim_token,newJob.b.claim_token,newJob.b.execution_token])assert.equal(raw.includes(token),false);
    assert.equal(await count('word_execution_receipts',b.owner),0);assert.equal(await count('word_serial_slots',b.owner),0);
    const local=load('local-word-jobs'),localOwner='synthetic-readonly-local-no-claim-'+uuid();
    const job=await local.createLocalWordJob(localOwner,{request_key:uuid(),filename:'synthetic-local.txt',source_sha256:hash(BODY),
      title:'Synthetic local title',paragraphs:[BODY],subheading_indices:[],original_sha256:hash(JSON.stringify(['Synthetic local title',BODY]))});
    await d1.prepare("UPDATE local_word_jobs SET state='processing',claim_expires=? WHERE owner=? AND id=?")
      .bind(future(),localOwner,job.job.id).run();
    const localBinding={owner:localOwner,target_kind:'local_word',target_id:job.job.id},beforeLocal=await ownerProtocolRows(localOwner);
    const localGate=await admission(localBinding);assert.equal(localGate.business_claim_live,false,'future expiry without claim hash is not a local live claim');
    assert.equal(localGate.new_execution_grant,false);assert.equal(localGate.read_only,true);assert.equal(await ownerProtocolRows(localOwner),beforeLocal);
    assert.equal(await count('word_execution_receipts',localOwner),0);assert.equal(await count('word_serial_slots',localOwner),0);
  });
  await check('actual D1 independently rejects forged observation binding/chronology/evidence and owner-observed ends without the exact immutable audit',async()=>{
    const audit=await d1.prepare('SELECT * FROM article_purge_executor_observations WHERE owner=? AND request_key=?').bind(old.owner,valid.request_key).first();
    assert.ok(audit);
    const auditVariants=[{owner:'synthetic-foreign-owner'},{article_id:uuid()},{operation_id:uuid()},
      {claim_sha256:'c'.repeat(64)},{input_sha256:'d'.repeat(64)},{acquisition_request_key:uuid()},
      {original_receipt_sha256:'e'.repeat(64)},{purge_snapshot_sha256:'f'.repeat(64)},
      {ended_at:new Date(Date.parse(audit.acquired_at)-1).toISOString()},{terminal_state:'idle'},
      {evidence_source:'owner_assertion'},{all_actions_stopped:0},{all_actions_settled:0},{server_verified:1}];
    for(const extra of auditVariants){
      const row={...audit,request_key:uuid(),...extra},keys=Object.keys(row);
      await assert.rejects(d1.prepare(`INSERT INTO article_purge_executor_observations(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`)
        .bind(...keys.map(key=>row[key])).run(),JSON.stringify(Object.keys(extra))+' must be fenced independently in D1');
    }
    const end=await d1.prepare('SELECT * FROM article_purge_executor_ends WHERE owner=? AND request_key=?').bind(old.owner,valid.request_key).first();
    for(const extra of [{request_key:uuid()},{observed_execution_sha256:'a'.repeat(64)},
      {payload_sha256:'b'.repeat(64)},{end_reference_sha256:'c'.repeat(64)},{server_verified:1},{all_actions_settled:0}]){
      const row={...end,...extra},keys=Object.keys(row);
      await assert.rejects(d1.prepare(`INSERT INTO article_purge_executor_ends(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`)
        .bind(...keys.map(key=>row[key])).run());
    }
    for(const query of ['DELETE FROM article_purge_executor_observations WHERE owner=?',
      "UPDATE article_purge_executor_observations SET terminal_state='failed' WHERE owner=?"])
      await assert.rejects(d1.prepare(query).bind(old.owner).run());
    assert.equal(await count('article_purge_executor_observations',old.owner),1);assert.equal(await count('article_purge_executor_ends',old.owner),1);
    const actual=await deletion.readArticlePurgeExecutorEnd(old.owner,old.id);
    assert.equal(actual.evidence_kind,'owner_observed_codex_terminal');assert.equal(actual.server_verified,false);
    assert.equal(actual.external_stop_confirmed,false);assert.equal(actual.serial_safety_block_resolved,true);
  });
  await check('owner observation leaves old article, queue, direct SQL, credential helper and R2 source writers fenced',async()=>{
    assert.equal((await deletion.readArticleContentDeletion(old.owner,oldPurge.operation_id)).content_deleted,true);
    assert.ok(await blockFor(old.owner,old.id));assert.ok(await count('article_content_fences',old.owner));
    for(const table of ['article_content_fences','article_purge_serial_blocks','article_purge_executor_ends']){
      await assert.rejects(d1.prepare(`DELETE FROM ${table} WHERE owner=?`).bind(old.owner).run());
      await assert.rejects(d1.prepare(`UPDATE ${table} SET operation_id=? WHERE owner=?`).bind(uuid(),old.owner).run());
    }
    await assert.rejects(article.articleCall(old.owner,'read_article',{article_id:old.id}));
    await assert.rejects(article.articleCall(old.owner,'begin_article_output',{article_id:old.id,claim_token:old.b.claim_token,
      execution_token:old.b.execution_token,size:1,sha256:hash('x'),chunks:1}));
    await assert.rejects(word.wordRecoveryCall(old.owner,'acquire_word_execution',bindingArgs(old.b)));
    await assert.rejects(queue.articleHelpQueueCall(old.owner,'claim_next_article_help',{request_key:old.acquisition}));
    await assert.rejects(d1.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,?,?,?,?,?,?)')
      .bind(old.id,old.owner,'Late synthetic','late.txt',`articles/${old.id}/source`,'["late"]',now(),'queued').run());
    await assert.rejects(d1.prepare('INSERT INTO article_help_queue_claims(owner,request_key,article_id,handoff_id,event_id,claim_hash,created) VALUES(?,?,?,?,?,?,?)')
      .bind(...Object.values(old.originalReceipt)).run());
    const sourceFence=load('article-source-write');
    await assert.rejects(sourceFence.writeArticleObject(old.owner,old.id,`articles/${old.id}/late`,new Uint8Array([1])));
    assert.equal((await r2.list({prefix:`articles/${old.id}/`})).objects.length,0);
    assert.equal(await d1.prepare('SELECT count(*) n FROM articles WHERE owner=? AND id=?').bind(old.owner,old.id).first('n'),0);
  });
  await check('pause keeps slot until exact holder end; acknowledgement frees queued next job; original ready checkpoint survives resume',async()=>{
    const second=await manualArticle(old.owner),before=(await d1.prepare('SELECT * FROM word_checkpoints WHERE owner=? AND target_id=?').bind(old.owner,newJob.id).all()).results;
    assert.equal((await acquire(second.b)).queued,true);
    const view=await word.wordRecoveryView(old.owner,'article',newJob.id);
    await word.setWordIntent(old.owner,{target_kind:'article',target_id:newJob.id,input_sha256:newJob.b.input_sha256,expected_version:view.version,intent:'paused'});
    assert.equal((await acquire(second.b)).acquired,false);assert.equal(await count('word_serial_slots',old.owner),1);
    await assert.rejects(heartbeat(newJob.b));
    const ack={target_kind:'article',target_id:newJob.id,input_sha256:newJob.b.input_sha256,attempt_id:newJob.b.attempt_id,
      claim_token:newJob.b.claim_token,execution_token:newJob.b.execution_token,execution_id:newJob.b.execution_id,epoch:newJob.b.epoch,
      request_key:uuid(),confirm_all_actions_settled:true,settled_reference:'synthetic current holder actions settled',
      confirm_executor_ended:true,terminal_reference:'synthetic current holder safely paused',state:'paused_safe'};
    const ended=await attempts.wordAttemptCall(old.owner,'acknowledge_word_attempt_stopped',ack);assert.equal(ended.recorded,true);
    assert.equal((await attempts.wordAttemptCall(old.owner,'acknowledge_word_attempt_stopped',ack)).duplicate,true);
    assert.equal(await count('word_serial_slots',old.owner),0);
    assert.equal((await acquire(second.b)).acquired,true);await heartbeat(second.b);
    const secondAck={...ack,target_id:second.id,input_sha256:second.b.input_sha256,attempt_id:second.b.attempt_id,
      claim_token:second.b.claim_token,execution_token:second.b.execution_token,execution_id:second.b.execution_id,
      epoch:second.b.epoch,request_key:uuid(),state:'ended'};
    await attempts.wordAttemptCall(old.owner,'acknowledge_word_attempt_stopped',secondAck);
    const paused=await word.wordRecoveryView(old.owner,'article',newJob.id);
    await word.setWordIntent(old.owner,{target_kind:'article',target_id:newJob.id,input_sha256:newJob.b.input_sha256,expected_version:paused.version,intent:'run'});
    const resumed={...newJob.b,request_key:uuid(),execution_id:uuid(),execution_token:uuid()};
    assert.equal((await acquire(resumed)).acquired,true);await heartbeat(resumed);
    assert.deepEqual((await d1.prepare('SELECT * FROM word_checkpoints WHERE owner=? AND target_id=?').bind(old.owner,newJob.id).all()).results,before);
    for(const row of before)for(const part of JSON.parse(row.parts_json))assert.ok(await r2.head(part.key));
    await assert.rejects(heartbeat(newJob.b));assert.equal(await count('word_serial_slots',old.owner),1);
  });
  const raceOld=await historicalManualArticle('synthetic-observation-race-'+uuid()),racePurge=await purge(raceOld.owner);
  const raceContext=await preview(raceOld.owner,raceOld.id),raceValid=observationArgs(raceOld,racePurge,raceContext);
  await check('concurrent observation duplicates resolve one append-only end; two new jobs race to at most one actual owner slot',async()=>{
    const jobs=[await manualArticle(raceOld.owner),await manualArticle(raceOld.owner)];
    jobs[1].b.execution_scope='prepare';
    assert.ok((await Promise.all(jobs.map(a=>acquire(a.b)))).every(result=>!result.acquired&&result.queued));
    const receipts=await Promise.all(Array.from({length:8},()=>record(raceOld.owner,raceValid)));
    assert.ok(receipts.every(result=>result.recorded&&result.serial_safety_block_resolved));
    assert.equal(await count('article_purge_executor_ends',raceOld.owner),1);
    const grants=await Promise.all(jobs.map(a=>acquire(a.b)));assert.equal(grants.filter(result=>result.acquired).length,1);
    assert.equal(grants.filter(result=>!result.acquired&&result.queued).length,1);
    assert.equal(await count('word_serial_slots',raceOld.owner),1);assert.equal(await count('word_execution_receipts',raceOld.owner),1);
  });
  await check('same-key simultaneous differing terminal payloads cannot both succeed even when both pre-reads see no receipt',async()=>{
    const a=await historicalManualArticle('synthetic-observation-conflict-race-'+uuid()),p=await purge(a.owner),c=await preview(a.owner,a.id);
    const first=observationArgs(a,p,c),second={...first,thread_id:uuid(),end_reference:'different synthetic concurrent terminal evidence'};
    let release;const ready=new Promise(resolve=>{release=resolve;});
    const barrierTimeout=setTimeout(release,10_000);
    concurrentPrior={owner:a.owner,request_key:first.request_key,reads:0,ready,release};
    let results;
    try{results=await Promise.allSettled([record(a.owner,first),record(a.owner,second)]);}
    finally{clearTimeout(barrierTimeout);concurrentPrior=null;}
    assert.equal(concurrentEmptyPriorReads,2,'both real pre-reads saw empty before either conflicting write');
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1,'only one conflicting payload succeeds');
    assert.equal(results.filter(result=>result.status==='rejected').length,1,'the loser reports a conflict');
    assert.equal(await count('article_purge_executor_observations',a.owner),1);assert.equal(await count('article_purge_executor_ends',a.owner),1);
    const winner=results[0].status==='fulfilled'?first:second,loser=results[0].status==='fulfilled'?second:first;
    assert.equal((await record(a.owner,winner)).duplicate,true);await assert.rejects(record(a.owner,loser));
    assert.equal((await read(a.owner,a.id,first.request_key)).recorded,true);
  });
  await check('failed and cancelled are admissible only with the same exact original receipt and settled actions',async()=>{
    for(const terminal_state of ['failed','cancelled']){
      const a=await historicalManualArticle('synthetic-terminal-'+terminal_state+'-'+uuid()),p=await purge(a.owner),c=await preview(a.owner,a.id);
      const payload=observationArgs(a,p,c,{terminal_state});
      await assert.rejects(record(a.owner,{...payload,confirm_all_actions_settled:false}));
      const result=await record(a.owner,payload);assert.equal(result.recorded,true);assert.equal(result.terminal_state,terminal_state);
      assert.equal(result.server_verified,false);assert.equal(await unresolved(a.owner),0);
    }
  });
  await check('real article_wake event shape and exact UUID-only historical receipts are compatible without rewriting the retained fingerprint',async()=>{
    assert.equal(old.originalReceipt.event_id,'article_wake_'+old.originalReceipt.handoff_id);
    const definition=deletionTools.articleContentDeletionTools.find(tool=>tool.name==='record_deleted_article_executor_observation');
    const eventPattern=new RegExp(definition.inputSchema.properties.receipt_event_id.pattern);
    assert.ok(eventPattern.test(old.originalReceipt.event_id));
    const legacy=await historicalManualArticle('synthetic-legacy-uuid-event-'+uuid(),{uuidEvent:true}),p=await purge(legacy.owner),c=await preview(legacy.owner,legacy.id);
    const payload=observationArgs(legacy,p,c);assert.ok(eventPattern.test(payload.receipt_event_id));
    await assert.rejects(record(legacy.owner,{...payload,receipt_event_id:'article_wake_'+legacy.originalReceipt.handoff_id}),
      'never upgrade a real historical UUID-only event or fabricate an event from the handoff');
    await assert.rejects(record(legacy.owner,{...payload,receipt_event_id:'article_wake_not-an-identity'}));
    const result=await record(legacy.owner,payload);assert.equal(result.recorded,true);assert.equal(await unresolved(legacy.owner),0);
    assert.equal((await preview(legacy.owner,legacy.id)).original_receipt_sha256,hash(JSON.stringify(legacy.originalReceipt)));
  });
  await check('owner-wide admission stays blocked after only one of multiple original holders settles and the exact old queue acquires only after all settle',async()=>{
    const who='synthetic-multiple-old-holders-'+uuid(),first=await historicalManualArticle(who),second=await historicalManualArticle(who);
    const p=await purge(who),firstContext=await preview(who,first.id),secondContext=await preview(who,second.id);
    assert.equal(await count('article_purge_serial_blocks',who),2);
    const queued=await manualArticle(who);assert.equal((await acquire(queued.b)).queued,true);
    assert.equal((await admission(queued.b)).unresolved_purge_count,2);
    await record(who,observationArgs(first,p,firstContext));
    const partial=await admission(queued.b);assert.equal(partial.unresolved_purge_count,1);assert.equal(partial.serial_admission_possible,false);
    assert.equal(partial.new_execution_grant,false);assert.equal((await acquire(queued.b)).acquired,false);
    assert.equal(await count('word_execution_receipts',who),0);assert.equal(await count('word_serial_slots',who),0);
    await record(who,observationArgs(second,p,secondContext));
    const ready=await admission(queued.b);assert.equal(ready.unresolved_purge_count,0);assert.equal(ready.serial_admission_possible,true);
    assert.equal(ready.new_execution_grant,false);assert.equal((await acquire(queued.b)).acquired,true);
    assert.equal(await count('word_execution_receipts',who),1);assert.equal(await count('word_serial_slots',who),1);
    assert.equal(await count('article_purge_serial_blocks',who),2,'all immutable safety rows remain retained');
  });
  const mapped=await manualArticle('synthetic-mapped-observation-'+uuid());mapped.b.execution_id=uuid();
  assert.equal((await acquire(mapped.b)).acquired,true);
  await d1.prepare('UPDATE word_recovery SET lease_until=?,heartbeat_at=? WHERE owner=? AND target_id=?')
    .bind(new Date(Date.now()-600_000).toISOString(),new Date(Date.now()-86_400_000).toISOString(),mapped.owner,mapped.id).run();
  assert.equal(await count('word_serial_slots',mapped.owner),1,'lease/heartbeat age alone never proves process end');
  const mappedPurge=await purge(mapped.owner);
  const mappedContext=await preview(mapped.owner,mapped.id),mappedValid=observationArgs(mapped,mappedPurge,mappedContext,
    {execution_id:mapped.b.execution_id,thread_id:mapped.b.execution_id});
  await check('mapped Word grant is ineligible for owner observation and retains the exact original-holder protocol',async()=>{
    assert.equal((await blockFor(mapped.owner,mapped.id)).holder_mode,'mapped_executor');
    assert.equal(mappedContext.eligible_for_observation,false);
    const other=uuid();await assert.rejects(record(mapped.owner,{...mappedValid,execution_id:other,thread_id:other}));
    await assert.rejects(record(mapped.owner,mappedValid));
    assert.equal(await unresolved(mapped.owner),1);
    const holderArgs={article_id:mapped.id,operation_id:mappedPurge.operation_id,request_key:uuid(),
      claim_token:mapped.b.claim_token,input_sha256:mapped.b.input_sha256,execution_id:mapped.b.execution_id,
      execution_token:mapped.b.execution_token,epoch:mapped.b.epoch,grant_request_key:mapped.b.request_key,
      original_acquisition_request_key:mapped.acquisition,evidence_kind:'holder_acknowledgement',
      confirm_all_actions_stopped:true,confirm_all_actions_settled:true,
      end_reference:'synthetic exact mapped holder ended',settled_reference:'synthetic exact mapped actions settled'};
    await assert.rejects(deletion.settleArticlePurgeExecutor(mapped.owner,{...holderArgs,execution_id:other}));
    const result=await deletion.settleArticlePurgeExecutor(mapped.owner,holderArgs);assert.equal(result.end_recorded,true);assert.equal(await unresolved(mapped.owner),0);
  });
  await check('new recovery metadata contains hashes only and does not disclose article text, tokens or claim permission in API results',async()=>{
    const tables=(await d1.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'article_purge_%'").all()).results;
    for(const table of tables){
      const raw=JSON.stringify((await d1.prepare(`SELECT * FROM ${table.name} WHERE owner=?`).bind(old.owner).all()).results);
      assert.equal(raw.includes(BODY),false);
      for(const token of [old.b.claim_token,old.b.execution_token,newJob.b.claim_token,newJob.b.execution_token])assert.equal(raw.includes(token),false);
    }
    for(const result of [await preview(old.owner,old.id),await read(old.owner,old.id,valid.request_key)]){
      const raw=JSON.stringify(result);for(const token of [old.b.claim_token,old.b.execution_token])assert.equal(raw.includes(token),false);
      assert.equal(result.new_execution_grant,false);assert.notEqual(result.server_verified,true);
    }
    assert.equal(remoteCalls,0);
  });

  assert.equal(remoteCalls,0);
  for(const [file,digest] of sourceWitness)assert.equal(hash(fs.readFileSync(file)),digest,'tested source/migration remained stable: '+path.relative(root,file));
  console.log(JSON.stringify({result:'PASS',checks:checks.length,runtime:'actual workerd D1/R2',
    migrations:'0000–0049',old_trigger_count:oldTriggers.length,source_stable:true,loaded_modules:modules.size,
    concurrent_conflict_empty_d1_prereads:concurrentEmptyPriorReads,
    tested_sha256:Object.fromEntries([...sourceWitness].map(([file,digest])=>[path.relative(root,file),digest])),
    remote_calls:remoteCalls,source_data:'synthetic only',historical_fixture:'explicit synthetic pre-origin metadata; immutable fresh origin never removed',
    external_processes_observed:false,attestation:'synthetic owner tool observation only; server_verified=false; no production lifecycle proof'},null,2));
} finally {await mf.dispose();fs.rmSync(baseline,{recursive:true,force:true});}
