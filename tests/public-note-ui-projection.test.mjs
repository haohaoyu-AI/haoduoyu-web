import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {historicalTree} from './historical-tree.mjs';
import {projectPublicNoteFrontend} from './public-note-ui-projection.mjs';

const publicEdit=historicalTree('2677c8259e08871b03ea42b8e162b0dad63cb8c3');
const beforePublicEdit=historicalTree('701db4febbdb17b098d8734b22d94f1a813d7616');
test('public edit UI delta rejects an unrelated declaration or removed CSRF-independent capability check',async()=>{
  const capabilityChecks=[
    ['web/core/memos-state.mjs','state.canEdit && idPattern.test(context.ownerId)','idPattern.test(context.ownerId)'],
    ['web/core/daily-notes-state.mjs','!item.canEdit || ',''],
  ];
  for(const [file,capabilityCheck,replacement] of capabilityChecks) {
    const source=publicEdit.read(file);
    assert.equal(await projectPublicNoteFrontend(file,source),beforePublicEdit.read(file));
    const withoutCapabilityCheck=source.replace(capabilityCheck,replacement);
    assert.notEqual(withoutCapabilityCheck,source);
    for(const mutation of [source+'\nconst unauthorized=true;\n',withoutCapabilityCheck]) {
      await assert.rejects(projectPublicNoteFrontend(file,mutation),/approved public note UI delta|approved workbench delta/);
    }
  }
});

test('public note backend projection pins the dedicated public actor implementation',async()=>{
  const {projectPublicNoteBackend}=await import('./public-note-ui-projection.mjs');
  const file='src/public-note-access.mjs',source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  assert.equal(await projectPublicNoteBackend(file,source),'');
  await assert.rejects(projectPublicNoteBackend(file,source.replace("kind:'public'","kind:'session'")),/exact approved public note backend delta/);
});
