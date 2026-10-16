'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import type {Article, Source} from '../lib/editorial-contract';
import StudioNav from './studio-nav';

type Progress = {phase: string; state: string; note: string; at: string};
export type EditorialRequestView = {
 request_id: string; state: string; dispatch_state: string; flow_id: string | null;
 progress: Progress[]; article: Article | null; sources: Source[]; final_sha256: string | null;
 error: string | null; created: string; topic?: string; angle?: string;
 model?: string; prompt_version?: string; max_output_tokens?: number;
};
type HistoryItem = {request_id: string; state: string; created?: string; topic?: string; article?: Article | null};
export type EditorialRequestSummary = {
 configured: boolean; model: string; prompt_version: string; max_provider_requests: 4;
 max_output_tokens: number | null; connected: boolean; current: EditorialRequestView | null; items: HistoryItem[];
};
const endpoint = '/api/writing/editorial-request';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const phaseLabels: Record<string, string> = {
 preparation: '选题与公开资料', research: '选题与公开资料', topic: '选题与公开资料', coordination: '写作协作',
 outline: '框架', outline_review: '独立框架审稿', body: '完整正文',
 structure_review: '独立结构审稿', structure_revision: '主笔结构修订',
 fact_check: '独立全文事实核查', fact_revision: '主笔事实修订',
 final_verify: '独立最终全文复核', verified: '全文复核', frozen: '历史冻结成稿', text_saved: '网站文字稿已完成',
 dispatch: '图文与私人草稿交接', dispatching: '图文与私人草稿交接', submitted: '图文与私人草稿交接',
};
const terminalStates = new Set(['text_saved', 'frozen', 'failed', 'cancelled', 'paused', 'archived', 'expired', 'submitted', 'dispatch_unknown', 'content_blocked', 'content_invalid', 'technical_failed', 'verification_failed', 'outline_needs_revision']);
export function isEditorialRequestTerminal(state: string) {return terminalStates.has(state);}
function object(value: unknown): value is Record<string, unknown> {return !!value && typeof value === 'object' && !Array.isArray(value);}
function article(value: unknown): value is Article {return object(value) && typeof value.title === 'string' && Array.isArray(value.paragraphs) && value.paragraphs.every(p => typeof p === 'string');}
function validRequest(value: unknown): value is EditorialRequestView {
 return object(value) && typeof value.request_id === 'string' && uuid.test(value.request_id) && typeof value.state === 'string' && typeof value.dispatch_state === 'string' &&
  (value.flow_id === null || typeof value.flow_id === 'string') && Array.isArray(value.progress) && value.progress.every(p => object(p) && ['phase', 'state', 'note', 'at'].every(key => typeof p[key] === 'string')) &&
  (value.article === null || article(value.article)) && Array.isArray(value.sources) && value.sources.every(s => object(s) && typeof s.title === 'string' && typeof s.url === 'string') &&
  (value.final_sha256 === null || typeof value.final_sha256 === 'string') && (value.error === null || typeof value.error === 'string') && typeof value.created === 'string';
}
function validSummary(value: unknown): value is EditorialRequestSummary {
 return object(value) && typeof value.configured === 'boolean' && typeof value.model === 'string' && typeof value.prompt_version === 'string' && value.max_provider_requests === 4 &&
  (value.max_output_tokens === null || (typeof value.max_output_tokens === 'number' && Number.isSafeInteger(value.max_output_tokens) && value.max_output_tokens > 0)) &&
  typeof value.connected === 'boolean' && (value.current === null || validRequest(value.current)) && Array.isArray(value.items) && value.items.every(item => object(item) && typeof item.request_id === 'string' && uuid.test(item.request_id) && typeof item.state === 'string');
}
function safeMessage(error: unknown) {
 const message = error instanceof Error ? error.message : '';
 return message && message.length <= 500 && !/[{}]|\bBearer\s|-----BEGIN|SQLITE_|D1_ERROR|\n\s*at\s|(?:api[_-]?key|access[_-]?token|password|credential)\s*[:=]/i.test(message) && message !== 'Failed to fetch'
  ? message : '进度暂未确认，请稍后只读刷新';
}
function safeSourceUrl(value: string) {
 try {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' || !url.hostname.includes('.')) return null;
  for (const key of url.searchParams.keys()) if (/^(?:token|key|secret|password|auth|authorization|apikey|accesstoken|session|signature|credential)$/i.test(key.replace(/[-_]/g, ''))) return null;
  return url.href;
 } catch {return null;}
}
function statusLabel(state: string) {
 const labels: Record<string, string> = {
  queued: '任务待执行，等待小鱼接手', claimed: '任务已被接手', failed: '本次未完成，已停止', cancelled: '已取消后续推进', paused: '已暂停，后续推进已停止', archived: '已归档，只读查看历史结果', expired: '委托已到期，未继续推进',
  verified: '独立全文复核已通过，等待保存文字稿', frozen: '历史成稿已冻结，自动图文已关闭', text_saved: '网站文字稿已完成', dispatching: '成稿交接中', submitted: '已交给图文与私人草稿流程',
  dispatch_unknown: '成稿交接结果待核验', content_blocked: '材料或内容阻断，本次停止', content_invalid: '实际输出未通过内容检查，本次停止',
  technical_failed: '技术请求未完成，本次停止', verification_failed: '独立最终全文复核未通过，本次停止', outline_needs_revision: '框架需修改；现有四阶段冻结授权不含框架修订，正文与新增收费已停止',
 };
 return labels[state] || (phaseLabels[state] ? `当前环节：${phaseLabels[state]}` : '状态待核验');
}
function progressLabel(state: string) {
 return ({claimed: '已接手，尚未请求', requested: '已发出请求，等候实际回执', in_progress: '实际执行中', completed: '已完成', skipped: '无待改项，保留同一全文', retained: '无待改项，保留同一全文', pending: '尚未执行', not_started: '尚未执行', queued: '等待接手', blocked: '阻断，停止推进', failed: '未完成', technical_failed: '技术请求未完成', content_invalid: '内容检查未通过', content_blocked: '材料或内容阻断', pass: '已通过', verified: '已通过', frozen: '已冻结', text_saved: '文字稿已完成', submitted: '已交接'} as Record<string, string>)[state] || '状态待核验';
}
const activeStates = new Set(['queued', 'claimed', ...Object.keys(phaseLabels)]);
function canPoll(state: string) {return activeStates.has(state) && !isEditorialRequestTerminal(state);}

