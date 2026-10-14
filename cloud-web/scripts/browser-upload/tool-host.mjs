import {uploadPublicErrors} from './public-errors.mjs';
const fixed=new Set([...uploadPublicErrors,
 'Unsupported upload bridge operation','Upload bridge scope differs from the owner-authorized task','Upload method differs from the fixed platform route','Target account mismatch','Browser request cannot supply credentials',
 'Exact inspected same-browser download handoff differs from the host scope','Inspected Word differs from the reserved handoff',
 'Exact owner unconsumed-recovery authorization missing','Exact original upload execution must be stopped and settled',
 'A platform bridge operation is still pending; do not repeat or overlap it.','Current execution lease lookup failed; retain state and reconcile.',
 'Current execution lease unavailable; preview exact owner recovery','Authenticated MCP response required','Unsafe unconsumed continuation response','Unsafe bridge response'
]);
const codes=new Set(['UPLOAD_OPERATION_FAILED','INVALID_ARGUMENT','PERMISSION_DENIED','UNAUTHENTICATED','NOT_FOUND','CONFLICT','INTERNAL','UNAVAILABLE','DEADLINE_EXCEEDED',
 'RPC_PARSE_ERROR','RPC_INVALID_REQUEST','RPC_METHOD_NOT_FOUND','RPC_INVALID_PARAMS','RPC_INTERNAL_ERROR']);
const rpcCodes=new Map([[-32700,'RPC_PARSE_ERROR'],[-32600,'RPC_INVALID_REQUEST'],[-32601,'RPC_METHOD_NOT_FOUND'],[-32602,'RPC_INVALID_PARAMS'],[-32603,'RPC_INTERNAL_ERROR']]);
const fallback='Authenticated upload operation failed; retain state and reconcile.';
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
const diagnosticStages=new Set(['bridge_guard_start','bridge_guard_failed','bridge_call_before','bridge_call_returned','bridge_call_failed','bridge_response_rejected','bridge_response_validated',
 'tool_mapping_missing','tool_call_before','tool_call_returned','tool_call_threw','tool_rpc_error','tool_connector_error','tool_result_error','tool_result_invalid','tool_result_decoded']);
// Fixed server phases are observations only. They never grant an import or
// carry the raw structured error, SQL, credentials or exception contents.
const serverDiagnosticStages=new Set(['attempt_read','request_credential_check','claim_check','word_output_check','baseline_credential_check','preflight_check','destination_check','attempt_insert','attempt_readback',
 'continuation_lineage_check','consume_token_check','editor_confirmation_check','claim_hash_check','file_confirmation_check','consume_query_check','consume_cas']);
