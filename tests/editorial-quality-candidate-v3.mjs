// Pure mock contracts. The author-text fixture is real, but every receipt,
// snapshot and request in this file is explicitly synthetic. No external calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const loaded = new Map();
function load(file) {
 if (loaded.has(file)) return loaded.get(file);
 const exports = {}; loaded.set(file, exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
  exports, URL, Date, Error,
  require(name) {assert.equal(name, './editorial-contract'); return load('lib/editorial-contract.ts');},
  fetch() {throw Error('Network forbidden in pure candidate tests');},
 });
 return exports;
}
const base = load('lib/editorial-contract.ts'), round = load('lib/editorial-round-contract.ts'), quality = load('lib/editorial-quality-candidate-v3.ts');
const clone = value => JSON.parse(JSON.stringify(value));
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const realRaw = fs.readFileSync('tests/fixtures/editorial-v3-quality-candidate-1879.json', 'utf8');
const expectedHash = '0b38eafa3da38b9d65f3389ee0e872d2dde9a842d068669b67e6be310bb08b1e';
const owner = 'synthetic-owner', runId = '00000000-0000-4000-8000-000000000001', stageId = '00000000-0000-4000-8000-000000000002';
const model = 'synthetic-claude-model';
const sources = [{id: 'S1', title: '合成来源', url: 'https://example.com/public', published: '2026-10-06', event_date: '2026-10-05', accessed: '2026-10-06', context: '2026-10-05合成公开材料，仅供契约测试。'}];
const snapshot = {model, writer_model: model, capability: {max_output_tokens: 16000}, writing_prompt: '合成作者指令', stage_instructions: {body: '合成正文阶段指令'}};
const input = {contract_version: 3, run_id: runId, stage_id: stageId, stage: 'body', round: 1, sequence: 3, snapshot_sha256: sha(snapshot), actor_id: '00000000-0000-4000-8000-000000000003', model, writer_kind: 'claude_provider', max_output_tokens: 16000, system_prompt: snapshot.writing_prompt + '\n\n' + snapshot.stage_instructions.body, user_prompt: '合成冻结正文输入'};
const packet = raw => ({state: 'completed', stage: 'body', stage_id: stageId, input_sha256: sha(input), snapshot_sha256: sha(snapshot), requested_model: model, returned_model: model, text: raw, partial_text: null, raw_partial_response: null, raw_response: null, diagnostic: {stage: 'completed', http_status: 200, stop_reason: 'end_turn', eof_received: true, incomplete_frame: false, message_stop_received: true, request_stream: true, transport_version: 'anthropic_sse_buffered_v2', inspection_version: 'buffered_v2', raw_retained: false, safety_subcause: null, transport_subcause: null}});
function binding(raw = realRaw) {
 const response = JSON.stringify(packet(raw));
 return {owner, run_id: runId, stage_id: stageId, input_json: JSON.stringify(input), input_sha256: sha(input), snapshot_json: JSON.stringify(snapshot), snapshot_sha256: sha(snapshot), receipt: {id: `editorial_v3:${owner}:${runId}:${stageId}`, owner, state: 'completed', response}, receipt_sha256: sha(response), model, max_output_tokens: 16000, system_prompt_sha256: sha(input.system_prompt), user_prompt_sha256: sha(input.user_prompt), safety_checked: true};
}
const equal = (actual, expected) => {assert.deepEqual(clone(actual), clone(expected)); assertions++;};
let assertions = 0;
function rejectCandidate(raw) {assert.throws(() => base.parseEditorialReviewCandidate(raw)); assertions++;}
function rejectBinding(edit) {const value = binding(); edit(value); assert.throws(() => quality.deriveBoundQualityCandidate(value), error => error.message === base.editorialErrors.context); assertions++;}
function editPacket(value, edit) {const packet = JSON.parse(value.receipt.response); edit(packet); value.receipt.response = JSON.stringify(packet); value.receipt_sha256 = sha(value.receipt.response);}
function editInput(value, edit) {const input = JSON.parse(value.input_json); edit(input); value.input_json = JSON.stringify(input); value.input_sha256 = sha(value.input_json); editPacket(value, packet => {packet.input_sha256 = value.input_sha256;});}
const evidence = quality.deriveBoundQualityCandidate(binding()), article = evidence.article;
assert.equal(sha(realRaw), expectedHash); assertions++;
equal(article, JSON.parse(realRaw));
assert.equal(base.editorialArticleCharCount(article), 1879); assertions++;
assert.equal(evidence.evidence.char_count, 1879); assertions++;
assert.equal(evidence.evidence.source_text_sha256, expectedHash); assertions++;
assert.equal(evidence.quality_candidate_anchor.source_text, realRaw); assertions++;
assert.equal(evidence.evidence.article_sha256, sha(article)); assertions++;
assert.equal(evidence.evidence.receipt_sha256, binding().receipt_sha256); assertions++;
assert.equal(evidence.evidence.input_sha256, binding().input_sha256); assertions++;
assert.equal(evidence.evidence.snapshot_sha256, binding().snapshot_sha256); assertions++;
assert.equal(evidence.evidence.quality_passed, false); assertions++;
assert.equal(evidence.evidence.reason, 'length'); assertions++;
const original = binding(); const before = JSON.stringify(original); quality.deriveBoundQualityCandidate(original); assert.equal(JSON.stringify(original), before); assertions++;
console.log('PASS original real 1879-character text remains length-failed; synthetic bound receipt is unchanged');

