import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectPublicNoteFrontend} from './public-note-ui-projection.mjs';
test('public edit UI delta rejects an unrelated declaration or removed CSRF-independent capability check',async()=>{
  for(const file of ['web/core/memos-state.mjs','web/core/daily-notes-state.mjs']) {
    const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
    await projectPublicNoteFrontend(file,source);
    await assert.rejects(projectPublicNoteFrontend(file,source+'\nconst unauthorized=true;\n'),/approved public note UI delta/);
  }
});
