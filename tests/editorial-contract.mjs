// Pure offline contract tests: no database, provider, browser or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const source = fs.readFileSync('lib/editorial-contract.ts', 'utf8');
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
 exports, URL, Date, Error, require() {throw Error('Unexpected dependency in pure contract');},
 fetch() {throw Error('Network forbidden in offline contract tests');},
});
const contract = exports, clone = value => JSON.parse(JSON.stringify(value));
const sources = [
 {id: 'S1', title: '公开采访原文', url: 'https://example.com/interview', published: '2026-10-02', event_date: '2026-10-01', accessed: '2026-10-06T06:00:00Z', context: '2026-10-01公开采访，只谈作品拍摄，未涉及私人生活。'},
 {id: 'S2', title: '公开放映记录', url: 'https://example.org/screening', published: '2026-10-03', event_date: '2026-10-02', accessed: '2026-10-06', context: '2026-10-02公开放映，报道不涉及演员私下行为。'},
];
const facts = [
 {id: 'F1', text: '角色甲在公开采访中谈到拍摄经历。', source_ids: ['S1'], context: '仅引用采访公开内容，不推测私下行为或心理。'},
 {id: 'F2', text: '影片于2026年10月2日公开放映。', source_ids: ['S2'], context: '日期对应公开放映的事件日，不等同报道发布日期。'},
];
const padded = text => text + '叙'.repeat(600 - text.length);
const article = {title: '作品里的戏，戏外的尺度', paragraphs: [padded(facts[0].text), padded('这段安排让我想到另一种叙事。'), padded('镜头像一把钥匙，打开了矛盾。'), padded(facts[1].text)]};
const context = {sources, facts, input_article: article};
const outline = {
 title: article.title, core_argument: '作品事实可以支撑评论，公开资料不能支撑私人动机。', opening: '从公开采访谈作品拍摄入手。',
 sections: [
  {heading: '采访说了什么', target_chars: 700, fact_ids: ['F1'], source_ids: ['S1'], argument: '说明公开采访能够支持的事实范围。'},
  {heading: '叙事如何推进', target_chars: 800, fact_ids: [], source_ids: [], argument: '分析作品表达，保留有依据的幽默。'},
  {heading: '放映与评价', target_chars: 700, fact_ids: ['F2'], source_ids: ['S2'], argument: '从公开放映进入评论，同时区分报道日期。'},
 ], turn: '从作品里的矛盾转到证据边界。', ending: '回到公开放映后的具体观察。', target_chars: 2400,
 source_ids: ['S1', 'S2'], fact_gaps: {blocked: false, items: []},
};
const issue = {id: 'issue-1', paragraph: 1, quote: facts[0].text, type: 'expression', severity: 'medium', basis: '公开材料与作者判断的衔接不够清楚。', revision_goal: '让判断承接事实，不增加未经证实的行为。'};
const review = {status: 'completed', decision: 'revise', reason: '推进可以更清楚，依据材料调整表达。', issues: [issue]};
const passReview = {status: 'completed', decision: 'pass', reason: '主线、推进和证据边界清楚。', issues: []};
const opinion = (paragraph, quote, classification = 'opinion') => ({paragraph, quote, classification, verdict: 'not_applicable', source_ids: [], source_dates: [], context: '作者对作品的主观评论或明确修辞，不暗示私人事实。'});
const confirmed = (paragraph, quote, index) => ({paragraph, quote, classification: 'fact', verdict: 'confirmed', source_ids: [sources[index].id], source_dates: [sources[index].event_date], context: sources[index].context});
const factReport = {
 status: 'completed', passed: true,
 coverage: [opinion(0, article.title), confirmed(1, facts[0].text, 0), opinion(1, article.paragraphs[0].slice(facts[0].text.length)), opinion(2, article.paragraphs[1]), opinion(3, article.paragraphs[2], 'metaphor'), confirmed(4, facts[1].text, 1), opinion(4, article.paragraphs[3].slice(facts[1].text.length))],
 issues: [], unconfirmed: [], checks: {paragraphs: true, names: true, numbers: true, metaphors: true, quote_time_context: true},
};
let assertions = 0;
const equal = (actual, expected) => {assert.deepEqual(clone(actual), clone(expected)); assertions++;};
const parse = (stage, value, ctx = context) => contract.parseEditorialArtifact(stage, typeof value === 'string' ? value : JSON.stringify(value), ctx);
const reject = (stage, value, ctx = context, message) => {
 assert.throws(() => parse(stage, value, ctx), error => {
  assert.equal(Object.values(contract.editorialErrors).includes(error.message), true);
  if (message) assert.equal(error.message, message);
  return true;
 }); assertions++;
};
const mutate = (value, operation) => {const changed = clone(value); operation(changed); return changed;};
const rejection = (stage, value, operation, ctx = context, message) => reject(stage, mutate(value, operation), ctx, message);
const outlineContext = {...context, input_article: {title: outline.title, paragraphs: [JSON.stringify(outline)]}};
const packBefore = JSON.stringify({sources, facts, article, outline});

