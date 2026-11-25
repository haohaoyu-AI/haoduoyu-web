import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';

test('portable old runtime is the exact reproducible bundle of b242 source',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'b242-runtime-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const archive=execFileSync('git',['archive','b242cd573ab05c2fae2d5af779d7275ca45c20ad','web/offline']);
  const extract=spawnSync('tar',['-x','-C',dir],{input:archive});assert.equal(extract.status,0,extract.stderr.toString());
  const built=await build({absWorkingDir:dir,entryPoints:['web/offline/runtime.mjs'],outfile:'fixture.mjs',bundle:true,
    format:'esm',platform:'browser',target:'es2022',legalComments:'none',write:false,logLevel:'silent'});
  const actual=await readFile(new URL('./fixtures/b242-offline-runtime.mjs',import.meta.url));
  assert.equal(createHash('sha256').update(actual).digest('hex'),'9c553a746db3bad856af02f5db5bd762ef2aae704afb9056b5f34175c3354108');
  assert.deepEqual(actual,Buffer.from(built.outputFiles[0].contents));
});
