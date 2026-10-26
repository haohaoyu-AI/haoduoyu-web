import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotesEditorView, noteEditorCanCollapse} from '../web/core/notes-editor-view.mjs';

const day = '2026-10-24', other = '2026-10-23';
const record = (id = 'one', extra = {}) => ({id, loaded: true, loading: false, dirty: false,
  pending: null, composing: false, phase: 'saved', version: 1, draft: '已保存文字', ...extra});
const legacy = () => record('legacy', {version: 0, phase: 'saved', draft: ''});

test('saved entries start as compact readers and explicit edit selects exactly one top field', () => {
  const views = createNotesEditorView(), first = record(), second = record('two');
  assert.equal(views.sync('life', day, [first, second], legacy()).active, '');
  views.activate('life', day, first.id);
  assert.equal(views.sync('life', day, [first, second], legacy(), {focused: true}).active, first.id);
  views.activate('life', day, second.id);
  assert.equal(views.sync('life', day, [first, second], legacy()).active, second.id);
});

test('focused acknowledged saves keep the editor until focus leaves the whole host', () => {
  const views = createNotesEditorView(), item = record(), view = views.activate('life', day, item.id);
  assert.equal(views.sync('life', day, [item], legacy(), {focused: true}).active, item.id);
  views.requestCollapse('life', day, item.id, view.revision);
  assert.equal(views.sync('life', day, [item], legacy(), {focused: true}).active, item.id);
  assert.equal(views.sync('life', day, [item], legacy()).active, '');
});

test('blur while saving waits for the final acknowledged draft before collapsing', () => {
  const views = createNotesEditorView(), item = record('one', {dirty: true, pending: {}, phase: 'saving'});
  const view = views.activate('life', day, item.id); views.requestCollapse('life', day, item.id, view.revision);
  assert.equal(views.sync('life', day, [item], legacy()).active, item.id);
  item.pending = null; item.phase = 'dirty'; assert.equal(views.sync('life', day, [item], legacy()).active, item.id);
  item.dirty = false; item.phase = 'saved'; assert.equal(views.sync('life', day, [item], legacy()).active, '');
});

test('old blur callbacks and acknowledgements cannot collapse a newly selected editor', () => {
  const views = createNotesEditorView(), one = record(), two = record('two');
  const oldRevision = views.activate('life', day, one.id).revision;
  views.activate('life', day, two.id); views.requestCollapse('life', day, one.id, oldRevision);
  assert.equal(views.sync('life', day, [one, two], legacy()).active, two.id);
  views.activate('life', day, one.id); views.requestCollapse('life', day, one.id, oldRevision);
  assert.equal(views.sync('life', day, [one, two], legacy()).active, one.id);
});

test('IME composing state blocks collapse through blur and an otherwise stable acknowledgement', () => {
  const views = createNotesEditorView(), item = record(), view = views.activate('life', day, item.id);
  views.requestCollapse('life', day, item.id, view.revision);
  assert.equal(views.sync('life', day, [item], legacy(), {composing: true}).active, item.id);
  item.composing = true; assert.equal(views.sync('life', day, [item], legacy()).active, item.id);
  item.composing = false; assert.equal(views.sync('life', day, [item], legacy()).active, '');
});

test('unknown, conflict, oversize and unsaved drafts remain recoverable even before first save', () => {
  for (const phase of ['unknown', 'conflict', 'oversize', 'error']) {
    const views = createNotesEditorView(), item = record('one', {phase, version: 0, dirty: true});
    const view = views.sync('life', day, [item], legacy());
    assert.equal(view.active, item.id); views.requestCollapse('life', day, item.id, view.revision, {explicit: true});
    assert.equal(views.sync('life', day, [item], legacy()).active, item.id); assert.equal(noteEditorCanCollapse(item), false);
    views.activate('life', day, 'two'); assert.equal(views.sync('life', day, [item, record('two')], legacy()).active, 'two');
  }
});

test('date and category changes retain each active record independently and reset on identity clear', () => {
  const views = createNotesEditorView(), item = record();
  views.activate('life', day, item.id); views.activate('work', day, 'two'); views.activate('life', other, 'three');
  assert.equal(views.sync('life', day, [item], legacy()).active, item.id);
  assert.equal(views.sync('work', day, [record('two')], legacy()).active, 'two');
  assert.equal(views.sync('life', other, [record('three')], legacy()).active, 'three');
  views.clear(); assert.equal(views.sync('life', day, [item], legacy()).active, '');
});

test('legacy records follow the same explicit editing and unknown-write protection', () => {
  const views = createNotesEditorView(), old = record('legacy', {phase: 'unknown', pending: {}});
  const view = views.sync('life', day, [], old); assert.equal(view.active, 'legacy');
  views.requestCollapse('life', day, 'legacy', view.revision); assert.equal(views.sync('life', day, [], old).active, 'legacy');
  old.pending = null; old.phase = 'saved'; assert.equal(views.sync('life', day, [], old).active, '');
});

test('an empty new composer can close without a server record and explicit close works from its button', () => {
  const views = createNotesEditorView(), item = record('one', {version: 0, phase: 'empty', draft: ''});
  const view = views.activate('life', day, item.id); views.requestCollapse('life', day, item.id, view.revision, {explicit: true});
  assert.equal(views.sync('life', day, [item], legacy(), {focused: true}).active, '');
});
