export type TopicPlatform = 'weibo' | 'douyin' | 'zhihu' | 'toutiao';
export type PlatformStatus = 'ok' | 'empty' | 'stale' | 'error' | 'not_implemented';
export type ProviderAttemptStatus = 'ok' | 'empty' | 'http_error' | 'auth_required' | 'timeout' | 'network_error' | 'redirect_mode_unsupported' | 'redirect_rejected' | 'invalid_json' | 'invalid_shape' | 'invalid_items' | 'response_too_large' | 'invalid_response';
export type ProviderAttempt = {
  provider: string;
  url: string;
  status: ProviderAttemptStatus;
  http_status: number | null;
  duration_ms: number;
  redirect_count?: number;
  redirect_target?: string | null;
};

export type TopicSignal = {
  platform: TopicPlatform;
  provider: string;
  rank: number | null;
  metric: string | null;
  url: string | null;
  fetched_at: string | null;
  upstream_updated_at: string | null;
  source_summary?: string | null;
  source_title?: string;
  source_categories?: string[];
};

export type TopicCandidate = {
  id: string;
  topic: string;
  title: string;
  categories: string[];
  classification: { mode: 'keyword'; matched_terms: string[]; uncertain: boolean; risk_terms: string[] };
  signals: TopicSignal[];
  history_matches: Array<{
    article_id: string;
    title: string;
    created: string;
    writer: string;
    run_kind: string;
    reason: string;
    matched_text: string;
    source: 'article' | 'current_run';
  }>;
  angles: Array<{
    question: string;
    reason: string;
    evidence_needed: string[];
    state: 'unverified_rule_candidate';
  }>;
  research_state: 'needs_verification';
};

export type PlatformResult = {
  platform: TopicPlatform;
  label: string;
  provider: string;
  status: PlatformStatus;
  fetched_at: string | null;
  attempted_at: string | null;
  upstream_updated_at: string | null;
  cache_hit: boolean;
  item_count: number;
  error: string | null;
  provider_attempts: ProviderAttempt[];
  source_count?: number | null;
  returned_count?: number;
  invalid_count?: number;
  truncated?: boolean;
  next_refresh_at?: string | null;
  items: Array<{ topic: string; title: string; rank: number | null; metric: string | null; url: string | null; label?: string | null; query_word?: string | null; source_summary?: string | null; source_categories?: string[] }>;
};

type Source = { provider: string; url: string };
type PlatformDefinition = { label: string; primary: Source; fallback?: Source };
type NormalizedItem = { topic: string; title: string; rank: number | null; metric: string | null; url: string | null; label: string | null; query_word: string | null; source_summary: string | null; source_categories: string[] };
type CacheRecord = {
  items: NormalizedItem[];
  sourceCount: number | null;
  invalidCount: number;
  truncated: boolean;
  provider: string;
  fetchedAt: string;
  upstreamUpdatedAt: string | null;
  status: 'ok' | 'empty';
  providerAttempts: ProviderAttempt[];
};

type FailedAttempts = { at: number; attempts: ProviderAttempt[] };

class SourceReadFailure extends Error {
  constructor(readonly attempt: ProviderAttempt) { super(attempt.status); }
}

class RadarFetchFailure extends Error {
  constructor(readonly attempts: ProviderAttempt[]) { super('all public sources failed'); }
}

const MAX_ITEMS = 200;
const MAX_TITLE = 200;
const CACHE_MS = 5 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 60 * 1000;
const STALE_MAX_MS = 24 * 60 * 60 * 1000;
const SOURCE_TIMEOUT_MS = 7_000;
const TOUTIAO_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 1_000_000;

