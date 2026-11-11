import test from 'node:test';
import assert from 'node:assert/strict';
import {renderImitation} from '../web/pages/review-imitation.mjs';
import {reviewRoute} from '../web/review-controller.mjs';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

test('reference takes precedence and routes to the scoped benchmark record', () => {
  const row={account:'A',reference_article_id:'id /一',sample_title:'fallback',sample_url:'https://sample.example/'};
  const data={benchmarkArticles:[{id:'id /一',account:'A',title:'真实参考 <标题>'},{id:'other',account:'B',title:'FOREIGN'}]};
  const html=renderImitation(row,data,'A');
  assert.match(html,/data-review-benchmark="id \/一"/);
  assert.match(html,/真实参考 &lt;标题&gt;/);
  assert.doesNotMatch(html,/fallback|sample\.example|FOREIGN/);
  const url = new URL('https://example.test/?page=review&account=A&review_section=review&review_article=old&review_benchmark=id+%2F%E4%B8%80');
  const route=reviewRoute(url.href);
  assert.equal(route.secondary,'benchmarks');
  assert.equal(route.article,'');
  assert.equal(route.benchmark,'id /一');
});

test('sample fallback uses safe URL, preserves missing values and isolates accounts', () => {
  const foreign={benchmarkArticles:[{id:'ref',account:'B',title:'SECRET'}]};
  const sample={account:'A',reference_article_id:'ref',sample_title:'样本 <标题>',sample_url:'https://example.test/sample'};
  const html=renderImitation(sample,foreign,'A');
  assert.match(html,/href="https:\/\/example\.test\/sample"/);
  assert.match(html,/样本 &lt;标题&gt;/);
  assert.doesNotMatch(html,/SECRET|data-review-benchmark/);
  assert.doesNotMatch(renderImitation({...sample,sample_url:'javascript:alert(1)'},foreign,'A'),/href=/);
  assert.match(renderImitation({account:'A'},foreign,'A'),/自选题/);
  assert.equal(renderImitation({...sample,account:'B'},foreign,'A'),'');
});

test('article drawer includes imitation and keeps its traffic card', () => {
  const data=normalizeReviewData({articles:[{id:'a',account:'A',title:'文章',sample_title:'参考题',sample_url:'https://example.test/ref'}],snapshots:[]});
  const html=renderContentReviewContent(data,{account:'A',article:'a',now:'2026-11-02T04:00:00Z',filters:{},loading:false,secondary:'benchmarks'});
  assert.match(html,/review-traffic-card/);
  assert.match(html,/review-imitation/);
  assert.match(html,/参考题/);
  assert.doesNotMatch(html,/原因全文/);
});
