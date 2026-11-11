import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent,renderReviewMarkdown,safeReviewUrl,reviewNumber,REVIEW_VIEWS} from '../web/pages/content-review.mjs';
import {readReviewCollection,readContentReviewData,readContentReviewDataWithRetry,reviewRoute} from '../web/review-controller.mjs';

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

test('legacy view URLs render an accurate empty state and preserve numeric formatting',() => {
  assert.deepEqual(REVIEW_VIEWS.map(([id]) => id),['overview','articles','playbook']);
  for (const [view] of REVIEW_VIEWS) {
    const html = renderContentReviewContent(normalizeReviewData(),model(view));
    assert.match(html,/暂无内容复盘数据/);
    assert.doesNotMatch(html,/class="review-stat"|<svg|style=/);
    assert.equal((html.match(/role="tab" /g) || []).length,6);
  }
  assert.equal(reviewNumber(null),'—');
  assert.equal(reviewNumber(0),'0');
  assert.equal(reviewNumber(0,'ctr'),'0.0%');
  assert.equal(reviewNumber(12000),'1.2 万');
});

test('overview shows six metrics and only supported secondary sections',() => {
  const html = renderContentReviewContent(fixture(),{...model(),secondary:'cockpit'});
  assert.equal((html.match(/class="review-stat"/g) || []).length,6);
  assert.doesNotMatch(html,/文章列表/);
  assert.match(renderContentReviewContent(fixture(),model('articles')),/文章列表/);
  assert.equal((html.match(/role="tab" /g) || []).length,6);
  assert.match(html,/<svg/);
  assert.doesNotMatch(html,/第一句结论|第二句不应|data-review-view="daily"|review-alerts/);
});

