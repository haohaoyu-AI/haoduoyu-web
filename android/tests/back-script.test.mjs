import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';

const script = readFileSync(new URL('../app/src/main/assets/android-back.js', import.meta.url), 'utf8');
const events = readFileSync(new URL('../../web/events.mjs', import.meta.url), 'utf8');
const todos = readFileSync(new URL('../../web/pages/todos.mjs', import.meta.url), 'utf8');
function extract(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, 'the website handler contract must be reviewed if source moves');
  return source.slice(first, last);
}
const websiteHandlers = extract(events, 'function handleKeydown(event)', 'function handleResize()')
  + extract(todos, 'async function setTodoPanel(panel)', 'function todoPending(day)');

function run({modal = false, popover = false, sidebar = false, dropdown = false, hidden = false, panel = ''} = {}) {
  const keyEvents = [];
  const history = panel ? ['todos', panel] : ['todos'];
  let index = history.length - 1;
  const context = {
    state: {page: 'todos', todoPanel: panel},
    runtime: {activePopover: popover ? {node: {}, menu: false} : null},
    closeMediaNavigation() { dropdown = false; },
    closePopover() { context.runtime.activePopover = null; },
    setMenu() { sidebar = false; },
    closeModal() { modal = false; },
    todosVisible: () => true,
    paintTodos() {},
    loadTodos: async () => {},
    updateRoute(push) {
      if (push) { history.splice(index + 1); history.push(context.state.todoPanel || 'todos'); index++; }
    },
    $(selector) {
      if (selector === '#overlay') return {firstChild: modal ? {} : null};
      if (selector === '.shell') return {classList: {contains: () => sidebar}};
      return {focus() {}};
    },
    $$: () => [],
    document: {
      querySelectorAll(selector) {
        const matches = selector.includes('.popover') ? modal || popover || sidebar
          : selector.includes('.mobile-notes-nav') ? dropdown : Boolean(context.state.todoPanel);
        return matches ? [{getClientRects: () => hidden ? [] : [{}]}] : [];
      },
      dispatchEvent(event) {
        keyEvents.push(event.key);
        context.handleKeydown(event);
      }
    },
    KeyboardEvent: function (type, init) {
      return {type, ...init, preventDefault() {}, stopPropagation() {}};
    }
  };
  runInNewContext(websiteHandlers, context);
  const consumed = runInNewContext(script, context);
  if (!consumed && index > 0) {
    index--;
    context.state.todoPanel = '';
  }
  return {consumed, keyEvents, history, index};
}

test('normal pages and hidden overlays allow native history', () => {
  assert.equal(run().consumed, false);
  assert.equal(run({modal: true, hidden: true}).consumed, false);
});
test('visible modal, popover and sidebar consume one Escape', () => {
  for (const type of ['modal', 'popover', 'sidebar']) {
    const result = run({[type]: true});
    assert.equal(result.consumed, true);
    assert.deepEqual(result.keyEvents, ['Escape']);
    assert.equal(result.history.length, 1);
  }
});
test('standalone mobile dropdown closes through website Escape', () => {
  const result = run({dropdown: true});
  assert.equal(result.consumed, true);
  assert.deepEqual(result.keyEvents, ['Escape']);
});
for (const panel of ['history', 'templates']) {
  for (const dropdown of [false, true]) {
    test(panel + (dropdown ? ' plus mobile menu' : '') + ': back adds no close entry', () => {
      const result = run({panel, dropdown});
      assert.equal(result.consumed, false);
      assert.deepEqual(result.keyEvents, []);
      assert.equal(result.index, 0);
      assert.deepEqual(result.history, ['todos', panel]);
    });
  }
  test(panel + ' plus modal/popover/sidebar: Escape dismisses overlay without pushing history', () => {
    for (const type of ['modal', 'popover', 'sidebar']) {
      const result = run({panel, dropdown: true, [type]: true});
      assert.equal(result.consumed, true);
      assert.deepEqual(result.history, ['todos', panel]);
    }
  });
}
