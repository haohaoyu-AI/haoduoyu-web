import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url),hash=value=>createHash('sha256').update(value).digest('hex');
const baseline='947bc782ea70e7808f6e7de523e5977818b292df',patch='3a87479d30ac4cf2b9bc484a51106713fa4c510f';
export const round6BadgePaths=Object.freeze(['web/pages/daily-notes.mjs','public/app.js','.ci/public-assets.json']);
const sources=new Map();
function releasedSource(commit,file) {
  const key=commit+':'+file;
  if(!sources.has(key))sources.set(key,execFileSync('git',['show',key],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024}));
  return sources.get(key);
}
export function validateWorkbenchRound6BadgeDelta(delta) {
  assert.equal(delta.baseline,baseline,'approved workbench delta (round 6 badge) baseline');
  assert.equal(delta.patch_commit,patch,'approved workbench delta (round 6 badge) patch');
  assert.deepEqual(Object.keys(delta.files).sort(),[...round6BadgePaths].sort(),'approved workbench delta (round 6 badge) scope');
  assert.deepEqual(delta.base_worker,{bytes:1244002,sha256:'3c106a1a3bbd570d72f3784970a09af09caec653ffa9869550649d1144e43de0'},
    'approved workbench delta (round 6 badge) base worker');
  assert.deepEqual(delta.worker,{bytes:1244076,sha256:'737f212f71725556f19dba0e451fee44e322370f6304cf405c6681a92fbe7fe3'},
    'approved workbench delta (round 6 badge) worker');
  for(const file of round6BadgePaths) {
    assert.deepEqual(Object.keys(delta.files[file]).sort(),['after','before'],'approved workbench delta (round 6 badge) hash fields: '+file);
    assert.equal(delta.files[file].before,hash(releasedSource(baseline,file)),'approved workbench delta (round 6 badge) before hash: '+file);
    assert.equal(delta.files[file].after,hash(releasedSource(patch,file)),'approved workbench delta (round 6 badge) after hash: '+file);
  }
  return delta;
}
const manifest=()=>validateWorkbenchRound6BadgeDelta(JSON.parse(readFileSync(new URL('./workbench-round6-badge-delta.json',import.meta.url),'utf8')));
function removeOnlyBadgeDelta(file,source,delta) {
  let before,after;
  if(file==='web/pages/daily-notes.mjs') {
    before='';after="  node.querySelector('.note-entry-status').dataset.phase = legacy.phase;\n";
  } else if(file==='public/app.js') {
    before='';after='  node.querySelector(".note-entry-status").dataset.phase = legacy.phase;\n';
  } else {
    const bundle=delta.files['public/app.js'];
    before='    "app.js": "'+bundle.before+'",\n';after='    "app.js": "'+bundle.after+'",\n';
  }
  assert.equal(source.split(after).length,2,'one exact approved workbench delta (round 6 badge) line: '+file);
  return source.replace(after,before);
}

// Strict scope and exact complete hashes precede the one reviewed inverse edit.
// Historical round-six callers must handle their own older legitimate before bytes first.
export function projectWorkbenchRound6Badge(file,source) {
  assert.ok(round6BadgePaths.includes(file),'approved workbench delta (round 6 badge) scope: '+file);
  const delta=manifest(),entry=delta.files[file],digest=hash(source);
  if(digest===entry.before)return source;
  assert.equal(digest,entry.after,'exact approved workbench delta (round 6 badge): '+file);
  const before=removeOnlyBadgeDelta(file,source,delta);
  assert.equal(hash(before),entry.before,'approved workbench delta (round 6 badge) restores exact 947 bytes: '+file);
  assert.equal(before,releasedSource(baseline,file),'approved workbench delta (round 6 badge) released bytes: '+file);
  return before;
}
