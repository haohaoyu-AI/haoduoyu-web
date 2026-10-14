'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import StudioNav from '../../components/studio-nav';
import ArticleWorkspaceAction from '../../components/article-workspace-action';
import ArticleMetricsObservation from '../../components/article-metrics-observation';
import type {HistoryRecord,MetricsObservation,MetricsSnapshot} from '../../lib/article-history';
type Item=HistoryRecord&{observations:(MetricsObservation&{snapshot:MetricsSnapshot})[]};
type History={owner_scope:string;items:Item[];total:number;next_offset:number|null;summary:{processed:number;private_drafts:number;full_auto:number;semi_auto:number};notice:string};
type Inventory={owner_scope:string;items:{id:string;title:string;state:string;protected:number;archived:number}[];total:number;offset:number;limit:number;next_offset:number|null;truncated:boolean;notice:string};
const time=(value:string|null)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未核验';
function duration(item:Item){
 const t=item.timing;
 if(!t)return '未记录';
 const selected=['elapsed_seconds','writing_to_completion_seconds','request_to_completion_seconds','scheduled_to_completion_seconds'].find(field=>typeof t[field]==='number'&&Number.isSafeInteger(t[field])&&(t[field] as number)>=0);
 if(selected){
  const n=t[selected] as number;
  const label=selected==='elapsed_seconds'?(t.basis==='source_upload_to_verified_drafts'?'（上传原稿至草稿验收）':t.basis==='executor_report'?'（执行者记录）':''):selected==='writing_to_completion_seconds'?'（写作至完成）':selected==='request_to_completion_seconds'?'（请求至完成，含等待）':'（计划至完成，含等待）';
  return `${t.precision==='approximate'?'约 ':''}${Math.floor(n/60)}分${n%60}秒${label}`;
 }
 const range=t.writing_to_completion_seconds_range;
 return Array.isArray(range)&&range.length===2&&range.every(n=>Number.isSafeInteger(n)&&n>=0)&&range[0]<=range[1]?`${Math.floor(Number(range[0])/60)}–${Math.ceil(Number(range[1])/60)}分钟（写作至完成）`:'未记录';
}
export default function ArticleDataPage(){
 const [view,setView]=useState<History|null>(null),[inventory,setInventory]=useState<Inventory|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),mounted=useRef(true),offsets=useRef<number[]>([0]),ownerScope=useRef<string|null>(null),inventoryOffsets=useRef<number[]>([0]),readEpoch=useRef(0);
 const nextOffset=view?.next_offset,nextInventoryOffset=inventory?.next_offset;
 const clearScopedView=useCallback(()=>{if(!mounted.current)return;readEpoch.current++;setView(null);setInventory(null);offsets.current=[0];inventoryOffsets.current=[0];ownerScope.current=null;},[]);
 const load=useCallback(async(more:'history'|'workspace'|null=null)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  const epoch=readEpoch.current,live=()=>mounted.current&&epoch===readEpoch.current;
  try{
   const pages=more==='history'&&nextOffset!==null&&nextOffset!==undefined?[...offsets.current,nextOffset]:offsets.current;
   const workspacePages=more==='workspace'&&nextInventoryOffset!==null&&nextInventoryOffset!==undefined?[...inventoryOffsets.current,nextInventoryOffset]:inventoryOffsets.current;
   const records:Item[]=[];let history:History|null=null,batchOwner=ownerScope.current;
   for(const offset of pages){if(!live())return;const response=await fetch(`/api/article-data?offset=${offset}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok){if([401,403].includes(response.status))clearScopedView();throw Error(response.status===401?'请使用本人账号登录':'历史统计读取失败，请重试');}history=await response.json() as History;if(!live())return;if(!Array.isArray(history.items)||!history.summary)throw Error('历史统计返回不完整');if(!history.owner_scope||batchOwner&&batchOwner!==history.owner_scope){clearScopedView();throw Error('登录账号已变化，请重新读取文章');}batchOwner=history.owner_scope;records.push(...history.items);}
   const articles:Inventory['items']=[];let list:Inventory|null=null;
   for(const offset of workspacePages){if(!live())return;const response=await fetch(`/api/articles/workspace?offset=${offset}&limit=100`,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok){if([401,403].includes(response.status))clearScopedView();throw Error('文章恢复列表读取失败，请重试');}list=await response.json() as Inventory;if(!live())return;if(!batchOwner||list.owner_scope!==batchOwner){clearScopedView();throw Error('登录账号已变化，请重新读取文章');}if(!Array.isArray(list.items)||list.items.length>100||list.offset!==offset||list.limit!==100||!Number.isSafeInteger(list.total)||list.total<0||list.next_offset!==null&&(!Number.isSafeInteger(list.next_offset)||list.next_offset!==offset+list.items.length||list.next_offset<=offset||list.next_offset>1000000))throw Error('文章恢复列表返回不完整，请重试');articles.push(...list.items);}
   if(live()&&history&&list){offsets.current=pages;inventoryOffsets.current=workspacePages;ownerScope.current=batchOwner;setView({...history,items:[...new Map(records.map(item=>[item.history_key,item])).values()]});setInventory({...list,items:[...new Map(articles.map(item=>[item.id,item])).values()]});}
  }catch(failure){if(mounted.current)setError(failure instanceof Error?failure.message:'读取失败，原数据保留');}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 },[nextOffset,nextInventoryOffset,clearScopedView]);
 useEffect(()=>{mounted.current=true;const timer=window.setTimeout(()=>void load(),0);return()=>{mounted.current=false;window.clearTimeout(timer);};},[]); // eslint-disable-line react-hooks/exhaustive-deps
 const archived=inventory?.items.filter(item=>item.archived===1)||[];
 const eligible=inventory?.items.filter(item=>item.archived===0&&item.protected===0)||[];
 return <main className="studio-main article-data-page"><StudioNav current="data"/>
  <header className="page-heading"><h2>文章数据</h2><button className="secondary" disabled={busy||(!view&&!error)} onClick={()=>void load()}>{busy?'读取中…':'刷新数据'}</button></header>
  <p className="helper-text">自北京时间 2026 年 10 月 12 日起 · 私人草稿与公开发布分别统计</p>
  {error&&<p className="error" role="alert">{error} <a href="/signin-with-chatgpt?return_to=%2Farticle-data" target="_top">本人登录</a></p>}
  {!view&&!error&&<p role="status">正在读取文章历史…</p>}
  {view&&<><div className="history-summary" aria-label="已处理文章统计"><span>已入库处理记录 <strong>{view.summary.processed}</strong></span><span>全自动 <strong>{view.summary.full_auto}</strong></span><span>半自动 <strong>{view.summary.semi_auto}</strong></span><span>双平台私人草稿 <strong>{view.summary.private_drafts}</strong></span></div>
   <p className="helper-text">{view.notice}</p>
   {view.items.length?<div className="history-table-wrap"><table className="history-table"><caption className="visually-hidden">文章处理与私人草稿历史</caption><thead><tr><th>文章</th><th>来源 / 完成时间</th><th>耗时</th><th>私人草稿</th><th>公开发布与数据</th></tr></thead><tbody>{view.items.map(item=><tr key={item.history_key}>
    <td data-label="文章"><strong>{item.title||`${item.topic_label}（完整原标题未保留）`}</strong><small>{item.status==='word_delivered'?'仅 Word 已交付':'私人草稿已核验'}</small></td>
    <td data-label="来源与完成时间">{['scheduled_biji','manual_trigger_biji','website_full_auto'].includes(item.mode)?'全自动':'半自动'}<small>{time(item.completed_at)}{item.completed_at_precision==='minute'?'（分钟精度）':''}</small></td><td data-label="耗时">{duration(item)}</td>
    <td data-label="私人草稿">{(['toutiao','zhihu'] as const).map(platform=>{const d=item.platforms[platform];return <div key={platform}>{platform==='toutiao'?'头条':'知乎'}：{d.draft_url?<a href={d.draft_url} target="_blank" rel="noreferrer">打开私人草稿</a>:d.status==='not_requested'?'未要求投递':'未核验链接'}<small>{d.status==='verified_private_draft'?`当时已核验 · ${time(d.last_verified_at)}`:''}{d.draft_url&&!d.current_existence_rechecked?' · 当前是否仍存在未重查':''}</small></div>;})}</td>
    <td data-label="公开发布与数据">{item.observations.length?item.observations.map((o,index)=><ArticleMetricsObservation key={index} observation={o}/>):<span>尚未核验公开发布<br/><small>24小时数据未采集</small></span>}</td>
   </tr>)}</tbody></table></div>:<p className="section-hint">尚未导入可核验的历史证据。缺失值不会按零统计。</p>}
   {view.next_offset!==null&&<button disabled={busy} onClick={()=>void load('history')}>加载更多历史</button>}
  </>}
  {inventory&&<details className="publish-fold"><summary>清空与恢复 <span className="section-hint">原稿、成品和统计保留</span></summary><p className="helper-text">{inventory.notice}</p><p>{inventory.total} 篇网站文章 · 已显示 {inventory.items.length} 篇 · {eligible.length} 篇可收起 · {archived.length} 篇已收起</p><ArticleWorkspaceAction ids={eligible.map(item=>item.id)} titles={Object.fromEntries(eligible.map(item=>[item.id,item.title]))} ownerScope={inventory.owner_scope} onScopeInvalid={()=>{clearScopedView();setError('登录账号已变化，请重新读取文章');}} disabled={busy||!!error} label="清空已显示的可收起文章" onChanged={()=>void load()}/>{archived.map(item=><div className="history-restore" key={item.id}><span>{item.title}</span><ArticleWorkspaceAction ids={[item.id]} titles={{[item.id]:item.title}} ownerScope={inventory.owner_scope} onScopeInvalid={()=>{clearScopedView();setError('登录账号已变化，请重新读取文章');}} restore disabled={busy||!!error} onChanged={()=>void load()}/></div>)}{inventory.next_offset!==null&&<button disabled={busy} onClick={()=>void load('workspace')}>加载更多可收起与恢复文章</button>}</details>}
 </main>;
}
