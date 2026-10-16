import {db} from './test-store';
import {wordFreshClaimOriginStatement} from './word-attempts';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestSchema={type:'object',properties:{request_key:{type:'string',format:'uuid',description:'One stable UUID for this queue acquisition. Keep it within this same executor across retries and lost responses; never share another live executor’s key; it is not an article ID or an authorization credential.'}},required:['request_key'],additionalProperties:false};
export const articleHelpQueueTools=[
 {name:'claim_next_article_help',description:'When an article notification has no usable article_id, atomically acquire ONE oldest eligible manual article from this authenticated owner’s persisted help queue. Only queued, never-claimed, canonical manual uploads with an explicit persisted handoff and no output, image plan, platform attempts/deliveries, writing/outline lineage or deletion fence qualify. Stable handoff order, never latest/title guessing. Supply one stable request_key; retries return that same acquisition or empty result, never another article. Returns the actual existing six-hour main-stage claim only while it still matches and is live. A main claim grants no Word execution: before image search, image planning or native Word writes, acquire_word_execution must return an actual grant; queued or unknown results require waiting and reading the same execution receipt. This queue authority does not prove original event injection or grant platform import, public publication, history recovery or another claim. Keep returned token in memory.',inputSchema:requestSchema,annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
 {name:'read_article_help_claim',description:'Read this authenticated owner’s exact queue-acquisition receipt by the same request_key after a lost response. Never selects or claims another article. Same-executor recovery of the original acquisition, not a new execution grant. Never use another still-running executor’s request key. Return the original main-stage token only when the current live article lease still matches that receipt; expired, replaced, completed or deleted acquisitions remain read-only and cannot be renewed here. An absent receipt is unknown: retry claim_next_article_help with the SAME request_key, never a new key until resolved. Keep any returned token in memory.',inputSchema:requestSchema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}
];
export class ArticleHelpQueueError extends Error {}
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
function argumentsFor(owner:string,value:unknown){
 if(typeof owner!=='string'||!owner.trim())throw new ArticleHelpQueueError('需要正常本人鉴权');
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='request_key')||typeof (value as {request_key?:unknown}).request_key!=='string'||!uuid.test(String((value as {request_key?:unknown}).request_key||'')))throw new ArticleHelpQueueError('需要本次领取固定的 request_key UUID');
 return String((value as {request_key:string}).request_key).toLowerCase();
}
// Repeated inside the atomic claim UPDATE, not just a preview. Exclude all past work,
// even expired claims, so a wake cannot become authority to recover historical work.
const eligible=`a.owner=? AND a.state='queued' AND a.claim_token IS NULL AND a.claim_expires IS NULL
 AND a.source_key='articles/'||a.id||'/source' AND json_valid(a.paragraphs)
 AND json_type(CASE WHEN json_valid(a.paragraphs) THEN a.paragraphs ELSE 'null' END)='array'
 AND json_array_length(CASE WHEN json_valid(a.paragraphs) THEN a.paragraphs ELSE '[]' END)>0
 AND a.result_key IS NULL AND a.result_meta IS NULL AND a.artifact_manifest IS NULL
 AND a.draft_url IS NULL AND a.draft_readback IS NULL AND a.upload_guard_version=0
 AND NOT EXISTS(SELECT 1 FROM article_upload_diagnostics d WHERE d.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM article_output_restarts r WHERE r.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM article_deletions d WHERE d.id=a.id)
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM writing_runs w WHERE w.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM editorial_runs_v3 w WHERE w.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM editorial_flows w WHERE w.article_id=a.id)
 AND NOT EXISTS(SELECT 1 FROM outline_flows w WHERE w.article_id=a.id)`;
