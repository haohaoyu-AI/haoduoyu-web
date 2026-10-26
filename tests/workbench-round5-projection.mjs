import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectWorkbenchRound6} from './workbench-round6-projection.mjs';

const root=new URL('../',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const manifest=()=>JSON.parse(readFileSync(new URL('./workbench-round5-delta.json',import.meta.url),'utf8'));
export const round5AddedModules=['web/core/notes-editor-view.mjs'];

// Round five changes presentation only. Earlier exact projections consume the
// released ae1fafe bytes after this independently pinned UI delta is removed.
export function projectWorkbenchRound5(file,source) {
  const delta=manifest(),entry=delta.files[file];
  // A lower historical guard may pass the exact already-restored ae1 bytes.
  if(entry&&entry.before!==null&&hash(source)===entry.before)return source;
  source=projectWorkbenchRound6(file,source);
  if(!entry)return source;
  if(entry.before!==null&&hash(source)===entry.before)return source;
  assert.equal(hash(source),entry.after,'exact approved workbench delta (round 5): '+file);
  if(entry.before===null)return '';
  const before=execFileSync('git',['show',delta.baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
  assert.equal(hash(before),entry.before,'round-five production baseline stays exact: '+file);return before;
}
