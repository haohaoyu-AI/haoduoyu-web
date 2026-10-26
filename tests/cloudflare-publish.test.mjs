import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publishExistingWorker,versionSnapshot,main} from '../.github/scripts/cloudflare-publish.mjs';

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
  {expectedCurrentVersion:'latest'},{accountId:'../../../other'},{token:'bad\nheader'}])
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
