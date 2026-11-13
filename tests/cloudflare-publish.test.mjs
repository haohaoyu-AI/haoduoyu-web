import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {publishExistingWorker,diagnoseExistingWorker,versionSnapshot,main} from '../.github/scripts/cloudflare-publish.mjs';

// Fixtures follow Cloudflare's stable version GET API and official SDK types:
// https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/get/
// https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/helpers/versions-types.ts
// These are synthetic values. No live endpoint or credential is used in tests.
const OLD='83512373-c500-47c3-a451-7dde59d2174b';
const NEW='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const DEPLOYMENT='33333333-3333-4333-8333-333333333333';
const NEXT_DEPLOYMENT='44444444-4444-4444-8444-444444444444';
const SENTINEL='synthetic-private-value-never-log';
const bytes=Buffer.from('export default {fetch(){return new Response("approved")}};');
const hash=createHash('sha256').update(bytes).digest('hex');
const config={accountId:'a'.repeat(32),workerName:'haoduoyu-prod',expectedCurrentVersion:OLD,
  workerBytes:bytes,expectedWorkerSha256:hash,expectedWorkerBytes:bytes.length,targetCommit:'b'.repeat(40),token:SENTINEL};
const clone=value=>structuredClone(value);
function version(id=OLD) {
  return {id,number:id===OLD?1:2,metadata:{source:'api',author_email:'synthetic@example.invalid'},resources:{
    bindings:[{type:'d1',name:'DB',id:'55555555-5555-4555-8555-555555555555'},
      {type:'plain_text',name:'PUBLIC_OWNER',text:SENTINEL},
      {type:'json',name:'OPTIONS',json:{nested:[false,0,{secret:SENTINEL}]}},
      {type:'secret_text',name:'AUTH_TOKEN'}],
    script:{etag:id===OLD?'old-code-etag':'new-code-etag',handlers:['fetch'],last_deployed_from:'synthetic',
      placement_mode:'smart'},
    script_runtime:{compatibility_date:'2026-07-30',compatibility_flags:['nodejs_compat'],usage_model:'standard',
      limits:{cpu_ms:50},exports:{default:{type:'worker',state:'created',cache:{enabled:false}}}}}};
}
test('D1 database_id alias must match the retained database id',()=>{
  const original=version(),aliased=clone(original);
  aliased.resources.bindings[0].database_id=aliased.resources.bindings[0].id;
  assert.deepEqual(versionSnapshot(aliased,OLD),versionSnapshot(original,OLD));
  aliased.resources.bindings[0].database_id=OTHER;
  assert.throws(()=>versionSnapshot(aliased,OLD));
});
function mockCloudflare(hook=()=>{}) {
  const old=version(),candidate=version(NEW),calls=[];
  const state={latest:OLD,active:OLD,deploymentId:DEPLOYMENT,hasAssets:false,versions:new Map([[OLD,old],[NEW,candidate]]),
    settings:{logpush:false,tags:['existing'],tail_consumers:[],streaming_tail_consumers:[],
      observability:{enabled:true,head_sampling_rate:0.1}}};
  let uploadMetadata,uploadedBytes;
  const request=async(url,init)=>{
    const parsed=new URL(url),prefix=`/client/v4/accounts/${config.accountId}/workers/scripts/haoduoyu-prod`;
    assert.equal(parsed.origin,'https://api.cloudflare.com');
    const scriptList=parsed.pathname===prefix.slice(0,-'/haoduoyu-prod'.length);
    assert.ok(scriptList||parsed.pathname.startsWith(prefix));
    const path=scriptList?'':parsed.pathname.slice(prefix.length)+parsed.search,method=init.method;
    assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,`Bearer ${SENTINEL}`);
    assert.ok(init.signal instanceof AbortSignal);
    const call={path,method,body:init.body};calls.push(call);
    const overridden=await hook({path,method,init,state,calls,call});
    if(overridden!==undefined)return overridden;
    let result;
    if(method==='GET'&&path==='')result=[{id:'haoduoyu-prod',has_assets:state.hasAssets,has_modules:true}];
    else if(method==='GET'&&path.startsWith('/deployments?'))result={deployments:[{id:state.deploymentId,
      strategy:'percentage',versions:[{version_id:state.active,percentage:100}]}]};
    else if(method==='GET'&&path.startsWith('/versions?'))result={items:[{id:state.latest,number:1}]};
    else if(method==='GET'&&path.startsWith('/versions/'))result=state.versions.get(path.slice('/versions/'.length));
    else if(method==='GET'&&path==='/script-settings')result=state.settings;
    else if(method==='GET'&&path==='/settings') {
      const current=(state.versions.get(state.active)??state.versions.get(OLD)).resources;
      result={bindings:current.bindings,...current.script_runtime,placement:{mode:'smart'},...state.settings};
      if(Object.hasOwn(result,'migration_tag'))delete result.migration_tag;
    }
    else if(method==='POST'&&path==='/versions?bindings_inherit=strict') {
      assert.ok(init.body instanceof FormData);
      uploadMetadata=JSON.parse(init.body.get('metadata'));
      uploadedBytes=Buffer.from(await init.body.get('worker.mjs').arrayBuffer());
      state.latest=NEW;result={id:NEW};
    }else if(method==='POST'&&path==='/deployments') {
      assert.deepEqual(JSON.parse(init.body),{strategy:'percentage',versions:[{version_id:NEW,percentage:100}]});
      state.active=NEW;state.deploymentId=NEXT_DEPLOYMENT;result={id:NEXT_DEPLOYMENT};
    }else assert.fail(`Unexpected mocked API path: ${method} ${path}`);
    return Response.json({success:true,result:clone(result)});
  };
  return {request,state,calls,get metadata(){return uploadMetadata;},get bytes(){return uploadedBytes;}};
}
const writes=mock=>mock.calls.filter(call=>call.method==='POST');
const run=mock=>publishExistingWorker(config,{request:mock.request});
function privateFree(report) {
  assert.ok(!JSON.stringify(report).includes(SENTINEL));
  assert.ok(!JSON.stringify(report).includes('synthetic@example.invalid'));
}

