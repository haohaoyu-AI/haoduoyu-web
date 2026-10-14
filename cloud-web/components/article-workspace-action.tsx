'use client';
import {useEffect,useRef,useState} from 'react';
type Intent={ids:string[];titles:Record<string,string>;restore:boolean;owner:string;scope?:string;started:boolean;cursor:number;key:string|null;changed:string[];blocked:string[]};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export default function ArticleWorkspaceAction({ids,titles={},restore=false,disabled=false,ownerScope,onScopeInvalid,onChanged,label}:{ids:string[];titles?:Record<string,string>;restore?:boolean;disabled?:boolean;ownerScope?:string;onScopeInvalid?:()=>void;onChanged?:(ids:string[])=>void;label?:string}){
 const lock=useRef(false),intent=useRef<Intent|null>(null),mounted=useRef(true),controller=useRef<AbortController|null>(null),currentScope=useRef(ownerScope);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState<{scope?:string;text:string}>({scope:ownerScope,text:''}),[prepared,setPrepared]=useState<Intent|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 useEffect(()=>{currentScope.current=ownerScope;controller.current?.abort();intent.current=null;},[ownerScope]);
 const showMessage=(text:string)=>setMessage({scope:currentScope.current,text});
 const sameRange=(next:Intent)=>next.restore===restore&&next.ids.length===ids.length&&next.ids.every(id=>ids.includes(id));
 async function readOwner(signal:AbortSignal){
  const response=await fetch('/api/articles/workspace?limit=1',{cache:'no-store',signal});
  if([401,403].includes(response.status))throw Error('登录账号已变化，请重新读取文章列表');
  if(!response.ok)throw Error('暂时无法核对文章范围');
  const body=await response.json() as {owner_scope?:string};
  if(typeof body.owner_scope!=='string'||!body.owner_scope)throw Error('文章范围返回不完整');
  return body.owner_scope;
 }
 async function change(){
  if(lock.current||disabled||(!intent.current&&!ids.length))return;
  lock.current=true;setBusy(true);
  const abort=new AbortController();controller.current=abort;
  const signal=()=>AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]);
  const live=()=>mounted.current&&!abort.signal.aborted;
  let next=intent.current;
  try{
   if(!next){
    // Reject a malformed selection before it can become a started intent. An
    // opaque HTTP 400 later may already have a receipt and remains same-key.
    if(ids.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(ids).size!==ids.length)throw Error('文章范围无效，请刷新列表后重新确认');
    const selected=[...ids],selectedTitles={...titles},selectedRestore=restore,scopeAtRead=currentScope.current;
    const owner=await readOwner(signal());if(!live())return;
    if(scopeAtRead&&owner!==scopeAtRead||currentScope.current!==scopeAtRead)throw Error('登录账号已变化，请重新读取文章列表');
    next={ids:selected,titles:selectedTitles,restore:selectedRestore,owner,scope:scopeAtRead,started:false,cursor:0,key:null,changed:[],blocked:[]};
    intent.current=next;setPrepared(next);showMessage(`请核对本次 ${next.ids.length} 篇文章；确认后${next.restore?'恢复':'仅收起已安全结束的文章'}。`);return;
   }
   if(!next.started&&!sameRange(next)){intent.current=null;setPrepared(null);showMessage('文章范围已变化，请重新选择并确认本次范围。');return;}
   next.started=true;
   while(next.cursor<next.ids.length){
    const owner=await readOwner(signal());if(!live()||intent.current!==next)return;
    if(owner!==next.owner||currentScope.current&&owner!==currentScope.current)throw Error('登录账号已变化，请重新读取文章列表');
    const batch=next.ids.slice(next.cursor,next.cursor+100);
    // Keep this key until this exact batch has a complete receipt. A transport
    // failure can follow a committed mutation, so a retry must read the same key.
    next.key??=crypto.randomUUID();
    showMessage(`正在${next.restore?'恢复':'核对并收起'}原确认范围；已确认 ${next.changed.length} 篇…`);
    const response=await fetch('/api/articles/workspace',{method:'POST',headers:{'Content-Type':'application/json','X-Article-Workspace':'1'},body:JSON.stringify({action:next.restore?'restore':'archive',request_key:next.key,article_ids:batch,owner_scope:next.owner}),signal:signal()});
    const body=await response.json() as {action?:string;changed?:string[];blocked?:string[];error?:string};
    if(!live()||intent.current!==next)return;
    if(!response.ok){if([401,403].includes(response.status))throw Error('登录账号已变化，请重新读取文章列表');throw Error(body.error||'结果暂未确认');}
    if(body.action!==(next.restore?'restore':'archive')||!Array.isArray(body.changed)||!Array.isArray(body.blocked)||body.changed.length+body.blocked.length!==batch.length||new Set([...body.changed,...body.blocked]).size!==batch.length||[...body.changed,...body.blocked].some(id=>!batch.includes(id)))throw Error('操作结果不完整');
    next.changed.push(...body.changed);next.blocked.push(...body.blocked);next.cursor+=batch.length;next.key=null;
    // Expose each confirmed batch, including when a later batch is unknown.
    onChanged?.(body.changed);
   }
   if(live()&&intent.current===next){showMessage(`${next.restore?'已恢复':'已收起'} ${next.changed.length} 篇${next.blocked.length?`；${next.blocked.length} 篇未收起，处理中或未符合条件的文章继续保留`:''}。`);intent.current=null;setPrepared(null);}
  }catch(error){
   if(live()){
    const reason=error instanceof Error?error.message:'结果未确认';
    if(reason.includes('登录账号已变化')){intent.current=null;setPrepared(null);onScopeInvalid?.();showMessage(reason);}
    else showMessage(`${next?.changed.length?`已确认${next.restore?'恢复':'收起'} ${next.changed.length} 篇；`:''}${reason}${next?.started?'；重试将继续原确认范围的同一次操作。':'；请重试读取范围。'}`);
   }
  }finally{lock.current=false;if(controller.current===abort)controller.current=null;if(mounted.current)setBusy(false);}
 }
 const pending=prepared?.scope===ownerScope?prepared:null;
 return <div className="workspace-action"><button type="button" className="secondary" disabled={disabled||busy||(!pending&&!ids.length)} onClick={()=>void change()}>{busy?'处理中…':pending?.started?`重试原确认的 ${pending.ids.length} 篇`:pending?`确认${pending.restore?'恢复':'收起'}本次 ${pending.ids.length} 篇`:label||(restore?'恢复文章':'删除当前文章')}</button>{pending&&<>{!pending.started&&<button type="button" className="secondary" disabled={busy} onClick={()=>{intent.current=null;setPrepared(null);showMessage('已取消本次范围确认。');}}>取消</button>}<details className="workspace-confirmation-range"><summary>查看本次 {pending.ids.length} 篇文章范围</summary><ul>{pending.ids.map(id=><li key={id}><span className="workspace-confirmation-title">{pending.titles[id]||id}</span><span className="workspace-confirmation-id">文章编号：<code>{id}</code></span></li>)}</ul></details></>}{message.scope===ownerScope&&message.text&&<span role="status" aria-live="polite">{message.text}</span>}</div>;
}
