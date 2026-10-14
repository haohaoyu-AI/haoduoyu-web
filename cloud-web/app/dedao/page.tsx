'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import StudioNav from '../../components/studio-nav';
type View={owner_scope:string;connection:{ready:boolean;notice:string};task:null|{id:string;request_key:string;state:string;article_id:string|null;updated:string;dispatch_state:string;private_drafts_complete:boolean;writer_ended:boolean;writing_executor_registered?:boolean;article_state?:string|null;deliveries?:{platform:string;state:string;message:string|null}[];downstream_status?:'not_bound'|'available'|'unavailable'};instructions:{conversation_url:string;stages:string[]}};
type RecoveryIntent={key:string;owner_scope:string|null};
const labels:Record<string,string>={queued:'请求已保存，尚未开始写作',writing:'得到团队写作、审稿与核查中',processing:'配图排版与私人草稿处理中',completed:'两平台私人草稿已完成'};
function pendingTask(view:View|null){const task=view?.task;return task?.state==='queued'&&task.dispatch_state==='pending'&&task.writing_executor_registered===false&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(task.request_key)?task:null;}
class CloudAuthError extends Error {}
class CloudIdentityError extends Error {}
async function response(r:Response){
 if(r.status===401||r.status===403)throw new CloudAuthError(r.status===401?'请使用本人账号登录':'当前账号暂无访问权限，请核对本人账号');
 let raw:unknown;try{raw=await r.json();}catch{if(!r.ok)throw Error('云端状态读取失败');throw new CloudIdentityError('云端登录身份尚未确认，请重新读取');}
 if(!r.ok)throw Error(raw&&typeof raw==='object'&&'error' in raw&&typeof raw.error==='string'?raw.error:'云端状态读取失败');
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new CloudIdentityError('云端登录身份尚未确认，请重新读取');
 const v=raw as View;if(typeof v.owner_scope!=='string'||!v.owner_scope.trim())throw new CloudIdentityError('云端登录身份尚未确认，请重新读取');if(!v.connection||typeof v.connection.ready!=='boolean'||!v.instructions||!Array.isArray(v.instructions.stages))throw new CloudIdentityError('云端状态返回不完整，请重新读取');return v;
}
export default function DedaoPage(){
 const [view,setView]=useState<View|null>(null),[busy,setBusy]=useState(false),[readingView,setReadingView]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [authRequired,setAuthRequired]=useState(false);
 const writing=useRef(false),reading=useRef(false),mounted=useRef(true),intent=useRef<RecoveryIntent|null>(null),ownerScope=useRef<string|null>(null),confirmedView=useRef<View|null>(null),identityEpoch=useRef(0);
 const readSequence=useRef(0),readController=useRef<AbortController|null>(null);
 const invalidateRead=useCallback(()=>{readSequence.current++;readController.current?.abort();readController.current=null;reading.current=false;},[]);
 const invalidateIdentityReads=useCallback(()=>{identityEpoch.current++;invalidateRead();},[invalidateRead]);
 const clearIntent=useCallback((key?:string)=>{if(key&&intent.current?.key!==key)return;intent.current=null;try{sessionStorage.removeItem('dedao-cloud-request');}catch{/* storage is optional */}},[]);
 const resetIdentity=useCallback((clearRecovery=true)=>{invalidateIdentityReads();ownerScope.current=null;confirmedView.current=null;if(clearRecovery)clearIntent();setView(null);setMessage('');setReadingView(false);},[clearIntent,invalidateIdentityReads]);
 const acceptView=useCallback((v:View)=>{
  const knownOwner=ownerScope.current??intent.current?.owner_scope;
  if(knownOwner&&knownOwner!==v.owner_scope)resetIdentity();
  ownerScope.current=v.owner_scope;confirmedView.current=v;setView(v);setAuthRequired(false);
  if(intent.current?.key===v.task?.request_key)clearIntent(intent.current?.key);
  setError(intent.current&&!intent.current.owner_scope?'旧请求的登录账号尚未核对，请让小鱼核对同一任务。':'');
 },[clearIntent,resetIdentity]);
 const read=useCallback(async()=>{
  if(reading.current)return;reading.current=true;setReadingView(true);const seq=++readSequence.current,epoch=identityEpoch.current,controller=new AbortController();readController.current=controller;
  try{const v=await response(await fetch('/api/dedao/cloud',{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])}));
   if(mounted.current&&!controller.signal.aborted&&seq===readSequence.current&&epoch===identityEpoch.current)acceptView(v);return v;
  }catch(failure){if(mounted.current&&!controller.signal.aborted&&seq===readSequence.current&&epoch===identityEpoch.current){confirmedView.current=null;if(failure instanceof CloudAuthError){resetIdentity();setAuthRequired(true);}else if(failure instanceof CloudIdentityError)resetIdentity(false);setError(failure instanceof Error?failure.message:'状态读取失败，请重试');}}
  finally{if(seq===readSequence.current){reading.current=false;readController.current=null;if(mounted.current)setReadingView(false);}}
 },[acceptView,resetIdentity]);
 useEffect(()=>{
  mounted.current=true;try{const saved=sessionStorage.getItem('dedao-cloud-request');if(saved){try{const value=JSON.parse(saved) as RecoveryIntent;intent.current=value&&typeof value.key==='string'&&typeof value.owner_scope==='string'?value:{key:saved,owner_scope:null};}catch{intent.current={key:saved,owner_scope:null};}}}catch{/* optional local recovery pointer */}
  const resume=()=>{if(document.visibilityState==='hidden')return;invalidateIdentityReads();void read();};
  const initial=window.setTimeout(()=>void read(),0),timer=setInterval(()=>{if(!writing.current&&document.visibilityState!=='hidden')void read();},5000);
  window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  return()=>{mounted.current=false;invalidateIdentityReads();window.clearTimeout(initial);clearInterval(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
 },[read,invalidateIdentityReads]);
 async function start(recover=false){
  const confirmed=confirmedView.current,recovery=recover?pendingTask(confirmed):null;
  if(writing.current||!confirmed||confirmed!==view||confirmed.owner_scope!==ownerScope.current||authRequired||error||!confirmed.connection.ready||(recover?!recovery:confirmed.task&&confirmed.task.state!=='completed'))return;
  if(intent.current&&intent.current.owner_scope!==confirmed.owner_scope){setError('旧请求的登录账号尚未核对，请让小鱼核对同一任务。');return;}
  writing.current=true;const epoch=++identityEpoch.current;invalidateRead();setReadingView(false);setBusy(true);setError('');setMessage(recovery?'正在恢复本篇云端成文请求…':'正在保存一篇云端成文请求…');const pending=recovery?{key:recovery.request_key,owner_scope:confirmed.owner_scope}:intent.current??{key:crypto.randomUUID(),owner_scope:confirmed.owner_scope},key=pending.key;intent.current=pending;try{sessionStorage.setItem('dedao-cloud-request',JSON.stringify(pending));}catch{/* key stays in memory */}
  try{const v=await response(await fetch('/api/dedao/cloud',{method:'POST',headers:{'Content-Type':'application/json','X-Dedao-Cloud':'1'},body:JSON.stringify({request_key:key,owner_scope:pending.owner_scope}),signal:AbortSignal.timeout(20000)}));if(mounted.current&&epoch===identityEpoch.current&&intent.current?.key===key){acceptView(v);if(epoch===identityEpoch.current){setMessage(v.task?.dispatch_state==='accepted'?'任务已保存，等待实际云端执行；完成后显示两平台私人草稿。':'任务已保存，通知结果尚未确认，请让小鱼读取同一任务。');clearIntent(key);}}}
  catch(failure){if(!mounted.current||epoch!==identityEpoch.current)return;confirmedView.current=null;if(failure instanceof CloudAuthError){resetIdentity();setAuthRequired(true);setError(failure.message);return;}if(failure instanceof CloudIdentityError)resetIdentity(false);setError(failure instanceof Error?failure.message:'启动结果未确认');setMessage('请求编号保留，重试会核对同一任务。');await read();}
  finally{writing.current=false;if(mounted.current)setBusy(false);}
 }
 const active=!!view?.task&&view.task.state!=='completed';
 const recovery=pendingTask(view);
 const task=view?.task,downstreamStates=task?.state==='processing'&&task.downstream_status==='available'&&!task.private_drafts_complete?[task.article_state,...(task.deliveries??[]).map(delivery=>delivery.state)]:[];
 const downstreamNotice=downstreamStates.includes('needs_login')?'平台需要登录，等待处理':downstreamStates.includes('needs_verification')?'平台草稿待核验':downstreamStates.includes('failed')?'平台处理暂未完成':null;
 const downstreamUnavailable=task?.state==='processing'&&task.downstream_status==='unavailable';
 return <main className="studio-main dedao-page"><StudioNav current="dedao"/>
  <header className="page-heading"><h2>得到大脑</h2></header><p className="helper-text">一篇一篇完成：写作、审稿核查、配图排版，最后保存头条和知乎私人草稿。</p>
  <section className="dedao-controls"><button className="primary-button" type="button" onClick={()=>void start(!!recovery)} disabled={busy||(active&&!recovery)||!view?.connection.ready||!!error}>{busy?'正在提交…':recovery?'恢复本篇成文':active?'当前文章处理中':'一键成文'}</button></section>
  {recovery&&<p className="helper-text">本篇请求已保存，尚未派发。恢复会核对同一任务，继续派发这一篇。</p>}
  <p role="status" aria-live="polite">{message}</p>{error&&<p className="error" role="alert">{error} <button disabled={busy||readingView} onClick={()=>void read()}>{readingView?'读取中…':'重试读取'}</button>{authRequired&&<> <a href="/signin-with-chatgpt?return_to=%2Fdedao" target="_top">使用本人账号登录</a></>}</p>}
  {view&&!view.connection.ready&&<p className="helper-text" role="status">{view.connection.notice}</p>}
  {view?.task&&<section className="dedao-batch"><h3>{downstreamNotice||(downstreamUnavailable?'平台处理状态暂未读取':labels[view.task.state]||'处理状态待核对')}</h3>{downstreamNotice&&<p role="status">同一任务与已有成果保留；请先核对平台状态，无需重新成文。</p>}{downstreamUnavailable&&<p role="status">暂时无法核对本篇文章的平台进度，原任务和已有记录保留。</p>}<p>{view.task.private_drafts_complete?(view.task.writer_ended?'头条和知乎私人草稿已完成，未公开发布。':'私人草稿已核验，等待本次写作执行收尾。'):'只有真实配图成果和两平台草稿验收后，才会计为完成。'}</p><p className="helper-text">最近记录 {new Date(view.task.updated).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p>{view.task.article_id&&<Link className="action-link" href="/">查看配图与草稿进度</Link>}<details><summary>任务详情</summary><p>任务编号 {view.task.id}</p><a href={view.instructions.conversation_url} target="_blank" rel="noreferrer">打开得到写作对话</a><ol>{view.instructions.stages.map(stage=><li key={stage}>{stage}</li>)}</ol></details></section>}
  {!view&&!error&&<p role="status">正在读取云端连接…</p>}<p className="helper-text">每日北京时间 3 / 8 / 12 / 21 点计划保持；按钮另发一次成文请求。</p>
 </main>;
}
