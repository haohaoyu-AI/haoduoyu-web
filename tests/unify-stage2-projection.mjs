import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectUnifyCIBudget} from './unify-ci-budget-projection.mjs';
import {projectUnifySwHistory} from './unify-sw-projection.mjs';

const root=new URL('../',import.meta.url);
export const unifyStage2Baseline='72d26abb94d316e08b63cf12924c157f1bc8e3cd';
export const unifyStage2Paths=Object.freeze(['.ci/public-assets.json','public/app.js','public/index.html','public/mobile.css',
  'scripts/build.mjs','web/controller.mjs','web/core/router.mjs','web/events.mjs','web/ui/menu.mjs','web/ui/workbench.mjs']);
const acceptedDeltaSha256='1aad43926bffe5277a247bdd1bb6ae902865f7247589fc1ffd21c247f7b5c2ed';
const label='exact approved workbench delta (unify stage 2)';
export const stage2Hash=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const baselineCache=new Map();
export function unifyStage2Before(file) {
  assert.ok(unifyStage2Paths.includes(file),label+' scope: '+file);
  if(!baselineCache.has(file))baselineCache.set(file,file==='public/mobile.css'?'':git('show',unifyStage2Baseline+':'+file));
  return baselineCache.get(file);
}
export function validateUnifyStage2Delta(delta) {
  assert.equal(delta.baseline,unifyStage2Baseline,label+' fixed stage-one baseline');
  assert.deepEqual(Object.keys(delta.files).sort(),[...unifyStage2Paths],label+' exact scope');
  assert.equal(stage2Hash(JSON.stringify(delta)),acceptedDeltaSha256,label+' independently pinned manifest');
  for(const file of unifyStage2Paths) {
    assert.equal(delta.files[file].before,file==='public/mobile.css'?null:stage2Hash(unifyStage2Before(file)),label+' baseline: '+file);
    assert.match(delta.files[file].after,/^[a-f0-9]{64}$/,label+' digest: '+file);
  }
  return delta;
}
let reviewed;
export function unifyStage2Manifest() {
  return reviewed??=validateUnifyStage2Delta(JSON.parse(read('tests/unify-stage2-delta.json')));
}

// Current mobile source can only be an exact reviewed after or stage-one before.
// Behavioral tests exercise the real current modules; this inverse only supplies
// old presentation bytes to the independent historical contracts.
export function projectUnifyStage2(file,source) {
  source=projectUnifySwHistory(file,source);
  source=projectUnifyCIBudget(file,source);
  if(!unifyStage2Paths.includes(file))return source;
  const before=unifyStage2Before(file),entry=unifyStage2Manifest().files[file];
  if(source===before)return source;
  assert.equal(stage2Hash(source),entry.after,label+': '+file);
  if(file==='public/index.html')assert.equal(source.replace('    <link rel="stylesheet" href="/mobile.css">\n','')
    .replace('width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content','width=device-width, initial-scale=1'),
    before,label+' mobile stylesheet and viewport flags only');
  else if(file==='scripts/build.mjs')assert.equal(source.replace("'workbench.css','mobile.css'","'workbench.css'"),before,label+' one embedded mobile asset');
  else if(file==='.ci/public-assets.json') {
    const current=JSON.parse(source),expected=JSON.parse(before);
    for(const asset of ['mobile.css','index.html','app.js'])expected.files[asset]=unifyStage2Manifest().files['public/'+asset].after;
    assert.deepEqual(current,expected,label+' corresponding mobile asset pins only');
  }
  return before;
}

const historicalManifests=['article-pipeline-ui-delta.json','public-note-ui-delta.json','workbench-ui-delta.json',
  'reconciliation-ui-delta.json','workbench-round2-delta.json','workbench-round3-delta.json','workbench-round4-delta.json',
  'workbench-round5-delta.json','workbench-round6-delta.json','workbench-round6-badge-delta.json','unify-stage1-delta.json'];
let historicalCommits;
const historicalDigests=new Map();
function historicalHashes(file) {
  if(!historicalDigests.has(file)) {
    historicalCommits??=[...new Set(historicalManifests.flatMap(name=>{
      const manifest=JSON.parse(git('show',unifyStage2Baseline+':tests/'+name));
      return [manifest.baseline,manifest.patch_commit].filter(Boolean);
    }))];
    const digests=new Set();
    for(const commit of historicalCommits) {
      const exists=git('ls-tree','--name-only',commit,'--',file).trim();
      digests.add(stage2Hash(exists?git('show',commit+':'+file):''));
    }
    historicalDigests.set(file,digests);
  }
  return historicalDigests.get(file);
}
export function projectUnifyStage2History(file,source) {
  source=projectUnifySwHistory(file,source);
  source=projectUnifyCIBudget(file,source);
  if(!unifyStage2Paths.includes(file))return source;
  const entry=unifyStage2Manifest().files[file],digest=stage2Hash(source);
  if(digest===entry.after||source===unifyStage2Before(file))return projectUnifyStage2(file,source);
  assert.ok(historicalHashes(file).has(digest),label+' exact historical input: '+file);
  return source;
}
