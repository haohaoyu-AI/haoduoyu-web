'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderAttempt, TopicCandidate, TopicPlatform } from '../../lib/topic-radar';
import { findTopicHistoryMatches } from '../../lib/topic-history-match';
import { MergedEntertainmentBoard } from '../../components/topics/MergedEntertainmentBoard';
import { ResearchPanel } from '../../components/topics/ResearchPanel';
import { isEntertainmentCandidate, mergeEntertainmentBoards } from '../../lib/topic-merged';
import StudioNav from '../../components/studio-nav';
import styles from '../../components/topics/easel-trends.module.css';

type PlatformSummary = {
  platform: TopicPlatform;
  label: string;
  provider: string;
  status: 'loading' | 'ok' | 'empty' | 'stale' | 'error' | 'not_implemented';
  fetched_at: string | null;
  attempted_at: string | null;
  upstream_updated_at: string | null;
  cache_hit: boolean;
  item_count: number;
  error: string | null;
  provider_attempts: ProviderAttempt[];
  source_count: number | null;
  returned_count: number;
  invalid_count: number;
  truncated: boolean;
  next_refresh_at: string | null;
};
type TopicResponse = {
  version: string;
  checked_at: string;
  timezone: string;
  platforms: PlatformSummary[];
  history: {
    status: 'loading' | 'ok' | 'error';
    scope: string;
    count: number;
    oldest_created: string | null;
    checked_at: string;
    window_days: number;
    window_complete: boolean | null;
    unselected_current_runs: number;
    unfinished_topic_runs: number;
    notice: string | null;
  };
  items: TopicCandidate[];
  analysis: { mode: 'rules'; state: 'needs_research'; notice: string };
};

const platformOptions = [{ value: 'toutiao', label: '今日头条' }, { value: 'weibo', label: '微博' }];
const boardPlatforms = ['toutiao', 'weibo'] as const;
type BoardPlatform = typeof boardPlatforms[number];
type BoardRow = { row_id: string; candidate_id: string; title: string; rank: number | null; metric: string | null; url: string | null; label?: string | null; query_word?: string | null };
type BoardState = { platform: PlatformSummary; rows: BoardRow[]; candidates: TopicCandidate[]; checked_at: string | null };
type HistoryEntry = { article_id: string; title: string; topic: string | null; created: string; writer: string; run_kind: string; source: 'article' | 'current_run' };
type HistoryState = { status: 'loading' | 'ok' | 'error'; summary: TopicResponse['history']; entries: HistoryEntry[] };

function shanghaiTime(value: string | null | undefined) {
  if (!value) return '未取得';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未取得';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function platformLabel(platform: string) {
  return platformOptions.find((option) => option.value === platform)?.label || platform;
}

function statusLabel(platform: PlatformSummary) {
  if (platform.status === 'stale') return '旧缓存';
  if (platform.status === 'error') return '读取失败';
  if (platform.status === 'empty') return '暂无热点';
  if (platform.status === 'not_implemented') return '暂未接入';
  if (platform.status === 'loading') return '读取中';
  return platform.cache_hit ? '使用缓存' : '已读取';
}

function providerAttemptLabel(attempt: ProviderAttempt) {
  if (attempt.status === 'http_error') return `HTTP ${attempt.http_status ?? '错误'}`;
  if (attempt.status === 'auth_required') return '登录或验证页，未继续';
  if (attempt.status === 'timeout') return '请求超时';
  if (attempt.status === 'network_error') return '连接失败';
  if (attempt.status === 'redirect_mode_unsupported') return '运行时不支持此重定向模式';
  if (attempt.status === 'redirect_rejected') return '跳转已拒绝';
  if (attempt.status === 'invalid_json') return '响应不是JSON';
  if (attempt.status === 'invalid_shape') return '数据结构不符';
  if (attempt.status === 'invalid_items') return '没有可识别的话题字段';
  if (attempt.status === 'response_too_large') return '响应超过大小限制';
  if (attempt.status === 'invalid_response') return '响应不可读取';
  return attempt.status === 'empty' ? 'HTTP 200 · 空榜' : `HTTP ${attempt.http_status ?? 200} · 读取成功`;
}

