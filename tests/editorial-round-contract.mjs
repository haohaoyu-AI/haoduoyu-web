// Pure offline contract tests. No database, provider, browser, network or clock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const loaded = new Map();
const load = file => {
 if (loaded.has(file)) return loaded.get(file);
 const exports = {}; loaded.set(file, exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
  exports, URL, Date, Error,
  require(name) {assert.equal(name, './editorial-contract'); return load('lib/editorial-contract.ts');},
  fetch() {throw Error('Network forbidden in offline round tests');},
 });
 return exports;
};
const contract = load('lib/editorial-round-contract.ts');
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sources = [
 {id: 'S1', title: '公开采访', url: 'https://example.com/interview', published: '2026-10-02', event_date: '2026-10-01', accessed: '2026-10-06', context: '2026-10-01公开采访，只谈拍摄经历。'},
 {id: 'S2', title: '放映记录', url: 'https://example.org/screening', published: '2026-10-03', event_date: '2026-10-02', accessed: '2026-10-06', context: '2026-10-02公开放映，未涉及私人行为。'},
];
const facts = [{id: 'F1', text: '影片于2026年10月2日公开放映。', source_ids: ['S2'], context: sources[1].context}];
const outline = {
 title: '作品里的戏', core_argument: '公开证据能够支撑作品评论。', opening: '从公开放映入手。',
 sections: [{heading: '作品观察', target_chars: 1600, fact_ids: ['F1'], source_ids: ['S2'], argument: '区分公开作品与私人动机。'}],
 turn: '把热度转回作品。', ending: '落在作品中的具体观察。', target_chars: 2400, source_ids: ['S1', 'S2'], fact_gaps: {blocked: false, items: []},
};
const article = {title: outline.title, paragraphs: [facts[0].text + '叙'.repeat(1200 - facts[0].text.length), '述'.repeat(1200)]};
const bodyIssue = {id: 'issue-1', paragraph: 1, quote: facts[0].text, type: 'expression', severity: 'medium', basis: '判断衔接尚不清楚。', revision_goal: '明确证据边界而不补造私人事实。'};
const outlineIssue = {...bodyIssue, quote: outline.core_argument};
const review = issues => ({status: 'completed', decision: issues.length ? 'revise' : 'pass', reason: '已完成本次确切全文审查。', issues});
const op = (paragraph, quote) => ({paragraph, quote, classification: 'opinion', verdict: 'not_applicable', source_ids: [], source_dates: [], context: '作者对作品的主观判断，不暗示私人事实。'});
const factReport = input => ({
 status: 'completed', passed: true,
 coverage: [op(0, input.title), {paragraph: 1, quote: facts[0].text, classification: 'fact', verdict: 'confirmed', source_ids: ['S2'], source_dates: ['2026-10-02'], context: sources[1].context}, op(1, input.paragraphs[0].slice(facts[0].text.length)), ...input.paragraphs.slice(1).map((paragraph, index) => op(index + 2, paragraph))],
 issues: [], unconfirmed: [], checks: {paragraphs: true, names: true, numbers: true, metaphors: true, quote_time_context: true},
});
const context = (input = article, previous_report, version_id = 'version-1') => {
 const input_binding = {version_id, sha256: hash(input)};
 return {sources, facts, input_article: input, previous_report, input_binding, bound_input_binding: clone(input_binding)};
};
const outlineInput = contract.roundOutlineInput(outline);
const at = (input, paragraph) => paragraph === 0 ? input.title : input.paragraphs[paragraph - 1] ?? '';
const changes = (before, after) => Array.from({length: Math.max(before.paragraphs.length, after.paragraphs.length) + 1}, (_, paragraph) => ({paragraph, before: at(before, paragraph), after: at(after, paragraph), reason: '完整确切记录位置改动。'})).filter(item => item.before !== item.after);
let assertions = 0;
const equal = (actual, expected) => {assert.deepEqual(clone(actual), clone(expected)); assertions++;};
const parse = (kind, value, ctx = context()) => contract.parseRoundArtifact(kind, typeof value === 'string' ? value : JSON.stringify(value), ctx);
const reject = (kind, value, ctx = context(), message) => {assert.throws(() => parse(kind, value, ctx), error => !message || error.message === message); assertions++;};
const transition = (kind, artifact, ctx = context()) => contract.roundTransition(kind, artifact, {input_binding: ctx.input_binding});
const mutated = (value, edit) => {const output = clone(value); edit(output); return output;};

