import {assertWordCredentialFree} from './word-credentials';
import {db} from './test-store';
import {hashText} from './writing-input';
import {LocalWordError,readLocalWordJob,type LocalWordRow} from './local-word-jobs';
import {wordFreshClaimOriginStatement} from './word-attempts';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const executionPattern=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const keySchema={type:'string',format:'uuid',description:'Stable non-credential UUID for ONE queue acquisition; distinct from the source request_key. On any unknown response keep this exact key. Never switch keys to take the next job.'};
export const localWordExecutionSchema={type:'string',minLength:1,maxLength:200,pattern:executionPattern.source,description:'The actual current host task/run execution ID, copied unchanged, never a random UUID invented as an executor. This is an owner-authenticated audit binding, not a host-verified identity or authorization credential.'};
const properties={claim_request_key:keySchema,execution_id:localWordExecutionSchema};
const descriptor=(name:string,description:string,readOnlyHint:boolean)=>({name,description,inputSchema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false},annotations:{readOnlyHint,destructiveHint:false,openWorldHint:false}});
export const localWordQueueTools=[
 descriptor('claim_pending_local_word_job','When local_word.requested has no exact job_id, atomically acquire at most ONE oldest eligible owner-persisted local_desktop Word-only submission. Never guess latest or use articles/platform/writing queues. Only never-claimed queued jobs with complete frozen source, no image plan, output or error qualify. Stable claim_request_key + actual host execution_id bind one immutable job or empty result forever. Only claimed=true AND new_execution_grant=true permits fresh generation. Token stays in this executor memory; no paid provider, source rewrite or platform delivery. Unknown response: read_local_word_claim_receipt with the SAME key and execution, never acquire under a new key.',false),
 descriptor('read_local_word_claim_receipt','Read ONE exact owner-scoped queue receipt by the original claim_request_key AND actual execution_id. Never select another job, renew a lease or issue a new grant. A mismatched executor is rejected. Recover only the original token while its exact lease remains live; expired/replaced/failed/completed receipts are read-only. not_recorded is unknown: retry claim with the SAME key/execution. An empty receipt remains empty even after new submissions. A recovered grant is only same-executor reconciliation, never permission to start a new generation; existing frozen Word uses the independent exact job upload recovery path.',true),
];

type Receipt={owner:string;claim_request_key:string;execution_id:string;job_id:string|null;input_sha256:string|null;claim_hash:string|null;grant_ciphertext:string|null;expires:string|null;created:string};
function args(owner:string,value:unknown){
 if(!owner?.trim())throw new LocalWordError('请使用本人账号登录');
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['claim_request_key','execution_id'].includes(k)))throw new LocalWordError('Word队列领取参数无效');
 const a=value as Record<string,unknown>;
 if(typeof a.claim_request_key!=='string'||!uuid.test(a.claim_request_key)||typeof a.execution_id!=='string'||!executionPattern.test(a.execution_id))throw new LocalWordError('需要固定领取键和当前真实任务执行编号');
 return {key:a.claim_request_key,execution:a.execution_id};
}
const receipt=(owner:string,key:string)=>db().prepare('SELECT * FROM local_word_queue_claims WHERE owner=? AND claim_request_key=?').bind(owner,key).first<Receipt>();
// POST /api/local-word-jobs is the authenticated persisted desktop submission
// intent. Its frozen source manifest is required; event delivery is only a wake.
// Never recover any prior claim, even expired or lacking recorded output.
const eligible=`j.owner=? AND j.source_kind='local_desktop' AND j.output_mode='word_only' AND j.destinations_json='[]'
 AND j.state='queued' AND j.claim_hash IS NULL AND j.claim_expires IS NULL
 AND j.output_meta IS NULL AND j.result_key IS NULL AND j.error IS NULL
 AND json_valid(j.input_json) AND json_valid(j.artifact_manifest)
 AND json_extract(j.artifact_manifest,'$.author')='local_desktop_frozen_source'
 AND json_extract(j.artifact_manifest,'$.layout') IS NULL
 AND NOT EXISTS(SELECT 1 FROM local_word_queue_claims q WHERE q.owner=j.owner AND q.job_id=j.id)`;
