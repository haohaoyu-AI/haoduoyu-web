// Pure V68 regressions. No real provider, database, browser, credentials or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/editorial-contract.ts', 'utf8'), {
 compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {
 exports, URL, Date, Error,
 require() {throw Error('Dependencies forbidden in pure contract tests');},
 fetch() {throw Error('Network forbidden in offline contract tests');},
});
const contract = exports, clone = value => JSON.parse(JSON.stringify(value));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sources = [1, 2].map(n => ({id: `S${n}`, title: `合成公开来源${n}`, url: `https://example.com/public/${n}`, published: '2026-10-06', event_date: `2026-10-0${n}`, accessed: '2026-10-06', context: `2026-10-0${n}合成公开记录，仅涉及作品公开事实。`}));
const facts = [
 {id: 'F1', text: '影片于2026年10月1日公开放映。', source_ids: ['S1'], context: '公开放映的事件日期，不涉及私人行为。'},
 {id: 'F2', text: '导演在2026年10月2日公开谈到拍摄。', source_ids: ['S2'], context: '只采用公开谈话，不推测私人心理。'},
];
const padded = text => text + '叙'.repeat(600 - text.length);
const article = {title: '合成作品评论', paragraphs: [padded(facts[0].text), padded('这处安排带来新的理解。'), padded(facts[1].text), padded('镜头像钥匙，打开矛盾。')]};
const context = {sources, facts, input_article: article};
const opinion = (paragraph, quote, classification = 'opinion') => ({paragraph, quote, classification, verdict: 'not_applicable', source_ids: [], source_dates: [], context: '作者判断或明确比喻，没有夹带公开或私人事实。'});
const confirmed = (paragraph, quote, index = 0) => ({paragraph, quote, classification: 'fact', verdict: 'confirmed', source_ids: [sources[index].id], source_dates: [sources[index].event_date], context: sources[index].context});
const report = {
 status: 'completed', passed: true,
 coverage: [opinion(0, article.title), confirmed(1, facts[0].text), opinion(1, article.paragraphs[0].slice(facts[0].text.length)), opinion(2, article.paragraphs[1]), confirmed(3, facts[1].text, 1), opinion(3, article.paragraphs[2].slice(facts[1].text.length)), opinion(4, article.paragraphs[3], 'metaphor')],
 issues: [], unconfirmed: [], checks: {paragraphs: true, names: true, numbers: true, metaphors: true, quote_time_context: true},
};
let assertions = 0;
const parse = (stage, value, ctx = context) => contract.parseEditorialArtifact(stage, JSON.stringify(value), ctx);
const accept = (stage, value, ctx = context) => {assert.deepEqual(clone(parse(stage, value, ctx)), clone(value)); assertions++;};
const reject = (stage, value, ctx = context, error = contract.editorialErrors.coverage) => {assert.throws(() => parse(stage, value, ctx), e => e.message === error); assertions++;};
const mutate = (value, change) => {value = clone(value); change(value); return value;};
const legacy = ctx => ({...ctx, validation_version: 2});

for (const stage of ['fact_check', 'final_verify']) {
 accept(stage, report);
 accept(stage, report, {...context, validation_version: 3});
 const old = parse(stage, report, legacy(context));
 assert.equal(digest(old), digest(parse(stage, report))); assertions++;
 for (const classification of ['opinion', 'metaphor']) {
  const relabeled = mutate(report, r => {r.coverage[1] = opinion(1, facts[0].text, classification);});
  reject(stage, relabeled);
  accept(stage, relabeled, legacy(context)); // Read-only V67 receipts retain their exact old projection.
 }
 const allOpinion = mutate(report, r => {r.coverage = [article.title, ...article.paragraphs].map((quote, paragraph) => opinion(paragraph, quote));});
 reject(stage, allOpinion);
 const wrongSource = mutate(report, r => {r.coverage[1] = confirmed(1, facts[0].text, 1);});
 reject(stage, wrongSource);
 accept(stage, wrongSource, legacy(context));
 // Splitting a known assertion across coverage entries cannot hide its middle.
 const split = mutate(report, r => {r.coverage.splice(1, 1, confirmed(1, facts[0].text.slice(0, 5)), opinion(1, facts[0].text.slice(5, 6)), confirmed(1, facts[0].text.slice(6)));});
 reject(stage, split);
 split.coverage[2] = confirmed(1, facts[0].text.slice(5, 6));
 accept(stage, split);
 const wrongSplit = mutate(split, r => {r.coverage[2] = confirmed(1, facts[0].text.slice(5, 6), 1);});
 reject(stage, wrongSplit);
}
console.log('PASS frozen assertions cannot be relabeled, split-hidden or confirmed with unrelated sources; V67 projections stay unchanged');

