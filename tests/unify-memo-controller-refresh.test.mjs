import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {frontendSource} from './frontend-client.mjs';

const source = await frontendSource();

test('the actual memo controller defers local hydration until the foreground load finishes', async () => {
  const body = {style: {}}, calls = [];
  let finishLocal;
  const local = new Promise(resolve => { finishLocal = resolve; });
  const store = {state: {loading: true, canEdit: false}, drafts: new Map(), load(options) {
    calls.push(options); return local;
  }};
  const context = vm.createContext({AbortController, AbortSignal, DOMException, Headers, URL, URLSearchParams, Intl,
    document: {body, activeElement: body, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}},
    window: {addEventListener() {}}, location: {href: 'http://localhost/?page=memos', search: '?page=memos'},
    localStorage: {getItem() {}}, requestAnimationFrame() {}, setTimeout, clearTimeout,
    __memoRefreshFixtureStore: store,
  });
  new vm.Script(source).runInContext(context);
  const run = code => vm.runInContext(code, context);
  run("state.page='memos';state.me={id:'synthetic-memo-owner'};memoIdentity=currentIdentity();" +
    'memoStore=__memoRefreshFixtureStore;memoOfflineRefresh=true;refreshDurableMemos()');
  await Promise.resolve();
  assert.equal(calls.length, 0, 'foreground loading must not start a competing local load');
  assert.equal(run('memoOfflineRefresh'), true, 'the requested local refresh must remain pending');
  assert.equal(run('memoOfflineFlight'), null);

  store.state.loading = false; store.state.canEdit = true;
  run('refreshDurableMemos();refreshDurableMemos()');
  const flight = run('memoOfflineFlight');
  await Promise.resolve();
  assert.equal(calls.length, 1, 'foreground completion starts exactly one deferred local refresh');
  assert.equal(calls[0].local, true);
  assert.equal(run('memoOfflineRefresh'), false);
  assert.equal(run('memoOfflineLoading'), true);
  finishLocal(); await flight;
  assert.equal(run('memoOfflineLoading'), false);
  assert.equal(run('memoOfflineFlight'), null);
  assert.equal(store.state.canEdit, true);
  assert.equal(calls.length, 1);
});
