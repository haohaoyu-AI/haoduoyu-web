import test from 'node:test';
import assert from 'node:assert/strict';
import {futureQuickDates} from '../web/pages/unscheduled-todos.mjs';

test('future to-dos offer 今天, 明天 and a weekend day that is not already 明天',()=>{
  assert.deepEqual(futureQuickDates('2026-11-12'),[['今天','2026-11-12'],['明天','2026-11-13'],['周末','2026-11-14']],'Thursday → this Saturday');
  assert.deepEqual(futureQuickDates('2026-11-13')[2],['周日','2026-11-15'],'Friday: Saturday is already 明天');
  assert.deepEqual(futureQuickDates('2026-11-14')[2],['下周六','2026-11-21'],'Saturday: Sunday is already 明天');
  assert.deepEqual(futureQuickDates('2026-11-15')[2],['周末','2026-11-21'],'Sunday → next Saturday');
  assert.deepEqual(futureQuickDates('2026-12-31')[1],['明天','2027-01-01']);
});
