'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import StudioNav from '../../components/studio-nav';
type View={connection:{ready:boolean;notice:string};task:null|{id:string;request_key:string;state:string;article_id:string|null;updated:string;dispatch_state:string;private_drafts_complete:boolean;writer_ended:boolean};instructions:{conversation_url:string;stages:string[]}};
const labels:Record<string,string>={queued:'请求已保存，尚未开始写作',writing:'得到团队写作、审稿与核查中',processing:'配图排版与私人草稿处理中',completed:'两平台私人草稿已完成'};
async function response(r:Response){const v=await r.json() as View&{error?:string};if(!r.ok)throw Error(v.error||(r.status===401?'请使用本人账号登录':'云端状态读取失败'));if(!v.connection||!v.instructions)throw Error('云端状态返回不完整');return v;}
export default function DedaoPage(){
 const [view,setView]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const writing=useRef(false),reading=useRef(false),mounted=useRef(true),intent=useRef<string|null>(null);
 const read=useCallback(async()=>{if(reading.current)return;reading.current=true;try{const v=await response(await fetch('/api/dedao/cloud',{cache:'no-store',signal:AbortSignal.timeout(15000)}));if(mounted.current){setView(v);setError('');if(intent.current&&v.task?.request_key===intent.current){intent.current=null;sessionStorage.removeItem('dedao-cloud-request');}}return v;}catch(failure){if(mounted.current)setError(failure instanceof Error?failure.message:'状态读取失败，请重试');}finally{reading.current=false;}},[]);
 useEffect(()=>{mounted.current=true;try{intent.current=sessionStorage.getItem('dedao-cloud-request');}catch{/* optional local recovery pointer */}const initial=window.setTimeout(()=>void read(),0);const timer=setInterval(()=>{if(!writing.current&&document.visibilityState!=='hidden')void read();},5000);return()=>{mounted.current=false;window.clearTimeout(initial);clearInterval(timer);};},[read]);
 async function start(){if(writing.current)return;writing.current=true;setBusy(true);setError('');setMessage('正在保存一篇云端成文请求…');const key=intent.current??=crypto.randomUUID();try{sessionStorage.setItem('dedao-cloud-request',key);}catch{/* key stays in memory */}
  try{const v=await response(await fetch('/api/dedao/cloud',{method:'POST',headers:{'Content-Type':'application/json','X-Dedao-Cloud':'1'},body:JSON.stringify({request_key:key}),signal:AbortSignal.timeout(20000)}));if(mounted.current){setView(v);setMessage(v.task?.dispatch_state==='accepted'?'任务已保存，等待实际云端执行；完成后显示两平台私人草稿。':'任务已保存，通知结果尚未确认，请让小鱼读取同一任务。');}intent.current=null;sessionStorage.removeItem('dedao-cloud-request');}
  catch(failure){if(mounted.current){setError(failure instanceof Error?failure.message:'启动结果未确认');setMessage('请求编号保留，重试会核对同一任务。');}await read();}
  finally{writing.current=false;if(mounted.current)setBusy(false);}
 }
 const active=!!view?.task&&view.task.state!=='completed';
 return <main className="studio-main dedao-page"><StudioNav current="dedao"/>
  <header className="page-heading"><h2>得到大脑</h2></header><p className="helper-text">一篇一篇完成：写作、审稿核查、配图排版，最后保存头条和知乎私人草稿。</p>
  <section className="dedao-controls"><button className="primary-button" type="button" onClick={()=>void start()} disabled={busy||active||!view?.connection.ready||!!error}>{busy?'正在提交…':active?'当前文章处理中':'一键成文'}</button></section>
  <p role="status" aria-live="polite">{message}</p>{error&&<p className="error" role="alert">{error} <button disabled={busy} onClick={()=>void read()}>重试读取</button></p>}
  {view&&!view.connection.ready&&<p className="helper-text" role="status">{view.connection.notice}</p>}
  {view?.task&&<section className="dedao-batch"><h3>{labels[view.task.state]||'处理状态待核对'}</h3><p>{view.task.private_drafts_complete?(view.task.writer_ended?'头条和知乎私人草稿已完成，未公开发布。':'私人草稿已核验，等待本次写作执行收尾。'):'只有真实配图成果和两平台草稿验收后，才会计为完成。'}</p><p className="helper-text">最近记录 {new Date(view.task.updated).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p>{view.task.article_id&&<Link className="action-link" href="/">查看配图与草稿进度</Link>}<details><summary>任务详情</summary><p>任务编号 {view.task.id}</p><a href={view.instructions.conversation_url} target="_blank" rel="noreferrer">打开得到写作对话</a><ol>{view.instructions.stages.map(stage=><li key={stage}>{stage}</li>)}</ol></details></section>}
  {!view&&!error&&<p role="status">正在读取云端连接…</p>}<p className="helper-text">每日北京时间 3 / 8 / 12 / 21 点计划保持；按钮另发一次成文请求。</p>
 </main>;
}
