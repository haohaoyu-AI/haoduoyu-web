'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {readDailyNdjson, type DailyStreamEvent} from './daily-run-stream';
import StudioNav from './studio-nav';

export type EditorialV3PaidArgs = {
 run_id: string; stage_id: string; token: string; expected_model: string;
 expected_input_sha256: string; confirm: true;
};
type PublicRun = {
 run_id: string; state: string; writer: string; writer_kind: string; round: number;
 snapshot_sha256: string; control_state: string; final_sha256: string | null;
 current_version: {article: {title: string; paragraphs: string[]}; sha256: string; version?: number} | null;
 stages: Record<string, unknown> | unknown[]; artifacts: Record<string, unknown> | unknown[];
};
type HelperAPI = {
 runPaidStage: (args: EditorialV3PaidArgs) => Promise<DailyStreamEvent>;
 readRun: (runId: string) => Promise<PublicRun>;
};
declare global {interface Window {xiaoyuEditorialV3?: HelperAPI;}}

const unknownResult = '结果待核验；请只读读取同一阶段收据，不要重复付费请求';
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function object(value: unknown): value is Record<string, unknown> {return !!value && typeof value === 'object' && !Array.isArray(value);}
function safeMessage(error: unknown, secret = '') {
 const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
 return message && !/\bBearer\s|-----BEGIN|SQLITE_|D1_ERROR|\n\s*at\s|sk-[a-z0-9_-]{16}/i.test(message) && (!secret || !message.includes(secret)) && message !== 'Failed to fetch'
  ? message.slice(0, 500) : unknownResult;
}
function paidArgs(value: unknown): value is EditorialV3PaidArgs {
 if (!object(value)) return false;
 const fields = ['run_id', 'stage_id', 'token', 'expected_model', 'expected_input_sha256', 'confirm'];
 return Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key)) &&
  uuid(value.run_id) && typeof value.stage_id === 'string' && /^[a-z0-9_:-]{1,120}$/i.test(value.stage_id) && uuid(value.token) &&
  typeof value.expected_model === 'string' && value.expected_model.trim().length > 0 && value.expected_model.length <= 120 &&
  typeof value.expected_input_sha256 === 'string' && /^[a-f0-9]{64}$/i.test(value.expected_input_sha256) && value.confirm === true;
}
function validView(value: unknown, id: string): value is PublicRun {
 if (!object(value)) return false;
 const version = value.current_version;
 const validVersion = version === null || (object(version) && typeof version.sha256 === 'string' && object(version.article) &&
  typeof version.article.title === 'string' && Array.isArray(version.article.paragraphs) && version.article.paragraphs.every(paragraph => typeof paragraph === 'string'));
 return object(value) && value.run_id === id && typeof value.state === 'string' && typeof value.snapshot_sha256 === 'string' &&
  typeof value.control_state === 'string' && typeof value.writer === 'string' && typeof value.writer_kind === 'string' &&
  typeof value.round === 'number' && Number.isFinite(value.round) && validVersion &&
  (typeof value.final_sha256 === 'string' || value.final_sha256 === null) &&
  (object(value.stages) || Array.isArray(value.stages)) && (object(value.artifacts) || Array.isArray(value.artifacts));
}
async function jsonResponse(response: Response) {
 if (response.status === 401 || response.status === 403) throw Object.assign(Error('请使用本人 ChatGPT 账号重新登录并核对权限'), {authRequired: true});
 let value: unknown;
 try {value = await response.json();} catch {throw Error(unknownResult);}
 if (!response.ok) throw Error(object(value) && typeof value.error === 'string' ? safeMessage(value.error) : unknownResult);
 return value;
}

