'use client';
import {useRef,useState} from 'react';
import {readDailyNdjson} from './daily-run-stream';
type Stage='outline'|'body';
type View={archived?:boolean;paused?:boolean;mutation_allowed?:boolean;approved_outline?:unknown;approved_outline_sha256?:string|null;approved_outline_version?:number|null;parent_run_id?:string|null;revision_child_run_id?:string|null;review_sha256?:string|null;pipeline_state?:'text_saved'|'submitted'|'dispatching'|'needs_connection'|null;handoff_error?:string|null;resume_action?:'finalize_verified'|'read_only';run_id:string;state:string;article_id:string;snapshot_sha256:string;snapshot:{model:string;prompt_version:string;topic?:string;materials?:string;writing_prompt?:string;sources?:{title:string;url:string;published:string}[];evidence?:{id:string;text:string;source_ids:string[]}[];capability:{max_output_tokens:number;relay_limit_verified?:boolean}};outline:unknown;outline_sha256:string|null;review:unknown;stages:Record<Stage,{state:string;input_sha256:string|null;result?:{text?:string;partial_text?:string;error?:string;usage?:unknown;diagnostic?:unknown}}>};
const phases:Record<string,string>={outline_pending:'待生成框架',outline_review_pending:'框架已保存，待小鱼独立审核',approved:'框架已通过，待生成正文',body_review_pending:'初稿已保存，待独立审稿、改稿和复核',finalized:'复核成稿已交接',final_saved:'复核成稿已保存，图文交接待恢复',revise:'框架需修改，本次停止',blocked:'材料或框架阻塞，本次停止',outline_failed:'框架请求停止，仅可读取',body_failed:'正文请求停止，仅可读取'};
export function outlineHandoffDisplay(view:Pick<View,'state'|'pipeline_state'|'handoff_error'|'resume_action'|'archived'|'paused'>){
 if(view.archived||view.paused)return {status:view.archived?'本批次及修订已归档':'本批次及修订已暂停',error:null,next:view.archived?'可只读查看历史；恢复可见不会自动继续生成。':'可只读查看历史，暂停期间不能继续。'};
 if(view.pipeline_state==='text_saved')return {status:'文字稿已保存，已完成',error:null,next:'可在写作台阅读全文。'};
 if(!['final_saved','finalized'].includes(view.state)&&!view.pipeline_state)return null;
 const submitted=view.pipeline_state==='submitted',dispatching=view.pipeline_state==='dispatching',recoverable=view.pipeline_state==='needs_connection'&&view.resume_action==='finalize_verified';
 return {status:submitted?'复核成稿已交接':dispatching?'复核成稿已保存，图文交接正在进行或待核验':view.pipeline_state==='needs_connection'?'复核成稿已保存，图文交接待恢复':'复核成稿已保存，图文交接状态待核验',error:view.handoff_error||null,next:submitted?'下一步：只读查看交接结果。':recoverable?'下一步：恢复同一成稿的图文交接，不重新生成。':'下一步：只读刷新状态，不重复交接。'};
}
// Diagnostics are display-only. Never serialize the attempt, provider body, headers or unknown values.
const diagnosticCodes=new Set(['upstream_http_error','upstream_parameters_rejected','output_truncated','stop_reason_unknown','missing_text','outline_unexpected_origin','outline_empty_body','outline_response_too_large','outline_body_interrupted','outline_invalid_stream','outline_stream_error','outline_stream_incomplete','outline_stream_event_too_large','outline_unsupported_media_type','outline_invalid_utf8','unsafe_response','timeout','aborted','invalid_response_json','request_failed']);
const diagnosticMediaTypes=new Set(['text/event-stream','application/json','text/html','text/plain','application/problem+json','application/octet-stream']);
const diagnosticStopReasons=new Set(['end_turn','max_tokens','stop_sequence','tool_use','pause_turn','refusal','model_context_window_exceeded']);
export function outlineAttemptDiagnostics(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const diagnostic=value as Record<string,unknown>;
 const field=(key:string)=>Object.hasOwn(diagnostic,key)?diagnostic[key]:undefined;
 const missing='未记录',hidden='未识别或已隐藏';
 const number=(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>value==null?missing:typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max?String(value):hidden;
 const choice=(value:unknown,allowed:Set<string>)=>value==null?missing:typeof value==='string'&&allowed.has(value)?value:hidden;
 const stopped=field('message_stop_received');
 return [
  {key:'http_status',label:'HTTP 状态',value:number(field('http_status'),100,599)},
  {key:'code',label:'诊断代码（code）',value:choice(field('code'),diagnosticCodes)},
  {key:'media_type',label:'响应类型（media_type）',value:choice(field('media_type'),diagnosticMediaTypes)},
  {key:'response_bytes',label:'响应字节数（response_bytes）',value:number(field('response_bytes'))},
  {key:'stop_reason',label:'停止原因（stop_reason）',value:choice(field('stop_reason'),diagnosticStopReasons)},
  {key:'message_stop_received',label:'收到流结束事件（message_stop_received）',value:stopped==null?missing:stopped===true?'是':stopped===false?'否':hidden},
  {key:'elapsed_ms',label:'耗时毫秒（elapsed_ms）',value:number(field('elapsed_ms'))},
 ];
}
function OutlineAttemptDiagnostic({value}:{value:unknown}){
 const rows=outlineAttemptDiagnostics(value);if(!rows)return null;
 return <details className="border p-3"><summary>本次请求诊断（只读）</summary><p className="text-sm">仅展示已保存的诊断字段；缺失不代表请求未发生。</p><dl className="space-y-1 text-sm">{rows.map(row=><div key={row.key} className="flex flex-wrap gap-x-3"><dt>{row.label}：</dt><dd className="break-all">{row.value}</dd></div>)}</dl></details>;
}
type Action='archive'|'restore'|'create_outline_revision'|'create'|'claim_stage'|'review'|'create_revision'|'recover_completed';
type Lease={run_id:string;stage:Stage;token:string;input_sha256:string};
const safeId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const stageKey=(id:string,stage:Stage)=>id+':'+stage;
const jsonLimit=120000;
export function parseOutlineControlArguments(raw:string){
 if(!raw.trim()||raw.length>jsonLimit)throw Error('请填写完整且未超长的 JSON 参数');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw Error('参数必须是有效 JSON');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('参数必须是 JSON 对象');
 const args=value as Record<string,unknown>;
 if(args.confirm!==true)throw Error('请核实参数并将 confirm 改为 true，再勾选确认');
 return args;
}
function OutlineJsonForm({action,title,help,template,disabled,submit}:{action:'create'|'review'|'create_revision'|'create_outline_revision';title:string;help:string;template:Record<string,unknown>;disabled:boolean;submit:(action:Action,args:Record<string,unknown>)=>Promise<void>}){
 const [error,setError]=useState('');
 return <details className="border p-3"><summary>{title}</summary><p>{help}</p>
 <form autoComplete="off" className="space-y-3" onSubmit={event=>{event.preventDefault();if(disabled)return;const form=event.currentTarget,data=new FormData(form);if(data.get('confirm')!=='on')return;let args:Record<string,unknown>;try{args=parseOutlineControlArguments(String(data.get('arguments')||''));}catch(error){setError(error instanceof Error?error.message:'参数无效');return;}setError('');const checkbox=form.elements.namedItem('confirm');if(checkbox instanceof HTMLInputElement)checkbox.checked=false;void submit(action,args);}}>
 <label className="block">{title}完整 JSON 参数<textarea name="arguments" required maxLength={jsonLimit} rows={14} spellCheck={false} disabled={disabled} defaultValue={JSON.stringify(template,null,2)} className="block w-full border p-2 font-mono"/></label>
 <label className="block"><input name="confirm" type="checkbox" required disabled={disabled}/>我已核对全部参数和真实执行身份，明确确认本次操作。</label>
 <button type="submit" disabled={disabled}>{title}</button>{error&&<p role="alert">{error}</p>}
 </form></details>;
}
export default function OutlineRun(){
 // Keep runId/view first for the existing handoff rendering contract.
 const [runId,setRunId]=useState(''),[view,setView]=useState<View|null>(null),[stage,setStage]=useState<Stage>('outline'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[attemptedKeys,setAttemptedKeys]=useState<string[]>([]),[claimKeys,setClaimKeys]=useState<string[]>([]),[leaseBindings,setLeaseBindings]=useState<Record<string,string>>({});
 const lock=useRef(false),attempted=useRef(new Set<string>()),claimAttempted=useRef(new Set<string>()),sequence=useRef(0),leases=useRef(new Map<string,Lease>()),runField=useRef<HTMLInputElement|null>(null);
 async function refresh(id=runId){
  const seq=++sequence.current;const response=await fetch('/api/writing/outline-flow?run_id='+encodeURIComponent(id),{cache:'no-store'});const data=await response.json() as View;
  if(!response.ok||data.run_id!==id)throw Error('暂时未读取到本人的批次');if(seq!==sequence.current)return;
  if(data.archived||data.paused){for(const [key,lease] of leases.current){if(lease.run_id===id){lease.token='';leases.current.delete(key);}}setLeaseBindings(bindings=>Object.fromEntries(Object.entries(bindings).filter(([key])=>!key.startsWith(id+':'))));}
  setView(data);try{sessionStorage.setItem('writing-studio-started-task',data.run_id);}catch{/* Only a safe task focus; never persist a credential. */}
 }
 async function mutate(action:Action,args:Record<string,unknown>){
  if(lock.current||args.confirm!==true)return;
  const selected=view,id=selected?.run_id,key=id?stageKey(id,stage):'';
  if(action!=='create'&&(!selected||args.run_id!==id)){setMessage('参数与当前批次不符，请重新读取并核对');return;}
  if(action!=='create'&&action!=='archive'&&action!=='restore'&&(selected?.archived||selected?.paused||selected?.mutation_allowed===false)){setMessage('本批次及修订已归档或暂停，仅可读取。');return;}
  if(action==='restore'&&!selected?.archived)return;
  if(action==='create_outline_revision'&&(!selected||selected.parent_run_id||selected.state!=='revise'||args.expected_snapshot_sha256!==selected.snapshot_sha256||args.expected_outline_sha256!==selected.outline_sha256||args.expected_review_sha256!==selected.review_sha256)){setMessage('修订只能绑定原批次已保存的真实退回审核');return;}
  if(action==='review'&&(selected?.state!=='outline_review_pending'||args.expected_snapshot_sha256!==selected.snapshot_sha256||args.expected_outline_sha256!==selected.outline_sha256)){setMessage('审核必须绑定当前待审核框架的确切哈希');return;}
  if(action==='create_revision'&&(!selected||!['body_review_pending','final_saved','finalized'].includes(selected.state)||args.expected_prompt_version!==selected.snapshot.prompt_version)){setMessage('请先读取已保存的正文与确切提示词版本');return;}
  if(action==='claim_stage'){
   if(!selected||args.stage!==stage||args.expected_snapshot_sha256!==selected.snapshot_sha256||selected.stages[stage].state!=='not_claimed'||selected.state!==(stage==='outline'?'outline_pending':'approved')||claimAttempted.current.has(key))return;
   // An uncertain claim must not be retried, even while the visible GET is stale.
   claimAttempted.current.add(key);setClaimKeys(keys=>[...keys,key]);
  }
  if(action==='recover_completed'&&(!selected||args.stage!==stage||selected.stages[stage].state!=='completed'))return;
  const body=JSON.stringify({action,arguments:args});if(new TextEncoder().encode(body).byteLength>jsonLimit){setMessage('参数超出允许大小，请核对材料长度');return;}
  lock.current=true;setBusy(true);
  try{
   const response=await fetch('/api/writing/outline-flow',{method:'POST',headers:{'content-type':'application/json','x-xiaoyu-outline-flow':'1'},body});
   const data=await response.json() as Record<string,unknown>;
   if(!response.ok){setMessage('操作未确认，请核对参数并只读刷新状态；不要重复认领或生成。');return;}
   if(action==='archive'||action==='restore'){
    const affected=Array.isArray(data.affected_run_ids)?data.affected_run_ids.filter(safeId):[id];
    for(const [leaseKey,lease] of leases.current){if(affected.includes(lease.run_id)){lease.token='';leases.current.delete(leaseKey);}}
    setLeaseBindings(bindings=>Object.fromEntries(Object.entries(bindings).filter(([leaseKey])=>!affected.some(run=>leaseKey.startsWith(run+':')))));
    setMessage(action==='archive'?'本批次及修订已归档，历史状态和收费回执保留。':'已恢复本批次及修订的可见性，未自动继续；原有暂停仍保留。');
   }else if(action==='claim_stage'){
    if(data.claimed===true&&data.run_id===id&&data.stage===stage&&safeId(data.token)&&typeof data.input_sha256==='string'&&/^[a-f0-9]{64}$/i.test(data.input_sha256)){
     // Store the one-time credential before any UI output or fallible refresh.
     leases.current.set(key,{run_id:id!,stage,token:data.token,input_sha256:data.input_sha256});
     delete data.token;
     setLeaseBindings(bindings=>({...bindings,[key]:data.input_sha256 as string}));
     setMessage('已认领。凭证仅保存在本页内存，请核对后单独执行；刷新页面会丢失凭证。');
    }else{delete data.token;setMessage('未取得本阶段凭证，仅可只读查看；不重新认领。');}
   }else if(action==='create'||action==='create_outline_revision'){
    if(!safeId(data.run_id))throw Error('invalid response');
    setRunId(data.run_id);setView(null);setStage('outline');sequence.current++;
    setMessage('批次已保存，尚未认领或生成。');
    try{await refresh(data.run_id);}catch{setMessage('批次已保存，读取暂未确认；请用当前批次标识只读查看。');}
    runField.current?.focus();return;
   }else if(action==='create_revision'){
    if(!safeId(data.flow_id))throw Error('invalid response');
    setMessage('独立审改流程已建立，flow_id：'+data.flow_id);return;
   }else{setMessage(action==='review'?'独立审核记录已保存，请只读核对状态。':'已核对并恢复完整返回缓存，未调用模型。');}
   if(id)try{await refresh(id);}catch{setMessage(action==='claim_stage'&&leases.current.has(key)?'凭证已安全保留在本页内存，读取暂未确认。请只读刷新状态，不要重新认领。':'操作已返回，读取暂未确认；请只读刷新状态。');}
  }catch{setMessage('连接或返回结果未确认，请只读刷新，不重复本次操作。');}
  finally{lock.current=false;setBusy(false);}
 }
 async function execute(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!view||view.archived||view.paused||view.mutation_allowed===false||lock.current)return;
  const key=stageKey(view.run_id,stage),lease=leases.current.get(key),current=view.stages[stage];
  if(attempted.current.has(key)||!lease||lease.run_id!==view.run_id||lease.stage!==stage||lease.input_sha256!==current.input_sha256||current.state!=='claimed'||view.state!==(stage==='outline'?'outline_pending':'approved'))return;
  const form=event.currentTarget,data=new FormData(form);if(data.get('confirm')!=='on')return;
  lock.current=true;setBusy(true);attempted.current.add(key);setAttemptedKeys(keys=>[...keys,key]);
  const payload={run_id:view.run_id,stage,token:lease.token,expected_model:view.snapshot.model,expected_input_sha256:lease.input_sha256,confirm:true};
  leases.current.delete(key);lease.token='';setLeaseBindings(bindings=>{const next={...bindings};delete next[key];return next;}); // Destroy the reusable copy before sending.
  const field=form.elements.namedItem('token');if(field instanceof HTMLInputElement)field.value='';
  const checkbox=form.elements.namedItem('confirm');if(checkbox instanceof HTMLInputElement)checkbox.checked=false;
  setMessage('请求执行中。断线后只读刷新，不重复请求。');
  try{
   const response=await fetch('/api/claude/outline-run',{method:'POST',headers:{'content-type':'application/json','x-xiaoyu-outline-run':'1'},body:JSON.stringify(payload)});
   payload.token='';
   if(!response.ok||!response.body){setMessage('本阶段结果未确认，请只读查看状态，不重复请求。');return;}
   const terminal=await readDailyNdjson(response.body,()=>{});setMessage(terminal.success?'实际返回已保存，请读取阶段结果':'本阶段停止，请只读查看结果。');
  }catch{setMessage('连接结果未知。请只读刷新，不重复请求。');}
  finally{payload.token='';await refresh(view.run_id).catch(()=>{});lock.current=false;setBusy(false);}
 }
 const handoff=view?outlineHandoffDisplay(view):null,current=view?.stages[stage],key=view?stageKey(view.run_id,stage):'',leaseHash=leaseBindings[key];
 const controlBlocked=!!view&&(view.archived===true||view.paused===true||view.mutation_allowed===false);
 const phaseReady=!!view&&!controlBlocked&&view.state===(stage==='outline'?'outline_pending':'approved');
 const allowed=phaseReady&&current?.state==='claimed'&&!!leaseHash&&leaseHash===current.input_sha256&&!attemptedKeys.includes(key);
 const claimAllowed=phaseReady&&current?.state==='not_claimed'&&!claimKeys.includes(key);
 const stageConfirm=(event:React.FormEvent<HTMLFormElement>,action:'claim_stage'|'recover_completed')=>{event.preventDefault();if(!view||busy)return;const form=event.currentTarget,data=new FormData(form);if(data.get('confirm')!=='on')return;const checkbox=form.elements.namedItem('confirm');if(checkbox instanceof HTMLInputElement)checkbox.checked=false;void mutate(action,{run_id:view.run_id,stage,...(action==='claim_stage'?{expected_snapshot_sha256:view.snapshot_sha256}:{}),confirm:true});};
 return <main className="mx-auto max-w-3xl p-6 space-y-5"><a href="/writing">返回写作台</a><h1 className="text-2xl font-bold">Claude 框架 → 小鱼审核 → 正文</h1><p>框架与正文是两个独立请求。小鱼审核通过确切框架后，才可认领正文；正文还需独立审稿、改稿和复核。</p>
 <OutlineJsonForm action="create" title="创建框架批次" help="填写已核验的完整材料、来源及证据。授权键使用本次获准的稳定键，不能换键重试。创建不生成文章。" disabled={busy} submit={mutate} template={{authorization_key:'',expected_model:'',expected_prompt_version:'',topic:'',materials:'',sources:[{title:'',url:'',published:''},{title:'',url:'',published:''}],evidence:[{id:'E1',text:'',source_ids:['S1']}],confirm:false}}/>
 <form onSubmit={event=>{event.preventDefault();if(lock.current)return;void refresh().catch(()=>setMessage('读取未确认，请核对本人批次标识'));}}><label>批次标识<input ref={runField} className="block w-full border p-2" required value={runId} onChange={event=>{if(lock.current)return;setRunId(event.target.value);setView(null);sequence.current++;}} disabled={busy}/></label><button type="submit" disabled={busy}>只读查看本批次</button></form>
 <p role="status" aria-live="polite">{message}</p>{view&&<><p>{handoff?.status||phases[view.state]||view.state}</p>{handoff?.error&&<p>{handoff.error}</p>}{handoff&&<p>{handoff.next}</p>}<p>模型：{view.snapshot.model}；提示词：{view.snapshot.prompt_version}</p><p>接口请求上界：{view.snapshot.capability.max_output_tokens} tokens。已取消人为 14000 限制。{view.snapshot.capability.relay_limit_verified===false?'依据官方上游型号文档；中转上界尚未单独证实。':''}接口没有“无限”参数；单阶段最多一次请求。</p>
 {view.parent_run_id&&<p>这是唯一一次修订，父批次：{view.parent_run_id}。生成修订框架会新增一次模型请求，必须单独确认；仍需重新独立审核，未通过不能写正文。</p>}
 <details className="border p-3"><summary>归档与恢复可见性</summary><p>归档会同时隐藏原批次及唯一修订，保留真实状态、冻结材料和收费回执。恢复只让它们重新可见，不自动认领、生成、审核、恢复缓存或交接。</p><form onSubmit={event=>{event.preventDefault();if(!view||busy)return;const form=event.currentTarget,data=new FormData(form);if(data.get('confirm')!=='on')return;const checkbox=form.elements.namedItem('confirm');if(checkbox instanceof HTMLInputElement)checkbox.checked=false;void mutate(view.archived?'restore':'archive',{run_id:view.run_id,reason:String(data.get('reason')||'用户页面明确操作'),confirm:true});}}><label className="block">操作备注<input name="reason" maxLength={1000} disabled={busy} className="block w-full border p-2"/></label><label className="block"><input name="confirm" type="checkbox" required disabled={busy}/>明确确认{view.archived?'恢复本批次及修订的可见性，不自动继续':'归档本批次及修订，保留历史记录'}。</label><button type="submit" disabled={busy}>{view.archived?'恢复可见（不自动继续）':'归档本批次及修订'}</button></form></details>
 <label>执行阶段<select value={stage} disabled={busy||controlBlocked} onChange={event=>{if(!lock.current)setStage(event.target.value as Stage);}}><option value="outline">只生成框架</option><option value="body">按已批准框架生成正文</option></select></label>
 <form key={'claim:'+key} onSubmit={event=>stageConfirm(event,'claim_stage')}><label className="block"><input type="checkbox" name="confirm" required disabled={busy||!claimAllowed}/>明确确认认领当前批次的当前阶段，不调用模型。</label><button type="submit" disabled={busy||!claimAllowed}>认领本阶段</button></form>
 <form key={'execute:'+key} onSubmit={execute} autoComplete="off" className="space-y-3"><label className="block">一次性认领凭证<input name="token" type="password" autoComplete="off" disabled={busy||controlBlocked||current?.state!=='claimed'||attemptedKeys.includes(key)} placeholder={leaseHash?'凭证已在本页内存中保留，无需填写':'仅可填写已取得且仍有效的本阶段凭证'} onChange={event=>{if(controlBlocked||lock.current||current?.state!=='claimed'||!current.input_sha256||attempted.current.has(key))return;const token=event.target.value;if(token)leases.current.set(key,{run_id:view.run_id,stage,token,input_sha256:current.input_sha256});else leases.current.delete(key);setLeaseBindings(bindings=>{const next={...bindings};if(token)next[key]=current.input_sha256!;else delete next[key];return next;});setMessage(token?'已暂存本阶段凭证，请核对后明确执行。':'本阶段无凭证，仅可只读查看。');}} className="block w-full border p-2"/></label><p>凭证只在本页内存或密码框中保留，不写入网址或浏览器存储。刷新丢失凭证后仅可读取，不能重新认领。</p><label className="block"><input type="checkbox" name="confirm" required disabled={busy||!allowed}/>已获授权执行本阶段唯一请求，300 秒超时，不自动重试。</label><button disabled={busy||!allowed} type="submit">执行本阶段</button></form>
 <form key={'recover:'+key} onSubmit={event=>stageConfirm(event,'recover_completed')}><label className="block"><input type="checkbox" name="confirm" required disabled={busy||controlBlocked||current?.state!=='completed'}/>明确确认仅恢复本阶段已完整保存的 completed 缓存。</label><button type="submit" disabled={busy||controlBlocked||current?.state!=='completed'}>从已存结果恢复阶段</button></form>
 <details className="border p-3"><summary>冻结材料与写作要求</summary><p>选题：{view.snapshot.topic||'未提供'}</p><h2>原始材料</h2><pre className="whitespace-pre-wrap">{view.snapshot.materials||'未提供'}</pre><h2>来源（依次为 S1、S2…）</h2><pre className="whitespace-pre-wrap">{JSON.stringify(view.snapshot.sources||[],null,2)}</pre><h2>证据</h2><pre className="whitespace-pre-wrap">{JSON.stringify(view.snapshot.evidence||[],null,2)}</pre><h2>完整冻结写作要求</h2><pre className="whitespace-pre-wrap">{view.snapshot.writing_prompt||'未提供'}</pre></details>
 <p>冻结快照 SHA256：{view.snapshot_sha256}；框架 SHA256：{view.outline_sha256||'尚未保存'}</p>
 {view.state==='revise'&&!view.parent_run_id&&!view.revision_child_run_id&&<OutlineJsonForm key={'outline-revision:'+view.run_id} action="create_outline_revision" title="创建一次框架修订" help="仅追加经核验的来源、材料与事实，不能替换原材料或完整提示词。服务器复用已保存的真实审核。创建本身不调用模型；生成修订框架会新增一次模型请求，认领与执行分别确认。新增来源编号从原来源之后接续，证据 ID 必须是新的。" disabled={busy||controlBlocked} submit={mutate} template={{run_id:view.run_id,expected_snapshot_sha256:view.snapshot_sha256,expected_outline_sha256:view.outline_sha256,expected_review_sha256:view.review_sha256,additional_materials:'',additional_sources:[{title:'',url:'',published:''}],additional_evidence:[{id:'',text:'',source_ids:[]}],confirm:false}}/>}
 {view.revision_child_run_id&&<p>唯一修订子批次：{view.revision_child_run_id}。请用该标识只读查看，原批次永久停止。</p>}
 {view.state==='outline_review_pending'&&<OutlineJsonForm key={'review:'+view.run_id+':'+view.outline_sha256} action="review" title="提交独立框架审核" help="先实际阅读框架与原始来源，填写真实审核者和本次执行标识，不得临时生成身份冒充独立审核。decision 只能填写 pass、revise 或 blocked。" disabled={busy||controlBlocked} submit={mutate} template={{run_id:view.run_id,expected_snapshot_sha256:view.snapshot_sha256,expected_outline_sha256:view.outline_sha256,outline_version:1,actor_id:'',execution_id:'',reviewer_model:'',decision:'',reason:'',issues:[],minimal_changes:[],confirm:false}}/>}
 {view.state==='outline_review_pending'&&<OutlineJsonForm key={'edited-approval:'+view.run_id+':'+view.outline_sha256} action="review" title="提交修订框架并通过" help="先实际独立审阅，只做必要小修并保留原节点数量；不是重新生成Claude结果。逐条填写原fact_gaps的解决或排除原因，解决事实必须引用现有证据ID；仍缺事实不能通过。issues/minimal_changes只记录尚未解决项，通过时必须为空。原框架和provider记录不变，本操作不生成正文。" disabled={busy||controlBlocked} submit={mutate} template={{run_id:view.run_id,expected_snapshot_sha256:view.snapshot_sha256,expected_outline_sha256:view.outline_sha256,outline_version:1,actor_id:'',execution_id:'',reviewer_model:'',decision:'pass',reason:'',issues:[],minimal_changes:[],approved_outline:view.outline,gap_resolutions:((view.outline as {fact_gaps?:string[]})?.fact_gaps||[]).map((gap,gap_index)=>({gap_index,gap,action:'',reason:'',evidence_ids:[]})),edit_notes:[''],confirm:false}}/>}
 {view.approved_outline&&<section><h2 className="font-semibold">独立审核批准的正文框架（版本 {view.approved_outline_version}）</h2><p>批准框架 SHA256：{view.approved_outline_sha256}。版本2为独立编辑修订，不冒称Claude原始输出。</p><pre className="whitespace-pre-wrap">{JSON.stringify(view.approved_outline,null,2)}</pre></section>}
 {['body_review_pending','final_saved','finalized'].includes(view.state)&&<OutlineJsonForm key={'revision:'+view.run_id} action="create_revision" title="创建独立正文审改流程" help="填写真实写作者及独立审稿、改稿、复核参与者。仅创建审改流程，不执行审改、不调用模型或交接成稿。" disabled={busy||controlBlocked} submit={mutate} template={{run_id:view.run_id,writer_actor_id:'',writer_execution_id:'',participants:{review:{actor_id:'',model:''},rewrite:{actor_id:'',model:''},verify:{actor_id:'',model:''}},expected_prompt_version:view.snapshot.prompt_version,confirm:false}}/>}
 {view.outline!==null&&<section><h2 className="font-semibold">真实框架（版本 1）</h2><pre className="whitespace-pre-wrap">{JSON.stringify(view.outline,null,2)}</pre></section>}{view.review!==null&&<section><h2 className="font-semibold">小鱼独立审核记录</h2><pre className="whitespace-pre-wrap">{JSON.stringify(view.review,null,2)}</pre></section>}
 {(['outline','body'] as const).map(name=><section key={name}><h2 className="font-semibold">{name==='outline'?'框架':'正文'}请求：{view.stages[name].state}</h2>{view.stages[name].result?.error&&<p>{view.stages[name].result.error}</p>}<OutlineAttemptDiagnostic value={view.stages[name].result?.diagnostic}/><pre className="whitespace-pre-wrap">{view.stages[name].result?.text||view.stages[name].result?.partial_text||''}</pre></section>)}</>}
 </main>;
}
