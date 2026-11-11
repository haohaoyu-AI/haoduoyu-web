import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

test('list retains recorded nearest observations with their ages and account isolation', () => {
  const ages = [12, 23, 25, 36, 72, 11, 73, null];
  const articles = ages.map((age, index) => ({id:`a${index}`,account:'A',title:`article ${index}`,published_at:'2026-11-02T02:00:00Z'}));
  articles.push({id:'missing-read',account:'A',title:'missing read',published_at:'2026-11-02T02:00:00Z'});
  articles.push({id:'foreign',account:'B',title:'FOREIGN',published_at:'2026-11-02T02:00:00Z'});
  const snapshots = ages.map((age,index) => ({id:`s${index}`,article_id:`a${index}`,snapshot_date:'2026-11-02',age_hours:age,reads:index === 0 ? 0 : 60 + index}));
  snapshots.push({id:'sm',article_id:'missing-read',snapshot_date:'2026-11-02',age_hours:23,reads:null});
  snapshots.push({id:'sf',article_id:'foreign',snapshot_date:'2026-11-02',age_hours:24,reads:9999});
  const data = normalizeReviewData({articles,snapshots});
  const html = renderContentReviewContent(data,{account:'A',now:'2026-11-02T04:00:00Z',filters:{range:'all'},secondary:'benchmarks',article:'',loading:false,error:''});
  const row = id => html.match(new RegExp(`<tr data-review-row="${id}">([\\s\\S]*?)</tr>`))?.[1] || '';
  for (let i = 0; i < 5; i++) {
    assert.match(row(`a${i}`),new RegExp(`${ages[i]} 小时`));
    assert.match(row(`a${i}`),/review-tag/);
  }
  assert.match(row('a0'),/data-label="阅读">0<span/);
  assert.match(row('missing-read'),/data-label="阅读">—<span[^>]*>发布后 23 小时/);
  assert.doesNotMatch(row('missing-read'),/review-tag/);
  assert.match(row('a5'),/data-label="阅读">未满24h<\/td>/);
  assert.match(row('a6'),/data-label="阅读">66<span[^>]*>发布后 73 小时/);
  assert.match(row('a6'),/review-tag">长尾/);
  assert.match(row('a7'),/data-label="阅读">未满24h<\/td>/);
  assert.doesNotMatch(html,/FOREIGN|9999|24h 阅读<\/th>/);
});