equal(contract.stages, ['outline', 'outline_review', 'body', 'structure_review', 'structure_revision', 'fact_check', 'fact_revision', 'final_verify']);
equal(contract.editorialStages, contract.stages);
equal(contract.validateFactPack(sources, facts), {sources, facts});
const pack = contract.validateFactPack(sources, facts); pack.sources[0].title = 'changed'; pack.facts[0].source_ids.push('other');
assert.equal(sources[0].title, '公开采访原文'); assert.deepEqual(facts[0].source_ids, ['S1']); assertions += 2;
equal(parse('outline', outline), outline);
equal(parse('outline_review', passReview, outlineContext), passReview);
equal(parse('body', article), article);
equal(parse('structure_review', review), review);
equal(parse('fact_check', factReport), factReport);
equal(parse('final_verify', factReport), factReport);
console.log('PASS all base stage schemas and immutable source/fact validation');

for (const stage of contract.stages) {
 const instruction = contract.editorialStageInstruction(stage);
 assert.ok(instruction.includes('JSON') && instruction.includes('幽默') && instruction.includes('心理') && instruction.includes('2000–3000')); assertions++;
}
for (const stage of ['fact_check', 'final_verify']) {
 assert.ok(contract.editorialStageInstruction(stage).includes('全文'));
 assert.ok(contract.editorialStageInstruction(stage).includes('引述'));
 assert.ok(contract.editorialStageInstruction(stage).includes('不能只检查') || contract.editorialStageInstruction(stage).includes('不得只检查')); assertions += 3;
}
assert.ok(contract.editorialStageInstruction('fact_revision').includes('新增')); assertions++;
assert.ok(contract.editorialStageInstruction('structure_review').includes('待核查')); assertions++;
assert.equal(JSON.stringify({sources, facts, article, outline}), packBefore); assertions++;

