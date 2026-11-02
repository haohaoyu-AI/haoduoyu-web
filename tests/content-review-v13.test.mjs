import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent, REVIEW_SECTIONS} from '../web/pages/content-review.mjs';
import {reviewRoute} from '../web/review-controller.mjs';

// Synthetic records only. The UTC publication times straddle Shanghai midnight.
const account = 'V字', other = '其他账号';
const vm = extra => ({account, view:'overview', secondary:'benchmarks',
  now:'2026-11-02T04:00:00Z', filters:{range:'all'}, article:'', loading:false, error:'', ...extra});
const htmlFor = (input, extra) => renderContentReviewContent(normalizeReviewData(input), vm(extra));
const names = ['浅黑科技','首席商业洞察','人工智能学家'];
function fixture() {
  const accounts = names.map((name,i) => ({id:`account-${i}`,account,name,fans:10000+i,
    posting_cadence:`节奏${i}`,profile_url:`https://example.com/account/${i}`}));
  const references = Array.from({length:11},(_,i) => ({id:`ref-${i}`, account,
    benchmark_account_id:`account-${i % 3}`,title:`样本${i}`,reads:i===0?280000:1000+i,
    url:`https://example.com/reference/${i}`,topic:`题材${i}`,collected_on:'2026-10-31'}));
  const articles = [
    {id:'own-a',account,platform_article_id:'7702864660600570431',title:'我方文章甲',url:'https://example.com/ours/a',
      published_at:'2026-11-01T15:30:00Z',reference_article_id:'ref-0',image_count:25,title_pattern:'模板甲'},
    {id:'own-b',account,platform_article_id:'7702772178097357346',title:'我方文章乙',
      published_at:'2026-10-31T16:30:00Z',sample_title:'回退样本标题',sample_url:'https://example.com/fallback'},
    {id:'old',account,title:'旧文章',published_at:'2026-10-26'},
    {id:'unknown',account,title:'没有样本的文章',published_at:'2026-11-02'},
    {id:'foreign',account:other,title:'FOREIGN_ARTICLE',published_at:'2026-11-01',reference_article_id:'foreign-ref'}
  ];
  const snapshots = [
    {id:'snap-a',article_id:'own-a',snapshot_date:'2026-11-02',age_hours:24,reads:1000,ctr:10,completion_rate:14.71},
    {id:'snap-b',article_id:'own-b',snapshot_date:'2026-11-02',age_hours:24,reads:0,ctr:0},
    {id:'snap-old',article_id:'old',snapshot_date:'2026-10-27',age_hours:24,reads:5000,ctr:4},
    {id:'snap-foreign',article_id:'foreign',snapshot_date:'2026-11-02',age_hours:24,reads:999999,ctr:99}
  ];
  const groups = ['keep_topic','drop_topic','title','body','audience','checklist'];
  const rules = Array.from({length:31},(_,i) => ({rule_id:`R${String(i+1).padStart(2,'0')}`,
    section:groups[i%groups.length],status:['kept','trial','hold','dropped'][i] || 'candidate',
    text:`ACTIVE_RULE_${i+1} 第一行\n第二行\n展开全文`, ...(i===0?{evidence_note:'一句证据'}:{})}));
  return {articles,snapshots,benchmarkAccounts:[...accounts,{id:'foreign-account',account:other,name:'FOREIGN_ACCOUNT'}],
    benchmarkArticles:[...references,{id:'foreign-ref',account:other,benchmark_account_id:'foreign-account',
      title:'FOREIGN_REFERENCE',reads:999999,url:'https://example.com/foreign'}],
    playbooks:[{id:'active',account,status:'active',version:1,published_on:'2026-10-30',content_md:'# 标题\n总纲第一行\n总纲第二行\n总纲全文\n## 后续章节\nLATER_SECTION_MUST_HIDE',rules},
      {id:'draft2',account,status:'draft',version:2,published_on:'2026-10-31',content_md:'DRAFT_V2_SECRET',rules:[{rule_id:'D2',section:'title',text:'DRAFT_RULE'}]},
      {id:'draft3',account,status:'draft',version:3,published_on:'2026-11-01',content_md:'DRAFT_V3_SECRET',rules:[]},
      {id:'foreign-book',account:other,status:'active',version:99,content_md:'FOREIGN_BOOK',rules:[]}],
    notes:[{id:'note-old',account,note_date:'2026-10-30',kind:'insight',title:'旧笔记',body_md:'旧笔记正文'},
      {id:'note-new',account,note_date:'2026-11-01',kind:'decision',title:'新笔记',body_md:'新笔记第一行\n第二行\n第三行'},
      {id:'note-other',account:other,note_date:'2026-11-02',kind:'decision',title:'FOREIGN_NOTE',body_md:'FOREIGN_NOTE_BODY'}],
    reports:[{id:'daily',account,period_type:'daily',period_end:'2026-10-31',summary_md:'日报摘要文本',metrics:{notes_md:'LEGACY_NOTES_MUST_HIDE'}},
      {id:'weekly',account,period_type:'weekly',period_end:'2026-11-01',summary_md:'WEEKLY_MUST_HIDE'},
      {id:'foreign-report',account:other,period_type:'daily',period_end:'2026-11-02',summary_md:'FOREIGN_REPORT'}],
    accountHealth:[{id:'health',account,judgement:'限流',action:'HEALTH_MUST_HIDE'}]};
}
function stat(html,label) {
  const cards = [...html.matchAll(/<article class="review-stat">([\s\S]*?)<\/article>/g)];
  const card = cards.find(match => match[1].includes(`<span>${label}</span>`));
  assert.ok(card, `missing KPI ${label}`);
  return card[1].match(/<strong>([\s\S]*?)<\/strong>/)?.[1].replace(/<[^>]+>/g,'').trim();
}
function row(html,id) {
  const match = html.match(new RegExp(`<tr data-review-row="${id}">([\\s\\S]*?)</tr>`));
  assert.ok(match, `missing article ${id}`); return match[1];
}

