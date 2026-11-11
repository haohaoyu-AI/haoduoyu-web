import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {releases,productionRestore,previousProductionRelease,openaiReviewRelease,dataTrendsRelease,claudeRobotsRelease,claudeTrendsRelease,claudeNotesDraftsRelease,reviewRulesPromptsRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';
const commit='b35dd510aec0fe67a88aa02edabcd73bfda9b33f';
const baseline='3bd46508-c1fd-4845-af7d-93afc85b7d31';
const tree='6b3daff954b41ce78654d3832863dab800a1494a';
const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:baseline};
test('production restore is pinned to one source tree, artifact and current production version',()=>{
  assert.equal(validateRequest(env),productionRestore);
  assert.equal(productionRestore.tree,tree);assert.equal(productionRestore.bytes,2680619);
  assert.equal(productionRestore.sha256,'f5271840e542b7d133b5e996a198e1c0a8387ef3ca6c4d45cdb5193dbfffa2eb');
  for(const [key,value] of Object.entries({GITHUB_REPOSITORY:'other/repo',GITHUB_REF:'refs/heads/other',GITHUB_EVENT_NAME:'push',
    TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',EXPECTED_CURRENT_VERSION:'83512373-c500-47c3-a451-7dde59d2174b'}))
    assert.throws(()=>validateRequest({...env,[key]:value}));
  assert.throws(()=>verifyWorker(Buffer.alloc(2680619),commit));
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
  const previous='2627fc1f52e426169a5c8bc9939c5d74e8c7a24d';
  const previousTree='449c3df468d03f9ee1534451fcf4b7f8d8bf4b82';
  const rollbackBaseline='d0a6a92b-9047-44aa-8e1f-36f7d01aed54';
  assert.deepEqual(previousProductionRelease,{commit:previous,tree:previousTree,baseline:rollbackBaseline,
    originalBaseline:'808dbbdd-1a51-428d-9d92-54954dc05526',bytes:2675441,
    sha256:'cc810985a976267f027bfc917477e8994c9577cdeea43e224a5805ba86ac241a',
    label:'production-mobile-review-20261108'});
  assert.equal(validateRequest({...env,TARGET_COMMIT:previous,EXPECTED_CURRENT_VERSION:rollbackBaseline}),previousProductionRelease);
  for(const version of [baseline,previousProductionRelease.originalBaseline,'11111111-1111-4111-8111-111111111111'].filter(version=>version!==rollbackBaseline))
    assert.throws(()=>validateRequest({...env,TARGET_COMMIT:previous,EXPECTED_CURRENT_VERSION:version}),/exact independently verified baseline/);
  assert.equal(await verifyEligibility(previous,{request:async()=>Response.json({sha:previous,tree:{sha:previousTree}})}),
    previousProductionRelease);
  await assert.rejects(verifyEligibility(previous,{request:async()=>Response.json({sha:previous,tree:{sha:tree}})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(2675441),previous));
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
  const sharedCondition=`if: inputs.target_commit == '${commit}' || inputs.target_commit == '${previousProductionRelease.commit}' || inputs.target_commit == '${openaiReviewRelease.commit}' || inputs.target_commit == '${dataTrendsRelease.commit}' || inputs.target_commit == '${claudeRobotsRelease.commit}' || inputs.target_commit == '${claudeTrendsRelease.commit}' || inputs.target_commit == '${claudeNotesDraftsRelease.commit}' || inputs.target_commit == '${reviewRulesPromptsRelease.commit}'`;
  assert.equal(yaml.split(sharedCondition).length-1,1,'artifact verification remains mandatory for all exact production sources');
  const optionalCondition=sharedCondition.replace('if: ','if: inputs.run_regression_tests && (')+')';
  assert.equal(yaml.split(optionalCondition).length-1,5,'optional regressions retain the same exact source coverage');
  assert.ok(yaml.includes(`          - ${previousProductionRelease.commit}\n`),'previous exact source stays available after its baseline is pinned');
  assert.ok(yaml.includes(`- name: Verify AI report author colors\n        ${optionalCondition}\n`));
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

test('OpenAI review pins exact approved source, artifact and migrated production baseline',async()=>{
  const current='5044ed66af80f9593879453d23c88c3851a06f12';
  const sourceTree='a80a139cc4d71bc24a246c6805cd449d8842a882';
  const baseline='aa6a7a87-4a7a-4765-902a-ae727d6ed259';
  assert.deepEqual(openaiReviewRelease,{commit:current,tree:sourceTree,baseline,bytes:2783657,
    sha256:'231a4fd783cf05611290b74d9fbc45c3be6903f7ec73749ad96eae3017cf16f0',label:'production-ai-diagnosis-runtime-repair-20261108'});
  assert.equal(validateRequest({...env,TARGET_COMMIT:current,EXPECTED_CURRENT_VERSION:baseline}),openaiReviewRelease);
  for(const wrong of [productionRestore.baseline,previousProductionRelease.baseline,'11111111-1111-4111-8111-111111111111'])
    assert.throws(()=>validateRequest({...env,TARGET_COMMIT:current,EXPECTED_CURRENT_VERSION:wrong}));
  assert.equal(await verifyEligibility(current,{request:async()=>Response.json({sha:current,tree:{sha:sourceTree}})}),openaiReviewRelease);
  await assert.rejects(verifyEligibility(current,{request:async()=>Response.json({sha:current,tree:{sha:tree}})}));
  assert.throws(()=>verifyWorker(Buffer.alloc(2783657),current));
});
test('OpenAI release inherits every current production gate and adds feature contracts without migration or configuration actions',async()=>{
  const y=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  const c=openaiReviewRelease.commit;
  assert.ok(y.includes(`default: ${c}`));assert.ok(y.includes(`          - ${c}\n`));
  assert.equal(y.split(`inputs.target_commit == '${c}'`).length-1,8);
  const feature='node --test tests/openai-review.test.mjs tests/openai-review-ui.test.mjs tests/openai-review-migration-backup.test.mjs tests/openai-review-model-progress.test.mjs tests/openai-review-runtime.test.mjs';
  assert.ok(y.includes(feature));assert.ok(y.indexOf(feature)<y.indexOf('CLOUDFLARE_API_TOKEN:'));
  assert.doesNotMatch(y,/cloudflare-d1-openai|openai-migration|d1 database|migrations apply|secret put|OPENAI_API_KEY:|OPENAI_REVIEW_MODEL:/);
});