function evidencePackage(candidate: TopicCandidate, data: TopicResponse) {
  return JSON.stringify({
    topic: candidate.topic,
    categories: candidate.categories,
    classification: candidate.classification,
    signals: candidate.signals,
    history_matches: candidate.history_matches,
    history_scope: data.history,
    checked_at: data.checked_at,
    timezone: data.timezone,
    platforms: data.platforms.filter((platform) => candidate.signals.some((signal) => signal.platform === platform.platform)).map((platform) => ({
      platform: platform.platform,
      label: platform.label,
      provider: platform.provider,
      status: platform.status,
      error: platform.error,
      cache_hit: platform.cache_hit,
      fetched_at: platform.fetched_at,
      attempted_at: platform.attempted_at,
      upstream_updated_at: platform.upstream_updated_at,
      provider_attempts: platform.provider_attempts,
    })),
    unverified_research_questions: candidate.angles,
    research_state: candidate.research_state,
    analysis: data.analysis,
  }, null, 2);
}

function CandidateDetail({
  candidate,
  data,
  historyEntries,
  placement,
  copyFeedback,
  manualEvidenceText,
  onCopy,
  onRetryHistory,
  instanceId,
}: {
  candidate: TopicCandidate;
  data: TopicResponse;
  historyEntries: HistoryEntry[];
  placement: 'mobile' | 'desktop';
  copyFeedback: string;
  manualEvidenceText: string;
  onCopy: (candidate: TopicCandidate) => void;
  onRetryHistory: () => void;
  instanceId: string;
}) {
  const suffix = `${placement}-${encodeURIComponent(instanceId)}-${candidate.id}`;
  const historyMatches = useMemo(() => data.history.status === 'ok' ? findTopicHistoryMatches(candidate, historyEntries as never) : [], [candidate, data.history.status, historyEntries]);
  return (
    <article
      className={`topic-detail topic-detail--${placement}`}
      id={`topic-detail-${suffix}`}
      aria-labelledby={`topic-detail-title-${suffix}`}
    >
      <div className="topic-detail-heading">
        <div>
          <p className="topic-kicker">待研究 · 未核验</p>
          <h3 id={`topic-detail-title-${suffix}`}>{candidate.title}</h3>
          <p className="topic-selection-summary">
            {data.history.status === 'loading'
              ? '近期对照读取中，去重待核验'
              : data.history.status === 'error'
              ? '近期文章读取失败，去重待核验'
              : historyMatches.length
                ? `发现 ${historyMatches.length} 条近期词面重合，需人工核对`
                : '暂未发现明显词面重合，仍需核验'}
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => onCopy({ ...candidate, history_matches: historyMatches })}>
          复制证据包
        </button>
      </div>
      {copyFeedback && <p className="inline-feedback" role="status" aria-live="polite">{copyFeedback}</p>}
      {manualEvidenceText && (
        <label className="topic-evidence-fallback">
          <span>证据包文字</span>
          <textarea readOnly value={manualEvidenceText} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      {candidate.classification.risk_terms.length > 0 && (
        <p className="topic-risk-note">命中规则词：{candidate.classification.risk_terms.join('、')}；这是内容提示，不是事实认定，默认不建议直接写</p>
      )}

      <section className="topic-detail-section" aria-labelledby={`topic-signals-title-${suffix}`}>
        <h4 id={`topic-signals-title-${suffix}`}>热榜线索</h4>
        <ul className="topic-signals">
          {candidate.signals.map((signal, index) => (
            <li key={`${signal.platform}-${signal.provider}-${index}`}>
              <div>
                <strong>{platformLabel(signal.platform)}</strong>
                <span>{signal.rank ? `榜位 ${signal.rank}` : '榜位未提供'}</span>
                {signal.metric && <span>平台指标 {signal.metric}</span>}
                <span>抓取 {shanghaiTime(signal.fetched_at)}</span>
                <span>{signal.upstream_updated_at ? `榜单时间 ${shanghaiTime(signal.upstream_updated_at)}` : '榜单更新时间未提供'}</span>
              </div>
              {signal.url && <a href={signal.url} target="_blank" rel="noreferrer">打开原始话题</a>}
              {!signal.url && <small>平台未提供可直接打开的原始话题链接</small>}
            </li>
          ))}
        </ul>
        <p className="topic-detail-note">榜位和平台指标分别保留，未跨平台换算热度</p>
      </section>

      <section className="topic-detail-section" aria-labelledby={`topic-history-title-${suffix}`}>
        <h4 id={`topic-history-title-${suffix}`}>近期相关稿</h4>
        <p className="topic-detail-note">
          {data.history.status === 'loading' ? '近期对照读取中，去重待核验' : data.history.status === 'error' ? '近期文章读取失败，去重待核验' : `对照范围：最近 ${data.history.count} 篇标题 / 选题及当日运行${data.history.window_complete === false ? ` · ${data.history.window_days} 天覆盖可能不完整` : ''}${data.history.oldest_created ? ` · 最早 ${shanghaiTime(data.history.oldest_created)}` : ''}${data.history.unselected_current_runs ? ` · ${data.history.unselected_current_runs} 个当日运行未选题` : ''}${data.history.unfinished_topic_runs ? ` · ${data.history.unfinished_topic_runs} 个当日选题未成稿` : ''}`}
        </p>
        {data.history.notice && <p className="topic-detail-note">{data.history.notice}</p>}
        {data.history.status !== 'ok' ? (
          <>
            <p className="topic-detail-note">{data.history.status === 'loading' ? '近期对照读取中，待完成后再核验' : '读取失败不会当作“未发现重复”；可重试'}</p>
            {data.history.status === 'error' && <button type="button" className="secondary" onClick={onRetryHistory}>重试近期对照</button>}
          </>
        ) : historyMatches.length ? (
          <>
            <ul className="topic-related-list">
              {historyMatches.map((match) => (
                <li key={`${match.article_id}-${match.source}`}>
                  <strong>{match.title}</strong>
                  <span>{shanghaiTime(match.created)} · {match.writer === 'claude' ? 'Claude' : match.writer === 'gpt' ? 'GPT' : match.writer === 'uploaded' ? '上传稿 / 作者未记录' : '小鱼'}</span>
                  <small>{match.reason}：{match.matched_text}</small>
                </li>
              ))}
            </ul>
            <p className="topic-detail-note">命中只提示人工核对事件和正文；不自动淘汰</p>
          </>
        ) : (
          <p className="topic-detail-note">未发现明确词面重合；只比较最近 {data.history.count} 篇标题/选题及当日已有选题，不代表语义去重通过</p>
        )}
      </section>

      <section className="topic-detail-section" aria-labelledby={`topic-angle-title-${suffix}`}>
        <h4 id={`topic-angle-title-${suffix}`}>待核验角度</h4>
        {candidate.angles.length ? candidate.angles.map((angle, index) => (
          <details className="topic-angle" key={`${angle.question}-${index}`}>
            <summary>{angle.question}</summary>
            <small>{angle.reason}</small>
            <p className="topic-detail-note">还需证据</p>
            <ul>{angle.evidence_needed.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
        )) : <p className="topic-detail-note">暂无具体角度候选；需要先补足可核验的新节点，不用通用“为什么火”代替研究</p>}
        <p className="topic-unverified-note">规则候选只提示调查问题；没有调用模型、核实事实或生成文章</p>
      </section>
    </article>
  );
}

async function readBoardResponse(response: Response): Promise<BoardState> {
  if (response.status === 401 || response.status === 403) throw Object.assign(new Error('auth'), { authRequired: true });
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || !body || typeof body !== 'object' || Array.isArray(body)) throw new Error('board unavailable');
  const record = body as Record<string, unknown>;
  if (record.version !== 'haoduoyu-topic-board-1' || !record.platform || typeof record.platform !== 'object' || Array.isArray(record.platform) || !Array.isArray(record.rows) || !Array.isArray(record.candidates)) {
    throw new Error('board unavailable');
  }
  return { platform: record.platform as PlatformSummary, rows: record.rows as BoardRow[], candidates: record.candidates as TopicCandidate[], checked_at: typeof record.checked_at === 'string' ? record.checked_at : null };
}

async function readHistoryResponse(response: Response): Promise<{ summary: TopicResponse['history']; entries: HistoryEntry[] }> {
  if (response.status === 401 || response.status === 403) throw Object.assign(new Error('auth'), { authRequired: true });
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || !body || typeof body !== 'object' || Array.isArray(body)) throw new Error('history unavailable');
  const record = body as Record<string, unknown>;
  if (record.version !== 'haoduoyu-topic-history-1' || !record.history || typeof record.history !== 'object' || Array.isArray(record.history) || !Array.isArray(record.entries)) throw new Error('history unavailable');
  return { summary: record.history as TopicResponse['history'], entries: record.entries as HistoryEntry[] };
}

