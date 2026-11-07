import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {releases,productionRestore,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';
const commit='ed3d75e8a66475f643e51dd3c00144346dea01b3';
const baseline='0f9c5efc-3077-48ca-b3bb-da65a2aedf50';
const tree='e18867699263a4d715742b8f23ec763f8f61e68b';
const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:baseline};
test('production restore is pinned to one source tree, artifact and current production version',()=>{
  assert.equal(validateRequest(env),productionRestore);
  assert.equal(productionRestore.tree,tree);assert.equal(productionRestore.bytes,2668038);
  assert.equal(productionRestore.sha256,'d791b86e627b68c53d566cab18aae1221bce11a9081f6d47a50826a5109aa354');
  for(const [key,value] of Object.entries({GITHUB_REPOSITORY:'other/repo',GITHUB_REF:'refs/heads/other',GITHUB_EVENT_NAME:'push',
    TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',EXPECTED_CURRENT_VERSION:'83512373-c500-47c3-a451-7dde59d2174b'}))
    assert.throws(()=>validateRequest({...env,[key]:value}));
  assert.throws(()=>verifyWorker(Buffer.alloc(2668038),commit));
});
test('restored source identity is checked through a read-only exact-commit lookup',async()=>{
  const good={sha:commit,tree:{sha:tree}};
  const request=async(url,options)=>{
    assert.equal(url,`https://api.github.com/repos/${repository}/git/commits/${commit}`);
    assert.equal(options.method,undefined);assert.equal(options.redirect,'error');return Response.json(good);
  };
  assert.equal(await verifyEligibility(commit,{request}),productionRestore);
  for(const data of [{sha:'0'.repeat(40),tree:{sha:tree}},{sha:commit,tree:{sha:'0'.repeat(40)}},{sha:commit}])
    await assert.rejects(verifyEligibility(commit,{request:async()=>Response.json(data)}));
  await assert.rejects(verifyEligibility(commit,{request:async()=>new Response('',{status:403})}));
  await assert.rejects(verifyEligibility('main',{request}));
});
test('historical releases retain their exact successful Foundation CI gate',async()=>{
  for(const old of Object.keys(releases).filter(key=>key!==commit)){
    const good={id:releases[old].ci,head_sha:old,status:'completed',conclusion:'success',path:'.github/workflows/ci.yml',
      event:'push',repository:{full_name:repository}};
    assert.equal(await verifyEligibility(old,{request:async()=>Response.json(good)}),releases[old]);
    await assert.rejects(verifyEligibility(old,{request:async()=>Response.json({...good,conclusion:'failure'})}));
  }
});
test('manual restore preserves scan, build, byte checks, secret scope and production concurrency',async()=>{
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.match(yaml,/workflow_dispatch:/);assert.doesNotMatch(yaml,/^  (?:push|pull_request|workflow_run|schedule):/m);
  assert.match(yaml,/environment: cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/contents: read/);assert.match(yaml,/actions: read/);assert.match(yaml,/fetch-depth: 0/);
  assert.equal((yaml.match(/persist-credentials: false/g)||[]).length,2);
  for(const step of ['uses: ./.github/actions/gitleaks','npm ci --ignore-scripts','npm run build','npm run check:artifacts',
    'node --test tests/cloudflare-production-restore.test.mjs tests/cloudflare-publish.test.mjs','Verify accepted Worker bytes'])
    assert.ok(yaml.indexOf(step)>0&&yaml.indexOf(step)<yaml.indexOf('CLOUDFLARE_API_TOKEN:'),step);
  assert.doesNotMatch(yaml,/continue-on-error|wrangler (?:login|secret|d1)|migrations apply|secret put|contents: write/);
  const scan=await readFile(new URL('../.github/actions/gitleaks/action.yml',import.meta.url),'utf8');
  assert.match(scan,/--all --full-history -m --root/);assert.match(scan,/--ignore-gitleaks-allow/);
});
