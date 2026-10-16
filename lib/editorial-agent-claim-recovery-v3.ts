import {db} from './test-store';
import {hashText} from './writing-input';

// A normal authenticated-owner confirmation can replace only a lost, unpaid
// writer claim. It is not a provider retry, executor stop command or signature.
// The caller must have actual owner authorization and real termination evidence.
export const editorialAgentClaimRecoveryScope='editorial_v3_same_stage_unpaid_agent_claim_recovery' as const;
const errors={invalid:'未付费作者认领恢复参数无效',confirm:'需要本人明确确认原执行已结束及同阶段未付费认领恢复',ineligible:'只有当前零付费零产物的小鱼作者认领可以恢复',changed:'认领、输入或授权已变化；请重新读取，不复用旧恢复确认'} as const;
export function editorialAgentClaimRecoveryPublicError(error:unknown){const message=error instanceof Error?error.message:'';return Object.values(errors).some(value=>value===message)?message:errors.changed;}
type RecordRow=Record<string,unknown>;
type RecoveryStage=RecordRow&{id:string;owner:string;run_id:string;stage:string;round:number;sequence:number;token:string;input_json:string;input_sha256:string;state:string};
export type AgentClaimRecoveryPlan={row:RecordRow&{id:string;owner:string;writer:string;authority_id:string;state:string;round:number;initialized:number;input_sha256:string;snapshot_sha256:string;final_sha256:string|null;expires:string};s:RecordRow;steps:RecoveryStage[];authority:RecordRow};
export type AgentClaimRecoveryDependencies={loadStrict:(owner:string,id:string)=>Promise<AgentClaimRecoveryPlan>;assertSafe:(owner:string,value:unknown)=>Promise<void>};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const sha=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const stages=['outline','outline_revision','body','structure_revision','fact_revision'];
const runColumns=['id','owner','authority_id','request_key','run_kind','day','writer','test_intent_key','input_json','input_sha256','snapshot_json','snapshot_sha256','state','round','initialized','article_id','final_sha256','error','expires','created','updated'];
const stageColumns=['id','owner','run_id','stage','round','sequence','token','input_json','input_sha256','state','artifact_json','artifact_sha256','actor_id','execution_id','model','provenance','receipt_id','error','created','updated'];
const authorityColumns=['id','owner','authorization_key','scope','state','start_day','evidence_json','evidence_sha256','frozen_bindings_json','frozen_bindings_sha256','policy_json','created','updated'];
const configColumns=['owner','model','enabled','updated','secret'];
const selected=(row:RecordRow,columns:string[])=>columns.map(key=>row[key]??null);
function balancedAnd(parts:string[]):string{if(parts.length===1)return parts[0];const middle=Math.floor(parts.length/2);return `(${balancedAnd(parts.slice(0,middle))} AND ${balancedAnd(parts.slice(middle))})`;}
function rowFence(alias:string,row:RecordRow,columns:string[],bindings:unknown[]){bindings.push(JSON.stringify(selected(row,columns)));const frozen=alias+'_recovery_fence';return `EXISTS(SELECT 1 FROM (SELECT ? AS frozen_row) ${frozen} WHERE ${balancedAnd(columns.map((key,index)=>`${alias}.${key} IS json_extract(${frozen}.frozen_row,'$[${index}]')`))})`;}
function argumentsOf(value:unknown,recover:boolean):asserts value is Record<string,unknown>{
 const allowed=['run_id','stage_id',...(recover?['expected_input_sha256','expected_snapshot_sha256','expected_claim_fingerprint','confirmed_scope','confirm_original_execution_ended','original_execution_end_reference','confirm']:[])];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))||!uuid((value as RecordRow).run_id)||!uuid((value as RecordRow).stage_id))throw Error(errors.invalid);
}
function unpaidFence(){return `
 NOT EXISTS(SELECT 1 FROM claude_attempts c WHERE c.owner=t.owner AND (c.id='editorial_v3:'||t.owner||':'||t.run_id||':'||t.id OR substr(c.id,1,length('editorial_v3:'||t.owner||':'||t.run_id||':'))='editorial_v3:'||t.owner||':'||t.run_id||':'))
 AND NOT EXISTS(SELECT 1 FROM editorial_cloud_delegations_v3 d WHERE d.owner=t.owner AND (d.run_id=t.run_id OR d.stage_id=t.id))
 AND NOT EXISTS(SELECT 1 FROM editorial_revision_cloud_delegations_v3 d WHERE d.owner=t.owner AND (d.run_id=t.run_id OR d.stage_id=t.id))
 AND NOT EXISTS(SELECT 1 FROM editorial_failed_writer_cloud_delegations_v3 d WHERE d.owner=t.owner AND (d.run_id=t.run_id OR d.stage_id=t.id))
 AND NOT EXISTS(SELECT 1 FROM editorial_body_continuations_v3 k WHERE k.owner=t.owner AND k.run_id=t.run_id)
 AND NOT EXISTS(SELECT 1 FROM editorial_revision_continuations_v3 k WHERE k.owner=t.owner AND k.run_id=t.run_id)
 AND NOT EXISTS(SELECT 1 FROM editorial_failed_writer_continuations_v3 k WHERE k.owner=t.owner AND k.run_id=t.run_id)`;}
