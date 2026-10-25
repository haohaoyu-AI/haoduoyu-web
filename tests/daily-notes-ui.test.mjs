import test from 'node:test';
import assert from 'node:assert/strict';
import {createDailyNotesStore, dailyNotesBytes, validDailyNotesDate} from '../web/core/daily-notes-state.mjs';
import {renderDailyNotes, paintDailyNotes} from '../web/pages/daily-notes.mjs';

const date = '2026-10-24', other = '2026-10-23';
const value = (day = date, extra = {}) => ({date: day, text: '', version: 0, updated_at: null,
  deleted: false, can_edit: true, ...extra});
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
const settle = () => new Promise(resolve => setImmediate(resolve));
function client({canEdit = true, putImpl, loadImpl, removeImpl} = {}) {
  const data = new Map(), writes = [], reads = [], timers = new Map(); let serial = 0;
  const get = day => structuredClone(data.get(day) || value(day, {can_edit: canEdit}));
  const store = createDailyNotesStore({
    load: async day => {reads.push(day); return loadImpl ? loadImpl(day, get) : get(day);},
    put: async (day, body) => {
      writes.push({day, body});
      if (putImpl) return putImpl(day, body, data, get);
      const result = value(day, {text: body.text, version: body.version + 1, updated_at: '2026-10-24T08:00:00Z'});
      data.set(day, result); return structuredClone(result);
    },
    remove: async (day, body) => {
      writes.push({day, body, deleted: true});
      if (removeImpl) return removeImpl(day, body, data, get);
      const result = value(day, {deleted: true, version: body.version + 1});
      data.set(day, result); return result;
    },
    uuid: () => '00000000-0000-4000-8000-' + String(++serial).padStart(12, '0'),
    setTimer: callback => {const id = ++serial; timers.set(id, callback); return id;},
    clearTimer: id => timers.delete(id)
  });
  return {store, data, writes, reads, timers, async fire() {
    const pending = [...timers.values()]; timers.clear(); for (const run of pending) run(); await settle();
  }};
}

test('notes capability comes from GET and public read-only input never writes', async () => {
  const c = client({canEdit: false}); await c.store.read(date);
  c.store.edit(date, '不能写'); await c.store.save(date); await c.fire();
  assert.equal(c.store.page(date).canEdit, false); assert.equal(c.store.page(date).draft, '');
  assert.equal(c.writes.length, 0);
});

test('notes autosave coalesces inputs and serializes queued text with the acknowledged version', async () => {
  const gate = deferred(); let first = true, active = 0, highest = 0;
  const c = client({putImpl: async (day, body) => {
    highest = Math.max(highest, ++active);
    if (first) {first = false; await gate.promise;}
    active--; return value(day, {text: body.text, version: body.version + 1});
  }});
  await c.store.read(date); c.store.edit(date, '第一笔'); c.store.edit(date, '第二笔'); await c.fire();
  assert.equal(c.writes.length, 1); assert.equal(c.writes[0].body.text, '第二笔');
  c.store.edit(date, '第三笔'); await c.fire(); assert.equal(c.writes.length, 1);
  gate.resolve(); await settle(); await c.fire();
  assert.equal(c.writes.length, 2); assert.equal(c.writes[1].body.version, 1);
  assert.equal(c.store.page(date).serverText, '第三笔'); assert.equal(highest, 1);
  assert.notEqual(c.writes[0].body.save_id, c.writes[1].body.save_id);
});

test('notes 409 preserves draft and never overwrites until the owner explicitly chooses the newer version', async () => {
  let fail = true;
  const c = client({putImpl: async (day, body, data) => {
    if (fail) {
      data.set(day, value(day, {text: '服务器文字', version: 1})); fail = false;
      throw Object.assign(new Error('版本冲突'), {status: 409});
    }
    return value(day, {text: body.text, version: body.version + 1});
  }});
  await c.store.read(date); c.store.edit(date, '我的草稿'); await c.store.save(date);
  assert.equal(c.store.page(date).phase, 'conflict'); assert.equal(c.store.page(date).draft, '我的草稿');
  assert.equal(c.store.page(date).remote.text, '服务器文字');
  c.store.edit(date, '鱼'.repeat(22000)); c.store.edit(date, '保留后的草稿'); await c.fire();
  await c.store.save(date); assert.equal(c.writes.length, 1);
  await c.store.useDraft(date);
  assert.equal(c.writes.length, 2); assert.equal(c.writes[1].body.version, 1);
  assert.equal(c.store.page(date).serverText, '保留后的草稿');
});

