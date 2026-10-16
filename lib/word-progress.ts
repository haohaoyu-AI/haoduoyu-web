import {assertWordCredentialFree,redactWordCredentialText} from './word-credentials';
import {wordWriteFence,assertCurrentWordWritePermission,wordRecoveryView,verifyCheckpointPixels,checkpointImageCount} from './word-recovery';
import {env} from 'cloudflare:workers';
import {db} from './test-store';
import {hashText} from './writing-input';
import {wordAttemptView,wordAttemptSelectionSql,confirmWordAttemptSaved} from './word-attempts';
import {articleWordSettlementView} from './article-word-recovery';
import {wordStages,wordActions,wordReasons,emptyWordSteps,type WordTarget,type WordStage,type WordRunState,type WordObservation,type WordProgress,type WordStep,type WordAttemptView} from './word-progress-contract';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const time=()=>new Date().toISOString();
type Snapshot={attempt_id?:string|null;generation?:number;steps:WordStep[];stage:WordStage;state:WordRunState;reason:keyof typeof wordReasons;observations:Partial<Record<WordStage,WordObservation>>;output_sha256:string|null;started_at:string;updated_at:string;executor_updated_at?:string};
type EventRow={attempt_id:string|null;version:number;input_sha256:string;payload_sha256:string;snapshot_json:string;event_id:string};
function object(value:unknown,keys:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Word进度参数无效');return value as Record<string,any>;}
function target(kind:unknown,id:unknown){if(!['article','local_word'].includes(String(kind))||typeof id!=='string'||!(kind==='article'?uuid.test(id):id.startsWith('localword_')&&uuid.test(id.slice(10))))throw Error('Word进度任务无效');return {kind:kind as WordTarget,id};}
async function owned(owner:string,kind:WordTarget,id:string){if(!owner)throw Error('请登录');const table=kind==='article'?'articles':'local_word_jobs';const row:any=await db().prepare(`SELECT * FROM ${table} WHERE owner=? AND id=?`).bind(owner,id).first();if(!row||row.state==='deleting')throw Error('没有找到本人的Word任务');if(kind==='local_word'&&(row.source_kind!=='local_desktop'||row.output_mode!=='word_only'||row.destinations_json!=='[]'))throw Error('Word任务范围不匹配');const manifest=parse(row.artifact_manifest);if(kind==='article'&&(manifest?.output_mode==='text_only'||row.state==='text_saved'))throw Error('文字稿没有配图Word阶段');return row;}
function parse(raw:string|null|undefined){try{return raw?JSON.parse(raw):null;}catch{return null;}}
export async function wordInputSha(kind:WordTarget,row:any){if(kind==='local_word'){if(await hashText(row.input_json)!==row.input_sha256)throw Error('冻结原文绑定不一致');return row.input_sha256;}const source=await hashText(JSON.stringify(JSON.parse(row.paragraphs))),manifest=parse(row.artifact_manifest),bound=manifest?.original_sha256||parse(row.result_meta)?.progress_input_sha256;if(digest.test(bound||'')){if(row.state==='processing'&&source!==bound)throw Error('冻结原文绑定不一致');return bound;}return source;}
async function latest(owner:string,kind:WordTarget,id:string,version?:number){const selection=await wordAttemptSelectionSql(owner,kind,id);return db().prepare(`SELECT * FROM word_progress_events WHERE owner=? AND target_kind=? AND target_id=? AND (${selection}) ${version===undefined?'':'AND version<=?'} ORDER BY version DESC LIMIT 1`).bind(owner,kind,id,...(version===undefined?[]:[version])).first<EventRow>();}
async function latestVersion(owner:string,kind:WordTarget,id:string){return (await db().prepare('SELECT COALESCE(MAX(version),0) AS version FROM word_progress_events WHERE owner=? AND target_kind=? AND target_id=?').bind(owner,kind,id).first<{version:number}>())?.version||0;}
async function progressReadSnapshot(owner:string,kind:WordTarget,id:string){
 const selection=await wordAttemptSelectionSql(owner,kind,id,'p');
 // Couple the current observation and global CAS version in one D1 snapshot.
 const result=await db().prepare(`SELECT COALESCE(MAX(e.version),0) AS version,(SELECT json_object('attempt_id',p.attempt_id,'version',p.version,'input_sha256',p.input_sha256,'payload_sha256',p.payload_sha256,'snapshot_json',p.snapshot_json,'event_id',p.event_id) FROM word_progress_events p WHERE p.owner=? AND p.target_kind=? AND p.target_id=? AND (${selection}) ORDER BY p.version DESC LIMIT 1) AS event_json FROM word_progress_events e WHERE e.owner=? AND e.target_kind=? AND e.target_id=?`).bind(owner,kind,id,owner,kind,id).first<{version:number;event_json:string|null}>();
 return {version:result?.version||0,event:parse(result?.event_json) as EventRow|null};
}
function applicableSnapshot(event:EventRow|null|undefined,inputSha:string,attempt:WordAttemptView|null){
 if(!event||event.input_sha256!==inputSha)return null;
 const snapshot:Snapshot|null=parse(event.snapshot_json);if(!snapshot)return null;
 const eventAttempt=event.attempt_id||snapshot.attempt_id||null;
 // Generation one may retain proven legacy observations. Later attempts never
 // inherit an old search count, page inspection or native progress snapshot.
 if(attempt?(eventAttempt!==attempt.attempt_id&&(attempt.generation!==1||eventAttempt!==null)):eventAttempt!==null)return null;
 if(attempt&&snapshot.generation!==undefined&&snapshot.generation!==attempt.generation)return null;
 return snapshot;
}
function meta(kind:WordTarget,row:any){return parse(kind==='article'?row.result_meta:row.output_meta);}
function claimActive(kind:WordTarget,row:any){return !!(kind==='article'?row.claim_token:row.claim_hash)&&!!row.claim_expires&&Date.parse(row.claim_expires)>Date.now();}
function frozenOutput(kind:WordTarget,row:any){const m=meta(kind,row);return m&&digest.test(m.sha256)&&typeof m.output_id==='string'?{output_id:m.output_id,sha256:m.sha256,size:m.size,next_index:Array.isArray(m.parts)?m.parts.length:0,chunks:m.chunks}:null;}
// Only provider-issued immutable object versions can reuse a prior full digest.
// Neither an expected SHA nor an ETag alone is a successful readback receipt.
const verifiedObjects=new Map<string,{version:string;expires:number}>();
const verificationInFlight=new Map<string,Promise<boolean>>();
const verificationLimit=2,verificationCacheLimit=128,verificationCacheMs=300000;
async function confirmStoredOutput(scope:string,key:string,expected:{size:number;sha256:string},mode:'full'|'cached',requireFullRead=false){
 const head=await env.BUCKET?.head(key);
 const cacheKey=JSON.stringify([scope,key,expected.size,expected.sha256]);
 if(!head||head.size!==expected.size){verifiedObjects.delete(cacheKey);return false;}
 const version=typeof head.version==='string'&&head.version.length>0?head.version:null;
 const prior=verifiedObjects.get(cacheKey);
 if(prior&&version===prior.version&&prior.expires>Date.now()&&!requireFullRead)return true;
 verifiedObjects.delete(cacheKey);
 // Existing business reads must never download whole Word files just to decorate
 // their response. Only an explicit progress read creates a full digest receipt.
 if(mode==='cached')return false;
 const flightKey=JSON.stringify([cacheKey,version]);
 const running=verificationInFlight.get(flightKey);if(running)return running;
 // Bound both concurrent Word buffers and pending work. A busy read is unconfirmed,
 // never queued behind an unrelated stalled object and never a new execution grant.
 if(verificationInFlight.size>=verificationLimit)return false;
 const verify=(async()=>{
  const stored=await env.BUCKET?.get(key);if(!stored||(version&&stored.version!==version))return false;
  const bytes=await stored.arrayBuffer();if(bytes.byteLength!==expected.size)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==expected.sha256)return false;
  if(version){
   for(const [entry,proof] of verifiedObjects)if(proof.expires<=Date.now())verifiedObjects.delete(entry);
   while(verifiedObjects.size>=verificationCacheLimit)verifiedObjects.delete(verifiedObjects.keys().next().value!);
   verifiedObjects.set(cacheKey,{version,expires:Date.now()+verificationCacheMs});
  }
  return true;
 })();
 verificationInFlight.set(flightKey,verify);
 try{return await verify;}finally{if(verificationInFlight.get(flightKey)===verify)verificationInFlight.delete(flightKey);}
}

