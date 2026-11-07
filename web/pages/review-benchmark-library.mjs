import {e} from '../core/dom.mjs';
import {finiteNumber, reviewDateTime} from '../core/review-data.mjs';

function safeUrl(value) {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function number(value) {
  const n = finiteNumber(value);
  if (n === null || n < 0) return '—';
  return n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : n.toLocaleString('zh-CN', {maximumFractionDigits:1});
}
function articleLink(article, account) {
  const external = safeUrl(article.url);
  const local = `?page=review&account=${encodeURIComponent(account)}&review_article=${encodeURIComponent(article.id)}`;
  return `<a href="${e(external || local)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${e(article.title || '未命名文章')}</a>`;
}

/** Render account-scoped recorded references, with no inferred metrics or timestamps. */
export function renderBenchmarkLibrary(data = {}, account = '') {
  const accounts = new Map((data.benchmarkAccounts || []).filter(item => item.account === account).map(item => [String(item.id),item]));
  const ownArticles = (data.articles || []).filter(item => item.account === account);
  const rows = (data.benchmarkArticles || []).filter(item => item.account === account && accounts.has(String(item.benchmark_account_id)))
    .map(item => ({item, published:reviewDateTime(item.published_at)}))
    .sort((a,b) => {
      const dayOrder = b.published.slice(0,10).localeCompare(a.published.slice(0,10));
      if (dayOrder) return dayOrder;
      const aTimed = a.published.length > 10, bTimed = b.published.length > 10;
      return Number(bTimed) - Number(aTimed) || (aTimed && bTimed ? Date.parse(b.item.published_at) - Date.parse(a.item.published_at) : 0) || String(a.item.id).localeCompare(String(b.item.id));
    });
  if (!rows.length) return '<section class="review-benchmark-library"><h3>爆文库</h3><p class="review-note">暂无爆文</p></section>';
  const headers = ['发布时间','账号','标题','阅读','配图数','收录日期','已仿'];
  const body = rows.map(({item,published}) => {
    const owner = accounts.get(String(item.benchmark_account_id));
    const target = safeUrl(item.url);
    const title = e(item.title || '未命名文章');
    const used = ownArticles.filter(article => article.reference_article_id != null && String(article.reference_article_id) === String(item.id));
    const cells = [e(published || '未知'),e(owner.name || '未命名账号'),target ? `<a href="${e(target)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title,
      e(number(item.reads)),e(number(item.image_count)),e(reviewDateTime(item.collected_on) || '未知'),
      used.length ? used.map(article => articleLink(article,account)).join('') : '—'];
    return `<tr id="review-benchmark-${e(encodeURIComponent(item.id))}" tabindex="-1">${cells.map((cell,index) => `<td data-label="${headers[index]}">${cell}</td>`).join('')}</tr>`;
  }).join('');
  return `<section class="review-benchmark-library"><h3>爆文库</h3><div class="review-benchmark-table-wrap"><table class="review-benchmark-table"><thead><tr>${headers.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}
