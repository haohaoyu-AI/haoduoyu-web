import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectWorkbenchRound6,round6AddedModules} from './workbench-round6-projection.mjs';
import {projectWorkbenchRound6Badge,round6BadgePaths} from './workbench-round6-badge-projection.mjs';
import {projectUnifyStage1,projectedChangedFiles} from './unify-stage1-projection.mjs';
import {projectUnifySwModules} from './unify-sw-projection.mjs';

const root=new URL('../',import.meta.url),hash=value=>createHash('sha256').update(value).digest('hex');
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const delta=JSON.parse(await read('tests/workbench-round6-delta.json'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
const approved=['public/app.js','public/workbench.css','web/actions.mjs','web/controller.mjs','web/core/constants.mjs',
  'web/core/router.mjs','web/pages/articles.mjs','web/pages/dashboard.mjs','web/pages/daily-notes.mjs'];

test('round-six pins only the nine reviewed presentation paths and adds no frontend modules',async()=>{
  assert.equal(delta.baseline,'16ff80ef2d857676d81b7c219110c820de5af72b');
  assert.deepEqual(delta.added_modules,[]);assert.deepEqual(round6AddedModules,[]);
  for(const [file,entry]of Object.entries(delta.files)) {
    assert.ok(approved.includes(file),'only approved presentation files: '+file);
    assert.match(entry.before,/^[a-f0-9]{64}$/,'no newly added files: '+file);
    const source=await read(file);
    const stage1=projectUnifyStage1(file,source);
    const reviewed=round6BadgePaths.includes(file)?projectWorkbenchRound6Badge(file,stage1):stage1;
    assert.equal(hash(reviewed),entry.after,'on-disk round-six source stays exact after the narrow badge inverse: '+file);
    assert.equal(projectWorkbenchRound6(file,source),git('show',delta.baseline+':'+file));
    assert.throws(()=>projectWorkbenchRound6(file,source+'\n/* unauthorized change */\n'),/approved workbench delta/);
  }
  const roots=['web','public','src','shared','db','drizzle','scripts'];
  assert.deepEqual(projectedChangedFiles(delta.baseline,roots),Object.keys(delta.files).sort());
  const released=git('ls-tree','-r','--name-only',delta.baseline,'web').trim().split('\n').filter(file=>file.endsWith('.mjs')).sort();
  const modules=(await readdir(new URL('../web/',import.meta.url),{recursive:true})).filter(file=>file.endsWith('.mjs')).map(file=>'web/'+file).sort();
  assert.equal(modules.length,64);assert.deepEqual(projectUnifySwModules(modules),released,
    'complete released module inventory stays exact after the pinned later SW client projects to absence');
});

test('round-six preserves every backend, contract and business store including complete all-status catalog support',()=>{
  const immutable=['src','shared','db','drizzle','scripts','runtime.json','package.json','package-lock.json',
    'public/openapi.json','public/api-docs.html','public/llms.txt','web/core/article-ledger-data.mjs',
    'web/core/note-entries-state.mjs','web/core/daily-notes-state.mjs','web/core/todos-state.mjs',
    'web/core/todo-templates-state.mjs','web/core/memos-state.mjs','web/core/notes-editor-view.mjs'];
  assert.deepEqual(projectedChangedFiles(delta.baseline,immutable),[],
    'only the exact stage-one static asset registration is reversed; business and server bytes remain unchanged');
});