async function complete(row:LocalWordRow){
 try{
  const v=JSON.parse(row.input_json),m=JSON.parse(row.artifact_manifest),keys=['request_key','filename','source_sha256','title','leading_blank_paragraphs','paragraphs','subheading_indices','original_sha256'];
  if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k))||!uuid.test(v.request_key)||!/^localword_[0-9a-f-]{36}$/.test(row.id)
   ||v.request_key!==row.request_key||v.filename!==row.filename||v.title!==row.title||!v.title.trim()||v.title.length>1000||/[\r\n]/.test(v.title)
   ||typeof v.filename!=='string'||v.filename.length>180||!/^.+\.(docx|txt|md)$/i.test(v.filename)||/[\u0000-\u001f\u007f<>:"/\\|?*]/.test(v.filename)
   ||v.source_sha256!==row.source_sha256||!/^[a-f0-9]{64}$/.test(v.source_sha256)||v.original_sha256!==row.original_sha256
   ||!Number.isSafeInteger(v.leading_blank_paragraphs)||v.leading_blank_paragraphs!==row.leading_blank_paragraphs||v.leading_blank_paragraphs<0||v.leading_blank_paragraphs>4998
   ||!Array.isArray(v.paragraphs)||!v.paragraphs.length||v.leading_blank_paragraphs+1+v.paragraphs.length>5000||v.paragraphs.some((p:unknown)=>typeof p!=='string')||!v.paragraphs.some((p:string)=>p.trim())
   ||!Array.isArray(v.subheading_indices)||v.subheading_indices.some((n:number,i:number)=>!Number.isSafeInteger(n)||n<0||n>=v.paragraphs.length||!v.paragraphs[n].trim()||(i>0&&n<=v.subheading_indices[i-1])))return false;
  const sequence=[...Array(v.leading_blank_paragraphs).fill(''),v.title,...v.paragraphs];
  return sequence.join('\n').length<=100000&&await hashText(JSON.stringify(sequence))===row.original_sha256&&await hashText(row.input_json)===row.input_sha256
   &&m.contract_version===1&&m.author==='local_desktop_frozen_source'&&m.layout===null&&m.input_sha256===row.input_sha256&&m.original_sha256===row.original_sha256
   &&m.prompt_sha256===await hashText('local-word-only-v1')&&JSON.stringify(m.sources)==='[]'&&m.sources_sha256===await hashText('[]')&&m.frozen_at===row.created;
 }catch{return false;}
}
// Sealed at rest under the original owner/key/execution binding. These public
// audit IDs are NOT a security boundary or new credential; Sites owner auth is.
// No raw claim token is written to D1 or logs. The six-hour ordinary lease still
// controls all use; the ciphertext never authorizes a renewed/replaced grant.
async function sealKey(owner:string,key:string,execution:string){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['local-word-queue-v1',owner,key,execution]))),'AES-GCM',false,['encrypt','decrypt']);}
async function seal(owner:string,key:string,execution:string,token:string){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await sealKey(owner,key,execution),new TextEncoder().encode(token)));return btoa(String.fromCharCode(...iv,...cipher));}
async function unseal(r:Receipt){const bytes=Uint8Array.from(atob(r.grant_ciphertext!),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await sealKey(r.owner,r.claim_request_key,r.execution_id),bytes.slice(12)));}
const common={source:'persisted_local_word_queue',original_event_injection_restored:false,dispatch_performed:false,platforms_allowed:false};
async function view(owner:string,key:string,execution:string,newGrant=false){
 const r=await receipt(owner,key),base={...common,claim_request_key:key,execution_id:execution,new_execution_grant:false};
 if(!r)return {...base,claimed:false,status:'not_recorded',retry_same_claim_request_key:true};
 if(r.execution_id!==execution)throw new LocalWordError('领取收据绑定另一个执行任务；禁止转授认领');
 if(!r.job_id)return {...base,claimed:false,status:'empty',retry_same_claim_request_key:false};
 const identity={...base,job_id:r.job_id,data:{job_id:r.job_id},input_sha256:r.input_sha256,retry_same_claim_request_key:false,same_claim_recovery:!newGrant};
 const token=await unseal(r);
 if(!uuid.test(token)||await hashText(token)!==r.claim_hash)throw new LocalWordError('原领取收据待核对，不得新领');
 // Recheck after all async snapshot reads/hashing immediately before exposure.
 const snapshot=await readLocalWordJob(owner,r.job_id,true);
 const live=await db().prepare(`SELECT claim_expires FROM local_word_jobs WHERE owner=? AND id=? AND input_sha256=? AND claim_hash=? AND claim_expires=? AND claim_expires>? AND state='processing' AND source_kind='local_desktop' AND output_mode='word_only' AND destinations_json='[]'`).bind(owner,r.job_id,r.input_sha256,r.claim_hash,r.expires,new Date().toISOString()).first<{claim_expires:string}>();
 if(!live||!Number.isFinite(Date.parse(live.claim_expires))||Date.parse(live.claim_expires)<=Date.now())return {...identity,claimed:false,status:'claim_unavailable',job:snapshot.job,read_only:true};
 return {...snapshot,...identity,claimed:true,status:'claimed',claim_token:token,expires:r.expires,new_execution_grant:newGrant,next_tool:'read_local_word_job',
  processing_policy:{fresh_generation_allowed:newGrant,existing_frozen_output_only:!!snapshot.output,source_rewrite_allowed:false,paid_provider_allowed:false,platforms_allowed:false}};
}
export async function localWordQueueCall(owner:string,name:string,value:unknown){
 const {key,execution}=args(owner,value);
 await assertWordCredentialFree(owner,{claim_request_key:key,execution_id:execution});
 if(name==='read_local_word_claim_receipt')return view(owner,key,execution);
 if(name!=='claim_pending_local_word_job')throw new LocalWordError('不支持此Word队列操作');
 if(await receipt(owner,key))return view(owner,key,execution);
 const candidates=(await db().prepare(`SELECT j.* FROM local_word_jobs j WHERE ${eligible} ORDER BY j.created ASC,j.id ASC`).bind(owner).all<LocalWordRow>()).results;
 let candidate:LocalWordRow|undefined;for(const row of candidates)if(await complete(row)){candidate=row;break;}
 if(candidate?.request_key===key)throw new LocalWordError('领取键必须与源 request_key 分开');
 const token=crypto.randomUUID(),hash=await hashText(token),cipher=await seal(owner,key,execution,token),now=new Date().toISOString(),expires=new Date(Date.now()+6*3600000).toISOString();
 // One transaction: CAS the validated oldest snapshot, receipt (including empty),
 // ordinary local lease and rollback guard. A losing race records empty rather
 // than silently expanding this key to a different candidate.
 const result=await db().batch([
  db().prepare(`INSERT INTO local_word_queue_claims(owner,claim_request_key,execution_id,job_id,input_sha256,claim_hash,grant_ciphertext,expires,created)
   SELECT ?,?,?,j.id,j.input_sha256,?,?,?,? FROM local_word_jobs j WHERE ${eligible} AND j.id=? AND j.input_json=? AND j.artifact_manifest=? ON CONFLICT DO NOTHING`).bind(owner,key,execution,hash,cipher,expires,now,owner,candidate?.id||'',candidate?.input_json||'',candidate?.artifact_manifest||''),
  db().prepare('INSERT OR IGNORE INTO local_word_queue_claims(owner,claim_request_key,execution_id,created) VALUES(?,?,?,?)').bind(owner,key,execution,now),
  db().prepare(`UPDATE local_word_jobs AS j SET state='processing',claim_hash=?,claim_expires=?,updated=?
   WHERE j.id=(SELECT job_id FROM local_word_queue_claims WHERE owner=? AND claim_request_key=? AND execution_id=? AND claim_hash=?)
   AND j.owner=? AND j.state='queued' AND j.claim_hash IS NULL AND j.claim_expires IS NULL AND j.output_meta IS NULL AND j.result_key IS NULL AND j.error IS NULL
   AND j.source_kind='local_desktop' AND j.output_mode='word_only' AND j.destinations_json='[]' AND j.input_json=? AND j.artifact_manifest=?`).bind(hash,expires,now,owner,key,execution,hash,owner,candidate?.input_json||'',candidate?.artifact_manifest||''),
  wordFreshClaimOriginStatement({owner,kind:'local_word',id:candidate?.id||'',claimHash:hash,proofReference:`local_word_queue_claim:${await hashText(key)}`,proofSql:"EXISTS(SELECT 1 FROM local_word_queue_claims q WHERE q.owner=a.owner AND q.job_id=a.id AND q.claim_request_key=? AND q.execution_id=? AND q.claim_hash=a.claim_hash AND q.expires=a.claim_expires)",proofBinds:[key,execution]}),
  db().prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM local_word_queue_claims WHERE owner=? AND claim_request_key=? AND claim_hash=?) OR EXISTS(
   SELECT 1 FROM local_word_jobs j JOIN local_word_queue_claims q ON q.job_id=j.id AND q.owner=j.owner
   WHERE q.owner=? AND q.claim_request_key=? AND q.claim_hash=? AND j.claim_hash=q.claim_hash AND j.claim_expires=q.expires AND j.state='processing') THEN 1 ELSE json('') END AS claim_committed`).bind(owner,key,hash,owner,key,hash),
 ]);
 return view(owner,key,execution,!!result[0].meta.changes&&!!result[2].meta.changes);
}
