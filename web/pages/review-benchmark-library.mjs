import {e} from '../core/dom.mjs';
import {finiteNumber, reviewDateTime} from '../core/review-data.mjs';
import {enrichArticles, median} from '../../shared/review-analytics.mjs';
import {reviewPublishState} from '../../shared/review-publish-state.mjs';

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
  const verdictById = new Map(enrichArticles(data, {account}).map(row => [String(row.id), row.verdict]));
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
  const usedPairs = samples.flatMap(entry => entry.used);
  const pendingCount = usedPairs.filter(article => reviewPublishState(article) === 'pending').length;
  const verdictOf = article => article.verdict || verdictById.get(String(article.id)) || '';
  const hits = usedPairs.filter(article => verdictOf(article) === '爆').length;
  const middles = usedPairs.filter(article => verdictOf(article) === '中').length;
  const flops = usedPairs.filter(article => verdictOf(article) === '扑').length;
  const judged = hits + middles + flops;
  const hitRate = judged ? `${(100 * hits / judged).toFixed(1)}%` : '—';
  const sampleReadsMed = number(median(samples.map(entry => entry.item.reads))) || '—';
  const ownSnapshots = usedPairs.filter(article => reviewPublishState(article) === 'published')
    .map(article => latestSnapshot(data.snapshots, article.id)).filter(Boolean);
  const ownReadsMed = number(median(ownSnapshots.map(snapshot => snapshot.reads))) || '—';
  const ownCtrRaw = median(ownSnapshots.map(snapshot => snapshot.ctr).filter(value => {
    const n = finiteNumber(value);
    return n !== null && n >= 0 && n <= 100;
  }));
  const ownCtrMed = ownCtrRaw !== null ? `${ownCtrRaw.toFixed(1)}%` : '—';
  const verdictPills = judged ? `<div class="review-lib-kpi-pills">` +
    `<span class="review-count-pill hit">爆 <b>${e(hits)}</b></span>` +
    `<span class="review-count-pill middle">中 <b>${e(middles)}</b></span>` +
    `<span class="review-count-pill flop">扑 <b>${e(flops)}</b></span></div>`
    : '<strong>—</strong>';
  const kpis = `<div class="review-sub-kpis review-library-kpis">` +
    `<article class="review-sub-kpi"><span>已仿写篇数</span><strong>${e(usedPairs.length)} 篇</strong>` +
    `<small>对应 ${e(samples.length)} 篇对标样本${pendingCount ? ` · 待发布 ${e(pendingCount)} 篇` : ''}</small></article>` +
    `<article class="review-sub-kpi"><span>仿写表现</span>${verdictPills}` +
    `<small>${judged ? `爆率 ${e(hitRate)} · 已判定 ${e(judged)} 篇` : '暂无已判定样本'}</small></article>` +
    `<article class="review-sub-kpi"><span>样本阅读中位</span><strong>${e(sampleReadsMed)}</strong><small>参考爆文基准</small></article>` +
    `<article class="review-sub-kpi"><span>仿写阅读中位</span><strong>${e(ownReadsMed)}</strong>` +
    `<small>${ownCtrMed !== '—' ? `点击率中位 ${e(ownCtrMed)}` : '按最新已采快照'}</small></article></div>`;
  const headers = ['对标账号','样本标题','样本什么时候发的','样本阅读','仿写标题','我们什么时候仿写入库的','仿写数据'];
  const cellClasses = ['review-lib-cell-account','review-lib-cell-sample','review-lib-cell-sample-time',
    'review-lib-cell-sample-reads','review-lib-cell-own','review-lib-cell-own-time','review-lib-cell-metrics'];
  const body = samples.flatMap(({item,published,used}) => used.map((article,index) => {
    const owner = accounts.get(String(item.benchmark_account_id));
    const target = safeUrl(item.url);
    const title = e(item.title || '未命名文章');
    const reads = number(item.reads);
    const state = reviewPublishState(article);
    const verdict = verdictOf(article);
    const verdictClass = verdict === '爆' ? 'hit' : verdict === '扑' ? 'flop' : 'middle';
    const chip = state === 'pending' ? '<span class="review-lib-chip is-pending">待发布</span> '
      : state === 'unmatched' ? '<span class="review-lib-chip is-unmatched">未对上</span> '
      : ['爆','中','扑'].includes(verdict) ? `<span class="review-lib-chip ${verdictClass}">${e(verdict)}</span> ` : '';
    const imitation = state === 'pending' ? '待发布' : state === 'unmatched' ? '未能对上' : metricText(latestSnapshot(data.snapshots, article.id));
    const cells = [
      e(owner.name || '未命名账号'),
      target ? `<a href="${e(target)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title,
      e(published || '未记录'),
      e(reads || '—'),
      `${chip}${articleLink(article,account)}`,
      e(reviewDateTime(article.draft_saved_at || article.created_at) || '未记录'),
      e(imitation)
    ];
    const id = index === 0 ? ` id="review-benchmark-${e(encodeURIComponent(item.id))}"` : '';
    return `<tr${id} tabindex="-1">${cells.map((cell,cellIndex) =>
      `<td class="${cellClasses[cellIndex]}" data-label="${headers[cellIndex]}">${cell}</td>`).join('')}</tr>`;
  })).join('');
  return `<section class="review-benchmark-library"><div class="review-library-head"><h2>爆文库</h2>` +
    `<span class="review-note">已仿写样本与我方表现对照</span></div>${kpis}<div class="review-benchmark-table-wrap"><table ` +
    `class="review-benchmark-table"><thead><tr>${headers.map((label,cellIndex) => `<th ` +
      `scope="col" class="${cellClasses[cellIndex]}">${label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}
