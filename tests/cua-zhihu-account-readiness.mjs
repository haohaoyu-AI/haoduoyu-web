import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {accountFixture,accountContext,HOME} from './fixtures/cua-account-readiness-fixture.mjs';

const moduleUrl = process.env.CUA_DRAFT_RUNNER_SOURCE ? pathToFileURL(process.env.CUA_DRAFT_RUNNER_SOURCE) : new URL('../scripts/browser-upload/cua-draft-runner.mjs',import.meta.url);
const {createZhihuAccountReader} = await import(moduleUrl);
const source = fs.readFileSync(moduleUrl,'utf8').replace(/^export (?=function)/gm,'');
let cases = 0;
async function check(name, operation) { await operation(); cases++; console.log('PASS',name); }
async function failed(reader,context=accountContext()) { try { await reader.inspect(context); assert.fail('Expected failure'); } catch(error) { return {error,diagnostic:reader.diagnostic(error)}; } }
function timerless(options={}) {
  const x=accountFixture({...options,documentedWaitFor:true});delete x.argumentsForReader.waitForReadiness;
  const context=vm.createContext({URL});
  vm.runInContext(source+'\n globalThis.makeAccountReader=createZhihuAccountReader; globalThis.privateRaw=error=>uploadDiagnosticRecords.get(error)?.raw;',context);
  return {...x,context,reader:context.makeAccountReader(x.argumentsForReader)};
}

