import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {createOfflineRuntime} from '../web/offline/runtime.mjs';
import {createMemosStore} from '../web/core/memos-state.mjs';
import {isLocalDocument, documentState} from '../web/offline/document.mjs';
import {createOutbox} from '../web/offline/outbox.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';

const scope = 'a'.repeat(64), owner = '10000000-0000-4000-8000-000000000001';
const stamp = '2026-10-26T01:00:00.000Z';
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const storage = () => { const values = new Map(); return {getItem: key => values.get(key), setItem: (key, value) => values.set(key, value)}; };
function snapshot(source, date = null) {
  const data = Object.fromEntries(['todos', 'life_notes', 'work_notes', 'work_reminders', 'memo_groups', 'memos'].map(key => [key, []]));
  for (const [kind, records] of [['groups', source.groups], ['notes', source.notes]]) for (const row of records.values()) {
    const value = {entity_id: (kind === 'groups' ? 'memo-group:' : 'memo-note:') + row.id,
      entity_type: kind === 'groups' ? 'memo_group' : 'memo_note', source: kind === 'groups' ? 'memo_group' : 'memo_note',
      source_id: row.id, date: null, version: row.version, change_seq: row.change_seq, created_at: row.created_at,
      updated_at: row.updated_at, deleted_at: row.deleted_at,
      ...(row.deleted_at ? {} : {title: row.title, position: row.position,
        ...(kind === 'notes' ? {group_id: row.group_id, body: row.body} : {})})};
    data[kind === 'groups' ? 'memo_groups' : 'memos'].push({...value, content_hash: hash(value)});
  }
  for (const rows of Object.values(data)) rows.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  return projectWorkbenchSnapshot(data, {scope_id: scope, generated_at: stamp, date}, snapshotBudget());
}
function setup(t) {
  const db = createMemoryDB(), clock = {value: Date.parse(stamp)}, calls = [];
  const source = {online: true, groups: new Map(), notes: new Map(), receipts: new Map(), loseGroup: false, loseNote: false};
  async function liveRequest(path, options = {}) {
    if (!source.online) throw Object.assign(new Error('offline'), {code: 'NETWORK_UNAVAILABLE'});
    calls.push({path, method: options.method || 'GET', body: options.body && structuredClone(options.body)});
    if (path === '/auth/me') return {id: owner, username: 'synthetic-memo-user', csrfToken: 'never-persist-this'};
    if (path.startsWith('/workbench-snapshot')) return snapshot(source, path.includes('?') ? '2026-10-26' : null);
    if (path.startsWith('/memos/operations/')) return source.receipts.get(path.split('/').at(-1)) || {found: false};
    if (path === '/memos') return {groups: [...source.groups.values()],
      notes: [...source.notes.values()].map(({body, ...row}) => row), can_edit: true};
    const [, , kind, id] = path.split('/'), rows = source[kind], old = rows?.get(id);
    if (!options.method) {
      if (!old) throw Object.assign(new Error('missing'), {status: 404});
      return {...old, can_edit: true};
    }
    const body = options.body;
    if ((old?.version || 0) !== body.version) throw Object.assign(new Error('CAS conflict'), {status: 409, code: 'VERSION_CONFLICT'});
    if (old?.deleted_at) throw Object.assign(new Error('deleted'), {status: 409, code: 'MEMO_DELETED'});
    if (kind === 'notes' && !source.groups.has(body.group_id)) throw new Error('parent was not confirmed');
    const row = {id, title: body.title, position: body.position, version: body.version + 1, change_seq: body.version + 1,
      created_at: old?.created_at || stamp, updated_at: stamp, deleted_at: null,
      ...(kind === 'notes' ? {group_id: body.group_id, body: body.body} : {})};
    rows.set(id, row);
    source.receipts.set(body.save_id, {found: true, kind, id, version: row.version, entity_hash: hash(row)});
    if (kind === 'groups' && source.loseGroup || kind === 'notes' && source.loseNote) {
      source.loseGroup = false; source.loseNote = false; throw new Error('lost after commit');
    }
    return {...row, can_edit: true};
  }
  async function request(path, options = {}) {
    const value = await liveRequest(path, options);
    return source.after ? source.after(path, options, value) : value;
  }
  const app = createOfflineRuntime({db, request, online: () => source.online, now: () => clock.value});
  const makeStore = (options = {}) => {
    const store = createMemosStore({request: app.call, readLocal: app.readMemo, durable: true,
      ownerId: owner, storage: storage(), draftScope: randomUUID(), online: () => source.online, delay: 60000, ...options});
    t.after(() => store.dispose()); return store;
  };
  t.after(() => app.stop());
  return {db, clock, calls, source, app, makeStore, request};
}
async function initialize(f, options) { await f.app.call('/auth/me'); const store = f.makeStore(options); await store.load(); return store; }

