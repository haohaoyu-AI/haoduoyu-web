// Pure parent-memory measurements only. No VM, source execution, host or network.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COMPLETE_CALL_BUDGET,COMPLETE_CALL_BUDGET_REVISION,CompleteCallBudgetError,composeCompleteOrdinaryCode,measureCompleteCallBudget} from '../scripts/browser-upload/coordinate/src/complete-call-budget.js';

const utf8=value=>Buffer.byteLength(value,'utf8');
const sources={definition_source:'function defineNativeStepSession() {}',adapter_source:'const actualHostAdapter = {capture: currentOfficialCapture};',initialization_source:'const session = defineNativeStepSession(actualHostAdapter);'};
const call=(changes={})=>{
 const all={...sources,...changes};
 const code=composeCompleteOrdinaryCode(Object.fromEntries(Object.keys(sources).map(key=>[key,all[key]])));
 return {...all,tool_args:{code,timeout_ms:1000},code_field:'code',known_wrapper_extra_utf8_bytes:17,...changes};
};
const commentBytes=size=>'/*'+'x'.repeat(size-4)+'*/';
const budgetError=(input,violation)=>{
 let error;try{measureCompleteCallBudget(input);}catch(value){error=value;}
 assert.ok(error instanceof CompleteCallBudgetError);
 assert.equal(error.code,'complete_call_budget_exceeded');
 assert.equal(error.report.complete_call_budget_verified,false);
 assert.ok(error.report.violations.includes(violation));
 assert.ok(Object.isFrozen(error.report));return error.report;
};

test('ordinary composition preserves every character with explicit separators',()=>{
 const input={definition_source:'// 中文 🐟\n',adapter_source:'// \\" adapter\n',initialization_source:'// init\n\n'};
 assert.equal(composeCompleteOrdinaryCode(input),input.definition_source+'\n\n'+input.adapter_source+'\n\n'+input.initialization_source);
 assert.throws(()=>composeCompleteOrdinaryCode({definition_source:'// definitions'}),/all_actual_ordinary_sources_required/);
 assert.throws(()=>composeCompleteOrdinaryCode({...input,adapter_source:'  \n'}),/all_actual_ordinary_sources_required/);
});

test('full actual sources, entire JSON arguments and wrapper bytes are measured',()=>{
 const input=call(),report=measureCompleteCallBudget(input);
 assert.deepEqual(COMPLETE_CALL_BUDGET,{strict_max_utf8_bytes:64000,definition_max_utf8_bytes:28000,adapter_max_utf8_bytes:20000,initialization_max_utf8_bytes:8000,planned_transport_reserve_utf8_bytes:8000});
 for(const field of Object.keys(sources)){
  assert.equal(report.components[field].utf8_bytes,utf8(input[field]));
  assert.equal(report.components[field].json_quoted_utf8_bytes,utf8(JSON.stringify(input[field])));
 }
 assert.equal(report.complete_ordinary_code_utf8_bytes,utf8(input.tool_args.code));
 assert.equal(report.complete_ordinary_code_json_quoted_utf8_bytes,utf8(JSON.stringify(input.tool_args.code)));
 assert.equal(report.actual_tool_request_json_utf8_bytes,utf8(JSON.stringify(input.tool_args)));
 assert.equal(report.actual_complete_payload_utf8_bytes,utf8(JSON.stringify(input.tool_args))+17);
 assert.equal(report.actual_json_arguments_escaping_and_wrapper_extra_utf8_bytes,report.actual_complete_payload_utf8_bytes-report.complete_ordinary_code_utf8_bytes);
 assert.equal(report.remaining_planned_transport_reserve_utf8_bytes,8000-report.actual_json_arguments_escaping_and_wrapper_extra_utf8_bytes);
 assert.equal(report.remaining_payload_utf8_bytes,64000-report.actual_complete_payload_utf8_bytes);
 assert.equal(report.complete_call_budget_verified,true);
 assert.equal(report.normal_host_approval_granted,false);assert.equal(report.current_official_host_acceptance_required,true);
 assert.equal(report.capability_verified,false);assert.equal(report.platform_verified,false);
 assert.equal(report.parent_memory_only,true);assert.equal(report.cua_submission_prohibited,true);
 assert.ok(Object.isFrozen(report.components.definition_source));
});

