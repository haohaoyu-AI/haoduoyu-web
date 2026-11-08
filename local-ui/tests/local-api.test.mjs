import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDB} from '../frontend/web/offline/db.mjs';
import {createLocalApi, LOCAL_DATABASE_NAME, LOCAL_OWNER_ID, LOCAL_SCOPE} from '../frontend/web/local/api.mjs';

const today = '2026-11-08';
const time = Date.parse(today + 'T04:00:00Z');
const ID = number => '10000000-0000-4000-8000-' + String(number).padStart(12, '0');
const fixture = (options = {}) => {const db = createMemoryDB(); return {db, api: createLocalApi({db, now: () => time, ...options})};};
const request = (method, body, headers) => ({method, body, ...(headers ? {headers} : {})});
const creates = (id, text = '测试待办') => ({id: ID(id), date: today, text});
const note = (id, version = 0, text = '仅测试，虚构内容。') => ({category: 'life', date: today, text, version, save_id: ID(id), labels: ['生活', '学习']});
const group = (saveId, version = 0, title = '测试分组') => ({title, position: 1, version, save_id: ID(saveId)});
const memo = (saveId, version = 0, body = '虚构本机笔记') => ({title: '测试笔记', group_id: ID(1), body, position: 1, version, save_id: ID(saveId)});
const rejects = (work, code) => assert.rejects(work, error => error.code === code);

 test('local identity, isolated namespace and true empty collections', async () => {
  const {db, api} = fixture();
  assert.notEqual(LOCAL_DATABASE_NAME, 'haoduoyu-offline');
  assert.equal((await api('/auth/me')).id, LOCAL_OWNER_ID);
  assert.deepEqual(await api('/accounts'), []);
  assert.equal((await api('/auth/me')).localOnly, true);
  assert.deepEqual(await api('/todos?date=' + today, {envelope: true}), {data: {date: today, today, completed_mode: 'strike', preferences_version: 0, items: []}});
  assert.equal((await api('/workbench-snapshot/index?version=2')).scope_id, LOCAL_SCOPE);
  await db.transaction(['entities'], 'readwrite', tx => tx.put('entities', {key: 'foreign', scope: 'remote', kind: 'todo', value: creates(7)}));
  assert.equal((await api('/todos?date=' + today)).items.length, 0);
 });
 test('todo add/replay mismatch, complete, note and soft delete/restore', async () => {
  const {api} = fixture(); const input = creates(1);
  const saved = await api('/todos', request('POST', input));
  assert.equal(saved.version, 1); assert.equal(saved.completed, false);
  assert.deepEqual(await api('/todos', request('POST', input)), saved);
  await rejects(api('/todos', request('POST', {...input, text: 'different'})), 'IDEMPOTENCY_CONFLICT');
  let row = await api('/todos/' + ID(1), request('PATCH', {completed: true, version: 1}));
  assert.equal(row.version, 2);
  await rejects(api('/todos/' + ID(1), request('PATCH', {completed: false, version: 1})), 'IDEMPOTENCY_CONFLICT');
  row = await api('/todos/' + ID(1) + '/note', request('PATCH', {note: '备注\n第二行', version: 2}));
  assert.equal(row.note, '备注\n第二行');
  row = await api('/todos/' + ID(1), request('DELETE', {date: today, version: 3}));
  assert.ok(row.deleted_at); assert.equal((await api('/todos?date=' + today)).items.length, 0);
  row = await api('/todos/' + ID(1) + '/restore', request('POST', {date: today, version: 4}));
  assert.equal(row.deleted_at, null); assert.equal(row.note, '备注\n第二行'); assert.equal(row.version, 5);
 });
 test('strict validation rejects wrong IDs, dates, versions, fields, unsafe text', async () => {
  const {api} = fixture();
  for (const body of [{...creates(1), id: 'no'}, {...creates(1), date: '2026-02-30'}, {...creates(1), extra: true}, {...creates(1), text: '\ud800'}])
    await rejects(api('/todos', request('POST', body)), 'VALIDATION_ERROR');
  await api('/todos', request('POST', creates(1)));
  for (const version of [0, -1, 1.2, '1', Number.MAX_SAFE_INTEGER]) await rejects(api('/todos/' + ID(1), request('PATCH', {completed: true, version})), 'VALIDATION_ERROR');
  await rejects(api('/todos?date=' + today + '&date=' + today), 'VALIDATION_ERROR');
  await rejects(api('/todos', request('POST', JSON.parse('{"id":"' + ID(8) + '","password":"secret"}'))), 'VALIDATION_ERROR');
 });
 test('unknown endpoints never return invented successes or transmit', async () => {
  const {api} = fixture(); const oldFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = () => {calls++; throw Error('Network forbidden');};
  try {
    for (const path of ['/overview', '/articles', '/memos/unsupported']) await rejects(api(path), 'LOCAL_NOT_IMPLEMENTED');
    await rejects(api('/auth/logout', {method: 'POST'}), 'LOCAL_NOT_IMPLEMENTED');
    for (const path of ['https://example.com/todos', '//example.com/todos', '/todos#x', '/todos/../auth/me', '/todos?x=1']) await rejects(api(path), 'VALIDATION_ERROR');
    await api('/todos', request('POST', creates(1))); await api('/todos'); assert.equal(calls, 0);
  } finally {globalThis.fetch = oldFetch;}
 });
 test('stale edit rejected and concurrent mutations serialize', async () => {
  const {api} = fixture(); await api('/todos', request('POST', creates(1)));
  const results = await Promise.allSettled([
    api('/todos/' + ID(1), request('PATCH', {completed: true, version: 1})),
    api('/todos/' + ID(1) + '/note', request('PATCH', {note: 'concurrent', version: 1})),
  ]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'VERSION_CONFLICT');
  assert.equal((await api('/todos/' + ID(1))).version, 2);
 });
 test('todo preferences and templates match current original UI contracts', async () => {
  const {api} = fixture();
  assert.deepEqual(await api('/todo-preferences'), {completed_mode: 'strike', version: 0});
  assert.deepEqual(await api('/todo-preferences', request('PATCH', {completed_mode: 'hide', version: 0})), {completed_mode: 'hide', version: 1});
  await api('/todo-templates', request('POST', {id: ID(2), text: '阅读'}));
  await api('/todos', request('POST', {...creates(1, '阅读'), template_id: ID(2)}));
  await api('/todos/' + ID(1), request('PATCH', {completed: true, version: 1}));
  assert.equal((await api('/todo-templates')).items[0].completed_days, 1);
  await api('/todo-templates/' + ID(2) + '/archive', request('POST', {version: 1}));
  assert.equal((await api('/todo-templates')).items.length, 0);
  assert.equal((await api('/todo-templates?archived=1')).items.length, 1);
  assert.equal((await api('/todos/' + ID(1))).template_active, false);
  await api('/todo-templates/' + ID(2) + '/restore', request('POST', {version: 2}));
  await api('/todo-templates/' + ID(2), request('PATCH', {text: '阅读十分钟', version: 3}));
  await api('/todo-templates/' + ID(2), request('DELETE', {version: 4}));
  assert.equal((await api('/todos/' + ID(1))).text, '阅读');
  const linked = await api('/todos/' + ID(1) + '/template', request('POST', {date: today, version: 2, template_id: ID(2), template_version: 5}));
  assert.equal(linked.todo.template_active, true); assert.equal(linked.template.version, 6);
 });
 test('promote ordinary todo to template atomically', async () => {
  const {api} = fixture(); await api('/todos', request('POST', creates(1)));
  const result = await api('/todos/' + ID(1) + '/template', request('POST', {date: today, version: 1, template_id: ID(2), template_version: 0}));
  assert.equal(result.todo.version, 2); assert.equal(result.template.id, ID(2));
  assert.equal((await api('/todo-templates')).items.length, 1);
 });
 test('unscheduled move/complete writes target, tombstone and receipt once', async () => {
  const {api} = fixture(); await api('/unscheduled-todos', request('POST', {id: ID(1), text: '未来事项'}));
  const body = {date: today, version: 1}, path = '/unscheduled-todos/' + ID(1) + '/complete-today';
  const saved = await api(path, request('POST', body));
  assert.equal(saved.todo.completed, true); assert.ok(saved.source.deleted_at);
  assert.deepEqual(await api(path, request('POST', body)), saved);
  assert.equal((await api('/unscheduled-todos')).items.length, 0); assert.equal((await api('/todos')).items.length, 1);
  await rejects(api('/unscheduled-todos/' + ID(1) + '/restore', request('POST', {version: 2})), 'TODO_MOVED');
 });
 test('unscheduled move target collision preserves source; day rollover denied', async () => {
  const {api} = fixture(); await api('/unscheduled-todos', request('POST', {id: ID(1), text: 'future'}));
  await rejects(api('/unscheduled-todos/' + ID(1) + '/complete-today', request('POST', {date: '2026-11-07', version: 1})), 'TODO_DAY_CHANGED');
  await api('/todos', request('POST', creates(1)));
  await rejects(api('/unscheduled-todos/' + ID(1) + '/move', request('POST', {date: today, version: 1})), 'IDEMPOTENCY_CONFLICT');
  assert.equal((await api('/unscheduled-todos/' + ID(1))).deleted_at, null);
 });
 test('note entry CRUD, receipts, labels protocol and history are durable', async () => {
  const {api, db} = fixture(), path = '/note-entries/' + ID(1), body = note(10);
  const row = await api(path, request('PUT', body));
  assert.equal(row.version, 1); assert.match(row.content_hash, /^[0-9a-f]{64}$/); assert.deepEqual(row.labels, ['学习', '生活']);
  assert.deepEqual(await api(path, request('PUT', body)), row);
  assert.equal((await api('/note-entries/operations/' + ID(10))).version, 1);
  const legacy = await api(path, {headers: {'X-Note-Labels-Version': '1'}}); assert.equal(legacy.label, '学习');
  const updated = await api(path, request('PUT', note(11, 1, '修改后的虚构内容')));
  assert.equal(updated.version, 2); assert.notEqual(updated.content_hash, row.content_hash);
  await rejects(api(path, request('PUT', body)), 'VERSION_CONFLICT');
  await rejects(api(path, request('PUT', {...note(11, 1), text: '不同请求'})), 'IDEMPOTENCY_CONFLICT');
  await api(path, request('DELETE', {version: 2, save_id: ID(12)}));
  assert.equal((await api('/note-entries?date=' + today)).entries.length, 0);
  const restored = await api(path + '/restore', request('POST', {version: 3, save_id: ID(13)}));
  assert.equal(restored.text, '修改后的虚构内容'); assert.equal(restored.deleted, false);
  const reloaded = createLocalApi({db, now: () => time}); assert.deepEqual(await reloaded(path), restored);
  const histories = await db.transaction(['entities'], 'readonly', tx => tx.getAll('entities'));
  assert.equal(histories.filter(row => row.kind === 'history').length, 3);
 });
 test('note list/date pagination/month/legacy reads return honest local data', async () => {
  const {api} = fixture(); await api('/note-entries/' + ID(1), request('PUT', note(10)));
  await api('/note-entries/' + ID(2), request('PUT', {...note(11), category: 'work', labels: ['工作']}));
  assert.deepEqual(await api('/note-entries/dates?category=life&page_size=1'), {dates: [today], has_more: false, next_before: null});
  const month = await api('/note-entries/month?month=2026-11');
  assert.equal(month.complete, true); assert.equal(month.days[0].items.length, 2);
  assert.equal((await api('/daily-notes?date=' + today)).version, 0);
  assert.deepEqual(await api('/daily-notes/dates'), {dates: [], has_more: false, next_before: null});
  await rejects(api('/note-entries/month?month=2026-13'), 'VALIDATION_ERROR');
  await rejects(api('/note-entries/' + ID(3), request('PUT', {...note(12), date: '2026-11-07'})), 'NOTES_TODAY_ONLY');
 });
 test('labels create uses requested protocol and deletion preserves body plus history', async () => {
  const {api, db} = fixture();
  const label = await api('/note-entries/labels', request('POST', {name: '学习', save_id: ID(10)}, {'X-Note-Labels-Version': '2'}));
  assert.equal(label.labels_version, 2);
  await api('/note-entries/' + ID(1), request('PUT', note(11)));
  await api('/note-entries/labels', request('POST', {name: '学习', action: 'delete', save_id: ID(12)}));
  const row = await api('/note-entries/' + ID(1)); assert.equal(row.text, '仅测试，虚构内容。'); assert.equal(row.version, 2); assert.deepEqual(row.labels, ['生活']);
  assert.equal((await api('/note-entries/labels')).labels.length, 0);
  const raw = await db.transaction(['entities'], 'readonly', tx => tx.getAll('entities'));
  assert.ok(raw.some(record => record.kind === 'label' && record.value.deleted_at));
  assert.ok(raw.some(record => record.kind === 'history' && record.value.labels?.includes('学习')));
  await rejects(api('/note-entries/' + ID(1), request('PUT', note(13, 1))), 'VERSION_CONFLICT');
 });
 test('memos group/note save, exact receipts, soft delete and restore', async () => {
  const {api} = fixture();
  await api('/memos/groups/' + ID(1), request('PUT', group(10)));
  const saved = await api('/memos/notes/' + ID(2), request('PUT', memo(11)));
  assert.equal(saved.version, 1);
  assert.equal((await api('/memos')).groups[0].active_note_count, 1);
  assert.equal((await api('/memos')).notes[0].body, undefined);
  assert.equal((await api('/memos/operations/' + ID(11))).kind, 'notes');
  await rejects(api('/memos/groups/' + ID(1), request('DELETE', {version: 1, save_id: ID(12), confirm_title: '测试分组', confirm_note_count: 0})), 'MEMO_DELETE_CONFIRMATION');
  await api('/memos/notes/' + ID(2), request('DELETE', {version: 1, save_id: ID(13)}));
  assert.equal((await api('/memos')).groups[0].active_note_count, 0);
  await api('/memos/groups/' + ID(1), request('DELETE', {version: 1, save_id: ID(14), confirm_title: '测试分组', confirm_note_count: 0}));
  await rejects(api('/memos/notes/' + ID(2) + '/restore', request('POST', {version: 2, save_id: ID(15)})), 'MEMO_GROUP_UNAVAILABLE');
  await api('/memos/groups/' + ID(1) + '/restore', request('POST', {version: 2, save_id: ID(16)}));
  const restored = await api('/memos/notes/' + ID(2) + '/restore', request('POST', {version: 2, save_id: ID(15)}));
  assert.equal(restored.body, saved.body);
  await rejects(api('/memos/trash/clear', request('POST', {})), 'LOCAL_SOFT_DELETE_ONLY');
 });
 test('memos strict validation and stale operation recovery', async () => {
  const {api} = fixture(); await api('/memos/groups/' + ID(1), request('PUT', group(10)));
  await api('/memos/notes/' + ID(2), request('PUT', memo(11)));
  await rejects(api('/memos/notes/' + ID(2), request('PUT', {...memo(11), body: 'changed'})), 'IDEMPOTENCY_CONFLICT');
  await api('/memos/notes/' + ID(2), request('PUT', memo(12, 1, 'new')));
  await rejects(api('/memos/notes/' + ID(2), request('PUT', memo(11))), 'VERSION_CONFLICT');
  assert.equal((await api('/memos/operations/' + ID(11))).version, 1);
  assert.equal((await api('/memos/notes/' + ID(2))).version, 2);
  await rejects(api('/memos/notes/' + ID(3), request('PUT', {...memo(13), body: '汉'.repeat(30000)})), 'TEXT_TOO_LARGE');
  await rejects(api('/memos/groups/' + ID(4), request('PUT', {...group(14), title: '\n标题'})), 'VALIDATION_ERROR');
 });
 test('injected transaction failure rolls back target, source and receipt', async () => {
  const {db, api} = fixture(); await api('/unscheduled-todos', request('POST', {id: ID(1), text: 'atomic'}));
  let writes = 0;
  const faulty = {transaction(names, mode, callback) {return db.transaction(names, mode, tx => callback({...tx, put: async (...args) => { if (++writes === 3) throw Error('injected quota failure'); return tx.put(...args); }}));}};
  const broken = createLocalApi({db: faulty, now: () => time});
  await rejects(broken('/unscheduled-todos/' + ID(1) + '/move', request('POST', {date: today, version: 1})), 'LOCAL_STORAGE_FAILURE');
  assert.equal((await api('/unscheduled-todos/' + ID(1))).version, 1); assert.equal((await api('/todos')).items.length, 0);
  const retry = await api('/unscheduled-todos/' + ID(1) + '/move', request('POST', {date: today, version: 1}));
  assert.equal(retry.todo.version, 1);
 });
 test('note row, labels and receipt commit together; aborted call stores nothing', async () => {
  const {db, api} = fixture();
  const faulty = {transaction(names, mode, callback) {return db.transaction(names, mode, tx => callback({...tx, put: async (store, value) => { if (store === 'meta' && value.key.includes('receipt:')) throw Error('receipt failure'); return tx.put(store, value); }}));}};
  await rejects(createLocalApi({db: faulty, now: () => time})('/note-entries/' + ID(1), request('PUT', note(10))), 'LOCAL_STORAGE_FAILURE');
  assert.equal((await api('/note-entries')).entries.length, 0); assert.equal((await api('/note-entries/labels')).labels.length, 0);
  assert.equal((await api('/note-entries/operations/' + ID(10))).found, false);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api('/todos', {...request('POST', creates(1)), signal: controller.signal}), {name: 'AbortError'});
  assert.equal((await api('/todos')).items.length, 0);
 });
 test('independent local owners cannot read each other', async () => {
  const {db, api} = fixture(); await api('/todos', request('POST', creates(1)));
  const other = createLocalApi({db, now: () => time, ownerId: ID(999)});
  assert.equal((await other('/todos')).items.length, 0);
  await rejects(other('/todos/' + ID(1)), 'NOT_FOUND');
 });
 test('save receipt projects current requested labels protocol on replay', async () => {
  const {api} = fixture(); const body = note(10);
  await api('/note-entries/' + ID(1), request('PUT', body, {'X-Note-Labels-Version': '3'}));
  const legacy = await api('/note-entries/' + ID(1), request('PUT', {...body, labels: ['学习']}, {'X-Note-Labels-Version': '2'})).catch(error => error);
  assert.equal(legacy.code, 'IDEMPOTENCY_CONFLICT');
  const labelBody = {name: '单独标签', save_id: ID(11)};
  await api('/note-entries/labels', request('POST', labelBody, {'X-Note-Labels-Version': '2'}));
  assert.equal((await api('/note-entries/labels', request('POST', labelBody, {'X-Note-Labels-Version': '3'}))).labels_version, 3);
 });
 test('archiving label preserves editability of already-associated notes', async () => {
  const {api} = fixture(); await api('/note-entries/' + ID(1), request('PUT', note(10)));
  await api('/note-entries/labels', request('POST', {name: '学习', action: 'archive', save_id: ID(11)}));
  const saved = await api('/note-entries/' + ID(1), request('PUT', note(12, 1, '保留旧标签编辑正文')));
  assert.equal(saved.version, 2);
  await rejects(api('/note-entries/' + ID(2), request('PUT', note(13))), 'LABEL_UNAVAILABLE');
 });
 test('separate dates paginate without silently dropping any entries', async () => {
  const db = createMemoryDB();
  for (let day = 1; day <= 3; day++) {
    const date = '2026-11-0' + day, api = createLocalApi({db, now: () => Date.parse(date + 'T04:00:00Z')});
    await api('/note-entries/' + ID(day), request('PUT', {...note(day + 100), date}));
  }
  const api = createLocalApi({db, now: () => time});
  assert.deepEqual(await api('/note-entries/dates?page_size=2'), {dates: ['2026-11-03', '2026-11-02'], has_more: true, next_before: '2026-11-02'});
  assert.deepEqual(await api('/note-entries/dates?page_size=2&before=2026-11-02'), {dates: ['2026-11-01'], has_more: false, next_before: null});
 });
 test('daily 200-entry limit rejects new note atomically', async () => {
  const {db, api} = fixture();
  // Synthetic seeded records exercise the exact production counting boundary without slow setup.
  await db.transaction(['entities'], 'readwrite', async tx => {
    for (let n = 1; n <= 200; n++) {
      const id = ID(n), value = {id, category: 'life', date: today, text: 'synthetic', labels: [], version: 1, created_at: new Date(time).toISOString(), updated_at: new Date(time).toISOString(), deleted_at: null, content_hash: 'synthetic'};
      await tx.put('entities', {key: JSON.stringify([LOCAL_SCOPE, 'note_entry', id]), scope: LOCAL_SCOPE, kind: 'note_entry', id, value});
    }
  });
  await rejects(api('/note-entries/' + ID(201), request('PUT', note(300))), 'NOTES_LIMIT');
  assert.equal((await api('/note-entries')).entries.length, 200);
  assert.equal((await api('/note-entries/operations/' + ID(300))).found, false);
 });
 test('memo group limit includes trash and never purges to make room', async () => {
  const {api} = fixture();
  for (let n = 1; n <= 32; n++) await api('/memos/groups/' + ID(n), request('PUT', group(100 + n)));
  await api('/memos/groups/' + ID(1), request('DELETE', {version: 1, save_id: ID(999), confirm_title: '测试分组', confirm_note_count: 0}));
  await rejects(api('/memos/groups/' + ID(33), request('PUT', group(133))), 'MEMOS_LIMIT');
  assert.equal((await api('/memos')).groups.length, 32);
 });
 test('session guard becoming invalid during storage aborts before commit', async () => {
  const {api} = fixture(); let checks = 0;
  await assert.rejects(api('/todos', {...request('POST', creates(1)), offlineGuard() {if (++checks >= 3) throw new DOMException('session changed', 'AbortError');}}), {name: 'AbortError'});
  assert.equal((await api('/todos')).items.length, 0);
 });
