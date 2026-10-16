// Actual isolated workerd D1/R2 and production helpers. Historical fixtures and
// acknowledgements are synthetic; no external process, browser or Site is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
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
const BODY='SYNTHETIC_SETTLEMENT_BODY_ONLY',checks=[];
let remoteCalls=0;
const mf=new Miniflare({cf:false,modules:true,
  script:'export default {fetch(){return new Response("SYNTHETIC EXECUTOR SETTLEMENT ONLY")}}',
  compatibilityDate:'2026-05-22',d1Databases:{DB:'article-purge-settlement-isolated'},
  r2Buckets:{BUCKET:'article-purge-settlement-isolated-files'}});

try {
  const d1=await mf.getD1Database('DB'),r2=await mf.getR2Bucket('BUCKET');
  const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
  assert.equal(journal.entries[48].idx,48,'preserve the original 0000–0048 migration prefix');
  assert.equal(journal.entries.at(-1).idx,49,'test exact 0000–0049 migration journal');
  assert.equal(journal.entries.at(-1).tag,'0049_article_purge_codex_observations');
  await migrate(drizzle(d1),{migrationsFolder:path.join(root,'drizzle')});
  await migrate(drizzle(d1),{migrationsFolder:path.join(root,'drizzle')});
  const modules=new Map();
  function load(name,from=path.join(root,'lib')){
    const file=path.resolve(from,name.endsWith('.ts')?name:name+'.ts');
    assert.ok(file.startsWith(path.join(root,'lib')+path.sep));
    if(modules.has(file))return modules.get(file);
    const exports={};modules.set(file,exports);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code,{exports,module:{exports},
      require:dependency=>dependency==='cloudflare:workers'?{env:{DB:d1,BUCKET:r2}}:
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
  const local=load('local-word-jobs'),attempts=load('word-attempts');
  for(const fn of ['readArticlePurgeExecutorEnd','settleArticlePurgeExecutor'])assert.equal(typeof deletion[fn],'function','real settlement contract is required');
  const count=async(table,owner)=>Number((await d1.prepare(`SELECT count(*) n FROM ${table} WHERE owner=?`).bind(owner).first()).n);
  const blockFor=(owner,id)=>d1.prepare('SELECT * FROM article_purge_serial_blocks WHERE owner=? AND article_id=?').bind(owner,id).first();
  const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
  const bindingArgs=b=>Object.fromEntries(Object.entries(b).filter(([key])=>key!=='owner'&&key!=='epoch'));
  async function seedArticle(owner,{historical=false}={}){
    const created=await articles.createArticle(owner,new File(['Synthetic title\n'+BODY],'synthetic.txt'));
    if(historical){
      const token=uuid();await d1.prepare("UPDATE articles SET state='processing',claim_token=?,claim_expires=? WHERE owner=? AND id=?").bind(token,future(),owner,created.id).run();
      return {owner,id:created.id,claim_token:token,input_sha256:hash(JSON.stringify(['Synthetic title',BODY]))};
    }
    await d1.prepare("UPDATE articles SET state='queued' WHERE owner=? AND id=?").bind(owner,created.id).run();
    return {owner,id:created.id};
  }
  async function mappedArticle(owner){
    const a=await seedArticle(owner),handoff=uuid(),event=uuid(),acquisition=uuid();
    await d1.prepare("INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,'delivered',?,?,?)").bind(handoff,owner,a.id,event,now(),now(),future()).run();
    const claimed=await queue.articleHelpQueueCall(owner,'claim_next_article_help',{request_key:acquisition});
    assert.equal(claimed.claimed,true);assert.equal(claimed.article_id,a.id);
    const row=await d1.prepare('SELECT * FROM articles WHERE owner=? AND id=?').bind(owner,a.id).first();
    const b={owner,target_kind:'article',target_id:a.id,claim_token:claimed.claim_token,input_sha256:hash(row.paragraphs),
      execution_token:uuid(),execution_id:uuid(),request_key:uuid(),execution_scope:'heavy'};
    const grant=await word.wordRecoveryCall(owner,'acquire_word_execution',bindingArgs(b));
    assert.equal(grant.acquired,true);assert.equal(grant.new_execution_grant,true);b.epoch=grant.epoch;
    return {...a,b,acquisition};
  }
  async function purge(owner){
    const p=await deletion.previewArticleContentDeletion(owner,uuid());
    const args={operation_id:p.operation_id,confirm_owner:owner,confirm_scope:'all_articles',
      confirm_ids:p.items.map(item=>item.article_id),snapshot_sha256:p.snapshot_sha256,confirm_permanent:true};
    for(let i=0;i<12;i++){
      await deletion.confirmArticleContentDeletion(owner,args);
      const read=await deletion.readArticleContentDeletion(owner,p.operation_id);
      if(read.content_deleted){assert.equal(read.state,'deleted');return {...p,read};}
      assert.equal(read.resume_required,true);
    }
    throw Error('SYNTHETIC_PURGE_CONTINUATION_BOUND');
  }
  function settlement(a,p,extra={}){
    return {article_id:a.id,operation_id:p.operation_id,request_key:uuid(),claim_token:a.b.claim_token,
      input_sha256:a.b.input_sha256,execution_id:a.b.execution_id,execution_token:a.b.execution_token,
      epoch:a.b.epoch,grant_request_key:a.b.request_key,original_acquisition_request_key:a.acquisition,
      evidence_kind:'holder_acknowledgement',confirm_all_actions_stopped:true,confirm_all_actions_settled:true,
      end_reference:'synthetic original executor stopped acknowledgement',
      settled_reference:'synthetic original issued actions settled acknowledgement',...extra};
  }
  async function localJob(owner){
    const input={request_key:uuid(),filename:'synthetic-local.txt',source_sha256:hash(BODY),
      title:'Synthetic local title',paragraphs:[BODY],subheading_indices:[],
      original_sha256:hash(JSON.stringify(['Synthetic local title',BODY]))};
    const created=await local.createLocalWordJob(owner,input);
    const claim=await local.localWordCall(owner,'claim_local_word_job',{job_id:created.job.id});
    assert.equal(claim.claimed,true);
    const row=await d1.prepare('SELECT * FROM local_word_jobs WHERE owner=? AND id=?').bind(owner,created.job.id).first();
    return {owner,target_kind:'local_word',target_id:created.job.id,claim_token:claim.claim_token,
      input_sha256:row.input_sha256,execution_token:uuid(),execution_id:uuid(),request_key:uuid(),execution_scope:'heavy'};
  }
  async function acquire(b){
    const grant=await word.wordRecoveryCall(b.owner,'acquire_word_execution',bindingArgs(b));
    if(grant.acquired)b.epoch=grant.epoch;
    return grant;
  }
  async function heartbeat(b){
    const args={target_kind:b.target_kind,target_id:b.target_id,claim_token:b.claim_token,
      input_sha256:b.input_sha256,execution_token:b.execution_token,epoch:b.epoch,request_key:uuid()};
    const result=await word.wordRecoveryCall(b.owner,'heartbeat_word_execution',args);
    assert.equal(result.recovery.status,'running');assert.equal(result.progress_advanced,false);
  }
  async function checkpoint(b){
    const bytes=png(),asset=uuid(),metadata={source_url:'https://images.example.org/synthetic-red-pixel.png',
      source_title:'Synthetic validation raster; no public research claim',after_paragraph:0};
    const scope={target_kind:b.target_kind,target_id:b.target_id,claim_token:b.claim_token,
      input_sha256:b.input_sha256,execution_token:b.execution_token,asset_id:asset};
    await word.checkpointCall(b.owner,'begin_word_checkpoint',{...scope,kind:'image',sha256:hash(bytes),size:bytes.length,chunks:1,metadata});
    await word.checkpointCall(b.owner,'put_word_checkpoint_chunk',{...scope,index:0,data_base64:bytes.toString('base64')});
    const result=await word.checkpointCall(b.owner,'finalize_word_checkpoint',scope);
    assert.equal(result.state,'ready');assert.equal(result.word_saved,false);assert.equal(result.page_inspection_proven,false);
    const cp=await d1.prepare('SELECT * FROM word_checkpoints WHERE owner=? AND target_id=? AND asset_id=?').bind(b.owner,b.target_id,asset).first();
    const part=JSON.parse(cp.parts_json)[0];assert.ok(await r2.head(part.key));
    return {scope,asset,metadata,sha256:hash(bytes)};
  }
  const mapped=await mappedArticle('synthetic-mapped-'+uuid()),mappedPurge=await purge(mapped.owner);
  const valid=settlement(mapped,mappedPurge);
  await check('actual Word acquisition maps original claim/input/token/epoch/grant/help receipt into content-free purge block',async()=>{
    const b=await blockFor(mapped.owner,mapped.id);
    assert.equal(b.holder_mode,'mapped_executor');assert.equal(b.claim_sha256,hash(mapped.b.claim_token));
    assert.equal(b.execution_sha256,hash(mapped.b.execution_id));assert.equal(b.token_sha256,hash(mapped.b.execution_token));
    assert.equal(b.input_sha256,mapped.b.input_sha256);assert.equal(b.grant_request_key,mapped.b.request_key);
    assert.equal(b.acquisition_request_key,mapped.acquisition);assert.equal(b.epoch,mapped.b.epoch);
    assert.equal(await count('articles',mapped.owner),0);assert.equal((await r2.list({prefix:`articles/${mapped.id}/`})).objects.length,0);
    assert.equal(await count('article_purge_executor_ends',mapped.owner),0);
    const before=JSON.stringify(b),read=await deletion.readArticlePurgeExecutorEnd(mapped.owner,mapped.id);
    assert.equal(read.serial_safety_block_resolved,false);assert.equal(read.settlement_possible,true);
    assert.equal(read.server_verified,false);assert.equal(read.external_stop_confirmed,false);
    assert.equal(JSON.stringify(await blockFor(mapped.owner,mapped.id)),before);
  });
  await check('wrong owner/operation/claim/execution/input/token/epoch/grant/acquisition and missing confirmations cannot append an end',async()=>{
    const variants=[{operation_id:uuid()},{claim_token:uuid()},{execution_id:uuid()},
      {input_sha256:'b'.repeat(64)},{execution_token:uuid()},{epoch:valid.epoch+1},{grant_request_key:uuid()},
      {original_acquisition_request_key:uuid()},{original_acquisition_request_key:undefined},
      {confirm_all_actions_stopped:false},{confirm_all_actions_settled:false},
      {evidence_kind:'server_verified'},{end_reference:''},{settled_reference:''},{unexpected:'not authorized'}];
    await assert.rejects(deletion.settleArticlePurgeExecutor('foreign-owner',valid));
    for(const extra of variants)await assert.rejects(deletion.settleArticlePurgeExecutor(mapped.owner,{...valid,...extra}));
    assert.equal(await count('article_purge_executor_ends',mapped.owner),0);
    assert.equal((await deletion.readArticlePurgeExecutorEnd(mapped.owner,mapped.id)).serial_safety_block_resolved,false);
  });
  const queued=await localJob(mapped.owner);
  await check('unresolved purge holder keeps a new normal local Word acquisition queued without granting execution',async()=>{
    const result=await acquire(queued);assert.equal(result.acquired,false);assert.equal(result.queued,true);
    assert.equal(result.new_execution_grant,false);
    assert.equal(await d1.prepare(`SELECT ${attempts.articlePurgeUnresolvedSql('?')} unresolved`).bind(mapped.owner).first('unresolved'),1);
    assert.equal(await count('word_serial_slots',mapped.owner),0);
    assert.equal(await count('word_execution_receipts',mapped.owner),0);
  });
  await check('exact original holder acknowledgement appends an end, same-key replay is idempotent and payload conflicts reject',async()=>{
    const result=await deletion.settleArticlePurgeExecutor(mapped.owner,valid);
    assert.equal(result.end_recorded,true);assert.equal(result.duplicate,false);
    assert.equal(result.serial_safety_block_resolved,true);assert.equal(result.server_verified,false);
    assert.equal(result.external_stop_confirmed,false);assert.equal(result.evidence_kind,'holder_acknowledgement');
    assert.equal((await deletion.settleArticlePurgeExecutor(mapped.owner,valid)).duplicate,true);
    await assert.rejects(deletion.settleArticlePurgeExecutor(mapped.owner,{...valid,end_reference:'different synthetic end proof'}));
    await assert.rejects(deletion.settleArticlePurgeExecutor(mapped.owner,{...valid,settled_reference:'different synthetic settled proof'}));
    assert.equal(await count('article_purge_executor_ends',mapped.owner),1);
    assert.equal(await d1.prepare(`SELECT ${attempts.articlePurgeUnresolvedSql('?')} unresolved`).bind(mapped.owner).first('unresolved'),0);
  });
  await check('safety blocks, source fences and appended ends remain immutable after acknowledgement',async()=>{
    const b=await blockFor(mapped.owner,mapped.id);assert.ok(b);
    assert.ok(await count('article_content_fences',mapped.owner));
    for(const table of ['article_purge_serial_blocks','article_content_fences','article_purge_executor_ends']){
      await assert.rejects(d1.prepare(`DELETE FROM ${table} WHERE owner=?`).bind(mapped.owner).run());
      await assert.rejects(d1.prepare(`UPDATE ${table} SET operation_id=? WHERE owner=?`).bind(uuid(),mapped.owner).run());
    }
    assert.equal((await deletion.readArticleContentDeletion(mapped.owner,mappedPurge.operation_id)).content_deleted,true);
    await assert.rejects(d1.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,?,?,?,?,?,?)')
      .bind(mapped.id,mapped.owner,'Replay','replay.txt',`articles/${mapped.id}/source`,'["replay"]',now(),'queued').run());
  });
  await check('same queued acquisition gains actual serial capacity after matching end and its new local heartbeat/checkpoint write work',async()=>{
    const result=await acquire(queued);assert.equal(result.acquired,true);assert.equal(result.new_execution_grant,true);
    assert.equal(result.duplicate,false);await heartbeat(queued);await checkpoint(queued);
    assert.equal((await acquire(queued)).new_execution_grant,false);
    assert.equal(await count('article_purge_serial_blocks',mapped.owner),1);
  });
  const liveLocal=await localJob('synthetic-existing-local-'+uuid());
  assert.equal((await acquire(liveLocal)).acquired,true);
  await heartbeat(liveLocal);const priorCheckpoint=await checkpoint(liveLocal);
  const unknown=await seedArticle(liveLocal.owner,{historical:true}),unknownPurge=await purge(liveLocal.owner);
  await check('unknown historical holder cannot be settled by owner assertion or new credentials; existing local grant keeps heartbeat and writes',async()=>{
    const read=await deletion.readArticlePurgeExecutorEnd(unknown.owner,unknown.id);
    assert.equal(read.holder_mode,'unknown');assert.equal(read.settlement_possible,false);
    assert.equal(read.serial_safety_block_resolved,false);
    await assert.rejects(deletion.settleArticlePurgeExecutor(unknown.owner,{...valid,article_id:unknown.id,
      operation_id:unknownPurge.operation_id,request_key:uuid(),claim_token:unknown.claim_token,
      input_sha256:unknown.input_sha256,execution_id:uuid(),execution_token:uuid(),grant_request_key:uuid(),
      original_acquisition_request_key:undefined}));
    assert.equal(await count('article_purge_executor_ends',unknown.owner),0);
    await heartbeat(liveLocal);await checkpoint(liveLocal);
    assert.equal((await word.checkpointCall(liveLocal.owner,'begin_word_checkpoint',{...priorCheckpoint.scope,
      kind:'image',sha256:priorCheckpoint.sha256,size:png().length,chunks:1,metadata:priorCheckpoint.metadata})).duplicate,true);
    assert.equal((await word.wordRecoveryView(liveLocal.owner,'local_word',liveLocal.target_id)).status,'running');
  });
  const manualLocal=await localJob('synthetic-historical-help-'+uuid());
  assert.equal((await acquire(manualLocal)).acquired,true);
  await heartbeat(manualLocal);await checkpoint(manualLocal);
  const manual=await seedArticle(manualLocal.owner,{historical:true});
  const handoff=uuid(),event=uuid(),acquisition=uuid();
  await d1.prepare("INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,'delivered',?,?,?)")
    .bind(handoff,manual.owner,manual.id,event,now(),now(),future()).run();
  // Explicit old queue history predates fresh-origin/Word-grant requirements.
  // This seeds a historical relationship, never an external stop or new grant.
  await d1.prepare('INSERT INTO article_help_queue_claims(owner,request_key,article_id,handoff_id,event_id,claim_hash,created) VALUES(?,?,?,?,?,?,?)')
    .bind(manual.owner,acquisition,manual.id,handoff,event,hash(manual.claim_token),now()).run();
  const manualPurge=await purge(manual.owner);
  const manualArgs={article_id:manual.id,operation_id:manualPurge.operation_id,request_key:uuid(),
    claim_token:manual.claim_token,input_sha256:manual.input_sha256,execution_id:uuid(),
    original_acquisition_request_key:acquisition,evidence_kind:'holder_acknowledgement',
    confirm_all_actions_stopped:true,confirm_all_actions_settled:true,
    end_reference:'synthetic historical manual holder stopped',settled_reference:'synthetic historical manual actions settled'};
  await check('historical manual queue mapping requires its exact claim/acquisition and cannot manufacture Word grant fields',async()=>{
    const b=await blockFor(manual.owner,manual.id);assert.equal(b.holder_mode,'manual_help');
    for(const field of ['execution_sha256','grant_request_key','token_sha256','epoch'])assert.equal(b[field],null);
    for(const extra of [{original_acquisition_request_key:uuid()},{claim_token:uuid()},
      {execution_token:uuid()},{epoch:1},{grant_request_key:uuid()}])
      await assert.rejects(deletion.settleArticlePurgeExecutor(manual.owner,{...manualArgs,...extra}));
    // The already issued local grant remains valid while this other historical
    // holder is blocked, without changing its execution token or epoch.
    await heartbeat(manualLocal);await checkpoint(manualLocal);
    const result=await deletion.settleArticlePurgeExecutor(manual.owner,manualArgs);
    assert.equal(result.serial_safety_block_resolved,true);assert.equal(result.server_verified,false);
    assert.equal(result.external_stop_confirmed,false);
    const end=await d1.prepare('SELECT * FROM article_purge_executor_ends WHERE owner=?').bind(manual.owner).first();
    assert.equal(end.execution_sha256,null);assert.equal(end.observed_execution_sha256,hash(manualArgs.execution_id));
    assert.equal(end.server_verified,0);
  });
  await check('existing local execution keeps its same grant/token/epoch and real checkpoint writes before and after a valid holder end',async()=>{
    const control=await d1.prepare("SELECT token_hash,epoch,execution_id FROM word_recovery WHERE owner=? AND target_kind='local_word' AND target_id=?")
      .bind(manualLocal.owner,manualLocal.target_id).first();
    assert.equal(control.token_hash,hash(manualLocal.execution_token));assert.equal(control.epoch,manualLocal.epoch);
    assert.equal(control.execution_id,manualLocal.execution_id);
    await heartbeat(manualLocal);await checkpoint(manualLocal);
    assert.equal(await d1.prepare(`SELECT ${attempts.articlePurgeUnresolvedSql('?')} unresolved`).bind(manual.owner).first('unresolved'),0);
    assert.equal((await word.wordRecoveryView(manualLocal.owner,'local_word',manualLocal.target_id)).status,'running');
  });
  await check('actual D1 rejects mismatched end bindings and server-verified fabrication independently of helper validation',async()=>{
    const end=await d1.prepare('SELECT * FROM article_purge_executor_ends WHERE owner=?').bind(mapped.owner).first();
    for(const extra of [{claim_sha256:'c'.repeat(64)},{operation_id:uuid()},{epoch:end.epoch+1},
      {observed_execution_sha256:'d'.repeat(64)},{server_verified:1},{all_actions_settled:0}]){
      const row={...end,request_key:uuid(),...extra},keys=Object.keys(row);
      await assert.rejects(d1.prepare(`INSERT INTO article_purge_executor_ends(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...keys.map(key=>row[key])).run());
    }
    assert.equal(await count('article_purge_executor_ends',mapped.owner),1);
  });
  await check('content-free metadata never stores original body or volatile credentials and never claims platform/process stop verification',async()=>{
    for(const a of [mapped,unknown,manual]){
      const safety=[];for(const table of ['article_content_fences','article_purge_serial_blocks','article_purge_executor_ends'])
        safety.push((await d1.prepare(`SELECT * FROM ${table} WHERE owner=?`).bind(a.owner).all()).results);
      const raw=JSON.stringify(safety);assert.equal(raw.includes(BODY),false);
      for(const token of [a.claim_token,a.b?.claim_token,a.b?.execution_token,a.b?.execution_id].filter(Boolean))assert.equal(raw.includes(token),false);
      const read=await deletion.readArticlePurgeExecutorEnd(a.owner,a.id);
      assert.equal(read.server_verified,false);assert.equal(read.external_stop_confirmed,false);
      for(const key of ['claim_sha256','token_sha256','execution_sha256','claim_token','execution_token'])assert.equal(Object.hasOwn(read,key),false);
      assert.equal(await count('article_upload_executor_ends',a.owner),0);
    }
    assert.equal(remoteCalls,0);
  });
  console.log(JSON.stringify({result:'PASS',checks:checks.length,migrations:'0000–0049',runtime:'actual workerd D1/R2',
    remote_calls:remoteCalls,source_data:'synthetic only',external_processes_observed:false,
    attestation:'holder acknowledgement only; server_verified=false; no platform-stop proof'},null,2));
} finally {await mf.dispose();}