// Only fixed, public JSON endpoints are contacted. User input is never used to
// construct an upstream URL and redirects are rejected below.
export const TOPIC_PLATFORMS: Record<TopicPlatform, PlatformDefinition> = {
  weibo: {
    label: '微博',
    primary: { provider: 'xxapi.cn', url: 'https://v2.xxapi.cn/api/weibohot' },
    fallback: { provider: '60s.viki.moe', url: 'https://60s.viki.moe/v2/weibo' },
  },
  douyin: {
    label: '抖音',
    primary: { provider: 'xxapi.cn', url: 'https://v2.xxapi.cn/api/douyinhot' },
    fallback: { provider: '60s.viki.moe', url: 'https://60s.viki.moe/v2/douyin' },
  },
  zhihu: {
    label: '知乎',
    primary: { provider: '60s.viki.moe', url: 'https://60s.viki.moe/v2/zhihu' },
  },
  toutiao: {
    label: '今日头条',
    primary: { provider: 'toutiao.com', url: 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc' },
    fallback: { provider: '60s.viki.moe', url: 'https://60s.viki.moe/v2/toutiao' },
  },
};

const entertainmentRules: Array<{ category: string; expression: RegExp }> = [
  { category: '影视剧', expression: /热播剧|电视剧|新剧|剧集|大结局|追剧|开播|定档|开机|剧场版|网剧|连续剧|戏份|超点|杀青|选角|剧照|花絮|配音|短剧|微短剧/ },
  { category: '电影', expression: /电影|票房|上映|首映|撤档|排片|影院|预告片|电影节|导演剪辑/ },
  { category: '综艺', expression: /综艺|真人秀|节目|演唱会|演出|舞台|红毯|颁奖|晚会|音乐节|巡演|选秀|新歌|新专辑|专辑发布|单曲|主题曲|唱片|音乐剧|相声|脱口秀/ },
  // Generic event words such as “亮相” or “官宣” can describe sports and
  // other non-entertainment stories, so they are not sufficient by themselves.
  { category: '明星活动', expression: /演员|导演|编剧|歌手|艺人|剧组|主创|角色|表演|宣传照|时装周|时尚大秀|品牌大秀|(?:香奈儿|迪奥|路易威登|古驰|普拉达|chanel|dior|louis vuitton|gucci|prada).{0,8}大秀/i },
  { category: '文娱事件', expression: /文娱|娱乐|影视|收视|片单|片方|播出平台|制作方|影视公司|影展/ },
];
const riskRule = /恋情|恋爱|分手|离婚|私生活|出轨|偷拍|私照|爆料|举报|指控|丑闻|塌房|网暴|家暴|性侵|侵害|未成年|私生|绯闻|生子|女儿|儿子|港媒拍到|掉代言|追责|不被同情|绅士手/;
const angleRules: Array<{ expression: RegExp; question: (topic: string) => string; evidence: string[] }> = [
  {
    expression: /票房|排片|票房纪录|预售|票房榜/,
    question: (topic) => `围绕“${topic}”，这个指标变化对应的是档期、排片还是观众反馈？`,
    evidence: ['原始数据口径、统计平台与截止时间', '不同来源对排片或观众反馈的佐证', '与此前报道或旧稿的实质差异'],
  },
  {
    expression: /电视剧|热播剧|新剧|剧集|大结局|追剧|开播|定档|角色/,
    question: (topic) => `围绕“${topic}”，这一新节点具体改变了哪段人物关系或叙事选择？`,
    evidence: ['官方播出或上线信息', '可核验的剧情或完整公开物料', '与近期相关旧稿的差异'],
  },
  {
    expression: /综艺|节目|舞台|演出|演唱会|红毯|颁奖|音乐节/,
    question: (topic) => `围绕“${topic}”，这次公开活动有哪些可核实的新变化，影响了作品或观众体验的哪个环节？`,
    evidence: ['主办方或节目方公告、完整公开物料', '事件发生时间与可确认的后续变化', '与近期相关旧稿的差异'],
  },
  {
    expression: /演员|导演|歌手|明星|艺人|表演|作品/,
    question: (topic) => `围绕“${topic}”，这次公开作品或活动中有哪些具体表达值得和此前作品对照？`,
    evidence: ['完整公开作品、活动资料或原始采访', '可逐项说明的作品对照材料', '与近期相关旧稿的差异'],
  },
];

function safeText(value: unknown, limit: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit);
  return text || null;
}

const officialLinkHosts: Record<TopicPlatform, string[]> = {
  weibo: ['weibo.com', 'weibo.cn'],
  douyin: ['douyin.com'],
  zhihu: ['zhihu.com'],
  toutiao: ['toutiao.com'],
};
const providerRedirectHosts: Record<string, string[]> = {
  'xxapi.cn': ['v2.xxapi.cn'],
  '60s.viki.moe': ['60s.viki.moe'],
  'toutiao.com': ['www.toutiao.com', 'toutiao.com'],
};

