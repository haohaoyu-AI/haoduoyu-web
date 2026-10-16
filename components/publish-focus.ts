/** Presentation-only focus. This module never changes article or delivery state. */
import {retainedWordAdvice} from './word-recovery-capability';
import type {WordProgress} from '../lib/word-progress-contract';
import type {UploadProgress} from './upload-progress';
export type DraftDelivery = {platform:string;state:string;draft_url?:string|null;verified_readback?:boolean|number;updated?:string|null;message?:string|null};
export type PublishRow = { id: string; state: string; has_result?: boolean; draft_url?: string | null; toutiao_verified_readback?:boolean|number; deliveries?: DraftDelivery[]; upload_progress?:UploadProgress[]; word_progress?:WordProgress|null; word_progress_deferred?:boolean;word_progress_unavailable?:boolean };
export type PublishFocus = { seen: string[]; current: Record<string, { complete: boolean; open: boolean }> };

export type ProgressSummary = {state:'completed'|'running'|'waiting'|'queued'|'blocked'|'paused'|'unknown'|'pending';label:string;reason:string;help:string};
// A fresh control/attempt read can supersede a progress snapshot. Never carry
// the old holder's settled label across a later active execution or generation.
export function wordSettlementApplies(progress:WordProgress,attempt=progress.attempt,control=progress.recovery){
 return progress.target_kind==='article'&&progress.settlement?.execution==='ended_settled'&&progress.execution.state==='ended_settled'&&attempt?.state==='ended'&&attempt.active_started_at===null&&attempt.attempt_id===progress.attempt?.attempt_id&&attempt.generation===progress.attempt?.generation&&!!control&&control.version===progress.recovery?.version&&!control.execution_confirmed&&!control.safety_stop_pending&&!['running','queued','stop_requested','waiting_safe_stop'].includes(control.status);
}
const verified=(value:unknown)=>value===true||value===1;
// Raw diagnostic text is retained by the server, never interpreted as display copy.
// A closed presentation boundary avoids guessing every credential/encoding form.
export function safeDiagnosticText(value:string|null|undefined){
  return value?'详细记录已保留，原始诊断不在页面展示。':'';
}
export function safeDraftLink(value:string|null|undefined,platform?:string){
  if(typeof value!=='string'||value.length>1024||/[\s%\\]/.test(value))return null;
  // These are the canonical private editor identities already accepted by the
  // project's upload readback contract. Do not decode, strip or normalize URLs.
  if((platform===undefined||platform==='toutiao')&&/^https:\/\/mp\.toutiao\.com\/profile_v4\/graphic\/publish\?pgc_id=[0-9]+$/.test(value))return value;
  if((platform===undefined||platform==='zhihu')&&/^https:\/\/zhuanlan\.zhihu\.com\/p\/[0-9]+\/edit$/.test(value))return value;
  return null;
}
export function safeRecordId(value:string){
  return typeof value==='string'&&!/\s/.test(value)&&/^(?:localword_)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:'编号未展示';
}
export function platformProgress(row:PublishRow,platform:'toutiao'|'zhihu'):ProgressSummary&{url:string|null;updated:string|null}{
  const name=platform==='toutiao'?'头条':'知乎',delivery=row.deliveries?.find(value=>value.platform===platform),upload=row.upload_progress?.find(value=>value.platform===platform);
  const platformStarted=row.has_result||row.draft_url||upload?.attempt||upload?.diagnostic;
  const state=delivery?.state||(platform==='toutiao'&&(platformStarted||['completed','toutiao_saving'].includes(row.state))?({completed:'saved',toutiao_saving:'saving',needs_login:'needs_login',needs_verification:'needs_verification'} as Record<string,string>)[row.state]:undefined);
  const url=safeDraftLink(delivery?.draft_url||(platform==='toutiao'?row.draft_url:null),platform);
  const receipt=delivery?verified(delivery.verified_readback):platform==='toutiao'&&verified(row.toutiao_verified_readback);
  const base={url,updated:delivery?.updated||null};
  if(state==='saved'&&url&&receipt)return {...base,state:'completed',label:'草稿已保存并验收',reason:'标题、正文和配图已验收回写。',help:'无需处理'};
  const diagnostic=upload?.diagnostic;
  if(state==='needs_login')return {...base,state:'blocked',label:'需要登录',reason:`${name}登录尚未完成。`,help:'请完成平台登录'};
  if(diagnostic?.outcome==='failed'&&!upload?.diagnostic_superseded){
    const reason=diagnostic.cause==='permission_denied'?'操作未获批准，已有成果保留。':diagnostic.cause==='browser_disconnected'||diagnostic.cause==='tool_unavailable'?'操作工具暂不可用，已有成果保留。':diagnostic.cause==='platform_rejected'?'平台提示导入失败，已有成果保留。':'本次操作结果未确认，先核对已有草稿。';
    return {...base,state:'blocked',label:'需要处理',reason,help:'请让小鱼核对原因'};
  }
  if(state==='failed')return {...base,state:'blocked',label:'需要处理',reason:`${name}草稿尚未完成。`,help:'请让小鱼核对原因'};
  if(state==='saved'||state==='needs_verification'||url||['draft_observed','outcome_unknown'].includes(upload?.attempt?.state||''))return {...base,state:'unknown',label:'等待验收确认',reason:'保存或完整验收结果尚未确认。',help:'请让小鱼核对已有草稿'};
  if(state==='saving'||['consumed','import_started'].includes(upload?.attempt?.state||''))return {...base,state:'waiting',label:'等待保存结果',reason:'已记录上传阶段，等待实际保存和验收回写。',help:'无需重复上传'};
  if(state==='pending'||upload?.attempt?.state==='reserved')return {...base,state:'waiting',label:'等待上传',reason:'尚未确认文件提交。',help:'无需重复提交'};
  if(state==='not_started')return {...base,state:'pending',label:'尚未开始',reason:'',help:'无需处理'};
  return {...base,state:'unknown',label:'暂无状态记录',reason:'尚未读到这个平台的处理结果。',help:'无需重复提交'};
}
const wordStageActions:Record<string,string>={read_source:'正在读原文',collect_images:'正在找图片',confirm_images:'正在选图片',generate_word:'正在排版',inspect_pages:'正在检查页面',save_final:'正在保存成品'};
const wordStageTitles:Record<string,string>={read_source:'读取原文',collect_images:'搜集图片',confirm_images:'确定配图',generate_word:'生成 Word',inspect_pages:'逐页检查',save_final:'保存成品'};
function mappedText(labels:Record<string,string>,key:string){return Object.hasOwn(labels,key)?labels[key]:'';}
export function wordStageTitle(id:string){return mappedText(wordStageTitles,id)||'步骤待核对';}
export function wordStageAction(id:string,completed=false){const action=mappedText(wordStageActions,id);return action?(completed?action.replace(/^正在/,'已'):action):'';}
export function wordProgressSummary(progress:WordProgress|null|undefined,options:{stale?:boolean;control?:WordProgress['recovery'];attempt?:WordProgress['attempt']}={}):ProgressSummary{
  const unknown:ProgressSummary={state:'unknown',label:'进度待确认',reason:'尚未读到可确认的新进度。',help:retainedWordAdvice(progress,!!options.stale)};
  if(!progress)return unknown;
  if(options.stale)return {...unknown,reason:'暂时无法确认新状态，保留上次记录。'};
  const control=options.control===undefined?progress.recovery:options.control,attempt=options.attempt===undefined?progress.attempt:options.attempt;
  if(progress.save.independently_confirmed)return {state:'completed',label:progress.target_kind==='local_word'?'云端 Word 已就绪':'Word 已就绪',reason:'本站成品已保存并读回核对。',help:'无需重新制作'};
  if(progress.save.cloud_ready||progress.save.state==='readback_pending')return {state:'waiting',label:progress.target_kind==='local_word'?'云端成品等待读回确认':'成品等待读回确认',reason:'保存记录已保留，等待读回核对。',help:'先独立读回确认同一份成品'};
  const stop=control?.safety_stop_pending||['stop_requested','waiting_safe_stop'].includes(control?.status||'')||['stop_requested','waiting_safe_stop'].includes(attempt?.state||'');
  if(stop){
    const requested=!!attempt?.stop_requested_at||control?.status==='stop_requested'||attempt?.state==='stop_requested'||control?.desired==='paused'||control?.desired==='cancelled';
    return {state:'waiting',label:requested?'等待暂停完成':'等待停止确认',reason:requested?'停止请求已保存，原操作结束尚未确认。':'原操作结束尚未确认，等待停止结果核对。',help:'请等待读回停止结果，勿重复开始'};
  }
  if(wordSettlementApplies(progress,attempt,control)){
    const claim=progress.settlement!.main_claim;
    const claimText=claim==='settled'?'文章认领已结束。':claim==='unsettled_active'?'文章认领尚未结束。':claim==='unsettled_expired'?'文章认领已到期，结束回执尚未确认。':'文章认领结束情况尚待核对。';
    const blocked:Record<string,string>={http_403:'图片访问阻断记录仍待正规核验。',login_required:'登录条件仍未恢复。',captcha:'验证条件仍未恢复。'};
    const incident=control?.reason?mappedText(blocked,control.reason):'';
    return {state:'blocked',label:'执行已停止并结清',reason:`${claimText}${incident}已有进度和成果保留。`,help:claim==='settled'?'继续前请核对处理条件':'请让小鱼核对文章认领结束回执'};
  }
  if(control?.desired==='paused'||control?.desired==='cancelled')return {state:'paused',label:control.desired==='paused'?'已暂停':'已取消',reason:'已有进度和成果保留。',help:'需要继续时再点击继续'};
  if(attempt?.timeout_due)return {state:'blocked',label:'需要处理',reason:'本次配图超时，原操作是否结束仍待核对。',help:'请让小鱼核对原操作'};
  const reasons:Record<string,string>={http_403:'图片暂时无法访问。',login_required:'需要完成登录。',captcha:'需要完成平台验证。',no_executor:'等待小鱼接手。',executor_ended:'原处理已结束，等待恢复。',network_timeout:'网络请求超时，结果待核对。',response_unknown:'上次操作结果待核对。',service_unavailable:'服务暂不可用。',rate_limited:'请求暂时受限。',render_unavailable:'页面检查暂不可用。',storage_unavailable:'文件保存暂不可用。',network_unavailable:'网络访问暂不可用。',waiting_for_images:'等待可用图片。'};
  const reasonKey=control?.reason&&control.reason!=='none'?control.reason:progress.execution.reason;
  if(control?.status==='blocked'||attempt?.state==='blocked'||progress.execution.state==='failed'||progress.execution.state==='executor_lost')return {state:'blocked',label:'需要处理',reason:mappedText(reasons,reasonKey)||'处理受阻，已有成果保留。',help:reasonKey==='login_required'?'请完成登录':reasonKey==='captcha'?'请完成平台验证':'请让小鱼核对原因'};
  if(control?.status==='queued'||attempt?.state==='queued')return {state:'queued',label:'排队中',reason:'等待处理位置，排队时间不计入配图耗时。',help:'无需重复提交'};
  if(control?.status==='await_executor'||control?.status==='backoff')return {state:'waiting',label:'等待继续处理',reason:mappedText(reasons,reasonKey)||'等待小鱼接手已有进度。',help:'无需重复提交'};
  if(progress.execution.update_overdue||control?.heartbeat_overdue||(control?.status==='running'&&!control.execution_confirmed))return {...unknown,reason:'暂无新的处理记录，是否仍在执行待确认。'};
  const current=progress.steps.find(step=>step.state==='current');
  if(!['running','waiting','failed','recovering','executor_lost','saved'].includes(progress.execution.state))return unknown;
  if(control&&(!['running','saved'].includes(control.status)||!['run','paused','cancelled'].includes(control.desired)))return unknown;
  if(progress.execution.state==='saved')return unknown;
  if(progress.steps.every(step=>step.state==='pending')&&!progress.started_at)return {state:'pending',label:'尚未开始',reason:'尚无实际处理记录。',help:'无需重复提交'};
  if(progress.execution.state==='waiting'||progress.execution.state==='recovering'||control?.queue_reason)return {state:'waiting',label:progress.execution.state==='recovering'?'等待恢复确认':'等待继续处理',reason:mappedText(reasons,reasonKey)||'等待处理条件恢复，已有成果保留。',help:'无需重复提交'};
  if(progress.execution.state==='running'&&current&&progress.started_at&&Number.isFinite(Date.parse(progress.started_at))&&current.action&&mappedText(wordStageActions,current.id))return {state:'running',label:wordStageAction(current.id),reason:'',help:'无需处理'};
  return unknown;
}