// HTTPS sources are read-only public references, never login or internal endpoints.
for (const url of [
 'http://example.com/news', 'ftp://example.com/news', 'https://name:password@example.com/news', 'https://name@example.com/news',
 'https://localhost/news', 'https://localhost./news', 'https://foo.local/news', 'https://foo.internal/news', 'https://foo.lan/news', 'https://foo.onion/news', 'https://singlelabel/news',
 'https://127.0.0.1/news', 'https://127.1/news', 'https://2130706433/news', 'https://0177.0.0.1/news', 'https://0x7f000001/news',
 'https://10.0.0.1/news', 'https://172.16.1.1/news', 'https://192.168.1.1/news', 'https://169.254.169.254/latest/meta-data',
 'https://100.64.1.1/news', 'https://198.18.1.1/news', 'https://203.0.113.2/news', 'https://224.0.0.1/news', 'https://255.255.255.255/news',
 'https://[::1]/news', 'https://[::]/news', 'https://[::ffff:127.0.0.1]/news', 'https://[fc00::1]/news', 'https://[fe80::1]/news', 'https://[2001:db8::1]/news',
 ' https://example.com/news', 'https://example.com/news\n', 'https:\\example.com/news',
 'https://example.com/news?key=secret', 'https://example.com/news?auth=secret', 'https://example.com/news?refresh_token=secret', 'https://example.com/news?api_key=secret', 'https://example.com/news?access_token=secret', 'https://example.com/news?sessionid=secret', 'https://example.com/news?X-Amz-Signature=secret',
]) {
 assert.throws(() => contract.validateFactPack(mutate(sources, value => {value[0].url = url;}), facts), error => error.message === contract.editorialErrors.fact_pack); assertions++;
}
for (const url of ['https://example.com/news#section', 'https://EXAMPLE.com/news?q=作品', 'https://8.8.8.8/news', 'https://[2001:4860:4860::8888]/news']) {
 const value = mutate(sources, result => {result[0].url = url;}); equal(contract.validateFactPack(value, facts).sources, value);
}
for (const operation of [
 value => {value[0].extra = 'unknown';}, value => {delete value[0].context;}, value => {value[0].id = value[1].id;},
 value => {value[0].url = value[1].url;}, value => {value[0].context = '';}, value => {value[0].published = '2026-02-30';},
 value => {value[0].event_date = 'yesterday';}, value => {value[0].accessed = '2026-10-06T06:00:00';}, value => {value[0].id = 'bad id';},
]) {assert.throws(() => contract.validateFactPack(mutate(sources, operation), facts)); assertions++;}
for (const operation of [
 value => {value[0].unknown = true;}, value => {value[0].source_ids = ['missing'];}, value => {value[0].source_ids = ['S1', 'S1'];},
 value => {value[0].source_ids = [];}, value => {value[0].id = value[1].id;}, value => {delete value[0].context;}, value => {value[0].text = ' ';},
]) {assert.throws(() => contract.validateFactPack(sources, mutate(facts, operation))); assertions++;}
assert.throws(() => contract.validateFactPack([], [])); assertions++;
const sparseSources = [...sources]; delete sparseSources[0]; assert.throws(() => contract.validateFactPack(sparseSources, facts)); assertions++;
const hiddenSource = clone(sources); Object.defineProperty(hiddenSource[0], 'private_extra', {value: 'hidden'}); assert.throws(() => contract.validateFactPack(hiddenSource, facts)); assertions++;
const extendedFacts = clone(facts); extendedFacts.extra = 'unknown'; assert.throws(() => contract.validateFactPack(sources, extendedFacts)); assertions++;
equal(contract.validateFactPack(sources, []), {sources, facts: []});
console.log('PASS public HTTPS/credential/private-host/date boundaries and exact IDs');

// Whole JSON fences are the only accepted presentation wrapper. No extraction or repair.
equal(parse('body', '\n```json\n' + JSON.stringify(article) + '\n```\n'), article);
equal(parse('body', '```\n' + JSON.stringify(article) + '\n```'), article);
for (const raw of [
 '正文如下：' + JSON.stringify(article), JSON.stringify(article) + '\n已经完成', '```javascript\n' + JSON.stringify(article) + '\n```',
 '```json\n' + JSON.stringify(article) + '\n```\n备注', JSON.stringify(article).replace('"title":', '"title":"duplicate","title":'),
 JSON.stringify(article).replace('"title":', '"title":"duplicate","ti\\u0074le":'), '{"title":"x","paragraphs":["x"],}',
 JSON.stringify(article).replace('"paragraphs":', '"paragraphs":[],"paragraphs":'), '{', '[]', 'null', 'x'.repeat(400001),
]) reject('body', raw);
for (const field of ['extra', 'status', 'article']) rejection('body', article, value => {value[field] = true;});
for (const paragraphs of [[], [''], [' '], ['字'.repeat(1999)], ['字'.repeat(3001)]]) rejection('body', article, value => {value.paragraphs = paragraphs;});
equal(parse('body', {title: '空白不计数', paragraphs: ['字 '.repeat(2000)]}), {title: '空白不计数', paragraphs: ['字 '.repeat(2000)]});
equal(parse('body', {title: '按字符而非UTF16计数', paragraphs: ['😀'.repeat(2000)]}), {title: '按字符而非UTF16计数', paragraphs: ['😀'.repeat(2000)]});
rejection('body', article, value => {value.paragraphs[0] += '\u0000';});
reject('not_a_stage', article);
reject('structure_review', review, {sources, facts});
console.log('PASS strict JSON fields, duplicate escaped keys, wrappers and 2000–3000 nonwhite code points');

