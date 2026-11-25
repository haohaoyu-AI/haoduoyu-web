import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';

const workbenchCss = readFileSync(new URL('../public/workbench.css', import.meta.url), 'utf8');
const reviewCss = readFileSync(new URL('../public/review.css', import.meta.url), 'utf8');

test('workbench.css and review.css are valid CSS with zero syntax errors', async () => {
  await transform(workbenchCss, {loader: 'css'});
  await transform(reviewCss, {loader: 'css'});
});

test('爆文库 desktop table removes horizontal overflow and sums column widths to 100%', () => {
  assert.match(reviewCss, /#content-review \.review-benchmark-table-wrap \{[^}]*overflow-x:clip;/);
  assert.match(reviewCss, /#content-review \.review-benchmark-table \{[^}]*min-width:0;/);
  const widths = [
    ['account', 9],
    ['sample', 21],
    ['sample-time', 10],
    ['sample-reads', 8],
    ['own', 24],
    ['own-time', 10],
    ['metrics', 18]
  ];
  let total = 0;
  for (const [name, pct] of widths) {
    assert.match(
      reviewCss,
      new RegExp(`#content-review \\.review-benchmark-table \\.review-lib-cell-${name} \\{[^}]*width:${pct}%;`),
      `missing width:${pct}% for .review-lib-cell-${name}`
    );
    total += pct;
  }
  assert.equal(total, 100);
});

test('workbench.css provides unified warm-glass design tokens and page rules across all site modules', () => {
  for (const needle of [
    '--site-accent:#c8562a',
    '--site-surface-warm:#fbf8f6',
    '--site-card-bg:',
    '#daily-todos .daily-todo-form',
    '#daily-notes #daily-score',
    '#ai-reports .ai-today',
    '.audit-item[open]',
    '.login-card'
  ]) {
    assert.ok(workbenchCss.includes(needle), `expected ${needle} in public/workbench.css`);
  }
});
