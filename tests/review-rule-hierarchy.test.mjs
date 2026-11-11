import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderReviewMarkdown} from '../web/core/review-markdown.mjs';
import {currentPlaybooks,currentPrompts,applicableScopes,scopeLabel,ruleCountLabel} from '../web/core/review-rule-scopes.mjs';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent,ruleCard} from '../web/pages/content-review.mjs';
import {readContentReviewData,copyReviewPrompt} from '../web/review-controller.mjs';
const book = (account,text,extra = {}) => ({id:account,account,status:'active',version:1,rules:[{rule_id:'R',section:'body',text}],...extra});
const prompt = (scope,version,status = 'active') => ({id:`${scope}-${version}`,scope,version,status,prompt_key:'longform_write',title:'提示词',content_md:`PROMPT_${scope}_${version}`});
const render = (data,account = 'V字',secondary = 'review') => renderContentReviewContent(normalizeReviewData(data),{account,filters:{},secondary});
test('safe Markdown supports fixed colors, bold/list, code, headings, quotes and safe links', () => {
  const html = renderReviewMarkdown('- [red]**重点**[/red]\n- **[blue]蓝色[/blue]**\n[green]绿[/green] [amber]黄[/amber]\n<script>alert(1)</script>\n[purple]<img src=x>[/purple]\n[red onclick=x]bad[/red]\n[x](javascript:alert(1))\n[ok](https://example.com/?x=1&y=2)\n`[red]code[/red]`\n# 标题\n> 引用');
  for (const color of ['red','blue','green','amber']) assert.match(html,new RegExp(`class="review-color-${color}"`));
  assert.match(html,/<ul><li><span class="review-color-red"><strong>重点<\/strong>/);
  assert.match(html,/<strong><span class="review-color-blue">蓝色/);
  assert.match(html,/&lt;script&gt;/);assert.match(html,/\[purple\]&lt;img/);
  assert.match(html,/<code>\[red\]code\[\/red\]<\/code>/);
  assert.match(html,/<h2>标题<\/h2>/);assert.match(html,/<blockquote>引用<\/blockquote>/);
  assert.doesNotMatch(html,/<script|<img|style=|href="javascript:|class="review-color-purple/);
  assert.match(renderReviewMarkdown('[ok](https://example.com) [unclosed]('),/href="https:\/\/example.com\/"/);
  assert.match(html,/href="https:\/\/example.com\/\?x=1&amp;y=2"/);
});
test('invalid and mismatched color tags remain literal and fenced code never gains formatting', () => {
  assert.equal(renderReviewMarkdown('[red]x[/blue]'),'<p>[red]x[/blue]</p>');
  assert.equal(renderReviewMarkdown('[red style=x]x[/red]'),'<p>[red style=x]x[/red]</p>');
  assert.equal(renderReviewMarkdown('```\n[red]<img>[/red]\n```'),'<pre><code>[red]&lt;img&gt;[/red]\n</code></pre>');
});
test('large unmatched tokens remain literal with bounded rendering cost', () => {
  const started = performance.now();
  for (const value of ['[red]'.repeat(26000),'['.repeat(130000),'[red]'.repeat(20000)+'[/blue]']) {
    assert.equal(renderReviewMarkdown(value),'<p>'+value+'</p>');
  }
  assert.ok(performance.now()-started < 1500);
});
test('legacy scopes select latest active books, preserve source, and isolate account layers', () => {
  const books = [book('整体','GLOBAL'),book('头条','PLATFORM'),book('V字','ACCOUNT'),book('鱼见','OTHER'),book('公众号','WECHAT'),book('global','OLD',{version:0})];
  const original = JSON.stringify(books);
  assert.deepEqual(applicableScopes('V字'),['global','toutiao','vzi']);
  assert.equal(currentPlaybooks(books,'V字').length,3);
  const html = render({playbooks:books});
  assert.ok(html.indexOf('GLOBAL') < html.indexOf('PLATFORM') && html.indexOf('PLATFORM') < html.indexOf('ACCOUNT'));
  assert.doesNotMatch(html,/OTHER|WECHAT|OLD/);assert.equal(JSON.stringify(books),original);
});
test('explicit shared rules cannot expose unrelated book introduction or private rules', () => {
  const html = render({playbooks:[book('鱼见','HIDDEN',{content_md:'# PRIVATE_TITLE\nPRIVATE_INTRO',rules:[
    {rule_id:'shared',scope:'global',text:'SHARED'},{rule_id:'private',text:'HIDDEN'}]})]});
  assert.match(html,/SHARED/);assert.doesNotMatch(html,/PRIVATE_TITLE|PRIVATE_INTRO|HIDDEN/);
});
test('only newest active prompts render in layer order, initially collapsed', () => {
  const prompts = [prompt('vzi',1),prompt('global',1),prompt('global',2),prompt('global',3,'draft'),prompt('yujian',1),prompt('wechat',1)];
  assert.deepEqual(currentPrompts(prompts,'V字').map(p=>p.id),['global-2','vzi-1']);
  const html = render({prompts},'V字','prompts');
  assert.match(html,/PROMPT_global_2/);assert.match(html,/PROMPT_vzi_1/);
  assert.doesNotMatch(html,/PROMPT_global_1|PROMPT_global_3|PROMPT_yujian|PROMPT_wechat|review-current-prompt" open/);
});
test('loader requests all book aliases but only current prompt endpoint and enforces read revisions', async () => {
  const paths = [];
  const data = await readContentReviewData(async path => {
    paths.push(path);
    return {items:path.startsWith('/review/playbooks?') ? [book('整体','GLOBAL')] : path.startsWith('/review/prompts/current?') ? [prompt('vzi',1)] : [],has_more:false,read_revision:'r1'};
  },'V字');
  assert.equal(data.playbooks[0].account,'整体');assert.equal(data.prompts.length,1);
  assert.ok(paths.includes('/review/playbooks?offset=0'));
  assert.ok(paths.includes('/review/prompts/current?account=V%E5%AD%97&offset=0'));
  assert.ok(paths.every(path=>!path.startsWith('/review/prompts?')));
  await assert.rejects(readContentReviewData(async path => ({items:[],has_more:false,read_revision:path.includes('/prompts/current')?'r2':'r1'}),'V字'),{code:'READ_REVISION_CHANGED'});
});
test('current account is expanded and prompt metadata shows activation time and copy action', () => {
  const html = render({playbooks:[book('整体','GLOBAL'),book('V字','LOCAL')],prompts:[{...prompt('vzi',2),updated_at:'2026-11-10T04:00:00Z'}]});
  assert.match(html,/data-rule-scope="vzi" open/);assert.doesNotMatch(html,/data-rule-scope="global" open/);
  assert.match(html,/V字账号规则.*1 条规则/);
  const promptsHtml = render({playbooks:[book('整体','GLOBAL'),book('V字','LOCAL')],prompts:[{...prompt('vzi',2),updated_at:'2026-11-10T04:00:00Z'}]},'V字','prompts');
  assert.match(promptsHtml,/生效时间：2026-11-10 12:00/);
  assert.match(promptsHtml,/data-review-action="copy-prompt"/);
});
test('copy preserves complete raw Markdown, rejects foreign/history rows and reports clipboard failures', async () => {
  const raw = '# 标题\n[red]**原文**[/red]\n```\n<script>raw</script>\n```\n';
  const rows = [{...prompt('vzi',2),content_md:raw},prompt('vzi',1),prompt('yujian',1)], copied = [];
  for (let i=0;i<3;i++) await copyReviewPrompt(rows,'V字','vzi-2',{writeText:async text=>copied.push(text)});
  assert.deepEqual(copied,[raw,raw,raw]);
  for (const id of ['yujian-1','vzi-1']) await assert.rejects(copyReviewPrompt(rows,'V字',id,{writeText:async()=>assert.fail()}),/已更新/);
  await assert.rejects(copyReviewPrompt(rows,'V字','vzi-2',{}),/不支持剪贴板/);
  await assert.rejects(copyReviewPrompt(rows,'V字','vzi-2',{writeText:async()=>{throw new Error('denied');}}),/复制失败/);
});
test('legacy labels never resolve inherited object properties; unrelated data cannot defeat empty state', () => {
  for (const value of ['constructor','toString','__proto__']) assert.equal(scopeLabel(value),value);
  const html = render({playbooks:[book('鱼见','FOREIGN')],prompts:[prompt('yujian',1),prompt('vzi',2,'draft')]});
  assert.match(html,/暂无内容复盘数据/);assert.doesNotMatch(html,/FOREIGN|PROMPT_yujian|PROMPT_vzi/);
});
test('wechat excludes global rules and prompts for canonical and legacy account names', () => {
  const books = [book('整体','GLOBAL'),book('公众号','WECHAT')], prompts = [prompt('global',1),prompt('wechat',1)];
  for (const account of ['公众号','wechat']) {
    assert.deepEqual(applicableScopes(account),['wechat']);
    assert.deepEqual(currentPrompts(prompts,account).map(row=>row.scope),['wechat']);
    const html = render({playbooks:books,prompts},account);
    assert.match(html,/WECHAT/);assert.doesNotMatch(html,/GLOBAL|PROMPT_global|data-rule-scope="global"/);
    assert.equal((html.match(/class="review-rule-layer"/g)||[]).length,1);
  }
});
test('exact IDs across sections resolve to deepest layer without mutating legacy records', () => {
  const books = [book('整体','GLOBAL',{rules:[{rule_id:'R',section:'title',text:'GLOBAL_ORIGINAL'}]}),
    book('头条','PLATFORM',{rules:[{rule_id:'R',section:'body',text:'PLATFORM_ORIGINAL'}]}),
    book('V字','VZI_CURRENT'),book('鱼见','YUJIAN_CURRENT')];
  const original = JSON.stringify(books);
  for (const [account,winner,other] of [['V字','vzi','YUJIAN'],['鱼见','yujian','VZI']]) {
    const rows = currentPlaybooks(books,account).flatMap(row=>row.rules);
    assert.equal(rows.filter(row=>!row.overriddenByScope).length,1);
    assert.deepEqual(rows.filter(row=>row.overriddenByScope).map(row=>row.overriddenByScope),[winner,winner]);
    assert.deepEqual(rows.find(row=>!row.overriddenByScope).overridesScopes,['global','toutiao']);
    assert.equal(ruleCountLabel(rows),'3 条规则 · 1 条当前生效 · 2 条被覆盖');
    const html = render({playbooks:books},account);
    assert.equal((html.match(/data-rule-state="effective"/g)||[]).length,1);
    assert.equal((html.match(/data-rule-state="overridden"/g)||[]).length,2);
    assert.equal((html.match(/class="review-rule-layer"/g)||[]).length,3);
    assert.match(html,/<details class="review-overridden-rule">\s*<summary>已被.*账号规则覆盖 · 查看原文<\/summary><p>GLOBAL_ORIGINAL/);
    assert.doesNotMatch(html,/class="review-overridden-rule" open/);assert.doesNotMatch(html,new RegExp(other));
    assert.equal((html.match(/ · 1 条规则 · 0 条当前生效 · 1 条被覆盖<\/span><\/summary>/g)||[]).length,2);
  }
  assert.equal(JSON.stringify(books),original);
});
test('same-layer duplicates never override each other; exact-case/space IDs remain distinct with unique DOM IDs', () => {
  const books = [book('V字','unused',{rules:[
    {rule_id:'SAME',scope:'global',section:'title',text:'UPPER'},
    {rule_id:'SAME',scope:'vzi',section:'body',text:'CURRENT_ONE'},
    {rule_id:'SAME',scope:'vzi',section:'body',text:'CURRENT_TWO'},
    {rule_id:'same',scope:'toutiao',section:'body',text:'CASE_DISTINCT'},
    {rule_id:'SAME ',scope:'toutiao',section:'body',text:'SPACE_DISTINCT'},
  ]})];
  const rows = currentPlaybooks(books,'V字').flatMap(row=>row.rules);
  assert.equal(rows.filter(row=>row.overriddenByScope).length,1);assert.equal(rows[0].overriddenByScope,'vzi');
  assert.equal(ruleCountLabel(rows),'5 条规则 · 4 条当前生效 · 1 条被覆盖');
  const html = render({playbooks:books});
  const ids = [...html.matchAll(/id="(review-rule-[^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);
});
test('old, inactive, foreign and empty ID rules do not cause false overrides', () => {
  const books = [book('整体','GLOBAL'),book('V字','OTHER_ID',{version:2,rules:[{rule_id:'OTHER',text:'CURRENT'}]}),
    book('V字','OLD',{id:'old',version:1}),book('V字','DRAFT',{id:'draft',version:3,status:'draft'}),
    book('V字','INACTIVE',{id:'inactive',version:4,status:'inactive'}),book('鱼见','FOREIGN',{version:10})];
  assert.equal(currentPlaybooks(books,'V字').flatMap(row=>row.rules).filter(row=>row.overriddenByScope).length,0);
  const html = render({playbooks:books});assert.doesNotMatch(html,/OLD|DRAFT|INACTIVE|FOREIGN|review-overridden-rule/);
  assert.match(html,/GLOBAL/);assert.match(html,/CURRENT/);
  const emptyIds = ['整体','头条','V字'].map(account=>book(account,'empty',{rules:[{rule_id:'',text:'empty'}]}));
  assert.ok(currentPlaybooks(emptyIds,'V字').every(row=>row.rules.every(rule=>!rule.overriddenByScope)));
});
test('historical snapshot cards use safe Markdown without current override metadata', () => {
  const snapshot = {rule_id:'R<script>',text:'- **历史正文**\n- [red]旧规则[/red]\n<script>alert(1)</script>\n[x](javascript:alert(1))',
    evidence_note:'<img src=x onerror=alert(1)>',overriddenByScope:'vzi',overridesScopes:['global']};
  const original = JSON.stringify(snapshot), html = ruleCard(snapshot,0,true);
  assert.match(html,/<ul><li><strong>历史正文<\/strong><\/li><li><span class="review-color-red">旧规则/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.match(html,/R&lt;script&gt;/);
  assert.doesNotMatch(html,/<script|<img|href="javascript:|review-overridden-rule|当前生效|覆盖|data-rule-state|id="review-rule-/);
  assert.equal(JSON.stringify(snapshot),original);assert.match(ruleCard({},0,true),/<p>未提供规则内容<\/p>/);
});
test('mobile CSS constrains long content, horizontal code and minimum 15px fonts', async () => {
  const css = await readFile(new URL('../public/review.css',import.meta.url),'utf8');
  assert.match(css,/@media \(max-width:560px\)[\s\S]*review-rule-hierarchy[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/review-rule-hierarchy pre \{ max-width:100%; overflow:auto; white-space:pre; overflow-wrap:normal; word-break:normal;/);
  const mobile = css.slice(css.lastIndexOf('@media (max-width:560px)'));
  for (const selector of ['.review-v13-rule-row','.review-v13-rule-id','.review-markdown code','.review-prompt-copy-actions .btn']) assert.ok(mobile.includes(selector));
  assert.match(mobile,/font-size:15px; line-height:1\.6/);
});
