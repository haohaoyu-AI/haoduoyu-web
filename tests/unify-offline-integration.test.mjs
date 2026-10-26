import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {createMemoryDB, entityKey} from '../web/offline/db.mjs';
import {createOfflineCache, offlineReadRoute} from '../web/offline/cache.mjs';
import {createOfflineRuntime, offlineRequest} from '../web/offline/runtime.mjs';
import {offlineStatusLabel} from '../web/offline/ui.mjs';
import {createSnapshotSync} from '../web/offline/sync.mjs';
import {projectWorkbenchSnapshot} from '../src/workbench-snapshot.mjs';
import {snapshotBudget} from '../src/snapshot-budget.mjs';

const scope = 'a'.repeat(64), otherScope = 'b'.repeat(64), date = '2026-10-27', stamp = '2026-10-26T01:00:00Z';
const netError = () => Object.assign(new Error('offline'), {code: 'NETWORK_UNAVAILABLE'});
const empty = () => Object.fromEntries(['todos', 'life_notes', 'work_notes', 'work_reminders', 'memo_groups', 'memos'].map(k => [k, []]));
const snapshot = (date = null, owner = scope) => projectWorkbenchSnapshot(empty(),
  {scope_id: owner, generated_at: stamp, date}, snapshotBudget());
function fixture(t) {
  const db = createMemoryDB(), calls = [], remote = new Map(), templates = new Map();
  const source = {online: true, owner: scope, me: {id: 'public-business', username: '公开编辑', publicBusiness: true}, status: null};
  async function request(path, opts = {}) {
    calls.push({path, method: opts.method || 'GET', body: structuredClone(opts.body)});
    if (!source.online) throw netError();
    if (source.status) throw Object.assign(new Error('unauthorized'), {status: source.status});
    if (path === '/auth/me') return {...source.me, csrfToken: 'ephemeral-never-store'};
    if (path.startsWith('/workbench-snapshot')) return snapshot(path.includes('?') ? date : null, source.owner);
    if (path === '/accounts') return [{id: 'account', name: '合成账户', platform: 'toutiao', active: 1, api_key: 'not-cacheable'}];
    if (path.startsWith('/todos?')) return {date, today: '2026-10-26', completed_mode: 'strike', preferences_version: 0,
      items: [...remote.values()].filter(row => !row.deleted_at)};
    if (path === '/todo-templates' && !opts.method) return {items: [...templates.values()].filter(row => !row.deleted)};
    if (path.startsWith('/note-entries?')) return {category: new URL('https://fixture.invalid' + path).searchParams.get('category'),
      date: new URL('https://fixture.invalid' + path).searchParams.get('date'), can_edit: true, entries: []};
    const type = path.startsWith('/todo-templates') ? 'template' : 'todo', rows = type === 'todo' ? remote : templates;
    const id = opts.body?.id || path.split('/')[2], old = rows.get(id), body = opts.body;
    if (opts.method === 'POST' && ['/todos', '/todo-templates'].includes(path)) {
      const row = {...body, completed: false, version: 1, created_at: stamp, updated_at: stamp, deleted_at: null};
      rows.set(id, row); return row;
    }
    if (old && opts.method) {
      if (old.version !== body.version) throw Object.assign(new Error('version'), {status: 409});
      const row = {...old, ...body, version: old.version + 1, updated_at: stamp,
        deleted_at: opts.method === 'DELETE' ? stamp : path.endsWith('/restore') ? null : old.deleted_at};
      rows.set(id, row); return row;
    }
    return {can_edit: true, date, text: '合成只读内容', entries: [], groups: [], notes: []};
  }
  const app = createOfflineRuntime({db, request, now: () => Date.parse(stamp), online: () => source.online,
    features: {todos: true, notes: false, memos: false}});
  t.after(() => app.stop());
  return {app, db, calls, source, remote, templates, request};
}
async function initialize(f) {
  await f.app.call('/auth/me');
  await f.app.call('/accounts');
  await f.app.call('/todos?date=' + date);
  await f.app.call('/todo-templates');
}