function safeHttpsUrl(value: unknown, platform: TopicPlatform): string | null {
  const raw = safeText(value, 2_048);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    const officialHost = officialLinkHosts[platform].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !officialHost || url.href.length > 2_048) return null;
    return url.href;
  } catch {
    return null;
  }
}

function parseTimestamp(value: unknown): string | null {
  let millis: number;
  if (typeof value === 'number' && Number.isFinite(value)) {
    millis = value < 10_000_000_000 ? value * 1000 : value;
  } else if (typeof value === 'string' && value.trim()) {
    const numeric = /^\d{10,13}$/.test(value.trim()) ? Number(value.trim()) : NaN;
    millis = Number.isFinite(numeric) ? (numeric < 10_000_000_000 ? numeric * 1000 : numeric) : Date.parse(value);
  } else {
    return null;
  }
  if (!Number.isFinite(millis) || millis < Date.UTC(2000, 0, 1) || millis > Date.now() + 24 * 60 * 60 * 1000) return null;
  return new Date(millis).toISOString();
}

function firstField(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) if (record[field] !== undefined && record[field] !== null) return record[field];
  return null;
}

function extractArray(payload: unknown, platform?: TopicPlatform): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  if (platform === 'toutiao' && Array.isArray(root.data)) {
    if (root.status !== undefined && root.status !== 'success') return null;
    const pinned = Array.isArray(root.fixed_top_data) ? root.fixed_top_data : [];
    return [
      ...pinned.map((row) => row && typeof row === 'object' && !Array.isArray(row) ? { ...(row as Record<string, unknown>), __haoduoyu_pinned: true } : row),
      ...root.data.map((row, index) => row && typeof row === 'object' && !Array.isArray(row) ? { ...(row as Record<string, unknown>), __haoduoyu_source_rank: index + 1 } : row),
    ];
  }
  for (const value of [root.data, root.list, root.items, root.result]) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      for (const key of ['data', 'list', 'items', 'result']) if (Array.isArray(nested[key])) return nested[key] as unknown[];
    }
  }
  return null;
}

function extractUpdatedAt(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  const nested = root.data && typeof root.data === 'object' && !Array.isArray(root.data)
    ? root.data as Record<string, unknown>
    : {};
  // Generic timestamps can describe the API response rather than the ranking.
  return parseTimestamp(firstField(root, ['hotlist_updated_at', 'hotlistUpdatedAt', 'list_updated_at', 'listUpdatedAt'])
    ?? firstField(nested, ['hotlist_updated_at', 'hotlistUpdatedAt', 'list_updated_at', 'listUpdatedAt']));
}

function normalizeRows(rows: unknown[], platform: TopicPlatform): { items: NormalizedItem[]; sourceCount: number; invalidCount: number; truncated: boolean } | null {
  const sourceCount = rows.length;
  const truncated = sourceCount > MAX_ITEMS;
  if (truncated) rows = rows.slice(0, MAX_ITEMS);
  const output: NormalizedItem[] = [];
  let invalidCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || typeof row !== 'object' || Array.isArray(row)) { invalidCount += 1; continue; }
    const record = row as Record<string, unknown>;
    const title = safeText(firstField(record, ['title', 'Title', 'word', 'name', 'keyword', 'note', 'QueryWord']), MAX_TITLE);
    if (!title) { invalidCount += 1; continue; }
    const rawRank = firstField(record, ['rank', 'Rank', 'ranking', 'index', 'position']);
    const explicitRank = typeof rawRank === 'number' ? rawRank : typeof rawRank === 'string' && /^\d{1,4}$/.test(rawRank) ? Number(rawRank) : NaN;
    const sourceRank = Number(record.__haoduoyu_source_rank);
    const isToutiaoPinned = platform === 'toutiao' && record.__haoduoyu_pinned === true;
    const fallbackRank = platform === 'toutiao' ? (isToutiaoPinned ? null : Number.isInteger(sourceRank) ? sourceRank : index + 1) : index + 1;
    const rank = Number.isInteger(explicitRank) && explicitRank > 0 && explicitRank <= 10_000 ? explicitRank : fallbackRank;
    const metric = safeText(firstField(record, ['hot', 'hot_value', 'HotValue', 'num', 'heat', 'score']), 80);
    const url = safeHttpsUrl(firstField(record, ['url', 'Url', 'link', 'mobile_url', 'mobil_url', 'share_url']), platform);
    const sourceLabel = safeText(firstField(record, ['label', 'Label']), 80);
    const label = isToutiaoPinned
      ? ['置顶', sourceLabel].filter((item, itemIndex, values) => !!item && values.indexOf(item) === itemIndex).join(' · ').slice(0, 80)
      : sourceLabel;
    const rawCategories = firstField(record, ['InterestCategory', 'categories', 'category']);
    const source_categories = (Array.isArray(rawCategories) ? rawCategories : [rawCategories])
      .map((value) => safeText(value, 60)).filter((value): value is string => !!value).slice(0, 8);
    // Only an explicit summary field is retained; tags and query words are not article text.
    const source_summary = safeText(firstField(record, ['summary', 'Summary', 'abstract', 'description']), 800);
    output.push({ topic: title, title, rank, metric, url, label,
      query_word: safeText(firstField(record, ['query_word', 'QueryWord']), MAX_TITLE), source_summary, source_categories });
  }
  if (rows.length > 0 && output.length === 0) return null;
  return { items: output, sourceCount, invalidCount, truncated };
}

