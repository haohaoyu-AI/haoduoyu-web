import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('standalone retained-draft exports explain unsupported save without touching data or attempting downloads', async () => {
  const script = await fs.readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  const source = await fs.readFile(new URL('../frontend/web/daily-notes-controller.mjs', import.meta.url), 'utf8');
  const message = '当前版本暂不支持文件导出，草稿仍保留。';
  assert.ok(script.includes("import {toast} from './ui/toast.mjs';"));
  for (const [name, prefix] of [['exportDraftArchive', 'async function exportDraftArchive() {'],
      ['exportLegacyDraft', 'function exportLegacyDraft(item, category) {']]) {
    assert.equal(source.split(prefix).length - 1, 1);
    assert.ok(script.includes(prefix + '\\n  return toast("' + message + '",true);'));
    const original = name === 'exportDraftArchive'
      ? source.slice(source.indexOf(prefix), source.indexOf('function exportLegacyDraft'))
      : source.slice(source.indexOf(prefix), source.indexOf('function ensureDailyNotesStore'));
    const transformed = original.replace(prefix, prefix + '\n  return toast("' + message + '",true);');
    const notices = [];
    const context = vm.createContext({toast: (...args) => notices.push(args)});
    vm.runInContext(transformed, context);
    // No DOM, Blob, journal or archive API is supplied: any attempt would fail.
    await context[name]({draft:'unchanged synthetic draft'}, 'life');
    assert.deepEqual(notices, [[message,true]]);
  }
});