await check('navigation/menu/link readiness settles with one navigation and one menu click',async()=>{
  const x=accountFixture({menu:[{count:0},{count:1,visible:false},{count:1,visible:true,enabled:true}],link:[{count:0},{count:1,visible:true}]});
  const reader=createZhihuAccountReader(x.argumentsForReader),result=await reader.inspect(accountContext());
  assert.equal(result.profile_href,'https://www.zhihu.com/people/ren-zhe-ai-chi-yu-52');
  assert.equal(result.checked_at,x.now());assert.equal(result.read_started_at,accountContext().requested_at);
  assert.equal(x.state.navigations,1);assert.equal(x.state.menuClicks,1);
  assert.deepEqual(x.state.waits,[100,100,100]);assert.equal(x.state.menuCounts,4);assert.equal(x.state.linkCounts,2);
});
await check('fixed mock clock cannot turn an unavailable menu into an infinite loop',async()=>{
  const x=accountFixture({menu:[{count:0}],frozenClock:true});x.argumentsForReader.readinessMaxChecks=3;
  const reader=createZhihuAccountReader(x.argumentsForReader),{diagnostic}=await failed(reader);
  assert.equal(diagnostic.substep,'account_menu_count');assert.equal(diagnostic.count,0);
  assert.equal(diagnostic.visible,'not_checked');assert.equal(diagnostic.enabled,'not_checked');assert.equal(diagnostic.checks,3);
  assert.equal(x.state.menuCounts,3);assert.equal(x.state.waits.length,2);assert.equal(x.state.menuClicks,0);
});
await check('elapsed readiness deadline blocks a late-ready control without another click',async()=>{
  const x=accountFixture({menu:[{count:0},{count:1,visible:true,enabled:true}],advanceBy:1000});
  const {diagnostic}=await failed(createZhihuAccountReader(x.argumentsForReader));
  assert.equal(diagnostic.substep,'account_menu_wait');assert.equal(x.state.menuCounts,1);assert.equal(x.state.menuClicks,0);
});
await check('ambiguous controls and blocked pages never retry or open the avatar',async()=>{
  for(const options of [{menu:[{count:2}]},{blocker:'滑块验证'},{blocker:'请先登录'},{navigationUrl:HOME+'other'}]){
    const x=accountFixture(options),{diagnostic}=await failed(createZhihuAccountReader(x.argumentsForReader));
    assert.equal(x.state.menuClicks,0);assert.equal(x.state.waits.length,0);
    if(options.menu){assert.equal(diagnostic.count,2);assert.equal(diagnostic.visible,'not_checked');}
    else {assert.equal(diagnostic.count,'not_checked');assert.equal(diagnostic.enabled,'not_checked');}
  }
});
await check('identity changes and unsafe labels stop before the sole avatar click',async()=>{
  for(const options of [{identityTag:'DIV'},{menuLabel:'退出登录'}]){
    const x=accountFixture(options);await failed(createZhihuAccountReader(x.argumentsForReader));
    assert.equal(x.state.menuClicks,0);assert.equal(x.state.waits.length,0);
  }
});
await check('a delayed profile link does not click the avatar again',async()=>{
  const x=accountFixture({link:[{count:0}],frozenClock:true});x.argumentsForReader.readinessMaxChecks=2;
  const {diagnostic}=await failed(createZhihuAccountReader(x.argumentsForReader));
  assert.equal(diagnostic.substep,'account_link_count');assert.equal(diagnostic.count,0);
  assert.equal(diagnostic.visible,'not_checked');assert.equal(diagnostic.enabled,'not_checked');
  assert.equal(x.state.menuClicks,1);assert.equal(x.state.linkCounts,2);
});
await check('no timer VM succeeds immediately, fails delayed readiness clearly, and accepts an explicit adapter',async()=>{
  const context=vm.createContext({URL});vm.runInContext(source+'\n globalThis.makeAccountReader=createZhihuAccountReader;',context);
  const ready=accountFixture();delete ready.argumentsForReader.waitForReadiness;
  assert.equal((await context.makeAccountReader(ready.argumentsForReader).inspect(accountContext())).verification_url,HOME);
  const unavailable=accountFixture({menu:[{count:0}]});delete unavailable.argumentsForReader.waitForReadiness;
  const reader=context.makeAccountReader(unavailable.argumentsForReader),{diagnostic}=await failed(reader);
  assert.equal(diagnostic.summary,'Account readiness wait unavailable in this execution context');
  assert.equal(diagnostic.substep,'account_menu_wait');assert.equal(diagnostic.count,0);assert.equal(unavailable.state.menuClicks,0);
  const injected=accountFixture({menu:[{count:0},{count:1,visible:true,enabled:true}]});
  assert.equal((await context.makeAccountReader(injected.argumentsForReader).inspect(accountContext())).verification_url,HOME);
  assert.equal(injected.state.waits.length,1);
});
await check('normal JavaScript timer default supports delayed readiness without guessing browser APIs',async()=>{
  const x=accountFixture({menu:[{count:0},{count:1,visible:true,enabled:true}],frozenClock:true});
  delete x.argumentsForReader.waitForReadiness;x.argumentsForReader.readinessIntervalMs=1;
  await createZhihuAccountReader(x.argumentsForReader).inspect(accountContext());
  assert.equal(x.state.menuCounts,3);assert.equal(x.state.menuClicks,1);
});
await check('an injected wait must be awaitable and configuration stays bounded',async()=>{
  const x=accountFixture({menu:[{count:0}]});x.argumentsForReader.waitForReadiness=()=>undefined;
  assert.equal((await failed(createZhihuAccountReader(x.argumentsForReader))).diagnostic.summary,'Awaitable account readiness wait adapter required');
  for(const patch of [{readinessMaxChecks:0},{readinessMaxChecks:101},{readinessTimeoutMs:15001},{readinessIntervalMs:0},{waitForReadiness:'guessed-api'}]){
    assert.throws(()=>createZhihuAccountReader({...x.argumentsForReader,...patch}),/Invalid bounded account readiness configuration/);
  }
});
await check('timerless count-zero and hidden menus use documented visible wait with the remaining positive deadline',async()=>{
  for (const first of [{count:0},{count:1,visible:false}]) {
    const x=timerless({menu:[first,{count:1,visible:true,enabled:true}],navigationAdvanceBy:37});
    const result=await x.reader.inspect(accountContext());
    assert.deepEqual(x.state.conditionWaits,[{control:'menu',parameters:{state:'visible',timeoutMs:463}}]);
    assert.equal(x.state.waits.length,0);assert.equal(x.state.menuCounts,3);assert.equal(x.state.enabledReads,2);
    assert.equal(x.state.identityReads,1);assert.equal(x.state.menuClicks,1);assert.equal(x.state.navigations,1);
    assert.equal(result.checked_at,x.now());
    const waitIndex=x.state.steps.indexOf('menu_wait_for');
    assert.deepEqual(x.state.steps.slice(waitIndex+1,waitIndex+7),['page_url','page_blockers','menu_count','menu_visible','menu_enabled','menu_label']);
  }
});
await check('timerless ambiguous controls never wait and ambiguity after a wait stops without clicking',async()=>{
  for (const readings of [[{count:2}],[{count:0},{count:2}]]) {
    const x=timerless({menu:readings}),{diagnostic}=await failed(x.reader);
    assert.equal(diagnostic.count,2);assert.equal(diagnostic.visible,'not_checked');assert.equal(diagnostic.enabled,'not_checked');
    assert.equal(x.state.conditionWaits.length,readings.length-1);assert.equal(x.state.menuClicks,0);assert.equal(x.state.waits.length,0);
  }
});
await check('a successful condition wait rereads blockers URL and control identity',async()=>{
  for (const patch of [{afterWaitBlocker:'请先登录'},{afterWaitBlocker:'Verify you are human'},{afterWaitUrl:HOME+'other'},{afterWaitIdentityTag:'DIV'}]) {
    const x=timerless({menu:[{count:0},{count:1,visible:true,enabled:true}],...patch}),{diagnostic}=await failed(x.reader);
    assert.equal(x.state.conditionWaits.length,1);assert.equal(x.state.menuClicks,0);assert.equal(x.state.waits.length,0);
    if (patch.afterWaitIdentityTag) {assert.equal(diagnostic.substep,'account_menu_identity');assert.equal(x.state.identityReads,1);}
    else {assert.match(diagnostic.substep,/^account_page_(url|blockers)$/);assert.equal(diagnostic.count,'not_checked');}
  }
});
await check('unknown and timeout-named condition exceptions retain raw privately and stop on the first wait',async()=>{
  for (const name of ['Error','TimeoutError']) {
    const raw=new Error('token=synthetic-secret Cookie: synthetic-cookie https://private.test/?key=secret');raw.name=name;
    raw.stack='Synthetic private stack synthetic-secret';
    const x=timerless({menu:[{count:0},{count:1,visible:true,enabled:true}],errorAt:'menu_wait_for',error:raw});
    const {error,diagnostic}=await failed(x.reader);
    assert.equal(x.context.privateRaw(error),raw);assert.notEqual(error,raw);assert.equal(error.cause,undefined);
    assert.equal(diagnostic.substep,'account_menu_wait');assert.equal(diagnostic.count,0);assert.equal(diagnostic.visible,'not_checked');
    assert.equal(diagnostic.summary,'Upload operation failed; private diagnostic retained.');
    assert.doesNotMatch(JSON.stringify({diagnostic,message:error.message,stack:error.stack}),/synthetic-secret|synthetic-cookie|private\.test|private stack/);
    assert.equal(x.state.conditionWaits.length,1);assert.equal(x.state.menuCounts,1);assert.equal(x.state.menuClicks,0);assert.equal(x.state.waits.length,0);
  }
});
await check('timerless visible-disabled controls fail with actual observations and no satisfied-condition loop',async()=>{
  const x=timerless({menu:[{count:1,visible:true,enabled:false},{count:1,visible:true,enabled:true}]});
  const {diagnostic}=await failed(x.reader);
  assert.equal(diagnostic.substep,'account_menu_enabled');assert.equal(diagnostic.count,1);assert.equal(diagnostic.visible,true);assert.equal(diagnostic.enabled,false);
  assert.equal(x.state.menuCounts,1);assert.equal(x.state.conditionWaits.length,0);assert.equal(x.state.waits.length,0);assert.equal(x.state.menuClicks,0);
});
await check('returned condition waits do not prove readiness or permit a fixed-clock retry loop',async()=>{
  for (const second of [{count:0},{count:1,visible:false},{count:1,visible:true,enabled:false}]) {
    const x=timerless({menu:[{count:0},second],frozenClock:true});await failed(x.reader);
    assert.equal(x.state.menuCounts,2);assert.equal(x.state.conditionWaits.length,1);assert.equal(x.state.waits.length,0);assert.equal(x.state.menuClicks,0);
  }
});
await check('condition waits that use the remaining deadline stop before a subsequent read or avatar click',async()=>{
  const x=timerless({menu:[{count:0},{count:1,visible:true,enabled:true}],conditionAdvanceBy:500});
  const {diagnostic}=await failed(x.reader);
  assert.equal(diagnostic.substep,'account_menu_wait');assert.equal(x.state.conditionWaits[0].parameters.timeoutMs,500);
  assert.equal(x.state.menuCounts,1);assert.equal(x.state.menuClicks,0);assert.equal(diagnostic.checked_at,accountContext().requested_at);
});
await check('a timerless delayed profile link uses one condition wait and never reopens the avatar',async()=>{
  const x=timerless({link:[{count:0},{count:1,visible:true}]});
  const result=await x.reader.inspect(accountContext());
  assert.deepEqual(x.state.conditionWaits,[{control:'link',parameters:{state:'visible',timeoutMs:500}}]);
  assert.equal(x.state.menuClicks,1);assert.equal(x.state.linkCounts,2);assert.equal(x.state.waits.length,0);
  assert.equal(result.profile_href,'https://www.zhihu.com/people/ren-zhe-ai-chi-yu-52');
});
await check('page blockers URL control state and actual deadline are guarded again after identity reads before clicking',async()=>{
  for (const patch of [{identityAdvanceBy:500},{afterIdentityBlocker:'请先登录'},{afterIdentityUrl:HOME+'other'},
      {afterIdentityMenu:{count:0}},{afterIdentityMenu:{count:2}},
      {afterIdentityMenu:{count:1,visible:false}},{afterIdentityMenu:{count:1,visible:true,enabled:false}}]) {
    const x=timerless({...patch});await failed(x.reader);
    assert.equal(x.state.identityReads,1);assert.equal(x.state.menuClicks,0);assert.equal(x.state.conditionWaits.length,0);
  }
});
console.log(`PASS account readiness: ${cases} cases; synthetic browser methods only; external actions=0.`);