for (const operation of [
 value => {value.unknown = true;}, value => {value.source_ids = ['S1'];}, value => {value.source_ids = ['S1', 'missing'];},
 value => {value.sections[0].source_ids = [];}, value => {value.sections[0].fact_ids = ['missing'];}, value => {value.sections[0].extra = true;},
 value => {value.target_chars = 1999;}, value => {value.sections[0].target_chars = 2500;}, value => {value.fact_gaps = [];}, value => {value.fact_gaps.blocked = true;},
]) rejection('outline', outline, operation);
const blockedOutline = mutate(outline, value => {value.fact_gaps = {blocked: true, items: [{id: 'gap-1', claim: '未公开的私人行为', missing_evidence: '无可核验公开来源，不能写入正文。', source_ids: []}]};});
equal(parse('outline', blockedOutline), blockedOutline);
const blockedContext = {...context, input_article: {title: blockedOutline.title, paragraphs: [JSON.stringify(blockedOutline)]}};
reject('outline_review', passReview, blockedContext);
equal(parse('outline_review', {...passReview, decision: 'blocked', reason: '必要事实尚无公开证据。'}, blockedContext), {...passReview, decision: 'blocked', reason: '必要事实尚无公开证据。'});
reject('outline_review', passReview, {...outlineContext, input_article: {...outlineContext.input_article, title: 'different'}});
reject('outline_review', passReview, {...outlineContext, input_article: {...outlineContext.input_article, paragraphs: [...outlineContext.input_article.paragraphs, 'extra']}});
const outlineIssue = {...issue, paragraph: 1, quote: outline.core_argument};
equal(parse('outline_review', {...review, issues: [outlineIssue]}, outlineContext), {...review, issues: [outlineIssue]});
for (const operation of [
 value => {value.status = 'failed';}, value => {value.decision = 'pass';}, value => {value.reason = '';}, value => {value.extra = true;},
 value => {value.issues[0].quote = '不存在的引文';}, value => {value.issues[0].paragraph = 2;}, value => {value.issues[0].paragraph = 1.5;},
 value => {value.issues[0].paragraph = -1;}, value => {value.issues[0].extra = true;}, value => {value.issues[0].type = 'opinion';},
 value => {value.issues[0].severity = 'critical';}, value => {value.issues.push(clone(value.issues[0]));},
]) rejection('structure_review', review, operation);
rejection('structure_review', passReview, value => {value.decision = 'revise';});
equal(parse('structure_review', {...review, issues: [{...issue, paragraph: 0, quote: article.title}]}), {...review, issues: [{...issue, paragraph: 0, quote: article.title}]});
equal(parse('structure_review', {...review, issues: [{...issue, type: 'fact', basis: '待核查：采访时间语境需由独立事实核查确认。'}]}), {...review, issues: [{...issue, type: 'fact', basis: '待核查：采访时间语境需由独立事实核查确认。'}]});
console.log('PASS full-source outlines, blocking fact gaps and exact issue anchoring');