test('notes unknown committed write is verified by GET without replaying the write', async () => {
  const c = client({putImpl: async (day, body, data) => {
    data.set(day, value(day, {text: body.text, version: body.version + 1}));
    throw new Error('合成响应丢失');
  }});
  await c.store.read(date); c.store.edit(date, '已提交的文字'); await c.store.save(date);
  assert.equal(c.writes.length, 1); assert.equal(c.reads.length, 2);
  assert.equal(c.store.page(date).phase, 'saved'); assert.equal(c.store.page(date).dirty, false);
});

test('notes unresolved write never auto-retries; a different newer version becomes explicit conflict', async () => {
  const c = client({putImpl: async () => {throw new Error('合成网络未知');}});
  await c.store.read(date); c.store.edit(date, '未确认文字'); await c.store.save(date);
  assert.equal(c.store.page(date).phase, 'unknown');
  c.store.edit(date, '鱼'.repeat(22000)); c.store.edit(date, '后续草稿');
  await c.store.save(date); await c.fire(); await c.store.reconcile(date);
  assert.equal(c.writes.length, 1); assert.equal(c.store.page(date).draft, '后续草稿');
  c.data.set(date, value(date, {text: '别的文字', version: 1}));
  await c.store.reconcile(date);
  assert.equal(c.store.page(date).phase, 'conflict'); assert.equal(c.writes.length, 1);
});

test('notes manual unknown retry reuses the exact payload and save_id before serializing later input', async () => {
  let first = true;
  const c = client({putImpl: async (day, body, data) => {
    if (first) {first = false; throw new Error('合成请求未到达');}
    const saved = value(day, {text: body.text, version: body.version + 1});
    data.set(day, saved); return saved;
  }});
  await c.store.read(date); c.store.edit(date, '原保存'); await c.store.save(date);
  assert.equal(c.store.page(date).phase, 'unknown'); assert.equal(c.store.page(date).pending.retryReady, true);
  c.store.edit(date, '后来输入'); await c.fire(); assert.equal(c.writes.length, 1);
  await c.store.retryPending(date);
  assert.deepEqual(c.writes[1].body, c.writes[0].body);
  assert.equal(c.store.page(date).draft, '后来输入');
  await c.fire(); assert.equal(c.writes.length, 3);
  assert.equal(c.writes[2].body.version, 1); assert.equal(c.writes[2].body.text, '后来输入');
  assert.notEqual(c.writes[2].body.save_id, c.writes[0].body.save_id);
});

test('notes unknown retry remains unavailable until a successful owner GET checks the original version', async () => {
  let first = true;
  const c = client({
    loadImpl: async (day, get) => {if (first) {first = false; return get(day);} throw new Error('合成回读失败');},
    putImpl: async () => {throw new Error('合成未知请求');}
  });
  await c.store.read(date); c.store.edit(date, '未确认草稿'); await c.store.save(date);
  assert.equal(c.store.page(date).pending.retryReady, false);
  await c.store.retryPending(date); assert.equal(c.writes.length, 1);
});

test('notes read races and date changes keep drafts and acknowledged versions in their own page', async () => {
  const gate = deferred(); let slow = true;
  const c = client({loadImpl: async (day, get) => {
    if (day === other && slow) {slow = false; await gate.promise;}
    return get(day);
  }});
  const old = c.store.read(other); await c.store.read(date);
  c.store.edit(date, '今天的草稿'); gate.resolve(); await old;
  assert.equal(c.store.page(date).draft, '今天的草稿'); assert.equal(c.store.page(other).draft, '');
  await c.store.read(date); assert.equal(c.store.page(date).draft, '今天的草稿');
  assert.equal(c.store.page(date).dirty, true);
});

