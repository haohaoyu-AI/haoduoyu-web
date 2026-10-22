import { metrics, platforms } from "../core/constants.mjs";
import { e } from "../core/dom.mjs";
import { accountLabel, accountName, compact, duration, num, time } from "../core/format.mjs";
import { state } from "../core/state.mjs";
import { comparisonHTML, dashboardInfo, dashboardMetric, freshness, metricCoverageHTML, platformColor, platformLogo } from "../ui/components.mjs";
import { segmented } from "../ui/segmented.mjs";
function dailyDates(data) {
  return (data.trend || []).filter((d) => (d.accounts || []).some((a) => Object.values(a.metrics || {}).some((v) => v != null)));
}
function periodControls() {
  return segmented("overview-period", [["yesterday", "昨天"], ["7d", "近7天"], ["30d", "近30天"]], state.overviewPeriod, "周期变化时间",
  "period");
}
function renderDashboard(data) {
  const daily = dailyDates(data), articles = (data.attention_articles || []).filter((a) => ["up", "down"].includes(a.attention?.kind)), visible = state.
  attentionExpanded ? articles : articles.slice(0, 6);
  return `${renderCumulative(data)}<section class="card cycle-panel"><div class="section-heading"><h2>周期变化</h2>${periodControls()}</\
div>${daily.length ? `${renderPeriodAccounts(data.accounts || [])}${visible.length ? `<h3>表现异动</h3>${renderAttentionArticles(visible)}${articles.
  length > 6 ? `<button class="btn text" data-action="toggle-attention" aria-expanded="${state.attentionExpanded}">${state.attentionExpanded ?
  "收起" : "展开其余"}（${e(num(articles.length))}篇）</button>` : ""}` : ""}` : '<div class="empty inline-empty">还没有每日新增数据，录入后这里会显\
示周期变化和趋势。<button class="btn" data-action="new-daily">录入每日数据</button></div>'}</section>
 ${daily.length < 2 ? "" : `<details class="card trend-disclosure" data-state="trendOpen" ${state.trendOpen ? "open" : ""}><summary>趋势与发布量</\
summary><div class="panel"><div class="chart-header"><h2>每日新增趋势 ${dashboardInfo("trend", "趋势数据覆盖")}</h2><label><span\
 class="sr-only">趋势指标</span><select id="trend-metric" class="input">${Object.entries(metrics).map(([key, label]) => `<option value="${e(
  key)}" ${state.trendMetric === key ? "selected" : ""}>${e(label)}</option>`).join("")}</select></label></div>${renderTrend(data)}<h3>本站发布量\
 ${dashboardInfo("publication", "发布量口径")}</h3>${renderPublicationTrend(data)}${segmented("trend-tab", [["metrics", "每日明细"],
  ["publication", "各账号每日发布量"]], state.trendTab || "metrics", "趋势明细")}${renderDailyTable(data)}</div></details>`}`;
}
function renderPeriodAccounts(accounts) {
  const approvals = accounts.some((a) => a.period_metrics?.approvals != null), columns = [["reads", "阅读"], ["likes", "点赞"], ["commen\
ts", "评论"], ...approvals ? [["approvals", "赞同"]] : []];
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>账号</th>${columns.map(([, label]) => `<th>${e(label)}</th>`).
  join("")}</tr></thead><tbody>${accounts.map((a) => `<tr><td><button class="article-link" data-action="select-account" data-id="${e(a.id)}"\
>${platformLogo(a.platform)} ${e(a.name)}</button></td>${columns.map(([key]) => `<td>${dashboardMetric({ latest_metrics: a.period_metrics },
  key)}${metricCoverageHTML(a, key)}${comparisonHTML(a.comparisons?.[key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function renderAttentionArticles(articles) {
  return `<div class="table-scroll"><table class="data-table attention-table"><thead><tr><th>文章</th><th>周期阅读 / 变化</th><th>周期互动 / 变化 ${dashboardInfo(
  "metrics", "互动指标口径", "attention")}</th><th>关注原因</th></tr></thead><tbody>${articles.map((a) => {
    const platform = a.platform || state.accounts.find((x) => x.id === a.account_id)?.platform, like = "likes", m = a.period_metrics || {}, attention = a.
    attention || {};
    const label = { up: "表现较高", down: "表现较低", normal: "近期文章", insufficient: "待积累数据" }[attention.kind] || "\
待积累数据";
    return `<tr><td class="title-cell"><button class="article-link" data-action="article-detail" data-id="${e(a.id)}">${e(a.title)}</button>\
<div class="cell-sub">${e(platform && a.account_name ? `${platforms[platform] || platform} · ${a.account_name}` : accountName(a.account_id))}\
 · ${e(time(a.published_at, true))}</div></td><td><strong class="number">${e(num(m.reads))}</strong>${metricCoverageHTML(a, "reads")}${comparisonHTML(
    a.comparisons?.reads)}</td><td><div class="attention-interaction"><span>点赞 ${e(num(m[like]))}${metricCoverageHTML(a, like)}</span>${comparisonHTML(
    a.comparisons?.[like])}</div><div class="attention-interaction"><span>评论 ${e(num(m.comments))}${metricCoverageHTML(a, "comments")}</\
span>${comparisonHTML(a.comparisons?.comments)}</div>${m.approvals != null ? `<div>赞同 ${e(num(m.approvals))}${comparisonHTML(a.comparisons?.
    approvals)}</div>` : ""}</td><td class="reason-cell"><span class="badge ${attention.kind === "up" ? "up" : attention.kind === "down" ? "\
warn" : ""}">${e(label)}</span>${dashboardInfo("attention", "比较依据", a.id)}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}
function renderCumulative(data) {
  const c = data.cumulative || {}, series = data.series || {}, rows = data.top_articles || [], due = data.due_reviews || [], fresh = freshness(
  c);
  const interactions = c.totals?.likes == null || c.totals?.comments == null ? null : c.totals.likes + c.totals.comments;
  const stats = [["已记录文章", num(c.article_count)], ["累计阅读", num(c.totals?.reads)], ["篇均阅读", num(c.mean_reads)], ["互\
动（赞+评）", num(interactions)], ["数据覆盖", c.coverage == null ? "—" : num(c.coverage * 100) + "%"]];
  return `<div class="overview-status" role="status"><span><i class="fresh-dot ${e(fresh.kind)}"></i>${e(fresh.label)}</span><div>${c.no_snapshot_count ?
  `<button class="btn text" data-action="missing-list" data-status="no_snapshot">未采集 ${e(num(c.no_snapshot_count))} 篇 →</button>` :
  ""}${due.length ? `<button class="btn text" data-action="show-due">待复盘 ${e(num(due.length))} 条 →</button>` : ""}</div></div>
 <dl class="dashboard-stats">${stats.map(([label, value], i) => `<div class="stat"><dt>${e(label)}${i === 4 ? dashboardInfo("coverage", "数据覆\
盖与统计口径") : ""}</dt><dd class="${value === "—" ? "missing-value" : ""}">${e(value)}</dd></div>`).join("")}</dl>
 <div class="dashboard-grid"><section class="card"><div class="section-heading"><h2>账号表现</h2></div>${renderPlatformTable(data.platform_comparison ||
  [])}</section><aside class="card todo-panel"><div class="section-heading"><h2>待处理</h2></div><div class="form-field todo-list">${c.no_snapshot_count ?
  `<button class="btn text" data-action="missing-list" data-status="no_snapshot">${e(num(c.no_snapshot_count))} 篇文章未采集数据 →</button>` :
  ""}${due.length ? `<button class="btn text" data-action="show-due">${e(num(due.length))} 条到期复盘 →</button>` : ""}<span>${e(fresh.
  label)}</span>${due.length ? `<span>1天 ${e(num(due.filter((d) => d.due_kind === "d1").length))} · 3天 ${e(num(due.filter((d) => d.due_kind ===
  "d3").length))} · 7天 ${e(num(due.filter((d) => d.due_kind === "d7").length))}</span>` : ""}</div><div class="form-field detail-section \
series-progress"><h3>保险200篇 ${dashboardInfo("series", "保险系列进度口径")}</h3><span>${series.highest_recorded == null ? "尚未记录\
系列文章" : `第 ${e(num(series.highest_recorded))} / ${e(num(series.planned))} 篇`}</span><progress max="${e(series.planned || 200)}" \
value="${e(series.highest_recorded || 0)}" aria-label="保险系列编号进度"></progress><span>本站收录 ${e(num(series.recorded_count))}\
 篇</span></div></aside></div>
 <section class="card cumulative-top"><div class="section-heading"><h2 id="top-heading">阅读 Top 5</h2>${segmented("top-platform", [["", "\
全部"], ...Object.entries(platforms).filter(([key]) => key !== "other" || state.topPlatform === "other" || state.accounts.some((a) => a.platform ===
  "other"))], state.topPlatform, "Top榜平台", "platform")}</div>${rows.length ? `${renderTopTable(rows.slice(0, 5))}${rows.length > 5 ? `\
<details class="top-rest"><summary class="table-footer">展开其余 ${e(num(rows.length - 5))} 篇</summary>${renderTopTable(rows.slice(5),
  5)}</details>` : ""}` : '<div class="empty inline-empty">暂无已取得阅读数据的文章。</div>'}<div class="table-footer"><a class\
="btn text" href="?page=articles&amp;sort=reads&amp;order=desc" data-action="all-top">查看全部 →</a></div></section>`;
}
function renderPlatformTable(rows) {
  return rows.length ? `<div class="table-scroll"><table class="data-table dashboard-table platform-table"><thead><tr><th>账号</th><th>篇数</th>\
<th>累计阅读</th><th>篇均</th><th>中位数</th></tr></thead><tbody>${[...rows].sort((a, b) => (b.totals?.reads ?? -1) - (a.totals?.reads ??
  -1)).map((p) => {
    const accounts = state.accounts.filter((a) => a.platform === p.platform), label = accounts.map((a) => a.name).join("，") || platforms[p.
    platform] || p.platform;
    return `<tr data-action="${accounts.length === 1 ? "select-account" : "select-platform"}" data-id="${e(accounts[0]?.id || "")}" data-pla\
tform="${e(p.platform)}"><td><span class="account-title">${platformLogo(p.platform)}<button class="article-link" data-action="${accounts.length ===
    1 ? "select-account" : "select-platform"}" data-id="${e(accounts[0]?.id || "")}" data-platform="${e(p.platform)}">${e(label)}</button>${dashboardInfo(
    "platform", "账号表现、最佳文章与计划", p.platform)}</span></td><td data-label="篇数">${e(num(p.article_count))}</td><td d\
ata-label="累计阅读">${e(num(p.totals?.reads))}</td><td data-label="篇均">${e(num(p.mean_reads))}</td><td data-label="中位数">${e(num(
    p.median_reads))}</td></tr>`;
  }).join("")}</tbody></table></div>` : '<div class="empty inline-empty">暂无账号。<button class="btn" data-action="new-account">添加账号</button></d\
iv>';
}
function renderTopTable(rows, offset = 0) {
  const approvals = rows.some((a) => a.platform === "zhihu" || a.latest_metrics?.approvals != null);
  return `<div class="table-scroll"><table class="data-table dashboard-table top-table"><thead><tr><th>文章</th><th>账号</th><th>阅读</th><th>点赞 ${dashboardInfo(
  "metrics", "点赞与赞同口径", "top" + offset)}</th><th>评论</th>${approvals ? "<th>赞同</th>" : ""}</tr></thead><tbody>${rows.map(
  (a, i) => `<tr><td class="title-cell"><span class="rank">${e(num(offset + i + 1))}</span><button class="article-link" data-action="article\
-detail" data-id="${e(a.id)}">${e(a.title)}</button></td><td>${platformLogo(a.platform)} ${e(a.account_name)}</td>${["reads", "likes", "comm\
ents", ...approvals ? ["approvals"] : []].map((key) => `<td data-label="${e(metrics[key])}">${dashboardMetric(a, key)}</td>`).join("")}</tr>`).
  join("")}</tbody></table></div>`;
}
function dashboardInfoBody(kind, id) {
  const d = state.dashboard || {}, c = d.cumulative || {}, totals = d.totals || {};
  if (kind === "coverage") return `<p>${e(c.metric_note)}</p><p>篇均分母：有阅读数据 ${e(num(c.data_article_count))} 篇；覆盖率沿用接口口径。<\
/p><p>截至 ${e(time(c.as_of))} · 采集 ${e(time(c.collected_at))}</p><p><button class="btn text" data-action="missing-list" data-status=\
"missing_reads">缺阅读 ${e(num(c.missing_reads_count))} 篇 →</button><button class="btn text" data-action="missing-list" data-status="date\
_unverified">日期待核实 ${e(num(c.unverified_date_count))} 篇 →</button></p><p>点赞 ${e(num(c.totals?.likes))} · 评论 ${e(num(c.
  totals?.comments))} · 赞同 ${e(num(c.totals?.approvals))}；互动仅在赞、评均取得时相加。</p><p>自动化占比 ${totals.article_count ?
  e(num(totals.automatic_count / totals.article_count * 100)) + "%" : "—"} · 耗时中位数 ${e(duration(totals.median_duration_seconds))}\
</p>`;
  if (kind === "platform") {
    const p = (d.platform_comparison || []).find((p2) => p2.platform === id) || {}, accounts = state.accounts.filter((a) => a.platform === id);
    return `<p>${accounts.length > 1 ? "同平台多账号，表中为平台汇总；各账号可分别进入文章列表。" : "累计指标来自该平台汇总\
。"}</p>${accounts.map((a) => `<button class="btn text" data-action="select-account" data-id="${e(a.id)}">${e(a.name)} →</button>`).join(
    "")}<p>覆盖 ${p.coverage == null ? "—" : e(num(p.coverage * 100)) + "%"} · 截至 ${e(time(p.as_of))}</p><p>计划：${id === "wech\
at" ? "每天1篇保险" : ["toutiao", "zhihu"].includes(id) ? "每天3篇文娱" : "未设置"}；计划不补成实际。</p>${p.best_article ?
    `<p>最佳文章：<button class="article-link" data-action="article-detail" data-id="${e(p.best_article.id)}">${e(p.best_article.title)}\
</button> · 阅读 ${e(num(p.best_article.latest_metrics?.reads))}</p>` : "<p>暂无有阅读数据的文章。</p>"}`;
  }
  if (kind === "attention") {
    const a = (d.attention_articles || []).find((a2) => a2.id === id);
    return `<p>${e(a?.attention?.reason)}</p><p>${e(a?.attention?.baseline)}</p>`;
  }
  if (kind === "series") return "<p>按完整标题编号识别，仅计已发布且日期已记录的文章。编号进度不代表本站收录篇数。</p>";
  if (kind === "publication") return `<p>${e(d.publication_note)}</p>`;
  if (kind === "trend") return `<p>只用真实每日新增，不以累计快照补零或插值。</p>${(d.accounts || []).map((a) => `<p>${e(
  accountLabel(a))}：${e(num((d.trend || []).filter((day) => day.accounts.some((r) => r.account_id === a.id && r.metrics?.[state.trendMetric] !=
  null)).length))}/${e(num((d.trend || []).length))}天有该指标；缺日处断开。</p>`).join("")}`;
  return `<p>${e(c.metric_note || "likes为点赞，approvals为赞同，分别记录；未采集、未取得和真实0分开。")}</p><p>周期\
仅使用真实每日新增，不补零、不插值。累计快照不补每日数据。</p>`;
}
function renderPublicationTrend(data) {
  const rows = data.publication_trend || [], max = Math.max(1, ...rows.map((r) => r.accounts.reduce((n, a) => n + a.count, 0)));
  return `<div class="publication-bars" aria-label="本站每日发布量">${rows.map((row) => `<div><span>${e(row.date.slice(5))}</span><di\
v class="publication-stack">${row.accounts.map((a) => `<i style="height:${e(a.count / max * 80)}px;background:${e(platformColor((data.accounts ||
  []).find((v) => v.id === a.account_id)?.platform))}" title="${e(accountName(a.account_id))} ${e(num(a.count))}篇"></i>`).join("")}</div><\
strong>${e(num(row.accounts.reduce((n, a) => n + a.count, 0)))}</strong></div>`).join("")}</div>`;
}
function renderDailyTable(data) {
  const publication = state.trendTab === "publication", rows = publication ? data.publication_trend || [] : data.trend || [], accounts = data.
  accounts || [];
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>日期</th>${accounts.map((a) => `<th>${e(a.name)}</th>`).join(
  "")}</tr></thead><tbody>${rows.map((d) => `<tr><td>${e(d.date)}</td>${accounts.map((a) => {
    const r = d.accounts.find((r2) => r2.account_id === a.id), value = publication ? r?.count : r?.metrics?.[state.trendMetric];
    return `<td>${value == null ? "未取得" : e(num(value))}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function renderTrend(data) {
  const dates = data.trend || [], accounts = data.accounts || [], key = state.trendMetric, colors = accounts.map((a) => platformColor(a.platform));
  const all = dates.flatMap((d) => (d.accounts || []).map((a) => a.metrics?.[key])).filter((v) => v != null);
  const dataDays = dates.filter((d) => d.accounts.some((a) => a.metrics?.[key] != null)).length;
  const max = Math.max(...all.map(Number), 1), w = 620, h = 200, left = 45, plotW = 550, plotH = 150;
  const x = (i) => left + (dates.length > 1 ? i * plotW / (dates.length - 1) : plotW / 2), y = (v) => 12 + plotH - Number(v) / max * plotH;
  const drawing = all.length ? `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="真实每日新增趋势，缺失处断开；下方可点按日期读取数值">${[
  0, 0.5, 1].map((t) => `<line x1="45" x2="595" y1="${12 + t * plotH}" y2="${12 + t * plotH}" stroke="var(--line)"/><text x="38" y="${16 + t *
  plotH}" text-anchor="end">${compact(max * (1 - t))}</text>`).join("")}${accounts.map((a, i) => {
    let prev = null;
    return dates.map((d, j) => {
      const value = d.accounts.find((p) => p.account_id === a.id)?.metrics?.[key];
      if (value == null) {
        prev = null;
        return "";
      }
      const point = { x: x(j), y: y(value) }, line = prev ? `<line x1="${prev.x}" y1="${prev.y}" x2="${point.x}" y2="${point.y}" stroke="${e(
      colors[i % colors.length])}" stroke-width="2"/>` : "";
      prev = point;
      return line + `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${e(colors[i % colors.length])}"><title>${e(a.name)} ${e(d.date)} ${num(
      value)}</title></circle>`;
    }).join("");
  }).join("")}${dates.filter((d, i) => i === 0 || i === dates.length - 1 || i === Math.floor(dates.length / 2)).map((d) => `<text x="${x(dates.
  indexOf(d))}" y="190" text-anchor="middle">${e(d.date.slice(5))}</text>`).join("")}</svg>` : "";
  const selected = dates.find((d) => d.date === state.trendDate) || dates.at(-1);
  return `${dataDays < 2 ? `<div class="empty inline-empty" role="status">数据不足：${e(num(dataDays))}天有该项真实日数据。</div>` :
  ""}${drawing}<div class="chart-legend">${accounts.map((a, i) => `<span><i class="legend-dot" style="background:${e(colors[i % colors.length])}\
"></i>${e(accountLabel(a))}</span>`).join("")}</div><label class="trend-date-label">点按查看每日读数<select id="trend-date" class="input">${dates.
  map((d) => `<option value="${e(d.date)}" ${selected?.date === d.date ? "selected" : ""}>${e(d.date)}</option>`).join("")}</select></label>\
<div class="trend-readout" aria-live="polite">${selected ? `<strong>${e(selected.date)}</strong>${accounts.map((a) => {
    const row = selected.accounts.find((v) => v.account_id === a.id);
    return `<span>${e(a.name)}：${row?.metrics?.[key] == null ? "未取得" : num(row.metrics[key])} ${e(metrics[key])}${row?.coverage?.source ===
    "articles" ? "（仅已录入文章）" : ""}</span>`;
  }).join("")}` : "暂无日期"}</div>`;
}
export {
  dailyDates,
  dashboardInfoBody,
  periodControls,
  renderAttentionArticles,
  renderCumulative,
  renderDailyTable,
  renderDashboard,
  renderPeriodAccounts,
  renderPlatformTable,
  renderPublicationTrend,
  renderTopTable,
  renderTrend
};
