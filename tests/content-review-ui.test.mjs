import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent,renderReviewMarkdown,safeReviewUrl,reviewNumber,REVIEW_VIEWS} from '../web/pages/content-review.mjs';
import {readReviewCollection,readContentReviewData,reviewRoute} from '../web/review-controller.mjs';

const account = 'synthetic';
const fixture = () => normalizeReviewData({
  articles:[{id:'a',account,title:'<img src=x onerror=alert(1)>',published_at:'2026-10-29',url:'javascript:alert(1)',playbook_version_used:2,applied_rule_ids:['r-1']},
    {id:'b',account,title:'Missing age sample',published_at:'2026-10-28',url:'https://example.com/article'}],
  snapshots:[{id:'s',article_id:'a',snapshot_date:'2026-10-30',age_hours:24,reads:0,ctr:0,completion_rate:30},
    {id:'older',article_id:'a',snapshot_date:'2026-10-29',age_hours:12,reads:0,ctr:5},
    {id:'missing-age',article_id:'b',snapshot_date:'2026-10-29',reads:13,ctr:2}],
  reports:[{id:'r',account,period_type:'weekly',period_start:'2026-10-26',period_end:'2026-11-01',summary_md:'第一句结论。第二句不应出现在概览。'}],
  playbooks:[{id:'p2',account,version:2,published_on:'2026-10-29',content_md:'## 当前原则\n先核实事实，再形成判断。其余正文。',rules:[{rule_id:'r-1',section:'title',text:'Exact applied rule',status:'kept',evidence:{metric:'ctr',n_with:9,n_without:13,with_median:8.2,without_median:0},trials:0}]},
    {id:'p1',account,version:1,published_on:'2026-10-28',content_md:'Historical text.',rules:[{rule_id:'r-1',section:'title',text:'Old rule'}]}]
});
const model = (view = 'overview') => ({account,view,week:'this',now:'2026-10-30T12:00:00Z',filters:{},article:'',version:'',loading:false,error:''});

test('three views render accurate empty states and preserve null, zero and percentage formatting',() => {
  assert.deepEqual(REVIEW_VIEWS.map(([id]) => id),['overview','articles','playbook']);
  for (const [view] of REVIEW_VIEWS) {
    const html = renderContentReviewContent(normalizeReviewData(),model(view));
    assert.match(html,/暂无内容复盘数据/);
    assert.doesNotMatch(html,/class="review-stat"|<svg|style=/);
    assert.equal((html.match(/role="tab" /g) || []).length,3);
  }
  assert.equal(reviewNumber(null),'—');
  assert.equal(reviewNumber(0),'0');
  assert.equal(reviewNumber(0,'ctr'),'0.0%');
  assert.equal(reviewNumber(12000),'1.2 万');
});

test('overview has five metric cards, 30-day trend, weekly first sentence and issue-only alerts',() => {
  const html = renderContentReviewContent(fixture(),model());
  assert.equal((html.match(/class="review-stat"/g) || []).length,5);
  assert.match(html,/近 30 天趋势/);
  assert.match(html,/2026-10-26 — 2026-11-01/);
  assert.match(html,/第一句结论。/);
  assert.doesNotMatch(html,/第二句不应|data-review-view="daily"|data-review-view="weekly"|data-review-view="three_day"/);
  assert.match(html,/24h 数据缺失/);
  assert.match(html,/仿对标爆文/);
  assert.match(html,/文章列表/);
  const healthy = fixture(); healthy.articles = healthy.articles.slice(0,1); healthy.snapshots = healthy.snapshots.filter(s => s.article_id === 'a');
  assert.doesNotMatch(renderContentReviewContent(healthy,model()),/需要关注/);
  healthy.reports = [];
  assert.match(renderContentReviewContent(healthy,model()),/本周尚未生成周报/);
});

