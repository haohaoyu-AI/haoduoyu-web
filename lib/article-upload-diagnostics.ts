import {db} from './test-store';
import {hasArticleClaimCredential} from './article-claim-credentials';
import {editorialCredentialHit} from './editorial-credential-boundary';

export const uploadDiagnosticStages=['file_handoff','chooser_wait','file_submission','platform_import','draft_readback'] as const;
export const uploadDiagnosticCauses=['none','timeout','tool_unavailable','permission_denied','browser_disconnected','platform_rejected','unknown'] as const;
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
export const uploadDiagnosticTool={name:'record_article_upload_diagnostic',description:'Append a credential-free executor observation, including before reservation. Does not alter claims, upload attempts, import permission or platform completion. failed chooser_wait is a picker failure; file_submission failure is submission uncertainty; only a visible platform rejection supports platform_import/platform_rejected. Use a fresh operation UUID per observation; identical retries are idempotent. This self-reported diagnostic is not proof the platform did or did not receive a file.',inputSchema:{type:'object',properties:{article_id:uuid,platform:{type:'string',enum:['toutiao','zhihu']},operation_id:uuid,executor_id:uuid,attempt_id:uuid,stage:{type:'string',enum:uploadDiagnosticStages},outcome:{type:'string',enum:['started','returned','failed']},cause:{type:'string',enum:uploadDiagnosticCauses},observed_at:{type:'string',format:'date-time'}},required:['article_id','platform','operation_id','executor_id','stage','outcome','cause','observed_at'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}};
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fields=['article_id','platform','executor_id','attempt_id','stage','outcome','cause','observed_at'] as const;

export async function recordUploadDiagnostic(owner:string,articleId:string,a:any){
 if(!uuidPattern.test(a.operation_id)||!uuidPattern.test(a.executor_id)||(a.attempt_id!==undefined&&!uuidPattern.test(a.attempt_id))||!['toutiao','zhihu'].includes(a.platform)||!uploadDiagnosticStages.includes(a.stage)||!['started','returned','failed'].includes(a.outcome)||!uploadDiagnosticCauses.includes(a.cause))throw Error('Invalid upload diagnostic');
 if((a.outcome==='failed')===(a.cause==='none')||(a.cause==='platform_rejected'&&a.stage!=='platform_import'))throw Error('Invalid upload diagnostic');
 if(typeof a.observed_at!=='string'||!Number.isFinite(Date.parse(a.observed_at))||Date.parse(a.observed_at)>Date.now()+60000||a.observed_at.length>40)throw Error('Invalid upload diagnostic');
 if(await hasArticleClaimCredential(owner,a)||await editorialCredentialHit(owner,a))throw Error('Upload evidence contains unsafe credential content; nothing saved');
 if(a.attempt_id&&!await db().prepare('SELECT id FROM article_upload_attempts WHERE id=? AND owner=? AND article_id=? AND platform=?').bind(a.attempt_id,owner,articleId,a.platform).first())throw Error('Matching upload attempt required');
 const values={article_id:articleId,platform:a.platform,executor_id:a.executor_id,attempt_id:a.attempt_id||null,stage:a.stage,outcome:a.outcome,cause:a.cause,observed_at:new Date(a.observed_at).toISOString()};
 // Recheck the article inside the INSERT after asynchronous credential reads.
 // An earlier article() read cannot authorize a diagnostic that arrived after
 // the owner's permanent deletion fence.
 await db().prepare(`INSERT OR IGNORE INTO article_upload_diagnostics(id,owner,article_id,platform,executor_id,attempt_id,stage,outcome,cause,observed_at,created)
  SELECT ?,?,?,?,?,?,?,?,?,?,? FROM articles current
  WHERE current.owner=? AND current.id=? AND current.state<>'deleting'
   AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.owner=current.owner AND x.id=current.id)`)
  .bind(a.operation_id,owner,...fields.map(f=>values[f]),new Date().toISOString(),owner,articleId).run();
 const stored:any=await db().prepare('SELECT * FROM article_upload_diagnostics WHERE owner=? AND id=?').bind(owner,a.operation_id).first();
 if(!stored||fields.some(f=>stored[f]!==values[f]))throw Error('Diagnostic operation already records another observation');
 return {recorded:true,operation_id:stored.id,execute_import:false,attestation_only:true};
}

// Compact, owner-scoped presentation data. No lease, consume token, preflight paths or raw errors.
export async function uploadProgress(owner:string,articleId:string){
 const attempts=(await db().prepare('SELECT id AS attempt_id,platform,state,attempt_version,consumed_at,editor_urls,created,updated FROM article_upload_attempts WHERE owner=? AND article_id=? ORDER BY attempt_version DESC').bind(owner,articleId).all()).results;
 const diagnostics=(await db().prepare('SELECT id AS operation_id,platform,attempt_id,stage,outcome,cause,observed_at,created FROM article_upload_diagnostics WHERE owner=? AND article_id=? ORDER BY observed_at DESC,rowid DESC LIMIT 50').bind(owner,articleId).all()).results;
 return uploadProgressFromRows(attempts,diagnostics);
}
// Shared presentation only: callers supply the same ordered, owner-scoped
// records. This projection grants no upload, retry, claim or execution rights.
export function uploadProgressFromRows(attempts:any[],diagnostics:any[]){
 return ['toutiao','zhihu'].map(platform=>{
  const raw:any=attempts.find((r:any)=>r.platform===platform),attempt=raw?{...raw,editor_urls:JSON.parse(raw.editor_urls)}:null;
  const latest:any=diagnostics.find((d:any)=>d.platform===platform&&(!attempt||d.attempt_id===attempt.attempt_id||!d.attempt_id&&Date.parse(d.observed_at)>=Date.parse(attempt.created)))||null;
  // Later durable progress supersedes an earlier failure in the current-status display.
  const superseded=!!latest&&latest.outcome==='failed'&&!!attempt&&(attempt.state==='verified'||attempt.state==='draft_observed'&&['file_handoff','chooser_wait','file_submission'].includes(latest.stage))&&Date.parse(attempt.updated)>Date.parse(latest.observed_at);
  return {platform,attempt,diagnostic:latest,diagnostic_superseded:superseded,attestation_only:true};
 });
}