// Optional UI decoration must not hide an existing successful claim/token or
// interfere with the established Word, download and upload-permit protocols.
export async function optionalWordProgress(owner:string,kind:WordTarget,id:string,row:any):Promise<WordProgress|null>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([readWordProgress(owner,kind,id,row,{verification:'cached'}),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),1000);})]);}
 catch{return null;}finally{if(timer!==undefined)clearTimeout(timer);}
}

// This is an independent owner-authorized read after finalize. A timer, notification,
// declared output or platform draft state can never manufacture a saved Word.
export async function readWordProgress(owner:string,kind:WordTarget,id:string,suppliedRow?:any,options:{verification?:'full'|'cached';attemptReadPass?:number}={}):Promise<WordProgress>{
 const attempt=await wordAttemptView(owner,kind,id),row=suppliedRow&&(!attempt||attempt.generation===1)?suppliedRow:await owned(owner,kind,id),inputSha=await wordInputSha(kind,row),{event,version}=await progressReadSnapshot(owner,kind,id);
 const snapshot=applicableSnapshot(event,inputSha,attempt);
 const steps=snapshot?structuredClone(snapshot.steps):emptyWordSteps(),m=meta(kind,row),layout=parse(row.artifact_manifest)?.layout;
 const output=frozenOutput(kind,row),finalized=!!row.result_key&&!!output&&(kind==='article'?['word_ready','toutiao_saving','needs_login','needs_verification','failed','completed'].includes(row.state):row.state==='word_completed'&&!!m?.verification);
 // A normal fresh main claim proves ownership, not an execution grant. Only its
 // exact immutable origin and absence of any execution/history prove unstarted.
 // An old processing row, intent row or empty event snapshot alone proves none.
 let freshUnstarted=false;
 if(!attempt&&!snapshot&&version===0&&!layout&&!output&&!row.result_key&&!row.result_meta&&!row.output_meta&&row.state==='processing'){
  try{
   const claimHash=kind==='article'&&uuid.test(row.claim_token||'')?await hashText(row.claim_token):kind==='local_word'?row.claim_hash:null;
   if(digest.test(claimHash||'')){
    const table=kind==='article'?'articles':'local_word_jobs',binding=kind==='article'?'word_claim_origin_hash':'claim_hash';
    freshUnstarted=!!await db().prepare(`SELECT 1 AS fresh FROM word_claim_origins g JOIN ${table} a ON a.owner=g.owner AND a.id=g.target_id WHERE g.owner=? AND g.target_kind=? AND g.target_id=? AND g.claim_hash=? AND g.origin='fresh_claim' AND a.${binding}=g.claim_hash AND a.${kind==='article'?'claim_token':'claim_hash'} IS ? AND a.state='processing' AND a.result_key IS NULL AND a.${kind==='article'?'result_meta':'output_meta'} IS NULL AND (a.artifact_manifest IS NULL OR (json_valid(a.artifact_manifest) AND (json_type(a.artifact_manifest,'$.layout') IS NULL OR json_type(a.artifact_manifest,'$.layout')='null'))) AND a.${kind==='article'?'paragraphs':'input_json'} IS ? AND NOT EXISTS(SELECT 1 FROM word_execution_receipts e WHERE e.owner=g.owner AND e.target_kind=g.target_kind AND e.target_id=g.target_id) AND NOT EXISTS(SELECT 1 FROM word_progress_events e WHERE e.owner=g.owner AND e.target_kind=g.target_kind AND e.target_id=g.target_id) AND NOT EXISTS(SELECT 1 FROM word_checkpoints e WHERE e.owner=g.owner AND e.target_kind=g.target_kind AND e.target_id=g.target_id) AND NOT EXISTS(SELECT 1 FROM word_image_candidates e WHERE e.owner=g.owner AND e.target_kind=g.target_kind AND e.target_id=g.target_id)`).bind(owner,kind,id,claimHash,kind==='article'?row.claim_token:row.claim_hash,kind==='article'?row.paragraphs:row.input_json).first();
   }
  }catch{/* Missing history/origin evidence remains unknown, never falsely fresh. */}
 }
 let confirmed=false;
 if(finalized){try{const verification=options.verification||'full',recordConfirmation=verification==='full'&&!!attempt&&attempt.state!=='saved';confirmed=await confirmStoredOutput(JSON.stringify([owner,kind,id,inputSha]),row.result_key,output!,verification,recordConfirmation);if(confirmed&&recordConfirmation)await confirmWordAttemptSaved(owner,kind,id,output!.output_id,output!.sha256,output!.size);}catch{/* A failed read preserves the last evidence; it does not assert a stopped executor. */}}
 const replaced=!!snapshot?.output_sha256&&snapshot.output_sha256!==output?.sha256;
 if(replaced){for(let i=3;i<6;i++)steps[i]={...steps[i],state:'pending',counts:null,evidence:null,action:null};steps[4]={...steps[4],state:'current',action:'Word 输出已更正，等待检查当前文件'};}
 if(!snapshot&&!freshUnstarted&&(!attempt||attempt.generation===1)&&(!['uploaded','queued'].includes(row.state)||layout||output))for(const step of steps)step.state='unrecorded';
 if(layout&&Array.isArray(layout.images)&&!steps[2].counts){steps[2]={...steps[2],counts:{completed:layout.images.length,total:layout.images.length,unit:'images'},evidence:'site_record',action:'已冻结图片清单；像素检查按执行记录显示'};}
 if(output){
  const executorGenerated=snapshot?.steps[3].state==='completed'&&!replaced;
  steps[3]={...steps[3],state:finalized?'completed':executorGenerated?'completed':'unrecorded',action:finalized?'本站已核验完整 Word':executorGenerated?steps[3].action:'已申报 Word 字节与上传身份',evidence:executorGenerated&&!finalized?'executor_report':'site_record'};
  steps[5].counts={completed:output.next_index,total:output.chunks,unit:'chunks'};
  const nativeNewer=!snapshot||!snapshot.executor_updated_at||(Number.isFinite(Date.parse(m.progress_updated_at))&&Date.parse(m.progress_updated_at)>Date.parse(snapshot.executor_updated_at));
  if(nativeNewer){for(let i=0;i<5;i++)if(steps[i].state==='current')steps[i].state='unrecorded';if(output.next_index>0)steps[5]={...steps[5],state:'current',action:'正在保存本站 Word 分块',evidence:'site_record'};}
 }
 if(finalized){
  steps[5]={...steps[5],state:confirmed?'completed':'current',action:confirmed?'本站成品已独立读回':'本站成品暂未读回，等待核对',evidence:'site_record'};
  // Legacy local receipt is an honest executor attestation, not an invented history.
  if(!snapshot&&kind==='local_word'&&Number.isSafeInteger(m?.execution?.rendered_pages)&&m.execution.rendered_pages>0){steps[4]={...steps[4],state:'unrecorded',counts:null,action:'已有执行者验收摘要；缺少逐页历史',evidence:'executor_report'};}
 }
 const knownImages=layout?.images||snapshot?.observations.confirm_images?.inspected_images;
 if(!finalized&&Array.isArray(knownImages)){let verified:number|null=null,unavailable=false;try{verified=await checkpointImageCount(owner,kind,id,knownImages);}catch{unavailable=true;}if(unavailable||(verified!==null&&verified<knownImages.length))steps[2]={...steps[2],state:'unrecorded',counts:unavailable?null:{completed:verified!,total:knownImages.length,unit:'images'},action:unavailable?'图片缓存复核暂不可读':'图片缓存待实际像素复核',evidence:'site_record'};}
 if(finalized&&m?.recovery_verification?.contract==='legacy_declared_output_v1'){
  // Resuming a pre-adoption Word proves its original native bytes, not missing
  // historical pixel checks. Fresh executor observations retain their proof.
  let verified:number|null=null;try{if(Array.isArray(knownImages))verified=await checkpointImageCount(owner,kind,id,knownImages);}catch{}
  if(!Array.isArray(knownImages)||verified!==knownImages.length)steps[2]={...steps[2],state:'unrecorded',counts:null,action:'旧任务已沿原文件保存；实际像素检查历史未知',evidence:'site_record'};
 }
 const current=finalized?5:steps[5].state==='current'?5:steps.findIndex(s=>s.state==='current');
 for(let i=0;i<steps.length;i++)if(i!==current&&steps[i].state==='current')steps[i].state='unrecorded';
 const state=confirmed?'saved':row.state==='failed'?'failed':snapshot?.state||'waiting';
 const completedAt=m?.completed_at||null;
 const updates=[snapshot?.updated_at,m?.progress_updated_at,parse(row.artifact_manifest)?.layout?.recorded_at,completedAt,attempt?.started_at,attempt?.stop_requested_at].filter((s):s is string=>typeof s==='string'&&Number.isFinite(Date.parse(s))).sort();
 const updated=updates.at(-1)||null;
 const reason=confirmed?'saved_readback':finalized?'saved_readback_pending':row.state==='failed'?'existing_task_failed':snapshot?.reason||(freshUnstarted?'none':'legacy_no_observations');
 const reasonText=confirmed?'本站成品已读回':finalized?'本站成品暂未读回，等待核对':row.state==='failed'?'既有任务已失败；已有成果保留':snapshot?wordReasons[snapshot.reason]:freshUnstarted?'配图尚未开始':'尚无实时执行记录';
 let retainedAssets:WordProgress['retained_assets']={metadata_known:false,image_checkpoint_records:0,word_checkpoint_records:0,metadata_only:true,reusable_word_checkpoint_verified:false};
 try{const inventory=await db().prepare(`SELECT SUM(CASE WHEN kind='image' THEN 1 ELSE 0 END) AS images,SUM(CASE WHEN kind='word' THEN 1 ELSE 0 END) AS words FROM word_checkpoints WHERE owner=? AND target_kind=? AND target_id=? AND input_sha256=?`).bind(owner,kind,id,inputSha).first<{images:number|null;words:number|null}>();
  if(!inventory||!Object.hasOwn(inventory,'images')||!Object.hasOwn(inventory,'words'))throw Error('断点元数据缺失');const images=inventory.images??0,words=inventory.words??0;if(!Number.isSafeInteger(images)||images<0||!Number.isSafeInteger(words)||words<0)throw Error('断点记录数量待核验');retainedAssets={metadata_known:true,image_checkpoint_records:images,word_checkpoint_records:words,metadata_only:true,reusable_word_checkpoint_verified:false};
 }catch{/* Missing metadata is unknown; it is never evidence that no checkpoint exists. */}
 const recovery=await wordRecoveryView(owner,kind,id),currentAttempt=recovery?.attempt||attempt;
 if((currentAttempt?.attempt_id||null)!==(attempt?.attempt_id||null)||(currentAttempt?.generation||0)!==(attempt?.generation||0)){
  if((options.attemptReadPass||0)>=1)throw Error('配图尝试读取期间已变化；请读取同一任务');
  return readWordProgress(owner,kind,id,undefined,{verification:options.verification,attemptReadPass:1});
 }
 let settlement:WordProgress['settlement']=null;
 if(kind==='article'&&!finalized&&currentAttempt?.state==='ended'&&currentAttempt.active_started_at===null&&recovery&&!recovery.execution_confirmed&&!recovery.safety_stop_pending){
  try{settlement=await articleWordSettlementView(owner,id,{input_sha256:inputSha,attempt_id:currentAttempt.attempt_id,generation:currentAttempt.generation,recovery_version:recovery.version});}
  catch{/* Missing or unreadable proof stays unconfirmed; it never proves a stopped holder. */}
 }
 const claimIsActive=settlement?settlement.main_claim==='unsettled_active':claimActive(kind,row);
 return {retained_assets:retainedAssets,recovery_capability:{trusted_terminal_verifier_available:false,page_recovery_adapter_available:false,eligible:false,reason_code:'trusted_terminal_verifier_unavailable'},recovery,attempt:currentAttempt,settlement,can_control_word:!settlement&&row.state==='processing'&&!row.result_key,contract_version:1,target_kind:kind,target_id:id,input_sha256:inputSha,version,legacy:!snapshot&&!freshUnstarted&&(!attempt||attempt.generation===1),started_at:snapshot?.started_at||null,updated_at:updated,completed_at:completedAt,read_at:time(),steps,execution:{state:settlement?'ended_settled':state,reason,reason_text:settlement?'执行已停止并结清；本站保存结果仍以独立回读为准':reasonText,claim_active:claimIsActive,update_overdue:!settlement&&!!updated&&!finalized&&Date.now()-Date.parse(updated)>120000},save:{state:confirmed?'cloud_ready':finalized?'readback_pending':output?(output.next_index===output.chunks?'finalizing':'uploading'):'not_started',cloud_ready:finalized,independently_confirmed:confirmed,desktop_saved:null},output};
}

