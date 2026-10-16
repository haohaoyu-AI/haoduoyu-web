import {
  buildTopicCandidates, loadTopicPlatforms, normalizeTopic, type PlatformResult, type TopicPlatform,
} from './topic-radar';
import { readRecentTopicHistory, type TopicHistory } from './topics-history';
import { findTopicHistoryMatches } from './topic-history-match';

export const TOPIC_RESPONSE_VERSION = 'haoduoyu-topics-1';
type PublicPlatformSummary = Omit<PlatformResult, 'items'>;

function failedHistory(now: Date): TopicHistory {
  return {
    status: 'error', scope: 'latest_50_plus_current_runs', count: 0,
    oldest_created: null, checked_at: now.toISOString(), window_days: 14,
    window_complete: null, unselected_current_runs: 0, unfinished_topic_runs: 0,
    notice: '近期文章读取失败，选题去重待核验。', entries: [],
  };
}

function platformSummary(platform: PlatformResult) {
  return {
    platform: platform.platform,
    label: platform.label,
    provider: platform.provider,
    status: platform.status,
    fetched_at: platform.fetched_at,
    attempted_at: platform.attempted_at,
    upstream_updated_at: platform.upstream_updated_at,
    cache_hit: platform.cache_hit,
    item_count: platform.item_count,
    error: platform.error,
    provider_attempts: platform.provider_attempts,
    source_count: platform.source_count ?? platform.item_count,
    returned_count: platform.returned_count ?? platform.item_count,
    invalid_count: platform.invalid_count ?? 0,
    truncated: platform.truncated ?? false,
    next_refresh_at: platform.next_refresh_at ?? null,
  };
}

export const TOPIC_BOARD_PLATFORMS = ['toutiao', 'weibo'] as const;
export type TopicBoardPlatform = typeof TOPIC_BOARD_PLATFORMS[number];
export type TopicBoardRow = { row_id: string; candidate_id: string; title: string; rank: number | null; metric: string | null; url: string | null };

export async function getTopicBoard(platform: TopicBoardPlatform, refresh = false) {
  const checkedAt = new Date().toISOString();
  const [result] = await loadTopicPlatforms(refresh, platform);
  const candidates = buildTopicCandidates([result]);
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const occurrence = new Map<string, number>();
  const rows = result.items.map((item, index) => {
    const candidateId = normalizeTopic(item.topic).slice(0, 180);
    const count = (occurrence.get(candidateId) ?? 0) + 1;
    occurrence.set(candidateId, count);
    return { row_id: `${platform}:${index + 1}:${count}:${candidateId}`, candidate_id: candidateIds.has(candidateId) ? candidateId : '', title: item.title, rank: item.rank, metric: item.metric, url: item.url, label: item.label, query_word: item.query_word };
  });
  return { version: 'haoduoyu-topic-board-1', checked_at: checkedAt, platform: platformSummary(result), rows, candidates,
    analysis: { mode: 'rules' as const, state: 'needs_research' as const, notice: '规则筛选与待核验研究问题；未调用模型，也未核验事实。' } };
}

export async function getTopicHistory(userId: string) {
  const history = await readRecentTopicHistory(userId);
  return {
    version: 'haoduoyu-topic-history-1', history: {
      status: history.status, scope: history.scope, count: history.count, oldest_created: history.oldest_created,
      checked_at: history.checked_at, window_days: history.window_days, window_complete: history.window_complete,
      unselected_current_runs: history.unselected_current_runs, unfinished_topic_runs: history.unfinished_topic_runs,
      notice: history.notice,
    },
    entries: history.entries.map(({ article_id, title, topic, created, writer, run_kind, source }) => ({ article_id, title, topic, created, writer, run_kind, source })),
  };
}

export function isTopicBoardPlatform(value: string): value is TopicBoardPlatform {
  return (TOPIC_BOARD_PLATFORMS as readonly string[]).includes(value);
}

export async function getTopicResearch(
  userId: string,
  options: { refresh?: boolean; platform?: TopicPlatform } = {},
) {
  const now = new Date();
  const platforms = await loadTopicPlatforms(options.refresh === true, options.platform);
  let history: TopicHistory;
  try {
    history = await readRecentTopicHistory(userId, now);
  } catch {
    history = failedHistory(now);
  }
  const candidates = buildTopicCandidates(platforms).map((candidate) => ({
    ...candidate,
    history_matches: history.status === 'ok' ? findTopicHistoryMatches(candidate, history.entries) : [],
  }));
  const platformSummaries: PublicPlatformSummary[] = platforms.map(platformSummary);
  return {
    version: TOPIC_RESPONSE_VERSION,
    checked_at: now.toISOString(),
    timezone: 'Asia/Shanghai',
    platforms: platformSummaries,
    history: {
      status: history.status,
      scope: history.scope,
      count: history.count,
      oldest_created: history.oldest_created,
      checked_at: history.checked_at,
      window_days: history.window_days,
      window_complete: history.window_complete,
      unselected_current_runs: history.unselected_current_runs,
      unfinished_topic_runs: history.unfinished_topic_runs,
      notice: history.notice,
    },
    items: candidates,
    analysis: {
      mode: 'rules',
      state: 'needs_research',
      notice: '规则筛选与待核验研究问题；未调用模型，也未核验事实。',
    },
  };
}

export function isTopicPlatform(value: string): value is TopicPlatform {
  return value === 'weibo' || value === 'toutiao';
}

const topicCategories = new Set(['影视剧', '电影', '综艺', '明星活动', '文娱事件']);

export async function readTopicCandidateBrief(userId: string, args: Record<string, unknown> = {}) {
  const requestedPlatform = typeof args.platform === 'string' && args.platform !== 'all' ? args.platform : undefined;
  if (requestedPlatform && !isTopicPlatform(requestedPlatform)) throw new Error('平台筛选无效');
  const platform = requestedPlatform && isTopicPlatform(requestedPlatform) ? requestedPlatform : undefined;
  const category = typeof args.category === 'string' && args.category !== 'all' ? args.category : undefined;
  if (category && !topicCategories.has(category)) throw new Error('类别筛选无效');
  const limitValue = args.limit;
  const limit = limitValue === undefined ? 25 : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 60) throw new Error('返回数量需为1至60');

  const result = await getTopicResearch(userId, { platform });
  const eligible = category
    ? result.items.filter((item) => item.categories.includes(category))
    : result.items;
  return {
    ...result,
    available_count: eligible.length,
    returned_count: Math.min(eligible.length, limit),
    truncated: eligible.length > limit,
    items: eligible.slice(0, limit),
  };
}
