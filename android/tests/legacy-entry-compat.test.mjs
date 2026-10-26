import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const root = new URL('../app/src/test/java/xyz/haoduoyu/personal/', import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');

test('legacy native UI implementation and every original UI assertion remain the exact fixed v2.0.1 fixture', async () => {
  const fixture = await readFile(new URL('LegacyOfflineActivityFixture.java', root), 'utf8');
  const coverage = await readFile(new URL('NativeOfflineUiTest.java', root), 'utf8');
  assert.equal(hash(fixture.replaceAll('LegacyOfflineActivityFixture', 'OfflineActivity')),
    '76128709629f20028a9d57762d9ac69aaec68a9aac142d18eb3da68006f71e61');
  assert.equal(hash(coverage.replaceAll('LegacyOfflineActivityFixture', 'OfflineActivity')),
    '7fe6e4c3f4950755194f2359a219f09be126005b39d8f5d91c510d14a12f5221');
});
