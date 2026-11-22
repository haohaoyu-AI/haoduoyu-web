import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
import {articlePatternDimensions, articlePatternGroups} from '../web/pages/review-article-list.mjs';

const headline = '标题归类', writing = '正文结构';
const available = [writing,'写作风格',headline];
const account = 'V字', published_at = '2026-11-16T01:00:00Z';
const fixture = normalizeReviewData({
  articles:[
    {id:'sample',account,title:'<合成>数字标题 & 剧情',published_at,
      sample_title:'合成参考文章',topic_category:'旧分类',title_pattern:'旧套路',playbook_version_used:2},
    {id:'unclassified',account,title:'另一篇文章',published_at},
    {id:'draft',account,title:'草稿标题',draft_saved_at:'2026-11-16T06:00:00Z',publish_status:'pending'},
    {id:'unmatched',account,title:'待核对标题',published_at,publish_status:'unmatched'},
    {id:'foreign',account:'other',title:'FOREIGN',published_at},
  ],
  notes:[{id:'note',account,kind:'article_note',title:'合成备注',related_article_ids:['sample']}],
  snapshots:[
    {id:'sample-24h',article_id:'sample',snapshot_date:'2026-11-17',age_hours:24,reads:0,impressions:12500,ctr:0,completion_rate:60},
    {id:'sample-later',article_id:'sample',snapshot_date:'2026-11-18',age_hours:48,reads:888,ctr:18,completion_rate:83},
    {id:'unmatched-24h',article_id:'unmatched',age_hours:24,reads:9999},
  ]
});
const tags = {dimensions:available,tags:{sample:{[headline]:'数字对照',[writing]:'先抛问题'}}};
const render = (filters = {},overrides = {}) => renderContentReviewContent(fixture,{
  account,secondary:'articles',now:'2026-11-20T01:00:00Z',filters:{range:'all',...filters},tags,...overrides
});
const row = (html,id) => html.match(new RegExp(`<tr data-review-row="${id}">([\\s\\S]*?)</tr>`))?.[1] || '';
const cell = (html,id,label) => row(html,id).match(new RegExp(`<td data-label="${label}"[^>]*>([\\s\\S]*?)</td>`))?.[1];