function publicCandidateUrl(value:unknown,token:string){
 if(typeof value!=='string'||value.length>2048)return false;
 try{
  const url=new URL(value),host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||!host.includes('.')||host.endsWith('.')||host.includes(':')||/^[0-9.]+$/.test(host)||/(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|test|invalid)$/.test(host))return false;
  // Never persist a reversible encoding of the live claim in the URL/path/query.
  // Bound decoding work; ambiguous deeper encoding is rejected rather than stored.
  let decoded=value;
  for(let i=0;i<4;i++){const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}
  if(/%[a-f0-9]{2}/i.test(decoded)||decoded.toLowerCase().includes(token))return false;
  return ![...new URL(decoded).searchParams.keys()].some(key=>/token|secret|auth|credential|signature|password|api[-_]?key|access[-_]?key|session|^sig$|^key$|^jwt$/i.test(key));
 }catch{return false;}
}

const stageActions:Record<WordStage,string[]>={read_source:['read_frozen_source'],collect_images:['search_public_images'],confirm_images:['filter_images','check_pixels','place_images','compress_images'],generate_word:['build_docx'],inspect_pages:['render_pages','check_pages'],save_final:['upload_output','finalize_output','read_saved_output']};
function observation(value:unknown,stage:WordStage,previous:WordObservation|undefined,row:any,kind:WordTarget,token:string):WordObservation{
 const v=object(value,['action','reason','candidate_urls','inspected_images','images_total','word_sha256','rendered_pages','checked_pages']);
 if(!stageActions[stage].includes(v.action)||typeof v.reason!=='string'||!Object.hasOwn(wordReasons,v.reason))throw Error('Word进度动作无效');
 if(JSON.stringify(v).includes(token))throw Error('Word进度不得包含认领凭据');
 const allowed:Record<WordStage,string[]>={read_source:[],collect_images:['candidate_urls'],confirm_images:['inspected_images','images_total'],generate_word:['word_sha256'],inspect_pages:['word_sha256','rendered_pages','checked_pages'],save_final:['word_sha256']};
 if(Object.keys(v).some(k=>!['action','reason',...allowed[stage]].includes(k)))throw Error('Word进度观察与阶段不符');
 if(v.candidate_urls!==undefined){if(!Array.isArray(v.candidate_urls)||v.candidate_urls.length>200||v.candidate_urls.some((s:unknown)=>!publicCandidateUrl(s,token))||new Set(v.candidate_urls).size!==v.candidate_urls.length)throw Error('候选图片观察无效');if(previous?.candidate_urls?.some(s=>!v.candidate_urls.includes(s)))throw Error('候选图片进度不能倒退');}
 if(v.inspected_images!==undefined){if(!Array.isArray(v.inspected_images)||v.inspected_images.length>80)throw Error('图片检查观察无效');const anchors=kind==='article'?JSON.parse(row.paragraphs).filter((p:string)=>p.trim()).length:[JSON.parse(row.input_json).title,...JSON.parse(row.input_json).paragraphs].filter((p:string)=>p.trim()).length;for(const image of v.inspected_images){object(image,['sha256','width','height','after_paragraph']);if(!digest.test(image.sha256)||!Number.isSafeInteger(image.width)||image.width<1||image.width>100000||!Number.isSafeInteger(image.height)||image.height<1||image.height>100000||!Number.isSafeInteger(image.after_paragraph)||image.after_paragraph<0||image.after_paragraph>=anchors)throw Error('实际像素或配图位置观察无效');}if(new Set(v.inspected_images.map((i:any)=>i.sha256)).size!==v.inspected_images.length||previous?.inspected_images?.some(i=>!v.inspected_images.some((n:any)=>JSON.stringify(n)===JSON.stringify(i))))throw Error('已检查配图不能重复或倒退');}
 if(v.images_total!==undefined&&(!Number.isSafeInteger(v.images_total)||v.images_total<1||v.images_total>80||v.images_total<(v.inspected_images?.length||previous?.inspected_images?.length||0)||(previous?.images_total!==undefined&&v.images_total!==previous.images_total)))throw Error('确定配图总数无效');
 if(v.word_sha256!==undefined&&(!digest.test(v.word_sha256)||meta(kind,row)?.sha256!==v.word_sha256))throw Error('进度与冻结Word字节不符');
 if(v.rendered_pages!==undefined&&(!Number.isSafeInteger(v.rendered_pages)||v.rendered_pages<1||v.rendered_pages>1000||(previous?.rendered_pages!==undefined&&v.rendered_pages!==previous.rendered_pages)))throw Error('真实页面总数无效');
 if(v.checked_pages!==undefined){const total=v.rendered_pages||previous?.rendered_pages;if(!total||!Array.isArray(v.checked_pages)||v.checked_pages.some((n:any,i:number)=>!Number.isSafeInteger(n)||n<1||n>total||(i>0&&n<=v.checked_pages[i-1]))||previous?.checked_pages?.some(n=>!v.checked_pages.includes(n)))throw Error('逐页检查观察无效');}
 return {...previous,...v} as WordObservation;
}

