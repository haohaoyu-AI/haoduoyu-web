// Offline V84 read/normal-claim performance and safety regression harness.
// Reuses the V83 source loader, exact fixtures, historical authority/body mocks
// and authenticated owner MCP route. No HTTP consumer or provider execution.
// SQL and pure inspection counts describe this offline adapter, not production
// latency. Real protectPrepared function texts/settings/decrypt/leases run here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const sourceRoot=process.env.TEST_SOURCE || new URL('..',import.meta.url).pathname.replace(/\/$/u,'');
const onlyIndex=process.argv.indexOf('--only'),caseFilter=process.env.TEST_V84_FILTER||process.env.TEST_V83_FILTER||process.env.TEST_CASE||(onlyIndex>=0?process.argv[onlyIndex+1]:'');
const fixtureRoot = process.env.TEST_V81_FIXTURE_ROOT || '/workspace/shared';
const queryStats=[], inspectionStats={}, preparedFragments={}; let activePhase='setup';
const native = createRequire(sourceRoot + '/package.json'), ts = native('typescript'), sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync(sourceRoot + '/drizzle').filter(file => file.endsWith('.sql')).sort()) sql.exec(fs.readFileSync(sourceRoot + '/drizzle/' + file, 'utf8'));
const raw = name => fs.readFileSync(fixtureRoot + '/' + name, 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const harnessScriptSha256=hash(fs.readFileSync(new URL(import.meta.url),'utf8'));
const sourceRaw = raw('editorial-v81-original-revision-input.json'), snapshotRaw = raw('editorial-v81-original-snapshot.json'), bodyRaw = raw('editorial-v81-body-input.json'), bodyReceiptRaw = raw('editorial-v81-body-receipt.json');
const sourceInput = JSON.parse(sourceRaw), snapshot = JSON.parse(snapshotRaw), bodyInput = JSON.parse(bodyRaw), history = JSON.parse(raw('editorial-v81-history-projection.json'));
const sourceHash = '666e17c577fcb127411d883f2ee6f4ac3b515c2698c950f870aec73af8854b35', snapshotHash = 'b972524a5ce610b4a81a47ef246a97283143bc3071e3b09584b1dee5177110f0';
assert.equal(hash(sourceRaw), sourceHash); assert.equal(hash(snapshotRaw), snapshotHash);
assert.equal(hash(bodyRaw), 'fd2081857c752bdb6eacf6d875506436c71dc0687b631e1924e55d2e99db88d3');
assert.equal(hash(bodyReceiptRaw), '4e5f8172af5ced0cb3fac275f81b0511b2ef988412f221b27a86ad62d575a8c1');
const owner = 'offline-v81-owner', runId = sourceInput.run_id, sourceId = sourceInput.stage_id, bodyId = bodyInput.stage_id, day = snapshot.day, model = snapshot.model;
const secret = 'sk-offline-synthetic-secret-abcdefghijklmnopqrstuvwxyz';
const when = '2026-10-06T19:40:00.000Z', expires = '2099-01-01T00:00:00.000Z';
let actualChanges=0,writes = 0, providerMocks = 0, network = 0, bucketPuts = 0, eventCalls = 0, batchTail = Promise.resolve(), providerMode = 'completed', providerOutput = null, beforeRun = null, beforeRead = null, providerHook = null, configValid = true, deferRecovery = false, expectedPayload = null;
const capturedLogs=[],uuidQueue=[],modules={},providerPayloads=[],phaseTimings=[],loadedSourceHashes={};
const fixedNow=Date.parse('2026-10-07T00:00:00.000Z');
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return fixedNow;}}
function queryClass(query) {
 if (/FROM claude_settings/u.test(query)) return 'credential.settings';
 if (/FROM writing_runs.*UNION/u.test(query)) return 'credential.prepared_leases';
 if (/SELECT claim_hash FROM editorial_requests/u.test(query)) return 'credential.editorial_claim_hashes';
 if (/SELECT token FROM editorial_stages_v3/u.test(query)) return 'credential.v3_stage_tokens';
 if (/SELECT token FROM editorial_stages WHERE/u.test(query)) return 'credential.legacy_stage_tokens';
 if (/FROM topic_research_outbox/u.test(query)) return 'credential.research_leases';
 if (/FROM workflow_controls|SELECT state FROM editorial_authority_v3/u.test(query)) return 'live_control_authority';
 if (/claude_attempts/u.test(query)) return 'receipt';
 if (/continuations|delegations/u.test(query)) return 'lineage';
 return 'other';
}
function countQuery(query,method) {queryStats.push({phase:activePhase,method,kind:queryClass(query),query});}
const db = {
 prepare(query) {
  const bound=args=>({query,args,
   first:async()=>{countQuery(query,'first');if(beforeRead)await beforeRead(query,args);return sql.prepare(query).get(...args)||null;},
   all:async()=>{countQuery(query,'all');if(beforeRead)await beforeRead(query,args);return {results:sql.prepare(query).all(...args)};},
   run:async()=>{countQuery(query,'run');if(beforeRun)await beforeRun(query,args);writes++;const result={meta:{changes:Number(sql.prepare(query).run(...args).changes)}};actualChanges+=result.meta.changes;return result;}
  });
  return {...bound([]),bind:(...args)=>{assert.ok(args.length<=100);return bound(args);}};
 },
 batch(statements) {const pending=batchTail.then(async()=>{sql.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sql.exec('COMMIT');return out;}catch(error){sql.exec('ROLLBACK');throw error;}});batchTail=pending.catch(()=>{});return pending;}
};
const receiptId = id => `editorial_v3:${owner}:${runId}:${id}`;
const row = () => sql.prepare('SELECT * FROM editorial_runs_v3 WHERE owner=? AND id=?').get(owner, runId);
const step = id => sql.prepare('SELECT * FROM editorial_stages_v3 WHERE owner=? AND id=?').get(owner, id);
const receipt = id => sql.prepare('SELECT * FROM claude_attempts WHERE owner=? AND id=?').get(owner, receiptId(id));
function insert(table, value) {const keys = Object.keys(value); sql.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(value));}
function safeValue(value) {assert.ok(!JSON.stringify(value).includes(secret));}
// Execute the exact source AST function texts, including real settings, lease
// queries and AES-GCM decrypt, without importing unrelated provider workflows.
// No credential helper is replaced by a false-returning mock.
let preparedClaude;
function loadPreparedClaude() {
 if (preparedClaude) return preparedClaude;
 const source=fs.readFileSync(sourceRoot+'/lib/claude.ts','utf8');
 loadedSourceHashes['lib/claude.ts']=hash(source);
 const ast=ts.createSourceFile('claude.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const names=new Set(['settings','sha256','key','decrypt','protectPreparedArticleForOwner','createPreparedArticleCredentialInspector']);
 const selected=[];
 for(const statement of ast.statements) if(ts.isFunctionDeclaration(statement)&&names.has(statement.name?.text)) {
  const exact=source.slice(statement.getStart(ast),statement.end);selected.push(exact);preparedFragments[statement.name.text]=hash(exact);
 }
 for(const name of ['settings','sha256','key','decrypt','protectPreparedArticleForOwner']) assert.ok(preparedFragments[name],'Exact production helper missing: '+name);
 const exports={};
 const preparedCrypto={subtle:{importKey:crypto.subtle.importKey.bind(crypto.subtle),digest:crypto.subtle.digest.bind(crypto.subtle),decrypt:(...args)=>{inspectionStats.real_aes_gcm_decrypt=(inspectionStats.real_aes_gcm_decrypt||0)+1;return crypto.subtle.decrypt(...args);}}};
 vm.runInNewContext(ts.transpileModule("import {env} from 'cloudflare:workers';\nimport {db} from './test-store';\nimport {inspectCredentialValue} from './credential-boundary';\n"+selected.join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,crypto:preparedCrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,Error,atob,btoa,
  require:path=>path==='cloudflare:workers'?{env:{DB:db,CLAUDE_CONFIG_KEY:syntheticConfigKey}}:load(path.slice(2))});
 exports.readClaudeOutputCapability=async()=>clone(snapshot.capability); // metadata only
 exports.requestOutlineClaudeOnce=async()=>{providerMocks++;throw Error('Provider execution forbidden in V84 load harness');};
 preparedClaude=exports;return exports;
}
const syntheticConfigKey=Buffer.alloc(32,41).toString('base64');
function counted(name,method,fn){return function(...args){const key=name+'.'+method;inspectionStats[key]=(inspectionStats[key]||0)+1;return fn(...args);};}
function load(name) {
 if (modules[name]) return modules[name]; const exports = {}; modules[name] = exports;
 let source=fs.readFileSync(sourceRoot+'/lib/'+name+'.ts','utf8');loadedSourceHashes['lib/'+name+'.ts']=hash(source);
 // Only an in-memory white-box constructor for correctly seeded prior history.
 // APIs under test are unmodified. The local transport copy reaches paid guards
 // with a mock provider; no source/live gate or production nonce is changed.
 if (name === 'editorial-v3-runtime') source += '\nexports.__testMakeInput = makeInput;';

 vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
  exports, crypto: {subtle: crypto.subtle, randomUUID: () => uuidQueue.length ? uuidQueue.shift() : crypto.randomUUID()}, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Date:FixedDate, Error, URL, Request, Response, File, AbortController, AbortSignal, ReadableStream, setTimeout, clearTimeout, setInterval, clearInterval,
  atob,btoa, console: {error:(...args)=>capturedLogs.push(args),info:(...args)=>capturedLogs.push(args)},
  require: path => path==='cloudflare:workers'?{env:{DB:db}}:path === './test-store' ? load('test-store') : path === './claude' ? loadPreparedClaude() : path === './articles' ? {bucket: () => ({put: async () => {bucketPuts++;}})} : path === './events' ? {readiness: async () => ({connected: true}), dispatch: async () => {eventCalls++; return '事件已送达，offline mock';}} : path.startsWith('./') ? load(path.slice(2)) : native(path),
  fetch: () => {network++; throw Error('External network forbidden');},
 });
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
  exports.assertEditorialRunAuthorityV3 = async (claimedOwner, id) => {assert.equal(claimedOwner, owner); assert.equal(id, runId); assert.equal(sql.prepare('SELECT state FROM editorial_authority_v3 WHERE owner=?').get(owner).state, 'active'); assert.equal(configValid,true,'MOCK historical configuration changed'); return {row: row()};};
  exports.assertEditorialV3FailedWriterContinuationConfiguration = async (claimedOwner,id) => {assert.equal(claimedOwner,owner);assert.equal(id,runId);assert.equal(row().state,'technical_failed');assert.equal(sql.prepare('SELECT state FROM editorial_authority_v3 WHERE owner=?').get(owner).state,'active');assert.equal(configValid,true,'MOCK historical configuration changed');assert.equal(hash(row().snapshot_json),snapshotHash);return {row:row()};};
 }
 for(const method of name==='credential-boundary'?['inspectCredentialValue']:name==='editorial-credential-text'?['editorialCredentialInspection','editorialCredentialVariants']:[])if(typeof exports[method]==='function')exports[method]=counted(name,method,exports[method]);
 if(name==='editorial-credential-boundary'&&typeof exports.createEditorialCredentialScanContext==='function') {
  const factory=exports.createEditorialCredentialScanContext;
  exports.createEditorialCredentialScanContext=async(...args)=>{inspectionStats.context_created=(inspectionStats.context_created||0)+1;const real=await factory(...args);return Object.freeze({inspect:counted('context','inspect',real.inspect),assertFresh:counted('context','assertFresh',real.assertFresh)});};
 }
 return exports;
}
const authority=load('editorial-authority-v3'),runtime=load('editorial-v3-runtime'),cloud=load('editorial-cloud-http-v3'),continuation=load('editorial-revision-continuation-v3'),failed=load('editorial-failed-writer-continuation-v3');
const failedSourceId='6506d5b0-7d66-447f-823e-5e40039c53ba', failedSourceHash='9f8205996f71ba82fa75fbaffd74ef31d1d66c4616f5a41209aa609b05a79abd';
const failedInput={...sourceInput,stage_id:failedSourceId,round:4,sequence:9}; assert.equal(hash(failedInput),failedSourceHash);
function transportFailure(){return {state:'failed',text:null,partial_text:null,raw_response:null,raw_partial_response:null,requested_model:model,returned_model:null,error:'OFFLINE observed zero-payload unsafe-response timeout',usage:{input_tokens:17,output_tokens:0,thinking_tokens:0},diagnostic:{stage:'failed',code:'unsafe_response',http_status:200,elapsed_ms:300000,response_bytes:38169,safety_subcause:'stream_incomplete',transport_subcause:'timeout',eof_received:false,message_stop_received:false,raw_retained:false,stop_reason:null,request_stream:true,transport_version:'anthropic_sse_buffered_v2',inspection_version:'buffered_v2'}};}
const policy = authority.editorialAuthorityV3Policy;
function completePacket(id, inputHash, text) {return {state: 'completed', stage: step(id).stage, stage_id: id, input_sha256: inputHash, snapshot_sha256: snapshotHash, requested_model: model, returned_model: model, text, partial_text: null, raw_partial_response: null, raw_response: null, usage: {input_tokens: 101, output_tokens: 202, thinking_tokens: 3}, diagnostic: {stage:'completed',stop_reason:'end_turn',eof_received:true,message_stop_received:true,inspection_version:'buffered_v2',raw_retained:false,media_type:'text/event-stream'}};}
function addReceipt(id, response, state = 'completed') {insert('claude_attempts', {id: receiptId(id), owner, day, state, response, created: when});}
function unknownPacket() {return {state: 'requested', requested_model: model, returned_model: null, stage: 'structure_revision', stage_id: sourceId, input_sha256: sourceHash, snapshot_sha256: snapshotHash, usage: {input_tokens: 26972, output_tokens: 0, thinking_tokens: 0}, diagnostic: {stage: 'provider_usage_received'}, text: null, partial_text: null, raw_response: null, raw_partial_response: null};}
let baseRows,reusableRows=null,reusableAllocation=null,reusableFixtureHash=null,savedArtifactFixtures=null;let useReusableFixture=false;
const read = () => runtime.readEditorialV3(owner, {run_id: runId});
const reviewArgs = (lease, report) => ({run_id: runId, stage_id: lease.stage_id, expected_snapshot_sha256: snapshotHash, expected_input_sha256: lease.input_sha256, actor_id: lease.input.actor_id, execution_id: crypto.randomUUID(), model: lease.input.model, raw_result: JSON.stringify(report), confirm: true});
const claim = () => runtime.claimEditorialV3Stage(owner, {run_id: runId, expected_snapshot_sha256: snapshotHash, confirm: true});
const credentials = lease => ({stage_id: lease.stage_id, token: lease.token});
function validRevision() {
 const article = clone(sourceInput.input_article); article.paragraphs[0] += '测'.repeat(621);
 return {article, decisions: sourceInput.previous_report.issues.map((issue, index) => ({issue_id: issue.id, action: index === 0 ? 'accepted' : 'rejected', reason: 'OFFLINE MOCK contract decision; no assertion that the real editorial issue is resolved.'})), changes: [{paragraph: 1, before: sourceInput.input_article.paragraphs[0], after: article.paragraphs[0], reason: 'OFFLINE MOCK complete positional length change.'}]};
}
function passFacts(article) {return {status: 'completed', passed: true, coverage: [article.title, ...article.paragraphs].map((quote, paragraph) => ({paragraph, quote, classification: 'fact', verdict: 'confirmed', source_ids: snapshot.sources.map(source => source.id), source_dates: snapshot.sources.map(source => source.published), context: 'OFFLINE MOCK mechanical full coverage, not a real factual review: ' + snapshot.sources.map(source => source.published).join(', ')})), issues: [], unconfirmed: [], checks: {paragraphs: true, names: true, numbers: true, metaphors: true, quote_time_context: true}};}

