import {db} from './test-store';
import {rememberArticleClaimHashes} from './article-claim-credentials';

type Article = {id:string;state:string;result_key:string|null;result_meta:string|null;claim_token:string|null;claim_expires:string|null};
type Lease = {id:string;state:string;claim_token:string|null;claim_expires:string|null};
const mainStates=['word_ready','toutiao_saving','needs_login','needs_verification','failed'];
const deliveryStates=['pending','saving','needs_login','needs_verification','failed'];

export const articleUploadExecutionEndTool={
 name:'finish_article_upload_execution',
 description:'End only your own current live platform execution after all of your browser/file/status writes have stopped. Refuses every consumed attempt in this destination without its exact executor-end acknowledgement, including older or verified attempts. Releases only this lease, preserves Word, platform state, all attempts and diagnostics, and fences unconsumed permissions. No recovery, successor claim, upload or reimport permission is granted. This is the current holder ending its own execution; it does not require another owner recovery confirmation.',
 inputSchema:{type:'object',properties:{article_id:{type:'string'},platform:{type:'string',enum:['toutiao','zhihu']},execution_claim:{type:'string',minLength:1,maxLength:100,description:'Current live claim, volatile only; never log, save or show it.'},executor_stopped:{type:'boolean',const:true,description:'Current executor acknowledgement that all its browser/file/status writes have stopped. Not server proof of process termination.'}},required:['article_id','platform','execution_claim','executor_stopped'],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
};

export async function finishArticleUploadExecution(owner:string,article:Article,args:Record<string,unknown>){
 const platform=args.platform,token=args.execution_claim;
 if(args.article_id!==article.id||(platform!=='toutiao'&&platform!=='zhihu'))throw Error('Exact article and supported upload destination required');
 if(args.executor_stopped!==true)throw Error('Current executor must first stop all browser/file/status writes');
 if(typeof token!=='string'||!token||token.length>100)throw Error('Only the current live upload claim holder can finish');
 if(!article.result_key||!article.result_meta||article.state==='deleting')throw Error('Only an existing ready Word platform execution can finish');
 const current=platform==='toutiao'?article:await db().prepare("SELECT id,state,claim_token,claim_expires FROM article_deliveries WHERE article_id=? AND owner=? AND platform='zhihu'").bind(article.id,owner).first<Lease>();
 if(!current||current.claim_token!==token||!current.claim_expires||!Number.isFinite(Date.parse(current.claim_expires))||Date.parse(current.claim_expires)<=Date.now())throw Error('Only the current live upload claim holder can finish');
 if(!(platform==='toutiao'?mainStates:deliveryStates).includes(current.state))throw Error('This platform phase cannot finish an upload execution');
 await rememberArticleClaimHashes(owner,token);
 const endedAt=new Date().toISOString();
 // All historical consumed attempts must be ended, regardless of their state, version or
 // claim hash. The live-token predicate and consume's own live-token check linearize the
 // race: either consume wins and blocks this finish, or finish wins and blocks consume.
 // Do not edit attempts to fence reserved permits: clearing this exact live token is enough;
 // their retained claim_hash prevents any later claim from spending the old permission.
 const unfinished=`NOT EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.owner=? AND u.article_id=? AND u.platform=? AND u.consumed_at IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM article_upload_executor_ends e WHERE e.attempt_id=u.id AND e.owner=u.owner AND e.article_id=u.article_id AND e.platform=u.platform))`;
 const change=platform==='toutiao'?await db().prepare(`UPDATE articles SET claim_token=NULL,claim_expires=NULL WHERE id=? AND owner=? AND state=? AND state IN ('word_ready','toutiao_saving','needs_login','needs_verification','failed') AND claim_token=? AND claim_expires>? AND result_key=? AND result_meta=?
  AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=articles.id AND x.owner=articles.owner) AND ${unfinished}`)
  .bind(article.id,owner,current.state,token,endedAt,article.result_key,article.result_meta,owner,article.id,platform).run():await db().prepare(`UPDATE article_deliveries SET claim_token=NULL,claim_expires=NULL,updated=? WHERE id=? AND article_id=? AND owner=? AND platform='zhihu' AND state=? AND state IN ('pending','saving','needs_login','needs_verification','failed') AND claim_token=? AND claim_expires>?
  AND EXISTS(SELECT 1 FROM articles a WHERE a.id=article_deliveries.article_id AND a.owner=article_deliveries.owner AND a.state=? AND a.state!='deleting' AND a.result_key=? AND a.result_meta=?)
  AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=article_deliveries.article_id AND x.owner=article_deliveries.owner) AND ${unfinished}`)
  .bind(endedAt,current.id,article.id,owner,current.state,token,endedAt,article.state,article.result_key,article.result_meta,owner,article.id,platform).run();
 if(!change.meta.changes)throw Error('Claim, artifact or platform work changed, or a consumed upload executor is not ended; nothing released');
 return {article_id:article.id,platform,state:current.state,released:true,execute_import:false,new_upload_allowed:false,unconsumed_permits_fenced:true,history_preserved:true,evidence:'current_executor_acknowledgement_not_server_termination_proof',instruction:'This execution is finished. Existing Word, attempts and diagnostics are unchanged. A successor must claim normally and follow the existing separate import/reimport authorization; never reuse this claim or an old permit.'};
}
