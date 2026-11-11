import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

const now = '2026-11-02T04:00:00Z';
const vm = range => ({account:'A',now,filters:{range:'all',metricsRange:range},secondary:'cockpit',article:'',loading:false,error:''});
const render = (snapshots, range = '24h') => renderContentReviewContent(normalizeReviewData({articles:[{id:'a',account:'A',title:'a',published_at:'2026-11-02T03:00:00Z'}],snapshots}),vm(range));
const cards = html => html.match(/<section class="review-overview-metrics"[\s\S]*?<\/section>/)?.[0] || '';

test('zero eligible samples get the requested text in current windows, not last week', () => {
  for (const range of ['24h','this']) assert.equal((cards(render([],range)).match(/数据未满24h/g) || []).length,4);
  assert.doesNotMatch(cards(render([],'last')),/数据未满24h/);
});
test('a recorded sample with missing fields stays missing and zero remains zero', () => {
  const html = cards(render([{id:'s',article_id:'a',age_hours:24,reads:0,ctr:null,completion_rate:null,avg_read_seconds:null}]));
  assert.doesNotMatch(html,/数据未满24h/);
  assert.match(html,/阅读中位数<\/span><strong>0<\/strong>/);
  assert.match(html,/CTR 中位数<\/span><strong>—<\/strong>/);
});