// Whitespace normalization is confined to the known-fact floor. Exact coverage remains byte-for-byte.
const spacedArticle = mutate(article, a => {a.paragraphs[0] = Array.from(facts[0].text).join(' ') + article.paragraphs[0].slice(facts[0].text.length);});
const spacedReport = mutate(report, r => {r.coverage[1].quote = Array.from(facts[0].text).join(' ');});
accept('final_verify', spacedReport, {...context, input_article: spacedArticle});
reject('final_verify', mutate(spacedReport, r => {r.coverage[1] = opinion(1, r.coverage[1].quote);}), {...context, input_article: spacedArticle});
reject('final_verify', report, {...context, input_article: spacedArticle});

const titled = mutate(article, a => {a.title = '公开材料：' + facts[0].text;});
const titleReport = mutate(report, r => {r.coverage[0].quote = titled.title;});
reject('final_verify', titleReport, {...context, input_article: titled});
titleReport.coverage[0] = confirmed(0, titled.title);
accept('final_verify', titleReport, {...context, input_article: titled});

const repeated = mutate(article, a => {a.paragraphs[1] = padded(facts[0].text);});
const repeatedReport = mutate(report, r => {r.coverage[3].quote = repeated.paragraphs[1];});
reject('final_verify', repeatedReport, {...context, input_article: repeated});
repeatedReport.coverage[3] = confirmed(2, repeated.paragraphs[1]);
accept('final_verify', repeatedReport, {...context, input_article: repeated});

const combined = mutate(article, a => {a.paragraphs[0] = padded(facts[0].text + facts[1].text);});
const combinedReport = mutate(report, r => {r.coverage.splice(1, 2, confirmed(1, combined.paragraphs[0]));});
reject('final_verify', combinedReport, {...context, input_article: combined});
combinedReport.coverage[1].source_ids = ['S1', 'S2'];
combinedReport.coverage[1].source_dates = ['2026-10-01', '2026-10-02'];
combinedReport.coverage[1].context = '2026-10-01放映与2026-10-02公开谈话分别核对，不能混用日期。';
accept('final_verify', combinedReport, {...context, input_article: combined});
const duplicateEvidence = {...context, facts: [...facts, {...facts[0], id: 'F3', source_ids: ['S2']}]};
accept('final_verify', mutate(report, r => {r.coverage[1] = confirmed(1, facts[0].text, 1);}), duplicateEvidence);
const acrossParagraphs = mutate(article, a => {a.paragraphs[0] = '叙'.repeat(580) + facts[0].text.slice(0, 5); a.paragraphs[1] = padded(facts[0].text.slice(5));});
const acrossReport = mutate(report, r => {r.coverage.splice(1, 3, opinion(1, acrossParagraphs.paragraphs[0]), opinion(2, acrossParagraphs.paragraphs[1]));});
reject('final_verify', acrossReport, {...context, input_article: acrossParagraphs});
accept('final_verify', acrossReport, legacy({...context, input_article: acrossParagraphs}));
acrossReport.coverage.splice(1, 2, opinion(1, '叙'.repeat(580)), confirmed(1, facts[0].text.slice(0, 5)), confirmed(2, facts[0].text.slice(5)), opinion(2, acrossParagraphs.paragraphs[1].slice(facts[0].text.slice(5).length)));
accept('final_verify', acrossReport, {...context, input_article: acrossParagraphs});
reject('final_verify', mutate(acrossReport, r => {r.coverage[3] = confirmed(2, facts[0].text.slice(5), 1);}), {...context, input_article: acrossParagraphs});
console.log('PASS title, repeated, whitespace-varied, cross-paragraph and combined frozen assertions retain full source-linked coverage');

