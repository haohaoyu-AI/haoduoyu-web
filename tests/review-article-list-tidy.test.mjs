import test from 'node:test';
import assert from 'node:assert/strict';
import {renderArticleList, articleDensity} from '../web/pages/review-article-list.mjs';

const article = {id:'a1',account:'V字',title:'合成文章',published_at:'2026-11-18T03:00:00Z',publish_status:'published',verdict:'中'};
const snapshots = [
  {id:'s24',article_id:'a1',snapshot_date:'2026-11-19',age_hours:24,reads:500,ctr:6,impressions:8000,completion_rate:null,avg_read_seconds:null},
  {id:'s70',article_id:'a1',snapshot_date:'2026-11-21',age_hours:70,reads:900,ctr:5,impressions:12000,completion_rate:21.5,avg_read_seconds:130},
];
const withSample = (row,list) => ({...row,sample24h:list[0],reads_24h:list[0].reads});
const vm = filters => ({now:'2026-11-21T10:00:00Z',filters:{range:'all',...filters},tags:null});
const cell = (html,label) => html.match(new RegExp(`<td data-label="${label}"[^>]*>([\\s\\S]*?)</td>`))?.[1];

test('compact shows four metrics; full adds the other three; unknown density falls back to compact', () => {
  const heads = html => [...html.matchAll(/<th scope="col" class="review-cell-([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(heads(renderArticleList([article],vm({}),snapshots,'')),['published','reads','ctr','completion_rate','avg_read_seconds']);
  assert.equal(heads(renderArticleList([article],vm({density:'full'}),snapshots,'')).length,8);
  assert.equal(articleDensity('wide'),'compact');
});

test('reads and click rate stay on the 24h observation; completion and read time fall back to the latest collection', () => {
  const html = renderArticleList([withSample(article,snapshots)],vm({}),snapshots,'');
  assert.match(cell(html,'24h 阅读'),/500/);
  assert.equal(cell(html,'点击率'),'6.0%');
  assert.match(cell(html,'完读率'),/review-latest-value[^>]*发布后 70 小时[^>]*>21\.5%</);
  assert.match(cell(html,'阅读时长'),/review-latest-value/);
  assert.match(html,/完读中位 <b>21\.5%<\/b>/);
});

test('24h values win when the 24h observation already has them', () => {
  const own = snapshots.map(s => s.id === 's24' ? {...s,completion_rate:18,avg_read_seconds:100} : s);
  const html = renderArticleList([withSample(article,own)],vm({}),own,'');
  assert.equal(cell(html,'完读率'),'18.0%');
});
