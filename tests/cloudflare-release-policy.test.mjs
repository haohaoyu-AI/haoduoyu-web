import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {releases,repository,validateRequest,verifyCI,verifyWorker} from '../.github/scripts/release-policy.mjs';
const commit='947bc782ea70e7808f6e7de523e5977818b292df';
const env=()=>({GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:'83512373-c500-47c3-a451-7dde59d2174b'});
test('manual release accepts only exact tested candidate and retained rollback, main and stopped local route',()=>{
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
test('Worker artifact verification refuses changed/truncated bytes or arbitrary commits',async()=>{
  const data=await readFile(new URL('../dist/server/index.js',import.meta.url));
  assert.equal(verifyWorker(data,commit),releases[commit]);
  assert.throws(()=>verifyWorker(data.subarray(1),commit));const changed=Buffer.from(data);changed[0]^=1;
  assert.throws(()=>verifyWorker(changed,commit));assert.throws(()=>verifyWorker(data,'main'));
});
test('deployment workflow is manual, protected, non-cancelling, pinned and contains no database or credential writes',async()=>{
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.match(yaml,/workflow_dispatch:/);assert.doesNotMatch(yaml,/^  (?:push|pull_request|workflow_run|schedule):/m);
  assert.match(yaml,/environment: cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/contents: read/);assert.match(yaml,/actions: read/);
  assert.equal((yaml.match(/persist-credentials: false/g)||[]).length,2);
  assert.doesNotMatch(yaml,/wrangler (?:login|secret|d1)|migrations apply|secret put|contents: write/);
  assert.ok(yaml.indexOf('Verify accepted Worker bytes')<yaml.indexOf('CLOUDFLARE_API_TOKEN:'));
  assert.match(yaml,/diagnostics_only:[\s\S]*?type: boolean/);
  assert.match(yaml,/RELEASE_OPERATION: \$\{\{ inputs\.diagnostics_only && 'inspect' \|\| 'publish' \}\}/);
});
