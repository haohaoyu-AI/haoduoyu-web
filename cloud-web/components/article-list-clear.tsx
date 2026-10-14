'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from './ui/alert-dialog';

type Preview = {operation_id: string; owner: string; scope: 'publish' | 'writing'; state: string; snapshot_sha256: string; count: number; file_count: number; bytes: number; file_scope: string; retained_metadata: string; items: {article_id:string; title:string; state:string; files:{key:string;size:number}[]}[]};
type Pending = {request_key: string; operation_id?: string};
export default function ArticleListClear({scope, articleIds, disabled, onDeleted}: {scope:'publish'|'writing'; articleIds:string[]; disabled:boolean; onDeleted:(ids:string[])=>void}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [lastCompleted,setLastCompleted]=useState<Pending|null>(null);
  const lastCompletedRef=useRef<Pending|null>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [ack, setAck] = useState(false), [message, setMessage] = useState('');
  const lock = useRef(false);
  const key = `xiaoyu:list-delete:${scope}:v1`;
  const done = useRef('');
  function remember(value: Pending | null) {
    pendingRef.current = value; setPending(value);
    try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); } catch { /* The visible original-operation control remains available. */ }
  }
  function accept(value: Preview) {
    if (value.scope !== scope) throw Error('原操作范围不匹配，请核对账号');
    setPreview(value);
    if (value.state === 'cancelled') {remember(null);setOpen(false);setAck(false);setMessage('未确认的预览已取消，文章和文件均未删除。');return;}
    if (value.state === 'deleted') {
      const completed={...pendingRef.current!,operation_id:value.operation_id};
      lastCompletedRef.current=completed;setLastCompleted(completed);
      try{sessionStorage.setItem(`${key}:last`,JSON.stringify(completed));}catch{/* Readback remains available during this session. */}
      if (done.current !== value.operation_id) {done.current = value.operation_id; onDeleted(value.items.map(r => r.article_id));}
      remember(null); setOpen(false); setAck(false); setMessage(`已永久删除 ${value.count} 篇文章及本站文件；仅保留防重放技术元数据。`);
    } else { remember({...pendingRef.current!, operation_id:value.operation_id}); setOpen(true); }
  }
  async function result(response: Response): Promise<Preview> {
    const data = await response.json() as Preview & {error?:string};
    if (!response.ok) throw Object.assign(new Error(typeof data.error === 'string' ? data.error : '结果尚未确认，请回读原操作'),{status:response.status});
    if (!data || typeof data.operation_id !== 'string' || typeof data.owner !== 'string' || typeof data.snapshot_sha256 !== 'string' || !Array.isArray(data.items)) throw Error('结果尚未确认，请回读原操作');
    return data;
  }
  async function readOriginal() {
    const intent = pendingRef.current; if (!intent) return;
    const query = intent.operation_id ? `operation_id=${encodeURIComponent(intent.operation_id)}` : `request_key=${encodeURIComponent(intent.request_key)}`;
    try {
      accept(await result(await fetch(`/api/articles/list-delete?${query}`, {cache:'no-store', signal:AbortSignal.timeout(20_000)})));
    } catch (error) {
      // Without a returned operation ID no confirmation could have been sent.
      // A definitive absence may release this non-destructive preview intent;
      // confirmed/unknown operations always keep their original recovery handle.
      if (!intent.operation_id && error && typeof error === 'object' && 'status' in error && error.status === 404) {
        remember(null); setPreview(null); setOpen(false); setAck(false);
        setMessage('未找到已保存的预览；未确认删除，可以重新预览。');
        return;
      }
      throw error;
    }
  }
  useEffect(() => {
    let mounted=true;
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || 'null');
      const last=JSON.parse(sessionStorage.getItem(`${key}:last`)||'null');
      if(last&&typeof last.request_key==='string'&&typeof last.operation_id==='string')Promise.resolve().then(()=>{
        if(mounted){lastCompletedRef.current=last;setLastCompleted(last);}
      });
      if (value && typeof value.request_key === 'string') Promise.resolve().then(()=>{
        if(mounted){pendingRef.current=value;setPending(value);setMessage('有一项清空结果待核验，请回读原操作。');}
      });
    } catch { /* Optional local recovery hint. */ }
    return ()=>{mounted=false;};
  }, [key]);
  async function run(action: 'preview' | 'read' | 'read_last' | 'confirm' | 'cancel') {
    if (lock.current || disabled) return;
    lock.current=true; setBusy(true); setMessage('');
    try {
      if(action==='read_last'&&lastCompletedRef.current){remember(lastCompletedRef.current);await readOriginal();return;}
      if (action === 'read' || action === 'preview' && pendingRef.current) {await readOriginal(); return;}
      if (action === 'preview') {
        const intent={request_key:crypto.randomUUID()}; remember(intent); setAck(false);
        try {
          accept(await result(await fetch('/api/articles/list-delete', {method:'POST', headers:{'Content-Type':'application/json','x-xiaoyu-list-delete':'1'}, body:JSON.stringify({action:'preview',scope,request_key:intent.request_key,article_ids:articleIds}), signal:AbortSignal.timeout(20_000)})));
        } catch (error) {
          if (error && typeof error==='object' && 'status' in error && Number(error.status)>=400 && Number(error.status)<500) {remember(null);throw error;}
          // Preview is non-destructive. A definitive 4xx can be surfaced by the
          // recovery GET; an unknown POST never creates a broader second preview.
          try {await readOriginal();} catch {throw error;}
        }
        return;
      }
      if(action==='cancel' && preview?.state==='previewed') {
        try {accept(await result(await fetch('/api/articles/list-delete',{method:'POST',headers:{'Content-Type':'application/json','x-xiaoyu-list-delete':'1'},body:JSON.stringify({action:'cancel',operation_id:preview.operation_id}),signal:AbortSignal.timeout(20_000)})));}
        catch(error){try{await readOriginal();}catch{}throw error;}
        return;
      }
      if (!preview || !ack) return;
      try {
        accept(await result(await fetch('/api/articles/list-delete', {method:'POST', headers:{'Content-Type':'application/json','x-xiaoyu-list-delete':'1'}, body:JSON.stringify({action:'confirm',operation_id:preview.operation_id,confirm_owner:preview.owner,confirm_scope:preview.scope,confirm_ids:preview.items.map(r=>r.article_id),snapshot_sha256:preview.snapshot_sha256,confirm_permanent:true}), signal:AbortSignal.timeout(20_000)})));
      } catch (error) {try {await readOriginal();} catch { /* Retain original operation for manual readback. */ } throw error;}
    } catch (error) {setMessage(error instanceof Error ? error.message : '结果尚未确认，请回读原操作');}
    finally {lock.current=false; setBusy(false);}
  }
  return <div className="list-clear">
    <button className="secondary" type="button" disabled={busy || disabled || !articleIds.length && !pending} onClick={()=>run(pending?'read':'preview')}>{busy?'核对中…':pending?'回读原清空操作':'一键清空最近文章'}</button>
    {pending && <button className="secondary" type="button" disabled={busy||disabled} onClick={()=>run('read')}>回读原操作</button>}
    {!pending&&lastCompleted&&<button className="secondary" type="button" disabled={busy||disabled} onClick={()=>run('read_last')}>回读上次清空结果</button>}
    {message && <p role="status" className="helper-text">{message}</p>}
    <AlertDialog open={open} onOpenChange={value=>{if(!busy){setOpen(value);if(!value)setAck(false);}}}>
      <AlertDialogContent className="list-clear-dialog">
        <AlertDialogTitle>永久清空{scope==='publish'?'配图发布':'写作台'}最近文章</AlertDialogTitle>
        <AlertDialogDescription>删除不可恢复。仅删除以下固定快照中的非执行文章；正在执行、等待处理和预览后新增的文章受到保护。</AlertDialogDescription>
        {preview && <>
          <p>账号 owner：<code>{preview.owner}</code><br/>范围：{scope==='publish'?'配图发布':'写作台'} · 非执行最近区 · {preview.count} 篇 · {preview.file_count} 个文件 · {preview.bytes} 字节</p>
          <p>{preview.file_scope}</p>
          <ul className="list-clear-targets">{preview.items.map(item=><li key={item.article_id}><strong>{item.title}</strong><br/><code>{item.article_id}</code> · {item.state}
            {item.files.length>0&&<details><summary>本站文件范围（{item.files.length}）</summary><ul>{item.files.map(file=><li key={file.key}><code>{file.key}</code> · {file.size} 字节</li>)}</ul></details>}
          </li>)}</ul>
          <p>{preview.retained_metadata}</p>
          {preview.state==='deleting'&&<p role="status">原操作尚未完成。文章已封锁，继续只处理原快照。</p>}
          {preview.state==='needs_verification'&&<p role="status">检测到本站文件残留，尚未确认清净。再次确认后只清理与原快照身份完全相同的文件；未知或变化文件会暂停。</p>}
          <label className="delete-check"><input type="checkbox" checked={ack} disabled={busy} onChange={event=>setAck(event.target.checked)}/>我已核对账号、范围、完整文章ID和文件清单，明确确认不可恢复的永久删除</label>
        </>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>关闭预览</AlertDialogCancel>
          {preview?.state==='previewed'&&<button className="secondary" type="button" disabled={busy||disabled} onClick={()=>run('cancel')}>取消未确认预览</button>}
          <button className="secondary" type="button" disabled={busy||disabled} onClick={()=>run('read')}>回读原操作</button>
          <button type="button" disabled={!ack||busy||disabled||!['previewed','deleting','needs_verification'].includes(preview?.state||'')} onClick={()=>run('confirm')}>{busy?'处理中…':preview?.state==='needs_verification'?'确认清理原快照残留':preview?.state==='deleting'?'确认继续原操作':'确认永久删除上述快照'}</button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