const serverDiagnosticKinds=new Set(['database_expression_limit','database_parser_limit']);
const diagnosticShapes=new Set(['structured_content','content_json','content_text','json_rpc','connector_error','unknown']);
const diagnosticFields=new Set(['code','error_code','message','error','text','summary','isError','structuredContent','content']);
const envelopeKeys=new Set([...diagnosticFields,'jsonrpc','id','result']);
const errorSources=new Set([...diagnosticShapes,'exception','envelope']);
const valueSources=new Set([...errorSources,'none','multiple','conflict']);
const textKinds=new Set(['absent','json_object','json_other','plain_text','multiple','over_limit','uninspected']);
const structuredKinds=new Set(['absent','null','object','other']);
const errorFlags=new Set(['absent','true','false','other']);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function fixedServerDiagnostic(value,clean=()=>true){
 try{
  if(!record(value)||['stage','outcome','execute_import','next_action'].some(key=>!Object.hasOwn(value,key)))return null;
  const {stage,outcome,execute_import,next_action}=value;
  if(!serverDiagnosticStages.has(stage)||outcome!=='unconfirmed'||execute_import!==false||next_action!=='read_existing_record')return null;
  const hasKind=Object.hasOwn(value,'error_kind'),kind=hasKind?value.error_kind:undefined;
  if(hasKind&&!serverDiagnosticKinds.has(kind))return null;
  if([stage,outcome,next_action,...(hasKind?[kind]:[])].some(item=>!clean(item)))return null;
  return {stage,outcome,execute_import:false,next_action,...(hasKind?{error_kind:kind}:{})};
 }catch{return null;}
}
function serverDiagnosticFromToolError(error){
 try{return record(error)&&error.isError===true&&record(error.structuredContent)?fixedServerDiagnostic(error.structuredContent.diagnostic):null;}catch{return null;}
}
const errorPayload=value=>Object.hasOwn(value,'error_code')||(Object.hasOwn(value,'error')&&value.error!==null&&value.error!==undefined);
const freezeReceipt=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeReceipt);Object.freeze(value);}return value;};
const parseErrorText=value=>{if(typeof value!=='string'||value.length>16384)return null;try{const parsed=JSON.parse(value);return record(parsed)?parsed:null;}catch{return null;}};
function scanUploadError(error){
 const messages=[],foundCodes=[],fields=new Set(),seen=new Set();
 const visit=(value,depth=0)=>{
  if(depth>3)return;
  if(typeof value==='string'){if(fixed.has(value)||codes.has(value))messages.push(value);const parsed=parseErrorText(value);if(parsed)visit(parsed,depth+1);return;}
  if(!record(value)||seen.has(value))return;seen.add(value);
  for(const key of ['error_code','code'])if(Object.hasOwn(value,key)){fields.add(key);const code=value[key];if(codes.has(code))foundCodes.push(code);else if(rpcCodes.has(code))foundCodes.push(rpcCodes.get(code));}
  for(const key of ['message','error','text','summary'])if(typeof value[key]==='string'||record(value[key])){fields.add(key);visit(value[key],depth+1);}
  if(value.isError===true){fields.add('isError');if(Object.hasOwn(value,'structuredContent')&&value.structuredContent!==null&&value.structuredContent!==undefined){fields.add('structuredContent');visit(value.structuredContent,depth+1);}
   const blocks=Array.isArray(value.content)?value.content.filter(b=>b?.type==='text'&&typeof b.text==='string'):[];
   if(blocks.length===1){fields.add('content');visit(blocks[0].text,depth+1);}
  }
 };
 try{visit(error);}catch{/* Unknown getters/shapes cannot expose their errors. */}
 return {codes:[...new Set([...foundCodes,...messages.filter(message=>codes.has(message))])],summaries:[...new Set(messages.filter(message=>fixed.has(message)))],fields:[...fields].sort()};
}
function mergeUploadErrors(sources){
 const foundCodes=[...new Set(sources.flatMap(source=>source.codes))],summaries=[...new Set(sources.flatMap(source=>source.summaries))];
 const origin=key=>{const values=[...new Set(sources.flatMap(source=>source[key]))];if(values.length>1)return 'conflict';const origins=sources.filter(source=>source[key].length).map(source=>source.source);return origins.length>1?'multiple':origins[0]??'none';};
 const codeConflict=foundCodes.length>1,summaryConflict=summaries.length>1;
 return {code:foundCodes.length===1?foundCodes[0]:'UPLOAD_OPERATION_FAILED',summary:!codeConflict&&summaries.length===1?summaries[0]:fallback,
  fields:[...new Set(sources.flatMap(source=>source.fields))].sort(),error_sources:sources,code_source:origin('codes'),summary_source:origin('summaries'),code_conflict:codeConflict,summary_conflict:summaryConflict};
}
function uploadErrorDetails(error,source='exception'){
 try{
 if(record(error)&&error.isError===true){
  const sources=[];
  if(Object.hasOwn(error,'structuredContent')&&error.structuredContent!==null&&error.structuredContent!==undefined)sources.push({source:'structured_content',...scanUploadError(error.structuredContent)});
  const blocks=Array.isArray(error.content)?error.content.filter(block=>block?.type==='text'&&typeof block.text==='string'):[];
  if(blocks.length===1)sources.push({source:parseErrorText(blocks[0].text)?'content_json':'content_text',...scanUploadError(blocks[0].text)});
  // Connector fields, if present on the envelope itself, remain evidence too.
  const own={};for(const key of ['code','error_code','message','error','text','summary'])if(Object.hasOwn(error,key))own[key]=error[key];
  if(Object.keys(own).length)sources.unshift({source:'envelope',...scanUploadError(own)});
  return mergeUploadErrors(sources);
 }
 return mergeUploadErrors([{source,...scanUploadError(error)}]);
 }catch{return mergeUploadErrors([]);}
}
function uploadEnvelopeOutline(result){
 try{
 if(!record(result))return {};
 const keys=Object.keys(result),body=result.jsonrpc==='2.0'&&record(result.result)?result.result:result;
 const blocks=Array.isArray(body.content)?body.content.filter(block=>block?.type==='text'&&typeof block.text==='string'):[];
 const hasStructured=Object.hasOwn(body,'structuredContent'),structured=hasStructured&&body.structuredContent!==null&&body.structuredContent!==undefined;
 let text_kind=blocks.length===0?'absent':blocks.length>1?'multiple':'uninspected';
 // The successful structured result is authoritative. Its companion text is
 // never parsed for diagnostics, even if it happens to look like an error.
 if(blocks.length===1&&(!structured||body.isError===true)){
  if(blocks[0].text.length>16384)text_kind='over_limit';
  else try{text_kind=record(JSON.parse(blocks[0].text))?'json_object':'json_other';}catch{text_kind='plain_text';}
 }
 return {envelope_keys:keys.filter(key=>envelopeKeys.has(key)).sort(),other_keys_present:keys.some(key=>!envelopeKeys.has(key)),
  structured_kind:!hasStructured?'absent':body.structuredContent===null?'null':record(body.structuredContent)?'object':'other',text_kind,
  is_error:!Object.hasOwn(body,'isError')?'absent':body.isError===true?'true':body.isError===false?'false':'other'};
 }catch{return {};}
}
const knownSecrets=args=>['claim_token','delivery_token','execution_claim','consume_token'].map(key=>args?.[key]).filter(value=>typeof value==='string'&&value);
function emitUploadDiagnostic(callback,event,args){
 if(!diagnosticStages.has(event?.stage))return;
 const safe={stage:event.stage,...(diagnosticShapes.has(event.shape)?{shape:event.shape}:{}),...(Array.isArray(event.fields)?{fields:[...new Set(event.fields.filter(field=>diagnosticFields.has(field)))].sort()}:{} )};
 const secrets=knownSecrets(args),clean=value=>!secrets.some(secret=>value.includes(secret));
 if(event.stage==='tool_result_error'){
  try{const diagnostic=fixedServerDiagnostic(event.server_diagnostic,clean);if(diagnostic)safe.server_diagnostic=diagnostic;}catch{/* A poisoned observer cannot contribute a server diagnostic. */}
 }
 if(Array.isArray(event.envelope_keys))safe.envelope_keys=[...new Set(event.envelope_keys.filter(key=>envelopeKeys.has(key)))].sort();
 if(typeof event.other_keys_present==='boolean')safe.other_keys_present=event.other_keys_present;
 if(textKinds.has(event.text_kind))safe.text_kind=event.text_kind;
 if(structuredKinds.has(event.structured_kind))safe.structured_kind=event.structured_kind;
 if(errorFlags.has(event.is_error))safe.is_error=event.is_error;
 if(Array.isArray(event.error_sources))safe.error_sources=event.error_sources.filter(source=>errorSources.has(source?.source)).map(source=>({source:source.source,
  fields:[...new Set((Array.isArray(source.fields)?source.fields:[]).filter(field=>diagnosticFields.has(field)))].sort(),
  codes:[...new Set((Array.isArray(source.codes)?source.codes:[]).filter(code=>codes.has(code)&&clean(code)))],
  summaries:[...new Set((Array.isArray(source.summaries)?source.summaries:[]).filter(summary=>fixed.has(summary)&&clean(summary)))]}));
 for(const key of ['code_source','summary_source'])if(valueSources.has(event[key]))safe[key]=event[key];
 for(const key of ['code_conflict','summary_conflict'])if(typeof event[key]==='boolean')safe[key]=event[key];
 try{const pending=callback?.(safe);if(pending&&typeof pending.then==='function')Promise.resolve(pending).catch(()=>{});}catch{/* Diagnostics never interrupt, retry or authorize a call. */}
}
function uploadToolError(detail,args){
 let safe=summarizeUploadToolError(detail);
 const secrets=knownSecrets(args);
 if(secrets.some(secret=>safe.summary.includes(secret)||safe.code.includes(secret)))safe={code:'UPLOAD_OPERATION_FAILED',summary:fallback};
 return Object.assign(Error(safe.summary),{code:safe.code});
}
// Only fixed exact messages/codes. Raw error text/stack/body is never retained.
export function summarizeUploadToolError(error){
 const {code,summary}=uploadErrorDetails(error);return {code,summary};
}
export function unwrapUploadToolResponse(result,onDiagnostic){
 const mark=(stage,shape,detail)=>{const details=detail===undefined?null:uploadErrorDetails(detail,shape);emitUploadDiagnostic(onDiagnostic,{stage,shape,...(stage==='tool_result_error'?{server_diagnostic:serverDiagnosticFromToolError(detail)}:{}),...(details?{fields:details.fields,...(stage==='tool_result_error'||stage==='tool_connector_error'||stage==='tool_rpc_error'?{error_sources:details.error_sources,code_source:details.code_source,summary_source:details.summary_source,code_conflict:details.code_conflict,summary_conflict:details.summary_conflict}:{})}:{})});};
 const invalid=()=>{mark('tool_result_invalid','unknown');throw uploadToolError(null);};
 if(!record(result))return invalid();
 if(result.jsonrpc==='2.0'){
  if(Object.hasOwn(result,'error')){mark('tool_rpc_error','json_rpc',result.error);throw uploadToolError(result.error);}
  if(!record(result.result))return invalid();result=result.result;
 }
 if(errorPayload(result)){mark('tool_connector_error','connector_error',result);throw uploadToolError(result);}
 if(Object.hasOwn(result,'isError')&&typeof result.isError!=='boolean')return invalid();
 const blocks=Array.isArray(result.content)?result.content.filter(b=>b?.type==='text'&&typeof b.text==='string'):[];
 const structured=Object.hasOwn(result,'structuredContent')&&result.structuredContent!==undefined&&result.structuredContent!==null;
 if(result.isError===true){
  mark('tool_result_error',structured?'structured_content':blocks.length===1?(parseErrorText(blocks[0].text)?'content_json':'content_text'):'unknown',result);
  throw uploadToolError(result);
 }
 let parsed,shape;
 if(structured){if(!record(result.structuredContent))return invalid();parsed=result.structuredContent;shape='structured_content';}
 else{if(blocks.length!==1)return invalid();try{parsed=JSON.parse(blocks[0].text);}catch{return invalid();}if(!record(parsed))return invalid();shape='content_json';}
 if(errorPayload(parsed)){mark('tool_connector_error',shape,parsed);throw uploadToolError(parsed);}
 // A business result must not itself be an undecoded tool/RPC envelope. In
 // particular, raw JSON text containing a token cannot enter the clean journal.
 if(Object.hasOwn(parsed,'isError')||Object.hasOwn(parsed,'structuredContent')||parsed.jsonrpc==='2.0'||Array.isArray(parsed.content)&&parsed.content.some(block=>block?.type==='text'))return invalid();
 mark('tool_result_decoded',shape);
 return parsed;
}
// Explicit mapping must be to normal official authenticated tool functions supplied
// by the caller. No HTTP, alternate transport, credential persistence or retries.
export function createUploadToolCall(operations){
 return async(operation,args,onDiagnostic)=>{
  const diagnose=event=>emitUploadDiagnostic(onDiagnostic,event,args);
  if(typeof operations[operation]!=='function'){diagnose({stage:'tool_mapping_missing'});throw uploadToolError(null,args);}
  let result;diagnose({stage:'tool_call_before'});
  try{result=await operations[operation](args);}catch(error){const details=uploadErrorDetails(error);diagnose({stage:'tool_call_threw',fields:details.fields,error_sources:details.error_sources,code_source:details.code_source,summary_source:details.summary_source,code_conflict:details.code_conflict,summary_conflict:details.summary_conflict});throw uploadToolError(error,args);}
  diagnose({stage:'tool_call_returned',...uploadEnvelopeOutline(result)});
  try{return unwrapUploadToolResponse(result,diagnose);}catch(error){throw uploadToolError(error,args);}
 };
}
// This journal is volatile in this SAME live host. An emitted receipt can survive
// as non-secret evidence, but cannot recover a permit after the host ends.
export function createArticleUploadHost({bridge,emit,emitDiagnostic}){
 const journal=new Map();
 const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
 async function execute(operation_id,request){
  if(!validId(operation_id))throw Error('A non-secret operation UUID is required');
  // Snapshot before the first await: later caller changes must not alter the
  // operation while its receipt remains bound to the original request hash.
  const requestSnapshot=clone(request),requestSha=await digest(requestSnapshot),existing=journal.get(operation_id);
  if(existing){if(existing.request_sha256!==requestSha)throw Error('Host operation ID is bound to another request');await existing.promise;return clone(existing.receipt);}
  const entry={request_sha256:requestSha};journal.set(operation_id,entry);
  entry.promise=(async()=>{
   let result,error;const diagnostics=[];
   const diagnose=event=>emitUploadDiagnostic(safe=>{diagnostics.push(clone(safe));return emitDiagnostic?.({operation_id,...clone(safe)});},event);
   try{result=clone(await bridge(clone(requestSnapshot),diagnose));if(/"(?:claim_token|delivery_token|execution_claim|consume_token|cookie|authorization)"\s*:/i.test(JSON.stringify(result)))throw Error(fallback);}catch(failure){error=summarizeUploadToolError(failure);}
   // A rejected request's identity fields have not been scope-validated and
   // might contain a misplaced credential. Never echo them in an error receipt.
   const receipt={source:error?'actual_bridge_error':'actual_authenticated_bridge_response',operation_id,request_sha256:requestSha,received_at:new Date().toISOString(),diagnostics:clone(diagnostics),...(error?{outcome:'error',error}:{operation:requestSnapshot.operation,article_id:requestSnapshot.args?.article_id,platform:requestSnapshot.args?.platform??'toutiao',outcome:'response',response_sha256:await digest(result),result})};
   entry.receipt=freezeReceipt(receipt);
   // Emission/delivery errors never discard the already returned bridge result.
   try{if(typeof emit==='function')await emit(clone(receipt));}catch{entry.emission_failed=true;}
  })();
  await entry.promise;return clone(entry.receipt);
 }
 async function deliver(operation_id,accept){
  const entry=journal.get(operation_id);if(!entry)throw Error('Host receipt unavailable; read server state before continuation');
  await entry.promise;
  // Never deliver an object returned to a caller: each public view is a copy
  // and the authoritative receipt remains private to this live journal.
  const receipt=entry.receipt;
  if(receipt.outcome==='error')return clone(receipt);
  if(entry.delivery_pending||entry.delivered||entry.delivery_unknown)throw Error('Host receipt delivery is pending or already completed');
  entry.delivery_pending=true;
  try{
   // Only request/response handoff. The host cannot know if a failed receiving tool
   // ran acceptReserve/acceptConsume before losing its response; never auto-retry.
   const value=await accept(clone(receipt.result),clone(receipt));entry.delivered=true;return value;
  }catch{
   entry.delivery_unknown=true;
   return {status:'receipt_delivery_unknown',receipt:clone(receipt),automatic_retry_allowed:false,permit_persistence:false};
  }finally{entry.delivery_pending=false;}
 }
 return {execute,deliver,read:operation_id=>journal.get(operation_id)?.receipt?clone(journal.get(operation_id).receipt):null};
}
