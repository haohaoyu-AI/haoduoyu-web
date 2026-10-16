export type WritingItem = {
  list_section?: 'work' | 'recent';
  output_mode?: string | null;
  pipeline_state?: string | null;
  pipeline_error?: string | null;
  stages?: { stage: string; state: string }[];
  task_id?: string | null;
  run_id?: string | null;
  created?: string | number | null;
  href?: string;
  article_id?: string | null;
  title?: string | null;
  day?: string | null;
  writer?: string | null;
  final_source?: string | null;
  editorial_phase?: string | null;
  run_kind?: string | null;
  state?: string | null;
  error?: string | null;
  paragraphs?: string[];
  sources?: { title: string; url: string; published?: string }[];
  has_result?: boolean;
};

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === 'string' ? value : null;

/** A damaged row stays visible as unknown; it cannot hide other readable runs. */
export function normalizeFlowItems(rows: unknown[]): WritingItem[] {
  return rows.map(raw => {
    const row = record(raw) || {};
    const valid = typeof row.task_id === 'string' && typeof row.state === 'string' && Array.isArray(row.paragraphs) && row.paragraphs.every(value => typeof value === 'string') && Array.isArray(row.sources);
    return {
      list_section: row.list_section === 'recent' ? 'recent' : 'work',
      task_id: text(row.task_id), run_id: text(row.run_id), article_id: text(row.article_id),
      title: text(row.title) || '状态待核验', writer: 'claude',
      state: valid ? text(row.state) : 'state_unknown', editorial_phase: valid ? text(row.editorial_phase) : 'state_unknown',
      created: typeof row.created === 'string' || typeof row.created === 'number' ? row.created : null,
      pipeline_state: text(row.pipeline_state), pipeline_error: text(row.pipeline_error),
      error: text(row.error) || (!valid ? '这条流程的状态暂时无法完整读取，请展开流程核验。' : null),
      paragraphs: Array.isArray(row.paragraphs) ? row.paragraphs.filter((value): value is string => typeof value === 'string') : [],
      sources: Array.isArray(row.sources) ? row.sources.flatMap(value => {
        const source = record(value);
        return source && typeof source.title === 'string' && typeof source.url === 'string' ? [{ title: source.title, url: source.url, published: typeof source.published === 'string' ? source.published : undefined }] : [];
      }) : [],
      stages: Array.isArray(row.stages) ? row.stages.flatMap(value => {
        const stage = record(value);
        return stage && typeof stage.stage === 'string' && typeof stage.state === 'string' ? [{stage: stage.stage, state: stage.state}] : [];
      }) : [],
    };
  });
}

export function mergeWritingItems(articles: WritingItem[], flows: WritingItem[]): WritingItem[] {
  const flowArticleIds = new Set(flows.map(item => item.article_id).filter(Boolean));
  return [...flows.map(item => {
    const article = articles.find(row => row.article_id && row.article_id === item.article_id);
    return {
      ...article, ...item, writer: 'claude', list_section: article?.list_section || item.list_section, created: article?.created || item.created,
      // Never overwrite a pending handoff/error with the flow's saved-text state.
      pipeline_state: item.pipeline_state || article?.state,
      error: item.pipeline_error || item.error || article?.error,
      paragraphs: article?.paragraphs?.length ? article.paragraphs : item.paragraphs,
      has_result: article?.has_result,
    };
  }), ...articles.filter(item => !item.article_id || !flowArticleIds.has(item.article_id))].sort((a, b) => {
    const timestamp = (item: WritingItem) => typeof item.created === 'number' ? item.created : Date.parse(item.created || item.day || '') || 0;
    return timestamp(b) - timestamp(a);
  });
}
