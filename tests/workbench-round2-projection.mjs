import assert from 'node:assert/strict';
import {projectWorkbenchRound3} from './workbench-round3-projection.mjs';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
export function projectWorkbenchRound2(file,source) {
  source=projectWorkbenchRound3(file,source);
  const manifest=JSON.parse(readFileSync(new URL('./workbench-round2-delta.json',import.meta.url),'utf8'));
  const expected=manifest.files[file];if(!expected)return source;
  assert.equal(hash(source),expected.after,'exact approved workbench delta (round 2): '+file);
  const before=execFileSync('git',['show',manifest.baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
  assert.equal(hash(before),expected.before,'round-two integration baseline remains exact: '+file);return before;
}