test('memo local durability keeps real server version separate through three edits and close/reopen', async t => {
  const f = setup(t), store = await initialize(f); f.source.online = false;
  const group = await store.createGroup('本机分组'), id = await store.createNote(group, '本机标题');
  for (const body of ['第一稿', '第二稿', '第三稿']) { store.edit('body', body); await store.saveNote(); }
  const draft = store.drafts.get(id);
  assert.equal(draft.phase, 'queued'); assert.equal(draft.version, 0); assert.equal(draft.server, null);
  assert.equal(draft.localVersion, 4); assert.equal(draft.body, '第三稿'); assert.equal(draft.dirty, false);
  assert.equal((await f.app.queue()).operations.length, 5);
  assert.equal(f.calls.filter(row => row.method === 'PUT').length, 0);
  store.dispose(); const reopened = f.makeStore(); await reopened.load();
  assert.equal(reopened.drafts.get(id).body, '第三稿'); assert.equal(reopened.drafts.get(id).localVersion, 4);
  f.source.online = true; await f.app.sync(); await reopened.load({local: true});
  assert.equal(f.source.notes.get(id).body, '第三稿'); assert.equal(f.source.notes.get(id).version, 4);
  assert.equal(reopened.drafts.get(id).version, 4); assert.equal(reopened.drafts.get(id).localQueued, false);
  assert.equal((await f.app.queue()).operations.length, 0);
});

test('unknown parent group blocks note sends despite its physical server row and snapshot presence', async t => {
  const f = setup(t), store = await initialize(f); f.source.online = false;
  const group = await store.createGroup('先确认分组'), id = await store.createNote(group, '依赖笔记');
  const queued = (await f.app.queue()).operations;
  assert.deepEqual(queued.find(row => row.entity_type === 'memo_note').depends_on, ['memo-group:' + group]);
  assert.equal(queued.find(row => row.entity_type === 'memo_note').protocol, 2);
  f.source.online = true; f.source.loseGroup = true; await f.app.sync();
  assert.ok(f.source.groups.has(group)); assert.equal(f.source.notes.has(id), false);
  assert.equal((await f.app.queue()).operations.find(row => row.entity_type === 'memo_group').status, 'unknown');
  const consumer = createOutbox({db: f.db, request: f.request, getScope: () => scope,
    enabledTypes: ['memo_group', 'memo_note'], supportedProtocols: [1, 2], supportedDependencies: true});
  assert.deepEqual((await consumer.retryable(scope)).map(row => row.entity_type), ['memo_group']);
  assert.equal(f.calls.filter(row => row.path === '/memos/notes/' + id && row.method === 'PUT').length, 0);
  f.clock.value += 5000; await f.app.sync();
  assert.ok(f.source.notes.has(id)); assert.equal((await f.app.queue()).operations.length, 0);
  const paths = f.calls.map(row => row.path);
  assert.ok(paths.indexOf('/memos/operations/' + queued[0].save_id) < paths.indexOf('/memos/notes/' + id));
});

