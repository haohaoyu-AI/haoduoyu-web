import {env} from 'cloudflare:workers';
import {parseArticle,MAX_FILE} from './article-format';
import {hashText} from './writing-input';
import {DEDAO_URL} from './dedao-contract';

type Row=Record<string,any>;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha=/^[a-f0-9]{64}$/;
const identity=/^[a-zA-Z0-9._:-]{1,200}$/;
const text=(value:string)=>`CAST(X'${Array.from(new TextEncoder().encode(value)).map(n=>n.toString(16).padStart(2,'0')).join('')}' AS TEXT)`;
const fields=(names:string[])=>`json_object(${names.flatMap(name=>[`'${name}'`,name]).join(',')})`;
const aggregate=(table:string,columns:string[],where:string,order:string)=>`(SELECT COALESCE(json_group_array(${fields(columns)}),'[]') FROM (SELECT ${columns.join(',')} FROM ${table} WHERE ${where} ORDER BY ${order}))`;
const itemFields=['batch_id','owner','ordinal','id','title','stage','version','final_ref','download_json','article_id','upload_state','submitted_handoff_id','submitted','created','updated'];
const batchFields=['id','owner','request_key','queue_revision','total','state','current_ordinal','created','updated','started','finished','executor_id','execution_id','claim_hash','lease_until','heartbeat','executor_ended','failure','dispatch_state'];
const actionFields=['batch_id','ordinal','action','action_id','state','observation_json','created','updated'];
const chunkFields=['batch_id','ordinal','offset','size','sha256','object_key'];

/** Global links deliberately include a wrong-owner link, rather than hiding it. */
export function dedaoWordOriginExpressions(_owner:string,id:string){
 const linked=`article_id=${text(id)}`,atItem=`EXISTS(SELECT 1 FROM dedao_items di WHERE di.${linked} AND di.batch_id=d.batch_id AND di.ordinal=d.ordinal)`;
 return {
  dedao_items:aggregate('dedao_items',itemFields,linked,'batch_id,ordinal'),
  dedao_batches:aggregate('dedao_batches',batchFields,`id IN (SELECT batch_id FROM dedao_items WHERE ${linked})`,'id'),
  dedao_actions:aggregate('dedao_actions d',actionFields,atItem,'batch_id,ordinal,action'),
  dedao_chunks:aggregate('dedao_chunks d',chunkFields,atItem,'batch_id,ordinal,offset')
 };
}

/** Database-only classification. Actual source bytes MUST also be verified below.
 * The immutable recovery chain's hash binding requires the authenticated claim hash;
 * without it this SQL reports a strict origin candidate, never execution permission. */
