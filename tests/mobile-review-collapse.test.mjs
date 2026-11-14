import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
const data=normalizeReviewData({articles:[{id:'one',account:'A',title:'完整文章标题',published_at:'2026-11-07T01:00:00Z'},
  {id:'two',account:'B',title:'其他账号',published_at:'2026-11-07T01:00:00Z'}]});
const vm={account:'A',now:'2026-11-08T01:00:00Z',filters:{group:'@table',group:'@table'},loading:false,error:'',article:'',secondary:'articles'};
test('article collection stays open without a collapse control and preserves its data markup',()=>{
  const html=renderContentReviewContent(data,vm);
  assert.match(html,/data-review-articles-expanded="true"/);
  assert.match(html,/id="review-article-library" class="review-article-library"/);
  assert.match(html,/完整文章标题/);
  assert.match(html,/全屏展示/);
  assert.doesNotMatch(html,/其他账号|展开 ↓|收起 ↑|收起文章列表/);
});
test('expanded state retains detail, filter and metric controls, including empty-filter views',()=>{
  const html=renderContentReviewContent(data,{...vm,metricColumns:['reads','ctr']});
  assert.match(html,/data-review-articles-expanded="true"/);
  assert.match(html,/data-review-filter="range"/);
  assert.match(html,/data-review-column="ctr" checked/);
  assert.match(html,/data-review-article="one"/);
  assert.match(html,/toggle-fullscreen/);
  const empty=renderContentReviewContent(data,{...vm,filters:{group:'@table',verdict:'爆'}});
  assert.match(empty,/当前筛选下没有文章/);
  assert.match(empty,/全屏展示/);
  assert.doesNotMatch(empty,/收起文章列表/);
});
test('article library and fullscreen stay visible on desktop and phones',async()=>{
  const css=await readFile(new URL('../public/mobile.css',import.meta.url),'utf8');
  const block=css.slice(css.indexOf('/* Article detail stays open'));
  assert.match(block,/#content-review \.review-article-library \{ display:block; \}/);
  assert.match(block,/#content-review \.review-articles-toggle,\s+#content-review \.review-collapse-dock \{ display:none; \}/);
  assert.match(block,/toggle-fullscreen/);
  assert.doesNotMatch(block,/data-review-articles-expanded="false"/);
});