test('uploads exact approved bytes with named strict inherits, then confirms a single 100% deployment',async()=>{
  const mock=mockCloudflare(),report=await run(mock);
  assert.equal(report.status,'deployed');assert.equal(report.code,'DEPLOYMENT_CONFIRMED');
  assert.equal(report.uploaded_version_id,NEW);assert.equal(report.deployment_id,NEXT_DEPLOYMENT);
  assert.equal(report.worker_sha256,hash);assert.deepEqual(mock.bytes,bytes);
  assert.equal(writes(mock).length,2);
  assert.deepEqual(mock.metadata.bindings,['AUTH_TOKEN','DB','OPTIONS','PUBLIC_OWNER'].map(name=>({name,type:'inherit'})));
  assert.ok(!JSON.stringify(mock.metadata).includes(SENTINEL));
  assert.equal(mock.metadata.main_module,'worker.mjs');
  assert.equal(mock.metadata.compatibility_date,'2026-07-30');
  assert.deepEqual(mock.metadata.compatibility_flags,['nodejs_compat']);
  assert.equal(mock.metadata.usage_model,'standard');assert.deepEqual(mock.metadata.limits,{cpu_ms:50});
  assert.deepEqual(mock.metadata.placement,{mode:'smart'});
  assert.deepEqual(mock.metadata.exports,version().resources.script_runtime.exports);
  assert.ok(!Object.hasOwn(mock.metadata,'keep_bindings'));
  assert.ok(!Object.hasOwn(mock.metadata,'logpush'));assert.ok(!Object.hasOwn(mock.metadata,'migrations'));
  for(const write of writes(mock)) {
    const before=mock.calls.slice(0,mock.calls.indexOf(write));
    assert.ok(before.slice(-6).every(call=>call.method==='GET'));
    assert.deepEqual(new Set(before.slice(-6).map(call=>call.path.split('?')[0])),
      new Set(['/deployments','/versions',`/versions/${OLD}`,'/script-settings','/settings','']));
  }
  privateFree(report);
});
function pendingUpload(hook) {
  const mock=mockCloudflare(hook);mock.state.latest=NEW;
  mock.state.versions.get(NEW).annotations={'workers/commit_sha':config.targetCommit};return mock;
}
const resume=mock=>publishExistingWorker({...config,uploadedVersionId:NEW},{request:mock.request});
test('resumes the exact verified pending upload with one deployment and no second upload',async()=>{
  const mock=pendingUpload(),report=await resume(mock);
  assert.equal(report.status,'deployed');assert.equal(report.uploaded_version_id,NEW);
  assert.equal(writes(mock).length,1);assert.equal(writes(mock)[0].path,'/deployments');
  assert.equal(mock.metadata,undefined);assert.equal(mock.state.active,NEW);privateFree(report);
});
test('resume never falls back to upload after a candidate GET failure or identity mismatch',async()=>{
  for(const change of ['404','commit','binding']) {
    const mock=pendingUpload(({path})=>change==='404'&&path===`/versions/${NEW}`?
      Response.json({success:false},{status:404}):undefined);
    if(change==='commit')delete mock.state.versions.get(NEW).annotations;
    if(change==='binding')mock.state.versions.get(NEW).resources.bindings[1].text='changed';
    const report=await resume(mock);
    assert.equal(report.status,'uploaded_not_deployed');assert.equal(writes(mock).length,0);
    assert.equal(mock.state.active,OLD);privateFree(report);
  }
});
for(const field of ['latest','active'])test(`resume rejects a different ${field} or an already deployed candidate`,async()=>{
  const mock=pendingUpload();mock.state[field]=field==='active'?NEW:OTHER;
  const report=await resume(mock);
  assert.equal(report.status,'blocked');assert.equal(report.code,'CURRENT_VERSION_MISMATCH');
  assert.equal(writes(mock).length,0);privateFree(report);
});
for(const field of ['latest','active','deploymentId','settings','sourceBinding'])
  test(`resume rechecks ${field} before its only production write`,async()=>{
    const mock=pendingUpload(({path,state,calls})=>{
      if(path.startsWith('/versions?')&&calls.filter(call=>call.method==='GET'&&call.path.startsWith('/versions?')).length===2) {
        if(field==='settings')state.settings.tags.push('changed');
        else if(field==='sourceBinding')state.versions.get(OLD).resources.bindings[1].text='changed';
        else state[field]=OTHER;
      }
    });
    const report=await resume(mock);
    assert.equal(report.status,'uploaded_not_deployed');assert.equal(writes(mock).length,0);privateFree(report);
  });
test('a lost resume deployment response stays uncertain and reconciles without another write',async()=>{
  const mock=pendingUpload(({method,path,state})=>{
    if(method==='POST'&&path==='/deployments'){state.active=NEW;state.deploymentId=NEXT_DEPLOYMENT;throw Error(SENTINEL);}
  });
  const report=await resume(mock);
  assert.equal(report.status,'uncertain');assert.equal(report.write_stage,'deploy');
  assert.equal(report.observed_active_version_id,NEW);assert.equal(writes(mock).length,1);privateFree(report);
});

test('binding order and JSON object key order are not changes; visible values still compare exactly',()=>{
  const a=version(),b=version();b.resources.bindings.reverse();
  b.resources.bindings.find(item=>item.type==='json').json={nested:[false,0,{secret:SENTINEL}]};
  assert.deepEqual(versionSnapshot(a,OLD),versionSnapshot(b,OLD));
});

