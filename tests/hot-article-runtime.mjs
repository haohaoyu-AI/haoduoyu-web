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
let capabilityLimit = limit,metadataFailureCode=null,capabilityHook=null;
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
 if(capabilityHook)await capabilityHook();
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
  exports, crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Date, Error, URL, Request, Response, File, ReadableStream, AbortSignal, setInterval, clearInterval, setTimeout, clearTimeout, performance, AbortController,
  require: path => path === './test-store' ? {db: () => db} : path === './claude' ? claude : path === './articles' ? {bucket: () => ({put: async (key, bytes, options) => {bucketPuts++; bucketFiles.set(key, {text: new TextDecoder().decode(bytes), options});}})} : path === './events' ? {readiness: async () => ({connected}), dispatchHotArticleResearch: async () => {eventCalls++; return true;}, dispatchEditorialRequest: async () => {eventCalls++; return true;}, dispatch: async (owner, article_id, created, event) => {eventCalls++; if (dispatchHook) await dispatchHook({owner, article_id, created, event}); if (throwDispatch) throw Error('Synthetic event timeout'); return '事件已送达，offline mock';}} : path.startsWith('./') ? load(path.slice(2)) : native(path),
  fetch: () => {networkCalls++; throw Error('Real network forbidden');},
 });
 return exports;
}
const authority = load('editorial-authority-v3'), runtime = load('editorial-v3-runtime'), prompt = load('writing-supplement'), round = load('editorial-round-contract');
const day = authority.editorialV3BeijingDay();
const sources = [
 {id: 'S1', title: '合成公开采访', url: 'https://www.news.cn/offline-synthetic/interview', published: day, event_date: day, accessed: day, context: day + '公开采访，仅谈作品的拍摄经历。'},
 {id: 'S2', title: '合成公开放映', url: 'https://www.cctv.com/offline-synthetic/screening', published: day, event_date: day, accessed: day, context: day + '公开放映，未涉及任何私人行为。'},
];
const facts = [{id: 'F1', text: '影片在公开场合放映。', source_ids: ['S1','S2'], context: sources[1].context}];
const outline = {title: '作品里的戏', core_argument: '公开证据能够支撑作品评论。', opening: '从公开放映入手。', sections: [{heading: '作品观察', target_chars: 1600, fact_ids: ['F1'], source_ids: ['S1','S2'], argument: '区分公开作品与私人动机。'}], turn: '把热度转回作品。', ending: '落在作品中的具体观察。', target_chars: 2400, source_ids: ['S1', 'S2'], fact_gaps: {blocked: false, items: []}};
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
// These are offline synthetic integration runs. No real news/provider/production.
const imitation=load('hot-article-imitation'),publicContract=load('hot-article-public'),copyright=load('hot-article-contract'),transport=load('hot-article-claude');
const stamp=new Date().toISOString();
const reference={id:'9999999999999999991',url:'https://www.toutiao.com/article/9999999999999999991/',title:'离线合成文娱参照，非真实精选',published_at:stamp,collected_at:stamp,category:'娱乐',reads:{value:100000,evidence:{url:'https://www.toutiao.com/article/9999999999999999991/',observed_at:stamp,label:'JSON-LD ViewAction userInteractionCount=100000'}},likes:{value:2,evidence:{url:'https://www.toutiao.com/article/9999999999999999991/',observed_at:stamp,label:'offline synthetic'}},comments:{value:null,evidence:null},body_state:'readable_full',body:'参'.repeat(800),body_sha256:hash('参'.repeat(800)),exclusion:null};
const collection={version:'hot-article-public-1',status:'ready',collected_at:stamp,source_url:'https://www.toutiao.com/',coverage:'OFFLINE SYNTHETIC ONLY',sorting_basis:'synthetic-only',articles:[reference],observations:[],notice:'offline synthetic fixture, not live ranking'};
async function imitationGrant(owner,paid=false){sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(owner,model,'encrypted.offline','1',day);const quote='OFFLINE SYNTHETIC owner authorizes complete hot article imitation pipeline under independent scope, private drafts only, no other spending.';return authority.createImitationAuthorityV3(owner,{authorization_key:'offline:imitation',source_kind:'owner_chat',source_message_id:'offline-synthetic-only',quoted_evidence:quote,quoted_evidence_sha256:hash(quote),confirmed_scope:authority.imitationAuthorityV3Scope,...(paid?{paid_model_calls:{confirmed_scope:'haoduoyu_hot_article_imitation_paid_model_calls',cost_permission:'explicit_owner_unbounded_within_hot_article_imitation_only',source_message_id:'offline-distinct-paid-owner-message',quoted_evidence:'OFFLINE ONLY explicit new imitation scope unlimited necessary provider permission.',quoted_evidence_sha256:hash('OFFLINE ONLY explicit new imitation scope unlimited necessary provider permission.'),confirm:true}}:{}),xiaoyu_actor_id:crypto.randomUUID(),xiaoyu_model:xmodel,claude_actor_id:crypto.randomUUID(),expected_claude_model:model,expected_prompt_version:prompt.effectiveWritingStyleVersion,expected_max_output_tokens:limit,confirm:true});}
function researchFor(g,writer){return {proposals:[{reference_id:reference.id,body_sha256:reference.body_sha256,topic:'合成作品观察',angle:'从独立公开放映证据出发，具体讨论作品叙事的推进方式和审美选择。',novelty_basis:'对照本人的近期主题与完整稿件记录，提出独立素材中的具体作品观察，与参照文结论无关。',structure:{opening:'以可核验的细节建立问题',progression:['展开证据及背景关系','区分判断并推出作品观察'],evidence_method:'逐一核对公开信息的来源日期与适用范围',ending:'落回一个由本篇材料形成的具体判断'},materials:'这是仅供离线回归的独立合成公开素材，不是真实新闻。'.repeat(20),sources:structuredClone(sources),facts:structuredClone(facts),source_origins:sources.map(s=>({source_id:s.id,origin_url:s.url,relationship_context:'OFFLINE SYNTHETIC fixture declares primary report, not live research.'})),eligible:true,blocker:null}],participants:Object.fromEntries(['writer','outline_reviewer','structure_reviewer','fact_checker','verifier'].map(role=>[role,{actor_id:role==='writer'?g.bindings[writer].actor_id:crypto.randomUUID(),model:role==='writer'?g.bindings[writer].model:'offline-independent-'+role}])),research:{actor_id:crypto.randomUUID(),execution_id:crypto.randomUUID(),model:'offline-research'},full_text_read:true,reference_conclusions_used_as_facts:false,notice:'OFFLINE SYNTHETIC RESEARCH ONLY'};}
const owner='imitation-offline-owner',g=await imitationGrant(owner),key=crypto.randomUUID();let collections=0;
const createArgs={request_key:key,writer:'xiaoyu_agent0YYLX',authority_id:g.authority_id};
const first=await imitation.createHotArticleBatch(owner,createArgs,async()=>{collections++;return structuredClone(collection);});
assert.equal(first.batch.state,'queued');assert.equal(eventCalls,1);assert.ok(!JSON.stringify(first).includes(reference.body));
assert.equal((await imitation.createHotArticleBatch(owner,createArgs,async()=>{throw Error('duplicate must not recollect');})).batch.id,first.batch.id);assert.equal(collections,1);assert.equal(eventCalls,1);
await assert.rejects(imitation.readHotArticleBatch('different-owner',{batch_id:first.batch.id}));
const old=await grant('imitation-old-scope');await assert.rejects(authority.startEditorialRunV3('imitation-old-scope',{authority_id:old.authority_id,run_kind:'hot_article_imitation',writer:'xiaoyu_agent0YYLX',batch_id:first.batch.id,expected_batch_sha256:'0'.repeat(64),expected_bindings_sha256:old.bindings_sha256,expected_writer_model:xmodel,topic:'x',angle:'y',confirm:true}));
const claims=await Promise.all([imitation.claimHotArticleBatch(owner,{batch_id:first.batch.id}),imitation.claimHotArticleBatch(owner,{batch_id:first.batch.id})]);assert.equal(claims.filter(x=>x.claimed).length,1);const claimed=claims.find(x=>x.claimed),research=researchFor(g,'xiaoyu_agent0YYLX');assert.equal(claimed.input.collection.articles[0].body,reference.body);
assert.ok(!JSON.stringify(await imitation.readHotArticleBatch(owner,{batch_id:first.batch.id})).includes(claimed.claim_token));
const save={batch_id:first.batch.id,claim_token:claimed.claim_token,input_sha256:first.batch.input_sha256,result:research};
await assert.rejects(imitation.saveHotArticleResearch(owner,{...save,input_sha256:'0'.repeat(64)}));
assert.equal(claimed.authority_id,g.authority_id);assert.equal(claimed.writer_binding.model,xmodel);
await assert.rejects(imitation.saveHotArticleResearch(owner,{...save,result:{...research,proposals:research.proposals.map(p=>({...p,facts:[]}))}}));
await assert.rejects(imitation.saveHotArticleResearch(owner,{...save,result:{...research,proposals:research.proposals.map(p=>({...p,sources:p.sources.map((s,index)=>index===0?{...s,url:reference.url+'?tracking=1'}:s)}))}}));
await assert.rejects(imitation.saveHotArticleResearch(owner,{...save,result:{...research,participants:{...research.participants,writer:{actor_id:crypto.randomUUID(),model:xmodel}}}}));
await assert.rejects(imitation.saveHotArticleResearch(owner,{...save,result:{...research,notice:claimed.claim_token}}));
const reversedResearch=structuredClone(research);reversedResearch.proposals[0].sources=reversedResearch.proposals[0].sources.map(s=>Object.fromEntries(Object.entries(s).reverse()));reversedResearch.proposals[0].facts=reversedResearch.proposals[0].facts.map(f=>Object.fromEntries(Object.entries(f).reverse()));assert.equal((await imitation.saveHotArticleResearch(owner,{...save,result:reversedResearch})).batch.state,'research_ready');assert.equal((await imitation.saveHotArticleResearch(owner,save)).duplicate,true);
await assert.rejects(authority.startEditorialRunV3(owner,{authority_id:g.authority_id,run_kind:'hot_article_imitation',writer:'xiaoyu_agent0YYLX',batch_id:first.batch.id,expected_batch_sha256:(await imitation.readHotArticleBatch(owner,{batch_id:first.batch.id})).batch.result_sha256,expected_bindings_sha256:g.bindings_sha256,expected_writer_model:xmodel,topic:research.proposals[0].topic,angle:'错误的研究角度不得占用稳定run',confirm:true}));assert.equal(sql.prepare('SELECT count(*) n FROM editorial_runs_v3 WHERE owner=?').get(owner).n,0);
const started=await imitation.startHotArticleEditorial(owner,{batch_id:first.batch.id});assert.equal(started.editorial.state,'outline');const rid=started.editorial.run_id;assert.equal((await imitation.startHotArticleEditorial(owner,{batch_id:first.batch.id})).editorial.run_id,rid);assert.equal(sql.prepare('SELECT count(*) n FROM hot_article_editorial_links').get().n,1);
const run={owner,g,started:{writer:'xiaoyu_agent0YYLX'},run_id:rid,article_id:started.editorial.article_id,snapshot_sha256:started.editorial.snapshot_sha256};
const firstLease=await claim(run);await assert.rejects(imitation.saveHotArticleResearch(owner,{...save,result:{...research,notice:firstLease.token}}));assert.ok(!firstLease.input.user_prompt.includes(reference.body));assert.ok(firstLease.input.user_prompt.includes('抽象'));await write(run,outline,firstLease);await saveReview(run,review());await write(run,article);await saveReview(run,review());await saveReview(run,factReport(article));await saveReview(run,factReport(article));assert.equal((await read(run)).state,'verified');
// Generic V3 reads/freezes also reject tampered frozen reference input.
const frozenInput=sql.prepare('SELECT input_json FROM hot_article_batches WHERE id=?').get(first.batch.id).input_json;sql.prepare('UPDATE hot_article_batches SET input_json=? WHERE id=?').run(JSON.stringify({...JSON.parse(frozenInput),tampered:true}),first.batch.id);
await assert.rejects(runtime.freezeEditorialV3(owner,{run_id:rid,expected_final_sha256:hash(article),confirm:true}));assert.equal(sql.prepare('SELECT count(*) n FROM articles WHERE owner=?').get(owner).n,0);sql.prepare('UPDATE hot_article_batches SET input_json=? WHERE id=?').run(frozenInput,first.batch.id);
// A zero-row hot update must roll back article/run/writing persistence, including
// an adversarial state race occurring inside the otherwise valid transaction.
beforeRun=async query=>{if(query.startsWith('UPDATE hot_article_batches SET state=\'text_saved\'')){beforeRun=null;sql.prepare("UPDATE hot_article_batches SET state='blocked' WHERE id=?").run(first.batch.id);}};
await assert.rejects(runtime.freezeEditorialV3(owner,{run_id:rid,expected_final_sha256:hash(article),confirm:true}));
assert.equal(sql.prepare('SELECT count(*) n FROM articles WHERE owner=?').get(owner).n,0);assert.equal(sql.prepare("SELECT count(*) n FROM writing_runs WHERE id=?").get('editorial_v3:'+rid).n,0);assert.equal(sql.prepare('SELECT state FROM editorial_runs_v3 WHERE id=?').get(rid).state,'verified');assert.equal(sql.prepare('SELECT state FROM hot_article_batches WHERE id=?').get(first.batch.id).state,'writing');
const beforeFinalEvents=eventCalls,beforeFinalPuts=bucketPuts;
const finalized=await imitation.finalizeHotArticleEditorial(owner,{batch_id:first.batch.id,expected_final_sha256:hash(article)});assert.equal(finalized.editorial.state,'text_saved');assert.equal(finalized.batch.state,'text_saved');assert.equal(finalized.saved_text.title,article.title);assert.deepEqual(clone(finalized.saved_text.paragraphs),article.paragraphs);assert.equal(eventCalls,beforeFinalEvents);assert.equal(bucketPuts,beforeFinalPuts+1);
assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(finalized.saved_text.article_id).state,'text_saved');assert.equal(sql.prepare('SELECT state FROM writing_runs WHERE article_id=?').get(finalized.saved_text.article_id).state,'text_saved');
const before=eventCalls;await imitation.finalizeHotArticleEditorial(owner,{batch_id:first.batch.id,expected_final_sha256:hash(article)});assert.equal(eventCalls,before);assert.equal(bucketPuts,beforeFinalPuts+1);assert.equal(providerCalls,0);assert.equal(sql.prepare('SELECT count(*) n FROM articles WHERE owner=?').get(owner).n,1);
const deniedDispatch=await runtime.dispatchEditorialV3(owner,{run_id:rid,expected_final_sha256:hash(article),confirm:true});assert.equal(deniedDispatch.output_mode,'text_only');assert.equal(deniedDispatch.event_dispatched,false);assert.equal(eventCalls,before);assert.equal((await imitation.listPendingHotArticleWork(owner)).pending.some(x=>x.batch_id===first.batch.id),false);
const oldExpires=sql.prepare('SELECT expires FROM editorial_runs_v3 WHERE id=?').get(rid).expires;sql.prepare('UPDATE editorial_runs_v3 SET expires=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),rid);assert.equal((await runtime.readEditorialV3(owner,{run_id:rid})).state,'text_saved');assert.equal((await authority.readEditorialRunV3(owner,{run_id:rid})).state,'text_saved');assert.equal((await imitation.readHotArticleBatch(owner,{batch_id:first.batch.id})).saved_text.final_sha256,hash(article));sql.prepare('UPDATE editorial_runs_v3 SET expires=? WHERE id=?').run(oldExpires,rid);
const cOwner='imitation-claude-offline',cg=await imitationGrant(cOwner,true),cb=await imitation.createHotArticleBatch(cOwner,{request_key:crypto.randomUUID(),writer:'claude_provider',authority_id:cg.authority_id},async()=>structuredClone(collection)),cl=await imitation.claimHotArticleBatch(cOwner,{batch_id:cb.batch.id});await imitation.saveHotArticleResearch(cOwner,{batch_id:cb.batch.id,claim_token:cl.claim_token,input_sha256:cb.batch.input_sha256,result:researchFor(cg,'claude_provider')});const crun=await imitation.startHotArticleEditorial(cOwner,{batch_id:cb.batch.id});const lease=await runtime.claimEditorialV3Stage(cOwner,{run_id:crun.editorial.run_id,expected_snapshot_sha256:crun.editorial.snapshot_sha256,confirm:true}),args={run_id:crun.editorial.run_id,stage_id:lease.stage_id,token:lease.token,expected_model:model,expected_input_sha256:lease.input_sha256,confirm:true};
response=outline;const firstNormal=await transport.imitationClaudeSSE(new Request('https://offline.example/mcp'),cOwner,{id:1,params:{name:'execute_hot_article_claude_stage',arguments:args}});assert.match(await firstNormal.text(),/resultType/);assert.equal(providerCalls,1,'Actual paid scope uses normal writer transport without a second transport approval');
const probe=crypto.randomUUID(),probeResult={completed:true,probe_id:probe,elapsed_ms:330001,provider_requests:0};sql.prepare('INSERT INTO hot_article_transport_probes VALUES(?,?,?,?,?)').run(probe,cOwner,cg.authority_id,JSON.stringify(probeResult),stamp);const acceptanceQuote='OFFLINE SYNTHETIC client acknowledges receiving exact complete zero-fee transport result.';await transport.acceptImitationClaudeTransport(cOwner,{authority_id:cg.authority_id,probe_id:probe,source_message_id:'offline-only',quoted_evidence:acceptanceQuote,quoted_evidence_sha256:hash(acceptanceQuote),confirmed_scope:'hot_article_imitation_transport_acceptance',confirm:true});response=outline;
const sse=await transport.imitationClaudeSSE(new Request('https://offline.example/mcp'),cOwner,{id:2,params:{name:'execute_hot_article_claude_stage',arguments:args}});assert.match(sse.headers.get('content-type'),/event-stream/);assert.match(await sse.text(),/resultType/);assert.equal(providerCalls,1);
const duplicate=await transport.imitationClaudeSSE(new Request('https://offline.example/mcp'),cOwner,{id:3,params:{name:'execute_hot_article_claude_stage',arguments:args}});await duplicate.text();assert.equal(providerCalls,1);assert.equal(networkCalls,0);
// No model request on request abort; close probe stream and leave no acceptance.
const abortRequest=new AbortController(),probeCount=sql.prepare('SELECT count(*) n FROM hot_article_transport_probes').get().n,probeStream=await transport.imitationClaudeSSE(new Request('https://offline.example/mcp',{signal:abortRequest.signal}),cOwner,{id:4,params:{name:'probe_hot_article_claude_transport',arguments:{authority_id:cg.authority_id}}});const reader=probeStream.body.getReader();assert.equal((await reader.read()).done,false);abortRequest.abort();assert.equal((await reader.read()).done,true);assert.equal(sql.prepare('SELECT count(*) n FROM hot_article_transport_probes').get().n,probeCount);assert.equal(providerCalls,1);
await assert.rejects(transport.acceptImitationClaudeTransport(cOwner,{authority_id:cg.authority_id,probe_id:probe,source_message_id:'offline-only',quoted_evidence:acceptanceQuote+' changed',quoted_evidence_sha256:hash(acceptanceQuote+' changed'),confirmed_scope:'hot_article_imitation_transport_acceptance',confirm:true}));
// Exact-ID closure never re-collects, dispatches or creates a run.
const stale=crypto.randomUUID(),staleTime=new Date(Date.now()-181000).toISOString();sql.prepare('INSERT INTO hot_article_batches(id,owner,request_key,writer,state,created,updated) VALUES(?,?,?,?,?,?,?)').run(stale,'stale-owner',crypto.randomUUID(),'xiaoyu_agent0YYLX','collecting',staleTime,staleTime);assert.equal((await imitation.listPendingHotArticleWork('stale-owner')).pending[0].batch_id,stale);const eventBefore=eventCalls;assert.equal((await imitation.closeStaleHotArticleCollection('stale-owner',{batch_id:stale})).batch.state,'blocked');assert.equal(eventCalls,eventBefore);
// Two authors researching the same owner's same work race atomically.
const dualOwner='offline-concurrent-authors',dualGrant=await imitationGrant(dualOwner),dualBatches=[];
for(const writer of ['xiaoyu_agent0YYLX','claude_provider']){sql.prepare('UPDATE hot_article_batches SET created=? WHERE owner=?').run(staleTime,dualOwner);const batch=await imitation.createHotArticleBatch(dualOwner,{request_key:crypto.randomUUID(),writer,authority_id:dualGrant.authority_id},async()=>structuredClone(collection));const lease=await imitation.claimHotArticleBatch(dualOwner,{batch_id:batch.batch.id});const result=researchFor(dualGrant,writer);result.proposals[0].topic='《离线合成作品》演员选择与叙事';dualBatches.push({batch,lease,result});}
const savedDual=await Promise.all(dualBatches.map(({batch,lease,result})=>imitation.saveHotArticleResearch(dualOwner,{batch_id:batch.batch.id,claim_token:lease.claim_token,input_sha256:batch.batch.input_sha256,result})));assert.deepEqual(savedDual.map(x=>x.batch.state).sort(),['insufficient','research_ready']);assert.equal(sql.prepare('SELECT count(*) n FROM hot_article_topic_reservations WHERE owner=?').get(dualOwner).n,1);
assert.equal(copyright.hasCopiedSpan(reference.body,'参'.repeat(25)),true);assert.equal(copyright.hasCopiedSpan(reference.body,article.paragraphs.join('')),false);
console.log('PASS offline hot article vertical flow: separate scope, exact batch intent, owner isolation, atomic claims, secret suppression, source-bound independent research, automatic selection, stable V3 link, synthetic writer + four independent review fixtures, once-only same article site text_saved save with zero image/Word/platform dispatch, normal authorized Claude SSE without redundant transport approval and duplicate receipt cache; zero real network/provider calls');

// Authority revocation racing claim cannot launch a research winner.
const raceOwner='offline-revocation-race',raceGrant=await imitationGrant(raceOwner),raceBatch=await imitation.createHotArticleBatch(raceOwner,{request_key:crypto.randomUUID(),writer:'xiaoyu_agent0YYLX',authority_id:raceGrant.authority_id},async()=>structuredClone(collection));beforeRun=async(query)=>{if(query.includes("SET state='researching',claim_hash")){sql.prepare("UPDATE editorial_authority_v3 SET state='revoked' WHERE id=?").run(raceGrant.authority_id);beforeRun=null;}};const revokedClaim=await imitation.claimHotArticleBatch(raceOwner,{batch_id:raceBatch.batch.id});assert.equal(revokedClaim.claimed,false);assert.equal(providerCalls,1);assert.equal(networkCalls,0);console.log('PASS stable angle binding and atomic new-scope revocation fence; no paid calls');

// R2 regressions: entirely synthetic actors, bodies, facts, probes and database rows.
const institutions=load('hot-article-institutions');
assert.equal(copyright.recentTopicOverlap('独立新的合成选题',[{title:'',topic:null},{title:'   ',topic:''}]),false);
assert.equal(copyright.recentTopicOverlap('近期明确作品主题',[]),false);
for(const path of ['/article/'+reference.id+'/?from=1','/i'+reference.id+'/','/a'+reference.id+'/'])assert.equal(institutions.sourceArticleIdentity('https://m.toutiao.com'+path),'toutiao:'+reference.id);
assert.notEqual(institutions.sourceArticleIdentity('https://toutiao.com.evil.example/i'+reference.id+'/'),'toutiao:'+reference.id);
assert.equal(institutions.sourceInstitution('https://www.news.cn/a').id,institutions.sourceInstitution('https://m.xinhuanet.com/b').id);
assert.equal(institutions.sourceInstitution('https://www.cctv.com/a').id,institutions.sourceInstitution('https://m.cntv.cn/b').id);
assert.equal(institutions.sourceInstitution('https://blog.cctv.com/a'),null);assert.equal(institutions.sourceInstitution('https://news.cn.evil.example/a'),null);
const rejectSources=urls=>{const value=researchFor(g,'xiaoyu_agent0YYLX');value.proposals[0].sources=value.proposals[0].sources.map((s,i)=>({...s,url:urls[i]}));value.proposals[0].source_origins=value.proposals[0].sources.map(s=>({source_id:s.id,origin_url:s.url,relationship_context:'OFFLINE SYNTHETIC original publisher assertion only.'}));assert.throws(()=>copyright.validateImitationResearch(value,[reference],load('editorial-contract').validateFactPack));};
rejectSources(['https://www.news.cn/a','https://m.news.cn/b']);rejectSources(['https://www.news.cn/a','https://m.xinhuanet.com/b']);rejectSources(['https://unknown.example/a','https://different.example/b']);
const reprinted=researchFor(g,'xiaoyu_agent0YYLX');reprinted.proposals[0].source_origins[1].origin_url=reprinted.proposals[0].source_origins[0].origin_url;assert.throws(()=>copyright.validateImitationResearch(reprinted,[reference],load('editorial-contract').validateFactPack));
const unused=researchFor(g,'xiaoyu_agent0YYLX');unused.proposals[0].facts[0].source_ids=['S1'];assert.throws(()=>copyright.validateImitationResearch(unused,[reference],load('editorial-contract').validateFactPack));
const reference2={...structuredClone(reference),id:'9999999999999999992',url:'https://www.toutiao.com/article/9999999999999999992/',title:'第二个离线合成参照',reads:{...reference.reads,evidence:{...reference.reads.evidence,url:'https://www.toutiao.com/article/9999999999999999992/'}}},twoCollection={...structuredClone(collection),articles:[reference,reference2]};
function twoResearch(g,writer,prefix){const value=researchFor(g,writer),first=value.proposals[0];first.topic=prefix+'独立合成论题甲';value.proposals.push({...structuredClone(first),reference_id:reference2.id,topic:prefix+'完全不同观察乙'});return value;}
// Formerly-used reference is skipped even if its new topic is different; next candidate wins.
sql.prepare('UPDATE hot_article_batches SET created=? WHERE owner=?').run(staleTime,owner);
const repeat=await imitation.createHotArticleBatch(owner,{request_key:crypto.randomUUID(),writer:'xiaoyu_agent0YYLX',authority_id:g.authority_id},async()=>structuredClone(twoCollection)),repeatLease=await imitation.claimHotArticleBatch(owner,{batch_id:repeat.batch.id}),repeatResult=twoResearch(g,'xiaoyu_agent0YYLX','重刷测试');const repeatSaved=await imitation.saveHotArticleResearch(owner,{batch_id:repeat.batch.id,claim_token:repeatLease.claim_token,input_sha256:repeat.batch.input_sha256,result:repeatResult});assert.equal(repeatSaved.batch.selected_reference_id,reference2.id);assert.equal(repeatSaved.batch.state,'research_ready');
// A blank uninitialized V3 topic never poisons all future topics.
const blankOwner='offline-blank-history',blankDaily=await grant(blankOwner);await authority.startEditorialRunV3(blankOwner,{...startArgs(blankDaily,'xiaoyu_agent0YYLX','offline:blank-history'),topic:' ',angle:''});
sql.prepare('DELETE FROM claude_settings WHERE owner=?').run(blankOwner);const blankGrant=await imitationGrant(blankOwner),blankBatch=await imitation.createHotArticleBatch(blankOwner,{request_key:crypto.randomUUID(),writer:'xiaoyu_agent0YYLX',authority_id:blankGrant.authority_id},async()=>structuredClone(collection)),blankLease=await imitation.claimHotArticleBatch(blankOwner,{batch_id:blankBatch.batch.id});assert.ok(blankLease.input.history.entries.every(e=>e.title.trim()));const blankResult=researchFor(blankGrant,'xiaoyu_agent0YYLX');assert.equal((await imitation.saveHotArticleResearch(blankOwner,{batch_id:blankBatch.batch.id,claim_token:blankLease.claim_token,input_sha256:blankBatch.batch.input_sha256,result:blankResult})).batch.state,'research_ready');
// Concurrent same-author reference competition advances loser to another candidate.
const sameOwner='offline-same-author-reference-race',sameGrant=await imitationGrant(sameOwner),sameBatches=[];
for(const prefix of ['甲作者请求','乙作者请求']){sql.prepare('UPDATE hot_article_batches SET created=? WHERE owner=?').run(staleTime,sameOwner);const b=await imitation.createHotArticleBatch(sameOwner,{request_key:crypto.randomUUID(),writer:'xiaoyu_agent0YYLX',authority_id:sameGrant.authority_id},async()=>structuredClone(twoCollection)),l=await imitation.claimHotArticleBatch(sameOwner,{batch_id:b.batch.id});sameBatches.push({b,l,result:twoResearch(sameGrant,'xiaoyu_agent0YYLX',prefix)});}
const sameSaved=await Promise.all(sameBatches.map(({b,l,result})=>imitation.saveHotArticleResearch(sameOwner,{batch_id:b.batch.id,claim_token:l.claim_token,input_sha256:b.batch.input_sha256,result})));assert.ok(sameSaved.every(s=>s.batch.state==='research_ready'));assert.equal(new Set(sameSaved.map(s=>s.batch.selected_reference_id)).size,2);
// Source/fact/association/actor field order is semantic; content changes still fail.
const semanticOwner='offline-semantic-pack',semanticGrant=await imitationGrant(semanticOwner),semanticBatch=await imitation.createHotArticleBatch(semanticOwner,{request_key:crypto.randomUUID(),writer:'xiaoyu_agent0YYLX',authority_id:semanticGrant.authority_id},async()=>structuredClone(collection)),semanticLease=await imitation.claimHotArticleBatch(semanticOwner,{batch_id:semanticBatch.batch.id}),semanticResult=researchFor(semanticGrant,'xiaoyu_agent0YYLX');semanticResult.proposals[0].facts.push({...structuredClone(facts[0]),id:'F2',text:'另一项完全合成的公开作品观察。'});const semanticSaved=await imitation.saveHotArticleResearch(semanticOwner,{batch_id:semanticBatch.batch.id,claim_token:semanticLease.claim_token,input_sha256:semanticBatch.batch.input_sha256,result:semanticResult}),p=semanticResult.proposals[0],semanticRun=await authority.startEditorialRunV3(semanticOwner,{authority_id:semanticGrant.authority_id,run_kind:'hot_article_imitation',writer:'xiaoyu_agent0YYLX',batch_id:semanticBatch.batch.id,expected_batch_sha256:semanticSaved.batch.result_sha256,expected_bindings_sha256:semanticGrant.bindings_sha256,expected_writer_model:xmodel,topic:p.topic,angle:p.angle,confirm:true});
const reverseKeys=x=>Object.fromEntries(Object.entries(x).reverse()),init={run_id:semanticRun.run_id,expected_input_sha256:semanticRun.input_sha256,topic:p.topic,angle:p.angle,style_requirements:copyright.imitationStyleRequirements(p),materials:p.materials,sources:p.sources.slice().reverse().map(reverseKeys),facts:p.facts.slice().reverse().map(f=>reverseKeys({...f,source_ids:f.source_ids.slice().reverse()})),participants:Object.fromEntries(Object.entries(semanticResult.participants).reverse().map(([r,a])=>[r,reverseKeys(a)])),research:reverseKeys(semanticResult.research),confirm:true};
for(const field of ['text','context']){const invalid=structuredClone(init);invalid.facts[0][field]+='内容改变';await assert.rejects(runtime.initializeEditorialV3(semanticOwner,invalid));}
const badURL=structuredClone(init);badURL.sources[0].url+='changed';await assert.rejects(runtime.initializeEditorialV3(semanticOwner,badURL));const badActor=structuredClone(init);badActor.participants.verifier.actor_id=crypto.randomUUID();await assert.rejects(runtime.initializeEditorialV3(semanticOwner,badActor));const badModel=structuredClone(init);badModel.participants.verifier.model+='changed';await assert.rejects(runtime.initializeEditorialV3(semanticOwner,badModel));assert.equal((await runtime.initializeEditorialV3(semanticOwner,init)).state,'outline');assert.equal((await imitation.readHotArticleBatch(semanticOwner,{batch_id:semanticBatch.batch.id})).batch.result_sha256,semanticSaved.batch.result_sha256);
// New product scope plus a transport probe does not confer paid permission.
const noPayOwner='offline-no-imitation-paid-grant',noPay=await imitationGrant(noPayOwner);assert.equal(noPay.policy.provider_request_limit,0);assert.equal(noPay.policy.currency_budget,0);assert.equal(noPay.policy.cost_permission,'requires_new_scope_paid_authorization');const noPayBatch=await imitation.createHotArticleBatch(noPayOwner,{request_key:crypto.randomUUID(),writer:'claude_provider',authority_id:noPay.authority_id},async()=>structuredClone(collection)),noPayLease=await imitation.claimHotArticleBatch(noPayOwner,{batch_id:noPayBatch.batch.id});await imitation.saveHotArticleResearch(noPayOwner,{batch_id:noPayBatch.batch.id,claim_token:noPayLease.claim_token,input_sha256:noPayBatch.batch.input_sha256,result:researchFor(noPay,'claude_provider')});const noPayRun=await imitation.startHotArticleEditorial(noPayOwner,{batch_id:noPayBatch.batch.id}),noPayStage=await runtime.claimEditorialV3Stage(noPayOwner,{run_id:noPayRun.editorial.run_id,expected_snapshot_sha256:noPayRun.editorial.snapshot_sha256,confirm:true});const payArgs={run_id:noPayRun.editorial.run_id,stage_id:noPayStage.stage_id,token:noPayStage.token,expected_model:model,expected_input_sha256:noPayStage.input_sha256,confirm:true};const noPayProbe=crypto.randomUUID();sql.prepare('INSERT INTO hot_article_transport_probes VALUES(?,?,?,?,?)').run(noPayProbe,noPayOwner,noPay.authority_id,JSON.stringify({completed:true,probe_id:noPayProbe,elapsed_ms:330001,provider_requests:0}),stamp);await transport.acceptImitationClaudeTransport(noPayOwner,{authority_id:noPay.authority_id,probe_id:noPayProbe,source_message_id:'offline-transport-only',quoted_evidence:acceptanceQuote,quoted_evidence_sha256:hash(acceptanceQuote),confirmed_scope:'hot_article_imitation_transport_acceptance',confirm:true});await assert.rejects(runtime.prepareEditorialV3Stage(noPayOwner,payArgs),/付费/);await assert.rejects(transport.imitationClaudeSSE(new Request('https://offline.example/mcp'),noPayOwner,{id:9,params:{name:'execute_hot_article_claude_stage',arguments:payArgs}}),/付费/);assert.equal(sql.prepare('SELECT count(*) n FROM claude_attempts WHERE owner=?').get(noPayOwner).n,0);assert.equal(providerCalls,1);assert.equal(networkCalls,0);
console.log('PASS R2 empty history, reference reuse/competition continuation, verified institution aliases/origins, semantic exact fact/actor binding, separate zero-paid default and transport-is-not-cost-permission; all actor/execution UUIDs here are explicit offline fixtures only');

// Normal owner-only hot preflight reads the actual capability adapter. It does
// not borrow the legacy fixed14000, create a grant, reserve a stage or call writer.
const preflightOwner='offline-hot-capability-preflight',preflightGrant=await imitationGrant(preflightOwner),hotTools=load('hot-article-tools');
const previewWrites=dbWrites,previewPaid=providerCalls,previewMetadata=metadataCalls,previewAuthorityCount=sql.prepare('SELECT count(*) n FROM editorial_authority_v3').get().n;
const preview=await hotTools.hotArticleCall(preflightOwner,'read_hot_article_imitation_start_preview',{});assert.equal(preview.scope,authority.imitationAuthorityV3Scope);assert.equal(preview.read_only,true);assert.equal(preview.permission_granted,false);assert.equal(preview.paid_model_requests,0);assert.equal(preview.max_output_tokens,limit);assert.equal(preview.provider.origin,'https://app.yylx.io');assert.equal(preview.provider.model,model);assert.equal(preview.capability.metadata_source_url,'https://app.yylx.io/v1/models');assert.equal(preview.prompt_sha256,preflightGrant.bindings.claude_provider.prompt_sha256);assert.equal(preview.fixed_prompts_sha256,hash(preflightGrant.bindings.claude_provider.fixed_prompts));assert.equal(preview.full_rules_sha256,hash({writing_prompt:preflightGrant.bindings.claude_provider.writing_prompt,fixed_prompts:preflightGrant.bindings.claude_provider.fixed_prompts}));assert.ok(!JSON.stringify(preview).includes('encrypted.offline'));assert.equal(dbWrites,previewWrites);assert.equal(providerCalls,previewPaid);assert.equal(metadataCalls,previewMetadata+1);assert.equal(sql.prepare('SELECT count(*) n FROM editorial_authority_v3').get().n,previewAuthorityCount);
await assert.rejects(hotTools.hotArticleCall('unconfigured-foreign-owner','read_hot_article_imitation_start_preview',{}));await assert.rejects(hotTools.hotArticleCall(preflightOwner,'read_hot_article_imitation_start_preview',{confirm:true}));assert.equal(metadataCalls,previewMetadata+1);
capabilityLimit=limit+333;const moved=await authority.readImitationAuthorityPreview(preflightOwner,{});assert.equal(moved.max_output_tokens,limit+333);
const previewCreate={authorization_key:'offline:preview-current-cap',source_kind:'owner_chat',source_message_id:preflightGrant.evidence.source_message_id,quoted_evidence:preflightGrant.evidence.quoted_evidence,quoted_evidence_sha256:preflightGrant.evidence.quoted_evidence_sha256,confirmed_scope:authority.imitationAuthorityV3Scope,xiaoyu_model:xmodel,expected_claude_model:moved.provider.model,expected_prompt_version:moved.prompt_version,expected_max_output_tokens:limit,confirm:true};
await assert.rejects(authority.createImitationAuthorityV3(preflightOwner,previewCreate));assert.equal(sql.prepare('SELECT count(*) n FROM editorial_authority_v3').get().n,previewAuthorityCount);
const fromCurrent=await authority.createImitationAuthorityV3(preflightOwner,{...previewCreate,expected_max_output_tokens:moved.max_output_tokens});assert.equal(fromCurrent.bindings.claude_provider.capability.max_output_tokens,moved.max_output_tokens);assert.equal(fromCurrent.bindings.claude_provider.prompt_sha256,moved.prompt_sha256);assert.equal(fromCurrent.evidence.verification,'authenticated_owner_attested_not_platform_verified');assert.equal(fromCurrent.policy.provider_request_limit,0,'preflight is never paid authorization');
capabilityHook=async()=>sql.prepare("UPDATE claude_settings SET updated='offline-config-race' WHERE owner=?").run(preflightOwner);await assert.rejects(authority.readImitationAuthorityPreview(preflightOwner,{}));capabilityHook=null;sql.prepare('UPDATE claude_settings SET updated=? WHERE owner=?').run(day,preflightOwner);
metadataFailureCode='capability_metadata_unavailable';try{await hotTools.hotArticleCall(preflightOwner,'read_hot_article_imitation_start_preview',{});assert.fail('unknown metadata must not become a capability');}catch(error){assert.ok(!error.message.includes(secret));assert.ok(!error.message.includes('private synthetic'));}metadataFailureCode=null;capabilityLimit=limit;
assert.equal(providerCalls,previewPaid);assert.equal(networkCalls,0);console.log('PASS real hot preflight: current relay capability/source and full rule hashes, zero paid/grant side effects, owner/input isolation, config race and metadata failure suppression; create revalidates changed cap and does not grant spending from a preview');

// Native public acquisition is part of the same refresh intent, independent of
// writer grants. Every record in these default fixtures is explicitly synthetic.
const shellCollection={...structuredClone(collection),status:'insufficient',articles:[],leads:[],acquisition_needed:true,observations:[{url:'https://www.toutiao.com/',status:200,outcome:'OFFLINE SYNTHETIC JS SHELL'}]};
const publicRead=(overrides={})=>({url:reference.url,title:'离线合成电影观察测试',published_at:'2026-10-01T01:00:00Z',category:'娱乐',method:'indexed_search',observed_at:new Date().toISOString(),visible_text:'离线合成电影观察测试\n这是明确标注测试的搜索摘录，不是真实新闻。',body:null,full_text_read:false,...overrides});
const publicResult=(reads=[publicRead()])=>({queries:['OFFLINE SYNTHETIC article discovery only'],reads,notice:'OFFLINE SYNTHETIC ONLY, NOT A REAL RANKING'});
const collectionCases=[];
async function collectionCase(name,execute){await execute();collectionCases.push(name);}
const collectionBefore={paid:providerCalls,grants:sql.prepare('SELECT count(*) n FROM editorial_authority_v3').get().n,articles:sql.prepare('SELECT count(*) n FROM articles').get().n,runs:sql.prepare('SELECT count(*) n FROM editorial_runs_v3').get().n};
const publicOwner='offline-public-no-grant',publicKey=crypto.randomUUID(),beforePublicEvent=eventCalls;
const publicBatch=await imitation.createHotArticleBatch(publicOwner,{request_key:publicKey,writer:'claude_provider'},async()=>structuredClone(shellCollection));
await collectionCase('same_event_without_writer_authority',async()=>{assert.equal(publicBatch.batch.state,'collection_queued');assert.equal(publicBatch.batch.authority_id,null);assert.equal(eventCalls,beforePublicEvent+1);assert.equal(publicBatch.batch.collection_claimable,true);assert.equal((await imitation.listPendingHotArticleWork(publicOwner)).pending[0].batch_id,publicBatch.batch.id);});
await collectionCase('refresh_intent_duplicate_does_not_recollect_or_redispatch',async()=>{const same=await imitation.createHotArticleBatch(publicOwner,{request_key:publicKey,writer:'claude_provider'},async()=>{throw Error('must not collect twice');});assert.equal(same.batch.id,publicBatch.batch.id);await imitation.dispatchHotArticleBatch(publicOwner,{batch_id:publicBatch.batch.id});assert.equal(eventCalls,beforePublicEvent+1);});
await collectionCase('public_claim_owner_isolation',()=>assert.rejects(imitation.claimHotArticleCollection('other-owner',{batch_id:publicBatch.batch.id})));
const publicClaims=await Promise.all([imitation.claimHotArticleCollection(publicOwner,{batch_id:publicBatch.batch.id}),imitation.claimHotArticleCollection(publicOwner,{batch_id:publicBatch.batch.id})]),publicLease=publicClaims.find(x=>x.claimed);
await collectionCase('one_atomic_public_claim_and_no_private_history',async()=>{assert.equal(publicClaims.filter(x=>x.claimed).length,1);assert.equal(publicLease.paid_model_requests,0);assert.equal(publicLease.history,undefined);assert.equal(publicLease.input,undefined);assert.ok(!JSON.stringify(await imitation.readHotArticleBatch(publicOwner,{batch_id:publicBatch.batch.id})).includes(publicLease.claim_token));});
const publicSave={batch_id:publicBatch.batch.id,claim_token:publicLease.claim_token,input_sha256:publicLease.input_sha256,result:publicResult()};
await collectionCase('wrong_claim_and_input_rejected',async()=>{await assert.rejects(imitation.saveHotArticleCollection(publicOwner,{...publicSave,claim_token:crypto.randomUUID()}));await assert.rejects(imitation.saveHotArticleCollection(publicOwner,{...publicSave,input_sha256:'0'.repeat(64)}));});
await collectionCase('reject_unknown_payload_fields_and_claim_credential',async()=>{await assert.rejects(imitation.saveHotArticleCollection(publicOwner,{...publicSave,extra:true}));await assert.rejects(imitation.saveHotArticleCollection(publicOwner,{...publicSave,result:{...publicSave.result,notice:publicLease.claim_token}}));await assert.rejects(imitation.saveHotArticleCollection(publicOwner,{...publicSave,result:{...publicSave.result,actor_id:crypto.randomUUID()}}));});
let savedPublic;
await collectionCase('indexed_lead_saved_without_full_text_metrics_or_paid_calls',async()=>{savedPublic=await imitation.saveHotArticleCollection(publicOwner,publicSave);assert.equal(savedPublic.batch.state,'insufficient');assert.equal(savedPublic.batch.claimable,false);assert.equal(savedPublic.batch.collection_claimable,false);assert.equal(savedPublic.batch.input.collection.articles.length,0);assert.equal(savedPublic.batch.input.collection.leads.length,1);const lead=savedPublic.batch.input.collection.leads[0];assert.equal(lead.reads.value,null);assert.equal(lead.likes.value,null);assert.equal(lead.comments.value,null);assert.equal(lead.body_sha256,null);assert.equal(lead.full_text_stored,false);assert.equal(lead.heat_state,'unverified');assert.equal(savedPublic.batch.input.collection.observations.length,2);assert.notEqual(savedPublic.batch.input_sha256,publicSave.input_sha256);assert.equal(savedPublic.paid_model_requests,0);});
await collectionCase('saved_collection_duplicate_is_read_only_and_overwrite_denied',async()=>{const beforeWrites=dbWrites;assert.equal((await imitation.saveHotArticleCollection(publicOwner,publicSave)).duplicate,true);assert.equal(dbWrites,beforeWrites);await assert.rejects(imitation.saveHotArticleCollection(publicOwner,{...publicSave,result:{...publicSave.result,notice:'changed'}}));await assert.rejects(imitation.claimHotArticleBatch(publicOwner,{batch_id:publicBatch.batch.id}));});
async function queuedPublic(owner,authority_id){return imitation.createHotArticleBatch(owner,{request_key:crypto.randomUUID(),writer:'xiaoyu_agent0YYLX',...(authority_id?{authority_id}:{})},async()=>structuredClone(shellCollection));}
await collectionCase('expired_claim_recovery_rotates_token_and_rejects_old_writer',async()=>{const own='offline-public-expired',b=await queuedPublic(own),first=await imitation.claimHotArticleCollection(own,{batch_id:b.batch.id});sql.prepare('UPDATE hot_article_batches SET claim_expires=? WHERE id=?').run('2000-01-01T00:00:00Z',b.batch.id);assert.equal((await imitation.readHotArticleBatch(own,{batch_id:b.batch.id})).batch.collection_claimable,true);await assert.rejects(imitation.saveHotArticleCollection(own,{batch_id:b.batch.id,claim_token:first.claim_token,input_sha256:first.input_sha256,result:publicResult()}));const next=await imitation.claimHotArticleCollection(own,{batch_id:b.batch.id});assert.equal(next.claimed,true);assert.notEqual(next.claim_token,first.claim_token);await assert.rejects(imitation.failHotArticleCollection(own,{batch_id:b.batch.id,claim_token:first.claim_token,input_sha256:first.input_sha256,message:'old loser'}));const blocked=await imitation.failHotArticleCollection(own,{batch_id:b.batch.id,claim_token:next.claim_token,input_sha256:next.input_sha256,message:'OFFLINE SYNTHETIC public access failed, no bypass'});assert.equal(blocked.batch.state,'blocked');assert.match(blocked.batch.error,/no bypass/);});
await collectionCase('zero_row_collection_update_rolls_back_input',async()=>{const own='offline-public-save-race',b=await queuedPublic(own),lease=await imitation.claimHotArticleCollection(own,{batch_id:b.batch.id}),original=sql.prepare('SELECT input_json FROM hot_article_batches WHERE id=?').get(b.batch.id).input_json;beforeRun=async query=>{if(query.startsWith('UPDATE hot_article_batches SET input_json=')&&query.includes("state='collecting_public'")){beforeRun=null;sql.prepare("UPDATE hot_article_batches SET state='blocked' WHERE id=?").run(b.batch.id);}};await assert.rejects(imitation.saveHotArticleCollection(own,{batch_id:b.batch.id,claim_token:lease.claim_token,input_sha256:lease.input_sha256,result:publicResult()}));const back=sql.prepare('SELECT state,input_json FROM hot_article_batches WHERE id=?').get(b.batch.id);assert.equal(back.state,'collecting_public');assert.equal(back.input_json,original);});
const fullSyntheticRead=(reads=100000)=>{const body='这是一百字以上的离线合成电影测试正文。'.repeat(9),read=publicRead({method:'public_web_read',body,full_text_read:true,visible_text:'离线合成电影观察测试\n2026-10-01\n'+body+'\n阅读 '+reads});return {...read,metric_html:'<script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',url:read.url,headline:read.title,interactionStatistic:[{interactionType:'ViewAction',userInteractionCount:reads}]})+'</script>'};};
await collectionCase('zero_reads_stays_lead_no_grant_no_research',async()=>{const own='offline-public-one-metric',b=await queuedPublic(own),lease=await imitation.claimHotArticleCollection(own,{batch_id:b.batch.id});const result=await imitation.saveHotArticleCollection(own,{batch_id:b.batch.id,claim_token:lease.claim_token,input_sha256:lease.input_sha256,result:publicResult([fullSyntheticRead(0)])});assert.equal(result.batch.state,'insufficient');assert.equal(result.batch.input.collection.articles.length,0);assert.equal(result.batch.input.collection.leads[0].reads.value,0);assert.equal(result.batch.input.collection.leads[0].likes.value,null);assert.equal(result.batch.input.collection.leads[0].heat_state,'partial_metric');await assert.rejects(imitation.claimHotArticleBatch(own,{batch_id:b.batch.id}));});
await collectionCase('no_grants_runs_provider_or_articles_created_by_public_phase',async()=>{assert.equal(providerCalls,collectionBefore.paid);assert.equal(sql.prepare('SELECT count(*) n FROM editorial_authority_v3').get().n,collectionBefore.grants);assert.equal(sql.prepare('SELECT count(*) n FROM articles').get().n,collectionBefore.articles);assert.equal(sql.prepare('SELECT count(*) n FROM editorial_runs_v3').get().n,collectionBefore.runs);});
await collectionCase('valid_current_writer_scope_continues_same_batch_without_second_event',async()=>{const own='offline-public-active-authority',grant=await imitationGrant(own),b=await queuedPublic(own,grant.authority_id),events=eventCalls,lease=await imitation.claimHotArticleCollection(own,{batch_id:b.batch.id});const result=await imitation.saveHotArticleCollection(own,{batch_id:b.batch.id,claim_token:lease.claim_token,input_sha256:lease.input_sha256,result:publicResult([fullSyntheticRead()])});assert.equal(result.batch.state,'queued');assert.equal(eventCalls,events);const claim=await imitation.claimHotArticleBatch(own,{batch_id:b.batch.id});assert.equal(claim.claimed,true);assert.equal(claim.input_sha256,result.batch.input_sha256);assert.equal(claim.input.collection.articles[0].body,fullSyntheticRead().body);});
await collectionCase('revoked_writer_scope_keeps_public_result_and_blocks_research',async()=>{const own='offline-public-revoked-authority',grant=await imitationGrant(own),b=await queuedPublic(own,grant.authority_id),lease=await imitation.claimHotArticleCollection(own,{batch_id:b.batch.id});sql.prepare("UPDATE editorial_authority_v3 SET state='revoked' WHERE id=?").run(grant.authority_id);const result=await imitation.saveHotArticleCollection(own,{batch_id:b.batch.id,claim_token:lease.claim_token,input_sha256:lease.input_sha256,result:publicResult([fullSyntheticRead()])});assert.equal(result.batch.state,'needs_authorization');assert.equal(result.batch.input.collection.articles.length,1);await assert.rejects(imitation.claimHotArticleBatch(own,{batch_id:b.batch.id}));});
await collectionCase('lease_expires_after_validation_before_atomic_write',async()=>{
 const own='offline-public-lease-during-save',b=await queuedPublic(own),lease=await imitation.claimHotArticleCollection(own,{batch_id:b.batch.id});
 const expires=Date.now()+500;sql.prepare('UPDATE hot_article_batches SET claim_expires=? WHERE id=?').run(new Date(expires).toISOString(),b.batch.id);
 const query='SELECT state,input_json,input_sha256,claim_hash,claim_expires,updated FROM hot_article_batches WHERE id=?',original=sql.prepare(query).get(b.batch.id),paid=providerCalls;
 let reachedWrite=false;
 beforeRun=async query=>{if(query.startsWith('UPDATE hot_article_batches SET input_json=')&&query.includes("state='collecting_public'")){beforeRun=null;reachedWrite=true;await new Promise(resolve=>setTimeout(resolve,Math.max(0,expires-Date.now())+20));}};
 try{await assert.rejects(imitation.saveHotArticleCollection(own,{batch_id:b.batch.id,claim_token:lease.claim_token,input_sha256:lease.input_sha256,result:publicResult()}));}finally{beforeRun=null;}
 assert.equal(reachedWrite,true,'lease must pass the initial check and expire at the actual write');assert.deepEqual(sql.prepare(query).get(b.batch.id),original);assert.equal(providerCalls,paid);
});
await collectionCase('atomic_write_keeps_token_and_input_cas_fences',async()=>{
 for(const field of ['claim_hash','input_sha256']){
  const own='offline-public-final-cas-'+field,b=await queuedPublic(own),lease=await imitation.claimHotArticleCollection(own,{batch_id:b.batch.id}),original=sql.prepare('SELECT input_json,input_sha256,claim_hash FROM hot_article_batches WHERE id=?').get(b.batch.id);
  let reachedWrite=false;
  beforeRun=async query=>{if(query.startsWith('UPDATE hot_article_batches SET input_json=')&&query.includes("state='collecting_public'")){beforeRun=null;reachedWrite=true;sql.prepare('UPDATE hot_article_batches SET '+field+'=? WHERE id=?').run('e'.repeat(64),b.batch.id);}};
  try{await assert.rejects(imitation.saveHotArticleCollection(own,{batch_id:b.batch.id,claim_token:lease.claim_token,input_sha256:lease.input_sha256,result:publicResult()}));}finally{beforeRun=null;}
  assert.equal(reachedWrite,true);assert.deepEqual(sql.prepare('SELECT input_json,input_sha256,claim_hash FROM hot_article_batches WHERE id=?').get(b.batch.id),original);
 }
});
console.log('PASS '+collectionCases.length+' OFFLINE public collection lifecycle cases: same intent/event, no writer grant, exact owner/lease/hash, expired claim recovery, duplicate/overwrite fences, atomic rollback, search-only leads/null metrics, one-zero-metric gate and current/revoked scope; zero additional provider/network calls.');

