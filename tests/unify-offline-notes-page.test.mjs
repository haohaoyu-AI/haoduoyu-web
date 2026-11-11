import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {paintNoteEntries, renderDailyNotes} from '../web/pages/daily-notes.mjs';

const date = '2026-10-24';
function node() {
  const queries = new Map(), classes = new Set();
  const value = {dataset: {}, children: [], value: '', textContent: '', innerHTML: '', selectionStart: 0, selectionEnd: 0,
    selectionDirection: 'none', scrollTop: 0,
    classList: {toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }},
    querySelector(selector) { if (!queries.has(selector)) queries.set(selector, node()); return queries.get(selector); },
    removeAttribute(name) { delete this[name]; },
    setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; },
    insertBefore(child, before) {
      child.remove(); const index = before ? this.children.indexOf(before) : -1;
      this.children.splice(index < 0 ? this.children.length : index, 0, child); child.parentNode = this;
    },
    replaceChildren(...children) { for (const child of [...this.children]) child.remove(); for (const child of children) this.insertBefore(child); },
    remove() {
      if (!this.parentNode) return;
      const list = this.parentNode.children, index = list.indexOf(this); if (index >= 0) list.splice(index, 1); this.parentNode = null;
    },
  };
  Object.defineProperty(value, 'firstElementChild', {get: () => value.children[0] || null});
  Object.defineProperty(value, 'nextElementSibling', {get: () => value.parentNode?.children[value.parentNode.children.indexOf(value) + 1] || null});
  return value;
}
function view(t, items = [], legacyExtra = {}) {
  const previous = globalThis.document, document = {createElement: () => node(), activeElement: null};
  globalThis.document = document; t.after(() => { globalThis.document = previous; });
  const root = node(); root.dataset.category = 'life';
  const current = {date, category: 'life', loaded: true, loading: false, canEdit: true, ids: items.map(item => item.id), error: ''};
  const legacy = {date, loaded: true, loading: false, canEdit: true, serverText: '旧线上原文', draft: '旧线上原文', version: 3,
    deleted: false, dirty: false, phase: 'saved', error: '', pending: null, updatedAt: null, ...legacyExtra};
  const map = new Map(items.map(item => [item.id, item])), store = {entry: id => map.get(id)};
  return {root, current, legacy, document, paint: options => paintNoteEntries(root, store, current, legacy, options)};
}
function entry(extra = {}) {
  return {id: randomUUID(), category: 'life', date, loaded: true, loading: false, canEdit: true,
    version: 0, localVersion: 2, serverText: '', durableText: '已写入本机的文字', draft: '已写入本机的文字', localQueued: true,
    dirty: false, deleted: false, phase: 'queued', error: '', pending: null, updatedAt: null, ...extra};
}

test('a durable queued entry with no server version remains visible and displays local text without claiming server save', t => {
  const item = entry(), v = view(t, [item]); v.paint();
  const list = v.root.querySelector('#notes-entry-list'), card = list.children[0];
  assert.equal(list.children.length, 1); assert.equal(card.dataset.noteEntry, item.id);
  assert.equal(card.querySelector('.note-entry-reader').textContent, item.durableText);
  assert.equal(card.querySelector('.note-entry-status').textContent, '已存本机，待同步');
  assert.equal(card.querySelector('[data-note-entry-action="edit"]').hidden, false);
  assert.equal(item.serverText, ''); assert.equal(item.version, 0);
});
test('a snapshot-only trusted local document displays its cached text without inventing an API baseline', t => {
  const item = entry({localBacked: true, localQueued: false, localVersion: 4, phase: 'cached',
    durableText: '完整快照中的缓存文字', draft: '完整快照中的缓存文字'}), v = view(t, [item]); v.paint();
  const list = v.root.querySelector('#notes-entry-list'), card = list.children[0];
  assert.equal(list.children.length, 1); assert.equal(card.querySelector('.note-entry-reader').textContent, item.durableText);
  assert.equal(card.querySelector('.note-entry-status').textContent, '本机缓存');
  assert.equal(item.version, 0); assert.equal(item.serverText, ''); assert.equal(item.contentHash, undefined);
});
test('a later unsaved draft is rendered as text while the durable queue and server baseline remain separate', t => {
  const item = entry({draft: '<img src=x onerror=alert(1)>', dirty: true, phase: 'dirty'}), v = view(t, [item]); v.paint();
  const card = v.root.querySelector('#notes-entry-list').children[0], body = card.querySelector('.note-entry-reader');
  assert.equal(body.textContent, item.draft); assert.equal(body.innerHTML, '');
  assert.equal(item.durableText, '已写入本机的文字'); assert.equal(item.serverText, '');
});
test('legacy pending text remains viewable and exportable, including when its original server record was deleted', t => {
  const draft = '尚未确认的旧草稿全文', v = view(t, [], {draft, dirty: true, phase: 'unknown', deleted: true,
    pending: {kind: 'put', text: draft, saveId: randomUUID()}});
  v.paint({active: 'legacy'});
  const editor = v.root.querySelector('#notes-editor');
  assert.equal(editor.readOnly, true); assert.equal(editor.disabled, false); assert.equal(editor.hidden, false); assert.equal(editor.value, draft);
  assert.equal(v.root.querySelector('#notes-legacy-card [data-notes-action="export-legacy"]').hidden, false);
  for (const action of ['save', 'restore', 'delete', 'retry', 'use-server', 'use-draft', 'confirm-delete']) {
    const control = v.root.querySelector('[data-notes-action="' + action + '"]');
    assert.equal(control.hidden, true, action); assert.equal(control.disabled, true, action);
  }
  for (const selector of ['#notes-write-actions', '#notes-resolution', '#notes-delete-confirm'])
    assert.equal(v.root.querySelector(selector).hidden, true, selector);
  assert.equal(v.legacy.draft, draft); assert.ok(v.legacy.pending);
});
test('a confirmed legacy record offers read-only viewing without an unnecessary draft export action', t => {
  const v = view(t); v.paint();
  const card = v.root.querySelector('#notes-legacy-saved');
  assert.equal(card.querySelector('[data-notes-action="edit-legacy"]').textContent, '查看原有记录');
  assert.equal(card.querySelector('[data-notes-action="edit-legacy"]').hidden, false);
  assert.equal(card.querySelector('[data-notes-action="export-legacy"]').hidden, true);
  assert.equal(card.querySelector('.note-entry-status').textContent, '原有记录 · 只读');
  assert.match(renderDailyNotes(), /data-notes-action="export-legacy"/);
});
test('queued state updates reuse the focused editor node and preserve Chinese composition and caret', t => {
  const item = entry(), v = view(t, [item]); v.paint({active: item.id});
  const host = v.root.querySelector('#notes-active-entry'), card = host.firstElementChild, editor = card.querySelector('textarea');
  v.document.activeElement = editor; editor.dataset.composing = 'true'; editor.value = '拼音输入中的文字';
  editor.selectionStart = 3; editor.selectionEnd = 3; item.draft = '后台较早的本机快照';
  v.paint({active: item.id});
  assert.equal(host.firstElementChild, card); assert.equal(card.querySelector('textarea'), editor);
  assert.equal(editor.value, '拼音输入中的文字'); assert.equal(editor.selectionStart, 3); assert.equal(editor.selectionEnd, 3);
});