test('documented optional usage_model is neither invented nor required',async()=>{
  const mock=mockCloudflare();
  for(const item of mock.state.versions.values())delete item.resources.script_runtime.usage_model;
  const report=await run(mock);assert.equal(report.status,'deployed');
  assert.ok(!Object.hasOwn(mock.metadata,'usage_model'));
});
test('null and empty nonversioned lists are equivalent without writing settings',async()=>{
  const mock=mockCloudflare(({path,method,state})=>{
    if(method==='GET'&&path==='/script-settings')return Response.json({success:true,result:{...state.settings,
      tags:null,tail_consumers:null,streaming_tail_consumers:null}});
  });
  mock.state.settings.tags=[];
  const report=await run(mock);assert.equal(report.status,'deployed');
  for(const key of ['tags','tail_consumers','streaming_tail_consumers'])assert.ok(!Object.hasOwn(mock.metadata,key));
});
test('empty placement metadata preserves an existing worker without smart placement',async()=>{
  const mock=mockCloudflare(({path,method,state})=>{
    if(method!=='GET'||path!=='/settings')return;
    const current=state.versions.get(state.active).resources;
    return Response.json({success:true,result:{bindings:current.bindings,...current.script_runtime,placement:{},...state.settings}});
  });
  for(const item of mock.state.versions.values())delete item.resources.script.placement_mode;
  const report=await run(mock);assert.equal(report.status,'deployed');
  assert.ok(!Object.hasOwn(mock.metadata,'placement'));
});
test('current smart placement is retained when the older version omits its optional placement mode',async()=>{
  const mock=mockCloudflare();delete mock.state.versions.get(OLD).resources.script.placement_mode;
  const report=await run(mock);
  assert.equal(report.status,'deployed');assert.equal(writes(mock).length,2);
  assert.deepEqual(mock.metadata.placement,{mode:'smart'});privateFree(report);
});
test('the observed script placement alias preserves the same explicitly inherited smart mode',async()=>{
  const mock=mockCloudflare();
  for(const item of mock.state.versions.values())item.resources.script.placement={mode:'smart'};
  const report=await run(mock);
  assert.equal(report.status,'deployed');assert.equal(writes(mock).length,2);
  assert.deepEqual(mock.metadata.placement,{mode:'smart'});privateFree(report);
});
test('script placement aliases reject unknown fields, modes and missing legacy confirmation',async()=>{
  for(const placement of [{},{mode:'targeted'},{mode:'smart',status:'SUCCESS'},
    {mode:'smart',last_analyzed_at:'2026-11-13T10:00:00Z'},null,[],{mode:'smart',region:'aws:us-east-1'}]) {
    const mock=mockCloudflare();mock.state.versions.get(OLD).resources.script.placement=placement;
    const report=await run(mock);
    assert.equal(report.status,'blocked');assert.equal(writes(mock).length,0);privateFree(report);
  }
  const mock=mockCloudflare(),script=mock.state.versions.get(OLD).resources.script;
  script.placement={mode:'smart'};delete script.placement_mode;
  const report=await run(mock);
  assert.equal(report.status,'blocked');assert.equal(report.check,'script.placement.alias');
  assert.equal(writes(mock).length,0);privateFree(report);
});
test('an inconsistent uploaded placement alias never receives traffic',async()=>{
  const mock=mockCloudflare();mock.state.versions.get(NEW).resources.script.placement={mode:'targeted'};
  const report=await run(mock);
  assert.equal(report.status,'uploaded_not_deployed');assert.equal(writes(mock).length,1);
  assert.equal(mock.state.active,OLD);privateFree(report);
});
test('documented placement analysis status is validated but never uploaded or treated as configuration',async()=>{
  const mock=mockCloudflare(({path,state})=>{
    if(path==='/settings')state.versions.get(OLD).resources.script.placement_status='INSUFFICIENT_INVOCATIONS';
  });
  mock.state.versions.get(OLD).resources.script.placement_status='SUCCESS';
  mock.state.versions.get(NEW).resources.script.placement_status='UNSUPPORTED_APPLICATION';
  const report=await run(mock);
  assert.equal(report.status,'deployed');assert.deepEqual(mock.metadata.placement,{mode:'smart'});
  assert.ok(!Object.hasOwn(mock.metadata,'placement_status'));privateFree(report);
});
test('unknown placement status values and other script fields remain blocked',async()=>{
  for(const patch of [{placement_status:SENTINEL},{placement_status:null},{placement_status:[]},
    {placement_status:'SUCCESS',unreviewed_setting:true}]) {
    const mock=mockCloudflare();Object.assign(mock.state.versions.get(OLD).resources.script,patch);
    const report=await run(mock);
    assert.equal(report.status,'blocked');assert.equal(report.code,'UNSUPPORTED_CONFIGURATION');
    assert.equal(writes(mock).length,0);privateFree(report);
  }
});
test('an uploaded version must independently confirm inherited smart placement before deployment',async()=>{
  const mock=mockCloudflare();
  for(const item of mock.state.versions.values())delete item.resources.script.placement_mode;
  const report=await run(mock);
  assert.equal(report.status,'uploaded_not_deployed');assert.equal(report.code,'CONFIGURATION_CHANGED');
  assert.equal(writes(mock).length,1);assert.equal(mock.state.active,OLD);
  assert.deepEqual(mock.metadata.placement,{mode:'smart'});privateFree(report);
});
test('explicit smart placement still conflicts with absent or empty current placement',async()=>{
  for(const placement of [undefined,{}]) {
    const mock=mockCloudflare(({path,state})=>{
      if(path!=='/settings')return;
      return Response.json({success:true,result:{bindings:version().resources.bindings,
        ...version().resources.script_runtime,...state.settings,...(placement?{placement}:{})}});
    });
    const report=await run(mock);
    assert.equal(report.status,'blocked');assert.equal(report.code,'CONFIGURATION_CHANGED');
    assert.equal(writes(mock).length,0);privateFree(report);
  }
});
for(const read of [2,3])test(`a real placement change on state read ${read} remains blocked`,async()=>{
  let settingsReads=0;
  const mock=mockCloudflare(({path,state})=>{
    if(path!=='/settings'||++settingsReads<read)return;
    const current=state.versions.get(OLD).resources;
    return Response.json({success:true,result:{bindings:current.bindings,...current.script_runtime,
      placement:{},...state.settings}});
  });
  delete mock.state.versions.get(OLD).resources.script.placement_mode;
  const report=await run(mock);
  assert.equal(report.status,read===2?'blocked':'uploaded_not_deployed');
  assert.equal(report.code,'CONFIGURATION_CHANGED');assert.equal(writes(mock).length,read-2);
  assert.equal(mock.state.active,OLD);privateFree(report);
});
test('null nonversioned lists cannot conceal a nonempty current list',async()=>{
  const mock=mockCloudflare(({path,state})=>path==='/script-settings'?
    Response.json({success:true,result:{...state.settings,tags:null}}):undefined);
  const report=await run(mock);
  assert.equal(report.status,'blocked');assert.equal(report.code,'CONFIGURATION_CHANGED');
  assert.equal(writes(mock).length,0);privateFree(report);
});