export function publishComplete(row: PublishRow) {
  if (row.state === 'text_saved') return true;
  const deliveries = row.deliveries || [];
  const toutiao = deliveries.find(delivery => delivery.platform === 'toutiao');
  const zhihu = deliveries.find(delivery => delivery.platform === 'zhihu');
  return row.state === 'completed' && !!row.has_result
    && (toutiao ? toutiao.state === 'saved' && !!safeDraftLink(toutiao.draft_url,'toutiao') && verified(toutiao.verified_readback) : !!safeDraftLink(row.draft_url,'toutiao') && verified(row.toutiao_verified_readback))
    && !!zhihu && zhihu.state === 'saved' && !!safeDraftLink(zhihu.draft_url,'zhihu') && verified(zhihu.verified_readback)
    && deliveries.every(delivery => delivery.state === 'saved' && !!delivery.draft_url);
}

export function articleHandlingSummary(row:PublishRow):ProgressSummary|null{
  if(!['failed','needs_login','needs_verification'].includes(row.state))return null;
  if((['toutiao','zhihu'] as const).some(platform=>platformProgress(row,platform).state==='blocked'))return null;
  if(row.word_progress&&wordProgressSummary(row.word_progress,{stale:row.word_progress_unavailable||row.word_progress_deferred}).state==='blocked')return null;
  if(row.state==='needs_login')return {state:'blocked',label:'需要登录',reason:'本次处理需要登录；具体位置尚待核对。',help:'请完成本人登录；不确定位置时请让小鱼核对。'};
  if(row.state==='needs_verification')return {state:'unknown',label:'需要核对',reason:'已有结果或所需验证尚未确认。',help:'请让小鱼核对；如需本人验证，再完成验证。'};
  return {state:'blocked',label:'需要处理',reason:'本次处理未完成，原操作结束情况尚待核对。',help:'请让小鱼核对原因和已有成果，勿重复开始。'};
}

