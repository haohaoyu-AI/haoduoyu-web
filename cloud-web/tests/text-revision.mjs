import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {testOutline} from './fixtures/writing-outline.mjs';

const sql = new DatabaseSync(':memory:'), nativeRequire = createRequire(import.meta.url);
for (const f of fs.readdirSync('drizzle').filter(n => n.endsWith('.sql')).sort()) sql.exec(fs.readFileSync('drizzle/' + f, 'utf8'));
let provider = 0, events = 0, platform = 0, objects = 0, writes = 0;
const db = {batch: async statements => {sql.exec('BEGIN'); try {const out = []; for (const s of statements) out.push(await s.run()); sql.exec('COMMIT'); return out;} catch (e) {sql.exec('ROLLBACK'); throw e;}}, prepare: query => ({bind: (...args) => ({first: async () => sql.prepare(query).get(...args) || null, all: async () => ({results: sql.prepare(query).all(...args)}), run: async () => {writes++; return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}};}})})};
const bucket = {put: async () => {objects++; throw Error('unexpected object');}, get: async () => {objects++; throw Error('unexpected object');}};
const mockKey = 'opaque.AgentReceiptKey.X7vL9t2P4';
const globals = {crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Set, Date, Error, URL, btoa, atob, Request, Response, ReadableStream, AbortSignal, setInterval, clearInterval};
const modules = {};
function load(name) {
 if (modules[name]) return modules[name]; const ex = {}; modules[name] = ex;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/' + name + '.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {...globals, exports: ex, require: n => n === 'cloudflare:workers' ? {env: {DB: db, BUCKET: bucket, CLAUDE_CONFIG_KEY: btoa('01234567890123456789012345678901')}} : n === './events' ? {readiness: async () => ({}), dispatch: async () => {events++; throw Error('unexpected event');}, subscribe: async () => {platform++; throw Error('unexpected platform');}} : n.startsWith('./') ? load(n.slice(2)) : nativeRequire(n), fetch: async () => {provider++; throw Error('real network disabled');}});
 return ex;
}
function route() {const ex = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/mcp/route.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {...globals, exports: ex, require: n => n.includes('/lib/') ? load(n.split('/').at(-1)) : nativeRequire(n), console: {info() {}}}); return ex;}
const s = load('stepwise-text'), r = load('text-revision'), inputModule = load('writing-input'), rules = load('writing-supplement');
const article = {title: '合成初稿', paragraphs: Array.from({length: 25}, (_, i) => String(i).padStart(2, '0') + '证'.repeat(98))};
const rewritten = {title: '合成重写稿', paragraphs: article.paragraphs.map(p => p.replace(/证/g, '文'))};
const sources = [{title: '合成证据1', url: 'https://example.com/one', published: '2026-10-05'}, {title: '合成证据2', url: 'https://example.com/two', published: '2026-10-05'}];
const topic = {topic: '合成选题', materials: '独立离线核验的合成素材，不代表实际新闻事实。'.repeat(10), outline: testOutline, sources};
const model = 'claude-opus-5-5';
async function setup(owner) {
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('01234567890123456789012345678901'), {name: 'AES-GCM'}, false, ['encrypt']);
 const iv = crypto.getRandomValues(new Uint8Array(12)), data = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(owner)}, key, new TextEncoder().encode(mockKey));
 const enc = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
 sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(owner, model, JSON.stringify({iv: enc(iv), data: enc(data)}), '1', new Date().toISOString());
 const batch = await s.createStepwiseTextTest(owner, {confirm: true, expected_model: model, expected_prompt_version: rules.effectiveWritingStyleVersion, xiaoyu: topic, claude: {...topic, topic: '另一选题'}});
 const claim = await s.claimStepwiseTextWriter(owner, {run_id: batch.run_id, writer: 'xiaoyu', confirm: true});
 await s.saveStepwiseXiaoyuText(owner, {run_id: batch.run_id, item_id: claim.item_id, token: claim.token, ...article, confirm: true});
 const participants = Object.fromEntries(['review', 'rewrite', 'verify'].map(stage => [stage, {actor_id: crypto.randomUUID(), model: 'agent-' + stage + '-v1'}]));
 const create = {run_id: batch.run_id, writer: 'xiaoyu', writer_actor_id: crypto.randomUUID(), writer_execution_id: crypto.randomUUID(), participants, expected_provider_model: model, expected_prompt_version: rules.effectiveWritingStyleVersion, confirm: true};
 return {owner, batch, claim, create};
}
const dbState = () => JSON.stringify({runs: sql.prepare('SELECT * FROM writing_runs ORDER BY id').all(), batches: sql.prepare('SELECT * FROM manual_writing_batches ORDER BY id').all(), attempts: sql.prepare('SELECT * FROM claude_attempts ORDER BY id').all()});
const review = {status: 'completed', issues: [{id: 'issue-1', paragraph: 1, quote: article.paragraphs[0].slice(0, 12), problem: '合成表达问题', recommendation: '改用自然口语与有根据的幽默', source_urls: [sources[0].url]}]};
const rewrite = {status: 'completed', article: rewritten, changes: [{issue_id: 'issue-1', paragraph: 1, quote: rewritten.paragraphs[0].slice(0, 12), change: '落实三条表达规则'}]};
const verify = {status: 'completed', passed: true, checks: [{issue_id: 'issue-1', paragraph: 1, quote: rewritten.paragraphs[0].slice(0, 12), resolved: true, reason: '逐项核对表达与事实来源'}], remaining_problems: []};
async function claim(owner, flow, stage, extra = {}) {return r.claimTextRevisionStage(owner, {flow_id: flow.flow_id, stage, expected_version: stage === 'verify' ? 2 : 1, expected_model: flow.snapshot.participants[stage].model, expected_prompt_version: flow.snapshot.prompt_version, confirm: true, ...extra});}
function saveInput(flow, claimed, report, extra = {}) {return {flow_id: flow.flow_id, stage: claimed.stage, item_id: claimed.item_id, token: claimed.token, execution_id: crypto.randomUUID(), actor_id: claimed.prompts.participant.actor_id, expected_model: claimed.prompts.participant.model, expected_version: claimed.prompts.input_version, expected_prompt_version: claimed.prompts.prompt_version, input_sha256: claimed.prompts.input_sha256, raw_result: JSON.stringify(report), confirm: true, ...extra};}
async function stage(owner, flow, name, report) {const c = await claim(owner, flow, name), args = saveInput(flow, c, report); return {claim: c, args, saved: await r.saveTextRevisionStage(owner, args)};}

