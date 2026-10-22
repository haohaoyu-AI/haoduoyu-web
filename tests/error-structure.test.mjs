import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {errorFiles, errorCalls} from '../scripts/audit-error-contracts.mjs';

test('one canonical throwing helper is re-exported compatibly without local fail/bad factories', async () => {
  const canonical = new URL('../src/lib/errors.mjs', import.meta.url);
  assert.equal(existsSync(canonical), true, 'canonical throwing error module must exist');
  const {fail} = await import(canonical);
  const shared = await import('../shared/auth.mjs');
  const security = await import('../src/security.mjs');
  assert.equal(shared.fail, fail);assert.equal(security.fail, fail);
  for (const path of errorFiles) {
    const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:function\s+(?:fail|bad)\s*\(|(?:const|let|var)\s+(?:fail|bad)\s*=)/, path);
  }
  await errorCalls(undefined, true);
  const events = [];
  try {fail(409, 'SYNTHETIC_CONFLICT', '合成错误消息');events.push('returned');}
  catch (error) {
    events.push('caught');assert.ok(error instanceof Error);
    assert.deepEqual({status: error.status, code: error.code, message: error.message},
      {status: 409, code: 'SYNTHETIC_CONFLICT', message: '合成错误消息'});
  } finally {events.push('finally');}
  assert.deepEqual(events, ['caught', 'finally']);
});