function conjunction(parts:string[]):string{if(parts.length<=4)return `(${parts.join(' AND ')})`;const middle=Math.ceil(parts.length/2);return `(${conjunction(parts.slice(0,middle))} AND ${conjunction(parts.slice(middle))})`;}
export function dedaoWordOriginSql(owner:string,id:string,articleAlias='a',claimHash?:string){
 if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(articleAlias))throw Error('invalid article SQL alias');
 const a=articleAlias,o=text(owner),i=text(id),d="CASE WHEN json_valid(di.download_json) THEN di.download_json ELSE '{}' END",f="CASE WHEN json_valid(fa.observation_json) THEN fa.observation_json ELSE '{}' END";
 const conditions=[
  `di.article_id=${i}`,`${a}.id=${i}`,`di.owner=${o}`,`b.owner=${o}`,`${a}.owner=${o}`,"b.state='completed'","b.current_ordinal=b.total","di.ordinal>=1","di.ordinal<=b.total","di.stage=11","di.upload_state='uploaded'","di.submitted IS NOT NULL",
  `hh.article_id=${i}`,`hh.owner=${o}`,"hh.state='delivered'","json_valid(di.download_json)",`json_type(${d})='object'`,"da.state='confirmed'","da.observation_json IS di.download_json","fa.state='confirmed'","json_valid(fa.observation_json)",`json_type(${f})='object'`,
  `json_extract(${d},'$.filename')=${a}.filename`,`json_extract(${d},'$.title')=di.title`,`json_extract(${d},'$.final_version_ref')=di.final_ref`,`json_extract(${d},'$.executor_id')=b.executor_id`,`json_extract(${d},'$.size') BETWEEN 1 AND ${MAX_FILE}`,`length(json_extract(${d},'$.sha256'))=64`,
  `json_extract(${f},'$.conversation_url')=${text(DEDAO_URL)}`,`json_extract(${f},'$.title')=di.title`,`json_extract(${f},'$.final_version_ref')=di.final_ref`,`json_extract(${f},'$.result') IN ('response_completed','auto_advanced')`,
  'EXISTS(SELECT 1 FROM dedao_chunks c WHERE c.batch_id=di.batch_id AND c.ordinal=di.ordinal AND c.offset=0)',`(SELECT SUM(c.size) FROM dedao_chunks c WHERE c.batch_id=di.batch_id AND c.ordinal=di.ordinal)=json_extract(${d},'$.size')`
 ];
 if(claimHash)conditions.push(`EXISTS(WITH RECURSIVE origin_claim(hash,depth) AS (SELECT h.claim_hash,0 UNION ALL SELECT r.next_claim_hash,oc.depth+1 FROM article_word_claim_recoveries r JOIN origin_claim oc ON r.old_claim_hash=oc.hash WHERE r.owner=${o} AND r.article_id=${i} AND r.input_sha256=COALESCE(json_extract(CASE WHEN json_valid(${a}.artifact_manifest) THEN ${a}.artifact_manifest ELSE '{}' END,'$.original_sha256'),r.input_sha256) AND oc.depth<64) SELECT 1 FROM origin_claim WHERE hash=${text(claimHash)})`);
 // Balanced conditions stay under D1's actual expression-depth limit without
 // omitting any provenance or complete-snapshot CAS check in the recovery caller.
 return `(SELECT COUNT(*) FROM dedao_items WHERE article_id=${i})=1 AND EXISTS(SELECT 1 FROM dedao_items di JOIN dedao_batches b ON b.id=di.batch_id JOIN dedao_actions da ON da.batch_id=di.batch_id AND da.ordinal=di.ordinal AND da.action='download' JOIN dedao_actions fa ON fa.batch_id=di.batch_id AND fa.ordinal=di.ordinal AND fa.action='finalize' JOIN article_handoffs hh ON hh.id=di.submitted_handoff_id JOIN article_help_queue_claims h ON h.owner=hh.owner AND h.article_id=hh.article_id AND h.handoff_id=hh.id AND h.event_id=hh.event_id WHERE ${conjunction(conditions)})`;
}

export class DedaoWordOriginError extends Error {}
function refuse():never{throw new DedaoWordOriginError('source_evidence_missing：得到导入来源、原领取链或本站原文字节尚未完整核实；只读取同一文章，不重新上传或认领');}
function parse(value:string):any{try{return JSON.parse(value);}catch{refuse();}}
function object(value:any,keys:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))refuse();}
function date(value:any){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||Date.parse(value)>Date.now())refuse();return Date.parse(value);}
function ref(value:any){if(typeof value!=='string'||!value.trim()||value.length>1000||/[\x00-\x1f\x7f]/.test(value))refuse();}
async function digest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer as ArrayBuffer))).map(n=>n.toString(16).padStart(2,'0')).join('');}
export type DedaoWordOrigin={provenance:{kind:'confirmed_dedao_source_import';batch_id:string;item_id:string;ordinal:number;source_sha256:string;source_size:number;input_sha256:string;source_snapshot_sha256:string;source_object_binding_sha256:string};assertFresh:()=>Promise<void>};

/** Reads canonical Site storage only. Neither a current browser nor batch completion
 * or executor_ended certifies that the downstream Word executor has ended. */
