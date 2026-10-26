import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validateRequest,verifyWorker} from './release-policy.mjs';

// Stable API, not the beta /workers/workers API. Inherit resolves LATEST, not
// the deployed version. strict makes unresolved inherits fail instead of vanish:
// https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/
// Runtime limits/placement below match Cloudflare's official multipart builder:
// https://github.com/cloudflare/workers-sdk/blob/main/packages/deploy-helpers/src/deploy/helpers/create-worker-upload-form.ts
// Version upload does not change non-versioned settings, routes or triggers:
// https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/
const API='https://api.cloudflare.com/client/v4';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_RESPONSE_BYTES=2*1024*1024;
const own=(value,key)=>Object.hasOwn(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const canonical=value=>JSON.stringify(sort(value));
function sort(value) {
  if(Array.isArray(value))return value.map(sort);
  if(object(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));
  return value;
}
function check(condition,code,location) {if(!condition)throw new PublishFailure(code,location);}
function keys(value,allowed,location) {
  check(object(value)&&Object.keys(value).every(key=>allowed.includes(key)),'UNSUPPORTED_CONFIGURATION',location);
}
class PublishFailure extends Error {
  // Locations below are fixed source literals. Never include API key names,
  // binding values, server error messages or response bodies in public logs.
  constructor(code,location) {super(code);this.code=code;this.location=location;}
}
function identifier(value) {return typeof value==='string'&&UUID.test(value);}
function stringList(value) {return Array.isArray(value)&&value.every(item=>typeof item==='string');}

function bindingsSnapshot(bindings) {
  check(Array.isArray(bindings)&&bindings.length<=256,'UNSUPPORTED_BINDINGS');
  const names=new Set(),normalized=[];
  for(const binding of bindings) {
    check(object(binding)&&typeof binding.name==='string'&&/^[A-Za-z_$][\w$]{0,127}$/.test(binding.name),
      'UNSUPPORTED_BINDINGS');
    check(!names.has(binding.name),'UNSUPPORTED_BINDINGS');names.add(binding.name);
    if(binding.type==='plain_text') {
      keys(binding,['name','type','text'],'binding.plain_text.fields');check(typeof binding.text==='string','UNSUPPORTED_BINDINGS');
    }else if(binding.type==='json') {
      keys(binding,['name','type','json'],'binding.json.fields');check(own(binding,'json'),'UNSUPPORTED_BINDINGS');
    }else if(binding.type==='secret_text') {
      // The API intentionally cannot return secret values. Inherit by name/type;
      // never replace a redacted secret with an empty or dashboard-visible value.
      keys(binding,['name','type'],'binding.secret_text.fields');
    }else if(binding.type==='d1') {
      // Stable API renamed id to database_id; Wrangler still uses id. These
      // are the same existing database, never a request to provision/rebind it.
      // https://github.com/cloudflare/cloudflare-typescript/blob/main/src/resources/workers/scripts/script-and-version-settings.ts
      keys(binding,['name','type','id','database_id'],'binding.d1.fields');
      check((own(binding,'id')||own(binding,'database_id'))&&
        (!own(binding,'id')||identifier(binding.id))&&
        (!own(binding,'database_id')||identifier(binding.database_id))&&
        (!own(binding,'id')||!own(binding,'database_id')||binding.id===binding.database_id),
        'UNSUPPORTED_BINDINGS','binding.d1.identity');
      normalized.push({name:binding.name,type:'d1',id:binding.id??binding.database_id});continue;
    }else throw new PublishFailure('UNSUPPORTED_BINDINGS');
    normalized.push(binding);
  }
  return normalized.sort((a,b)=>a.name.localeCompare(b.name));
}
function runtimeSnapshot(runtime) {
  keys(runtime,['compatibility_date','compatibility_flags','usage_model','limits','exports','migration_tag'],'runtime.fields');
  // GET version also documents midnight UTC ISO, while upload uses a date.
  // Normalize only that exact representation; never infer dates or timezones.
  const date=runtime.compatibility_date;
  check(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}(?:T00:00:00Z)?$/.test(date)&&
    Number.isFinite(Date.parse(date.slice(0,10)))&&new Date(date.slice(0,10)).toISOString().slice(0,10)===date.slice(0,10),
    'UNSUPPORTED_CONFIGURATION','runtime.compatibility_date');
  if(own(runtime,'compatibility_flags'))check(stringList(runtime.compatibility_flags),'UNSUPPORTED_CONFIGURATION','runtime.compatibility_flags');
  if(own(runtime,'usage_model'))check(['bundled','unbound','standard'].includes(runtime.usage_model),
    'UNSUPPORTED_CONFIGURATION','runtime.usage_model');
  if(own(runtime,'limits')) {
    keys(runtime.limits,['cpu_ms'],'runtime.limits.fields');
    if(own(runtime.limits,'cpu_ms'))check(Number.isSafeInteger(runtime.limits.cpu_ms)&&runtime.limits.cpu_ms>0,
      'UNSUPPORTED_CONFIGURATION','runtime.limits.cpu_ms');
  }
  // This release never migrates or provisions Durable Objects/containers/assets.
  if(own(runtime,'migration_tag'))check(runtime.migration_tag==='', 'UNSUPPORTED_CONFIGURATION','runtime.migration_tag');
  if(own(runtime,'exports')) {
    check(object(runtime.exports),'UNSUPPORTED_CONFIGURATION','runtime.exports');
    for(const [name,entry] of Object.entries(runtime.exports)) {
      check(name==='default','UNSUPPORTED_CONFIGURATION','runtime.exports.names');
      keys(entry,['type','state','cache'],'runtime.exports.default.fields');
      check(entry.type==='worker'&&(!own(entry,'state')||entry.state==='created'),'UNSUPPORTED_CONFIGURATION','runtime.exports.default.type_state');
      if(own(entry,'cache')) {
        keys(entry.cache,['enabled'],'runtime.exports.default.cache.fields');
        check(typeof entry.cache.enabled==='boolean','UNSUPPORTED_CONFIGURATION','runtime.exports.default.cache.enabled');
      }
    }
  }
  return {...runtime,compatibility_date:date.slice(0,10)};
}
export function versionSnapshot(version,expectedId) {
  keys(version,['id','number','metadata','resources','annotations','startup_time_ms'],'version.fields');
  check(identifier(version.id)&&version.id===expectedId,'VERSION_MISMATCH');
  keys(version.resources,['bindings','script','script_runtime'],'version.resources.fields');
  const script=version.resources.script;
  keys(script,['etag','handlers','named_handlers','last_deployed_from','placement_mode'],'script.fields');
  check(typeof script.etag==='string'&&script.etag.length>0,'UNSUPPORTED_CONFIGURATION','script.etag');
  check(stringList(script.handlers)&&script.handlers.length===1&&script.handlers[0]==='fetch',
    'UNSUPPORTED_CONFIGURATION','script.handlers');
  if(own(script,'named_handlers'))check(Array.isArray(script.named_handlers)&&script.named_handlers.length===0,
    'UNSUPPORTED_CONFIGURATION','script.named_handlers');
  if(own(script,'placement_mode'))check(script.placement_mode==='smart','UNSUPPORTED_CONFIGURATION','script.placement_mode');
  const invariantScript={...script};
  // Content etag and uploader attribution change when the accepted bytes change.
  delete invariantScript.etag;delete invariantScript.last_deployed_from;
  return {bindings:bindingsSnapshot(version.resources.bindings),script:invariantScript,
    runtime:runtimeSnapshot(version.resources.script_runtime)};
}
function settingsSnapshot(settings) {
  // These settings are non-versioned and are NEVER sent in either write.
  keys(settings,['logpush','observability','tags','tail_consumers','streaming_tail_consumers'],'script_settings.fields');
  return settings;
}
function combinedSnapshot(settings,snapshot,nonversioned) {
  // /settings includes additional version options not promised by GET version.
  // https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/
  // Reject cache/migrations/targeted placement/new features instead of resetting
  // settings that this narrowly scoped publisher cannot fully verify.
  keys(settings,['annotations','bindings','compatibility_date','compatibility_flags','usage_model','limits','exports',
    'placement','logpush','observability','tags','tail_consumers','streaming_tail_consumers'],'combined_settings.fields');
  same(bindingsSnapshot(settings.bindings),snapshot.bindings);
  const runtimeKeys=['compatibility_date','compatibility_flags','usage_model','limits','exports'];
  const runtime=runtimeSnapshot({...snapshot.runtime,...Object.fromEntries(
    runtimeKeys.filter(key=>own(settings,key)).map(key=>[key,settings[key]]))});
  for(const key of runtimeKeys) {
    if(!own(settings,key))continue;
    if(own(snapshot.runtime,key))same(runtime[key],snapshot.runtime[key]);
  }
  if(own(settings,'placement')) {
    keys(settings.placement,['mode'],'combined_settings.placement.fields');
    check(settings.placement.mode==='smart','UNSUPPORTED_CONFIGURATION','combined_settings.placement.mode');
    check(snapshot.script.placement_mode==='smart','CONFIGURATION_CHANGED');
  }else check(!snapshot.script.placement_mode,'CONFIGURATION_CHANGED');
  for(const key of ['logpush','observability','tags','tail_consumers','streaming_tail_consumers'])
    if(own(settings,key)&&own(nonversioned,key))same(settings[key],nonversioned[key]);
  const invariant={...settings,...Object.fromEntries(runtimeKeys.filter(key=>own(settings,key))
    .map(key=>[key,runtime[key]])),bindings:bindingsSnapshot(settings.bindings)};
  delete invariant.annotations;return invariant;
}
function activeDeployment(result) {
  const deployment=result?.deployments?.[0];
  check(object(deployment)&&identifier(deployment.id)&&deployment.strategy==='percentage'&&
    Array.isArray(deployment.versions)&&deployment.versions.length===1&&
    deployment.versions[0].percentage===100&&identifier(deployment.versions[0].version_id),'ACTIVE_VERSION_MISMATCH');
  return {id:deployment.id,versionId:deployment.versions[0].version_id};
}
function latestVersion(result) {
  const version=result?.items?.[0];
  check(identifier(version?.id),'LATEST_VERSION_MISMATCH');return version.id;
}
async function boundedJSON(response) {
  check(response.body&&typeof response.body.getReader==='function','API_RESPONSE_INVALID');
  const length=response.headers.get('content-length');
  check(length===null||(/^\d+$/.test(length)&&Number(length)<=MAX_RESPONSE_BYTES),'API_RESPONSE_TOO_LARGE');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;check(size<=MAX_RESPONSE_BYTES,'API_RESPONSE_TOO_LARGE');chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch(error) {
    if(error instanceof PublishFailure)throw error;
    throw new PublishFailure('API_RESPONSE_INVALID');
  }finally {await reader.cancel().catch(()=>{});}
}
function client(config,request,timeoutMs) {
  const scripts=`/accounts/${config.accountId}/workers/scripts`,base=`${scripts}/${config.workerName}`;
  return async function api(path,{method='GET',body}={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await request(`${API}${path===''?scripts:base+path}`,{method,body,redirect:'error',signal:controller.signal,
        headers:{Authorization:`Bearer ${config.token}`,Accept:'application/json',
          ...(typeof body==='string'?{'Content-Type':'application/json'}:{})}});
      check(response.ok,`API_HTTP_${Number.isInteger(response.status)?response.status:0}`);
      const envelope=await boundedJSON(response);
      check(envelope?.success===true&&own(envelope,'result'),'API_RESPONSE_INVALID');
      return envelope.result;
    }catch(error) {
      if(error instanceof PublishFailure)throw error;
      throw new PublishFailure('API_TRANSPORT_UNCERTAIN');
    }finally {clearTimeout(timer);}
  };
}
async function readState(api,versionId) {
  const [deployments,versions,version,settings,combined,scripts]=await Promise.all([
    api('/deployments?per_page=1'),api('/versions?page=1&per_page=1'),api(`/versions/${versionId}`),
    api('/script-settings'),api('/settings'),api('')
  ]);
  return {deployments,versions,version,settings,combined,scripts};
}
function stateSnapshot({deployments,versions,version,settings,combined,scripts},versionId) {
  // Native assets need not have an ASSETS binding. Without a positive absence
  // proof, a code-only upload could detach them. Do not guess from repo files.
  // https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/
  check(Array.isArray(scripts),'ASSETS_ABSENCE_NOT_CONFIRMED');
  const matching=scripts.filter(script=>script?.id==='haoduoyu-prod');
  check(matching.length===1&&matching[0].has_assets===false,'ASSETS_ABSENCE_NOT_CONFIRMED');
  const snapshot=versionSnapshot(version,versionId),nonversioned=settingsSnapshot(settings);
  return {active:activeDeployment(deployments),latest:latestVersion(versions),
    version:snapshot,settings:nonversioned,combined:combinedSnapshot(combined,snapshot,nonversioned)};
}
async function state(api,versionId) {return stateSnapshot(await readState(api,versionId),versionId);}

