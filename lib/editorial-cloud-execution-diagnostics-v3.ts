import {bindingCheckDiagnostic,bindingCheckStages,bindingCheckCodes} from './editorial-binding-diagnostics';

/** Trusted local observations only. Nothing from request/model JSON is a
 * diagnostic, and no message, stack, nonce, header or body is projected. */
export const editorialCloudExecutionPhases=['delegation_read','existing_attempt_read','paid_gate','live_control','linked_lineage','stage_prepare','prepared_binding','consume_fence','consume_write','consume_reconcile','runtime_execute','result_read'] as const;
export type EditorialCloudExecutionPhase=typeof editorialCloudExecutionPhases[number];
export type EditorialCloudConsumption='not_attempted'|'unconfirmed'|'zero_changes'|'committed';
export type EditorialCloudExecutionDiagnostic={execution_phase:EditorialCloudExecutionPhase;code:'request_cancelled'|'binding_check_failed'|'credential_check_failed'|'execution_unconfirmed';transport_consumption:EditorialCloudConsumption;binding_stage?:string;binding_code?:string};
const diagnostics=new WeakMap<object,EditorialCloudExecutionDiagnostic>();
export function tagEditorialCloudExecutionFailure(error:unknown,phase:EditorialCloudExecutionPhase,consumption:EditorialCloudConsumption,signal?:AbortSignal){
 const failure=error&&typeof error==='object'?error:Error('cloud_execution_unconfirmed'),binding=bindingCheckDiagnostic(error),trustedBinding=bindingCheckStages.includes(binding.stage)&&bindingCheckCodes.includes(binding.code)&&binding.code!=='unknown';let credential=false;
 try{credential=error instanceof Error&&error.message==='编辑V3内容安全校验未通过';}catch{/* No exception data is copied. */}
 diagnostics.set(failure,Object.freeze({execution_phase:phase,code:signal?.aborted?'request_cancelled':trustedBinding?'binding_check_failed':credential?'credential_check_failed':'execution_unconfirmed',transport_consumption:consumption,...(trustedBinding?{binding_stage:binding.stage,binding_code:binding.code}:{})}));
 return failure;
}
export function editorialCloudExecutionDiagnostic(error:unknown):EditorialCloudExecutionDiagnostic|null{return error&&typeof error==='object'?diagnostics.get(error)??null:null;}