for (const edit of [
 value => {value.owner = 'different-owner';}, value => {value.receipt.owner = 'different-owner';}, value => {value.receipt.id += ':other';},
 value => {value.receipt.state = 'failed';}, value => {value.safety_checked = false;}, value => {delete value.safety_checked;},
 value => {value.model = 'wrong-model';}, value => {value.max_output_tokens++;}, value => {value.system_prompt_sha256 = 'f'.repeat(64);}, value => {value.user_prompt_sha256 = 'f'.repeat(64);},
 value => {value.run_id = stageId;}, value => {value.stage_id = runId;}, value => {value.input_sha256 = 'f'.repeat(64);}, value => {value.snapshot_sha256 = 'f'.repeat(64);}, value => {value.receipt_sha256 = 'f'.repeat(64);},
 value => {value.receipt.extra = true;}, value => {value.receipt.response += ' ';}, value => {value.input_json += ' ';}, value => {value.snapshot_json += ' ';},
 value => editInput(value, input => {input.run_id = stageId;}), value => editInput(value, input => {input.stage_id = runId;}),
 value => editInput(value, input => {input.stage = 'structure_revision';}), value => editInput(value, input => {input.contract_version = 2;}),
 value => editInput(value, input => {input.snapshot_sha256 = 'f'.repeat(64);}), value => editInput(value, input => {input.model = 'wrong-model';}),
 value => editInput(value, input => {input.writer_kind = 'xiaoyu_agent';}), value => editInput(value, input => {input.max_output_tokens++;}),
 value => editInput(value, input => {input.system_prompt += '\n变更';}), value => editInput(value, input => {input.user_prompt += '\n变更';}),
 value => editInput(value, input => {input.actor_id = 'wrong';}), value => editInput(value, input => {input.round = -1;}), value => editInput(value, input => {input.sequence = 1.1;}),
]) rejectBinding(edit);
for (const [field, invalid] of [['state', 'failed'], ['stage', 'fact_check'], ['stage_id', runId], ['run_id', stageId], ['input_sha256', 'f'.repeat(64)], ['snapshot_sha256', 'f'.repeat(64)], ['requested_model', 'wrong-model'], ['returned_model', 'wrong-model'], ['response_suppressed', true], ['partial_text', '未完整返回'], ['raw_partial_response', '{}'], ['raw_response', '{}']]) rejectBinding(value => editPacket(value, packet => {packet[field] = invalid;}));
for (const [field, invalid] of [['stage', 'credential_suppressed'], ['http_status', 201], ['stop_reason', 'max_tokens'], ['stop_reason', 'unknown'], ['eof_received', false], ['eof_received', null], ['incomplete_frame', true], ['message_stop_received', false], ['request_stream', false], ['transport_version', 'anthropic_sse_v1'], ['inspection_version', 'different'], ['raw_retained', true], ['response_suppressed', true], ['code', 'credential_echo'], ['safety_subcause', 'credential_match'], ['transport_subcause', 'eof_without_message_stop']]) rejectBinding(value => editPacket(value, packet => {packet.diagnostic[field] = invalid;}));
for (const field of ['model', 'writer_model', 'writing_prompt', 'capability', 'stage_instructions']) rejectBinding(value => {const next = clone(snapshot); delete next[field]; if (field === 'writer_model') next[field] = 'different-model'; value.snapshot_json = JSON.stringify(next); value.snapshot_sha256 = sha(next); editInput(value, input => {input.snapshot_sha256 = value.snapshot_sha256;}); editPacket(value, packet => {packet.snapshot_sha256 = value.snapshot_sha256;});});
console.log('PASS owner, receipt identity, exact request/snapshot/prompts/token/model hashes and complete safe EOF are fail-closed');

