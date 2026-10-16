'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from './ui/alert-dialog';
type Preview={operation_id:string;owner:string;scope:'all_articles';state:string;snapshot_sha256:string;count:number;article_count?:number;prior_deleted_count?:number;file_count:number;bytes:number;content_deleted?:boolean;remaining_object_count?:number;remaining_content_rows?:number;resume_required?:boolean;all_owner_articles_empty?:boolean;current_owner_article_count?:number;new_article_count?:number;include_dedao_articles?:boolean;included_dedao_article_count?:number;current_bound_dedao_article_count?:number;excluded_dedao_article_count?:number;dedao_scope?:string;retained_metadata?:string;file_scope?:string;external_execution_note?:string;items:{article_id:string;title?:string;state?:string}[]};
type Handle={request_key:string;operation_id?:string;owner?:string;snapshot_sha256?:string;article_ids?:string[]};
const storageKey='xiaoyu:all-article-delete:v1';
export default function ArticleContentClear({disabled,onDeleted}:{disabled:boolean;onDeleted:(ids:string[])=>void}){
 const [preview,setPreview]=useState<Preview|null>(null),[handle,setHandle]=useState<Handle|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[ack,setAck]=useState(false),[message,setMessage]=useState('');
 const current=useRef<Handle|null>(null),locked=useRef(false),notified=useRef(''),last=useRef<Handle|null>(null);
 const [hasLast,setHasLast]=useState(false);
 function remember(h:Handle){current.current=h;setHandle(h);try{sessionStorage.setItem(storageKey,JSON.stringify(h));}catch{/* Metadata-only hint; same handle stays visible. */}}
 useEffect(()=>{let mounted=true;try{const h=JSON.parse(sessionStorage.getItem(storageKey)||'null'),done=JSON.parse(sessionStorage.getItem(`${storageKey}:last`)||'null');Promise.resolve().then(()=>{if(!mounted)return;if(done&&typeof done.request_key==='string'&&typeof done.operation_id==='string'){last.current=done;setHasLast(true);}if(h&&typeof h.request_key==='string'){current.current=h;setHandle(h);setMessage('有一项全部清理操作，请回读核验。');}});}catch{/* Optional recovery hint. */}return()=>{mounted=false;};},[]);
 async function decode(r:Response):Promise<Preview>{
  const raw:unknown=await r.json(),v=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  if(!r.ok)throw Object.assign(new Error(typeof v.error==='string'?v.error:'清理结果待核验，请回读原操作'),{status:r.status});
  if(v.scope!=='all_articles'||typeof v.operation_id!=='string'||typeof v.owner!=='string'||typeof v.snapshot_sha256!=='string'||!Array.isArray(v.items)||v.items.some(x=>!x||typeof x.article_id!=='string')||new Set(v.items.map(x=>x.article_id)).size!==v.items.length)throw Error('清理结果待核验，请回读原操作');
  return v as Preview;
 }
 function bound(v:Preview){const h=current.current;if(!h||h.operation_id&&h.operation_id!==v.operation_id||h.owner&&h.owner!==v.owner||h.snapshot_sha256&&h.snapshot_sha256!==v.snapshot_sha256||h.article_ids&&JSON.stringify(h.article_ids)!==JSON.stringify(v.items.map(x=>x.article_id)))throw Error('原清理操作与回读范围不匹配，请核验原操作');}
 function accept(v:Preview,independent=false){
  bound(v);setPreview(v);remember({...current.current!,operation_id:v.operation_id,owner:v.owner,snapshot_sha256:v.snapshot_sha256,article_ids:v.items.map(x=>x.article_id)});
  if(independent&&v.content_deleted===true&&v.state==='deleted'){
   setOpen(false);setAck(false);if(notified.current!==v.operation_id){notified.current=v.operation_id;onDeleted(v.items.map(x=>x.article_id));}
   last.current=current.current;setHasLast(true);try{sessionStorage.setItem(`${storageKey}:last`,JSON.stringify(last.current));sessionStorage.removeItem(storageKey);}catch{/* Metadata-only last read remains available. */}current.current=null;setHandle(null);
   const outside=v.all_owner_articles_empty===false&&(v.current_owner_article_count??0)>0?`本站另有 ${v.current_owner_article_count??'待核验'} 篇不在原确认范围的文章，请重新核对范围。`:'';
   const upstream=v.excluded_dedao_article_count?`仍保留 ${v.excluded_dedao_article_count} 篇关联得到任务的上游副本。`:'';
   const imports=v.include_dedao_articles&&v.included_dedao_article_count?`已包含 ${v.included_dedao_article_count} 篇文章关联的本站得到副本。`:'';
   setMessage(`已独立确认清除 ${v.article_count??v.count} 篇本站文章及确认范围内的文件和正文历史。${imports}${outside}${upstream}${v.retained_metadata||'仍保留无正文的防重放及执行安全标记。'}`);
  }else{setOpen(true);if(v.state==='deleted'||v.state==='needs_verification')setMessage('原操作仍需核验实际文件与内容残留。');}
 }
 async function read(){const h=current.current;if(!h)return null;const q=h.operation_id?`operation_id=${encodeURIComponent(h.operation_id)}`:`request_key=${encodeURIComponent(h.request_key)}`;try{const v=await decode(await fetch(`/api/articles/purge?${q}`,{cache:'no-store',signal:AbortSignal.timeout(30_000)}));accept(v,true);return v;}catch(error){if(!h.operation_id&&(error as {status?:number}).status===404){current.current=null;setHandle(null);try{sessionStorage.removeItem(storageKey);}catch{/* Only a proven absent unconfirmed preview is released. */}}throw error;}}
 async function run(action:'preview'|'read'|'read_last'|'confirm'|'repreview'){
  if(locked.current||disabled)return;locked.current=true;setBusy(true);setMessage('');
  try{
   if(action==='read_last'&&last.current){remember(last.current);await read();return;}
   if(action==='read'){await read();return;}
   if(action==='repreview'){
    if(!preview||!['previewed','cancelled'].includes(preview.state))return;
    try{bound(await decode(await fetch('/api/articles/purge',{method:'POST',headers:{'Content-Type':'application/json','x-xiaoyu-content-delete':'1'},body:JSON.stringify({action:'abandon_preview',operation_id:preview.operation_id}),signal:AbortSignal.timeout(30_000)})));}
    catch(error){const v=await read();if(v?.state!=='cancelled')throw error;}
    const closed=await read();if(closed?.state!=='cancelled')throw Error('原操作未确认已放弃，请继续回读原操作');
    current.current=null;setHandle(null);setPreview(null);setAck(false);try{sessionStorage.removeItem(storageKey);}catch{/* Closed preview is proven unconfirmed; no confirmed identity is discarded. */}
    action='preview';
   }
   if(action==='preview'){
    if(current.current){await read();return;}
    remember({request_key:crypto.randomUUID()});setAck(false);
    try{accept(await decode(await fetch('/api/articles/purge',{method:'POST',headers:{'Content-Type':'application/json','x-xiaoyu-content-delete':'1'},body:JSON.stringify({action:'preview',request_key:current.current!.request_key}),signal:AbortSignal.timeout(30_000)})));}
    catch(error){try{const v=await read();if(v)return;}catch{/* Keep original key; no replacement request. */}throw error;}
    return;
   }
   if(!preview||!ack)return;
   try{
    // Every bounded batch uses the same checkbox authorization and frozen scope.
    // A transport failure exits this loop; only an independent read can finish it.
    const body=JSON.stringify({action:'confirm',operation_id:preview.operation_id,confirm_owner:preview.owner,confirm_scope:'all_articles',confirm_ids:preview.items.map(x=>x.article_id),snapshot_sha256:preview.snapshot_sha256,confirm_permanent:true});
    for(let batch=0;batch<30;batch++){
     bound(await decode(await fetch('/api/articles/purge',{method:'POST',headers:{'Content-Type':'application/json','x-xiaoyu-content-delete':'1'},body,signal:AbortSignal.timeout(30_000)})));
     const v=await read();if(!v||v.content_deleted&&v.state==='deleted'||v.resume_required!==true)return;
     setMessage(`继续同一清理操作，剩余 ${v.remaining_object_count??'待核验'} 个文件、${v.remaining_content_rows??'待核验'} 条内容记录。`);
    }
    setMessage('原操作仍有残留，请回读后继续同一范围。');
   }catch(error){try{const v=await read();if(v?.content_deleted===true&&v.state==='deleted')return;}catch{/* Unknown result retains original operation. */}throw error;}
  }catch(error){setMessage(error instanceof Error?error.message:'清理结果待核验，请回读原操作');}finally{locked.current=false;setBusy(false);}
 }
 return <div className="list-clear">
  <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>void run(handle?'read':'preview')}>{busy?'核对清理状态…':handle?'回读全部清理结果':'永久清空全部文章'}</button>
  {!handle&&hasLast&&<button type="button" className="secondary" disabled={disabled||busy} onClick={()=>void run('read_last')}>回读上次全部清理</button>}
  {message&&<p role="status" className="helper-text">{message}</p>}
  <AlertDialog open={open} onOpenChange={v=>{if(!busy){setOpen(v);if(!v)setAck(false);}}}>
   <AlertDialogContent className="list-clear-dialog article-content-clear-dialog" overlayClassName="article-content-clear-overlay">
    <AlertDialogTitle>永久清空本站全部文章</AlertDialogTitle>
    <AlertDialogDescription>删除以下固定范围的原文、配图 Word、本站文件及文章正文历史{preview?.include_dedao_articles?'，包括文章关联的本站得到副本':''}，同时撤销本站后续写入。删除不可恢复。得到外站、外部平台草稿、账号、订阅、独立计划、Library 和电脑目录保留。</AlertDialogDescription>
    {preview&&<>
     <p className="helper-text">所属账号：{preview.owner}</p>
     <p>{preview.article_count??preview.count} 篇文章 · {preview.file_count} 个本站文件 · {preview.bytes} 字节</p>
     {preview.prior_deleted_count? <p className="helper-text">同时复查 {preview.prior_deleted_count} 篇此前删除文章的残留。</p>:null}
     {preview.file_scope&&<p>{preview.file_scope}</p>}
     {!!preview.included_dedao_article_count&&<p className="helper-text">包括 {preview.included_dedao_article_count} 篇文章关联的本站得到副本。</p>}
     {!!preview.excluded_dedao_article_count&&<p className="helper-text">{preview.dedao_scope}（{preview.excluded_dedao_article_count} 篇关联文章）</p>}
     <details><summary>核对全部文章范围（{preview.items.length} 项）</summary><ul className="list-clear-targets">{preview.items.map(x=><li key={x.article_id}><strong>{x.title||'文章'}</strong><br/><code>{x.article_id}</code></li>)}</ul></details>
     <p className="helper-text">{preview.retained_metadata||'仅保留无正文的防重放、额度和执行安全标记。'}</p>
     <p className="helper-text">{preview.external_execution_note||'本站删除保护不能证明外部执行者已经退出或撤回外部已发动作。'}</p>
     {preview.state!=='previewed'&&<p role="status">续接原操作，范围保持不变。实际文件和正文残留清零后才显示完成。</p>}
     <label className="delete-check"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/>我已核对以上完整范围，确认不可恢复的永久删除</label>
    </>}
    <AlertDialogFooter><AlertDialogCancel disabled={busy}>关闭</AlertDialogCancel>{preview&&['previewed','cancelled'].includes(preview.state)&&<button type="button" className="secondary" disabled={busy} onClick={()=>void run('repreview')}>重新核对清理范围</button>}<button type="button" disabled={busy||!ack||!preview||preview.state==='cancelled'} onClick={()=>void run('confirm')}>{preview?.state==='previewed'?'确认永久删除全部范围':'继续原永久清理操作'}</button></AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog>
 </div>;
}