test('UTF-8 and JSON escaping are measured rather than character counts',()=>{
 const input=call({definition_source:'// 中文 🐟 "\\\n',adapter_source:'// host\n',initialization_source:'// start\n'}),report=measureCompleteCallBudget(input);
 assert.ok(report.components.definition_source.utf8_bytes>input.definition_source.length);
 assert.ok(report.components.definition_source.json_quoted_utf8_bytes>report.components.definition_source.utf8_bytes);
 assert.equal(report.actual_tool_request_json_utf8_bytes,utf8(JSON.stringify(input.tool_args)));
});

test('64,000 payload bytes is permitted and 64,001 is rejected with full report',()=>{
 const input=call(),requestBytes=utf8(JSON.stringify(input.tool_args));
 const exact=measureCompleteCallBudget({...input,known_wrapper_extra_utf8_bytes:64000-requestBytes});
 assert.equal(exact.actual_complete_payload_utf8_bytes,64000);assert.equal(exact.remaining_payload_utf8_bytes,0);
 assert.equal(exact.complete_call_budget_verified,true);
 const report=budgetError({...input,known_wrapper_extra_utf8_bytes:64001-requestBytes},'complete_payload_with_wrapper_too_large');
 assert.equal(report.actual_complete_payload_utf8_bytes,64001);assert.equal(report.remaining_payload_utf8_bytes,-1);
 assert.equal(report.actual_tool_request_json_utf8_bytes,requestBytes);
});

for(const [field,limit] of [['definition_source',28000],['adapter_source',20000],['initialization_source',8000]]){
 test(`${field} exact raw limit passes; one extra UTF-8 byte preserves measured costs`,()=>{
  const valid=call({[field]:commentBytes(limit)}),report=measureCompleteCallBudget(valid);
  assert.equal(report.components[field].utf8_bytes,limit);assert.equal(report.components[field].remaining_utf8_bytes,0);
  const invalid=call({[field]:commentBytes(limit+1)}),failure=budgetError(invalid,field+'_too_large');
  assert.equal(failure.components[field].utf8_bytes,limit+1);assert.equal(failure.components[field].remaining_utf8_bytes,-1);
 });
}

test('the revised internal definition allocation preserves the earlier failure and cancellation fence reason',()=>{
 assert.equal(COMPLETE_CALL_BUDGET_REVISION.previous_definition_max_utf8_bytes,24000);
 assert.equal(COMPLETE_CALL_BUDGET_REVISION.definition_max_utf8_bytes,28000);
 assert.equal(COMPLETE_CALL_BUDGET_REVISION.strict_limit_changed,false);
 assert.match(COMPLETE_CALL_BUDGET_REVISION.reason,/validate -> ready -> single physical commit/);
 assert.deepEqual(COMPLETE_CALL_BUDGET_REVISION.previous_definition_failure,{source:'compiled_native_step_host_definition',measured_utf8_bytes:24101,limit_utf8_bytes:24000,exceeded_utf8_bytes:101,complete_call_budget_verified:false,actual_adapter_initialization_and_tool_request_provided:false});
 assert.ok(Object.isFrozen(COMPLETE_CALL_BUDGET_REVISION.previous_definition_failure));
 const definitionsOnly=measureCompleteCallBudget({definition_source:commentBytes(25100)});
 assert.equal(definitionsOnly.complete_call_budget_verified,false);
 assert.equal(definitionsOnly.components.definition_source.max_utf8_bytes,28000);
 assert.equal(definitionsOnly.internal_budget_revision,COMPLETE_CALL_BUDGET_REVISION);
});

test('8,000 transport bytes is a planned reserve and every actual byte still counts toward strict 64,000',()=>{
 const input=call();input.tool_args.trace_comment='x'.repeat(9000);
 const report=measureCompleteCallBudget(input);
 assert.equal(report.complete_call_budget_verified,true);
 assert.equal(report.planned_transport_reserve_is_hard_limit,false);
 assert.ok(report.actual_json_arguments_escaping_and_wrapper_extra_utf8_bytes>8000);
 assert.ok(report.remaining_planned_transport_reserve_utf8_bytes<0);
 assert.equal(report.actual_json_arguments_escaping_and_wrapper_extra_utf8_bytes,utf8(JSON.stringify(input.tool_args))+17-utf8(input.tool_args.code));
 assert.equal(report.normal_host_approval_granted,false);
});