for (const count of [1, 1999, 3001, 50000]) equal(base.parseEditorialReviewCandidate(JSON.stringify({title: '合成', paragraphs: ['字'.repeat(count)]})), {title: '合成', paragraphs: ['字'.repeat(count)]});
for (const count of [2000, 2400, 3000]) rejectCandidate(JSON.stringify({title: '合成', paragraphs: ['字'.repeat(count)]}));
for (const value of [null, [], {title: '', paragraphs: ['短']}, {title: '标题', paragraphs: []}, {title: '标题', paragraphs: [' \n\t']}, {title: '标题', paragraphs: [12]}, {title: '标题', paragraphs: Array(201).fill('短')}, {title: '标题', paragraphs: ['字'.repeat(50001)]}, {title: '标题', paragraphs: ['字'.repeat(49999), ...Array(8).fill('字'.repeat(49999))]}, {...article, candidate: true}, {title: '标题', paragraphs: ['\u0000']}]) rejectCandidate(JSON.stringify(value));
for (const raw of ['', '[]', realRaw + '\n说明', realRaw.replace('"title":', '"title":"重复","title":'), '{"title":"标题","\\u0074itle":"重复","paragraphs":["短"]}', ' '.repeat(400001), '{"title":"标题","paragraphs":["短"]', '```json\n' + realRaw + '\n```\n多余文本']) rejectCandidate(raw);
const unicode = {title: '换行原文', paragraphs: ['\n 中\t😀　\r\n\u00a0𝌆 \u2028尾\u2029', ' 甲\n乙 ']};
const unicodeRaw = JSON.stringify(unicode, null, 2) + '\r\n';
const unicodeCandidate = quality.deriveBoundQualityCandidate(binding(unicodeRaw));
equal(unicodeCandidate.article, unicode);
assert.equal(unicodeCandidate.evidence.char_count, 6); assertions++;
assert.equal(unicodeCandidate.evidence.source_text_sha256, sha(unicodeRaw)); assertions++;
assert.notEqual(unicodeCandidate.evidence.source_text_sha256, unicodeCandidate.evidence.article_sha256); assertions++;
for (const text of ['中文😀\r\n', '\ud800', '\udc00', '\ud800A', realRaw]) {assert.equal(base.editorialHashText(text), sha(text)); assertions++;}
console.log('PASS strict JSON/exact fields/200 paragraphs/400K/nonempty strings and exact Unicode/newline original bytes');

function context(input = article, anchor = evidence.quality_candidate_anchor, previous_report) {
 const input_binding = {version_id: stageId, sha256: sha(input)};
 return {validation_version: 3, sources, facts: [], input_article: clone(input), previous_report, input_binding, bound_input_binding: clone(input_binding), ...(anchor ? {quality_candidate_anchor: clone(anchor)} : {})};
}
const issue = {id: 'I1', paragraph: 1, quote: article.paragraphs[0], type: 'structure', severity: 'high', basis: '合成结构问题，仅测试锚定契约。', revision_goal: '合成修改目标，不是对真实文章的审稿。'};
const review = {status: 'completed', decision: 'revise', reason: '合成结构审稿测试。', issues: [issue]};
const passReview = {...review, decision: 'pass', issues: []};
const blockedReview = {...review, decision: 'blocked', issues: []};
const factsReport = input => ({status: 'completed', passed: true, coverage: [input.title, ...input.paragraphs].map((quote, paragraph) => ({paragraph, quote, classification: 'opinion', verdict: 'not_applicable', source_ids: [], source_dates: [], context: '合成整段观点标签，仅测试coverage机制，不声称文章事实已核实。'})), issues: [], unconfirmed: [], checks: {paragraphs: true, names: true, numbers: true, metaphors: true, quote_time_context: true}});
function parse(kind, value, ctx = context()) {return round.parseRoundArtifact(kind, JSON.stringify(value), ctx);}
function reject(kind, value, ctx = context()) {assert.throws(() => parse(kind, value, ctx)); assertions++;}
equal(parse('structure_review', review), review);
equal(parse('structure_review', blockedReview), blockedReview);
reject('structure_review', passReview);
reject('structure_review', {...review, issues: []});
reject('structure_review', {...review, issues: [{...issue, quote: '原文没有这句话'}]});
equal(parse('fact_check', factsReport(article)), factsReport(article));
const transition = round.roundTransition('fact_check', factsReport(article), {input_binding: context().input_binding});
assert.equal(transition.state, 'continue'); assertions++;
assert.equal(transition.next_kind, 'final_verify'); assertions++;
assert.equal(evidence.evidence.quality_passed, false); assertions++;
for (const kind of ['body', 'final_verify', 'fact_revision', 'outline', 'outline_review', 'outline_revision']) reject(kind, kind === 'body' ? article : factsReport(article));
reject('final_verify', factsReport(article), context(article, null));
for (const kind of ['structure_review', 'fact_check', 'final_verify']) reject(kind, kind === 'structure_review' ? passReview : factsReport(article), context(article, null));
assert.throws(() => base.parseEditorialArtifact('body', realRaw, {sources, facts: [], quality_candidate_anchor: evidence.quality_candidate_anchor})); assertions++;
for (const kind of ['body', 'structure_review', 'fact_check', 'final_verify']) {
 const ctx = context(article, null); delete ctx.validation_version; ctx.review_candidate = true; ctx.allow_short_body = true;
 assert.throws(() => base.parseEditorialArtifact(kind, JSON.stringify(kind === 'body' ? article : kind === 'structure_review' ? passReview : factsReport(article)), ctx)); assertions++;
}
const legacy = {...context(article, null), validation_version: 2};
equal(base.parseEditorialArtifact('structure_review', JSON.stringify(passReview), legacy), passReview);
for (const kind of ['structure_review', 'fact_check', 'final_verify']) {
 assert.throws(() => base.parseEditorialArtifact(kind, JSON.stringify(kind === 'structure_review' ? review : factsReport(article)), {...context(), validation_version: 2})); assertions++;
 reject(kind, kind === 'structure_review' ? review : factsReport(article), {...context(), validation_version: 2});
}
console.log('PASS candidate structure review cannot pass; isolated factual pass cannot relax body/final or legacy defaults');

