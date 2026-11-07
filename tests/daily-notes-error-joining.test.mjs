import test from 'node:test';
import assert from 'node:assert/strict';
import {joinNotesErrors} from '../web/daily-notes-controller.mjs';

test('read-only draft warnings join without overlapping sentence punctuation', () => {
  const life = '生活原记录：保留的原有草稿只读，可导出；不会自动上传。';
  const work = '工作原记录：保留的原有草稿只读，可导出；不会自动上传。';
  assert.equal(joinNotesErrors([life, work]),
    '生活原记录：保留的原有草稿只读，可导出；不会自动上传；工作原记录：保留的原有草稿只读，可导出；不会自动上传。');
  assert.equal(joinNotesErrors([null, life, '']), life);
  assert.equal(joinNotesErrors([]), '');
});