test('component allocations and planned reserve never replace measuring separators and full JSON overhead',()=>{
 const input=call({definition_source:commentBytes(28000),adapter_source:commentBytes(20000),initialization_source:commentBytes(8000),known_wrapper_extra_utf8_bytes:8000});
 const report=budgetError(input,'complete_payload_with_wrapper_too_large');
 for(const component of Object.values(report.components))assert.equal(component.remaining_utf8_bytes,0);
 assert.equal(report.complete_ordinary_code_utf8_bytes,56004);
 assert.equal(report.actual_complete_payload_utf8_bytes,utf8(JSON.stringify(input.tool_args))+8000);
 assert.ok(report.actual_complete_payload_utf8_bytes>64000);
 assert.equal(report.normal_host_approval_granted,false);
});

test('quoted request can exceed strict budget even when all source components fit',()=>{
 const escaped=size=>'/*'+'\\'.repeat(size-4)+'*/';
 const input=call({definition_source:escaped(20000),adapter_source:escaped(19000),initialization_source:escaped(8000)});
 const report=budgetError(input,'complete_json_tool_request_too_large');
 for(const item of Object.values(report.components))assert.ok(item.utf8_bytes<=item.max_utf8_bytes);
 assert.ok(report.complete_ordinary_code_utf8_bytes<64000);
 assert.ok(report.actual_tool_request_json_utf8_bytes>64000);
 assert.ok(report.violations.includes('complete_payload_with_wrapper_too_large'));
});

test('large non-code tool arguments are part of the actual complete payload',()=>{
 const input=call();input.tool_args.trace_comment='x'.repeat(64000);
 const report=budgetError(input,'complete_json_tool_request_too_large');
 assert.equal(report.actual_tool_request_json_utf8_bytes,utf8(JSON.stringify(input.tool_args)));
 assert.ok(report.complete_ordinary_code_utf8_bytes<1000);
});

test('overlarge complete ordinary code remains visible in rejection report',()=>{
 const input=call({definition_source:commentBytes(65000)}),report=budgetError(input,'complete_ordinary_code_too_large');
 assert.equal(report.complete_ordinary_code_utf8_bytes,utf8(input.tool_args.code));
 assert.ok(report.violations.includes('definition_source_too_large'));
});

test('definitions alone report unknown call budget and do not fabricate other sizes',()=>{
 const report=measureCompleteCallBudget({definition_source:sources.definition_source});
 assert.equal(report.complete_call_budget_verified,false);
 assert.deepEqual(report.missing_inputs,['adapter_source','initialization_source','tool_args','code_field','known_wrapper_extra_utf8_bytes']);
 assert.equal(report.complete_ordinary_code_utf8_bytes,null);
 assert.equal(report.actual_tool_request_json_utf8_bytes,null);
 assert.equal(report.actual_complete_payload_utf8_bytes,null);
 assert.equal(report.remaining_payload_utf8_bytes,null);
 assert.equal(report.actual_json_arguments_escaping_and_wrapper_extra_utf8_bytes,null);
 assert.equal(report.remaining_planned_transport_reserve_utf8_bytes,null);
});

test('every required actual input must be known before budget verification',()=>{
 for(const field of ['adapter_source','initialization_source','tool_args','code_field','known_wrapper_extra_utf8_bytes']){
  const input=call();delete input[field];const report=measureCompleteCallBudget(input);
  assert.equal(report.complete_call_budget_verified,false);assert.ok(report.missing_inputs.includes(field));
  if(['adapter_source','initialization_source','tool_args','code_field','known_wrapper_extra_utf8_bytes'].includes(field))assert.equal(report.actual_json_arguments_escaping_and_wrapper_extra_utf8_bytes,null);
 }
 const unknown=measureCompleteCallBudget({...call(),known_wrapper_extra_utf8_bytes:null});
 assert.equal(unknown.complete_call_budget_verified,false);assert.equal(unknown.actual_complete_payload_utf8_bytes,null);
 const empty={...call(),adapter_source:'',initialization_source:'\n'};
 assert.equal(measureCompleteCallBudget(empty).complete_call_budget_verified,false);
});

