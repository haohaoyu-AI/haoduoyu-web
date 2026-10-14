'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {confirmedObservationTime,observationTimeLabel,resultRefreshAgeMs} from '../../lib/result-observation-time';
import styles from './easel-trends.module.css';
import brief from './research-brief.module.css';

export type ResearchResult = {
  featured: {
    event_key: string;
    title: string;
    event_time: string;
    summary: string;
    analysis: string;
    angle: string;
    facts: { text: string; source_ids: string[] }[];
    sources: { id: string; url: string; title: string; published_at: string | null; accessed_at: string }[];
    candidate_ids: string[];
  }[];
  additional: { title: string; url: string | null; note: string }[];
  coverage: { notice: string; checked_at: string };
  shortfall: string;
};

export type ResearchRun = {
  id: string;
  generation: number;
  state: 'queued' | 'researching' | 'completed' | 'failed';
  created: string;
  updated: string;
  input_hash: string;
  input: { boards: { platform: { status: string; fetched_at: string | null; [key: string]: unknown }; candidates: unknown[]; [key: string]: unknown }[]; history: unknown; [key: string]: unknown };
  result: ResearchResult | null;
  error: string | null;
  dispatch_state: string;
  claim_expires: string | null;
  claimable: boolean;
  execution_unsettled?:boolean;
  owner_execution_blocked?:boolean;
};

export type ResearchResponse = {
  owner_scope: string;
  current?: ResearchRun | null;
  run?: ResearchRun | null;
  connected: boolean;
  dispatch?: unknown;
  claim_token?: string | null;
};

export class ResearchRequestError extends Error {
  constructor(message: string, public status: number | null = null) {
    super(message);
    this.name = 'ResearchRequestError';
  }
}

export function researchError(error: unknown) {
  return error instanceof Error ? error.message : '读取失败，请稍后重试';
}

export function researchTime(value: string | null | undefined) {
  if (!value) return '未提供';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export const researchStateLabels: Record<ResearchRun['state'], string> = {
  queued: '准备核验', researching: '正在研究', completed: '研究已完成', failed: '本次研究未完成',
};

export function researchRunFrom(response: ResearchResponse, current = false): ResearchRun | null {
  const run = current ? response.current : response.run;
  if (run === null) return null;
  if (!run || typeof run.id !== 'string' || !Number.isFinite(run.generation) || !Object.hasOwn(researchStateLabels, run.state)) {
    throw new ResearchRequestError('服务返回的研究状态不完整，请只刷新状态确认');
  }
  return run;
}

export function useResearchClient() {
  const controllers = useRef(new Set<AbortController>());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const active = controllers.current;
    return () => { mounted.current = false; for (const controller of active) controller.abort(); active.clear(); };
  }, []);
  const request = useCallback(async (payload?: Record<string, unknown>, id?: string, scope?: string | null): Promise<ResearchResponse> => {
    const controller = new AbortController();
    controllers.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), payload ? 40_000 : 20_000);
    try {
      const response = await fetch(`/api/topics/research${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
        method: payload ? 'POST' : 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
        ...(payload ? { headers: { 'content-type': 'application/json', 'x-topic-research': '1', ...(scope ? { 'x-topic-owner-scope': scope } : {}) }, body: JSON.stringify(payload) } : {}),
      });
      if (response.status === 401) throw new ResearchRequestError('请使用本人 ChatGPT 账号重新登录', 401);
      if (response.status === 403) throw new ResearchRequestError('当前账号没有操作权限，请核对本人账号', 403);
      let data: unknown;
      try { data = await response.json(); } catch { throw new ResearchRequestError('没有收到可确认的研究状态，请读取同一任务后再重试', response.ok ? null : response.status); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ResearchRequestError('服务返回的研究状态不完整');
      if (!response.ok) throw new ResearchRequestError('error' in data && typeof data.error === 'string' ? data.error : '研究请求未完成', response.status);
      return data as ResearchResponse;
    } catch (error) {
      if (error instanceof ResearchRequestError) throw error;
      throw new ResearchRequestError(controller.signal.aborted ? '请求超时或已中断，结果尚未确认' : '连接中断，结果尚未确认');
    } finally {
      window.clearTimeout(timeout);
      controllers.current.delete(controller);
    }
  }, []);
  return { request, mounted };
}

function safeSourceUrl(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function researchBriefDate(value: Date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' }).format(value);
}

export function researchElapsed(value: string, now: number) {
  const started = Date.parse(value);
  if (!Number.isFinite(started)) return '时间未知';
  const minutes = Math.floor(Math.max(0, now - started) / 60_000);
  if (minutes < 1) return '不足 1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}`;
}

export function researchHeat(run: ResearchRun, candidateIds: string[]) {
  const ids = new Set(candidateIds);
  const lines = new Set<string>();
  for (const board of run.input.boards) for (const value of board.candidates) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || !ids.has(candidate.id) || !Array.isArray(candidate.signals)) continue;
    for (const raw of candidate.signals) {
      if (!raw || typeof raw !== 'object') continue;
      const signal = raw as Record<string, unknown>;
      const platform = signal.platform === 'toutiao' ? '今日头条' : signal.platform === 'weibo' ? '微博' : null;
      if (!platform) continue;
      const rank = typeof signal.rank === 'number' && Number.isInteger(signal.rank) && signal.rank > 0 ? signal.rank : null;
      const metric = typeof signal.metric === 'string' ? signal.metric.trim().slice(0, 200) : '';
      lines.add(`${platform}${rank ? `原榜第 ${rank} 位` : ''}${metric ? ` · ${metric}` : rank ? '' : ' · 未提供具体指标'}`);
    }
  }
  return [...lines].join('；') || '来源未提供可展示的榜位或热度值';
}

