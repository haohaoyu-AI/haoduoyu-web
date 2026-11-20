import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css = await readFile(new URL('../public/review.css',import.meta.url),'utf8');
const list = css.slice(css.indexOf('/* Article detail list */'));
const mobile = list.slice(list.indexOf('@media (max-width:640px)'));

test('the fixed desktop table gives long titles an ellipsis', () => {
  assert.match(list,/min-width:740px; table-layout:fixed/);
  assert.match(list,/\.review-title-button,\.review-pattern-label\)[\s\S]*?overflow:hidden; text-overflow:ellipsis; white-space:nowrap/);
});

test('at 640px the grid uses a full-width title and five inline summary cells', () => {
  assert.match(mobile,/grid-template-columns:auto minmax\(0,max-content\) auto auto auto minmax\(0,1fr\)/);
  assert.match(mobile,/td\.review-cell-title \{ grid-column:1 \/ -1; grid-row:1; \}/);
  assert.match(mobile,/td\.review-cell-article-pattern,td\.review-cell-completion_rate,\.review-publish-clock\) \{ display:none/);
  assert.match(mobile,/::after \{\s*content:'·'/);
  assert.match(mobile,/\.review-table-wrap \{ overflow:visible/);
});