const revised = mutate(article, value => {value.title = '改稿标题'; value.paragraphs[0] = value.paragraphs[0].slice(0, -1) + '改';});
const revision = {article: revised, decisions: [{issue_id: issue.id, action: 'accepted', reason: '衔接表达已调整，事实范围保留。'}], changes: [
 {paragraph: 0, before: article.title, after: revised.title, reason: '调整标题表达。'},
 {paragraph: 1, before: article.paragraphs[0], after: revised.paragraphs[0], reason: '调整该段的表达衔接。'},
]};
const revisionContext = {...context, previous_report: review};
equal(parse('structure_revision', revision, revisionContext), revision);
for (const operation of [
 value => {value.decisions = [];}, value => {value.decisions[0].issue_id = 'other';}, value => {value.decisions.push(clone(value.decisions[0]));},
 value => {value.decisions[0].action = 'ignored';}, value => {value.decisions[0].reason = '';}, value => {value.decisions[0].extra = true;},
 value => {value.changes = value.changes.slice(1);}, value => {value.changes[1].before = facts[0].text;}, value => {value.changes[1].after = 'summary';},
 value => {value.changes[1].paragraph = 1.5;}, value => {value.changes.push(clone(value.changes[1]));}, value => {value.changes[0].extra = true;},
 value => {value.changes.push({paragraph: 2, before: article.paragraphs[1], after: article.paragraphs[1], reason: '未变更'});},
 value => {value.article.paragraphs[1] = '字'.repeat(600);}, value => {value.article.paragraphs = ['字'.repeat(1999)];}, value => {value.extra = true;},
]) rejection('structure_revision', revision, operation, revisionContext);
reject('structure_revision', revision, context);
reject('structure_revision', {article, decisions: revision.decisions, changes: []}, revisionContext);
const rejected = {article, decisions: [{issue_id: issue.id, action: 'rejected', reason: '公开证据支持原表达，保留并明确说明依据。'}], changes: []};
equal(parse('structure_revision', rejected, revisionContext), rejected);
const inserted = mutate(article, value => {value.paragraphs.splice(1, 0, '插入'.repeat(50));});
const positionalChanges = (before, after) => Array.from({length: Math.max(before.paragraphs.length, after.paragraphs.length) + 1}, (_, paragraph) => ({paragraph, before: paragraph ? before.paragraphs[paragraph - 1] ?? '' : before.title, after: paragraph ? after.paragraphs[paragraph - 1] ?? '' : after.title, reason: '完整记录该位置的变动。'})).filter(change => change.before !== change.after);
const insertedRevision = {article: inserted, decisions: revision.decisions, changes: positionalChanges(article, inserted)};
const insertionContext = {...revisionContext, previous_report: {...review, issues: [{...issue, paragraph: 2, quote: article.paragraphs[1].slice(0, 20)}]}};
equal(parse('structure_revision', insertedRevision, insertionContext), insertedRevision);
rejection('structure_revision', insertedRevision, value => {value.changes = value.changes.slice(0, -1);}, insertionContext);
const deletedRevision = {article, decisions: revision.decisions, changes: positionalChanges(inserted, article)};
equal(parse('structure_revision', deletedRevision, {...revisionContext, input_article: inserted, previous_report: {...review, issues: [{...issue, paragraph: 2, quote: inserted.paragraphs[1].slice(0, 20)}]}}), deletedRevision);
assert.equal(deletedRevision.changes.at(-1).after, ''); assertions++;
console.log('PASS exact issue decisions and title/changed/inserted/deleted paragraph accounting');