const issue = {id: 'I1', paragraph: 1, quote: facts[0].text, type: 'expression', severity: 'medium', basis: '此段表达需要限定。', revision_goal: '实际修改此段表达。'};
const review = {status: 'completed', decision: 'revise', reason: '须回应具体问题。', issues: [issue]};
const revision = after => ({article: after, decisions: [{issue_id: issue.id, action: 'accepted', reason: '依据问题完成修改。'}], changes: [article.title, ...article.paragraphs].map((before, paragraph) => ({paragraph, before, after: [after.title, ...after.paragraphs][paragraph], reason: '按确切文本记录修改。'})).filter(c => c.before !== c.after)});
const unrelated = revision(mutate(article, a => {a.title = '只改无关标题';}));
const revisionContext = {...context, previous_report: review};
reject('structure_revision', unrelated, revisionContext, contract.editorialErrors.revision);
accept('structure_revision', unrelated, legacy(revisionContext));
for (const type of ['fact', 'expression']) reject('structure_revision', unrelated, {...revisionContext, previous_report: {...review, issues: [{...issue, type}]}}, contract.editorialErrors.revision);
for (const type of ['structure', 'logic']) accept('structure_revision', unrelated, {...revisionContext, previous_report: {...review, issues: [{...issue, type}]}});
const revised = mutate(article, a => {a.paragraphs[0] += ' 这里保留证据边界。';});
accept('structure_revision', revision(revised), revisionContext);
reject('final_verify', report, {...context, input_article: revised});
reject('final_verify', mutate(report, r => {r.coverage[2].quote += ' 这里保留证据边界。'; r.coverage.pop();}), {...context, input_article: revised});
const revisedReport = mutate(report, r => {r.coverage[2].quote += ' 这里保留证据边界。';});
accept('final_verify', revisedReport, {...context, input_article: revised});

// A revision can introduce a new claim. The clean final input, not its old report/diff, must be reviewed.
const factIssue = {...issue, type: 'fact', severity: 'high'};
const failed = mutate(report, r => {r.passed = false; r.coverage[1].verdict = 'unconfirmed'; r.coverage[1].source_ids = []; r.coverage[1].source_dates = []; r.coverage[1].context = '公开材料不足，此断言未核实。'; r.issues = [factIssue]; r.unconfirmed = [facts[0].text];});
const newClaim = '影片于2026年10月7日公开放映。';
const factRevised = mutate(article, a => {a.paragraphs[0] = newClaim + a.paragraphs[0].slice(facts[0].text.length);});
accept('fact_revision', revision(factRevised), {...context, previous_report: failed});
reject('fact_revision', unrelated, {...context, previous_report: failed}, contract.editorialErrors.revision);
reject('final_verify', report, {...context, input_article: factRevised});
const newClaimReport = mutate(report, r => {r.passed = false; r.coverage[1].quote = newClaim; r.coverage[1].verdict = 'unconfirmed'; r.coverage[1].source_ids = []; r.coverage[1].source_dates = []; r.coverage[1].context = '修订新增日期无公开证据，必须报告未核实。'; r.unconfirmed = [newClaim];});
accept('final_verify', newClaimReport, {...context, input_article: factRevised});
reject('final_verify', mutate(newClaimReport, r => {r.passed = true;}), {...context, input_article: factRevised}, contract.editorialErrors.invalid);
reject('final_verify', mutate(newClaimReport, r => {r.passed = true; r.unconfirmed = []; r.coverage[1].verdict = 'confirmed';}), {...context, input_article: factRevised}, contract.editorialErrors.invalid);
console.log('PASS local accepted issues require anchored changes; new/changed claims need fresh exact full-text final coverage and cannot pass unresolved');

for (const input_article of [{title: '短文', paragraphs: ['字'.repeat(1999)]}, {title: '长文', paragraphs: ['字'.repeat(3001)]}]) {
 const shortReport = {...report, coverage: [opinion(0, input_article.title), opinion(1, input_article.paragraphs[0])]};
 for (const stage of ['fact_check', 'final_verify']) {
  reject(stage, shortReport, {...context, input_article}, contract.editorialErrors.context);
  accept(stage, shortReport, legacy({...context, input_article}));
 }
 const pass = {status: 'completed', decision: 'pass', reason: '合成审稿。', issues: []};
 reject('structure_review', pass, {...context, input_article}, contract.editorialErrors.context);
 accept('structure_review', pass, legacy({...context, input_article}));
}
for (const validation_version of [1, 4, '2', '3', null, false]) reject('final_verify', report, {...context, validation_version}, contract.editorialErrors.context);
console.log(`PASS editorial-contract-v68: ${assertions} pure offline assertions; strict new validation, unchanged explicit V67 receipt parsing, no semantic-truth claim`);
