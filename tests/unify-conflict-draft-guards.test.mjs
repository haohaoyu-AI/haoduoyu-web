import test from 'node:test';
import assert from 'node:assert/strict';
import {registerConflictDraftGuard, captureConflictDraftGuard,
  createMemoConflictDraftGuard, createNoteConflictDraftGuard} from '../web/offline/conflict-draft-guards.mjs';

const id = '11111111-1111-4111-8111-111111111111', group = '22222222-2222-4222-8222-222222222222';
const owner = '33333333-3333-4333-8333-333333333333', otherOwner = '44444444-4444-4444-8444-444444444444';
const prefix = 'haoduoyu.memos.drafts.v1.', changed = error => error.code === 'OFFLINE_CONFLICT_CHANGED';
function storage() {
  const values = new Map(), reads = [], writes = [];
  return {values, reads, writes, get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => { reads.push(key); return values.get(key) ?? null; },
    setItem: (key, value) => { writes.push(key); values.set(key, value); }};
}
function memoFixture() {
  const state = {identity: 'owner-identity', store: null, composing: false}, local = storage();
  const draft = {id, title: '原始标题', body: '原始正文', group_id: group, position: 1, composing: false,
    pending: {kind: 'notes', id, method: 'PUT', path: '/memos/notes/' + id,
      body: {title: '提交标题', body: '提交正文', group_id: group, position: 1, version: 1, save_id: otherOwner},
      checking: false, retryReady: false}};
  state.store = {state: {draftOwner: owner, noteId: id, operation: null}, drafts: new Map([[id, draft]])};
  const factory = createMemoConflictDraftGuard({getStore: () => state.store, getIdentity: () => state.identity,
    getStorage: () => local, getComposing: () => state.composing});
  return {state, draft, local, factory, capture: () => factory('memo-note:' + id)};
}
function noteFixture() {
  const draft = {id, draft: '本机碎碎念', composing: false,
    pending: {kind: 'put', version: 2, text: '已提交原文', saveId: owner, checking: false, retryReady: false}};
  const state = {identity: 'note-identity', composing: false, stores: new Map([['life', {entries: new Map([[id, draft]])}]])};
  const factory = createNoteConflictDraftGuard({getStores: () => state.stores, getIdentity: () => state.identity,
    getComposing: () => state.composing});
  return {state, draft, factory, capture: () => factory('note-entry:' + id)};
}