export async function recordWordProgress(owner:string,value:unknown){
 const a=object(value,['target_kind','target_id','claim_token','input_sha256','expected_version','event_id','stage','state','observation','execution_token']);const {kind,id}=target(a.target_kind,a.target_id);
 if(typeof a.claim_token!=='string'||!uuid.test(a.claim_token)||!digest.test(a.input_sha256)||!Number.isSafeInteger(a.expected_version)||a.expected_version<0||!uuid.test(a.event_id)||!wordStages.includes(a.stage)||!['running','completed','waiting','failed','recovering','executor_lost'].includes(a.state))throw Error('Word进度参数无效');
 const requiredResource=a.stage==='read_source'||a.stage==='collect_images'?'prepare':'heavy';
 const row=await owned(owner,kind,id),inputSha=await wordInputSha(kind,row),claimHash=await hashText(a.claim_token);
 if(inputSha!==a.input_sha256||row.state!=='processing'||row.result_key||!claimActive(kind,row)||(kind==='article'?row.claim_token!==a.claim_token:row.claim_hash!==claimHash))throw Error('进度认领或冻结输入已失效；先读取同一任务');
 const executionFence=await wordWriteFence(owner,kind,id,a.claim_token,a.execution_token,requiredResource);
 const attempt=await wordAttemptView(owner,kind,id),before=await latest(owner,kind,id),previous=applicableSnapshot(before,inputSha,attempt),version=await latestVersion(owner,kind,id);
 await assertWordCredentialFree(owner,{target_id:id,event_id:a.event_id,observation:a.observation},[a.claim_token,a.execution_token]);
 const payload={stage:a.stage,state:a.state,observation:a.observation,input_sha256:a.input_sha256},canonical=JSON.stringify({...payload,...(attempt?{attempt_id:attempt.attempt_id,generation:attempt.generation}:{})}),payloadHash=await hashText(canonical);
 const replay=await db().prepare('SELECT * FROM word_progress_events WHERE owner=? AND target_kind=? AND target_id=? AND event_id=?').bind(owner,kind,id,a.event_id).first<EventRow>();
 if(replay){const legacyReplay=attempt?.generation===1&&replay.attempt_id===null&&replay.payload_sha256===await hashText(JSON.stringify(payload));if((replay.payload_sha256!==payloadHash&&!legacyReplay)||!applicableSnapshot(replay,inputSha,attempt))throw Error('同一进度事件内容或尝试冲突');const fresh=await owned(owner,kind,id);await assertCurrentWordWritePermission(owner,kind,id,a.claim_token,a.execution_token,requiredResource);if(fresh.state!=='processing'||fresh.result_key||!claimActive(kind,fresh)||(kind==='article'?fresh.claim_token!==a.claim_token:fresh.claim_hash!==claimHash)||await wordInputSha(kind,fresh)!==inputSha)throw Error('晚到进度事件');return {recorded:true,duplicate:true,word_progress:await readWordProgress(owner,kind,id)};}
 if(version!==a.expected_version||(before&&before.input_sha256!==inputSha))throw Error('进度版本已变化；先读取同一任务');
 const proof=await readWordProgress(owner,kind,id,row),steps=previous?structuredClone(previous.steps):(!proof.output&&!parse(row.artifact_manifest)?.layout?emptyWordSteps():proof.steps);
 const replaced=!!previous?.output_sha256&&previous.output_sha256!==meta(kind,row)?.sha256;
 const index=wordStages.indexOf(a.stage),prior=previous?wordStages.indexOf(previous.stage):-1;
 const provenStart=proof.output?5:parse(row.artifact_manifest)?.layout?3:0;
 const nativeResume=index>prior&&index<=provenStart&&!!(proof.output||parse(row.artifact_manifest)?.layout);
 if(!replaced&&(index<prior||(index>(prior<0?provenStart:prior+1)&&!nativeResume)||(index>prior&&prior>=0&&steps[prior].state!=='completed'&&!nativeResume)||(index===prior&&steps[prior].state==='completed')))throw Error('阶段不能倒序、重做已确认工作或跳过未确认工作');
 if(nativeResume)for(let i=0;i<index;i++)if(steps[i].state!=='completed')steps[i].state='unrecorded';
 if(replaced){if(index<3||index>4)throw Error('更正Word后先检查同一新输出');for(let i=3;i<6;i++)steps[i]={...proof.steps[i]};}
 const observed=observation(a.observation,a.stage,replaced&&index>=3?undefined:previous?.observations[a.stage as WordStage],row,kind,a.claim_token);
 if(observed.inspected_images)await verifyCheckpointPixels(owner,kind,id,observed.inspected_images);
 if(a.state==='executor_lost'&&observed.reason!=='executor_ended')throw Error('明确失联需要执行者结束证据');
 if(a.state==='completed'){
  if(index===5)throw Error('保存完成只由本站finalize与独立读回确认');
  if(index===2){const images=parse(row.artifact_manifest)?.layout?.images;if(!images||!observed.inspected_images||images.length!==observed.inspected_images.length||(observed.images_total!==undefined&&observed.images_total!==images.length)||images.some((i:any,n:number)=>i.sha256!==observed.inspected_images![n].sha256||i.after_paragraph!==observed.inspected_images![n].after_paragraph))throw Error('确定配图完成需真实像素观察与同一冻结图片计划');}
  if(index===3&&!proof.output)throw Error('Word生成完成需冻结输出身份');
  if(index===4&&(!observed.word_sha256||!observed.rendered_pages||observed.checked_pages?.length!==observed.rendered_pages))throw Error('逐页完成需同一Word和全部真实页面观察');
 }
 const counts=observed.candidate_urls?{completed:observed.candidate_urls.length,total:null,unit:'candidates' as const}:observed.inspected_images?{completed:observed.inspected_images.length,total:observed.images_total||null,unit:'images' as const}:observed.checked_pages?{completed:observed.checked_pages.length,total:observed.rendered_pages||null,unit:'pages' as const}:null;
 steps[index]={...steps[index],state:a.state==='completed'?'completed':'current',action:wordActions[observed.action],counts,evidence:'executor_report'};
 const observations={...previous?.observations};if(replaced)for(const s of wordStages.slice(3))delete observations[s];
 const now=time(),snapshot:Snapshot={...(attempt?{attempt_id:attempt.attempt_id,generation:attempt.generation}:{}),steps,stage:a.stage,state:a.state==='completed'?'running':a.state,reason:observed.reason,observations:{...observations,[a.stage]:observed},output_sha256:meta(kind,row)?.sha256||null,started_at:previous?.started_at||now,updated_at:now,executor_updated_at:now};
 await assertWordCredentialFree(owner,snapshot,[a.claim_token,a.execution_token]);
 const table=kind==='article'?'articles':'local_word_jobs',claimCondition=kind==='article'?'claim_token=?':'claim_hash=?',sourceCondition=kind==='article'?'paragraphs=?':"input_json=? AND input_sha256=? AND source_kind='local_desktop' AND output_mode='word_only' AND destinations_json='[]'";
 const changed=await db().prepare(`INSERT OR IGNORE INTO word_progress_events(owner,target_kind,target_id,version,event_id,input_sha256,payload_sha256,snapshot_json,created,attempt_id)
 SELECT ?,?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT MAX(version) FROM word_progress_events WHERE owner=? AND target_kind=? AND target_id=?),0)=?
 AND EXISTS(SELECT 1 FROM ${table} WHERE owner=? AND id=? AND ${claimCondition} AND claim_expires>? AND claim_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND state='processing' AND result_key IS NULL AND ${sourceCondition} AND ${kind==='article'?'result_meta':'output_meta'} IS ? AND artifact_manifest IS ? ${executionFence})`)
 .bind(owner,kind,id,a.expected_version+1,a.event_id,inputSha,payloadHash,JSON.stringify(snapshot),now,attempt?.attempt_id||null,owner,kind,id,a.expected_version,owner,id,kind==='article'?a.claim_token:claimHash,now,...(kind==='article'?[row.paragraphs]:[row.input_json,inputSha]),kind==='article'?row.result_meta:row.output_meta,row.artifact_manifest).run();
 if(!changed.meta.changes){const duplicate=await db().prepare('SELECT payload_sha256 FROM word_progress_events WHERE owner=? AND target_kind=? AND target_id=? AND event_id=?').bind(owner,kind,id,a.event_id).first<{payload_sha256:string}>();if(duplicate?.payload_sha256===payloadHash){const fresh=await owned(owner,kind,id);await assertCurrentWordWritePermission(owner,kind,id,a.claim_token,a.execution_token,requiredResource);if(fresh.state==='processing'&&!fresh.result_key&&claimActive(kind,fresh)&&(kind==='article'?fresh.claim_token===a.claim_token:fresh.claim_hash===claimHash)&&await wordInputSha(kind,fresh)===inputSha)return {recorded:true,duplicate:true,word_progress:await readWordProgress(owner,kind,id,fresh)};}throw Error('进度或任务已变化；拒绝晚到事件，先读取同一任务');}
 return {recorded:true,duplicate:false,word_progress:await readWordProgress(owner,kind,id)};
}