export function EditorialRequestResult({request}: {request: EditorialRequestView}) {
 const frozen = !!request.article && !!request.final_sha256;
 return <section className="writing-current space-y-4" aria-label="本次自动写作任务">
  <h2>{request.article?.title || request.topic || '本次自动写作任务'}</h2>
  <p role="status">{statusLabel(request.state)}</p>
  {request.state === 'queued' && <p>{request.dispatch_state === 'accepted' ? '任务已被接收，尚无接手或写作结果。' : '任务已保存，仍待执行。此时尚未开始模型写作。'}</p>}
  {request.state === 'claimed' && <p>已确认接手。下方仅显示已经登记的实际结果。</p>}
  {request.error && <p className="error" role="alert">{safeMessage(new Error(request.error))}</p>}
  <p className="metadata break-all">任务标识：{request.request_id}</p>
  {request.model && request.prompt_version && <p className="metadata">本篇冻结模型：{request.model} · 完整提示词：{request.prompt_version}{request.max_output_tokens ? ` · 单次输出上限：${request.max_output_tokens} tokens` : ''}</p>}
  {request.progress.length > 0 && <section aria-label="已记录的实际进度">
   <h3>实际进度</h3>
   <ol className="space-y-3">{request.progress.map((step, index) => <li key={`${step.phase}-${index}`} data-request-phase={step.phase}>
    <strong>{phaseLabels[step.phase] || '已记录环节'}</strong> · {progressLabel(step.state)}
    {step.note && <p>{step.note}</p>}
   </li>)}</ol>
  </section>}
  {frozen && <section aria-label="冻结成稿完整正文">
   <h3>冻结成稿</h3>
   <article className="article-body"><h4 className="whitespace-pre-wrap">{request.article!.title}</h4>{request.article!.paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-wrap" data-paragraph={index + 1}>{paragraph}</p>)}</article>
   <p className="metadata break-all">成稿 SHA-256：{request.final_sha256}</p>
  </section>}
  {!frozen && request.article && <p role="alert">成稿冻结记录尚未确认，暂不展示为最终稿。</p>}
  {request.sources.length > 0 && <details className="sources"><summary>公开资料来源</summary><ul>{request.sources.map((source, index) => {
   const href = safeSourceUrl(source.url);
   return <li key={index}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{source.title}</a> : <span>{source.title}（链接不可用）</span>}{source.published && <span> · 发布：{source.published}</span>}{source.event_date && <span> · 事件：{source.event_date}</span>}{source.accessed && <span> · 查阅：{source.accessed}</span>}{source.context && <p>{source.context}</p>}</li>;
  })}</ul></details>}
 </section>;
}

