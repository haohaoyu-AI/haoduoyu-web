'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {readDailyNdjson} from '../../../components/daily-run-stream';
import {writingOutlineTemplate,writingOutlineHelp} from '../../../lib/writing-outline-template';

type Writer='xiaoyu'|'claude';
type Topic={topic:string;materials:string;outline?:string;sources:{title:string;url:string;published:string}[];writing_prompt:string;prompt_version:string};
type Batch={run_id?:string;snapshot?:{writers:Record<Writer,Topic>;model:string};writers?:{writer:Writer;state:string;article_id:string}[];input_hash?:string};
type Claim={article_id:string;token:string};
type Result={outcome?:string;state:string;saved:boolean;text?:string|null;partial_text?:string|null;error?:string|null;save_error?:string|null};
type View={batch:Batch;result:Result|null;model:string;enabled:boolean;prompt_version:string};
type ActionResult={claimed?:boolean;renewed?:boolean;article_id:string;token:string;saved?:boolean;read_only?:boolean};
const outcomeNames:Record<string,string>={not_requested:'未开始',running:'正在生成',outcome_unknown:'结果待核验，只续取已有结果',ready_to_save:'完整原文已保留，待保存',saved:'原稿已保存',failed:'本次未完成，已停止'};
const names:Record<Writer,string>={xiaoyu:'小鱼',claude:'Claude'};

