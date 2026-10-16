import {db} from './test-store';
import {textOnlyArticle} from './article-output-mode';
import {articleContinuation} from './article-recovery-view';

// Durable identity diagnostics only. A delivered handoff means callback acceptance;
// this table has no receiver/consumption receipt and these reads never create one.
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const annotations={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
export const articleEventHandoffTools=[
 {name:'list_article_event_handoffs',description:'Read bounded pages of this authenticated owner\u2019s exact persisted article.submitted event/article identities for still-existing same-owner articles. Default scope is unfinished manual-intake work, including protected in-flight/recovery states; all scope is historical diagnostics only. Same-article wakes remain separate. No receiver consumption receipt exists: delivered is callback acceptance only. Never infer the triggering event of an input-empty run, choose the latest article, execute history, claim, replay or import from this list.',inputSchema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:25},cursor:{type:'string',maxLength:2048},scope:{type:'string',enum:['unfinished','all']}},additionalProperties:false},annotations},
 {name:'read_article_event_handoff',description:'Read one exact persisted article.submitted event-to-article binding under normal owner authentication. Supply exactly one event_id or handoff_id; optionally verify expected_article_id. This is persisted identity, not the automation\u2019s original tool result or a consumption receipt. Terminal/in-flight/history protections remain read-only. No claim token authentication, execution, replay or import permission.',inputSchema:{type:'object',properties:{event_id:{type:'string',minLength:1,maxLength:200,pattern:'^[A-Za-z0-9_-]+$'},handoff_id:uuid,expected_article_id:uuid},oneOf:[{required:['event_id'],not:{required:['handoff_id']}},{required:['handoff_id'],not:{required:['event_id']}}],additionalProperties:false},annotations},
];
export class ArticleEventHandoffError extends Error {}
const invalid=()=>new ArticleEventHandoffError('通知诊断参数无效');
function object(value:unknown,allowed:string[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw invalid();
 return value as Record<string,unknown>;
}
// Same intake/lineage predicate as article-upload-attempts.ts manualSourceFence.
// Source bytes and separate upload permission are deliberately not asserted here.
const manualSource=`a.source_key='articles/'||a.id||'/source'
 AND NOT EXISTS(SELECT 1 FROM writing_runs w WHERE w.owner=a.owner AND w.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM editorial_runs_v3 w WHERE w.owner=a.owner AND w.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM editorial_flows w WHERE w.owner=a.owner AND w.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM outline_flows w WHERE w.owner=a.owner AND w.article_id=a.id)`;
const unfinished=`a.state NOT IN ('text_saved','deleting') AND (${manualSource})
 AND COALESCE(json_extract(CASE WHEN json_valid(a.artifact_manifest) THEN a.artifact_manifest ELSE '{}' END,'$.output_mode'),'')<>'text_only'
 AND (a.state<>'completed' OR NOT EXISTS(SELECT 1 FROM article_deliveries d WHERE d.owner=a.owner AND d.article_id=a.id AND d.platform='zhihu' AND d.state='saved'))`;
const projection=`SELECT h.id AS handoff_id,h.owner,h.article_id,h.event_id,h.state AS handoff_state,h.created,h.updated,h.expires,
 a.state AS article_state,a.artifact_manifest,(${manualSource}) AS manual_source,
 CASE WHEN a.claim_token IS NOT NULL THEN 1 ELSE 0 END AS claim_present,a.claim_expires,
 CASE WHEN a.result_key IS NOT NULL THEN 1 ELSE 0 END AS has_word,
 CASE WHEN a.result_meta IS NOT NULL OR a.artifact_manifest IS NOT NULL THEN 1 ELSE 0 END AS has_output_identity,
 CASE WHEN a.draft_url IS NOT NULL OR a.draft_readback IS NOT NULL THEN 1 ELSE 0 END AS main_draft_present
 FROM article_handoffs h JOIN articles a ON a.id=h.article_id AND a.owner=h.owner WHERE h.owner=?`;
type Handoff={handoff_id:string;owner:string;article_id:string;event_id:string;handoff_state:string;created:string;updated:string;expires:string;article_state:string;artifact_manifest:string|null;manual_source:number;claim_present:number;claim_expires:string|null;has_word:number;has_output_identity:number;main_draft_present:number};
type Phase={platform:string;state:string;claim_present:number;claim_expires:string|null;draft_present:number};
type History={platform:string;attempt_count:number;uncertain_count:number;unended_consumed:number};
type Cursor={v:1;owner:string;created:string;id:string;scope:string};
function encodeCursor(value:Cursor){return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decodeCursor(value:unknown,owner:string,scope:string):Cursor{
 try{
  if(typeof value!=='string'||!value||value.length>2048||!/^[A-Za-z0-9_-]+$/.test(value))throw invalid();
  const raw=value.replaceAll('-','+').replaceAll('_','/');
  const c=object(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw),ch=>ch.charCodeAt(0)))),['v','owner','created','id','scope']);
  if(c.v!==1||c.owner!==owner||c.scope!==scope||typeof c.created!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(c.created)||!Number.isFinite(Date.parse(c.created))||typeof c.id!=='string'||!uuidPattern.test(c.id))throw invalid();
  return c as Cursor;
 }catch{throw invalid();}
}
function lease(phase:Phase,now:number){
 if(!phase.claim_present)return 'none';
 const expiry=Date.parse(phase.claim_expires||'');
 return !Number.isFinite(expiry)?'invalid':expiry>now?'live':'expired';
}
async function view(row:Handoff,now:number){
 const deliveries=(await db().prepare(`SELECT platform,state,CASE WHEN claim_token IS NOT NULL THEN 1 ELSE 0 END AS claim_present,claim_expires,
 CASE WHEN draft_url IS NOT NULL OR readback IS NOT NULL THEN 1 ELSE 0 END AS draft_present FROM article_deliveries WHERE owner=? AND article_id=? ORDER BY platform`).bind(row.owner,row.article_id).all<Phase>()).results;
 const history=(await db().prepare(`SELECT u.platform,count(*) AS attempt_count,sum(CASE WHEN u.state<>'verified' THEN 1 ELSE 0 END) AS uncertain_count,
 sum(CASE WHEN u.consumed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM article_upload_executor_ends e WHERE e.attempt_id=u.id AND e.owner=u.owner AND e.article_id=u.article_id AND e.platform=u.platform) THEN 1 ELSE 0 END) AS unended_consumed
 FROM article_upload_attempts u WHERE u.owner=? AND u.article_id=? GROUP BY u.platform ORDER BY u.platform`).bind(row.owner,row.article_id).all<History>()).results;
 const output_mode=textOnlyArticle({state:row.article_state,artifact_manifest:row.artifact_manifest})?'text_only':null;
 const continuation=articleContinuation({state:row.article_state,has_word:!!row.has_word,output_mode},deliveries);
 const phases:Phase[]=[...(row.article_state==='completed'?[]:[{platform:'toutiao',state:row.article_state,claim_present:row.claim_present,claim_expires:row.claim_expires,draft_present:row.main_draft_present}]),...deliveries.filter(d=>d.platform==='zhihu'&&d.state!=='saved')];
 const leases=phases.map(p=>({platform:p.platform,status:lease(p,now),expires:p.claim_expires}));
 let assessment='review_existing_progress';
 if(output_mode||!row.manual_source||row.article_state==='deleting')assessment='protected_source';
 else if(!continuation.remaining_platforms.length)assessment='protected_complete';
 else if(leases.some(p=>p.status==='live'))assessment='in_flight';
 else if(leases.some(p=>p.status==='invalid'||p.status==='expired')||history.some(h=>h.unended_consumed)||phases.some(p=>p.draft_present)||history.some(h=>continuation.remaining_platforms.some(platform=>platform===h.platform)&&h.uncertain_count))assessment='recovery_required';
 else if(row.article_state==='completed')assessment='continuation_needed';
 else if(row.article_state==='queued'&&!row.claim_present&&!row.has_word&&!row.has_output_identity&&!deliveries.length&&!history.length)assessment='pending_unclaimed';
 return {handoff_id:row.handoff_id,event_id:row.event_id,article_id:row.article_id,owner:row.owner,source:'persisted_article_handoff',event_name:'article.submitted',data:{article_id:row.article_id},handoff_state:row.handoff_state,created:row.created,updated:row.updated,expires:row.expires,
  delivery_semantics:'transport_state_only',delivered_means:'callback_acceptance_only',receiver_ack:'unavailable',handoff_consumption:'not_recorded',source_kind:row.manual_source?'manual_intake_lineage':'other_or_generated',article_state:row.article_state,output_mode,has_word:!!row.has_word,assessment,leases,upload_history:history,
  continuation:{remaining_platforms:continuation.remaining_platforms,reuse_existing_word:continuation.reuse_existing_word,next_tool:null,next_platform:null,new_platform_upload_allowed:false},
  read_only:true,claim_performed:false,dispatch_performed:false,execute_import:false,new_platform_upload_allowed:false};
}
export async function articleEventHandoffCall(owner:string,name:string,value:unknown){
 if(typeof owner!=='string'||!owner)throw new ArticleEventHandoffError('需要正常本人鉴权');
 const now=Date.now(),common={version:1,read_at:new Date(now).toISOString(),read_only:true,record_scope:'Persisted handoffs joined to still-existing same-owner articles; missing or mismatched article ownership is not returned.',receiver_ack:'unavailable',handoff_consumption:'not_recorded',claim_performed:false,dispatch_performed:false,execute_import:false,automatic_execution_allowed:false,consistency:'Read-only snapshots; no run-to-event binding is inferred. Any later authorized mutation must revalidate the current business claim and upload fences.'};
 if(name==='list_article_event_handoffs'){
  const a=object(value,['limit','cursor','scope']),limit=a.limit===undefined?25:a.limit,scope=a.scope===undefined?'unfinished':a.scope;
  if(typeof limit!=='number'||!Number.isSafeInteger(limit)||limit<1||limit>25||!['unfinished','all'].includes(scope as string))throw invalid();
  const cursor=a.cursor===undefined?null:decodeCursor(a.cursor,owner,scope as string);
  const rows=(await db().prepare(projection+(scope==='unfinished'?` AND (${unfinished})`:'')+(cursor?' AND (h.created>? OR (h.created=? AND h.id>?))':'')+' ORDER BY h.created ASC,h.id ASC LIMIT ?').bind(owner,...(cursor?[cursor.created,cursor.created,cursor.id]:[]),limit+1).all<Handoff>()).results;
  const page=rows.slice(0,limit),last=page.at(-1);
  return {...common,source:'article_handoffs',scope,items:await Promise.all(page.map(row=>view(row,now))),next_cursor:rows.length>limit&&last?encodeCursor({v:1,owner,scope:scope as string,created:last.created,id:last.handoff_id}):null};
 }
 if(name==='read_article_event_handoff'){
  const a=object(value,['event_id','handoff_id','expected_article_id']);
  if((a.event_id!==undefined)===(a.handoff_id!==undefined)||(a.event_id!==undefined&&(typeof a.event_id!=='string'||!a.event_id||a.event_id.length>200||!/^[A-Za-z0-9_-]+$/.test(a.event_id)))||(a.handoff_id!==undefined&&(typeof a.handoff_id!=='string'||!uuidPattern.test(a.handoff_id)))||(a.expected_article_id!==undefined&&(typeof a.expected_article_id!=='string'||!uuidPattern.test(a.expected_article_id))))throw invalid();
  const rows=(await db().prepare(projection+(a.event_id!==undefined?' AND h.event_id=?':' AND h.id=?')+' LIMIT 2').bind(owner,a.event_id??a.handoff_id).all<Handoff>()).results;
  if(rows.length!==1)throw new ArticleEventHandoffError('没有找到可核验文章归属的唯一通知记录');
  if(a.expected_article_id!==undefined&&a.expected_article_id!==rows[0].article_id)throw new ArticleEventHandoffError('通知与预期文章编号不一致');
  return {...common,item:await view(rows[0],now)};
 }
 throw invalid();
}
