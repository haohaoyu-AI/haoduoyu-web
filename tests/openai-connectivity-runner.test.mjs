import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAiConnectivityRunner} from '../web/core/openai-connectivity-runner.mjs';

const key = 'connectivity:owner', model = 'test-model', id = 'test-1';
const result = (status = 'succeeded', testId = id) => ({id: testId, status, kind: 'connectivity',
  created_at: '2026-11-09T16:00:00Z', ...(status === 'succeeded' ? {response: 'OK'} : {})});
function memory() {
  const map = new Map();
  return {getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k)};
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; }
function fixture(request, storage = memory(), options = {}) {
  const changes = [], runner = createOpenAiConnectivityRunner({request, storage, key, uuid: () => id,
    now: () => 1794240000000, onChange: value => changes.push(value), ...options});
  return {runner, storage, changes};
}

test('minimum test persists identity and time before its single POST, including rapid clicks', async () => {
  const pending = deferred(), calls = [], storage = memory();
  const {runner} = fixture(async (path, options) => {
    assert.equal(storage.getItem(key), id);
    assert.equal(JSON.parse(storage.getItem(key + ':started')).id, id);
    calls.push({path, ...options}); return pending.promise;
  }, storage);
  const start = runner.start(model); await runner.start(model); await runner.start('other');
  assert.deepEqual(calls, [{path: '/openai-review/connectivity', method: 'POST', body: {test_id: id, model}}]);
  assert.equal(runner.state.operation, 'start'); assert.equal(runner.state.busy, true);
  pending.resolve(result()); await start;
  assert.equal(runner.state.result.response, 'OK'); assert.equal(runner.state.pendingId, '');
  assert.equal(runner.state.busy, false); assert.equal(storage.getItem(key), null);
});

test('reload after a lost POST preserves identity; repeated404 and start never repeat it', async () => {
  const storage = memory(), calls = [];
  const first = fixture(async (path, options) => { calls.push(options?.method || 'GET'); throw new Error('offline'); }, storage);
  await first.runner.start(model); first.runner.dispose();
  const resumed = fixture(async (path, options) => {
    calls.push(options?.method || 'GET'); assert.equal(path, '/openai-review/connectivity/test-1');
    throw Object.assign(new Error('missing'), {status: 404});
  }, storage);
  assert.equal(resumed.runner.state.startedAt, 1794240000000);
  await resumed.runner.start(model); await resumed.runner.recover(); await resumed.runner.recover(); await resumed.runner.start(model);
  assert.deepEqual(calls, ['POST', 'GET', 'GET']); assert.equal(resumed.runner.state.pendingId, id);
  assert.match(resumed.runner.state.error, /不会自动重复调用/);
});

test('running remains recoverable; each server terminal state unlocks an explicit new test', async () => {
  for (const terminal of ['succeeded', 'failed', 'uncertain']) {
    let number = 0; const calls = [];
    const {runner, storage} = fixture(async (path, options) => {
      calls.push(options?.method || 'GET');
      return options?.method ? result('running', options.body.test_id) : result(terminal);
    }, memory(), {uuid: () => 'test-' + (++number)});
    await runner.start(model); assert.equal(runner.state.pendingId, id); await runner.start(model);
    await runner.recover(); assert.equal(runner.state.pendingId, ''); assert.equal(storage.getItem(key), null);
    assert.equal(runner.state.result.status, terminal); assert.deepEqual(calls, ['POST', 'GET']);
    await runner.start(model); assert.deepEqual(calls, ['POST', 'GET', 'POST']);
    assert.equal(runner.state.pendingId, 'test-2');
  }
});

test('parallel recovery observes a pending POST without changing its busy ownership', async () => {
  const post = deferred(), read = deferred(), calls = [];
  const {runner} = fixture(async (path, options) => { calls.push(options?.method || 'GET'); return options?.method ? post.promise : read.promise; });
  const starting = runner.start(model), observing = runner.recover();
  await runner.observe(); await runner.recover();
  assert.deepEqual(calls, ['POST', 'GET']); assert.equal(runner.state.busy, true); assert.equal(runner.state.operation, 'start');
  read.resolve(result()); await observing;
  assert.equal(runner.state.pendingId, ''); assert.equal(runner.state.result.status, 'succeeded');
  assert.equal(runner.state.busy, true); await runner.start(model); assert.equal(calls.length, 2);
  post.reject(new Error('connection lost after confirmed GET')); await starting;
  assert.equal(runner.state.result.status, 'succeeded'); assert.equal(runner.state.error, ''); assert.equal(runner.state.busy, false);
});

