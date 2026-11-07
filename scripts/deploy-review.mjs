import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,open,unlink,lstat,realpath,chmod} from 'node:fs/promises';
import {resolve,dirname,join,parse,relative,isAbsolute} from 'node:path';
import {tmpdir,homedir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {publishExistingWorker,versionSnapshot} from '../.github/scripts/cloudflare-publish.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const exec=promisify(execFile);
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const API='https://api.cloudflare.com/client/v4';
const usage='scripts/deploy-review.sh <full-commit> --expected-current-version <uuid> [--mode preflight|deploy] [--evidence-dir <private-directory-outside-git>]';
class ReviewFailure extends Error {constructor(code){super(code);this.code=code;}}
const check=(condition,code)=>{if(!condition)throw new ReviewFailure(code);};
const canonical=value=>JSON.stringify(sort(value));
function sort(value) {
  if(Array.isArray(value))return value.map(sort);
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));
  return value;
}

export function parseArgs(args) {
  if(args.length===1&&args[0]==='--help')return {help:true};
  const [commit,...rest]=args,options={commit,mode:'preflight'};
  check(/^[0-9a-f]{40}$/.test(commit??''),'FULL_COMMIT_REQUIRED');
  const seen=new Set();
  for(let i=0;i<rest.length;i+=2) {
    const key=rest[i],value=rest[i+1];
    check(['--expected-current-version','--mode','--evidence-dir'].includes(key)&&!seen.has(key)&&
      typeof value==='string'&&value.length>0&&!value.startsWith('--'),'INVALID_ARGUMENTS');
    seen.add(key);
    if(key==='--expected-current-version')options.expectedCurrentVersion=value;
    else if(key==='--mode')options.mode=value;
    else options.evidenceDir=value;
  }
  check(UUID.test(options.expectedCurrentVersion??''),'EXPECTED_CURRENT_VERSION_REQUIRED');
  check(['preflight','deploy'].includes(options.mode),'INVALID_MODE');
  return options;
}

async function git(args) {
  try{return (await exec('git',args,{cwd:root,windowsHide:true,maxBuffer:2*1024*1024})).stdout.trim();}
  catch{throw new ReviewFailure('GIT_CHECK_FAILED');}
}
async function verifyCheckout(commit) {
  check(await realpath(resolve(await git(['rev-parse','--show-toplevel'])))===await realpath(root),'REPOSITORY_ROOT_MISMATCH');
  check(await git(['rev-parse','HEAD'])===commit,'CHECKOUT_COMMIT_MISMATCH');
  check(await git(['status','--porcelain=v1','--untracked-files=all'])==='','CHECKOUT_NOT_CLEAN');
  check(await git(['ls-files','--stage']).then(text=>!text.split('\n').some(line=>line.startsWith('160000 '))),
    'SUBMODULES_NOT_SUPPORTED');
}

async function verifyWorker(commit) {
  await verifyCheckout(commit);
  // The existing check covers source pins, readable frontend, generated assets,
  // and their responses from the built Worker. It does not run the test suite.
  try {
    await exec(process.execPath,['scripts/check-artifacts.mjs'],{cwd:root,windowsHide:true,maxBuffer:2*1024*1024});
  }catch{throw new ReviewFailure('ARTIFACT_CHECK_FAILED');}
  let bytes,result;
  try {
    bytes=await readFile(join(root,'dist/server/index.js'));
    const {build}=await import('esbuild');
    result=await build({absWorkingDir:root,entryPoints:[join(root,'src/worker.mjs')],bundle:true,format:'esm',
      platform:'neutral',external:['node:*'],target:'es2022',outfile:join(root,'dist/server/index.js'),
      write:false,logLevel:'silent'});
  }catch{throw new ReviewFailure('WORKER_SOURCE_CHECK_FAILED');}
  check(result.outputFiles.length===1&&bytes.equals(Buffer.from(result.outputFiles[0].contents)),
    'STALE_WORKER_BUILD');
  check(bytes.length>0&&bytes.length<=10*1024*1024,'INVALID_WORKER_BYTES');
  await verifyCheckout(commit);
  return bytes;
}

