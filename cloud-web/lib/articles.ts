import {workspaceVisibleSql} from './article-workspace';
import {redactWordCredentialText,WORD_CREDENTIAL_REDACTED} from './word-credentials';
import {listScopeSql, protectedArticleSql, visibleArticleSql} from './article-list-policy';
import {textOnlyArticle} from './article-output-mode';
import {articleRecoveryView} from './article-recovery-view';
import {wordClaimRecoveryDisposition} from './article-word-claim-guard';
import {uploadProgress,uploadProgressFromRows} from './article-upload-diagnostics';
import {deliveryList} from './article-deliveries';
import {optionalWordProgress} from './word-progress';
import {env} from 'cloudflare:workers';import {db} from './test-store';import {parseArticle,MAX_FILE} from './article-format';
// Log only fixed categories. Storage errors can include SQL, frozen text or
// credentials; their messages and stacks never belong in browser/read logs.
export function articleListReadFailureCode(error:unknown){
 const value=error&&typeof error==='object'?error as {name?:unknown;message?:unknown}:{};
 const message=typeof value.message==='string'?value.message:'';
 if(value.name==='SyntaxError')return 'stored_json_invalid';
 if(/too many sql variables/i.test(message))return 'query_bind_limit';
 if(/expression tree is too large/i.test(message))return 'query_expression_limit';
 if(/too many concurrent|concurrent.{0,80}limit/i.test(message))return 'query_concurrency_limit';
 if(/sub.?request.{0,100}limit|too many.{0,80}(queries|requests)|maximum.{0,80}(queries|sub.?requests)/i.test(message))return 'query_budget_limit';
 if(/CPU.{0,40}(limit|exceed)/i.test(message))return 'cpu_limit';
 if(/time.?out|timed out|deadline/i.test(message))return 'read_timeout';
 if(/D1_ERROR|SQLITE_|storage unavailable/i.test(message))return 'storage_read_failed';
 return 'read_failed';
}
export function bucket(){if(!env.BUCKET)throw Error('文件存储暂不可用');return env.BUCKET;}
export async function article(owner:string,id:string){if(!/^[0-9a-f-]{36}$/.test(id))throw Error('无效任务编号');const row:any=await db().prepare('SELECT * FROM articles WHERE id=? AND owner=?').bind(id,owner).first();if(!row||row.state==='deleting')throw Error('没有找到此任务');return row;}
async function sectionedListMetadata(owner:string,rows:any[]){
 const result=new Map<string,{error:unknown;deliveries:any[];upload_progress:any[]}>();
 if(!rows.length)return result;
 const ids=rows.map(r=>r.id),scope=`owner=? AND article_id IN (${ids.map(()=>'?').join(',')})`,bindings=[owner,...ids];
 // Each page uses three metadata reads rather than three per article. The
 // diagnostic window preserves the original per-article newest-50 boundary.
 const [deliveryRows,attemptRows,diagnosticRows]=await Promise.all([
  db().prepare(`SELECT article_id,platform,state,draft_url,message,updated,claim_expires,CASE WHEN claim_token IS NOT NULL THEN 1 ELSE 0 END AS claim_present,CASE WHEN readback IS NOT NULL THEN 1 ELSE 0 END AS verified_readback FROM article_deliveries WHERE ${scope} ORDER BY platform`).bind(...bindings).all<any>(),
  db().prepare(`SELECT article_id,id AS attempt_id,platform,state,attempt_version,consumed_at,editor_urls,created,updated FROM article_upload_attempts WHERE ${scope} ORDER BY attempt_version DESC`).bind(...bindings).all<any>(),
  db().prepare(`SELECT article_id,operation_id,platform,attempt_id,stage,outcome,cause,observed_at,created FROM (SELECT article_id,rowid AS diagnostic_rowid,id AS operation_id,platform,attempt_id,stage,outcome,cause,observed_at,created,ROW_NUMBER() OVER (PARTITION BY article_id ORDER BY observed_at DESC,rowid DESC) AS diagnostic_rank FROM article_upload_diagnostics WHERE ${scope}) WHERE diagnostic_rank<=50 ORDER BY observed_at DESC,diagnostic_rowid DESC`).bind(...bindings).all<any>()
 ]);
 const grouped=(values:any[],id:string)=>values.filter(value=>value.article_id===id).map(({article_id,...value})=>value);
 // Share the owner credential lookup while preserving explicit current tokens
 // and the redactor's 32-token bound. No source/body/claim is projected publicly.
 for(let at=0;at<rows.length;at+=30){
  const page=rows.slice(at,at+30),deliveries=page.map(r=>grouped(deliveryRows.results,r.id));
  const text=await redactWordCredentialText(owner,page.map((r,index)=>({error:r.error,messages:deliveries[index].map(d=>d.message)})),page.map(r=>r.claim_token));
  for(let index=0;index<page.length;index++){
   const r=page[index],clean=Array.isArray(text)?text[index]:null;
   result.set(r.id,{error:clean?.error??(r.error==null?r.error:WORD_CREDENTIAL_REDACTED),deliveries:deliveries[index].map((d,j)=>({...d,message:clean?.messages?.[j]??(d.message==null?d.message:WORD_CREDENTIAL_REDACTED)})),upload_progress:uploadProgressFromRows(grouped(attemptRows.results,r.id),grouped(diagnosticRows.results,r.id))});
  }
 }
 return result;
}
export async function articleList(owner:string,limit=20,ids?:string[],sectioned=false){if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('列表数量无效');if(ids&&!ids.length)return [];const rows=(await db().prepare(`SELECT ${sectioned?`CASE WHEN ${protectedArticleSql()} THEN 'work' ELSE 'recent' END AS list_section,`:''}id,title,filename,created,state,error,result_key,result_meta,paragraphs,draft_url,source_key,claim_token,claim_expires,artifact_manifest,
 CASE WHEN draft_readback IS NOT NULL THEN 1 ELSE 0 END AS toutiao_verified_readback,
 (SELECT h.state FROM article_handoffs h WHERE h.owner=articles.owner AND h.article_id=articles.id ORDER BY h.rowid DESC LIMIT 1) AS notification_state,
 (SELECT h.updated FROM article_handoffs h WHERE h.owner=articles.owner AND h.article_id=articles.id ORDER BY h.rowid DESC LIMIT 1) AS notification_updated,
 (SELECT h.created FROM article_handoffs h WHERE h.owner=articles.owner AND h.article_id=articles.id ORDER BY h.rowid DESC LIMIT 1) AS notification_created,
 (SELECT h.expires FROM article_handoffs h WHERE h.owner=articles.owner AND h.article_id=articles.id ORDER BY h.rowid DESC LIMIT 1) AS notification_expires,
 (EXISTS(SELECT 1 FROM writing_runs w WHERE w.article_id=articles.id AND w.owner=articles.owner) OR EXISTS(SELECT 1 FROM editorial_runs_v3 w WHERE w.article_id=articles.id AND w.owner=articles.owner) OR EXISTS(SELECT 1 FROM editorial_flows w WHERE w.article_id=articles.id AND w.owner=articles.owner)) AS generated,
 CASE WHEN state IN ('uploaded','failed','queued','deleting')
   AND (state<>'queued' OR (claim_token IS NULL AND claim_expires IS NULL)) AND result_key IS NULL AND result_meta IS NULL
   AND artifact_manifest IS NULL AND draft_url IS NULL AND draft_readback IS NULL
   AND source_key='articles/'||id||'/source'
   AND NOT EXISTS(SELECT 1 FROM writing_runs w WHERE w.article_id=articles.id AND w.owner=articles.owner)
   AND NOT EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=articles.id AND d.owner=articles.owner)
   AND NOT EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.article_id=articles.id AND u.owner=articles.owner)
   AND NOT EXISTS(SELECT 1 FROM editorial_runs_v3 w WHERE w.article_id=articles.id AND w.owner=articles.owner)
   AND NOT EXISTS(SELECT 1 FROM editorial_flows w WHERE w.article_id=articles.id AND w.owner=articles.owner)
   AND NOT EXISTS(SELECT 1 FROM outline_flows w WHERE w.article_id=articles.id AND w.owner=articles.owner)
   THEN 1 ELSE 0 END AS deletion_supported
 FROM articles WHERE owner=? ${ids?'AND id IN ('+ids.map(()=>'?').join(',')+')':''} ORDER BY created DESC,id DESC LIMIT ?`).bind(owner,...(ids||[]),limit).all()).results;
 const metadata=sectioned?await sectionedListMetadata(owner,rows):null;
 return Promise.all(rows.map(async(r:any)=>{const disposition=await wordClaimRecoveryDisposition(owner,r);r.manual_word_recovery_required=disposition?.supported===true;r.word_recovery_source_blocked=disposition?.required===true&&!disposition.supported;r.word_recovery_source_reason=disposition?.reason;const projected=metadata?.get(r.id),deliveries=projected?projected.deliveries:await deliveryList(owner,r.id),output_mode=textOnlyArticle(r)?'text_only':null;
 // Browser worklists fetch each visible task's persisted progress through its
 // independent owner read. Do not race 25+ deep reads against one-second timers
 // in the listing request, or describe deliberately deferred reads as outages.
 const word_progress_deferred=sectioned&&!output_mode&&r.state!=='deleting';
 const word_progress=output_mode||r.state==='deleting'||word_progress_deferred?null:await optionalWordProgress(owner,'article',r.id,r);
 return {...r,error:projected?projected.error:await redactWordCredentialText(owner,r.error,[r.claim_token]),recovery:articleRecoveryView({...r,output_mode},deliveries as Parameters<typeof articleRecoveryView>[1]),output_mode,word_progress,word_progress_deferred,word_progress_unavailable:!word_progress_deferred&&!output_mode&&r.state!=='deleting'&&word_progress===null,paragraphs:undefined,result_meta:undefined,artifact_manifest:undefined,result_key:undefined,source_key:undefined,claim_token:undefined,claim_expires:undefined,has_result:!!r.result_key,deletion_supported:!!r.deletion_supported&&(r.claim_token==null||(typeof r.claim_expires==='string'&&Number.isFinite(Date.parse(r.claim_expires))&&Date.parse(r.claim_expires)<=Date.now())),deliveries,upload_progress:projected?projected.upload_progress:await uploadProgress(owner,r.id)};}));}