test('complete snapshot supports unopened memo detail offline without inventing edit capability', async t => {
  const f = setup(t), group = randomUUID(), id = randomUUID();
  f.source.groups.set(group, {id: group, title: '完整快照组', position: 0, version: 1, change_seq: 1,
    created_at: stamp, updated_at: stamp, deleted_at: null});
  f.source.notes.set(id, {id, group_id: group, title: '未打开的正文', body: '快照中完整正文', position: 0, version: 1,
    change_seq: 1, created_at: stamp, updated_at: stamp, deleted_at: null});
  await f.app.call('/auth/me'); await f.app.sync(); f.source.online = false;
  const index = await f.app.call('/memos'), note = await f.app.call('/memos/notes/' + id);
  assert.equal(index.notes.length, 1); assert.equal(note.body, '快照中完整正文');
  assert.equal(index.can_edit, false); assert.equal(note.can_edit, false);
  assert.equal(f.calls.filter(row => row.path.startsWith('/memos')).length, 0);
});

test('IME composition remains in the editor until explicitly committed; durable marker is not a server ACK', async t => {
  const f = setup(t), store = await initialize(f, {delay: 1}); f.source.online = false;
  const group = await store.createGroup('合成组'), id = await store.createNote(group, '合成笔记');
  const before = (await f.app.queue()).operations.length;
  store.edit('body', '输入法中间态', {composing: true});
  await store.saveNote(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await f.app.queue()).operations.length, before);
  store.edit('body', '输入法完整正文', {composing: false}); await new Promise(resolve => setTimeout(resolve, 10));
  const value = await f.app.readMemo('/memos/notes/' + id);
  assert.equal(isLocalDocument(value), true); assert.equal(documentState(value).server, null);
  assert.equal(documentState(value).local.body, '输入法完整正文'); assert.equal(value.content_hash, undefined);
  assert.equal(store.drafts.get(id).version, 0); assert.equal(store.drafts.get(id).phase, 'queued');
});

test('offline X deletion stays online-only and cannot discard a queued note body', async t => {
  const f = setup(t), store = await initialize(f); f.source.online = false;
  const group = await store.createGroup('合成组'), id = await store.createNote(group, '保留笔记');
  store.edit('body', '不能假删除的正文'); await store.saveNote(); await store.removeNote(id);
  assert.equal(f.calls.filter(row => row.method === 'DELETE').length, 0);
  assert.equal(store.drafts.get(id).body, '不能假删除的正文'); assert.equal(store.drafts.get(id).deleted_at, null);
  assert.equal((await f.app.queue()).operations.filter(row => row.entity_type === 'memo_note').length, 2);
});

test('a recovered old unknown PUT imports its original save UUID atomically and only checks the real receipt', async t => {
  const f = setup(t), group = randomUUID(), id = randomUUID(), saved = storage(), draftScope = randomUUID();
  f.source.groups.set(group, {id: group, title: '既有组', position: 0, version: 1, change_seq: 1,
    created_at: stamp, updated_at: stamp, deleted_at: null});
  f.source.notes.set(id, {id, group_id: group, title: '既有笔记', body: '既有正文', position: 0, version: 1,
    change_seq: 1, created_at: stamp, updated_at: stamp, deleted_at: null});
  await f.app.call('/auth/me'); await f.app.call('/memos');
  const legacy = f.makeStore({durable: false, storage: saved, draftScope, request: async (path, options) => {
    const result = await f.request(path, options);
    if (options?.method === 'PUT') throw new Error('old save response lost');
    return result;
  }});
  await legacy.load(); legacy.edit('body', '旧页已提交的正文'); await legacy.saveNote();
  const original = structuredClone(legacy.drafts.get(id).pending), resume = legacy.pauseAutosave();
  await legacy.flushDrafts(); resume(); legacy.dispose();
  assert.equal(f.source.notes.get(id).version, 2);
  f.source.online = false;
  const reopened = f.makeStore({storage: saved, draftScope}); await reopened.load();
  await reopened.checkNote();
  const [operation] = (await f.app.queue()).operations;
  assert.equal(operation.status, 'unknown'); assert.equal(operation.save_id, original.body.save_id);
  assert.deepEqual(operation.body, original.body);
  f.source.online = true; await f.app.sync(); await reopened.load({local: true});
  assert.equal((await f.app.queue()).operations.length, 0);
  assert.equal(f.calls.filter(row => row.path === '/memos/notes/' + id && row.method === 'PUT').length, 1);
  assert.equal(reopened.drafts.get(id).version, 2); assert.equal(reopened.drafts.get(id).body, '旧页已提交的正文');
});