function loadingBoard(platform: BoardPlatform): BoardState {
  const label = platformLabel(platform);
  return { platform: { platform, label, provider: '等待读取', status: 'loading', fetched_at: null, attempted_at: null, upstream_updated_at: null, cache_hit: false, item_count: 0, source_count: null, returned_count: 0, invalid_count: 0, truncated: false, next_refresh_at: null, error: null, provider_attempts: [] }, rows: [], candidates: [], checked_at: null };
}

export default function TopicsPage() {
  const [boards, setBoards] = useState<Record<BoardPlatform, BoardState>>(() => Object.fromEntries(boardPlatforms.map((platform) => [platform, loadingBoard(platform)])) as Record<BoardPlatform, BoardState>);
  const [history, setHistory] = useState<HistoryState>(() => ({ status: 'loading', summary: { status: 'loading', scope: 'latest_50_plus_current_runs', count: 0, oldest_created: null, checked_at: '', window_days: 14, window_complete: null, unselected_current_runs: 0, unfinished_topic_runs: 0, notice: null }, entries: [] }));
  const [, setLoaded] = useState(false);
  const [, setRefreshing] = useState(false);
  const [refreshingPlatforms, setRefreshingPlatforms] = useState<Record<string, boolean>>({});
  const [authRequired, setAuthRequired] = useState(false);
  const [hasVerifiedResearchResult, setHasVerifiedResearchResult] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<Record<string, string>>({});
  const [manualEvidenceText, setManualEvidenceText] = useState<Record<string, string>>({});
  const requestSeq = useRef<Record<string, number>>({});
  const refreshingRef = useRef(false);
  const historySeq = useRef(0);
  const authEpoch = useRef(0);
  const controllers = useRef(new Map<string, AbortController>());
  const busyKeys = useRef(new Set<string>());
  const manualRound = useRef(0);

  const resetForAuth = useCallback(() => {
    authEpoch.current += 1;
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
    for (const key of Object.keys(requestSeq.current)) requestSeq.current[key] += 1;
    historySeq.current += 1;
    busyKeys.current.clear();
    refreshingRef.current = false;
    setRefreshing(false);
    setRefreshingPlatforms({});
    setBoards(Object.fromEntries(boardPlatforms.map((platform) => [platform, { ...loadingBoard(platform), platform: { ...loadingBoard(platform).platform, status: 'error', error: '身份已失效，请重新登录后读取' } }])) as Record<BoardPlatform, BoardState>);
    setHistory((current) => ({ ...current, status: 'error', summary: { ...current.summary, status: 'error' }, entries: [] }));
    setCopyFeedback({});
    setManualEvidenceText({});
    setAuthRequired(true);
    setLoaded(true);
  }, []);

  const loadPlatform = useCallback(async (platform: BoardPlatform, manual = false) => {
    const key = `platform:${platform}`;
    if (busyKeys.current.has(key)) return;
    busyKeys.current.add(key);
    const seq = requestSeq.current[key] = (requestSeq.current[key] ?? 0) + 1;
    const epoch = authEpoch.current;
    const controller = new AbortController();
    controllers.current.set(key, controller);
    setRefreshingPlatforms((current) => ({ ...current, [platform]: true }));
    try {
      const response = await fetch(`/api/topics?view=platform&platform=${encodeURIComponent(platform)}${manual ? '&refresh=1' : ''}`, { cache: 'no-store', signal: controller.signal });
      const next = await readBoardResponse(response);
      if (epoch !== authEpoch.current || requestSeq.current[key] !== seq) return;
      setBoards((current) => ({ ...current, [platform]: next }));
      setAuthRequired(false);
      setLoaded(true);
    } catch (error: unknown) {
      if (controller.signal.aborted || epoch !== authEpoch.current || requestSeq.current[key] !== seq) return;
      if (error && typeof error === 'object' && 'authRequired' in error) { resetForAuth(); return; }
      setBoards((current) => {
        const previous = current[platform];
        return { ...current, [platform]: { ...previous, platform: { ...previous.platform, status: previous.rows.length ? 'stale' : 'error', error: '此平台暂时无法读取；已有榜单保留。' } } };
      });
      setLoaded(true);
    } finally {
      if (epoch === authEpoch.current && requestSeq.current[key] === seq) {
        controllers.current.delete(key);
        busyKeys.current.delete(key);
        setRefreshingPlatforms((current) => ({ ...current, [platform]: false }));
      }
    }
  }, [resetForAuth]);

  const loadHistory = useCallback(async (manual = false) => {
    const key = 'history';
    if (busyKeys.current.has(key)) return;
    busyKeys.current.add(key);
    const seq = historySeq.current += 1;
    const epoch = authEpoch.current;
    const controller = new AbortController();
    controllers.current.set(key, controller);
    if (manual) setHistory((current) => ({ ...current, status: 'loading', summary: { ...current.summary, status: 'loading' } }));
    try {
      const response = await fetch('/api/topics?view=history', { cache: 'no-store', signal: controller.signal });
      const next = await readHistoryResponse(response);
      if (epoch !== authEpoch.current || historySeq.current !== seq) return;
      setHistory({ status: 'ok', summary: next.summary, entries: next.entries });
    } catch (error: unknown) {
      if (controller.signal.aborted || epoch !== authEpoch.current || historySeq.current !== seq) return;
      if (error && typeof error === 'object' && 'authRequired' in error) { resetForAuth(); return; }
      setHistory((current) => ({ ...current, status: 'error', summary: { ...current.summary, status: 'error', notice: '近期文章读取失败，选题去重待核验。' }, entries: [] }));
    } finally {
      if (epoch === authEpoch.current && historySeq.current === seq) { controllers.current.delete(key); busyKeys.current.delete(key); }
      setLoaded(true);
    }
  }, [resetForAuth]);

  const loadAll = useCallback(async (manual = false) => {
    if (manual && refreshingRef.current) return;
    const round = ++manualRound.current;
    if (manual) { refreshingRef.current = true; setRefreshing(true); }
    if (manual) void loadHistory(true);
    await Promise.all(boardPlatforms.map((platform) => loadPlatform(platform, manual)));
    if (manualRound.current === round && manual) { refreshingRef.current = false; setRefreshing(false); }
  }, [loadPlatform, loadHistory]);

  useEffect(() => {
    const start = window.setTimeout(() => { void loadAll(); void loadHistory(); }, 0);
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear();
      busyKeys.current.clear();
      refreshingRef.current = false;
      manualRound.current += 1;
      authEpoch.current += 1;
      setRefreshing(false); setRefreshingPlatforms({}); setAuthRequired(false);
      setBoards(Object.fromEntries(boardPlatforms.map((platform) => [platform, loadingBoard(platform)])) as Record<BoardPlatform, BoardState>);
      setHistory((current) => ({ ...current, status: 'loading', summary: { ...current.summary, status: 'loading' }, entries: [] }));
      setCopyFeedback({}); setManualEvidenceText({}); setLoaded(false);
      void loadAll(); void loadHistory();
    };
    window.addEventListener('pageshow', onPageShow);
    const activeControllers = controllers.current;
    return () => { window.clearTimeout(start); window.removeEventListener('pageshow', onPageShow); for (const controller of activeControllers.values()) controller.abort(); };
  }, [loadAll, loadHistory]);

  const data: TopicResponse = useMemo(() => ({ version: 'haoduoyu-topics-1', checked_at: boardPlatforms.map((platform) => boards[platform].checked_at).filter((value): value is string => !!value).sort().at(-1) ?? new Date().toISOString(), timezone: 'Asia/Shanghai', platforms: boardPlatforms.map((platform) => boards[platform].platform), history: history.summary, items: [], analysis: { mode: 'rules', state: 'needs_research', notice: '规则筛选与待核验研究问题；未调用模型，也未核实事实。' } }), [boards, history]);
  const merged = useMemo(() => mergeEntertainmentBoards(boardPlatforms.map((platform) => boards[platform])), [boards]);
  const pending = boardPlatforms.some((platform) => boards[platform].platform.status === 'loading' || refreshingPlatforms[platform]);
  const riskyCount = boardPlatforms.reduce((count, platform) => count + boards[platform].candidates.filter((candidate) => candidate.categories.length && !isEntertainmentCandidate(candidate)).length, 0);

  async function copyEvidence(candidate: TopicCandidate, rowId: string) {
    const historyMatches = history.status === 'ok' ? findTopicHistoryMatches(candidate, history.entries as never) : [];
    const pkg = evidencePackage({ ...candidate, history_matches: historyMatches }, data);
    setCopyFeedback((current) => ({ ...current, [rowId]: '' })); setManualEvidenceText((current) => ({ ...current, [rowId]: '' }));
    try { await navigator.clipboard.writeText(pkg); setCopyFeedback((current) => ({ ...current, [rowId]: '证据包已复制' })); }
    catch { setManualEvidenceText((current) => ({ ...current, [rowId]: pkg })); setCopyFeedback((current) => ({ ...current, [rowId]: '自动复制不可用，可选中下方内容手动复制' })); }
  }

  return <main className="studio-main topics-page">
    <StudioNav current="topics" />
    <section className={styles.pageStage} aria-labelledby="topic-research-title">
      {authRequired && <div className="topics-error" role="alert">请使用本人 ChatGPT 账号登录 <a href="/signin-with-chatgpt?return_to=%2Ftopics" target="_top">重新登录</a></div>}
      <ResearchPanel onRefreshed={async () => { await loadAll(); await loadHistory(); }} onResultAvailabilityChange={setHasVerifiedResearchResult} />

      <details className={styles.diagnostics}><summary>榜单来源与更新时间</summary><div>
      <div className={styles.sourceStrip} aria-label="两源更新状态" role="status">{boardPlatforms.map((platform) => <span key={platform} data-state={boards[platform].platform.status}>{platformLabel(platform)} · {statusLabel(boards[platform].platform)}{boards[platform].platform.fetched_at ? ` · 抓取 ${shanghaiTime(boards[platform].platform.fetched_at)}` : ''}</span>)}</div>
        <p>仅使用今日头条、微博；来源内顺序交替展示，多来源同题优先。不相加热度、不换算跨平台榜位。相同标题或同一原始话题链接合并；不同标题仍需核对是否同一事件。</p>
        {boardPlatforms.map((platform) => { const source = boards[platform].platform; return <div key={platform}>
          <strong>{source.label} · {statusLabel(source)}</strong>
          <p>供应商 {source.provider} · 抓取 {shanghaiTime(source.fetched_at)} · 最近尝试 {shanghaiTime(source.attempted_at)}</p>
          <p>来源 {source.source_count ?? '未知'} 条 · 已读 {source.returned_count} 条 · 无效 {source.invalid_count} 条{source.truncated ? ' · 已达安全读取上限' : ''} · 文娱初筛 {boards[platform].candidates.filter(isEntertainmentCandidate).length} 条</p>
          <p>{source.upstream_updated_at ? `上游榜单时间 ${shanghaiTime(source.upstream_updated_at)}` : '上游未提供榜单更新时间；抓取时间不等于事件发生时间'}{source.cache_hit ? ' · 此次使用缓存' : ''}</p>
          {source.error && <p className={styles.noticeWarn}>{source.error}{source.status === 'stale' ? ' 旧缓存不参与本次精选。' : ''}</p>}
          {source.next_refresh_at && <p>上游刷新冷却至 {shanghaiTime(source.next_refresh_at)}</p>}
          {source.provider_attempts.map((attempt, index) => <p key={index}>{attempt.provider} · {providerAttemptLabel(attempt)} · {attempt.duration_ms} ms · <a href={attempt.url} target="_blank" rel="noreferrer">来源接口</a></p>)}
        </div>; })}
        <p>原始榜单用于发现线索，事件核验结果以上方简报为准。没有作品词或分类标记的话题保留在“待分类线索”。{riskyCount > 0 ? `本次另有 ${riskyCount} 条私生活线索未纳入。` : ''}</p>
      </div></details>

      <details className={styles.diagnostics} style={{ marginTop: 24 }} open={!hasVerifiedResearchResult} data-unverified-board="true"><summary>原始榜单线索（未核验）</summary>
        <p className={styles.notice}>以下为热榜规则初筛线索，尚未完成网页核验，不属于本次研究精选。</p>
      {history.status !== 'ok' && <div className={styles.historyStatus} role="status"><span>{history.status === 'loading' ? '近期对照读取中 · 去重待核验' : '近期文章读取失败 · 去重待核验'}</span>{history.status === 'error' && <button type="button" className={styles.historyRetry} onClick={() => void loadHistory(true)}>重试</button>}</div>}
        <MergedEntertainmentBoard featured={merged.featured} additional={merged.additional} unclassified={merged.unclassified} pending={pending} renderDetail={(candidate) => <CandidateDetail candidate={candidate} data={data} historyEntries={history.entries} placement="mobile" instanceId={`merged-${candidate.id}`} copyFeedback={copyFeedback[candidate.id] ?? ''} manualEvidenceText={manualEvidenceText[candidate.id] ?? ''} onCopy={(detailedCandidate) => void copyEvidence(detailedCandidate, candidate.id)} onRetryHistory={() => void loadHistory(true)} />} />
      </details>
    </section>
  </main>;
}
