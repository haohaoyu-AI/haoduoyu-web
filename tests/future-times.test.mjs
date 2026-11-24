import test from 'node:test';
import assert from 'node:assert/strict';
import {readTimes,repeatGroups,needsNudge,daysLeft,timesLabel,leftLabel} from '../shared/todo-times.mjs';
import {collapseTimes} from '../web/pages/unscheduled-todos.mjs';

const copy=(id,period,text='每周总结数据',recurrence='week')=>({id,text,period,recurrence,version:1,completed:false,deleted_at:null});

test('reads how many times a sentence says', () => {
  assert.deepEqual(readTimes('每周两次总结数据'),{times:2,every:'every_week',text:'每周总结数据'});
  assert.deepEqual(readTimes('一周3次去健身房'),{times:3,every:'every_week',text:'去健身房'});
  assert.deepEqual(readTimes('每个月两次打扫'),{times:2,every:'every_month',text:'每个月打扫'});
  assert.deepEqual(readTimes('总结数据 2次'),{times:2,every:null,text:'总结数据'});
  assert.equal(readTimes('每周总结数据'),null);
  assert.equal(readTimes('看一次电影'),null);
});

test('copies in a later week count as done this week', () => {
  // 2026-11-24 is a Tuesday in 2026-W48.
  const [group]=repeatGroups([copy('a','2026-W48'),copy('b','2026-W49')],'2026-11-24');
  assert.equal(group.times,2);assert.deepEqual(group.open.map(x=>x.id),['a']);assert.deepEqual(group.done.map(x=>x.id),['b']);
  assert.equal(timesLabel(group),'本周 1/2');
  const [full]=repeatGroups([copy('a','2026-W49'),copy('b','2026-W49')],'2026-11-24');
  assert.equal(timesLabel(full),'本周做够了 2/2');
  // Next Monday both are this week again: 0/2.
  const [next]=repeatGroups([copy('a','2026-W49'),copy('b','2026-W49')],'2026-11-30');
  assert.equal(timesLabel(next),'本周 0/2');
});

test('different text or repeat stays apart; deleted ones are left out', () => {
  const groups=repeatGroups([copy('a','2026-W48'),copy('b','2026-W48','跑步'),{...copy('c','2026-W48'),deleted_at:'x'},
    copy('d','2026-11','每周总结数据','month'),{id:'e',text:'每周总结数据',version:1}],'2026-11-24');
  assert.deepEqual(groups.map(g=>g.copies.length),[1,1,1]);
});

test('nudged on 今日 near the end of the week', () => {
  const two=day=>repeatGroups([copy('a','2026-W48'),copy('b','2026-W48')],day)[0];
  assert.equal(daysLeft('week','2026-11-24'),6);assert.equal(daysLeft('week','2026-11-29'),1);
  assert.equal(needsNudge(two('2026-11-24'),'2026-11-24'),false);
  assert.equal(needsNudge(two('2026-11-28'),'2026-11-28'),true); // Saturday
  assert.equal(leftLabel(two('2026-11-28')),'本周还差 2 次');
  const one=repeatGroups([copy('a','2026-W48'),copy('b','2026-W49')],'2026-11-27')[0];
  assert.equal(needsNudge(one,'2026-11-27'),false); // Friday, one left, three days left
  assert.equal(daysLeft('month','2026-11-29'),2);
});

test('the list shows several copies as one row in 本周; a single repeat is untouched', () => {
  const rows=collapseTimes([copy('a','2026-W48'),copy('b','2026-W49'),copy('c','2026-W49','跑步'),{id:'d',text:'看书',version:1}],'2026-11-24');
  assert.equal(rows.length,3);
  assert.equal(rows[0].group.times,2);assert.equal(rows[0].period,'2026-W48');assert.equal(rows[0].id,'a');
  assert.equal(rows[1].id,'c');assert.equal(rows[1].group,undefined);
});
