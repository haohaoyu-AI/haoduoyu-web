import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {releases,productionRestore,previousProductionRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';
const commit='2627fc1f52e426169a5c8bc9939c5d74e8c7a24d';
const baseline='808dbbdd-1a51-428d-9d92-54954dc05526';
const tree='449c3df468d03f9ee1534451fcf4b7f8d8bf4b82';
const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:baseline};
test('production restore is pinned to one source tree, artifact and current production version',()=>{
  assert.equal(validateRequest(env),productionRestore);
  assert.equal(productionRestore.tree,tree);assert.equal(productionRestore.bytes,2675441);
  assert.equal(productionRestore.sha256,'cc810985a976267f027bfc917477e8994c9577cdeea43e224a5805ba86ac241a');
  for(const [key,value] of Object.entries({GITHUB_REPOSITORY:'other/repo',GITHUB_REF:'refs/heads/other',GITHUB_EVENT_NAME:'push',
    TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',EXPECTED_CURRENT_VERSION:'83512373-c500-47c3-a451-7dde59d2174b'}))
    assert.throws(()=>validateRequest({...env,[key]:value}));
  assert.throws(()=>verifyWorker(Buffer.alloc(2675441),commit));
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
test('previous production rollback retains its exact source and artifact and requires the independently verified new baseline',async()=>{
  const previous='2eec9fdfeee3b79d8a9e8d20a51f8e1fd3dc387d';
  const previousTree='f8e1477888e347365f1b6de25813bb2f388dfc15';
  const rollbackBaseline='3bd46508-c1fd-4845-af7d-93afc85b7d31';
  assert.deepEqual(previousProductionRelease,{commit:previous,tree:previousTree,baseline:rollbackBaseline,
    originalBaseline:'c2029c32-a700-45d4-b9e8-cb7a065338b0',bytes:2671740,
    sha256:'9b03bc4b799d9ed6445e96766b2702cf4b068b38b1f7b36ac1486025dcdfa8f7',
    label:'production-mobile-calendar-20261108'});
  assert.equal(validateRequest({...env,TARGET_COMMIT:previous,EXPECTED_CURRENT_VERSION:rollbackBaseline}),previousProductionRelease);
  for(const version of [baseline,previousProductionRelease.originalBaseline,'11111111-1111-4111-8111-111111111111'].filter(version=>version!==rollbackBaseline))
    assert.throws(()=>validateRequest({...env,TARGET_COMMIT:previous,EXPECTED_CURRENT_VERSION:version}),/exact independently verified baseline/);
  assert.equal(await verifyEligibility(previous,{request:async()=>Response.json({sha:previous,tree:{sha:previousTree}})}),
    previousProductionRelease);
  await assert.rejects(verifyEligibility(previous,{request:async()=>Response.json({sha:previous,tree:{sha:tree}})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(2671740),previous));
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
  assert.equal(yaml.split(sharedCondition).length-1,6,'artifact, Markdown, update recovery, author color, navigation and calendar gates cover both exact sources');
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
