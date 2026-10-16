// Offline V91 normal-owner read and credential-source concurrency regression.
// Exact source modules, native SHA/AES/SSE and SQLite SQL; no external I/O.
// Historical authority/configuration and fixed old-body lineage are explicit mocks.
// Corrected metadata/body-mutation/final-review output is synthetic TEST FIXTURE only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const sourceRoot=process.env.TEST_SOURCE;assert.ok(sourceRoot,'Stable TEST_SOURCE must be explicit');
const outputRoot=process.env.TEST_OUTPUT||new URL('./evidence/',import.meta.url).pathname;
fs.mkdirSync(outputRoot,{recursive:true});
const native=createRequire((process.env.TEST_DEPENDENCY_ROOT||sourceRoot)+'/package.json'),ts=native('typescript'),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(sourceRoot+'/drizzle').filter(file=>file.endsWith('.sql')).sort())sql.exec(fs.readFileSync(sourceRoot+'/drizzle/'+file,'utf8'));
const fixtureRoot=process.env.TEST_FIXTURE_ROOT||'/workspace/shared',raw=name=>fs.readFileSync(fixtureRoot+'/'+name,'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const sourceRaw=raw('editorial-v81-original-revision-input.json'),snapshotRaw=raw('editorial-v81-original-snapshot.json'),bodyRaw=raw('editorial-v81-body-input.json'),bodyReceiptRaw=raw('editorial-v81-body-receipt.json');
const sourceInput=JSON.parse(sourceRaw),snapshot=JSON.parse(snapshotRaw),bodyInput=JSON.parse(bodyRaw);
const sourceHash='666e17c577fcb127411d883f2ee6f4ac3b515c2698c950f870aec73af8854b35',snapshotHash='b972524a5ce610b4a81a47ef246a97283143bc3071e3b09584b1dee5177110f0';
assert.equal(hash(sourceRaw),sourceHash);assert.equal(hash(snapshotRaw),snapshotHash);assert.equal(hash(bodyRaw),'fd2081857c752bdb6eacf6d875506436c71dc0687b631e1924e55d2e99db88d3');assert.equal(hash(bodyReceiptRaw),'4e5f8172af5ced0cb3fac275f81b0511b2ef988412f221b27a86ad62d575a8c1');
const owner='offline-v81-owner',runId=sourceInput.run_id,sourceId=sourceInput.stage_id,bodyId=bodyInput.stage_id,day=snapshot.day,model=snapshot.model;
const when='2026-10-06T19:40:00.000Z',fixedNow=Date.parse('2026-10-07T00:00:00.000Z');
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return fixedNow;}}
const secret='sk-offline-synthetic-secret-abcdefghijklmnopqrstuvwxyz',syntheticConfigKey=Buffer.alloc(32,41).toString('base64');
let prepareDepth=0,metadataMode=null,metadataCalls=0,mutationMode=null,mutationApplied=false,directSeedMutations=0,forbidApplicationWrites=false,executionFault=null;
let actualChanges=0,writes=0,providerMocks=0,network=0,bucketPuts=0,eventCalls=0,batchTail=Promise.resolve(),beforeRun=null,beforeRead=null,configValid=true;
const capturedLogs=[],uuidQueue=[],modules={},providerPayloads=[],phaseTimings=[],loadedSourceHashes={},preparedFragments={};
const nativeBuiltins=true,instrumentEnabled=false,countedSubtle=crypto.subtle,inspectionStats={},providerMetrics={fetch_calls:0};
const instrument=s=>s,phaseSource=s=>s,profileCount=()=>{},phaseMark=()=>{},providerMetric=()=>{},checkpoint=()=>{},countedJSON=JSON;
const queryStats=[];
let activePhase='setup';
const db={prepare(query){const bound=args=>({query,args,first:async()=>{queryStats.push({phase:activePhase,method:'first',query});if(beforeRead)await beforeRead(query,args);return sql.prepare(query).get(...args)||null;},all:async()=>{queryStats.push({phase:activePhase,method:'all',query});if(beforeRead)await beforeRead(query,args);return {results:sql.prepare(query).all(...args)};},run:async()=>{queryStats.push({phase:activePhase,method:'run',query});if(beforeRun)await beforeRun(query,args);writes++;assert.equal(forbidApplicationWrites,false,'Read-only scenario attempted application SQL write');const result={meta:{changes:Number(sql.prepare(query).run(...args).changes)}};actualChanges+=result.meta.changes;return result;}});return {...bound([]),bind:(...args)=>{assert.ok(args.length<=100,'D1 100-bind parameter bound');return bound(args);}};},batch(statements){const pending=batchTail.then(async()=>{sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(error){sql.exec('ROLLBACK');throw error;}});batchTail=pending.catch(()=>{});return pending;}};
const receiptId=id=>`editorial_v3:${owner}:${runId}:${id}`,row=()=>sql.prepare('SELECT * FROM editorial_runs_v3 WHERE owner=? AND id=?').get(owner,runId),step=id=>sql.prepare('SELECT * FROM editorial_stages_v3 WHERE owner=? AND id=?').get(owner,id),receipt=id=>sql.prepare('SELECT * FROM claude_attempts WHERE owner=? AND id=?').get(owner,receiptId(id));
function insert(table,value){const keys=Object.keys(value);sql.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(value));}
function safeValue(value){assert.ok(!JSON.stringify(value).includes(secret));}
function outputEvidence(value){const serialized=JSON.stringify(value);return {utf8_bytes:Buffer.byteLength(serialized),sha256:hash(serialized)};}
const realAuthorRaw=raw('claude-v3-second-author-result.json'),realAuthor=JSON.parse(realAuthorRaw),realAuthorText=JSON.stringify(realAuthor);
assert.equal(hash(realAuthorRaw),'a1c0174b192cfe4f0b7e1458d7480b3daad08a793965c2778c4375499a5cc093');assert.equal(hash(realAuthorText),'c30e3f0fdff18ebda2715b17d657da89e84d2fe09278f2ac313e4a4ed22a68fc');assert.equal(hash(realAuthor.article),'414ba5e1b53ea595e304da33a6d2c6eeb56d355dc74aef871fdb10b4f3f937eb');
const structureReport=JSON.parse(raw('claude-v3-second-structure-review.json')),factReport=JSON.parse(raw('claude-v3-second-fact-review.json')),invalidRaw=raw('claude-v3-fact-revision-returned.txt');
const providerQueue=[],wireEvidence=[];
async function offlineProviderFetch(url,options){
 if(url==='https://app.yylx.io/v1/models'){metadataCalls++;assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.ok(options.signal instanceof AbortSignal);assert.ok(metadataMode,'Unplanned metadata fixture request');if(metadataMode==='timeout'){const failure=Error('OFFLINE metadata timeout');failure.name='TimeoutError';throw failure;}return new Response('{}',{status:503,headers:{'content-type':'application/json'}});}
 providerMetrics.fetch_calls++;assert.equal(url,'https://app.yylx.io/v1/messages');assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');assert.ok(options.signal instanceof AbortSignal);
 const payload=JSON.parse(options.body);assert.equal(payload.stream,true);assert.equal(payload.model,model);assert.equal(payload.max_tokens,snapshot.capability.max_output_tokens);
 const fixture=providerQueue.shift();assert.ok(fixture,'Unexpected or automatic provider retry');
 const frames=[{type:'message_start',message:{id:'offline-v87-message',type:'message',role:'assistant',model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:101,output_tokens:0}}},{type:'content_block_start',index:0,content_block:{type:'text',text:''}}];
 for(let at=0;at<fixture.text.length;at+=2048)frames.push({type:'content_block_delta',index:0,delta:{type:'text_delta',text:fixture.text.slice(at,at+2048)}});
 frames.push({type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:202,output_tokens_details:{thinking_tokens:3}}},{type:'message_stop'});
 const bytes=new TextEncoder().encode(frames.map(packet=>'event: '+packet.type+'\ndata: '+JSON.stringify(packet)+'\n\n').join(''));
 wireEvidence.push({label:fixture.label,synthetic_transport:true,body_is_synthetic:fixture.synthetic===true,text_sha256:hash(fixture.text),wire_sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 let at=0;return new Response(new ReadableStream({pull(controller){if(at>=bytes.length){controller.close();return;}controller.enqueue(bytes.subarray(at,Math.min(at+4096,bytes.length)));at+=4096;}}),{status:200,headers:{'content-type':'text/event-stream; charset=utf-8'}});
}
let preparedClaude;
function loadPreparedClaude() {
 if (preparedClaude) return preparedClaude;
 const source=fs.readFileSync(sourceRoot+'/lib/claude.ts','utf8');
 loadedSourceHashes['lib/claude.ts']=hash(source);
 const ast=ts.createSourceFile('claude.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const names=new Set(['settings','sha256','key','decrypt','protectPreparedArticleForOwner','createPreparedArticleCredentialInspector','outlineProviderConfiguration','readOutlineProviderBody','requestOutlineClaudeOnce','providerOutputText','extractPartialProviderText','extractPartialUsage','readLimited','readClaudeOutputCapability']);
 const selected=[];
 for(const statement of ast.statements) if(ts.isFunctionDeclaration(statement)&&names.has(statement.name?.text)) {
  const exact=source.slice(statement.getStart(ast),statement.end);selected.push(exact);preparedFragments[statement.name.text]=hash(exact);
 }
 for(const name of names)assert.ok(preparedFragments[name],'Exact production helper missing: '+name);
 const exports={};
 const imports="import {credentialSourceChanged} from './credential-source-change';\nimport {bindingCheckFailure} from './editorial-binding-diagnostics';\nimport {env} from 'cloudflare:workers';\nimport {db} from './test-store';\nimport {inspectCredentialValue,numericCredentialSafeUsage} from './credential-boundary';\nimport {CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED,claudeOutputLimitEvidence,CLAUDE_OUTLINE_CONFIGURATION_CHANGED,CLAUDE_OUTLINE_INPUT_INVALID,CLAUDE_OUTLINE_INPUT_UNSAFE,CLAUDE_OUTLINE_RESPONSE_UNSAFE,CLAUDE_OUTLINE_REQUEST_FAILED,CLAUDE_OUTLINE_PARAMETERS_REJECTED,CLAUDE_OUTLINE_OUTPUT_TRUNCATED,isClaudeModelId,isOutputTokenLimit,parseUnambiguousClaudeJSON,outlineNumericUsage,partialOutlineUsage} from './claude-model-capability';\nimport {OutlineMessageStream} from './claude-outline-stream';\nimport {inspectStreamCredentialValue} from './stream-credential-buffer';\nconst ORIGIN='https://app.yylx.io';\n";
 const preparedCrypto={subtle:countedSubtle};
 vm.runInNewContext(ts.transpileModule(instrument(phaseSource(imports+selected.join('\n'),'claude'),'claude'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,__profileCount:profileCount,__phaseMark:phaseMark,__providerMetric:providerMetric,__providerSafety:evidence=>{providerMetrics.safety_evidence=evidence;},JSON:nativeBuiltins?JSON:countedJSON,crypto:preparedCrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,Error,atob,btoa,AbortController,AbortSignal,ReadableStream,Response,Request,URL,setTimeout,clearTimeout,setInterval,clearInterval,console:{error:(...args)=>capturedLogs.push(args),info:(...args)=>capturedLogs.push(args)},fetch:offlineProviderFetch,
  require:path=>path==='cloudflare:workers'?{env:{DB:db,CLAUDE_CONFIG_KEY:syntheticConfigKey}}:load(path.slice(2))},{filename:sourceRoot+'/lib/claude.ts'});
 // Production metadata helper executes only against explicitly selected synthetic GET fixtures.
 const originalRequest=exports.requestOutlineClaudeOnce;
 exports.requestOutlineClaudeOnce=async(claimedOwner,payload,...rest)=>{assert.equal(claimedOwner,owner);providerMocks++;providerPayloads.push(outputEvidence(payload));const expected=providerQueue[0];assert.ok(expected);const result=await originalRequest(claimedOwner,payload,...rest);assert.equal(result.state,'completed');assert.equal(result.text,expected.text);assert.equal(result.diagnostic.eof_received,true);assert.equal(result.diagnostic.message_stop_received,true);assert.equal(result.diagnostic.stop_reason,'end_turn');assert.equal(result.diagnostic.raw_retained,false);return result;};
 preparedClaude=exports;return exports;
}
function counted(name,method,fn){if(nativeBuiltins)return fn;return function(...args){const key=name+'.'+method;inspectionStats[key]=(inspectionStats[key]||0)+1;return fn(...args);};}
function load(name) {
 if (modules[name]) return modules[name]; const exports = {}; modules[name] = exports;
 let source=fs.readFileSync(sourceRoot+'/lib/'+name+'.ts','utf8');loadedSourceHashes['lib/'+name+'.ts']=hash(source);
 // Only an in-memory white-box constructor for correctly seeded prior history.
 // APIs under test are unmodified. The local transport copy reaches paid guards
 // with a mock provider; no source/live gate or production nonce is changed.
 // No test export injection is needed for the normal-owner pipeline.

 vm.runInNewContext(ts.transpileModule(instrument(phaseSource(source,name),name), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
  exports,__profileCount:profileCount,__phaseMark:phaseMark,__providerMetric:providerMetric,__providerSafety:evidence=>{providerMetrics.safety_evidence=evidence;},JSON:nativeBuiltins?JSON:countedJSON, crypto: {subtle: countedSubtle, randomUUID: () => uuidQueue.length ? uuidQueue.shift() : crypto.randomUUID()}, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Date:FixedDate, Error, URL, Request, Response, File, AbortController, AbortSignal, ReadableStream, setTimeout, clearTimeout, setInterval, clearInterval,
  atob,btoa, console: {error:(...args)=>capturedLogs.push(args),info:(...args)=>capturedLogs.push(args)},
  require: path => path==='cloudflare:workers'?{env:{DB:db}}:path === './test-store' ? load('test-store') : path === './claude' ? loadPreparedClaude() : path === './articles' ? {bucket: () => ({put: async () => {bucketPuts++;}})} : path === './events' ? {readiness: async () => ({connected: true}), dispatch: async () => {eventCalls++; return '事件已送达，offline mock';}} : path.startsWith('./') ? load(path.slice(2)) : native(path),
  fetch: offlineProviderFetch,
 },{filename:sourceRoot+'/lib/'+name+'.ts'});
 if (name === 'editorial-body-continuation') {
  const oldBodyId = '5b4832c6-4fbf-4f48-b4cf-fd5b927f71ee';
  async function verifyOldBody(claimedOwner, plan, newStageId, deps) {
   assert.equal(claimedOwner, owner); assert.equal(plan.row.id, runId); assert.equal(newStageId, bodyId);
   const old = step(oldBodyId), current = step(bodyId), grant = sql.prepare('SELECT * FROM editorial_body_continuations_v3 WHERE owner=? AND new_stage_id=?').get(owner, bodyId);
   assert.ok(grant); assert.equal(grant.failed_stage_id, oldBodyId); assert.equal(grant.state, 'allocated');
   assert.equal(old.state, 'technical_failed'); assert.equal(old.artifact_json, null);
   assert.equal(old.input_sha256, '41a5bcfc3af48eb5d4f42e5719e81003519bc6ca5b1daaf77e2779fe773bb382'); assert.equal(hash(old.input_json), old.input_sha256);
   assert.equal(current.input_json, bodyRaw); assert.equal(current.input_sha256, hash(bodyRaw)); assert.equal(grant.new_token_sha256, hash(current.token));
   assert.equal(hash(receipt(bodyId).response), hash(bodyReceiptRaw)); assert.equal(hash(grant.frozen_json), grant.frozen_sha256);
   const packet = JSON.parse(receipt(oldBodyId).response); assert.equal(packet.state, 'failed');
   for (const key of ['text','partial_text','raw_response','raw_partial_response']) assert.equal(packet[key], null);
   await deps.assertSafe(owner, packet);
   return {lineage_verified: true, old_body_fixture_only: true};
  }
  exports.verifyEditorialBodyContinuationLineage = verifyOldBody;
  exports.isDiscardedBodyFailureCoveredByContinuation = async (claimedOwner, plan, oldStageId, response, deps) => {
   try {if (oldStageId !== oldBodyId || receipt(oldBodyId)?.response !== response) return false; await verifyOldBody(claimedOwner, plan, bodyId, deps); return true;} catch {return false;}
  };
 }
 if (name === 'editorial-authority-v3') {
  // The historical production grant is not recreated from unseen credentials.
  // Its ordinary owner-scoped read/configuration checks are an explicit mock;
  // actual runtime/new-scope lineage and all byte hashes remain real.
  exports.loadEditorialRunV3 = async (claimedOwner, id) => {assert.equal(claimedOwner, owner); assert.equal(id, runId); const value = row(); assert.ok(value); assert.equal(hash(value.input_json), value.input_sha256); assert.equal(hash(value.snapshot_json), snapshotHash); return {row: value};};
  exports.assertEditorialRunAuthorityV3 = async (claimedOwner, id) => {assert.equal(claimedOwner, owner); assert.equal(id, runId); assert.equal(sql.prepare('SELECT state FROM editorial_authority_v3 WHERE owner=?').get(owner).state, 'active'); assert.equal(configValid,true,'MOCK historical configuration changed'); if(prepareDepth&&metadataMode)await loadPreparedClaude().readClaudeOutputCapability(owner,model); return {row: row()};};
  exports.assertEditorialV3FailedWriterContinuationConfiguration = async (claimedOwner,id) => {assert.equal(claimedOwner,owner);assert.equal(id,runId);assert.equal(row().state,'technical_failed');assert.equal(sql.prepare('SELECT state FROM editorial_authority_v3 WHERE owner=?').get(owner).state,'active');assert.equal(configValid,true,'MOCK historical configuration changed');assert.equal(hash(row().snapshot_json),snapshotHash);return {row:row()};};
 }
 for(const method of name==='credential-boundary'?['inspectCredentialValue']:name==='editorial-credential-text'?['editorialCredentialInspection','editorialCredentialVariants']:[])if(typeof exports[method]==='function')exports[method]=counted(name,method,exports[method]);
 if(!nativeBuiltins&&name==='editorial-credential-boundary'&&typeof exports.createEditorialCredentialScanContext==='function') {
  const factory=exports.createEditorialCredentialScanContext;
  exports.createEditorialCredentialScanContext=async(...args)=>{inspectionStats.context_created=(inspectionStats.context_created||0)+1;const real=await factory(...args);return Object.freeze({inspect:counted('context','inspect',real.inspect),assertFresh:counted('context','assertFresh',real.assertFresh)});};
 }
 if(name==='claude-model-capability'){const original=exports.parseUnambiguousClaudeJSON;exports.parseUnambiguousClaudeJSON=function(...args){providerMetrics.json_packet_parse_calls++;return original(...args);};}return exports;
}
function route(relative){
 const exports={},code=fs.readFileSync(sourceRoot+'/'+relative,'utf8');loadedSourceHashes[relative]=hash(code);
 const unrelated=new Proxy({}, {get:(_target,key)=>String(key).endsWith('Tools')?[]:key==='mcpSseProbeTool'?{name:'offline-unrelated-probe'}:key==='retiredGenerationNames'?[]:async()=>{throw Error('Unrelated MCP family must not execute');}});
 vm.runInNewContext(ts.transpileModule(instrument(phaseSource(code,relative),relative),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,__profileCount:profileCount,__phaseMark:phaseMark,__providerMetric:providerMetric,__providerSafety:evidence=>{providerMetrics.safety_evidence=evidence;},JSON:nativeBuiltins?JSON:countedJSON,crypto:{subtle:countedSubtle,randomUUID:crypto.randomUUID.bind(crypto)},TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,Error,URL,Request,Response,File,AbortController,AbortSignal,ReadableStream,setTimeout,clearTimeout,setInterval,clearInterval,console:{error:(...args)=>capturedLogs.push(args),info:(...args)=>capturedLogs.push(args)},require:path=>{
  const name=path.split('/').at(-1);
  if(name==='test-store')return load('test-store');
  if(['editorial-v3-runtime','editorial-authority-v3','editorial-failed-writer-continuation-v3','editorial-revision-continuation-v3','editorial-cloud-http-v3','editorial-body-continuation','editorial-cloud-execution-diagnostics-v3'].includes(name))return load(name);
  return unrelated;
 },fetch:()=>{network++;throw Error('External network forbidden');}},{filename:sourceRoot+'/'+relative});
 return exports;
}
const mcpRoute=route('app/mcp/route.ts');
let requestId=0;
async function mcpResult(name,args,authenticatedOwner=owner){
 const started=Date.now(),response=await mcpRoute.POST(new Request('https://offline.invalid/mcp',{method:'POST',headers:{'content-type':'application/json',...(authenticatedOwner?{'oai-authenticated-user-id':authenticatedOwner}:{}),'x-owner':owner,'authorization':'serviceaccess synthetic'},body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method:'tools/call',params:{name,arguments:args}})}));
 phaseTimings.push({phase:'owner_mcp',name,elapsed_ms:Date.now()-started});if(response.status!==200)return {http_status:response.status};return (await response.json()).result;
}
async function mcp(name,args){const result=await mcpResult(name,args);assert.equal(result.isError,undefined,result.content?.[0]?.text);return JSON.parse(result.content[0].text);}
async function mcpReject(name,args,authenticatedOwner=owner){const result=await mcpResult(name,args,authenticatedOwner);assert.ok(result.isError===true||result.http_status>=400,JSON.stringify({name,isError:result.isError,http_status:result.http_status,text:result.content?.[0]?.text?.slice(0,160)}));return result;}
const authority=load('editorial-authority-v3'),runtime=load('editorial-v3-runtime'),cloud=load('editorial-cloud-http-v3');
const apiRoute=route('app/api/editorial-v3-cloud/route.ts');
const tables=['articles','writing_runs','editorial_failed_writer_cloud_delegations_v3','editorial_failed_writer_continuations_v3','editorial_revision_continuations_v3','editorial_revision_cloud_delegations_v3','editorial_cloud_delegations_v3','editorial_body_continuations_v3','editorial_stages_v3','editorial_runs_v3','editorial_authority_v3','claude_attempts','workflow_controls'];
const poolTables=['claude_settings','topic_research_outbox','editorial_requests','editorial_stages','article_claim_credential_hashes','article_upload_attempts','article_deliveries','outline_flow_stages','editorial_agent_claim_recoveries_v3'];
const authorizedPath=process.env.TEST_AUTHORIZED_FIXTURE;assert.ok(authorizedPath,'Exact authorized fixture path must be explicit');
const authorizedRaw=fs.readFileSync(authorizedPath,'utf8'),authorized=JSON.parse(authorizedRaw);
assert.equal(hash(authorizedRaw),'9b93cc2cf8022cd3b08b74b16a80e8b1a879dbb4f678dab8eff437d5eb579f72');
assert.equal(authorized.owner,owner);assert.equal(authorized.run_id,runId);
function captureRows(){return Object.fromEntries([...tables,...poolTables].map(table=>[table,sql.prepare('SELECT * FROM '+table).all()]));}
function restoreRows(rows){beforeRead=null;beforeRun=null;metadataMode=null;mutationMode=null;mutationApplied=false;executionFault=null;forbidApplicationWrites=false;uuidQueue.length=0;providerQueue.length=0;for(const table of [...tables,...poolTables])sql.exec('DELETE FROM '+table);for(const [table,values]of Object.entries(rows))for(const value of values)insert(table,value);}
function durable(){return hash(captureRows());}
let prepareCalls=0,executeCalls=0;
const originalPrepare=runtime.prepareEditorialV3Stage;
runtime.prepareEditorialV3Stage=async(...args)=>{prepareCalls++;prepareDepth++;try{return await originalPrepare(...args);}finally{prepareDepth--;}};
const originalExecution=runtime.executeEditorialV3Stage;
runtime.executeEditorialV3Stage=async(...args)=>{executeCalls++;if(executionFault)throw executionFault;return originalExecution(...args);};
const boundary=load('editorial-credential-boundary'),originalFactory=boundary.createEditorialCredentialScanContext;
boundary.createEditorialCredentialScanContext=async(...args)=>{const real=await originalFactory(...args),duringPrepare=prepareDepth>0;return Object.freeze({inspect:real.inspect,assertFresh:async()=>{if(duringPrepare&&mutationMode&&!mutationApplied){mutationApplied=true;if(mutationMode==='new_credential'){insert('editorial_stages',{id:'offline-new-legacy-credential',owner,run_id:runId,stage:'offline_freshness_pool_fixture',token:'f702e0fa-bac8-4a1c-bb89-999999999999',input_json:'{}',input_sha256:hash('{}'),state:'claimed',created:when,updated:when});}else if(mutationMode==='fingerprint'){sql.prepare('UPDATE claude_settings SET updated=? WHERE owner=?').run('OFFLINE changed fixture fingerprint',owner);}else throw Error('Unknown mutation fixture');directSeedMutations++;}return real.assertFresh();}});};
const credentials=lease=>({stage_id:lease.stage_id,token:lease.token});
const observations=[];let baseline,lease,error=null;
function counters(){return {writes,actualChanges,provider:providerMetrics.fetch_calls,metadata:metadataCalls,prepare:prepareCalls,execute:executeCalls,queries:queryStats.length,logs:capturedLogs.length,seed:directSeedMutations};}
function delta(before){const after=counters();return Object.fromEntries(Object.entries(after).map(([k,v])=>[k,v-before[k]]));}
function safeResult(value){safeValue(value);const raw=JSON.stringify(value);for(const forbidden of [lease?.token,'offline-opaque-production-inspection-key-741329'])if(forbidden)assert.ok(!raw.includes(forbidden),'No nonce/configured credential may appear in report');}
async function getPreflight(extra=''){const response=await apiRoute.GET(new Request('https://offline.invalid/api/editorial-v3-cloud?stage_id='+lease.stage_id+'&action=preflight'+extra,{headers:{'x-editorial-stage-token':lease.token}}));const result=await response.json();safeResult(result);return {status:response.status,result};}
async function postReal(){const response=await apiRoute.POST(new Request('https://offline.invalid/api/editorial-v3-cloud',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(credentials(lease))}));const frames=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));safeResult(frames);return {status:response.status,frames,terminal:frames.at(-1)};}
async function observe(name,work){restoreRows(baseline);activePhase=name;const before=counters(),beforeHash=durable();try{const facts=await work({before,beforeHash});const measured=delta(before);observations.push({name,passed:true,...facts,counts:measured,query_sha256:hash(queryStats.slice(before.queries).map(({method,query})=>({method,query}))),logs:capturedLogs.slice(before.logs).map(args=>args.map(value=>{try{return JSON.parse(value);}catch{return 'non_json_log';}}))});console.log(JSON.stringify({name,passed:true,...measured}));}catch(caught){observations.push({name,passed:false,error:caught.message,counts:delta(before)});throw caught;}finally{beforeRead=null;beforeRun=null;forbidApplicationWrites=false;metadataMode=null;mutationMode=null;executionFault=null;activePhase='idle';}}

