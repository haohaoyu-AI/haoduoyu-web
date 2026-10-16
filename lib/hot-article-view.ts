import type {HotArticle} from './hot-article-public';

/** A late history, initial load or poll must never replace a newer selection. */
export class HotArticleViewFence {
  private epoch = 0;
  capture() { return this.epoch; }
  begin() { return ++this.epoch; }
  accepts(ticket: number) { return ticket === this.epoch; }
}

export function rememberHotArticleView<T extends {batch: {id: string; created: string} | null}>(history: T[], view: T): T[] {
  if (!view.batch) return history;
  return [view, ...history.filter(item => item.batch?.id !== view.batch!.id)]
    .sort((a, b) => (b.batch?.created ?? '').localeCompare(a.batch?.created ?? '') || (b.batch?.id ?? '').localeCompare(a.batch?.id ?? ''))
    .slice(0, 10);
}

/** Explain only what this stored observation establishes, never platform-wide availability. */
export function hotMetricMissingReason(article: Omit<HotArticle, 'body'>, field: 'reads'|'likes'|'comments'): string {
  const diagnostic = article.diagnostics;
  if (diagnostic?.stages.network === 'failed') return '本次网络请求未取得站点响应';
  if (diagnostic?.stages.http === 'failed' || diagnostic?.stages.public_access === 'failed') return '本次公开访问未通过，指标尚未核验';
  if (diagnostic?.stages.body_load === 'failed') return '本次原文响应未完整读入';
  if (article.acquisition?.method === 'indexed_search') return '本次仅取得公开搜索索引，未取得原文指标';
  if (diagnostic?.metrics.fields[field]?.state === 'invalid_count') return '本次文章元数据中的计数格式未通过核验';
  if (diagnostic?.metrics.fields[field]?.state === 'absent_in_supported_metadata') return '本次支持的文章元数据中未读取到该指标';
  return '本次未获取可核验的原文指标';
}