test('five KPIs include the current Shanghai week verdict distribution and isolate accounts', () => {
  const html = htmlFor(fixture());
  assert.equal((html.match(/<article class="review-stat">/g)||[]).length,5);
  assert.equal(stat(html,'昨日发文数'),'2篇');
  assert.equal(stat(html,'24h 阅读中位数'),'1,000');
  assert.equal(stat(html,'24h CTR 中位数'),'4.0%');
  assert.equal(stat(html,'近 7 天爆文数'),'1篇');
  assert.equal(stat(html,'爆 / 中 / 扑'),'0 / 0 / 0');
  const priorWeek=htmlFor(fixture(),{now:'2026-11-01T04:00:00Z'});
  assert.equal(stat(priorWeek,'爆 / 中 / 扑'),'2 / 0 / 1');
  assert.doesNotMatch(html,/FOREIGN_|HEALTH_MUST_HIDE|账号健康|本周结论|24h 数据缺失/);
  const unknown = htmlFor({articles:[{id:'u',account,title:'无观测',published_at:'2026-11-01'}]});
  assert.equal(stat(unknown,'24h 阅读中位数'),'—');
  assert.equal(stat(unknown,'24h CTR 中位数'),'—');
  assert.equal(stat(unknown,'爆 / 中 / 扑'),'0 / 0 / 0');
});

test('article list has four columns, safe linked and fallback references, empty unknown verdict, and complete detail', () => {
  const input=fixture(), html=htmlFor(input);
  for (const id of ['own-a','own-b','unknown']) assert.equal((row(html,id).match(/<td\b/g)||[]).length,4);
  const a=row(html,'own-a'), b=row(html,'own-b'), u=row(html,'unknown');
  assert.match(a,/样本0/); assert.match(a,/280,000|28\.0 万|28 万/); assert.match(a,/https:\/\/example\.com\/reference\/0/);
  assert.match(b,/回退样本标题/); assert.match(b,/https:\/\/example\.com\/fallback/);
  assert.match(b,/data-label="24h 阅读">0<\/td>/);
  assert.doesNotMatch(u,/review-reference|待判定|review-sample-icon/);
  assert.doesNotMatch(html,/待判定|暂无 24h 样本/);
  assert.doesNotMatch(a,/data-label="24h CTR"|data-label="原因"|FOREIGN_/);
  const detail=htmlFor(input,{article:'own-a'});
  for (const value of ['24h CTR','24h 完成率','配图数','模板','判定依据','原因全文','模板甲','14.7%','25']) assert.ok(detail.includes(value),value);
});