test('native assets without a binding, or missing assets metadata, prevent a code-only upload',async()=>{
  for(const flag of [true,undefined]) {
    const mock=mockCloudflare();mock.state.hasAssets=flag;const report=await run(mock);
    assert.equal(report.status,'blocked');assert.equal(report.code,'ASSETS_ABSENCE_NOT_CONFIRMED');
    assert.equal(writes(mock).length,0);
  }
});

test('combined settings reveal unsupported cache, targeted placement and subrequest options before upload',async()=>{
  for(const extra of [{cache_options:{enabled:true}},{placement:{mode:'targeted',region:'aws:us-east-1'}},
    {limits:{cpu_ms:50,subrequests:100}}]) {
    const mock=mockCloudflare(({path,state})=>{
      if(path==='/settings')return Response.json({success:true,result:{bindings:version().resources.bindings,
        ...version().resources.script_runtime,placement:{mode:'smart'},...state.settings,...extra}});
    });
    const report=await run(mock);assert.equal(report.status,'blocked');assert.equal(writes(mock).length,0);privateFree(report);
  }
});

for(const [label,change,code] of [
  ['different latest uploaded version',mock=>{mock.state.latest=OTHER;},'CURRENT_VERSION_MISMATCH'],
  ['different active version',mock=>{mock.state.active=OTHER;},'CURRENT_VERSION_MISMATCH'],
  ['unknown binding type',mock=>{mock.state.versions.get(OLD).resources.bindings.push({type:'r2_bucket',name:'UNREVIEWED'});},
    'UNSUPPORTED_BINDINGS'],
  ['unreviewed runtime field',mock=>{mock.state.versions.get(OLD).resources.script_runtime.containers=[];},
    'UNSUPPORTED_CONFIGURATION'],
  ['unreviewed resource field',mock=>{mock.state.versions.get(OLD).resources.assets={};},'UNSUPPORTED_CONFIGURATION'],
  ['Durable Object migration',mock=>{mock.state.versions.get(OLD).resources.script_runtime.migration_tag='v1';},
    'UNSUPPORTED_CONFIGURATION'],
  ['Durable Object export',mock=>{mock.state.versions.get(OLD).resources.script_runtime.exports.Counter={type:'durable-object'};},
    'UNSUPPORTED_CONFIGURATION'],
  ['redacted secret overwritten as text',mock=>{mock.state.versions.get(OLD).resources.bindings.at(-1).text='';},
    'UNSUPPORTED_CONFIGURATION'],
  ['unknown nonversioned setting',mock=>{mock.state.settings.unreviewed_setting=true;},'UNSUPPORTED_CONFIGURATION']
])test(`blocks ${label} before upload`,async()=>{
  const mock=mockCloudflare();change(mock);const report=await run(mock);
  assert.equal(report.status,'blocked');assert.equal(report.code,code);assert.equal(writes(mock).length,0);privateFree(report);
});

test('requires a single 100% deployment; gradual traffic and absent deployments never authorize upload',async()=>{
  for(const deployments of [[],[{id:DEPLOYMENT,strategy:'percentage',versions:[{version_id:OLD,percentage:99}]}],
    [{id:DEPLOYMENT,strategy:'percentage',versions:[{version_id:OLD,percentage:100},{version_id:OTHER,percentage:0}]}]]) {
    const mock=mockCloudflare(({path})=>path.startsWith('/deployments?')?Response.json({success:true,result:{deployments}}):undefined);
    const report=await run(mock);assert.equal(report.status,'blocked');assert.equal(writes(mock).length,0);
  }
});

for(const field of ['latest','active','deploymentId'])test(`rechecks ${field} immediately before upload`,async()=>{
  const mock=mockCloudflare(({path,state,calls})=>{
    if(path.startsWith('/versions?')&&calls.filter(call=>call.method==='GET'&&call.path.startsWith('/versions?')).length===2)state[field]=OTHER;
  });
  const report=await run(mock);assert.equal(report.status,'blocked');assert.equal(writes(mock).length,0);
});

test('a visible binding value changed during upload verification leaves the candidate undeployed',async()=>{
  const mock=mockCloudflare();mock.state.versions.get(NEW).resources.bindings[1].text='changed';
  const report=await run(mock);
  assert.equal(report.status,'uploaded_not_deployed');assert.equal(report.code,'CONFIGURATION_CHANGED');
  assert.equal(report.uploaded_version_id,NEW);assert.equal(writes(mock).length,1);privateFree(report);
});