equal(contract.roundStages, ['outline', 'outline_review', 'outline_revision', 'body', 'structure_review', 'structure_revision', 'fact_check', 'fact_revision', 'final_verify']);
for (const value of ['', 'abc', '中文和😀', '\ud800', '\udc00', '\ud800A', '字'.repeat(2000), ' '.repeat(64)]) {assert.equal(contract.roundHashText(value), hash(value)); assertions++;}
for (let length = 0; length <= 130; length++) {const value = ('中😀A'.repeat(length)).slice(0, length); assert.equal(contract.roundHashText(value), hash(value)); assertions++;}
assert.equal(contract.roundArtifactHash(article), hash(article)); assertions++;
equal(parse('outline', outline, {sources, facts}), outline);
equal(parse('body', article, {sources, facts}), article);
equal(parse('outline_review', review([outlineIssue]), context(outlineInput)), review([outlineIssue]));
equal(parse('structure_review', review([bodyIssue])), review([bodyIssue]));
equal(parse('fact_check', factReport(article)), factReport(article));
equal(parse('final_verify', factReport(article)), factReport(article));
console.log('PASS all nine stages retain exact payloads and dependency-free SHA256');

for (const kind of ['outline_review', 'structure_review', 'fact_check', 'final_verify', 'outline_revision', 'structure_revision', 'fact_revision']) {
 const ctx = kind.startsWith('outline') ? context(outlineInput, review([outlineIssue])) : context(article, review([bodyIssue]));
 reject(kind, {}, {...ctx, input_binding: undefined}, contract.roundErrors.context);
 reject(kind, {}, {...ctx, bound_input_binding: undefined}, contract.roundErrors.context);
 reject(kind, {}, {...ctx, bound_input_binding: {...ctx.input_binding, version_id: 'old-version'}}, contract.roundErrors.binding);
 reject(kind, {}, {...ctx, bound_input_binding: {...ctx.input_binding, sha256: 'a'.repeat(64)}}, contract.roundErrors.binding);
 reject(kind, {}, {...ctx, input_binding: {...ctx.input_binding, sha256: 'b'.repeat(64)}, bound_input_binding: {...ctx.input_binding, sha256: 'b'.repeat(64)}}, contract.roundErrors.binding);
 reject(kind, {}, {...ctx, validation_version: 2}, contract.roundErrors.context);
}
const stale = context(); stale.input_article = {...article, title: '同段落但不同标题'};
reject('structure_review', review([bodyIssue]), stale, contract.roundErrors.binding);
reject('final_verify', factReport(article), context({...article, title: '本轮新标题'}), contract.roundErrors.coverage);
reject('structure_review', review([{...bodyIssue, quote: '旧版才有的连续文字'}]), context(), contract.roundErrors.anchor);
console.log('PASS anchored stages bind current ID, exact hash and full input text; V2 downgrade rejected');