async function jsonResponse<T>(response:Response):Promise<T>{
 if(response.status===401)throw Error('请使用本人 ChatGPT 账号登录');
 if(response.status===403)throw Error('当前账号暂无访问权限，请核对本人账号');
 let value;try{value=await response.json();}catch{throw Error('没有收到可确认的结果，请只刷新状态，不要重复执行');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('没有收到可确认的结果，请只刷新状态，不要重复执行');
 if(!response.ok)throw Error('error' in value&&typeof value.error==='string'?value.error:'手动批次未完成');return value as T;
}
function parseJson(raw:string,message:string){try{return JSON.parse(raw);}catch{throw Error(message);}}

export default function ManualRun(){
 const [view,setView]=useState<View|null>(null),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
 const [claims,setClaims]=useState<Record<Writer,Claim>>({xiaoyu:{article_id:'',token:''},claude:{article_id:'',token:''}});
 const lock=useRef(false),readSequence=useRef(0),mounted=useRef(true);
 const runId=view?.batch.run_id||'';
 const refresh=useCallback(async()=>{
  const sequence=++readSequence.current;
  const next:View=await jsonResponse<View>(await fetch('/api/writing/manual',{cache:'no-store'}));
  if(!mounted.current||sequence!==readSequence.current)return next;
  setView(next);setClaims(previous=>{
   const result={...previous};for(const row of next.batch.writers||[]){result[row.writer]={article_id:row.article_id,token:previous[row.writer].article_id===row.article_id?previous[row.writer].token:''};}return result;
  });return next;
 },[]);
 useEffect(()=>{mounted.current=true;void refresh().catch(error=>{if(mounted.current)setFeedback(error instanceof Error?error.message:'暂时无法读取手动批次');});return()=>{mounted.current=false;};},[refresh]);
 useEffect(()=>{const read=()=>{void refresh().catch(()=>{if(mounted.current)setFeedback('连接暂时中断，恢复后只续取已有结果');});};window.addEventListener('online',read);const interval=view?.result?.state==='requested'?setInterval(read,15000):undefined;return()=>{window.removeEventListener('online',read);if(interval)clearInterval(interval);};},[refresh,view?.result?.state]);
 async function post(action:string,input:unknown){return (await jsonResponse<{result:ActionResult}>(await fetch('/api/writing/manual',{method:'POST',headers:{'content-type':'application/json','x-xiaoyu-manual-writing':'1'},body:JSON.stringify({action,input})}))).result;}
 async function perform(work:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setFeedback('处理中…');
  try{await work();}catch(error){setFeedback(error instanceof Error?error.message.replaceAll('日更结果','手动批次结果'):'结果未确认，请先刷新状态，不要重复执行');}
  finally{lock.current=false;setBusy(false);}
 }
 async function create(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const form=new FormData(event.currentTarget);
  await perform(async()=>{
   const topic=(writer:Writer)=>({topic:String(form.get(`${writer}_topic`)||''),materials:String(form.get(`${writer}_materials`)||''),outline:String(form.get(`${writer}_outline`)||''),sources:parseJson(String(form.get(`${writer}_sources`)||''),`${names[writer]}来源需为 JSON 数组`)});
   await post('create',{confirm:form.get('confirm_create')==='on',xiaoyu:topic('xiaoyu'),claude:topic('claude'),expected_model:form.get('expected_model'),expected_prompt_version:form.get('expected_prompt_version')});
   await refresh();setFeedback('本次两题已冻结；现在可分别认领，不会自动调用模型');
  });
 }
 async function claim(writer:Writer){await perform(async()=>{const result=await post('claim',{run_id:runId,writer});if(result.claimed){setClaims(previous=>({...previous,[writer]:{article_id:result.article_id,token:result.token}}));await refresh();setFeedback(`${names[writer]}已认领，请在当前页继续；认领口令不会保存在浏览器存储中`);}else{await refresh();setFeedback(`${names[writer]}已被认领，不会再建文章；请使用原认领口令`);}});}
 async function saveXiaoyu(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);await perform(async()=>{const article=parseJson(String(form.get('xiaoyu_article')||''),'小鱼原稿需为包含 title 和 paragraphs 的 JSON 对象');if(!article||typeof article!=='object'||Array.isArray(article)||Object.keys(article).some(key=>!['title','paragraphs'].includes(key)))throw Error('小鱼原稿只应包含 title 和 paragraphs');const result=await post('save_xiaoyu',{run_id:runId,...claims.xiaoyu,title:article.title,paragraphs:article.paragraphs});await refresh();setFeedback(result.read_only?'小鱼原稿已保存，本次只读回显':result.saved?'小鱼文字稿已在网站保存，已完成':'保存结果待核对');});}
 async function execute(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const form=new FormData(event.currentTarget);
  await perform(async()=>{
   const response=await fetch('/api/claude/manual-run',{method:'POST',headers:{'content-type':'application/json','x-xiaoyu-manual-run':'1'},body:JSON.stringify({run_id:runId,...claims.claude,expected_model:view?.batch.snapshot?.model,confirm:form.get('confirm_execute')==='on'})});
   if(!response.ok){await jsonResponse(response);return;}if(!response.body)throw Error('未收到长连接结果，请只刷新手动批次状态');
   const final=await readDailyNdjson(response.body,event=>{if(event.type==='running')setFeedback('Claude 正在处理，连接保持中…');});
   await refresh();setFeedback(final.success?(final.state||'Claude 原稿已保存'):(final.error||'结果未确认，不会重试'));
  });
 }
 async function recover(action:'save_claude'|'renew_claude'){await perform(async()=>{const result=await post(action,{run_id:runId,...claims.claude});if(result.renewed)setClaims(previous=>({...previous,claude:{article_id:result.article_id,token:result.token}}));await refresh();setFeedback(action==='renew_claude'?(result.renewed?'已续认领同一篇原稿；接下来只能保存缓存':'认领状态未改变，请查看状态'):'仅保存已完成的 Claude 原稿，没有再次调用模型');});}
 const credentials=(writer:Writer)=><>
  <label>{names[writer]}文章认领编号<input name={`${writer}_article_id`} value={claims[writer].article_id} onChange={event=>setClaims(previous=>({...previous,[writer]:{...previous[writer],article_id:event.target.value}}))} autoComplete="off" disabled={busy}/></label>
  <label>{names[writer]}认领口令<input name={`${writer}_token`} type="password" value={claims[writer].token} onChange={event=>setClaims(previous=>({...previous,[writer]:{...previous[writer],token:event.target.value}}))} autoComplete="off" disabled={busy}/></label>
 </>;
 return <main className="daily-run-page">
  <header className="site-header"><h1>手动双作者写文</h1><span className="edition">仅本次请求</span></header>
  <p className="daily-run-note">2026-10-05 网页选题请求：小鱼、Claude 各写一篇不同选题。创建时冻结两套资料与完整 V2。Claude 使用已配置 YYLX 模型，最多一次请求，14000 输出上限、300 秒等待、不重试；只进入配图与私人草稿，不公开发布。</p>
  <p className="inline-feedback" role="status" aria-live="polite">{feedback}</p>
  <button className="secondary" type="button" disabled={busy} onClick={()=>void perform(async()=>{await refresh();setFeedback('已刷新状态，没有调用模型');})}>只刷新状态</button>
  {!view&&<p>正在读取本人手动批次…</p>}
  {view&&!runId&&<section className="manual-work-section"><h2>1. 冻结本次两题</h2><form className="daily-run-form" onSubmit={create} aria-busy={busy}>
   {(['xiaoyu','claude'] as Writer[]).map(writer=><fieldset key={writer} disabled={busy} className="manual-topic-fields"><legend>{names[writer]}独立选题</legend>
    <label>选题<input name={`${writer}_topic`} maxLength={300} required/></label>
    <label>文章框架<textarea name={`${writer}_outline`} minLength={120} maxLength={8000} rows={16} required placeholder={writingOutlineTemplate}/></label>
    <p className="daily-run-note">{writingOutlineHelp}</p>
    <label>已核验材料<textarea name={`${writer}_materials`} minLength={100} maxLength={18000} rows={5} required/></label>
    <label>来源 JSON（2–12 条）<textarea name={`${writer}_sources`} rows={4} required placeholder={'[{"title":"来源标题","url":"https://example.com/article","published":"2026-10-05"}]'}/></label>
   </fieldset>)}
   <label>已配置模型<input name="expected_model" defaultValue={view.model} required disabled={busy}/></label>
   <label>完整冻结写作要求版本<input name="expected_prompt_version" defaultValue={view.prompt_version} required disabled={busy}/></label>
   <label className="manual-confirm"><input name="confirm_create" type="checkbox" required disabled={busy}/>确认本次两题资料已核验；冻结后各写一篇，Claude 最多一次付费调用，无重试，仅私人草稿</label>
   <button type="submit" disabled={busy||!view.enabled}>创建并冻结本次唯一批次</button>
  </form></section>}
  {view&&runId&&<>
   <section className="manual-work-section"><h2>1. 本次已冻结</h2><label>批次编号<input name="run_id" value={runId} readOnly/></label>
    {(['xiaoyu','claude'] as Writer[]).map(writer=><details key={writer}><summary>{names[writer]}：{view.batch.snapshot?.writers[writer].topic}</summary><p>资料、来源和完整 V2 已冻结，不能更换题目</p><textarea readOnly rows={10} aria-label={`${names[writer]}冻结材料与完整提示词`} value={JSON.stringify(view.batch.snapshot?.writers[writer],null,2)}/></details>)}
   </section>
   <section className="manual-work-section"><h2>2. 小鱼原稿</h2><form className="daily-run-form" onSubmit={saveXiaoyu}>
    <button type="button" disabled={busy||!!view.batch.writers?.some(row=>row.writer==='xiaoyu')} onClick={()=>void claim('xiaoyu')}>认领小鱼一篇</button>
    {credentials('xiaoyu')}
    <label>原稿 JSON<textarea name="xiaoyu_article" rows={10} required disabled={busy} placeholder={'{"title":"原标题","paragraphs":["原文段落"]}'}/></label>
    <p className="section-hint">标题与正文分开；正文 2000–3000 字。原文保存后自动进入已授权的配图与私人草稿流程</p>
    <button type="submit" disabled={busy||!claims.xiaoyu.token}>原样保存小鱼文章</button>
   </form></section>
   <section className="manual-work-section"><h2>3. Claude 一次写作</h2><form className="daily-run-form" onSubmit={execute}>
    <button type="button" disabled={busy||!!view.batch.writers?.some(row=>row.writer==='claude')} onClick={()=>void claim('claude')}>认领 Claude 一篇</button>
    {credentials('claude')}
    <label>冻结模型<input value={view.batch.snapshot?.model||''} readOnly/></label>
    <label className="manual-confirm"><input name="confirm_execute" type="checkbox" required disabled={busy}/>确认执行本批次 Claude 唯一一次请求，不重试，不公开发布</label>
    <button type="submit" disabled={busy||!claims.claude.token||!!(view.result&&view.result.state!=='not_requested')}>执行 Claude 一次写作</button>
   </form>
   <p>Claude 状态：{outcomeNames[view.result?.outcome||'']||view.result?.state||'未开始'}</p>
   {view.result?.state==='completed'&&!view.result.saved&&<div className="manual-actions"><button type="button" disabled={busy||!claims.claude.token} onClick={()=>void recover('save_claude')}>仅保存已完成原稿</button><button type="button" className="secondary" disabled={busy||!claims.claude.token} onClick={()=>void recover('renew_claude')}>续认领已完成原稿</button></div>}
   {(view.result?.text||view.result?.partial_text)&&<label>Claude 实际返回原文<textarea readOnly rows={12} value={view.result.text||view.result.partial_text||''}/></label>}
   {(view.result?.error||view.result?.save_error)&&<p role="alert">{view.result.error||view.result.save_error}</p>}
   </section>
  </>}
 </main>;
}