async function eligible(owner:string,value:RecordRow,deps:AgentClaimRecoveryDependencies){
 const plan=await deps.loadStrict(owner,String(value.run_id)),{row,s,steps,authority}=plan,step=steps.find(item=>item.id===value.stage_id);
 if(!step||row.owner!==owner||step.owner!==owner||step.run_id!==row.id||row.writer!=='xiaoyu_agent0YYLX'||s.writer_kind!=='xiaoyu_agent'||s.writer_id!==row.writer||s.capability!==null||s.provider_origin!==null||row.initialized!==1||row.final_sha256!==null||row.state!==step.stage||row.round!==step.round||steps.at(-1)?.id!==step.id||step.state!=='claimed'||!stages.includes(step.stage)||!uuid(step.token)||Date.parse(row.expires)<=Date.now()||authority.owner!==owner||authority.id!==row.authority_id||authority.state!=='active'||['artifact_json','artifact_sha256','actor_id','execution_id','model','provenance','receipt_id','error'].some(key=>step[key]!==null))throw Error(errors.ineligible);
 const input=JSON.parse(step.input_json);if(input.writer_kind!=='xiaoyu_agent'||input.max_output_tokens!==0||input.model!==s.writer_model)throw Error(errors.ineligible);
 const blocked=await db().prepare(`SELECT 1 FROM editorial_stages_v3 t WHERE t.id=? AND t.owner=? AND (${unpaidFence()}) AND NOT EXISTS(SELECT 1 FROM editorial_agent_claim_recoveries_v3 k WHERE k.owner=t.owner AND k.stage_id=t.id)`).bind(step.id,owner).first();if(!blocked)throw Error(errors.ineligible);
 const config=await db().prepare('SELECT owner,model,enabled,updated,secret FROM claude_settings WHERE owner=?').bind(owner).first<RecordRow>();
 const frozen=JSON.parse(String(authority.frozen_bindings_json)),configured=config&&await hashText(JSON.stringify({model:config.model,enabled:config.enabled,updated:config.updated,encrypted_secret:config.secret}));
 if(!config||configured!==frozen.claude_provider.provider_config_sha256)throw Error(errors.changed);
 // The fingerprint binds the old secret without returning or recording it.
 const claimFingerprint=await hashText(JSON.stringify({run:selected(row,runColumns),stage:selected(step,stageColumns),authority:selected(authority,authorityColumns),configuration_sha256:configured}));
 return {plan,step,config,claimFingerprint};
}
export async function previewEditorialAgentClaimRecovery(owner:string,value:unknown,deps:AgentClaimRecoveryDependencies){
 argumentsOf(value,false);const {plan:{row},step,claimFingerprint}=await eligible(owner,value,deps);
 return {run_id:row.id,stage_id:step.id,stage:step.stage,round:step.round,sequence:step.sequence,input_sha256:step.input_sha256,snapshot_sha256:row.snapshot_sha256,claim_fingerprint:claimFingerprint,confirmed_scope:editorialAgentClaimRecoveryScope,read_only:true,eligible:true,same_stage_only:true,provider_request_allowed:false,original_execution_status:'not_certified_by_server',required_confirmation:'Authenticated owner must authorize this exact recovery and confirm the original execution has ended using actual termination evidence. A message ID is not a signature or termination proof.'};
}
export async function recoverEditorialAgentClaim(owner:string,value:unknown,deps:AgentClaimRecoveryDependencies){
 argumentsOf(value,true);
 if(value.confirm!==true||value.confirm_original_execution_ended!==true||value.confirmed_scope!==editorialAgentClaimRecoveryScope)throw Error(errors.confirm);
 if(!sha(value.expected_input_sha256)||!sha(value.expected_snapshot_sha256)||!sha(value.expected_claim_fingerprint)||typeof value.original_execution_end_reference!=='string'||!value.original_execution_end_reference.trim()||value.original_execution_end_reference.length>1000||/[\u0000-\u001f]/.test(value.original_execution_end_reference))throw Error(errors.invalid);
 await deps.assertSafe(owner,value);
 const {plan:{row,authority},step,config,claimFingerprint}=await eligible(owner,value,deps);
 if(value.expected_input_sha256!==step.input_sha256||value.expected_snapshot_sha256!==row.snapshot_sha256||value.expected_claim_fingerprint!==claimFingerprint)throw Error(errors.changed);
 const time=new Date().toISOString(),token=crypto.randomUUID(),id=crypto.randomUUID(),oldHash=await hashText(step.token.toLowerCase()),newHash=await hashText(token.toLowerCase());
 const confirmation=JSON.stringify({scope:editorialAgentClaimRecoveryScope,authenticated_owner:owner,confirm:true,confirm_original_execution_ended:true,original_execution_end_reference:value.original_execution_end_reference,verification:'authenticated_owner_authorized_executor_termination_attested_not_platform_verified'});
 const bindings:unknown[]=[token,time];
 const stageFence=rowFence('t',step,stageColumns,bindings),runFence=rowFence('r',row,runColumns,bindings),authorityFence=rowFence('a',authority,authorityColumns,bindings),configurationFence=rowFence('cs',config,configColumns,bindings);bindings.push(time);
 // D1 batch is transactional. A losing CAS cannot create an audit or receive a
 // second usable token. The terminal assertion rolls back any incomplete batch.
 try{
  const changes=await db().batch([
   db().prepare(`UPDATE editorial_stages_v3 AS t SET token=?,updated=? WHERE ${stageFence} AND ${unpaidFence()} AND NOT EXISTS(SELECT 1 FROM editorial_agent_claim_recoveries_v3 k WHERE k.owner=t.owner AND k.stage_id=t.id) AND NOT EXISTS(SELECT 1 FROM editorial_stages_v3 n WHERE n.owner=t.owner AND n.run_id=t.run_id AND n.sequence>t.sequence) AND EXISTS(SELECT 1 FROM editorial_runs_v3 r JOIN editorial_authority_v3 a ON a.id=r.authority_id AND a.owner=r.owner JOIN claude_settings cs ON cs.owner=r.owner WHERE r.id=t.run_id AND r.owner=t.owner AND ${runFence} AND ${authorityFence} AND ${configurationFence} AND r.expires>? AND NOT EXISTS(SELECT 1 FROM workflow_controls c WHERE c.owner=r.owner AND c.scope='editorial_v3' AND c.run_id=r.id AND c.state IN ('paused','archived')))` ).bind(...bindings),
   db().prepare(`INSERT INTO editorial_agent_claim_recoveries_v3(id,owner,run_id,stage_id,scope,input_sha256,snapshot_sha256,authority_id,authority_evidence_sha256,claim_fingerprint,old_token_sha256,new_token_sha256,confirmation_json,confirmation_sha256,created) SELECT ?,owner,run_id,id,?,?,?,?,?,?,?,?,?,?,? FROM editorial_stages_v3 WHERE id=? AND owner=? AND token=? AND updated=? AND state='claimed'`).bind(id,editorialAgentClaimRecoveryScope,step.input_sha256,row.snapshot_sha256,row.authority_id,authority.evidence_sha256,claimFingerprint,oldHash,newHash,confirmation,await hashText(confirmation),time,step.id,owner,token,time),
   db().prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM editorial_agent_claim_recoveries_v3 k JOIN editorial_stages_v3 t ON t.owner=k.owner AND t.run_id=k.run_id AND t.id=k.stage_id WHERE k.id=? AND k.owner=? AND k.stage_id=? AND k.new_token_sha256=? AND t.token=? AND t.state='claimed' AND t.updated=?) THEN 1 ELSE json('') END AS recovered`).bind(id,owner,step.id,newHash,token,time)
  ]);
  if(changes[0].meta.changes!==1||changes[1].meta.changes!==1)throw Error(errors.changed);
 }catch{throw Error(errors.changed);}
 return {recovered:true,claimed:true,run_id:row.id,stage_id:step.id,stage:step.stage,round:step.round,sequence:step.sequence,token,input:JSON.parse(step.input_json),input_sha256:step.input_sha256,snapshot_sha256:row.snapshot_sha256,expected_model:JSON.parse(step.input_json).model,writer_kind:'xiaoyu_agent',old_claim_fenced:true,same_stage_only:true,model_request_sent:false,provider_request_allowed:false,instruction:'Keep the replacement token volatile. Resume only this frozen unpaid agent writer stage and save through save_agent_editorial_v3_stage. Do not create a run, call a provider, rotate again, or reuse the old token.'};
}