type RedirectState = { count: number; target: string | null };

function providerAttempt(source: Source, status: ProviderAttemptStatus, startedAt: number, httpStatus: number | null = null, redirect: RedirectState = { count: 0, target: null }): ProviderAttempt {
  return {
    provider: source.provider,
    url: source.url,
    status,
    http_status: httpStatus,
    duration_ms: Math.max(0, Math.min(60_000, Date.now() - startedAt)),
    redirect_count: redirect.count,
    redirect_target: redirect.target,
  };
}

function fetchFailureStatus(error: unknown): ProviderAttemptStatus {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message).toLowerCase() : '';
  if (message.includes('redirect') && (message.includes('manual') || message.includes('unsupported') || message.includes('not supported'))) return 'redirect_mode_unsupported';
  if (message.includes('redirect')) return 'redirect_rejected';
  return 'network_error';
}

async function readSource(source: Source, platform: TopicPlatform, fetcher: typeof fetch, timeoutMs: number): Promise<{ items: NormalizedItem[]; sourceCount: number; invalidCount: number; truncated: boolean; updatedAt: string | null; attempt: ProviderAttempt }> {
  const startedAt = Date.now();
  const sourceURL = new URL(source.url);
  const allowedRedirectHosts = providerRedirectHosts[source.provider] ?? [];
  let requestURL = sourceURL;
  let redirects: RedirectState = { count: 0, target: null };
  const deadline = AbortSignal.timeout(timeoutMs);
  let response: Response;
  while (true) {
    try {
      response = await fetcher(requestURL.href, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        signal: deadline,
      });
    } catch (error) {
      throw new SourceReadFailure(providerAttempt(source, fetchFailureStatus(error), startedAt, null, redirects));
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;

    const location = response.headers.get('location');
    const redirectTarget = location ? redirectDisplayTarget(location, requestURL) : null;
    if (location && isAuthenticationRedirect(location, requestURL)) {
      throw new SourceReadFailure(providerAttempt(source, 'auth_required', startedAt, response.status, { count: redirects.count, target: redirectTarget }));
    }
    const destination = location ? parseSafeProviderRedirect(location, requestURL, allowedRedirectHosts) : null;
    if (!destination || redirects.count >= 1) {
      throw new SourceReadFailure(providerAttempt(source, 'redirect_rejected', startedAt, response.status, {
        count: redirects.count,
        target: redirectTarget,
      }));
    }
    redirects = { count: redirects.count + 1, target: redirectTarget };
    requestURL = destination;
  }
  if (!response.ok) throw new SourceReadFailure(providerAttempt(source, 'http_error', startedAt, response.status, redirects));
  if (/text\/html|application\/xhtml/i.test(response.headers.get('content-type') ?? '')) {
    throw new SourceReadFailure(providerAttempt(source, 'auth_required', startedAt, response.status, redirects));
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(response, deadline);
  } catch (error) {
    const parsedStatus: ProviderAttemptStatus = fetchFailureStatus(error) === 'timeout'
      ? 'timeout'
      : error instanceof SyntaxError
      ? 'invalid_json'
      : error instanceof Error && error.message === 'upstream response too large'
        ? 'response_too_large'
        : 'invalid_response';
    const status: ProviderAttemptStatus = source.provider === 'toutiao.com' && parsedStatus === 'invalid_json' ? 'auth_required' : parsedStatus;
    throw new SourceReadFailure(providerAttempt(source, status, startedAt, response.status, redirects));
  }
  if (platform === 'toutiao' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const upstreamStatus = (payload as Record<string, unknown>).status;
    if (upstreamStatus !== undefined && upstreamStatus !== 'success') throw new SourceReadFailure(providerAttempt(source, 'auth_required', startedAt, response.status, redirects));
  }
  const rows = extractArray(payload, platform);
  if (!rows) throw new SourceReadFailure(providerAttempt(source, 'invalid_shape', startedAt, response.status, redirects));
  const normalized = normalizeRows(rows, platform);
  if (!normalized) throw new SourceReadFailure(providerAttempt(source, 'invalid_items', startedAt, response.status, redirects));
  const status = normalized.items.length ? 'ok' : 'empty';
  return { ...normalized, updatedAt: extractUpdatedAt(payload), attempt: providerAttempt(source, status, startedAt, response.status, redirects) };
}

