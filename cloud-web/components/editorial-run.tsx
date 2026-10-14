'use client';

import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {editorialStages, type EditorialStage, type Article, type Source, type Fact} from '../lib/editorial-contract';
import {readDailyNdjson} from './daily-run-stream';
import StudioNav from './studio-nav';

export const stageLabels: Record<EditorialStage, string> = {
 outline: '1. 框架', outline_review: '2. 独立框架审稿', body: '3. 完整正文',
 structure_review: '4. 独立结构审稿', structure_revision: '5. 主笔结构修订',
 fact_check: '6. 独立全文事实核查', fact_revision: '7. 主笔事实修订', final_verify: '8. 独立最终全文复核',
};
const states: Record<string, string> = {
 claimed: '已认领，尚未执行', requested: '已请求，等待读取实际结果', completed: '已完成',
 technical_failed: '技术请求失败，只读核验', content_invalid: '实际输出未通过内容契约', content_blocked: '材料或内容阻断',
 outline_needs_revision: '框架需修改，本批次停止', verification_failed: '最终全文复核未通过',
 verified: '最终全文复核通过，待保存文字稿', text_saved: '网站文字稿已完成', frozen: '历史成稿已冻结，自动图文已关闭', dispatching: '图文交接中',
 submitted: '已交给配图和私人草稿流程', dispatch_unknown: '图文交接结果未知，只读核验',
 unknown: '状态待核验', active: '可见且可操作', paused: '已暂停', archived: '已归档',
};
export const paidStages: readonly EditorialStage[] = ['outline', 'body', 'structure_revision', 'fact_revision'];
const roles = ['writer', 'outline_reviewer', 'structure_reviewer', 'fact_checker', 'verifier'] as const;
type Role = typeof roles[number];
type Participant = {actor_id: string; model: string};
type StageView = {state: string; input_sha256: string; receipt_state: string | null; usage: unknown; error: string | null; diagnostic: Record<string, unknown> | null; requested_model: string | null; returned_model: string | null};
type Artifact = {artifact: Record<string, unknown>; sha256: string; input_sha256: string; actor_id: string; execution_id: string; model: string; provenance: string; receipt_id: string | null};
export type EditorialView = {
 run_id: string; article_id: string; state: string; snapshot_sha256: string;
 snapshot: {contract_version: 2; topic: string; angle: string; style_requirements: string; materials: string; model: string; prompt_version: string; sources: Source[]; facts: Fact[]; participants: Record<Role, Participant>; [key: string]: unknown};
 current_version: {article: Article; sha256: string; version: number} | null;
 stages: Partial<Record<EditorialStage, StageView>>; artifacts: Partial<Record<EditorialStage, Artifact>>;
 control_state: string; final_sha256: string | null; expires: string;
};
type HistoryItem = {run_id: string; title: string; state: string; control_state?: string};
type StageInput = {stage: EditorialStage; actor_id: string; model: string; input_article?: Article; [key: string]: unknown};
type HeldClaim = {run_id: string; stage: EditorialStage; token: string; expected_model: string; input_sha256: string};
type ClaimResponse = {claimed: boolean; read_only?: boolean; run_id: string; stage: EditorialStage; token?: string; expected_model?: string; input_sha256?: string; input?: StageInput};