// New snapshots carry the complete fused V2.2 prompt; fixed references and old snapshots remain intact.
const skeleton = await inputModule.writingInputSkeleton('2026-10-05', 'xiaoyu');
const expressionRules = ['已核验的事实和数字自然讲述', '把判断自然融入人和事', '口语、自然反问、口头转折和贴题调侃贯穿各节', '通常1–2句一段，照顾手机阅读'];
for (const text of expressionRules) {assert.ok(skeleton.system_prompt.includes(text)); assert.ok(skeleton.writing_prompt.includes(text));}
assert.ok(skeleton.system_prompt.includes('不沿用旧默认规则对短句、单句段的一概限制')); assert.ok(skeleton.system_prompt.includes('本版表达要求适用于新生成和未冻结改稿')); assert.ok(!skeleton.system_prompt.includes(rules.expressionPriority));
assert.equal(skeleton.writing_prompt, load('writing-prompt-v22').writingPromptV22); assert.ok(skeleton.writing_prompt.includes(load('writing-fixed-references').fixedWritingReferences));
assert.equal(skeleton.prompt_version, load('writing-prompt-v22').writingPromptV22Version);
const oldPrompt = '完整旧写作提示词，仅用于旧冻结快照校验', oldSystem = '旧系统提示词';
const oldBase = {...skeleton, writing_prompt: oldPrompt, prompt_sha256: await inputModule.hashText(oldPrompt), system_prompt: oldSystem, system_prompt_sha256: await inputModule.hashText(oldSystem), prompt_version: 'frozen-old-version'};
const oldInput = await inputModule.assembleWritingInput(oldBase, topic); assert.equal(oldInput.writing_prompt, oldPrompt); assert.equal(oldInput.system_prompt, oldSystem); assert.equal(oldInput.prompt_version, 'frozen-old-version');
console.log('PASS actual prompts: complete fused V2.2 includes all expression rules and fixed prose/layout; legacy suffix not repeated; old frozen inputs retain old prompts');