const revisedOutline = mutated(outline, value => {value.title = '作品里的戏与证据'; value.core_argument = '先明确公开证据的边界，再推进作品评论。';});
const outlineRevision = {outline: revisedOutline, decisions: [{issue_id: outlineIssue.id, action: 'accepted', reason: '已明确主线与证据边界。'}], changes: changes(outlineInput, contract.roundOutlineInput(revisedOutline))};
const outlineCtx = context(outlineInput, review([outlineIssue]));
equal(parse('outline_revision', outlineRevision, outlineCtx), outlineRevision);
assert.ok(JSON.stringify(revisedOutline).length < 2000); assertions++;
for (const edit of [
 value => {delete value.outline;}, value => {value.article = outlineInput;}, value => {value.decisions = [];},
 value => {value.decisions[0].issue_id = 'unknown';}, value => {value.decisions.push(clone(value.decisions[0]));},
 value => {value.decisions[0].reason = '';}, value => {value.decisions[0].action = 'ignore';}, value => {value.decisions[0].extra = true;},
 value => {value.changes.pop();}, value => {value.changes[1].before = outline.core_argument;}, value => {value.changes[1].after = revisedOutline.core_argument;},
 value => {value.changes[1].paragraph = 2;}, value => {value.changes[1].paragraph = 1.5;}, value => {value.changes.push(clone(value.changes[0]));},
 value => {value.changes[1].reason = '';}, value => {value.changes[1].extra = true;}, value => {value.outline.sections[0].source_ids = [];},
 value => {value.outline.source_ids = ['S2'];}, value => {value.outline.fact_gaps.blocked = true;}, value => {value.extra = 'unknown';},
]) reject('outline_revision', mutated(outlineRevision, edit), outlineCtx);
reject('outline_revision', JSON.stringify(outlineRevision).replace('"outline":', '"outline":{},"out\\u006cine":'), outlineCtx);
reject('outline_revision', {outline, decisions: outlineRevision.decisions, changes: []}, outlineCtx, contract.roundErrors.revision);
const rejectedOutline = {outline, decisions: [{issue_id: outlineIssue.id, action: 'rejected', reason: '公开证据支持保留原论点。'}], changes: []};
equal(parse('outline_revision', rejectedOutline, outlineCtx), rejectedOutline);
equal(transition('outline_revision', rejectedOutline).state, 'no_progress');
const reorderedOutline = Object.fromEntries(Object.entries(outline).reverse());
const serializedOnly = {outline: reorderedOutline, decisions: outlineRevision.decisions, changes: changes(outlineInput, contract.roundOutlineInput(reorderedOutline))};
reject('outline_revision', serializedOnly, outlineCtx, contract.roundErrors.revision);
serializedOnly.decisions = rejectedOutline.decisions;
equal(parse('outline_revision', serializedOnly, outlineCtx), serializedOnly);
equal(transition('outline_revision', serializedOnly).state, 'no_progress');
const prettyInput = {title: outline.title, paragraphs: [JSON.stringify(outline, null, 2)]};
const compactOnly = {outline, decisions: rejectedOutline.decisions, changes: changes(prettyInput, outlineInput)};
equal(parse('outline_revision', compactOnly, context(prettyInput, review([outlineIssue]))), compactOnly);
equal(transition('outline_revision', compactOnly).state, 'no_progress');
const onlyTitle = {outline: {...outline, title: '只有标题变化'}, decisions: outlineRevision.decisions, changes: changes(outlineInput, contract.roundOutlineInput({...outline, title: '只有标题变化'}))};
// A title change also changes position 1's complete outline JSON.
equal(parse('outline_revision', onlyTitle, outlineCtx), onlyTitle);
reject('outline_revision', {...onlyTitle, changes: onlyTitle.changes.slice(0, 1)}, outlineCtx, contract.roundErrors.revision);
console.log('PASS short outline revision, all issue decisions and complete positional title/JSON accounting');

