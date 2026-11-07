import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {releases,productionRestore,previousProductionRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';
const commit='8d65a1d514e7e6c2472b2035e2197d2824d0dbb7';
const baseline='1daf9321-97ff-49f3-ae75-dbed5e5039b0';
const tree='077316393069b81be4933ec199faf60732f4de0a';
const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:baseline};
test('production restore is pinned to one source tree, artifact and current production version',()=>{
  assert.equal(validateRequest(env),productionRestore);
  assert.equal(productionRestore.tree,tree);assert.equal(productionRestore.bytes,2668707);
  assert.equal(productionRestore.sha256,'879dfb6db5759e8fb7ad54e7b1b8de06f8ddef4cc44721fa0033478aa6a7d945');
  for(const [key,value] of Object.entries({GITHUB_REPOSITORY:'other/repo',GITHUB_REF:'refs/heads/other',GITHUB_EVENT_NAME:'push',
    TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',EXPECTED_CURRENT_VERSION:'83512373-c500-47c3-a451-7dde59d2174b'}))
    assert.throws(()=>validateRequest({...env,[key]:value}));
  assert.throws(()=>verifyWorker(Buffer.alloc(2668707),commit));
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
test('previous production rollback retains its exact source and artifact and rejects an unknown future baseline',async()=>{
  const previous='a02a261df0b687b360f2b322d374d04a7a8c218f';
  const previousTree='36aac1b367a93f46c981dff745206e1ada3d7d70';
  const rollbackBaseline=null;
  assert.deepEqual(previousProductionRelease,{commit:previous,tree:previousTree,baseline:rollbackBaseline,
    originalBaseline:'fb304eb0-304b-4b69-98ea-bbf02a2d2e0d',bytes:2668750,
    sha256:'0484226a6f547616e21d6c864cb0d3d2d257cadafff35e2dced7e3fc156dfcde',
    label:'production-ai-report-author-colors-20261107'});
  for(const version of [baseline,previousProductionRelease.originalBaseline,'11111111-1111-4111-8111-111111111111'])
    assert.throws(()=>validateRequest({...env,TARGET_COMMIT:previous,EXPECTED_CURRENT_VERSION:version}),/baseline must be pinned/);
  assert.equal(await verifyEligibility(previous,{request:async()=>Response.json({sha:previous,tree:{sha:previousTree}})}),
    previousProductionRelease);
  await assert.rejects(verifyEligibility(previous,{request:async()=>Response.json({sha:previous,tree:{sha:tree}})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(2668750),previous));
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
  const sharedCondition=`if: inputs.target_commit == '${commit}' || inputs.target_commit == '${previousProductionRelease.commit}'`;
  assert.equal(yaml.split(sharedCondition).length-1,4,'artifact, Markdown, update recovery and author color gates cover both exact sources');
  assert.ok(yaml.includes(`          - ${previousProductionRelease.commit}\n`),'previous exact source stays available after its baseline is pinned');
  assert.ok(yaml.includes(`- name: Verify AI report author colors\n        ${sharedCondition}\n`));
  for(const step of ['uses: ./.github/actions/gitleaks','npm ci --ignore-scripts','npm run build','npm run check:artifacts',
    'node --test tests/ai-report-markdown.test.mjs tests/ai-reports-navigation.test.mjs tests/ai-reminder-markdown.test.mjs',
    'node --test tests/sw-update-recovery.test.mjs tests/unify-service-worker.test.mjs tests/unify-memo-controller-refresh.test.mjs',
    'node --test tests/ai-report-author-colors.test.mjs',
    'node --test tests/cloudflare-production-restore.test.mjs tests/cloudflare-publish.test.mjs','Verify accepted Worker bytes'])
    assert.ok(yaml.indexOf(step)>0&&yaml.indexOf(step)<yaml.indexOf('CLOUDFLARE_API_TOKEN:'),step);
  assert.doesNotMatch(yaml,/continue-on-error|wrangler (?:login|secret|d1)|migrations apply|secret put|contents: write/);
  const scan=await readFile(new URL('../.github/actions/gitleaks/action.yml',import.meta.url),'utf8');
  assert.match(scan,/--all --full-history -m --root/);assert.match(scan,/--ignore-gitleaks-allow/);
});