test('an early observer404 leaves the POST active and does not erase its identity', async () => {
  const post = deferred();
  const {runner} = fixture(async (_path, options) => { if (options?.method) return post.promise; throw Object.assign(new Error('early'), {status: 404}); });
  const starting = runner.start(model); await runner.observe();
  assert.equal(runner.state.pendingId, id); assert.equal(runner.state.operation, 'start'); assert.equal(runner.state.error, '');
  post.resolve(result('running')); await starting;
  assert.equal(runner.state.pendingId, id); assert.equal(runner.state.result.status, 'running');
});

test('a transient observer failure notifies the scheduler so GET polling can continue', async () => {
  for (const status of [404, 503, undefined]) {
    const post = deferred(), calls = []; let reads = 0;
    const {runner, changes} = fixture(async (_path, options) => {
      calls.push(options?.method || 'GET');
      if (options?.method) return post.promise;
      if (++reads === 1) throw Object.assign(new Error('transient read failure'), {status});
      return result('running');
    });
    const starting = runner.start(model), notifications = changes.length;
    await runner.observe();
    assert.equal(changes.length, notifications + 1, 'the controller needs a notification to schedule its next GET');
    assert.equal(runner.state.operation, 'start'); assert.equal(runner.state.busy, true);
    assert.equal(runner.state.pendingId, id); assert.equal(runner.state.error, '');
    await runner.recover();
    assert.deepEqual(calls, ['POST', 'GET', 'GET']); assert.equal(runner.state.result.status, 'running');
    post.resolve(result()); await starting;
  }
});

test('stale read cannot overwrite a new explicit test after the prior POST completes', async () => {
  const post1 = deferred(), post2 = deferred(), staleGet = deferred(); let number = 0, posts = 0;
  const {runner, changes} = fixture(async (_path, options) => options?.method ? ++posts === 1 ? post1.promise : post2.promise : staleGet.promise,
    memory(), {uuid: () => 'test-' + (++number)});
  const first = runner.start(model), observation = runner.observe(); post1.resolve(result()); await first;
  const second = runner.start(model), notifications = changes.length; staleGet.resolve(result('running')); await observation;
  assert.equal(changes.length, notifications, 'a prior generation must not notify the current scheduler');
  assert.equal(runner.state.pendingId, 'test-2'); assert.equal(runner.state.result, null); assert.equal(runner.state.busy, true);
  post2.resolve(result('failed', 'test-2')); await second;
  assert.equal(runner.state.result.id, 'test-2');
});

test('foreign-tab identity blocks submission and server409 switches only to GET recovery', async () => {
  const storage = memory(); let calls = 0;
  const first = fixture(async () => { calls++; }, storage);
  storage.setItem(key, 'foreign-test'); await first.runner.start(model); assert.equal(calls, 0);
  assert.equal(first.runner.state.pendingId, 'foreign-test');
  const recorded = [];
  const second = fixture(async (path, options) => {
    recorded.push({path, method: options?.method || 'GET'});
    if (options?.method) throw Object.assign(new Error('active'), {code: 'OPENAI_CONNECTIVITY_IN_FLIGHT', test_id: 'existing-test'});
    return result('succeeded', 'existing-test');
  });
  await second.runner.start(model); assert.equal(second.runner.state.pendingId, 'existing-test');
  assert.equal(second.storage.getItem(key), 'existing-test'); await second.runner.start(model); await second.runner.recover();
  assert.deepEqual(recorded, [{path: '/openai-review/connectivity', method: 'POST'},
    {path: '/openai-review/connectivity/existing-test', method: 'GET'}]);
});

test('unavailable or silently failing storage never permits a POST', async () => {
  for (const storage of [
    {getItem() { throw new Error('blocked'); }, setItem() {}, removeItem() {}},
    {getItem: () => null, setItem() { throw new Error('full'); }, removeItem() {}},
    {getItem: () => null, setItem() {}, removeItem() {}},
  ]) {
    let calls = 0; const {runner} = fixture(async () => { calls++; }, storage);
    await runner.start(model); assert.equal(calls, 0); assert.ok(runner.state.error); assert.equal(runner.state.busy, false);
  }
  let calls = 0; const storage = memory(), set = storage.setItem;
  storage.setItem = (name, value) => { if (name !== key) set(name, value); };
  const {runner} = fixture(async () => { calls++; }, storage); await runner.start(model);
  assert.equal(calls, 0); assert.match(runner.state.error, /未发起/);
});