const frozenPath=process.env.TEST_DELEGATED_FIXTURE;assert.ok(frozenPath);const frozenRaw=fs.readFileSync(frozenPath,'utf8'),frozen=JSON.parse(frozenRaw);
let scenario='none',contexts=0,freshCalls=0,unsafeHits=0,mutations=0,dependencyFailures=0;
const realFactory=boundary.createEditorialCredentialScanContext;
boundary.createEditorialCredentialScanContext=async(...args)=>{contexts++;const ctx=await realFactory(...args);return Object.freeze({inspect:async(...args)=>{const hit=await ctx.inspect(...args);unsafeHits+=Number(hit);return hit;},assertFresh:async()=>{
 freshCalls++;
 if(scenario==='forged_message')throw Error('credential_source_changed');
 if(scenario==='forged_properties')throw Object.assign(Error('test-only'),{credential_source_changed:true,code:'credential_source_changed'});
 if(scenario==='dependency_failure')beforeRead=async query=>{if(query.startsWith('SELECT claim_hash FROM editorial_requests')){dependencyFailures++;throw Error('credential_source_changed');}};
 const shouldMutate=['unrelated_once','unrelated_twice','referenced_token','referenced_hash','prepared_pool'].includes(scenario)&&(mutations===0||scenario==='unrelated_twice');
 if(shouldMutate){const token=scenario.startsWith('referenced')?frozen.rows.editorial_stages_v3[0].id:('f702e0fa-bac8-4a1c-bb89-'+String(987654321000+mutations).padStart(12,'0'));
  if(scenario==='referenced_hash')insert('editorial_requests',{id:'offline-added-request',owner,request_key:'offline-added-request',input_json:'{}',input_sha256:hash('{}'),state:'pending',claim_hash:hash(token),progress_json:'{}',dispatch_state:'none',expires:'2026-10-08T00:00:00.000Z',created:when,updated:when});
  else if(scenario==='prepared_pool')sql.prepare('UPDATE claude_settings SET updated=? WHERE owner=?').run('offline-fresh-pool-change',owner);
  else insert('editorial_stages',{id:'offline-other-stage-'+mutations,owner,run_id:runId,stage:'offline_other_workflow_'+mutations,token,input_json:'{}',input_sha256:hash('{}'),state:'claimed',created:when,updated:when});
  mutations++;directSeedMutations++;
 }
 if(scenario==='hit_then_remove'&&!mutations){sql.prepare('DELETE FROM editorial_stages WHERE id=?').run('offline-initial-unsafe-pool');mutations++;directSeedMutations++;}
 return ctx.assertFresh();
 }});};