const revisedArticle = mutated(article, value => {value.paragraphs[0] = value.paragraphs[0].slice(0, -1) + '改';});
const revision = {article: revisedArticle, decisions: [{issue_id: bodyIssue.id, action: 'accepted', reason: '判断衔接已在锚定位置修改。'}], changes: changes(article, revisedArticle)};
equal(parse('structure_revision', revision, context(article, review([bodyIssue]))), revision);
reject('structure_revision', {...revision, changes: []}, context(article, review([bodyIssue])), contract.roundErrors.revision);
reject('structure_revision', {article, decisions: revision.decisions, changes: []}, context(article, review([bodyIssue])), contract.roundErrors.revision);
const remoteArticle = {...article, title: '只改别的位置'};
reject('structure_revision', {...revision, article: remoteArticle, changes: changes(article, remoteArticle)}, context(article, review([bodyIssue])), contract.roundErrors.revision);
const noProgress = {article, decisions: [{issue_id: bodyIssue.id, action: 'rejected', reason: '原文判断与公开材料范围一致。'}], changes: []};
equal(parse('structure_revision', noProgress, context(article, review([bodyIssue]))), noProgress);
equal(transition('structure_revision', noProgress), {state: 'no_progress', next_kind: null, new_round: false, needs_writer: false, reason: contract.roundErrors.no_progress});
const spacedArticle = {...article, paragraphs: [article.paragraphs[0] + ' ', article.paragraphs[1]]};
const onlyWhitespace = {...revision, article: spacedArticle, changes: changes(article, spacedArticle)};
reject('structure_revision', onlyWhitespace, context(article, review([bodyIssue])), contract.roundErrors.revision);
onlyWhitespace.decisions = noProgress.decisions;
equal(parse('structure_revision', onlyWhitespace, context(article, review([bodyIssue]))), onlyWhitespace);
equal(transition('structure_revision', onlyWhitespace).state, 'no_progress');
equal(contract.roundRevisionProgress('structure_revision', revision), {changed: true, accepted: 1, rejected: 0, no_progress: false});
const failedFacts = mutated(factReport(article), value => {value.passed = false; value.issues = [{...bodyIssue, type: 'fact', basis: '公开证据不足，需更明确地限定断言。'}];});
equal(parse('fact_revision', revision, context(article, failedFacts)), revision);
equal(transition('fact_revision', revision).next_kind, 'final_verify');
reject('final_verify', factReport(article), context(revisedArticle), contract.roundErrors.coverage);
const finalFacts = factReport(revisedArticle);
equal(parse('final_verify', finalFacts, context(revisedArticle)), finalFacts);
equal(transition('final_verify', finalFacts).state, 'verified');
// New frozen assertions still cannot be concealed as opinion in any full check.
const newFacts = [{id: 'F2', text: '作品新增的可核验断言。', source_ids: ['S1'], context: sources[0].context}];
const withNovelFact = mutated(revisedArticle, value => {value.paragraphs[1] = newFacts[0].text + value.paragraphs[1].slice(newFacts[0].text.length);});
const novelCtx = {...context(withNovelFact), facts: [...facts, ...newFacts]};
reject('final_verify', factReport(withNovelFact), novelCtx, contract.roundErrors.coverage);
const incomplete = mutated(factReport(article), value => {value.coverage.pop();});
reject('fact_check', incomplete, context(), contract.roundErrors.coverage);
reject('final_verify', incomplete, context(), contract.roundErrors.coverage);
console.log('PASS full V3 body revision, exact changed positions and mandatory full new-fact final verification');

