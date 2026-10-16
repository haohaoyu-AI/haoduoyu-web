import {db} from './test-store';
import {hashText} from './writing-input';
import {protectedArticleSql, visibleArticleSql} from './article-list-policy';

export class WorkspaceError extends Error {}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// Expired credentials do not establish that an external executor stopped.
// This stricter visibility guard never changes processing or upload permission.
export function unsettledArticleSql(a='articles') {
 return `(${protectedArticleSql(a)} OR (${a}.claim_token IS NOT NULL AND ${a}.state NOT IN ('completed','text_saved'))
 OR EXISTS(SELECT 1 FROM article_deliveries d WHERE d.owner=${a}.owner AND d.article_id=${a}.id AND d.claim_token IS NOT NULL AND d.state<>'saved')
 OR EXISTS(SELECT 1 FROM word_serial_slots s WHERE s.owner=${a}.owner AND s.target_kind='article' AND s.target_id=${a}.id)
 OR EXISTS(SELECT 1 FROM word_attempts w WHERE w.owner=${a}.owner AND w.target_kind='article' AND w.target_id=${a}.id AND w.state IN ('running','stop_requested','waiting_safe_stop'))
 OR EXISTS(SELECT 1 FROM word_recovery w WHERE w.owner=${a}.owner AND w.target_kind='article' AND w.target_id=${a}.id AND ${a}.result_key IS NULL AND (w.status IN ('running','queued','stop_requested','waiting_safe_stop') OR w.token_hash IS NOT NULL))
 OR EXISTS(SELECT 1 FROM dedao_items i JOIN dedao_batches b ON b.owner=i.owner AND b.id=i.batch_id LEFT JOIN dedao_batch_runtime n ON n.owner=b.owner AND n.batch_id=b.id WHERE i.owner=${a}.owner AND i.article_id=${a}.id AND (b.state<>'completed' OR CASE WHEN n.runtime='native_codex' THEN n.safe_boundary=0 ELSE b.executor_ended=0 END))
 )`;
}
// Visibility has an additional orchestration fence. It is intentionally separate
// from the shared Word/platform completion check: an active cloud task must be
// allowed to finish itself before it can be safely hidden.
export function workspaceUnsettledArticleSql(a='articles') {
 return `(${unsettledArticleSql(a)} OR EXISTS(SELECT 1 FROM dedao_cloud_requests c WHERE c.owner=${a}.owner AND c.article_id=${a}.id AND (c.state<>'completed' OR c.end_reference IS NULL OR length(trim(c.end_reference))=0 OR EXISTS(SELECT 1 FROM dedao_cloud_actions ca WHERE ca.owner=c.owner AND ca.task_id=c.id AND ca.state<>'confirmed'))))`;
}
export function workspaceVisibleSql(a='articles') {
 return `(NOT EXISTS(SELECT 1 FROM article_workspace_archives v WHERE v.owner=${a}.owner AND v.article_id=${a}.id) OR ${workspaceUnsettledArticleSql(a)})`;
}
export async function workspaceInventory(owner:string) {
 const rows=(await db().prepare(`SELECT id,title,state,created,CASE WHEN ${workspaceUnsettledArticleSql()} THEN 1 ELSE 0 END AS protected,
 CASE WHEN ${workspaceVisibleSql()} THEN 0 ELSE 1 END AS archived FROM articles WHERE owner=? AND ${visibleArticleSql()} ORDER BY created DESC,id DESC LIMIT 101`).bind(owner).all<{id:string;title:string;state:string;created:string;protected:number;archived:number}>()).results;
 const total=(await db().prepare('SELECT count(*) AS n FROM articles WHERE owner=? AND '+visibleArticleSql()).bind(owner).first<{n:number}>())?.n||0;
 return {owner_scope:await hashText('article-data-owner:'+owner),items:rows.slice(0,100),total,truncated:rows.length>100,permanent_delete_available:false,notice:'清空仅收起已结束文章。原文、Word、草稿链接和历史统计保留，可在文章数据恢复；处理尚未安全结束的文章保留。'};
}
export async function changeWorkspace(owner:string,input:Record<string,unknown>) {
 const {action,request_key,article_ids}=input;
 if(!['archive','restore'].includes(String(action))||typeof request_key!=='string'||!uuid.test(request_key)||!Array.isArray(article_ids)||!article_ids.length||article_ids.length>100||article_ids.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(article_ids).size!==article_ids.length)throw new WorkspaceError('操作信息无效，请重新读取文章列表');
 const ids=article_ids as string[],payload=JSON.stringify({action,ids:[...ids].sort()});
 const prior=await db().prepare('SELECT payload,result FROM article_workspace_requests WHERE owner=? AND request_key=?').bind(owner,request_key).first<{payload:string;result:string}>();
 if(prior){if(prior.payload!==payload)throw new WorkspaceError('同一次操作不能更改文章范围');const result=JSON.parse(prior.result);return {...result,blocked:ids.filter(id=>!result.changed.includes(id))};}
 const stamp=new Date().toISOString();
 const scope='('+ids.map(()=>'?').join(',')+')';
 // The receipt captures exactly the rows accepted by the mutation in the same
 // D1 transaction. Late writers, other owners and repeated requests cannot
 // bypass the guard by changing state between a preview and a click.
 const statements=action==='archive'?[
  db().prepare(`INSERT OR IGNORE INTO article_workspace_archives(owner,article_id,archived_at,request_key) SELECT owner,id,?,? FROM articles WHERE owner=? AND id IN ${scope} AND ${visibleArticleSql()} AND NOT ${workspaceUnsettledArticleSql()} AND NOT EXISTS(SELECT 1 FROM article_workspace_requests WHERE owner=? AND request_key=?)`).bind(stamp,request_key,owner,...ids,owner,request_key),
  db().prepare(`INSERT OR IGNORE INTO article_workspace_requests(owner,request_key,payload,result,created) SELECT ?,?,?,json_object('changed',json(COALESCE((SELECT json_group_array(article_id) FROM article_workspace_archives WHERE owner=? AND request_key=?),'[]')),'action',?),?`).bind(owner,request_key,payload,owner,request_key,action,stamp),
 ]:[
  db().prepare(`INSERT OR IGNORE INTO article_workspace_requests(owner,request_key,payload,result,created) SELECT ?,?,?,json_object('changed',json(COALESCE((SELECT json_group_array(article_id) FROM article_workspace_archives WHERE owner=? AND article_id IN ${scope}),'[]')),'action',?),?`).bind(owner,request_key,payload,owner,...ids,action,stamp),
  db().prepare(`DELETE FROM article_workspace_archives WHERE owner=? AND article_id IN (SELECT value FROM json_each((SELECT json_extract(result,'$.changed') FROM article_workspace_requests WHERE owner=? AND request_key=? AND payload=?)))`).bind(owner,owner,request_key,payload),
 ];
 await db().batch(statements);
 const saved=await db().prepare('SELECT payload,result FROM article_workspace_requests WHERE owner=? AND request_key=?').bind(owner,request_key).first<{payload:string;result:string}>();
 if(!saved||saved.payload!==payload)throw new WorkspaceError('操作结果未确认，请读取同一次操作');
 return {...JSON.parse(saved.result),blocked:ids.filter(id=>!(JSON.parse(saved.result).changed as string[]).includes(id))};
}