test('zero wrapper overhead must be explicitly known rather than defaulted',()=>{
 const input=call({known_wrapper_extra_utf8_bytes:0}),report=measureCompleteCallBudget(input);
 assert.equal(report.complete_call_budget_verified,true);
 assert.equal(report.actual_complete_payload_utf8_bytes,report.actual_tool_request_json_utf8_bytes);
 for(const invalid of [-1,0.5,NaN,Infinity,'0'])assert.throws(()=>measureCompleteCallBudget({...input,known_wrapper_extra_utf8_bytes:invalid}),/known_wrapper_extra_bytes_required/);
});

test('the actual top-level tool code must exactly match complete composition',()=>{
 const input=call();
 for(const code of [input.tool_args.code+'\n',input.tool_args.code.trim().replace('\n\n','\n'),'// only definitions'])assert.throws(()=>measureCompleteCallBudget({...input,tool_args:{code}}),/actual_code_must_match/);
 assert.throws(()=>measureCompleteCallBudget({...input,tool_args:{payload:{code:input.tool_args.code}}}),/actual_top_level_code_string_required/);
 assert.throws(()=>measureCompleteCallBudget({...input,tool_args:{code:42}}),/actual_top_level_code_string_required/);
 const named={...input,tool_args:{ordinary_code:input.tool_args.code},code_field:'ordinary_code'};
 assert.equal(measureCompleteCallBudget(named).complete_call_budget_verified,true);
});

test('structured parent secrets and permission flags are rejected without echoing values',()=>{
 const input=call();
 for(const field of ['claim_token','deliveryToken','execution_claim','reservation-token','credentials','access_token','authorization','private_baseline','frozen_text','paragraphs','images','manifest','body','content','text','title','execute_import','claim_confirmed','reserved','consumed','delivery_status','grant','claim','claim_response','claim_token_value','credentials_file','cookie_header','raw_claim','full_body','original_title','article_content']){
  let failure;try{measureCompleteCallBudget({...input,tool_args:{...input.tool_args,extra:{[field]:'synthetic-sensitive-value'}}});}catch(error){failure=error;}
  assert.ok(failure instanceof CompleteCallBudgetError,field);
  assert.equal(failure.code,'private_parent_field_prohibited');
  assert.equal(JSON.stringify(failure.report).includes('synthetic-sensitive-value'),false);
 }
});

test('permission and rejection-bypass flags cannot enter a verified CUA request',()=>{
 const input=call();
 for(const field of ['force','force_click','bypass_approval','approval_policy','sandbox_permissions','additional_permissions','require_escalated','override','allow_unsafe','permission','dangerously_skip_permissions','skip_approval','disable_review','auto_approve','sandbox_mode','allow_unsandboxed','allow_dangerous']){
  for(const value of [true,false,'require_escalated'])assert.throws(()=>measureCompleteCallBudget({...input,tool_args:{...input.tool_args,extra:{[field]:value}}}),/permission_or_bypass_flag_prohibited/);
 }
 for(const field of ['正文','文章正文','claim.token','claim\u200b_token'])assert.throws(()=>measureCompleteCallBudget({...input,tool_args:{...input.tool_args,extra:{[field]:'sensitive'}}}),/ordinary_tool_request_key_required/);
});

test('public token-count fields require safe nonnegative integers',()=>{
 const input=call();input.tool_args.max_output_tokens=2000;
 assert.equal(measureCompleteCallBudget(input).complete_call_budget_verified,true);
 for(const value of ['sensitive',-1,0.5,Infinity])assert.throws(()=>measureCompleteCallBudget({...input,tool_args:{...input.tool_args,max_output_tokens:value}}),/public_token_count_required/);
});

test('overflowing wrapper-plus-request size retains exact byte count without unsafe rounding',()=>{
 const input=call({known_wrapper_extra_utf8_bytes:Number.MAX_SAFE_INTEGER}),report=budgetError(input,'complete_payload_with_wrapper_too_large');
 assert.equal(report.actual_complete_payload_utf8_bytes,null);
 assert.equal(report.actual_complete_payload_utf8_bytes_exact,String(BigInt(Number.MAX_SAFE_INTEGER)+BigInt(utf8(JSON.stringify(input.tool_args)))));
 assert.equal(report.remaining_payload_utf8_bytes,null);
});

test('source strings are measured exactly and never scanned, censored or rewritten',()=>{
 const input=call({definition_source:'// generic declaration refers to claim_token, no actual credential\nfunction f() {}'}),report=measureCompleteCallBudget(input);
 assert.equal(report.complete_call_budget_verified,true);
 assert.equal(report.components.definition_source.utf8_bytes,utf8(input.definition_source));
 assert.equal(input.tool_args.code,composeCompleteOrdinaryCode(sources).replace(sources.definition_source,input.definition_source));
});