type Receipt={owner:string;request_key:string;article_id:string|null;handoff_id:string|null;event_id:string|null;claim_hash:string|null;created:string};
async function receipt(owner:string,key:string){return db().prepare('SELECT * FROM article_help_queue_claims WHERE owner=? AND request_key=?').bind(owner,key).first<Receipt>();}
const common={source:'persisted_article_help_queue',original_event_injection_restored:false,dispatch_performed:false,execute_import:false,new_platform_upload_allowed:false};
async function view(owner:string,key:string,cached:boolean,acquiredNow=false){
 const r=await receipt(owner,key);
 if(!r)return {...common,request_key:key,claimed:false,status:'not_recorded',cached,retry_same_request_key:true};
 if(!r.article_id)return {...common,request_key:key,claimed:false,status:'empty',cached,retry_same_request_key:false};
 const a=await db().prepare(`SELECT id,state,claim_token,claim_expires,result_key,
 EXISTS(SELECT 1 FROM article_deletions d WHERE d.id=articles.id) AS deletion_fenced
 FROM articles WHERE id=? AND owner=?`).bind(r.article_id,owner).first<{id:string;state:string;claim_token:string|null;claim_expires:string|null;result_key:string|null;deletion_fenced:number}>();
 const live=!!a&&!a.deletion_fenced&&['processing','word_ready','toutiao_saving','needs_login','needs_verification','failed'].includes(a.state)
  &&!!a.claim_token&&!!a.claim_expires&&Number.isFinite(Date.parse(a.claim_expires))&&Date.parse(a.claim_expires)>Date.now()
  &&await digest(a.claim_token!.toLowerCase())===r.claim_hash;
 // Digest verification can yield. Revalidate that exact lease and manual lineage in
 // a final conditional read before exposing the original credential.
 let fresh=live?await db().prepare(`SELECT state,claim_token,claim_expires,result_key FROM articles a
  WHERE a.id=? AND a.owner=? AND a.claim_token=? AND a.claim_expires>?
  AND a.state IN ('processing','word_ready','toutiao_saving','needs_login','needs_verification','failed')
  AND a.source_key='articles/'||a.id||'/source'
  AND (a.artifact_manifest IS NULL OR (json_valid(a.artifact_manifest) AND COALESCE(json_extract(CASE WHEN json_valid(a.artifact_manifest) THEN a.artifact_manifest ELSE '{}' END,'$.output_mode'),'')<>'text_only'))
  AND NOT EXISTS(SELECT 1 FROM article_deletions d WHERE d.id=a.id)
  AND NOT EXISTS(SELECT 1 FROM writing_runs w WHERE w.article_id=a.id)
  AND NOT EXISTS(SELECT 1 FROM editorial_runs_v3 w WHERE w.article_id=a.id)
  AND NOT EXISTS(SELECT 1 FROM editorial_flows w WHERE w.article_id=a.id)
  AND NOT EXISTS(SELECT 1 FROM outline_flows w WHERE w.article_id=a.id)`)
  .bind(r.article_id,owner,a!.claim_token,new Date().toISOString()).first<{state:string;claim_token:string;claim_expires:string;result_key:string|null}>():null;
 if(fresh&&(!Number.isFinite(Date.parse(fresh.claim_expires))||Date.parse(fresh.claim_expires)<=Date.now()))fresh=null;
 const identity={...common,request_key:key,article_id:r.article_id,handoff_id:r.handoff_id,event_id:r.event_id,acquired_at:r.created,data:{article_id:r.article_id},state:fresh?.state||a?.state||'deleted',has_word:!!(fresh?.result_key||a?.result_key),cached,claim_acquired_now:acquiredNow&&!!fresh,same_claim_recovery:!acquiredNow,new_execution_grant:acquiredNow&&!!fresh};
 if(!fresh)return {...identity,claimed:false,status:'claim_unavailable',retry_same_request_key:false,next_tool:null};
 return {...identity,claimed:true,status:'claimed',claim_token:fresh.claim_token,expires:fresh.claim_expires,next_tool:'read_article',
  processing_policy:{original_text:'preserve_exactly',word_execution:'Main claim only. Before image search, image planning or native Word writes, acquire_word_execution must confirm an actual grant; queued or unknown means wait and read the same execution receipt.',images:'usually 22–25 real relevant images; no unrelated count padding',recommended_word_max_bytes:14000000,delivery:'authorized private drafts only',public_publication_allowed:false,platform_import:'existing separate one-shot upload gate remains required'}};
}
export async function articleHelpQueueCall(owner:string,name:string,value:unknown){
 const key=argumentsFor(owner,value);
 if(name==='read_article_help_claim')return view(owner,key,true);
 if(name!=='claim_next_article_help')throw new ArticleHelpQueueError('未知求助队列操作');
 if(await receipt(owner,key))return view(owner,key,true);
 const token=crypto.randomUUID(),hash=await digest(token.toLowerCase()),originReference=`article_help_queue_claim:${await digest(key)}`,now=new Date().toISOString(),expires=new Date(Date.now()+6*3600000).toISOString();
 // D1 batch is one transaction. Persist identity, acquire the ordinary article lease,
 // and suppress its credential atomically; no response-loss path rotates that lease.
 const outcome=await db().batch([
  db().prepare(`INSERT INTO article_help_queue_claims(owner,request_key,article_id,handoff_id,event_id,claim_hash,created)
   SELECT ?,?,a.id,h.id,h.event_id,?,? FROM articles a JOIN article_handoffs h ON h.article_id=a.id AND h.owner=a.owner
   WHERE ${eligible} AND h.state IN ('sending','delivered','unknown')
   AND NOT EXISTS(SELECT 1 FROM article_help_queue_claims q WHERE q.owner=a.owner AND q.article_id=a.id)
   ORDER BY h.created ASC,h.id ASC,a.id ASC LIMIT 1 ON CONFLICT DO NOTHING`).bind(owner,key,hash,now,owner),
  db().prepare('INSERT OR IGNORE INTO article_help_queue_claims(owner,request_key,created) VALUES(?,?,?)').bind(owner,key,now),
  db().prepare(`UPDATE articles AS a SET state='processing',claim_token=?,claim_expires=?,word_claim_origin_hash=?,error=NULL
   WHERE a.id=(SELECT article_id FROM article_help_queue_claims WHERE owner=? AND request_key=? AND claim_hash=?) AND ${eligible}`).bind(token,expires,hash,owner,key,hash,owner),
  // Only this successful never-claimed queued CAS can produce a fresh origin.
  // Keep this hook immediately after UPDATE: it consumes that statement's changes().
  // No historical processing claim, retry, intent row or expired regrant is backfilled.
  wordFreshClaimOriginStatement({owner,kind:'article',claimHash:hash,proofReference:originReference,proofSql:`EXISTS(SELECT 1 FROM article_help_queue_claims q WHERE q.owner=a.owner AND q.article_id=a.id AND q.request_key=? AND q.claim_hash=? AND a.claim_token=? AND a.claim_expires=?)`,proofBinds:[key,hash,token,expires]}),
  db().prepare(`INSERT OR IGNORE INTO article_claim_credential_hashes(owner,sha256,created)
   SELECT a.owner,?,? FROM articles a JOIN article_help_queue_claims q ON q.owner=a.owner AND q.article_id=a.id
   WHERE q.owner=? AND q.request_key=? AND q.claim_hash=? AND a.claim_token=?`).bind(hash,now,owner,key,hash,token)
 ]);
 return view(owner,key,!outcome[0].meta.changes,!!outcome[0].meta.changes&&!!outcome[2].meta.changes);
}
