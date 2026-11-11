import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTrafficCard} from '../web/pages/review-traffic-card.mjs';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

test('traffic card shows one latest article snapshot with real zeroes and missing values', () => {
  const html = renderTrafficCard([
    {article_id:'a', snapshot_date:'2026-10-01', impressions:100, fan_impressions:70, reads:80, fan_reads:30, ctr:8, completion_rate:50, avg_read_seconds:120},
    {article_id:'b', snapshot_date:'2026-10-03', impressions:9999, reads:9999},
    {article_id:'a', snapshot_date:'2026-10-02', impressions:0, fan_impressions:null, reads:42, fan_reads:0, ctr:0, completion_rate:72.25, avg_read_seconds:65},
  ], 'a');
  assert.match(html, /数据日期 2026-10-02/);
  assert.match(html, /展现量<\/dt><dd>0<\/dd>/);
  assert.match(html, /粉丝展现量 <span>—<\/span>/);
  assert.match(html, /阅读量<\/dt><dd>42<\/dd>/);
  assert.match(html, /粉丝阅读量 <span>0<\/span>/);
  assert.match(html, /点击率<\/dt><dd>0\.0%<\/dd>/);
  assert.match(html, /平均阅读完成率<\/dt><dd>72\.3%<\/dd>/);
  assert.match(html, /平均阅读时长<\/dt><dd>1分5秒<\/dd>/);
  assert.doesNotMatch(html, /9999|70|24h|今日|累计/);
});

test('traffic card uses placeholders when a snapshot or individual values are absent', () => {
  const html = renderTrafficCard([], 'a');
  assert.equal((html.match(/—/g) || []).length, 7);
  assert.doesNotMatch(html, /数据日期/);
  const invalid = renderTrafficCard([{article_id:'a',snapshot_date:'2026-10-02',ctr:101,completion_rate:-1,avg_read_seconds:-1}], 'a');
  assert.equal((invalid.match(/—/g) || []).length, 7);
});

test('article drawer uses its selected account and snapshot', () => {
  const data = normalizeReviewData({
    articles:[{id:'a',account:'A',title:'A',published_at:'2026-10-01'}, {id:'b',account:'B',title:'B',published_at:'2026-10-01'}],
    snapshots:[{id:'1',article_id:'a',snapshot_date:'2026-10-02',reads:12}, {id:'2',article_id:'b',snapshot_date:'2026-10-03',reads:999}],
  });
  const vm = {account:'A', article:'a', week:'this', now:'2026-10-04T00:00:00Z', filters:{}, loading:false};
  const html = renderContentReviewContent(data, vm);
  assert.match(html, /role="dialog"/);
  assert.match(html, /数据日期 2026-10-02/);
  assert.match(html, /阅读量<\/dt><dd>12<\/dd>/);
  assert.doesNotMatch(html, /原因全文/);
  // Cockpit charts share the page and may label other dates; scope isolation to the drawer.
  const drawer = html.match(/<aside class="review-drawer"[\s\S]*?<\/aside>/)?.[0] || '';
  assert.match(drawer, /review-traffic-card/);
  assert.doesNotMatch(drawer, /999|2026-10-03/);
  assert.doesNotMatch(renderContentReviewContent(data, {...vm,article:'b'}), /review-traffic-card/);
});
