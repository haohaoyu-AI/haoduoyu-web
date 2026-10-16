// Production-independent regression: actual local workerd D1 and R2, the full
// migration journal, and production deletion functions. All text is synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash,webcrypto} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {testOutline} from './fixtures/writing-outline.mjs';

const root=path.resolve(import.meta.dirname,'..');
const BASELINE='f82d2e8c645669e11e9a2dbd97f5db7080aabd89';
const startedAt=new Date().toISOString();
function sourceFiles(directory){
  return fs.readdirSync(path.join(root,directory),{withFileTypes:true}).flatMap(entry=>{
    const name=path.posix.join(directory,entry.name);
    return entry.isDirectory()?sourceFiles(name):/\.(?:ts|sql|json)$/.test(name)?[name]:[];
  });
}
const sourcePaths=['tests/article-content-deletion.mjs','db/schema.ts',...sourceFiles('lib'),...sourceFiles('drizzle')].sort();
const fingerprintSources=()=>Object.fromEntries(sourcePaths.map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
const sourceFingerprints=fingerprintSources();
const loadedSources={};
const compatibilitySources={};
const nativeRequire=createRequire(import.meta.url);
const uuid=()=>webcrypto.randomUUID();
const now=()=>new Date().toISOString();
const future=()=>new Date(Date.now()+3_600_000).toISOString();
const hash=async value=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
const BODY='SYNTHETIC_PURGE_BODY_20261010';
const sha='a'.repeat(64),sha2='b'.repeat(64);
const results=[];
const budgets=[];
const metrics={d1_calls:0,d1_statements:0,r2_list:0,r2_head:0,r2_get:0,r2_put:0,r2_delete:0};
const remoteCalls={count:0};
let beforeBatch=null,afterBatch=null,beforePut=null,afterPut=null,beforeDelete=null;
let failDeleteAt=0,deleteCalls=0,failPutAfterAcceptance=false;
const mf=new Miniflare({cf:false,modules:true,
  script:'export default {fetch(){return new Response("ISOLATED ARTICLE PURGE FIXTURE");}}',
  compatibilityDate:'2026-05-22',d1Databases:{DB:'article-content-purge-isolated'},
  r2Buckets:{BUCKET:'article-content-purge-isolated-files'}});

try {
  const d1=await mf.getD1Database('DB'),r2=await mf.getR2Bucket('BUCKET');
  const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
  assert.ok(journal.entries.some(row=>row.idx===48),'0048 must be in the real migration journal');
  await migrate(drizzle(d1),{migrationsFolder:path.join(root,'drizzle')});
  function countedStatement(native){
    return {_native:native,bind:(...args)=>countedStatement(native.bind(...args)),
      async first(...args){metrics.d1_calls++;metrics.d1_statements++;return native.first(...args);},
      async all(...args){metrics.d1_calls++;metrics.d1_statements++;return native.all(...args);},
      async run(...args){metrics.d1_calls++;metrics.d1_statements++;return native.run(...args);},
      async raw(...args){metrics.d1_calls++;metrics.d1_statements++;return native.raw(...args);}
    };
  }
  const db={prepare:source=>countedStatement(d1.prepare(source)),async batch(statements){
    if(beforeBatch){const hook=beforeBatch;beforeBatch=null;await hook(statements);}
    metrics.d1_calls++;metrics.d1_statements+=statements.length;
    const value=await d1.batch(statements.map(row=>row._native||row));
    if(afterBatch){const hook=afterBatch;afterBatch=null;await hook(statements,value);}
    return value;
  }};
  const bucket={
    list:args=>{metrics.r2_list++;return r2.list(args);},
    head:key=>{metrics.r2_head++;return r2.head(key);},
    get:(key,args)=>{metrics.r2_get++;return r2.get(key,args);},
    async put(key,bytes,options){
      metrics.r2_put++;
      if(beforePut){const hook=beforePut;beforePut=null;await hook(key);}
      const value=await r2.put(key,bytes,options);
      if(afterPut){const hook=afterPut;afterPut=null;await hook(key);}
      if(failPutAfterAcceptance)throw Error('SYNTHETIC_R2_PUT_RESPONSE_UNKNOWN');
      return value;
    },
    async delete(key){deleteCalls++;metrics.r2_delete++;
      if(beforeDelete){const hook=beforeDelete;beforeDelete=null;await hook(key);}
      if(failDeleteAt===deleteCalls)throw Error('SYNTHETIC_R2_DELETE_FAILURE');
      return r2.delete(key);
    }
  };
  function loader({realArticles=false,overrides={}}={}) {
    const modules=new Map();
    function load(file){
      file=path.normalize(file.endsWith('.ts')?file:file+'.ts');
      if(!file.startsWith(path.join(root,'lib')+path.sep))throw Error('FIXTURE_MODULE_OUTSIDE_LIB');
      if(modules.has(file))return modules.get(file);
      const exports={};modules.set(file,exports);
      const sourceName=path.relative(root,file),source=overrides[sourceName]??fs.readFileSync(file,'utf8');
      const sourceHash=createHash('sha256').update(source).digest('hex');
      if(Object.hasOwn(overrides,sourceName))compatibilitySources[BASELINE+':'+sourceName]=sourceHash;
      else {assert.equal(sourceHash,sourceFingerprints[sourceName],'a module changed after the frozen regression started: '+sourceName);loadedSources[sourceName]=sourceHash;}
      const code=ts.transpileModule(source,{compilerOptions:{
        module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
      vm.runInNewContext(code,{exports,module:{exports},
        require:dependency=>{
          if(dependency==='cloudflare:workers')return {env:{DB:db,BUCKET:bucket,CLAUDE_CONFIG_KEY:btoa('01234567890123456789012345678901')}};
          if(dependency==='./test-store')return {db:()=>db};
          if(dependency==='./articles'&&!realArticles)return {bucket:()=>bucket};
          if(dependency.startsWith('./'))return load(path.resolve(path.dirname(file),dependency));
          return nativeRequire(dependency);
        },crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Buffer,
        Date,Error,Set,Map,JSON,URL,File,Blob,ReadableStream,structuredClone,atob,btoa,
        Request,Response,AbortSignal,Intl,setTimeout,clearTimeout,setInterval,clearInterval,
        fetch(){remoteCalls.count++;throw Error('REMOTE_CALL_FORBIDDEN');}
      },{filename:file});
      return exports;
    }
    return name=>load(path.join(root,'lib',name));
  }
  const load=loader();
  const previewArticleContentDeletion=(...args)=>load('article-content-deletion').previewArticleContentDeletion(...args);
  const readArticleContentDeletion=(...args)=>load('article-content-deletion').readArticleContentDeletion(...args);
  const confirmArticleContentDeletion=(...args)=>load('article-content-deletion').confirmArticleContentDeletion(...args);
  const confirmArgs=p=>({operation_id:p.operation_id,confirm_owner:p.owner,
    confirm_scope:'all_articles',confirm_ids:p.items.map(row=>row.article_id),
    snapshot_sha256:p.snapshot_sha256,confirm_permanent:true});
  function loadBaselineDeletion(){
    const original=spawnSync('git',['show',BASELINE+':lib/article-content-deletion.ts'],{cwd:root,encoding:'utf8'});
    assert.equal(original.status,0,'the exact formal V139 baseline source must be available');
    return loader({overrides:{'lib/article-content-deletion.ts':original.stdout}})('article-content-deletion');
  }
  const read=async(owner,op)=>readArticleContentDeletion(owner,op);
  async function measured(phase,run){
    const before={...metrics},value=await run(),counts={};
    for(const key of Object.keys(metrics))counts[key]=metrics[key]-before[key];
    budgets.push({phase,...counts});return value;
  }
  async function complete(owner,p,onPass=async()=>{}){
    // A bounded invocation may delete at most eight articles. Read before every
    // continuation and keep the same original owner/scope/ID/hash confirmation.
    for(let i=0;i<32;i++){
      const result=await measured('bounded-confirm-'+i,()=>confirmArticleContentDeletion(owner,confirmArgs(p)));
      await onPass(result);
      if(result.content_deleted)return result;
      const observed=await read(owner,p.operation_id);
      assert.equal(observed.state,'deleting');assert.equal(observed.content_deleted,false);
      assert.equal(observed.resume_required,true);
    }
    throw Error('SYNTHETIC_SAME_OPERATION_DID_NOT_FINISH_WITHIN_BOUND');
  }
  const row=async(table,owner,id)=>d1.prepare(`SELECT * FROM ${table} WHERE owner=? AND id=?`).bind(owner,id).first();
  const count=async(table,where='1',values=[])=>Number((await d1.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).bind(...values).first()).n);
  const tableCache=new Map();
  async function columns(table){
    if(!tableCache.has(table))tableCache.set(table,{
      cols:(await d1.prepare(`PRAGMA table_info(${table})`).all()).results,
      sql:(await d1.prepare('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=?').bind(table).first()).sql
    });
    return tableCache.get(table);
  }
  // Introspection supplies innocuous defaults; relationship and content values
  // are explicit below. CHECK constraints are enforced by actual workerd SQLite.
  async function fixtureInsert(table,overrides={}){
    const {cols,sql}=await columns(table),values={};
    for(const col of cols){
      if(Object.hasOwn(overrides,col.name)){values[col.name]=overrides[col.name];continue;}
      if(!col.notnull&&!col.pk)continue;
      if(col.dflt_value!==null&&!col.pk)continue;
      if(/INT|REAL|NUM|BOOL/i.test(col.type)){values[col.name]=/active_elapsed_ms|round|sequence|chunks|attempts|retry_count/.test(col.name)?0:1;continue;}
      const choices=sql.match(new RegExp('(?:["`]?\\w+["`]?\\.)?["`]?'+col.name+'["`]?\\s+IN\\s*\\(([^)]+)\\)','i'));
      if(choices){const first=choices[1].match(/'([^']*)'/);if(first){values[col.name]=first[1];continue;}}
      const equality=sql.match(new RegExp('(?:["`]?\\w+["`]?\\.)?["`]?'+col.name+'["`]?\\s*=\\s*\'([^\']*)\'','i'));
      if(equality){values[col.name]=equality[1];continue;}
      if(/sha256|hash|fingerprint/.test(col.name)){values[col.name]=sha;continue;}
      if(/created|updated|expires|observed_at|held_at|seen|day|_at$/.test(col.name)){values[col.name]=/expires/.test(col.name)?future():now();continue;}
      if(/json$|snapshot$|preflight$|baseline$|editor_urls$|response$/.test(col.name)){values[col.name]=JSON.stringify({synthetic:BODY});continue;}
      values[col.name]=/id$|key$|token$/.test(col.name)?uuid():'synthetic';
    }
    Object.assign(values,overrides);
    const keys=Object.keys(values);
    await d1.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...keys.map(key=>values[key])).run();
    return values;
  }
  async function seedArticle(owner,{id=uuid(),state='completed',output=true,active=false}={}){
    const source=`articles/${id}/source`,result=`articles/${id}/result-${sha}.docx`,asset=uuid(),outputId=uuid();
    const files=[source,`articles/${id}/editorial-v3-${sha}.txt`,
      `articles/${id}/checkpoints/${asset}/0-${sha}`,`articles/${id}/output/${outputId}/0-${sha}`];
    if(output)files.push(result);
    await fixtureInsert('articles',{id,owner,title:'Synthetic article',filename:'synthetic.docx',source_key:source,
      paragraphs:JSON.stringify(['Synthetic article',BODY]),state,
      result_key:output?result:null,result_meta:output?JSON.stringify({synthetic:BODY}):null,
      claim_token:active?uuid():null,claim_expires:active?future():null});
    for(const key of files)await r2.put(key,new TextEncoder().encode(BODY+key.split('/').at(-1)));
    return {id,owner,source,result:output?result:null,asset,files};
  }
  async function seedDedao(owner,{boundCount=4,unbound=true,running=false}={}){
    const batchId=uuid(),claimToken=uuid(),total=boundCount+(unbound?1:0),pairs=[];
    await fixtureInsert('dedao_batches',{id:batchId,owner,total,state:running?'running':'completed',current_ordinal:Math.max(1,total),executor_id:'synthetic-dedao-executor',execution_id:'synthetic-dedao-execution',claim_hash:running?await hash(claimToken):null,lease_until:running?future():null,executor_ended:running?0:1});
    for(let ordinal=1;ordinal<=total;ordinal++){
      const article=ordinal<=boundCount?await seedArticle(owner):null,id=uuid(),bytes=new TextEncoder().encode(BODY+' Dedao pair '+ordinal),digest=await hash(new TextDecoder().decode(bytes));
      const download={filename:'synthetic.docx',path:'/SYNTHETIC_DOWNLOADS/synthetic.docx',sha256:digest,size:bytes.length,title:BODY+' title '+ordinal,final_version_ref:'synthetic-final-'+ordinal,browser_session:'synthetic-browser',executor_id:'synthetic-dedao-executor'};
      const item=await fixtureInsert('dedao_items',{batch_id:batchId,owner,ordinal,id,title:download.title,stage:article?11:9,version:1,final_ref:download.final_version_ref,download_json:JSON.stringify(download),article_id:article?.id||uuid(),upload_state:article?'uploaded':null,submitted_handoff_id:article?uuid():null,submitted:article?now():null});
      const action=await fixtureInsert('dedao_actions',{batch_id:batchId,ordinal,action:'download',action_id:uuid(),state:'confirmed',observation_json:JSON.stringify(download)});
      const chunkKey=`dedao/${batchId}/${ordinal}/chunk-0-${digest}`;
      await fixtureInsert('dedao_chunks',{batch_id:batchId,ordinal,offset:0,size:bytes.length,sha256:digest,object_key:chunkKey});
      await r2.put(chunkKey,bytes);
      pairs.push({batch_id:batchId,ordinal,item,action,article,key:chunkKey,bytes,digest});
    }
    return {owner,batch_id:batchId,claim_token:claimToken,execution_id:'synthetic-dedao-execution',pairs,bound:pairs.filter(p=>p.article),unbound:pairs.find(p=>!p.article)||null};
  }
  const dedaoPairRows=async pair=>({
    item:await d1.prepare('SELECT * FROM dedao_items WHERE batch_id=? AND ordinal=?').bind(pair.batch_id,pair.ordinal).first(),
    actions:(await d1.prepare('SELECT * FROM dedao_actions WHERE batch_id=? AND ordinal=? ORDER BY action').bind(pair.batch_id,pair.ordinal).all()).results,
    chunks:(await d1.prepare('SELECT * FROM dedao_chunks WHERE batch_id=? AND ordinal=? ORDER BY offset').bind(pair.batch_id,pair.ordinal).all()).results
  });
  async function assertDedaoGone(fixture){
    for(const pair of fixture.bound){
      const rows=await dedaoPairRows(pair);assert.equal(rows.item,null);assert.equal(rows.actions.length,0);assert.equal(rows.chunks.length,0);
      assert.equal((await r2.list({prefix:`dedao/${pair.batch_id}/${pair.ordinal}/`})).objects.length,0);
    }
  }
  async function seedGraph(article){
    const {owner,id}=article,ids={};
    ids.upload=uuid();ids.uploadEnd=ids.upload;
    await fixtureInsert('article_upload_attempts',{id:ids.upload,owner,article_id:id,
      platform:'zhihu',target_account:'synthetic-owner-account',word_sha256:sha,word_size:31,
      authorization_kind:'owner_confirmed_import',claim_hash:sha,state:'verified',
      baseline:JSON.stringify({body:BODY}),preflight:JSON.stringify({body:BODY}),
      editor_urls:'[]',readback:JSON.stringify({body:BODY}),consumed_at:now()});
    await fixtureInsert('article_upload_executor_ends',{attempt_id:ids.upload,owner,article_id:id,
      platform:'zhihu',attempt_sha256:sha,attempt_snapshot:JSON.stringify({body:BODY}),
      claim_sha256:sha,execution_end_reference:'synthetic-explicit-receipt',created:now()});
    ids.diagnostic=uuid();await fixtureInsert('article_upload_diagnostics',{id:ids.diagnostic,owner,article_id:id,
      platform:'zhihu',executor_id:uuid(),attempt_id:ids.upload,stage:'draft_readback',outcome:'returned',cause:'none'});
    for(const table of ['article_deliveries','article_handoffs','article_output_restarts','article_help_queue_claims',
      'article_word_claim_recoveries','article_word_executor_ends']){
      const base={owner,article_id:id};
      if(table==='article_deliveries')Object.assign(base,{id:uuid(),platform:'zhihu',state:'saved',draft_url:'https://example.test/retained-external-draft',readback:JSON.stringify({body:BODY})});
      if(table==='article_handoffs')Object.assign(base,{id:uuid(),state:'delivered'});
      if(table==='article_help_queue_claims')Object.assign(base,{request_key:uuid(),handoff_id:uuid(),event_id:uuid(),claim_hash:sha});
      if(table==='article_word_claim_recoveries')Object.assign(base,{request_key:uuid(),old_claim_hash:sha,next_claim_hash:sha2,termination_json:JSON.stringify({body:BODY})});
      if(table==='article_word_executor_ends')Object.assign(base,{request_key:uuid(),proof_json:JSON.stringify({body:BODY})});
      const item=await fixtureInsert(table,base);ids[table]=item.id||item.request_key;
    }
    ids.writing=uuid();ids.claude=`manual:${owner}:${uuid()}:claude`;
    const manualRunId=ids.claude.split(':').slice(-2,-1)[0];
    await fixtureInsert('writing_runs',{id:ids.writing,owner,article_id:id,writer:'claude',
      run_kind:`manual:${manualRunId}`,state:'submitted',topic:BODY,sources:JSON.stringify([BODY]),input_snapshot:JSON.stringify({body:BODY})});
    await fixtureInsert('claude_attempts',{id:ids.claude,owner,state:'received',response:JSON.stringify({article_id:id,body:BODY})});
    ids.manual=uuid();await fixtureInsert('manual_writing_batches',{id:ids.manual,owner,
      snapshot:JSON.stringify({daily_source:{article_id:id},body:BODY})});
    await fixtureInsert('daily_editorial_drafts',{owner,article_id:id,revision_flow_id:ids.manual,provider_attempt_id:ids.claude});
    ids.outline=uuid();await fixtureInsert('outline_flows',{id:ids.outline,owner,article_id:id,state:'final_saved',
      snapshot:JSON.stringify({body:BODY}),outline_json:JSON.stringify({body:BODY}),writing_input:JSON.stringify({body:BODY})});
    ids.outlineStage=uuid();await fixtureInsert('outline_flow_stages',{id:ids.outlineStage,owner,run_id:ids.outline,state:'returned',input_json:JSON.stringify({body:BODY})});
    ids.editorial=uuid();await fixtureInsert('editorial_flows',{id:ids.editorial,owner,article_id:id,state:'text_saved',snapshot:JSON.stringify({body:BODY})});
    ids.editorialStage=uuid();await fixtureInsert('editorial_stages',{id:ids.editorialStage,owner,run_id:ids.editorial,state:'returned',input_json:JSON.stringify({body:BODY}),artifact_json:JSON.stringify({body:BODY}),receipt_id:ids.claude});
    // Old migrations deliberately constrain these two historical recovery
    // identifiers. They are only created in this local fixture database.
    ids.v3='bd6d4434-273b-426e-a17f-9390fc124c84';await fixtureInsert('editorial_runs_v3',{id:ids.v3,owner,article_id:id,writer:'claude',run_kind:'manual',state:'text_saved',input_json:JSON.stringify({body:BODY}),snapshot_json:JSON.stringify({body:BODY})});
    ids.v3stage='496c9348-7de3-4322-8462-55892b8162b0';await fixtureInsert('editorial_stages_v3',{id:ids.v3stage,owner,run_id:ids.v3,state:'returned',stage:'body',input_json:JSON.stringify({body:BODY}),artifact_json:JSON.stringify({body:BODY}),receipt_id:ids.claude});
    for(const table of ['editorial_body_continuations_v3','editorial_cloud_delegations_v3',
      'editorial_revision_cloud_delegations_v3','editorial_revision_continuations_v3',
      'editorial_failed_writer_continuations_v3','editorial_failed_writer_cloud_delegations_v3',
      'editorial_agent_claim_recoveries_v3','editorial_daily_cloud_delegations_v3']){
      const base={owner,run_id:ids.v3};
      if((await columns(table)).cols.some(col=>col.name==='article_id'))base.article_id=id;
      const item=await fixtureInsert(table,base);ids[table]=item.id||item.request_key;
    }
    ids.request=uuid();await fixtureInsert('editorial_requests',{id:ids.request,owner,flow_id:ids.editorial,state:'completed',input_json:JSON.stringify({body:BODY}),progress_json:JSON.stringify({body:BODY})});
    await fixtureInsert('editorial_request_outbox',{request_id:ids.request,owner,state:'delivered'});
    await fixtureInsert('workflow_controls',{owner,scope:'editorial_v3',run_id:ids.v3});
    const wordBase={owner,target_kind:'article',target_id:id};
    for(const table of ['word_progress_events','word_checkpoints','word_execution_receipts','word_image_candidates',
      'word_recovery','word_execution_queue','word_execution_requests','word_attempt_requests','word_attempts','word_claim_origins']){
      const base={...wordBase};
      if(table==='word_progress_events')Object.assign(base,{snapshot_json:JSON.stringify({body:BODY}),event_id:uuid(),version:1});
      if(table==='word_checkpoints')Object.assign(base,{asset_id:article.asset,kind:'image',size:31,chunks:1,state:'ready',metadata_json:JSON.stringify({body:BODY}),parts_json:'[]'});
      if(table==='word_image_candidates')Object.assign(base,{candidate_id:uuid(),source_url:'https://example.org/synthetic-image',source_title:BODY,outcome:'ready',reason:'synthetic'});
      if(table==='word_recovery')Object.assign(base,{desired:'cancelled',status:'blocked',reason:'synthetic',version:1,epoch:1,retry_count:0});
      if(table==='word_execution_queue'||table==='word_execution_requests')Object.assign(base,{request_key:uuid(),capacity_reason:'total_capacity'});
      if(table==='word_attempt_requests')Object.assign(base,{request_key:uuid(),receipt_json:JSON.stringify({body:BODY})});
      if(table==='word_attempts')Object.assign(base,{attempt_id:uuid(),generation:1,state:'ended',reason:'synthetic',initial_manifest_json:JSON.stringify({body:BODY})});
      if(table==='word_claim_origins')Object.assign(base,{origin:'fresh_claim'});
      const item=await fixtureInsert(table,base);ids[table]=item;
    }
    return ids;
  }
  async function realStepwiseFixture(owner){
    const realLoad=loader({realArticles:true}),stepwise=realLoad('stepwise-text'),revision=realLoad('text-revision'),rules=realLoad('writing-supplement');
    const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode('01234567890123456789012345678901'),{name:'AES-GCM'},false,['encrypt']);
    const iv=webcrypto.getRandomValues(new Uint8Array(12)),data=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},key,new TextEncoder().encode('SYNTHETIC_NOT_A_PROVIDER_CREDENTIAL'));
    const model='claude-opus-5-5';
    await fixtureInsert('claude_settings',{owner,model,secret:JSON.stringify({iv:Buffer.from(iv).toString('base64'),data:Buffer.from(data).toString('base64')}),enabled:'1'});
    const topic={topic:'离线合成选题',materials:'这只是供正常产品契约验证使用的离线合成材料，不代表任何真实新闻。'.repeat(10),outline:testOutline,
      sources:[{title:'合成来源一',url:'https://example.com/one',published:'2026-10-05'},{title:'合成来源二',url:'https://example.com/two',published:'2026-10-05'}]};
    const batch=await stepwise.createStepwiseTextTest(owner,{confirm:true,expected_model:model,expected_prompt_version:rules.effectiveWritingStyleVersion,xiaoyu:topic,claude:{...topic,topic:'应保持原样的独立另作者计划'}});
    const claim=await stepwise.claimStepwiseTextWriter(owner,{run_id:batch.run_id,writer:'xiaoyu',confirm:true});
    const article={title:'合成原文',paragraphs:Array.from({length:25},(_,i)=>String(i).padStart(2,'0')+'合'.repeat(98))};article.paragraphs[0]+=BODY;
    await stepwise.saveStepwiseXiaoyuText(owner,{run_id:batch.run_id,item_id:claim.item_id,token:claim.token,...article,confirm:true});
    const a=await seedArticle(owner,{id:claim.item_id});
    await d1.prepare('UPDATE articles SET paragraphs=? WHERE owner=? AND id=?').bind(JSON.stringify([article.title,...article.paragraphs]),owner,a.id).run();
    const participants=Object.fromEntries(['review','rewrite','verify'].map(stage=>[stage,{actor_id:uuid(),model:'synthetic-'+stage}]));
    const create={run_id:batch.run_id,writer:'xiaoyu',writer_actor_id:uuid(),writer_execution_id:uuid(),participants,expected_provider_model:model,expected_prompt_version:rules.effectiveWritingStyleVersion,confirm:true};
    return {a,batch,claim,create,stepwise,revision};
  }
  async function syntheticContentRows(owner){
    const tables=(await d1.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND substr(name,1,3)<>'_cf' AND substr(name,1,9)<>'__drizzle'").all()).results;
    const found=[];
    for(const {name} of tables){
      const {cols}=await columns(name);
      if(!cols.some(c=>c.name==='owner'))continue;
      const texts=cols.filter(c=>/TEXT/i.test(c.type)).map(c=>`instr(COALESCE(${c.name},''),?)>0`);
      if(!texts.length)continue;
      const targetFilter=cols.some(c=>c.name==='target_kind')?" AND target_kind<>'local_word'":'';
      const n=await count(name,`owner=?${targetFilter} AND (${texts.join(' OR ')})`,[owner,...texts.map(()=>BODY)]);
      if(n)found.push({table:name,count:n});
    }
    return found;
  }
  async function scenario(name,run){
    if(process.env.PURGE_TEST_CASE&&!new RegExp(process.env.PURGE_TEST_CASE).test(name))return;
    const started=Date.now();
    try {await run();} catch(error){
      if(process.env.PURGE_TEST_REPORT){fs.mkdirSync(path.dirname(process.env.PURGE_TEST_REPORT),{recursive:true});fs.writeFileSync(process.env.PURGE_TEST_REPORT,JSON.stringify({status:'failed',failed_case:name,migration:48,backend:'actual Miniflare workerd D1/R2',remote_calls:remoteCalls.count,cases:results,budgets},null,2)+'\n');}
      throw error;
    }
    results.push({name,status:'passed',duration_ms:Date.now()-started});
    console.log(`PASS ${name}`);
  }

  // Cases are below; fixtures are always generated locally, never copied from
  // real manuscripts. No production environment variables are used by this file.

  await scenario('47 realistic-length articles and 4.7MB provider histories keep exact D1 CAS within cell limits',async()=>{
    const owner='SYNTHETIC_LARGE_HISTORY',payload='x'.repeat(100_000);
    let bodyBytes=0;
    for(let i=0;i<47;i++){
      const a=await seedArticle(owner),paragraphs=Array.from({length:25},(_,p)=>String(p).padStart(2,'0')+'合'.repeat(98));
      paragraphs[0]+=BODY;
      await d1.prepare('UPDATE articles SET paragraphs=? WHERE owner=? AND id=?').bind(JSON.stringify(['Synthetic article',...paragraphs]),owner,a.id).run();
      const manualId=uuid(),response=JSON.stringify({article_id:a.id,body:BODY,synthetic_history:payload});
      bodyBytes+=Buffer.byteLength(response);
      await fixtureInsert('writing_runs',{id:uuid(),owner,article_id:a.id,writer:'claude',run_kind:`manual:${manualId}`,state:'submitted',input_snapshot:JSON.stringify({paragraphs,body:BODY})});
      await fixtureInsert('claude_attempts',{id:`manual:${owner}:${manualId}:claude`,owner,state:'received',response});
    }
    assert.ok(bodyBytes>4_700_000);
    const p=await measured('4.7MB.preview',()=>previewArticleContentDeletion(owner,uuid()));
    assert.equal(p.article_count,47);
    const first=await measured('4.7MB.first-confirm',()=>confirmArticleContentDeletion(owner,confirmArgs(p)));
    assert.equal(first.content_deleted,false);assert.equal(first.current_owner_article_count,39);
    const final=await complete(owner,p);
    assert.equal(final.content_deleted,true);assert.equal(final.remaining_content_rows,0);
    assert.deepEqual(await syntheticContentRows(owner),[]);
    const op=await d1.prepare('SELECT snapshot_json FROM article_list_deletions WHERE owner=? AND id=?').bind(owner,p.operation_id).first();
    assert.equal(op.snapshot_json.includes(payload),false);assert.equal(op.snapshot_json.includes(BODY),false);
  });

  await scenario('full-owner 47 articles / 38 Word outputs and exact linked body graph',async()=>{
    const owner='SYNTHETIC_FULL_OWNER',articles=[];
    for(let i=0;i<47;i++)articles.push(await seedArticle(owner,{state:i<8?'processing':i===46?'failed':'completed',output:i>=8&&i<46,active:i<8}));
    const ids=await seedGraph(articles[8]);
    const other=await seedArticle('SYNTHETIC_OTHER_OWNER');
    const localId=`localword_${uuid()}`;
    await fixtureInsert('local_word_jobs',{id:localId,owner,source_kind:'local_desktop',output_mode:'word_only',destinations_json:'[]',state:'processing',dispatch_state:'accepted',claim_hash:sha,claim_expires:future(),input_json:JSON.stringify({independent:BODY})});
    await r2.put(`local-word-jobs/${localId}/source`,BODY);
    await r2.put(`local-word-jobs/${localId}/result-${sha}.docx`,BODY+' independent local Word');
    const localBase={owner,target_kind:'local_word',target_id:localId};
    await fixtureInsert('word_recovery',{...localBase,desired:'run',status:'running',reason:'none',version:1,epoch:1,retry_count:0,token_hash:sha,lease_until:future()});
    await fixtureInsert('word_serial_slots',{...localBase,state:'held',epoch:1,version:1});
    const localAsset=uuid();await fixtureInsert('word_checkpoints',{...localBase,asset_id:localAsset,kind:'image',size:31,chunks:1,state:'ready',metadata_json:JSON.stringify({body:BODY}),parts_json:'[]'});
    const localRowsBefore={
      recovery:await d1.prepare("SELECT * FROM word_recovery WHERE owner=? AND target_kind='local_word' AND target_id=?").bind(owner,localId).first(),
      slot:await d1.prepare("SELECT * FROM word_serial_slots WHERE owner=? AND target_kind='local_word' AND target_id=?").bind(owner,localId).first(),
      checkpoint:await d1.prepare("SELECT * FROM word_checkpoints WHERE owner=? AND target_kind='local_word' AND target_id=?").bind(owner,localId).first()
    };
    const independentWriting=await fixtureInsert('writing_runs',{owner,article_id:uuid(),writer:'xiaoyu',run_kind:'independent-plan',state:'queued',topic:BODY+' independent plan',sources:JSON.stringify([BODY]),input_snapshot:JSON.stringify({body:BODY})});
    const independentWritingBefore=await row('writing_runs',owner,independentWriting.id);
    const subscription=await fixtureInsert('event_subscriptions',{owner,callback:'https://example.test/subscription',active:'1'});
    await fixtureInsert('claude_settings',{owner,model:'synthetic-model',secret:'SYNTHETIC_NOT_A_CREDENTIAL',enabled:'1'});
    const independentPlan=await fixtureInsert('topic_research_runs',{owner});
    const localBefore=await row('local_word_jobs',owner,localId),subBefore=await row('event_subscriptions',owner,subscription.id);
    const planBefore=await row('topic_research_runs',owner,independentPlan.id),accountBefore=await d1.prepare('SELECT * FROM claude_settings WHERE owner=?').bind(owner).first();
    await assert.rejects(d1.prepare('DELETE FROM article_upload_attempts WHERE owner=? AND id=?').bind(owner,ids.upload).run(),/history|immutable/i);
    await assert.rejects(d1.prepare('DELETE FROM article_upload_executor_ends WHERE owner=? AND attempt_id=?').bind(owner,ids.upload).run(),/immutable/i);
    await assert.rejects(d1.prepare('DELETE FROM article_upload_diagnostics WHERE owner=? AND id=?').bind(owner,ids.diagnostic).run(),/immutable/i);
    await assert.rejects(d1.prepare("UPDATE article_upload_attempts SET state='cancelled' WHERE owner=? AND id=?").bind(owner,ids.upload).run(),/immutable/i);
    await assert.rejects(d1.prepare('UPDATE article_upload_executor_ends SET execution_end_reference=? WHERE owner=? AND attempt_id=?').bind('synthetic-replacement',owner,ids.upload).run(),/immutable/i);
    await assert.rejects(d1.prepare('UPDATE article_upload_diagnostics SET executor_id=? WHERE owner=? AND id=?').bind(uuid(),owner,ids.diagnostic).run(),/immutable/i);
    await assert.rejects(d1.prepare("UPDATE word_progress_events SET snapshot_json='{}' WHERE owner=? AND target_kind='article'").bind(owner).run(),/append_only|immutable/i);
    for(const table of ['writing_runs','outline_flows','editorial_flows','editorial_runs_v3']){
      const id=ids[{writing_runs:'writing',outline_flows:'outline',editorial_flows:'editorial',editorial_runs_v3:'v3'}[table]];
      await d1.prepare(`UPDATE ${table} SET updated=? WHERE owner=? AND id=?`).bind(now(),owner,id).run();
    }
    await d1.prepare('UPDATE daily_editorial_drafts SET verified_at=? WHERE owner=? AND article_id=?').bind(now(),owner,articles[8].id).run();
    const p=await measured('full47.preview',()=>previewArticleContentDeletion(owner,uuid()));
    assert.equal(p.scope,'all_articles');assert.equal(p.count,47);assert.equal(p.items.length,47);
    assert.equal(p.file_count,47*4+38);assert.equal(p.content_deleted,false);
    const first=await measured('full47.first-confirm',()=>confirmArticleContentDeletion(owner,confirmArgs(p)));
    assert.equal(first.content_deleted,false);assert.equal(first.resume_required,true);
    assert.equal(first.current_owner_article_count,39,'one bounded call cannot claim 47 articles finished');
    async function assertLocalPreserved(){
      assert.deepEqual(await d1.prepare("SELECT * FROM word_recovery WHERE owner=? AND target_kind='local_word' AND target_id=?").bind(owner,localId).first(),localRowsBefore.recovery);
      assert.deepEqual(await d1.prepare("SELECT * FROM word_serial_slots WHERE owner=? AND target_kind='local_word' AND target_id=?").bind(owner,localId).first(),localRowsBefore.slot);
      assert.deepEqual(await d1.prepare("SELECT * FROM word_checkpoints WHERE owner=? AND target_kind='local_word' AND target_id=?").bind(owner,localId).first(),localRowsBefore.checkpoint);
      assert.ok(await r2.head(`local-word-jobs/${localId}/result-${sha}.docx`));
      assert.deepEqual(await row('writing_runs',owner,independentWriting.id),independentWritingBefore);
    }
    await assertLocalPreserved();
    const saved=await complete(owner,p,assertLocalPreserved);
    assert.equal(saved.content_deleted,true);assert.equal(saved.current_owner_article_count,0);
    const checked=await measured('full47.final-independent-read',()=>read(owner,p.operation_id));
    assert.equal(checked.content_deleted,true);assert.equal(checked.current_owner_article_count,0);
    assert.equal(checked.remaining_object_count,0);assert.equal(checked.remaining_content_rows,0);
    assert.equal(await count('articles','owner=?',[owner]),0);
    for(const article of articles)for(const key of article.files)assert.equal(await r2.head(key),null);
    assert.ok(await row('articles',other.owner,other.id));assert.ok(await r2.head(other.source));
    assert.deepEqual(await row('local_word_jobs',owner,localId),localBefore);assert.ok(await r2.head(`local-word-jobs/${localId}/source`));
    assert.deepEqual(await row('event_subscriptions',owner,subscription.id),subBefore);
    assert.deepEqual(await row('topic_research_runs',owner,independentPlan.id),planBefore);
    assert.deepEqual(await d1.prepare('SELECT * FROM claude_settings WHERE owner=?').bind(owner).first(),accountBefore);
    await assertLocalPreserved();
    const content=(await syntheticContentRows(owner)).filter(r=>r.table!=='local_word_jobs'&&r.table!=='topic_research_runs'&&r.table!=='writing_runs');
    assert.deepEqual(content,[],'all linked synthetic body fields must be absent after purge');
    assert.equal((await syntheticContentRows(owner)).find(r=>r.table==='writing_runs')?.count,1,'only the independent writing plan retains its content');
    assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(p))).content_deleted,true);
    await assert.rejects(read(other.owner,p.operation_id),/不存在|无权|owner|权限/);
    await assert.rejects(d1.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,?,?,?,?,?,?)').bind(articles[0].id,owner,'Replay','synthetic.docx',articles[0].source,JSON.stringify([BODY]),now(),'queued').run(),/PERMANENTLY_DELETED|ARTICLE_CONTENT/i);
    // Externally held article executions require a durable, content-free serial
    // barrier; server fences do not pretend that those processes have ended.
    assert.ok(await count('article_purge_serial_blocks','owner=?',[owner])>=8);
    assert.equal(checked.external_actions_revoked,false);
    await assert.rejects(fixtureInsert('word_execution_receipts',{...localBase,request_key:uuid(),token_hash:sha2}),/external_word_executor_end_unconfirmed|unresolved|purge/i);
    // Updating an existing local holder heartbeat does not grant a new token.
    await d1.prepare("UPDATE word_recovery SET heartbeat_at=? WHERE owner=? AND target_kind='local_word' AND target_id=?").bind(now(),owner,localId).run();
    assert.equal((await d1.prepare("SELECT token_hash FROM word_recovery WHERE owner=? AND target_kind='local_word' AND target_id=?").bind(owner,localId).first()).token_hash,sha);
    await assert.rejects(d1.prepare("UPDATE claude_attempts SET response=? WHERE owner=? AND id=?").bind(JSON.stringify({body:BODY}),owner,ids.claude).run(),/article_content_permanently_deleted|purge/i);
    await assert.rejects(fixtureInsert('claude_attempts',{id:ids.claude,owner,state:'received',response:JSON.stringify({body:BODY})}),/article_content_permanently_deleted|purge/i);
    await assert.rejects(fixtureInsert('claude_attempts',{id:uuid(),owner,state:'received',response:JSON.stringify({article_id:articles[8].id,body:BODY})}),/article_content_permanently_deleted|purge/i);
    await assert.rejects(fixtureInsert('article_upload_diagnostics',{id:uuid(),owner,article_id:articles[8].id,platform:'zhihu',executor_id:uuid(),stage:'chooser_wait',outcome:'started',cause:'none'}),/article_content_permanently_deleted|purge/i);
    await assert.rejects(fixtureInsert('editorial_requests',{id:uuid(),owner,flow_id:ids.editorial,state:'queued',input_json:JSON.stringify({body:BODY}),progress_json:'{}'}),/article_content_permanently_deleted|purge/i);
    await assert.rejects(fixtureInsert('editorial_stages_v3',{id:uuid(),owner,run_id:ids.v3,state:'returned',stage:'late',input_json:JSON.stringify({body:BODY})}),/article_content_permanently_deleted|purge/i);
    await assert.rejects(d1.prepare('DELETE FROM article_content_fences WHERE owner=?').bind(owner).run(),/immutable/i);
    await assert.rejects(d1.prepare('UPDATE article_content_fences SET entity_key=? WHERE owner=?').bind(uuid(),owner).run(),/immutable/i);
    await assert.rejects(d1.prepare('DELETE FROM article_purge_serial_blocks WHERE owner=?').bind(owner).run(),/immutable/i);
    await assert.rejects(d1.prepare("UPDATE writing_runs SET state='submitted',topic=? WHERE owner=? AND id=?").bind(BODY,owner,ids.writing).run(),/ARTICLE_CONTENT_PERMANENTLY_DELETED/i);
    const audit=await d1.prepare('SELECT snapshot_json FROM article_list_deletions WHERE owner=? AND id=?').bind(owner,p.operation_id).first();
    assert.equal(audit.snapshot_json.includes(BODY),false,'persistent exact-scope operation stores identities and hashes, not source body backups');
    assert.equal(await count('article_word_executor_ends','owner=?',[owner]),0,'purge creates no fictional executor end proof');
  });

  await scenario('owner access and exact confirmation fail closed before mutations',async()=>{
    const owner='SYNTHETIC_CONFIRM',a=await seedArticle(owner),b=await seedArticle(owner),p=await previewArticleContentDeletion(owner,uuid()),args=confirmArgs(p);
    for(const change of [{confirm_owner:'OTHER_OWNER'},{confirm_scope:'publish'},{confirm_ids:[a.id]},
      {confirm_ids:[...args.confirm_ids].reverse()},{snapshot_sha256:sha2},{confirm_permanent:false}]){
      await assert.rejects(confirmArticleContentDeletion(owner,{...args,...change}),/确认|快照|范围|owner|无效/);
    }
    await assert.rejects(confirmArticleContentDeletion('OTHER_OWNER',args),/不存在|无权|权限|owner/);
    assert.equal(await count('articles','owner=?',[owner]),2);
    assert.equal(await count('article_deletions','owner=?',[owner]),0);
    assert.ok(await r2.head(a.source));assert.ok(await r2.head(b.source));
    const before=await row('articles',owner,a.id);
    await assert.rejects(fixtureInsert('article_content_fences',{owner,entity_kind:'articles',entity_key:a.id,article_id:a.id,operation_id:p.operation_id}),/confirmation_required/);
    await assert.rejects(fixtureInsert('article_purge_serial_blocks',{owner,article_id:a.id,operation_id:p.operation_id,reason:'external_end_unconfirmed'}),/confirmation_required/);
    assert.deepEqual(await row('articles',owner,a.id),before);
  });

  await scenario('changed content and new owner articles invalidate full snapshot',async()=>{
    const owner='SYNTHETIC_SNAPSHOT',a=await seedArticle(owner),p=await previewArticleContentDeletion(owner,uuid());
    await d1.prepare('UPDATE articles SET paragraphs=? WHERE owner=? AND id=?').bind(JSON.stringify(['Synthetic article',BODY+' changed']),owner,a.id).run();
    await assert.rejects(confirmArticleContentDeletion(owner,confirmArgs(p)),/变化|快照/);
    assert.equal(await count('article_deletions','owner=?',[owner]),0);assert.ok(await r2.head(a.source));
    const fresh=await previewArticleContentDeletion(owner,uuid()),late=await seedArticle(owner);
    await assert.rejects(confirmArticleContentDeletion(owner,confirmArgs(fresh)),/变化|快照|新增/);
    assert.equal(await count('article_deletions','owner=?',[owner]),0);assert.ok(await row('articles',owner,late.id));
  });

  await scenario('R2 identity changes invalidate preview without widening deletion',async()=>{
    const owner='SYNTHETIC_FILE_CHANGE',a=await seedArticle(owner),p=await previewArticleContentDeletion(owner,uuid());
    await r2.put(a.source,BODY+' replaced bytes');
    await assert.rejects(confirmArticleContentDeletion(owner,confirmArgs(p)),/变化|快照|文件/);
    assert.equal(await count('article_deletions','owner=?',[owner]),0);assert.ok(await r2.head(a.source));
    const b=await seedArticle('SYNTHETIC_BAD_PREFIX');
    await r2.put(`articles/${b.id}/unrecognized-owner-file`,BODY);
    await assert.rejects(previewArticleContentDeletion(b.owner,uuid()),/归属|无法确认|文件/);
    assert.ok(await row('articles',b.owner,b.id));
  });

  await scenario('atomic all-target fence rolls back when a concurrent writer wins',async()=>{
    const owner='SYNTHETIC_ATOMIC',a=await seedArticle(owner),b=await seedArticle(owner),p=await previewArticleContentDeletion(owner,uuid());
    const beforeDeletes=deleteCalls;
    beforeBatch=()=>d1.prepare('UPDATE articles SET paragraphs=? WHERE owner=? AND id=?').bind(JSON.stringify(['Synthetic article',BODY+' won CAS']),owner,a.id).run();
    await assert.rejects(confirmArticleContentDeletion(owner,confirmArgs(p)),/变化|改变|并发|快照/);
    assert.equal((await row('articles',owner,a.id)).state,'completed');assert.equal((await row('articles',owner,b.id)).state,'completed');
    assert.equal(await count('article_deletions','owner=?',[owner]),0);
    assert.equal(await count('article_content_fences','owner=?',[owner]),0);
    assert.equal(deleteCalls,beforeDeletes);assert.ok(await r2.head(a.source));assert.ok(await r2.head(b.source));
    assert.equal((await read(owner,p.operation_id)).state,'previewed');
  });

  await scenario('partial R2 deletion stays truthful and resumes the same operation',async()=>{
    const owner='SYNTHETIC_R2_FAILURE',a=await seedArticle(owner),p=await previewArticleContentDeletion(owner,uuid());
    failDeleteAt=deleteCalls+2;
    await assert.rejects(confirmArticleContentDeletion(owner,confirmArgs(p)),error=>error.status===503);
    const partial=await read(owner,p.operation_id);
    assert.equal(partial.content_deleted,false);assert.ok(await row('articles',owner,a.id));
    assert.equal((await row('articles',owner,a.id)).state,'deleting');
    await assert.rejects(d1.prepare('UPDATE articles SET paragraphs=? WHERE owner=? AND id=?').bind(JSON.stringify([BODY+' late']),owner,a.id).run(),/DELETION_IN_PROGRESS|purge/i);
    failDeleteAt=0;
    const resumed=await confirmArticleContentDeletion(owner,confirmArgs(p));
    assert.equal(resumed.operation_id,p.operation_id);assert.equal(resumed.content_deleted,true);
    assert.equal(await count('article_list_deletions','owner=?',[owner]),1);
    assert.equal(await row('articles',owner,a.id),null);assert.equal(await r2.head(a.source),null);
  });

  await scenario('unknown committed D1 response is read back before same-operation continuation',async()=>{
    const owner='SYNTHETIC_D1_UNKNOWN',a=await seedArticle(owner),key=uuid(),p=await previewArticleContentDeletion(owner,key);
    afterBatch=()=>{throw Error('SYNTHETIC_D1_COMMITTED_RESPONSE_UNKNOWN');};
    await assert.rejects(confirmArticleContentDeletion(owner,confirmArgs(p)));
    const observed=await read(owner,p.operation_id);
    assert.equal(observed.content_deleted,false);assert.equal(observed.state,'deleting');
    assert.equal(await count('article_deletions','owner=?',[owner]),1);assert.ok(await r2.head(a.source));
    const recalled=await previewArticleContentDeletion(owner,key);
    assert.equal(recalled.operation_id,p.operation_id);
    assert.equal(await count('article_list_deletions','owner=?',[owner]),1);
    assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(p))).content_deleted,true);
  });

  await scenario('concurrent exact confirmations share one lock and one deletion',async()=>{
    const owner='SYNTHETIC_DOUBLE',a=await seedArticle(owner),p=await previewArticleContentDeletion(owner,uuid());
    let release,entered;
    const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
    beforeDelete=async()=>{entered();await held;};
    const first=confirmArticleContentDeletion(owner,confirmArgs(p));await started;
    const second=await confirmArticleContentDeletion(owner,confirmArgs(p));
    assert.equal(second.content_deleted,false);assert.equal(second.state,'deleting');
    release();assert.equal((await first).content_deleted,true);
    assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(p))).content_deleted,true);
    assert.equal(await count('article_list_deletions','owner=?',[owner]),1);
    assert.equal(await row('articles',owner,a.id),null);
  });

  await scenario('completed read is read-only and late file bytes are not claimed deleted',async()=>{
    const owner='SYNTHETIC_READBACK',a=await seedArticle(owner),p=await previewArticleContentDeletion(owner,uuid());
    await confirmArticleContentDeletion(owner,confirmArgs(p));
    const before=await d1.prepare('SELECT * FROM article_list_deletions WHERE owner=? AND id=?').bind(owner,p.operation_id).first(),deletesBefore=deleteCalls;
    for(let i=0;i<3;i++)assert.equal((await read(owner,p.operation_id)).content_deleted,true);
    assert.deepEqual(await d1.prepare('SELECT * FROM article_list_deletions WHERE owner=? AND id=?').bind(owner,p.operation_id).first(),before);
    assert.equal(deleteCalls,deletesBefore);
    await r2.put(a.source,BODY+' late unidentified replacement');
    const late=await read(owner,p.operation_id);
    assert.equal(late.content_deleted,false);assert.equal(late.state,'needs_verification');assert.equal(late.remaining_object_count,1);
    assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(p))).content_deleted,true);
    assert.equal(await r2.head(a.source),null,'explicit whole-article namespace confirmation covers late valid article bytes');
  });

  await scenario('artifact write compensation rejects existing and in-flight deleted articles',async()=>{
    const {writeArticleObject}=load('article-source-write');
    const owner='SYNTHETIC_LATE_ARTIFACT',a=await seedArticle(owner),p=await previewArticleContentDeletion(owner,uuid());
    await confirmArticleContentDeletion(owner,confirmArgs(p));
    await assert.rejects(writeArticleObject(owner,a.id,a.source,new TextEncoder().encode(BODY)),/永久删除|purge/i);
    assert.equal(await r2.head(a.source),null);
    for(const unknown of [false,true]){
      const runningOwner='SYNTHETIC_INFLIGHT_'+unknown,b=await seedArticle(runningOwner),pending=await previewArticleContentDeletion(runningOwner,uuid());
      const key=`articles/${b.id}/checkpoints/${uuid()}/0-${sha}`;
      // Purge completes while a real R2 put is already underway. It cannot see
      // bytes not yet accepted, so the actual writer must remove its late put.
      beforePut=async()=>{await confirmArticleContentDeletion(runningOwner,confirmArgs(pending));};
      failPutAfterAcceptance=unknown;
      await assert.rejects(writeArticleObject(runningOwner,b.id,key,new TextEncoder().encode(BODY)),/永久删除|purge|SYNTHETIC_R2_PUT_RESPONSE_UNKNOWN/i);
      failPutAfterAcceptance=false;
      assert.equal(await r2.head(key),null);assert.equal((await read(runningOwner,pending.operation_id)).content_deleted,true);
    }
  });

  await scenario('legacy tombstone residuals receive exact new cleanup without invented history',async()=>{
    const owner='SYNTHETIC_LEGACY',id=uuid(),source=`articles/${id}/source`;
    await fixtureInsert('article_deletions',{id,owner,state:'deleted',started_at:now(),deleted_at:now(),object_count:0});
    await r2.put(source,BODY+' legacy residual');
    const p=await previewArticleContentDeletion(owner,uuid());
    assert.equal(p.count,1);assert.equal(p.file_count,1);assert.equal(p.items[0].article_id,id);
    const saved=await confirmArticleContentDeletion(owner,confirmArgs(p));
    assert.equal(saved.content_deleted,true);assert.equal(saved.remaining_object_count,0);
    assert.equal(await count('articles','owner=?',[owner]),0);assert.equal(await r2.head(source),null);
    assert.equal(await count('word_progress_events','owner=?',[owner]),0);
    assert.equal(await count('article_word_executor_ends','owner=?',[owner]),0);
  });

  await scenario('stepwise source and indirect text-revision snapshots/provider bodies are purged',async()=>{
    const owner='SYNTHETIC_STEPWISE',fixture=await realStepwiseFixture(owner);
    const sourceBefore=await row('manual_writing_batches',owner,fixture.batch.run_id);
    const created=await fixture.revision.createTextRevision(owner,fixture.create);
    const revisionId=created.flow_id,receipt=`text_revision:${owner}:${revisionId}`;
    assert.ok((await row('manual_writing_batches',owner,revisionId)).snapshot.includes(BODY));
    const p=await previewArticleContentDeletion(owner,uuid());
    const final=await complete(owner,p);assert.equal(final.content_deleted,true);
    assert.deepEqual(await syntheticContentRows(owner),[]);
    assert.deepEqual(await row('manual_writing_batches',owner,fixture.batch.run_id),sourceBefore,'shared frozen inputs of the unclaimed other writer remain byte-identical');
    assert.equal((await row('manual_writing_batches',owner,revisionId)).snapshot,'{}');
    assert.equal((await row('claude_attempts',owner,receipt)).response,'{}');
    const other=await fixture.stepwise.claimStepwiseTextWriter(owner,{run_id:fixture.batch.run_id,writer:'claude',confirm:true});
    assert.equal(other.claimed,true,'the independent unclaimed writer retains its normal operational access');
    await assert.rejects(fixture.revision.createTextRevision(owner,fixture.create));
  });

  await scenario('prepared real createTextRevision cannot insert a new UUID after source-writer fence',async()=>{
    const owner='SYNTHETIC_PREPARED_REVISION',fixture=await realStepwiseFixture(owner);
    const sourceBefore=await row('manual_writing_batches',owner,fixture.batch.run_id),p=await previewArticleContentDeletion(owner,uuid());
    beforeBatch=async()=>{assert.equal((await complete(owner,p)).content_deleted,true);};
    await assert.rejects(fixture.revision.createTextRevision(owner,fixture.create),/ARTICLE_CONTENT_PERMANENTLY_DELETED|purge/i);
    assert.equal((await read(owner,p.operation_id)).content_deleted,true);
    assert.deepEqual(await syntheticContentRows(owner),[]);
    assert.equal(await count('manual_writing_batches','owner=?',[owner]),1,'the prepared fresh revision batch was never persisted');
    assert.deepEqual(await row('manual_writing_batches',owner,fixture.batch.run_id),sourceBefore);
    const other=await fixture.stepwise.claimStepwiseTextWriter(owner,{run_id:fixture.batch.run_id,writer:'claude',confirm:true});
    assert.equal(other.claimed,true);
  });

  await scenario('completed Word with retained upload claim does not invent an active Word barrier',async()=>{
    const owner='SYNTHETIC_COMPLETED_UPLOAD',a=await seedArticle(owner,{state:'completed',output:true,active:true});
    await d1.prepare('UPDATE articles SET claim_expires=? WHERE owner=? AND id=?').bind('2026-01-01T00:00:00.000Z',owner,a.id).run();
    const p=await previewArticleContentDeletion(owner,uuid());
    const final=await complete(owner,p);assert.equal(final.content_deleted,true);
    assert.equal(await count('article_purge_serial_blocks','owner=?',[owner]),0);
    assert.equal(await count('article_word_executor_ends','owner=?',[owner]),0);
    assert.equal(final.external_stop_confirmed,false,'stored Word success is not a forged external-process end proof');
    const heldOwner='SYNTHETIC_COMPLETED_HELD_SLOT',held=await seedArticle(heldOwner,{state:'completed',output:true});
    await fixtureInsert('word_serial_slots',{owner:heldOwner,target_kind:'article',target_id:held.id,state:'held',epoch:1,version:1});
    const heldPreview=await previewArticleContentDeletion(heldOwner,uuid());
    assert.equal((await complete(heldOwner,heldPreview)).content_deleted,true);
    assert.equal(await count('article_purge_serial_blocks','owner=?',[heldOwner]),1,'a real outstanding slot survives as a safe minimal barrier');
    assert.equal(await count('article_word_executor_ends','owner=?',[heldOwner]),0);
  });

  await scenario('existing recent-writing clear still scrubs five direct content tables under its exact legal lock',async()=>{
    const owner='SYNTHETIC_OLD_RECENT_WRITING',a=await seedArticle(owner),writing=uuid(),outline=uuid(),editorial=uuid(),v3=uuid();
    await d1.prepare('UPDATE articles SET draft_url=? WHERE owner=? AND id=?').bind('https://example.test/private-draft',owner,a.id).run();
    await fixtureInsert('article_deliveries',{owner,article_id:a.id,platform:'zhihu',state:'saved',draft_url:'https://example.test/private-draft'});
    await fixtureInsert('writing_runs',{id:writing,owner,article_id:a.id,writer:'xiaoyu',run_kind:'daily',state:'text_saved',topic:BODY,sources:JSON.stringify([BODY]),input_snapshot:JSON.stringify({body:BODY})});
    await fixtureInsert('daily_editorial_drafts',{owner,article_id:a.id,input_snapshot:JSON.stringify({body:BODY}),initial_json:JSON.stringify({body:BODY})});
    await fixtureInsert('outline_flows',{id:outline,owner,article_id:a.id,state:'final_saved',snapshot:JSON.stringify({body:BODY}),outline_json:JSON.stringify({body:BODY}),review_json:JSON.stringify({body:BODY}),writing_input:JSON.stringify({body:BODY})});
    await fixtureInsert('editorial_flows',{id:editorial,owner,article_id:a.id,state:'text_saved',snapshot:JSON.stringify({body:BODY})});
    await fixtureInsert('editorial_runs_v3',{id:v3,owner,article_id:a.id,writer:'xiaoyu',run_kind:'daily',state:'text_saved',input_json:JSON.stringify({body:BODY}),snapshot_json:JSON.stringify({body:BODY}),error:BODY});
    const old=load('article-list-deletion'),p=await old.previewListDeletion(owner,'writing',uuid(),[a.id]);
    const done=await old.confirmListDeletion(owner,{...confirmArgs(p),confirm_scope:'writing'});
    assert.equal(done.content_deleted,true);assert.equal(await row('articles',owner,a.id),null);
    assert.deepEqual(await syntheticContentRows(owner),[]);
    assert.equal((await row('writing_runs',owner,writing)).state,'permanently_deleted');
    assert.equal((await row('outline_flows',owner,outline)).snapshot,'{}');
    assert.equal((await row('editorial_flows',owner,editorial)).snapshot,'{}');
    assert.equal((await row('editorial_runs_v3',owner,v3)).input_json,'{}');
    assert.equal(await count('article_content_fences','owner=?',[owner]),0,'legacy recent-list clear must not pretend to have run all-articles fences');
    assert.equal(await count('article_purge_serial_blocks','owner=?',[owner]),0);
  });

  await scenario('second full purge preserves truthful read-only older receipts and does not supersede a fresh preview',async()=>{
    const owner='SYNTHETIC_SECOND_PURGE',a=await seedArticle(owner),first=await previewArticleContentDeletion(owner,uuid());
    const firstDone=await confirmArticleContentDeletion(owner,confirmArgs(first));assert.equal(firstDone.content_deleted,true);
    await r2.put(a.source,new TextEncoder().encode(BODY+' a known residual for the second exact preview'));
    const b=await seedArticle(owner),second=await previewArticleContentDeletion(owner,uuid());
    const inherited=second.items.find(item=>item.article_id===a.id);
    assert.equal(inherited.superseded_by,null);assert.equal(inherited.prior_deletion_operation_id,first.operation_id);
    assert.equal(second.requires_superseding_operation,false);assert.equal(second.state,'previewed');
    assert.equal(second.superseded_operation_ids.length,0);
    let release,entered;
    const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
    beforeDelete=async()=>{entered();await held;};
    const secondRunning=confirmArticleContentDeletion(owner,confirmArgs(second));await started;
    try {
      const oldDuring=await read(owner,first.operation_id);
      assert.equal(oldDuring.content_deleted,false);assert.equal(oldDuring.items[0].state,'superseded_deleting');
      assert.equal(oldDuring.items[0].superseded_by,second.operation_id);assert.equal(oldDuring.requires_superseding_operation,true);
      assert.equal(oldDuring.resume_required,false,'only the active superseding operation may continue');
    } finally {release();}
    const secondDone=await secondRunning;assert.equal(secondDone.content_deleted,true);
    assert.equal(await row('articles',owner,b.id),null);
    const calls={...metrics},older=await read(owner,first.operation_id);
    assert.equal(older.content_deleted,true);assert.equal(older.state,'deleted');
    assert.equal(older.items[0].superseded_by,second.operation_id);
    assert.equal(older.requires_superseding_operation,false);
    assert.equal(metrics.r2_put,calls.r2_put);assert.equal(metrics.r2_delete,calls.r2_delete);
    const auditBefore=JSON.stringify((await d1.prepare('SELECT * FROM article_list_deletions WHERE owner=? ORDER BY id').bind(owner).all()).results);
    assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(first))).content_deleted,true);
    assert.equal((await read(owner,second.operation_id)).content_deleted,true);
    assert.equal(JSON.stringify((await d1.prepare('SELECT * FROM article_list_deletions WHERE owner=? ORDER BY id').bind(owner).all()).results),auditBefore);
    await r2.put(a.source,new TextEncoder().encode(BODY+' late authorized namespace'));
    const olderLate=await read(owner,first.operation_id);
    assert.equal(olderLate.content_deleted,false);assert.equal(olderLate.requires_superseding_operation,true);
    const deletesBefore=metrics.r2_delete;
    assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(first))).content_deleted,false);
    assert.equal(metrics.r2_delete,deletesBefore,'old receipt must not steal the superseding operation lock or delete late files');
    assert.ok(await r2.head(a.source));
    assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(second))).content_deleted,true);
    assert.equal(await r2.head(a.source),null);
    assert.equal((await read(owner,first.operation_id)).content_deleted,true);
  });

  await scenario('Dedao four exact bound pairs remove item/download/action/chunk bytes while the same batch independent pair remains',async()=>{
    const owner='SYNTHETIC_DEDAO_FOUR',fixture=await seedDedao(owner,{running:true});
    const independentBefore=await dedaoPairRows(fixture.unbound),independentHead=await r2.head(fixture.unbound.key),batchBefore=await row('dedao_batches',owner,fixture.batch_id);
    for(const table of ['dedao_items','dedao_actions','dedao_chunks'])await assert.rejects(d1.prepare(`DELETE FROM ${table} WHERE batch_id=? AND ordinal=?`).bind(fixture.batch_id,1).run(),/dedao_article_purge_exact_confirmation_required/);
    const p=await measured('dedao-four.preview',()=>previewArticleContentDeletion(owner,uuid()));
    assert.equal(p.include_dedao_articles,true);assert.equal(p.file_count,4*6);assert.equal(p.article_count,4);
    const done=await measured('dedao-four.confirm',()=>confirmArticleContentDeletion(owner,confirmArgs(p)));
    assert.equal(done.content_deleted,true);assert.equal(done.remaining_content_rows,0);assert.equal(done.remaining_object_count,0);assert.equal(done.all_owner_articles_empty,false);
    assert.equal(done.current_scope_bound_dedao_article_count,0);assert.equal(done.current_bound_dedao_article_count,1,'the independently downloaded next item is disclosed instead of claimed globally empty');
    await assertDedaoGone(fixture);
    assert.deepEqual(await dedaoPairRows(fixture.unbound),independentBefore);
    assert.equal((await r2.head(fixture.unbound.key)).etag,independentHead.etag);
    assert.deepEqual(await row('dedao_batches',owner,fixture.batch_id),batchBefore,'the independent next ordinal keeps its original execution and grant');
    await assert.rejects(d1.prepare('UPDATE dedao_batches SET owner=? WHERE id=?').bind('SYNTHETIC_OTHER_OWNER',fixture.batch_id).run(),/immutable_dedao_article_purge_owner_mapping/);
    await assert.rejects(d1.prepare('UPDATE dedao_batches SET id=? WHERE id=?').bind(uuid(),fixture.batch_id).run(),/immutable_dedao_article_purge_owner_mapping/);
    await assert.rejects(d1.prepare('DELETE FROM dedao_batches WHERE id=?').bind(fixture.batch_id).run(),/immutable_dedao_article_purge_owner_mapping/);
    assert.equal(done.external_actions_revoked,false);assert.equal(done.external_stop_confirmed,false);
    const op=await d1.prepare('SELECT snapshot_json FROM article_list_deletions WHERE owner=? AND id=?').bind(owner,p.operation_id).first();
    assert.equal(op.snapshot_json.includes(BODY),false,'Dedao operation persists only IDs/identities/hashes, never a body backup');
    const pair=fixture.bound[0];
    await assert.rejects(fixtureInsert('dedao_items',{batch_id:pair.batch_id,owner,ordinal:pair.ordinal,id:uuid(),article_id:uuid(),title:BODY}),/ARTICLE_CONTENT_PERMANENTLY_DELETED|purge|deleted/i);
    await assert.rejects(fixtureInsert('dedao_actions',{batch_id:pair.batch_id,ordinal:pair.ordinal,action:'stage_7',action_id:uuid(),state:'observed',observation_json:JSON.stringify({response_ref:BODY})}),/ARTICLE_CONTENT_PERMANENTLY_DELETED|purge|deleted/i);
    await assert.rejects(fixtureInsert('dedao_chunks',{batch_id:pair.batch_id,ordinal:pair.ordinal,offset:48,size:10,sha256:sha,object_key:`dedao/${pair.batch_id}/${pair.ordinal}/chunk-48-${sha}`}),/ARTICLE_CONTENT_PERMANENTLY_DELETED|purge|deleted/i);
    await assert.rejects(d1.prepare('UPDATE dedao_items SET ordinal=?,id=? WHERE batch_id=? AND ordinal=?').bind(pair.ordinal,uuid(),fixture.unbound.batch_id,fixture.unbound.ordinal).run(),/ARTICLE_CONTENT_PERMANENTLY_DELETED|purge|deleted/i);
    await assert.rejects(d1.prepare('UPDATE dedao_items SET article_id=? WHERE batch_id=? AND ordinal=?').bind(pair.article.id,fixture.unbound.batch_id,fixture.unbound.ordinal).run(),/ARTICLE_CONTENT_PERMANENTLY_DELETED|purge|deleted/i);
    await assert.rejects(d1.prepare('UPDATE dedao_actions SET ordinal=?,action_id=? WHERE batch_id=? AND ordinal=?').bind(pair.ordinal,uuid(),fixture.unbound.batch_id,fixture.unbound.ordinal).run(),/ARTICLE_CONTENT_PERMANENTLY_DELETED|purge|deleted/i);
    await assert.rejects(d1.prepare('UPDATE dedao_chunks SET ordinal=? WHERE batch_id=? AND ordinal=?').bind(pair.ordinal,fixture.unbound.batch_id,fixture.unbound.ordinal).run(),/ARTICLE_CONTENT_PERMANENTLY_DELETED|purge|deleted/i);
    assert.deepEqual(await dedaoPairRows(fixture.unbound),independentBefore);
    await d1.prepare('UPDATE dedao_actions SET updated=? WHERE batch_id=? AND ordinal=?').bind(now(),fixture.unbound.batch_id,fixture.unbound.ordinal).run();
    const readBefore=JSON.stringify((await d1.prepare('SELECT * FROM article_list_deletions WHERE owner=?').bind(owner).all()).results),deletesBefore=metrics.r2_delete;
    assert.equal((await read(owner,p.operation_id)).content_deleted,true);assert.equal((await read(owner,p.operation_id)).content_deleted,true);
    assert.equal(metrics.r2_delete,deletesBefore);assert.equal(JSON.stringify((await d1.prepare('SELECT * FROM article_list_deletions WHERE owner=?').bind(owner).all()).results),readBefore);
  });

  await scenario('Dedao foreign-owner references and objects stay outside the owner article purge',async()=>{
    const owner='SYNTHETIC_DEDAO_OWNER',a=await seedArticle(owner),foreign=await seedDedao('SYNTHETIC_DEDAO_FOREIGN',{boundCount:0});
    await d1.prepare('UPDATE dedao_items SET article_id=? WHERE batch_id=? AND ordinal=?').bind(a.id,foreign.batch_id,1).run();
    const before=await dedaoPairRows(foreign.unbound),headBefore=await r2.head(foreign.unbound.key),p=await previewArticleContentDeletion(owner,uuid());
    assert.equal(p.file_count,a.files.length);assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(p))).content_deleted,true);
    assert.deepEqual(await dedaoPairRows(foreign.unbound),before);assert.equal((await r2.head(foreign.unbound.key)).etag,headBefore.etag);
    assert.equal(await row('articles',owner,a.id),null);
    const batchOwnerMismatch=await seedDedao('SYNTHETIC_DEDAO_WRONG_BATCH_OWNER',{boundCount:0}),ownArticle=await seedArticle(owner);
    await assert.rejects(d1.prepare('UPDATE dedao_items SET owner=?,article_id=? WHERE batch_id=? AND ordinal=?').bind(owner,ownArticle.id,batchOwnerMismatch.batch_id,1).run(),/ARTICLE_CONTENT_PERMANENTLY_DELETED/);
    assert.equal((await dedaoPairRows(batchOwnerMismatch.unbound)).item.owner,'SYNTHETIC_DEDAO_WRONG_BATCH_OWNER');
    assert.ok(await row('articles',owner,ownArticle.id));assert.ok(await r2.head(batchOwnerMismatch.unbound.key));
  });

  await scenario('Dedao exact formal V139 preview cannot expand into upstream bytes without a new preview',async()=>{
    const owner='SYNTHETIC_DEDAO_OLD_SCOPE',fixture=await seedDedao(owner,{unbound:false}),old=loadBaselineDeletion(),p=await old.previewArticleContentDeletion(owner,uuid());
    assert.equal(p.include_dedao_articles,false);assert.equal(p.file_count,20);
    const done=await confirmArticleContentDeletion(owner,confirmArgs(p));assert.equal(done.content_deleted,true);
    assert.equal(done.include_dedao_articles,false);assert.equal(done.all_owner_articles_empty,false,'old article-only confirmation cannot certify the new upstream scope');
    for(const pair of fixture.bound){assert.ok((await dedaoPairRows(pair)).item);assert.ok(await r2.head(pair.key));}
    const fresh=await previewArticleContentDeletion(owner,uuid());assert.equal(fresh.include_dedao_articles,true);assert.equal(fresh.file_count,4);
    assert.notEqual(fresh.snapshot_sha256,p.snapshot_sha256);assert.notEqual(fresh.operation_id,p.operation_id);
    assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(p))).include_dedao_articles,false);
    for(const pair of fixture.bound)assert.ok(await r2.head(pair.key));
    const completeFresh=await confirmArticleContentDeletion(owner,confirmArgs(fresh));assert.equal(completeFresh.content_deleted,true);assert.equal(completeFresh.all_owner_articles_empty,true);assert.equal(completeFresh.current_scope_bound_dedao_article_count,0);
    await assertDedaoGone(fixture);
    const projected=await loader({realArticles:true})('dedao').readDedao(owner,fixture.batch_id);
    assert.equal(projected.batch.current,null);assert.equal(projected.batch.current_record_deleted,true);assert.equal(projected.batch.can_resume,false);
    const pair=fixture.bound[0],lateKey=`dedao/${pair.batch_id}/${pair.ordinal}/chunk-47-${sha2}`;
    await r2.put(lateKey,new TextEncoder().encode(BODY+' an orphan after all item rows are gone'));
    const oldAfterOrphan=await read(owner,p.operation_id);
    assert.equal(oldAfterOrphan.content_deleted,true,'the original article-only receipt keeps its frozen meaning');
    assert.equal(oldAfterOrphan.all_owner_articles_empty,false);assert.equal(oldAfterOrphan.current_bound_dedao_object_count,1,'immutable pair identity discovers actual orphan bytes after item deletion');
    assert.equal(oldAfterOrphan.current_bound_dedao_content_rows,0);
    const orphanPreview=await previewArticleContentDeletion(owner,uuid());assert.equal(orphanPreview.include_dedao_articles,true);assert.equal(orphanPreview.file_count,1);
    assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(orphanPreview))).all_owner_articles_empty,true);
    assert.equal(await r2.head(lateKey),null);assert.equal((await read(owner,p.operation_id)).all_owner_articles_empty,true);
  });

  await scenario('Dedao file etag, source-row changes and a new binding invalidate exact snapshots before deletion',async()=>{
    for(const change of ['item','action','chunk','etag','new-binding']){
      const owner='SYNTHETIC_DEDAO_MUTATION_'+change,fixture=await seedDedao(owner,{boundCount:1}),pair=fixture.bound[0],p=await previewArticleContentDeletion(owner,uuid());
      if(change==='item')await d1.prepare('UPDATE dedao_items SET title=? WHERE batch_id=? AND ordinal=?').bind(BODY+' changed',pair.batch_id,pair.ordinal).run();
      if(change==='action')await d1.prepare('UPDATE dedao_actions SET observation_json=? WHERE batch_id=? AND ordinal=?').bind(JSON.stringify({response_ref:BODY+' changed'}),pair.batch_id,pair.ordinal).run();
      if(change==='chunk')await d1.prepare('UPDATE dedao_chunks SET size=size+1 WHERE batch_id=? AND ordinal=?').bind(pair.batch_id,pair.ordinal).run();
      if(change==='etag')await r2.put(pair.key,new TextEncoder().encode(BODY+' changed object bytes'));
      if(change==='new-binding'){
        await d1.prepare('UPDATE dedao_items SET article_id=NULL WHERE batch_id=? AND ordinal=?').bind(pair.batch_id,pair.ordinal).run();
        await d1.prepare('UPDATE dedao_items SET article_id=? WHERE batch_id=? AND ordinal=?').bind(pair.article.id,fixture.unbound.batch_id,fixture.unbound.ordinal).run();
      }
      const deletedBefore=metrics.r2_delete;
      await assert.rejects(confirmArticleContentDeletion(owner,confirmArgs(p)),error=>error.status===409);
      assert.equal(metrics.r2_delete,deletedBefore);assert.equal((await row('articles',owner,pair.article.id)).state,'completed');
      assert.equal(await count('article_deletions','owner=?',[owner]),0);assert.ok(await r2.head(pair.key));
    }
  });

  await scenario('Dedao atomic source-row CAS rolls back every article fence when a concurrent writer wins',async()=>{
    const owner='SYNTHETIC_DEDAO_CAS',fixture=await seedDedao(owner),p=await previewArticleContentDeletion(owner,uuid()),pair=fixture.bound[0];
    beforeBatch=()=>d1.prepare('UPDATE dedao_actions SET observation_json=? WHERE batch_id=? AND ordinal=?').bind(JSON.stringify({response_ref:BODY+' concurrent winner'}),pair.batch_id,pair.ordinal).run();
    const deletedBefore=metrics.r2_delete;
    await assert.rejects(confirmArticleContentDeletion(owner,confirmArgs(p)));
    assert.equal(await count('article_deletions','owner=?',[owner]),0);assert.equal(await count('article_content_fences','owner=?',[owner]),0);
    assert.equal(metrics.r2_delete,deletedBefore);assert.equal((await read(owner,p.operation_id)).state,'previewed');
    for(const bound of fixture.bound){assert.equal((await row('articles',owner,bound.article.id)).state,'completed');assert.ok(await r2.head(bound.key));}
  });

  await scenario('Dedao partial object failure and unknown committed batch resume only the same exact operation',async()=>{
    for(const failure of ['partial-r2','unknown-d1']){
      const owner='SYNTHETIC_DEDAO_RESUME_'+failure,fixture=await seedDedao(owner),key=uuid(),p=await previewArticleContentDeletion(owner,key),independentBefore=await dedaoPairRows(fixture.unbound);
      if(failure==='partial-r2'){
        const failOneDedao=async objectKey=>{if(objectKey.startsWith('dedao/'))throw Error('SYNTHETIC_DEDAO_DELETE_FAILURE');beforeDelete=failOneDedao;};
        beforeDelete=failOneDedao;
      }else afterBatch=()=>{throw Error('SYNTHETIC_DEDAO_COMMITTED_RESPONSE_UNKNOWN');};
      await assert.rejects(confirmArticleContentDeletion(owner,confirmArgs(p)),error=>error.status===503);
      const observed=await read(owner,key);assert.equal(observed.operation_id,p.operation_id);assert.equal(observed.content_deleted,false);assert.equal(observed.state,'deleting');
      assert.ok(observed.remaining_object_count>0);assert.ok(observed.remaining_content_rows>0);
      assert.equal((await previewArticleContentDeletion(owner,key)).operation_id,p.operation_id);
      assert.equal(await count('article_list_deletions','owner=?',[owner]),1);
      const resumed=await confirmArticleContentDeletion(owner,confirmArgs(p));assert.equal(resumed.content_deleted,true);assert.equal(resumed.operation_id,p.operation_id);
      await assertDedaoGone(fixture);assert.deepEqual(await dedaoPairRows(fixture.unbound),independentBefore);assert.ok(await r2.head(fixture.unbound.key));
    }
  });

  await scenario('Dedao real upload rejects and compensates a late accepted R2 put after the bound pair purge',async()=>{
    for(const unknown of [false,true]){
      const owner='SYNTHETIC_DEDAO_LATE_PUT_'+unknown,fixture=await seedDedao(owner,{boundCount:1,unbound:false,running:true}),pair=fixture.bound[0],lateBytes=new TextEncoder().encode(BODY+' late Dedao bytes');
      const download=JSON.parse(pair.item.download_json);download.size+=lateBytes.length;
      await d1.prepare('UPDATE dedao_items SET submitted=NULL,submitted_handoff_id=NULL,upload_state=NULL,stage=9,download_json=? WHERE batch_id=? AND ordinal=?').bind(JSON.stringify(download),pair.batch_id,pair.ordinal).run();
      const p=await previewArticleContentDeletion(owner,uuid()),dedao=loader({realArticles:true})('dedao'),lateKey=`dedao/${pair.batch_id}/${pair.ordinal}/chunk-${pair.bytes.length}-${await hash(new TextDecoder().decode(lateBytes))}`;
      beforePut=async()=>{assert.equal((await confirmArticleContentDeletion(owner,confirmArgs(p))).content_deleted,true);};
      failPutAfterAcceptance=unknown;
      await assert.rejects(dedao.uploadDedaoChunk(owner,{batch_id:fixture.batch_id,claim_token:fixture.claim_token,execution_id:fixture.execution_id,ordinal:1,offset:pair.bytes.length,base64:Buffer.from(lateBytes).toString('base64')}),/永久|purge|deleted|未确认|SYNTHETIC_R2_PUT_RESPONSE_UNKNOWN|找到/i);
      failPutAfterAcceptance=false;
      assert.equal(await r2.head(lateKey),null);await assertDedaoGone(fixture);
      assert.equal((await read(owner,p.operation_id)).content_deleted,true);
      const putsBefore=metrics.r2_put;
      await assert.rejects(dedao.uploadDedaoChunk(owner,{batch_id:fixture.batch_id,claim_token:fixture.claim_token,execution_id:fixture.execution_id,ordinal:1,offset:pair.bytes.length,base64:Buffer.from(lateBytes).toString('base64')}));
      assert.equal(metrics.r2_put,putsBefore);
      assert.equal(await count('dedao_native_lifecycle','owner=?',[owner]),0,'content fences never invent an external native executor end');
    }
  });

  await scenario('1000 real R2 objects use bounded continuations without early article deletion',async()=>{
    const owner='SYNTHETIC_THOUSAND',a=await seedArticle(owner,{output:false});
    const extra=Array.from({length:996},(_,i)=>({key:`articles/${a.id}/checkpoints/${uuid()}/${i}-${sha}`,bytes:new TextEncoder().encode(BODY+' '+i)}));
    for(let i=0;i<extra.length;i+=32)await Promise.all(extra.slice(i,i+32).map(file=>r2.put(file.key,file.bytes)));
    const p=await measured('1000.preview',()=>previewArticleContentDeletion(owner,uuid()));
    assert.equal(p.file_count,1000);assert.equal(p.content_deleted,false);
    const first=await measured('1000.first-confirm',()=>confirmArticleContentDeletion(owner,confirmArgs(p)));
    assert.equal(first.content_deleted,false);assert.equal(first.remaining_object_count,872);
    assert.equal((await row('articles',owner,a.id)).state,'deleting');
    assert.equal(first.current_owner_article_count,1);
    const finished=await complete(owner,p);
    assert.equal(finished.content_deleted,true);assert.equal(finished.remaining_object_count,0);
    assert.equal(await row('articles',owner,a.id),null);
    for(const budget of budgets.filter(row=>row.phase.startsWith('1000.'))){
      const countedRequests=budget.d1_calls+budget.r2_list+budget.r2_head+budget.r2_get+budget.r2_put+budget.r2_delete;
      assert.ok(countedRequests<900,'observed calls stay inside the conservative synthetic request budget');
    }
  });

  const finishedSources=fingerprintSources(),changedSources=sourcePaths.filter(name=>finishedSources[name]!==sourceFingerprints[name]);
  if(changedSources.length&&process.env.PURGE_TEST_REPORT){
    fs.writeFileSync(process.env.PURGE_TEST_REPORT,JSON.stringify({status:'failed',failure:'source_changed_during_execution',changed_source_files:changedSources,source_stable:false,baseline:BASELINE,migration:48,migration_count:journal.entries.length,cases:results,budgets,remote_calls:remoteCalls.count},null,2)+'\n');
  }
  assert.equal(changedSources.length,0,'source files changed during execution; rerun the final frozen tree: '+changedSources.join(', '));
  const output={status:'passed',baseline:BASELINE,migration:48,migration_count:journal.entries.length,case_filter:process.env.PURGE_TEST_CASE||null,
    started_at:startedAt,finished_at:new Date().toISOString(),source_stable:true,source_fingerprints:sourceFingerprints,loaded_sources:loadedSources,
    compatibility_sources:compatibilitySources,
    backend:'actual Miniflare workerd D1/R2',remote_calls:remoteCalls.count,cases:results,budgets,
    notes:['Synthetic inputs only; no production credentials or real manuscripts','Library, local computer and external platform APIs are never called']};
  assert.equal(remoteCalls.count,0);
  if(process.env.PURGE_TEST_REPORT){fs.mkdirSync(path.dirname(process.env.PURGE_TEST_REPORT),{recursive:true});fs.writeFileSync(process.env.PURGE_TEST_REPORT,JSON.stringify(output,null,2)+'\n');}
  console.log(`PASS ${results.length} synthetic D1/R2 cases; migrations 0000–0048; remote calls=0.`);
} finally {await mf.dispose();}