test('fixed table renders published rows with all seven metrics, keeping pending and unmatched records outside', () => {
  const html = render();
  const headers = [...html.matchAll(/<th scope="col" class="review-cell-([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(headers,['published','reads','ctr','completion_rate','avg_read_seconds']);
  const fullHtml = render({}, {filters:{group:'@table',range:'all',density:'full'}});
  const fullHeaders = [...fullHtml.matchAll(/<th scope="col" class="review-cell-([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(fullHeaders,['published','reads','ctr','completion_rate','avg_read_seconds','impressions','fan_reads','fan_impressions']);
  assert.match(html,/review-article-drafts" data-review-keep-open="drafts"><summary>草稿箱 1 篇/);
  assert.match(html,/<time>11-16 周一 14:00<\/time>.*data-review-article="draft"/);
  assert.match(html,/未能对上 1 篇/);
  for (const id of ['draft','unmatched','foreign']) assert.equal(row(html,id),'',id);
  const sampleIdentity = cell(html,'sample','文章');
  assert.match(sampleIdentity,/title="&lt;合成&gt;数字标题 &amp; 剧情"/);
  assert.match(sampleIdentity,/data-review-dimension="标题归类"[^>]*>数字对照<\/button>/);
  assert.match(sampleIdentity,/data-review-dimension="正文结构"[^>]*>先抛问题<\/button>/);
  assert.doesNotMatch(cell(html,'unclassified','文章'),/data-review-pattern=/);
  assert.match(cell(html,'sample','24h 阅读'),/>0</);
  assert.equal(cell(fullHtml,'sample','展现量'),'1.3 万');
  assert.equal(cell(html,'sample','点击率'),'0.0%');
  assert.equal(cell(html,'sample','完读率'),'60.0%');
  assert.equal(cell(html,'sample','阅读时长'),'—');
  assert.equal(cell(fullHtml,'sample','粉丝阅读'),'—');
  assert.equal(cell(fullHtml,'sample','粉丝展现'),'—');
  assert.doesNotMatch(html,/负载|FOREIGN|旧分类|旧套路|9999/);
  assert.match(render({}, {article:'draft'}),/<h2 id="review-detail-title">草稿标题<\/h2>/);
});

test('read-only dimensions are resolved from payload and grouped counts reflect all filters', () => {
  assert.deepEqual(articlePatternDimensions(tags),[headline,writing]);
  const html = render({group:headline,query:' 剧情 ',verdict:'扑',pattern:{dimension:writing,name:'先抛问题'}});
  assert.match(html,/data-review-view="标题归类" aria-pressed="true">标题套路/);
  assert.match(html,/data-review-view="正文结构" aria-pressed="false">文章套路/);
  assert.match(html,/data-review-pattern-clear/);
  assert.match(html,/review-article-group" data-review-keep-open="[^"]+"><summary>/);
  assert.match(html,/数字对照[\s\S]*样本少/);
  assert.match(html,/<dt>爆率<\/dt><dd>0\.0%<\/dd>/);
  assert.match(html,/<dt>阅读中位<\/dt><dd>0<\/dd>/);
  assert.doesNotMatch(html,/<dt>展现中位<\/dt>/);
  assert.match(render({group:headline,query:' 剧情 ',verdict:'扑',pattern:{dimension:writing,name:'先抛问题'},density:'full'}),/<dt>展现中位<\/dt><dd>1\.3 万<\/dd>/);
  assert.equal(row(html,'unclassified'),'');
  assert.doesNotMatch(html,/review-week-summary|未分类/);
  assert.match(render({group:writing}),/先抛问题[\s\S]*样本少/);
});

test('pattern groups prioritize sample size, hit rate and reads, with fallback groups last', () => {
  const rows = [], values = {};
  for (const [name,verdicts,reads] of [
    ['小而全爆',['爆'],[99999]], ['样本齐',['爆','扑','中',null,null],[100,300,200,null,null]],
    ['并列较高',['爆','扑','中',null,null],[200,400,300,null,null]], ['零爆',['中'],[100]],
    ['其他',['爆','爆','爆','爆','爆'],[100,100,100,100,100]], ['', ['爆'],[100]]
  ]) for (const [i,verdict] of verdicts.entries()) {
    const id = name + i;
    rows.push({id,verdict,reads_24h:reads[i],ctr_24h:i === 0 ? 0 : 10});
    if (name) values[id] = {[headline]:name};
  }
  const groups = articlePatternGroups(rows,{tags:values},headline);
  assert.deepEqual(groups.map(group => group.name),['并列较高','样本齐','小而全爆','零爆','其他','未分类']);
  assert.deepEqual(groups[1].counts,[1,1,1]);
  assert.equal(groups[1].hitRate,100/3);
  assert.equal(groups[1].reads,200);
  assert.equal(groups[1].ctr,10);
});

test('explicit sorting removes the week headings and sets only the active aria-sort', () => {
  const html = render({sort:{key:'ctr',direction:'ascending'}});
  assert.doesNotMatch(html,/review-week-summary/);
  assert.equal((html.match(/aria-sort=/g) || []).length,1);
  assert.match(html,/class="review-cell-ctr" aria-sort="ascending"/);
});

test('drawer orders traffic, verdict, patterns, reference, remarks and non-empty legacy fields, with AI 诊断 retired', () => {
  const html = render({}, {article:'sample'}).split('class="review-drawer-overlay"')[1];
  const order = ['review-detail-title','review-traffic-card','review-verdict-basis','review-detail-patterns',
    'review-imitation','review-remarks','review-article-legacy'];
  assert.doesNotMatch(html,/review-diagnosis|AI诊断/);
  let previous = -1;
  for (const name of order) {
    const at = html.indexOf(name);
    assert.ok(at > previous,name);
    previous = at;
  }
  assert.match(html,/展现量<\/dt><dd>—<\/dd>/);
  assert.match(html,/旧分类.*旧套路.*手册版本/);
  assert.doesNotMatch(render({}, {article:'unclassified'}),/review-article-legacy/);
});