async function tokenFromExistingLogin(env) {
  if(env.CLOUDFLARE_API_TOKEN)return env.CLOUDFLARE_API_TOKEN;
  const candidates=env.WRANGLER_OAUTH_FILE?[resolve(env.WRANGLER_OAUTH_FILE)]:[
    ...(env.APPDATA?[join(env.APPDATA,'xdg.config','.wrangler','config','default.toml')]:[]),
    join(env.XDG_CONFIG_HOME||join(homedir(),'.config'),'.wrangler','config','default.toml'),
    join(homedir(),'.wrangler','config','default.toml')
  ];
  for(const path of [...new Set(candidates)]) {
    let text;
    try{text=await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw new ReviewFailure('OAUTH_READ_FAILED');}
    const token=text.match(/^\s*oauth_token\s*=\s*"([\x21-\x7e]+)"\s*$/m)?.[1];
    const expiration=text.match(/^\s*expiration_time\s*=\s*"([^"]+)"\s*$/m)?.[1];
    check(token&&!token.includes('"')&&!token.includes('\\'),'EXISTING_OAUTH_INVALID');
    if(expiration)check(Number.isFinite(Date.parse(expiration))&&Date.parse(expiration)>Date.now(),'EXISTING_OAUTH_EXPIRED');
    return token;
  }
  throw new ReviewFailure('EXISTING_CREDENTIAL_REQUIRED');
}

async function outsideGit(path) {
  // Resolve existing ancestors too, so a symlink cannot place backups in Git.
  let ancestor=resolve(path),suffix=[];
  for(;;) {
    try{ancestor=await realpath(ancestor);break;}
    catch(error){check(error.code==='ENOENT','EVIDENCE_PATH_INVALID');suffix.unshift(parse(ancestor).base);
      const parent=dirname(ancestor);check(parent!==ancestor,'EVIDENCE_PATH_INVALID');ancestor=parent;}
  }
  const resolved=resolve(ancestor,...suffix),repository=await realpath(root),rel=relative(repository,resolved);
  check(rel!==''&&(rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel)),
    'EVIDENCE_INSIDE_GIT');
  for(let current=resolved;;current=dirname(current)) {
    try{await lstat(join(current,'.git'));throw new ReviewFailure('EVIDENCE_INSIDE_GIT');}
    catch(error){if(error instanceof ReviewFailure)throw error;check(error.code==='ENOENT','EVIDENCE_PATH_INVALID');}
    if(dirname(current)===current)break;
  }
  return resolved;
}

async function makePrivateDirectory(path) {
  await mkdir(path,{recursive:true,mode:0o700});
  check(!(await lstat(path)).isSymbolicLink(),'EVIDENCE_PATH_INVALID');
  // Inherit the operator's existing Windows directory ACL. A release must not
  // change local permission settings; use the current user's private temp path
  // by default, or an already-private destination selected by the operator.
  if(process.platform!=='win32')await chmod(path,0o700);
}

export async function readRemoteSnapshot(config,{request=fetch}={}) {
  const base=`${API}/accounts/${config.accountId}/workers/scripts/${config.workerName}`;
  async function get(path) {
    let response;
    try{response=await request(base+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{Authorization:`Bearer ${config.token}`,Accept:'application/json'}});}
    catch{throw new ReviewFailure('PREFLIGHT_TRANSPORT_FAILED');}
    check(response.ok,'PREFLIGHT_API_FAILED');
    // Bound response data without ever exposing Cloudflare response bodies.
    const chunks=[];let size=0;
    try {
      for await(const chunk of response.body) {
        size+=chunk.byteLength;check(size<=2*1024*1024,'PREFLIGHT_RESPONSE_TOO_LARGE');chunks.push(chunk);
      }
      const envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      check(envelope?.success===true&&Object.hasOwn(envelope,'result'),'PREFLIGHT_RESPONSE_INVALID');
      return envelope.result;
    }catch(error){if(error instanceof ReviewFailure)throw error;throw new ReviewFailure('PREFLIGHT_RESPONSE_INVALID');}
  }
  const [deployments,versions,currentVersion,scriptSettings,settings]=await Promise.all([
    get('/deployments?per_page=1'),get('/versions?page=1&per_page=100'),get(`/versions/${config.expectedCurrentVersion}`),
    get('/script-settings'),get('/settings')
  ]);
  const active=deployments?.deployments?.[0];
  check(UUID.test(active?.id??'')&&active.strategy==='percentage'&&active.versions?.length===1&&
    active.versions[0].percentage===100&&active.versions[0].version_id===config.expectedCurrentVersion,
    'CURRENT_VERSION_MISMATCH');
  check(versions?.items?.[0]?.id===config.expectedCurrentVersion,'LATEST_VERSION_MISMATCH');
  try{versionSnapshot(currentVersion,config.expectedCurrentVersion);}catch{throw new ReviewFailure('UNSUPPORTED_CURRENT_VERSION');}
  return {deployments,versions,currentVersion,scriptSettings,settings};
}