/** Read-only progress for already-authorized tasks; opening this page never starts work. */
export default function EditorialRequest({ownerScope}: {ownerScope: string}) {
 const [snapshot, setSnapshot] = useState<{owner: string; summary: EditorialRequestSummary} | null>(null);
 const [reading, setReading] = useState(false), [loaded, setLoaded] = useState(false), [authRequired, setAuthRequired] = useState(false);
 const [error, setError] = useState('');
 const mounted = useRef(false), sequence = useRef(0), readLock = useRef<number | null>(null);
 const selectedId = useRef<string | null>(null), invalidSelection = useRef(false);
 const controllers = useRef(new Set<AbortController>());
 const summary = snapshot?.owner === ownerScope ? snapshot.summary : null;
 const current = summary?.current || null;
 const read = useCallback(async () => {
  if (readLock.current !== null || invalidSelection.current || !mounted.current) return;
  const currentSequence = ++sequence.current, id = selectedId.current;
  readLock.current = currentSequence; setReading(true);
  const controller = new AbortController(); controllers.current.add(controller);
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
   const query = id ? `?${new URLSearchParams({request_id: id})}` : '';
   const response = await fetch(`${endpoint}${query}`, {method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal});
   if (response.status === 401 || response.status === 403) throw Object.assign(new Error('请使用本人 ChatGPT 账号登录并核对权限'), {authRequired: true});
   let data: unknown; try {data = await response.json();} catch {throw Error('响应尚未确认，请稍后只读刷新');}
   if (!response.ok) throw Error(object(data) && typeof data.error === 'string' ? safeMessage(new Error(data.error)) : '进度暂未确认，请稍后只读刷新');
   if (!validSummary(data) || (id && data.current?.request_id !== id)) throw Error('任务状态无法核验，请只读刷新同一任务');
   if (!mounted.current || currentSequence !== sequence.current) return;
   setSnapshot({owner: ownerScope, summary: data}); setAuthRequired(false); setError('');
  } catch (failure) {
   if (!mounted.current || currentSequence !== sequence.current) return;
   if (failure instanceof Error && 'authRequired' in failure) {setSnapshot(null); setAuthRequired(true);}
   setError(controller.signal.aborted ? '连接超时或中断，进度尚未确认，请稍后只读刷新' : safeMessage(failure));
  } finally {
   window.clearTimeout(timeout); controllers.current.delete(controller);
   if (readLock.current === currentSequence) readLock.current = null;
   if (mounted.current && currentSequence === sequence.current) {setReading(false); setLoaded(true);}
  }
 }, [ownerScope]);
 const refreshLocation = useCallback(() => {
  const queryId = new URLSearchParams(window.location.search).get('request_id');
  const invalid = queryId !== null && !uuid.test(queryId), id = invalid ? null : queryId;
  if (id !== selectedId.current || invalid !== invalidSelection.current) {
   sequence.current++; for (const controller of controllers.current) controller.abort(); readLock.current = null;
   selectedId.current = id; invalidSelection.current = invalid;
   setSnapshot(null); setReading(false); setLoaded(false); setAuthRequired(false); setError('');
  }
  if (invalid) {setLoaded(true); setError('任务标识无效，无法读取这条进度'); return;}
  void read();
 }, [read]);
 useEffect(() => {
  mounted.current = true;
  const activeControllers = controllers.current;
  const invalidate = () => {sequence.current++;};
  selectedId.current = null; invalidSelection.current = false; readLock.current = null;
  const timer = window.setTimeout(() => {
   setSnapshot(null); setReading(false); setLoaded(false); setAuthRequired(false); setError('');
   refreshLocation();
  }, 0);
  return () => {mounted.current = false; window.clearTimeout(timer); invalidate(); for (const controller of activeControllers) controller.abort();};
 }, [ownerScope, refreshLocation]);
 useEffect(() => {
  if (authRequired || reading || !current || !canPoll(current.state)) return;
  const timer = window.setTimeout(() => void read(), 10000);
  return () => window.clearTimeout(timer);
 }, [authRequired, current, error, read, reading]);
 useEffect(() => {
  window.addEventListener('pageshow', refreshLocation); window.addEventListener('focus', refreshLocation); window.addEventListener('popstate', refreshLocation);
  return () => {window.removeEventListener('pageshow', refreshLocation); window.removeEventListener('focus', refreshLocation); window.removeEventListener('popstate', refreshLocation);};
 }, [refreshLocation]);
 return <main className="studio-main writing-page">
  <StudioNav current="writing" />
  <div className="topics-heading"><div><h2>自动写作进度</h2><p className="section-hint">已授权的自动或单次写作任务在这里显示实际进度与结果。</p></div><a className="action-link" href="/writing">返回写作台</a></div>
  {!loaded && <p role="status">正在读取已有任务进度…</p>}
  {error && <p className="error" role="alert">{error}{summary ? '；下方保留此前读取的实际记录，进度尚未更新' : ''}</p>}
  {authRequired && <p><a href="/signin-with-chatgpt?return_to=%2Fwriting%2Feditorial-run" target="_top">使用本人账号登录</a></p>}
  {!authRequired && <>
   {current && <EditorialRequestResult request={current} />}
   {summary && !current && loaded && <p className="section-hint">{summary.items.length ? '已有任务状态暂无法核验，可只读查看最近任务记录。' : '没有正在执行的自动写作任务，已有授权任务执行时这里显示进度。'}</p>}
   {loaded && <div className="article-actions"><button className="secondary" type="button" disabled={reading} onClick={refreshLocation}>{reading ? '读取中…' : '刷新状态'}</button></div>}
   {!!summary?.items.length && <details className="writing-fold"><summary>最近自动写作任务</summary><ul>{summary.items.map(item => <li key={item.request_id}><a href={`/writing/editorial-run?request_id=${encodeURIComponent(item.request_id)}`}>{item.article?.title || item.topic || '自动写作任务'}</a> · {statusLabel(item.state)}</li>)}</ul></details>}
  </>}
 </main>;
}