// Diagnostic schemas are fixed field names only. Do not traverse user JSON,
// binding names, export names, annotations, tags, emails or server error bodies.
const runtimeShape={compatibility_date:true,compatibility_flags:[true],usage_model:true,
  limits:{cpu_ms:true,subrequests:true,memory_mb:true},migration_tag:true,
  exports:{default:{type:true,state:true,cache:{enabled:true}}},containers:true};
const bindingShape={name:true,type:true,id:true,database_id:true,text:true,json:true};
const settingsShape={logpush:true,observability:true,tags:true,tail_consumers:true,streaming_tail_consumers:true};
function fieldShape(value,schema=true) {
  const type=value===undefined?'missing':value===null?'null':Array.isArray(value)?'array':typeof value;
  const result={type};
  if(Array.isArray(schema)&&Array.isArray(value)) {
    result.items=value.slice(0,256).map(item=>fieldShape(item,schema[0]));
    result.truncated=value.length>256;
  }else if(object(schema)&&object(value)) {
    for(const [key,nested] of Object.entries(schema))result[key]=fieldShape(value[key],nested);
    result.unrecognized_field_count=Object.keys(value).filter(key=>!own(schema,key)).length;
  }
  return result;
}
function diagnosticShapes(raw) {
  return {
    version:fieldShape(raw.version,{id:true,number:true,metadata:true,annotations:true,startup_time_ms:true,
      resources:{bindings:[bindingShape],script:{etag:true,handlers:[true],named_handlers:true,
        last_deployed_from:true,placement_mode:true},script_runtime:runtimeShape}}),
    script_settings:fieldShape(raw.settings,settingsShape),
    combined_settings:fieldShape(raw.combined,{annotations:true,bindings:[bindingShape],...runtimeShape,
      placement:{mode:true},...settingsShape})
  };
}
export async function diagnoseExistingWorker(config,{request=fetch,timeoutMs=30000}={}) {
  const report={status:'blocked',code:'PREFLIGHT_FAILED'};
  try {
    validateConfig(config);
    check(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=60000,'INVALID_TIMEOUT');
    const api=client(config,request,timeoutMs),raw=await readState(api,config.expectedCurrentVersion);
    report.shapes=diagnosticShapes(raw);
    // Successful GET inspection is not a successful publish. The publisher is
    // never called in this mode, even when every preflight check passes.
    report.status='diagnosed';
    try {
      const snapshot=stateSnapshot(raw,config.expectedCurrentVersion);
      check(snapshot.active.versionId===config.expectedCurrentVersion&&snapshot.latest===config.expectedCurrentVersion,
        'CURRENT_VERSION_MISMATCH');
      report.code='PREFLIGHT_VALID';
    }catch(error) {
      report.code=error instanceof PublishFailure?error.code:'PREFLIGHT_FAILED';
      if(error instanceof PublishFailure&&error.location)report.check=error.location;
    }
  }catch(error) {report.code=error instanceof PublishFailure?error.code:'PREFLIGHT_FAILED';}
  return report;
}
function same(actual,expected,code='CONFIGURATION_CHANGED') {check(canonical(actual)===canonical(expected),code);}
function confirmBeforeWrite(observed,baseline,expectedLatest) {
  same(observed.active,baseline.active,'ACTIVE_VERSION_CHANGED');
  check(observed.latest===expectedLatest,'LATEST_VERSION_CHANGED');
  same(observed.version,baseline.version);same(observed.settings,baseline.settings);same(observed.combined,baseline.combined);
}
function uploadForm(bytes,snapshot,combined,targetCommit) {
  const metadata={main_module:'worker.mjs',bindings:snapshot.bindings.map(({name})=>({name,type:'inherit'})),
    compatibility_date:snapshot.runtime.compatibility_date,
    compatibility_flags:snapshot.runtime.compatibility_flags??combined.compatibility_flags??[],
    annotations:{'workers/commit_sha':targetCommit}};
  for(const key of ['usage_model','limits','exports']) {
    if(own(snapshot.runtime,key))metadata[key]=snapshot.runtime[key];
    else if(own(combined,key))metadata[key]=combined[key];
  }
  if(snapshot.script.placement_mode)metadata.placement={mode:snapshot.script.placement_mode};
  const form=new FormData();form.set('metadata',JSON.stringify(metadata));
  form.set('worker.mjs',new Blob([bytes],{type:'application/javascript+module'}),'worker.mjs');return form;
}
async function reconcile(api,report) {
  // A write may have reached Cloudflare even if its response was lost. Read only;
  // do not retry, delete an orphan, roll back, or infer that a retry would be safe.
  const reads=await Promise.allSettled([api('/versions?page=1&per_page=1'),api('/deployments?per_page=1')]);
  try {if(reads[0].status==='fulfilled')report.observed_latest_version_id=latestVersion(reads[0].value);}catch{}
  try {if(reads[1].status==='fulfilled')report.observed_active_version_id=activeDeployment(reads[1].value).versionId;}catch{}
}
function validateConfig(config) {
  check(/^[0-9a-f]{32}$/i.test(config.accountId??'')&&config.workerName==='haoduoyu-prod','INVALID_TARGET');
  check(identifier(config.expectedCurrentVersion),'INVALID_EXPECTED_VERSION');
  check(typeof config.token==='string'&&/^[\x21-\x7e]{1,1024}$/.test(config.token),'INVALID_TOKEN');
  check(/^[0-9a-f]{40}$/.test(config.targetCommit??''),'INVALID_COMMIT');
  check(Buffer.isBuffer(config.workerBytes)&&config.workerBytes.length>0&&config.workerBytes.length<=10*1024*1024,
    'INVALID_WORKER_BYTES');
  check(Number.isSafeInteger(config.expectedWorkerBytes)&&config.workerBytes.length===config.expectedWorkerBytes,
    'WORKER_BYTES_MISMATCH');
  const hash=createHash('sha256').update(config.workerBytes).digest('hex');
  check(/^[0-9a-f]{64}$/.test(config.expectedWorkerSha256??'')&&hash===config.expectedWorkerSha256,'WORKER_HASH_MISMATCH');
}
export async function publishExistingWorker(config,{request=fetch,timeoutMs=30000}={}) {
  const report={status:'blocked',code:'PREFLIGHT_FAILED'};let api,stage='preflight';
  try {
    validateConfig(config);
    check(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=60000,'INVALID_TIMEOUT');
    Object.assign(report,{worker_sha256:config.expectedWorkerSha256,target_commit:config.targetCommit,
      expected_version_id:config.expectedCurrentVersion});
    api=client(config,request,timeoutMs);
    const baseline=await state(api,config.expectedCurrentVersion);
    check(baseline.active.versionId===config.expectedCurrentVersion&&baseline.latest===config.expectedCurrentVersion,
      'CURRENT_VERSION_MISMATCH');
    const form=uploadForm(config.workerBytes,baseline.version,baseline.combined,config.targetCommit);
    // No CAS exists across Cloudflare's two APIs. Require stopped external
    // uploads, workflow concurrency, and another full read immediately before POST.
    confirmBeforeWrite(await state(api,config.expectedCurrentVersion),baseline,config.expectedCurrentVersion);
    stage='upload';
    const uploaded=await api('/versions?bindings_inherit=strict',{method:'POST',body:form});
    check(identifier(uploaded?.id)&&uploaded.id!==config.expectedCurrentVersion,'API_RESPONSE_INVALID');
    report.uploaded_version_id=uploaded.id;stage='verify_upload';
    same(versionSnapshot(await api(`/versions/${uploaded.id}`),uploaded.id),baseline.version);
    confirmBeforeWrite(await state(api,config.expectedCurrentVersion),baseline,uploaded.id);
    stage='deploy';
    const deployed=await api('/deployments',{method:'POST',body:JSON.stringify({strategy:'percentage',
      versions:[{version_id:uploaded.id,percentage:100}]})});
    check(identifier(deployed?.id),'DEPLOYMENT_RESPONSE_MISMATCH');
    const deployment={id:deployed.id,versionId:uploaded.id};
    report.deployment_id=deployment.id;
    const after=await state(api,uploaded.id);
    same(after.active,deployment,'DEPLOYMENT_NOT_CONFIRMED');check(after.latest===uploaded.id,'LATEST_VERSION_CHANGED');
    same(after.version,baseline.version);same(after.settings,baseline.settings);same(after.combined,baseline.combined);
    report.status='deployed';report.code='DEPLOYMENT_CONFIRMED';
  }catch(error) {
    report.code=error instanceof PublishFailure?error.code:'PUBLISH_FAILED';
    if(error instanceof PublishFailure&&error.location)report.check=error.location;
    if(stage==='upload'||stage==='deploy') {
      report.status='uncertain';report.write_stage=stage;await reconcile(api,report);
    }else if(stage==='verify_upload')report.status='uploaded_not_deployed';
  }
  return report;
}
export async function main(env=process.env,{request=fetch,read=readFile,output=console.log}={}) {
  let report;
  try {
    validateRequest(env);
    const operation=env.RELEASE_OPERATION??'publish';
    check(operation==='publish'||operation==='inspect','INVALID_OPERATION');
    check(env.WORKER_PATH==='source/dist/server/index.js','INVALID_WORKER_PATH');
    const workerBytes=await read(env.WORKER_PATH);verifyWorker(workerBytes,env.TARGET_COMMIT);
    const execute=operation==='inspect'?diagnoseExistingWorker:publishExistingWorker;
    report=await execute({accountId:env.CLOUDFLARE_ACCOUNT_ID,workerName:env.CLOUDFLARE_WORKER_NAME,
      expectedCurrentVersion:env.EXPECTED_CURRENT_VERSION,token:env.CLOUDFLARE_API_TOKEN,workerBytes,
      expectedWorkerSha256:env.EXPECTED_WORKER_SHA256,expectedWorkerBytes:Number(env.EXPECTED_WORKER_BYTES),
      targetCommit:env.TARGET_COMMIT},{request});
  }catch {report={status:'blocked',code:'RELEASE_INPUT_REJECTED'};}
  output(JSON.stringify(report));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().then(report=>{if(!['deployed','diagnosed'].includes(report.status))process.exitCode=1;}).catch(()=>{
    console.error('{"status":"blocked","code":"PUBLISH_FAILED"}');process.exitCode=1;
  });