test('only two tabs show three current-account groups, eleven samples and the referenced own article', () => {
  const html=htmlFor(fixture(),{secondary:'benchmarks'});
  assert.deepEqual(REVIEW_SECTIONS.map(([id])=>id),['benchmarks','review']);
  assert.equal((html.match(/data-review-secondary=/g)||[]).length,2);
  assert.equal((html.match(/class="review-v13-benchmark-group"/g)||[]).length,3);
  assert.equal((html.match(/class="review-v13-sample-row"/g)||[]).length,11);
  for (const name of names) assert.ok(html.includes(name),name);
  assert.match(html,/已仿/); assert.match(html,/我方文章甲/); assert.match(html,/https:\/\/example\.com\/ours\/a/);
  const firstGroup=html.match(/<section class="review-v13-benchmark-group">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(firstGroup);
  assert.ok(firstGroup.indexOf('样本0') < firstGroup.indexOf('样本9'));
  assert.ok(firstGroup.indexOf('样本9') < firstGroup.indexOf('样本6'));
  assert.ok(firstGroup.indexOf('样本6') < firstGroup.indexOf('样本3'));
  assert.doesNotMatch(html,/FOREIGN_|账号健康|趋势|需要关注/);
});

test('active manual alone is shown with 31 grouped rules, status filtering, and no fabricated evidence', () => {
  const input=fixture(), html=htmlFor(input,{secondary:'review'});
  assert.equal((html.match(/class="review-v13-rule-row"/g)||[]).length,31);
  for (const title of ['选题','放弃选题','标题','正文','读者','自检清单']) assert.ok(html.includes(title),title);
  assert.ok(html.includes('总纲全文')); assert.ok(html.includes('一句证据'));
  assert.doesNotMatch(html,/DRAFT_V2_SECRET|DRAFT_V3_SECRET|DRAFT_RULE|FOREIGN_BOOK|LATER_SECTION_MUST_HIDE|试验/);
  assert.match(html,/class="review-v13-rule-evidence"><\/span>/);
  for (const [key,label] of [['kept','有效/保留'],['hold','观察'],['candidate','待验证'],['trial','试用中'],['dropped','淘汰']]) {
    assert.ok(html.includes(`class="review-v13-status ${key}">${label}</span>`), `missing status ${key}`);
  }
  const filtered=htmlFor(input,{secondary:'review',filters:{range:'all',status:'kept'}});
  assert.equal((filtered.match(/class="review-v13-rule-row"/g)||[]).length,1);
  assert.ok(filtered.includes('ACTIVE_RULE_1')); assert.doesNotMatch(filtered,/ACTIVE_RULE_2(?:\D|$)/);
  assert.match(html,/全部规则/);
  assert.doesNotMatch(html,/全部状态|展开或收起规则/);
  assert.match(html,/ACTIVE_RULE_1 第一行\n第二行\n展开全文/);
});

test('notes and daily summaries sort newest first without foreign or hidden legacy fields', () => {
  const html=htmlFor(fixture(),{secondary:'review'});
  assert.ok(html.indexOf('新笔记') < html.indexOf('旧笔记'));
  assert.ok(html.includes('日报摘要文本'));
  assert.doesNotMatch(html,/FOREIGN_|WEEKLY_MUST_HIDE|LEGACY_NOTES_MUST_HIDE|历史日报 · 只读/);
  assert.equal(reviewRoute('https://haoduoyu.xyz/?page=review&account=V%E5%AD%97').account,account);
});

test('hidden account-health data cannot create a visible panel and untrusted sample markup stays inert', () => {
  const healthOnly=htmlFor({accountHealth:[{id:'h',account,judgement:'限流',action:'SECRET_HEALTH'}]});
  assert.match(healthOnly,/暂无内容复盘数据/);
  assert.doesNotMatch(healthOnly,/账号健康|SECRET_HEALTH|限流/);
  const html=htmlFor({articles:[{id:'x',account,title:'<img src=x onerror=alert(1)>',published_at:'2026-11-01',
    sample_title:'<script>BAD</script>',sample_url:'javascript:alert(1)'}]});
  assert.doesNotMatch(html,/<img|<script>|href="javascript:/);
  assert.match(html,/&lt;img/); assert.match(html,/&lt;script&gt;/);
});