test('an unknown candidate field leaves the candidate undeployed rather than assuming preservation',async()=>{
  const mock=mockCloudflare();mock.state.versions.get(NEW).resources.script_runtime.unreviewed=true;
  const report=await run(mock);assert.equal(report.status,'uploaded_not_deployed');
  assert.equal(report.uploaded_version_id,NEW);assert.equal(writes(mock).length,1);
});

for(const field of ['latest','active','deploymentId','settings','sourceBinding'])
  test(`rechecks ${field} immediately before deploying`,async()=>{
    const mock=mockCloudflare(({path,state,calls})=>{
      if(path.startsWith('/versions?')&&calls.filter(call=>call.method==='GET'&&call.path.startsWith('/versions?')).length===3) {
        if(field==='settings')state.settings.tags.push('changed');
        else if(field==='sourceBinding')state.versions.get(OLD).resources.bindings[1].text='changed';
        else state[field]=OTHER;
      }
    });
    const report=await run(mock);
    assert.equal(report.status,'uploaded_not_deployed');assert.equal(report.uploaded_version_id,NEW);
    assert.equal(writes(mock).length,1);privateFree(report);
  });

for(const stage of ['upload','deploy'])test(`lost ${stage} response is uncertain and reconciles read-only without retry`,async()=>{
  const mock=mockCloudflare(({method,path,state})=>{
    if(method==='POST'&&path===(stage==='upload'?'/versions?bindings_inherit=strict':'/deployments')) {
      state.latest=NEW;
      if(stage==='deploy'){state.active=NEW;state.deploymentId=NEXT_DEPLOYMENT;}
      throw Error(SENTINEL);
    }
  });
  const report=await run(mock);assert.equal(report.status,'uncertain');assert.equal(report.write_stage,stage);
  assert.equal(report.observed_latest_version_id,NEW);
  assert.equal(report.observed_active_version_id,stage==='deploy'?NEW:OLD);
  assert.equal(writes(mock).length,stage==='deploy'?2:1);
  const lastWrite=mock.calls.findLastIndex(call=>call.method==='POST');
  assert.ok(mock.calls.slice(lastWrite+1).length>=2);
  assert.ok(mock.calls.slice(lastWrite+1).every(call=>call.method==='GET'));privateFree(report);
});

test('timeout aborts an upload, reports uncertainty and never sends a second upload',async()=>{
  const mock=mockCloudflare(({method,path,init})=>{
    if(method==='POST'&&path.startsWith('/versions?'))return new Promise((resolve,reject)=>{
      init.signal.addEventListener('abort',()=>reject(Error(SENTINEL)),{once:true});
    });
  });
  const report=await publishExistingWorker(config,{request:mock.request,timeoutMs:10});
  assert.equal(report.status,'uncertain');assert.equal(writes(mock).length,1);privateFree(report);
});

test('an HTTP rejection never prints server errors, tokens or binding values and is not retried',async()=>{
  const mock=mockCloudflare(({method})=>method==='POST'?Response.json({success:false,errors:[{message:SENTINEL}]},
    {status:403}):undefined);
  const report=await run(mock);assert.equal(report.status,'uncertain');assert.equal(report.code,'API_HTTP_403');
  assert.equal(writes(mock).length,1);privateFree(report);
});

test('a lost confirmation after a successful deployment stays uncertain',async()=>{
  const mock=mockCloudflare(({path,state})=>{
    if(state.active===NEW&&path==='/script-settings')throw Error(SENTINEL);
  });
  const report=await run(mock);assert.equal(report.status,'uncertain');assert.equal(report.write_stage,'deploy');
  assert.equal(writes(mock).length,2);assert.equal(report.observed_active_version_id,NEW);privateFree(report);
});

test('oversized or malformed API data blocks before writing without exposing body contents',async()=>{
  for(const response of [()=>new Response(SENTINEL),()=>new Response('{}',{headers:{'content-length':String(3*1024*1024)}})]) {
    const mock=mockCloudflare(({path})=>path==='/script-settings'?response():undefined);
    const report=await run(mock);assert.equal(report.status,'blocked');assert.equal(writes(mock).length,0);privateFree(report);
  }
});

for(const patch of [{expectedWorkerSha256:'0'.repeat(64)},{expectedWorkerBytes:1},{workerName:'new-worker'},
  {expectedCurrentVersion:'latest'},{accountId:'../../../other'},{token:'bad\nheader'},
  {uploadedVersionId:'latest'},{uploadedVersionId:OLD}])
  test(`invalid release input is rejected before contacting Cloudflare (${Object.keys(patch)[0]})`,async()=>{
    let contacted=false;
    const report=await publishExistingWorker({...config,...patch},{request:()=>{contacted=true;assert.fail('No request expected');}});
    assert.equal(report.status,'blocked');assert.equal(contacted,false);privateFree(report);
  });

test('CLI rejects an unapproved workflow before reading a Worker or credential-dependent network operation',async()=>{
  let read=false,contacted=false;const output=[];
  const report=await main({TARGET_COMMIT:'unapproved',CLOUDFLARE_API_TOKEN:SENTINEL},{
    read:()=>{read=true;assert.fail('No file read expected');},request:()=>{contacted=true;assert.fail('No request expected');},
    output:value=>output.push(value)});
  assert.equal(read,false);assert.equal(contacted,false);assert.equal(report.status,'blocked');
  assert.equal(output.length,1);assert.deepEqual(JSON.parse(output[0]),report);privateFree(report);
});

