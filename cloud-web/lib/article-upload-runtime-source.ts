import {articleUploadRuntime,articleUploadRuntimeVersion,uploadRuntimeSource} from './article-upload-runtime';
import {draftTransferVersion,nativeStepParentVersion} from './article-draft-transfer';
import {COMPLETE_CALL_BUDGET,COMPLETE_CALL_BUDGET_REVISION} from '../scripts/browser-upload/coordinate/src/complete-call-budget.js';
import runner from '../scripts/browser-upload/private-draft-executor.mjs?raw';
import bridge from '../scripts/browser-upload/bridge.mjs?raw';
import host from '../scripts/browser-upload/tool-host.mjs?raw';
import errors from '../scripts/browser-upload/public-errors.mjs?raw';
import nativeHost from '../scripts/browser-upload/coordinate/host-program.mjs?raw';
import nativeParent from '../scripts/browser-upload/coordinate/parent-program.mjs?raw';

const actualCompleteCallBudget=Object.freeze({strict_max_utf8_bytes:COMPLETE_CALL_BUDGET.strict_max_utf8_bytes,component_max_utf8_bytes:{definition:COMPLETE_CALL_BUDGET.definition_max_utf8_bytes,adapter:COMPLETE_CALL_BUDGET.adapter_max_utf8_bytes,initialization:COMPLETE_CALL_BUDGET.initialization_max_utf8_bytes},planned_transport_reserve_utf8_bytes:COMPLETE_CALL_BUDGET.planned_transport_reserve_utf8_bytes,planned_transport_reserve_is_hard_limit:false,internal_budget_revision:COMPLETE_CALL_BUDGET_REVISION,measurement_entrypoint:'measureCompleteCallBudget',parent_memory_only:true,actual_adapter_initialization_arguments_and_wrapper_required:true});

