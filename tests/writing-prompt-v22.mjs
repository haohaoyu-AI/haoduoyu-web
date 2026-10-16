import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {testOutline} from './fixtures/writing-outline.mjs';

// Pure offline prompt/snapshot tests. Any provider call or database access fails.
const modules = new Map();
let providerCalls = 0;
function load(name) {
 if (modules.has(name)) return modules.get(name);
 const exports = {};
 modules.set(name, exports);
 const source = fs.readFileSync(`lib/${name}.ts`, 'utf8');
 const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js, {exports, crypto, TextEncoder, URL, Set, Error,
  require: name => name === './test-store' ? {db() {throw Error('No database access allowed');}} : name === './claude' ? {protectPreparedArticleForOwner() {throw Error('No provider access allowed');}} : load(name.slice(2)),
  fetch() {providerCalls++; throw Error('No network allowed');},
 });
 return exports;
}
const hash = value => createHash('sha256').update(value).digest('hex');
const rules = load('writing-supplement');
const current = load('writing-prompt-v22');
const fixed = load('writing-fixed-references');
const legacy = load('writing-rewrite-v2');
const input = load('writing-input');
const prompt = rules.effectiveWritingPrompt;
const approvedSha256 = 'a5c9b505cac05d407cd13c2985601e3978eb60ec8b21e8a18b7508500d4618e6';

// The digest covers the entire approved TXT, including its complete reference,
// ten change-map edits, all required fields, Word JSON and original whitespace.
assert.equal(prompt, current.writingPromptV22);
assert.equal(current.writingPromptV22Sha256, approvedSha256);
assert.equal(hash(prompt), approvedSha256);
assert.equal(prompt.length, 8572);
assert.equal(Buffer.byteLength(prompt), 23376);
assert.equal(rules.effectiveWritingStyleVersion, '好多鱼V2.2·文笔表达融合与两阶段框架-20261006');
assert.equal(fixed.fixedWritingVersion, rules.effectiveWritingStyleVersion);
assert.ok(fixed.requiresWritingOutline(rules.effectiveWritingStyleVersion));
assert.ok(fixed.requiresWritingOutline(fixed.legacyFixedWritingVersion));
assert.equal(prompt.split('好多鱼写作提示词 V2.2（文笔表达融合版）').length, 2);
for (const label of ['【固定一：写作风格】', '【固定二：文笔范文】', '【固定三：文字排版】', '【本篇变量的准备要求】']) assert.equal(prompt.split(label).length, 2);
assert.ok(prompt.endsWith(fixed.outlineInstructions + '\n'));
assert.ok(!prompt.includes(rules.expressionPriority));
assert.ok(!prompt.includes(rules.sourceExpressionSupplement));
assert.ok(!prompt.includes(rules.narrationSupplement));
assert.ok(!prompt.includes(rules.entertainmentSupplement));
assert.ok(!prompt.includes(rules.mobileReadingSupplement));
for (const phrase of [
 '本版表达要求适用于新生成和未冻结改稿',
 '完整出处集中留在独立资料说明，不混入正文',
 '以北京时间写作日期判断当年，近期事件默认省略年份',
 '先亮出本篇最想说的判断，再用事实推进',
 '通常1–2句一段，照顾手机阅读',
 '不固定套NPC、挂件、girls等说法',
 '不在中途突然用“我认为”“我不喜欢”“我看”自我宣告',
 '独立审稿保留有依据的态度、节奏和个性',
 'Claude仅返回框架→小鱼审核框架→Claude按审核通过的框架输出正文',
 '不能合并为一次请求，让Claude同时给出框架和正文后声称已经审核',
 '框架由Claude根据小鱼整理的已核验资料编制',
]) assert.ok(prompt.includes(phrase), phrase);

// Three fixed inputs retain exact original prose/style/typography bytes.
assert.equal(fixed.proseReference.length, 2841);
assert.equal(fixed.proseReference.split('\n\n').length, 44);
assert.equal(hash(fixed.proseReference), '17cbbf7a9a522df31ccb9d9ca80b6b757f9a31e2788ff8ccbef3a7773dd583eb');
assert.equal(prompt.split('<文笔参考>\n')[1].split('\n</文笔参考>')[0], fixed.proseReference);
assert.equal(fixed.conciseWritingStyle.length, 280);
const fixedPart = text => text.split('\n\n【本篇变量的准备要求】')[0];
assert.equal(fixedPart(fixed.fixedWritingReferences), fixedPart(fixed.legacyFixedWritingReferences));
const section4 = text => text.split('4 让读者跟着事情转弯\n\n')[1].split('\n\n5 像一个有判断的人说话')[0];
assert.equal(section4(prompt), section4(legacy.rewritePrompt));
const format = JSON.stringify(load('output-format').outputFormat);
assert.ok(prompt.includes('\n' + format + '\n'));
assert.equal(hash(fs.readFileSync('lib/output-format.ts')), 'b95ac3fddab8b6eb4696057b6a71817b8b6e283fa0d05300826a2c8ac939e11c');
assert.equal(hash(fs.readFileSync('lib/claude-prompt.ts')), 'b836295fe2ab35ae188c2d26a82bc52951b42c01cf30ae478b172a47c6f31b4a');