const f = await setup('full');
// Used legacy quota fixtures remain byte-for-byte untouched by the new flow.
const legacyBatch = crypto.randomUUID();
sql.prepare('INSERT INTO manual_writing_batches(id,owner,authorization_key,day,input_hash,snapshot,created) VALUES(?,?,?,?,?,?,?)').run(legacyBatch, 'full', load('manual-batch').manualAuthorizationKey, '2026-10-05', 'legacy', '{"legacy":true}', new Date().toISOString());
for (const kind of ['daily', 'manual:' + legacyBatch, 'workflow_test', 'workflow_rewrite_v2', 'sample']) {
 const id = 'legacy-' + kind;
 sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run(id, 'full', '2026-10-05', 'claude', kind, 'submitted', id + '-item', '2026-10-05', '2026-10-05');
 sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(id, 'full', '2026-10-05', 'completed', '{"quota":"spent"}', '2026-10-05');
}
const untouched = () => JSON.stringify({runs: sql.prepare("SELECT * FROM writing_runs WHERE id LIKE 'legacy-%' OR (owner='full' AND writer='xiaoyu' AND run_kind LIKE 'stepwise_text:%') ORDER BY id").all(), attempts: sql.prepare("SELECT * FROM claude_attempts WHERE id LIKE 'legacy-%' OR id=? ORDER BY id").all(s.stepwiseTextAttemptId('full', f.batch.run_id, 'xiaoyu')), batches: sql.prepare('SELECT * FROM manual_writing_batches WHERE id IN (?,?) ORDER BY id').all(legacyBatch, f.batch.run_id)});
const legacyBefore = untouched(), invalidCreateBefore = dbState();
for (const extra of [{confirm: false}, {scope: 'custom'}, {budget: 99}, {expected_prompt_version: 'wrong'}, {writer_actor_id: f.create.participants.review.actor_id}, {writer_actor_id: f.create.participants.review.actor_id.toUpperCase()}, {participants: {...f.create.participants, verify: f.create.participants.rewrite}}]) await assert.rejects(r.createTextRevision('full', {...f.create, ...extra}));
await assert.rejects(r.createTextRevision('other', f.create)); assert.equal(dbState(), invalidCreateBefore);
const concurrentCreate = await Promise.all([r.createTextRevision('full', f.create), r.createTextRevision('full', f.create)]);
assert.equal(concurrentCreate.filter(x => x.created).length, 1); const flow = concurrentCreate[0]; assert.equal(flow.flow_id, concurrentCreate[1].flow_id);
assert.equal(flow.paid_scope.approved_calls, 0); assert.equal(flow.paid_scope.used_calls, 0); assert.equal(flow.paid_scope.potential_additional_calls, 3); assert.equal(flow.paid_scope.provider_enabled, false);
assert.equal(flow.current_phase, 'review_pending'); assert.equal(JSON.stringify(flow).includes(f.claim.token), false);
await assert.rejects(claim('full', flow, 'rewrite'));
for (const extra of [{confirm: false}, {expected_version: 2}, {expected_model: 'wrong'}, {expected_prompt_version: 'wrong'}]) await assert.rejects(claim('full', flow, 'review', extra));
sql.prepare('UPDATE claude_settings SET model=? WHERE owner=?').run('changed', 'full'); await assert.rejects(claim('full', flow, 'review')); sql.prepare('UPDATE claude_settings SET model=? WHERE owner=?').run(model, 'full');
const claims = await Promise.all([claim('full', flow, 'review'), claim('full', flow, 'review')]); assert.equal(claims.filter(c => c.claimed).length, 1); const c = claims.find(c => c.claimed); assert.equal('token' in claims.find(c => !c.claimed), false);
for (const text of expressionRules) assert.ok(c.prompts.system_prompt.includes(text));
assert.equal(c.prompts.system_prompt, flow.snapshot.stage_system_prompts.review);
assert.equal(JSON.parse(c.prompts.user_prompt).outline, testOutline.trim()); for (const source of sources) assert.ok(c.prompts.user_prompt.includes(source.url));
assert.equal(JSON.stringify(await r.readTextRevision('full', {flow_id: flow.flow_id})).includes(c.token), false);
const args = saveInput(flow, c, review);
for (const extra of [{confirm: false}, {actor_id: f.create.writer_actor_id}, {execution_id: f.create.writer_execution_id}, {expected_model: 'wrong'}, {input_sha256: 'wrong'}, {expected_version: 2}, {token: f.claim.token}]) await assert.rejects(r.saveTextRevisionStage('full', {...args, ...extra}));
await assert.rejects(r.saveTextRevisionStage('other', args));
const saves = await Promise.all([r.saveTextRevisionStage('full', args), r.saveTextRevisionStage('full', args)]); assert.equal(saves.filter(x => !x.read_only).length, 1); assert.equal(saves[0].current_phase, 'rewrite_pending');
const beforeReplay = dbState(), writesBefore = writes; assert.equal((await r.saveTextRevisionStage('full', args)).read_only, true); await r.readTextRevision('full', {flow_id: flow.flow_id}); assert.equal(dbState(), beforeReplay); assert.equal(writes, writesBefore);
await assert.rejects(r.saveTextRevisionStage('full', {...args, raw_result: JSON.stringify({...review, issues: []})}));
const rewrittenStage = await stage('full', flow, 'rewrite', rewrite); assert.equal(rewrittenStage.saved.current_phase, 'verify_pending');
assert.equal(rewrittenStage.saved.initial_version.body_sha256, flow.initial_version.body_sha256); assert.deepEqual(JSON.parse(JSON.stringify(rewrittenStage.saved.initial_version.article)), article); assert.deepEqual(JSON.parse(JSON.stringify(rewrittenStage.saved.rewritten_version.article)), rewritten); assert.equal(rewrittenStage.saved.rewritten_version.source, 'agent_text');
await assert.rejects(r.confirmTextRevision('full', {flow_id: flow.flow_id, expected_version: 2, expected_body_sha256: rewrittenStage.saved.rewritten_version.body_sha256, confirm: true}));
const verified = await stage('full', flow, 'verify', verify); assert.equal(verified.saved.current_phase, 'awaiting_user_confirmation'); assert.equal(verified.claim.prompts.input_version, 2);
for (const text of expressionRules) {assert.ok(rewrittenStage.claim.prompts.system_prompt.includes(text)); assert.ok(verified.claim.prompts.system_prompt.includes(text));}
const finalArgs = {flow_id: flow.flow_id, expected_version: 2, expected_body_sha256: verified.saved.rewritten_version.body_sha256, confirm: true};
await assert.rejects(r.confirmTextRevision('full', {...finalArgs, confirm: false})); await assert.rejects(r.confirmTextRevision('full', {...finalArgs, expected_body_sha256: 'wrong'}));
assert.equal((await r.confirmTextRevision('full', finalArgs)).current_phase, 'user_confirmed'); const finalBefore = dbState(), finalWrites = writes; assert.equal((await r.confirmTextRevision('full', finalArgs)).read_only, true); await r.readTextRevision('full', {flow_id: flow.flow_id}); assert.equal(dbState(), finalBefore); assert.equal(writes, finalWrites);
for (const receipt of Object.values(verified.saved.results)) {assert.equal(receipt.source, 'owner_attested_agent_result'); assert.equal(receipt.prompt_version, flow.snapshot.prompt_version); assert.equal(receipt.raw_result, JSON.stringify(receipt.stage === 'review' ? review : receipt.stage === 'rewrite' ? rewrite : verify));}
console.log('PASS complete phases: initial v1 -> separate review/issues -> rewrite v2/changes -> separate verification -> awaiting user -> explicit confirmation; atomic create/claim/save; all versions, hashes, actor/model bindings and exact safe receipts retained; replay makes zero writes');

