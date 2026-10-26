import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';

const script = readFileSync(new URL('../app/src/main/assets/android-back.js', import.meta.url), 'utf8');
function run({overlay = false, hidden = false, panel = ''} = {}) {
  const events = [];
  let selectors = '';
  const document = {
    querySelectorAll(value) {
      selectors = value;
      // Only selected, visible elements count. A panel must never be selected by this bridge.
      const matches = overlay || (panel && value.includes('#todo-' + panel));
      return matches ? [{getClientRects: () => hidden ? [] : [{}]}] : [];
    },
    dispatchEvent(event) { events.push(event.key); }
  };
  const result = runInNewContext(script, {
    document, KeyboardEvent: function (type, init) { return {type, ...init}; }
  });
  return {result, events, selectors};
}
test('visible overlay consumes one Escape before history', () => {
  assert.equal(run({overlay: true}).result, true);
  assert.deepEqual(run({overlay: true}).events, ['Escape']);
});
test('hidden overlays and normal pages do not consume Android back', () => {
  assert.equal(run({overlay: true, hidden: true}).result, false);
  assert.deepEqual(run().events, []);
});
for (const panel of ['history', 'templates']) {
  test(panel + ': Android back traverses history without adding a close entry', () => {
    const history = ['todos', panel];
    let index = 1;
    const outcome = run({panel});
    // The actual website Escape handler would push a closed panel entry, recreating the loop.
    if (outcome.events.length) { history.splice(index + 1); history.push('todos'); index++; }
    if (!outcome.result && index > 0) index--;
    assert.equal(index, 0);
    assert.equal(history.length, 2);
    assert.equal(run().result, false); // Next back reaches the native root behavior.
    assert.equal(outcome.selectors.includes('#todo-'), false);
  });
}
