import {db} from './test-store';
import {readiness,dispatch} from './events';
import {article} from './articles';
import {assertArticleProcessingAllowed} from './article-output-mode';
import {articleRecoveryView} from './article-recovery-view';

// Persist each notification identity, including ambiguous/abandoned sends. A new explicit
// wake has a new event ID, but always points at the same atomically claimed article.
export async function articleHandoff(owner:string,id:string) {
 return db().prepare('SELECT state,created,updated FROM article_handoffs WHERE owner=? AND article_id=? ORDER BY rowid DESC LIMIT 1').bind(owner,id).first();
}
export async function notifyArticle(owner:string,id:string) {
 const row=await article(owner,id);await assertArticleProcessingAllowed(owner,row);
 const deliveries=(await db().prepare('SELECT state,platform,claim_token,claim_expires FROM article_deliveries WHERE owner=? AND article_id=?').bind(owner,id).all()).results;
 const recovery=articleRecoveryView(row,deliveries as Parameters<typeof articleRecoveryView>[1]);
 if(!recovery.can_notify)return {id,state:recovery.lease_expires?'任务仍由执行者占用，请先核对执行情况':'当前任务无需重新通知',recovery};
 if(!(await readiness(owner,'article.submitted')).connected)throw Error('文章处理连接尚未启用，文章已安全保存');
 const now=new Date().toISOString(),wake=crypto.randomUUID(),eventID='article_wake_'+wake,expires=new Date(Date.now()+60000).toISOString();
 const outcomes=await db().batch([
  db().prepare("UPDATE article_handoffs SET state='unknown',updated=? WHERE owner=? AND article_id=? AND state='sending' AND expires<=?").bind(now,owner,id,now),
  db().prepare(`INSERT OR IGNORE INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires)
   SELECT ?,owner,id,?,'sending',?,?,? FROM articles WHERE id=? AND owner=? AND state=? AND state NOT IN ('deleting','text_saved')
   AND (state='completed' OR claim_token IS NULL OR claim_expires<=?)
   AND NOT EXISTS(SELECT 1 FROM article_deliveries d WHERE d.owner=articles.owner AND d.article_id=articles.id AND d.platform='zhihu' AND d.state<>'saved' AND d.claim_token IS NOT NULL AND d.claim_expires>?)
   AND NOT EXISTS(SELECT 1 FROM article_handoffs h WHERE h.owner=articles.owner AND h.article_id=articles.id AND h.state='sending')`).bind(wake,eventID,now,now,expires,id,owner,row.state,now,now),
  db().prepare("UPDATE articles SET state='queued' WHERE id=? AND owner=? AND state='uploaded' AND EXISTS(SELECT 1 FROM article_handoffs h WHERE h.id=? AND h.owner=articles.owner AND h.state='sending')").bind(id,owner,wake),
 ]);
 if(!outcomes[1].meta.changes)return {id,state:'通知正在发送或任务已接手，请刷新核对',notification:await articleHandoff(owner,id)};
 let state='事件发送未确认，文章与已有成果已保留';
 try {state=await dispatch(owner,id,now,'article.submitted',eventID);}catch{/* A durable unknown wake is recoverable without regenerating or importing. */}
 const sent=state.startsWith('事件已送达');
 await db().prepare("UPDATE article_handoffs SET state=?,updated=? WHERE id=? AND owner=? AND state='sending'").bind(sent?'delivered':'unknown',new Date().toISOString(),wake,owner).run();
 await db().prepare(`UPDATE articles SET error=? WHERE id=? AND owner=? AND state='queued'
  AND EXISTS(SELECT 1 FROM article_handoffs h WHERE h.id=? AND h.owner=articles.owner AND h.article_id=articles.id AND h.state=?)
  AND (SELECT h.id FROM article_handoffs h WHERE h.owner=articles.owner AND h.article_id=articles.id ORDER BY h.rowid DESC LIMIT 1)=?`).bind(sent?null:'通知未确认，可请求小鱼继续处理；原稿与已有成果已保留',id,owner,wake,sent?'delivered':'unknown',wake).run();
 return {id,state:sent?'已通知小鱼读取同一任务；尚未确认接手':'通知未确认，可刷新核对后再次通知',notification:await articleHandoff(owner,id)};
}

// Resume an existing ambiguous wake under the SAME immutable event ID. Does not
// create a second help request. Callers must inspect the original article first.
export async function reconcileArticleHandoff(owner:string,id:string,handoffID:string){
 const row=await article(owner,id);await assertArticleProcessingAllowed(owner,row);
 const h=await db().prepare('SELECT * FROM article_handoffs WHERE owner=? AND article_id=? AND id=?').bind(owner,id,handoffID).first<{id:string;event_id:string;state:string;created:string;expires:string}>();
 if(!h||h.state==='delivered'||row.claim_token)return {notification:h};
 if(!(await readiness(owner,'article.submitted')).connected)throw Error('文章处理连接尚未启用，文章已安全保存');
 const stamp=new Date().toISOString();
 const acquired=await db().prepare("UPDATE article_handoffs SET state='sending',updated=?,expires=? WHERE id=? AND owner=? AND article_id=? AND (state='unknown' OR (state='sending' AND expires<=?)) AND NOT EXISTS(SELECT 1 FROM articles WHERE id=? AND owner=? AND claim_token IS NOT NULL)").bind(stamp,new Date(Date.now()+60000).toISOString(),h.id,owner,id,stamp,id,owner).run();
 if(!acquired.meta.changes)return {notification:h};
 let delivered=false;try{delivered=(await dispatch(owner,id,h.created,'article.submitted',h.event_id)).startsWith('事件已送达');}catch{}
 await db().prepare("UPDATE article_handoffs SET state=?,updated=? WHERE id=? AND owner=? AND state='sending'").bind(delivered?'delivered':'unknown',new Date().toISOString(),h.id,owner).run();
 return {notification:await articleHandoff(owner,id),same_event:true};
}