export function createTemplate(promptVersion = '', model = '') {
 return {
  authorization_key: '', expected_model: model, expected_prompt_version: promptVersion,
  topic: '', angle: '', style_requirements: '', materials: '',
  sources: [
   {id: 'S1', title: '', url: '', published: '', event_date: '', accessed: '', context: ''},
   {id: 'S2', title: '', url: '', published: '', event_date: '', accessed: '', context: ''},
  ],
  facts: [{id: 'F1', text: '', source_ids: ['S1'], context: ''}],
  participants: Object.fromEntries(roles.map(role => [role, {actor_id: '', model: role === 'writer' ? model : ''}])),
 };
}
export const issueTemplate = {
 id: '', paragraph: 0, quote: '', type: 'structure', severity: 'medium', basis: '', revision_goal: '',
};
export function reviewTemplate(stage: EditorialStage, input?: StageInput) {
 if (stage === 'outline_review' || stage === 'structure_review') return {
  status: 'completed', decision: '填写 pass / revise / blocked', reason: '', issues: [],
 };
 const article = input?.input_article;
 return {
  status: 'completed', passed: false,
  coverage: article ? [article.title, ...article.paragraphs].map((quote, paragraph) => ({
   paragraph, quote, classification: '填写 fact / opinion / metaphor',
   verdict: '填写 confirmed / unconfirmed / contradicted / not_applicable', source_ids: [], source_dates: [], context: '',
  })) : [],
  issues: [], unconfirmed: [],
  checks: {paragraphs: false, names: false, numbers: false, metaphors: false, quote_time_context: false},
 };
}
export function canSkipRevision(view: EditorialView, stage: EditorialStage) {
 if (!['structure_revision', 'fact_revision'].includes(stage)) return false;
 const report = view.artifacts[stage === 'structure_revision' ? 'structure_review' : 'fact_check']?.artifact;
 return !!report && Array.isArray(report.issues) && report.issues.length === 0 &&
  (!Array.isArray(report.unconfirmed) || report.unconfirmed.length === 0) &&
  (stage === 'structure_revision' ? report.decision === 'pass' : report.passed === true);
}
export function stageStatus(view: EditorialView, stage: EditorialStage) {
 const step = view.stages[stage];
 if (step) return `${states[step.state] || step.state} (${step.state})`;
 return view.state === stage ? '当前阶段，尚未认领' : '尚未开始';
}
export function technicalNotice(view: EditorialView) {
 const timedOut = Object.values(view.stages).some(step => step?.diagnostic?.http_status === 524);
 if (timedOut) return '技术失败：中转站实际回执 HTTP 524。不能据此判断内容或审稿失败；只读核验，不重复付费请求。';
 if (view.state === 'technical_failed') return '技术请求未完成或模型回执不匹配。只读查看实际回执，不重复请求。';
 if (view.state === 'content_invalid') return '完整提供方回执已保存，但输出格式、字数、引用或内容契约未通过；这不代表技术请求失败或独立审稿通过。只读查看产物诊断，不重复付费请求。';
 if (view.state === 'content_blocked') return '内容阻断：独立审稿报告发现材料或内容问题。请阅读具体报告。';
 return '';
}
export function provenanceLabel(artifact: Artifact) {
 if (artifact.provenance === 'claude_provider_text' && artifact.receipt_id) return 'Claude 实际提供方文本';
 if (artifact.provenance === 'retained_writer_version' && !artifact.receipt_id) return '零待改项，保留同一主笔全文与 hash';
 return '独立执行结果，由本人确认身份';
}
function reviewRole(stage: EditorialStage): Role {
 return stage === 'outline_review' ? 'outline_reviewer' : stage === 'structure_review' ? 'structure_reviewer' : stage === 'fact_check' ? 'fact_checker' : 'verifier';
}
function object(value: unknown): value is Record<string, unknown> {return !!value && typeof value === 'object' && !Array.isArray(value);}
function validView(value: unknown): value is EditorialView {
 if (!object(value) || !object(value.snapshot) || !object(value.stages) || !object(value.artifacts)) return false;
 return typeof value.run_id === 'string' && typeof value.state === 'string' && typeof value.snapshot_sha256 === 'string' &&
  value.snapshot.contract_version === 2 && object(value.snapshot.participants) && (() => {
   const participants = value.snapshot.participants;
   return roles.every(role => {
   const actor = participants[role]; return object(actor) && typeof actor.actor_id === 'string' && typeof actor.model === 'string';
  });
  })();
}
function safeMessage(error: unknown) {
 const message = error instanceof Error ? error.message : '';
 return message && !/\bBearer\s|-----BEGIN|SQLITE_|D1_ERROR|\n\s*at\s/i.test(message) && message !== 'Failed to fetch'
  ? message.slice(0, 500) : '结果未能确认；请只读刷新已有记录，不重复模型请求';
}
async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
 if (response.status === 401 || response.status === 403) throw Object.assign(new Error('请使用本人 ChatGPT 账号登录并核对权限'), {authRequired: true});
 let value: unknown; try {value = await response.json();} catch {throw Error('响应无法核验；请只读刷新已有记录');}
 if (!response.ok) throw Error(object(value) && typeof value.error === 'string' ? value.error : '操作未确认；请只读刷新已有记录');
 if (!object(value)) throw Error('响应格式无法核验；请只读刷新已有记录');
 return value;
}
async function readRun(id: string): Promise<EditorialView> {
 const value = await jsonResponse(await fetch(`/api/writing/editorial-flow?run_id=${encodeURIComponent(id)}`, {cache: 'no-store'}));
 if (!validView(value) || value.run_id !== id) throw Error('批次读取无法核验；请只读刷新');
 return value;
}
export async function postEditorialAction(action: string, args: Record<string, unknown>) {
 return jsonResponse(await fetch('/api/writing/editorial-flow', {
  method: 'POST', headers: {'content-type': 'application/json', 'x-xiaoyu-editorial-flow': '1'},
  body: JSON.stringify({action, arguments: {...args, confirm: true}}),
 }));
}
function parseFormJson(text: string) {
 try {const result: unknown = JSON.parse(text); if (object(result)) return result;} catch { /* Show a local validation message. */ }
 throw Error('请填写完整的 JSON 对象');
}
function requireFilled(value: unknown): void {
 if (typeof value === 'string' && (!value.trim() || value.startsWith('填写 '))) throw Error('模板尚未填写完整；身份、来源和执行记录必须真实');
 if (Array.isArray(value)) value.forEach(requireFilled);
 else if (object(value)) Object.values(value).forEach(requireFilled);
}
function pretty(value: unknown) {return JSON.stringify(value, null, 2);}

