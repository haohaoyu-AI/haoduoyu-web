import { e } from "../core/dom.mjs";
import { num } from "../core/format.mjs";
const writerNames = { dedao: "得到大脑", gemini_web: "Gemini", human: "人工", other: "其他", unknown: "未记录" };
function renderArticleLedgerSummary(data) {
  if (data?.verified !== true) return '<section class="card article-ledger-overview" role="alert"><h2>文章状态</h2><p>数量未取得，请重新加载。</p></section>';
  if (data.total === 0) return '<section class="card article-ledger-overview article-ledger-empty"><h2>文章状态</h2><p>尚未记录文章。</p></section>';
  const labels = { drafting: "起草中", illustrated: "已配图", draft_saved: "草稿已存", published: "已发布", failed: "受阻" };
  const stats = [["全部文章", data.total], ...Object.entries(labels).map(([key, label]) => [label, data.counts?.[key]])];
  if (data.counts?.unknown > 0) stats.push(["状态未确认", data.counts.unknown]);
  return `<section class="card article-ledger-overview"><div class="section-heading"><h2 title="读取期间记录可能更新">文章状态</h2>\
</div><dl class="article-ledger-stats article-status-stats">${stats.
    map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(num(value))}</dd></div>`).join("")}</dl>\
<details class="article-writer-details"><summary>按写作者查看</summary>\
<div class="table-scroll"><table class="data-table article-ledger-writers"><thead><tr><th>写作者</th><th>草稿 / 未发布</th><th>已发布</th></tr></thead><tbody>${
    data.writers.map((row) => `<tr><td>${e(writerNames[row.writer] || "未记录")}</td><td data-label="草稿 / 未发布">${e(num(row.unpublished))}</td>\
<td data-label="已发布">${e(num(row.published))}</td></tr>`).join("")}</tbody></table></div></details></section>`;
}
export { renderArticleLedgerSummary };
export { loadArticleLedgerSummary, summarizeArticleLedger } from "../core/article-ledger-data.mjs";