export default function EditorialV3Helper({ownerScope = 'current-account'}: {ownerScope?: string}) {
 const [view, setView] = useState<PublicRun | null>(null), [feedback, setFeedback] = useState('等待助手传入本次已授权阶段');
 const [active, setActive] = useState<{run_id: string; stage_id: string; seconds: number} | null>(null);
 const [inputRun, setInputRun] = useState(''), [inputStage, setInputStage] = useState(''), [inputToken, setInputToken] = useState('');
 const [inputModel, setInputModel] = useState(''), [inputHash, setInputHash] = useState(''), [confirmed, setConfirmed] = useState(false);
 const mounted = useRef(false), selection = useRef(''), generation = useRef(0), locked = useRef(false), authRequired = useRef(false);
 const attempted = useRef(new Set<string>()), connection = useRef<AbortController | null>(null);
 const helper = useRef<HelperAPI | null>(null);

 const readRun = useCallback(async (runId: string) => {
  if (!uuid(runId)) throw Error('批次参数无效');
  const value = await jsonResponse(await fetch(`/api/claude/editorial-v3-run?run_id=${encodeURIComponent(runId)}`, {cache: 'no-store'}));
  if (!validView(value, runId)) throw Error(unknownResult);
  return value;
 }, []);

 useEffect(() => {
  mounted.current = true;
  const displayRead = async (id: string, ticket: number) => {
   try {
    const next = await readRun(id);
    if (mounted.current && ticket === generation.current && selection.current === id) {setView(next); setFeedback('已读取本批次确切记录');}
   } catch (error) {
    if (!mounted.current || ticket !== generation.current) return;
    if (object(error) && error.authRequired) {authRequired.current = true; setView(null); setInputToken(''); setConfirmed(false);}
    setFeedback(safeMessage(error));
   }
  };
  const navigate = () => {
   generation.current++; connection.current?.abort(); connection.current = null;
   setActive(null); setView(null); setInputToken(''); setConfirmed(false);
   const id = new URLSearchParams(window.location.search).get('run_id') || '';
   selection.current = id; setInputRun(id);
   if (id) void displayRead(id, generation.current);
  };
  const api: HelperAPI = {
   readRun,
   async runPaidStage(args) {
    if (!mounted.current || authRequired.current) throw Error('请使用本人 ChatGPT 账号重新登录并核对权限');
    if (!paidArgs(args)) throw Error('需要本次真实认领凭证、动态阶段、模型、输入 hash 与明确授权');
    const key = `${ownerScope}:${args.run_id}:${args.stage_id}`;
    if (locked.current || attempted.current.has(key)) throw Error('本阶段已请求或正在请求；只读核验，不重复付费');
    locked.current = true; attempted.current.add(key);
    const ticket = ++generation.current, abort = new AbortController();
    connection.current = abort; selection.current = args.run_id;
    setView(null); setActive({run_id: args.run_id, stage_id: args.stage_id, seconds: 0}); setFeedback('已连接本次真实 Claude 阶段，等候确切收据');
    const current = () => mounted.current && ticket === generation.current && selection.current === args.run_id;
    try {
     const response = await fetch('/api/claude/editorial-v3-run', {
      method: 'POST', headers: {'content-type': 'application/json', accept: 'application/x-ndjson', 'x-xiaoyu-editorial-v3-run': '1'},
      body: JSON.stringify(args), signal: abort.signal,
     });
     if (!response.ok) {await jsonResponse(response); throw Error(unknownResult);}
     if (!response.body || !response.headers.get('content-type')?.startsWith('application/x-ndjson')) throw Error(unknownResult);
     const terminal = await readDailyNdjson(response.body, event => {
      if (event.run_id !== args.run_id || event.stage_id !== args.stage_id) throw Error('长连接阶段绑定无法核验；只读核验，不重复付费');
      if (current() && event.type === 'running' && typeof event.seconds === 'number' && Number.isFinite(event.seconds)) setActive({run_id: args.run_id, stage_id: args.stage_id, seconds: Math.max(0, Math.floor(event.seconds))});
     });
     if (terminal.type !== 'terminal' || terminal.run_id !== args.run_id || terminal.stage_id !== args.stage_id || typeof terminal.success !== 'boolean' || typeof terminal.state !== 'string' || !/^[a-z_]{1,80}$/.test(terminal.state)) throw Error(unknownResult);
     const result: DailyStreamEvent = {type: 'terminal', terminal: true, run_id: args.run_id, stage_id: args.stage_id,
      success: terminal.success === true && terminal.state === 'completed', state: terminal.state, cached: terminal.cached === true,
      error: typeof terminal.error === 'string' ? safeMessage(terminal.error, args.token) : undefined};
     if (mounted.current) {setInputToken(''); setConfirmed(false);}
     if (current()) {
      setFeedback(result.success ? '本阶段确切产物已保存；下一阶段由助手按实际问题单推进' : safeMessage(result.error, args.token));
      try {const next = await readRun(args.run_id); if (current()) setView(next);} catch (error) {if (current()) setFeedback(safeMessage(error, args.token));}
     }
     return result;
    } catch (error) {
     if (current()) {
      if (object(error) && error.authRequired) {authRequired.current = true; setView(null);}
      setFeedback(safeMessage(error, args.token));
     }
     throw Error(safeMessage(error, args.token));
    } finally {
     locked.current = false;
     if (connection.current === abort) connection.current = null;
     if (mounted.current) {setInputToken(''); setConfirmed(false);}
     if (current()) setActive(null);
    }
   },
  };
  helper.current = api; window.xiaoyuEditorialV3 = api;
  const initial = window.setTimeout(navigate, 0);
  window.addEventListener('popstate', navigate); window.addEventListener('pageshow', navigate);
  return () => {
   mounted.current = false; selection.current = '';
   connection.current?.abort(); connection.current = null;
   if (helper.current === api) helper.current = null;
   window.clearTimeout(initial); window.removeEventListener('popstate', navigate); window.removeEventListener('pageshow', navigate);
   if (window.xiaoyuEditorialV3 === api) delete window.xiaoyuEditorialV3;
  };
 }, [ownerScope, readRun]);

 return <main className="writing-shell space-y-5">
  <StudioNav current="writing" />
  <h1>动态编辑流水线 · 长连接执行进度</h1>
  <p>助手使用本次真实认领凭证执行必要的 Claude 主笔阶段。小鱼主笔与独立审稿由助手通过 MCP 保存真实执行结果。</p>
  <form autoComplete="off" className="space-y-3" aria-label="助手专用已授权阶段入口" onSubmit={async event => {
   event.preventDefault();
   if (locked.current) return;
   const value = {run_id: inputRun.trim(), stage_id: inputStage.trim(), token: inputToken.trim(), expected_model: inputModel.trim(), expected_input_sha256: inputHash.trim(), confirm: confirmed};
   try {
    if (!paidArgs(value) || !helper.current) throw Error('请核验本次授权，并填写真实认领返回的批次、动态阶段、凭证、模型与输入 hash');
    await helper.current.runPaidStage(value);
   } catch (error) {if (mounted.current) setFeedback(safeMessage(error, inputToken));}
   finally {if (mounted.current) {setInputToken(''); setConfirmed(false);}}
  }}>
   <h2>助手专用已授权阶段入口</h2>
   <p>此入口供助手使用正常浏览器表单提交已有授权的真实阶段。公共写作台只显示进度与结果。</p>
   <label className="block">批次 run_id<input name="run_id" value={inputRun} onChange={event => setInputRun(event.target.value)} disabled={!!active} autoComplete="off" spellCheck={false} required className="block w-full" /></label>
   <label className="block">动态阶段 stage_id<input name="stage_id" value={inputStage} onChange={event => setInputStage(event.target.value)} disabled={!!active} autoComplete="off" spellCheck={false} required className="block w-full" /></label>
   <label className="block">本次认领凭证 token<input name="token" type="password" value={inputToken} onChange={event => setInputToken(event.target.value)} disabled={!!active} autoComplete="off" spellCheck={false} required className="block w-full" /></label>
   <label className="block">冻结模型 expected_model<input name="expected_model" value={inputModel} onChange={event => setInputModel(event.target.value)} disabled={!!active} autoComplete="off" spellCheck={false} required className="block w-full" /></label>
   <label className="block">输入 SHA-256 expected_input_sha256<input name="expected_input_sha256" value={inputHash} onChange={event => setInputHash(event.target.value)} disabled={!!active} autoComplete="off" spellCheck={false} required className="block w-full" /></label>
   <label className="block"><input name="confirm" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!!active} /> 助手已核验本人既有授权及本次真实认领，确认同一作者、模型和输入 hash</label>
   <button type="submit" disabled={!!active || !confirmed || !inputToken}>执行本次已认领 Claude 阶段</button>
   <p className="metadata">凭证只用于本次内存中的密码框与请求，执行结束或导航后清空，不写入网址、存储、日志或提示词。</p>
  </form>
  <p role="status">{feedback}</p>
  {active && <p className="metadata break-all">批次 {active.run_id} · 动态阶段 {active.stage_id}<br />长连接已等待 {active.seconds} 秒</p>}
  <p role="note">关闭、导航或断线只停止接收进度，不代表后台请求已经取消。失败或未知状态请读取同一收据，不重复付费。</p>
  {view && <section aria-label="动态批次确切结果" className="space-y-4">
   <p className="metadata break-all">批次 {view.run_id} · 状态 {view.state === 'text_saved' ? '文字稿已保存，已完成' : view.state} · 控制 {view.control_state}<br />主笔 {view.writer} · 来源 {view.writer_kind} · 轮次 {view.round}<br />快照 SHA-256：{view.snapshot_sha256}<br />最终 SHA-256：{view.final_sha256 || '尚未冻结'}</p>
   <details><summary>动态阶段确切记录</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify(view.stages, null, 2)}</pre></details>
   <details><summary>真实产物与执行身份</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify(view.artifacts, null, 2)}</pre></details>
   {view.current_version && <details><summary>当前完整正文与 hash</summary>
    <p className="metadata break-all">全文 SHA-256：{view.current_version.sha256}</p>
    <article className="article-body"><h2>{view.current_version.article.title}</h2>{view.current_version.article.paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}</article>
   </details>}
  </section>}
 </main>;
}