for (const [name, raw] of [
 ['failed', JSON.stringify({status: 'failed', reason: 'execution_failed'})],
 ['anchor', JSON.stringify({...review, issues: [{...review.issues[0], quote: '不在原文的引文'}]})],
 ['invalid-json', 'safe invalid JSON'],
 ['opaque-key', JSON.stringify({...review, issues: [{...review.issues[0], problem: mockKey}]})],
 ['generic-key', JSON.stringify({...review, issues: [{...review.issues[0], problem: 'sk-' + 'z'.repeat(32)}]})],
 ['unicode-key', JSON.stringify({...review, issues: [{...review.issues[0], problem: [...('sk-' + 'z'.repeat(32))].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}]})],
 ]) {
 const fixture = await setup(name), fl = await r.createTextRevision(name, fixture.create), cl = await claim(name, fl, 'review'), value = saveInput(fl, cl, review, {raw_result: raw});
 const saved = await r.saveTextRevisionStage(name, value); assert.equal(saved.current_phase, 'review_failed'); await assert.rejects(claim(name, fl, 'rewrite')); await assert.rejects(r.confirmTextRevision(name, {...finalArgs, flow_id: fl.flow_id}));
 if (name.endsWith('key')) {assert.equal(saved.results.review.raw_result, undefined); assert.equal(saved.results.review.report.reason, 'credential_detected'); const stored = sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get('text_revision:' + name + ':' + fl.flow_id).response; assert.equal(stored.includes(mockKey), false); assert.equal(stored.includes('sk-' + 'z'.repeat(32)), false);}
 const snapshot = dbState(), wc = writes; await r.saveTextRevisionStage(name, value); await r.readTextRevision(name, {flow_id: fl.flow_id}); assert.equal(dbState(), snapshot); assert.equal(writes, wc);
 }
