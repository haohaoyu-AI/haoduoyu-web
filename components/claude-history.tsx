'use client';
import {useRef, useState} from 'react';
export default function ClaudeHistory() {
 const [busy, setBusy] = useState(false), [result, setResult] = useState('');
 const lock = useRef(false);
 async function read(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (lock.current) return;
  lock.current = true; setBusy(true);
  const form = new FormData(event.currentTarget);
  try {
   const query = new URLSearchParams({day: String(form.get('day')), scope: String(form.get('scope'))});
   const response = await fetch('/api/claude/history?' + query);
   setResult(JSON.stringify(await response.json(), null, 2));
  } catch {setResult('历史结果暂不可读；未发起模型调用。');}
  finally {lock.current = false; setBusy(false);}
 }
 async function probe() {
  if (lock.current) return; lock.current = true; setBusy(true); setResult('正在检测服务器连接；不调用模型。');
  try {
   const response = await fetch('/api/claude/transport-probe');
   if (!response.ok || !response.body) throw Error('unavailable');
   const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', completed = false;
   for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    buffer += decoder.decode(value, {stream: true});
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
     const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (!line.trim()) continue;
     const item = JSON.parse(line); completed ||= item.state === 'completed';
     setResult(item.state === 'completed' ? '310秒连接检测完成；没有调用模型。' : `连接保持中 · ${item.elapsed}秒；没有调用模型。`);
    }
   }
   if (!completed) throw Error('incomplete');
  } catch {setResult('连接检测中断；没有调用模型，也不会自动重试。');}
  finally {lock.current = false; setBusy(false);}
 }
 return <main><h1>Claude 历史结果</h1><p>旧短连接生成和重试入口已停用。这里只读取已有结果；未知结果不会被重新生成。</p>
  <form onSubmit={read}><label>日期<input name="day" type="date" required disabled={busy}/></label>
   <label>记录范围<select name="scope" disabled={busy}><option value="v2_rewrite">旧V2重写</option><option value="workflow_test">旧写文测试</option><option value="explicit_test_retry">旧测试重试</option><option value="extended_test_retry">旧长文测试</option><option value="v2_confirmed_retry">旧V2确认重试</option><option value="daily">每日写作</option></select></label>
   <button disabled={busy}>读取已有结果（不调用模型）</button></form>
  <p><a href="/writing">返回写文页</a> · 新请求须使用已授权的服务器长连接表单。</p>
  <button type="button" onClick={probe} disabled={busy}>检测310秒长连接（不调用模型）</button>
  <pre role="status" style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'}}>{result}</pre></main>;
}