// Preserve legacy core/combined exports for callers and stored-version fixtures.
assert.equal(hash(legacy.rewritePrompt), '8198d14a4d073dd12c6bb22b891de3b337da278e28d80583867e39c04e6d4afa');
assert.equal(hash(fixed.legacyFixedWritingReferences), '017862016b4fb57eac6a2d2ac8ea24f42eb776794418e43350ec8d4574ddd526');
assert.equal(hash(rules.legacyEffectiveWritingPrompt), 'fe54ca0bc13325d94ee8d6b9bf45fbe96226fe06f7ca9e157871f027a3b1f78b');
assert.equal(rules.legacyEffectiveWritingStyleVersion, '好多鱼V2.1·固定三项与选题框架-20261005·表达补充·20261005-06');
assert.equal(hash(fs.readFileSync('lib/writing-rewrite-v2.ts')), '181b45ecb5dcaff58a1172e1bec4bdf456b280478ebfcb400f62518ce69c2340');
assert.equal(hash(fs.readFileSync('lib/writing-style.ts')), 'e6c5c60ec15531f686af2fa1ced014c4417d4dbec948803e989a4063c845974a');

const topic = {topic: '离线合成材料测试', materials: '合成影院公告与售票数据仅用于离线测试，分别核验相同统计窗口的排片与实际入场，不能用排片数字直接代表作品质量。'.repeat(3), outline: testOutline, sources: [{title: '合成公告', url: 'https://example.com/one', published: '2026-10-05'}, {title: '合成售票数据', url: 'https://example.com/two', published: '2026-10-05'}]};
for (const writer of ['xiaoyu', 'claude']) {
 const skeleton = await input.writingInputSkeleton('2026-10-06', writer);
 assert.equal(skeleton.writing_prompt, prompt);
 assert.equal(skeleton.prompt_sha256, approvedSha256);
 assert.equal(skeleton.prompt_version, rules.effectiveWritingStyleVersion);
 assert.equal(skeleton.system_prompt, load('claude-prompt').providerSystemPrompt(prompt));
 const snapshot = await input.assembleWritingInput(skeleton, topic);
 assert.equal(snapshot.writing_prompt, prompt);
 assert.equal(snapshot.outline, testOutline);
 assert.equal(snapshot.prompt_sha256, approvedSha256);
 const before = JSON.stringify(snapshot);
 const replay = await input.assembleWritingInput(input.parseWritingInput(before), topic);
 assert.equal(JSON.stringify(replay), before);
}
for (const [writingPrompt, version] of [[legacy.rewritePrompt, legacy.rewriteVersion], [rules.legacyEffectiveWritingPrompt, rules.legacyEffectiveWritingStyleVersion]]) {
 const system = load('claude-prompt').providerSystemPrompt(writingPrompt);
 const skeleton = {contract_version: 1, state: 'awaiting_materials', day: '2026-10-05', writer: 'claude', writing_prompt: writingPrompt, prompt_version: version, prompt_sha256: hash(writingPrompt), system_prompt: system, system_prompt_sha256: hash(system)};
 const before = JSON.stringify(skeleton);
 const stored = input.parseWritingInput(before);
 const snapshot = await input.assembleWritingInput(stored, {...topic, outline: '旧版可选框架逐字保留'});
 assert.equal(JSON.stringify(stored), before);
 for (const field of ['writing_prompt', 'prompt_version', 'prompt_sha256', 'system_prompt', 'system_prompt_sha256']) assert.equal(snapshot[field], skeleton[field]);
 assert.equal(snapshot.outline, '旧版可选框架逐字保留');
 const frozen = JSON.stringify(snapshot);
 assert.equal(JSON.stringify(input.parseWritingInput(frozen)), frozen);
}
assert.equal(providerCalls, 0);
console.log('PASS V2.2 complete approved TXT SHA/8572 characters, fused clauses, two-request wording, exact fixed three references and Word bytes; new author snapshots use V2.2; V2.0/V2.1 frozen inputs unchanged; zero provider/database/network calls');
