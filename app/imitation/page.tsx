'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {entertainmentArticleTitle} from '../../lib/hot-article-genre';
import {HotArticleViewFence} from '../../lib/hot-article-view';
import type {DiscoveryView} from '../../lib/hot-article-discovery-store';
import type {CardMetric} from '../../lib/hot-article-discovery';
import StudioNav from '../../components/studio-nav';
import './imitation.css';

const endpoint='/api/imitation/discovery';
const metricText=(metric:CardMetric)=>metric.display===null?'不可获取':metric.display.replace(/阅读|点赞|赞|评论/g,'').trim();
class AuthError extends Error {}
class ScanBusy extends Error{constructor(readonly view:DiscoveryView){super('已有扫描正在进行，本次刷新未接纳');}}
async function json<T>(response:Response):Promise<T>{
 if(response.status===401||response.status===403)throw new AuthError('请重新使用本人ChatGPT账号登录；尚未读取账号池');
 const value=await response.json() as {error?:string;code?:string;view?:DiscoveryView};
 if(response.status===409&&value.code==='scan_busy'&&value.view)throw new ScanBusy(value.view);
 if(!response.ok)throw Error(value.error??'暂时无法读取，请稍后再试');return value as T;
}
export default function ImitationPage(){
 const [current,setCurrent]=useState<DiscoveryView|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[adding,setAdding]=useState(false),[name,setName]=useState(''),[url,setURL]=useState('');
 const [now,setNow]=useState(Date.now);
 const [authRequired,setAuthRequired]=useState(false);
 const intent=useRef<string|null>(null),mounted=useRef(true),lock=useRef(false),fence=useRef(new HotArticleViewFence());
 const acceptView=useCallback((view:DiscoveryView)=>{setCurrent(view);setNow(Date.now());setAuthRequired(false);},[]);
 const read=useCallback(async(key?:string,ticket=fence.current.capture())=>{
  const view=await json<DiscoveryView>(await fetch(endpoint+(key?`?request_key=${encodeURIComponent(key)}`:''),{cache:'no-store',signal:AbortSignal.timeout(10000)}));
  if(mounted.current&&fence.current.accepts(ticket)){acceptView(view);setMessage('');}return view;
 },[acceptView]);
 useEffect(()=>{
  mounted.current=true;const ticket=fence.current.capture();
  void read(undefined,ticket).catch(error=>{if(mounted.current&&fence.current.accepts(ticket)){if(error instanceof AuthError){setCurrent(null);setAuthRequired(true);}setMessage(error instanceof Error?error.message:'账号池暂时无法读取');}});
  return()=>{mounted.current=false;};
 },[read]);
 const scan=current?.scan;
 useEffect(()=>{
  if(scan?.state!=='collecting')return;const ticket=fence.current.capture();let pending=false;
  const timer=setInterval(()=>{
   if(pending)return;pending=true;
   void read(scan.request_key,ticket).catch(()=>{
    if(mounted.current&&fence.current.accepts(ticket)){
     setMessage('扫描状态暂时无法读取，请稍后刷新。');
     if(Date.now()>=Date.parse(scan.created)+60000)setCurrent(view=>view?.scan?.request_key===scan.request_key?{...view,scan:{...view.scan,state:'interrupted'}}:view);
    }
   }).finally(()=>{pending=false;});
  },2500);
  return()=>clearInterval(timer);
 },[scan?.request_key,scan?.state,scan?.created,read]);
 useEffect(()=>{
  const sync=()=>setNow(Date.now());
  if(typeof window==='undefined'||typeof document==='undefined')return;
  window.addEventListener('focus',sync);document.addEventListener('visibilitychange',sync);
  return()=>{window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);};
 },[]);
 useEffect(()=>{
  const expiries=(scan?.result?.articles??[]).map(a=>Date.parse(a.published_at)+3*86400000+1).filter(at=>Number.isFinite(at)&&at>now);
  if(!expiries.length)return;
  const timer=setTimeout(()=>setNow(Date.now()),Math.min(2147483647,Math.max(1,Math.min(...expiries)-Date.now())));
  return()=>clearTimeout(timer);
 },[scan?.result?.articles,now]);
 const post=async(body:Record<string,unknown>)=>json<DiscoveryView>(await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-hot-article-discovery':'1'},body:JSON.stringify(body),signal:AbortSignal.timeout(55000)}));
 const changeAccount=async(action:'add'|'remove',id?:string)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('正在保存账号池…');const ticket=fence.current.begin();
  try{
   const view=await post(action==='add'?{action,name,url}:{action,id});
   if(mounted.current&&fence.current.accepts(ticket)){acceptView(view);setMessage(action==='add'?'账号已保存。':'账号已移除。');if(action==='add'){setAdding(false);setName('');setURL('');}}
  }catch(error){if(mounted.current&&fence.current.accepts(ticket)){if(error instanceof AuthError){setCurrent(null);setAuthRequired(true);}setMessage(error instanceof Error?error.message:'账号保存结果暂未确认，请稍后再试');}}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 };
 const refresh=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');const ticket=fence.current.begin();
  const key=intent.current??crypto.randomUUID();intent.current=key;
  try{const view=await post({action:'refresh',request_key:key});if(mounted.current&&fence.current.accepts(ticket))acceptView(view);intent.current=null;}
  catch(error){
   if(error instanceof ScanBusy){if(mounted.current&&fence.current.accepts(ticket)){acceptView(error.view);setMessage(error.message);}intent.current=null;return;}
   try{const view=await read(key,ticket);if(view.scan){intent.current=null;}else if(mounted.current&&fence.current.accepts(ticket))setMessage(error instanceof Error?error.message:'刷新结果暂未确认，请再试一次。');}
   catch{if(mounted.current&&fence.current.accepts(ticket))setMessage('刷新结果暂未确认，请再试一次。');}
  }finally{lock.current=false;if(mounted.current)setBusy(false);}
 };
 const accounts=current?.accounts??[],collecting=scan?.state==='collecting',active=new Set(accounts.map(a=>a.id));
 const articles=(scan?.result?.articles??[]).filter(a=>active.has(a.account_id)&&entertainmentArticleTitle(a.title)&&Date.parse(a.published_at)>=now-3*86400000&&Date.parse(a.published_at)<=now&&a.reads.lower_bound!==null&&a.reads.lower_bound>=10000).slice(0,100);
 const incomplete=scan?.state==='blocked'||scan?.state==='incomplete';
 const status=message||(!current?'正在读取账号池…':busy&&!adding?'正在扫描账号近3天的文章…':!accounts.length?'请先添加文娱对标账号。':collecting?'正在扫描账号近3天的文章…':scan?.pool_changed?'账号池已更新，请刷新。':scan?.state==='interrupted'?'上次扫描未完成，请重新刷新。':scan?.state==='superseded'?'旧扫描已由新扫描替代，请刷新。':incomplete?'部分账号无法正常读取或缺少本篇阅读证据，本次扫描尚未完整核验。':!scan?'点击刷新，扫描账号近3天的文章。':!articles.length?'暂无符合条件的热文':'');
 return <main className="studio-main imitation-main"><StudioNav current="imitation"/>
  <section className="imitation-pool" aria-labelledby="benchmark-heading">
   <header className="imitation-heading"><h2 id="benchmark-heading">对标账号（{accounts.length}/10）</h2><button type="button" onClick={()=>setAdding(!adding)} disabled={busy||collecting||!current}>{adding?'取消添加':'添加账号'}</button></header>
   {accounts.length>0&&<ul className="imitation-accounts">{accounts.map(account=><li key={account.id}>
    <a href={account.url} target="_blank" rel="noreferrer">{account.name}</a><span>本人添加 · 账号定位未核验</span>
    <button type="button" onClick={()=>changeAccount('remove',account.id)} disabled={busy||collecting} aria-label={`移除账号：${account.name}`}>移除</button>
   </li>)}</ul>}
   {adding&&<form className="imitation-add" onSubmit={event=>{event.preventDefault();void changeAccount('add');}}>
    <label>账号名称<input value={name} onChange={event=>setName(event.target.value)} maxLength={80} required disabled={busy}/></label>
    <label>公开主页链接<input type="url" value={url} onChange={event=>setURL(event.target.value)} placeholder="https://www.toutiao.com/c/user/…" maxLength={600} required disabled={busy}/></label>
    <button type="submit" disabled={busy}>{busy?'正在保存…':'保存账号'}</button>
   </form>}
  </section>
  <header className="imitation-heading"><div><h2>热文</h2><p className="helper-text">最近72小时 · 阅读≥1万 · 文娱初筛 · 每6小时更新</p></div><button type="button" onClick={refresh} disabled={busy||collecting||!accounts.length}>{collecting||busy&&!adding?'正在刷新…':'刷新热文'}</button></header>
  {status&&<p className="imitation-notice" role="status">{status}{authRequired&&<> <a href="/signin-with-chatgpt?return_to=%2Fimitation" target="_top">使用本人账号登录</a></>}</p>}
  {incomplete&&!message&&<ul className="imitation-source-status">{scan?.result?.observations.filter(o=>o.outcome!=='checked'&&active.has(o.account_id)).map(o=><li key={o.account_id}>{accounts.find(a=>a.id===o.account_id)?.name}：{o.reason}</li>)}</ul>}
  {articles.length>0&&<div className="imitation-cards" aria-label="最近72小时阅读量至少1万的热文">{articles.map(article=><article className="imitation-card" key={article.id}>
   <h3>{article.title}</h3><p className="helper-text">{accounts.find(a=>a.id===article.account_id)?.name} · 发表 {article.evidence?.date_display||'未核实'}<br/>采集 {article.evidence?.observed_at?new Date(article.evidence.observed_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'不可获取'}</p>
   <div className="imitation-metrics"><span>阅读 <b>{metricText(article.reads)}</b></span><span>点赞 <b>{metricText(article.likes)}</b></span><span>评论 <b>{metricText(article.comments)}</b></span></div>
   <a className="imitation-original" href={article.url} target="_blank" rel="noreferrer" aria-label={`查看原文：${article.title}`}>查看原文</a>
  </article>)}</div>}
 </main>;
}
