import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectWorkbenchRound5} from './workbench-round5-projection.mjs';

const root=new URL('../',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const manifest=()=>JSON.parse(readFileSync(new URL('./workbench-round4-delta.json',import.meta.url),'utf8'));
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export const round4AddedModules=['web/core/note-entries-state.mjs','web/pages/work-reminders.mjs','web/work-reminders-controller.mjs'];

export function projectWorkbenchRound4(file,source) {
  source=projectWorkbenchRound5(file,source);
  const delta=manifest(),entry=delta.files[file];if(!entry)return source;
  // Earlier projections may call the chain again with its exact released input.
  // The round-four test independently pins every on-disk file to `after`.
  if(entry.before!==null&&hash(source)===entry.before)return source;
  assert.equal(hash(source),entry.after,'exact approved workbench delta (round 4): '+file);
  if(entry.before===null)return '';
  const before=execFileSync('git',['show',delta.baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
  assert.equal(hash(before),entry.before,'round-four production baseline stays exact: '+file);return before;
}

export function round4DocumentSpec(spec) {
  const delta=manifest(),changes=delta.spec_changes;
  if(!changes.length)return structuredClone(spec);
  const current=changes.some(({path,was})=>!was&&path.reduce((value,key)=>value?.[key],spec)!==undefined);
  if(!current)return structuredClone(spec);
  const result=structuredClone(spec);
  for(const {path,was,before,now,after_sha256}of changes) {
    let parent=result;
    for(const name of path.slice(0,-1)) {
      assert.ok(parent&&Object.hasOwn(parent,name),'round-four API parent: '+path.join('/'));parent=parent[name];
    }
    const key=path.at(-1);
    assert.equal(Object.hasOwn(parent,key),now,'round-four API inventory: '+path.join('/'));
    if(now)assert.equal(hash(JSON.stringify(stable(parent[key]))),after_sha256,'exact approved article contract (round 4): '+path.join('/'));
    if(was)parent[key]=structuredClone(before);else delete parent[key];
  }
  return result;
}

export function round4DocumentDocs(html) {
  const section=manifest().docs_section;
  if(!section)return html;
  const {start,end,sha256}=section;
  assert.equal(html.includes(start),html.includes(end),'complete round-four documentation markers');
  if(!html.includes(start))return html;
  assert.equal(html.split(start).length,2,'single round-four documentation start');
  assert.equal(html.split(end).length,2,'single round-four documentation end');
  const from=html.indexOf(start),to=html.indexOf(end)+end.length;
  assert.ok(to>from,'ordered round-four documentation markers');
  assert.equal(hash(html.slice(from,to)),sha256,'exact approved workbench delta (round 4) documentation');
  return html.slice(0,from)+html.slice(to);
}
