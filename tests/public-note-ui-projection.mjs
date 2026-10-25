import {projectReconciliation} from './reconciliation-ui-projection.mjs';
import assert from 'node:assert/strict';
import {projectWorkbenchRound3} from './workbench-round3-projection.mjs';
import {projectWorkbenchFrontend} from './workbench-ui-projection.mjs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {frontendBundle} from '../scripts/frontend-build.mjs';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('./public-note-ui-delta.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function projectPublicNoteFrontend(file,source) {
  const original=source;
  source=projectReconciliation(file,source);
  if(file!=='public/app.js')source=await projectWorkbenchFrontend(file,source);
  const expected=manifest.files[file];
  if(expected) {
    assert.equal(hash(source),expected.after_sha256,'exact accepted memo module bytes / approved public note UI delta: '+file);
    const before=execFileSync('git',['show',manifest.baseline+':'+file],{cwd:root,encoding:'utf8'});
    assert.equal(hash(before),expected.before_sha256,'public edit baseline remains exact: '+file);
    return before;
  }
  if(file==='public/app.js') {
    assert.equal(original,Buffer.from(await frontendBundle(fileURLToPath(root))).toString('utf8'),'public edit bundle matches actual source');
    return execFileSync('git',['show',manifest.baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
  }
  return source;
}
export async function projectPublicNoteBackend(file,source) {
  const expected=manifest.backend[file];
  if(!expected)return source;
  if(hash(source)!==expected.after_sha256)source=projectWorkbenchRound3(file,source);
  assert.equal(hash(source),expected.after_sha256,'exact approved public note backend delta: '+file);
  if(expected.before_sha256===null)return '';
  const before=execFileSync('git',['show',manifest.baseline+':'+file],{cwd:root,encoding:'utf8'});
  assert.equal(hash(before),expected.before_sha256);
  return before;
}