test('invalid persistent memo content stays editable in the draft and is never falsely queued or sent', async t => {
  const f = setup(t), store = await initialize(f); f.source.online = false;
  const group = await store.createGroup('合成组'), id = await store.createNote(group, '合成笔记');
  const before = (await f.app.queue()).operations.length;
  store.edit('title', '标题含\0控制字符'); await store.saveNote();
  const item = store.drafts.get(id);
  assert.equal(item.phase, 'error'); assert.equal(item.title, '标题含\0控制字符'); assert.equal(item.pending, null);
  assert.equal((await f.app.queue()).operations.length, before);
  assert.equal(f.calls.filter(row => row.method === 'PUT').length, 0);
});

test('typing immediately into a just-created memo preserves keystrokes before its durable acknowledgement returns', async t => {
  const f = setup(t), store = await initialize(f); f.source.online = false;
  const group = await store.createGroup('合成组');
  const creating = store.createNote(group, '新笔记');
  store.edit('body', '创建确认前已输入');
  const id = await creating;
  assert.equal(store.drafts.get(id).body, '创建确认前已输入');
  assert.equal(store.drafts.get(id).dirty, true);
  await store.saveNote();
  const value = await f.app.readMemo('/memos/notes/' + id);
  assert.equal(documentState(value).local.body, '创建确认前已输入');
});

test('a delayed memo HTTP read cannot replace a newly acknowledged local edit and retries the fresh baseline once', async t => {
  const f = setup(t), group = randomUUID(), id = randomUUID();
  f.source.groups.set(group, {id: group, title: '既有组', position: 0, version: 1, change_seq: 1,
    created_at: stamp, updated_at: stamp, deleted_at: null});
  f.source.notes.set(id, {id, group_id: group, title: '既有笔记', body: '读取开始时的旧稿', position: 0, version: 1,
    change_seq: 1, created_at: stamp, updated_at: stamp, deleted_at: null});
  const store = await initialize(f);
  let release, captured;
  const waiting = new Promise(resolve => { captured = resolve; });
  f.source.after = (path, options, value) => {
    if (path === '/memos/notes/' + id && !options.method && !release) {
      return new Promise(resolve => { release = () => resolve(value); captured(); });
    }
    return value;
  };
  const reading = f.app.call('/memos/notes/' + id); await waiting;
  store.edit('body', '读取尚未返回时已确认的新稿'); await store.saveNote(); await f.app.sync();
  assert.equal(f.source.notes.get(id).version, 2);
  release(); const result = await reading;
  assert.equal(result.version, 2); assert.equal(result.body, '读取尚未返回时已确认的新稿');
  assert.equal((await f.app.readMemo('/memos/notes/' + id)).body, '读取尚未返回时已确认的新稿');
  assert.equal((await f.app.queue()).operations.length, 0);
  assert.equal((await f.app.queue()).conflicts.length, 0);
});

