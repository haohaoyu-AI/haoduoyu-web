import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {smallFixBaseline,smallFixProduct,smallFixHashes,projectSmallFix} from './oct28-small-fix-projection.mjs';
const root=new URL('../',import.meta.url);
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
const hash=s=>createHash('sha256').update(s).digest('hex');
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('small fix is exactly the pinned closed set and each inverse rejects altered bytes',()=>{
  const files=Object.keys(smallFixHashes);
  assert.deepEqual(git('diff','--name-only',smallFixBaseline,smallFixProduct).trim().split('\n'),files);
  for(const file of files) {
    const prior=git('show',smallFixBaseline+':'+file), product=git('show',smallFixProduct+':'+file);
    assert.equal(hash(product),smallFixHashes[file],file+' pinned product');
    assert.equal(read(file),product,file+' current product');
    assert.equal(projectSmallFix(file,product),prior,file+' inverse');
    assert.equal(projectSmallFix(file,prior),prior,file+' prior');
    assert.throws(()=>projectSmallFix(file,product+'\n'),/exact approved small UI fix bytes/,file+' forged');
  }
  assert.equal(projectSmallFix('runtime.json','changed'),'changed');
  assert.equal(projectSmallFix('public/../public/app.js','changed'),'changed');
});
