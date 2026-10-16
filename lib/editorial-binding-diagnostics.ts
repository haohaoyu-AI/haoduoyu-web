/** Closed structural diagnostics. Never copies exception messages, headers or values. */
export const bindingCheckStages=['evidence_hash','expected_hash','live_configuration','body_input_reconstruction','row_reread','allocation_batch','history_binding'] as const;
export const bindingCheckCodes=['hash_mismatch','prompt_configuration_changed','provider_configuration_changed','provider_configuration_unconfirmed','capability_metadata_timeout','capability_metadata_unconfirmed','capability_configuration_changed','reconstructed_input_mismatch','reread_row_mismatch','allocation_unconfirmed','run_stopped','unknown'] as const;
export type BindingCheckStage=typeof bindingCheckStages[number];
export type BindingCheckCode=typeof bindingCheckCodes[number];
export function bindingCheckFailure(stage:BindingCheckStage,code:BindingCheckCode){return Object.assign(Error('正文单次续接冻结绑定不一致'),{editorial_binding_stage:stage,editorial_binding_code:code});}
export function bindingCheckDiagnostic(error:unknown,fallbackStage:BindingCheckStage='live_configuration'):{stage:BindingCheckStage;code:BindingCheckCode}{
 try{const value=error&&typeof error==='object'?error as Record<string,unknown>:{};return {stage:bindingCheckStages.includes(value.editorial_binding_stage as BindingCheckStage)?value.editorial_binding_stage as BindingCheckStage:fallbackStage,code:bindingCheckCodes.includes(value.editorial_binding_code as BindingCheckCode)?value.editorial_binding_code as BindingCheckCode:'unknown'};}catch{return {stage:fallbackStage,code:'unknown'};}
}