test('documented D1 id and database_id forms preserve the same existing database through deployment',async()=>{
  for(const variant of ['database_id','both']) {
    const mock=mockCloudflare(),binding=mock.state.versions.get(NEW).resources.bindings[0];
    binding.database_id=binding.id;if(variant==='database_id')delete binding.id;
    const report=await run(mock);assert.equal(report.status,'deployed');assert.equal(writes(mock).length,2);
    assert.deepEqual(mock.metadata.bindings.find(item=>item.name==='DB'),{name:'DB',type:'inherit'});
    assert.ok(!JSON.stringify(mock.metadata).includes(binding.database_id));privateFree(report);
  }
});

test('D1 aliases cannot conceal a different, missing or malformed database identity',async()=>{
  for(const patch of [{database_id:OTHER},{database_id:null},{id:null,database_id:OLD},
    {id:undefined,database_id:undefined}]) {
    const mock=mockCloudflare();Object.assign(mock.state.versions.get(OLD).resources.bindings[0],patch);
    const report=await run(mock);assert.equal(report.status,'blocked');assert.equal(report.code,'UNSUPPORTED_BINDINGS');
    assert.equal(writes(mock).length,0);privateFree(report);
  }
});

test('a documented midnight UTC compatibility date is the same runtime date, not a configuration change',async()=>{
  const mock=mockCloudflare();mock.state.versions.get(OLD).resources.script_runtime.compatibility_date+='T00:00:00Z';
  const report=await run(mock);assert.equal(report.status,'deployed');assert.equal(writes(mock).length,2);
  assert.equal(mock.metadata.compatibility_date,'2026-07-30');privateFree(report);
});

test('date normalization rejects offsets, non-midnight times, invalid dates and real date changes',async()=>{
  for(const date of ['2026-07-30T00:00:01Z','2026-07-30T00:00:00+00:00','2026-02-30',
    '2026-13-01','2026-07-30T00:00:00.000Z']) {
    const mock=mockCloudflare();mock.state.versions.get(OLD).resources.script_runtime.compatibility_date=date;
    const report=await run(mock);assert.equal(report.status,'blocked');assert.equal(writes(mock).length,0);privateFree(report);
  }
  const mock=mockCloudflare(({path,state})=>path==='/settings'?Response.json({success:true,result:{
    bindings:version().resources.bindings,...version().resources.script_runtime,
    compatibility_date:'2026-07-31T00:00:00Z',placement:{mode:'smart'},...state.settings}}):undefined);
  const report=await run(mock);assert.equal(report.status,'blocked');assert.equal(report.code,'CONFIGURATION_CHANGED');
  assert.equal(writes(mock).length,0);privateFree(report);
});


test('preflight reports only fixed validation locations, never API field names or values',async()=>{
  for(const [change,location] of [
    [mock=>{mock.state.versions.get(OLD)[SENTINEL]=SENTINEL;},'version.fields'],
    [mock=>{mock.state.versions.get(OLD).resources.bindings[0][SENTINEL]=SENTINEL;},'binding.d1.fields'],
    [mock=>{mock.state.versions.get(OLD).resources.script_runtime.compatibility_date=SENTINEL;},'runtime.compatibility_date'],
    [mock=>{mock.state.versions.get(OLD).resources.script_runtime.exports[SENTINEL]={type:SENTINEL};},'runtime.exports.names'],
    [mock=>{mock.state.versions.get(OLD).resources.script.named_handlers=[{name:SENTINEL}];},'script.named_handlers'],
    [mock=>{mock.state.settings[SENTINEL]=SENTINEL;},'script_settings.fields']
  ]) {
    const mock=mockCloudflare();change(mock);const report=await run(mock);
    assert.equal(report.status,'blocked');assert.equal(report.code,'UNSUPPORTED_CONFIGURATION');
    assert.equal(report.check,location);assert.equal(writes(mock).length,0);privateFree(report);
  }
});

test('diagnostics inspect a valid production shape using GET only and never publish',async()=>{
  const mock=mockCloudflare(),report=await diagnoseExistingWorker(config,{request:mock.request});
  assert.equal(report.status,'diagnosed');assert.equal(report.code,'PREFLIGHT_VALID');
  assert.equal(report.shapes.version.resources.bindings.items[0].id.value_type,'string');
  assert.equal(report.shapes.version.resources.bindings.items[0].database_id.value_type,'missing');
  assert.equal(report.shapes.version.resources.script_runtime.limits.value_type,'object');
  assert.equal(mock.calls.length,6);assert.ok(mock.calls.every(call=>call.method==='GET'));
  assert.equal(writes(mock).length,0);assert.equal(mock.state.active,OLD);assert.equal(mock.state.latest,OLD);
  privateFree(report);
});
test('diagnostics identify placement source and empty-list equivalence without exposing values',async()=>{
  const mock=mockCloudflare(({path,state})=>path==='/script-settings'?
    Response.json({success:true,result:{...state.settings,tags:null,tail_consumers:null}}):undefined);
  mock.state.settings.tags=[];delete mock.state.versions.get(OLD).resources.script.placement_mode;
  const report=await diagnoseExistingWorker(config,{request:mock.request});
  assert.equal(report.code,'PREFLIGHT_VALID');
  assert.deepEqual(report.configuration.placement,{version_mode:'missing',version_object_mode:'missing',
    version_status:'missing',combined_mode:'smart'});
  for(const key of ['tags','tail_consumers'])assert.deepEqual(report.configuration.setting_lists[key],
    {script_count:0,combined_count:0,normalized_equal:true});
  assert.equal(writes(mock).length,0);privateFree(report);
});
test('diagnostics prove current content matches a commit-annotated reference using GET only',async()=>{
  const mock=mockCloudflare(),reference=version(OTHER),commit='c'.repeat(40);
  reference.resources.script.etag=mock.state.versions.get(OLD).resources.script.etag;
  reference.annotations={'workers/commit_sha':commit};mock.state.versions.set(OTHER,reference);
  mock.state.versions.get(OLD).resources.script.placement_status='SUCCESS';
  mock.state.versions.get(OLD).resources.script.placement={mode:'smart'};
  const report=await diagnoseExistingWorker({...config,sourceReferenceVersion:OTHER,expectedSourceCommit:commit},
    {request:mock.request});
  assert.equal(report.code,'PREFLIGHT_VALID');
  assert.deepEqual(report.current,{deployment_id:DEPLOYMENT,active_version_id:OLD,latest_version_id:OLD});
  assert.deepEqual(report.source,{reference_version_id:OTHER,reference_commit:commit,content_etag_equal:true});
  assert.equal(report.configuration.placement.version_status,'SUCCESS');
  assert.equal(report.configuration.placement.version_object_mode,'smart');
  assert.equal(report.shapes.version.resources.script.unrecognized_field_count,0);
  assert.equal(mock.calls.length,7);assert.ok(mock.calls.every(call=>call.method==='GET'));privateFree(report);
});
test('source inspection rejects different content, wrong annotations and incomplete inputs',async()=>{
  for(const mismatch of ['content','commit']) {
    const mock=mockCloudflare(),reference=version(OTHER),commit='c'.repeat(40);
    reference.annotations={'workers/commit_sha':mismatch==='commit'?'d'.repeat(40):commit};
    if(mismatch==='commit')reference.resources.script.etag=mock.state.versions.get(OLD).resources.script.etag;
    mock.state.versions.set(OTHER,reference);
    const report=await diagnoseExistingWorker({...config,sourceReferenceVersion:OTHER,expectedSourceCommit:commit},
      {request:mock.request});
    assert.equal(report.code,mismatch==='commit'?'SOURCE_REFERENCE_COMMIT_MISMATCH':'SOURCE_CONTENT_MISMATCH');
    assert.ok(mock.calls.every(call=>call.method==='GET'));privateFree(report);
  }
  for(const patch of [{sourceReferenceVersion:OTHER},{expectedSourceCommit:'c'.repeat(40)},
    {sourceReferenceVersion:'latest',expectedSourceCommit:'c'.repeat(40)}]) {
    const report=await diagnoseExistingWorker({...config,...patch},{request:()=>assert.fail('No API request allowed')});
    assert.equal(report.code,'INVALID_SOURCE_REFERENCE');privateFree(report);
  }
});

