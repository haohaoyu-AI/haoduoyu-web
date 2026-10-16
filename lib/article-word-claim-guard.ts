import {db} from './test-store';
import {dedaoWordOriginSql} from './dedao-word-origin';
/** A presentation hint is never executor termination evidence or a claim grant. */
export function unfinishedManualWordClaim(row:{id?:string;article_id?:string;state:string;source_key?:string;claim_token?:string|null;claim_present?:number|boolean;result_key?:string|null;has_word?:boolean;output_mode?:string|null;artifact_manifest?:string|null}) {
 const id=row.id??row.article_id;
 if(!id||row.state!=='processing'||row.source_key!==`articles/${id}/source`||!(row.claim_token||row.claim_present)||row.result_key||row.has_word||row.output_mode==='text_only')return false;
 try{return JSON.parse(row.artifact_manifest||'null')?.output_mode!=='text_only';}catch{return true;}
}

/** Protect every unfinished canonical claim, including an unverified import.
 * Eligibility for explicit recovery is a separate, stricter decision. */
export const unfinishedManualWordClaimSql=`(state='processing' AND source_key='articles/'||id||'/source' AND claim_token IS NOT NULL AND result_key IS NULL
 AND CASE WHEN json_valid(artifact_manifest) THEN COALESCE(json_extract(artifact_manifest,'$.output_mode'),'')<>'text_only' ELSE 1 END)`;

export async function wordClaimRecoveryDisposition(owner:string,row:Parameters<typeof unfinishedManualWordClaim>[0]){
 if(!unfinishedManualWordClaim(row))return null;
 const id=row.id??row.article_id;
 const automatic=['writing_runs','editorial_runs_v3','editorial_flows','outline_flows'].map(table=>`NOT EXISTS(SELECT 1 FROM ${table} w WHERE w.article_id=articles.id)`).join(' AND ');
 const found=await db().prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM dedao_items w WHERE w.article_id=articles.id) THEN 'manual_upload' WHEN ${dedaoWordOriginSql(owner,id!,'articles')} THEN 'dedao_import' ELSE NULL END AS origin, CASE WHEN ${automatic} THEN 1 ELSE 0 END AS allowed_lineage FROM articles WHERE id=? AND owner=? AND ${unfinishedManualWordClaimSql}`).bind(id,owner).first<{origin:'manual_upload'|'dedao_import'|null;allowed_lineage:number}>();
 if(!found)return null;
 return {required:true,supported:!!found.origin&&found.allowed_lineage===1,origin:found.allowed_lineage===1?found.origin:null,reason:found.allowed_lineage!==1?'unsupported_writing_lineage':found.origin?'source_preflight_required':'source_evidence_missing'};
}

export async function manualWordRecoveryRequired(owner:string,row:Parameters<typeof unfinishedManualWordClaim>[0]){
 return (await wordClaimRecoveryDisposition(owner,row))?.supported===true;
}

export function sourceRecoveryBlockedGuidance(reason='source_evidence_missing'){
 return {next_tool:null,recovery_tool:null,blocked:true,reason,preserve_existing_word:true,new_execution_grant:false,new_platform_upload_allowed:false,guidance:'来源或原提交证据尚未核对完整；保留同一文章和已有成果，等待来源核验，不重新认领或派发。'};
}

export async function prewordClaimGuidance(owner:string,row:Parameters<typeof unfinishedManualWordClaim>[0]){
 const disposition=await wordClaimRecoveryDisposition(owner,row);
 return disposition?.supported?manualWordRecoveryGuidance():sourceRecoveryBlockedGuidance(disposition?.reason||'source_evidence_missing');
}

export const manualWordRecoveryGuidance=()=>({next_tool:'preview_article_word_recovery',recovery_tool:'recover_article_word_execution',requires_exact_original_executor_end:true,preserve_existing_word:true,new_platform_upload_allowed:false,guidance:'先读取同一文章的进度和已有输出；凭据仍有效时由原执行者继续。占用到期、断网或没有更新均不证明执行结束；只有原持有者结束回执或精确原 Codex 回合终态及绑定证据，才可显式恢复同一文章。恢复后仍须领取处理位。'});