export async function wordProgressCall(owner:string,name:string,a:Record<string,unknown>){
 if(name==='record_word_progress')return recordWordProgress(owner,a);
 object(a,['target_kind','target_id','event_id']);if(a.event_id!==undefined&&(typeof a.event_id!=='string'||!uuid.test(a.event_id)))throw Error('进度事件编号无效');
 const {kind,id}=target(a.target_kind,a.target_id),row=await owned(owner,kind,id),progress=await readWordProgress(owner,kind,id,row),event=await latest(owner,kind,id,progress.version),snapshot=applicableSnapshot(event,progress.input_sha256,progress.attempt||null);
 await assertWordCredentialFree(owner,{event_id:a.event_id},kind==='article'?[row.claim_token]:[]);
 const observations={...snapshot?.observations};if(snapshot?.output_sha256&&snapshot.output_sha256!==progress.output?.sha256)for(const stage of wordStages.slice(3))delete observations[stage];
 const receipt=a.event_id?await db().prepare('SELECT * FROM word_progress_events WHERE owner=? AND target_kind=? AND target_id=? AND event_id=?').bind(owner,kind,id,a.event_id).first<EventRow>():null;
 const receiptSnapshot=applicableSnapshot(receipt,progress.input_sha256,progress.attempt||null);
 return {word_progress:progress,observations:await redactWordCredentialText(owner,observations,kind==='article'?[row.claim_token]:[]),...(a.event_id?{event_receipt:{event_id:a.event_id,state:receipt?'recorded':'not_recorded',version:receipt?.version||null,applicable:!!receiptSnapshot&&(!receiptSnapshot.output_sha256||receiptSnapshot.output_sha256===progress.output?.sha256)}}:{}),resume_only:true,new_execution_grant:false};
}