test('article library escapes titles and distinguishes zeros from missing observations',() => {
  const html = renderContentReviewContent(fixture(),{...model('articles'),metricColumns:['reads','ctr']});
  assert.doesNotMatch(html,/<img|href="javascript:|<[^>]+\sonerror=/);
  assert.match(html,/&lt;img/);
  const a=html.match(/<tr data-review-row="a">([\s\S]*?)<\/tr>/)[1];
  const b=html.match(/<tr data-review-row="b">([\s\S]*?)<\/tr>/)[1];
  assert.match(a,/data-label="阅读">0<span[^>]*>发布后 24 小时<\/span><\/td>/);
  assert.match(a,/data-label="点击率">0\.0%<\/td>/);
  assert.match(b,/data-label="阅读">—<\/td>/);
  assert.doesNotMatch(b,/>13(?:<|\.)/);
  assert.ok(html.indexOf('data-review-row="a"') < html.indexOf('data-review-row="b"'));
});

test('drawer shows one recorded traffic snapshot and safe original links',() => {
  const data = fixture(), html = renderContentReviewContent(data,{...model('articles'),article:'a'});
  assert.match(html,/role="dialog" aria-modal="true"/);
  assert.match(html,/class="review-body" inert/);
  assert.match(html,/数据日期 2026-10-30/);
  assert.match(html,/阅读量<\/dt><dd>0<\/dd>/);
  assert.doesNotMatch(html,/<img|href="javascript:|Exact applied rule|\[object Object\]/);
  const missing = renderContentReviewContent(data,{...model('articles'),article:'b'});
  assert.match(missing,/href="https:\/\/example\.com\/article"/);
  assert.match(missing,/阅读量<\/dt><dd>13<\/dd>/);
});

test('article details do not expose hidden rule IDs or interpret markup',() => {
  const data = normalizeReviewData({articles:[
    {id:'unknown-rules',account,title:'Unknown rules',published_at:'2026-10-29',applied_rule_ids:null},
    {id:'empty-rules',account,title:'Recorded empty rules',published_at:'2026-10-29',applied_rule_ids:[]},
    {id:'unresolved-rules',account,title:'Recorded unresolved rules',published_at:'2026-10-29',applied_rule_ids:['unresolved-1','<unresolved-2>']}
  ]});
  for (const id of ['unknown-rules','empty-rules','unresolved-rules']) {
    const html=renderContentReviewContent(data,{...model('articles'),article:id});
    assert.match(html,/role="dialog" aria-modal="true"/);
    assert.doesNotMatch(html,/unresolved-1|<unresolved-2>|data-label="命中规则"/);
  }
});

test('active manual presents grouped rules without draft or status controls',() => {
  const data=fixture();
  data.playbooks[0].status='active'; data.playbooks[1].status='draft';
  const html=renderContentReviewContent(data,{...model('playbook'),secondary:'review'});
  for (const label of ['选题','放弃选题','标题','正文','读者','自检清单']) assert.ok(html.includes(label),label);
  assert.match(html,/Exact applied rule/);
  assert.doesNotMatch(html,/Old rule|option value="trial"|data-review-action="save|<form/);
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

test('read sets reject mixed revisions and orphan snapshots, and filter another account',async () => {
  await assert.rejects(() => readContentReviewData(async path => ({items:[],has_more:false,read_revision:path.includes('/reports?') ? 2 : 1}),account),{code:'READ_REVISION_CHANGED'});
  const filtered = await readReviewCollection(async () => ({items:[{id:'x',account:'other'}],has_more:false,read_revision:1}),'articles',account);
  assert.deepEqual(filtered.items,[]);
  assert.ok(filtered.foreignIds.has('x'));
  await assert.rejects(() => readContentReviewData(async path => ({items:path.includes('/snapshots?') ? [{id:'orphan',article_id:'missing'}] : [],has_more:false,read_revision:1}),account),{code:'READ_REVISION_CHANGED'});
});

test('server revision conflict retries all pages once, then stops on another conflict',async () => {
  const rows = Array.from({length:100},(_,i) => ({id:String(i),account}));
  let firstPages = 0, failPages = 0;
  const read = async path => {
    if (!path.includes('/articles?')) return {items:[],has_more:false,read_revision:1};
    if (path.includes('offset=0')) { firstPages++; return {items:rows,has_more:true,read_revision:1}; }
    if (failPages++ === 0) throw Object.assign(new Error('changed'),{code:'READ_REVISION_CHANGED',status:409});
    return {items:[],has_more:false,read_revision:1};
  };
  assert.equal((await readContentReviewDataWithRetry(read,account)).articles.length,100);
  assert.equal(firstPages,2);
  firstPages = 0;
  await assert.rejects(() => readContentReviewDataWithRetry(async path => {
    if (!path.includes('/articles?')) return {items:[],has_more:false,read_revision:1};
    if (path.includes('offset=0')) { firstPages++; return {items:rows,has_more:true,read_revision:1}; }
    throw Object.assign(new Error('changed'),{code:'READ_REVISION_CHANGED',status:409});
  },account),{code:'READ_REVISION_CHANGED'});
  assert.equal(firstPages,2);
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


test('references stay visible while health and draft data remain hidden',() => {
  const data=fixture();
  data.articles[0].reference_article_id='ref'; data.articles[1].sample_title='样本标题'; data.articles[1].sample_url='https://example.com/legacy';
  data.benchmarkArticles=[{id:'ref',account,benchmark_account_id:'ba',title:'参考标题',url:'https://example.com/ref',reads:12000}];
  data.benchmarkAccounts=[{id:'ba',account,name:'作者',profile_url:'https://example.com/author'}];
  data.accountHealth=[{id:'h',account,judgement:'限流',action:'HIDDEN_HEALTH_ACTION'}];
  data.playbooks=[{id:'draft',account,version:2,status:'draft',content_md:'DRAFT_SECRET',rules:[]},
    {id:'active',account,version:1,status:'active',content_md:'ACTIVE_MANUAL',rules:[]}];
  const html=renderContentReviewContent(data,{...model(),secondary:'articles'});
  assert.match(html,/参考标题/); assert.match(html,/样本标题/);
  assert.doesNotMatch(html,/HIDDEN_HEALTH_ACTION|DRAFT_SECRET/);
  const book=renderContentReviewContent(data,{...model(),secondary:'review'});
  assert.match(book,/ACTIVE_MANUAL/); assert.doesNotMatch(book,/DRAFT_SECRET/);
});

test('unknown references and untrusted sample URLs remain inert; hidden notes stay hidden',() => {
  const data=fixture(); data.articles[0].reference_article_id='missing'; data.articles[0].sample_title=null; data.articles[0].sample_url=null;
  data.articles[1].sample_title='<unsafe>'; data.articles[1].sample_url='javascript:alert(1)';
  data.notes=[{id:'n',account,title:'<script>',body_md:'<img src=x>'}];
  const html=renderContentReviewContent(data,{...model(),secondary:'articles'});
  assert.match(html,/&lt;unsafe&gt;/);
  assert.doesNotMatch(html,/<script>|<img|href="javascript:|&lt;script&gt;|&lt;img src=x&gt;/);
});

test('legacy daily report and its nested fields remain hidden',() => {
  const data=fixture();
  data.reports.push({id:'old',account,period_type:'daily',period_end:'2026-10-31',summary_md:'HIDDEN_SUMMARY',metrics:{
    reads:42,notes_md:'HIDDEN_NOTES',benchmark_accounts:[{name:'HIDDEN_BENCHMARK'}],account_health:{notice:'HIDDEN_HEALTH'}
  }});
  const html=renderContentReviewContent(data,{...model(),secondary:'notes'});
  assert.doesNotMatch(html,/HIDDEN_SUMMARY|HIDDEN_NOTES|HIDDEN_BENCHMARK|HIDDEN_HEALTH|review-health-badge/);
});

test('new and migrated notes and health remain hidden from current review',() => {
  const data=fixture();
  data.reports.push({id:'old',account,period_type:'daily',period_end:'2026-10-31',summary_md:'HIDDEN_REPORT',
    metrics:{notes_md:'HIDDEN_LEGACY_NOTE',benchmark_accounts:[{name:'HIDDEN_LEGACY_BENCHMARK'}],account_health:{notice:'HIDDEN_LEGACY_HEALTH'}}});
  data.notes=[{id:'n',account,title:'HIDDEN_NEW_NOTE',body_md:'HIDDEN_BODY'}];
  data.accountHealth=[{id:'h',account,judgement:'normal',action:'HIDDEN_ACTION'}];
  const html=renderContentReviewContent(data,{...model(),secondary:'notes'});
  assert.doesNotMatch(html,/HIDDEN_REPORT|HIDDEN_LEGACY_NOTE|HIDDEN_LEGACY_BENCHMARK|HIDDEN_LEGACY_HEALTH|HIDDEN_NEW_NOTE|HIDDEN_BODY|HIDDEN_ACTION|review-health-badge/);
});
