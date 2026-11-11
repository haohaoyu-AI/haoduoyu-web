import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('phone calendar overrides desktop board width and hides previews and desktop-only controls within the phone breakpoint',async()=>{
  const css=await readFile(new URL('../public/mobile.css',import.meta.url),'utf8');
  const block=css.slice(css.indexOf('/* Phone calendar'));
  assert.match(block,/@media \(max-width:767px\)/);
  assert.match(block,/#todo-floating-toolbar \{ display:none; \}/);
  assert.match(block,/#todo-history \.todo-calendar-grid \{ min-width:0; width:100%; grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(block,/#todo-history \.todo-calendar-day \{\s*min-width:0; min-height:58px/);
  assert.match(block,/#todo-history \.todo-calendar-task, #todo-history \.todo-calendar-more \{ display:none; \}/);
  assert.match(block,/\.todo-calendar-day\.is-selected \{ background:var\(--accent\); color:var\(--color-white\)/);
  assert.match(block,/\.todo-calendar-day\.is-today strong \{ text-decoration:underline/);
});
