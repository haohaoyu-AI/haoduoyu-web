import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createNoteEntriesStore} from '../web/core/note-entries-state.mjs';
import {createNotesEditorView, noteDraftNeedsAttention, noteEditorCanCollapse} from '../web/core/notes-editor-view.mjs';
import {localDocument, documentState, isLocalDocument} from '../web/offline/document.mjs';

const day = '2026-10-26', yesterday = '2026-10-25', stamp = '2026-10-26T01:00:00Z';
const settled = () => new Promise(resolve => setImmediate(resolve));
function serverRow({id = randomUUID(), text = '线上原文', version = 1, deleted = false, category = 'life', date = day} = {}) {
  return {id, category, date, text, version, deleted, can_edit: true, created_at: stamp, updated_at: stamp,
    content_hash: 'actual-confirmed-server-hash-' + version + ':' + text, change_seq: version};
}
function client({category = 'life', writeImpl, records = new Map(), manualSave = false} = {}) {
  const timers = new Map(), writes = []; let timerId = 0, receiptReads = 0;
  const document = record => record.local ? localDocument(record) : structuredClone(record.server);
  const load = date => ({category, date, can_edit: true, entries: [...records.values()]
    .filter(record => (record.local || record.server).date === date && !(record.local || record.server).deleted).map(document)});
  const commit = (kind, id, body) => {
    const old = records.get(id), visible = old?.local || old?.server;
    assert.equal(body.version, visible?.version || 0, 'local operations use the previous durable CAS version');
    const local = {...visible, ...body, id, category: visible?.category || body.category || category,
      date: visible?.date || body.date, text: kind === 'put' ? body.text : visible.text,
      version: body.version + 1, deleted: kind === 'delete', can_edit: true, created_at: stamp, updated_at: stamp};
    if (body.label) local.labels_version = 1;
    delete local.save_id; delete local.content_hash; delete local.change_seq;
    const record = {local, server: old?.server || null, operation: {save_id: body.save_id, status: 'queued'}, conflict: null};
    records.set(id, record); return localDocument(record);
  };
  const write = async (kind, id, body, options) => {
    writes.push({kind, id, body: structuredClone(body), options});
    return writeImpl ? writeImpl({kind, id, body, options, commit}) : commit(kind, id, body);
  };
  const store = createNoteEntriesStore({category, manualSave, load: async date => load(date),
    loadEntry: async id => {
      if (!records.has(id)) throw Object.assign(new Error('not found'), {status: 404});
      return document(records.get(id));
    }, loadOperation: async () => { receiptReads++; return {found: false}; },
    put: (id, body, options) => write('put', id, body, options), remove: (id, body, options) => write('delete', id, body, options),
    restore: (id, body, options) => write('restore', id, body, options), uuid: randomUUID,
    setTimer: callback => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimer: id => timers.delete(id)});
  return {store, records, writes, timers, commit, get receiptReads() { return receiptReads; },
    async fire() { const callbacks = [...timers.values()]; timers.clear(); for (const fn of callbacks) fn(); await settled(); }};
}

test('manual drafts never write on input or reread; explicit send queues once and preserves later input', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const c = client({manualSave: true, writeImpl: async ({kind, id, body, commit}) => { await gate; return commit(kind, id, body); }});
  await c.store.read(day); const item = c.store.start(day);
  c.store.edit(item.id, '未发送的私有输入'); await c.fire(); await c.store.read(day); await c.fire();
  assert.equal(c.writes.length, 0); assert.equal(item.draft, '未发送的私有输入');
  const sending = c.store.save(item.id); await c.store.save(item.id);
  assert.equal(c.writes.length, 1);
  c.store.edit(item.id, '发送后继续输入'); release(); await sending; await c.fire();
  assert.equal(c.writes.length, 1); assert.equal(item.phase, 'dirty'); assert.equal(item.localQueued, true);
  assert.equal(item.draft, '发送后继续输入'); assert.equal(item.dirty, true);
});