function reset(mode){restoreRows(frozen.rows);baseline=captureRows();lease=frozen.lease;scenario=mode;contexts=0;freshCalls=0;unsafeHits=0;mutations=0;dependencyFailures=0;forbidApplicationWrites=true;}
let baselineOutput;
const results=[];
async function check(name,mode,call,expected){if(process.env.TEST_ONLY&&!name.includes(process.env.TEST_ONLY))return;reset(mode);const before=counters(),start=process.cpuUsage();let value,error;
 if(mode==='hit_then_remove'){for(const table of ['editorial_failed_writer_cloud_delegations_v3','editorial_failed_writer_continuations_v3','editorial_revision_continuations_v3','editorial_revision_cloud_delegations_v3','editorial_cloud_delegations_v3','editorial_body_continuations_v3'])sql.exec('DELETE FROM '+table);sql.prepare('DELETE FROM editorial_stages_v3 WHERE owner=? AND sequence>=4').run(owner);sql.prepare("UPDATE editorial_runs_v3 SET state='body',round=1 WHERE owner=?").run(owner);lease.stage_id=frozen.rows.editorial_stages_v3[0].id;insert('editorial_stages',{id:'offline-initial-unsafe-pool',owner,run_id:runId,stage:'offline_other_workflow',token:lease.stage_id,input_json:'{}',input_sha256:hash('{}'),state:'claimed',created:when,updated:when});}
 try{value=await call();}catch(caught){error=caught;}
 const cpu=process.cpuUsage(start),result={name,contexts,fresh_calls:freshCalls,unsafe_hits:unsafeHits,mutations,dependency_failures:dependencyFailures,passed_read:!!value,error_code:error?runtime.editorialV3PublicError(error):null,counts:delta(before),cpu_seconds:(cpu.user+cpu.system)/1e6};
 assert.equal(result.counts.writes,0);assert.equal(result.counts.provider,0);assert.equal(result.counts.metadata,0);assert.equal(result.counts.execute,0);
 if(value){safeResult(value);result.output=outputEvidence(value);result.content_suppressed=value.content_suppressed;}
 await expected(result,value,error);results.push(result);console.log(JSON.stringify(result));
}
const normalRead=()=>runtime.readEditorialV3WithFreshCredentials(owner,{run_id:runId});
await check('unchanged pools retain exact full output','none',normalRead,(r,v)=>{assert.equal(r.contexts,1);assert.equal(r.passed_read,true);assert.equal(v.content_suppressed,false);baselineOutput=r.output;});
await check('normal owner MCP read retries only verified unrelated pool change','unrelated_once',async()=>mcp('read_editorial_v3',{run_id:runId}),(r,v)=>{assert.equal(r.contexts,2);assert.equal(r.fresh_calls,2);assert.equal(r.unsafe_hits,0);assert.equal(v.content_suppressed,false);assert.deepEqual(r.output,baselineOutput);});
await check('second pool change fails after exactly two fresh reads','unrelated_twice',normalRead,r=>{assert.equal(r.passed_read,false);assert.equal(r.contexts,2);assert.equal(r.fresh_calls,2);assert.equal(r.error_code,'编辑V3凭证来源在校验期间变化，请只读重新对账');});
for(const mode of ['referenced_token','referenced_hash'])await check('new '+mode+' cannot release formerly scanned history',mode,normalRead,(r,v)=>{assert.equal(r.contexts,2);assert.ok(r.unsafe_hits>0);assert.equal(v,undefined);assert.equal(r.passed_read,false);});
await check('prepared configuration fingerprint changes use the same private brand','prepared_pool',normalRead,(r,v)=>{assert.equal(r.contexts,2);assert.equal(r.fresh_calls,2);assert.equal(v.content_suppressed,false);assert.deepEqual(r.output,baselineOutput);});
for(const mode of ['forged_message','forged_properties','dependency_failure'])await check(mode+' never triggers another read',mode,normalRead,r=>{assert.equal(r.contexts,1);assert.equal(r.passed_read,false);assert.equal(r.error_code,'编辑V3内容安全校验未通过');});
await check('first unsafe input wins even when matching pool entry is removed','hit_then_remove',normalRead,(r,v)=>{assert.equal(r.contexts,1);assert.equal(r.mutations,1);assert.equal(r.fresh_calls,1);assert.ok(r.unsafe_hits>0);assert.equal(r.passed_read,false);assert.equal(v,undefined);assert.equal(r.error_code,'编辑V3内容安全校验未通过');});
await check('internal post-save projection retains its original one-read gate','unrelated_once',()=>runtime.readEditorialV3(owner,{run_id:runId}),r=>{assert.equal(r.contexts,1);assert.equal(r.passed_read,false);assert.equal(r.error_code,'编辑V3凭证来源在校验期间变化，请只读重新对账');});
await check('paid preparation does not retry or reserve on pool change','unrelated_once',()=>runtime.prepareEditorialV3Stage(owner,{run_id:runId,...credentials(lease),expected_model:model,expected_input_sha256:lease.input_sha256,confirm:true}),r=>{assert.equal(r.contexts,1);assert.equal(r.passed_read,false);assert.equal(r.counts.actualChanges,0);});
const brands=load('credential-source-change');assert.equal(brands.isCredentialSourceChanged(brands.credentialSourceChanged()),true);for(const e of [Error('credential_source_changed'),{message:'credential_source_changed'},new Proxy({},{get(){throw Error('getter must not execute');}})])assert.equal(brands.isCredentialSourceChanged(e),false);
const report={version:91,passed:true,checks:results.length,results,fixture_sha256:hash(frozenRaw),source_hashes:loadedSourceHashes,provider_posts:providerMetrics.fetch_calls,external_network_calls:network,explicit_mocks:['SQLite D1 adapter','cached original authority/configuration and old-body lineage','synthetic credentials and deterministic pool mutation'],qualification:'Exact current source read/scan/lineage and normal owner MCP routing; no provider, application writes or real production pools. Mutations are offline fixture edits, separated from application writes. Does not prove the cause of the historical production error.'};assert.equal(network,0);assert.equal(report.provider_posts,0);for(const [file,digest]of Object.entries(loadedSourceHashes))assert.equal(hash(fs.readFileSync(sourceRoot+'/'+file,'utf8')),digest);fs.writeFileSync(path.join(outputRoot,'read-freshness-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:results.length,provider_posts:0,external_network_calls:0}));