test('registry captures every current factory and unsubscribe only affects later captures', () => {
  const calls = [], stopOne = registerConflictDraftGuard(entity => {
    calls.push(['capture-one', entity]); return () => calls.push(['check-one']);
  });
  const stopTwo = registerConflictDraftGuard(() => () => calls.push(['check-two']));
  try {
    const check = captureConflictDraftGuard('memo-note:' + id); stopOne(); check();
    assert.deepEqual(calls, [['capture-one', 'memo-note:' + id], ['check-one'], ['check-two']]);
    calls.length = 0; captureConflictDraftGuard('memo-note:' + id)(); assert.deepEqual(calls, [['check-two']]);
  } finally { stopOne(); stopTwo(); }
});
test('registry propagates content guard failures and ignores factories for unrelated entities', () => {
  const f = memoFixture(), stop = registerConflictDraftGuard(f.factory);
  try {
    const check = captureConflictDraftGuard('memo-note:' + id); f.draft.body = '新输入'; assert.throws(check, changed);
    assert.doesNotThrow(captureConflictDraftGuard('todo:' + id));
  } finally { stop(); }
});
test('memo guard catches actual title, body, group, position and pending-intent changes', () => {
  for (const mutate of [f => { f.draft.title = '新标题'; }, f => { f.draft.body = '新正文'; },
    f => { f.draft.group_id = otherOwner; }, f => { f.draft.position = 2; },
    f => { f.draft.pending.body.body = '改变原提交'; }, f => { f.draft.pending.body.save_id = group; },
    f => { f.draft.pending = null; }]) {
    const f = memoFixture(), check = f.capture(); mutate(f); assert.throws(check, changed);
  }
});
test('memo guard ignores save timestamps, read errors, phases and receipt-check progress', () => {
  const f = memoFixture(), key = prefix + owner + '.tab';
  const journal = {saved_at: 1, drafts: [structuredClone(f.draft)]}; f.local.values.set(key, JSON.stringify(journal));
  const check = f.capture();
  Object.assign(f.draft, {saved_at: 200, error: '读取中', phase: 'unknown', loading: true, version: 9});
  Object.assign(f.draft.pending, {checking: true, retryReady: true});
  journal.saved_at = 300; Object.assign(journal.drafts[0], {phase: 'error', error: '读取中', loading: true});
  journal.drafts[0].pending.checking = true; f.local.values.set(key, JSON.stringify(journal));
  assert.doesNotThrow(check); assert.deepEqual(f.local.writes, []);
});
test('private memo journals never read another owner and ignore unrelated target drafts', () => {
  const f = memoFixture(), otherKey = prefix + otherOwner + '.tab', ownKey = prefix + owner + '.tab';
  f.local.values.set(otherKey, '{not-valid-json');
  f.local.values.set(ownKey, JSON.stringify({drafts: [{...f.draft, id: otherOwner, body: '无关条目'}]}));
  const check = f.capture();
  f.local.values.set(otherKey, 'different broken data');
  f.local.values.set(ownKey, JSON.stringify({drafts: [{...f.draft, id: otherOwner, body: '无关新输入'}]}));
  assert.doesNotThrow(check); assert.equal(f.local.reads.includes(otherKey), false);
});
test('new input in an owner journal from another tab invalidates the captured decision', () => {
  const f = memoFixture(), check = f.capture(), key = prefix + owner + '.new-tab';
  f.local.values.set(key, JSON.stringify({saved_at: 1, drafts: [{...f.draft, body: '另一页的新输入'}]}));
  assert.throws(check, changed); assert.deepEqual(f.local.writes, []);
});
test('a changed or removed existing owner journal retains the input and invalidates the decision', () => {
  for (const remove of [false, true]) {
    const f = memoFixture(), key = prefix + owner + '.tab';
    f.local.values.set(key, JSON.stringify({drafts: [f.draft]})); const check = f.capture();
    if (remove) f.local.values.delete(key);
    else f.local.values.set(key, JSON.stringify({drafts: [{...f.draft, title: '其他页的新标题'}]}));
    assert.throws(check, changed);
  }
});
test('memory or DOM IME composition invalidates a memo guard even when its text has not changed', () => {
  for (const mutate of [f => { f.draft.composing = true; }, f => { f.state.composing = true; }]) {
    const f = memoFixture(), check = f.capture(); mutate(f); assert.throws(check, changed);
  }
});
test('memo owner, store or session changes invalidate before inspecting a different owner journal', () => {
  for (const mutate of [f => { f.state.identity = 'another-session'; }, f => { f.state.store = {...f.state.store}; },
    f => { f.state.store.state.draftOwner = otherOwner; }]) {
    const f = memoFixture(), check = f.capture(), readCount = f.local.reads.length; mutate(f);
    assert.throws(check, changed); assert.equal(f.local.reads.length, readCount);
  }
});
test('memo storage failures close the guard only when a memo store exists', () => {
  const factory = createMemoConflictDraftGuard({getStore: () => null, getIdentity: () => 'identity',
    getStorage: () => { throw Error('storage unavailable'); }});
  assert.equal(factory('memo-note:' + id), null);
  const f = memoFixture(), broken = createMemoConflictDraftGuard({getStore: () => f.state.store,
    getIdentity: () => 'identity', getStorage: () => { throw Error('storage unavailable'); }});
  assert.throws(() => broken('memo-note:' + id), changed);
  const check = f.capture(); Object.defineProperty(f.local, 'length', {get: () => { throw Error('read denied'); }});
  assert.throws(check, changed);
});
test('memo structural pending intent targeting the same note blocks a stale decision', () => {
  const f = memoFixture(), check = f.capture();
  f.state.store.state.operation = {pending: {id, kind: 'notes', method: 'DELETE', path: '/memos/notes/' + id,
    body: {version: 2, save_id: group}}};
  assert.throws(check, changed);
});
test('note guards detect text, pending intent and IME changes across both categories', () => {
  for (const mutate of [f => { f.draft.draft = '后续输入'; }, f => { f.draft.pending.text = '原提交变化'; },
    f => { f.draft.composing = true; }, f => { f.state.composing = true; }]) {
    const f = noteFixture(); f.state.stores = new Map([['work', [...f.state.stores.values()][0]]]);
    const check = f.capture(); mutate(f); assert.throws(check, changed);
  }
});
test('note guards ignore status noise while detecting store and identity replacement', () => {
  const f = noteFixture(), check = f.capture();
  Object.assign(f.draft, {phase: 'saving', saved_at: 30, loading: true, error: 'read error'});
  Object.assign(f.draft.pending, {checking: true, retryReady: true}); assert.doesNotThrow(check);
  f.state.stores.set('life', {entries: new Map([[id, f.draft]])}); assert.throws(check, changed);
  const other = noteFixture(), otherCheck = other.capture(); other.state.identity = 'other-owner';
  assert.throws(otherCheck, changed);
});
test('note guards ignore unrelated entity types and stores where the target was never loaded', () => {
  const f = noteFixture(); assert.equal(f.factory('memo-note:' + id), null);
  assert.equal(f.factory('note-entry:' + otherOwner), null); assert.equal(f.factory('note-entry:not-a-uuid'), null);
});
