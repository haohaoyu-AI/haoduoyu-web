import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url);
export const unifyStage1Baseline='6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c';
export const unifyStage1Paths=Object.freeze(['.ci/public-assets.json','public/glass.css','public/index.html',
  'public/memos.css','public/style.css','public/tokens.css','public/workbench.css','scripts/build.mjs']);
export const unifyStage1Styles=Object.freeze(['public/style.css','public/memos.css','public/glass.css','public/workbench.css']);
const acceptedDeltaSha256='c9427d8b93c750dbd2cc7160798cbf7b6802447a08e35573a7ef7f740e9d55f5';
const label='exact approved workbench delta (unify stage 1)';
export const stage1Hash=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const canonical=value=>JSON.stringify(value);
const baselineCache=new Map();
export function unifyStage1Before(file) {
  assert.ok(unifyStage1Paths.includes(file),label+' scope: '+file);
  if(!baselineCache.has(file))baselineCache.set(file,file==='public/tokens.css'?'':git('show',unifyStage1Baseline+':'+file));
  return baselineCache.get(file);
}
export function validateUnifyStage1Delta(delta) {
  assert.equal(delta.baseline,unifyStage1Baseline,label+' fixed baseline');
  assert.deepEqual(Object.keys(delta.files).sort(),[...unifyStage1Paths],label+' exact scope');
  assert.equal(stage1Hash(canonical(delta)),acceptedDeltaSha256,label+' independently pinned manifest');
  for(const file of unifyStage1Paths) {
    assert.equal(delta.files[file].before,file==='public/tokens.css'?null:stage1Hash(unifyStage1Before(file)),label+' baseline: '+file);
    assert.match(delta.files[file].after,/^[a-f0-9]{64}$/,label+' digest: '+file);
  }
  return delta;
}
let reviewed;
export function unifyStage1Manifest() {
  return reviewed??=validateUnifyStage1Delta(JSON.parse(read('tests/unify-stage1-delta.json')));
}

export function stage1Tokens(source) {
  assert.equal(stage1Hash(source),unifyStage1Manifest().files['public/tokens.css'].after,label+' token definitions');
  const clean=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^@charset "UTF-8";\s*/,'').trim();
  assert.match(clean,/^:root\s*\{[^{}]*\}$/s,label+' declarations-only token sheet');
  const declarations=clean.slice(clean.indexOf('{')+1,-1).split(';').map(v=>v.trim()).filter(Boolean),tokens=new Map();
  for(const declaration of declarations) {
    const match=/^(--[a-z0-9-]+):(.+)$/s.exec(declaration);
    assert.ok(match,label+' token declaration');assert.ok(!tokens.has(match[1]),label+' unique token');
    tokens.set(match[1],match[2]);
  }
  return tokens;
}
export function expandStage1Css(source,tokenSource=read('public/tokens.css')) {
  const tokens=stage1Tokens(tokenSource);
  const expand=(value,seen=new Set())=>value.replace(/var\((--[a-z0-9-]+)\)/g,(whole,name)=>{
    if(!tokens.has(name))return whole;
    assert.ok(!seen.has(name),label+' cyclic token');
    return expand(tokens.get(name),new Set([...seen,name]));
  });
  return expand(source);
}

// Strict entry for current source: an unreviewed digest is never normalized.
export function projectUnifyStage1(file,source) {
  if(!unifyStage1Paths.includes(file))return source;
  const entry=unifyStage1Manifest().files[file],before=unifyStage1Before(file);
  if(source===before)return source;
  assert.equal(stage1Hash(source),entry.after,label+': '+file);
  if(unifyStage1Styles.includes(file))assert.equal(expandStage1Css(source),before,label+' CSS restores every byte: '+file);
  else if(file==='public/tokens.css')stage1Tokens(source);
  else if(file==='public/index.html')assert.equal(source.replace('    <link rel="stylesheet" href="/tokens.css">\n',''),before,label+' one stylesheet link');
  else if(file==='scripts/build.mjs')assert.equal(source.replace("'app.js','tokens.css','style.css'","'app.js','style.css'"),before,label+' one embedded asset');
  else if(file==='.ci/public-assets.json') {
    const current=JSON.parse(source),prior=JSON.parse(before),expected=structuredClone(prior);
    for(const asset of ['tokens.css','style.css','memos.css','glass.css','workbench.css','index.html']) {
      expected.files[asset]=unifyStage1Manifest().files['public/'+asset].after;
    }
    assert.deepEqual(current,expected,label+' only corresponding asset pins');
  }
  return before;
}

// Lower guards sometimes revisit an already-restored source. Only exact blobs
// from the historical checkpoints recorded in the fixed 6e tree may pass here.
// Current on-disk after digests are checked independently by the stage-one test.
const historicalManifests=['article-pipeline-ui-delta.json','public-note-ui-delta.json','workbench-ui-delta.json',
  'reconciliation-ui-delta.json','workbench-round2-delta.json','workbench-round3-delta.json',
  'workbench-round4-delta.json','workbench-round5-delta.json','workbench-round6-delta.json','workbench-round6-badge-delta.json'];
let historicalCommits;
const historicalDigests=new Map();
function historicalHashes(file) {
  if(!historicalDigests.has(file)) {
    historicalCommits??=[...new Set(historicalManifests.flatMap(name=>{
      const manifest=JSON.parse(git('show',unifyStage1Baseline+':tests/'+name));
      return [manifest.baseline,manifest.patch_commit].filter(Boolean);
    }))];
    const digests=new Set();
    for(const commit of historicalCommits) {
      const names=git('ls-tree','--name-only',commit,'--',file).trim();
      digests.add(stage1Hash(names?git('show',commit+':'+file):''));
    }
    historicalDigests.set(file,digests);
  }
  return historicalDigests.get(file);
}
export function projectUnifyStage1History(file,source) {
  if(!unifyStage1Paths.includes(file))return source;
  const entry=unifyStage1Manifest().files[file],digest=stage1Hash(source);
  if(digest===entry.after||source===unifyStage1Before(file))return projectUnifyStage1(file,source);
  assert.ok(historicalHashes(file).has(digest),label+' exact historical input: '+file);
  return source;
}

// Compare projected bytes, never discard a filename merely because it is new.
// Deletions and untracked additions remain visible to the historical inventory.
export function projectedChangedFiles(baseline,roots,project=projectUnifyStage1) {
  const tracked=git('diff','--name-only',baseline,'--',...roots),untracked=git('ls-files','--others','--exclude-standard','--',...roots);
  const released=new Set(git('ls-tree','-r','--name-only',baseline,'--',...roots).trim().split('\n').filter(Boolean));
  const changed=[];
  for(const file of new Set((tracked+'\n'+untracked).trim().split('\n').filter(Boolean))) {
    let source;try {source=read(file);}catch(error) {if(error.code!=='ENOENT')throw error;source='';}
    const before=released.has(file)?git('show',baseline+':'+file):'';
    if(project(file,source)!==before)changed.push(file);
  }
  return changed.sort();
}
