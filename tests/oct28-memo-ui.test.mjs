import test from 'node:test';
import assert from 'node:assert/strict';
import {paintMemos, renderMemos} from '../web/pages/memos.mjs';

function fixture(item) {
  const nodes = new Map();
  const root = {dataset: {}, closest: () => null, querySelectorAll: () => [], querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {hidden: false, disabled: false, dataset: {}, value: '',
      innerHTML: '', textContent: '', open: false, setAttribute(name, value) { this[name] = value; }});
    return nodes.get(selector);
  }};
  const store = {state: {noteId: item.id, groups: [{id: item.group_id}], notes: [],
    canEdit: true, loading: false, trash: false, pane: 'editor'}, drafts: new Map([[item.id, item]])};
  return {root, store, nodes};
}

test('memo shows actual server or queued local time and retains actionable status', () => {
  assert.match(renderMemos(), /id="memo-edited-at"/);
  const item = {id: 'note', group_id: 'group', title: '测试', body: '内容', phase: 'saved',
    updated_at: '2026-10-28T03:04:00.000Z', localUpdatedAt: '2026-10-28T04:05:00.000Z', localQueued: false};
  const {root, store, nodes} = fixture(item);
  paintMemos(root, store);
  assert.equal(nodes.get('#memo-edited-at').dateTime, item.updated_at);
  assert.match(nodes.get('#memo-edited-at').textContent, /^编辑于 /);
  assert.equal(nodes.get('#memo-status').hidden, true);
  assert.equal(nodes.get('#memo-detail').textContent, '');
  item.phase = 'queued'; item.localQueued = true;
  paintMemos(root, store);
  assert.equal(nodes.get('#memo-edited-at').dateTime, item.localUpdatedAt);
  assert.match(nodes.get('#memo-edited-at').textContent, /^本机编辑于 /);
  assert.equal(nodes.get('#memo-status').hidden, false);
  assert.match(nodes.get('#memo-status').textContent, /等待同步/);
  item.phase = 'conflict'; item.localQueued = false; item.updated_at = 'invalid';
  paintMemos(root, store);
  assert.equal(nodes.get('#memo-edited-at').hidden, true);
  assert.equal(nodes.get('#memo-status').hidden, false);
  assert.match(nodes.get('#memo-status').textContent, /冲突/);
});
