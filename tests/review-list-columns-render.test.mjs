import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

const data = normalizeReviewData({
  articles:[
    {id:'sample',account:'A',title:'<img src=x onerror=bad()>',published_at:'2026-10-28T00:00:00Z'},
    {id:'tail',account:'A',title:'长尾文章',published_at:'2026-10-27T00:00:00Z'},
    {id:'foreign',account:'B',title:'FOREIGN',published_at:'2026-10-28T00:00:00Z'},
  ],
  snapshots:[
    {id:'sample-near',article_id:'sample',age_hours:23,reads:0,impressions:120,fan_reads:null,ctr:0,avg_read_seconds:65},
    {id:'sample-later',article_id:'sample',age_hours:35,reads:888,impressions:888,fan_reads:888,ctr:88,avg_read_seconds:888},
    {id:'tail-first',article_id:'tail',age_hours:73,reads:12,impressions:20,fan_reads:0,ctr:5,avg_read_seconds:61},
    {id:'tail-later',article_id:'tail',age_hours:100,reads:999,impressions:999,fan_reads:999,ctr:99,avg_read_seconds:999},
    {id:'foreign-snapshot',article_id:'foreign',age_hours:24,reads:7000},
  ]
});
const vm = overrides => ({account:'A',now:'2026-11-02T04:00:00Z',filters:{range:'all'},secondary:'articles',article:'',loading:false,error:'',...overrides});
const render = overrides => renderContentReviewContent(data,vm(overrides));
const table = html => html.match(/<table class="review-table review-articles-table">[\s\S]*?<\/table>/)?.[0] || '';
const row = (html,id) => html.match(new RegExp(`<tr data-review-row="${id}">([\\s\\S]*?)</tr>`))?.[1] || '';
const cell = (html,id,label) => row(html,id).match(new RegExp(`<td data-label="${label}">([\\s\\S]*?)</td>`))?.[1] ?? null;

test('default list retains publication, title, reads and verdict; text stays escaped and scoped', () => {
  const html = render();
  assert.match(html,/data-review-action="toggle-fullscreen" aria-pressed="false">全屏展示/);
  const headers = [...table(html).matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(match => match[1]);
  assert.deepEqual(headers,['发布时间','标题','阅读','判定']);
  assert.match(cell(html,'sample','阅读'),/^0<span[^>]*>发布后 23 小时/);
  assert.match(cell(html,'sample','标题'),/&lt;img src=x onerror=bad\(\)&gt;/);
  assert.doesNotMatch(html,/<img src=x|FOREIGN|7000/);
  assert.match(html,/data-review-column="reads" checked/);
});

test('multiple columns render values from the same observation with true zeros and missing values', () => {
  const html = render({metricColumns:['reads','impressions','fan_reads','ctr','avg_read_seconds','completion_rate']});
  assert.match(html,/review-table-wrap review-columns-wide/);
  assert.equal(cell(html,'sample','展现量'),'120');
  assert.equal(cell(html,'sample','粉丝阅读量'),'—');
  assert.equal(cell(html,'sample','点击率'),'0.0%');
  assert.equal(cell(html,'sample','平均阅读时长'),'1分05秒');
  assert.equal(cell(html,'sample','平均阅读完成率'),'—');
  assert.equal(cell(html,'tail','展现量'),'20');
  assert.equal(cell(html,'tail','粉丝阅读量'),'0');
  assert.equal(cell(html,'tail','平均阅读时长'),'1分01秒');
  assert.match(cell(html,'tail','判定'),/长尾/);
  assert.doesNotMatch(row(html,'tail'),/999/);
});

test('hiding reading preserves verdict and observation age, including an empty metric selection', () => {
  const html = render({metricColumns:['avg_read_seconds']});
  assert.equal(cell(html,'sample','阅读'),null);
  assert.equal(cell(html,'sample','平均阅读时长'),'1分05秒');
  assert.match(cell(html,'sample','判定'),/发布后 23 小时/);
  assert.match(cell(html,'tail','判定'),/长尾[\s\S]*发布后 73 小时/);
  const empty = render({metricColumns:[]});
  assert.deepEqual([...table(empty).matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(match => match[1]),['发布时间','标题','判定']);
  assert.match(cell(empty,'tail','判定'),/长尾[\s\S]*发布后 73 小时/);
});

test('column preferences do not alter the overview metrics or other account data', () => {
  const initial = render();
  const selected = render({metricColumns:['fan_impressions','completion_rate']});
  const overview = html => html.match(/<section class="review-overview-metrics"[\s\S]*?<\/section>/)?.[0];
  assert.equal(overview(initial),overview(selected));
  assert.doesNotMatch(selected,/FOREIGN|7000/);
});
