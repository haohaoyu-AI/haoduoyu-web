import test from 'node:test';
import assert from 'node:assert/strict';
import {createNoteEntriesStore} from '../web/core/note-entries-state.mjs';
import {noteEntryTime, renderDailyNotes} from '../web/pages/daily-notes.mjs';

const day = '2026-10-24', other = '2026-10-23', stamp = '2026-10-24T08:42:00.000Z';
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r;}); return {resolve, promise}; };
function client({category = 'life', canEdit = true, putImpl, loadImpl, operationImpl, removeImpl} = {}) {
  const data = new Map(), receipts = new Map(), timers = new Map(), writes = []; let serial = 0;
  const uuid = () => '00000000-0000-4000-8000-' + String(++serial).padStart(12, '0');
  const get = id => {
    if (!data.has(id)) throw Object.assign(new Error('不存在'), {status: 404});
    return structuredClone(data.get(id));
  };
  const collection = date => ({category, date, can_edit: canEdit,
    entries: [...data.values()].filter(v => v.category === category && v.date === date && !v.deleted).map(v => structuredClone(v))});
  const commit = (id, body, kind = 'put') => {
    const old = data.get(id), text = kind === 'put' ? body.text : old.text;
    const value = {id, category: old?.category || body.category, date: old?.date || body.date, text,
      version: body.version + 1, deleted: kind === 'delete', can_edit: canEdit,
      created_at: old?.created_at || stamp, updated_at: stamp,
      content_hash: id + ':' + (body.version + 1) + ':' + text + ':' + kind};
    data.set(id, value); receipts.set(body.save_id, {found: true, id, version: value.version, content_hash: value.content_hash});
    return structuredClone(value);
  };
  const store = createNoteEntriesStore({category,
    load: async date => loadImpl ? loadImpl(date, collection) : collection(date), loadEntry: async id => get(id),
    loadOperation: async id => operationImpl ? operationImpl(id, receipts) : structuredClone(receipts.get(id) || {found: false}),
    put: async (id, body) => {writes.push({id, body, kind: 'put'}); return putImpl ? putImpl(id, body, commit, data, receipts) : commit(id, body);},
    remove: async (id, body) => {writes.push({id, body, kind: 'delete'}); return removeImpl ? removeImpl(id, body, commit) : commit(id, body, 'delete');},
    restore: async (id, body) => {writes.push({id, body, kind: 'restore'}); return commit(id, body, 'restore');},
    uuid, setTimer: callback => {const id = ++serial; timers.set(id, callback); return id;}, clearTimer: id => timers.delete(id)
  });
  return {store, data, writes, receipts, timers, commit, async fire() {
    const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) callback(); await settle();
  }};
}

test('entry composer requires server capability, captures category/day, creates no blank server record', async () => {
  const visitor = client({canEdit: false}); await visitor.store.read(day);
  assert.equal(visitor.store.start(day), undefined); assert.equal(visitor.writes.length, 0);
  const c = client(); await c.store.read(day);
  const item = c.store.start(day); assert.equal(item.createdAt, null); assert.equal(c.store.start(day), item);
  c.store.edit(item.id, ' \n '); await c.fire(); await c.store.save(item.id); assert.equal(c.writes.length, 0);
  await c.store.read(other); c.store.start(other); c.store.edit(item.id, '跨日仍留在最初选择的一天'); await c.fire();
  assert.equal(c.writes[0].body.date, day); assert.equal(c.writes[0].body.category, 'life');
  assert.equal(item.createdAt, stamp); assert.equal(noteEntryTime(item.createdAt), '16:42');
});

test('multiple same-day entries keep separate ids and never replace a previous saved record', async () => {
  const c = client(); await c.store.read(day);
  const first = c.store.start(day); c.store.edit(first.id, '第一条'); await c.fire();
  const second = c.store.start(day); assert.notEqual(first.id, second.id);
  c.store.edit(second.id, '第二条'); await c.fire(); await c.store.read(day);
  assert.deepEqual(c.store.page(day).ids, [first.id, second.id]);
  assert.equal(c.data.get(first.id).text, '第一条'); assert.equal(c.data.get(second.id).text, '第二条');
});