test('article library escapes titles, preserves true zeros, and keeps unqualified raw values out of 24h columns',() => {
  const html = renderContentReviewContent(fixture(),model('articles'));
  assert.doesNotMatch(html,/<img|href="javascript:|<[^>]+\sonerror=|\sstyle=/);
  assert.match(html,/&lt;img/);
  assert.match(html,/data-label="24h 阅读">0<\/td>/);
  assert.match(html,/data-label="24h CTR">0.0%<\/td>/);
  assert.match(html,/暂无 24h 样本/);
  assert.match(html,/样本不足，仅供参考/);
  assert.match(html,/data-label="24h 阅读">—<\/td>/);
  assert.ok(html.indexOf('data-review-row="a"') < html.indexOf('data-review-row="b"'));
});

test('drawer retains ordered snapshots, exact applied rule text, raw fields and safe original URL',() => {
  const data = fixture(), html = renderContentReviewContent(data,{...model('articles'),article:'a'});
  assert.match(html,/role="dialog" aria-modal="true"/);
  assert.match(html,/id="review-tabpanel"[^>]* inert/);
  assert.match(html,/Exact applied rule/);
  assert.match(html,/全部原始字段/);
  assert.match(html,/快照年龄 24h/);
  assert.ok(html.indexOf('<h4>2026-10-29') < html.indexOf('<h4>2026-10-30'));
  assert.doesNotMatch(html,/\[object Object\]|href="javascript/);
  const missing = renderContentReviewContent(data,{...model('articles'),article:'b'});
  assert.match(missing,/暂无 24h 样本，以下保留原始采集数据/);
  assert.match(missing,/&quot;reads&quot;: 13/);
  assert.match(missing,/href="https:\/\/example.com\/article"/);
});

test('article rule counts distinguish unknown IDs, recorded empty IDs and unresolved recorded IDs',() => {
  const data = normalizeReviewData({articles:[
    {id:'unknown-rules',account,title:'Unknown rules',published_at:'2026-10-29',applied_rule_ids:null},
    {id:'empty-rules',account,title:'Recorded empty rules',published_at:'2026-10-29',applied_rule_ids:[]},
    {id:'unresolved-rules',account,title:'Recorded unresolved rules',published_at:'2026-10-29',applied_rule_ids:['unresolved-1','unresolved-2']}
  ]});
  const html = renderContentReviewContent(data,model('articles'));
  for (const [id,count] of [['unknown-rules','—'],['empty-rules','0'],['unresolved-rules','2']]) {
    const row = html.match(new RegExp(`<tr data-review-row="${id}">([\\s\\S]*?)</tr>`))?.[1];
    assert.ok(row,`Expected article row ${id}`);
    assert.ok(row.includes(`data-label="命中规则">${count}</td>`));
  }
  assert.match(html,/>总览<\/button>/); assert.match(html,/>文章库<\/button>/);
});

test('playbook has six sections, the five status filter choices and read-only historical versions',() => {
  const html = renderContentReviewContent(fixture(),model('playbook'));
  for (const label of ['保留选题','放弃选题','标题','正文','读者','发布检查']) assert.match(html,new RegExp(`<h2>${label}</h2>`));
  for (const status of ['candidate','trial','kept','dropped','hold']) assert.match(html,new RegExp(`option value="${status}"`));
  assert.match(html,/Exact applied rule/); assert.match(html,/命中 9 篇，CTR 8.2%；未命中 13 篇，CTR 0.0%/);
  assert.doesNotMatch(html,/with_median|n_without/);
  assert.match(html,/历史版本 · 1 版/); assert.match(html,/只读/);
  assert.doesNotMatch(html,/data-review-action="save|<form/);
  assert.doesNotMatch(renderContentReviewContent(fixture(),{...model('playbook'),filters:{status:'trial'}}),/Exact applied rule/);
});

test('Markdown permits safe formatting and HTTP links while escaping HTML and blocking URL schemes',() => {
  const html = renderReviewMarkdown('## 标题\n<script>alert(1)</script>\n[安全](https://example.com/a?q=1&b=2)\n[危险](javascript:alert(1))\n**强调**\n- 项目');
  assert.match(html,/<h3>标题<\/h3>/); assert.match(html,/&lt;script&gt;/);
  assert.match(html,/rel="noopener noreferrer"/); assert.doesNotMatch(html,/href="javascript|<script/);
  assert.equal(safeReviewUrl('data:text/html,x'),''); assert.equal(safeReviewUrl('//evil.test'),'');
});

test('pagination uses fixed pages and pins the subsequent page revision',async () => {
  const paths = [], first = Array.from({length:100},(_,i) => ({id:String(i),account}));
  const result = await readReviewCollection(async path => { paths.push(path); return paths.length === 1 ? {items:first,has_more:true,read_revision:7} : {items:[{id:'last',account}],has_more:false,read_revision:7}; },'articles',account);
  assert.equal(result.items.length,101); assert.match(paths[1],/offset=100&read_revision=7$/); assert.doesNotMatch(paths[0],/limit=/);
  await assert.rejects(() => readReviewCollection(async () => ({items:[{id:'a',account}],has_more:true,read_revision:7}),'articles',account));
});

test('four-resource read sets reject mixed revisions, orphan snapshots and another account',async () => {
  await assert.rejects(() => readContentReviewData(async path => ({items:[],has_more:false,read_revision:path.includes('/reports?') ? 2 : 1}),account),{code:'REVIEW_READ_CHANGED'});
  await assert.rejects(() => readReviewCollection(async () => ({items:[{id:'x',account:'other'}],has_more:false,read_revision:1}),'articles',account));
  await assert.rejects(() => readContentReviewData(async path => ({items:path.includes('/snapshots?') ? [{id:'orphan',article_id:'missing'}] : [],has_more:false,read_revision:1}),account),{code:'REVIEW_READ_CHANGED'});
});

test('article library and drawer show true Shanghai time and filters exclude unknown dates',() => {
  const data = fixture(); data.articles[0].published_at = '2026-10-26T20:05:00Z';
  data.articles.push({id:'unknown',account,title:'unknown publication',published_at:null});
  const html = renderContentReviewContent(data,{...model('articles'),article:'a',filters:{range:'all',from:'2026-10-27',to:'2026-10-27'}});
  assert.match(html,/2026-10-27 04:05/); assert.doesNotMatch(html,/2026-10-26 20:05/);
  assert.match(html,/data-review-row="a"/); assert.doesNotMatch(html,/data-review-row="unknown"/);
  const excluded = renderContentReviewContent(data,{...model('articles'),filters:{range:'all',to:'2026-10-26'}});
  assert.doesNotMatch(excluded,/data-review-row="a"|data-review-row="unknown"/);
});

test('new tab URLs take priority and old review views map to the three-view navigation',() => {
  assert.equal(reviewRoute('https://example.test/?tab=articles&review_view=weekly').view,'articles');
  assert.equal(reviewRoute('https://example.test/?review_view=playbooks').view,'playbook');
  for (const view of ['daily','three_day','weekly','invalid']) assert.equal(reviewRoute(`https://example.test/?review_view=${view}`).view,'overview');
  assert.equal(reviewRoute('https://example.test/').view,'overview');
});


test('new records show references, all health states and legacy draft without selecting it as current',() => {
  const data = fixture();
  data.articles[0].reference_article_id = 'ref'; data.articles[1].sample_title = '旧样本'; data.articles[1].sample_url = 'https://example.com/legacy';
  data.benchmarkArticles = [{id:'ref',title:'参考标题',url:'https://example.com/ref',reads:12000}];
  data.benchmarkAccounts = [{id:'ba',account,name:'档案',profile_url:'https://example.com/author'}];
  data.notes = [{id:'n',account,title:'笔记',body_md:'**证据**'}];
  data.accountHealth = ['normal','限流','降权','封禁'].map((judgement,i) => ({id:String(i),account,observed_on:`2026-10-2${i}`,judgement}));
  data.playbooks = [{id:'8f553af0-302a-45fb-9fde-16d6d537c888',account,version:2,status:'draft',published_on:'2026-10-30',content_md:'草稿内容',rules:[],sent_to_gemini_at:null},
    {id:'p1',account,version:1,status:'active',published_on:'2026-10-29',content_md:'有效内容',rules:[],sent_to_gemini_at:'2026-10-29T00:00:00Z'}];
  const html = renderContentReviewContent(data,model());
  assert.match(html,/仿：参考标题（1.2 万）/); assert.match(html,/仿：旧样本/); assert.match(html,/2 \/ 2<small>篇/);
  for (const value of ['正常','限流','降权','封禁','档案','笔记']) assert.ok(html.includes(value));
  assert.match(html,/当前手册<\/span><h2>1<\/h2>/); assert.match(html,/草稿·未发送/);
  assert.match(html,/<details class="review-panel review-extra"/);
});

test('unknown reference stays visibly missing, and untrusted sample URLs and notes are escaped',() => {
  const data = fixture(); data.articles[0].reference_article_id = 'missing'; data.articles[0].sample_title = null; data.articles[0].sample_url = null;
  data.articles[1].sample_title = '<unsafe>'; data.articles[1].sample_url = 'javascript:alert(1)';
  data.notes = [{id:'n',account,title:'<script>',body_md:'<img src=x>'}];
  const html = renderContentReviewContent(data,model());
  assert.match(html,/无样本/); assert.match(html,/仿：&lt;unsafe&gt;/); assert.doesNotMatch(html,/<script>|<img|href="javascript/);
});

test('legacy daily metrics remain visible as attributed read-only material without inferring another account health',() => {
  const data = fixture();
  data.reports.push({id:'old',account,period_type:'daily',period_end:'2026-10-31',metrics:{
    notes_md:'历史笔记 **事实**',
    benchmark_accounts:[{name:'历史对标号',platform:'toutiao',fans:'10万',profile_url:null,top_articles:[['历史爆文',12345]]}],
    account_health:{account:'另一个账号',judgement:'限流/降权',impressions_per_day:400,reads_per_day:20,ctr_lt:2,since:'2026-10-28',notice:'平台通知',action:'观察'}
  }});
  const html = renderContentReviewContent(data,model());
  assert.match(html,/历史笔记/); assert.match(html,/历史对标号/); assert.match(html,/历史爆文/);
  assert.match(html,/历史日报 2026-10-31 · 只读/);
  assert.match(html,/观察对象：另一个账号 · 原始判断：限流\/降权/);
  assert.match(html,/<button class="review-health-badge"[^>]*>未记录<\/button>/);
  assert.doesNotMatch(html,/<button class="review-health-badge"[^>]*>限流/);
});

test('new records and attributed historical material remain visible together',() => {
  const data = fixture(); data.reports.push({id:'old',account,period_end:'2026-10-31',metrics:{notes_md:'历史笔记',benchmark_accounts:[{name:'历史对标号',top_articles:[['历史爆文',5]]}],account_health:{account:'另一个账号',judgement:'限流/降权'}}});
  data.notes = [{id:'n',account,title:'新笔记',body_md:'新内容'}]; data.accountHealth = [{id:'h',account,observed_on:'2026-10-31',judgement:'normal'}];
  const html = renderContentReviewContent(data,model());
  assert.match(html,/新笔记/); assert.match(html,/历史笔记/); assert.match(html,/观察对象：另一个账号 · 原始判断：限流\/降权/);
  assert.match(html,/历史对标号/); assert.match(html,/历史爆文/);
  assert.match(html,/<button class="review-health-badge"[^>]*>正常<\/button>/);
});