export function ResearchResultView({ run, clock }: { run: ResearchRun; clock?:number }) {
  const [mountedAt]=useState(Date.now);
  if (run.state !== 'completed' || !run.result) return null;
  const result = run.result;
  const featured = result.featured.slice(0, 5);
  const checkedAt=confirmedObservationTime(result.coverage.checked_at,clock??mountedAt);
  return <div className={brief.results} data-research-result={run.id}>
    {!!result.shortfall && <p className={styles.noticeWarn}>{result.shortfall}</p>}
    {!featured.length && <p className={styles.notice}>本次没有证据足够的精选，不使用未核验线索补位。</p>}
    {featured.map((item, index) => <article className={brief.item} key={`${item.event_key}-${index}`} data-researched-topic={item.event_key}>
      <h3><span className={brief.number}>{['①', '②', '③', '④', '⑤'][index]}</span>{item.title}</h3>
      <p className={brief.heat}>热度：{researchHeat(run, item.candidate_ids)}</p>
      <p className={brief.summary}>{item.summary}</p>
      <div className={brief.analysis}><h4>💥 爆点分析</h4><p>{item.analysis}</p></div>
      <details className={brief.evidence}>
        <summary>查看来源与核验详情</summary>
        <p>事件时间：{item.event_time || '来源未能确认'}</p>
        <p>可写角度：{item.angle}</p>
        <p>热度取自本轮头条、微博榜单快照，平台指标口径不同，不相加或换算。</p>
        <ul>{item.facts.map((fact, factIndex) => <li key={factIndex}>
          {fact.text}<span className={brief.factSources}>{fact.source_ids.map((sourceId) => {
            const source = item.sources.find((candidate) => candidate.id === sourceId);
            const url = source && safeSourceUrl(source.url);
            return url ? <a key={sourceId} href={url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a> : <span key={sourceId}>来源链接不可用</span>;
          })}</span>
        </li>)}</ul>
        <ul>{item.sources.map((source) => {
          const url = safeSourceUrl(source.url);
          return <li key={source.id}>
            {url ? <a href={url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a> : <span>{source.title}（链接不可用）</span>}
            <small>发布：{researchTime(source.published_at)} · 实际访问：{researchTime(source.accessed_at)}（北京时间）</small>
          </li>;
        })}</ul>
      </details>
    </article>)}
    {result.additional.length > 0 && <section className={brief.additional} aria-label="研究保留的未核验线索">
      <h3>📌 附加文娱热点速览</h3>
      <p className={brief.additionalLine}>{result.additional.map((item, index) => {
        const url = safeSourceUrl(item.url);
        return <span key={index}>{index > 0 && <span className={brief.separator} aria-hidden="true"> · </span>}{url ? <a href={url} target="_blank" rel="noopener noreferrer">{item.title}</a> : item.title}</span>;
      })}</p>
      <p className={styles.notice}>以上为附加线索，尚未完成核验。</p>
      <details className={brief.evidence}><summary>查看附加线索说明</summary><ul>{result.additional.map((item, index) => <li key={index}><strong>{item.title}</strong>：{item.note}</li>)}</ul></details>
    </section>}
    <details className={brief.evidence}><summary>本轮核验范围与时间</summary><p>{checkedAt===null?'核验时间未确认':<>核验截至 {observationTimeLabel(checkedAt)}（北京时间）</>} · {result.coverage.notice}</p></details>
  </div>;
}

function refreshMessage(error: unknown) {
  return researchError(error)
    .replaceAll('研究状态', '刷新进度')
    .replaceAll('请读取同一任务后再重试', '请稍后重试')
    .replaceAll('请只刷新状态确认', '页面会自动重试读取')
    .replaceAll('任务所属账号', '登录账号')
    .replaceAll('请重新读取状态', '请稍后刷新查看');
}

export function ResearchPanel({ onRefreshed, onResultAvailabilityChange }: {
  onRefreshed?: () => Promise<void>;
  onResultAvailabilityChange?: (available: boolean) => void;
} = {}) {
  const { request, mounted } = useResearchClient();
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [lastCompleted, setLastCompleted] = useState<ResearchRun | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const [verifiedCurrent, setVerifiedCurrent] = useState(false);
  const [error, setError] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [observedAt, setObservedAt] = useState<number | null>(null);
  const [resultNow,setResultNow]=useState(Date.now);
  const current = useRef<ResearchRun | null>(null);
  const sequence = useRef(0);
  const readBusy = useRef(false);
  const createBusy = useRef(false);
  const requestKey = useRef<string | null>(null);
  const ownerScope = useRef<string | null>(null);

  const resetIdentity = useCallback(() => {
    current.current = null; requestKey.current = null; ownerScope.current = null;
    setRun(null); setLastCompleted(null); setConnected(null); setUncertainCreate(false); setVerifiedCurrent(false);
    setObservedAt(null);
  }, []);

  const checkOwnerScope = useCallback((response: ResearchResponse) => {
    if (!response.owner_scope) throw new ResearchRequestError('未能确认任务所属账号，请重新读取状态');
    if (ownerScope.current && ownerScope.current !== response.owner_scope) resetIdentity();
    ownerScope.current = response.owner_scope;
  }, [resetIdentity]);

  const acceptRun = useCallback((next: ResearchRun | null) => {
    const previous = current.current;
    if (previous && next && next.generation < previous.generation) return;
    if (previous && next?.id === previous.id) {
      if (Date.parse(next.updated) < Date.parse(previous.updated)) return;
      if (['completed', 'failed'].includes(previous.state) && !['completed', 'failed'].includes(next.state)) return;
    }
    current.current = next;
    setRun(next);
    if (next?.state === 'completed' && next.result) setLastCompleted(next);
    if (!next) setLastCompleted(null);
  }, []);

  const readCurrent = useCallback(async () => {
    if (readBusy.current || createBusy.current || !mounted.current) return;
    readBusy.current = true;
    setReading(true);
    const round = ++sequence.current;
    const active = current.current;
    try {
      // Read the pinned run and the newest pointer together: a completion from an
      // older tab must never replace a newer generation.
      const [latest, pinned] = await Promise.all([
        request(),
        active && ['queued', 'researching'].includes(active.state) ? request(undefined, active.id).catch(() => null) : Promise.resolve(null),
      ]);
      if (!mounted.current || round !== sequence.current) return;
      checkOwnerScope(latest);
      const next = researchRunFrom(latest, true);
      const pinnedRun = pinned?.owner_scope === latest.owner_scope ? researchRunFrom(pinned) : null;
      const selected = next && pinnedRun?.id === next.id && Date.parse(pinnedRun.updated) > Date.parse(next.updated) ? pinnedRun : next;
      acceptRun(selected);
      setConnected(latest.connected);
      setVerifiedCurrent(true);
      setObservedAt(Date.now());
      setResultNow(Date.now());
      setAuthRequired(false);
      if (!requestKey.current) setError('');
    } catch (failure) {
      if (!mounted.current || round !== sequence.current) return;
      setVerifiedCurrent(false);
      setError(refreshMessage(failure));
      if (failure instanceof ResearchRequestError && [401, 403].includes(failure.status ?? 0)) { setAuthRequired(true); resetIdentity(); }
    } finally {
      readBusy.current = false;
      if (mounted.current) setReading(false);
      if (mounted.current && round === sequence.current) setLoading(false);
    }
  }, [acceptRun, checkOwnerScope, mounted, request, resetIdentity]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (disposed) return;
      if (document.visibilityState !== 'hidden') await readCurrent();
      if (!disposed) timer = setTimeout(tick, current.current && ['queued', 'researching'].includes(current.current.state) ? 6000 : 30_000);
    };
    timer = setTimeout(tick, 0);
    const resume = () => { if (document.visibilityState !== 'hidden') { setResultNow(Date.now()); setVerifiedCurrent(false); void readCurrent(); } };
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true; sequence.current += 1; clearTimeout(timer);
      window.removeEventListener('focus', resume); window.removeEventListener('online', resume); window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [readCurrent]);

  async function create() {
    if (createBusy.current || loading || authRequired || !verifiedCurrent || !ownerScope.current || (!uncertainCreate && (current.current?.state === 'researching' || (current.current?.state === 'queued' && current.current.dispatch_state !== 'pending') || current.current?.owner_execution_blocked))) return;
    createBusy.current = true;
    sequence.current += 1;
    setCreating(true); setError(''); setVerifiedCurrent(false);
    let readBack = false;
    try {
      const pending = current.current?.state === 'queued' && current.current.dispatch_state === 'pending';
      const response = pending && !requestKey.current
        ? await request({ action: 'dispatch', research_id: current.current!.id }, undefined, ownerScope.current)
        : await request({ action: 'create', request_key: requestKey.current ??= crypto.randomUUID() }, undefined, ownerScope.current);
      const next = researchRunFrom(response);
      if (!next) throw new ResearchRequestError('刷新结果暂未确认，请稍后重试');
      if (!mounted.current) return;
      checkOwnerScope(response);
      acceptRun(next);
      setConnected(response.connected); setUncertainCreate(false); setVerifiedCurrent(true); setAuthRequired(false);
      setObservedAt(Date.now());
      setResultNow(Date.now());
      requestKey.current = null;
      // The server has already refreshed and frozen both boards. Read its cache
      // into the source details without creating another research request.
      void onRefreshed?.().catch(() => undefined);
    } catch (failure) {
      if (!mounted.current) return;
      setUncertainCreate(true); setError(`${refreshMessage(failure)}。点击刷新可继续，不会重复开始。`);
      if (failure instanceof ResearchRequestError && [401, 403].includes(failure.status ?? 0)) { setAuthRequired(true); resetIdentity(); }
      else readBack = true;
    } finally {
      createBusy.current = false;
      if (mounted.current) { setCreating(false); setLoading(false); }
      if (readBack) void readCurrent();
    }
  }

  const retryDelivery = run?.state === 'queued' && run.dispatch_state === 'pending';
  const showResult = verifiedCurrent && !creating && !uncertainCreate && run?.state === 'completed';
  const previousResult = !showResult && !authRequired ? lastCompleted : null;
  const awaitingHandoff = run?.state === 'queued' && run.dispatch_state === 'accepted';
  const unconfirmedDelivery = run?.state === 'queued' && !retryDelivery && !awaitingHandoff;
  const progressTime = observedAt ?? Date.parse(run?.updated ?? '');
  const expiredResearch = run?.state === 'researching' && (run.claimable || (!!run.claim_expires && Date.parse(run.claim_expires) <= progressTime));
  const researching = run?.state === 'researching' && !expiredResearch;
  const checkedAt=confirmedObservationTime(run?.result?.coverage?.checked_at,resultNow);
  const previousCheckedAt=confirmedObservationTime(previousResult?.result?.coverage?.checked_at,resultNow);
  const staleResult=checkedAt!==null&&resultNow-checkedAt>=resultRefreshAgeMs;
  const stalePrevious=previousCheckedAt!==null&&resultNow-previousCheckedAt>=resultRefreshAgeMs;
  useEffect(()=>{
    const clock=Date.now();
    const boundaries=[run?.result?.coverage?.checked_at,lastCompleted?.result?.coverage?.checked_at]
      .map(value=>confirmedObservationTime(value,clock))
      .filter((at):at is number=>at!==null)
      .map(at=>at+resultRefreshAgeMs)
      .filter(at=>at>clock);
    if(!boundaries.length)return;
    const timer=setTimeout(()=>setResultNow(Date.now()),Math.max(1,Math.min(...boundaries)-clock));
    return()=>clearTimeout(timer);
  },[run?.result?.coverage?.checked_at,lastCompleted?.result?.coverage?.checked_at,resultNow]);
  const hasVerifiedResult = !!((showResult && run?.result) || previousResult?.result);
  useEffect(() => { onResultAvailabilityChange?.(hasVerifiedResult); }, [hasVerifiedResult, onResultAvailabilityChange]);
  return <section className={brief.panel} aria-labelledby="topic-research-title" data-research-state={creating ? 'creating' : run?.state ?? 'empty'}>
    <div className={brief.header}>
      <div><h2 id="topic-research-title">🎬 文娱热榜<span className={brief.date}>｜{researchBriefDate()}</span></h2><p className={brief.subtitle}>今日头条 · 微博 · 每6小时更新</p></div>
      <button type="button" aria-label="刷新选题" onClick={() => void create()} disabled={creating || loading || authRequired || !verifiedCurrent || ((researching || expiredResearch || awaitingHandoff || unconfirmedDelivery || !!run?.owner_execution_blocked) && !uncertainCreate)} style={{ gap: 6 }}>
        <RefreshCw size={15} aria-hidden="true" className={creating || (researching && !uncertainCreate) ? styles.spinning : undefined} />
        {creating?'正在刷新…':researching&&!uncertainCreate?'正在核验…':'刷新选题'}
      </button>
    </div>
    <div className={brief.progress} role="status" aria-live="polite">
      {loading ? <p className={styles.notice}>正在读取最新文娱精选…</p> : !run && !creating ? <p className={styles.notice}>点击“刷新选题”，我会自动整理这一轮热点，完成后直接显示在这里。</p> : null}
      {creating && <p className={styles.notice}>正在获取头条和微博热点，稍后自动显示核验结果…</p>}
      {!creating && awaitingHandoff && !uncertainCreate && <p className={styles.notice} data-research-waiting="true">已取得热点线索，请求已保存，核验尚未开始。已等待 {researchElapsed(run!.created, progressTime)}；当前暂无本轮已核验结果。页面会继续读取进度。</p>}
      {!creating && unconfirmedDelivery && !uncertainCreate && <p className={styles.noticeWarn}>本轮已保存，请求处理结果尚未确认。已等待 {researchElapsed(run!.created, progressTime)}；页面会继续读取进度。</p>}
      {!creating && researching && !uncertainCreate && <p className={styles.notice}>正在阅读公开来源、核实事件和筛选选题。最近进度更新于 {researchTime(run!.updated)}（北京时间），页面会继续读取进度。</p>}
      {!creating && expiredResearch && !uncertainCreate && <p className={styles.noticeWarn}>核验暂时中断，已有资料保留。请让小鱼核对同一任务后继续。</p>}
      {!creating && retryDelivery && <p className={styles.noticeWarn}>这一轮暂时未能开始核验。稍后点击“刷新选题”可继续，无需重新设置。</p>}
      {connected === false && !retryDelivery && <p className={styles.noticeWarn}>自动处理连接暂不可用，请让小鱼检查连接。</p>}
      {run?.state === 'failed' && verifiedCurrent && <p className={styles.noticeWarn}>本次刷新未完成：{run.error || '暂时没有取得充分资料。'}{run.owner_execution_blocked?'原执行尚未确认安全结束，暂不启动下一轮。':'可点击“刷新选题”重试。'}</p>}
      {run?.owner_execution_blocked&&['completed','failed','queued'].includes(run.state)&&<p className={styles.noticeWarn}>已有结果或阻塞记录保留。前次执行尚未核验结清，请让小鱼核对；暂不创建、派送或认领新的研究。</p>}
      {showResult && <p className={styles.notice}>{checkedAt===null?'本轮核验时间未确认。':<>核验截至 {observationTimeLabel(checkedAt)}（北京时间）{staleResult?' · 结果已超过6小时，当前保留历史核验结果。':''}</>}</p>}
    </div>
    {error && <p className={styles.error} role="alert">{error}{authRequired && <> <a href="/signin-with-chatgpt?return_to=%2Ftopics" target="_top">重新登录</a></>}</p>}
    {error && !verifiedCurrent && !authRequired && !creating && !loading && <button type="button" disabled={reading || creating} onClick={() => {
      if (!readBusy.current && !createBusy.current) { setLoading(true); void readCurrent(); }
    }}>重新读取状态</button>}
    {showResult && run && <ResearchResultView run={run} clock={resultNow} />}
    {previousResult && <div className={brief.previousResult} data-previous-research-result="true"><p className={brief.previousLabel}>上次已核验结果 · {previousCheckedAt===null?'核验时间未确认':<>核验截至 {observationTimeLabel(previousCheckedAt)}（北京时间）</>} · 批次 {previousResult.generation}</p><p className={styles.notice}>{stalePrevious?'结果已超过6小时。':''}以下保留历史结果，本轮最新进度以上方状态为准。</p><ResearchResultView run={previousResult} clock={resultNow} /></div>}
  </section>;
}
