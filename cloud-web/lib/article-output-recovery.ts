import {wordRecoveryView} from './word-recovery';
import {db} from './test-store';
import {MAX_FILE} from './article-format';
import {rememberArticleClaimHashes} from './article-claim-credentials';

const schema=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const articleId={type:'string'},token={type:'string',maxLength:100};
export const outputRecoveryTools=[
 {name:'restart_article_output',description:'Replace a failed, unfinalized Word upload attempt under the current live claim. Supply the exact previous output identity and the corrected file declaration. Rotates the claim and output ID, retains old parts and an audit, preserves frozen text/images. Refused after any final Word, platform claim, upload attempt or draft evidence. Never authorizes browser upload or rewrites finished content.',inputSchema:schema({article_id:articleId,claim_token:token,expected_output_id:{type:'string'},expected_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},size:{type:'integer',minimum:1,maximum:MAX_FILE},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},chunks:{type:'integer',minimum:1,maximum:400},reason:{type:'string',enum:['invalid_word','damaged_parts','missing_local_file']}}),annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
 {name:'renew_article_claim',description:'Heartbeat of the current live main or Zhihu destination claim. Extends the same token only; never revives an expired lease, changes state, clears uploads, or permits browser reimport. Preserve the six-hour legacy lease while executors adopt heartbeat.',inputSchema:schema({article_id:articleId,platform:{type:'string',enum:['toutiao','zhihu']},claim_token:token}),annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
];
export const outputRecoveryNames=new Set(outputRecoveryTools.map(t=>t.name));
type Article={id:string;state:string;result_key:string|null;result_meta:string|null;draft_url:string|null;draft_readback?:string|null;claim_token:string|null;claim_expires:string|null;paragraphs:string;artifact_manifest:string|null;source_key:string;upload_guard_version:number};
function live(token:unknown,current:string|null,expires:string|null){return typeof token==='string'&&token===current&&!!expires&&Number.isFinite(Date.parse(expires))&&Date.parse(expires)>Date.now();}
const platformFence=`NOT EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.owner=articles.owner AND u.article_id=articles.id) AND NOT EXISTS(SELECT 1 FROM article_deliveries d WHERE d.owner=articles.owner AND d.article_id=articles.id)`;
export async function outputRecoveryCall(owner:string,row:Article,name:string,a:Record<string,unknown>){
 if(name==='renew_article_claim'){
  const destination=a.platform==='zhihu'?await db().prepare('SELECT * FROM article_deliveries WHERE owner=? AND article_id=? AND platform=?').bind(owner,row.id,'zhihu').first<Pick<Article,'state'|'claim_token'|'claim_expires'>>():a.platform==='toutiao'?row:null;
  if(!destination||!live(a.claim_token,destination.claim_token,destination.claim_expires)||!['processing','word_ready','toutiao_saving','pending','saving','needs_verification'].includes(destination.state))throw Error('认领已失效，不能续期');
  const now=new Date().toISOString(),expires=new Date(Math.max(Date.parse(destination.claim_expires!),Date.now()+6*3600000)).toISOString();
  const ended=`NOT EXISTS(SELECT 1 FROM article_upload_executor_ends e JOIN article_upload_attempts u ON u.id=e.attempt_id WHERE u.owner=? AND u.article_id=? AND u.platform=? AND NOT EXISTS(SELECT 1 FROM article_upload_attempts c WHERE c.previous_attempt_id=u.id))`;
  const query=a.platform==='zhihu'?'UPDATE article_deliveries SET claim_expires=? WHERE owner=? AND article_id=? AND platform=\'zhihu\' AND state=? AND claim_token=? AND claim_expires=? AND claim_expires>?':'UPDATE articles SET claim_expires=? WHERE owner=? AND id=? AND state=? AND claim_token=? AND claim_expires=? AND claim_expires>?';
  const changed=await db().prepare(query+" AND claim_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND "+ended).bind(expires,owner,row.id,destination.state,a.claim_token,destination.claim_expires,now,owner,row.id,a.platform).run();
  if(!changed.meta.changes)throw Error('任务已变化，请重新读取');
  return {article_id:row.id,platform:a.platform,renewed:true,expires,new_platform_upload_allowed:false};
 }
 if(name==='restart_article_output'&&await wordRecoveryView(owner,'article',row.id))throw Error('此 Word 已采用持久断点协议；仅续传同一输出，不能替换未知成品');
 if(name!=='restart_article_output')throw Error('Unknown output recovery operation');
 if(!live(a.claim_token,row.claim_token,row.claim_expires))throw Error('认领已失效，不能重做未完成Word');
 let previous;try{previous=JSON.parse(row.result_meta||'null');}catch{throw Error('未完成Word记录无效，请核对原任务');}
 if(!previous||a.expected_output_id!==previous.output_id||a.expected_sha256!==previous.sha256||!['processing','failed'].includes(row.state)||row.result_key||row.draft_url||row.draft_readback||row.upload_guard_version)throw Error('只能重做尚未交付平台的未完成Word');
 if(!['invalid_word','damaged_parts','missing_local_file'].includes(String(a.reason))||!Number.isSafeInteger(a.size)||Number(a.size)<1||Number(a.size)>MAX_FILE||!Number.isSafeInteger(a.chunks)||Number(a.chunks)<1||Number(a.chunks)>400||typeof a.sha256!=='string'||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error('Invalid output declaration');
 const id=crypto.randomUUID(),claim=crypto.randomUUID();
 await rememberArticleClaimHashes(owner,row.claim_token,claim);
 const now=new Date().toISOString(),expires=new Date(Date.now()+6*3600000).toISOString();
 const audit={previous_output_id:previous.output_id,previous_sha256:previous.sha256,reason:a.reason,restarted:now};
 const output={output_id:crypto.randomUUID(),size:a.size,sha256:a.sha256,chunks:a.chunks,parts:[],bytes:0,output_restarts:[...(previous.output_restarts||[]),audit]};
 const condition=`id=? AND owner=? AND state=? AND claim_token=? AND claim_expires=? AND claim_expires>? AND claim_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND result_meta=? AND result_key IS NULL AND draft_url IS NULL AND draft_readback IS NULL AND upload_guard_version=0 AND paragraphs=? AND artifact_manifest IS ? AND source_key=? AND ${platformFence} AND NOT EXISTS(SELECT 1 FROM word_recovery WHERE owner=articles.owner AND target_kind='article' AND target_id=articles.id)`;
 const values=[row.id,owner,row.state,row.claim_token,row.claim_expires,now,row.result_meta,row.paragraphs,row.artifact_manifest,row.source_key];
 const result=await db().batch([
  db().prepare(`INSERT OR IGNORE INTO article_output_restarts(id,owner,article_id,previous_output_id,previous_meta,new_output_id,reason,created) SELECT ?,owner,id,?,?,?,?,? FROM articles WHERE ${condition}`).bind(id,previous.output_id,row.result_meta,output.output_id,a.reason,now,...values),
  db().prepare(`UPDATE articles SET state='processing',claim_token=?,claim_expires=?,result_meta=?,error=NULL WHERE ${condition} AND EXISTS(SELECT 1 FROM article_output_restarts h WHERE h.id=? AND h.owner=articles.owner AND h.article_id=articles.id)`).bind(claim,expires,JSON.stringify(output),...values,id),
 ]);
 if(!result[1].meta.changes)throw Error('任务或平台记录已变化，未重做Word');
 return {article_id:row.id,restarted:true,claim_token:claim,expires,output,new_platform_upload_allowed:false};
}
