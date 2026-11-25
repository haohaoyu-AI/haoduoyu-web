import {e} from '../core/dom.mjs';

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

/** Show only a reference belonging to the current account. */
export function renderImitation(row, data, account) {
  if (!row || row.account !== account) return '';
  const reference = row.reference_article_id == null ? null : (data.benchmarkArticles || []).find(item =>
    item.account === account && String(item.id) === String(row.reference_article_id));
  let value;
  if (reference) {
    const id = String(reference.id);
    const query = new URLSearchParams({page:'review', account, review_section:'benchmarks', review_benchmark:id});
    value = `<a href="?${e(query.toString())}" data-review-benchmark="${e(id)}">${e(reference.title || '未命名文章')}</a>`;
  } else {
    const title = String(row?.sample_title || '').trim();
    const rawUrl = String(row?.sample_url || '').trim();
    const url = safeUrl(rawUrl);
    const label = title || (rawUrl ? '参考文章' : '自选题');
    value = url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : e(label);
  }
  return `<div class="review-imitation"><span>仿</span><div>${value}</div></div>`;
}
