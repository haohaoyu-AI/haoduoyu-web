'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {readDailyNdjson} from './daily-run-stream';

type Output = {source: string; article?: {title: string; paragraphs: string[]}; text?: string | null; partial_text?: string | null; error?: string};
type WriterView = {item_id: string | null; state: string; attempt_state: string; outcome: string; output: Output | null};
type View = {state: string; run_id?: string; input_hash?: string; snapshot?: {model: string; prompt_version: string}; writers?: {xiaoyu: WriterView; claude: WriterView}};
const statusNames: Record<string, string> = {not_requested: '尚未请求', requested: '请求已预占，等待读取结果', completed: '原稿已冻结', failed: '请求停止，只读恢复', outcome_unknown: '结果未知，只读恢复'};
async function readJson<T>(response: Response): Promise<T> {
 if (!response.ok) throw Error(response.status === 401 ? '请使用本人 ChatGPT 账号登录' : '本次结果未确认，请只刷新状态');
 return response.json();
}
export default function StepwiseTextRun() {
 const [view, setView] = useState<View | null>(null), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
 const [attempted, setAttempted] = useState(false);
 const lock = useRef(false), mounted = useRef(true), sequence = useRef(0);
 const refresh = useCallback(async () => {
  const current = ++sequence.current;
  const next = await readJson<View>(await fetch('/api/writing/stepwise-text', {cache: 'no-store'}));
  if (mounted.current && current === sequence.current) setView(next);
 }, []);
 useEffect(() => {
  mounted.current = true;
  const read = () => {void refresh().catch(() => {if (mounted.current) setFeedback('本次状态暂未读到，请只读刷新');});};
  read(); window.addEventListener('online', read);
  return () => {mounted.current = false; window.removeEventListener('online', read);};
 }, [refresh]);
 async function execute(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (lock.current || attempted) return;
  const form = event.currentTarget, data = new FormData(form);
  if (data.get('confirm') !== 'on') {setFeedback('本步骤需要用户明确确认'); return;}
  lock.current = true; setBusy(true); setAttempted(true); setFeedback('正在执行本次唯一请求，连接中断后只读恢复');
  const payload = {run_id: String(data.get('run_id') || ''), item_id: String(data.get('item_id') || ''), token: String(data.get('token') || ''), expected_model: String(data.get('expected_model') || ''), confirm: true};
  // Clear the form credential immediately; payload remains only in this request's memory.
  const tokenField = form.elements.namedItem('token'); if (tokenField instanceof HTMLInputElement) tokenField.value = '';
  try {
   const response = await fetch('/api/claude/stepwise-text-run', {method: 'POST', headers: {'content-type': 'application/json', 'x-xiaoyu-stepwise-text-run': '1'}, body: JSON.stringify(payload)});
   if (!response.ok) {await readJson(response); return;}
   if (!response.body) throw Error('连接结果未知');
   const result = await readDailyNdjson(response.body, event => {if (mounted.current && event.type === 'running') setFeedback('Claude 请求处理中，等待读取冻结原稿');});
   if (mounted.current) setFeedback(result.success ? 'Claude 纯文字原稿已冻结；等待用户确认后制作无图Word' : '本次请求已停止，请只读查看实际结果');
  } catch {if (mounted.current) setFeedback('连接结果未确认，请只刷新状态，不能重试');}
  finally {payload.token = ''; lock.current = false; if (mounted.current) setBusy(false); await refresh().catch(() => {});}
 }
 const claude = view?.writers?.claude, canRequest = view?.state === 'frozen' && claude?.attempt_state === 'not_requested' && claude.state === 'stepwise_claimed';
 return <main className="mx-auto max-w-3xl p-6 space-y-6">
  <h1 className="text-2xl font-bold">本次逐步确认 · 无图文字测试</h1>
  <p>创建、认领和保存由主线程按用户确认分步执行。此页只执行已认领 Claude 的一次写作请求。原稿冻结后等待下一次确认制作无图 Word。</p>
  <button type="button" disabled={busy} onClick={() => {void refresh().catch(() => setFeedback('状态未确认，请稍后只读刷新'));}}>只刷新本次状态</button>
  <p role="status" aria-live="polite">{feedback}</p>
  <p>批次：{view?.run_id || '尚未创建'}；模型：{view?.snapshot?.model || '待冻结'}；版本：{view?.snapshot?.prompt_version || '待冻结'}</p>
  <form onSubmit={execute} autoComplete="off" className="space-y-3">
   <label className="block">批次标识<input name="run_id" required defaultValue={view?.run_id || ''} key={view?.run_id || 'empty-run'} className="block w-full border p-2" /></label>
   <label className="block">Claude 原稿标识<input name="item_id" required defaultValue={claude?.item_id || ''} key={claude?.item_id || 'empty-item'} className="block w-full border p-2" /></label>
   <label className="block">一次性认领凭证<input name="token" type="password" required autoComplete="off" className="block w-full border p-2" /></label>
   <label className="block">冻结模型<input name="expected_model" required defaultValue={view?.snapshot?.model || ''} key={view?.snapshot?.model || 'empty-model'} className="block w-full border p-2" /></label>
   <label className="block"><input name="confirm" type="checkbox" required />用户已明确确认这一步：Claude 一次请求，最多14000输出tokens、300秒，不重试，无图、无平台投递。</label>
   <button type="submit" disabled={busy || attempted || !canRequest}>执行 Claude 本次唯一请求</button>
  </form>
  {(['xiaoyu', 'claude'] as const).map(writer => {
   const row = view?.writers?.[writer], output = row?.output;
   return <section key={writer} className="border rounded p-4 space-y-2">
    <h2 className="font-bold">{writer === 'xiaoyu' ? '小鱼 · agent_text' : 'Claude · provider_text'}</h2>
    <p>{row ? statusNames[row.outcome] || row.state : '尚未认领'}</p>
    {output?.error && <p>{output.error}</p>}
    {output?.article ? <article><h3 className="font-bold">{output.article.title}</h3>{output.article.paragraphs.map((paragraph, index) => <p key={index} className="my-3 whitespace-pre-wrap">{paragraph}</p>)}</article> : output?.partial_text ? <pre className="whitespace-pre-wrap">{output.partial_text}</pre> : output?.text ? <pre className="whitespace-pre-wrap">{output.text}</pre> : null}
   </section>;
  })}
 </main>;
}