export async function main(args=process.argv.slice(2),env=process.env,{output=console.log,request=fetch}={}) {
  let evidenceDir,lockPath,lock,report,options;
  try {
    options=parseArgs(args);
    if(options.help){output(usage);return {status:'help'};}
    const accountId=env.CLOUDFLARE_ACCOUNT_ID,workerName=env.CLOUDFLARE_WORKER_NAME||'haoduoyu-prod';
    check(/^[0-9a-f]{32}$/i.test(accountId??'')&&workerName==='haoduoyu-prod','INVALID_TARGET');
    if(options.mode==='deploy')check(env.LOCAL_UPLOAD_STOPPED==='true','EXCLUSIVE_RELEASE_HANDOFF_REQUIRED');
    // Fail before credentials or API reads if HEAD, artifacts or source differ.
    const bytes=await verifyWorker(options.commit),hash=createHash('sha256').update(bytes).digest('hex');
    const privateRoot=await outsideGit(join(tmpdir(),'haoduoyu-release'));
    const requested=options.evidenceDir?await outsideGit(resolve(options.evidenceDir)):
      join(privateRoot,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());
    await makePrivateDirectory(privateRoot);
    lockPath=join(privateRoot,`${accountId}-${workerName}.lock`);
    try{lock=await open(lockPath,'wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));}
    catch{throw new ReviewFailure('RELEASE_LOCKED');}
    try{await lstat(requested);throw new ReviewFailure('EVIDENCE_DIRECTORY_EXISTS');}
    catch(error){if(error instanceof ReviewFailure)throw error;check(error.code==='ENOENT','EVIDENCE_PATH_INVALID');}
    await makePrivateDirectory(requested);evidenceDir=await realpath(requested);
    const token=await tokenFromExistingLogin(env);
    check(typeof token==='string'&&/^[\x21-\x7e]{1,1024}$/.test(token),'INVALID_CREDENTIAL');
    const config={accountId,workerName,token,expectedCurrentVersion:options.expectedCurrentVersion,
      targetCommit:options.commit,workerBytes:bytes,expectedWorkerBytes:bytes.length,expectedWorkerSha256:hash};
    const before=await readRemoteSnapshot(config,{request});
    await writeFile(join(evidenceDir,'cloudflare-before.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx',mode:0o600});
    const metadata={target_commit:options.commit,expected_version_id:options.expectedCurrentVersion,
      worker_sha256:hash,worker_bytes:bytes.length,mode:options.mode,evidence_dir:evidenceDir};
    await writeFile(join(evidenceDir,'release-input.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx',mode:0o600});
    await verifyCheckout(options.commit);
    check(canonical(await readRemoteSnapshot(config,{request}))===canonical(before),'PREFLIGHT_STATE_CHANGED');
    if(options.mode==='preflight')report={status:'preflight_ok',code:'NO_WRITE_PERFORMED',...metadata};
    else report={...await publishExistingWorker(config,{request}),...metadata};
    await writeFile(join(evidenceDir,'release-result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  }catch(error) {
    // A local evidence write failure must never hide a confirmed/uncertain
    // Cloudflare write behind a misleading "blocked" result.
    report=report?{...report,evidence_error:'RESULT_RECORD_FAILED'}:
      {status:'blocked',code:error instanceof ReviewFailure?error.code:'RELEASE_CHECK_FAILED',
        ...(evidenceDir?{evidence_dir:evidenceDir}:{})};
  }finally {
    if(lock){await lock.close().catch(()=>{});await unlink(lockPath).catch(()=>{});}
  }
  output(JSON.stringify(report));return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().then(report=>{if(!['deployed','preflight_ok','help'].includes(report.status))process.exitCode=1;}).catch(()=>{
    console.error('{"status":"blocked","code":"RELEASE_CHECK_FAILED"}');process.exitCode=1;
  });