export function publishStatus(row: PublishRow) {
  if (row.state === 'text_saved') return '文字稿已保存';
  if (publishComplete(row)) return '两平台草稿已验收';
  if(row.state==='deleting')return '删除未完成';
  const platforms=['toutiao','zhihu'].map(platform=>platformProgress(row,platform as 'toutiao'|'zhihu'));
  if(platforms.some(value=>value.state==='blocked')||['failed','needs_login','needs_verification'].includes(row.state))return '需要处理';
  if(row.has_result||['completed','word_ready','toutiao_saving'].includes(row.state)){
    if(platforms.every(value=>value.state==='completed'))return row.has_result?'两平台已验收，其他平台待处理':'两平台已验收，Word 状态待确认';
    const next=platforms[0].state==='completed'?platforms[1]:platforms[0],name=platforms[0].state==='completed'?'知乎':'头条';
    return next.label==='等待上传'||next.state==='pending'||next.label==='暂无状态记录'?`等待上传${name}`:`${name}草稿${next.label}`;
  }
  if(row.word_progress)return wordProgressSummary(row.word_progress,{stale:row.word_progress_unavailable||row.word_progress_deferred}).label;
  if(row.word_progress_deferred||row.word_progress_unavailable)return '进度待确认';
  return mappedText({uploaded:'尚未开始',queued:'排队中',processing:'进度待确认'},row.state)||'进度待确认';
}