export async function verifyDedaoWordOrigin(owner:string,id:string,raw:Record<string,string>,a:Row,input:string,claimHash:string):Promise<DedaoWordOrigin|null>{
 const items=parse(raw.dedao_items);if(!Array.isArray(items))refuse();if(items.length===0)return null;
 const batches=parse(raw.dedao_batches),actions=parse(raw.dedao_actions),chunks=parse(raw.dedao_chunks);
 if(items.length!==1||!Array.isArray(batches)||batches.length!==1||!Array.isArray(actions)||!Array.isArray(chunks)||!chunks.length)refuse();
 const di=items[0],b=batches[0];
 if(di.article_id!==id||a.id!==id||di.owner!==owner||a.owner!==owner||b.owner!==owner||di.batch_id!==b.id||!uuid.test(b.id)||!uuid.test(di.id)||!uuid.test(b.request_key)||b.state!=='completed'||typeof b.executor_id!=='string'||!identity.test(b.executor_id)||!Number.isSafeInteger(b.total)||b.total<1||b.current_ordinal!==b.total||!Number.isSafeInteger(di.ordinal)||di.ordinal<1||di.ordinal>b.total||di.stage!==11||di.upload_state!=='uploaded'||!uuid.test(di.submitted_handoff_id))refuse();
 const submitted=date(di.submitted);date(di.created);date(b.created);if(date(b.finished)<submitted)refuse();
 const d=parse(di.download_json);object(d,['filename','path','sha256','size','title','final_version_ref','browser_session','executor_id']);
 if(d.filename!==a.filename||typeof d.filename!=='string'||d.filename.length>180||!/^.+\.docx$/i.test(d.filename)||/[\x00-\x1f<>:"/\\|?*]/.test(d.filename)||d.title!==di.title||d.final_version_ref!==di.final_ref||d.executor_id!==b.executor_id||typeof d.browser_session!=='string'||!identity.test(d.browser_session)||typeof d.path!=='string'||d.path.length>2000||!(/^(?:\/|[A-Za-z]:[\\/])/.test(d.path))||!sha.test(d.sha256)||!Number.isSafeInteger(d.size)||d.size<1||d.size>MAX_FILE)refuse();
 ref(di.title);ref(di.final_ref);
 if(actions.some((row:Row)=>row.batch_id!==b.id||row.ordinal!==di.ordinal)||chunks.some((row:Row)=>row.batch_id!==b.id||row.ordinal!==di.ordinal))refuse();
 const downloads=actions.filter((row:Row)=>row.action==='download'),finals=actions.filter((row:Row)=>row.action==='finalize');
 if(downloads.length!==1||finals.length!==1||downloads[0].state!=='confirmed'||downloads[0].observation_json!==di.download_json||finals[0].state!=='confirmed'||!uuid.test(downloads[0].action_id)||!uuid.test(finals[0].action_id))refuse();
 const f=parse(finals[0].observation_json);object(f,['conversation_url','result','response_ref','observed_at','title','final_version_ref']);
 if(f.conversation_url!==DEDAO_URL||!['response_completed','auto_advanced'].includes(f.result)||f.title!==di.title||f.final_version_ref!==di.final_ref)refuse();ref(f.response_ref);const finalized=date(f.observed_at);
 if(finalized>submitted||date(downloads[0].updated)>submitted||date(finals[0].updated)>submitted)refuse();
 let at=0;for(const c of chunks){if(!Number.isSafeInteger(c.offset)||c.offset!==at||!Number.isSafeInteger(c.size)||c.size<1||c.size>48000||!sha.test(c.sha256)||c.object_key!==`dedao/${b.id}/${di.ordinal}/chunk-${c.offset}-${c.sha256}`)refuse();at+=c.size;}
 if(at!==d.size||(chunks.length===1&&chunks[0].sha256!==d.sha256))refuse();
 const handoffs=parse(raw.handoffs).filter((row:Row)=>row.id===di.submitted_handoff_id);
 if(handoffs.length!==1||handoffs[0].owner!==owner||handoffs[0].article_id!==id||handoffs[0].state!=='delivered')refuse();ref(handoffs[0].event_id);
 const h=handoffs[0],helps=parse(raw.help).filter((row:Row)=>row.owner===owner&&row.article_id===id&&row.handoff_id===h.id&&row.event_id===h.event_id);
 if(helps.length!==1||!uuid.test(helps[0].request_key)||!sha.test(helps[0].claim_hash)||date(helps[0].created)<date(h.created))refuse();
 // Original help hashes are immutable. Only same-article/input immutable recovery
 // receipts may connect that original acquisition to a rotated current main claim.
 const recoveries=parse(raw.recoveries),seen=new Set<string>();let hash=helps[0].claim_hash;
 for(let depth=0;hash!==claimHash;depth++){
  if(depth>=64||seen.has(hash))refuse();seen.add(hash);
  const links=recoveries.filter((r:Row)=>r.owner===owner&&r.article_id===id&&r.input_sha256===input&&r.old_claim_hash===hash);
  if(links.length!==1||!sha.test(links[0].next_claim_hash))refuse();date(links[0].created);hash=links[0].next_claim_hash;
 }
 if(a.source_key!==`articles/${id}/source`||!env.BUCKET)refuse();const bucket=env.BUCKET;
 // Historical chunks are independently checked as source import evidence. Missing
 // or changed storage blocks this same-source continuation; it never downloads or
 // reconstructs an article. Keep each object binding until the final re-head.
 const chunkStates:{key:string;size:number;version:string;etag:string}[]=[];
 let assembled:Uint8Array|null=new Uint8Array(d.size);
 for(const c of chunks){
  let object:R2ObjectBody|null;try{object=await bucket.get(c.object_key);}catch{refuse();}
  if(!object||object.size!==c.size||!object.version||!object.etag)refuse();
  let content:Uint8Array;try{content=new Uint8Array(await object.arrayBuffer());}catch{refuse();}
  if(content.length!==c.size||await digest(content)!==c.sha256)refuse();
  assembled.set(content,c.offset);
  chunkStates.push({key:c.object_key,size:object.size,version:object.version,etag:object.etag});
 }
 if(await digest(assembled)!==d.sha256)refuse();assembled=null;
 let source:R2ObjectBody|null;try{source=await bucket.get(a.source_key);}catch{refuse();}
 if(!source||source.size!==d.size||typeof source.version!=='string'||!source.version||typeof source.etag!=='string'||!source.etag)refuse();
 const objectState={size:source.size,version:source.version,etag:source.etag};let bytes:Uint8Array;try{bytes=new Uint8Array(await source.arrayBuffer());}catch{refuse();}
 if(bytes.length!==d.size||await digest(bytes)!==d.sha256)refuse();
 let paragraphs:string[];try{paragraphs=parseArticle(bytes,d.filename,false);}catch{refuse();}
 const encoded=JSON.stringify(paragraphs),title=paragraphs.find(p=>p.trim())!;
 if(encoded!==a.paragraphs||await hashText(encoded)!==input||title.slice(0,120)!==a.title||title.trim()!==di.title.trim())refuse();
 const assertFresh=async()=>{for(const state of [...chunkStates,{key:a.source_key,...objectState}]){let head:R2Object|null;try{head=await bucket.head(state.key);}catch{refuse();}if(!head||head.size!==state.size||head.version!==state.version||head.etag!==state.etag)refuse();}};
 // A re-head detects changes during asynchronous validation. It is not an atomic
 // transaction spanning R2 and D1; the complete D1 origin snapshot is separately CASed.
 return {provenance:{kind:'confirmed_dedao_source_import',batch_id:b.id,item_id:di.id,ordinal:di.ordinal,source_sha256:d.sha256,source_size:d.size,input_sha256:input,source_snapshot_sha256:await hashText(JSON.stringify({items:raw.dedao_items,batches:raw.dedao_batches,actions:raw.dedao_actions,chunks:raw.dedao_chunks})),source_object_binding_sha256:await hashText(JSON.stringify({source:objectState,chunks:chunkStates}))},assertFresh};
}