const leak = await setup('token-echo'), leakFlow = await r.createTextRevision('token-echo', leak.create), leakClaim = await claim('token-echo', leakFlow, 'review');
const leakResult = await r.saveTextRevisionStage('token-echo', saveInput(leakFlow, leakClaim, review, {raw_result: JSON.stringify({...review, issues: [{...review.issues[0], problem: leakClaim.token}]})})); assert.equal(leakResult.results.review.raw_result, undefined); assert.equal(JSON.stringify(leakResult).includes(leakClaim.token), false);
const idLeak = await setup('execution-token'), idFlow = await r.createTextRevision('execution-token', idLeak.create), idClaim = await claim('execution-token', idFlow, 'review');
for (const execution_id of [idClaim.token, idClaim.token.toUpperCase(), idLeak.claim.token]) {
 const before = dbState(), count = writes;
 await assert.rejects(r.saveTextRevisionStage('execution-token', saveInput(idFlow, idClaim, review, {execution_id})));
 assert.equal(dbState(), before); assert.equal(writes, count);
}
for (const [suffix, raw] of [
 ['field', JSON.stringify({status: 'failed', reason: 'execution_failed', api_key: 'A'.repeat(32)})],
 ['nested', JSON.stringify({...review, issues: [{...review.issues[0], problem: JSON.stringify({authorization: 'Bearer ' + 'A'.repeat(32)})}]})],
]) {
 const owner = 'generic-field-' + suffix, fixture = await setup(owner), flow = await r.createTextRevision(owner, fixture.create), c = await claim(owner, flow, 'review');
 const result = await r.saveTextRevisionStage(owner, saveInput(flow, c, review, {raw_result: raw}));
 assert.equal(result.results.review.report.reason, 'credential_detected'); assert.equal(result.results.review.raw_result, undefined);
 assert.equal(JSON.stringify(result).includes('A'.repeat(32)), false);
 assert.equal(sql.prepare('SELECT response FROM claude_attempts WHERE id=?').get('text_revision:' + owner + ':' + flow.flow_id).response.includes('A'.repeat(32)), false);
}
console.log('PASS credential association and execution_id token rejection before database writes');
const failVerify = await setup('verify-fail'), fv = await r.createTextRevision('verify-fail', failVerify.create); await stage('verify-fail', fv, 'review', review); await stage('verify-fail', fv, 'rewrite', rewrite); const failedCheck = await stage('verify-fail', fv, 'verify', {...verify, passed: false, checks: [{...verify.checks[0], resolved: false}], remaining_problems: ['仍有问题']}); assert.equal(failedCheck.saved.current_phase, 'verification_failed'); await assert.rejects(r.confirmTextRevision('verify-fail', {...finalArgs, flow_id: fv.flow_id, expected_body_sha256: failedCheck.saved.rewritten_version.body_sha256}));
const expired = await setup('expired'), ef = await r.createTextRevision('expired', expired.create), ec = await claim('expired', ef, 'review'); sql.prepare("UPDATE writing_runs SET expires='2000-01-01T00:00:00.000Z' WHERE owner=? AND run_kind LIKE 'text_revision:%'").run('expired'); assert.equal((await claim('expired', ef, 'review')).claimed, false); assert.equal((await r.readTextRevision('expired', {flow_id: ef.flow_id})).current_phase, 'review_expired'); await assert.rejects(r.saveTextRevisionStage('expired', saveInput(ef, ec, review)));
const duplicate = await setup('duplicate'), df = await r.createTextRevision('duplicate', duplicate.create), dr = await stage('duplicate', df, 'review', review), dc = await claim('duplicate', df, 'rewrite'); await assert.rejects(r.saveTextRevisionStage('duplicate', saveInput(df, dc, rewrite, {execution_id: dr.args.execution_id}))); await assert.rejects(r.saveTextRevisionStage('duplicate', saveInput(df, dc, rewrite, {execution_id: dr.args.execution_id.toUpperCase()}))); assert.equal((await r.readTextRevision('duplicate', {flow_id: df.flow_id})).current_phase, 'rewrite_claimed');
console.log('PASS failure boundaries: invalid/raw/anchor, explicit failure, unresolved verification, expired lease, cross-owner/old token/model/hash/version/actor, reused execution; no failed stage advances; opaque/generic/Unicode credentials and tokens suppressed; recovery/replay never retries');