// Query unfinished work independently from recent articles, with explicit bounded pages.
export async function articleWorklist(owner:string,offset=0){
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw Error('列表位置无效');
 const pending=`owner=? AND ${listScopeSql('publish')} AND ${visibleArticleSql()} AND ${workspaceVisibleSql()} AND (state IN ('uploaded','failed','needs_login','needs_verification') OR ${protectedArticleSql()})`;
 const total=await db().prepare('SELECT count(*) AS n FROM articles WHERE '+pending).bind(owner).first<{n:number}>();
 const rows=(await db().prepare('SELECT id FROM articles WHERE '+pending+' ORDER BY created DESC,id DESC LIMIT 25 OFFSET ?').bind(owner,offset).all<{id:string}>()).results;
 const recent:{id:string}[]=[]; // Completed history belongs to the separate article data module.
 const ids=[...new Set([...rows,...recent].map(r=>r.id))];
 return {items:(await articleList(owner,50,ids,true)).map(item=>({...item,list_section:'work'})),pending_total:total?.n||0,next_offset:offset+rows.length<(total?.n||0)?offset+rows.length:null};
}
export async function createArticle(owner:string,file:File,identity?:{id:string;sha256:string;title:string}){
 if(!file.size||file.size>MAX_FILE)throw Error('文件需小于20MB');
 const bytes=new Uint8Array(await file.arrayBuffer()),ps=parseArticle(bytes,file.name),title=ps.find(p=>p.trim())!;
 const id=identity?.id||crypto.randomUUID(),key=`articles/${id}/source`;
 const rejectDeleted=async(cleanup=false)=>{if(identity&&await db().prepare('SELECT 1 FROM article_deletions WHERE owner=? AND id=?').bind(owner,id).first()){if(cleanup)await bucket().delete(key);throw Error('文章已永久删除，不能重新保存原稿');}};
 if(identity){
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)||title.trim()!==identity.title.trim())throw Error('Word 标题与得到本篇最终稿不一致');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==identity.sha256)throw Error('Word 字节与下载文件不一致');
  await rejectDeleted();
  const prior=await db().prepare('SELECT owner,title,filename,source_key,paragraphs,state FROM articles WHERE id=?').bind(id).first<{owner:string;title:string;filename:string;source_key:string;paragraphs:string;state:string}>();
  if(prior){
   if(prior.owner!==owner||prior.filename!==file.name||prior.title!==title.slice(0,120)||prior.source_key!==key||prior.paragraphs!==JSON.stringify(ps)||prior.state==='deleting')throw Error('已有上传对象与本篇文件不一致');
   const object=await bucket().get(key);if(!object)throw Error('已上传文章的源文件缺失，请人工核对');
   const stored=await crypto.subtle.digest('SHA-256',await object.arrayBuffer());
   if(Array.from(new Uint8Array(stored)).map(n=>n.toString(16).padStart(2,'0')).join('')!==identity.sha256)throw Error('已上传文件的校验值不同');
   return {id,title:prior.title,filename:prior.filename,paragraph_count:ps.length,state:prior.state,cached:true};
  }
 }
 try{await bucket().put(key,bytes,{httpMetadata:{contentType:file.name.toLowerCase().endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'text/plain; charset=utf-8'}});}catch(e){await rejectDeleted(true);throw e;}
 await rejectDeleted(true);
 try{await db().prepare((identity?'INSERT OR IGNORE':'INSERT')+' INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,?,?,?,?,?,?)').bind(id,owner,title.slice(0,120),file.name.slice(0,180),key,JSON.stringify(ps),new Date().toISOString(),'uploaded').run();}
 catch(e){if(!identity)await bucket().delete(key);else await rejectDeleted(true);throw e;}
 await rejectDeleted(true);
 if(identity){const stored=await db().prepare('SELECT owner,title,filename,source_key,paragraphs,state FROM articles WHERE id=?').bind(id).first<{owner:string;title:string;filename:string;source_key:string;paragraphs:string;state:string}>();if(!stored||stored.owner!==owner||stored.title!==title.slice(0,120)||stored.filename!==file.name||stored.source_key!==key||stored.paragraphs!==JSON.stringify(ps)||stored.state==='deleting')throw Error('本篇上传对象尚未确认');}
 return {id,title:title.slice(0,120),filename:file.name.slice(0,180),paragraph_count:ps.length,state:'uploaded'};
}
