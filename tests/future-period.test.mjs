import test from 'node:test';
import assert from 'node:assert/strict';
import {periodChoices,periodGroup,periodPast,validPeriod,weekOf} from '../shared/todo-period.mjs';
import {futureGroups} from '../web/pages/unscheduled-todos.mjs';

test('ISO weeks and months: choices on a day, groups as time passes', () => {
  assert.equal(weekOf('2026-11-16'), '2026-W47'); // Monday
  assert.equal(weekOf('2026-11-22'), '2026-W47'); // Sunday
  assert.equal(weekOf('2027-01-01'), '2026-W53');
  assert.equal(weekOf('2024-12-30'), '2025-W01');
  assert.deepEqual(periodChoices('2026-12-28'), {week:'2026-W53', next_week:'2027-W01', month:'2026-12', next_month:'2027-01'});
  for (const value of ['2026-W47', '2026-W53', '2026-12']) assert.ok(validPeriod(value), value);
  for (const value of ['2025-W53', '2026-W00', '2026-13', '2026-00', '2026-11-16', 'next', null]) assert.ok(!validPeriod(value), value);
  // "下周" written on Monday 16th becomes "本周" a week later; a week already over stays in 本周 and is marked.
  assert.equal(periodGroup('2026-W48', '2026-11-16'), 'next_week');
  assert.equal(periodGroup('2026-W48', '2026-11-23'), 'week');
  assert.equal(periodGroup('2026-W47', '2026-11-30'), 'week');
  assert.ok(periodPast('2026-W47', '2026-11-30'));
  assert.equal(periodGroup('2026-12', '2026-11-16'), 'next_month');
  assert.equal(periodGroup('2026-12', '2026-12-01'), 'month');
  assert.equal(periodGroup(undefined, '2026-11-16'), 'none');
  const groups = futureGroups([{id:'a', period:'2026-12'}, {id:'b'}, {id:'c', period:'2026-W47'}], '2026-11-16');
  assert.deepEqual(groups.map(([key, rows]) => [key, rows.map(row => row.id)]), [['week', ['c']], ['next_month', ['a']], ['none', ['b']]]);
});