// A second author gets a distinct scope; seed only a completed mock provider receipt.
const cc = await s.claimStepwiseTextWriter('full', {run_id: f.batch.run_id, writer: 'claude', confirm: true});
sql.prepare('INSERT INTO claude_attempts(id,owner,day,state,response,created) VALUES(?,?,?,?,?,?)').run(s.stepwiseTextAttemptId('full', f.batch.run_id, 'claude'), 'full', f.batch.day, 'completed', JSON.stringify({stepwise_text: {namespace_version: 1, writer: 'claude', source: 'provider_text', run_id: f.batch.run_id, item_id: cc.item_id, input_hash: f.batch.input_hash, body_sha256: await inputModule.hashText(JSON.stringify(article)), article}}), new Date().toISOString());
const second = await r.createTextRevision('full', {...f.create, writer: 'claude'}); assert.notEqual(second.flow_id, flow.flow_id); assert.notEqual(second.paid_scope.id, flow.paid_scope.id); assert.equal(second.initial_version.source, 'provider_text'); assert.equal((await r.readTextRevision('full', {flow_id: flow.flow_id})).current_phase, 'user_confirmed');
const secondClaim = await claim('full', second, 'review'); await assert.rejects(r.saveTextRevisionStage('full', saveInput(second, secondClaim, review, {execution_id: args.execution_id}))); await assert.rejects(r.saveTextRevisionStage('full', saveInput(second, secondClaim, review, {execution_id: args.execution_id.toUpperCase()}))); assert.equal((await r.readTextRevision('full', {flow_id: second.flow_id})).current_phase, 'review_claimed');
const rpc = route(), request = (method, params, owner = 'full', origin = 'https://example.com') => new Request('https://example.com/mcp', {method: 'POST', headers: {origin, 'oai-authenticated-user-id': owner}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
const tools = (await (await rpc.POST(request('tools/list'))).json()).result.tools.filter(t => t.name.includes('text_revision'));
assert.deepEqual(Array.from(tools.map(tool=>tool.name)).sort(), ['create_outline_text_revision','create_daily_text_revision','create_text_revision','read_text_revision','claim_text_revision_stage','save_text_revision_stage','confirm_text_revision'].sort()); for (const t of tools) if (!t.annotations.readOnlyHint) assert.ok(t.inputSchema.required.includes('confirm'));
assert.equal((await rpc.POST(request('tools/call', {name: 'read_text_revision', arguments: {flow_id: flow.flow_id}}, ''))).status, 401); assert.equal((await rpc.POST(request('tools/list', {}, 'full', 'https://evil.example'))).status, 403);
const bad = await rpc.POST(request('tools/call', {name: 'read_text_revision', arguments: {flow_id: 'PRIVATE_TOKEN_ERROR'}})); assert.equal((await bad.text()).includes('PRIVATE_TOKEN_ERROR'), false); assert.equal(r.textRevisionPublicError(Error('SQL_PRIVATE_TOKEN')), r.revisionErrors.unknown);
assert.equal(sql.prepare('SELECT count(*) n FROM articles').get().n, 0); assert.equal(sql.prepare('SELECT count(*) n FROM article_deliveries').get().n, 0); assert.equal(provider, 0); assert.equal(events, 0); assert.equal(platform, 0); assert.equal(objects, 0);
assert.equal(untouched(), legacyBefore);
for (const n of ['lib/claude.ts', 'lib/stepwise-text.ts', 'lib/manual-batch.ts', 'lib/writing-rewrite-v2.ts', 'lib/writing-fixed-references.ts', 'lib/writing-outline-template.ts']) assert.equal(fs.readFileSync(n, 'utf8').includes('text_revision:'), false);
console.log('PASS integration: distinct author/payment scopes; honest agent/provider provenance; seven authenticated same-origin MCP tools; fixed public errors; articles=0 events=0 platform=0 objects=0 provider=0; old daily/manual/test/rewrite/sample quota fixtures + frozen Xiaoyu draft remain byte-identical; no revision namespace added to unrelated legacy modules');