test('three local durable saves keep server text/version/hash separate and use ordered local CAS versions', async () => {
  const c = client(); await c.store.read(day); const item = c.store.start(day);
  for (const text of ['第一稿', '第二稿', '第三稿']) { c.store.edit(item.id, text); await c.store.save(item.id); }
  assert.deepEqual(c.writes.map(write => write.body.version), [0, 1, 2]);
  assert.equal(new Set(c.writes.map(write => write.body.save_id)).size, 3);
  assert.equal(new Set(c.writes.map(write => write.id)).size, 1);
  assert.equal(item.version, 0); assert.equal(item.serverText, ''); assert.equal(item.contentHash, '');
  assert.equal(item.createdAt, null); assert.equal(item.updatedAt, null);
  assert.equal(item.localVersion, 3); assert.equal(item.durableText, '第三稿'); assert.equal(item.phase, 'queued');
  assert.equal(item.dirty, false); assert.equal(item.pending, null); assert.equal(c.receiptReads, 0);
  await c.fire(); assert.equal(c.writes.length, 3, 'durable queued text must not enqueue itself again');
});
test('editing a confirmed record preserves its actual baseline until a real server acknowledgement is read', async () => {
  const server = serverRow(), records = new Map([[server.id, {server}]]), c = client({records});
  await c.store.read(day); const item = c.store.entry(server.id);
  c.store.edit(item.id, '已落盘的新稿'); await c.store.save(item.id);
  assert.equal(item.version, 1); assert.equal(item.serverText, '线上原文'); assert.equal(item.contentHash, server.content_hash);
  assert.equal(item.localVersion, 2); assert.equal(item.durableText, '已落盘的新稿');
  records.set(item.id, {server: serverRow({id: item.id, text: item.durableText, version: 2})});
  await c.store.readOne(item.id);
  assert.equal(item.version, 2); assert.equal(item.serverText, '已落盘的新稿');
  assert.equal(item.localQueued, false); assert.equal(item.contentHash, records.get(item.id).server.content_hash);
});
test('queued collection hydration restores multiple independent entries and their original category/date', async () => {
  const c = client({category: 'work'}); await c.store.read(yesterday);
  const one = c.store.start(yesterday); c.store.edit(one.id, '工作第一条'); await c.store.save(one.id);
  const two = c.store.start(yesterday); assert.notEqual(one.id, two.id);
  c.store.edit(two.id, '工作第二条'); await c.store.save(two.id); await c.store.read(day);
  c.store.edit(one.id, '跨午夜继续工作'); await c.store.save(one.id);
  assert.equal(c.writes.at(-1).body.date, yesterday); assert.equal(c.writes.at(-1).body.category, 'work');
  const reloaded = client({category: 'work', records: c.records}); await reloaded.store.read(yesterday);
  assert.equal(reloaded.store.page(yesterday).ids.length, 2);
  const restored = reloaded.store.entry(one.id);
  assert.equal(restored.durableText, '跨午夜继续工作'); assert.equal(restored.version, 0); assert.equal(restored.localVersion, 2);
  assert.equal(restored.contentHash, ''); assert.equal(restored.phase, 'queued');
});
test('deleting an offline-created queued row sends a durable tombstone rather than discarding its local identity', async () => {
  const c = client(); await c.store.read(day); const item = c.store.start(day);
  c.store.edit(item.id, '离线新建后删除'); await c.store.save(item.id); await c.store.deleteEntry(item.id);
  assert.equal(c.writes.length, 2); assert.equal(c.writes[1].kind, 'delete'); assert.equal(c.writes[1].body.version, 1);
  assert.equal(c.store.entry(item.id), item); assert.equal(item.deleted, true); assert.equal(item.localVersion, 2);
  assert.equal(item.version, 0); assert.equal(item.phase, 'queued');
});
test('Chinese composition blocks local operations and queued acknowledgements preserve later input', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const c = client({writeImpl: async ({kind, id, body, commit}) => { await gate; return commit(kind, id, body); }});
  await c.store.read(day); const item = c.store.start(day);
  c.store.edit(item.id, '拼', {composing: true}); await c.fire(); await c.store.save(item.id); assert.equal(c.writes.length, 0);
  c.store.edit(item.id, '拼音完成'); const saving = c.store.save(item.id);
  c.store.edit(item.id, '继续输入', {composing: true}); release(); await saving;
  assert.equal(item.draft, '继续输入'); assert.equal(item.durableText, '拼音完成'); assert.equal(item.dirty, true);
  assert.equal(item.composing, true); await c.fire(); assert.equal(c.writes.length, 1);
  c.store.edit(item.id, '继续输入完成'); await c.store.save(item.id);
  assert.equal(c.writes[1].body.version, 1); assert.equal(item.durableText, '继续输入完成');
});
test('failed IndexedDB transactions and scope fencing preserve input without claiming an unknown network attempt', async () => {
  for (const code of ['OFFLINE_STORAGE_UNAVAILABLE', 'OFFLINE_CACHE_CHANGED', 'OFFLINE_SCOPE_CHANGED', 'OFFLINE_INVALID_MUTATION']) {
    const c = client({writeImpl: async () => { throw Object.assign(new Error('本机未保存'), {code}); }});
    await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '不能丢的输入'); await c.store.save(item.id);
    assert.equal(item.draft, '不能丢的输入'); assert.equal(item.dirty, true); assert.equal(item.pending, null);
    assert.equal(item.phase, 'error'); assert.equal(item.localVersion, 0); assert.equal(c.receiptReads, 0);
  }
});
test('HTTP JSON copies cannot impersonate a trusted local durable document', async () => {
  const c = client({writeImpl: async ({id, body}) => JSON.parse(JSON.stringify(localDocument({local:
    {id, ...body, version: 1, can_edit: true, deleted: false, created_at: stamp, updated_at: stamp}})))});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '伪造成功禁止'); await c.store.save(item.id);
  assert.equal(item.localQueued, false); assert.equal(item.version, 0); assert.equal(item.localVersion, 0);
  assert.equal(item.draft, '伪造成功禁止'); assert.equal(item.phase, 'unknown');
});
test('outbox-owned unknown documents do not duplicate legacy receipt reads or block later durable edits', async () => {
  const c = client({writeImpl: async ({kind, id, body, commit}) => {
    const document = commit(kind, id, body), state = documentState(document);
    return localDocument({...state, operation: {...state.operation, status: 'unknown'}});
  }});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '收据由队列核实'); await c.store.save(item.id);
  assert.equal(item.phase, 'queued'); assert.equal(item.localOperation.status, 'unknown'); assert.equal(c.receiptReads, 0);
  c.store.edit(item.id, '下一稿'); await c.store.save(item.id);
  assert.deepEqual(c.writes.map(write => write.body.version), [0, 1]); assert.equal(c.receiptReads, 0);
});
test('a legacy unknown retry transfers the original payload/save id with atomic-unknown transport intent', async () => {
  let first = true;
  const c = client({writeImpl: async ({kind, id, body, options, commit}) => {
    if (first) { first = false; throw new Error('原网络响应未知'); }
    assert.equal(options.offlineUnknown, true); return commit(kind, id, body);
  }});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '原尝试'); await c.store.save(item.id);
  assert.equal(item.phase, 'unknown'); assert.equal(item.pending.retryReady, true);
  c.store.edit(item.id, '后续输入'); await c.store.retryPending(item.id);
  assert.deepEqual(c.writes[1].body, c.writes[0].body); assert.equal(c.writes[1].id, c.writes[0].id);
  assert.equal(item.version, 0); assert.equal(item.localVersion, 1); assert.equal(item.draft, '后续输入'); assert.equal(item.dirty, true);
});
test('a failed durable takeover cannot erase an already uncertain original operation or replace its save id', async () => {
  let first = true;
  const c = client({writeImpl: async () => {
    if (first) { first = false; throw new Error('原请求结果未知'); }
    throw Object.assign(new Error('本机无法落盘'), {code: 'OFFLINE_STORAGE_UNAVAILABLE'});
  }});
  await c.store.read(day); const item = c.store.start(day); c.store.edit(item.id, '原始尝试'); await c.store.save(item.id);
  const operation = item.pending; assert.equal(operation.retryReady, true);
  c.store.edit(item.id, '后续草稿'); await c.store.retryPending(item.id);
  assert.equal(item.pending, operation); assert.equal(item.phase, 'unknown'); assert.equal(item.draft, '后续草稿');
  assert.equal(c.writes[1].body.save_id, c.writes[0].body.save_id);
  await c.store.save(item.id); assert.equal(c.writes.length, 2, 'an uncertain attempt must block a new save UUID');
});
test('trusted conflict documents preserve both bodies and cannot resurrect deleted server records via old inline choices', async () => {
  const server = serverRow({deleted: true, version: 2}), local = {...server, text: '本机原稿', deleted: false, version: 2};
  delete local.content_hash; delete local.change_seq;
  const conflict = {key: 'conflict-key', local, remote: server, reason: 'deleted'};
  const records = new Map([[server.id, {local, server, conflict, operation: {status: 'conflict', save_id: randomUUID()}}]]);
  const c = client({records}); await c.store.read(day); const item = c.store.entry(server.id);
  assert.equal(item.phase, 'conflict'); assert.equal(item.draft, '本机原稿'); assert.equal(item.remote.deleted, true);
  await c.store.useDraft(item.id); c.store.useServer(item.id);
  assert.equal(c.writes.length, 0); assert.equal(item.localConflict.key, 'conflict-key'); assert.equal(item.phase, 'conflict');
  assert.equal(item.draft, '本机原稿'); assert.equal(item.serverText, '');
});
test('accepting the server after conflict keeps newer unsaved input without silently uploading it', async () => {
  const server = serverRow({version: 3, text: '线上新稿'}), local = {...server, text: '冲突原稿', version: 2};
  const conflict = {key: 'conflict-key', local, remote: server, reason: 'version'};
  const records = new Map([[server.id, {local, server, conflict, operation: {status: 'conflict', save_id: randomUUID()}}]]);
  const c = client({records}); await c.store.read(day); const item = c.store.entry(server.id);
  c.store.edit(item.id, '冲突期间继续输入'); records.set(item.id, {server});
  await c.store.readOne(item.id); await c.fire();
  assert.equal(item.serverText, '线上新稿'); assert.equal(item.draft, '冲突期间继续输入');
  assert.equal(item.dirty, true); assert.equal(item.localQueued, false); assert.equal(item.phase, 'error');
  assert.match(item.error, /手动保存/); assert.equal(c.writes.length, 0);
});
test('queued editors can explicitly collapse and retain their text while focused or composing fields remain stable', async () => {
  const c = client(); await c.store.read(day); const item = c.store.start(day);
  c.store.edit(item.id, '已保存在本机'); await c.store.save(item.id);
  assert.equal(noteDraftNeedsAttention(item), false); assert.equal(noteEditorCanCollapse(item), true);
  const views = createNotesEditorView(), view = views.activate('life', day, item.id);
  views.requestCollapse('life', day, item.id, view.revision);
  assert.equal(views.sync('life', day, [item], null, {focused: true}).active, item.id);
  assert.equal(views.sync('life', day, [item], null, {composing: true}).active, item.id);
  assert.equal(views.sync('life', day, [item], null).active, '');
  assert.equal(item.durableText, '已保存在本机'); assert.equal(item.draft, '已保存在本机');
});
test('snapshot-only documents remain cached rather than queued and keep snapshot hashes out of the server baseline', async () => {
  const local = {...serverRow({version: 4, text: '完整快照中的记录'}), content_hash: 'snapshot-canonical-hash'};
  const records = new Map([[local.id, {local, server: null, operation: null}]]), c = client({records});
  await c.store.read(day); const item = c.store.entry(local.id);
  assert.equal(item.phase, 'cached'); assert.equal(item.localBacked, true); assert.equal(item.localQueued, false);
  assert.equal(item.version, 0); assert.equal(item.serverText, ''); assert.equal(item.contentHash, '');
  assert.equal(item.localVersion, 4); assert.equal(item.durableText, '完整快照中的记录'); assert.equal(noteEditorCanCollapse(item), true);
  c.store.edit(item.id, '离线修改快照记录'); await c.store.save(item.id);
  assert.equal(c.writes[0].body.version, 4); assert.equal(item.localVersion, 5); assert.equal(item.phase, 'queued');
  assert.equal(item.version, 0); assert.equal(item.contentHash, '');
});
test('a mismatched live read cannot clear queued text, and an older snapshot cannot downgrade a queued operation', async () => {
  const c = client(); await c.store.read(day); const item = c.store.start(day);
  c.store.edit(item.id, '队列原文'); await c.store.save(item.id);
  const queued = c.records.get(item.id);
  c.records.set(item.id, {server: serverRow({id: item.id, version: 2, text: '别人更新的文字'})});
  await c.store.readOne(item.id);
  assert.equal(item.localQueued, true); assert.equal(item.durableText, '队列原文'); assert.equal(item.serverText, '');
  c.records.set(item.id, {local: queued.local, server: null, operation: null}); await c.store.readOne(item.id);
  assert.equal(item.localQueued, true); assert.equal(item.localOperation.save_id, queued.operation.save_id);
  assert.equal(item.durableText, '队列原文');
});
test('local-only collection refresh propagates its read option while acknowledging a queued deletion tombstone', async () => {
  const c = client(); await c.store.read(day); const item = c.store.start(day);
  c.store.edit(item.id, '随后删除'); await c.store.save(item.id); await c.store.deleteEntry(item.id);
  const confirmed = serverRow({id: item.id, text: '随后删除', version: 2, deleted: true});
  let collectionOptions, entryOptions;
  const store = createNoteEntriesStore({category: 'life',
    load: async (date, options) => { collectionOptions = options; return {date, category: 'life', entries: [], can_edit: true}; },
    loadEntry: async (id, options) => { entryOptions = options; return confirmed; }, uuid: randomUUID,
    loadOperation: async () => ({found: false}), put: async () => {}, remove: async () => {}, restore: async () => {}});
  store.entries.set(item.id, item); store.page(day).ids.push(item.id);
  await store.read(day, {localOnly: true});
  assert.deepEqual(collectionOptions, {localOnly: true}); assert.deepEqual(entryOptions, {localOnly: true});
  assert.equal(item.localQueued, false); assert.equal(item.version, 2); assert.equal(item.deleted, true); assert.equal(item.phase, 'saved');
});
test('restoring a journal draft retains the latest live/queued evidence and requires a deliberate manual save', async () => {
  const server = serverRow({version: 4}), c = client({records: new Map([[server.id, {server}]])});
  await c.store.read(day); const item = c.store.entry(server.id);
  c.store.restoreDraft({id: item.id, category: 'life', date: day, draft: '重开后找回的未提交稿',
    version: 1, serverText: '旧的纯草稿基线', contentHash: 'not-trusted-json-hash', localVersion: 9, localQueued: true});
  await c.fire(); assert.equal(c.writes.length, 0); assert.equal(item.phase, 'error');
  assert.equal(item.draft, '重开后找回的未提交稿'); assert.equal(item.version, 4); assert.equal(item.contentHash, server.content_hash);
  assert.equal(item.localQueued, false); assert.equal(item.recoveredBaseline.contentHash, 'not-trusted-json-hash');
  c.store.edit(item.id, '用户正在输入的新稿', {composing: true});
  c.store.restoreDraft({id: item.id, category: 'life', date: day, draft: '迟到的旧journal'});
  assert.equal(item.draft, '用户正在输入的新稿'); assert.equal(item.composing, true);
});
test('journal recovery preserves an uncertain original operation without receipt reads or automatic resending', async () => {
  const c = client(); await c.store.read(day); const id = randomUUID(), saveId = randomUUID();
  const item = c.store.restoreDraft({id, category: 'life', date: day, draft: '后续未提交稿', version: 77,
    serverText: '不可信旧基线', contentHash: 'not-server-evidence', pending: {kind: 'put', version: 2, saveId, text: '原请求稿'}});
  await c.fire(); await c.store.save(id); assert.equal(c.writes.length, 0); assert.equal(c.receiptReads, 0);
  assert.equal(item.phase, 'unknown'); assert.equal(item.pending.saveId, saveId); assert.equal(item.pending.uncertain, true);
  assert.equal(item.pending.retryReady, false); assert.equal(item.version, 0); assert.equal(item.contentHash, '');
  assert.ok(c.store.page(day).ids.includes(id));
  const again = client(); await again.store.read(day);
  const restored = again.store.restoreDraft({...item, recoveredBaseline: item.recoveredBaseline});
  assert.equal(restored.recoveredBaseline.version, 77); assert.equal(restored.recoveredBaseline.contentHash, 'not-server-evidence');
  assert.equal(restored.version, 0); assert.equal(restored.contentHash, '');
  assert.equal(c.store.restoreDraft({id: randomUUID(), category: 'work', date: day, draft: '不属于此分类'}), undefined);
});
test('a stale dirty journal matching the durable document cannot reopen a clean queued editor', async () => {
  const c = client(); await c.store.read(day); const original = c.store.start(day);
  c.store.edit(original.id, '已经持久保存的稿'); await c.store.save(original.id);
  const reopened = client({records: c.records}); await reopened.store.read(day); const item = reopened.store.entry(original.id);
  const restored = reopened.store.restoreDraft({id: item.id, category: 'life', date: day, draft: item.durableText,
    version: 0, dirty: true, phase: 'dirty', pending: null});
  assert.equal(restored, item); assert.equal(item.phase, 'queued'); assert.equal(item.dirty, false);
  assert.equal(noteDraftNeedsAttention(item), false);
  assert.equal(createNotesEditorView().sync('life', day, [item], null).active, '');
  await reopened.fire(); assert.equal(reopened.writes.length, 0);
});
test('a recovered pending save already owned by the outbox cannot create a second unknown attempt', async () => {
  const c = client(); await c.store.read(day); const original = c.store.start(day);
  c.store.edit(original.id, '队列已经保存的原请求稿'); await c.store.save(original.id);
  const reopened = client({records: c.records}); await reopened.store.read(day); const item = reopened.store.entry(original.id);
  const pending = {kind: 'put', version: 0, saveId: item.localOperation.save_id, text: item.durableText};
  reopened.store.restoreDraft({id: item.id, category: 'life', date: day, draft: item.durableText, pending});
  assert.equal(item.phase, 'queued'); assert.equal(item.pending, null); assert.equal(item.dirty, false);
  const saveId = item.localOperation.save_id;
  reopened.store.restoreDraft({id: item.id, category: 'life', date: day, draft: 'API 返回前继续输入的草稿', pending});
  assert.equal(item.phase, 'error'); assert.equal(item.pending, null); assert.equal(item.dirty, true);
  assert.equal(item.localQueued, true); assert.equal(item.localOperation.save_id, saveId);
  assert.equal(item.draft, 'API 返回前继续输入的草稿');
  await reopened.fire(); assert.equal(reopened.writes.length, 0); assert.equal(reopened.receiptReads, 0);
});

