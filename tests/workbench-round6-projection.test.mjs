import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {historicalTree} from './historical-tree.mjs';
import {createHash} from 'node:crypto';
import {projectWorkbenchRound6,round6AddedModules} from './workbench-round6-projection.mjs';
import {projectWorkbenchRound6Badge,round6BadgePaths} from './workbench-round6-badge-projection.mjs';
import {projectUnifyStage1} from './unify-stage1-projection.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const delta=JSON.parse(await read('tests/workbench-round6-delta.json'));
const before=historicalTree(delta.baseline);
const archived=historicalTree('947bc782ea70e7808f6e7de523e5977818b292df');
const approved=['public/app.js','public/workbench.css','web/actions.mjs','web/controller.mjs','web/core/constants.mjs',
  'web/core/router.mjs','web/pages/articles.mjs','web/pages/dashboard.mjs','web/pages/daily-notes.mjs'];

test('archived round six pins the nine reviewed presentation paths and the original module inventory',()=>{
  assert.equal(delta.baseline,'16ff80ef2d857676d81b7c219110c820de5af72b');
  assert.deepEqual(delta.added_modules,[]);assert.deepEqual(round6AddedModules,[]);
  for(const [file,entry]of Object.entries(delta.files)) {
    assert.ok(approved.includes(file),'only approved presentation files: '+file);
    assert.match(entry.before,/^[a-f0-9]{64}$/,'no newly added files: '+file);
    const source=archived.read(file);
    const stage1=projectUnifyStage1(file,source);
    const reviewed=round6BadgePaths.includes(file)?projectWorkbenchRound6Badge(file,stage1):stage1;
    assert.equal(hash(reviewed),entry.after,'released round-six source stays exact after the narrow badge inverse: '+file);
    assert.equal(projectWorkbenchRound6(file,source),before.read(file));
    assert.throws(()=>projectWorkbenchRound6(file,source+'\n/* unauthorized change */\n'),/approved workbench delta/);
  }
  const roots=['web','public','src','shared','db','drizzle','scripts'];
  assert.deepEqual(archived.changedSince(delta.baseline,...roots).sort(),Object.keys(delta.files).sort());
  const released=before.files('web').filter(file=>file.endsWith('.mjs')).sort();
  const modules=archived.files('web').filter(file=>file.endsWith('.mjs')).sort();
  assert.deepEqual(modules,released,'complete released module inventory stays exact');
});

test('archived round six preserves every backend, contract and business store including complete all-status catalog support',()=>{
  const immutable=['src','shared','db','drizzle','scripts','runtime.json','package.json','package-lock.json',
    'public/openapi.json','public/api-docs.html','public/llms.txt','web/core/article-ledger-data.mjs',
    'web/core/note-entries-state.mjs','web/core/daily-notes-state.mjs','web/core/todos-state.mjs',
    'web/core/todo-templates-state.mjs','web/core/memos-state.mjs','web/core/notes-editor-view.mjs'];
  assert.deepEqual(archived.changedSince(delta.baseline,...immutable),[]);
});
