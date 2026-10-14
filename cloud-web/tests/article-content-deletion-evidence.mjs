// Hash-only evidence for the local synthetic D1/R2 regression. No database,
// Site, Library or real article is read by this evidence collector.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const folder='evidence/article-content-purge';
const reportPath=folder+'/synthetic-results.json';
const logPath=folder+'/synthetic-d1-r2.log';
const report=JSON.parse(fs.readFileSync(path.join(root,reportPath),'utf8'));
const log=fs.readFileSync(path.join(root,logPath),'utf8');
const fingerprint=name=>createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
assert.equal(report.status,'passed');
assert.equal(report.source_stable,true);
assert.equal(report.remote_calls,0);
assert.equal(report.migration_count,49);assert.equal(report.case_filter,null);
assert.equal(report.cases.length,25);
assert.equal(report.baseline,'f82d2e8c645669e11e9a2dbd97f5db7080aabd89');
assert.ok(log.includes(`PASS ${report.cases.length} synthetic D1/R2 cases; migrations 0000–0048; remote calls=0.`));
for(const [name,sha256] of Object.entries(report.source_fingerprints))assert.equal(fingerprint(name),sha256,'evidence source changed since execution: '+name);
for(const [name,sha256] of Object.entries(report.loaded_sources))assert.equal(sha256,report.source_fingerprints[name],'loaded VM source disagrees with frozen file: '+name);
for(const name of ['lib/article-content-deletion.ts','lib/dedao.ts','lib/dedao-dispatch.ts','lib/events.ts'])assert.equal(report.loaded_sources[name],report.source_fingerprints[name],'a required actual module was not loaded: '+name);
const testFiles=['tests/article-content-deletion.mjs','tests/article-content-deletion-evidence.mjs','tests/article-content-purge-executor-settlement-d1.mjs'];
const patchPath=folder+'/synthetic-tests.patch';
const patchResult=spawnSync('git',['diff',report.baseline,'--',...testFiles],{cwd:root,encoding:'utf8'});
assert.equal(patchResult.status,0,'could not collect the synthetic regression patch against the exact formal V139 commit');
assert.ok(patchResult.stdout.includes('tests/article-content-deletion.mjs'));
const patch=patchResult.stdout;
fs.writeFileSync(path.join(root,patchPath),patch);
const settlementManifestPath=folder+'/executor-settlement-d1.manifest.json';
const settlement=JSON.parse(fs.readFileSync(path.join(root,settlementManifestPath),'utf8'));
assert.equal(settlement.result,'PASS');assert.equal(settlement.groups,11);assert.equal(settlement.remote_calls,0);
assert.equal(settlement.exit_code,0);assert.equal(settlement.baseline_commit,report.baseline);assert.equal(settlement.migration_count,49);assert.equal(settlement.migration_range,'0000–0048');
for(const item of settlement.files)assert.equal(fingerprint(item.path),item.sha256,'settlement evidence source changed since execution: '+item.path);
const files=[...testFiles,reportPath,logPath,patchPath,settlementManifestPath,folder+'/executor-settlement-d1.log'];
const manifest={
  generated_at:new Date().toISOString(),baseline:report.baseline,
  command:'PURGE_TEST_REPORT=evidence/article-content-purge/synthetic-results.json node tests/article-content-deletion.mjs > evidence/article-content-purge/synthetic-d1-r2.log 2>&1',
  execution:{node:process.version,backend:report.backend,migration_count:report.migration_count,new_migration:'0048_dedao_article_content_purge',cases_passed:report.cases.length,remote_calls:report.remote_calls,started_at:report.started_at,finished_at:report.finished_at,source_stable:report.source_stable},
  runtime_versions:Object.fromEntries(['miniflare','workerd','drizzle-orm','typescript'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json'),'utf8')).version])),
  files:Object.fromEntries(files.map(name=>[name,{sha256:fingerprint(name),bytes:fs.statSync(path.join(root,name)).size}])),
  source_fingerprints:report.source_fingerprints,loaded_sources:report.loaded_sources,compatibility_sources:report.compatibility_sources,
  executor_settlement:{groups_passed:11,manifest:settlementManifestPath,backend_matches_same_frozen_source:true},
  limits:['Isolated actual local workerd D1/R2 synthetic inputs only','No production calls, real manuscript mutation, external executor observation or deployment','UI/browser verification is owned by the parent task; this manifest records backend regression only']
};
const target=path.join(root,folder,'synthetic-manifest.json');
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n');
console.log(`PASS evidence manifest: ${report.cases.length} cases, ${Object.keys(report.source_fingerprints).length} stable source files, all loaded VM hashes match`);
