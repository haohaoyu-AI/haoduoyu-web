import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css = await readFile(new URL('../public/review.css',import.meta.url),'utf8');
const list = css.slice(css.indexOf('/* Article detail list'));
const mobile = list.slice(list.indexOf('@media (max-width:760px)'));

test('the fixed desktop table aligns all seven metrics and clamps long titles to two lines', () => {
  assert.match(list,/min-width:820px; table-layout:fixed/);
  assert.match(list,/\.review-articles-table \.review-title-button[\s\S]*?-webkit-line-clamp:2; overflow:hidden/);
});

test('at 760px the card grid keeps all seven metrics and both pattern tags visible', () => {
  assert.match(mobile,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(mobile,/td\.review-cell-published \{\s*grid-column:1 \/ -1/);
  assert.match(mobile,/td\.review-cell-reads \{ grid-column:span 3; grid-row:2; \}/);
  assert.match(mobile,/td\.review-cell-impressions,[\s\S]*?td\.review-cell-fan_impressions \{\s*grid-column:span 4; grid-row:3/);
  assert.match(mobile,/\.review-table-wrap \{\s*overflow:visible/);
});