equal(transition('outline', outline).next_kind, 'outline_review');
equal(transition('outline_review', review([]), context(outlineInput)).next_kind, 'body');
equal(transition('outline_review', review([outlineIssue]), context(outlineInput)).next_kind, 'outline_revision');
equal(transition('outline_revision', outlineRevision).next_kind, 'outline_review');
equal(transition('outline_revision', outlineRevision).new_round, true);
equal(transition('body', article).next_kind, 'structure_review');
equal(transition('structure_review', review([bodyIssue])).next_kind, 'structure_revision');
equal(transition('structure_revision', revision).next_kind, 'structure_review');
equal(transition('structure_review', review([])).next_kind, 'fact_check');
equal(transition('fact_check', factReport(article)).next_kind, 'final_verify');
equal(transition('fact_check', failedFacts).next_kind, 'fact_revision');
equal(transition('final_verify', failedFacts).next_kind, 'fact_revision');
equal(transition('outline_review', {...review([]), decision: 'blocked'}, context(outlineInput)).state, 'blocked');
const failedCheck = mutated(factReport(article), value => {value.passed = false; value.checks.numbers = false;});
equal(parse('fact_check', failedCheck), failedCheck);
equal(transition('fact_check', failedCheck).state, 'blocked');
assert.equal(contract.roundNeedsWriter('outline_review', review([outlineIssue])), true);
assert.equal(contract.roundNeedsWriter('structure_review', review([])), false);
assert.equal(contract.roundNeedsWriter('fact_check', failedCheck), false); assertions += 3;
const consumed = [{kind: 'structure_review', input_version_id: 'version-1', input_sha256: hash(article), report_sha256: hash(review([bodyIssue]))}];
const duplicateContext = {input_binding: context().input_binding, report_sha256: hash(review([bodyIssue])), consumed_reports: consumed};
equal(contract.roundTransition('structure_review', review([bodyIssue]), duplicateContext).state, 'duplicate');
equal(contract.roundTransition('structure_review', {...review([bodyIssue]), reason: '换个说法重复旧版本'}, {...duplicateContext, report_sha256: undefined}).state, 'duplicate');
equal(contract.roundTransition('structure_review', review([bodyIssue]), {...duplicateContext, input_binding: {...duplicateContext.input_binding, version_id: 'cosmetic-new-id'}}).state, 'duplicate');
equal(contract.roundTransition('structure_review', review([bodyIssue]), {...duplicateContext, input_binding: {version_id: 'genuine-new-version', sha256: hash(revisedArticle)}}).state, 'duplicate');
// Initial full fact-check and final full verification are distinct mandatory kinds.
equal(contract.roundTransition('final_verify', factReport(article), {input_binding: context().input_binding, consumed_reports: [{kind: 'fact_check', input_version_id: 'version-1', input_sha256: hash(article), report_sha256: hash(factReport(article))}]}).state, 'verified');
assert.throws(() => contract.roundTransition('structure_review', review([bodyIssue]), {input_binding: context().input_binding, report_sha256: 'f'.repeat(64)}), error => error.message === contract.roundErrors.binding); assertions++;
// No count cap: genuinely new issue-driven versions can pass more than four rounds.
for (let count = 1; count <= 20; count++) {
 const nextArticle = {...article, title: `具体修改后的第${count}版`};
 const ctx = context(nextArticle, undefined, `version-${count + 1}`);
 const nextReport = review([{...bodyIssue, id: `issue-${count + 1}`}]);
 equal(contract.roundTransition('structure_review', parse('structure_review', nextReport, ctx), {input_binding: ctx.input_binding, consumed_reports: consumed}).next_kind, 'structure_revision');
 consumed.push({kind: 'structure_review', input_version_id: ctx.input_binding.version_id, input_sha256: ctx.input_binding.sha256, report_sha256: hash(nextReport)});
}
console.log('PASS issue-driven unbounded loops, blocking failures, no-progress termination and same-version idempotency');

for (const kind of contract.roundStages) {
 const instruction = contract.roundStageInstruction(kind);
 assert.ok(instruction.includes('JSON') && instruction.includes('version_id') && instruction.includes('sha256') && instruction.includes('no_progress')); assertions++;
}
assert.ok(contract.roundStageInstruction('outline_revision').includes('完整框架JSON')); assertions++;
assert.ok(contract.roundStageInstruction('final_verify').includes('不得只检查前序问题')); assertions++;
assert.equal(load('lib/editorial-contract.ts').stages.includes('outline_revision'), false); assertions++;
assert.equal(fs.readFileSync('lib/editorial-round-contract.ts', 'utf8').includes('requestOutlineClaudeOnce'), false); assertions++;
console.log(`PASS editorial round contracts (${assertions} assertions, zero external calls)`);
