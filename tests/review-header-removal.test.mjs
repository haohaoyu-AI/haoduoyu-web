import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

const data = normalizeReviewData({articles:[{id:'a',account:'A',title:'Article',published_at:'2026-11-02T03:00:00Z'}]});
const vm = {account:'A',now:'2026-11-02T04:00:00Z',filters:{},secondary:'cockpit',article:'',loading:false,error:''};

test('review begins with metrics and keeps refresh without a header block', () => {
  const html = renderContentReviewContent(data,vm);
  assert.doesNotMatch(html,/review-toolbar|review-account|review-version/);
  assert.match(html,/data-review-filter="metricsRange"/);
  assert.match(html,/data-review-action="refresh"/);
  assert.equal((html.match(/class="review-stat"/g) || []).length,6);
});

test('loading, empty, and error states do not restore the header and retain retries', () => {
  const loading = renderContentReviewContent(data,{...vm,loading:true});
  assert.match(loading,/role="status"/);
  assert.doesNotMatch(loading,/review-toolbar|review-version/);
  for (const html of [renderContentReviewContent(normalizeReviewData(),vm),renderContentReviewContent(data,{...vm,error:'failed'})]) {
    assert.doesNotMatch(html,/review-toolbar|review-version/);
    assert.match(html,/data-review-action="refresh"/);
  }
});