// Load the complete real route source. Only unrelated MCP families are stubs;
// V3 owner dispatcher, schemas and runtime are unchanged. No HTTP POST is made.
function route(relative){
 const exports={},code=fs.readFileSync(sourceRoot+'/'+relative,'utf8');loadedSourceHashes[relative]=hash(code);
 const unrelated=new Proxy({}, {get:(_target,key)=>String(key).endsWith('Tools')?[]:key==='mcpSseProbeTool'?{name:'offline-unrelated-probe'}:key==='retiredGenerationNames'?[]:async()=>{throw Error('Unrelated MCP family must not execute');}});
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,Error,URL,Request,Response,File,AbortController,AbortSignal,ReadableStream,setTimeout,clearTimeout,setInterval,clearInterval,console:{error:(...args)=>capturedLogs.push(args),info:(...args)=>capturedLogs.push(args)},require:path=>{
  const name=path.split('/').at(-1);
  if(name==='test-store')return load('test-store');
  if(['editorial-v3-runtime','editorial-authority-v3','editorial-failed-writer-continuation-v3','editorial-revision-continuation-v3','editorial-cloud-http-v3','editorial-body-continuation'].includes(name))return load(name);
  return unrelated;
 },fetch:()=>{network++;throw Error('External network forbidden');}});
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
const tables=['articles','writing_runs','editorial_failed_writer_cloud_delegations_v3','editorial_failed_writer_continuations_v3','editorial_revision_continuations_v3','editorial_revision_cloud_delegations_v3','editorial_cloud_delegations_v3','editorial_body_continuations_v3','editorial_stages_v3','editorial_runs_v3','editorial_authority_v3','claude_attempts','workflow_controls'];
function mutateOld(kind){const packet=kind==='usage'?unknownPacket():kind==='completed'?completePacket(sourceId,sourceHash,JSON.stringify(validRevision())):{...unknownPacket(),state:'failed',diagnostic:{stage:'credential_suppressed',response_suppressed:true},error:'编辑V3内容安全校验未通过'};if(kind==='usage'){packet.usage.input_tokens++;packet.diagnostic.elapsed_ms=333;}sql.prepare('UPDATE claude_attempts SET state=?,response=? WHERE id=?').run(packet.state,JSON.stringify(packet),receiptId(sourceId));return receipt(sourceId).response;}

