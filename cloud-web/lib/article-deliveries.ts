import {assertWordCredentialFree,redactWordCredentialText} from './word-credentials';
import {executionRecoveryGuidance} from './article-recovery-view';
import {rememberArticleClaimHashes} from './article-claim-credentials';
import {guardUploadStatus,uploadAttempts} from './article-upload-attempts';
import {parseArtifactManifest,verifyDraftReadback} from './article-manifest';
import {bucket} from './articles';
import {db} from './test-store';
import {canTransitionDeliveryStatus} from './article-state-transitions';
const platforms=['zhihu','baijiahao'];
export async function deliveryList(owner:string,articleId:string){return Promise.all((await db().prepare('SELECT platform,state,draft_url,message,updated,claim_expires,CASE WHEN claim_token IS NOT NULL THEN 1 ELSE 0 END AS claim_present,CASE WHEN readback IS NOT NULL THEN 1 ELSE 0 END AS verified_readback FROM article_deliveries WHERE owner=? AND article_id=? ORDER BY platform').bind(owner,articleId).all()).results.map(async(row:any)=>({...row,message:await redactWordCredentialText(owner,row.message)})));}
function draftUrl(platform:string,value:string){let u:URL;try{u=new URL(value);}catch{throw Error('Invalid draft URL');}if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)throw Error('Invalid draft URL');if(platform==='zhihu'&&u.hostname==='zhuanlan.zhihu.com'&&/^\/p\/[0-9]+\/edit$/.test(u.pathname))return u.href;throw Error('Draft destination not supported');}
export async function deliveryCall(owner:string,r:any,name:string,a:any){
 if(!platforms.includes(a.platform))throw Error('Invalid platform');
 const id=`${r.id}:${a.platform}`;
 let d:any=await db().prepare('SELECT * FROM article_deliveries WHERE id=? AND owner=?').bind(id,owner).first();
 if(name==='read_article_delivery')return d?{article_id:r.id,platform:d.platform,state:d.state,draft_url:d.draft_url,message:await redactWordCredentialText(owner,d.message),updated:d.updated,verified_readback:!!d.readback}:{article_id:r.id,platform:a.platform,state:a.platform==='baijiahao'?'blocked':'not_started',draft_url:null};
 if(a.platform==='baijiahao')throw Error('Baijiahao is not connected; no delivery allowed');
 if(!r.result_key)throw Error('Verified Word required before platform delivery');
 const liveArticle=`EXISTS(SELECT 1 FROM articles a WHERE a.id=article_deliveries.article_id AND a.owner=article_deliveries.owner AND a.state<>'deleting' AND a.result_key=? AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=a.id AND x.owner=a.owner))`;
 if(name==='claim_article_delivery'){
  const now=new Date().toISOString(),token=crypto.randomUUID(),expires=new Date(Date.now()+6*3600000).toISOString();
  if(!d){await db().prepare(`INSERT OR IGNORE INTO article_deliveries(id,owner,article_id,platform,state,updated) SELECT ?,owner,id,?,'pending',? FROM articles a WHERE id=? AND owner=? AND state<>'deleting' AND result_key=? AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=a.id AND x.owner=a.owner)`).bind(id,a.platform,now,r.id,owner,r.result_key).run();d=await db().prepare('SELECT * FROM article_deliveries WHERE id=? AND owner=?').bind(id,owner).first();}
  if(!d)throw Error('Article changed; reread before claiming delivery');
  if(d.state==='saved')return {claimed:false,state:d.state,draft_url:d.draft_url};
  const attempts=await uploadAttempts(owner,r.id);const attempt=attempts.filter(item=>item?.platform===a.platform).at(-1);const next=d.state==='pending'?(!attempt||attempt.state==='reserved'?'pending':'saving'):'needs_verification';
  await rememberArticleClaimHashes(owner,d.claim_token,token);
  const result=await db().prepare(`UPDATE article_deliveries SET state=?,claim_token=?,claim_expires=?,updated=? WHERE id=? AND owner=? AND state=? AND (claim_token IS NULL OR claim_expires<=?) AND ${liveArticle}`).bind(next,token,expires,now,id,owner,d.state,now,r.result_key).run();
  return result.meta.changes?{claimed:true,article_id:r.id,platform:a.platform,state:next,delivery_token:token,expires,draft_url:d.draft_url}:{claimed:false,state:d.state,recovery:executionRecoveryGuidance(a.platform)};
 }
 if(name==='record_article_delivery')await assertWordCredentialFree(owner,{message:a.message},[a.delivery_token]);
 if(name!=='record_article_delivery')throw Error('Unknown delivery operation');
 if(!d||!a.delivery_token||d.claim_token!==a.delivery_token||Date.parse(d.claim_expires)<=Date.now())throw Error('Delivery claim expired');
 if(!canTransitionDeliveryStatus(d.state,a.state))throw Error('Delivery transition rejected');
 const url=a.draft_url?draftUrl(a.platform,a.draft_url):d.draft_url;
 if(a.state==='saved'&&!url)throw Error('Saved requires verified private draft URL');
 const uploadReadback=await guardUploadStatus(owner,r,a.platform,a.state,url,a.message);const manifest=parseArtifactManifest(r.artifact_manifest);let readback=uploadReadback?JSON.stringify(uploadReadback):d.readback;
 if(manifest&&a.state==='saved'){const word=r.result_meta?JSON.parse(r.result_meta):null;if(!word?.verification||!await bucket().head(r.result_key))throw Error('已核验Word不可用，请只读取现有结果');readback=JSON.stringify(await verifyDraftReadback(manifest,JSON.parse(r.paragraphs),word.sha256,uploadReadback));}
 const now=new Date().toISOString();
 const result=await db().prepare(`UPDATE article_deliveries SET state=?,draft_url=?,message=?,updated=?,claim_expires=?,readback=? WHERE id=? AND owner=? AND state=? AND claim_token=? AND claim_expires>? AND ${liveArticle} AND NOT EXISTS(SELECT 1 FROM article_upload_executor_ends e JOIN article_upload_attempts u ON u.id=e.attempt_id WHERE u.owner=article_deliveries.owner AND u.article_id=article_deliveries.article_id AND u.platform=article_deliveries.platform AND NOT EXISTS(SELECT 1 FROM article_upload_attempts c WHERE c.previous_attempt_id=u.id))`).bind(a.state,url,String(a.message||'').slice(0,300),now,a.state==='saving'?d.claim_expires:now,readback||null,id,owner,d.state,a.delivery_token,now,r.result_key).run();
 if(!result.meta.changes)throw Error('Delivery changed; reread before retry');return {article_id:r.id,platform:a.platform,state:a.state,draft_url:url};
}