for (const field of ['contract_version', 'version_id', 'sha256', 'source_text', 'source_text_sha256', 'receipt_sha256', 'input_sha256', 'snapshot_sha256', 'char_count', 'quality_passed', 'reason']) {
 const ctx = context(); const anchor = ctx.quality_candidate_anchor;
 anchor[field] = typeof anchor[field] === 'number' ? anchor[field] + 1 : typeof anchor[field] === 'boolean' ? true : field === 'source_text' ? anchor[field] + ' ' : 'wrong';
 reject('structure_review', review, ctx); reject('fact_check', factsReport(article), ctx);
}
for (const edit of [ctx => {ctx.quality_candidate_anchor.extra = true;}, ctx => {delete ctx.quality_candidate_anchor.reason;}, ctx => {ctx.input_article.title += '变更';}, ctx => {ctx.bound_input_binding.version_id = 'other';}, ctx => {ctx.bound_input_binding.sha256 = 'f'.repeat(64);}, ctx => {ctx.input_binding.sha256 = 'f'.repeat(64); ctx.bound_input_binding.sha256 = 'f'.repeat(64);}, ctx => {delete ctx.input_binding;}, ctx => {delete ctx.bound_input_binding;}]) {const ctx = context(); edit(ctx); reject('structure_review', review, ctx);}
for (const edit of [
 ctx => {Object.defineProperty(ctx.input_article, 'hidden', {value: true});},
 ctx => {ctx.input_article[Symbol('unknown')] = true;},
 ctx => {Object.defineProperty(ctx.input_article.paragraphs, 'hidden', {value: true});},
 ctx => {ctx.input_article.paragraphs[Symbol('unknown')] = true;},
 ctx => {Object.defineProperty(ctx.quality_candidate_anchor, 'hidden', {value: true});},
 ctx => {ctx.quality_candidate_anchor[Symbol('unknown')] = true;},
]) {const ctx = context(); edit(ctx); reject('structure_review', review, ctx);}
const out = clone(article); out.paragraphs[0] += '改'.repeat(2500 - 1879);
const revision = {article: out, decisions: [{issue_id: 'I1', action: 'accepted', reason: '合成修改理由。'}], changes: [{paragraph: 1, before: article.paragraphs[0], after: out.paragraphs[0], reason: '合成完整位置变更。'}]};
equal(parse('structure_revision', revision, context(article, evidence.quality_candidate_anchor, review)), revision);
for (const edit of [value => {value.article = clone(article);}, value => {value.article.paragraphs[0] += '超'.repeat(3001);}, value => {value.decisions = [];}, value => {value.decisions.push(clone(value.decisions[0]));}, value => {value.changes = [];}, value => {value.changes[0].before = '摘要';}, value => {value.changes[0].after = '摘要';}, value => {value.changes.push(clone(value.changes[0]));}]) {const value = clone(revision); edit(value); reject('structure_revision', value, context(article, evidence.quality_candidate_anchor, review));}
reject('structure_revision', revision, context(article, evidence.quality_candidate_anchor, passReview));
reject('structure_revision', revision, context(article, null, review));
const revisedCtx = context(out, null);
equal(parse('structure_review', passReview, revisedCtx), passReview);
equal(parse('final_verify', factsReport(out), revisedCtx), factsReport(out));
reject('final_verify', factsReport(article), revisedCtx);
assert.equal(round.roundTransition('final_verify', parse('final_verify', factsReport(out), revisedCtx), {input_binding: revisedCtx.input_binding}).state, 'verified'); assertions++;
console.log('PASS exact anchor hash/actual characters/version bindings; old short input can be reviewed while complete revision must meet strict quality');
console.log(`PASS quality candidate V3 (${assertions} assertions; zero model/database/network calls)`);