// Only non-sensitive disclosure booleans are persisted. Claims and drafts stay in memory.
export function EditorialFold({scope, name, title, children}: {scope: string; name: string; title: string; children: ReactNode}) {
 const [open, setOpen] = useState(false), [ready, setReady] = useState(false);
 useEffect(() => {
  const timer = window.setTimeout(() => {
   let stored = false; try {stored = window.sessionStorage.getItem(`editorial-fold:${scope}:${name}`) === 'open';} catch { /* Optional browser storage. */ }
   setOpen(stored); setReady(true);
  }, 0);
  return () => window.clearTimeout(timer);
 }, [scope, name]);
 return <details className="writing-fold" open={open} onToggle={event => {
  if (!ready) return;
  const next = event.currentTarget.open; setOpen(next);
  try {window.sessionStorage.setItem(`editorial-fold:${scope}:${name}`, next ? 'open' : 'closed');} catch { /* Optional browser storage. */ }
 }}><summary>{title}</summary>{children}</details>;
}
export function EditorialRunResult({view, scope}: {view: EditorialView; scope: string}) {
 const notice = technicalNotice(view), finalMatches = !!view.final_sha256 && view.current_version?.sha256 === view.final_sha256;
 return <section aria-label="本批次确切结果" className="space-y-4">
  <h2>{view.snapshot.topic}</h2>
  <p>状态：{states[view.state] || stageLabels[view.state as EditorialStage] || view.state} ({view.state})；操作控制：{states[view.control_state] || view.control_state}</p>
  <p className="metadata break-all">批次 {view.run_id} · 文章 {view.article_id}<br />快照 SHA-256：{view.snapshot_sha256}<br />提示词版本：{view.snapshot.prompt_version} · 冻结模型：{view.snapshot.model}<br />本批次认领截止：{view.expires}</p>
  {notice && <p role="note">{notice}</p>}
  <ol className="space-y-4">{editorialStages.map(stage => {
   const step = view.stages[stage], artifact = view.artifacts[stage];
   return <li key={stage} data-editorial-stage={stage}>
    <h3>{stageLabels[stage]}</h3><p>{stageStatus(view, stage)}</p>
    {step && <p className="metadata break-all">输入 SHA-256：{step.input_sha256}；实际回执状态：{step.receipt_state || '没有提供方回执'}</p>}
    {step?.error && <p>{step.error}</p>}
    {artifact && <EditorialFold scope={scope} name={`artifact:${stage}`} title="确切完整产物与执行身份">
     <p>{provenanceLabel(artifact)}</p>
     <p className="metadata break-all">参与者：{artifact.actor_id}<br />执行：{artifact.execution_id}<br />登记模型：{artifact.model}<br />产物 SHA-256：{artifact.sha256}<br />来源标记：{artifact.provenance}<br />提供方回执：{artifact.receipt_id || '无'}</p>
     <pre className="whitespace-pre-wrap break-words">{pretty(artifact.artifact)}</pre>
    </EditorialFold>}
    {step && <EditorialFold scope={scope} name={`receipt:${stage}`} title="实际回执诊断与用量">
     <p>请求模型：{step.requested_model || '回执未记录'}；实际返回模型：{step.returned_model || '回执未记录'}</p>
     <pre className="whitespace-pre-wrap break-words">{pretty({receipt_state: step.receipt_state, usage: step.usage, diagnostic: step.diagnostic})}</pre>
    </EditorialFold>}
   </li>;
  })}</ol>
  {view.current_version && <EditorialFold scope={scope} name="full-text" title={finalMatches ? '冻结成稿 · 标题与完整正文' : '当前确切版本 · 标题与完整正文'}>
   <p className="metadata break-all">版本 {view.current_version.version} · SHA-256：{view.current_version.sha256}<br />冻结 SHA-256：{view.final_sha256 || '尚未冻结'}</p>
   {view.final_sha256 && !finalMatches && <p role="alert">冻结 hash 与当前全文不一致，不能作为冻结成稿使用。</p>}
   <article className="article-body"><h3 className="whitespace-pre-wrap">{view.current_version.article.title}</h3>{view.current_version.article.paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-wrap" data-paragraph={index + 1}>{paragraph}</p>)}</article>
  </EditorialFold>}
  <EditorialFold scope={scope} name="snapshot" title="冻结材料、来源、身份与完整提示词快照"><pre className="whitespace-pre-wrap break-words">{pretty(view.snapshot)}</pre></EditorialFold>
 </section>;
}

export default function EditorialRun({promptVersion = '', ownerScope = 'current-account'}: {promptVersion?: string; ownerScope?: string}) {
 const [view, setView] = useState<EditorialView | null>(null), [history, setHistory] = useState<HistoryItem[]>([]);
 const [runId, setRunId] = useState(''), [includeArchived, setIncludeArchived] = useState(false);
 const [createJson, setCreateJson] = useState(() => pretty(createTemplate(promptVersion)));
 const [createConfirmed, setCreateConfirmed] = useState(false), [paidConfirmed, setPaidConfirmed] = useState(false);
 const [reviewConfirmed, setReviewConfirmed] = useState(false), [finalRead, setFinalRead] = useState(false);
 const [reviewJson, setReviewJson] = useState(''), [actorId, setActorId] = useState(''), [executionId, setExecutionId] = useState(''), [reviewModel, setReviewModel] = useState('');
 const [input, setInput] = useState<StageInput | null>(null), [ownedStage, setOwnedStage] = useState<EditorialStage | null>(null);
 const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [authRequired, setAuthRequired] = useState(false), [reason, setReason] = useState('');
 const [freezeConfirmed, setFreezeConfirmed] = useState(false);
 const lock = useRef(false), mounted = useRef(true), selection = useRef(''), generation = useRef(0);
 const heldClaim = useRef<HeldClaim | null>(null), attempted = useRef(new Set<string>());
 const scope = `${ownerScope}:${view?.run_id || 'new'}`;
 const stage = view && editorialStages.includes(view.state as EditorialStage) ? view.state as EditorialStage : null;
 const isPaid = !!stage && paidStages.includes(stage), skip = !!view && !!stage && canSkipRevision(view, stage);
 const mutable = !!view && view.control_state === 'active';
 const currentStep = stage ? view?.stages[stage] : undefined;
 const canClaim = mutable && !!stage && (!currentStep || (!isPaid && currentStep.state === 'claimed'));
 const canExecute = mutable && !!stage && isPaid && ownedStage === stage && currentStep?.state === 'claimed' && !skip;
 const canReview = mutable && !!stage && !isPaid && currentStep?.state === 'claimed' && input?.stage === stage;

 const clearEphemeral = useCallback(() => {
  heldClaim.current = null; setOwnedStage(null); setInput(null); setReviewJson(''); setActorId(''); setExecutionId(''); setReviewModel('');
  setPaidConfirmed(false); setReviewConfirmed(false); setFinalRead(false); setFreezeConfirmed(false);
 }, []);
 const handleError = useCallback((error: unknown) => {
  if (!mounted.current) return;
  setFeedback(safeMessage(error));
  if (object(error) && error.authRequired) {
   generation.current++; selection.current = '';
   setAuthRequired(true); setView(null); setHistory([]); setRunId(''); setReason('');
   setCreateJson(pretty(createTemplate(promptVersion))); setCreateConfirmed(false); clearEphemeral();
  }
 }, [clearEphemeral, promptVersion]);
 const refresh = useCallback(async (id = selection.current, archived = false) => {
  const ticket = ++generation.current;
  const items = await jsonResponse(await fetch(`/api/writing/editorial-flow${archived ? '?include_archived=true' : ''}`, {cache: 'no-store'}));
  if (!Array.isArray(items.items)) throw Error('批次列表无法核验；请只读刷新');
  const next = id ? await readRun(id) : null;
  if (!mounted.current || ticket !== generation.current || id !== selection.current) return;
  setHistory(items.items.filter(item => object(item) && typeof item.run_id === 'string' && typeof item.title === 'string' && typeof item.state === 'string') as HistoryItem[]);
  setView(next); setAuthRequired(false);
  if (next && (!stage || stage !== next.state)) {setPaidConfirmed(false); setReviewConfirmed(false); setFinalRead(false);}
 }, [stage]);
 const selectRun = useCallback((id: string, changeUrl = false) => {
  generation.current++; selection.current = id; setRunId(id); setView(null); setFeedback(''); clearEphemeral();
  if (changeUrl) {
   const url = new URL(window.location.href);
   if (id) url.searchParams.set('run_id', id); else url.searchParams.delete('run_id');
   window.history.pushState(null, '', url.pathname + url.search);
  }
 }, [clearEphemeral]);
 useEffect(() => {
  mounted.current = true;
  const initial = window.setTimeout(() => {
   const id = new URLSearchParams(window.location.search).get('run_id') || '';
   setCreateJson(pretty(createTemplate(promptVersion))); setCreateConfirmed(false); setReason('');
   selectRun(id); void refresh(id, includeArchived).catch(handleError);
  }, 0);
  const read = () => {if (!lock.current) void refresh(selection.current, includeArchived).catch(handleError);};
  const navigate = () => {
   if (lock.current) {heldClaim.current = null; setOwnedStage(null);}
   const id = new URLSearchParams(window.location.search).get('run_id') || '';
   selectRun(id); void refresh(id, includeArchived).catch(handleError);
  };
  window.addEventListener('online', read); window.addEventListener('popstate', navigate); window.addEventListener('pageshow', navigate);
  // All in-flight reads become obsolete when this page unmounts.
  const invalidate = () => {generation.current++;};
  return () => {mounted.current = false; invalidate(); heldClaim.current = null; window.clearTimeout(initial); window.removeEventListener('online', read); window.removeEventListener('popstate', navigate); window.removeEventListener('pageshow', navigate);};
  // Navigation and readback are explicit; changes to stage do not remount or execute anything.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [ownerScope]);

 async function operation(work: () => Promise<void>) {
  if (lock.current) return;
  lock.current = true; setBusy(true);
  try {await work();} catch (error) {handleError(error);}
  finally {lock.current = false; if (mounted.current) setBusy(false);}
 }
 async function preflight() {
  if (!view) throw Error('请先只读打开一个批次');
  const latest = await readRun(view.run_id);
  if (selection.current !== latest.run_id || latest.snapshot_sha256 !== view.snapshot_sha256 || latest.state !== view.state || latest.control_state !== view.control_state) {
   clearEphemeral(); if (mounted.current && selection.current === latest.run_id) setView(latest);
   throw Error('批次状态或版本已变化；已刷新，请重新核对本步骤');
  }
  return latest;
 }
 async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (!createConfirmed) {setFeedback('请明确确认创建本次冻结快照'); return;}
  await operation(async () => {
   const args = parseFormJson(createJson); requireFilled(args);
   if ('confirm' in args) throw Error('模板无需 confirm 字段；由本次确认勾选提交');
   const created = await postEditorialAction('create', args);
   if (!validView(created)) throw Error('创建结果无法核验；请只读刷新批次列表');
   selectRun(created.run_id, true); setView(created); setCreateConfirmed(false); setFeedback('批次快照已保存。尚未请求模型，请逐阶段确认。');
   await refresh(created.run_id, includeArchived);
  });
 }
 async function claim() {
  await operation(async () => {
   if (!stage || !canClaim) return;
   const latest = await preflight();
   const result = await postEditorialAction('claim', {run_id: latest.run_id, stage, expected_snapshot_sha256: latest.snapshot_sha256}) as ClaimResponse;
   if (result.run_id !== latest.run_id || result.stage !== stage) throw Error('认领返回无法绑定；请只读刷新');
   if (isPaid) {
    if (result.claimed === true && typeof result.token === 'string' && result.token && typeof result.input_sha256 === 'string' && typeof result.expected_model === 'string') {
     heldClaim.current = {run_id: result.run_id, stage, token: result.token, input_sha256: result.input_sha256, expected_model: result.expected_model};
     setOwnedStage(stage); setPaidConfirmed(false); setFeedback(skip ? '零待改项阶段已认领，请明确点击保留同一全文并跳过。' : '本页赢得本阶段认领。请核对并单独勾选本次付费请求。');
    } else {heldClaim.current = null; setOwnedStage(null); setFeedback('本阶段已被认领；本页没有一次性凭证。只能读取已有结果，不能重新请求。');}
   } else {
    if (!object(result.input) || result.input.stage !== stage || !result.input_sha256) throw Error('独立审稿输入无法核验；请只读刷新');
    const exact = result.input as StageInput;
    setInput(exact); setReviewJson(pretty(reviewTemplate(stage, exact))); setActorId(exact.actor_id); setReviewModel(''); setExecutionId(''); setReviewConfirmed(false); setFinalRead(false);
    setFeedback('确切审稿输入已读取。请交给对应独立参与者实际执行，再填写完整报告及真实执行记录。');
   }
   await refresh(latest.run_id, includeArchived);
  });
 }
 async function executePaid(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (!paidConfirmed) {setFeedback('这一个付费阶段需要单独明确确认'); return;}
  await operation(async () => {
   if (!stage || !canExecute) return;
   const latest = await preflight(), claim = heldClaim.current, key = `${latest.run_id}:${stage}`;
   if (!claim || claim.run_id !== latest.run_id || claim.stage !== stage || claim.input_sha256 !== latest.stages[stage]?.input_sha256 || claim.expected_model !== latest.snapshot.model || attempted.current.has(key)) throw Error('本页没有本阶段可用的获胜认领凭证；请只读核验');
   attempted.current.add(key); heldClaim.current = null; setOwnedStage(null); setPaidConfirmed(false);
   const payload = {run_id: latest.run_id, stage, token: claim.token, expected_model: claim.expected_model, expected_input_sha256: claim.input_sha256, confirm: true};
   claim.token = '';
   try {
    const response = await fetch('/api/claude/editorial-run', {method: 'POST', headers: {'content-type': 'application/json', 'x-xiaoyu-editorial-run': '1'}, body: JSON.stringify(payload)});
    payload.token = '';
    if (!response.ok) {await jsonResponse(response); return;}
    if (!response.body) throw Error('长连接没有返回正文；只读检查已有记录');
    const terminal = await readDailyNdjson(response.body, event => {
     if (mounted.current && selection.current === latest.run_id && event.type === 'running') setFeedback(`本阶段请求进行中${typeof event.seconds === 'number' ? `（${event.seconds}秒）` : ''}，不自动重试。`);
    });
    if (mounted.current && selection.current === latest.run_id) setFeedback(terminal.success ? '本阶段确切产物已保存，请读取下一阶段。' : '本次实际结果须只读核验；未自动重试，请检查回执和诊断。');
   } finally {
    payload.token = ''; await refresh(selection.current, includeArchived);
   }
  });
 }
 async function submitReview(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (!reviewConfirmed || (stage === 'final_verify' && !finalRead)) {setFeedback('请确认真实独立执行；终审还须重新阅读全文'); return;}
  await operation(async () => {
   if (!stage || !canReview) return;
   const latest = await preflight(), actor = latest.snapshot.participants[reviewRole(stage)];
   if (actorId !== actor.actor_id || reviewModel !== actor.model) throw Error('实际执行身份或模型必须与冻结参与者逐字匹配');
   const report = parseFormJson(reviewJson); requireFilled(report);
   if (!executionId.trim()) throw Error('请填写真实独立执行 UUID，不能临时伪造');
   await postEditorialAction('save_review', {run_id: latest.run_id, stage, expected_snapshot_sha256: latest.snapshot_sha256, expected_input_sha256: latest.stages[stage]?.input_sha256, actor_id: actorId, execution_id: executionId, model: reviewModel, raw_result: reviewJson});
   clearEphemeral(); setFeedback('独立报告已保存。以服务端返回的实际状态决定下一阶段。'); await refresh(latest.run_id, includeArchived);
  });
 }
 async function skipRevision() {
  await operation(async () => {
   if (!stage || !skip) return;
   const latest = await preflight(); if (!canSkipRevision(latest, stage)) throw Error('前序报告不满足零待改项');
   await postEditorialAction('skip_revision', {run_id: latest.run_id, stage, expected_snapshot_sha256: latest.snapshot_sha256, expected_input_sha256: latest.stages[stage]?.input_sha256});
   clearEphemeral(); setFeedback('已明确跳过付费修订，保留同一主笔全文与确切 hash。终审仍需实际执行。'); await refresh(latest.run_id, includeArchived);
  });
 }
 async function recover(target: EditorialStage) {
  await operation(async () => {
   const latest = await preflight();
   if (latest.stages[target]?.receipt_state !== 'completed') throw Error('只有实际完成回执可以恢复；不能重新调用模型');
   await postEditorialAction('recover_completed', {run_id: latest.run_id, stage: target});
   setFeedback('已从同一实际完成回执解析保存，没有新模型请求。'); await refresh(latest.run_id, includeArchived);
  });
 }
 async function finalAction(action: 'freeze') {
  await operation(async () => {
   if (!freezeConfirmed) throw Error('请先勾选本次操作确认');
   const latest = await preflight(), hash = latest.current_version?.sha256;
   if (!hash) throw Error('缺少确切成稿 hash');
   const result = await postEditorialAction(action, {run_id: latest.run_id, expected_final_sha256: hash});
   setFreezeConfirmed(false);
   setFeedback(result.state === 'text_saved' ? '确切全文已保存网站文字稿，自动写作已完成。' : '保存状态已返回，请只读核对同一成稿。');
   await refresh(latest.run_id, includeArchived);
  });
 }
 async function control(action: 'archive' | 'restore' | 'pause') {
  await operation(async () => {
   if (!reason.trim()) throw Error('请填写本次控制操作原因');
   const latest = await preflight(); const result = await postEditorialAction(action, {run_id: latest.run_id, reason});
   clearEphemeral(); setFeedback(action === 'restore' ? (result.control_state === 'paused' ? '已恢复可见性，保留原先暂停状态。没有生成、投递或恢复付费凭证。' : '已恢复可见性和操作控制。没有生成、投递或恢复付费凭证。') : action === 'pause' ? '已暂停后续操作；实际请求和原始记录保留。' : '已归档并停止后续操作；实际请求和原始记录保留。');
   await refresh(latest.run_id, true);
  });
 }

 return <main className="studio-main writing-page">
  <StudioNav current="writing" />
  <div className="min-w-0 space-y-6">
   <header className="site-header"><h1>独立编辑流水线</h1><span className="edition">contract_v2 · 逐阶段确认</span></header>
   <p>主笔生成与修订，四个独立参与者分别负责框架、结构、事实和终审。此页面通过普通网页表单操作，打开、刷新和恢复页面只读取记录。</p>
   <p role="status" aria-live="polite">{feedback}</p>
   {authRequired && <p><a href="/signin-with-chatgpt?return_to=%2Fwriting%2Feditorial-helper">使用本人 ChatGPT 账号重新登录</a></p>}
   <form className="daily-run-form" onSubmit={event => {event.preventDefault(); void operation(async () => {selectRun(runId.trim(), true); await refresh(runId.trim(), includeArchived);});}}>
    <label>批次 UUID<input name="run_id" value={runId} onChange={event => setRunId(event.target.value)} autoComplete="off" disabled={busy} /></label>
    <label className="manual-confirm"><input name="include_archived" type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} disabled={busy} />列表包含归档批次</label>
    <button type="submit" disabled={busy}>只读打开批次 / 刷新列表</button>
   </form>
   <EditorialFold key={`${ownerScope}:history`} scope={ownerScope} name="history" title={`最近批次（${history.length}）`}>
    {history.length ? history.map(item => <p key={item.run_id}><a href={`/writing/editorial-helper?run_id=${encodeURIComponent(item.run_id)}`}>{item.title}</a> · {states[item.state] || stageLabels[item.state as EditorialStage] || item.state} · {states[item.control_state || 'active'] || item.control_state}</p>) : <p>尚未读到本人的批次。</p>}
   </EditorialFold>
   <EditorialFold key={`${ownerScope}:create`} scope={ownerScope} name="create" title="创建新批次 · 冻结真实资料与五位参与者">
    <p>填写全部空白项。authorization_key 是你选定的唯一操作键（字母、数字、冒号、下划线、短横线）；同一键不会创建第二批次。expected_model 填已启用的主笔模型；提示词版本来自当前服务端。此表不会生成参与者或执行 UUID。</p>
    <p>至少两个不同公开 HTTPS 来源和一条事实。published、event_date、accessed 填真实日期或完整带时区时间；context 写原文位置、引语发生时间、场景和限制。materials 至少100个非空白字符，最多18000字符。事实 source_ids 只能引用本批次来源。</p>
    <p>writer、outline_reviewer、structure_reviewer、fact_checker、verifier 的 actor_id 须填写五位真实参与者的不同 UUID。主笔模型须等于 expected_model；四位独立审稿模型须不同于主笔模型。身份声明和报告不会冒充提供方回执。</p>
    <form className="daily-run-form" onSubmit={submitCreate} autoComplete="off">
     <label>完整创建资料 JSON<textarea name="create_json" rows={28} maxLength={280000} value={createJson} onChange={event => {setCreateJson(event.target.value); setCreateConfirmed(false);}} disabled={busy || authRequired} required spellCheck={false} /></label>
     <label className="manual-confirm"><input name="create_confirm" type="checkbox" checked={createConfirmed} onChange={event => setCreateConfirmed(event.target.checked)} disabled={busy || authRequired} required />我确认资料和五位真实独立参与者，保存本次快照（不请求模型）</label>
     <button type="submit" disabled={busy || authRequired || !createConfirmed}>创建本次冻结快照</button>
     <a href="/writing">查看现有模型配置与提示词版本</a>
    </form>
   </EditorialFold>
   {view && <>
    <EditorialRunResult key={scope} view={view} scope={scope} />
    <section aria-label="本阶段操作" className="space-y-4">
     <h2>{stage ? stageLabels[stage] : '本批次后续操作'}</h2>
     {stage && <>
      <button type="button" disabled={busy || !canClaim} onClick={() => {void claim();}}>{!isPaid && currentStep ? '读取已认领的确切审稿输入' : '确认认领当前阶段（不调用模型）'}</button>
      {isPaid && currentStep?.state === 'claimed' && ownedStage !== stage && !skip && <p>本页没有本阶段获胜凭证。若已刷新或离开，凭证不会恢复；请只读核对，不能再次认领付费请求。</p>}
      {skip && <div><p>独立前序报告零待改项。此阶段应明确跳过并保留同一全文与 hash。</p><button type="button" disabled={busy || !mutable || currentStep?.state !== 'claimed'} onClick={() => {void skipRevision();}}>确认保留同一全文与 hash，跳过本次付费修订</button></div>}
      {isPaid && !skip && <form className="daily-run-form" onSubmit={executePaid} autoComplete="off" key={`${view.run_id}:${stage}:paid`}>
       <p>本阶段：{stageLabels[stage]} · 预期模型：{view.snapshot.model} · 只发起一次请求。输出上限取冻结能力快照；前序阶段不会授权后续请求。</p>
       <label className="manual-confirm"><input name={`paid_confirm_${stage}`} type="checkbox" checked={paidConfirmed} onChange={event => setPaidConfirmed(event.target.checked)} disabled={busy || !canExecute} required />我明确确认本阶段的一次付费请求，使用该冻结模型和确切输入，不自动重试</label>
       <button type="submit" disabled={busy || !canExecute || !paidConfirmed}>执行这一个已认领付费阶段</button>
      </form>}
      {!isPaid && <>
       {input?.stage === stage && <EditorialFold key={`${scope}:${stage}:input`} scope={scope} name={`input:${stage}`} title="独立执行必须读取的确切输入、全文与指令"><pre className="whitespace-pre-wrap break-words">{pretty(input)}</pre></EditorialFold>}
       <form className="daily-run-form" onSubmit={submitReview} autoComplete="off" key={`${view.run_id}:${stage}:review`}>
        <p>登记参与者：{view.snapshot.participants[reviewRole(stage)].actor_id}；预期模型：{view.snapshot.participants[reviewRole(stage)].model}。请填写实际执行信息，不能由主笔自审，也不能临时编造执行 UUID。</p>
        <label>实际独立参与者 UUID<input name="review_actor_id" value={actorId} onChange={event => {setActorId(event.target.value); setReviewConfirmed(false);}} disabled={busy || !canReview} required /></label>
        <label>真实独立执行 UUID<input name="review_execution_id" value={executionId} onChange={event => {setExecutionId(event.target.value); setReviewConfirmed(false);}} disabled={busy || !canReview} required /></label>
        <label>实际执行模型（须与冻结模型一致）<input name="review_model" value={reviewModel} onChange={event => {setReviewModel(event.target.value); setReviewConfirmed(false);}} disabled={busy || !canReview} required /></label>
        <label>完整独立报告 JSON<textarea name="review_json" rows={24} maxLength={250000} value={reviewJson} onChange={event => {setReviewJson(event.target.value); setReviewConfirmed(false); setFinalRead(false);}} disabled={busy || !canReview} required spellCheck={false} /></label>
        <p>问题 issues 每项字段必须完整：{pretty(issueTemplate)}。paragraph=0 是标题，1起是正文；框架审稿的第1段是完整框架 JSON。quote 必须逐字引用该位置连续原文；type 仅 structure/logic/expression/fact，severity 仅 low/medium/high；basis 写依据，revision_goal 写具体修订目标。pass 须零问题，revise 须有问题，blocked 写具体材料缺口。</p>
        {(stage === 'fact_check' || stage === 'final_verify') && <p>coverage 模板已经逐字载入标题和每段全文，需按真实判断拆成连续片段并填写 classification、verdict、source_ids、source_dates、context。按标题0到末段顺序覆盖每个字符（包括空白和标点），不得遗漏、重叠或只交 diff。事实 confirmed 至少引用一个冻结来源；日期逐项对应来源 published 或 event_date，context 必须写入所选确切日期、引语时间、场景及限制。观点和比喻用 not_applicable，来源和日期数组为空，但比喻隐含事实仍须核查。未确认/矛盾须 passed=false；五项 checks 全真、全部事实已证实且 issues/unconfirmed 为空才能通过。模板没有预填任何通过结论。</p>}
        {stage === 'final_verify' && <label className="manual-confirm"><input name="final_full_text_read" type="checkbox" checked={finalRead} onChange={event => setFinalRead(event.target.checked)} disabled={busy || !canReview} required />我确认终审者重新读取这一个输入 hash 的标题及完整最终正文，检查新增事实、私下行为、心理动机、比喻和引述时间语境</label>}
        <label className="manual-confirm"><input name="review_confirm" type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)} disabled={busy || !canReview} required />我确认报告来自上述真实独立执行，完整覆盖本阶段要求并保存到确切输入 hash</label>
        <button type="submit" disabled={busy || !canReview || !reviewConfirmed || (stage === 'final_verify' && !finalRead)}>保存这一个独立报告</button>
       </form>
      </>}
     </>}
     {paidStages.filter(target => view.stages[target]?.receipt_state === 'completed' && !view.artifacts[target]).map(target => <p key={target}><button type="button" disabled={busy || !mutable} onClick={() => {void recover(target);}}>确认从 {stageLabels[target]} 已完成回执恢复产物（不请求模型）</button></p>)}
     {view.state === 'verified' && <div className="daily-run-form">
      <label className="manual-confirm"><input name="freeze_confirm" type="checkbox" checked={freezeConfirmed} onChange={event => setFreezeConfirmed(event.target.checked)} disabled={busy || !mutable} />我确认按独立终审通过的确切全文 hash 冻结成稿</label>
      <button type="button" disabled={busy || !mutable || !freezeConfirmed} onClick={() => {void finalAction('freeze');}}>冻结确切成稿</button>
     </div>}
     {(view.state === 'text_saved' || view.state === 'frozen') && <p>全文已保存在网站。自动写作在文字稿结束；人工上传稿才进入配图排版流程。</p>}
    </section>
    <EditorialFold key={`${scope}:controls`} scope={scope} name="controls" title="暂停、归档或恢复可见性">
     <div className="daily-run-form"><label>本次操作原因<textarea name="control_reason" rows={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !reason.trim() || view.control_state === 'paused'} onClick={() => {void control('pause');}}>确认暂停</button><button type="button" disabled={busy || !reason.trim() || view.control_state === 'archived'} onClick={() => {void control('archive');}}>确认归档</button><button type="button" disabled={busy || !reason.trim() || view.control_state === 'active'} onClick={() => {void control('restore');}}>确认恢复可见与操作控制</button></div>
      <p>恢复不会生成、投递、重试或重新发放一次性付费凭证。暂停后再归档的批次恢复时仍保持暂停，需另一次明确恢复操作。原始阶段、文章和实际回执保留。</p>
     </div>
    </EditorialFold>
   </>}
  </div>
 </main>;
}