export const uploadRuntimeChunkCharacters=24000;
export const nativeCoordinateVersion=draftTransferVersion;
export const nativeParentVersion=nativeStepParentVersion;
type LegacyModule='runner'|'bridge';
type NativeModule='native_coordinate'|'native_parent';
export type UploadRuntimeModule=LegacyModule|NativeModule;
export const nativeCoordinateBudgets=Object.freeze({
 native_coordinate:Object.freeze({max_source_utf8_bytes:COMPLETE_CALL_BUDGET.definition_max_utf8_bytes,max_json_quoted_utf8_bytes:COMPLETE_CALL_BUDGET.strict_max_utf8_bytes,planned_transport_reserve_utf8_bytes:COMPLETE_CALL_BUDGET.planned_transport_reserve_utf8_bytes,planned_transport_reserve_is_hard_limit:false,internal_budget_revision:COMPLETE_CALL_BUDGET_REVISION,reserved_call_utf8_bytes:0,environment:'documented_host_native_step_session',budget_kind:'definition_packaging_only'}),
 // This is a source-transport bound, NOT an execution allowance or a CUA limit.
 native_parent:Object.freeze({max_source_utf8_bytes:262144,max_json_quoted_utf8_bytes:270000,reserved_call_utf8_bytes:0,environment:'authenticated_parent_memory_only',budget_kind:'source_transport_only'}),
});
export function uploadRuntimeModule(value:unknown):value is UploadRuntimeModule{return value==='runner'||value==='bridge'||value==='native_coordinate'||value==='native_parent';}
export function uploadRuntimeModuleVersion(runtimeModule:UploadRuntimeModule){return runtimeModule==='runner'||runtimeModule==='bridge'?articleUploadRuntimeVersion:runtimeModule==='native_parent'?nativeParentVersion:nativeCoordinateVersion;}
const sources={runner,bridge,host,errors};
const nativeSources={native_coordinate:nativeHost,native_parent:nativeParent};
const nativeEntrypoints=Object.freeze({
 native_coordinate:Object.freeze(['createNativeStepSession']),
 native_parent:Object.freeze(['createPrivateDraftTransfer','createParentNativeStepBridge','createParentImportGate','createTrackedParentObservations','composeCompleteOrdinaryCode','measureCompleteCallBudget']),
});
const compiled=new Map<UploadRuntimeModule,Promise<Readonly<{source:string;sha256:string;size:number}>>>();
async function sha256(bytes:Uint8Array){
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))).map(value=>value.toString(16).padStart(2,'0')).join('');
}
export function nativeCoordinateSource(runtimeModule:NativeModule,raw:string){
 // Complete ordinary definitions only. Removing static exports prepares source
 // data; it never loads, evaluates, encodes or executes a platform operation.
 const definition=raw.replace(/^export (?=(?:async )?(?:function|const))/gm,'').replace(/^export\s*\{[^}]*\};?\s*$/gm,'');
 if(/^\s*(?:import|export)\b/m.test(definition))throw Error('Native coordinate source is not a complete standalone definition program');
 const source=definition+'\n'+nativeEntrypoints[runtimeModule].map(name=>`Object.defineProperty(${name},'runtimeVersion',{value:${JSON.stringify(uploadRuntimeModuleVersion(runtimeModule))}});`).join('\n')+'\n';
 const budget=nativeCoordinateBudgets[runtimeModule];
 if(new TextEncoder().encode(source).length>budget.max_source_utf8_bytes||new TextEncoder().encode(JSON.stringify(source)).length>budget.max_json_quoted_utf8_bytes)throw Error('Native definition exceeds its complete-program source budget; no execution or picker is authorized');
 return source;
}
export function currentUploadRuntimeSource(runtimeModule:UploadRuntimeModule){
 if(!uploadRuntimeModule(runtimeModule))throw Error('Unknown upload runtime module');
 let result=compiled.get(runtimeModule);
 if(!result){
  result=(async()=>{const source=runtimeModule==='runner'||runtimeModule==='bridge'?uploadRuntimeSource(runtimeModule,sources):nativeCoordinateSource(runtimeModule,nativeSources[runtimeModule]),bytes=new TextEncoder().encode(source);return Object.freeze({source,sha256:await sha256(bytes),size:bytes.length});})();
  compiled.set(runtimeModule,result);
  result.catch(()=>{if(compiled.get(runtimeModule)===result)compiled.delete(runtimeModule);});
 }
 return result;
}
export async function currentUploadRuntimeContract(){
 const [runner,bridge]=await Promise.all([currentUploadRuntimeSource('runner'),currentUploadRuntimeSource('bridge')]);
 return {...articleUploadRuntime,modules:{
  runner:{...articleUploadRuntime.modules.runner,sha256:runner.sha256,size:runner.size},
  bridge:{...articleUploadRuntime.modules.bridge,sha256:bridge.sha256,size:bridge.size},
 },native_source_modules:await currentNativeCoordinateContract()};
}
export async function currentNativeCoordinateContract(){
 const [coordinate,parent]=await Promise.all([currentUploadRuntimeSource('native_coordinate'),currentUploadRuntimeSource('native_parent')]);
 const descriptor=(runtimeModule:NativeModule,value:Readonly<{sha256:string;size:number}>)=>({module:runtimeModule,version:uploadRuntimeModuleVersion(runtimeModule),read_tool:'read_article_upload_runtime',download_path:'/api/articles/upload-runtime?module='+runtimeModule,source_format:'standalone_js',sha256:value.sha256,size:value.size,complete_program:true,read_only:true,execute_import:false,entrypoints:nativeEntrypoints[runtimeModule],execution_environment:nativeCoordinateBudgets[runtimeModule].environment,parent_memory_only:runtimeModule==='native_parent',cua_submission_prohibited:runtimeModule==='native_parent',cua_execution_authorized:false,project_budget:nativeCoordinateBudgets[runtimeModule],...(runtimeModule==='native_coordinate'?{contains_parent_business:false,contains_private_baseline:false,auxiliary_source_only:true,second_execution_pipeline:false,actual_complete_call_budget:actualCompleteCallBudget}:{}),complete_call_budget_verified:false,current_official_host_acceptance_required:true,source_is_not_approval:true,installed_or_platform_verified:false});
 return {native_coordinate:descriptor('native_coordinate',coordinate),native_parent:descriptor('native_parent',parent)};
}

