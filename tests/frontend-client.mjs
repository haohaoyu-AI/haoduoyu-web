import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Tests execute the actual committed bundle. These aliases exist only in VM
// harnesses so older assertions retain access to the same live runtime fields.
export async function frontendSource({initialize = false} = {}) {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /init\(\);\s*$/, 'the production entry must initialize once at the end');
  const fields = ['renderVersion', 'lastFocus', 'searchTimer', 'activePopover',
    'popoverId', 'modalRequestVersion', 'menuFocus', 'entryObserver', 'entryBlocks',
    'articleIndexGeneration', 'sessionEpoch'];
  const aliases = `\nfor (const field of ${JSON.stringify(fields)}) {
    Object.defineProperty(globalThis, field, {
      configurable: true, get() { return runtime[field]; },
      set(value) { runtime[field] = value; }
    });
  }\n`;
  return source.replace(/init\(\);\s*$/, '') + aliases + (initialize ? 'init();\n' : '');
}