// Post-rollout gate regressions use local legacy snapshots only; never rehash production history.
const gateCases=[];
async function gateCase(name,execute){await execute();gateCases.push(name);}
async function gateFixture(suffix,{claimed=false,researched=false}={}){
 const own='offline-read-gate-'+suffix,grant=await imitationGrant(own),batch=await imitation.createHotArticleBatch(own,{request_key:crypto.randomUUID(),writer:'xiaoyu_agent0YYLX',authority_id:grant.authority_id},async()=>structuredClone(collection));
 const lease=claimed||researched?await imitation.claimHotArticleBatch(own,{batch_id:batch.batch.id}):null,result=researchFor(grant,'xiaoyu_agent0YYLX');
 const saved=researched?await imitation.saveHotArticleResearch(own,{batch_id:batch.batch.id,claim_token:lease.claim_token,input_sha256:batch.batch.input_sha256,result}):null;
 const start={authority_id:grant.authority_id,run_kind:'hot_article_imitation',writer:'xiaoyu_agent0YYLX',batch_id:batch.batch.id,expected_batch_sha256:saved?.batch.result_sha256,expected_bindings_sha256:grant.bindings_sha256,expected_writer_model:xmodel,topic:result.proposals[0].topic,angle:result.proposals[0].angle,confirm:true};
 return {own,grant,batch,lease,result,saved,start};
}
function patchLegacyInput(batchId,patch){
 const before=sql.prepare('SELECT input_json,input_sha256 FROM hot_article_batches WHERE id=?').get(batchId),input=JSON.parse(before.input_json);patch(input.collection.articles[0]);const raw=JSON.stringify(input),sha=hash(raw);sql.prepare('UPDATE hot_article_batches SET input_json=?,input_sha256=? WHERE id=?').run(raw,sha,batchId);return {before,sha};
}
function lowReference(a){a.reads.value=99999;a.reads.evidence.label='JSON-LD ViewAction userInteractionCount=99999';}
function gateInit(started,result){const p=result.proposals[0];return {run_id:started.run_id,expected_input_sha256:started.input_sha256,topic:p.topic,angle:p.angle,style_requirements:copyright.imitationStyleRequirements(p),materials:p.materials,sources:p.sources,facts:p.facts,participants:result.participants,research:result.research,confirm:true};}
for(const [name,patch] of [
 ['below_minimum',lowReference],
 ['reads_missing',a=>{a.reads={value:null,evidence:null};a.likes.value=1000000;}],
 ['evidence_missing',a=>{a.reads.evidence=null;}],
 ['other_article_evidence',a=>{a.reads.evidence.url=reference2.url;}],
 ['legacy_visible_line',a=>{a.reads.evidence.label='公开可见独立指标行：阅读 100000';}],
])await gateCase('legacy_queued_'+name,async()=>{
 const f=await gateFixture(name);patchLegacyInput(f.batch.batch.id,patch);const bytes=sql.prepare('SELECT * FROM hot_article_batches WHERE id=?').get(f.batch.batch.id),writes=dbWrites,events=eventCalls;
 assert.equal((await imitation.readHotArticleBatch(f.own,{batch_id:f.batch.batch.id})).batch.claimable,false);
 await assert.rejects(imitation.claimHotArticleBatch(f.own,{batch_id:f.batch.batch.id}),/10万/);
 assert.equal((await imitation.dispatchHotArticleBatch(f.own,{batch_id:f.batch.batch.id})).read_only,true);
 assert.deepEqual(sql.prepare('SELECT * FROM hot_article_batches WHERE id=?').get(f.batch.batch.id),bytes);assert.equal(dbWrites,writes);assert.equal(eventCalls,events);
});
await gateCase('new_ready_collector_cannot_queue_low_reads',async()=>{
 const own='offline-read-gate-new-invalid',grant=await imitationGrant(own),low=structuredClone(collection);lowReference(low.articles[0]);const events=eventCalls,b=await imitation.createHotArticleBatch(own,{request_key:crypto.randomUUID(),writer:'xiaoyu_agent0YYLX',authority_id:grant.authority_id},async()=>low);assert.equal(b.batch.state,'insufficient');assert.equal(b.batch.claimable,false);assert.equal(eventCalls,events);
});
await gateCase('expired_research_claim_cannot_reenter',async()=>{
 const f=await gateFixture('expired',{claimed:true});patchLegacyInput(f.batch.batch.id,lowReference);sql.prepare('UPDATE hot_article_batches SET claim_expires=? WHERE id=?').run('2000-01-01T00:00:00Z',f.batch.batch.id);const writes=dbWrites;await assert.rejects(imitation.claimHotArticleBatch(f.own,{batch_id:f.batch.batch.id}),/10万/);assert.equal(dbWrites,writes);
});
await gateCase('preexisting_claim_cannot_save_new_research',async()=>{
 const f=await gateFixture('claimed',{claimed:true}),changed=patchLegacyInput(f.batch.batch.id,lowReference),writes=dbWrites;await assert.rejects(imitation.saveHotArticleResearch(f.own,{batch_id:f.batch.batch.id,claim_token:f.lease.claim_token,input_sha256:changed.sha,result:f.result}),/10万/);assert.equal(dbWrites,writes);assert.equal(sql.prepare('SELECT result_sha256 FROM hot_article_batches WHERE id=?').get(f.batch.batch.id).result_sha256,null);assert.equal(sql.prepare('SELECT count(*) n FROM hot_article_topic_reservations WHERE owner=?').get(f.own).n,0);
});
await gateCase('legacy_ready_hot_and_generic_start_denied',async()=>{
 const f=await gateFixture('ready',{researched:true});patchLegacyInput(f.batch.batch.id,lowReference);const writes=dbWrites;await assert.rejects(imitation.startHotArticleEditorial(f.own,{batch_id:f.batch.batch.id}),/10万/);await assert.rejects(authority.startEditorialRunV3(f.own,f.start),/10万/);assert.equal(dbWrites,writes);assert.equal(sql.prepare('SELECT count(*) n FROM editorial_runs_v3 WHERE owner=?').get(f.own).n,0);
});
await gateCase('preexisting_uninitialized_generic_run_cannot_initialize',async()=>{
 const f=await gateFixture('uninitialized',{researched:true}),started=await authority.startEditorialRunV3(f.own,f.start);patchLegacyInput(f.batch.batch.id,lowReference);const writes=dbWrites,bytes=sql.prepare('SELECT * FROM editorial_runs_v3 WHERE id=?').get(started.run_id);
 assert.equal((await authority.startEditorialRunV3(f.own,f.start)).already_started,true);await assert.rejects(runtime.initializeEditorialV3(f.own,gateInit(started,f.result)),/10万/);await assert.rejects(imitation.startHotArticleEditorial(f.own,{batch_id:f.batch.batch.id}),/10万/);assert.deepEqual(sql.prepare('SELECT * FROM editorial_runs_v3 WHERE id=?').get(started.run_id),bytes);assert.equal(dbWrites,writes);
});
await gateCase('research_claim_input_hash_cas',async()=>{
 const f=await gateFixture('claim-cas');let reached=false;beforeRun=async query=>{if(query.startsWith("UPDATE hot_article_batches SET state='researching'")){beforeRun=null;reached=true;patchLegacyInput(f.batch.batch.id,lowReference);}};
 try{assert.equal((await imitation.claimHotArticleBatch(f.own,{batch_id:f.batch.batch.id})).claimed,false);}finally{beforeRun=null;}assert.equal(reached,true);const batch=sql.prepare('SELECT state,claim_hash FROM hot_article_batches WHERE id=?').get(f.batch.batch.id);assert.equal(batch.state,'queued');assert.equal(batch.claim_hash,null);
});
await gateCase('generic_start_input_hash_cas',async()=>{
 const f=await gateFixture('start-cas',{researched:true});let reached=false;beforeRun=async query=>{if(query.startsWith('INSERT OR IGNORE INTO editorial_runs_v3')){beforeRun=null;reached=true;patchLegacyInput(f.batch.batch.id,lowReference);}};
 try{await assert.rejects(authority.startEditorialRunV3(f.own,f.start));}finally{beforeRun=null;}assert.equal(reached,true);assert.equal(sql.prepare('SELECT count(*) n FROM editorial_runs_v3 WHERE owner=?').get(f.own).n,0);
});
await gateCase('generic_initialize_input_hash_cas',async()=>{
 const f=await gateFixture('init-cas',{researched:true}),started=await authority.startEditorialRunV3(f.own,f.start);let reached=false;beforeRun=async query=>{if(query.startsWith('UPDATE editorial_runs_v3 SET snapshot_json=')){beforeRun=null;reached=true;patchLegacyInput(f.batch.batch.id,lowReference);}};
 try{await assert.rejects(runtime.initializeEditorialV3(f.own,gateInit(started,f.result)));}finally{beforeRun=null;}assert.equal(reached,true);const run=sql.prepare('SELECT initialized,state,snapshot_sha256 FROM editorial_runs_v3 WHERE id=?').get(started.run_id);assert.equal(run.initialized,0);assert.equal(run.state,'research');assert.equal(run.snapshot_sha256,started.snapshot_sha256);
});
await gateCase('historical_completed_low_reads_still_read_and_repeat',async()=>{
 const changed=patchLegacyInput(first.batch.id,lowReference),bytes=sql.prepare('SELECT * FROM hot_article_batches WHERE id=?').get(first.batch.id),writes=dbWrites,paid=providerCalls,puts=bucketPuts;
 try{
  const read=await imitation.readHotArticleBatch(owner,{batch_id:first.batch.id});assert.equal(read.saved_text.final_sha256,hash(article));assert.equal((await runtime.readEditorialV3(owner,{run_id:rid})).state,'text_saved');assert.equal((await imitation.startHotArticleEditorial(owner,{batch_id:first.batch.id})).editorial.run_id,rid);
  assert.equal((await authority.startEditorialRunV3(owner,{authority_id:g.authority_id,run_kind:'hot_article_imitation',writer:'xiaoyu_agent0YYLX',batch_id:first.batch.id,expected_batch_sha256:read.batch.result_sha256,expected_bindings_sha256:g.bindings_sha256,expected_writer_model:xmodel,topic:research.proposals[0].topic,angle:research.proposals[0].angle,confirm:true})).already_started,true);
  assert.equal((await imitation.saveHotArticleResearch(owner,{...save,input_sha256:changed.sha})).duplicate,true);assert.deepEqual(sql.prepare('SELECT * FROM hot_article_batches WHERE id=?').get(first.batch.id),bytes);assert.equal(dbWrites,writes);assert.equal(providerCalls,paid);assert.equal(bucketPuts,puts);
 }finally{sql.prepare('UPDATE hot_article_batches SET input_json=?,input_sha256=? WHERE id=?').run(changed.before.input_json,changed.before.input_sha256,first.batch.id);}
});
console.log('PASS '+gateCases.length+' OFFLINE high-read backend cases: legacy queued/claimed/research_ready/direct initialization protection, exact 100000 main-flow boundary, identity-bound read evidence, atomic input CAS, completed/idempotent read preservation; zero extra provider/network calls.');