test('diagnostics expose documented-field types and the exact failed check, without API names or values',async()=>{
  const mock=mockCloudflare(),old=mock.state.versions.get(OLD);
  old[SENTINEL]=SENTINEL;
  old.resources.bindings[0].database_id=OLD;
  old.resources.bindings[0].name=SENTINEL;
  old.resources.script_runtime.compatibility_date=SENTINEL;
  old.resources.script_runtime.limits=null;
  old.resources.script_runtime.exports[SENTINEL]={type:SENTINEL};
  mock.state.settings.tags=[SENTINEL];
  const report=await diagnoseExistingWorker(config,{request:mock.request});
  assert.equal(report.status,'diagnosed');assert.equal(report.code,'UNSUPPORTED_CONFIGURATION');
  assert.equal(report.check,'version.fields');assert.equal(report.shapes.version.unrecognized_field_count,1);
  assert.equal(report.shapes.version.resources.bindings.items[0].database_id.value_type,'string');
  assert.equal(report.shapes.version.resources.script_runtime.compatibility_date.value_type,'string');
  assert.equal(report.shapes.version.resources.script_runtime.limits.value_type,'null');
  assert.equal(report.shapes.version.resources.script_runtime.exports.unrecognized_field_count,1);
  assert.equal(report.shapes.script_settings.tags.value_type,'array');
  assert.ok(!Object.hasOwn(report.shapes.script_settings.tags,'items'));
  assert.ok(mock.calls.every(call=>call.method==='GET'));assert.equal(writes(mock).length,0);privateFree(report);
});

test('diagnostic HTTP and input failures never disclose responses or authorize a write',async()=>{
  const mock=mockCloudflare(()=>Response.json({success:false,errors:[{message:SENTINEL}]},{status:403}));
  const report=await diagnoseExistingWorker(config,{request:mock.request});
  assert.equal(report.status,'blocked');assert.equal(report.code,'API_HTTP_403');
  assert.ok(mock.calls.every(call=>call.method==='GET'));assert.equal(writes(mock).length,0);privateFree(report);
  let contacted=false;
  const invalid=await diagnoseExistingWorker({...config,workerName:'unapproved-worker'},
    {request:()=>{contacted=true;assert.fail('Invalid input must not contact Cloudflare');}});
  assert.equal(invalid.status,'blocked');assert.equal(contacted,false);privateFree(invalid);
});

test('an unknown diagnostic operation is rejected before file or network access',async()=>{
  let contacted=false,read=false;
  const report=await main({GITHUB_REPOSITORY:'haohaoyu-AI/haoduoyu-web',GITHUB_REF:'refs/heads/main',
    GITHUB_EVENT_NAME:'workflow_dispatch',TARGET_COMMIT:'947bc782ea70e7808f6e7de523e5977818b292df',
    LOCAL_UPLOAD_STOPPED:'true',EXPECTED_CURRENT_VERSION:OLD,RELEASE_OPERATION:SENTINEL},
    {read:()=>{read=true;},request:()=>{contacted=true;},output:()=>{}});
  assert.equal(report.status,'blocked');assert.equal(read,false);assert.equal(contacted,false);privateFree(report);
});

const inspectEnv={GITHUB_REPOSITORY:'haohaoyu-AI/haoduoyu-web',GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_dispatch',RELEASE_OPERATION:'inspect',EXPECTED_CURRENT_VERSION:OLD,
  CLOUDFLARE_ACCOUNT_ID:config.accountId,CLOUDFLARE_WORKER_NAME:config.workerName,CLOUDFLARE_API_TOKEN:SENTINEL};