test('entry IME composition pauses autosave until the committed text is available', async () => {
  const c = client(); await c.store.read(day); const item = c.store.start(day);
  c.store.edit(item.id, '拼', {composing: true}); await c.fire(); await c.store.save(item.id); assert.equal(c.writes.length, 0);
  c.store.edit(item.id, '拼音完成'); await c.fire(); assert.equal(c.writes.length, 1);
  assert.equal(c.writes[0].body.text, '拼音完成');
});

test('entry saves serialize CAS while input and navigation remain available', async () => {
  const gate = deferred(); let first = true, active = 0, maximum = 0;
  const c = client({putImpl: async (id, body, commit) => {
    maximum = Math.max(maximum, ++active); if (first) {first = false; await gate.promise;} active--; return commit(id, body);
  }});
  await c.store.read(day); const item = c.store.start(day);
  c.store.edit(item.id, '第一稿'); await c.fire(); c.store.edit(item.id, '继续输入'); await c.fire();
  await c.store.read(other); assert.equal(c.writes.length, 1); assert.equal(item.draft, '继续输入');
  gate.resolve(); await settle(); await c.fire();
  assert.equal(maximum, 1); assert.equal(c.writes.length, 2); assert.equal(c.writes[1].body.version, 1);
  assert.equal(item.draft, '继续输入'); assert.equal(item.dirty, false);
});

test('a stale complete collection cannot hide or roll back an acknowledged entry', async () => {
  const gate = deferred(); let slow = false;
  const c = client({loadImpl: async (date, collection) => {const snapshot = collection(date); if (slow) await gate.promise; return snapshot;}});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '已保存');
  slow = true; const reading = c.store.read(day); await c.store.save(item.id);
  gate.resolve(); await reading;
  assert.equal(item.version, 1); assert.equal(item.serverText, '已保存'); assert.ok(c.store.page(day).ids.includes(item.id));
});

test('a delayed collection cannot roll back a newer entry GET', async () => {
  const gate = deferred(); let slow = false;
  const c = client({loadImpl: async (date, collection) => {const value = collection(date); if (slow) await gate.promise; return value;}});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '版本一'); await c.store.save(item.id);
  slow = true; const reading = c.store.read(day);
  c.commit(item.id, {category: 'life', date: day, text: '版本二', version: 1, save_id: 'external'});
  await c.store.readOne(item.id); gate.resolve(); await reading;
  assert.equal(item.version, 2); assert.equal(item.draft, '版本二');
});

test('the per-day capacity limit preserves an editable draft that can be retried or discarded', async () => {
  const c = client({putImpl: async () => {throw Object.assign(new Error('当日记录已满'), {status: 409, code: 'NOTES_LIMIT'});}});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '待处理草稿'); await c.store.save(item.id);
  assert.equal(item.phase, 'error'); assert.equal(item.draft, '待处理草稿'); assert.equal(item.pending, null);
  await c.store.deleteEntry(item.id); assert.equal(c.store.entry(item.id), undefined);
});

test('entry 409 preserves the latest draft and requires explicit server-version resolution', async () => {
  let first = true;
  const c = client({putImpl: async (id, body, commit) => {
    if (first) {first = false; commit(id, {...body, text: '另一处的记录', save_id: 'external'}); throw Object.assign(new Error('版本冲突'), {status: 409});}
    return commit(id, body);
  }});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '我的草稿'); await c.store.save(item.id);
  assert.equal(item.phase, 'conflict'); assert.equal(item.draft, '我的草稿'); assert.equal(item.remote.text, '另一处的记录');
  c.store.edit(item.id, '后续草稿'); await c.fire(); assert.equal(c.writes.length, 1);
  await c.store.useDraft(item.id); assert.equal(c.writes[1].body.version, 1); assert.equal(item.serverText, '后续草稿');
});