test('notes stale GET cannot roll back a completed write or its version', async () => {
  const gate = deferred(), writeGate = deferred(); let delayed = false;
  const c = client({
    loadImpl: async (day, get) => {
      const result = get(day); if (delayed) await gate.promise; return result;
    },
    putImpl: async (day, body) => {await writeGate.promise; return value(day, {text: body.text, version: body.version + 1});}
  });
  await c.store.read(date); c.store.edit(date, '保存文字');
  const saving = c.store.save(date); delayed = true; const reading = c.store.read(date);
  writeGate.resolve(); await saving; gate.resolve(); await reading;
  assert.equal(c.store.page(date).version, 1); assert.equal(c.store.page(date).draft, '保存文字');
});

test('notes UTF8 bound counts bytes, preserves oversized draft and resumes only after reduction', async () => {
  const c = client(); await c.store.read(date);
  assert.equal(dailyNotesBytes('鱼'), 3); assert.equal(validDailyNotesDate('2026-02-30'), false);
  c.store.edit(date, '鱼'.repeat(21846)); await c.store.save(date); await c.fire();
  assert.equal(c.writes.length, 0); assert.equal(c.store.page(date).phase, 'oversize');
  c.store.edit(date, '鱼'.repeat(21845)); await c.store.save(date);
  assert.equal(c.writes.length, 1); assert.equal(dailyNotesBytes(c.writes[0].body.text), 65535);
});

test('notes deletion requires an explicit call and an unknown delete is reconciled without replay', async () => {
  const c = client({removeImpl: async (day, body, data) => {
    data.set(day, value(day, {deleted: true, version: body.version + 1}));
    throw new Error('删除响应丢失');
  }});
  c.data.set(date, value(date, {text: '待删除合成文字', version: 4}));
  await c.store.read(date); await c.store.deletePage(date);
  assert.equal(c.writes.length, 1); assert.equal(c.writes[0].deleted, true);
  assert.equal(c.store.page(date).deleted, true); assert.equal(c.store.page(date).draft, '');
  assert.equal(c.store.page(date).version, 5);
});

test('notes dispose cancels scheduled writes and isolates late results from the next identity', async () => {
  const gate = deferred(); const c = client({putImpl: () => gate.promise});
  await c.store.read(date); c.store.edit(date, '旧会话文字'); const pending = c.store.save(date);
  c.store.dispose(); gate.resolve(value(date, {text: '旧会话文字', version: 1})); await pending; await c.fire();
  assert.equal(c.store.page(date).version, 0);
  const next = client({canEdit: false}); await next.store.read(date);
  assert.equal(next.store.page(date).draft, ''); assert.equal(next.writes.length, 0);
});

test('notes view puts business text only into value/textContent and offers responsive isolated controls', () => {
  const nodes = new Map();
  const root = {dataset: {}, querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {value: '', textContent: '', innerHTML: '', dataset: {}, setAttribute() {}});
    return nodes.get(selector);
  }};
  const attack = '<img src=x onerror=alert(1)>';
  paintDailyNotes(root, {date, loaded: true, loading: false, canEdit: false, serverText: attack,
    draft: attack, phase: 'saved', dirty: false, version: 1, deleted: false},
  {dates: [date], hasMore: true});
  assert.equal(nodes.get('#notes-reader').textContent, attack);
  assert.equal(nodes.get('#notes-reader').innerHTML, '');
  assert.equal(nodes.get('#notes-editor').value, attack);
  assert.equal(nodes.get('#notes-editor').hidden, true);
  assert.equal(nodes.get('[data-notes-action="more"]').hidden, false);
  assert.match(renderDailyNotes(), /碎碎念/); assert.doesNotMatch(renderDailyNotes(), /contenteditable/);
});
