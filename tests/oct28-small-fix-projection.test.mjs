import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {smallFixBaseline,smallFixProduct,smallFixHashes,projectSmallFix,projectQuietSync,quietSyncHashes} from './oct28-small-fix-projection.mjs';
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
    assert.equal(projectQuietSync(file,read(file)),product,file+' quiet-sync to small-fix product');
    assert.equal(projectSmallFix(file,product),prior,file+' inverse');
    assert.equal(projectSmallFix(file,prior),prior,file+' prior');
    assert.throws(()=>projectSmallFix(file,product+'\n'),/exact approved small UI fix bytes/,file+' forged');
  }
  assert.equal(projectSmallFix('runtime.json','changed'),'changed');
  assert.equal(projectSmallFix('public/../public/app.js','changed'),'changed');
});

test('quiet sync pins restored live product bytes and leaves other digests for later layers',()=>{
  for(const file of Object.keys(quietSyncHashes)) {
    const prior=git('show',smallFixProduct+':'+file), current=read(file);
    assert.equal(hash(current),quietSyncHashes[file],file+' pinned quiet-sync product');
    assert.equal(projectQuietSync(file,current),prior,file+' quiet-sync inverse');
    assert.equal(projectQuietSync(file,prior),prior,file+' quiet-sync prior');
    assert.equal(projectQuietSync(file,current+'\n'),current+'\n',file+' unknown digest passes through');
  }
  assert.equal(projectQuietSync('runtime.json','changed'),'changed');
});
