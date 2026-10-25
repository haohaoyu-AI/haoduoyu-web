import { e } from "../core/dom.mjs";
import { num } from "../core/format.mjs";
const writerNames = { dedao: "得到大脑", gemini_web: "Gemini", human: "人工", other: "其他", unknown: "未记录" };
function renderArticleLedgerSummary(data) {
  if (data?.verified !== true) return '<section class="card article-ledger-overview" role="alert"><h2>文章台账</h2><p>数量未取得，请重新加载。</p></section>';
  if (data.total === 0) return '<section class="card article-ledger-overview article-ledger-empty"><h2>文章台账</h2><p>尚未记录文章。</p>\
<p class="muted">可以先保存草稿，发布后再补充链接和数据。</p><button class="btn" data-action="new-article">记录草稿</button></section>';
  const stats = [["草稿 / 未发布", data.unpublished], ["已存草稿", data.draft_saved], ["已发布", data.published]];
  return `<section class="card article-ledger-overview"><div class="section-heading"><h2>文章台账</h2></div><dl class="article-ledger-stats">${stats.
    map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(num(value))}</dd></div>`).join("")}</dl><h3>按写作者</h3>\
<div class="table-scroll"><table class="data-table article-ledger-writers"><thead><tr><th>写作者</th><th>草稿 / 未发布</th><th>已发布</th></tr></thead><tbody>${
    data.writers.map((row) => `<tr><td>${e(writerNames[row.writer] || "未记录")}</td><td data-label="草稿 / 未发布">${e(num(row.unpublished))}</td>\
<td data-label="已发布">${e(num(row.published))}</td></tr>`).join("")}</tbody></table></div>\
<p class="cell-sub">按本站完整分页记录统计；翻页期间可能有更新，不是原子快照。未配置槽位排期，不计算应产出或缺失。</p></section>`;
}
export { renderArticleLedgerSummary };
export { loadArticleLedgerSummary, summarizeArticleLedger } from "../core/article-ledger-data.mjs";