test('unknown committed entry uses its operation receipt, without resending the write', async () => {
  const c = client({putImpl: async (id, body, commit) => {commit(id, body); throw new Error('响应丢失');}});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '已提交'); await c.store.save(item.id);
  assert.equal(c.writes.length, 1); assert.equal(item.phase, 'saved'); assert.equal(item.version, 1); assert.equal(item.dirty, false);
});

test('same text from a different operation is a conflict, never a false successful acknowledgement', async () => {
  const c = client({putImpl: async (id, body, commit) => {commit(id, {...body, save_id: 'other-operation'}); throw new Error('本请求未确认');}});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '相同的文字'); await c.store.save(item.id);
  assert.equal(item.phase, 'conflict'); assert.equal(item.version, 0); assert.equal(item.draft, '相同的文字'); assert.equal(c.writes.length, 1);
});

test('unknown entry retry reuses exact id/version/save_id/text before saving later input', async () => {
  let first = true;
  const c = client({putImpl: async (id, body, commit) => {if (first) {first = false; throw new Error('请求未到');} return commit(id, body);}});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '原保存'); await c.store.save(item.id);
  assert.equal(item.phase, 'unknown'); assert.equal(item.pending.retryReady, true);
  c.store.edit(item.id, '后续输入'); await c.fire(); assert.equal(c.writes.length, 1);
  await c.store.retryPending(item.id); assert.deepEqual(c.writes[1], c.writes[0]); assert.equal(item.draft, '后续输入');
  await c.fire(); assert.equal(c.writes.length, 3); assert.equal(c.writes[2].body.version, 1); assert.equal(item.serverText, '后续输入');
});

test('failed operation verification cannot enable retry or claim success', async () => {
  const c = client({putImpl: async () => {throw new Error('响应未知');}, operationImpl: async () => {throw new Error('凭据不可用');}});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '保留'); await c.store.save(item.id);
  assert.equal(item.phase, 'unknown'); assert.equal(item.pending.retryReady, false); await c.store.retryPending(item.id);
  assert.equal(c.writes.length, 1); assert.equal(item.draft, '保留');
});

test('entry bytes are bounded without discarding oversize text; blank discard never sends DELETE', async () => {
  const c = client(); await c.store.read(day); const item = c.store.start(day);
  c.store.edit(item.id, '鱼'.repeat(21846)); await c.fire(); await c.store.save(item.id);
  assert.equal(item.phase, 'oversize'); assert.equal(c.writes.length, 0);
  c.store.edit(item.id, '缩短后'); await c.fire(); assert.equal(c.writes.length, 1);
  const blank = c.store.start(day); await c.store.deleteEntry(blank.id); assert.equal(c.store.entry(blank.id), undefined); assert.equal(c.writes.length, 1);
});

test('entry delete response loss is verified and explicit restore uses the tombstone version', async () => {
  const c = client({removeImpl: async (id, body, commit) => {commit(id, body, 'delete'); throw new Error('删除响应丢失');}});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '要保留的恢复内容'); await c.store.save(item.id);
  await c.store.deleteEntry(item.id); assert.equal(item.phase, 'saved'); assert.equal(item.deleted, true); assert.equal(c.writes.length, 2);
  await c.store.restoreEntry(item.id); assert.equal(c.writes[2].body.version, 2); assert.equal(item.deleted, false); assert.equal(item.draft, '要保留的恢复内容');
});

test('entry disposal fences late acknowledgements and scheduled writes', async () => {
  const gate = deferred(); const c = client({putImpl: async (id, body, commit) => {await gate.promise; return commit(id, body);}});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '旧身份'); const saving = c.store.save(item.id);
  c.store.dispose(); gate.resolve(); await saving; await c.fire(); assert.equal(item.version, 0); assert.equal(c.writes.length, 1);
});

test('timestamp uses actual server creation in Shanghai and compatibility copy invents no time', () => {
  assert.equal(noteEntryTime('2026-10-24T16:03:00Z'), '00:03'); assert.equal(noteEntryTime(null), '');
  assert.match(renderDailyNotes(), /原有记录/); assert.doesNotMatch(renderDailyNotes(), /未自动分析或分类/);
});