test('hidden keys, getters and custom serialization cannot silently change measurement',()=>{
 let getterReads=0,toJsonCalls=0;
 const input=call(),getter={...input.tool_args};Object.defineProperty(getter,'x',{enumerable:true,get(){getterReads++;return 'x';}});
 assert.throws(()=>measureCompleteCallBudget({...input,tool_args:getter}),/plain_visible/);
 const hidden={...input.tool_args};Object.defineProperty(hidden,'claim_token',{value:'secret'});
 assert.throws(()=>measureCompleteCallBudget({...input,tool_args:hidden}),/plain_visible/);
 const symbolic={...input.tool_args,[Symbol('hidden')]:'secret'};
 assert.throws(()=>measureCompleteCallBudget({...input,tool_args:symbolic}),/visible_string/);
 assert.throws(()=>measureCompleteCallBudget({...input,tool_args:{...input.tool_args,toJSON(){toJsonCalls++;return {};}}}),/json_data/);
 const configuration={...input};Object.defineProperty(configuration,'adapter_source',{enumerable:true,get(){getterReads++;return sources.adapter_source;}});
 assert.throws(()=>measureCompleteCallBudget(configuration),/plain_visible_budget_input/);
 assert.throws(()=>measureCompleteCallBudget({...input,[Symbol('hidden')]:true}),/unrecognized_budget_input/);
 assert.equal(getterReads,0);assert.equal(toJsonCalls,0);
});

test('request data cannot rely on JSON omission, cycles, exotic objects or sparse arrays',()=>{
 const input=call(),cycle={};cycle.self=cycle;
 for(const extra of [undefined,()=>{},1n,NaN,Infinity,new Date(),new Map(),cycle,Array(2),[1,,3]])assert.throws(()=>measureCompleteCallBudget({...input,tool_args:{...input.tool_args,extra}}));
 const array=[1];array.extra=2;
 assert.throws(()=>measureCompleteCallBudget({...input,tool_args:{...input.tool_args,extra:array}}),/dense_plain/);
 let nested={};for(let index=0;index<70;index++)nested={extra:nested};
 assert.throws(()=>measureCompleteCallBudget({...input,tool_args:{...input.tool_args,extra:nested}}),/bounded_plain/);
});

test('plain nested public scope/artifact data count toward the same exact request',()=>{
 const input=call();input.tool_args.context={scope:{article_id:'synthetic-article',platform:'toutiao',host_id:'synthetic-host'},artifact:{absolute_path:'/same-host/final.docx',sha256:'a'.repeat(64),size_bytes:11947179},features:[true,null,4,'🐟']};
 const before=JSON.stringify(input),report=measureCompleteCallBudget(input);
 assert.equal(report.complete_call_budget_verified,true);assert.equal(report.actual_tool_request_json_utf8_bytes,utf8(JSON.stringify(input.tool_args)));
 assert.equal(JSON.stringify(input),before);
});

test('a synthetic complete-call sample reports actual measurement, never approval',()=>{
 const input=call({definition_source:commentBytes(23000),adapter_source:commentBytes(18000),initialization_source:commentBytes(7000),known_wrapper_extra_utf8_bytes:400});
 const report=measureCompleteCallBudget(input);
 assert.equal(report.complete_ordinary_code_utf8_bytes,48004);
 assert.equal(report.actual_tool_request_json_utf8_bytes,utf8(JSON.stringify(input.tool_args)));
 assert.equal(report.actual_complete_payload_utf8_bytes,report.actual_tool_request_json_utf8_bytes+400);
 assert.equal(report.complete_call_budget_verified,true);assert.equal(report.normal_host_approval_granted,false);
 console.log('SYNTHETIC_COMPLETE_CALL_MEASUREMENT '+JSON.stringify({code_utf8_bytes:report.complete_ordinary_code_utf8_bytes,tool_request_json_utf8_bytes:report.actual_tool_request_json_utf8_bytes,known_wrapper_extra_utf8_bytes:400,complete_payload_utf8_bytes:report.actual_complete_payload_utf8_bytes,remaining_payload_utf8_bytes:report.remaining_payload_utf8_bytes,normal_host_approval_granted:false,real_host_calls:0}));
});