// Optional integration of a real NORMAL public-search response. This still
// saves only to local SQLite, creates no live batch and makes no model request.
if(process.env.HOT_PUBLIC_OBSERVED_SAMPLE){
 const actual=JSON.parse(fs.readFileSync(process.env.HOT_PUBLIC_OBSERVED_SAMPLE,'utf8')),own='local-observed-public-search',b=await queuedPublic(own),lease=await imitation.claimHotArticleCollection(own,{batch_id:b.batch.id}),paid=providerCalls;
 const actualSaved=await imitation.saveHotArticleCollection(own,{batch_id:b.batch.id,claim_token:lease.claim_token,input_sha256:lease.input_sha256,result:actual});
 const actualCollection=actualSaved.batch.input.collection;
 assert.equal(actualCollection.articles.length,0);assert.equal(actualCollection.leads.length,actual.reads.length);assert.equal(actualSaved.batch.state,'insufficient');assert.equal(providerCalls,paid);
 const evidence={test_kind:'REAL NORMAL PUBLIC SEARCH RESPONSE / LOCAL SQLITE INTEGRATION ONLY',live_site_mutated:false,new_production_batches:0,paid_model_requests:0,observed_at:actual.reads[0]?.observed_at??null,queries:actual.queries,submitted_reads:actual.reads.length,qualified_articles:actualCollection.articles.length,visible_leads:actualCollection.leads.map(a=>({url:a.url,title:a.title,published_at:a.published_at,body_state:a.body_state,body_sha256:a.body_sha256,reads:a.reads.value,likes:a.likes.value,comments:a.comments.value,heat_state:a.heat_state,source_content_sha256:a.acquisition.source_content_sha256})),state:actualSaved.batch.state,coverage:actualCollection.coverage,limitations:'Indexed article leads only. Full text and current heat metrics remain unverified. Production rollout and same new-batch normal executor test are owned by the parent.'};
 if(process.env.HOT_PUBLIC_OBSERVED_REPORT)fs.writeFileSync(process.env.HOT_PUBLIC_OBSERVED_REPORT,JSON.stringify(evidence,null,2)+'\n');
 console.log('PASS REAL NORMAL public search data → production collection validator/claim/save functions → local SQLite: '+actualCollection.leads.length+' indexed leads, 0 full-text/heat-qualified articles, 0 additional model requests, 0 production batches.');
}
