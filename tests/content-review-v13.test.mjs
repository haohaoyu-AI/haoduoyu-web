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
    {id:'snap-a',article_id:'own-a',snapshot_date:'2026-11-02',age_hours:24,impressions:1100,fan_impressions:100,reads:1000,fan_reads:10,ctr:10,completion_rate:14.71,avg_read_seconds:65},
    {id:'snap-b',article_id:'own-b',snapshot_date:'2026-11-02',age_hours:23,reads:0,ctr:0},
    {id:'snap-old',article_id:'old',snapshot_date:'2026-10-27',age_hours:36,reads:5000,ctr:4},
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
  return card[1].match(/<strong(?:\s[^>]*)?>([\s\S]*?)<\/strong>/)?.[1].replace(/<[^>]+>/g,'').trim();
}
function row(html,id) {
  const match = html.match(new RegExp(`<tr data-review-row="${id}">([\\s\\S]*?)</tr>`));
  assert.ok(match, `missing article ${id}`); return match[1];
}

test('six KPIs follow the selected publication window and isolate accounts', () => {
  const html = htmlFor(fixture());
  assert.equal((html.match(/<article class="review-stat">/g)||[]).length,6);
  assert.match(html,/data-review-filter="metricsRange"/);
  assert.match(html,/<option value="this" selected>/);
  assert.equal(stat(html,'\u53d1\u6587\u6570'),'1\u7bc7');
  assert.equal(stat(html,'\u7206 / \u4e2d / \u6251'),'\u2014 / \u2014 / \u2014');
  assert.equal(stat(html,'\u9605\u8bfb\u4e2d\u4f4d\u6570'),'\u6570\u636e\u672a\u6ee124h');
  assert.doesNotMatch(html,/review-stat-sample/);
  const thisWeek=htmlFor(fixture(),{filters:{range:'all',metricsRange:'this'}});
  assert.match(thisWeek,/<option value="this" selected>/);
  assert.equal(stat(thisWeek,'发文数'),'1篇');
  assert.equal(stat(thisWeek,'爆 / 中 / 扑'),'— / — / —');
  const lastWeek=htmlFor(fixture(),{filters:{range:'all',metricsRange:'last'}});
  assert.match(lastWeek,/<option value="last" selected>/);
  assert.equal(stat(lastWeek,'发文数'),'3篇');
  assert.equal(stat(lastWeek,'爆 / 中 / 扑'),'2 / 0 / 1');
  assert.equal(stat(lastWeek,'CTR 中位数'),'4.0%');
  assert.doesNotMatch(lastWeek,/review-stat-sample/);
  for (const page of [html,thisWeek,lastWeek]) {
    const cards = [...page.matchAll(/<article class="review-stat">([\s\S]*?)<\/article>/g)].map(match => match[1]).join('');
    assert.doesNotMatch(cards,/发布后|review-stat-sample/);
  }
  assert.doesNotMatch(html,/FOREIGN_|HEALTH_MUST_HIDE|关键指标|近 7 天爆文数/);
  const unknown = htmlFor({articles:[{id:'u',account,title:'无观察',published_at:'2026-11-02T03:00:00Z'}]});
  assert.equal(stat(unknown,'阅读中位数'),'数据未满24h');
  assert.equal(stat(unknown,'CTR 中位数'),'数据未满24h');
  assert.equal(stat(unknown,'爆 / 中 / 扑'),'— / — / —');
});

test('statistics range offers only weeks and falls back from old or invalid values', () => {
  const expected = htmlFor(fixture(), {filters:{range:'all',metricsRange:'this'}});
  const select = html => html.match(/<select class="input" data-review-filter="metricsRange">([\s\S]*?)<\/select>/)[1];
  const choices = [...select(expected).matchAll(/<option value="([^"]+)"(?: selected)?>([^<]+)<\/option>/g)].map(m => [m[1],m[2]]);
  assert.deepEqual(choices, [['this','\u672c\u5468'],['last','\u4e0a\u5468']]);
  for (const value of [undefined,'24h','invalid','']) {
    const html = htmlFor(fixture(), {filters:{range:'all',metricsRange:value}});
    assert.equal(select(html), select(expected));
    assert.equal(stat(html,'\u53d1\u6587\u6570'),stat(expected,'\u53d1\u6587\u6570'));
  }
  for (const value of ['last','this','last','this']) {
    const html = htmlFor(fixture(), {filters:{range:'all',metricsRange:value}});
    assert.match(select(html),new RegExp(`<option value="${value}" selected>`));
    assert.equal(stat(html,'\u53d1\u6587\u6570'),value === 'last' ? '3\u7bc7' : '1\u7bc7');
  }
});

