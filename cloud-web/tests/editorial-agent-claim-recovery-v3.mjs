// Independent V3 runtime regression. SQLite, provider, bucket and events are local mocks.
// No production data, real credential, browser, network, paid request or deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const native = createRequire(import.meta.url), sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) sql.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const model = 'claude-opus-5-5', xmodel = 'gpt-6.1-sol', limit = 32768;
const secret = 'sk-synthetic-private-abcdefghijklmnopqrstuvwxy';
let batchTail = Promise.resolve(), beforeRun = null, beforeBatch = null;
let dbWrites = 0, providerCalls = 0, metadataCalls = 0, networkCalls = 0, eventCalls = 0, bucketPuts = 0;
let connected = true, throwDispatch = false, dispatchHook = null, providerHook = null, hold = null;
let capabilityLimit = limit,metadataFailureCode=null;
let response = null, providerState = 'completed', returnedModel = model, providerUsage = {input_tokens: 31, output_tokens: 2111, thinking_tokens: 7};
const providerTrace = [], bucketFiles = new Map();
const db = {
 prepare(query) {
  const bound = args => ({
   query, args,
   first: async () => sql.prepare(query).get(...args) || null,
   all: async () => ({results: sql.prepare(query).all(...args)}),
   run: async () => {dbWrites++; if (beforeRun) await beforeRun(query, args); return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}};},
  });
  return {...bound([]), bind: (...args) => bound(args)};
 },
 batch(statements) {
  const task = batchTail.then(async () => {
   if (beforeBatch) await beforeBatch(statements);
   sql.exec('BEGIN');
   try {const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result;}
   catch (error) {sql.exec('ROLLBACK'); throw error;}
  });
  batchTail = task.catch(() => {}); return task;
 },
};
async function capability(requested) {
 metadataCalls++;if(metadataFailureCode)throw Object.assign(Error('private synthetic provider exception '+secret),{editorial_binding_stage:'live_configuration',editorial_binding_code:metadataFailureCode});
 const base = {model: requested, max_output_tokens: capabilityLimit, source_url: 'https://app.yylx.io/v1/models', checked_at: '2026-10-06T10:00:00.000Z', relay_limit_verified: true, evidence_kind: 'relay_metadata', metadata_source_url: 'https://app.yylx.io/v1/models'};
 return {...base, capability_sha256: hash(base)};
}
const claude = {
 createPreparedArticleCredentialInspector: async()=>({inspect:async(value)=>JSON.stringify(value).includes(secret),assertFresh:async()=>{}}),
 readClaudeOutputCapability: async (_owner, requested) => capability(requested),
 protectPreparedArticleForOwner: async (_owner, value) => ({hit: JSON.stringify(value).includes(secret)}),
 requestOutlineClaudeOnce: async (owner, input, tokens, progress, inspect) => {
  providerCalls++;
  const call = {owner, input: clone(input), tokens: [...tokens], mocked: true, actual_fee: 0}; providerTrace.push(call);
  assert.equal(typeof inspect, 'function');
  assert.equal(input.model, model); assert.equal(input.max_output_tokens, limit);
  assert.ok(!input.system_prompt.includes(secret) && !input.user_prompt.includes(secret));
  const result = {state: providerState, text: typeof response === 'string' ? response : JSON.stringify(response), requested_model: input.model, returned_model: returnedModel, usage: clone(providerUsage), diagnostic: {http_status: providerState === 'completed' ? 200 : 524, stop_reason: 'end_turn'}};
  if (progress) await progress({usage: clone(providerUsage)});
  if (providerHook) await providerHook(call);
  if (hold) await hold;
  if (providerState === 'throw') throw Error('Synthetic unconfirmed transport timeout');
  return result;
 },
};
const modules = {};
function load(name) {
 if (modules[name]) return modules[name];
 const exports = {}; modules[name] = exports;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/' + name + '.ts', 'utf8').replace(/export const editorialCloudHttpPaidEnabled = (?:true|false);/u,'export const editorialCloudHttpPaidEnabled = false;'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
  exports, crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Date, Error, URL, Request, Response, File, ReadableStream, AbortSignal, setInterval, clearInterval,
  require: path => path === './test-store' ? {db: () => db} : path === './claude' ? claude : path === './articles' ? {bucket: () => ({put: async (key, bytes, options) => {bucketPuts++; bucketFiles.set(key, {text: new TextDecoder().decode(bytes), options});}})} : path === './events' ? {readiness: async () => ({connected}), dispatchEditorialRequest: async () => {eventCalls++; return true;}, dispatch: async (owner, article_id, created, event) => {eventCalls++; if (dispatchHook) await dispatchHook({owner, article_id, created, event}); if (throwDispatch) throw Error('Synthetic event timeout'); return '事件已送达，offline mock';}} : path.startsWith('./') ? load(path.slice(2)) : native(path),
  fetch: () => {networkCalls++; throw Error('Real network forbidden');},
 });
 return exports;
}
const authority = load('editorial-authority-v3'), runtime = load('editorial-v3-runtime'), prompt = load('writing-supplement'), round = load('editorial-round-contract');
const day = authority.editorialV3BeijingDay();
const sources = [
 {id: 'S1', title: '合成公开采访', url: 'https://example.com/interview', published: day, event_date: day, accessed: day, context: day + '公开采访，仅谈作品的拍摄经历。'},
 {id: 'S2', title: '合成公开放映', url: 'https://example.org/screening', published: day, event_date: day, accessed: day, context: day + '公开放映，未涉及任何私人行为。'},
];
const facts = [{id: 'F1', text: '影片在公开场合放映。', source_ids: ['S2'], context: sources[1].context}];
const outline = {title: '作品里的戏', core_argument: '公开证据能够支撑作品评论。', opening: '从公开放映入手。', sections: [{heading: '作品观察', target_chars: 1600, fact_ids: ['F1'], source_ids: ['S2'], argument: '区分公开作品与私人动机。'}], turn: '把热度转回作品。', ending: '落在作品中的具体观察。', target_chars: 2400, source_ids: ['S1', 'S2'], fact_gaps: {blocked: false, items: []}};
const article = {title: outline.title, paragraphs: [facts[0].text + '叙'.repeat(1200 - facts[0].text.length), '述'.repeat(1200)]};
const at = (input, paragraph) => paragraph === 0 ? input.title : input.paragraphs[paragraph - 1] || '';
const changes = (before, after) => Array.from({length: Math.max(before.paragraphs.length, after.paragraphs.length) + 1}, (_, paragraph) => ({paragraph, before: at(before, paragraph), after: at(after, paragraph), reason: '完整记录确切位置的实际变化。'})).filter(item => item.before !== item.after);
const issue = (input, id = 'issue-1', paragraph = 1, type = 'expression') => ({id, paragraph, quote: at(input, paragraph).slice(0, 16), type, severity: 'medium', basis: '该位置需要明确证据边界。' + id, revision_goal: '结合冻结公开材料完善论证。' + id});
const review = (issues = []) => ({status: 'completed', decision: issues.length ? 'revise' : 'pass', reason: '完成确切输入标题和完整全文的独立审查。', issues});
const opinion = (paragraph, quote) => ({paragraph, quote, classification: 'opinion', verdict: 'not_applicable', source_ids: [], source_dates: [], context: '作者作品评论，不暗示私人事实。'});
function factReport(input, passed = true, issues = []) {
 const coverage = [opinion(0, input.title)];
 for (const [index, paragraph] of input.paragraphs.entries()) {
  if (paragraph.startsWith(facts[0].text)) {
   coverage.push({paragraph: index + 1, quote: facts[0].text, classification: 'fact', verdict: 'confirmed', source_ids: ['S2'], source_dates: [day], context: sources[1].context});
   if (paragraph.length > facts[0].text.length) coverage.push(opinion(index + 1, paragraph.slice(facts[0].text.length)));
  } else coverage.push(opinion(index + 1, paragraph));
 }
 return {status: 'completed', passed, coverage, issues, unconfirmed: [], checks: {paragraphs: true, names: true, numbers: true, metaphors: true, quote_time_context: true}};
}
const evidence = 'OFFLINE SYNTHETIC OWNER APPROVAL: only Haoduoyu daily two-author editorial and writing-pipeline tests; necessary issue-driven revisions without a fixed call-count or currency ceiling; no other spending.';
const grants = new Map();
async function grant(owner) {
 if (grants.has(owner)) return grants.get(owner);
 sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(owner, model, 'encrypted.offline', '1', day);
 const xactor = crypto.randomUUID(), cactor = crypto.randomUUID();
 const g = await authority.createEditorialAuthorityV3(owner, {authorization_key: 'runtime-offline-v3', source_kind: 'owner_chat', source_message_id: 'offline-owner-message-' + owner, quoted_evidence: evidence, quoted_evidence_sha256: hash(evidence), confirmed_scope: authority.editorialAuthorityV3Scope, xiaoyu_actor_id: xactor, xiaoyu_model: xmodel, claude_actor_id: cactor, expected_claude_model: model, expected_prompt_version: prompt.effectiveWritingStyleVersion, expected_max_output_tokens: limit, confirm: true});
 grants.set(owner, g); return g;
}
function startArgs(g, writer = 'claude_provider', parent = 'offline:runtime-fixture') {return {authority_id: g.authority_id, run_kind: 'workflow_test', writer, parent_test_intent_key: parent, test_intent_key: parent + '/' + writer, expected_bindings_sha256: g.bindings_sha256, expected_writer_model: writer === 'claude_provider' ? model : xmodel, topic: '合成作品观察', angle: '冻结公开材料边界', confirm: true};}
async function create(owner, writer = 'claude_provider', parent, overrides = {}) {
 const g = await grant(owner), started = await authority.startEditorialRunV3(owner, startArgs(g, writer, parent));
 if(parent==='offline:exact-body-continuation'){const target='bd6d4434-273b-426e-a17f-9390fc124c84',old=sql.prepare('SELECT * FROM editorial_runs_v3 WHERE id=?').get(started.run_id),snapshot=JSON.parse(old.snapshot_json);snapshot.run_id=target;sql.prepare('UPDATE editorial_runs_v3 SET id=?,snapshot_json=?,snapshot_sha256=? WHERE id=?').run(target,JSON.stringify(snapshot),hash(snapshot),started.run_id);started.run_id=target;started.snapshot_sha256=hash(snapshot);}
 const participants = Object.fromEntries(['writer', 'outline_reviewer', 'structure_reviewer', 'fact_checker', 'verifier'].map(role => [role, {actor_id: role === 'writer' ? g.bindings[writer].actor_id : crypto.randomUUID(), model: role === 'writer' ? g.bindings[writer].model : 'offline-independent-' + role}]));
 const args = {run_id: started.run_id, expected_input_sha256: started.input_sha256, topic: '合成作品观察', angle: '冻结公开材料边界', style_requirements: '自然中文，作品分析，保持证据边界。', materials: '这是仅供离线回归的合成公开素材。'.repeat(20), sources, facts, participants, research: {actor_id: crypto.randomUUID(), execution_id: crypto.randomUUID(), model: 'offline-research'}, confirm: true};
 Object.assign(args, overrides);
 const initialized = await runtime.initializeEditorialV3(owner, args);
 return {owner, g, started, initialized, initArgs: args, run_id: started.run_id, article_id: started.article_id, snapshot_sha256: initialized.snapshot_sha256, participants};
}
const read = r => runtime.readEditorialV3(r.owner, {run_id: r.run_id});
const row = r => sql.prepare('SELECT * FROM editorial_runs_v3 WHERE id=?').get(r.run_id);
const stageRow = lease => sql.prepare('SELECT * FROM editorial_stages_v3 WHERE id=?').get(lease.stage_id);
const receiptKey = (r, lease) => `editorial_v3:${r.owner}:${r.run_id}:${lease.stage_id}`;
const claim = r => runtime.claimEditorialV3Stage(r.owner, {run_id: r.run_id, expected_snapshot_sha256: r.snapshot_sha256, confirm: true});
const prepare = (r, lease) => runtime.prepareEditorialV3Stage(r.owner, {run_id: r.run_id, stage_id: lease.stage_id, token: lease.token, expected_model: model, expected_input_sha256: lease.input_sha256, confirm: true});
function attestedArgs(r, lease, artifact, execution_id = crypto.randomUUID()) {return {run_id: r.run_id, stage_id: lease.stage_id, ...(lease.token ? {token: lease.token} : {}), expected_snapshot_sha256: r.snapshot_sha256, expected_input_sha256: lease.input_sha256, actor_id: lease.input.actor_id, execution_id, model: lease.input.model, raw_result: JSON.stringify(artifact), confirm: true};}
async function write(r, artifact, lease) {
 lease ||= await claim(r); assert.equal(lease.claimed, true);
 if (r.started.writer === 'xiaoyu_agent0YYLX') await runtime.saveAgentEditorialV3Stage(r.owner, attestedArgs(r, lease, artifact));
 else {response = artifact; const result = await runtime.executeEditorialV3Stage(await prepare(r, lease)); assert.equal(result.saved, true, JSON.stringify(result));}
 return lease;
}
async function saveReview(r, artifact, lease) {lease ||= await claim(r); assert.equal(lease.claimed, true); await runtime.saveEditorialV3Review(r.owner, attestedArgs(r, lease, artifact)); return lease;}
async function complete(owner, writer = 'claude_provider') {
 const r = await create(owner, writer);
 await write(r, outline); await saveReview(r, review()); await write(r, article); await saveReview(r, review()); await saveReview(r, factReport(article)); await saveReview(r, factReport(article));
 assert.equal((await read(r)).state, 'verified'); return r;
}
const freezeArgs = r => ({run_id: r.run_id, expected_final_sha256: (row(r).final_sha256 || hash(article)), confirm: true});
async function preparedOutline(owner) {const r = await create(owner), lease = await claim(r); return {r, lease, prepared: await prepare(r, lease)};}
function pause(r, state = 'paused') {sql.prepare("INSERT INTO workflow_controls(owner,scope,run_id,state,reason,created,updated) VALUES(?,'editorial_v3',?,?,?, ?,?) ON CONFLICT(owner,scope,run_id) DO UPDATE SET state=excluded.state").run(r.owner, r.run_id, state, 'Offline concurrent control', day, day);}
// Focused offline V88 tests reuse the ordinary production V3 fixture and runtime.
const recovery=load('editorial-agent-claim-recovery-v3'),boundary=load('editorial-credential-boundary');
const failures=[];let checks=0;
async function check(name,action){checks++;try{await action();console.log('PASS '+name);}catch(error){failures.push({name,error});console.error('FAIL '+name+' '+error.message);}finally{beforeRun=null;beforeBatch=null;}}
const preview=(r,lease)=>runtime.previewEditorialV3AgentClaimRecovery(r.owner,{run_id:r.run_id,stage_id:lease.stage_id});
function recoveryArgs(r,lease,p){return {run_id:r.run_id,stage_id:lease.stage_id,expected_input_sha256:lease.input_sha256,expected_snapshot_sha256:r.snapshot_sha256,expected_claim_fingerprint:p.claim_fingerprint,confirmed_scope:recovery.editorialAgentClaimRecoveryScope,confirm_original_execution_ended:true,original_execution_end_reference:'Offline fixture: the prior executor returned terminal terminated before recovery.',confirm:true};}
async function ready(label){const r=await create('v88-'+label,'xiaoyu_agent0YYLX'),lease=await claim(r),p=await preview(r,lease);return {r,lease,p,args:recoveryArgs(r,lease,p)};}
const auditRows=r=>sql.prepare('SELECT * FROM editorial_agent_claim_recoveries_v3 WHERE owner=?').all(r.owner);
const unchangedRun=(before,r)=>assert.equal(JSON.stringify(row(r)),before);
const allRows=r=>JSON.stringify({run:row(r),stages:sql.prepare('SELECT * FROM editorial_stages_v3 WHERE owner=? ORDER BY sequence').all(r.owner),audit:auditRows(r)});
const noCalls=()=>({providerCalls,networkCalls,eventCalls,bucketPuts,metadataCalls});