test('dispose fences all late response mutations, notifications and storage cleanup', async () => {
  const post = deferred(), read = deferred(), {runner, storage, changes} = fixture(async (_path, options) => options?.method ? post.promise : read.promise);
  const starting = runner.start(model), observing = runner.observe(); runner.dispose();
  const before = structuredClone(runner.state), notifications = changes.length;
  post.resolve(result()); read.resolve(result()); await Promise.all([starting, observing]);
  runner.adopt(result()); await runner.start(model); await runner.recover();
  assert.deepEqual(runner.state, before); assert.equal(changes.length, notifications); assert.equal(storage.getItem(key), id);
});

test('known pre-dispatch errors unlock while provider, unknown and idempotency errors retain identity', async () => {
  for (const code of ['OPENAI_REVIEW_NOT_CONFIGURED', 'OPENAI_REVIEW_INVALID_KEY_FORMAT', 'OPENAI_CONNECTIVITY_TEST_LIMIT',
    'VALIDATION_ERROR', 'FORBIDDEN', 'UNAUTHORIZED', 'CSRF', 'MEMOS_RATE_LIMIT']) {
    const {runner, storage} = fixture(async () => { throw Object.assign(new Error(code), {code}); });
    await runner.start(model); assert.equal(runner.state.pendingId, '', code); assert.equal(storage.getItem(key), null);
    assert.equal(runner.state.error, code);
  }
  for (const code of ['OPENAI_CONNECTIVITY_CONNECTION', 'OPENAI_CONNECTIVITY_AUTH', 'IDEMPOTENCY_CONFLICT', 'UNKNOWN']) {
    const {runner} = fixture(async () => { throw Object.assign(new Error(code), {code}); });
    await runner.start(model); assert.equal(runner.state.pendingId, id, code);
  }
});

test('an explicitly stale session response fences its runner without clearing the prior owner identity', async () => {
  const post = deferred(), {runner, storage, changes} = fixture(async () => post.promise);
  const starting = runner.start(model), before = structuredClone(runner.state), count = changes.length;
  post.reject(Object.assign(new Error('old identity'), {code: 'UNAUTHORIZED', status: 401, staleSession: true}));
  await starting; runner.adopt(result()); await runner.recover();
  assert.deepEqual(runner.state, before); assert.equal(changes.length, count); assert.equal(storage.getItem(key), id);
});

test('adopting latest results never overwrites another pending test or regresses a terminal result', async () => {
  const storage = memory(); storage.setItem(key, id);
  const {runner} = fixture(async () => result(), storage);
  runner.adopt(result('succeeded', 'old-test')); assert.equal(runner.state.result, null); assert.equal(runner.state.pendingId, id);
  runner.adopt(result('uncertain')); assert.equal(runner.state.pendingId, ''); assert.equal(runner.state.result.status, 'uncertain');
  runner.adopt(result('running')); assert.equal(runner.state.pendingId, ''); assert.equal(runner.state.result.status, 'uncertain');
  runner.adopt(result()); assert.equal(runner.state.result.status, 'succeeded');
  runner.adopt(result('uncertain')); assert.equal(runner.state.result.status, 'succeeded');
});

test('mismatched or invalid success receipts cannot release an uncertain POST', async () => {
  for (const response of [null, {}, result('succeeded', 'wrong-test'), result('unknown')]) {
    const {runner, storage} = fixture(async () => response); await runner.start(model);
    assert.equal(runner.state.pendingId, id); assert.equal(storage.getItem(key), id); assert.equal(runner.state.result, null);
  }
});

test('terminal cleanup preserves unrelated storage and blocks another POST if its own cleanup fails', async () => {
  const post = deferred(), storage = memory(), first = fixture(async () => post.promise, storage);
  const starting = first.runner.start(model); storage.setItem(key, 'other-tab'); post.resolve(result()); await starting;
  assert.equal(storage.getItem(key), 'other-tab'); assert.equal(first.runner.state.pendingId, '');
  await first.runner.start(model); assert.equal(first.runner.state.pendingId, 'other-tab');
  let calls = 0; const broken = memory(); broken.removeItem = () => { throw new Error('storage unavailable'); };
  const second = fixture(async () => { calls++; return result(); }, broken);
  await second.runner.start(model); assert.equal(second.runner.state.result.status, 'succeeded'); assert.equal(second.runner.state.pendingId, '');
  await second.runner.start(model); assert.equal(calls, 1); assert.ok(second.runner.state.error);
});
