#!/usr/bin/env node
// Local CLI only. Dry-run never reads a token or calls fetch; apply is explicit.
import {pathToFileURL} from 'node:url';
import {readImportConfig} from './article-import/files.mjs';
import {buildImportPlan,proposalsForApply,ImportPlanError} from './article-import/plan.mjs';
import {applyImportBatch,validateImportOrigin,ImportApplyError} from './article-import/apply.mjs';

const usage='node scripts/article-import.mjs --config FILE --root DIRECTORY [--dry-run | --apply --confirm-apply --origin HTTPS_ORIGIN]';
function optionsFor(args) {
  const value={},flags=new Set(['--dry-run','--apply','--confirm-apply','--allow-loopback-http']);
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(Object.hasOwn(value,key)||!['--config','--root','--origin',...flags].includes(key))throw new ImportPlanError('ARGUMENTS_INVALID');
    if(flags.has(key))value[key]=true;
    else {if(!args[i+1]||args[i+1].startsWith('--'))throw new ImportPlanError('ARGUMENTS_INVALID');value[key]=args[++i];}
  }
  if(!value['--config']||!value['--root']||value['--apply']&&value['--dry-run'])throw new ImportPlanError('ARGUMENTS_INVALID');
  if(value['--apply']&&(!value['--confirm-apply']||!value['--origin']))throw new ImportPlanError('APPLY_CONFIRMATION_REQUIRED');
  if(!value['--apply']&&(value['--confirm-apply']||value['--allow-loopback-http']))throw new ImportPlanError('APPLY_FLAG_REQUIRED');
  return value;
}
function exitFor(result) {
  if(result.summary.failed)return 1;
  const apply=result.apply?.summary;
  return apply&&['failed','conflict','pending','not_attempted','verified_unknown'].some(key=>apply[key]>0)?1:0;
}
function redact(value,token) {
  if(typeof value==='string')return value.split(token).join('[REDACTED]');
  if(Array.isArray(value))return value.map(item=>redact(item,token));
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value)
    .map(([key,item])=>[key.split(token).join('[REDACTED]'),redact(item,token)]));
  return value;
}
export async function runImportCli(args,{env=process.env,fetchImpl=globalThis.fetch}={}) {
  const options=optionsFor(args),applying=options['--apply']===true;
  if(options['--origin'])validateImportOrigin(options['--origin'],{allowLoopbackHttp:options['--allow-loopback-http']===true});
  // Check explicit apply conditions before accessing source files or credentials.
  const source=await readImportConfig({path:options['--config']});
  if(source.issues.some(row=>row.severity==='error'||row.code==='CONFIG_MISSING'))throw new ImportPlanError('CONFIG_UNREADABLE');
  let config;try{config=JSON.parse(source.text.replace(/^\uFEFF/,''));}catch{throw new ImportPlanError('CONFIG_INVALID_JSON');}
  const plan=await buildImportPlan({root:options['--root'],config});
  if(!applying)return {result:plan,exitCode:exitFor(plan)};
  const token=env.HAODUOYU_IMPORT_TOKEN;
  if(typeof token!=='string'||!token)throw new ImportPlanError('APPLY_TOKEN_REQUIRED');
  const proposals=proposalsForApply(plan);
  const applied=await applyImportBatch({origin:options['--origin'],token,proposals,fetchImpl,
    allowLoopbackHttp:options['--allow-loopback-http']===true,limits:{maxEntries:50}});
  const result={...plan,mode:'apply',network:'explicit_target',apply:applied};
  // Transport reports are sanitized too; redact any accidental token substring
  // in business metadata without storing a persistent credential or raw response.
  return {result:redact(result,token),exitCode:exitFor(result)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv.slice(2).length===1&&process.argv[2]==='--help'){console.log(usage);}
    else {const {result,exitCode}=await runImportCli(process.argv.slice(2));console.log(JSON.stringify(result));process.exitCode=exitCode;}
  }catch(error){
    const code=error instanceof ImportPlanError||error instanceof ImportApplyError?error.code:'IMPORT_FAILED';
    console.error(JSON.stringify({error:{code}}));process.exitCode=1;
  }
}
