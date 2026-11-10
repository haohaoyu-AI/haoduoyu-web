import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dataTrendsRelease,repository,validateRequest,verifyEligibility,verifyWorker} from '../.github/scripts/release-policy.mjs';

const commit='334e00d676452cc47e044cb4f88f8209b1c411b0';
const tree='b369353b7932880d80bae5b28e1a880b34929f0c';
const baseline='4d874ca9-ede5-4e03-a7e5-ef3c1bc0babd';
const env={GITHUB_REPOSITORY:repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  TARGET_COMMIT:commit,LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:baseline};

test('data trends pins one reviewed tree, Worker artifact and exact production baseline',()=>{
  assert.deepEqual(dataTrendsRelease,{commit,tree,baseline,bytes:2844076,
    sha256:'f6ca099166856484fcff442aa56b5904cebb76b323b10978b8f38bc50fa56325',
    label:'production-data-trends-20261110'});
  assert.ok(Object.isFrozen(dataTrendsRelease));
});

test('unregistered target fails before lookup, artifact acceptance or publishing',async()=>{
  const target='PENDING_VERIFIED_REMOTE_DATA_TRENDS_COMMIT';
  assert.throws(()=>validateRequest({...env,TARGET_COMMIT:target}),/explicitly approved/);
  let calls=0;
  await assert.rejects(verifyEligibility(target,{request:async()=>{calls++;return Response.json({sha:target,tree:{sha:tree}});}}),
    /Unknown release/);
  assert.equal(calls,0);
  assert.throws(()=>verifyWorker(Buffer.alloc(dataTrendsRelease.bytes),target),/Unknown release/);
});

async function testPolicy() {
  return {policy:{dataTrendsRelease,validateRequest,verifyEligibility,verifyWorker},target:commit};
}

test('pinned data trends retains main/manual/exclusive-publisher and exact version requirements',async()=>{
  const {policy,target}=await testPolicy(),requestEnv={...env,TARGET_COMMIT:target};
  assert.equal(policy.validateRequest(requestEnv),policy.dataTrendsRelease);
  for(const [key,value] of Object.entries({GITHUB_REPOSITORY:'other/repo',GITHUB_REF:'refs/heads/feature',
    GITHUB_EVENT_NAME:'push',TARGET_COMMIT:'main',LOCAL_UPLOAD_STOPPED:'false',
    EXPECTED_CURRENT_VERSION:'11111111-1111-4111-8111-111111111111'}))
    assert.throws(()=>policy.validateRequest({...requestEnv,[key]:value}));
  for(const value of ['',undefined,'4d874ca9-ede5-4e03-a7e5-ef3c1bc0babd\n'])
    assert.throws(()=>policy.validateRequest({...requestEnv,EXPECTED_CURRENT_VERSION:value}));
  assert.throws(()=>policy.verifyWorker(Buffer.alloc(dataTrendsRelease.bytes),target),/bytes and SHA-256/);
  assert.throws(()=>policy.verifyWorker(Buffer.alloc(dataTrendsRelease.bytes-1),target),/bytes and SHA-256/);
});

test('pinned data trends verifies the exact remote commit/tree by GET without redirects',async()=>{
  const {policy,target}=await testPolicy(),good={sha:target,tree:{sha:tree}};
  const request=async(url,options)=>{
    assert.equal(url,`https://api.github.com/repos/${repository}/git/commits/${target}`);
    assert.equal(options.method,undefined);assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
    return Response.json(good);
  };
  assert.equal(await policy.verifyEligibility(target,{request}),policy.dataTrendsRelease);
  for(const data of [{...good,sha:'0'.repeat(40)},{sha:target,tree:{sha:'0'.repeat(40)}},{sha:target}])
    await assert.rejects(policy.verifyEligibility(target,{request:async()=>Response.json(data)}));
  for(const status of [403,404,500])
    await assert.rejects(policy.verifyEligibility(target,{request:async()=>new Response('',{status})}));
  await assert.rejects(policy.verifyEligibility(target,{request:async()=>{throw new Error('synthetic transport failure');}}));
});

test('data trends inherits all existing gates and checks committed artifacts before regeneration',async()=>{
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  assert.ok(yaml.includes(`          - ${commit}\n`));
  assert.equal(yaml.split(`inputs.target_commit == '${commit}'`).length-1,10);
  const blocks=yaml.split(/^      - /m).slice(1);
  const named=name=>{const step=blocks.find(block=>block.startsWith('name: '+name+'\n'));assert.ok(step,name);return step;};
  for(const name of ['Verify restored source artifacts','Verify safe Markdown for reports and daily reminders',
    'Verify update recovery and draft preservation','Verify AI report author colors','Verify mobile navigation cleanup',
    'Verify compact phone calendar layout and navigation','Verify compact mobile article review',
    'Verify OpenAI review and backup contracts without provider calls']) {
    const step=named(name);
    assert.ok(step.includes(`inputs.target_commit == '${commit}'`),name);
    assert.match(step,/working-directory: source/);
  }
  const frontend=named('Verify committed data trends frontend before regeneration');
  assert.match(frontend,/node scripts\/frontend-build\.mjs --check/);
  assert.ok(yaml.indexOf(frontend)<yaml.indexOf('Build accepted Worker without migrations or deployment'));
  const feature=named('Verify read-only data trends and preserved diagnosis UI');
  for(const file of ['review-trends','review-analytics','content-review-data','content-review-ui','content-review-v121',
    'content-review-v13','review-sections-current','openai-review-connectivity','openai-review-observable-ui'])
    assert.ok(feature.includes(`tests/${file}.test.mjs`),file);
  assert.match(feature,/node scripts\/verify-data-trends\.mjs/);
  assert.ok(yaml.indexOf(feature)<yaml.indexOf('CLOUDFLARE_API_TOKEN:'));
});

test('release controls remain authoritative and secrets are confined to the unchanged guarded publisher',async()=>{
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-manual-release.yml',import.meta.url),'utf8');
  const blocks=yaml.split(/^      - /m).slice(1);
  for(const name of ['Verify exact release eligibility','Verify production release guards','Verify accepted Worker bytes',
    'Publish existing Worker with inherited bindings']) {
    const step=blocks.find(block=>block.startsWith('name: '+name+'\n'));
    assert.ok(step,name);assert.doesNotMatch(step,/working-directory: source/);
  }
  const guards=blocks.find(block=>block.startsWith('name: Verify production release guards\n'));
  assert.ok(guards.includes('tests/cloudflare-data-trends-release.test.mjs'));
  assert.equal((yaml.match(/CLOUDFLARE_API_TOKEN:/g)||[]).length,1);
  assert.equal((yaml.match(/run: node \.github\/scripts\/cloudflare-publish\.mjs/g)||[]).length,1);
  assert.doesNotMatch(yaml,/continue-on-error|always\(\)|pull_request_target|migrations apply|secret put|wrangler|contents: write|actions: write/);
  assert.match(yaml,/group: haoduoyu-cloudflare-production\n  cancel-in-progress: false/);
  assert.ok(yaml.indexOf('uses: ./.github/actions/gitleaks')<yaml.indexOf('Verify exact release eligibility'));
  assert.ok(yaml.indexOf('Verify accepted Worker bytes')<yaml.indexOf('CLOUDFLARE_API_TOKEN:'));
});