function redirectDisplayTarget(location: string, currentURL: URL): string | null {
  try {
    const target = new URL(location, currentURL);
    if (!['http:', 'https:'].includes(target.protocol)) return null;
    return `${target.protocol}//${target.hostname}${target.pathname.slice(0, 1_000)}`;
  } catch {
    return null;
  }
}

function isAuthenticationRedirect(location: string, currentURL: URL): boolean {
  try {
    const target = new URL(location, currentURL);
    return /(?:^|\.)(?:sso|login|passport|auth)(?:\.|$)/i.test(target.hostname)
      || /\/(?:login|signin|sign-in|auth|oauth|passport|sso)(?:\/|$)/i.test(target.pathname);
  } catch {
    return false;
  }
}

function parseSafeProviderRedirect(location: string, currentURL: URL, allowedHosts: string[]): URL | null {
  try {
    const target = new URL(location, currentURL);
    const hostname = target.hostname.toLowerCase();
    const providerHost = allowedHosts.includes(hostname);
    if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443')
        || !providerHost || target.href.length > 2_048) return null;
    return target;
  } catch {
    return null;
  }
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) throw new Error('upstream response too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('upstream response body missing');
  const onAbort = () => { void reader.cancel(signal.reason).catch(() => undefined); };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  const throwIfTimedOut = () => {
    if (signal.aborted) throw signal.reason ?? Object.assign(new Error('request timed out'), { name: 'TimeoutError' });
  };
  try {
    while (true) {
      throwIfTimedOut();
      const { done, value } = await reader.read();
      throwIfTimedOut();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('upstream response too large');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (signal.aborted && !(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))) {
      throw signal.reason ?? Object.assign(new Error('request timed out'), { name: 'TimeoutError' });
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  throwIfTimedOut();
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function normalizeTopic(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]+/gu, '');
}

// Book-title punctuation identifies a work reference, not a claim about
// someone's real private life. Risk checks still inspect all surrounding text.
export function topicOutsideWorkTitles(topic: string): string {
  return topic.replace(/《[^》\n]{1,80}》/g, '《作品》');
}

export function classifyTopic(topic: string, sourceCategories: string[] = []) {
  const categories: string[] = [];
  const matchedTerms: string[] = [];
  for (const rule of entertainmentRules) {
    const match = topic.match(rule.expression);
    if (match) {
      categories.push(rule.category);
      matchedTerms.push(match[0]);
    }
  }
  if (sourceCategories.some((value) => /^(entertainment|movie|film|television|music|文娱|娱乐|影视|电影|音乐)$/i.test(value))) {
    if (!categories.length) categories.push('文娱事件');
    matchedTerms.push('来源文娱分类');
  }
  const riskMatches = topicOutsideWorkTitles(topic).match(new RegExp(riskRule.source, 'g')) ?? [];
  return {
    categories,
    classification: {
      mode: 'keyword' as const,
      matched_terms: [...new Set(matchedTerms)].slice(0, 8),
      uncertain: categories.length === 0,
      risk_terms: [...new Set(riskMatches)].slice(0, 5),
    },
  };
}

function createAngle(topic: string, matchedTerms: string[], risk: string[]) {
  if (risk.length) return [];
  const rule = angleRules.find((item) => item.expression.test(topic));
  if (!rule) return [];
  return [{
    question: rule.question(topic),
    reason: `规则线索：${matchedTerms.join('、') || '相关话题词'}；这是待研究问题，不是事实判断。`,
    evidence_needed: rule.evidence,
    state: 'unverified_rule_candidate' as const,
  }];
}

export function buildTopicCandidates(platforms: PlatformResult[]): TopicCandidate[] {
  const byNormalizedTopic = new Map<string, TopicCandidate>();
  for (const result of platforms) {
    if (!['ok', 'empty', 'stale'].includes(result.status)) continue;
    for (const item of result.items) {
      const normalized = normalizeTopic(item.topic);
      if (!normalized) continue;
      let candidate = byNormalizedTopic.get(normalized);
      if (!candidate) {
        const { categories, classification } = classifyTopic(item.topic, item.source_categories);
        candidate = {
          id: normalized.slice(0, 180),
          topic: item.topic,
          title: item.title,
          categories,
          classification,
          signals: [],
          history_matches: [],
          angles: createAngle(item.topic, classification.matched_terms, classification.risk_terms),
          research_state: 'needs_verification',
        };
        byNormalizedTopic.set(normalized, candidate);
      }
      const incoming = classifyTopic(item.topic, item.source_categories);
      candidate.categories = [...new Set([...candidate.categories, ...incoming.categories])];
      candidate.classification.matched_terms = [...new Set([...candidate.classification.matched_terms, ...incoming.classification.matched_terms])];
      candidate.classification.uncertain = !candidate.categories.length;
      candidate.signals.push({
        platform: result.platform,
        provider: result.provider,
        rank: item.rank,
        metric: item.metric,
        url: item.url,
        fetched_at: result.fetched_at,
        upstream_updated_at: result.upstream_updated_at,
        source_summary: item.source_summary ?? null,
        source_title: item.title,
        source_categories: item.source_categories ?? [],
      });
    }
  }
  return [...byNormalizedTopic.values()];
}

export class TopicRadarService {
  private readonly caches = new Map<TopicPlatform, CacheRecord>();
  private readonly lastAttempts = new Map<TopicPlatform, number>();
  private readonly lastFailures = new Map<TopicPlatform, FailedAttempts>();
  private readonly inFlight = new Map<TopicPlatform, Promise<PlatformResult>>();

  constructor(private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = () => Date.now(), private readonly sourceTimeoutMs = SOURCE_TIMEOUT_MS, private readonly toutiaoTimeoutMs = TOUTIAO_TIMEOUT_MS) {}

  async load(refresh = false, selected?: TopicPlatform): Promise<PlatformResult[]> {
    const selectedPlatforms = selected ? [selected] : ['toutiao', 'weibo'] as TopicPlatform[];
    return Promise.all(selectedPlatforms.map((platform) => this.loadPlatform(platform, refresh)));
  }

  private async loadPlatform(platform: TopicPlatform, refresh: boolean): Promise<PlatformResult> {
    const definition = TOPIC_PLATFORMS[platform];
    const timestamp = this.now();
    const cached = this.caches.get(platform);
    const lastAttempt = this.lastAttempts.get(platform) ?? null;
    const lastFailure = this.lastFailures.get(platform) ?? null;
    const failedAfterCache = !!cached && lastFailure !== null && lastFailure.at > Date.parse(cached.fetchedAt);
    if (cached && !refresh && timestamp - Date.parse(cached.fetchedAt) < CACHE_MS) {
      const result = this.toResult(platform, cached, true, lastAttempt ? new Date(lastAttempt).toISOString() : cached.fetchedAt);
      return failedAfterCache ? { ...result, status: 'stale', error: '上游读取失败，当前显示旧缓存。', provider_attempts: lastFailure.attempts } : result;
    }
    if (this.inFlight.has(platform)) return this.inFlight.get(platform)!;
    if (lastAttempt !== null && timestamp - lastAttempt < REFRESH_COOLDOWN_MS) {
      if (cached && timestamp - Date.parse(cached.fetchedAt) <= STALE_MAX_MS) {
        const result = this.toResult(platform, cached, true, new Date(lastAttempt).toISOString());
        return failedAfterCache ? { ...result, status: 'stale', error: '上游读取失败，当前显示旧缓存。', provider_attempts: lastFailure.attempts } : result;
      }
      return {
        platform, label: definition.label, provider: cached?.provider ?? definition.primary.provider,
        status: 'error', fetched_at: null, attempted_at: new Date(lastAttempt).toISOString(),
        upstream_updated_at: null, cache_hit: false, item_count: 0,
        source_count: null, returned_count: 0, truncated: false,
        invalid_count: 0,
        next_refresh_at: new Date(lastAttempt + REFRESH_COOLDOWN_MS).toISOString(),
        error: '刷新过于频繁，稍后再试。', provider_attempts: lastFailure?.attempts ?? [], items: [],
      };
    }

    this.lastAttempts.set(platform, timestamp);
    const request: Promise<PlatformResult> = this.fetchPlatform(platform, definition).then((fetched) => {
      this.caches.set(platform, fetched);
      this.lastFailures.delete(platform);
      return this.toResult(platform, fetched, false, new Date(timestamp).toISOString());
    }).catch((error: unknown) => {
      const failedAt = this.now();
      const attempts = error instanceof RadarFetchFailure ? error.attempts : [];
      this.lastFailures.set(platform, { at: failedAt, attempts });
      if (cached && failedAt - Date.parse(cached.fetchedAt) <= STALE_MAX_MS) {
        return {
          ...this.toResult(platform, cached, true, new Date(failedAt).toISOString()),
          status: 'stale',
          next_refresh_at: new Date(failedAt + REFRESH_COOLDOWN_MS).toISOString(),
          error: '上游读取失败，当前显示旧缓存。',
          provider_attempts: attempts,
        };
      }
      return {
        platform, label: definition.label, provider: definition.primary.provider, status: 'error',
        fetched_at: null, attempted_at: new Date(failedAt).toISOString(), upstream_updated_at: null,
        cache_hit: false, item_count: 0, source_count: null, returned_count: 0, truncated: false,
        invalid_count: 0,
        next_refresh_at: new Date(failedAt + REFRESH_COOLDOWN_MS).toISOString(),
        error: '暂时无法读取此平台的公开热榜。', provider_attempts: attempts, items: [],
      };
    });
    this.inFlight.set(platform, request);
    try {
      return await request;
    } finally {
      if (this.inFlight.get(platform) === request) this.inFlight.delete(platform);
    }
  }

  private async fetchPlatform(platform: TopicPlatform, definition: PlatformDefinition): Promise<CacheRecord> {
    const sources = definition.fallback ? [definition.primary, definition.fallback] : [definition.primary];
    const attempts: ProviderAttempt[] = [];
    for (const source of sources) {
      try {
        const response = await readSource(source, platform, this.fetcher, source.provider === 'toutiao.com' ? this.toutiaoTimeoutMs : this.sourceTimeoutMs);
        attempts.push(response.attempt);
        return {
          items: response.items,
          sourceCount: response.sourceCount,
          invalidCount: response.invalidCount,
          truncated: response.truncated,
          provider: source.provider,
          fetchedAt: new Date(this.now()).toISOString(),
          upstreamUpdatedAt: response.updatedAt,
          status: response.items.length ? 'ok' : 'empty',
          providerAttempts: attempts,
        };
      } catch (error) {
        if (error instanceof SourceReadFailure) {
          attempts.push(error.attempt);
          if (error.attempt.status === 'auth_required' || error.attempt.http_status === 401 || error.attempt.http_status === 403) break;
        } else attempts.push(providerAttempt(source, 'network_error', this.now()));
      }
    }
    throw new RadarFetchFailure(attempts);
  }

  private toResult(platform: TopicPlatform, record: CacheRecord, cacheHit: boolean, attemptedAt: string): PlatformResult {
    return {
      platform,
      label: TOPIC_PLATFORMS[platform].label,
      provider: record.provider,
      status: record.status,
      fetched_at: record.fetchedAt,
      attempted_at: attemptedAt,
      upstream_updated_at: record.upstreamUpdatedAt,
      cache_hit: cacheHit,
      item_count: record.items.length,
      source_count: record.sourceCount,
      returned_count: record.items.length,
      invalid_count: record.invalidCount,
      truncated: record.truncated,
      next_refresh_at: new Date(Date.parse(attemptedAt) + REFRESH_COOLDOWN_MS).toISOString(),
      error: null,
      provider_attempts: record.providerAttempts,
      items: record.items,
    };
  }
}

const radar = new TopicRadarService();

export function loadTopicPlatforms(refresh = false, selected?: TopicPlatform) {
  return radar.load(refresh, selected);
}