const grantedPath=process.env.TEST_V84_GRANTED_FIXTURE||'/workspace/scratch/e49e34e074a9/editorial-v83-failed-recovery-tests/runtime-failed-writer-granted-fixture.json';
const grantedRaw=fs.readFileSync(grantedPath,'utf8'),granted=JSON.parse(grantedRaw);
assert.equal(hash(grantedRaw),'e2af1928dad1fabd138e96714b1e8ff4bc323b1b235f3dee501e81d7e600e4ea','Only the exact previously revalidated owner-granted fixture is permitted');
assert.deepEqual(Object.keys(granted.rows),tables);
const poolTables=['claude_settings','topic_research_outbox','editorial_requests','editorial_stages','article_claim_credential_hashes','article_upload_attempts','article_deliveries','outline_flow_stages'];
let syntheticEncryptedSecret;
async function encryptedSecret(value){
 const iv=new Uint8Array(12).fill(19),key=await crypto.subtle.importKey('raw',Buffer.from(syntheticConfigKey,'base64'),{name:'AES-GCM'},false,['encrypt']);
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},key,new TextEncoder().encode(value));
 return JSON.stringify({iv:Buffer.from(iv).toString('base64'),data:Buffer.from(data).toString('base64')});
}
syntheticEncryptedSecret=await encryptedSecret('offline-opaque-production-inspection-key-741329');
function resetGranted(){
 beforeRead=null;beforeRun=null;configValid=true;uuidQueue.length=0;
 for(const table of [...new Set([...tables,...poolTables])])sql.exec('DELETE FROM '+table);
 for(const [table,rows]of Object.entries(granted.rows))for(const value of rows)insert(table,value);
 insert('claude_settings',{owner,model,secret:syntheticEncryptedSecret,enabled:'1',updated:when});
 assert.equal(step(granted.allocation.lease.stage_id).input_sha256,hash(granted.allocation.lease.input));
}
function durable(){return hash(Object.fromEntries([...tables,...poolTables].map(table=>[table,sql.prepare('SELECT * FROM '+table).all()])));}
function statsDelta(before,after){return Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(after)])].map(key=>[key,(after[key]||0)-(before[key]||0)]).filter(([,value])=>value));}
function querySummary(rows){const kinds={},methods={};for(const row of rows){kinds[row.kind]=(kinds[row.kind]||0)+1;methods[row.method]=(methods[row.method]||0)+1;}return {count:rows.length,kinds,methods};}
const observations=[],failures=[],fullOutputs={};let checks=0,expectedApplicationWrites=0;
async function observe(name,action){
 if(caseFilter&&!name.includes(caseFilter))return;
 if(process.env.TEST_V84_SKIP_PERFORMANCE==='1'&&name.startsWith('performance '))return;
 checks++;resetGranted();const start=performance.now(),queryAt=queryStats.length,inspectionBefore={...inspectionStats},writesBefore=writes;activePhase=name;
 console.log('START '+name+' '+new Date().toISOString());
 try{const value=await action();assert.equal(writes-writesBefore,value?.expected_application_writes||0,'Only the isolated normal delegation creation may write');expectedApplicationWrites+=value?.expected_application_writes||0;observations.push({name,passed:true,offline_elapsed_ms:Math.round(performance.now()-start),sql:querySummary(queryStats.slice(queryAt)),pure_and_context_calls:statsDelta(inspectionBefore,inspectionStats),application_writes:writes-writesBefore,...(value||{})});console.log('PASS '+name);}
 catch(error){const failure={name,message:error.message,stack:error.stack};failures.push(failure);observations.push({name,passed:false,offline_elapsed_ms:Math.round(performance.now()-start),sql:querySummary(queryStats.slice(queryAt)),pure_and_context_calls:statsDelta(inspectionBefore,inspectionStats)});console.error('FAIL '+name+': '+error.message);}
 finally{beforeRead=null;beforeRun=null;configValid=true;activePhase='idle';}
}
const readArgs={run_id:runId},claimArgs={run_id:runId,expected_snapshot_sha256:snapshotHash,confirm:true};
const delegateArgs={run_id:runId,...credentials(granted.allocation.lease),transport:'cloud_http_once',confirm:true};
const toolFor=kind=>kind==='read'?'read_editorial_v3':kind==='claim'?'claim_editorial_v3_stage':'delegate_editorial_v3_cloud_http_once';
function outputEvidence(value){const serialized=JSON.stringify(value);return {utf8_bytes:Buffer.byteLength(serialized),sha256:hash(serialized)};}
function assertReadComplete(view){
 assert.equal(view.content_suppressed,false);assert.ok(view.snapshot);assert.ok(view.current_version?.article);assert.ok(Object.keys(view.artifacts).length>=5);
 assert.deepEqual(view.snapshot,snapshot);assert.equal(view.current_version.article.paragraphs.join('').replace(/\s/gu,'').length,1879);
 assert.equal(view.current_version.quality_passed,false);assert.equal(view.automatic_paid_retry,false);assert.equal(view.unlimited_requests_is_not_retry_permission,true);assert.equal(view.legacy_quotas_untouched,true);
 const body=JSON.parse(step(bodyId).artifact_json).article;assert.deepEqual(view.current_version.article,body);
}
for(const kind of ['read','claim','delegate'])await observe('performance '+kind+' twice same runtime with full exact output',async()=>{
 const unchanged=durable(),outputs=[];
 for(let request=1;request<=2;request++){
  const queryAt=queryStats.length,inspectionBefore={...inspectionStats},started=performance.now();
  const view=await mcp(toolFor(kind),kind==='read'?readArgs:kind==='claim'?claimArgs:delegateArgs);outputs.push(view);
  if(kind==='read')assertReadComplete(view);
  else if(kind==='claim')assert.deepEqual(view,granted.allocation.lease);
  else {assert.equal(view.read_only,true);assert.equal(view.created,false);assert.equal(view.stage_id,granted.allocation.lease.stage_id);assert.equal(view.automatic_paid_retry,false);}
  console.log(JSON.stringify({phase:kind,request,offline_elapsed_ms:Math.round(performance.now()-started),sql:querySummary(queryStats.slice(queryAt)),inspection:statsDelta(inspectionBefore,inspectionStats),return:outputEvidence(view)}));
 }
 assert.deepEqual(outputs[0],outputs[1]);assert.equal(durable(),unchanged);fullOutputs[kind]=outputs;
 return {requests:outputs.map(outputEvidence),exact_repeated_content_equal:true,read_only_rows_unchanged:true};
});
await observe('performance normaldelegate_create through complete existing claimed grant',async()=>{
 const stageId=granted.allocation.lease.stage_id;
 assert.equal(sql.prepare('DELETE FROM editorial_failed_writer_cloud_delegations_v3 WHERE stage_id=?').run(stageId).changes,1);
 const protectedTables=tables.filter(table=>table!=='editorial_failed_writer_cloud_delegations_v3'),preserved=hash(Object.fromEntries(protectedTables.map(table=>[table,sql.prepare('SELECT * FROM '+table).all()])));
 const before=writes,providerBefore=providerMocks;
 const result=await load('editorial-failed-writer-http-v3').delegateEditorialV3FailedWriterHttpOnce(owner,delegateArgs,false);
 assert.equal(result.created,true);assert.equal(result.read_only,false);assert.equal(result.paid_execution_enabled,false);assert.equal(writes,before+1);assert.equal(providerMocks,providerBefore);
 assert.equal(hash(Object.fromEntries(protectedTables.map(table=>[table,sql.prepare('SELECT * FROM '+table).all()]))),preserved,'Every original run/stage/receipt/grant row must remain exact');
 const delegation=sql.prepare('SELECT * FROM editorial_failed_writer_cloud_delegations_v3 WHERE stage_id=?').get(stageId);
 assert.equal(delegation.state,'delegated');assert.equal(delegation.started,null);assert.equal(hash(delegation.frozen_json),delegation.frozen_sha256);assert.equal(delegation.token_sha256,hash(granted.allocation.lease.token));
 assert.equal(receipt(stageId),undefined);assert.equal(step(stageId).state,'claimed');assert.equal(delegation.continuation_id,granted.rows.editorial_failed_writer_continuations_v3[0].id);
 const frozen=JSON.parse(delegation.frozen_json);assert.equal(frozen.input_json,step(stageId).input_json);assert.equal(frozen.snapshot_json,row().snapshot_json);assert.equal(frozen.run_input_json,row().input_json);
 fullOutputs.normaldelegate_create={result,delegation};return {requests:[outputEvidence(fullOutputs.normaldelegate_create)],expected_application_writes:1,original_rows_preserved:true,slot_state:'delegated',slot_consumed:false,new_receipt:false,provider_calls:0,frozen_binding:outputEvidence(frozen)};
});

