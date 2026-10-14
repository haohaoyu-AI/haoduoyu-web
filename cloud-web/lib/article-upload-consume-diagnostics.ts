import {workflowPublicError} from './workflow-errors';

// These phases describe server work; they are never upload permissions or raw
// exception contents. Only a fixed phase and recognized database-limit category
// are retained in the WeakMap.
export const consumeUploadStages=[
 'attempt_read','request_credential_check','claim_check',
 'continuation_lineage_check','consume_token_check','editor_confirmation_check',
 'claim_hash_check','file_confirmation_check','word_output_check',
 'consume_query_check','consume_cas','attempt_readback',
] as const;
export type ConsumeUploadStage=typeof consumeUploadStages[number];
export type ConsumeUploadErrorKind='database_expression_limit'|'database_parser_limit';
const stages=new Set<string>(consumeUploadStages);
const fallback='交付状态未确认，请只读取已有结果';
type FixedDiagnostic={stage:ConsumeUploadStage;error_kind?:ConsumeUploadErrorKind};
const diagnostics=new WeakMap<object,FixedDiagnostic>();

function fixedStage(stage:ConsumeUploadStage):ConsumeUploadStage {
 return stages.has(stage)?stage:'attempt_read';
}
function safeMessage(error:unknown):string {
 try{return workflowPublicError(error,fallback);}catch{return fallback;}
}
function databaseErrorKind(error:unknown):ConsumeUploadErrorKind|undefined {
 try{
  const message=error&&typeof error==='object'&&'message' in error?error.message:undefined;
  if(typeof message!=='string')return;
  if(message.includes('Expression tree is too large'))return 'database_expression_limit';
  if(message.includes('parser stack overflow'))return 'database_parser_limit';
 }catch{/* Uninspectable errors cannot contribute diagnostic data. */}
}

export function consumeUploadDiagnosticError(error:unknown,stage:ConsumeUploadStage):Error {
 const publicError=new Error(safeMessage(error));
 const kind=databaseErrorKind(error);
 diagnostics.set(publicError,{stage:fixedStage(stage),...(kind?{error_kind:kind}:{})});
 return publicError;
}
export function consumeUploadPublicDiagnostic(error:unknown) {
 const diagnostic=error&&typeof error==='object'?diagnostics.get(error):undefined;
 return diagnostic?{...diagnostic,outcome:'unconfirmed' as const,execute_import:false as const,next_action:'read_existing_record' as const}:null;
}

export type ConsumeUploadProbeCheck={stage:ConsumeUploadStage;run:()=>unknown|Promise<unknown>};
export type ConsumeUploadProbeResult={stage:ConsumeUploadStage;outcome:'verified'|'unconfirmed';safe_error?:string;error_kind?:ConsumeUploadErrorKind};

// Callers supply independent read-only checks. Successful return values and raw
// failures are discarded; a failed check does not prevent the remaining reads.
export async function probeConsumeUpload(checks:readonly ConsumeUploadProbeCheck[]):Promise<ConsumeUploadProbeResult[]> {
 return Promise.all(checks.map(async check=>{
  const stage=fixedStage(check.stage);
  if(!stages.has(check.stage))return {stage,outcome:'unconfirmed' as const,safe_error:fallback};
  try{
   await check.run();
   return {stage,outcome:'verified' as const};
  }catch(error){const kind=databaseErrorKind(error);return {stage,outcome:'unconfirmed' as const,safe_error:safeMessage(error),...(kind?{error_kind:kind}:{})};}
 }));
}