await check('preview never writes or returns a credential; exact same-stage recovery saves normally',async()=>{
 const f=await ready('basic'),before=allRows(f.r),writes=dbWrites,counters=noCalls(),runBefore=JSON.stringify(row(f.r)),p=await preview(f.r,f.lease);
 assert.equal(allRows(f.r),before);assert.equal(dbWrites,writes);assert.deepEqual(noCalls(),counters);assert.equal(JSON.stringify(p).includes(f.lease.token),false);
 const result=await runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args);assert.equal(result.recovered,true);assert.equal(result.stage_id,f.lease.stage_id);assert.notEqual(result.token,f.lease.token);assert.equal(result.input_sha256,f.lease.input_sha256);assert.equal(JSON.stringify(result.input),JSON.stringify(f.lease.input));unchangedRun(runBefore,f.r);assert.deepEqual(noCalls(),counters);
 const audit=auditRows(f.r);assert.equal(audit.length,1);assert.equal(audit[0].old_token_sha256,hash(f.lease.token));assert.equal(audit[0].new_token_sha256,hash(result.token));assert.equal(hash(audit[0].confirmation_json),audit[0].confirmation_sha256);assert.ok(!JSON.stringify(audit).includes(f.lease.token)&&!JSON.stringify(audit).includes(result.token));
 await assert.rejects(runtime.saveAgentEditorialV3Stage(f.r.owner,attestedArgs(f.r,f.lease,outline)));await runtime.saveAgentEditorialV3Stage(f.r.owner,attestedArgs(f.r,result,outline));assert.equal((await read(f.r)).state,'outline_review');
 await assert.rejects(runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args));await assert.rejects(preview(f.r,result));
});
await check('two simultaneous owner-confirmed calls produce one rotation and one audit',async()=>{
 const f=await ready('race'),runBefore=JSON.stringify(row(f.r)),outcomes=await Promise.allSettled([runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args),runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args)]);
 assert.equal(outcomes.filter(outcome=>outcome.status==='fulfilled').length,1);const winner=outcomes.find(outcome=>outcome.status==='fulfilled').value;assert.equal(stageRow(f.lease).token,winner.token);assert.equal(auditRows(f.r).length,1);unchangedRun(runBefore,f.r);await assert.rejects(runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args));
});
await check('stale preview and missing termination/owner-scope confirmation fail without mutation',async()=>{
 const f=await ready('confirm'),original=allRows(f.r);
 for(const key of ['confirm','confirmed_scope','confirm_original_execution_ended','original_execution_end_reference']){const args={...f.args};delete args[key];await assert.rejects(runtime.recoverEditorialV3AgentClaim(f.r.owner,args));assert.equal(allRows(f.r),original);}
 for(const patch of [{confirm_original_execution_ended:false},{expected_input_sha256:'1'.repeat(64)},{expected_snapshot_sha256:'2'.repeat(64)},{expected_claim_fingerprint:'3'.repeat(64)},{stage_id:crypto.randomUUID()},{run_id:crypto.randomUUID()},{token:f.lease.token},{original_execution_end_reference:f.lease.token}]){await assert.rejects(runtime.recoverEditorialV3AgentClaim(f.r.owner,{...f.args,...patch}));assert.equal(allRows(f.r),original);}
 await assert.rejects(runtime.recoverEditorialV3AgentClaim('foreign-owner',f.args));assert.equal(allRows(f.r),original);
});
await check('CAS rejects every run/input/stage/authority/configuration/stop drift before commit',async()=>{
 const mutations=[
  ['token',f=>sql.prepare('UPDATE editorial_stages_v3 SET token=? WHERE id=?').run(crypto.randomUUID(),f.lease.stage_id)],
  ['stage-input',f=>sql.prepare('UPDATE editorial_stages_v3 SET input_sha256=? WHERE id=?').run('d'.repeat(64),f.lease.stage_id)],
  ['artifact',f=>sql.prepare('UPDATE editorial_stages_v3 SET artifact_json=? WHERE id=?').run('{}',f.lease.stage_id)],
  ['snapshot',f=>sql.prepare('UPDATE editorial_runs_v3 SET snapshot_sha256=? WHERE id=?').run('a'.repeat(64),f.r.run_id)],
  ['run-input',f=>sql.prepare('UPDATE editorial_runs_v3 SET input_sha256=? WHERE id=?').run('b'.repeat(64),f.r.run_id)],
  ['run-state',f=>sql.prepare('UPDATE editorial_runs_v3 SET state=? WHERE id=?').run('body',f.r.run_id)],
  ['round',f=>sql.prepare('UPDATE editorial_runs_v3 SET round=round+1 WHERE id=?').run(f.r.run_id)],
  ['authority-revoked',f=>sql.prepare('UPDATE editorial_authority_v3 SET state=? WHERE id=?').run('revoked',row(f.r).authority_id)],
  ['authority-evidence',f=>sql.prepare('UPDATE editorial_authority_v3 SET evidence_sha256=? WHERE id=?').run('c'.repeat(64),row(f.r).authority_id)],
  ['configuration',f=>sql.prepare('UPDATE claude_settings SET updated=? WHERE owner=?').run('changed',f.r.owner)],
  ['pause',f=>pause(f.r)],['archive',f=>pause(f.r,'archived')],
  ['expire',f=>sql.prepare('UPDATE editorial_runs_v3 SET expires=? WHERE id=?').run('2001-01-01T00:00:00.000Z',f.r.run_id)],
  ['late-receipt',f=>sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(receiptKey(f.r,f.lease),f.r.owner,day,'requested','{}',day)],
 ];
 for(const [label,mutate] of mutations){const f=await ready('cas-'+label);beforeBatch=async()=>{beforeBatch=null;mutate(f);};await assert.rejects(runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args),label);assert.equal(auditRows(f.r).length,0);if(label!=='token')assert.equal(stageRow(f.lease).token,f.lease.token);}
});
await check('stopped/expired authority and completed or review stages cannot recover',async()=>{
 for(const state of ['paused','archived']){const f=await ready('blocked-'+state);pause(f.r,state);const before=allRows(f.r);await assert.rejects(preview(f.r,f.lease));await assert.rejects(runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args));assert.equal(allRows(f.r),before);}
 const f=await ready('review');await runtime.saveAgentEditorialV3Stage(f.r.owner,attestedArgs(f.r,f.lease,outline));await assert.rejects(preview(f.r,f.lease));const reviewClaim=await claim(f.r);await assert.rejects(preview(f.r,reviewClaim));
 for(const state of ['cancelled','revoked']){const item=await ready('authority-'+state);sql.prepare('UPDATE editorial_authority_v3 SET state=? WHERE id=?').run(state,row(item.r).authority_id);await assert.rejects(preview(item.r,item.lease));}
 const expired=await ready('expired');sql.prepare('UPDATE editorial_runs_v3 SET expires=? WHERE id=?').run('2001-01-01T00:00:00.000Z',expired.r.run_id);await assert.rejects(preview(expired.r,expired.lease));
});
await check('Claude and any paid receipt status are denied; legitimate provider save still works',async()=>{
 const r=await create('v88-paid-denial'),lease=await claim(r),counters=noCalls();await assert.rejects(preview(r,lease));assert.deepEqual(noCalls(),counters);
 response=outline;await runtime.executeEditorialV3Stage(await prepare(r,lease));assert.equal((await read(r)).state,'outline_review');
 for(const state of ['requested','failed','completed']){const f=await ready('receipt-'+state);sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(receiptKey(f.r,f.lease),f.r.owner,day,state,'{}',day);const before=allRows(f.r);await assert.rejects(preview(f.r,f.lease));await assert.rejects(runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args));assert.equal(allRows(f.r),before);}
});
await check('agent stage with a delegation is refused even without a receipt',async()=>{
 const f=await ready('delegation');sql.prepare('INSERT INTO editorial_cloud_delegations_v3(stage_id,owner,run_id,continuation_id,transport,token_sha256,frozen_json,frozen_sha256,expires,state,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(f.lease.stage_id,f.r.owner,f.r.run_id,crypto.randomUUID(),'cloud_http_once',hash(crypto.randomUUID()),'{}',hash('{}'),'2099-01-01','delegated',day);const before=allRows(f.r);await assert.rejects(preview(f.r,f.lease));await assert.rejects(runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args));assert.equal(allRows(f.r),before);
});
await check('late writer save that passed old token validation is fenced by final save CAS',async()=>{
 const f=await ready('late-save');let fired=false;
 beforeRun=async(query)=>{if(!fired&&query.includes("SET state='completed'")&&query.includes('editorial_stages_v3')){fired=true;sql.prepare('UPDATE editorial_stages_v3 SET token=? WHERE id=?').run(crypto.randomUUID(),f.lease.stage_id);}};
 await assert.rejects(runtime.saveAgentEditorialV3Stage(f.r.owner,attestedArgs(f.r,f.lease,outline)));assert.equal(fired,true);assert.equal(stageRow(f.lease).artifact_json,null);assert.equal(row(f.r).state,'outline');
});
await check('old and replacement credential fingerprints remain suppressed after rotation',async()=>{
 const f=await ready('credential'),result=await runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args);
 assert.equal(await boundary.editorialCredentialHit(f.r.owner,{text:f.lease.token}),true);assert.equal(await boundary.editorialCredentialHit(f.r.owner,{text:result.token}),true);
 const inspector=await boundary.createEditorialCredentialScanContext(f.r.owner);assert.equal(await inspector.inspect({text:f.lease.token}),true);assert.equal(await inspector.inspect({text:result.token}),true);await inspector.assertFresh();
 assert.equal(JSON.stringify(await read(f.r)).includes(f.lease.token),false);assert.equal(JSON.stringify(await read(f.r)).includes(result.token),false);
});
await check('failed audit insertion rolls back the token rotation',async()=>{
 const f=await ready('rollback'),original=allRows(f.r);beforeRun=async(query)=>{if(query.startsWith('INSERT INTO editorial_agent_claim_recoveries_v3'))throw Error('Offline storage failure');};
 await assert.rejects(runtime.recoverEditorialV3AgentClaim(f.r.owner,f.args));assert.equal(allRows(f.r),original);
});
// Optional real-payload acceptance. The genuine author IDs/result are reused only
// in this in-memory regression. Its separately created offline authority/run and
// hashes are never represented as the original production run or authorization.
if(process.env.V88_REAL_OUTLINE_FIXTURE)await check('genuine author outline validates and saves unchanged after local same-stage recovery',async()=>{
 const directory=process.env.V88_REAL_OUTLINE_FIXTURE;
 const original=JSON.parse(fs.readFileSync(directory+'/outline_stage_public.json','utf8'));
 const initialized=JSON.parse(fs.readFileSync(directory+'/initialized_input.json','utf8'));
 const actual=JSON.parse(fs.readFileSync(directory+'/outline_actual_result.json','utf8'));
 const canonical=JSON.stringify(actual),artifactHash=hash(canonical);
 assert.equal(artifactHash,'e57edd803e257c2b98fe4eaa0dfc8b5ccb84ba6ef17f273e2b4967b81edf8801');
 assert.equal(hash(original.input),original.input_sha256);assert.equal(original.input_sha256,'b58540397e990abe445213eb108de7fee719da036d2cde6b327d9d85c8ad6a46');
 assert.equal(original.input.run_id,'cec118ab-2c1e-4b89-9916-483cc34b6db6');assert.equal(original.stage_id,'5608ed26-846d-4ab2-a1a7-1edbfde8bad7');assert.equal(original.input.snapshot_sha256,'11d2be17174364a52e031618578a34bbbc1cab0af161c4845a4fb9d51b82bc79');
 assert.equal(original.input.actor_id,'01a1145f-3985-755b-9e6c-acf1bdc2b0f5');assert.equal(original.input.model,'unknown');assert.deepEqual(initialized.participants.writer,{actor_id:original.input.actor_id,model:original.input.model});
 const parsed=round.parseRoundArtifact('outline',canonical,{validation_version:3,sources:initialized.sources,facts:initialized.facts});assert.equal(JSON.stringify(parsed),canonical);
 const owner='v88-genuine-outline-offline-only',counters=noCalls();
 sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(owner,model,'encrypted.offline', '1',day);
 const g=await authority.createEditorialAuthorityV3(owner,{authorization_key:'real-payload-offline-regression-only',source_kind:'owner_chat',source_message_id:'offline-only-not-original-owner-authorization',quoted_evidence:evidence,quoted_evidence_sha256:hash(evidence),confirmed_scope:authority.editorialAuthorityV3Scope,xiaoyu_actor_id:original.input.actor_id,xiaoyu_model:original.input.model,claude_actor_id:crypto.randomUUID(),expected_claude_model:model,expected_prompt_version:prompt.effectiveWritingStyleVersion,expected_max_output_tokens:limit,confirm:true});
 const started=await authority.startEditorialRunV3(owner,{...startArgs(g,'xiaoyu_agent0YYLX','offline:genuine-author-outline'),expected_writer_model:original.input.model,topic:initialized.topic,angle:initialized.angle});
 assert.notEqual(started.run_id,original.input.run_id);
 const local=await runtime.initializeEditorialV3(owner,{...initialized,run_id:started.run_id,expected_input_sha256:started.input_sha256});
 const r={owner,g,started,run_id:started.run_id,article_id:started.article_id,snapshot_sha256:local.snapshot_sha256,participants:initialized.participants};
 const lease=await claim(r),p=await preview(r,lease),runBefore=JSON.stringify(row(r));
 const recovered=await runtime.recoverEditorialV3AgentClaim(owner,recoveryArgs(r,lease,p));unchangedRun(runBefore,r);
 assert.deepEqual(noCalls(),{...counters,metadataCalls:counters.metadataCalls+1});
 const execution='01a11476-4446-7208-989a-6573e49977d3';
 await assert.rejects(runtime.saveAgentEditorialV3Stage(owner,attestedArgs(r,lease,actual,execution)));
 const saved=await runtime.saveAgentEditorialV3Stage(owner,attestedArgs(r,recovered,actual,execution));
 assert.equal(saved.state,'outline_review');const stored=stageRow(lease);assert.equal(stored.artifact_json,canonical);assert.equal(stored.artifact_sha256,artifactHash);assert.equal(stored.actor_id,original.input.actor_id);assert.equal(stored.execution_id,execution);assert.equal(stored.model,'unknown');assert.equal(stored.provenance,'owner_attested_agent_writer');assert.equal(stored.receipt_id,null);assert.equal(auditRows(r).length,1);
 assert.deepEqual(noCalls(),{...counters,metadataCalls:counters.metadataCalls+1});
 console.log(JSON.stringify({genuine_artifact_sha256:artifactHash,original_input_sha256:original.input_sha256,original_snapshot_sha256:original.input.snapshot_sha256,actual_author_id:stored.actor_id,actual_execution_id:stored.execution_id,fixture_scope:'in_memory_offline_only',production_saved:false,real_network_calls:networkCalls,actual_fee:0}));
});
console.log(JSON.stringify({checks,failures:failures.length,mocked_provider_calls:providerCalls,real_network_calls:networkCalls,actual_fee:0}));assert.equal(networkCalls,0);assert.equal(eventCalls,0);assert.equal(bucketPuts,0);
if(failures.length){for(const failure of failures)console.error(failure.name+' '+failure.error.stack);process.exitCode=1;}