export function reconcilePublishFocus(previous: PublishFocus | null, rows: PublishRow[]): PublishFocus {
  const ids = rows.map(row => row.id);
  if (!previous) return {seen:ids,current:{}};
  const current = {...previous.current};
  for (const row of rows) {
    const complete = publishComplete(row), before = current[row.id];
    if (before) current[row.id] = {complete,open: before.complete !== complete ? !complete : before.open};
    else if (!previous.seen.includes(row.id) && !complete) current[row.id] = {complete,open:true};
  }
  const started = ids.some(id => current[id] && !previous.current[id] && !current[id].complete);
  if (started) for (const id of Object.keys(previous.current)) if (current[id]?.complete && !current[id].open) delete current[id];
  for (const id of Object.keys(current)) if (!ids.includes(id)) delete current[id];
  return {seen:[...new Set([...previous.seen,...ids])].slice(-200),current};
}

const storageKey = 'publish-studio-focus-v1';
export function readPublishFocus(storage: Storage, now = Date.now()): PublishFocus | null {
  try {
    const saved = JSON.parse(storage.getItem(storageKey) || 'null'), value = saved?.value;
    if (!saved || !Number.isFinite(saved.at) || saved.at > now || now - saved.at > 6*60*60*1000 || !value || !Array.isArray(value.seen) || !value.seen.every((id:unknown) => typeof id === 'string') || !value.current || typeof value.current !== 'object' || Array.isArray(value.current)) return null;
    if (!Object.values(value.current).every(entry => !!entry && typeof entry === 'object' && 'complete' in entry && typeof entry.complete === 'boolean' && 'open' in entry && typeof entry.open === 'boolean')) return null;
    return value;
  } catch { return null; }
}
export function savePublishFocus(storage: Storage, value: PublishFocus | null) {
  try { if (value) storage.setItem(storageKey,JSON.stringify({at:Date.now(),value})); else storage.removeItem(storageKey); } catch { /* Optional local UI state cannot block the operation. */ }
}
