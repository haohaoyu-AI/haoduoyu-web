'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import StudioNav from '../../components/studio-nav';
type Item={id:string;ordinal:number;title:string|null;stage:number;stage_name:string;submitted:boolean;submitted_at:string|null;article_id:string|null;submitted_handoff_id:string|null;download:{filename:string;path:string;size:number;sha256:string}|null};
type Native={thread_id:string;turn_id:string|null;turn_state:string;safe_boundary:boolean|null;bridge_connected:boolean;last_observed_at:string|null;missing:string[];lifecycle_source?:string|null;lifecycle_connected?:boolean;wake_id?:string|null};
type View={connection:{connected:boolean;accept_queue_ready:boolean;event_subscription:boolean;executor_connected:boolean;xiaoyu_connected:boolean;last_heartbeat:string|null;missing:string[];required_configuration:string[];execution_mode?:'native_codex'|'cli_cdp'|null;native?:Native|null};batch:null|{id:string;request_key:string;state:string;total:number;completed:number;current_ordinal:number;elapsed_seconds:number;execution_message:string;execution_continuing:boolean;failure:string|null;can_resume:boolean;current:Item|null;current_record_deleted?:boolean;items:Item[];items_truncated:boolean;execution_id:string|null;executor_id?:string|null;runtime?:'native_codex'|'cli_cdp';native?:{safe_boundary:boolean}|null;executor_ended?:number}};
const countValue=(s:string)=>/^[1-9]\d*$/.test(s)&&Number.isSafeInteger(Number(s))?Number(s):null;
const time=(n:number)=>n>=3600?`${Math.floor(n/3600)}小时${Math.floor(n%3600/60)}分`:n>=60?`${Math.floor(n/60)}分${n%60}秒`:`${n}秒`;
const turnLabels:Record<string,string>={inProgress:'正在执行',in_progress:'正在执行',running:'正在执行',active:'正在执行',completed:'本轮已完成',interrupted:'本轮已中断',failed:'本轮失败',ended:'原生会话已结束',idle:'当前对话空闲',pending:'等待连接',unknown:'状态尚未确认'};
const turnLabel=(state:string)=>turnLabels[state]||'状态尚未确认';
const temporaryConnectionMessage='服务连接暂时故障，任务与已确认文章保留。等待自动读取恢复后，先核对同一批次再恢复；不要重新启动或重复发送、下载、上传、求助。暂停请求的结果也必须重新确认。';
async function readResponse(r:Response){
 if(r.status===503)throw Error(temporaryConnectionMessage);
 const v=await r.json() as View & {error?:string;already_active?:boolean};
 if(!r.ok)throw Error(v.error||'请求未确认');
 return v;
}
export default function DedaoPage(){
 const [count,setCount]=useState('1'),[view,setView]=useState<View|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[readError,setReadError]=useState('');
 const inFlight=useRef(false);
 const refresh=useCallback(async()=>{const v=await readResponse(await fetch('/api/dedao',{cache:'no-store'}));setView(v);setReadError('');return v as View;},[]);
 useEffect(()=>{let ended=false;const read=()=>refresh().catch(e=>{if(!ended)setReadError(e.message);});void read();const timer=setInterval(read,4000);return()=>{ended=true;clearInterval(timer);};},[refresh]);
 async function start(){
  if(inFlight.current)return;const n=countValue(count);if(n===null){setMessage('生成篇数必须是正整数');return;}
  inFlight.current=true;setBusy(true);setMessage('正在下发任务，等待服务器确认…');
  try{let key=sessionStorage.getItem('dedao-start-key');if(!key){key=crypto.randomUUID();sessionStorage.setItem('dedao-start-key',key);}const r=await fetch('/api/dedao',{method:'POST',headers:{'Content-Type':'application/json','X-Xiaoyu-Upload':'1'},body:JSON.stringify({total:n,request_key:key})});const v=await readResponse(r);setView(v);sessionStorage.removeItem('dedao-start-key');setMessage(v.already_active?'已读取同一运行批次；没有重复启动。':'任务已保存并请求唤醒，等待选择当前授权电脑；创建任务后仍需实际核验再领取。');}
  catch(e){try{const v=await refresh();if(v.batch&&(v.batch.state!=='completed'||v.batch.request_key===sessionStorage.getItem('dedao-start-key'))){setMessage('服务器已有同一批次，请查看真实进度；无需再次点击。');sessionStorage.removeItem('dedao-start-key');}else setMessage(e instanceof Error?e.message:'启动结果未确认，请刷新核对');}catch(error){setReadError(error instanceof Error?error.message:'任务读取失败');setMessage('启动结果未确认；启动键已保留，请恢复连接后查询同一任务。');}}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function resume(){if(inFlight.current||!view?.batch||readError)return;inFlight.current=true;setBusy(true);try{const r=await fetch('/api/dedao',{method:'POST',headers:{'Content-Type':'application/json','X-Xiaoyu-Upload':'1'},body:JSON.stringify({action:'resume',batch_id:view.batch.id})});const v=await readResponse(r);setView(v);setMessage('同一批次已恢复排队，将先核查已确认步骤和文件。');}catch(e){try{const v=await refresh();setMessage(v.batch?.id===view.batch.id&&['queued','launching','running'].includes(v.batch.state)?'已核实同一批次恢复成功；无需再次点击。':e instanceof Error?e.message:'恢复未确认，请核对同一批次');}catch(error){setReadError(error instanceof Error?error.message:'恢复结果未确认');setMessage('恢复结果未确认，请恢复连接后先读取同一批次。');}}finally{inFlight.current=false;setBusy(false);}}
 async function pause(){if(inFlight.current||!view?.batch)return;inFlight.current=true;setBusy(true);try{const r=await fetch('/api/dedao',{method:'POST',headers:{'Content-Type':'application/json','X-Xiaoyu-Upload':'1'},body:JSON.stringify({action:'pause',batch_id:view.batch.id})});const v=await readResponse(r);setView(v);setMessage('已请求暂停；等待原生执行者确认本批次已停止发送、下载和上传，再恢复同一批次。');}catch{try{const v=await refresh();setMessage(v.batch?.id===view.batch.id&&['paused','completed'].includes(v.batch.state)?'已核实同一批次的暂停或完成记录；恢复前仍需确认执行者已停止动作。':'暂停结果尚未确认，请核对同一批次。');}catch(error){setReadError(error instanceof Error?error.message:'暂停结果未确认');setMessage('暂停结果尚未确认；等待连接恢复后核对同一批次，未确认之前不视为已经暂停。');}}finally{inFlight.current=false;setBusy(false);}}
 const b=view?.batch,awaitingBoundary=!!b&&b.state==='completed'&&(b.runtime==='native_codex'?b.native?.safe_boundary===false:b.executor_ended===0),locked=!!b&&(b.state!=='completed'||awaitingBoundary),valid=countValue(count)!==null,queueReady=!!view?.connection.accept_queue_ready,native=view?.connection.native,nativeConnected=!!view?.connection.connected&&view.connection.execution_mode==='native_codex'&&!!native?.bridge_connected;
 const missing=Array.from(new Set([...(view?.connection.missing||[]),...(native?.missing||[]),...(view&&!native?['原生生命周期尚未通过本对话工具验证；尚未绑定实际执行轮次和任务唤醒连接。']:[])]));
 return <main className="studio-main dedao-page"><StudioNav current="dedao"/>
  <header className="page-heading"><h2>得到大脑</h2><p>采用得到大脑推荐的选题与最终稿，逐篇提交给小鱼。</p></header>
  <section className="dedao-controls" aria-label="求助成文">
   <label htmlFor="dedao-count">生成篇数<input id="dedao-count" type="number" min="1" step="1" inputMode="numeric" value={count} disabled={busy||locked} onChange={e=>setCount(e.target.value)} aria-invalid={!valid}/></label>
   <button className="primary-button" aria-label="求助成文" onClick={start} disabled={busy||locked||!valid||!queueReady||!!readError}>{busy?'求助成文 · 提交中…':awaitingBoundary?'求助成文 · 等待本批次收尾':locked?`求助成文 · ${b?.state==='paused'?'已暂停':b?.state==='queued'?'等待领取':b?.state==='launching'?'等待启动':'运行中'}`:'求助成文'}</button>
   {!valid&&<p className="dedao-error" role="alert">生成篇数必须是正整数。</p>}
  </section>
  <p role="status" aria-live="polite">{message}</p>{readError&&<p className="dedao-error" role="alert">{readError}。当前显示的是上次读取结果，尚未确认执行是否仍在继续。</p>}
  {view&&<section className="dedao-connection" aria-label="执行连接"><h3>{readError===temporaryConnectionMessage?'服务连接暂时故障':readError?'连接状态待确认':nativeConnected?'Codex 原生电脑插件已连接':queueReady?'事件已连接，等待电脑领取':'事件或执行连接未就绪'}</h3>
   <p>按钮保存同一批次并发出事件，由当前授权电脑的新 Codex 任务接续；实际执行前核验已登录得到大脑的浏览器和下载目录。</p>
   {view.connection.execution_mode==='cli_cdp'&&<p className="dedao-error">服务器检测到旧 CLI / CDP 执行端。本页的原生任务仍需完成 Codex 对话绑定。</p>}
   {!nativeConnected&&missing.map(m=><p key={m}>{m}</p>)}
   {native&&<dl><div><dt>连接对话</dt><dd>{native.thread_id}</dd></div><div><dt>实际执行轮次</dt><dd>{native.turn_id||'尚未绑定'}</dd></div><div><dt>原生轮次状态</dt><dd>{turnLabel(native.turn_state)}</dd></div><div><dt>生命周期验证</dt><dd>{native.lifecycle_connected?(native.lifecycle_source==='codex_app_tools'?'本对话实际工具观测':native.lifecycle_source==='hook'?'实际生命周期钩子':'验证来源尚未确认'):'原生生命周期尚未通过本对话工具验证'}</dd></div><div><dt>连接最近确认</dt><dd>{native.last_observed_at?new Date(native.last_observed_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'尚未确认'}</dd></div></dl>}
   <p>{native?.safe_boundary?'执行者已确认本批次当前没有发送、下载或上传动作。':'暂停时会保留当前任务，等待执行者确认本批次动作停止。'}</p>
   {!nativeConnected&&<details><summary>缺少的连接配置</summary><ul>{view.connection.required_configuration.map(c=><li key={c}>{c}</li>)}</ul><p>连接由本机 Codex 使用本对话的实际工具完成验证。确需本人登录或授权时，会在对应窗口提示；凭据只保存在本机受保护存储或服务器。</p></details>}
  </section>}
  {b?<section className="dedao-batch" aria-label="批次真实进度">
   <h3>{b.current_record_deleted?'本篇关联的本站条目已永久移除':b.state==='completed'?`已完成${b.completed}/${b.total}篇，全部已提交小鱼`:b.state==='paused'?`已暂停，已完成${b.completed}/${b.total}篇，第${b.current_ordinal}篇停在${(b.current?.stage_name||'待核验')}。`:b.state==='queued'||b.state==='launching'?`已完成${b.completed}/${b.total}篇，第${b.current_ordinal}篇等待${b.state==='queued'?'领取':'启动'}：${(b.current?.stage_name||'待核验')}。`:`已完成${b.completed}/${b.total}篇，正在处理第${b.current_ordinal}篇：${(b.current?.stage_name||'待核验')}。`}</h3>
   {!b.current_record_deleted&&<progress max={b.total} value={b.completed} aria-label="已提交篇数"/>}
   <dl><div><dt>总篇数</dt><dd>{b.total}</dd></div><div><dt>已完成篇数</dt><dd>{b.completed}</dd></div><div><dt>耗时</dt><dd>{time(b.elapsed_seconds)}</dd></div><div><dt>当前文章</dt><dd>{b.current_record_deleted?'本站条目已移除':b.current?.title||`第${b.current_ordinal}篇 · 等待得到大脑推荐`}</dd></div><div><dt>当前步骤</dt><dd>{b.current_record_deleted?'本站条目已移除':(b.current?.stage_name||'待核验')}</dd></div></dl>
   <p role="status">{readError?'执行状态待重新确认':b.execution_message}</p>
   {['queued','launching','running'].includes(b.state)&&<button onClick={pause} disabled={busy}>暂停当前批次</button>}
   {b.failure&&<p className="dedao-error" role="alert">暂停或失败原因：{b.failure}</p>}
   {b.state==='paused'&&<><button onClick={resume} disabled={busy||!b.can_resume||!queueReady||!!readError}>恢复当前批次</button>{(!b.can_resume||!queueReady)&&<p>恢复前需事件连接正常，并由原执行者确认本批次已停止写入，或核实确切原生轮次已结束。创建结果未知时先核对同一派送记录。聊天暂时空闲不会自动满足恢复条件。已完成文章保留。</p>}</>}
   <ol className="dedao-items">{b.items.map(i=><li key={i.id}><div><strong>第{i.ordinal}篇 · {i.title||'等待推荐'}</strong><span>{i.submitted?'已提交，等待小鱼接手。无需再次点击。':i.stage_name}</span></div>{i.download&&<details><summary>{i.download.filename}</summary><p>实际下载路径：{i.download.path}</p><p>字节数：{i.download.size} · SHA256：{i.download.sha256}</p>{i.article_id&&<p>上传文章：{i.article_id}</p>}{i.submitted_handoff_id&&<p>小鱼提交记录：{i.submitted_handoff_id}</p>}</details>}</li>)}</ol>
   {b.items_truncated&&<p>显示最近 50 篇记录；完整批次保存在服务器。</p>}
   <details><summary>任务记录</summary><p>批次：{b.id}</p><p>Codex 执行：{b.execution_id||'尚未领取'}</p>{b.executor_id&&<p>执行身份：{b.executor_id}</p>}<p>仅在 Word 上传与小鱼提交被服务器确认后计为完成，不等待配图或平台发布。</p></details>
  </section>:<section className="dedao-empty"><p>{view?'尚未启动批次。':'正在读取执行连接和任务记录…'}</p></section>}
 </main>;
}
