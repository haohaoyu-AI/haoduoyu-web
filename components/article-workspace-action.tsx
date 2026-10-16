'use client';
import {useRef,useState} from 'react';
export default function ArticleWorkspaceAction({ids,restore=false,disabled=false,onChanged,label}:{ids:string[];restore?:boolean;disabled?:boolean;onChanged?:(ids:string[])=>void;label?:string}){
 const lock=useRef(false),intent=useRef<{key:string;ids:string[];restore:boolean}|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function change(){
  if(lock.current||!ids.length)return;
  lock.current=true;setBusy(true);setMessage(restore?'正在恢复…':'正在核对并收起；处理中稿件会保留…');
  const next=intent.current??={key:crypto.randomUUID(),ids:[...ids],restore};
  try{
   const response=await fetch('/api/articles/workspace',{method:'POST',headers:{'Content-Type':'application/json','X-Article-Workspace':'1'},body:JSON.stringify({action:next.restore?'restore':'archive',request_key:next.key,article_ids:next.ids}),signal:AbortSignal.timeout(20000)});
   const body=await response.json() as {changed?:string[];blocked?:string[];error?:string};
   if(!response.ok)throw Error(body.error||'结果暂未确认');
   if(!Array.isArray(body.changed)||body.changed.some(id=>!next.ids.includes(id)))throw Error('操作结果不完整');
   setMessage(`${restore?'已恢复':'已收起'} ${body.changed.length} 篇${body.blocked?.length?`；${body.blocked.length} 篇处理尚未安全结束，继续保留`:''}。`);
   intent.current=null;onChanged?.(body.changed);
  }catch(error){setMessage(error instanceof Error?`${error.message}；可重试同一次操作。`:'结果未确认，请重试同一次操作。');}
  finally{lock.current=false;setBusy(false);}
 }
 return <span className="workspace-action"><button type="button" className="secondary" disabled={disabled||busy||!ids.length} onClick={()=>void change()}>{busy?'处理中…':label||(restore?'恢复文章':'删除当前文章')}</button>{message&&<span role="status" aria-live="polite">{message}</span>}</span>;
}