// articleCall verifies the authenticated owner's article before entering here.
// These immutable definition sources contain no credentials or execution grants.
export async function readUploadRuntimeSource(articleId:string,args:Record<string,unknown>){
 const allowed=['article_id','module','expected_version','expected_sha256','offset','metadata_only'];
 if(Reflect.ownKeys(args).some(key=>typeof key!=='string'||!allowed.includes(key))||args.article_id!==articleId
  ||!uploadRuntimeModule(args.module)||args.expected_version!==uploadRuntimeModuleVersion(args.module)
  ||args.metadata_only!==undefined&&typeof args.metadata_only!=='boolean')throw Error('Upload runtime scope or version changed; reread the handoff');
 const offset=args.offset===undefined?0:args.offset;
 if(typeof offset!=='number'||!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid upload runtime source offset');
 const runtimeModule=args.module as UploadRuntimeModule,{source,sha256:fullSha,size}=await currentUploadRuntimeSource(runtimeModule);
 if(offset>source.length||offset>0&&typeof args.expected_sha256!=='string'
  ||args.expected_sha256!==undefined&&args.expected_sha256!==fullSha)throw Error('Upload runtime source changed; reread the handoff');
 if(runtimeModule==='native_coordinate'||runtimeModule==='native_parent'){
  if(offset!==0)throw Error('Native definition reads return one complete program; execution fragments are not supported');
  const parentOnly=runtimeModule==='native_parent';
  return {article_id:articleId,module:runtimeModule,version:uploadRuntimeModuleVersion(runtimeModule),source_format:'standalone_js',read_only:true,execute_import:false,
   metadata_only:args.metadata_only===true,sha256:fullSha,size,total_characters:source.length,complete:true,complete_program:true,
   entrypoint:parentOnly?'createParentNativeStepBridge':'createNativeStepSession',entrypoints:nativeEntrypoints[runtimeModule],
   execution_environment:nativeCoordinateBudgets[runtimeModule].environment,parent_memory_only:parentOnly,cua_submission_prohibited:parentOnly,cua_execution_authorized:false,
   project_budget:nativeCoordinateBudgets[runtimeModule],...(!parentOnly?{contains_parent_business:false,contains_private_baseline:false,auxiliary_source_only:true,second_execution_pipeline:false,actual_complete_call_budget:actualCompleteCallBudget}:{}),complete_call_budget_verified:false,current_official_host_acceptance_required:true,source_is_not_approval:true,installed_or_platform_verified:false,
   ...(args.metadata_only===true?{}:{source_text:source}),
   instruction:parentOnly
    ? 'Complete read-only parent-memory definitions for business core, original attempt gate, native-step parent proxy, full private acceptance and complete-call measurement. Never send this program, parent credentials, raw claims, reservation/consume responses, private baseline or grants to CUA. The source-transport bound is not an execution allowance. Authenticate the same original consumed/saving chain in parent memory before issuing a normal retained native-session command. A source read, version, size or SHA grants no action, upload, retry or approval.'
    : 'Auxiliary complete small native step definitions from the same host program as primary read_article_delivery_executor, not a second execution pipeline. Install the definitions only once in the retained original session. No business core, parent gate, MCP, private baseline, model callback or parent authorization callback belongs in CUA. Definition packaging is at most 28000 raw bytes under the revised internal policy; metadata preserves the earlier 24101-byte rejection against 24000. The 8000-byte transport reserve is a plan, not a hard limit or proof. Actual complete ordinary code and whole JSON tool request plus known wrapper must fit strict 64000 after measuring actual adapter, initialization and tool arguments in parent memory. Missing input/capability/budget stops. Capture ends with its actual image before external model review; later retained-session readiness calls read current context/frame and end with ready before a separate single physical commit after parent cancellation/current-authority checks, returning native_pending. Do not compress, encode, execute source fragments, dynamically load or switch tools after rejection. Source checks do not prove installation, picker readiness, saving or approval.'};
 }
 if(args.metadata_only===true){
  if(offset!==0)throw Error('Metadata reads require the initial source offset');
  return {article_id:articleId,module:runtimeModule,version:articleUploadRuntimeVersion,source_format:'standalone_js',read_only:true,execute_import:false,
   metadata_only:true,sha256:fullSha,size,total_characters:source.length,
   entrypoint:runtimeModule==='runner'?'createPrivateDraftExecutor':'createArticleUploadBridge',
   instruction:'This is metadata only. Verify already-downloaded actual UTF-8 bytes against this SHA/size/version before loading. No file or platform submission is authorized.'};
 }
 if(offset>0&&offset<source.length&&/[\uDC00-\uDFFF]/.test(source[offset])&&/[\uD800-\uDBFF]/.test(source[offset-1]))throw Error('Invalid upload runtime source boundary');
 let end=Math.min(offset+uploadRuntimeChunkCharacters,source.length);
 if(end<source.length&&/[\uD800-\uDBFF]/.test(source[end-1])&&/[\uDC00-\uDFFF]/.test(source[end]))end++;
 const sourceText=source.slice(offset,end);
 return {article_id:articleId,module:runtimeModule,version:articleUploadRuntimeVersion,source_format:'standalone_js',read_only:true,execute_import:false,
  sha256:fullSha,size,offset,offset_unit:'javascript_utf16_code_units',total_characters:source.length,
  source_text:sourceText,chunk_sha256:await sha256(new TextEncoder().encode(sourceText)),next_offset:end<source.length?end:null,complete:end===source.length,
  entrypoint:runtimeModule==='runner'?'createPrivateDraftExecutor':'createArticleUploadBridge',
  instruction:'Source pagination is transport only. Concatenate the exact source_text values in offset order and verify each chunk SHA and the full UTF-8 SHA/size/version. Submit the complete independent definition program once through the documented host JS entry only after checking its entire call byte budget. A read or a small payload is not host approval. Never split execution, encode source, use an undocumented loader or retry rejected code through another tool. This read grants no browser action or upload permission.'};
}
