import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {releases,repository,validateRequest,verifyCI,verifyWorker} from '../.github/scripts/release-policy.mjs';
import {approvedSourceCommits,buildApprovedWorker,buildReviewedBadgeWorker,reviewedBadgeSourceCommit,currentSourceCommit} from './helpers/release-worker-fixtures.mjs';
const commit='947bc782ea70e7808f6e7de523e5977818b292df';
const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'83512373-c500-47c3-a451-7dde59d2174b'});
test('manual release accepts only exact tested candidate and retained rollback, main and stopped local route',()=>{
  assert.deepEqual(Object.keys(releases),approvedSourceCommits);
  assert.equal(validateRequest(env()),releases[commit]);
  const rollback=Object.keys(releases)[1];assert.equal(validateRequest({...env(),TARGET_COMMIT:rollback}),releases[rollback]);
  for(const [key,value] of Object.entries({GITHUB_REPOSITORY:'other/repo',GITHUB_REF:'refs/heads/opt/test',GITHUB_EVENT_NAME:'push',
    LOCAL_UPLOAD_STOPPED:'false',EXPECTED_CURRENT_VERSION:'',TARGET_COMMIT:'main'}))assert.throws(()=>validateRequest({...env(),[key]:value}));
});
test('prior CI must be the successful approved workflow/run/commit/repository; lookup is GET only',async()=>{
  const good={id:releases[commit].ci,head_sha:commit,status:'completed',conclusion:'success',path:'.github/workflows/ci.yml',
    event:'push',repository:{full_name:repository}};
  const request=async(url,options)=>{assert.equal(new URL(url).host,'api.github.com');assert.equal(options.method,undefined);
    assert.equal(options.redirect,'error');return Response.json(good);};
  assert.equal(await verifyCI(commit,{request}),releases[commit]);
  for(const field of ['head_sha','conclusion','path','status','event','id','repository']) {
    const bad={...good,[field]:field==='repository'?{full_name:'other/repo'}:'bad'};
    await assert.rejects(verifyCI(commit,{request:async()=>Response.json(bad)}));
  }
  await assert.rejects(verifyCI(commit,{request:async()=>new Response('',{status:403})}));
});
test('both real approved Worker artifacts pass while changed/truncated bytes and arbitrary commits fail',async()=>{
  for(const sourceCommit of approvedSourceCommits) {
    const data=await buildApprovedWorker(sourceCommit);
    assert.equal(verifyWorker(data,sourceCommit),releases[sourceCommit]);
    assert.throws(()=>verifyWorker(data.subarray(1),sourceCommit));
    const changed=Buffer.from(data);changed[0]^=1;
    assert.throws(()=>verifyWorker(changed,sourceCommit));
    assert.throws(()=>verifyWorker(data,'main'));assert.throws(()=>verifyWorker(data,'f'.repeat(40)));
    for(const other of approvedSourceCommits.filter(value=>value!==sourceCommit))assert.throws(()=>verifyWorker(data,other));
  }
});
test('the exact historical badge Worker and current candidate remain outside the unchanged release allowlist',async()=>{
  const manifest=JSON.parse(await readFile(new URL('./workbench-round6-badge-delta.json',import.meta.url),'utf8'));
  const reviewed={bytes:1244076,sha256:'737f212f71725556f19dba0e451fee44e322370f6304cf405c6681a92fbe7fe3'};
  assert.equal(manifest.baseline,commit);
  assert.equal(manifest.patch_commit,'3a87479d30ac4cf2b9bc484a51106713fa4c510f');
  assert.deepEqual(manifest.worker,reviewed);
  assert.deepEqual(manifest.base_worker,{bytes:releases[commit].bytes,sha256:releases[commit].sha256});
  assert.equal(manifest.patch_commit,reviewedBadgeSourceCommit);
  const badge=await buildReviewedBadgeWorker();
  assert.deepEqual({bytes:badge.byteLength,sha256:createHash('sha256').update(badge).digest('hex')},reviewed,
    'the actual fixed badge source still builds its original reviewed artifact');
  for(const oldCommit of approvedSourceCommits)assert.throws(()=>verifyWorker(badge,oldCommit));
  const data=await readFile(new URL('../dist/server/index.js',import.meta.url));
  const actual={bytes:data.byteLength,sha256:createHash('sha256').update(data).digest('hex')};
  const sourceCommit=await currentSourceCommit();
  if(approvedSourceCommits.includes(sourceCommit)) {
    // An explicit historical checkout must still match its own exact approved
    // bytes. A similar hash or a newer commit cannot enter this branch.
    assert.deepEqual(actual,{bytes:releases[sourceCommit].bytes,sha256:releases[sourceCommit].sha256});
    assert.equal(verifyWorker(data,sourceCommit),releases[sourceCommit]);
    for(const other of approvedSourceCommits.filter(value=>value!==sourceCommit))assert.throws(()=>verifyWorker(data,other));
  }else {
    // New presentation artifacts are checked by their own stage tests. They do
    // not inherit approval from any historical Worker or matching source name.
    for(const oldCommit of approvedSourceCommits)assert.throws(()=>verifyWorker(data,oldCommit));
  }
  assert.throws(()=>validateRequest({...env(),TARGET_COMMIT:manifest.patch_commit}));
});
test('deployment workflow is manual, protected, non-cancelling, pinned and contains no database or credential writes',async()=>{
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.match(yaml,/workflow_dispatch:/);assert.doesNotMatch(yaml,/^  (?:push|pull_request|workflow_run|schedule):/m);
  assert.match(yaml,/environment: cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/contents: read/);assert.match(yaml,/actions: read/);
  assert.equal((yaml.match(/persist-credentials: false/g)||[]).length,2);
  assert.doesNotMatch(yaml,/wrangler (?:login|secret|d1)|migrations apply|secret put|contents: write/);
  assert.ok(yaml.indexOf('Verify accepted Worker bytes')<yaml.indexOf('CLOUDFLARE_API_TOKEN:'));
});
