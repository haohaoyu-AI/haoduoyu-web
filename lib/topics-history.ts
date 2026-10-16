import { db } from './test-store';
export { findTopicHistoryMatches } from './topic-history-match';

export type TopicHistoryEntry = {
  article_id: string;
  title: string;
  topic: string | null;
  created: string;
  writer: string;
  run_kind: string;
  state: string;
  source: 'article' | 'current_run';
};

export type TopicHistory = {
  status: 'ok' | 'error';
  scope: 'latest_50_plus_current_runs';
  count: number;
  oldest_created: string | null;
  checked_at: string;
  window_days: 14;
  window_complete: boolean | null;
  unselected_current_runs: number;
  unfinished_topic_runs: number;
  notice: string | null;
  entries: TopicHistoryEntry[];
};

const SHANGHAI_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function beijingDay(now = new Date()): string {
  return SHANGHAI_DAY_FORMAT.format(now);
}

function isoMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

export async function readRecentTopicHistory(userId: string, now = new Date()): Promise<TopicHistory> {
  const checkedAt = now.toISOString();
  const articles = (await db().prepare(`
    SELECT a.id AS article_id, a.title, a.created, a.state,
      w.topic, COALESCE(w.writer, 'uploaded') AS writer, COALESCE(w.run_kind, 'uploaded') AS run_kind
    FROM articles a
    LEFT JOIN writing_runs w ON w.id = (
      SELECT w2.id FROM writing_runs w2
      WHERE w2.owner = a.owner AND w2.article_id = a.id
      ORDER BY w2.updated DESC, w2.id DESC LIMIT 1
    )
    WHERE a.owner = ?
    ORDER BY a.created DESC, a.id DESC
    LIMIT 50
  `).bind(userId).all()).results as Array<Record<string, unknown>>;

  const day = beijingDay(now);
  const currentRuns = (await db().prepare(`
    SELECT w.article_id, w.topic, w.created, w.writer, w.run_kind, w.state
    FROM writing_runs w
    WHERE w.owner = ? AND w.day = ?
      AND NOT EXISTS (SELECT 1 FROM articles a WHERE a.owner = w.owner AND a.id = w.article_id)
    ORDER BY w.created DESC, w.id DESC
  `).bind(userId, day).all()).results as Array<Record<string, unknown>>;

  const entries: TopicHistoryEntry[] = articles.map((row) => ({
    article_id: String(row.article_id ?? ''),
    title: String(row.title ?? '').slice(0, 200),
    topic: typeof row.topic === 'string' ? row.topic.slice(0, 300) : null,
    created: String(row.created ?? ''),
    writer: String(row.writer ?? 'xiaoyu'),
    run_kind: String(row.run_kind ?? 'uploaded'),
    state: String(row.state ?? ''),
    source: 'article',
  }));
  const currentRunRows = currentRuns as Array<Record<string, unknown>>;
  let unselectedCurrentRuns = 0;
  let unfinishedTopicRuns = 0;
  for (const row of currentRunRows) {
    const topic = typeof row.topic === 'string' ? row.topic.trim() : '';
    if (!topic && ['pending', 'writing', 'failed'].includes(String(row.state))) unselectedCurrentRuns += 1;
    if (topic) unfinishedTopicRuns += 1;
  }
  for (const row of currentRunRows) {
    if (typeof row.topic !== 'string' || !row.topic.trim()) continue;
    entries.push({
      article_id: String(row.article_id ?? ''),
      title: String(row.topic ?? '').slice(0, 200),
      topic: String(row.topic ?? '').slice(0, 300),
      created: String(row.created ?? ''),
      writer: String(row.writer ?? 'xiaoyu'),
      run_kind: String(row.run_kind ?? 'daily'),
      state: String(row.state ?? ''),
      source: 'current_run',
    });
  }

  const oldestCreated = articles.length ? String(articles[articles.length - 1].created ?? '') || null : null;
  const oldestMillis = isoMillis(oldestCreated);
  const cutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const windowComplete = articles.length < 50 || (oldestMillis !== null && oldestMillis <= cutoff);
  const notice = windowComplete
    ? '只比较最新文章标题、选题字段和当日已有选题；属于明确词面提醒，不是正文语义去重。'
    : '最新50篇中最早一篇仍在14天内，窗口可能不完整；只作明确词面提醒，语义去重待核。';

  return {
    status: 'ok', scope: 'latest_50_plus_current_runs', count: articles.length,
    oldest_created: oldestCreated, checked_at: checkedAt, window_days: 14,
    window_complete: windowComplete, unselected_current_runs: unselectedCurrentRuns,
    unfinished_topic_runs: unfinishedTopicRuns,
    notice, entries,
  };
}