test('only explicit business read routes can enter the offline cache', () => {
  for (const path of ['/auth/me', '/api-keys', '/audit', '/backup', '/articles', '/memos/operations/' + randomUUID(),
    'https://other.invalid/todos?date=' + date, '/todos?date=' + date + '&unexpected=1']) assert.equal(offlineReadRoute(path), null);
  assert.equal(offlineReadRoute('/todos?date=' + date).kind, 'todo');
});
test('unmanaged article pagination envelopes pass through with their original metadata', async () => {
  const payload = {data: [], meta: {total: 0, page: 1, page_size: 20, has_more: false}};
  const app = createOfflineRuntime({db: createMemoryDB(), request: async (path, options) => {
    assert.equal(path, '/articles?page=1'); assert.equal(options.envelope, true); return payload;
  }});
  assert.deepEqual(await app.call('/articles?page=1', {envelope: true}), payload);
});
test('account caching keeps active status and preserves the full fresh response without persisting credentials', async t => {
  const f = fixture(t); await f.app.call('/auth/me');
  const fresh = await f.app.call('/accounts'); assert.equal(fresh[0].active, 1); assert.equal(fresh[0].api_key, 'not-cacheable');
  f.source.online = false;
  const cached = await f.app.call('/accounts'); assert.equal(cached[0].active, 1); assert.equal(cached[0].api_key, undefined);
});
test('offline future todo local ack is durable with original UUID and no credential persistence', async t => {
  const f = fixture(t); await initialize(f); f.source.online = false;
  const id = randomUUID(), row = await f.app.call('/todos', {method: 'POST', body: {id, date, text: '【自动测试】明天完成'}});
  assert.equal(row.id, id); assert.equal(row.version, 1); assert.equal(row.date, date);
  assert.equal((await f.app.queue()).operations.length, 1);
  const stored = await f.db.transaction(['meta', 'entities', 'outbox'], 'readonly', async tx =>
    JSON.stringify(await Promise.all(['meta', 'entities', 'outbox'].map(store => tx.getAll(store)))));
  assert.ok(!stored.includes('ephemeral-never-store')); assert.ok(!stored.includes('not-cacheable'));
  assert.equal(f.calls.filter(row => row.method === 'POST').length, 0);
  assert.equal((await f.app.call('/todos?date=' + date)).items[0].text, row.text);
});
test('a hanging online identity probe never delays a previously scoped durable local acknowledgement', async t => {
  const f = fixture(t); await initialize(f);
  let hanging = false;
  const app = createOfflineRuntime({db: f.db, online: () => true, request: async (path, opts) => {
    if (hanging && ['/auth/me', '/workbench-snapshot/index'].includes(path)) return new Promise(() => {});
    return f.request(path, opts);
  }});
  t.after(() => app.stop()); await app.call('/auth/me'); hanging = true;
  const row = await Promise.race([app.call('/todos', {method: 'POST', body: {id: randomUUID(), date, text: '立即保存本机'}}),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('local ack waited for network')), 500); timer.unref(); })]);
  assert.equal(row.text, '立即保存本机'); assert.equal((await app.queue()).operations.length, 1);
});
test('reload restores only last verified identity and scoped local queued rows', async t => {
  const f = fixture(t); await initialize(f); f.source.online = false;
  const id = randomUUID(); await f.app.call('/todos', {method: 'POST', body: {id, date, text: '【自动测试】刷新保留'}});
  const reloaded = createOfflineRuntime({db: f.db, request: f.request, online: () => false});
  const me = await reloaded.call('/auth/me'); assert.equal(me.offlineIdentity, true); assert.equal(me.csrfToken, undefined);
  assert.equal((await reloaded.call('/accounts')).length, 1);
  assert.equal((await reloaded.call('/todos?date=' + date)).items[0].id, id);
});
test('a local create before the first full list cache still survives reload with an explicit partial marker', async t => {
  const f = fixture(t); await f.app.call('/auth/me'); f.source.online = false;
  const id = randomUUID(); await f.app.call('/todos', {method: 'POST', body: {id, date, text: '仅本机新事项'}});
  const reloaded = createOfflineRuntime({db: f.db, request: f.request, online: () => false});
  await reloaded.call('/auth/me');
  const data = await reloaded.call('/todos?date=' + date);
  assert.equal(data.offline_partial, true); assert.equal(data.items[0].id, id);
  await assert.rejects(reloaded.call('/todos?date=2026-10-28'), error => error.code === 'OFFLINE_CACHE_MISS');
});
test('checkbox, soft delete and explicit undo retain complete entity and local versions', async t => {
  const f = fixture(t); await initialize(f); f.source.online = false;
  const id = randomUUID(), body = {id, date, text: '【自动测试】勾选删除撤销'};
  await f.app.call('/todos', {method: 'POST', body});
  const checked = await f.app.call('/todos/' + id, {method: 'PATCH', body: {completed: true, version: 1}});
  assert.equal(checked.text, body.text); assert.equal(checked.version, 2); assert.equal(checked.completed, true);
  const removed = await f.app.call('/todos/' + id, {method: 'DELETE', body: {date, version: 2}});
  assert.ok(removed.deleted_at); assert.equal((await f.app.call('/todos?date=' + date)).items.length, 0);
  const undone = await f.app.call('/todos/' + id + '/restore', {method: 'POST', body: {date, version: 3}});
  assert.equal(undone.deleted_at, null); assert.equal(undone.completed, true); assert.equal(undone.version, 4);
  assert.equal((await f.app.call('/todos?date=' + date)).items[0].id, id);
  f.source.online = true; await f.app.sync();
  assert.deepEqual(f.calls.filter(row => row.body && row.path.startsWith('/todos')).map(row => row.body.version),
    [undefined, 1, 2, 3]);
  assert.equal(f.remote.get(id).version, 4); assert.equal(f.remote.get(id).deleted_at, null);
});
test('fresh server list overlays only dirty locals and never resurrects absent clean cache rows', async t => {
  const f = fixture(t), id = randomUUID();
  f.remote.set(id, {id, date, text: '旧线上', version: 1, completed: false, created_at: stamp, updated_at: stamp, deleted_at: null});
  await initialize(f);
  f.remote.set(id, {...f.remote.get(id), text: '新线上', version: 2});
  assert.equal((await f.app.call('/todos?date=' + date)).items[0].text, '新线上');
  f.remote.clear(); assert.equal((await f.app.call('/todos?date=' + date)).items.length, 0);
  f.source.online = false; assert.equal((await f.app.call('/todos?date=' + date)).items.length, 0);
});
test('an older list racing a newly acknowledged server row cannot hide or downgrade the confirmed entity', async t => {
  const f = fixture(t); await initialize(f);
  const cache = createOfflineCache({db: f.db, getScope: () => scope}), path = '/todos?date=' + date;
  const baseline = await cache.fence(path), id = randomUUID();
  const row = {id, date, text: '刚确认的事项', version: 2, completed: true, created_at: stamp, updated_at: stamp, deleted_at: null};
  await f.db.transaction(['entities'], 'readwrite', tx => tx.put('entities',
    {key: entityKey(scope, 'todo:' + id), scope, entity_id: 'todo:' + id, server: row, dirty: false}));
  await assert.rejects(cache.write(path, {items: []}, {baseline}), error => error.code === 'OFFLINE_CACHE_CHANGED');
  assert.equal((await cache.read(path)).data.items[0].version, 2);
  await assert.rejects(cache.write(path, {items: [{...row, version: 1}]}), error => error.code === 'OFFLINE_CACHE_CHANGED');
});
test('a cold first todo list retries once after a real snapshot commits while its GET is delayed', async t => {
  const f = fixture(t), ids = Array.from({length: 3}, () => randomUUID()), path = '/todos?date=' + date;
  for (const id of ids) f.remote.set(id,
    {id, date, text: '合成冷启动事项', version: 1, completed: false, created_at: stamp, updated_at: stamp, deleted_at: null});
  let entered, release, reads = 0;
  const blocked = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const app = createOfflineRuntime({db: f.db, now: () => Date.parse(stamp), request: async (path, opts) => {
    const value = await f.request(path, opts);
    if (path.startsWith('/todos?') && ++reads === 1) { entered(); await gate; }
    else if (path.startsWith('/todos?')) {
      const backgroundCache = createOfflineCache({db: f.db, getScope: () => scope});
      await backgroundCache.write(path, value);
    }
    return value;
  }}); t.after(() => app.stop());
  await app.call('/auth/me');
  assert.deepEqual(await f.db.transaction(['entities'], 'readonly', tx => tx.getAll('entities')), []);
  const pending = app.call(path); pending.catch(() => {}); await blocked;
  for (const id of ids) f.remote.set(id, {...f.remote.get(id), text: '快照已确认新事项', version: 2, completed: id === ids[2]});
  const todos = [...f.remote.values()].map(row => {
    const content = {entity_id: 'todo:' + row.id, entity_type: 'todo', source: 'todo', source_id: row.id,
      date, version: row.version, change_seq: 2, created_at: stamp, updated_at: stamp, deleted_at: null,
      text: row.text, completed: Number(row.completed)};
    const content_hash = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(content).sort()))).digest('hex');
    return {...content, content_hash};
  }).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const sync = createSnapshotSync({db: f.db, getScope: () => scope, now: () => Date.parse(stamp), request: async path =>
    projectWorkbenchSnapshot({...empty(), todos}, {scope_id: scope, generated_at: stamp, date: path.includes('?') ? date : null}, snapshotBudget())});
  assert.equal((await sync.pull({date})).status, 'synced');
  release();
  const visible = await pending; assert.equal(reads, 2, 'the rejected first response triggers exactly one fresh GET');
  assert.equal(visible.items.length, 3); assert.ok(visible.items.every(row => row.version === 2 && row.completed === (row.id === ids[2])));
  const cache = createOfflineCache({db: f.db, getScope: () => scope});
  assert.ok((await cache.read(path)).data.items.every(row => row.version === 2 && row.text === '快照已确认新事项'));
  assert.equal(app.state.error, null); assert.equal((await app.queue()).conflicts.length, 0);
});
test('canonical todo fences still reject actual version, text, deletion and template-link changes', async t => {
  for (const field of ['version', 'text', 'deleted_at', 'template_version']) await t.test(field, async () => {
    const db = createMemoryDB(), id = randomUUID(), path = '/todos?date=' + date;
    const cache = createOfflineCache({db, getScope: () => scope});
    const row = {id, date, text: '不可被旧读取覆盖', version: 1, completed: false,
      created_at: stamp, updated_at: stamp, deleted_at: null, template_id: randomUUID(), template_version: 1, template_active: true};
    await cache.write(path, {items: [row]}); const baseline = await cache.fence(path);
    const changes = {version: 2, text: '已确认的新正文', deleted_at: stamp, template_version: 2};
    const current = {...row, [field]: changes[field]};
    await db.transaction(['entities'], 'readwrite', tx => tx.put('entities',
      {key: entityKey(scope, 'todo:' + id), scope, entity_id: 'todo:' + id, server: current, dirty: false}));
    await assert.rejects(cache.write(path, {items: [row]}, {baseline}), error => error.code === 'OFFLINE_CACHE_CHANGED');
    assert.deepEqual((await cache.entity('todo:' + id)).server, current);
  });
});
test('foreground cache-fence recovery stops after one retry and preserves the latest confirmed entity', async t => {
  const f = fixture(t), id = randomUUID(), path = '/todos?date=' + date; let reads = 0;
  f.remote.set(id, {id, date, text: '合成重试上限', version: 1, completed: false,
    created_at: stamp, updated_at: stamp, deleted_at: null});
  const app = createOfflineRuntime({db: f.db, request: async (path, opts) => {
    const value = await f.request(path, opts);
    if (path.startsWith('/todos?')) {
      const row = {...f.remote.get(id), version: ++reads + 1};
      await f.db.transaction(['entities'], 'readwrite', tx => tx.put('entities',
        {key: entityKey(scope, 'todo:' + id), scope, entity_id: 'todo:' + id, server: row, dirty: false}));
    }
    return value;
  }}); t.after(() => app.stop());
  await app.call('/auth/me');
  await assert.rejects(app.call(path), error => error.code === 'OFFLINE_CACHE_CHANGED');
  assert.equal(reads, 2);
  const entity = await f.db.transaction(['entities'], 'readonly', tx => tx.get('entities', entityKey(scope, 'todo:' + id)));
  assert.equal(entity.server.version, 3, 'both stale responses leave the newer entity intact');
});
test('a GET response started in an old identity cannot be cached into a newly adopted scope', async t => {
  const f = fixture(t); await initialize(f);
  let release, entered;
  const blocked = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const app = createOfflineRuntime({db: f.db, request: async (path, opts) => {
    const result = await f.request(path, opts);
    if (path.startsWith('/todos?')) { entered(); await gate; }
    return result;
  }});
  await app.call('/auth/me');
  const result = app.call('/todos?date=' + date); result.catch(() => {}); await blocked;
  await app.invalidate(); f.source.owner = otherScope; await app.call('/auth/me'); release();
  await assert.rejects(result, error => error.code === 'OFFLINE_SCOPE_CHANGED');
  const cached = await f.db.transaction(['meta'], 'readonly', tx => tx.get('meta', entityKey(otherScope, 'get:/todos?date=' + date)));
  assert.equal(cached, undefined);
});
test('entity lookup racing an identity switch cannot enqueue old entity data under the new scope', async t => {
  const f = fixture(t); await initialize(f);
  let holding = false, release, entered;
  const blocked = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const db = {transaction: async (names, mode, callback) => {
    const result = await f.db.transaction(names, mode, callback);
    if (holding && mode === 'readonly' && names.includes('entities')) { entered(); await gate; }
    return result;
  }};
  const app = createOfflineRuntime({db, request: f.request}); await app.call('/auth/me'); holding = true;
  const result = app.call('/todos', {method: 'POST', body: {id: randomUUID(), date, text: '旧范围内容'}});
  result.catch(() => {}); await blocked; await app.invalidate();
  f.source.owner = otherScope; await app.call('/auth/me'); release();
  await assert.rejects(result, error => error.code === 'OFFLINE_SCOPE_CHANGED');
  assert.equal((await app.queue()).operations.length, 0);
});
test('B2 per-call cancellation after an awaited entity lookup prevents durable local writes', async t => {
  const f = fixture(t); await initialize(f);
  let cancelled = false, holding = false, release, entered;
  const blocked = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const db = {transaction: async (names, mode, callback) => {
    const result = await f.db.transaction(names, mode, callback);
    if (holding && mode === 'readonly' && names.includes('entities')) { entered(); await gate; }
    return result;
  }};
  const app = createOfflineRuntime({db, request: f.request}); await app.call('/auth/me'); holding = true;
  const result = app.call('/todos', {method: 'POST', body: {id: randomUUID(), date, text: '旧调用不得落盘'},
    offlineGuard: () => { if (cancelled) throw new DOMException('cancelled', 'AbortError'); }});
  result.catch(() => {}); await blocked; cancelled = true; release();
  await assert.rejects(result, error => error.name === 'AbortError');
  assert.equal((await app.queue()).operations.length, 0);
});
test('a late status refresh cannot replace a newer durable queue count with an earlier read', async t => {
  const f = fixture(t); await initialize(f); f.source.online = false;
  await f.app.call('/todos', {method: 'POST', body: {id: randomUUID(), date, text: '第一条'}});
  let hold = false, release, entered;
  const gate = new Promise(resolve => { release = resolve; }), blocked = new Promise(resolve => { entered = resolve; });
  const db = {transaction: async (names, mode, callback) => {
    const result = await f.db.transaction(names, mode, callback);
    if (hold && mode === 'readonly' && names.includes('outbox')) { hold = false; entered(); await gate; }
    return result;
  }};
  const app = createOfflineRuntime({db, request: f.request, online: () => false}); await app.call('/auth/me'); hold = true;
  const old = app.refresh(); await blocked;
  await app.call('/todos', {method: 'POST', body: {id: randomUUID(), date, text: '第二条'}});
  assert.equal(app.state.pending, 2); release(); await old; assert.equal(app.state.pending, 2);
});
test('template additions keep today-added linkage and deleted templates do not reappear offline', async t => {
  const f = fixture(t); await initialize(f); f.source.online = false;
  const templateId = randomUUID();
  await f.app.call('/todo-templates', {method: 'POST', body: {id: templateId, text: '【自动测试】常用'}});
  const row = await f.app.call('/todos', {method: 'POST', body: {id: randomUUID(), date, text: '【自动测试】常用', template_id: templateId}});
  assert.equal(row.template_id, templateId); assert.equal(row.template_active, true);
  assert.equal((await f.app.call('/todos?date=' + date)).items[0].template_id, templateId);
  await f.app.call('/todo-templates/' + templateId, {method: 'DELETE', body: {version: 1}});
  assert.equal((await f.app.call('/todo-templates')).items.length, 0);
});
test('401 and 403 never fall back to cached authentication or cached GET data', async t => {
  for (const status of [401, 403]) {
    const f = fixture(t); await initialize(f); f.source.status = status;
    await assert.rejects(f.app.call('/auth/me'), error => error.status === status);
    assert.equal(f.app.state.scope, null);
    f.source.status = null; f.source.online = false;
    await assert.rejects(f.app.call('/auth/me'));
  }
});
test('cookie identity/scope change pauses old queue and does not rebind or send it', async t => {
  const f = fixture(t); await initialize(f); f.source.online = false;
  await f.app.call('/todos', {method: 'POST', body: {id: randomUUID(), date, text: '【自动测试】原范围'}});
  f.source.online = true; f.source.owner = otherScope;
  await f.app.sync(); assert.equal(f.app.state.scope, null);
  assert.equal(f.calls.filter(row => row.method === 'POST').length, 0);
  const rows = await f.db.transaction(['outbox'], 'readonly', tx => tx.getAll('outbox'));
  assert.equal(rows[0].scope, scope); assert.equal(rows[0].status, 'queued');
});
test('known new identity plus failed scope probe cannot reopen old cached identity', async t => {
  const f = fixture(t); await initialize(f);
  const request = async path => path === '/auth/me' ? {id: randomUUID(), username: '另一身份'} : Promise.reject(netError());
  const app = createOfflineRuntime({db: f.db, request});
  await assert.rejects(app.call('/auth/me'), error => error.code === 'OFFLINE_SCOPE_CHANGED');
  assert.equal(app.state.scope, null);
});
test('read-only modules use cached values but never grant offline legacy, note or memo edit capability', async t => {
  const f = fixture(t); await initialize(f);
  const paths = ['/daily-notes?date=' + date, '/note-entries?category=life&date=' + date, '/memos'];
  for (const path of paths) await f.app.call(path);
  f.source.online = false;
  for (const path of paths) assert.equal((await f.app.call(path)).can_edit, false);
  await assert.rejects(f.app.call('/daily-notes/' + date, {method: 'PUT', body: {text: '未保存'}}));
  assert.equal((await f.app.queue()).operations.length, 0);
});
test('undefined responses, aborts and invalid mutation bodies never become successful empty cache or local ack', async t => {
  const f = fixture(t); await initialize(f); f.source.online = false;
  await assert.rejects(f.app.call('/todos', {method: 'POST', body: {id: randomUUID(), date: '2026-02-30', text: '错日期'}}));
  await assert.rejects(f.app.call('/todos', {method: 'POST', body: {id: randomUUID(), date, text: '错字段', save_id: randomUUID()}}));
  const cache = createOfflineCache({db: f.db, getScope: () => scope});
  await assert.rejects(cache.write('/todos?date=' + date, undefined));
  await assert.rejects(cache.write('/todos?date=' + date, {items: [{id: randomUUID(), version: 1}]}),
    error => error.code === 'OFFLINE_RESPONSE_INVALID');
  assert.equal((await f.app.queue()).operations.length, 0);
  const app = createOfflineRuntime({db: f.db, request: async () => { throw Object.assign(new Error('aborted'), {name: 'AbortError'}); }});
  await assert.rejects(app.call('/auth/me'), error => error.name === 'AbortError');
});
test('unavailable durable database rejects offline mutation instead of reporting memory success', async () => {
  let requests = 0;
  await assert.rejects(offlineRequest('/todos', {method: 'POST', body: {id: randomUUID(), date, text: '不能丢'}},
    async () => { requests++; }), error => error.code === 'OFFLINE_STORAGE_UNAVAILABLE');
  assert.equal(requests, 0);
});
test('a fresh server choice archives a real durable branch while retaining both evidence bodies', async t => {
  const f = fixture(t); await initialize(f);
  const id = randomUUID(), key = entityKey(scope, 'conflict:synthetic');
  f.source.online = false; await f.app.call('/todos', {method: 'POST', body: {id, date, text: '本地全文'}});
  const [operation] = await f.db.transaction(['outbox'], 'readonly', tx => tx.getAll('outbox'));
  const entity = await f.db.transaction(['entities'], 'readonly', tx => tx.get('entities', entityKey(scope, 'todo:' + id)));
  const local = entity.local, remote = {...local, text: '线上全文', version: 2};
  f.remote.set(id, remote); f.source.online = true;
  await f.db.transaction(['entities', 'outbox', 'conflicts'], 'readwrite', async tx => {
    await tx.put('entities', {...entity, server: remote, conflict: key});
    await tx.put('outbox', {...operation, status: 'conflict'});
    await tx.put('conflicts', {key, scope, entity_id: 'todo:' + id, local, remote, resolved_at: null, operation});
  });
  await f.app.resolve(key, 'use-server'); assert.equal((await f.app.queue()).conflicts.length, 0);
  const saved = await f.db.transaction(['conflicts'], 'readonly', tx => tx.get('conflicts', key));
  assert.equal(saved.local.text, '本地全文'); assert.equal(saved.remote.text, '线上全文');
});
test('the four status labels expose queued and unresolved conflict state honestly', () => {
  assert.equal(offlineStatusLabel({online: true, pending: 0}), '已同步');
  assert.equal(offlineStatusLabel({online: true, phase: 'syncing'}), '同步中');
  assert.equal(offlineStatusLabel({online: true, pending: 3}), '同步中');
  assert.equal(offlineStatusLabel({online: false, pending: 3}), '离线（3 条待同步）');
  assert.equal(offlineStatusLabel({online: true, conflicts: 1}), '有冲突');
});