function putCredentialPool(kind,value=runId){
 if(kind==='stage_token'){
  const base={...step(sourceId),id:'0aa9af77-6af6-4b6d-ab89-657639aa2771',run_id:'8c29df5c-5522-46e6-8d3a-27d4ee6e44ae',token:value,sequence:0};insert('editorial_stages_v3',base);
 }else if(kind==='research_lease')insert('topic_research_outbox',{research_id:'offline-new-research',owner,event_id:'offline-event',state:'leased',attempts:0,lease_token:value,created:when});
 else if(kind==='claim_hash')insert('editorial_requests',{id:'offline-new-claim',owner,request_key:'offline-new-claim',input_json:'{}',input_sha256:hash('{}'),state:'claimed',claim_hash:hash(value.toLowerCase()),progress_json:'{}',dispatch_state:'idle',expires,created:when,updated:when});
 else if(kind==='config_secret')return encryptedSecret(value).then(cipher=>sql.prepare('UPDATE claude_settings SET secret=?,updated=? WHERE owner=?').run(cipher,'2026-10-07T00:00:00.000Z',owner));
 else throw Error('Unknown credential pool mutation '+kind);
}
function rejectedOrSuppressed(result){
 if(result.isError===true||result.http_status>=400)return true;
 const view=JSON.parse(result.content[0].text);return view.content_suppressed===true&&view.current_version===null&&view.snapshot===null;
}
await observe('fresh lineage pass after clean load detects new token and denies normal delegate',async()=>{
 const stageId=granted.allocation.lease.stage_id;sql.prepare('DELETE FROM editorial_failed_writer_cloud_delegations_v3 WHERE stage_id=?').run(stageId);
 const plan=await runtime.loadEditorialV3FailedWriterPlan(owner,runId);await putCredentialPool('stage_token');const unchanged=durable();
 await assert.rejects(runtime.verifyEditorialV3FailedWriterStageLineage(owner,plan,stageId,'before_new_execution'));
 await assert.rejects(load('editorial-failed-writer-http-v3').delegateEditorialV3FailedWriterHttpOnce(owner,delegateArgs,false));
 assert.equal(durable(),unchanged);assert.equal(sql.prepare('SELECT * FROM editorial_failed_writer_cloud_delegations_v3 WHERE stage_id=?').get(stageId),undefined);
 return {fresh_independent_lineage_denied:true,normal_delegate_denied:true,read_only_rows_unchanged:true,provider_calls:0};
});
for(const kind of ['stage_token','research_lease','claim_hash','config_secret'])await observe('between requests new '+kind+' invalidates previous clean scope',async()=>{
 assertReadComplete(await mcp('read_editorial_v3',readArgs));await putCredentialPool(kind);
 const unchanged=durable(),view=await mcpResult('read_editorial_v3',readArgs);assert.ok(rejectedOrSuppressed(view),'Read must reject or suppress the newly credential-bearing content');
 await mcpReject('claim_editorial_v3_stage',claimArgs);assert.equal(durable(),unchanged);
 return {fresh_request_detected:true,claim_denied:true,read_only_rows_unchanged:true};
});
for(const kind of ['stage_token','research_lease','claim_hash','config_secret'])await observe('within load '+kind+' changes fail closed',async()=>{
 let fired=false;beforeRead=async query=>{if(!fired&&/FROM claude_attempts/u.test(query)){fired=true;beforeRead=null;await putCredentialPool(kind);}};
 const result=await mcpResult('read_editorial_v3',readArgs);assert.equal(fired,true,'Mutation must occur after initial load pool/snapshot inspection');assert.ok(rejectedOrSuppressed(result),'Stale load must not return content');
 return {credential_race_executed:true,stale_scope_rejected:true};
});
const encodings={raw:value=>value,unicode:value=>[...value].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join(''),percent:value=>[...value].map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''),json:value=>JSON.stringify(JSON.stringify(value))};
for(const credential of ['nonce','config_secret'])for(const [encoding,encode]of Object.entries(encodings))await observe('encoded '+credential+' '+encoding+' still rejected',async()=>{
 const value=credential==='nonce'?step(granted.allocation.lease.stage_id).token:'offline-opaque-production-inspection-key-741329';
 const packet={...unknownPacket(),text:encode(value)};sql.prepare('UPDATE claude_attempts SET response=? WHERE id=?').run(JSON.stringify(packet),receiptId(sourceId));
 const unchanged=durable(),view=await mcpResult('read_editorial_v3',readArgs);assert.ok(rejectedOrSuppressed(view));await mcpReject('claim_editorial_v3_stage',claimArgs);assert.equal(durable(),unchanged);
 if(view.isError!==true){assert.ok(!JSON.stringify(view).includes(value));}
 return {encoded_credential_rejected:true,claim_denied:true,read_only_rows_unchanged:true};
});
for(const kind of ['usage','failed','completed'])await observe('legal old496 late '+kind+' history remains readable',async()=>{
 const late=mutateOld(kind),unchanged=durable(),view=await mcp('read_editorial_v3',readArgs);assertReadComplete(view);assert.equal(receipt(sourceId).response,late);assert.equal(durable(),unchanged);
 fullOutputs['late_'+kind]=view;return {history_accepted:true,full_content:outputEvidence(view),read_only_rows_unchanged:true};
});
for(const target of ['grant_key','source_created','delegation_started'])await observe('tampered frozen '+target+' remains rejected',async()=>{
 assertReadComplete(await mcp('read_editorial_v3',readArgs));assert.equal((await mcp('delegate_editorial_v3_cloud_http_once',delegateArgs)).read_only,true);
 if(target==='grant_key')sql.prepare('UPDATE editorial_failed_writer_continuations_v3 SET authorization_key=?').run('tampered-offline-grant');
 if(target==='source_created')sql.prepare('UPDATE claude_attempts SET created=? WHERE id=?').run('2026-10-07T01:00:00.000Z',receiptId(failedSourceId));
 if(target==='delegation_started')sql.prepare('UPDATE editorial_revision_cloud_delegations_v3 SET started=? WHERE stage_id=?').run('2026-10-07T01:00:00.000Z',failedSourceId);
 const unchanged=durable();await mcpReject('read_editorial_v3',readArgs);await mcpReject('claim_editorial_v3_stage',claimArgs);await mcpReject('delegate_editorial_v3_cloud_http_once',delegateArgs);assert.equal(durable(),unchanged);return {frozen_field_tamper_denied:true,read_only_rows_unchanged:true};
});
for(const stopped of ['paused','revoked','expired','config','snapshot_binding'])await observe('prior read never memoizes '+stopped+(stopped==='config'?' preparation gate':' claim gate'),async()=>{
 assertReadComplete(await mcp('read_editorial_v3',readArgs));
 if(stopped==='paused')insert('workflow_controls',{owner,scope:'editorial_v3',run_id:runId,state:'paused',reason:'OFFLINE pause',created:when,updated:when});
 if(stopped==='revoked')sql.prepare("UPDATE editorial_authority_v3 SET state='revoked'").run();
 if(stopped==='expired')sql.prepare("UPDATE editorial_runs_v3 SET expires='2000-01-01T00:00:00.000Z'").run();
 if(stopped==='config')configValid=false;
 if(stopped==='config'){
  const lease=granted.allocation.lease,unchangedBefore=durable();
  await assert.rejects(runtime.prepareEditorialV3Stage(owner,{run_id:runId,...credentials(lease),expected_model:model,expected_input_sha256:lease.input_sha256,confirm:true}));assert.equal(durable(),unchangedBefore);
  sql.prepare('DELETE FROM editorial_failed_writer_cloud_delegations_v3 WHERE stage_id=?').run(lease.stage_id);const unchanged=durable();
  await assert.rejects(load('editorial-failed-writer-http-v3').delegateEditorialV3FailedWriterHttpOnce(owner,delegateArgs,false));assert.equal(durable(),unchanged);
  return {live_preparation_gate_denied:true,normal_delegate_denied:true,read_only_rows_unchanged:true};
 }
 const unchanged=durable();await mcpReject('claim_editorial_v3_stage',stopped==='snapshot_binding'?{...claimArgs,expected_snapshot_sha256:'0'.repeat(64)}:claimArgs);assert.equal(durable(),unchanged);return {live_claim_gate_denied:true,read_only_rows_unchanged:true};
});
await observe('owner routing and read cannot authorize provider consumption',async()=>{
 const unchanged=durable();await mcpReject('read_editorial_v3',readArgs,null);await mcpReject('claim_editorial_v3_stage',claimArgs,'another-owner');
 assert.equal(providerMocks,0);assert.equal(durable(),unchanged);return {owner_denial:true,provider_calls:0};
});
if(process.env.TEST_V84_FACTORY==='1'){
 const factory=load('editorial-credential-boundary').createEditorialCredentialScanContext;assert.equal(typeof factory,'function','Candidate must expose its real factory');
 await observe('real factory performs DB-free inspection seals and recreates scope',async()=>{
  const context=await factory(owner),at=queryStats.length,exact={safe:'complete fixture evidence',id:runId};
  assert.equal(await context.inspect(exact),false);const inspections={...inspectionStats};assert.equal(await context.inspect(clone(exact)),false);
  assert.deepEqual(inspectionStats, {...inspections,'context.inspect':(inspections['context.inspect']||0)+1});assert.equal(queryStats.length,at,'Every factory inspect is DB-free');
  await context.assertFresh();assert.equal(await context.inspect(exact),true);await assert.rejects(context.assertFresh());
  await putCredentialPool('stage_token');const next=await factory(owner);assert.equal(await next.inspect(exact),true);await next.assertFresh();return {real_factory:true,no_inspection_sql:true,seal_denial:true,new_scope_rescans:true};
 });
 for(const kind of ['stage_token','research_lease','claim_hash','config_secret'])await observe('real factory '+kind+' mutation freshness rejects',async()=>{
  const context=await factory(owner);assert.equal(await context.inspect({id:runId}),false);await putCredentialPool(kind);
  await assert.rejects(context.assertFresh(),/credential_source_changed/);assert.equal(await context.inspect({id:runId}),true);return {real_factory:true,changed_pool_rejected:true};
 });
}
assert.ok(checks>0,'Filter matched no V84 cases');assert.equal(network,0);assert.equal(providerMocks,0);assert.equal(eventCalls,0);assert.equal(bucketPuts,0);assert.equal(writes,expectedApplicationWrites);
for(const [file,digest]of Object.entries(loadedSourceHashes))assert.equal(hash(fs.readFileSync(sourceRoot+'/'+file,'utf8')),digest,'Source changed while regression was running: '+file);
const report={version:84,checks,passed:checks-failures.length,failures,harness_script_sha256:harnessScriptSha256,source_root:sourceRoot,fixture_sha256:hash(grantedRaw),source_hashes:loadedSourceHashes,real_prepared_ast_fragment_sha256:preparedFragments,observations,totals:{sql:querySummary(queryStats),pure_and_context_calls:inspectionStats,real_network_calls:network,provider_calls:providerMocks,writes,expected_application_writes:expectedApplicationWrites,event_calls:eventCalls,bucket_puts:bucketPuts},peak_rss_kb:process.resourceUsage().maxRSS,
 qualification:'Offline runtime/MCP SQL and pure inspection counts only. Synthetic SQLite has no D1/network latency; AES-GCM decrypt is real with a synthetic configuration. These elapsed times are not production latency, and the old V83 fake protectPrepared helper undercounted production settings+multi-table lease queries and decrypt per 60k chunk.',
 explicit_mocks:['offline SQLite/D1 adapter','provider forbidden; capability metadata mock only','historical authority/configuration checks','fixed historical old-body continuation verifier','unrelated MCP families'],scope:'read/normal claim with exact granted fixture; no paid consumer POST, no deployment, no real database/API'};
const reportPath=process.env.TEST_V84_REPORT_FILE||new URL('./editorial-v84-load-performance-report.json',import.meta.url);fs.writeFileSync(reportPath,JSON.stringify(report));
const outputsPath=process.env.TEST_V84_OUTPUTS_FILE||new URL('./editorial-v84-load-performance-outputs.json',import.meta.url);fs.writeFileSync(outputsPath,JSON.stringify(fullOutputs));
console.log('V84 load regression '+report.passed+'/'+checks+'; external provider/network calls 0; expected synthetic slot writes '+expectedApplicationWrites);if(failures.length)process.exitCode=1;
