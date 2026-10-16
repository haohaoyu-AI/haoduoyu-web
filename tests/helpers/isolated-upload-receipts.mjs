// Synthetic SQLite fixture for capture guards; never evidence of platform I/O.
import {createHash,randomUUID} from 'node:crypto';
export function seedSettledUploadReceipts(sql,{owner,articleId,sha,size,title,readbacks,omitEnd=[]}){
 const result=[];
 for(const platform of ['toutiao','zhihu']){
  const account=platform==='toutiao'?'61556093362':'ren-zhe-ai-chi-yu-52',readback=JSON.stringify(readbacks[platform]),at=new Date().toISOString();
  const u={id:randomUUID(),revision:1,owner,article_id:articleId,platform,target_account:account,word_sha256:sha,word_size:size,authorization_kind:'new_word',claim_hash:'a'.repeat(64),preflight:'{}',baseline:JSON.stringify({title,paragraphs:[],images:[]}),state:'verified',editor_urls:JSON.stringify([readbacks[platform].draft_url]),readback,created:at,consumed_at:at,updated:at};
  const keys=Object.keys(u);sql.prepare('INSERT INTO article_upload_attempts('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>u[k]));
  const all=sql.prepare('SELECT * FROM article_upload_attempts WHERE id=?').get(u.id),columns=['id','revision','owner','article_id','platform','target_account','word_sha256','word_size','authorization_kind','claim_hash','preflight','baseline','state','editor_urls','readback','created','consumed_at','updated','attempt_version','previous_attempt_id','authorization_key','reimport_authorization','consume_token_sha256','confirmation_message_id'];
  const snapshot=JSON.stringify(Object.fromEntries(columns.map(k=>[k,all[k]]))),digest=createHash('sha256').update(snapshot).digest('hex');
  const end=()=>sql.prepare('INSERT INTO article_upload_executor_ends(attempt_id,owner,article_id,platform,attempt_sha256,attempt_snapshot,claim_sha256,execution_end_reference,created) VALUES(?,?,?,?,?,?,?,?,?)').run(u.id,owner,articleId,platform,digest,snapshot,u.claim_hash,'OFFLINE actual-fixture-end '+platform,new Date().toISOString());
  if(!omitEnd.includes(platform))end();result.push({platform,end});
 }
 return result;
}
export function syntheticReadbacks({sha,title,at=new Date().toISOString(),toutiaoId='1234567890123456789',zhihuId='123456789'}){
 return Object.fromEntries(['toutiao','zhihu'].map(platform=>[platform,{verification_method:'agent_readback',word_sha256:sha,title,target_account:platform==='toutiao'?'61556093362':'ren-zhe-ai-chi-yu-52',draft_url:platform==='toutiao'?`https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=${toutiaoId}`:`https://zhuanlan.zhihu.com/p/${zhihuId}/edit`,independently_reopened:true,saved_indicator_observed:true,images_loaded:true,paragraphs:[],images:[],saved_at:at,reopened_at:at,read_at:at}]));
}
