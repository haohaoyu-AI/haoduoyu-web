import test from 'node:test';
import assert from 'node:assert/strict';
import {createTodoMonthLoader} from '../web/core/todo-month.mjs';

const items = date => [{id: date}];
const fullMonth = month => Object.fromEntries(Array.from({length: 30}, (_, i) => {
  const date = `${month}-${String(i + 1).padStart(2, '0')}`;
  return [date, items(date)];
}));
test('verified month and cached navigation avoid daily requests and isolate owners', async () => {
  let reads = 0, owner = 'one';
  const loader = createTodoMonthLoader({active: value => value === owner,
    seed: async month => fullMonth(month), read: async date => { reads++; return {items: items(date)}; }});
  const first = loader.open('2026-09', owner); await first.promise;
  assert.equal(first.days.size, 30); assert.equal(reads, 0);
  await loader.open('2026-11', owner).promise;
  assert.equal(loader.open('2026-09', owner), first); assert.equal(reads, 0);
  owner = 'two'; const other = loader.open('2026-09', owner); await other.promise;
  assert.notEqual(other, first); assert.equal(reads, 0);
});
test('partial batch is preserved, rate limit blocks retry until due, then fetches only missing dates', async () => {
  let time = 1000, calls = [], fail = true;
  const loader = createTodoMonthLoader({now: () => time, active: () => true, seed: async () => ({}),
    read: async date => { calls.push(date); if (fail && date.endsWith('-03')) throw Object.assign(new Error('稍后重试'), {status:429, retryAfterMs:120000}); return {items:items(date)}; }});
  const first = loader.open('2026-09', 'one'); await first.promise;
  assert.equal(first.days.size, 4); assert.equal(calls.length, 5); assert.equal(first.retryAt, 121000);
  loader.open('2026-09', 'one'); assert.equal(calls.length, 5);
  time = 121000; fail = false; await loader.open('2026-09', 'one').promise;
  assert.equal(first.days.size, 30); assert.equal(calls.length, 31);
  assert.equal(calls.filter(date => date.endsWith('-01')).length, 1);
  assert.equal(calls.filter(date => date.endsWith('-03')).length, 2);
});
test('switching months aborts outstanding reads and resumes only missing dates', async () => {
  let calls = [], resolveFirst;
  const loader = createTodoMonthLoader({active: () => true, seed: async () => ({}), read: (date, context) => {
    calls.push(date);
    if (date === '2026-09-01') return new Promise((resolve, reject) => {
      resolveFirst = resolve; context.controller.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
    });
    return Promise.resolve({items:items(date)});
  }});
  const first = loader.open('2026-09', 'one'); await new Promise(resolve => setTimeout(resolve, 0));
  const second = loader.open('2026-11', 'one'); await second.promise; await first.promise;
  assert.equal(first.loading, false); assert.equal(first.days.size, 4);
  assert.equal(second.days.size, 30); assert.equal(typeof resolveFirst, 'function');
});
test('cache expires after one minute, refresh preserves old days during a failed batch', async () => {
  let time = 0, reads = 0, refresh = false;
  const loader = createTodoMonthLoader({now: () => time, active: () => true,
    seed: async (month, owner, options) => { refresh = options.refresh; return options.refresh ? {} : fullMonth(month); },
    read: async date => { reads++; if (date.endsWith('-02')) throw new Error('unavailable'); return {items:items(date)}; }});
  const first = loader.open('2026-09', 'scope-a'); await first.promise;
  time = 59999; loader.open('2026-09', 'scope-a'); assert.equal(reads, 0);
  time = 60000; await loader.open('2026-09', 'scope-a').promise;
  assert.equal(refresh, true); assert.equal(reads, 5); assert.equal(first.days.size, 30);
  assert.match(first.error, /unavailable/);
});
test('a local edit during an in-flight read cannot be overwritten and scope changes discard prior cache', async () => {
  let owner = 'user:scope-a', resolveRead;
  const loader = createTodoMonthLoader({active: value => value === owner, seed: async () => ({}),
    read: async date => date.endsWith('-01') ? new Promise(resolve => { resolveRead = resolve; }) : {items:items(date)}});
  const first = loader.open('2026-09', owner); await new Promise(resolve => setTimeout(resolve, 0));
  loader.update(owner, '2026-09-01', [{id:'local'}]); resolveRead({items:[{id:'stale'}]});
  await first.promise; assert.deepEqual(first.days.get('2026-09-01'), [{id:'local'}]);
  owner = 'user:scope-b'; const second = loader.open('2026-09', owner);
  assert.notEqual(second, first); assert.equal(second.days.size, 0);
  loader.cancel(); await second.promise;
});
test('rate limit cooldown applies across months without sending more requests', async () => {
  let now = 0, calls = 0;
  const loader = createTodoMonthLoader({now: () => now, active: () => true, seed: async () => ({}), read: async () => {
    calls++; throw Object.assign(new Error('rate limited'), {status:429, retryAfterMs:90000});
  }});
  const first = loader.open('2026-09', 'same-scope'); await first.promise;
  assert.equal(calls, 5);
  const second = loader.open('2026-10', 'same-scope');
  assert.equal(second.loading, false); assert.match(second.error, /稍后/); assert.equal(calls, 5);
  now = 90000; await loader.open('2026-10', 'same-scope').promise;
  assert.equal(calls, 10);
});

test('a batch honors the longest Retry-After from concurrent rate limits', async () => {
  let calls = 0, now = 1000;
  const loader = createTodoMonthLoader({now: () => now, active: () => true, seed: async () => ({}),
    read: async () => { const delay = ++calls === 1 ? 180000 : 60000;
      throw Object.assign(new Error('稍后重试'), {status: 429, retryAfterMs: delay}); }});
  const snapshot = loader.open('2026-09', 'owner'); await snapshot.promise;
  assert.equal(snapshot.retryAt, 181000); assert.equal(calls, 5);
  now = 61000; loader.open('2026-09', 'owner'); assert.equal(calls, 5);
});
test('scope readiness transitions pause without clearing and resume only once', async () => {
  const {todoMonthScopeTransition} = await import('../web/core/todo-month.mjs');
  assert.equal(todoMonthScopeTransition('user:null', 'user:scope', false, true), 'replace-and-load');
  assert.equal(todoMonthScopeTransition('user:scope', 'user:scope', true, false), 'pause');
  assert.equal(todoMonthScopeTransition('user:scope', 'user:scope', false, true), 'resume');
  assert.equal(todoMonthScopeTransition('user:scope', 'user:scope', true, true), 'none');
  assert.equal(todoMonthScopeTransition('user:scope', 'user:other', true, false), 'replace');
});
test('newer verified snapshot supersedes an older day read while pending edits are retained', async () => {
  const {todoMonthSeed} = await import('../web/core/todo-month.mjs');
  const snapshot = {verified_at:200, days:{'2026-09-01':[{id:'new'}], '2026-09-02':[{id:'server'}]}};
  const loaded = [{date:'2026-09-01', readAt:100, pending:false, items:[{id:'old'}]},
    {date:'2026-09-02', readAt:100, pending:true, items:[{id:'editing'}]}];
  const result = todoMonthSeed('2026-09', snapshot, loaded);
  assert.deepEqual(result['2026-09-01'], [{id:'new'}]);
  assert.deepEqual(result['2026-09-02'], [{id:'editing'}]);
  assert.deepEqual(result['2026-09-03'], []);
  assert.equal(Object.keys(result).length, 30);
});
