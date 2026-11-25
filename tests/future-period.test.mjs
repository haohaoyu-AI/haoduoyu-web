import test from 'node:test';
import assert from 'node:assert/strict';
import {nextPeriod,periodChoices,periodGroup,periodPast,validPeriod,weekOf} from '../shared/todo-period.mjs';
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
  // The next one of a 每周 / 每月 to-do: after the current week or month, or after its own if that is later.
  assert.equal(nextPeriod('2026-W45', 'week', '2026-11-16'), '2026-W48');
  assert.equal(nextPeriod('2026-W49', 'week', '2026-11-16'), '2026-W50');
  assert.equal(nextPeriod('2026-W53', 'week', '2026-12-30'), '2027-W01');
  assert.equal(nextPeriod('2026-12', 'month', '2026-12-31'), '2027-01');
  const groups = futureGroups([{id:'a', period:'2026-12'}, {id:'b'}, {id:'c', period:'2026-W47'}], '2026-11-16');
  assert.deepEqual(groups.map(([key, rows]) => [key, rows.map(row => row.id)]), [['week', ['c']], ['next_month', ['a']], ['none', ['b']]]);
});

import {readPeriodWords} from '../shared/todo-period-words.mjs';
test('Chinese time words put a future to-do in its week or month and leave the rest as its text', () => {
  const cases = {
    '下周看一部电影': ['next_week', '看一部电影'], '下个礼拜看电影': ['next_week', '看电影'], '看电影，下星期': ['next_week', '看电影'],
    '下一个礼拜去银行': ['next_week', '去银行'], '下周之内回复邮件': ['next_week', '回复邮件'], '下周一起吃饭': ['next_week', '一起吃饭'],
    '这礼拜把书架整理了': ['week', '把书架整理了'], '这周末去爬山': ['week', '去爬山'], '这星期内交稿': ['week', '交稿'],
    '月底前交房租': ['month', '交房租'], '这个月中旬体检': ['month', '体检'],
    '每周看一部电影': ['every_week', '每周看一部电影'], '每个礼拜打一次球': ['every_week', '每个礼拜打一次球'],
    '每月去一次图书馆': ['every_month', '每月去一次图书馆'], '每个月底对账': ['every_month', '每个月底对账'],
    '下个月去医院复查': ['next_month', '去医院复查'], '下个月底前办签证': ['next_month', '办签证'],
  };
  for (const [sentence, [period, text]] of Object.entries(cases)) assert.deepEqual(readPeriodWords(sentence), {period, text}, sentence);
  // A weekday is a concrete day, and last week or month is not a plan.
  for (const sentence of ['下周五交表', '这礼拜三开会', '每周三游泳', '上个月底的账', '上周末的照片整理', '整理书架', 'next week 看电影'])
    assert.equal(readPeriodWords(sentence), null, sentence);
});