test('explicit custom label remains bound to a draft and its first durable operation', async () => {
  const c = client({manualSave: true}); await c.store.read(day);
  const item = c.store.start(day, {label:'兴趣'}); c.store.edit(item.id, '一条记录');
  await c.fire(); assert.equal(c.writes.length, 0);
  await c.store.save(item.id);
  assert.equal(c.writes[0].body.label, '兴趣'); assert.equal(item.label, '兴趣');
  const reloaded = client({manualSave: true, records:c.records}); await reloaded.store.read(day);
  assert.equal(reloaded.store.entry(item.id).label, '兴趣');
  const bad = client({manualSave: true}); await bad.store.read(day);
  assert.throws(() => bad.store.start(day, {label:'工作'}), /标签无效/);
});

test('a mislabeled acknowledgement cannot mark an explicit label send complete', async () => {
  const c = client({manualSave:true, writeImpl: async ({id, body}) => {
    const {label, ...withoutLabel} = body;
    return localDocument({local:{...withoutLabel,id,version:1,can_edit:true,deleted:false,created_at:stamp,updated_at:stamp}});
  }});
  await c.store.read(day); const item = c.store.start(day,{label:'兴趣'});
  c.store.edit(item.id,'正文'); await c.store.save(item.id);
  assert.notEqual(item.phase,'queued'); assert.notEqual(item.phase,'saved');
  assert.equal(item.draft,'正文'); assert.equal(item.label,'兴趣'); assert.equal(item.pending.label,'兴趣');
});
