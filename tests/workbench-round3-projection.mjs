import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const manifest=()=>JSON.parse(readFileSync(new URL('./workbench-round3-delta.json',import.meta.url),'utf8'));
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export function projectWorkbenchRound3(file,source) {
  const delta=manifest(),entry=delta.files[file];if(!entry)return source;
  assert.equal(hash(source),entry.after,'exact approved workbench delta (round 3): '+file);
  if(entry.before===null)return '';
  const before=execFileSync('git',['show',delta.baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
  assert.equal(hash(before),entry.before,'round-three production baseline stays exact: '+file);return before;
}
export function round3DocumentSpec(spec) {
  if(!spec.paths?.['/api/v1/daily-notes'])return spec;
  const delta=manifest(),result=structuredClone(spec);
  for(const {path,was,before,now,after_sha256}of delta.spec_changes) {
    let parent=result;
    for(const name of path.slice(0,-1)) {
      assert.ok(parent&&Object.hasOwn(parent,name),'round-three API parent: '+path.join('/'));parent=parent[name];
    }
    const key=path.at(-1);
    assert.equal(Object.hasOwn(parent,key),now,'round-three API inventory: '+path.join('/'));
    if(now)assert.equal(hash(JSON.stringify(stable(parent[key]))),after_sha256,'exact approved article contract (round 3): '+path.join('/'));
    if(was)parent[key]=structuredClone(before);else delete parent[key];
  }
  return result;
}
export function round3DocumentDocs(html) {
  const start='<!-- workbench-round3:start -->',end='<!-- workbench-round3:end -->';
  assert.equal(html.includes(start),html.includes(end),'complete round-three documentation markers');
  if(!html.includes(start))return html;
  const source=readFileSync(new URL('../public/api-docs.html',import.meta.url),'utf8');
  const before=projectWorkbenchRound3('public/api-docs.html',source);
  const section=source.slice(source.indexOf(start),source.indexOf(end)+end.length);
  assert.equal(html.split(start).length,2,'single round-three documentation start');
  assert.equal(html.split(end).length,2,'single round-three documentation end');
  assert.ok(html.includes(section),'exact round-three documentation section');
  assert.equal(source.replace(section,''),before,'round-three documentation only appends the approved section');
  return html.replace(section,'');
}
