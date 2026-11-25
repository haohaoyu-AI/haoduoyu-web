import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent, lastUpdated} from '../web/pages/content-review.mjs';

const data = () => normalizeReviewData({
  articles:[{id:'a1',account:'V字',title:'文',created_at:'2026-11-20T01:00:00Z',updated_at:'2026-11-21T02:00:00Z'}],
  playbooks:[{id:'p',account:'V字',status:'active',version:3,published_on:'2026-11-01',content_md:'# 手册',created_at:'2026-11-01T02:00:00Z',
    updated_at:'2026-11-22T05:05:00Z',rules:[{rule_id:'R1',section:'body',text:'正文'}]}],
  prompts:[{id:'q',prompt_key:'image',scope:'vzi',status:'active',version:2,title:'配图',content_md:'x',
    created_at:'2026-11-10T04:00:00Z',updated_at:'2026-11-12T04:30:00Z'}],
});
const view = secondary => renderContentReviewContent(data(),{account:'V字',secondary,now:'2026-11-22T06:00:00Z'});

test('the line above the tabs names the newest change across tabs, in 北京时间', () => {
  const html = view('cockpit');
  assert.match(html,/内容复盘最近更新 <time datetime="2026-11-22T05:05:00Z">2026-11-22 13:05<\/time><span class="review-note">（规则）/);
  assert.match(html,/本页最近更新 <time datetime="2026-11-21T02:00:00Z">2026-11-21 10:00<\/time>/);
});
test('rules show 生效 from the new version and 最后更新 from edits in place; prompts likewise', () => {
  assert.match(view('rules'),/生效 2026-11-01 10:00<\/span><span class="review-note review-rule-meta-pill">最后更新 2026-11-22 13:05/);
  assert.match(view('prompts'),/生效 2026-11-10 12:00 · 最后更新 2026-11-12 12:30 · 北京时间/);
});
test('lastUpdated picks the newest instant and ignores rows without times', () => {
  assert.equal(lastUpdated([{updated_at:'2026-11-01T00:00:00Z'},{created_at:'2026-11-02T00:00:00+08:00'},{},{updated_at:'x'}]),'2026-11-02T00:00:00+08:00');
  assert.equal(lastUpdated([]),'');
});

test('prompt page timestamp picks the newest displayed prompt and falls back to its creation time', () => {
  const fixture = data();
  fixture.prompts.push(
    {id:'poster',prompt_key:'poster_image',scope:'vzi',status:'active',version:1,title:'AI海报提示词',content_md:'海报',
      created_at:'2026-11-23T08:30:00Z'},
    {id:'retired',prompt_key:'article_diagnosis',scope:'vzi',status:'active',version:1,content_md:'不展示',
      updated_at:'2026-11-25T01:00:00Z'},
    {id:'other',prompt_key:'longform_write',scope:'yujian',status:'active',version:1,content_md:'另一个账号',
      updated_at:'2026-11-26T01:00:00Z'},
  );
  const html = renderContentReviewContent(fixture,{account:'V字',secondary:'prompts'});
  assert.match(html,/本页最近更新 <time datetime="2026-11-23T08:30:00Z">2026-11-23 16:30<\/time>/);
  assert.match(html,/>AI海报提示词<\/h2>/);
  assert.doesNotMatch(html,/不展示|另一个账号/);
});

test('prompt page takes the timestamp of a displayed handbook excerpt, even with no standalone prompt', () => {
  const fixture = data();
  fixture.prompts = [];
  fixture.playbooks[0].content_md = '# 手册\n## 写作提示词\n写作规则';
  const html = renderContentReviewContent(fixture,{account:'V字',secondary:'prompts'});
  assert.match(html,/本页最近更新 <time datetime="2026-11-22T05:05:00Z">2026-11-22 13:05<\/time>/);
  assert.match(html,/>写作提示词<\/h2>/);
});

test('a handbook with a suppressed duplicate excerpt does not affect the prompt page timestamp', () => {
  const fixture = data();
  fixture.playbooks[0].content_md = '# 手册\n## 配图提示词\nx';
  const html = renderContentReviewContent(fixture,{account:'V字',secondary:'prompts'});
  assert.match(html,/本页最近更新 <time datetime="2026-11-12T04:30:00Z">2026-11-12 12:30<\/time>/);
  assert.doesNotMatch(html,/规则手册中的提示词/);
});