test('inspection CLI needs no old source commit, Worker file or release approval and cannot publish',async()=>{
  const mock=mockCloudflare(),output=[];
  const report=await main(inspectEnv,{request:mock.request,
    read:()=>assert.fail('Inspection must not read or rebuild a Worker'),output:value=>output.push(value)});
  assert.equal(report.status,'diagnosed');assert.equal(report.code,'PREFLIGHT_VALID');
  assert.equal(mock.calls.length,6);assert.ok(mock.calls.every(call=>call.method==='GET'&&call.body===undefined));
  assert.equal(mock.state.active,OLD);assert.equal(mock.state.latest,OLD);
  assert.equal(output.length,1);assert.deepEqual(JSON.parse(output[0]),report);privateFree(report);
});

test('inspection cannot run under another repository, branch or event',async()=>{
  for(const patch of [{GITHUB_REPOSITORY:'someone/else'},{GITHUB_REF:'refs/heads/feature'},
    {GITHUB_EVENT_NAME:'pull_request_target'}]) {
    const report=await main({...inspectEnv,...patch},{
      read:()=>assert.fail('No Worker read allowed'),request:()=>assert.fail('No API request allowed'),output:()=>{}});
    assert.equal(report.status,'blocked');assert.equal(report.code,'RELEASE_INPUT_REJECTED');privateFree(report);
  }
});

test('inspection validates the exact target, full version, token and timeout before any API request',async()=>{
  const target={accountId:config.accountId,workerName:config.workerName,expectedCurrentVersion:OLD,token:SENTINEL};
  for(const patch of [{accountId:'wrong'},{workerName:'other'},{expectedCurrentVersion:'50af6df9'},
    {token:''},{token:'bad\nheader'}]) {
    const report=await diagnoseExistingWorker({...target,...patch},{request:()=>assert.fail('No API request allowed')});
    assert.equal(report.status,'blocked');privateFree(report);
  }
  for(const timeoutMs of [0,-1,60001,NaN]) {
    const report=await diagnoseExistingWorker(target,{timeoutMs,request:()=>assert.fail('No API request allowed')});
    assert.equal(report.status,'blocked');assert.equal(report.code,'INVALID_TIMEOUT');privateFree(report);
  }
});

test('inspection refuses a stale production version and unknown settings without entering the write path',async()=>{
  for(const mutate of [mock=>{mock.state.latest=OTHER;},mock=>{mock.state.active=OTHER;},
    mock=>{mock.state.settings[SENTINEL]=true;}]) {
    const mock=mockCloudflare();mutate(mock);
    const report=await main(inspectEnv,{request:mock.request,read:()=>assert.fail('No file read allowed'),output:()=>{}});
    assert.equal(report.status,'diagnosed');assert.notEqual(report.code,'PREFLIGHT_VALID');
    assert.ok(mock.calls.every(call=>call.method==='GET'));assert.equal(writes(mock).length,0);privateFree(report);
  }
});

test('production snapshot remains rejected for publish until its explicit CI and artifact gates are approved',async()=>{
  for(const RELEASE_OPERATION of [undefined,'publish']) {
    const report=await main({...inspectEnv,RELEASE_OPERATION,LOCAL_UPLOAD_STOPPED:'true',
      TARGET_COMMIT:'75c22677ffc1fe2d939a2d422c27460afdeb6534',WORKER_PATH:'source/dist/server/index.js'},
    {read:()=>assert.fail('Unapproved source must not be read'),request:()=>assert.fail('No network allowed'),output:()=>{}});
    assert.equal(report.status,'blocked');assert.equal(report.code,'RELEASE_INPUT_REJECTED');privateFree(report);
  }
});

test('diagnostic output bounds array inspection and never traverses user values or field names',async()=>{
  const mock=mockCloudflare(),old=mock.state.versions.get(OLD);
  old.resources.bindings=Array.from({length:300},()=>({name:SENTINEL,type:'json',json:{[SENTINEL]:SENTINEL}}));
  const report=await diagnoseExistingWorker(config,{request:mock.request});
  const bindings=report.shapes.version.resources.bindings;
  assert.equal(bindings.items.length,256);assert.equal(bindings.truncated,true);
  assert.deepEqual(bindings.items[0].json,{value_type:'object'});
  assert.equal(report.code,'UNSUPPORTED_BINDINGS');assert.equal(writes(mock).length,0);privateFree(report);
});

test('independent diagnostic workflow references existing credentials and contains no release or source-build step',async()=>{
  const yaml=await readFile(new URL('../.github/workflows/cloudflare-readonly-diagnostics.yml',import.meta.url),'utf8');
  assert.match(yaml,/workflow_dispatch:/);assert.match(yaml,/contents: read/);
  assert.match(yaml,/environment: cloudflare-production/);
  assert.match(yaml,/group: haoduoyu-cloudflare-production/);assert.match(yaml,/cancel-in-progress: false/);
  assert.match(yaml,/RELEASE_OPERATION: inspect/);assert.match(yaml,/persist-credentials: false/);
  assert.match(yaml,/secrets\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(yaml,/pull_request_target|contents: write|actions: write|id-token:|npm |wrangler|curl |target_commit/);
  assert.equal((yaml.match(/^\s+run:/gm)||[]).length,1);
});


test('diagnostic metadata cannot collide with a documented type field',async()=>{
  const mock=mockCloudflare(),report=await diagnoseExistingWorker(config,{request:mock.request});
  const binding=report.shapes.version.resources.bindings.items[0];
  const exported=report.shapes.version.resources.script_runtime.exports.default;
  assert.equal(binding.value_type,'object');assert.deepEqual(binding.type,{value_type:'string'});
  assert.equal(exported.value_type,'object');assert.deepEqual(exported.type,{value_type:'string'});
  assert.equal(writes(mock).length,0);privateFree(report);
});