test('article list links its references and detail renders recorded traffic fields', () => {
  const input=fixture(), html=htmlFor(input);
  for (const id of ['own-a','own-b','unknown']) assert.equal((row(html,id).match(/<td\b/g)||[]).length,4);
  const a=row(html,'own-a'), b=row(html,'own-b'), u=row(html,'unknown');
  assert.match(a,/review-reference[\s\S]*https:\/\/example\.com\/reference\/0/);
  assert.match(b,/review-reference[\s\S]*https:\/\/example\.com\/fallback/);
  assert.match(b,/data-label="阅读">0<span[^>]*>发布后 23 小时<\/span><\/td>/);
  assert.doesNotMatch(u,/review-reference|review-sample-icon/);
  assert.doesNotMatch(a,/data-label="24h CTR"|FOREIGN_/);
  const detail=htmlFor(input,{article:'own-a'});
  for (const value of ['展现量','粉丝展现量','阅读量','粉丝阅读量','点击率','平均阅读完成率','平均阅读时长','1,100','1,000','100','10.0%','14.7%','1分5秒']) assert.ok(detail.includes(value),value);
  assert.doesNotMatch(detail,/超过.*同类作品/);
});

test('benchmark accounts show current-account features and benchmark library', () => {
  const input=fixture();
  input.benchmarkAccounts[0].topic_focus='TOPIC_FEATURE';
  input.benchmarkAccounts[0].title_patterns=['TITLE_FEATURE'];
  input.benchmarkAccounts[0].structure_notes_md='STRUCTURE_FEATURE';
  const html=htmlFor(input,{secondary:'benchmarks'});
  assert.deepEqual(REVIEW_SECTIONS.map(([id])=>id),['benchmarks','review','trends']);
  assert.equal((html.match(/data-review-secondary=/g)||[]).length,3);
  assert.equal((html.match(/class="review-v13-benchmark-group"/g)||[]).length,3);
  for (const name of names) assert.ok(html.includes(name),name);
  for (const feature of ['TOPIC_FEATURE','TITLE_FEATURE','STRUCTURE_FEATURE']) assert.ok(html.includes(feature));
  assert.match(html,/class="review-benchmark-library"/);
  assert.match(html,/id="review-benchmark-ref-0"/);
  assert.doesNotMatch(html,/FOREIGN_/);
});

test('active manual shows all grouped rules without status controls and with complete text', () => {
  const html=htmlFor(fixture(),{secondary:'review',filters:{range:'all',status:'kept'}});
  assert.equal((html.match(/class="review-v13-rule-row"/g)||[]).length,31);
  assert.match(html,/ACTIVE_RULE_1/);
  assert.match(html,/ACTIVE_RULE_2/);
  assert.match(html,/ACTIVE_RULE_1 [^<]*<\/p><p>[^<]*<\/p><p>[^<]*/);
  assert.doesNotMatch(html,/DRAFT_V2_SECRET|DRAFT_V3_SECRET|DRAFT_RULE|FOREIGN_BOOK|LATER_SECTION_MUST_HIDE|review-v13-status|review-v13-expand|data-review-filter="status"/);
});

test('notes and daily summaries remain hidden', () => {
  const html=htmlFor(fixture(),{secondary:'review'});
  assert.doesNotMatch(html,/review-v13-notes|FOREIGN_|WEEKLY_MUST_HIDE|LEGACY_NOTES_MUST_HIDE/);
  assert.equal(reviewRoute('https://haoduoyu.xyz/?page=review&account=V%E5%AD%97').account,account);
});

test('hidden account-health data cannot create a visible panel and untrusted sample markup stays inert', () => {
  const healthOnly=htmlFor({accountHealth:[{id:'h',account,judgement:'限流',action:'SECRET_HEALTH'}]});
  assert.match(healthOnly,/暂无内容复盘数据/);
  assert.doesNotMatch(healthOnly,/账号健康|SECRET_HEALTH|限流/);
  const html=htmlFor({articles:[{id:'x',account,title:'<img src=x onerror=alert(1)>',published_at:'2026-11-01',
    sample_title:'<script>BAD</script>',sample_url:'javascript:alert(1)'}]});
  assert.doesNotMatch(html,/<img|<script>|href="javascript:/);
  assert.match(html,/&lt;img/); assert.match(html,/&lt;script&gt;BAD&lt;\/script&gt;/);
});
