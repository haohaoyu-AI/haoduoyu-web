import test from 'node:test';
import assert from 'node:assert/strict';
import {todoCount, todoCountChange, todoCountNote, TODO_COUNT_MAX} from '../web/core/todo-count.mjs';

test('a tally lives at the front of the note and keeps the hand-written rest', () => {
  assert.equal(todoCount('随手写的备注'), null);
  assert.equal(todoCount(''), null);
  assert.deepEqual(todoCount('2/5 次'), {done:2, target:5, rest:''});
  assert.deepEqual(todoCount('2/5 次 · 发了2篇，有一篇还在等待。'), {done:2, target:5, rest:'发了2篇，有一篇还在等待。'});
  assert.equal(todoCount('6/5 次'), null, 'more done than planned is ordinary text');
  assert.equal(todoCount('0/0 次'), null);
  assert.equal(todoCountNote(1, 3, '原备注'), '1/3 次 · 原备注');
});
test('set, add, undo and clear', () => {
  assert.equal(todoCountChange('原备注', 'set', 5), '0/5 次 · 原备注');
  assert.equal(todoCountChange('', 'set', 5), '0/5 次');
  assert.equal(todoCountChange('4/5 次 · 原备注', 'set', 3), '3/3 次 · 原备注', 'a smaller target caps the tally');
  assert.equal(todoCountChange('', 'set', 0), null);
  assert.equal(todoCountChange('', 'set', TODO_COUNT_MAX + 1), null);
  assert.equal(todoCountChange('0/5 次', 'add'), '1/5 次');
  assert.equal(todoCountChange('5/5 次', 'add'), null, 'never past the target, never auto-completes');
  assert.equal(todoCountChange('1/5 次 · 原备注', 'undo'), '0/5 次 · 原备注');
  assert.equal(todoCountChange('0/5 次', 'undo'), null);
  assert.equal(todoCountChange('2/5 次 · 原备注', 'clear'), '原备注');
  assert.equal(todoCountChange('没有计次', 'add'), null);
});
