import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css = await readFile(new URL('../public/mobile.css',import.meta.url),'utf8');
const block = css.slice(css.indexOf('/* Phone review'),css.indexOf('/* The article collection'));

test('compact review overrides stay inside the phone breakpoint and scoped to article review', () => {
  assert.match(block, /@media \(max-width:767px\)/);
  assert.equal((block.match(/@media/g) || []).length,1);
  assert.match(block, /review-articles-panel \.review-article-library > \.review-filters \{\s*display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(block, /review-filters \.input \{ min-width:0; padding-inline:10px 28px/);
  assert.match(block, /review-columns-menu \{ left:0; right:auto;/);
  assert.doesNotMatch(block, /line-clamp|text-overflow:ellipsis|overflow:hidden/);
});

test('all selected phone metrics remain compact without horizontal scrolling or empty verdict space', () => {
  assert.match(block, /review-articles-table \{ display:block; width:100%; min-width:0;/);
  assert.match(block, /review-articles-table tbody tr \{\s*display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(block, /td\[data-label="发布时间"\]::before,[\s\S]*?td\[data-label="标题"\]::before \{ content:none;/);
  assert.match(block, /td\[data-label="判定"\]:empty \{ display:none;/);
  assert.match(block, /review-title-button \{ width:100%; min-height:44px;/);
  assert.match(block, /review-observation-age \{ white-space:normal;/);
});
