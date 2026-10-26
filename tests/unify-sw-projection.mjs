import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {projectUnifyCIBudget} from './unify-ci-budget-projection.mjs';

const root=new URL('../',import.meta.url);
export const unifySwBaseline='d8c0f272ca4576d23142b40a775c0b2252f4c180';
export const unifySwPaths=Object.freeze(['.ci/public-assets.json','public/app.js','public/index.html',
  'public/manifest.webmanifest','public/sw-update.css','public/sw.js','scripts/build.mjs',
  'scripts/service-worker-build.mjs','src/worker.mjs','web/main.mjs','web/offline/sw-client.mjs']);
export const unifySwAddedModules=Object.freeze(['web/offline/sw-client.mjs']);
const added=new Set(['public/manifest.webmanifest','public/sw-update.css','public/sw.js',
  'scripts/service-worker-build.mjs',...unifySwAddedModules]);
const acceptedDeltaSha256='ec7666079f6266c5026e49a9ebc433d4df6e6a96538fcdde2eae8ec22fec2f06';
const label='exact approved workbench delta (unify SW shell)';
export const swHash=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const baselineCache=new Map();
export function unifySwBefore(file) {
  assert.ok(unifySwPaths.includes(file),label+' scope: '+file);
  if(!baselineCache.has(file))baselineCache.set(file,added.has(file)?'':git('show',unifySwBaseline+':'+file));
  return baselineCache.get(file);
}
export function validateUnifySwDelta(delta) {
  assert.equal(delta.baseline,unifySwBaseline,label+' fixed stage-two baseline');
  assert.deepEqual(Object.keys(delta.files).sort(),[...unifySwPaths],label+' exact shell-only scope');
  assert.deepEqual(delta.added_modules,[...unifySwAddedModules],label+' exact added module');
  assert.equal(swHash(JSON.stringify(delta)),acceptedDeltaSha256,label+' independently pinned manifest');
  for(const file of unifySwPaths) {
    assert.equal(delta.files[file].before,added.has(file)?null:swHash(unifySwBefore(file)),label+' baseline: '+file);
    assert.match(delta.files[file].after,/^[a-f0-9]{64}$/,label+' digest: '+file);
  }
  return delta;
}
let reviewed;
export function unifySwManifest() {
  return reviewed??=validateUnifySwDelta(JSON.parse(read('tests/unify-sw-delta.json')));
}

// Restoring a fixed old blob is permitted only after the complete current blob
// matches its independently pinned reviewed digest. Unknown inputs never vanish.
export function projectUnifySw(file,source) {
  source=projectUnifyCIBudget(file,source);
  if(!unifySwPaths.includes(file))return source;
  const before=unifySwBefore(file),entry=unifySwManifest().files[file];
  if(source===before)return source;
  assert.equal(swHash(source),entry.after,label+': '+file);
  if(file==='web/main.mjs')assert.equal(source.replace('import { startServiceWorker } from "./offline/sw-client.mjs";\n','')
    .replace('startServiceWorker();\n',''),before,label+' registration-only entrypoint');
  else if(file==='.ci/public-assets.json') {
    const expected=JSON.parse(before);
    for(const asset of ['app.js','index.html','manifest.webmanifest','sw-update.css','sw.js'])
      expected.files[asset]=unifySwManifest().files['public/'+asset].after;
    assert.deepEqual(JSON.parse(source),expected,label+' corresponding shell asset pins only');
  }
  return before;
}

const historicalManifests=['article-pipeline-ui-delta.json','public-note-ui-delta.json','workbench-ui-delta.json',
  'reconciliation-ui-delta.json','workbench-round2-delta.json','workbench-round3-delta.json','workbench-round4-delta.json',
  'workbench-round5-delta.json','workbench-round6-delta.json','workbench-round6-badge-delta.json',
  'unify-stage1-delta.json','unify-stage2-delta.json'];
let historicalCommits;
const historicalDigests=new Map();
function historicalHashes(file) {
  if(!historicalDigests.has(file)) {
    historicalCommits??=[...new Set(historicalManifests.flatMap(name=>{
      const manifest=JSON.parse(git('show',unifySwBaseline+':tests/'+name));
      return [manifest.baseline,manifest.patch_commit].filter(Boolean);
    }))];
    const digests=new Set();
    for(const commit of historicalCommits) {
      const exists=git('ls-tree','--name-only',commit,'--',file).trim();
      digests.add(swHash(exists?git('show',commit+':'+file):''));
    }
    historicalDigests.set(file,digests);
  }
  return historicalDigests.get(file);
}
export function projectUnifySwHistory(file,source) {
  source=projectUnifyCIBudget(file,source);
  if(!unifySwPaths.includes(file))return source;
  const entry=unifySwManifest().files[file],digest=swHash(source);
  if(digest===entry.after||source===unifySwBefore(file))return projectUnifySw(file,source);
  assert.ok(historicalHashes(file).has(digest),label+' exact historical input: '+file);
  return source;
}

// Old inventories retain every old module and every unauthorized addition. Only
// this exact new module can project to absence, after the source hash is checked.
export function projectUnifySwModules(files,readSource=read) {
  for(const file of files.filter(file=>unifySwAddedModules.includes(file))) {
    const source=readSource(file);
    assert.equal(swHash(source),unifySwManifest().files[file].after,label+' exact current added module: '+file);
    assert.equal(projectUnifySw(file,source),'',label+' added module projects to absence: '+file);
  }
  return files.filter(file=>!unifySwAddedModules.includes(file));
}
