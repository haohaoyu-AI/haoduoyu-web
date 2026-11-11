import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';
const data=normalizeReviewData({articles:[{id:'one',account:'A',title:'完整文章标题',published_at:'2026-11-07T01:00:00Z'},
  {id:'two',account:'B',title:'其他账号',published_at:'2026-11-07T01:00:00Z'}]});
const vm={account:'A',now:'2026-11-08T01:00:00Z',filters:{},loading:false,error:'',article:'',secondary:'articles'};
test('article collection starts collapsed with accessible controls and preserves its whole data markup',()=>{
  const html=renderContentReviewContent(data,vm);
  assert.match(html,/data-review-articles-expanded="false"/);
  assert.match(html,/aria-expanded="false" aria-controls="review-article-library"/);
  assert.match(html,/review-article-count">1 篇/);
  assert.match(html,/展开 ↓/);
  assert.match(html,/id="review-article-library" class="review-article-library"/);
  assert.match(html,/完整文章标题/);
  assert.doesNotMatch(html,/其他账号/);
  assert.match(html,/收起文章列表 ↑/);
});
test('expanded state retains detail, filter and metric controls, including empty-filter views',()=>{
  const html=renderContentReviewContent(data,{...vm,articlesExpanded:true,metricColumns:['reads','ctr']});
  assert.match(html,/data-review-articles-expanded="true"/);
  assert.match(html,/aria-expanded="true" aria-controls="review-article-library"/);
  assert.match(html,/data-review-filter="range"/);
  assert.match(html,/data-review-column="ctr" checked/);
  assert.match(html,/data-review-article="one"/);
  assert.match(html,/toggle-fullscreen/);
  const empty=renderContentReviewContent(data,{...vm,articlesExpanded:true,filters:{verdict:'爆'}});
  assert.match(empty,/当前筛选下没有文章/);
  assert.match(empty,/收起文章列表 ↑/);
});
test('shared disclosure collapses desktop and mobile while retaining a fixed collapse control',async()=>{
  const css=await readFile(new URL('../public/mobile.css',import.meta.url),'utf8');
  const block=css.slice(css.indexOf('/* The article collection'));
  const shared=block.slice(0,block.indexOf("@media"));
  assert.match(shared,/data-review-articles-expanded="false"[^\n]+\.review-article-library/);
  assert.match(shared,/\.review-articles-toggle \{[\s\S]*display:flex/);
  assert.match(shared,/right:24px; bottom:24px/);
  assert.match(shared,/\.shell:has\(#content-review \[data-review-articles-expanded="true"\]\) \{\s+backdrop-filter:none/);
  assert.match(block,/@media \(max-width:767px\)/);
  assert.match(block,/data-review-articles-expanded="false"[^\n]+\.review-article-library/);
  assert.match(block,/position:fixed; z-index:21/);
  assert.match(block,/bottom:calc\(var\(--mobile-nav-height,76px\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(block,/#content-review\.review-list-fullscreen \.review-articles-panel\[data-review-articles-expanded="true"\] \.review-collapse-dock \{\s+bottom:0/);
  assert.match(block,/scroll-padding-bottom:calc/);
  assert.match(block,/padding-bottom:calc\(var\(--mobile-nav-height,76px\) \+ env\(safe-area-inset-bottom\) \+ 84px\)/);
});