test('memo dependency protocol requires its enabled type, protocol two and explicit dependency capability', async () => {
  const db = createMemoryDB(), group = randomUUID(), id = randomUUID(), saveId = randomUUID();
  const parent = {id: group, title: '已确认父组', position: 0, version: 1, deleted_at: null};
  await db.transaction(['entities'], 'readwrite', tx => tx.put('entities', {
    key: entityKey(scope, 'memo-group:' + group), scope, entity_id: 'memo-group:' + group, server: parent}));
  const options = {db, getScope: () => scope, enabledTypes: ['memo_note'], supportedProtocols: [1, 2],
    supportedDependencies: true, request: async () => { throw new Error('must not send while unsupported'); }};
  const input = {scope, entity_type: 'memo_note', entity_id: id, protocol: 2, depends_on: ['memo-group:' + group],
    method: 'PUT', body: {group_id: group, title: '保留正文', body: '原操作与正文都必须保留', position: 0, version: 0, save_id: saveId}};
  const writer = createOutbox(options); await writer.enqueue(input);
  const read = store => db.transaction([store], 'readonly', tx => tx.getAll(store));
  const before = {entities: await read('entities'), outbox: await read('outbox')};
  for (const capabilities of [
    {enabledTypes: ['todo', 'template', 'note_entry'], supportedProtocols: [1]},
    {supportedProtocols: [1]}, {supportedDependencies: false}, {enabledTypes: ['memo_group']}
  ]) {
    let sends = 0;
    const old = createOutbox({...options, ...capabilities, request: async () => { sends++; }});
    assert.equal((await old.drain()).phase, 'upgrade-required'); assert.equal(sends, 0);
    assert.deepEqual(await old.retryable(scope), []);
    assert.deepEqual({entities: await read('entities'), outbox: await read('outbox')}, before);
  }
  await assert.rejects(writer.enqueue({...input, entity_id: randomUUID(), body: {...input.body, save_id: randomUUID()},
    depends_on: ['memo-group:' + randomUUID()]}), error => error.code === 'OFFLINE_UPGRADE_REQUIRED');
  let sends = 0;
  const enabled = createOutbox({...options, request: async (path, request) => {
    sends++; assert.equal(path, '/memos/notes/' + id); assert.equal(request.body.save_id, saveId);
    return {id, ...request.body, version: 1, deleted_at: null};
  }});
  assert.equal((await enabled.drain()).phase, 'synced'); assert.equal(sends, 1);
  assert.deepEqual(await read('outbox'), []);
});

test('refresh verifies private memo drafts, rejects quota or readback loss, and reopens without publishing unfinished IME', async t => {
  const f = setup(t), backing = storage(), draftScope = randomUUID();
  let quota = false, loseReadback = false;
  const saved = {getItem: key => loseReadback ? null : backing.getItem(key),
    setItem: (key, value) => { if (quota) throw new Error('synthetic quota'); backing.setItem(key, value); }};
  const store = await initialize(f, {storage: saved, draftScope, delay: 1}); f.source.online = false;
  const group = await store.createGroup('刷新组'), id = await store.createNote(group, '私有草稿');
  const before = (await f.app.queue()).operations;
  store.edit('body', '尚在输入法中，必须私下保留', {composing: true});
  const resume = store.pauseAutosave(); await store.flushDrafts();
  const archive = JSON.parse(saved.getItem('haoduoyu.memos.drafts.v1.' + owner + '.' + draftScope));
  assert.equal(archive.drafts[0].body, '尚在输入法中，必须私下保留'); assert.equal(archive.drafts[0].composing, true);
  quota = true; await assert.rejects(store.flushDrafts(), /无法保留草稿/); quota = false;
  loseReadback = true; await assert.rejects(store.flushDrafts(), /无法保留草稿/); loseReadback = false;
  resume(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual((await f.app.queue()).operations, before);
  store.dispose(); const reopened = f.makeStore({storage: saved, draftScope, delay: 1}); await reopened.load();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(reopened.drafts.get(id).body, '尚在输入法中，必须私下保留');
  assert.equal(reopened.drafts.get(id).autosaveHeld, true); assert.deepEqual((await f.app.queue()).operations, before);
  const resumeAgain = reopened.pauseAutosave();
  reopened.edit('body', '尚在输入法中，必须私下保留', {retainPrivate: true}); await reopened.flushDrafts(); resumeAgain();
  await reopened.selectNote(id, {local: true}); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(reopened.drafts.get(id).autosaveHeld, true); assert.deepEqual((await f.app.queue()).operations, before);
  await reopened.saveNote();
  assert.equal((await f.app.queue()).operations.at(-1).body.body, '尚在输入法中，必须私下保留');
});