// Native tool hooks append their real persisted image/output evidence only after
// that operation succeeds. They never invent executor research/page observations.
// Opt-in only: an old running/completed task with no stream receives no new row.
export async function observeNativeWordProgress(owner:string,kind:WordTarget,id:string,token:string,action:'image_plan_recorded'|'output_frozen'|'chunk_saved'|'output_finalized',expectedAttemptId?:string|null){
 try{
  const attempt=await wordAttemptView(owner,kind,id);if(expectedAttemptId!==undefined&&expectedAttemptId!==(attempt?.attempt_id||null)||expectedAttemptId===undefined&&attempt&&attempt.generation>1)return;
  const before=await latest(owner,kind,id);if(!before)return;
  const row=await owned(owner,kind,id),inputSha=await wordInputSha(kind,row),snapshot=applicableSnapshot(before,inputSha,attempt),version=await latestVersion(owner,kind,id);
  if(!snapshot||before.input_sha256!==inputSha||(kind==='article'?row.claim_token!==token:row.claim_hash!==await hashText(token)))return;
  if(action!=='output_finalized'&&(row.state!=='processing'||row.result_key||!claimActive(kind,row)))return;
  if(action==='output_finalized'&&!row.result_key)return;
  const m=meta(kind,row),layout=parse(row.artifact_manifest)?.layout;
  const evidence={...(attempt?{attempt_id:attempt.attempt_id,generation:attempt.generation}:{}),action,layout_sha256:layout?.sha256||null,output_id:m?.output_id||null,word_sha256:m?.sha256||null,chunks_saved:Array.isArray(m?.parts)?m.parts.length:0,finalized:!!row.result_key};
  const payload=JSON.stringify(evidence),payloadHash=await hashText(payload),eventId='site_'+payloadHash;
  const now=time(),next={...snapshot,...(attempt?{attempt_id:attempt.attempt_id,generation:attempt.generation}:{}),state:['failed','waiting','executor_lost'].includes(snapshot.state)?'recovering':snapshot.state,reason:['failed','waiting','executor_lost'].includes(snapshot.state)?'none':snapshot.reason,updated_at:now,native_evidence:evidence};
  await assertWordCredentialFree(owner,next,[token]);
  const table=kind==='article'?'articles':'local_word_jobs',claimColumn=kind==='article'?'claim_token':'claim_hash',outputColumn=kind==='article'?'result_meta':'output_meta',claim=kind==='article'?token:await hashText(token);
  const attemptFence=await wordAttemptSelectionSql(owner,kind,id,'word_progress_events');
  await db().prepare(`INSERT OR IGNORE INTO word_progress_events(owner,target_kind,target_id,version,event_id,input_sha256,payload_sha256,snapshot_json,created,attempt_id)
   SELECT ?,?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT MAX(version) FROM word_progress_events WHERE owner=? AND target_kind=? AND target_id=?),0)=?
   AND EXISTS(SELECT 1 FROM word_progress_events WHERE owner=? AND target_kind=? AND target_id=? AND version=? AND (${attemptFence}))
   AND EXISTS(SELECT 1 FROM ${table} WHERE owner=? AND id=? AND ${claimColumn}=? AND state=? AND ${outputColumn} IS ? AND artifact_manifest IS ? AND result_key IS ? AND ${kind==='article'?'paragraphs':'input_json'}=?
   ${kind==='local_word'?"AND input_sha256=? AND source_kind='local_desktop' AND output_mode='word_only' AND destinations_json='[]'":''}
   AND ${action==='output_finalized'?"result_key IS NOT NULL":"state='processing' AND result_key IS NULL AND claim_expires>strftime('%Y-%m-%dT%H:%M:%fZ','now')"})`)
   .bind(owner,kind,id,version+1,eventId,inputSha,payloadHash,JSON.stringify(next),now,attempt?.attempt_id||null,owner,kind,id,version,owner,kind,id,before.version,owner,id,claim,row.state,kind==='article'?row.result_meta:row.output_meta,row.artifact_manifest,row.result_key,kind==='article'?row.paragraphs:row.input_json,...(kind==='local_word'?[inputSha]:[])).run();
 }catch{/* Optional progress cannot interrupt the established Word protocol. The next read still derives actual site evidence. */}
}
