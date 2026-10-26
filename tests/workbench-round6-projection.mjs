import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectWorkbenchRound6Badge,round6BadgePaths} from './workbench-round6-badge-projection.mjs';

const root=new URL('../',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const manifest=()=>JSON.parse(readFileSync(new URL('./workbench-round6-delta.json',import.meta.url),'utf8'));
export const round6AddedModules=[];

export function projectWorkbenchRound6(file,source) {
  const delta=manifest(),entry=delta.files[file];
  if(entry&&hash(source)===entry.before)return source;
  if(round6BadgePaths.includes(file))source=projectWorkbenchRound6Badge(file,source);
  if(!entry)return source;
  assert.equal(hash(source),entry.after,'exact approved workbench delta (round 6): '+file);
  const before=execFileSync('git',['show',delta.baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
  assert.equal(hash(before),entry.before,'round-six production baseline stays exact: '+file);return before;
}
