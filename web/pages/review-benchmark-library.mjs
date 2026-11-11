import {e} from '../core/dom.mjs';
import {finiteNumber, reviewDateTime} from '../core/review-data.mjs';

function safeUrl(value) {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function number(value) {
  const n = finiteNumber(value);
  if (n === null || n < 0) return '';
  return n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : n.toLocaleString('zh-CN', {maximumFractionDigits:1});
}
function articleLink(article, account) {
  const external = safeUrl(article.url);
  const local = `?page=review&account=${encodeURIComponent(account)}&review_article=${encodeURIComponent(article.id)}`;
  return `<a href="${e(external || local)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${e(article.title || '未命名文章')}</a>`;
}
function latestSnapshot(snapshots, articleId) {
  return (snapshots || []).filter(row => String(row.article_id) === String(articleId))
    .sort((a,b) => String(b.snapshot_date || '').localeCompare(String(a.snapshot_date || '')))[0] || null;
}
function metricText(snapshot) {
  if (!snapshot) return '—';
  const parts = [];
  for (const [label, key] of [['阅读','reads'],['点赞','likes'],['评论','comments'],['收藏','favorites'],['分享','shares'],['展现','impressions']]) {
    const text = number(snapshot[key]);
    if (text) parts.push(`${label} ${text}`);
  }
  const ctr = finiteNumber(snapshot.ctr);
  if (ctr !== null && ctr >= 0) parts.push(`点击率 ${ctr.toFixed(1)}%`);
  return parts.length ? parts.join(' · ') : '—';
}

/** Imitated samples only. Unreferenced benchmark rows stay in the data and are not shown. */
export function renderBenchmarkLibrary(data = {}, account = '') {
  const accounts = new Map((data.benchmarkAccounts || []).filter(item => item.account === account).map(item => [String(item.id),item]));
  const ownArticles = (data.articles || []).filter(item => item.account === account);
  const samples = (data.benchmarkArticles || []).filter(item => item.account === account && accounts.has(String(item.benchmark_account_id)))
    .map(item => ({item, published:reviewDateTime(item.published_at),
      used:ownArticles.filter(article => article.reference_article_id != null && String(article.reference_article_id) === String(item.id))}))
    .filter(row => row.used.length)
    .sort((a,b) => {
      const dayOrder = b.published.slice(0,10).localeCompare(a.published.slice(0,10));
      if (dayOrder) return dayOrder;
      const aTimed = a.published.length > 10, bTimed = b.published.length > 10;
      return Number(bTimed) - Number(aTimed) || (aTimed && bTimed ? Date.parse(b.item.published_at) - Date.parse(a.item.published_at) : 0) || 
        String(a.item.id).localeCompare(String(b.item.id));
    });
  if (!samples.length) return '<section class="review-benchmark-library"><h2>爆文库</h2><p class="review-note">暂无已仿写爆文</p></section>';
  const headers = ['对标账号','样本标题','样本阅读','仿写标题','仿写数据'];
  const body = samples.flatMap(({item,used}) => used.map((article,index) => {
    const owner = accounts.get(String(item.benchmark_account_id));
    const target = safeUrl(item.url);
    const title = e(item.title || '未命名文章');
    const reads = number(item.reads);
    const cells = [
      e(owner.name || '未命名账号'),
      target ? `<a href="${e(target)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title,
      e(reads || '—'),
      articleLink(article,account),
      e(metricText(latestSnapshot(data.snapshots, article.id)))
    ];
    const id = index === 0 ? ` id="review-benchmark-${e(encodeURIComponent(item.id))}"` : '';
    return `<tr${id} tabindex="-1">${cells.map((cell,cellIndex) => `<td data-label="${headers[cellIndex]}">${cell}</td>`).join('')}</tr>`;
  })).join('');
  return `<section class="review-benchmark-library"><h2>爆文库</h2><div class="review-benchmark-table-wrap"><table ` +
    `class="review-benchmark-table"><thead><tr>${headers.map(label => `<th ` +
      `scope="col">${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}
