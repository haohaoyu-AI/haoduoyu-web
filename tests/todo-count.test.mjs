import test from 'node:test';
import assert from 'node:assert/strict';
import {todoCount, todoCountChange, todoCountNote, TODO_COUNT_MAX, TODO_COUNT_OPEN_MAX} from '../web/core/todo-count.mjs';

test('a tally lives at the front of the note and keeps the hand-written rest', () => {
  assert.equal(todoCount('随手写的备注'), null);
  assert.equal(todoCount(''), null);
  assert.deepEqual(todoCount('2/5 次'), {done:2, target:5, rest:''});
  assert.deepEqual(todoCount('2/5 次 · 发了2篇，有一篇还在等待。'), {done:2, target:5, rest:'发了2篇，有一篇还在等待。'});
  assert.equal(todoCount('6/5 次'), null, 'more done than planned is ordinary text');
  assert.equal(todoCount('0/0 次'), null);
  assert.equal(todoCountNote(1, 3, '原备注'), '1/3 次 · 原备注');
});
test('hand edits that drop the separator still read as a tally, and stale duplicates are dropped', () => {
  // The note editor joins lines, so "3/5 次" + newline + "做好了" is saved as "3/5 次做好了".
  assert.deepEqual(todoCount('3/5 次做好了 方法'), {done:3, target:5, rest:'做好了 方法'});
  assert.deepEqual(todoCount('3/5次 做好了'), {done:3, target:5, rest:'做好了'});
  assert.equal(todoCountChange('3/5 次做好了 方法', 'set', 5), '3/5 次 · 做好了 方法', 'setting again never stacks a second tally');
  // A note already damaged by the old reader: the first tally wins and the stale one is removed on the next tap.
  assert.deepEqual(todoCount('5/5 次 · 3/5 次做好了 方法'), {done:5, target:5, rest:'做好了 方法'});
  assert.equal(todoCountChange('5/5 次 · 3/5 次做好了 方法', 'undo'), '4/5 次 · 做好了 方法');
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
test('an open counter has no target and never fills', () => {
  assert.equal(todoCountChange('', 'set', null), '0/∞ 次');
  assert.equal(todoCountChange('4/5 次 · 原备注', 'set', null), '4/∞ 次 · 原备注', 'switching to open keeps the count');
  assert.deepEqual(todoCount('3/∞ 次 · 原备注'), {done:3, target:null, rest:'原备注'});
  assert.equal(todoCountChange('8/∞ 次', 'add'), '9/∞ 次');
  assert.equal(todoCountChange('9/∞ 次', 'set', 5), '5/5 次', 'a target caps an open count');
  assert.equal(todoCountChange(`${TODO_COUNT_OPEN_MAX}/∞ 次`, 'add'), null);
  assert.equal(todoCountChange('1/∞ 次', 'undo'), '0/∞ 次');
});