// Full, consecutive coverage is mandatory even when the report is negative.
const unconfirmedReport = mutate(factReport, value => {value.passed = false; value.coverage[1].verdict = 'unconfirmed'; value.coverage[1].source_ids = []; value.coverage[1].source_dates = []; value.coverage[1].context = '公开来源不足，未能确认该断言。'; value.issues = [{...issue, type: 'fact', basis: '公开来源不足，不能确认断言。', revision_goal: '撤去未核实断言或补足公开证据。'}]; value.unconfirmed = [facts[0].text];});
equal(parse('fact_check', unconfirmedReport), unconfirmedReport);
equal(parse('final_verify', unconfirmedReport), unconfirmedReport);
equal(parse('fact_revision', revision, {...context, previous_report: unconfirmedReport}), revision);
const contradictedReport = mutate(unconfirmedReport, value => {value.coverage[1].verdict = 'contradicted';});
equal(parse('fact_check', contradictedReport), contradictedReport);
const failedCheck = mutate(factReport, value => {value.passed = false; value.checks.quote_time_context = false;});
equal(parse('fact_check', failedCheck), failedCheck);
for (const operation of [
 value => {value.coverage = [];}, value => {value.coverage.shift();}, value => {value.coverage.pop();}, value => {value.coverage.splice(3, 1);},
 value => {value.coverage[2].quote = value.coverage[2].quote.slice(1);}, value => {value.coverage[2].quote = value.coverage[1].quote + value.coverage[2].quote;},
 value => {value.coverage.splice(1, 0, clone(value.coverage[0]));}, value => {value.coverage.reverse();}, value => {value.coverage[0].paragraph = 1;},
 value => {value.coverage[1].paragraph = 1.5;}, value => {value.coverage[1].quote += 'extra';}, value => {value.coverage[1].source_ids = ['missing'];},
 value => {value.coverage[1].source_ids = []; value.coverage[1].source_dates = [];}, value => {value.coverage[1].source_dates = ['2026-10-04'];},
 value => {value.coverage[1].source_dates = [];}, value => {value.coverage[1].context = '已核实';}, value => {value.coverage[1].context = '具体采访语境，但未明确任何对应日期。';},
 value => {value.coverage[1].extra = true;}, value => {value.coverage[1].verdict = 'not_applicable';}, value => {value.coverage[0].verdict = 'confirmed';},
 value => {value.coverage[0].source_ids = ['S1']; value.coverage[0].source_dates = ['2026-10-01'];}, value => {value.coverage[1].classification = 'guess';},
 value => {value.coverage[1].verdict = 'unconfirmed';}, value => {value.issues = [issue];}, value => {value.unconfirmed = ['未核实'];},
 value => {value.checks.names = false;}, value => {value.checks.numbers = 'true';}, value => {value.checks.extra = true;}, value => {delete value.checks.metaphors;},
 value => {value.status = 'failed';}, value => {value.passed = false;}, value => {value.extra = true;},
]) {
 rejection('fact_check', factReport, operation);
 rejection('final_verify', factReport, operation);
}
rejection('fact_check', unconfirmedReport, value => {value.coverage.pop();});
rejection('fact_check', unconfirmedReport, value => {value.issues[0].quote = '不同版本的引文';});
rejection('fact_check', unconfirmedReport, value => {value.unconfirmed.push(value.unconfirmed[0]);});
// The selected date may be publication or event date, and context names that exact date.
const publicationDate = mutate(factReport, value => {value.coverage[1].source_dates = ['2026-10-02']; value.coverage[1].context = '2026-10-02为报道发布日期，采访发生在2026-10-01，明确区分两个时间。';});
equal(parse('fact_check', publicationDate), publicationDate);
// A final verification report from the old article cannot certify revised or new text.
reject('final_verify', factReport, {...context, input_article: revised});
reject('final_verify', factReport, {...context, input_article: inserted});
const revisedCoverage = mutate(factReport, value => {value.coverage[0].quote = revised.title; value.coverage[2].quote = revised.paragraphs[0].slice(facts[0].text.length);});
equal(parse('final_verify', revisedCoverage, {...context, input_article: revised}), revisedCoverage);
reject('final_verify', {status: 'completed', passed: true, coverage: [revisedCoverage.coverage[2]], issues: [], unconfirmed: [], checks: factReport.checks}, {...context, input_article: revised});
console.log('PASS complete title/full-text coverage, temporal context, negative reports and final-version binding');

for (const error of [Error('PRIVATE_API_KEY SQL provider body'), {message: 'PRIVATE_BODY'}, null, '私人异常', {get message() {throw Error('PRIVATE');}}]) {
 assert.equal(contract.editorialPublicError(error), contract.editorialErrors.unknown); assertions++;
}
for (const message of Object.values(contract.editorialErrors)) {assert.equal(contract.editorialPublicError(Error(message)), message); assertions++;}
assert.equal(/\bfetch\s*\(|\bdb\s*\(|\bimport\b/.test(source), false); assertions++;
console.log(`PASS editorial-contract: ${assertions} offline assertions; no imports, provider, database or network`);
