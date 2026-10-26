import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectWorkbenchRound6,round6AddedModules} from './workbench-round6-projection.mjs';
import {projectWorkbenchRound6Badge,round6BadgePaths} from './workbench-round6-badge-projection.mjs';

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
    const reviewed=round6BadgePaths.includes(file)?projectWorkbenchRound6Badge(file,source):source;
    assert.equal(hash(reviewed),entry.after,'on-disk round-six source stays exact after the narrow badge inverse: '+file);
    assert.equal(projectWorkbenchRound6(file,source),git('show',delta.baseline+':'+file));
    assert.throws(()=>projectWorkbenchRound6(file,source+'\n/* unauthorized change */\n'),/approved workbench delta/);
  }
  const roots=['web','public','src','shared','db','drizzle','scripts'];
  const changed=git('diff','--name-only',delta.baseline,'--',...roots),untracked=git('ls-files','--others','--exclude-standard','--',...roots);
  assert.deepEqual([...new Set((changed+'\n'+untracked).trim().split('\n').filter(Boolean))].sort(),Object.keys(delta.files).sort());
  const released=git('ls-tree','-r','--name-only',delta.baseline,'web').trim().split('\n').filter(file=>file.endsWith('.mjs')).sort();
  const modules=(await readdir(new URL('../web/',import.meta.url),{recursive:true})).filter(file=>file.endsWith('.mjs')).map(file=>'web/'+file).sort();
  assert.equal(modules.length,56);assert.deepEqual(modules,released,'complete released module inventory stays exact');
});

test('round-six preserves every backend, contract and business store including complete all-status catalog support',()=>{
  const immutable=['src','shared','db','drizzle','scripts','runtime.json','package.json','package-lock.json',
    'public/openapi.json','public/api-docs.html','public/llms.txt','web/core/article-ledger-data.mjs',
    'web/core/note-entries-state.mjs','web/core/daily-notes-state.mjs','web/core/todos-state.mjs',
    'web/core/todo-templates-state.mjs','web/core/memos-state.mjs','web/core/notes-editor-view.mjs'];
  assert.equal(git('diff','--name-only',delta.baseline,'--',...immutable),'','no business or server exceptions are permitted');
  assert.equal(git('ls-files','--others','--exclude-standard','--',...immutable),'','no new business or server modules are permitted');
});
