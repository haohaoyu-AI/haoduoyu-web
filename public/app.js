// web/core/dom.mjs
var $ = (q, root = document) => root.querySelector(q);
var $$ = (q, root = document) => [...root.querySelectorAll(q)];
var e = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var icons = {
  fish: '<path d="M18 8c-4-5-10-4-14 4 4 8 10 9 14 4l5 4V4z"/><circle cx="9" cy="11" r=".8" fill="currentColor" stroke="none"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  articles: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  chart: '<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',
  settings: '<path d="m9 3-1 3-3 1-2 3 2 2v3l-1 2 3 3 3-1 2 2 3-1 1-3 3-1 2-3-2-2V9l1-2-3-3-3 1-2-2z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a3.5 3.5 0 0 0-5-5L4 14z"/>',
  link: '<path d="m9 15 6-6m-8 3-3 3a4 4 0 0 0 6 6l4-4m-4-10 4-4a4 4 0 0 1 6 6l-3 3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M20 7a8 8 0 1 0 0 10M20 3v5h-5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-3-3 3-3m-6 0 3-3"/>'
};
var icon = (name, size = 17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.articles}</svg>`;

// web/core/constants.mjs
var platforms = { toutiao: "今日头条", zhihu: "知乎", wechat: "微信公众号", other: "其他平台" };
var modeLabels = { manual: "人工", automatic: "自动化", mixed: "人工＋自动化", unknown: "未记录" };
var kindLabels = { latest: "最新数据", d1: "第 1 天观察", d3: "第 3 天观察", d7: "第 7 天观察" };
var statusLabels = { drafting: "起草中", illustrated: "已配图", draft_saved: "草稿已存", published: "已发布", failed: "受阻" };
var slotLabels = { zh1: "知乎 1", zh2: "知乎 2", tt1: "头条 1", tt2: "头条 2", zh3: "知乎 3", tt3: "头条 3", gzh: "公众号" };
var writerLabels = { dedao: "得到大脑", gemini_web: "Gemini", human: "本人", other: "其他" };
var illustratorLabels = { codex: "Codex", pil: "PIL", human: "本人" };
var metrics = { reads: "阅读", impressions: "展现", likes: "点赞", comments: "评论", favorites: "收藏", shares: "分享", approvals: "赞同", reading_users: "阅读人数" };
var nav = [
  { id: "dashboard", label: "总览", icon: "grid" },
  { id: "articles", label: "文章", icon: "articles" },
  { id: "reviews", label: "数据", icon: "chart" },
  { id: "todos", label: "每日待办", icon: "check" },
  { id: "notes", label: "碎碎念", icon: "edit" },
  { id: "memos", label: "备忘录", icon: "articles" },
  { id: "settings", label: "设置", icon: "settings" }
];
var settingsTabs = { workspace: "工作台", accounts: "账号", keys: "AI 授权", security: "安全", log: "操作日志" };
var legacyPages = { management: "accounts", accounts: "accounts", keys: "keys" };
var defaultFilters = () => ({
  q: "",
  mode: "",
  from: "",
  to: "",
  sort: "published_at",
  order: "desc",
  group: "",
  platform: "",
  topic: "",
  data_status: "",
  status: "draft_saved",
  slot: "",
  writer: "",
  has_warnings: "",
  has_pending_verify: "",
  series_no_min: "",
  series_no_max: ""
});
var articleColumns = {
  reads: ["阅读", "reads"],
  likes: ["点赞", "likes"],
  comments: ["评论", "comments"],
  as_of: ["数据截至", "latest_as_of"],
  approvals: ["赞同", "approvals"],
  mode: ["生产方式", ""],
  duration: ["耗时", "duration"],
  published: [
    "发布日期",
    "published_at"
  ],
  account: ["账号", ""],
  status: ["状态", ""],
  slot: ["槽位", ""],
  writer: ["写作者", ""],
  char_count: ["字数", ""],
  subheading_count: ["小标题", ""],
  image_count: ["图数", ""],
  draft_ref: ["草稿凭证", ""],
  total_duration: ["流水线耗时", ""],
  warnings: ["警告", ""],
  verify: ["待核", ""],
  topic: ["题材", ""]
};
var articleStatuses = { no_snapshot: "未采集", missing_reads: "缺阅读数据", missing_likes: "缺点赞数据", missing_comments: "缺评论数据", incomplete: "指标不完整", zero_reads: "真实0阅读", date_unverified: "日期待核实" };
var articleChoices = {
  topic: { entertainment: "文娱（推断）", insurance: "保险（推断）", unknown: "未推断" },
  mode: modeLabels,
  group: { account: "按账号", mode: "按生产方式" }
};
var defaultColumns = ["status", "slot", "writer", "warnings"];

// web/core/state.mjs
var state = {
  me: null,
  savedViews: [],
  accounts: [],
  page: "dashboard",
  settingsTab: "accounts",
  account: "",
  overviewPeriod: "yesterday",
  trendOpen: false,
  attentionExpanded: false,
  reviewTab: "observations",
  reviewArticles: [],
  articles: [],
  articleOverviewMode: "drafts",
  columns: new Set(defaultColumns),
  filters: defaultFilters(),
  listPage: 1,
  pageSize: 20,
  topN: 5,
  topPlatform: "",
  trendMetric: "reads",
  todoDate: ""
};
var runtime = {
  renderVersion: 0,
  lastFocus: null,
  searchTimer: null,
  activePopover: null,
  popoverId: 0,
  modalRequestVersion: 0,
  menuFocus: null,
  entryObserver: null,
  entryBlocks: [],
  articleIndexGeneration: 0,
  sessionEpoch: 0
};

// web/core/format.mjs
var num = (value) => value === null || value === void 0 || value === "" ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(Number(value));
var compact = (value) => value == null ? "—" : Number(value) >= 1e4 ? `${num(Number(value) / 1e4)}万` : num(value);
var bjtDate = (value = /* @__PURE__ */ new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date(value));
var time = (value, short = false) => {
  if (!value) return "未记录";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", ...short ? {} : {
    year: "numeric",
    second: "2-digit"
  }, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
};
var duration = (seconds) => {
  if (seconds == null) return "未记录";
  const n = Number(seconds);
  if (n < 60) return `${Math.round(n)} 秒`;
  if (n < 3600) return `${Math.round(n / 60)} 分钟`;
  const h = Math.floor(n / 3600), m = Math.round(n % 3600 / 60);
  return m === 60 ? `${h + 1} 小时` : `${h} 小时${m ? ` ${m} 分钟` : ""}`;
};
var localDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 8 * 36e5).toISOString().slice(0, 16);
};
var iso = (value) => value ? (/* @__PURE__ */ new Date(`${value}:00+08:00`)).toISOString() : null;
var metricData = (item) => {
  const raw = item?.metrics ?? item?.metrics_json ?? {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw || {};
};
var accountLabel = (account) => `${platforms[account.platform] || account.platform} · ${account.name}`;
var accountName = (id) => {
  const a = state.accounts.find((a2) => a2.id === id);
  return a ? accountLabel(a) : "未找到账号";
};
var selectedQuery = () => state.account ? `account_id=${encodeURIComponent(state.account)}` : "";
var rowsForAccount = (rows) => state.account ? rows.filter((a) => a.account_id === state.account) : rows;
function displayTime(value) {
  const stamp = Date.parse(value), diff = Date.now() - stamp;
  return !Number.isFinite(stamp) ? "未记录" : diff >= 0 && diff < 864e5 ? `${Math.floor(diff / 36e5)} 小时前` : time(value, bjtDate(value).slice(0, 4) === bjtDate().slice(0, 4));
}
function safeURL(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// web/ui/components.mjs
var platformLogo = (p) => `<span class="platform-logo platform-${e(["toutiao", "zhihu", "wechat"].includes(p) ? p : "other")}">${e({
  toutiao: "头",
  zhihu: "知",
  wechat: "微"
}[p] || "文")}</span>`;
function detailInfo(reason, label3, id) {
  return `<button class="icon-button inline-info" data-action="detail-info" data-reason="${e(reason)}" aria-label="${e(label3)}" aria-expanded="false" aria-controls="detail-info-${e(id)}">${icon("info", 14)}</button>`;
}
function empty(title, description = "", action = "") {
  return `<div class="empty"><span class="empty-icon">${icon("articles", 22)}</span><h3>${e(title)}</h3>${description ? `<p>${e(
    description
  )}</p>` : ""}${action}</div>`;
}
function badgeMode(mode) {
  return `<span class="badge ${mode === "automatic" ? "up" : mode === "mixed" ? "neutral" : ""}">${e(modeLabels[mode] || modeLabels.unknown)}</span>`;
}
function headerActions() {
  if (["notes", "memos"].includes(state.page) || state.page === "settings" && state.settingsTab === "workspace") return "";
  if (state.page === "dashboard") return `${state.articleOverviewMode === "published" ? dashboardInfo("metrics", "总览数据口径", "header") : ""}<button class="icon-button" data-action="refresh" title="刷新数据" aria-label="刷新数据">${icon("refresh")}</button><button class="btn primary" data-action="new-article">${icon(
    "plus"
  )}记录文章</button>`;
  if (state.page === "articles") return `<a class="btn" href="/api/v1/export" download>${icon("download")}导出 CSV</a><button class="btn primary" data-action="new-article">${icon("plus")}记录文章</button>`;
  if (state.page === "reviews") return `<button class="btn primary" data-action="new-review">${icon("plus")}录入数据</button>`;
  if (state.page === "todos") return "";
  if (state.settingsTab === "accounts") return `<button class="btn primary" data-action="new-account">${icon("plus")}添加账号</button>`;
  if (state.settingsTab === "keys") return `<button class="icon-button" data-action="key-help" aria-label="AI 凭据用途" aria-expanded="false" aria-controls="key-help">${icon("info")}</button><a href="/api-docs" class="btn" target="_blank" rel="noopener noreferrer">${icon("link", 14)}接入文档</a><button class="btn primary" data-action="new-key">${icon("plus")}创建凭证</button>`;
  return `<button class="btn" data-action="refresh">${icon("refresh")}刷新</button>`;
}
function accountOptions(selected = "", all = true, activeOnly = false) {
  return `${all ? '<option value="">全部账号</option>' : ""}${state.accounts.filter((a) => !activeOnly || a.active || a.id === selected).map((a) => `<option value="${e(a.id)}" ${a.id === selected ? "selected" : ""}>${e(accountLabel(a))}${a.active ? "" : "（已停用）"}</option>`).join("")}`;
}
function accountFilter() {
  return `<label class="account-select"><span class="sr-only">切换运营账号</span><select id="global-account" aria-label="切换运营账号">${accountOptions(
    state.account
  )}</select></label>`;
}
function pageHeader() {
  if (state.page === "memos") return '<div class="heading-left"><h1>备忘录</h1></div>';
  if (state.page === "notes") return '<div class="heading-left"><h1>碎碎念</h1></div>';
  if (state.page === "todos") return '<div class="heading-left"><h1>每日待办</h1></div>';
  const count = state.page === "articles" ? state.articleMeta?.total : state.page === "settings" && state.settingsTab === "accounts" ? rowsForAccount(
    state.accounts
  ).length : null;
  const account = state.page === "settings" && state.settingsTab === "accounts";
  return `<div class="heading-left"><h1>${e(nav.find((n) => n.id === state.page)?.label || "总览")}</h1><span id="page-count" class="page-count" ${count == null ? "hidden" : ""}>${count == null ? "" : e(num(count))}</span></div><div class="head-actions">${account ? accountFilter() : ""}${headerActions()}<button class="icon-button" data-action="page-menu" aria-label="更多页面操作" aria-haspopup="menu" aria-expanded="false" aria-controls="page-menu">⋯</button></div>`;
}
function skeleton() {
  return '<div class="skeleton" role="status" aria-label="正在读取数据"><span></span><span></span><span></span><span class="sr-only">正在读取数据…</span></div>';
}
function comparisonHTML(comparison) {
  if (!comparison?.comparable) return `<span class="comparison muted" title="${e(comparison?.reason || "缺少完整的可比数据")}">暂不可比</span>`;
  const delta = Number(comparison.delta), direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const change = delta === 0 ? "持平" : `${delta > 0 ? "+" : ""}${num(delta)}`;
  const percent = comparison.percent == null ? "" : `（${Number(comparison.percent) > 0 ? "+" : ""}${num(comparison.percent)}%）`;
  return `<span class="comparison ${direction}" title="${e(comparison.reason || "与前一等长周期比较")}">${change}${percent}</span>`;
}
function dashboardInfo(kind, label3, id = "") {
  return `<button class="icon-button inline-info" data-action="dashboard-info" data-kind="${e(kind)}" data-id="${e(id)}" aria-label="${e(label3)}" aria-expanded="false" aria-controls="info-${e(kind)}-${e(id)}">${icon("info", 14)}</button>`;
}
function platformColor(platform) {
  return `var(--p-${["toutiao", "zhihu", "wechat"].includes(platform) ? platform : "other"})`;
}
function freshness(c, now = Date.now()) {
  const stamp = [c.as_of, c.collected_at].find((v) => v && Number.isFinite(Date.parse(v)));
  if (!stamp) return { kind: "unknown", label: "数据新鲜度未知" };
  const days = Math.floor((Date.parse(bjtDate(now)) - Date.parse(bjtDate(stamp))) / 864e5);
  return days < 0 ? { kind: "unknown", label: "数据日期待核实" } : { kind: days <= 1 ? "up" : days <= 3 ? "warn" : "danger", label: `数据截至 ${time(
    stamp,
    true
  )} · ${days === 0 ? "今天更新" : `已 ${days} 天未更新`}` };
}
function dashboardMetric(article, key) {
  return article.latest_metrics == null ? '<span class="missing-value" title="未采集">—<span class="sr-only">未采集</span></span>' : article.latest_metrics[key] == null ? '<span class="missing-value">未取得</span>' : `<strong class="number">${e(num(article.latest_metrics[key]))}</strong>`;
}
function metricCoverageHTML(article, key) {
  const expected = Number(article.coverage?.expected_days || 0), recorded = Number(article.coverage?.metric_days?.[key] || 0);
  return article.period_metrics?.[key] != null && expected > 0 && recorded < expected ? `<span class="metric-coverage">部分数据 ${recorded}/${expected} 天</span>` : "";
}
function metricSummary(a) {
  return `<dl class="detail-stats">${["reads", "likes", "comments", ...a.latest_metrics?.approvals != null ? ["approvals"] : []].map((key) => `<div class="stat"><dt>${e(metrics[key])}${key === "likes" ? dashboardInfo("metrics", "指标口径", "detail") : ""}</dt><dd>${dashboardMetric(
    a,
    key
  )}</dd></div>`).join("")}</dl>`;
}
function articleSelect(name, label3, choices, value) {
  return `<label class="form-field">${e(label3)}<select name="${e(name)}" class="input" aria-label="${e(label3)}"><option value="">全部</option>${Object.entries(choices).map(([key, text]) => `<option value="${e(key)}" ${value === key ? "selected" : ""}>${e(text)}</option>`).join("")}</select></label>`;
}
function field(name, label3, type = "text", value = "", options2 = "", full = false) {
  return `<div class="form-field${full ? " full" : ""}"><label for="field-${e(name)}">${label3}</label><input id="field-${e(name)}" class="input" name="${e(name)}" type="${type}" value="${e(value)}" ${options2}></div>`;
}
function formEnd(label3 = "保存") {
  return `<p class="form-message" role="alert"></p><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary" type="submit">${e(label3)}</button></div>`;
}
function renderSnapshot(row) {
  const m = metricData(row);
  return `<article class="snapshot"><div class="snapshot-head"><span class="badge ${row.kind === "latest" ? "up" : "neutral"}">${e(kindLabels[row.kind] || row.kind || "每日数据")}</span><span class="snapshot-time">${e(row.date || displayTime(row.as_of))}</span></div><div class="snapshot-metrics">${Object.entries(metrics).filter(([key]) => m[key] != null).map(([key, label3]) => `<span>${e(label3)} <strong>${e(
    num(m[key])
  )}</strong></span>`).join("") || "未记录指标"}</div><p class="cell-sub">来源 ${e(row.source || "未记录")}${row.collected_at ? " · 采集 " + e(displayTime(row.collected_at)) : ""}</p>${row.note ? `<p class="cell-sub">${e(row.note)}</p>` : ""}</article>`;
}

// web/core/article-ledger.mjs
var warningLabels = {
  TOUTIAO_TITLE_TOO_LONG: "头条标题超过 30 字",
  CHAR_COUNT_OUT_OF_RANGE: "字数不在 2000–2300",
  SUBHEADING_COUNT_OUT_OF_RANGE: "小标题不在 5–7",
  ENTERTAINMENT_IMAGES_TOO_FEW: "文娱配图不足 25 张",
  DRAFT_CREDENTIAL_MISSING: "缺少草稿凭证"
};
var isPublished = (row) => !Object.hasOwn(row, "status") || row.status === "published";
function safeLedgerURL(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}
function safeDraftReference(row) {
  const value = row.draft_ref && typeof row.draft_ref === "object" ? row.draft_ref : {}, refs = [];
  for (const [key, label3] of [["pgc_id", "PGC"], ["appmsgid", "APPMSG"]]) {
    if (typeof value[key] === "string" && value[key].trim()) refs.push({ label: `${label3} ${value[key]}` });
  }
  if (safeLedgerURL(value.editor_url)) refs.push({ label: "草稿编辑链接", href: value.editor_url });
  return refs;
}
function pipelineDuration(row) {
  if (typeof row.started_at !== "string" || typeof row.timings?.finished_at !== "string") return null;
  const start = Date.parse(row.started_at), end = Date.parse(row.timings.finished_at);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 1e3) : null;
}
function ledgerTopic(row) {
  if (row.slot === "gzh") return "保险";
  return ["zh1", "zh2", "zh3", "tt1", "tt2", "tt3"].includes(row.slot) ? "文娱" : "未标注";
}
function ledgerCell(row, key) {
  if (["reads", "likes", "comments", "approvals", "as_of"].includes(key)) {
    if (!isPublished(row)) return '<span class="article-ledger-muted">未发布</span>';
    return key === "as_of" && row.latest_as_of ? e(time(row.latest_as_of, true)) : dashboardMetric(row, key);
  }
  if (key === "status") return e(statusLabels[row.status] || (isPublished(row) ? "已发布" : "未确认"));
  if (key === "slot") return e(slotLabels[row.slot] || "未标注");
  if (key === "writer") return e(writerLabels[row.writer] || "未记录");
  if (["char_count", "subheading_count", "image_count"].includes(key)) return row[key] == null ? "未取得" : e(num(row[key]));
  if (key === "draft_ref") return safeDraftReference(row).map((ref) => ref.href ? `<a href="${e(ref.href)}" target="_blank" rel="noopener noreferrer">${e(ref.label)} ↗</a>` : `<span>${e(ref.label)}</span>`).join("<br>") || "未取得";
  if (key === "total_duration") {
    const seconds = pipelineDuration(row);
    return seconds === null ? "未取得" : e(duration(seconds));
  }
  if (key === "warnings") return Array.isArray(row.warnings) ? row.warnings.map((code) => e(warningLabels[code] || code)).join("；") || "无警告" : "未取得";
  if (key === "verify") return row.has_pending_verify === true ? "有待处理" : row.verify_state === "complete" ? "已核对" : "未确认";
  if (key === "topic") return e(ledgerTopic(row));
  if (key === "mode") return e(modeLabels[row.production_mode] || "未记录");
  if (key === "duration") return row.duration_seconds == null ? "未取得" : e(duration(row.duration_seconds));
  if (key === "account") return e(row.account_name || "未记录");
  return !isPublished(row) ? "未发布" : row.published_at ? e(time(row.published_at, true)) : "未取得";
}

// web/core/requests.mjs
var pageContext = null, modalContext = null, backgroundContext = null, backgroundKey = "";
var contextId = 0;
function requestAbort() {
  return new DOMException("请求已取消", "AbortError");
}
function isRequestAbort(error) {
  return error?.name === "AbortError";
}
function requestContext(kind) {
  return { id: ++contextId, kind, controller: new AbortController(), pending: /* @__PURE__ */ new Map() };
}
function cancelPageRequests() {
  pageContext?.controller.abort();
  pageContext = null;
}
function beginPageRequests() {
  cancelPageRequests();
  pageContext = requestContext("page");
  return pageContext;
}
function cancelModalRequests() {
  modalContext?.controller.abort();
  modalContext = null;
}
function beginModalRequests() {
  cancelModalRequests();
  modalContext = requestContext("modal");
  return modalContext;
}
function backgroundRequests() {
  const key = [runtime.renderVersion, runtime.sessionEpoch, runtime.articleIndexGeneration].join(":");
  if (!backgroundContext || key !== backgroundKey) {
    backgroundKey = key;
    backgroundContext = requestContext("background");
  }
  return backgroundContext;
}
function assertRequestActive(context, signal) {
  if (context.controller.signal.aborted || signal?.aborted) throw requestAbort();
}
function requestKey(path, options2, envelope) {
  const settings = {};
  for (const key of Object.keys(options2).sort()) {
    if (key === "signal") continue;
    const value = options2[key];
    if (key === "headers") settings.headers = [...new Headers(value)].sort(([a], [b]) => a.localeCompare(b));
    else if (value == null || ["string", "number", "boolean", "undefined"].includes(typeof value)) settings[key] = value;
    else return null;
  }
  return JSON.stringify([runtime.sessionEpoch, runtime.articleIndexGeneration, state.me, path, envelope, settings]);
}
function forgetRequest(entry) {
  if (entry.context.pending.get(entry.key) === entry) entry.context.pending.delete(entry.key);
}
function settleRequest(entry, error, value) {
  entry.done = true;
  forgetRequest(entry);
  for (const consumer of entry.consumers) {
    consumer.cleanup();
    if (error) consumer.reject(error);
    else consumer.resolve(value);
  }
  entry.consumers.clear();
}
function subscribeRequest(entry, signal) {
  return new Promise((resolve, reject) => {
    const contextSignal = entry.context.controller.signal;
    const consumer = { resolve, reject, cleanup() {
      contextSignal.removeEventListener("abort", abort);
      signal?.removeEventListener("abort", abort);
    } };
    function abort() {
      if (!entry.consumers.delete(consumer)) return;
      consumer.cleanup();
      reject(requestAbort());
      if (!entry.done && !entry.consumers.size) {
        forgetRequest(entry);
        entry.controller.abort();
      }
    }
    entry.consumers.add(consumer);
    contextSignal.addEventListener("abort", abort, { once: true });
    signal?.addEventListener("abort", abort, { once: true });
    if (contextSignal.aborted || signal?.aborted) abort();
  });
}
function pendingGet(path, options2, envelope, context, factory) {
  assertRequestActive(context, options2.signal);
  const key = requestKey(path, options2, envelope) ?? /* @__PURE__ */ Symbol("unshared request");
  let entry = context.pending.get(key);
  if (!entry) {
    entry = { key, context, controller: new AbortController(), consumers: /* @__PURE__ */ new Set(), done: false };
    context.pending.set(key, entry);
    let pending;
    try {
      pending = factory(entry.controller.signal);
    } catch (error) {
      pending = Promise.reject(error);
    }
    Promise.resolve(pending).then((value) => settleRequest(entry, null, value), (error) => settleRequest(entry, error));
  }
  return subscribeRequest(entry, options2.signal);
}

// web/core/todos-state.mjs
var todosState = { owner: "", days: /* @__PURE__ */ new Map(), today: "", calendarMonth: "", calendarDate: "" };
function todoOwner() {
  return JSON.stringify([runtime.sessionEpoch, state.me?.id ?? null]);
}
function resetTodos() {
  todosState.owner = todoOwner();
  todosState.days.clear();
  todosState.today = bjtDate();
  todosState.calendarMonth = "";
  todosState.calendarDate = "";
  todosState.preferences = { mode: "strike", version: 0, loaded: false, pending: null, error: "" };
}
function validTodoDate(date) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
  const parsed = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function todoDate() {
  return state.page === "todos" && state.todoPanel !== "templates" && validTodoDate(state.todoDate) ? state.todoDate : bjtDate();
}
function todoDay(date = todoDate()) {
  if (todosState.owner !== todoOwner()) resetTodos();
  if (!todosState.days.has(date)) {
    todosState.days.set(date, {
      date,
      items: [],
      draft: "",
      create: null,
      adding: false,
      loading: false,
      loaded: false,
      error: "",
      notice: "",
      noticeVersion: 0,
      revision: 0,
      sequence: 0,
      updates: /* @__PURE__ */ new Map(),
      templateCreates: /* @__PURE__ */ new Map(),
      removals: /* @__PURE__ */ new Map(),
      templateLinks: /* @__PURE__ */ new Map(),
      templateWrites: /* @__PURE__ */ new Set()
    });
  }
  return todosState.days.get(date);
}
function syncTodoDay(now = Date.now()) {
  if (todosState.owner !== todoOwner()) resetTodos();
  const today = bjtDate(now), changed2 = todosState.today !== today;
  todosState.today = today;
  return changed2;
}
function todoSessionActive(owner) {
  return Boolean(state.me) && owner === todoOwner() && owner === todosState.owner;
}
function mergeTodo(day, item) {
  const index = day.items.findIndex((row) => row.id === item.id);
  if (index < 0) day.items.push(item);
  else if (day.items[index].version <= item.version) day.items[index] = item;
}

// web/core/session-index-state.mjs
var articleIndexes = /* @__PURE__ */ new Map();
function clearArticleIndexes() {
  runtime.articleIndexGeneration++;
  articleIndexes.clear();
  state.reviewArticles = [];
}
function resetSessionIndexes() {
  cancelPageRequests();
  runtime.sessionEpoch++;
  resetTodos();
  clearArticleIndexes();
}

// web/ui/entry.mjs
function stopPageEntry() {
  try {
    runtime.entryObserver?.disconnect();
  } catch {
  }
  runtime.entryObserver = null;
  for (const block of runtime.entryBlocks) {
    block.classList?.remove("entry-ready", "entry-visible");
    block.style?.removeProperty("--entry-delay");
  }
  runtime.entryBlocks = [];
}
function animatePageEntry(container) {
  stopPageEntry();
  if (typeof IntersectionObserver !== "function" || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  try {
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const blocks = Array.from(container?.children || []).filter((block) => block.matches?.("section, details, .overview-status, .review-summary, .segmented"));
    if (!blocks.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (runtime.entryObserver !== observer) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("entry-visible");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0, rootMargin: "0px 0px -8px 0px" });
    runtime.entryObserver = observer;
    runtime.entryBlocks = blocks;
    blocks.forEach((block, index) => {
      block.style.setProperty("--entry-delay", `${Math.min(index, 3) * 40}ms`);
      block.classList.add("entry-ready");
      observer.observe(block);
    });
  } catch {
    stopPageEntry();
  }
}
function applyChartStyles(container) {
  for (const node of container.querySelectorAll(".publication-bars i[data-chart-color],.legend-dot[data-chart-color]")) {
    const color = node.dataset.chartColor;
    node.style.setProperty("--plot-color", /^var\(--p-(?:toutiao|zhihu|wechat|other)\)$/.test(color) ? color : "var(--p-other)");
    if (node.hasAttribute("data-chart-height")) {
      const height = Number(node.dataset.chartHeight);
      node.style.setProperty("--h", Number.isFinite(height) && height >= 0 && height <= 80 ? `${height}px` : "0px");
    }
  }
}
function replacePageContent(html, animate = false) {
  stopPageEntry();
  const content = $("#page-content");
  if (!content) return;
  content.innerHTML = html;
  applyChartStyles(content);
  if (animate) animatePageEntry(content);
}

// web/ui/popover.mjs
function closePopover({ restoreFocus = true } = {}) {
  if (!runtime.activePopover) return;
  const { node, trigger } = runtime.activePopover;
  runtime.activePopover = null;
  node.remove();
  trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus && trigger.isConnected) trigger.focus();
}
function popover(trigger, body, { menu = false, label: label3 = "说明" } = {}) {
  if (runtime.activePopover?.trigger === trigger) {
    closePopover();
    return;
  }
  closePopover();
  const id = trigger.getAttribute("aria-controls") || `popover-${++runtime.popoverId}`, node = document.createElement("div");
  trigger.setAttribute("aria-controls", id);
  trigger.setAttribute("aria-expanded", "true");
  node.id = id;
  node.className = "popover";
  node.setAttribute("role", menu ? "menu" : "dialog");
  node.setAttribute("aria-label", label3);
  node.tabIndex = -1;
  node.innerHTML = body;
  (trigger.closest("[role=dialog]") || document.body).append(node);
  runtime.activePopover = { node, trigger, menu };
  const anchor = trigger.getBoundingClientRect(), r = node.getBoundingClientRect();
  node.style.left = `var(--popover-left,${Math.max(16, Math.min(anchor.right - r.width, innerWidth - r.width - 16))}px)`;
  node.style.top = `var(--popover-top,${Math.max(16, Math.min(anchor.bottom + 8, innerHeight - r.height - 16))}px)`;
  (node.querySelector('button,a[href],input:not([type=hidden]),select,[tabindex="0"]') || node).focus();
}

// web/pages/login.mjs
function renderLogin() {
  resetSessionIndexes();
  stopPageEntry();
  closePopover({ restoreFocus: false });
  runtime.modalRequestVersion++;
  runtime.renderVersion++;
  $("#app").innerHTML = `<main id="main" class="minimal-login"><section class="login-card"><div class="brand login-brand"><span class="brand-mark">${icon("fish", 27)}</span><h1 class="brand-title">好多鱼工作台</h1></div><form id="login-form" aria-label="账号登录"><div class="form-field"><label for="username">账号</label><input class="input" id="username" name="username" autocomplete="username" required autofocus></div><div class="form-field"><label for="password">密码</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></div><p class="form-message" role="alert"></p><button class="btn primary" type="submit">登录 ${icon(
    "arrow",
    15
  )}</button></form></section></main>`;
}

// web/ui/modal.mjs
function openModal(title, body, { drawer = false, context = "" } = {}) {
  cancelModalRequests();
  closePopover();
  runtime.modalRequestVersion++;
  if (!$("#overlay").contains(document.activeElement)) runtime.lastFocus = document.activeElement;
  $("#overlay").innerHTML = `<div class="modal-backdrop ${drawer ? "drawer-backdrop" : ""}"><section class="modal ${drawer ? "drawer" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><div>${context}<h2 id="modal-title">${e(title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon("close", 20)}</button></header><div class="modal-body">${body}</div></section></div>`;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    const field2 = $("input:not([type=checkbox]),select,textarea,button", $("#overlay"));
    field2?.focus();
  });
}
function closeModal() {
  cancelModalRequests();
  closePopover({ restoreFocus: false });
  runtime.modalRequestVersion++;
  if (!$("#overlay")) return;
  const wasOpen = !!$("#overlay").firstChild;
  $("#overlay").innerHTML = "";
  document.body.style.overflow = "";
  if (wasOpen && runtime.lastFocus?.isConnected) runtime.lastFocus.focus();
}

// web/core/api.mjs
function apiOptions(options2) {
  const opts = { credentials: "same-origin", ...options2, headers: { Accept: "application/json", ...options2.headers || {} } };
  if (opts.body !== void 0) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  if (opts.method && !["GET", "HEAD"].includes(opts.method) && state.me?.csrfToken) {
    opts.headers["X-CSRF-Token"] = state.me.csrfToken;
  }
  if (opts.method && !["GET", "HEAD"].includes(opts.method) && state.me?.publicBusiness) {
    opts.headers["X-Public-Business"] = "1";
  }
  return opts;
}
async function apiTransport(path, opts) {
  let response;
  try {
    response = await fetch(`/api/v1${path}`, opts);
  } catch (error) {
    if (isRequestAbort(error)) throw error;
    throw new Error("暂时无法连接网站，请检查网络后重试。");
  }
  if (response.ok && !["GET", "HEAD"].includes((opts.method || "GET").toUpperCase())) {
    if (["/auth/login", "/auth/logout", "/auth/password"].includes(path)) resetSessionIndexes();
    else clearArticleIndexes();
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    if (isRequestAbort(error)) throw error;
    throw new Error("服务暂时不可用，请稍后重试。");
  }
  return { ok: response.ok, status: response.status, text };
}
function apiFailure(path, response, payload, epoch, identity) {
  const current = epoch === runtime.sessionEpoch && identity === (state.me?.id ?? null);
  if (response.status === 401 && path !== "/auth/login" && current) {
    state.me = null;
    closeModal();
    renderLogin();
  }
  const message = payload.error?.message || (response.status === 409 ? "记录已更新，请刷新后重新编辑。" : "操作失败，请稍后重试。");
  const error = new Error(message);
  error.status = response.status;
  error.code = payload.error?.code;
  if (response.status === 401 && !current) error.staleSession = true;
  return error;
}
async function api(path, options2 = {}) {
  const epoch = runtime.sessionEpoch, identity = state.me?.id ?? null;
  const { envelope = false, context, ...requestOptions } = options2;
  const opts = apiOptions(requestOptions), method = (opts.method || "GET").toUpperCase();
  const scope = method === "GET" ? context || backgroundRequests() : null;
  const response = scope ? await pendingGet(
    path,
    opts,
    envelope,
    scope,
    (signal) => apiTransport(path, { ...opts, signal })
  ) : await apiTransport(path, opts);
  if (scope) assertRequestActive(scope, opts.signal);
  let payload;
  try {
    payload = JSON.parse(response.text);
  } catch {
    throw new Error("服务暂时不可用，请稍后重试。");
  }
  if (!response.ok) throw apiFailure(path, response, payload, epoch, identity);
  return envelope ? payload : payload.data;
}

// web/pages/article-reconciliation.mjs
var reconciliationData = null;
var fieldLabels = { run_date: "日期", status: "状态", slot: "槽位", writer: "写作者", series_no: "编号" };
var label = (choices, value) => choices[value] || "未知";
function options(values, choices) {
  return '<option value="">全部</option>' + values.map((value) => `<option value="${e(value)}">${e(choices ? label(choices, value) : value)}</option>`).join("");
}
function statusCounts(counts) {
  return Object.entries(counts).map(([key, value]) => `${label(statusLabels, key)} ${value}`).join(" · ");
}
function insurance(data) {
  const value = data.insurance;
  return `<section class="card"><h2>保险编号进度</h2><p class="muted">仅统计当前授权范围内明确 gzh 槽位，不从标题推断。</p>
<dl class="article-ledger-stats"><div><dt>实际记录</dt><dd>${e(value.recorded)}</dd></div><div><dt>去重编号</dt><dd>${e(value.unique_count)}</dd></div>
<div><dt>最高编号</dt><dd>${e(value.highest ?? "未知")}</dd></div></dl><p>${e(statusCounts(value.counts))}</p>
<p>重复号：${e(value.duplicate_numbers.map((row) => `${row.number}（${row.article_ids.length}条）`).join("、") || "无")}</p>
<p>缺号候选：${e(value.observed_gap_ranges.map((row) => row.from === row.to ? row.from : `${row.from}–${row.to}`).join("、") || "未观察到内部间隔")}</p>
<p class="muted">候选仅为已有最低号与最高号之间的间隔。起点、目标未配置，不能断言缺号或计算完成率。样本编号映射：未知。</p></section>`;
}
function articleRows(rows) {
  return rows.map((row) => `<tr><td><button class="btn text" data-action="article-detail" data-id="${e(row.id)}">${e(row.title)}</button></td>
<td>${e(row.run_date ?? "未标注")}</td><td>${e(label(slotLabels, row.slot))}</td><td>${e(label(statusLabels, row.status))}</td>
<td>${e(label(writerLabels, row.writer))}</td><td>${e(row.series_no ?? "未知")}</td>
<td>${e(row.missing_fields.map((key) => fieldLabels[key] || key).join("、") || "无")}</td>
<td>${e(row.has_pending_verify === true ? "待核" : row.verify_state === "complete" ? "已核" : "未知")}</td>
<td>${e(row.warnings.length ? row.warnings.map((key) => warningLabels[key] || key).join("；") : "无")}</td><td>${row.sample == null ? "未知" : `<details><summary>原始样本记录</summary><pre>${e(JSON.stringify(row.sample, null, 2))}</pre></details>`}</td></tr>`).join("");
}
function table(data, filters = {}) {
  const rows = data.rows.filter((row) => ["run_date", "slot", "writer", "status"].every((key) => !filters[key] || (row[key] ?? "unknown") === filters[key]));
  return `<p role="status">筛选内实际记录 ${e(rows.length)} 条；完整授权范围 ${e(data.total)} 条。</p>${rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>文章</th><th>存稿日期</th><th>槽位</th><th>状态</th>
<th>写作者</th><th>编号</th><th>缺字段</th><th>待核</th><th>警告</th><th>样本</th></tr></thead><tbody>${articleRows(rows)}</tbody></table></div>` : '<p class="muted">没有符合条件的实际文章记录。</p>'}`;
}
function changeReconciliationFilters(element) {
  const form = element.closest("#reconciliation-filters");
  if (!form || !reconciliationData) return false;
  document.querySelector("#reconciliation-results").innerHTML = table(reconciliationData, Object.fromEntries(new FormData(form)));
  return true;
}
function renderReconciliation(data) {
  if (data?.complete !== true || !Array.isArray(data.rows)) throw new Error("对账数据未完整取得，请重试。");
  reconciliationData = data;
  const values = (key) => [...new Set(data.rows.map((row) => row[key] ?? "unknown"))].sort();
  const dates = Object.fromEntries(values("run_date").map((value) => [value, value === "unknown" ? "日期未标注" : value]));
  return `<div class="article-ledger-overview article-reconciliation"><section class="card"><h2>实际文章对账</h2>
<p class="muted">按存稿日期 run_date 核对完整实际记录，未知状态保留；草稿不计入已发布。</p>
<p>应产出：未配置 · 缺产：未配置 · 逾期：未配置</p><p>${e(statusCounts(data.counts))}</p>
<form id="reconciliation-filters" class="filters">
<label class="form-field">日期<select class="input" name="run_date">${options(values("run_date"), dates)}</select></label>
<label class="form-field">槽位<select class="input" name="slot">${options(values("slot"), slotLabels)}</select></label>
<label class="form-field">写作者<select class="input" name="writer">${options(values("writer"), writerLabels)}</select></label>
<label class="form-field">状态<select class="input" name="status">${options(values("status"), statusLabels)}</select></label></form>
<p class="cell-sub">表格可横向滑动，查看状态、槽位、待核及缺字段。</p>
<div id="reconciliation-results">${table(data)}</div></section>${insurance(data)}</div>`;
}
async function loadReconciliation(context) {
  return api("/article-reconciliation", { context });
}

// web/core/storage.mjs
var storage = { get(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}, set(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
  }
} };

// web/core/daily-notes-state.mjs
var DAILY_NOTES_MAX_BYTES = 65536;
function validDailyNotesDate(value) {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function dailyNotesToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date()).map((part) => [part.type, part.value]));
  return parts.year + "-" + parts.month + "-" + parts.day;
}
var routeDate = "";
function dailyNotesRouteDate() {
  return routeDate || dailyNotesToday();
}
function setDailyNotesRouteDate(value) {
  routeDate = validDailyNotesDate(value) ? value : "";
}
function dailyNotesBytes(text) {
  return new TextEncoder().encode(text).length;
}
function checkedPage(value, date) {
  if (!value || value.date !== date || typeof value.text !== "string" || !Number.isSafeInteger(value.version) || value.version < 0 || typeof value.deleted !== "boolean" || typeof value.can_edit !== "boolean" || dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES) throw new Error("碎碎念读取结果不完整，请重新核对。");
  return value;
}
function createDailyNotesContext({
  load,
  put,
  remove,
  restore,
  onChange = () => {
  },
  onSaved = () => {
  },
  uuid = () => crypto.randomUUID(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = 700
}) {
  const context = { pages: /* @__PURE__ */ new Map(), disposed: false, options: { load, put, remove, restore, onSaved, uuid } };
  const pages = context.pages;
  const emit = () => {
    if (!context.disposed) onChange();
  };
  const page = (date) => {
    if (!validDailyNotesDate(date)) throw new Error("请选择有效日期。");
    if (!pages.has(date)) pages.set(date, {
      date,
      loaded: false,
      loading: false,
      canEdit: false,
      serverText: "",
      draft: "",
      version: 0,
      updatedAt: null,
      deleted: false,
      dirty: false,
      phase: "loading",
      error: "",
      remote: null,
      pending: null,
      timer: null,
      sequence: 0,
      writeEpoch: 0
    });
    return pages.get(date);
  };
  const stopTimer = (item) => {
    if (item.timer !== null) clearTimer(item.timer);
    item.timer = null;
  };
  const adopt = (item, value, preserve = false) => {
    item.canEdit = value.can_edit;
    item.serverText = value.deleted ? "" : value.text;
    item.version = value.version;
    item.updatedAt = value.updated_at;
    item.deleted = value.deleted;
    if (!preserve) item.draft = item.serverText;
    item.dirty = item.draft !== item.serverText;
    item.loaded = true;
  };
  function schedule(item) {
    stopTimer(item);
    if (!context.disposed && item.canEdit && item.dirty && !item.pending && !item.loading && !item.composing && !["conflict", "unknown", "error", "oversize"].includes(item.phase)) {
      item.timer = setTimer(() => {
        item.timer = null;
        void context.save(item.date);
      }, delay);
    }
  }
  const matches = (value, operation) => value.version === operation.version + 1 && (operation.kind === "delete" ? value.deleted === true : operation.kind === "restore" ? value.deleted === false : value.deleted === false && value.text === operation.text);
  function accepted(item, value, operation) {
    const keep = operation.kind === "put" && item.draft !== operation.text;
    item.writeEpoch++;
    adopt(item, value, keep);
    item.remote = null;
    item.pending = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit();
    onSaved(item.date);
    schedule(item);
  }
  function dispose() {
    context.disposed = true;
    for (const item of pages.values()) stopTimer(item);
  }
  Object.assign(context, { page, emit, stopTimer, adopt, schedule, matches, accepted, dispose });
  return context;
}
function createReadingActions(context) {
  const { page, emit, stopTimer, adopt, schedule } = context;
  const { load } = context.options;
  async function read(date) {
    const item = page(date), sequence = ++item.sequence, writeEpoch = item.writeEpoch;
    item.loading = true;
    emit();
    try {
      const value = checkedPage(await load(date), date);
      if (context.disposed || sequence !== item.sequence) return;
      if (item.pending || writeEpoch !== item.writeEpoch) return;
      if (["conflict", "unknown"].includes(item.phase)) {
        item.remote = value;
        item.canEdit = value.can_edit;
      } else if (item.dirty && value.version !== item.version) {
        item.remote = value;
        item.canEdit = value.can_edit;
        item.phase = "conflict";
        item.error = "服务器已有新版本，草稿已保留，请核对后选择。";
      } else {
        adopt(item, value, item.dirty);
        item.phase = item.dirty ? "dirty" : "saved";
        item.error = "";
      }
    } catch (error) {
      if (!context.disposed && sequence === item.sequence) {
        item.error = error.message;
        if (!["conflict", "unknown"].includes(item.phase)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence === item.sequence) {
        item.loading = false;
        emit();
        schedule(item);
      }
    }
  }
  function edit(date, text, { composing = false } = {}) {
    const item = page(date);
    if (context.disposed || !item.canEdit || !item.loaded || ["delete", "restore"].includes(item.pending?.kind)) return;
    item.composing = composing;
    item.draft = text;
    item.dirty = text !== item.serverText;
    stopTimer(item);
    if (dailyNotesBytes(text) > DAILY_NOTES_MAX_BYTES) {
      if (!["conflict", "unknown"].includes(item.phase)) item.phase = "oversize";
      item.error = "文字超过 64 KiB，草稿已保留，请缩短后再保存。";
    } else if (!["conflict", "unknown"].includes(item.phase)) {
      item.phase = item.pending ? "saving" : item.dirty ? "dirty" : "saved";
      item.error = "";
    }
    emit();
    if (!composing) schedule(item);
  }
  return { read, edit };
}
function createWritingActions(context) {
  const { page, emit, stopTimer, matches, accepted } = context;
  const { put, remove, restore, uuid } = context.options;
  async function send(item, operation) {
    stopTimer(item);
    item.pending = operation;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    emit();
    try {
      const raw = await (operation.kind === "restore" ? restore(item.date, {
        version: operation.version,
        save_id: operation.saveId
      }) : operation.kind === "delete" ? remove(item.date, {
        version: operation.version,
        save_id: operation.saveId
      }) : put(item.date, { text: operation.text, version: operation.version, save_id: operation.saveId }));
      if (context.disposed || item.pending !== operation) return;
      const value = checkedPage(raw, item.date);
      if (!matches(value, operation)) throw new Error("保存响应需要重新核对。");
      accepted(item, value, operation);
    } catch (error) {
      if (context.disposed || item.pending !== operation) return;
      if (error.status === 409) {
        item.pending = null;
        item.phase = "conflict";
        item.dirty = true;
        item.error = "服务器已有新版本，草稿已保留，不会自动覆盖。";
        emit();
        await context.read(item.date);
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null;
        item.phase = "error";
        item.error = error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
        emit();
      } else {
        item.phase = "unknown";
        item.error = "正在核对保存结果，草稿已保留。";
        emit();
        await context.reconcile(item.date);
      }
    }
  }
  async function save(date) {
    const item = page(date);
    stopTimer(item);
    if (context.disposed || !item.canEdit || !item.loaded || item.loading || item.pending || ["conflict", "unknown"].includes(item.phase) || !item.dirty) return;
    if (dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES) {
      item.phase = "oversize";
      item.error = "文字超过 64 KiB，草稿已保留。";
      emit();
      return;
    }
    return send(item, { kind: "put", text: item.draft, version: item.version, saveId: uuid() });
  }
  async function deletePage(date) {
    const item = page(date);
    if (context.disposed || !item.canEdit || !item.loaded || item.pending || ["conflict", "unknown"].includes(item.phase) || item.version === 0 || item.deleted) return;
    return send(item, { kind: "delete", text: item.draft, version: item.version, saveId: uuid() });
  }
  async function retryPending(date) {
    const item = page(date), operation = item.pending;
    if (context.disposed || item.phase !== "unknown" || !operation?.retryReady || operation.checking || !item.canEdit) return;
    operation.retryReady = false;
    return send(item, operation);
  }
  async function restorePage(date) {
    const item = page(date);
    if (context.disposed || !item.canEdit || !item.loaded || !item.deleted || item.pending || item.dirty || ["conflict", "unknown"].includes(item.phase)) return;
    return send(item, { kind: "restore", text: "", version: item.version, saveId: uuid() });
  }
  return { save, deletePage, restorePage, retryPending };
}
function createResolutionActions(context) {
  const { page, emit, stopTimer, adopt, matches, accepted } = context;
  const { load } = context.options;
  async function reconcile(date) {
    const item = page(date), operation = item.pending;
    if (context.disposed || item.phase !== "unknown" || !operation || operation.checking) return;
    operation.checking = true;
    operation.retryReady = false;
    emit();
    try {
      const value = checkedPage(await load(date), date);
      if (context.disposed || item.pending !== operation) return;
      item.canEdit = value.can_edit;
      if (matches(value, operation)) accepted(item, value, operation);
      else if (value.version > operation.version) {
        item.remote = value;
        item.pending = null;
        item.phase = "conflict";
        item.dirty = true;
        item.error = "服务器已有不同的新版本，草稿已保留，不会自动覆盖。";
      } else {
        item.remote = value;
        operation.retryReady = value.can_edit && value.version === operation.version;
        item.error = operation.retryReady ? "已核对服务器尚无新版本。可手动重试原保存，后续草稿仍会保留。" : "保存结果尚未确认，草稿已保留。请再次核对，暂不重复发送。";
      }
    } catch (error) {
      if (!context.disposed && item.pending === operation) item.error = "核对失败，草稿已保留：" + error.message;
    } finally {
      operation.checking = false;
      emit();
    }
  }
  function useServer(date) {
    const item = page(date);
    if (!item.remote || item.pending || item.phase !== "conflict") return;
    stopTimer(item);
    adopt(item, item.remote);
    item.remote = null;
    item.phase = "saved";
    item.error = "";
    emit();
  }
  async function useDraft(date) {
    const item = page(date);
    if (!item.remote || item.pending || item.phase !== "conflict" || !item.remote.can_edit) return;
    adopt(item, item.remote, true);
    item.remote = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit();
    return context.save(date);
  }
  return { reconcile, useServer, useDraft };
}
function createDailyNotesStore(options2) {
  const context = createDailyNotesContext(options2);
  Object.assign(context, createReadingActions(context), createWritingActions(context), createResolutionActions(context));
  const { page, pages, read, edit, save, deletePage, restorePage, reconcile, retryPending, useServer, useDraft, dispose } = context;
  return { page, pages, read, edit, save, deletePage, restorePage, reconcile, retryPending, useServer, useDraft, dispose };
}

// web/core/router.mjs
function normalizeArticlePipelineFilters(filters) {
  const allowed = {
    status: Object.keys(statusLabels),
    slot: ["", ...Object.keys(slotLabels)],
    writer: ["", ...Object.keys(writerLabels)],
    has_warnings: ["", "true", "false"],
    has_pending_verify: ["", "true", "false"]
  };
  for (const [key, choices] of Object.entries(allowed)) {
    if (!choices.includes(filters[key])) filters[key] = defaultFilters()[key];
  }
  for (const key of ["series_no_min", "series_no_max"]) {
    const value = filters[key];
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) filters[key] = "";
  }
  if (filters.series_no_min && filters.series_no_max && Number(filters.series_no_min) > Number(filters.series_no_max)) {
    filters.series_no_min = "";
    filters.series_no_max = "";
  }
  return filters;
}
function updateRoute(push = false) {
  const u = new URL(location.href);
  u.searchParams.set("page", state.page);
  u.searchParams.set("period", state.overviewPeriod);
  if (["published", "reconciliation"].includes(state.articleOverviewMode)) u.searchParams.set("article_scope", state.articleOverviewMode);
  else u.searchParams.delete("article_scope");
  if (state.page === "todos" && state.todoDate) u.searchParams.set("date", state.todoDate);
  else if (state.page === "notes") u.searchParams.set("date", dailyNotesRouteDate());
  else u.searchParams.delete("date");
  if (state.page === "todos" && state.todoPanel) u.searchParams.set("todo_panel", state.todoPanel);
  else u.searchParams.delete("todo_panel");
  if (state.page === "settings") u.searchParams.set("tab", state.settingsTab);
  else if (state.page === "reviews") u.searchParams.set("tab", state.reviewTab);
  else u.searchParams.delete("tab");
  if (state.account && state.page !== "dashboard") u.searchParams.set("account", state.account);
  else u.searchParams.delete("account");
  for (const [key, value] of Object.entries(state.filters)) {
    if (value && value !== defaultFilters()[key]) u.searchParams.set(key, value);
    else u.searchParams.delete(key);
  }
  for (const [key, value, def] of [["list_page", state.listPage, 1], ["page_size", state.pageSize, 20], ["top_n", state.topN, 5], [
    "top_platform",
    state.topPlatform,
    ""
  ]]) {
    if (value !== def) u.searchParams.set(key, value);
    else u.searchParams.delete(key);
  }
  if ([...state.columns].join(",") !== defaultColumns.join(",")) u.searchParams.set("columns", [...state.columns].join(","));
  else u.searchParams.delete("columns");
  history[push ? "pushState" : "replaceState"]({}, "", u);
  storage.set("haoduoyu.account", state.account);
}
function readRoute() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("page");
  const fallback = "todos";
  state.page = Object.hasOwn(legacyPages, raw) ? "settings" : nav.some((n) => n.id === raw) ? raw : fallback;
  if (state.page === "notes") setDailyNotesRouteDate(params.get("date"));
  state.todoDate = state.page === "todos" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoPanel = state.page === "todos" && ["history", "templates"].includes(params.get("todo_panel")) ? params.get("todo_panel") : "";
  state.settingsTab = (Object.hasOwn(legacyPages, raw) ? legacyPages[raw] : null) || (Object.hasOwn(settingsTabs, params.get("tab")) ? params.get("tab") : raw === "settings" && !params.has("tab") ? "workspace" : "accounts");
  state.reviewTab = ["pending", "observations", "daily"].includes(params.get("tab")) ? params.get("tab") : "observations";
  state.overviewPeriod = ["yesterday", "7d", "30d"].includes(params.get("period")) ? params.get("period") : "yesterday";
  state.articleOverviewMode = ["published", "reconciliation"].includes(params.get("article_scope")) ? params.get("article_scope") : "drafts";
  const account = params.get("account") || "";
  state.account = state.page !== "dashboard" && state.accounts.some((a) => a.id === account) ? account : "";
  state.filters = defaultFilters();
  for (const key of Object.keys(state.filters)) if (params.has(key)) state.filters[key] = params.get(key);
  const allowed = { sort: ["published_at", "reads", "likes", "comments", "approvals", "latest_as_of", "duration"], order: ["asc", "desc"], platform: [
    "",
    "toutiao",
    "zhihu",
    "wechat",
    "other"
  ], topic: ["", "insurance", "entertainment", "unknown"], data_status: [
    "",
    "no_snapshot",
    "missing_reads",
    "missing_likes",
    "missing_comments",
    "incomplete",
    "zero_reads",
    "date_unverified"
  ], mode: ["", ...Object.keys(modeLabels)], group: [
    "",
    "account",
    "mode"
  ] };
  for (const [key, values] of Object.entries(allowed)) if (!values.includes(state.filters[key])) state.filters[key] = defaultFilters()[key];
  normalizeArticlePipelineFilters(state.filters);
  const int = (key, def, max) => /^\d+$/.test(params.get(key) || "") && Number(params.get(key)) > 0 && Number(params.get(key)) <= max ? Number(
    params.get(key)
  ) : def;
  state.listPage = int("list_page", 1, 1e6);
  state.pageSize = int("page_size", 20, 200);
  state.topN = int("top_n", 5, 100);
  state.topPlatform = ["toutiao", "zhihu", "wechat", "other"].includes(params.get("top_platform")) ? params.get("top_platform") : "";
  state.columns = new Set(params.has("columns") ? params.get("columns").split(",").filter((c) => Object.hasOwn(articleColumns, c)) : defaultColumns);
}

// web/core/modal-request.mjs
async function modalRequest(path, ticket, version, context) {
  try {
    return await api(path, { context });
  } catch (err) {
    if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return null;
    throw err;
  }
}

// web/ui/segmented.mjs
function segmented(action, items, selected, label3, attribute = "tab", classes = "") {
  return `<div class="segmented${classes ? " " + e(classes) : ""}" role="group" aria-label="${e(label3)}">${items.map(([value, text]) => `<button type="button" class="btn" data-action="${e(action)}" data-${e(attribute)}="${e(value)}" aria-pressed="${selected === value}">${e(
    text
  )}</button>`).join("")}</div>`;
}
function platformFilter(action, selected, label3 = "平台") {
  return segmented(action, [["", "全部"], ...Object.entries(platforms)], selected, label3, "platform");
}

// web/ui/table.mjs
function sortHeading(key, label3) {
  return `<button class="sort-heading" data-action="sort-column" data-sort="${e(key)}" aria-label="按${e(label3)}排序">${e(label3)} ${state.filters.sort === key ? state.filters.order === "asc" ? "↑" : "↓" : "↕"}</button>`;
}

// web/ui/toast.mjs
function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = `toast${error ? " error" : ""}`;
  node.setAttribute("role", error ? "alert" : "status");
  node.textContent = message;
  $("#toasts").append(node);
  while ($("#toasts").children.length > 3) $("#toasts").firstElementChild.remove();
  setTimeout(() => node.remove(), error ? 8e3 : 4500);
}

// web/pages/articles.mjs
var pipelineColumns = /* @__PURE__ */ new Set([
  "status",
  "slot",
  "writer",
  "char_count",
  "subheading_count",
  "image_count",
  "draft_ref",
  "total_duration",
  "warnings",
  "verify",
  "topic"
]);
var pipelineFilters = ["status", "slot", "writer", "has_warnings", "has_pending_verify", "series_no_min", "series_no_max"];
var boolChoices = { true: "是", false: "否" };
var publishedArticle = (article) => !Object.hasOwn(article, "status") || article.status === "published";
function statusSelect(value = "draft_saved", allowUnknown = false) {
  const unknown = allowUnknown && !Object.hasOwn(statusLabels, value);
  if (!unknown && !Object.hasOwn(statusLabels, value)) value = "draft_saved";
  return `<label class="form-field">状态<select name="status" class="input" aria-label="文章状态">
${unknown ? '<option value="" selected disabled>未确认，请选择状态</option>' : ""}
${Object.entries(statusLabels).map(([key, label3]) => `<option value="${e(key)}" ${value === key ? "selected" : ""}>${e(label3)}</option>`).join("")}
</select></label>`;
}
function filterChips(f) {
  const labels = {
    q: "搜索",
    platform: "平台",
    data_status: "数据状态",
    from: "发布自",
    to: "发布至",
    mode: "生产方式",
    topic: "旧题材筛选",
    group: "分组",
    slot: "槽位",
    writer: "写作者",
    has_warnings: "有警告",
    has_pending_verify: "待核",
    series_no_min: "系列自",
    series_no_max: "系列至"
  };
  const choices = {
    platform: platforms,
    data_status: articleStatuses,
    slot: slotLabels,
    writer: writerLabels,
    has_warnings: boolChoices,
    has_pending_verify: boolChoices,
    ...articleChoices
  };
  const chips = [["account", "账号", state.account ? accountName(state.account) : ""], ...Object.entries(labels).map(([key, label3]) => [key, label3, choices[key]?.[f[key]] || f[key]])].filter(([, , value]) => value);
  if (!chips.length) return "";
  return `<div class="selected-filters" aria-label="已选条件">${chips.map(([key, label3, value]) => `<button class="badge" data-action="remove-filter" data-filter="${e(key)}"
aria-label="移除${e(label3)}：${e(value)}">${e(label3)}：${e(value)} ×</button>`).join("")}
<button class="btn text" data-action="reset-filters">清空</button></div>`;
}
function articlePagination(meta) {
  const sizes = [.../* @__PURE__ */ new Set([10, 20, 50, 100, state.pageSize])].sort((a, b) => a - b);
  return `<div class="pagination"><span>共 ${e(num(meta.total))} 篇</span><label>每页
<select id="page-size" class="input">${sizes.map((n) => `<option value="${e(n)}" ${state.pageSize === n ? "selected" : ""}>${e(n)}</option>`).join("")}</select></label><button class="btn" data-action="list-prev" aria-label="上一页" ${state.listPage <= 1 ? "disabled" : ""}>‹</button>
<span>${e(num(state.listPage))} / ${e(num(Math.max(1, Math.ceil(meta.total / state.pageSize))))}</span>
<button class="btn" data-action="list-next" aria-label="下一页" ${meta.has_more ? "" : "disabled"}>›</button></div>`;
}
async function renderArticles(version = runtime.renderVersion, context) {
  const f = { ...state.filters }, params = new URLSearchParams();
  if (state.account) params.set("account_id", state.account);
  for (const key of ["q", "mode", "from", "to", "sort", "order", "platform", "topic", "data_status", ...pipelineFilters]) {
    if (f[key]) params.set(key, f[key]);
  }
  params.set("status", f.status || "draft_saved");
  params.set("page", state.listPage);
  params.set("page_size", state.pageSize);
  const payload = await api(`/articles?${params}`, { envelope: true, context });
  if (version !== runtime.renderVersion) return "";
  const articles = payload.data, meta = payload.meta || { total: articles.length, unfiltered_total: articles.length, has_more: false };
  state.articles = articles;
  state.articleMeta = meta;
  const content = articles.length ? articleTable(articles) : empty(
    meta.unfiltered_total ? "筛选无结果" : "尚未记录文章",
    "可先保存草稿，发布时再填写真实链接和时间。",
    '<button class="btn" data-action="reset-filters">清空筛选</button>'
  );
  return `<section class="card article-list article-ledger article-ledger-list"><form id="article-filters" class="filters">
<label class="search">${icon("search", 15)}<input class="input" name="q" value="${e(f.q)}"
placeholder="搜索标题或链接…" aria-label="搜索文章"></label>${statusSelect(f.status || "draft_saved")}
${platformFilter("article-platform", f.platform, "文章平台")}${articleSelect("data_status", "数据状态", articleStatuses, f.data_status)}
<button type="button" class="btn" data-action="article-filter" aria-expanded="false" aria-controls="article-filter-popover">筛选 ▾</button>
</form>${filterChips(f)}${content}${articlePagination(meta)}</section>`;
}
function pipelineFilterFields(f) {
  return `${statusSelect(f.status || "draft_saved")}${articleSelect("slot", "槽位", slotLabels, f.slot)}
${articleSelect("writer", "写作者", writerLabels, f.writer)}${articleSelect("has_warnings", "有警告", boolChoices, f.has_warnings)}
${articleSelect("has_pending_verify", "有明确待核", boolChoices, f.has_pending_verify)}
${field("series_no_min", "系列编号自", "number", f.series_no_min, 'min="1" step="1"')}
${field("series_no_max", "系列编号至", "number", f.series_no_max, 'min="1" step="1"')}`;
}
function articleFilterPanel({ filters: f = state.filters, columns: c = state.columns, account = state.account } = {}) {
  return `<form id="filter-panel">${["q", "platform", "data_status"].map((key) => `<input type="hidden" name="${e(key)}" value="${e(f[key])}">`).join("")}
<h2>文章筛选 <span class="badge">应用后生效</span></h2><div class="form-grid"><label class="form-field full">运营账号
<select name="account" class="input" aria-label="运营账号">${accountOptions(account)}</select></label>${pipelineFilterFields(f)}
${field("from", "发布自", "date", f.from)}${field("to", "发布至", "date", f.to)}
${Object.entries({ mode: "生产方式", group: "分组" }).map(([key, label3]) => articleSelect(key, label3, articleChoices[key], f[key])).join("")}
<fieldset class="form-field full permission-fields"><legend>显示字段</legend><div class="checkboxes">
${Object.entries(articleColumns).map(([key, [label3]]) => `<label class="check-option"><input type="checkbox" name="columns"
value="${e(key)}" ${c.has(key) ? "checked" : ""}>${e(label3)}</label>`).join("")}</div></fieldset>
<div class="form-field full"><span>更多排序</span><input type="hidden" name="sort" value="${e(f.sort)}">
<input type="hidden" name="order" value="${e(f.order)}"><div class="head-actions">${sortChoices(f, c)}</div></div>
<div class="form-field full"><label for="filter-view">常用视图（筛选和字段）</label><select id="filter-view" class="input">
<option value="">选择视图后应用</option>${state.savedViews.map((v) => `<option value="${e(v.id)}">${e(v.name)}</option>`).join("")}
</select><button type="button" class="btn" data-action="save-view">保存已应用视图</button></div></div>
<div class="form-actions"><button type="button" class="btn" data-action="reset-draft">重置草稿</button>
<button type="submit" class="btn">应用</button></div></form>`;
}
function sortChoices(f, columns) {
  return Object.entries(articleColumns).filter(([, [, sort]]) => sort).map(([key, [label3, sort]]) => `<button type="button" class="btn small" data-action="draft-sort" data-visible="${sort === "published_at" || columns.has(key)}"
data-sort="${e(sort)}" aria-pressed="${f.sort === sort}">${e(label3)} ${f.sort === sort ? f.order === "asc" ? "↑" : "↓" : "↕"}</button>`).join("") || "使用表头排序";
}
function articleDraft(form) {
  const values = new FormData(form), filters = { ...state.filters };
  for (const key of ["q", "platform", "data_status", "from", "to", "mode", "group", "sort", "order", ...pipelineFilters]) {
    filters[key] = String(values.get(key) || "");
  }
  filters.topic = "";
  if (!Object.hasOwn(statusLabels, filters.status)) filters.status = "draft_saved";
  if (!Object.values(articleColumns).some(([, sort]) => sort === filters.sort)) filters.sort = "published_at";
  if (!["asc", "desc"].includes(filters.order)) filters.order = "desc";
  return {
    filters: normalizeArticlePipelineFilters(filters),
    columns: new Set(values.getAll("columns").filter((c) => Object.hasOwn(articleColumns, c))),
    account: String(values.get("account") || "")
  };
}
function viewDraft(view) {
  return { filters: normalizeArticlePipelineFilters({ ...defaultFilters(), ...Object.fromEntries(Object.entries(view.filters).filter(([key]) => Object.hasOwn(defaultFilters(), key))) }), columns: /* @__PURE__ */ new Set([
    ...view.columns.filter((key) => Object.hasOwn(articleColumns, key)),
    ...view.version !== 2 && !view.columns.includes("as_of") ? ["likes", "comments", "as_of"] : []
  ]), account: state.account };
}
function articleCell(article, key) {
  if (pipelineColumns.has(key)) return ledgerCell(article, key);
  if (["reads", "likes", "comments", "approvals", "as_of", "published"].includes(key) && !publishedArticle(article)) return "未发布";
  if (["reads", "likes", "comments", "approvals"].includes(key)) return dashboardMetric(article, key);
  if (key === "as_of") return article.latest_as_of ? e(time(article.latest_as_of, true)) : dashboardMetric(article, "as_of");
  if (key === "mode") return badgeMode(article.production_mode);
  if (key === "duration") return publishedArticle(article) ? e(duration(article.duration_seconds)) : "未发布";
  if (key === "account") return e(article.account_name);
  return article.date_status === "unverified" ? "日期待核实" : e(time(article.published_at, true));
}
function articleSubtitle(article) {
  const stamp = publishedArticle(article) ? article.date_status === "unverified" ? "日期待核实" : time(article.published_at, true) : article.run_date || "日期未标注";
  return `${platformLogo(article.platform)} ${e(article.account_name)} · ${e(stamp)} · ${e(ledgerTopic(article))}`;
}
function articleRow(article, columns) {
  return `<tr><td class="title-cell"><button class="article-link" data-action="article-detail" data-id="${e(article.id)}">
${e(article.title)}</button><div class="cell-sub">${articleSubtitle(article)}</div></td>
${columns.map(([key, [label3]]) => `<td data-label="${e(label3)}">${articleCell(article, key)}</td>`).join("")}
<td><button class="icon-button" data-action="article-menu" data-id="${e(article.id)}" aria-label="操作：${e(article.title)}"
aria-haspopup="menu" aria-expanded="false" aria-controls="article-menu-${e(article.id)}">⋯</button></td></tr>`;
}
function articleTable(rows) {
  const columns = Object.entries(articleColumns).filter(([key]) => state.columns.has(key));
  let previous = null;
  return `<div class="table-scroll article-desktop"><table class="data-table article-table"><thead><tr>
<th aria-sort="${!state.columns.has("published") && state.filters.sort === "published_at" ? state.filters.order === "asc" ? "ascending" : "descending" : "none"}">${state.columns.has("published") ? "标题" : sortHeading("published_at", "标题 / 发布")}</th>${columns.map(([key, [label3, sort]]) => `<th ${sort ? `aria-sort="${state.filters.sort === sort ? state.filters.order === "asc" ? "ascending" : "descending" : "none"}"` : ""}>
${sort ? sortHeading(sort, label3) : e(label3)}${key === "likes" ? dashboardInfo("metrics", "点赞口径", "articles") : ""}</th>`).join("")}
<th>操作</th></tr></thead><tbody class="article-cards">${rows.map((article) => {
    const group = state.filters.group ? state.filters.group === "account" ? article.account_name : modeLabels[article.production_mode] : null;
    const heading = group && group !== previous ? `<tr class="group-row"><td colspan="${e(columns.length + 2)}">${e(group)}</td></tr>` : "";
    previous = group;
    return heading + articleRow(article, columns);
  }).join("")}</tbody></table></div>`;
}
function articleMenu(article) {
  return `<button role="menuitem" data-action="article-detail" data-id="${e(article.id)}">详情</button>${safeURL(article.url) ? `<a role="menuitem" href="${e(article.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>` : ""}
<button role="menuitem" data-action="edit-article" data-id="${e(article.id)}">编辑</button>${publishedArticle(article) ? `<button role="menuitem" data-action="review-article" data-id="${e(article.id)}">补充数据</button>` : ""}`;
}
function nullableSelect(name, label3, choices, value) {
  return `<label class="form-field">${e(label3)}<select class="input" name="${e(name)}"><option value="">未标注</option>
${Object.entries(choices).map(([key, text]) => `<option value="${e(key)}" ${value === key ? "selected" : ""}>${e(text)}</option>`).join("")}
</select></label>`;
}
function articleMetadataFields(article) {
  const status = Object.hasOwn(article, "status") ? article.status : "published";
  return `${statusSelect(status, true)}${nullableSelect("slot", "槽位", slotLabels, article.slot)}
${nullableSelect("writer", "写作者", writerLabels, article.writer)}${nullableSelect("illustrator", "配图者", illustratorLabels, article.illustrator)}
${field("run_dir", "流水线标识（保留斜杠）", "text", article.run_dir, 'maxlength="512"')}
${field("run_date", "存稿日期", "date", article.run_date)}${field("series_no", "系列编号", "number", article.series_no, 'min="1" step="1"')}
${field("char_count", "字数", "number", article.char_count, 'min="0" step="1"')}
${field("subheading_count", "小标题数", "number", article.subheading_count, 'min="0" step="1"')}
${field("image_count", "图数", "number", article.image_count, 'min="0" step="1"')}
${field("finished_at", "流水线结束", "datetime-local", localDateTime(article.timings?.finished_at))}
${field("draft_pgc_id", "头条草稿 pgc_id", "text", article.draft_ref?.pgc_id, 'maxlength="300"')}
${field("draft_appmsgid", "公众号草稿 appmsgid", "text", article.draft_ref?.appmsgid, 'maxlength="300"')}
${field("draft_editor_url", "草稿编辑链接（HTTP/HTTPS）", "url", article.draft_ref?.editor_url, 'placeholder="https://…"')}`;
}
function articleForm(article, id) {
  return `<form id="article-form" class="article-ledger article-ledger-form" data-id="${e(id)}" data-version="${e(article.version || "")}">
<p class="form-context">北京时间 · 草稿无需公开链接或发布时间；只有已发布记录才填写发布信息。</p><div class="form-grid">
${field("title", '文章标题 <span class="required">*</span>', "text", article.title, 'maxlength="300" required', true)}
<label class="form-field full">所属运营账号 <span class="required">*</span><select class="input" id="field-account_id"
name="account_id" required>${accountOptions(article.account_id, false, true)}</select></label>${articleMetadataFields(article)}
${field("url", "已发布文章链接（发布时必填）", "url", article.url, 'placeholder="https://…"', true)}
${field("published_at", "实际发布时间（发布时必填）", "datetime-local", localDateTime(article.published_at))}
${field("started_at", "流水线开始（可选）", "datetime-local", localDateTime(article.started_at))}
${nullableSelect("production_mode", "原生产方式", modeLabels, article.production_mode)}
${field("platform_article_id", "平台文章标识（可选）", "text", article.platform_article_id)}
<label class="form-field full" for="field-summary">文章概况<textarea class="input" name="summary" id="field-summary"
maxlength="10000">${e(article.summary)}</textarea></label><label class="form-field full" for="field-notes">备注
<textarea class="input" name="notes" id="field-notes" maxlength="20000">${e(article.notes)}</textarea></label>
</div>${formEnd(id ? "保存修改" : "保存文章")}</form>`;
}
async function articleModal(id = "") {
  const context = beginModalRequests(), ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion;
  let article = { account_id: state.account, production_mode: "unknown", status: "draft_saved" };
  if (id) article = await modalRequest(`/articles/${encodeURIComponent(id)}`, ticket, version, context);
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  const active2 = state.accounts.filter((account) => account.active || account.id === article.account_id);
  if (!active2.length) {
    toast("请先添加一个启用的运营账号。", true);
    return;
  }
  openModal(id ? "编辑文章台账" : "记录文章", articleForm(article, id));
  runtime.articleFormRecord = { record: article, sessionEpoch: runtime.sessionEpoch, ticket: runtime.modalRequestVersion };
}

// web/core/article-ledger-data.mjs
var ledgerStatuses = ["drafting", "illustrated", "draft_saved", "published", "failed"];
var ledgerWriters = ["dedao", "gemini_web", "human", "other"];
var ledgerLimits = { pageSize: 200, maxRequests: 20, maxRows: 2e3 };
function ledgerReadError() {
  return Object.assign(new Error("文章台账读取未完成，请重新加载。"), { code: "LEDGER_INCOMPLETE" });
}
function summarizeArticleLedger(rows) {
  if (!Array.isArray(rows)) throw ledgerReadError();
  const counts = Object.fromEntries(ledgerStatuses.map((status) => [status, 0]));
  const writers = [...ledgerWriters, "unknown"].map((writer) => ({ writer, unpublished: 0, published: 0, total: 0 }));
  for (const row of rows) {
    if (!row || !ledgerStatuses.includes(row.status)) throw ledgerReadError();
    counts[row.status]++;
    const writer = writers.find((item) => item.writer === (ledgerWriters.includes(row.writer) ? row.writer : "unknown"));
    writer[row.status === "published" ? "published" : "unpublished"]++;
    writer.total++;
  }
  return {
    verified: true,
    total: rows.length,
    unpublished: rows.length - counts.published,
    published: counts.published,
    draft_saved: counts.draft_saved,
    counts,
    writers: writers.filter((writer) => writer.total > 0),
    consistency: "paged_not_atomic"
  };
}
function validateLedgerPage(payload, status, accountId, page, expectedTotal, seen) {
  const rows = payload?.data, meta = payload?.meta, offset = (page - 1) * ledgerLimits.pageSize;
  if (!Array.isArray(rows) || !meta || !Number.isSafeInteger(meta.total) || meta.total < 0 || meta.total > ledgerLimits.maxRows || meta.page !== page || meta.page_size !== ledgerLimits.pageSize || meta.offset !== offset || typeof meta.has_more !== "boolean" || expectedTotal !== void 0 && expectedTotal !== meta.total || rows.length > ledgerLimits.pageSize || rows.length !== Math.min(ledgerLimits.pageSize, Math.max(0, meta.total - offset)) || meta.has_more !== offset + rows.length < meta.total) throw ledgerReadError();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id || row.status !== status || typeof row.account_id !== "string" || accountId && row.account_id !== accountId || seen.has(row.id)) throw ledgerReadError();
    seen.add(row.id);
  }
  return { rows, meta };
}
async function loadArticleLedgerSummary(context, { accountId = "", request = api } = {}) {
  const rows = [], seen = /* @__PURE__ */ new Set();
  let requests = 0;
  for (const status of ledgerStatuses) {
    let total;
    for (let page = 1; ; page++) {
      if (++requests > ledgerLimits.maxRequests) throw ledgerReadError();
      const query = new URLSearchParams({ status, page: String(page), page_size: String(ledgerLimits.pageSize) });
      if (accountId) query.set("account_id", accountId);
      const payload = await request(`/articles?${query}`, { envelope: true, context });
      const result = validateLedgerPage(payload, status, accountId, page, total, seen);
      if (rows.length + result.rows.length > ledgerLimits.maxRows) throw ledgerReadError();
      total = result.meta.total;
      rows.push(...result.rows);
      if (!result.meta.has_more) break;
    }
  }
  return { ...summarizeArticleLedger(rows), requests };
}

// web/pages/article-ledger-overview.mjs
var writerNames = { dedao: "得到大脑", gemini_web: "Gemini", human: "人工", other: "其他", unknown: "未记录" };
function renderArticleLedgerSummary(data) {
  if (data?.verified !== true) return '<section class="card article-ledger-overview" role="alert"><h2>文章台账</h2><p>数量未取得，请重新加载。</p></section>';
  if (data.total === 0) return '<section class="card article-ledger-overview article-ledger-empty"><h2>文章台账</h2><p>尚未记录文章。</p><p class="muted">可以先保存草稿，发布后再补充链接和数据。</p><button class="btn" data-action="new-article">记录草稿</button></section>';
  const stats = [["草稿 / 未发布", data.unpublished], ["已存草稿", data.draft_saved], ["已发布", data.published]];
  return `<section class="card article-ledger-overview"><div class="section-heading"><h2>文章台账</h2></div><dl class="article-ledger-stats">${stats.map(([label3, value]) => `<div><dt>${e(label3)}</dt><dd>${e(num(value))}</dd></div>`).join("")}</dl><h3>按写作者</h3><div class="table-scroll"><table class="data-table article-ledger-writers"><thead><tr><th>写作者</th><th>草稿 / 未发布</th><th>已发布</th></tr></thead><tbody>${data.writers.map((row) => `<tr><td>${e(writerNames[row.writer] || "未记录")}</td><td data-label="草稿 / 未发布">${e(num(row.unpublished))}</td><td data-label="已发布">${e(num(row.published))}</td></tr>`).join("")}</tbody></table></div><p class="cell-sub">按本站完整分页记录统计；翻页期间可能有更新，不是原子快照。未配置槽位排期，不计算应产出或缺失。</p></section>`;
}

// web/pages/dashboard.mjs
function dailyDates(data) {
  return (data.trend || []).filter((d) => (d.accounts || []).some((a) => Object.values(a.metrics || {}).some((v) => v != null)));
}
function periodControls() {
  return segmented(
    "overview-period",
    [["yesterday", "昨天"], ["7d", "近7天"], ["30d", "近30天"]],
    state.overviewPeriod,
    "周期变化时间",
    "period"
  );
}
function renderDashboard(data) {
  return renderDashboardSummary(data);
}
function renderDashboardSummary(data) {
  const daily = dailyDates(data), articles = (data.attention_articles || []).filter((a) => ["up", "down"].includes(a.attention?.kind)), visible2 = state.attentionExpanded ? articles : articles.slice(0, 6);
  return `${renderCumulative(data)}<section class="card cycle-panel"><div class="section-heading"><h2>周期变化</h2>${periodControls()}</div>${daily.length ? `${renderPeriodAccounts(data.accounts || [])}${visible2.length ? `<h3>表现异动</h3>${renderAttentionArticles(visible2)}${articles.length > 6 ? `<button class="btn text" data-action="toggle-attention" aria-expanded="${state.attentionExpanded}">${state.attentionExpanded ? "收起" : "展开其余"}（${e(num(articles.length))}篇）</button>` : ""}` : ""}` : '<div class="empty inline-empty">还没有每日新增数据，录入后这里会显示周期变化和趋势。<button class="btn" data-action="new-daily">录入每日数据</button></div>'}</section>
 ${daily.length < 2 ? "" : `<details class="card trend-disclosure" data-state="trendOpen" ${state.trendOpen ? "open" : ""}><summary>趋势与发布量</summary><div class="panel"><div class="chart-header"><h2>每日新增趋势 ${dashboardInfo("trend", "趋势数据覆盖")}</h2><label><span class="sr-only">趋势指标</span><select id="trend-metric" class="input">${Object.entries(metrics).map(([key, label3]) => `<option value="${e(
    key
  )}" ${state.trendMetric === key ? "selected" : ""}>${e(label3)}</option>`).join("")}</select></label></div>${renderTrend(
    data
  )}<h3>本站发布量 ${dashboardInfo("publication", "发布量口径")}</h3>${renderPublicationTrend(data)}${segmented("trend-tab", [
    ["metrics", "每日明细"],
    ["publication", "各账号每日发布量"]
  ], state.trendTab || "metrics", "趋势明细")}${renderDailyTable(data)}</div></details>`}`;
}
function renderPeriodAccounts(accounts) {
  const approvals = accounts.some((a) => a.period_metrics?.approvals != null), columns = [["reads", "阅读"], ["likes", "点赞"], [
    "comments",
    "评论"
  ], ...approvals ? [["approvals", "赞同"]] : []];
  return `<div class="table-scroll"><table class="data-table period-table"><thead><tr><th>账号</th>${columns.map(([, label3]) => `<th>${e(label3)}</th>`).join("")}</tr></thead><tbody>${accounts.map((a) => `<tr><td><button class="article-link" data-action="select-account" data-id="${e(a.id)}">${platformLogo(a.platform)} ${e(a.name)}</button></td>${columns.map(([key, label3]) => `<td data-label="${e(label3)}">${dashboardMetric({
    latest_metrics: a.period_metrics
  }, key)}${metricCoverageHTML(a, key)}${comparisonHTML(a.comparisons?.[key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function renderAttentionArticles(articles) {
  return `<div class="table-scroll"><table class="data-table attention-table"><thead><tr><th>文章</th><th>周期阅读 / 变化</th><th>周期互动 / 变化 ${dashboardInfo(
    "metrics",
    "互动指标口径",
    "attention"
  )}</th><th>关注原因</th></tr></thead><tbody>${articles.map((a) => {
    const platform = a.platform || state.accounts.find((x) => x.id === a.account_id)?.platform, like = "likes", m = a.period_metrics || {}, attention = a.attention || {};
    const label3 = { up: "表现较高", down: "表现较低", normal: "近期文章", insufficient: "待积累数据" }[attention.kind] || "待积累数据";
    return `<tr><td class="title-cell"><button class="article-link" data-action="article-detail" data-id="${e(a.id)}">${e(a.title)}</button><div class="cell-sub">${e(platform && a.account_name ? `${platforms[platform] || platform} · ${a.account_name}` : accountName(a.account_id))} · ${e(time(a.published_at, true))}</div></td><td><strong class="number">${e(num(m.reads))}</strong>${metricCoverageHTML(
      a,
      "reads"
    )}${comparisonHTML(
      a.comparisons?.reads
    )}</td><td><div class="attention-interaction"><span>点赞 ${e(num(m[like]))}${metricCoverageHTML(a, like)}</span>${comparisonHTML(
      a.comparisons?.[like]
    )}</div><div class="attention-interaction"><span>评论 ${e(num(m.comments))}${metricCoverageHTML(
      a,
      "comments"
    )}</span>${comparisonHTML(a.comparisons?.comments)}</div>${m.approvals != null ? `<div>赞同 ${e(num(m.approvals))}${comparisonHTML(a.comparisons?.approvals)}</div>` : ""}</td><td class="reason-cell"><span class="badge ${attention.kind === "up" ? "up" : attention.kind === "down" ? "warn" : ""}">${e(label3)}</span>${dashboardInfo("attention", "比较依据", a.id)}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}
function renderCumulative(data) {
  const c = data.cumulative || {}, series = data.series || {}, rows = data.top_articles || [], due = data.due_reviews || [], fresh = freshness(
    c
  );
  const interactions = c.totals?.likes == null || c.totals?.comments == null ? null : c.totals.likes + c.totals.comments;
  const stats = [["已记录文章", num(c.article_count)], ["累计阅读", num(c.totals?.reads)], ["篇均阅读", num(c.mean_reads)], ["互动（赞+评）", num(
    interactions
  )], ["数据覆盖", c.coverage == null ? "—" : num(c.coverage * 100) + "%"]];
  return `<div class="overview-status" role="status"><span><i class="fresh-dot ${e(fresh.kind)}"></i>${e(fresh.label)}</span><div>${c.no_snapshot_count ? `<button class="btn text" data-action="missing-list" data-status="no_snapshot">未采集 ${e(num(c.no_snapshot_count))} 篇 →</button>` : ""}${due.length ? `<button class="btn text" data-action="show-due">待复盘 ${e(num(due.length))} 条 →</button>` : ""}</div></div>
 <dl class="dashboard-stats">${stats.map(([label3, value], i) => `<div class="stat"><dt>${e(label3)}${i === 4 ? dashboardInfo(
    "coverage",
    "数据覆盖与统计口径"
  ) : ""}</dt><dd class="${value === "—" ? "missing-value" : ""}">${e(value)}</dd></div>`).join("")}</dl>
 <div class="dashboard-grid"><section class="card"><div class="section-heading"><h2>账号表现</h2></div>${renderPlatformTable(data.platform_comparison || [])}</section><aside class="card todo-panel"><div class="section-heading"><h2>待处理</h2></div><div class="form-field todo-list">${c.no_snapshot_count ? `<button class="btn text" data-action="missing-list" data-status="no_snapshot">${e(num(c.no_snapshot_count))} 篇文章未采集数据 →</button>` : ""}${due.length ? `<button class="btn text" data-action="show-due">${e(num(due.length))} 条到期复盘 →</button>` : ""}<span>${e(fresh.label)}</span>${due.length ? `<span>1天 ${e(num(due.filter((d) => d.due_kind === "d1").length))} · 3天 ${e(num(due.filter((d) => d.due_kind === "d3").length))} · 7天 ${e(num(due.filter((d) => d.due_kind === "d7").length))}</span>` : ""}</div><div class="form-field detail-section series-progress"><h3>保险200篇 ${dashboardInfo("series", "保险系列进度口径")}</h3><span>${series.highest_recorded == null ? "尚未记录系列文章" : `第 ${e(num(
    series.highest_recorded
  ))} / ${e(num(series.planned))} 篇`}</span><progress max="${e(series.planned || 200)}" value="${e(series.highest_recorded || 0)}" aria-label="保险系列编号进度"></progress><span>本站收录 ${e(num(series.recorded_count))} 篇</span></div></aside></div>
 <section class="card cumulative-top"><div class="section-heading"><h2 id="top-heading">阅读 Top 5</h2>${segmented("top-platform", [[
    "",
    "全部"
  ], ...Object.entries(platforms).filter(([key]) => key !== "other" || state.topPlatform === "other" || state.accounts.some((a) => a.platform === "other"))], state.topPlatform, "Top榜平台", "platform")}</div>${rows.length ? `${renderTopTable(rows.slice(0, 5))}${rows.length > 5 ? `<details class="top-rest"><summary class="table-footer">展开其余 ${e(num(rows.length - 5))} 篇</summary>${renderTopTable(
    rows.slice(5),
    5
  )}</details>` : ""}` : '<div class="empty inline-empty">暂无已取得阅读数据的文章。</div>'}<div class="table-footer"><a class="btn text" href="?page=articles&amp;sort=reads&amp;order=desc" data-action="all-top">查看全部 →</a></div></section>`;
}
function renderPlatformTable(rows) {
  return rows.length ? `<div class="table-scroll"><table class="data-table dashboard-table platform-table"><thead><tr><th>账号</th><th>篇数</th><th>累计阅读</th><th>篇均</th><th>中位数</th></tr></thead><tbody>${[...rows].sort((a, b) => (b.totals?.reads ?? -1) - (a.totals?.reads ?? -1)).map((p) => {
    const accounts = state.accounts.filter((a) => a.platform === p.platform), label3 = accounts.map((a) => a.name).join("，") || platforms[p.platform] || p.platform;
    return `<tr data-action="${accounts.length === 1 ? "select-account" : "select-platform"}" data-id="${e(accounts[0]?.id || "")}" data-platform="${e(p.platform)}"><td><span class="account-title">${platformLogo(p.platform)}<button class="article-link" data-action="${accounts.length === 1 ? "select-account" : "select-platform"}" data-id="${e(accounts[0]?.id || "")}" data-platform="${e(p.platform)}">${e(label3)}</button>${dashboardInfo(
      "platform",
      "账号表现、最佳文章与计划",
      p.platform
    )}</span></td><td data-label="篇数">${e(num(p.article_count))}</td><td data-label="累计阅读">${e(num(p.totals?.reads))}</td><td data-label="篇均">${e(num(p.mean_reads))}</td><td data-label="中位数">${e(num(
      p.median_reads
    ))}</td></tr>`;
  }).join("")}</tbody></table></div>` : '<div class="empty inline-empty">暂无账号。<button class="btn" data-action="new-account">添加账号</button></div>';
}
function renderTopTable(rows, offset = 0) {
  const approvals = rows.some((a) => a.platform === "zhihu" || a.latest_metrics?.approvals != null);
  return `<div class="table-scroll"><table class="data-table dashboard-table top-table"><thead><tr><th>文章</th><th>账号</th><th>阅读</th><th>点赞 ${dashboardInfo(
    "metrics",
    "点赞与赞同口径",
    "top" + offset
  )}</th><th>评论</th>${approvals ? "<th>赞同</th>" : ""}</tr></thead><tbody>${rows.map(
    (a, i) => `<tr><td class="title-cell"><span class="rank">${e(num(offset + i + 1))}</span><button class="article-link" data-action="article-detail" data-id="${e(a.id)}">${e(a.title)}</button></td><td>${platformLogo(a.platform)} ${e(a.account_name)}</td>${[
      "reads",
      "likes",
      "comments",
      ...approvals ? ["approvals"] : []
    ].map((key) => `<td data-label="${e(metrics[key])}">${dashboardMetric(
      a,
      key
    )}</td>`).join("")}</tr>`
  ).join("")}</tbody></table></div>`;
}
function dashboardInfoBody(kind, id) {
  const d = state.dashboard || {}, c = d.cumulative || {}, totals = d.totals || {};
  if (kind === "coverage") return `<p>${e(c.metric_note)}</p><p>篇均分母：有阅读数据 ${e(num(c.data_article_count))} 篇；覆盖率沿用接口口径。</p><p>截至 ${e(time(c.as_of))} · 采集 ${e(time(c.collected_at))}</p><p><button class="btn text" data-action="missing-list" data-status="missing_reads">缺阅读 ${e(num(c.missing_reads_count))} 篇 →</button><button class="btn text" data-action="missing-list" data-status="date_unverified">日期待核实 ${e(num(c.unverified_date_count))} 篇 →</button></p><p>点赞 ${e(num(c.totals?.likes))} · 评论 ${e(num(c.totals?.comments))} · 赞同 ${e(num(c.totals?.approvals))}；互动仅在赞、评均取得时相加。</p><p>自动化占比 ${totals.article_count ? e(num(totals.automatic_count / totals.article_count * 100)) + "%" : "—"} · 耗时中位数 ${e(duration(totals.median_duration_seconds))}</p>`;
  if (kind === "platform") {
    const p = (d.platform_comparison || []).find((p2) => p2.platform === id) || {}, accounts = state.accounts.filter((a) => a.platform === id);
    return `<p>${accounts.length > 1 ? "同平台多账号，表中为平台汇总；各账号可分别进入文章列表。" : "累计指标来自该平台汇总。"}</p>${accounts.map((a) => `<button class="btn text" data-action="select-account" data-id="${e(a.id)}">${e(a.name)} →</button>`).join(
      ""
    )}<p>覆盖 ${p.coverage == null ? "—" : e(num(p.coverage * 100)) + "%"} · 截至 ${e(time(p.as_of))}</p><p>计划：${id === "wechat" ? "每天1篇保险" : ["toutiao", "zhihu"].includes(id) ? "每天3篇文娱" : "未设置"}；计划不补成实际。</p>${p.best_article ? `<p>最佳文章：<button class="article-link" data-action="article-detail" data-id="${e(p.best_article.id)}">${e(p.best_article.title)}</button> · 阅读 ${e(num(p.best_article.latest_metrics?.reads))}</p>` : "<p>暂无有阅读数据的文章。</p>"}`;
  }
  if (kind === "attention") {
    const a = (d.attention_articles || []).find((a2) => a2.id === id);
    return `<p>${e(a?.attention?.reason)}</p><p>${e(a?.attention?.baseline)}</p>`;
  }
  if (kind === "series") return "<p>按完整标题编号识别，仅计已发布且日期已记录的文章。编号进度不代表本站收录篇数。</p>";
  if (kind === "publication") return `<p>${e(d.publication_note)}</p>`;
  if (kind === "trend") return `<p>只用真实每日新增，不以累计快照补零或插值。</p>${(d.accounts || []).map((a) => `<p>${e(
    accountLabel(a)
  )}：${e(num((d.trend || []).filter((day) => day.accounts.some((r) => r.account_id === a.id && r.metrics?.[state.trendMetric] != null)).length))}/${e(num((d.trend || []).length))}天有该指标；缺日处断开。</p>`).join("")}`;
  return `<p>${e(c.metric_note || "likes为点赞，approvals为赞同，分别记录；未采集、未取得和真实0分开。")}</p><p>周期仅使用真实每日新增，不补零、不插值。累计快照不补每日数据。</p>`;
}
function renderPublicationTrend(data) {
  const rows = data.publication_trend || [], max = Math.max(1, ...rows.map((r) => r.accounts.reduce((n, a) => n + a.count, 0)));
  return `<div class="publication-bars" aria-label="本站每日发布量">${rows.map((row) => `<div><span>${e(row.date.slice(5))}</span><div class="publication-stack">${row.accounts.map((a) => `<i data-chart-height="${e(a.count / max * 80)}" data-chart-color="${e(platformColor((data.accounts || []).find((v) => v.id === a.account_id)?.platform))}" title="${e(accountName(a.account_id))} ${e(num(a.count))}篇"></i>`).join(
    ""
  )}</div><strong>${e(num(row.accounts.reduce((n, a) => n + a.count, 0)))}</strong></div>`).join("")}</div>`;
}
function renderDailyTable(data) {
  const publication = state.trendTab === "publication", rows = publication ? data.publication_trend || [] : data.trend || [], accounts = data.accounts || [];
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>日期</th>${accounts.map((a) => `<th>${e(a.name)}</th>`).join(
    ""
  )}</tr></thead><tbody>${rows.map((d) => `<tr><td>${e(d.date)}</td>${accounts.map((a) => {
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
    0,
    0.5,
    1
  ].map((t) => `<line x1="45" x2="595" y1="${12 + t * plotH}" y2="${12 + t * plotH}" stroke="var(--line)"/><text x="38" y="${16 + t * plotH}" text-anchor="end">${compact(max * (1 - t))}</text>`).join("")}${accounts.map((a, i) => {
    let prev = null;
    return dates.map((d, j) => {
      const value = d.accounts.find((p) => p.account_id === a.id)?.metrics?.[key];
      if (value == null) {
        prev = null;
        return "";
      }
      const point = { x: x(j), y: y(value) }, line = prev ? `<line x1="${prev.x}" y1="${prev.y}" x2="${point.x}" y2="${point.y}" stroke="${e(
        colors[i % colors.length]
      )}" stroke-width="2"/>` : "";
      prev = point;
      return line + `<circle cx="${point.x}" cy="${point.y}" r="4" fill="${e(colors[i % colors.length])}"><title>${e(a.name)} ${e(d.date)} ${num(
        value
      )}</title></circle>`;
    }).join("");
  }).join("")}${dates.filter((d, i) => i === 0 || i === dates.length - 1 || i === Math.floor(dates.length / 2)).map((d) => `<text x="${x(dates.indexOf(d))}" y="190" text-anchor="middle">${e(d.date.slice(5))}</text>`).join("")}</svg>` : "";
  const selected = dates.find((d) => d.date === state.trendDate) || dates.at(-1);
  return `${dataDays < 2 ? `<div class="empty inline-empty" role="status">数据不足：${e(num(dataDays))}天有该项真实日数据。</div>` : ""}${drawing}<div class="chart-legend">${accounts.map((a, i) => `<span><i class="legend-dot" data-chart-color="${e(colors[i % colors.length])}"></i>${e(accountLabel(a))}</span>`).join("")}</div><label class="trend-date-label">点按查看每日读数<select id="trend-date" class="input">${dates.map((d) => `<option value="${e(d.date)}" ${selected?.date === d.date ? "selected" : ""}>${e(d.date)}</option>`).join("")}</select></label><div class="trend-readout" aria-live="polite">${selected ? `<strong>${e(selected.date)}</strong>${accounts.map((a) => {
    const row = selected.accounts.find((v) => v.account_id === a.id);
    return `<span>${e(a.name)}：${row?.metrics?.[key] == null ? "未取得" : num(row.metrics[key])} ${e(metrics[key])}${row?.coverage?.source === "articles" ? "（仅已录入文章）" : ""}</span>`;
  }).join("")}` : "暂无日期"}</div>`;
}

// web/core/article-index.mjs
var indexRequests = /* @__PURE__ */ new WeakMap();
async function articleIndex(query = "", context) {
  const identity = state.me?.id, generation = runtime.articleIndexGeneration;
  if (!identity) throw Object.assign(new Error("索引会话已失效"), { staleIndex: true });
  const scope = context || backgroundRequests();
  const params = new URLSearchParams(Object.entries(Object.fromEntries(new URLSearchParams(query))).sort(([a], [b]) => a.localeCompare(b)));
  params.set("fields", "index");
  const key = identity + ":" + params.toString();
  let pending = articleIndexes.get(key);
  const owner = pending && indexRequests.get(pending);
  if (owner && !owner.done && owner.scope !== scope) pending = null;
  if (!pending) {
    const entry = { scope, done: false };
    pending = api("/articles?" + params, { context: scope }).then((rows2) => {
      entry.done = true;
      return Object.freeze(rows2.map((row) => Object.freeze(row)));
    });
    indexRequests.set(pending, entry);
    articleIndexes.set(key, pending);
    if (articleIndexes.size > 10) articleIndexes.delete(articleIndexes.keys().next().value);
    pending.catch(() => {
      if (articleIndexes.get(key) === pending) articleIndexes.delete(key);
    });
  }
  const rows = await pending;
  if (generation !== runtime.articleIndexGeneration || identity !== state.me?.id) {
    if (!state.me || identity !== state.me.id) throw Object.assign(new Error("索引会话已失效"), { staleIndex: true });
    return articleIndex(query, context);
  }
  return rows;
}

// web/pages/reviews.mjs
async function renderReviews(version = runtime.renderVersion, context) {
  const generation = runtime.articleIndexGeneration, tab = state.reviewTab, pending = tab === "pending", query = selectedQuery(), matches = (id) => !state.filters.platform || state.accounts.find((a) => a.id === id)?.platform === state.filters.platform;
  const [articles, rows, dueRows] = await Promise.all([articleIndex(query, context), pending ? [] : api(`/${tab === "observations" ? "observations" : "daily-metrics"}?${query}`, { context }), api(`/due-reviews${query ? "?" + query : ""}`, { context })]);
  if (version !== runtime.renderVersion) return "";
  if (generation !== runtime.articleIndexGeneration) return renderReviews(version, context);
  state.reviewArticles = articles;
  const account = (r) => r.account_id || articles.find((a) => a.id === r.article_id)?.account_id, records = rows.filter((r) => matches(account(
    r
  ))), due = dueRows.filter((r) => matches(r.account_id));
  state.reviewRecords = records;
  const tabs = `${segmented(
    "review-tab",
    [["pending", `待办 ${num(due.length)}`], ["observations", "文章快照"], ["daily", "每日数据"]],
    tab,
    "数据类型",
    "tab",
    "page-tabs"
  )}<div class="review-summary">${platformFilter("review-platform", state.filters.platform, "数据平台")}${accountFilter()}</div>`;
  const items = pending ? due : records, columns = pending ? [["account", "账号"], ["due_kind", "观察节点"], ["due_at", "目标时间"]] : [["account", "账号"], ...Object.entries(metrics).filter(([key]) => records.some((r) => metricData(r)[key] != null)).map(([key, label3]) => [
    key,
    ["likes", "approvals"].includes(key) ? `${label3}（${key}）` : label3
  ]), [
    tab === "observations" ? "as_of" : "source",
    tab === "observations" ? "数据截至" : "来源"
  ]];
  const cell = (r, key) => key === "account" ? e(accountName(account(r))) : key === "due_kind" ? e(kindLabels[r.due_kind] || r.due_kind) : [
    "as_of",
    "due_at"
  ].includes(key) ? e(displayTime(r[key])) : key === "source" ? e(r.source || "未标注来源") : metricData(r)[key] == null ? '<span class="missing-value">未取得</span>' : e(num(metricData(r)[key]));
  return tabs + `<section class="card">${items.length ? `<div class="table-scroll"><table class="data-table dashboard-table review-table"><thead><tr><th>${pending ? "文章" : tab === "observations" ? "文章／观察节点" : "日期／统计范围"}</th>${columns.map(([, label3]) => `<th>${e(label3)}</th>`).join("")}<th>操作</th></tr></thead><tbody>${items.map((r) => {
    const id = pending ? r.id : r.article_id, a = articles.find((a2) => a2.id === id);
    return `<tr><td class="title-cell">${id ? `<button class="article-link" data-action="article-detail" data-id="${e(id)}">${e(r.title || r.article_title || a?.title || "文章记录")}</button>` : e(r.date)}${pending ? "" : `<div class="cell-sub">${e(tab === "observations" ? kindLabels[r.kind] || r.kind : r.article_id ? r.date : "账号总体")}</div>`}</td>${columns.map(([key, label3]) => `<td data-label="${e(
      label3
    )}">${cell(r, key)}</td>`).join("")}<td>${pending ? `<button class="btn small" data-action="review-article" data-id="${e(
      id
    )}" data-kind="${e(r.due_kind)}">补录快照</button>` : `<button class="btn small" data-action="record-detail" data-id="${e(r.id)}">详情</button>`}</td></tr>`;
  }).join("")}</tbody></table></div><div class="table-footer">共 ${e(num(items.length))} 条</div>` : empty(pending ? "暂无到期提醒" : "暂无记录", "", pending ? "" : '<button class="btn" data-action="new-review">录入数据</button>')}</section>`;
}
async function reviewModal(articleId = "", kind = "latest", indexRetry = false) {
  const context = beginModalRequests();
  const ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion, generation = runtime.articleIndexGeneration;
  const directArticle = Boolean(articleId);
  let articles;
  try {
    articles = await articleIndex("", context);
  } catch (err) {
    if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
    throw err;
  }
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  if (generation !== runtime.articleIndexGeneration) return reviewModal(articleId, kind, indexRetry);
  if (directArticle && !articles.some((a) => a.id === articleId)) {
    if (indexRetry) throw new Error("文章不存在或无权访问，请刷新后重试。");
    clearArticleIndexes();
    return reviewModal(articleId, kind, true);
  }
  if (!articleId && state.account) articleId = articles.find((a) => a.account_id === state.account)?.id || "";
  state.reviewArticles = articles;
  const daily = state.reviewTab === "daily" && !directArticle;
  if (!articles.length && !daily) {
    openModal("录入复盘数据", empty("请先记录文章", "", '<button class="btn primary" data-action="new-article">记录发布</button>'));
    return;
  }
  const accountId = state.account || articles.find((a) => a.id === articleId)?.account_id || state.accounts.find((a) => a.active)?.id || "";
  openModal(daily ? "填写每日新增数据" : "追加文章累计快照", `<form id="review-form" data-type="${daily ? "daily" : "observation"}"><p class="form-context">北京时间</p><div class="form-grid">${daily ? `<div class="form-field"><label for="review-account">所属账号 <span class="required">*</span></label><select class="input" name="account_id" id="review-account" required>${accountOptions(
    accountId,
    false,
    true
  )}</select></div><div class="form-field"><label for="review-article">统计范围</label><select class="input" name="article_id" id="review-article"><option value="">账号总体</option>${articles.filter((a) => a.account_id === accountId).map((a) => `<option value="${e(a.id)}">${e(
    a.title
  )}</option>`).join("")}</select></div>${field("date", '数据所属日期 <span class="required">*</span>', "date", bjtDate(), `max="${bjtDate()}" required`)}` : `<div class="form-field full"><label for="review-article">文章 <span class="required">*</span></label><select class="input" name="article_id" id="review-article" required>${articles.map((a) => `<option value="${e(a.id)}" ${a.id === articleId ? "selected" : ""}>${e(a.title)} · ${e(accountName(a.account_id))}</option>`).join("")}</select></div><div class="form-field"><label for="field-kind">观察节点</label><select class="input" id="field-kind" name="kind">${Object.entries(kindLabels).map(([key, label3]) => `<option value="${key}" ${key === kind ? "selected" : ""}>${label3}</option>`).join("")}</select></div>${field(
    "as_of",
    '数据截至时间 <span class="required">*</span>',
    "datetime-local",
    localDateTime(/* @__PURE__ */ new Date()),
    "required"
  )}${field(
    "collected_at",
    '实际采集时间 <span class="required">*</span>',
    "datetime-local",
    localDateTime(/* @__PURE__ */ new Date()),
    "required"
  )}`}${field(
    "source",
    '数据来源 <span class="required">*</span>',
    "text",
    "",
    'required maxlength="200"'
  )}<div class="form-field full"><span class="field-label">${daily ? "当天新增指标" : "累计指标"}</span><span class="hint">至少一项；缺失留空，真实为零才填 0。</span></div>${Object.entries(metrics).map(([key, label3]) => field(
    `metric_${key}`,
    label3,
    "number",
    "",
    'min="0" step="1" inputmode="numeric" placeholder="未取得"'
  )).join("")}${daily ? "" : `<div class="form-field full"><label for="field-note">复盘备注</label><textarea class="input" name="note" id="field-note" maxlength="10000"></textarea></div>`}</div>${formEnd(daily ? "保存每日数据" : "追加快照")}</form>`);
}

// web/pages/settings.mjs
function renderAccounts() {
  const accounts = rowsForAccount(state.accounts);
  return `<section class="card">${accounts.length ? `<div class="table-scroll"><table class="data-table accounts-table"><thead><tr><th>账号</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${accounts.map((a) => `<tr><td><span class="account-title">${platformLogo(
    a.platform
  )}${e(a.name)}</span><div class="cell-sub">${e(platforms[a.platform] || a.platform)}</div></td><td><span class="badge ${a.active ? "up" : ""}">${a.active ? "使用中" : "已停用"}</span></td><td>${e(time(a.created_at))}</td><td><button class="btn small" data-action="edit-account" data-id="${e(a.id)}">${icon("edit", 13)}编辑</button></td></tr>`).join("")}</tbody></table></div>` : empty("暂无账号")}</section>`;
}
function renderKeys(keys) {
  return `<section class="card">${keys.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>凭证名称</th><th>账号范围</th><th>权限</th><th>最近使用</th><th>状态</th><th></th></tr></thead><tbody>${keys.map((k) => {
    let ids = k.account_ids || k.account_ids_json || [], permissions = k.permissions || k.permissions_json || [];
    if (typeof ids === "string") {
      try {
        ids = JSON.parse(ids);
      } catch {
        ids = [];
      }
    }
    if (typeof permissions === "string") {
      try {
        permissions = JSON.parse(permissions);
      } catch {
        permissions = [];
      }
    }
    return `<tr><td>${e(k.name)}<div class="cell-sub">创建 ${e(time(k.created_at))}</div></td><td class="key-scope">${ids.map((id) => e(accountName(
      id
    ))).join("<br>") || "无账号权限"}</td><td>${permissions.map((p) => `<span class="badge ${p === "write" ? "up" : ""}">${p === "read" ? "读取" : p === "write" ? "写入" : e(p)}</span>`).join(" ")}</td><td>${k.last_used_at ? e(time(k.last_used_at)) : "尚未使用"}</td><td><span class="badge ${k.revoked_at ? "" : "up"}">${k.revoked_at ? "已撤销" : "有效"}</span></td><td>${k.revoked_at ? "" : `<button class="btn small danger" data-action="revoke-key" data-id="${e(k.id)}" data-name="${e(k.name)}">撤销</button>`}</td></tr>`;
  }).join("")}</tbody></table></div>` : empty("暂无凭证", "供自动化工具按账号范围读取或录入数据。")}</section>`;
}
function auditLabel(action) {
  const labels = [
    ["合并存稿", "PATCH /articles"],
    ["新增文章", "article.create", "POST /articles"],
    ["修改文章", "article.update", "PUT /articles/:id"],
    [
      "追加复盘快照",
      "observation.create",
      "POST /observations"
    ],
    ["填写每日数据", "daily_metrics.upsert", "POST /daily-metrics"],
    [
      "添加账号",
      "account.create",
      "POST /accounts"
    ],
    ["修改账号", "account.update", "PUT /accounts/:id"],
    [
      "创建 AI 凭证",
      "api_key.create",
      "api_key.created",
      "POST /api-keys"
    ],
    ["撤销 AI 凭证", "api_key.revoke", "api_key.revoked", "DELETE /api-keys/:id"],
    [
      "修改密码",
      "auth.password",
      "auth.password_changed",
      "PUT /auth/password"
    ],
    ["登录网站", "auth.login", "POST /auth/login"],
    ["退出登录", "auth.logout", "POST /auth/logout"],
    ["初始化网站", "auth.bootstrap"]
  ];
  const route = String(action || "").replace(/^(PUT|DELETE) \/(articles|accounts|api-keys)\/[^/]+$/, "$1 /$2/:id");
  return labels.find((row) => row.includes(route))?.[0] || route || "未知操作";
}
function renderSecurity() {
  return `<section class="card panel security-panel"><h2>登录与安全</h2><p class="muted security-context">当前登录：${e(state.me.username)}</p><form id="password-form"><div class="form-field"><label for="current-password">当前密码</label><input class="input" type="password" id="current-password" name="currentPassword" autocomplete="current-password" required></div><div class="form-field field-spaced"><label for="new-password">新密码</label><input class="input" type="password" id="new-password" name="newPassword" autocomplete="new-password" minlength="12" required><span class="hint">至少 12 位</span></div><div class="form-field field-spaced"><label for="confirm-password">再次输入新密码</label><input class="input" type="password" id="confirm-password" name="confirmPassword" autocomplete="new-password" minlength="12" required></div><p class="form-message" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit">更新密码</button></div></form><div class="detail-section"><h3>数据导出</h3><a class="btn" href="/api/v1/export" download>${icon("download", 14)}导出发布记录 CSV</a></div></section>`;
}
function renderAudit(audit, keys = []) {
  const actors = [...new Set(audit.map((r) => r.actor))], groups = [];
  const actor = (value) => state.me?.id && value === "user:" + state.me.id ? "我" : keys.find((k) => value === "key:" + k.id)?.name || `${String(
    value
  ).startsWith("user:") ? "用户" : String(value).startsWith("key:") ? "未识别凭据" : "未知来源"} ${num(actors.indexOf(value) + 1)}`;
  for (const row of audit) {
    const day2 = Number.isFinite(Date.parse(row.created_at)) ? bjtDate(row.created_at) : "日期未知", label3 = auditLabel(row.action), last = groups.at(-1);
    if (last && day2 !== "日期未知" && last.day === day2 && last.actor === row.actor && last.label === label3) last.rows.push(row);
    else groups.push({ day: day2, actor: row.actor, label: label3, rows: [row] });
  }
  let day = "";
  return `<section class="card panel"><h2>最近操作</h2><div class="audit-list">${groups.map((g) => {
    const heading = day === g.day ? "" : `<h3>${e(g.day === bjtDate() ? "今天" : g.day === bjtDate(Date.now() - 864e5) ? "昨天" : g.day)}</h3>`;
    day = g.day;
    return `${heading}<details class="audit-item"><summary><div><strong>${e(g.label)} ×${e(num(g.rows.length))}</strong><div class="audit-meta">${e(actor(g.actor))} · ${e(time(g.rows.at(-1).created_at, true))}${g.rows.length > 1 ? " — " + e(time(g.rows[0].created_at, true)) : ""}</div></div></summary><ol class="snapshot-timeline">${g.rows.map((r) => {
      const article = r.entity_id && typeof r.entity_label === "string" && r.entity_label ? r : null;
      return `<li>${e(auditLabel(r.action))} · <time datetime="${e(r.created_at)}" title="${e(time(r.created_at))}">${e(displayTime(r.created_at))}</time>${article ? `<br><button class="article-link" data-action="article-detail" data-id="${e(article.entity_id)}">${e(article.entity_label)}</button>` : ""}</li>`;
    }).join("")}</ol></details>`;
  }).join("") || empty("暂无操作记录")}</div></section>`;
}
function accountModal(id = "") {
  const a = state.accounts.find((a2) => a2.id === id) || { platform: "toutiao", name: "", active: true };
  openModal(id ? "管理运营账号" : "添加运营账号", `<form id="account-form" data-id="${e(id)}"><div class="form-grid"><div class="form-field"><label for="field-platform">所属平台</label><select class="input" id="field-platform" name="platform" ${id ? "disabled" : ""}>${Object.entries(
    platforms
  ).map(([key, label3]) => `<option value="${key}" ${a.platform === key ? "selected" : ""}>${label3}</option>`).join(
    ""
  )}</select></div>${field("name", '账号名称 <span class="required">*</span>', "text", a.name, 'required maxlength="100"')}${id ? `<div class="form-field full"><label class="check-option"><input type="checkbox" name="active" ${a.active ? "checked" : ""}>启用此账号</label><span class="hint">停用保留历史数据。</span></div>` : ""}</div>${formEnd(id ? "保存账号" : "添加账号")}</form>`);
}
function keyModal() {
  if (!state.accounts.some((a) => a.active)) {
    toast("请先添加一个启用的运营账号。", true);
    return;
  }
  openModal("创建 AI 接入凭证", `<form id="key-form"><div class="form-grid">${field(
    "name",
    '凭证名称 <span class="required">*</span>',
    "text",
    "",
    'required maxlength="80"',
    true
  )}<fieldset class="form-field permission-fields"><legend class="field-label">允许访问的账号 <span class="required">*</span></legend><div class="checkboxes">${state.accounts.filter((a) => a.active).map((a) => `<label class="check-option"><input type="checkbox" name="account_ids" value="${e(a.id)}" ${state.account === a.id ? "checked" : ""}>${e(accountLabel(a))}</label>`).join("")}</div></fieldset><fieldset class="form-field permission-fields"><legend class="field-label">允许的操作</legend><div class="checkboxes"><label class="check-option"><input type="checkbox" name="permissions" value="read" checked>读取文章与数据</label><label class="check-option"><input type="checkbox" name="permissions" value="write">新增与更新数据</label></div></fieldset></div>${formEnd("创建凭证")}</form>`);
}

// web/core/todo-templates-state.mjs
var todoTemplatesState = { owner: "" };
function templateState() {
  const owner = todoOwner();
  if (todoTemplatesState.owner !== owner) {
    Object.assign(todoTemplatesState, {
      owner,
      items: [],
      loaded: false,
      loading: false,
      sequence: 0,
      revision: 0,
      draft: "",
      create: null,
      adding: false,
      error: "",
      editing: null,
      editDraft: "",
      pending: /* @__PURE__ */ new Set()
    });
  }
  return todoTemplatesState;
}
function templateSessionActive(owner) {
  return Boolean(state.me) && owner === todoOwner() && owner === todoTemplatesState.owner;
}
function mergeTodoTemplate(item) {
  const store = templateState(), index = store.items.findIndex((row) => row.id === item.id);
  if (index < 0) store.items.push(item);
  else if (store.items[index].version <= item.version) store.items[index] = item;
}

// web/pages/todo-templates.mjs
function todoTemplateRows(store) {
  const day = todoDay(), adding = day.adding, today = todoDay(bjtDate());
  const added = (id) => today.items.some((item) => item.template_id === id && !item.deleted_at);
  return store.items.map((item) => `<li class="todo-template-row" data-template-id="${e(item.id)}">
<div class="todo-template-line"><button class="todo-template-use" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="添加：${e(item.text)}" ${adding || store.pending.has(item.id) ? "disabled" : ""}>${e(item.text)}</button>
<button class="btn text small" data-action="todo-template-edit" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>改名</button>
<button class="btn text small" data-action="todo-template-delete" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>删除</button></div>
<p class="todo-template-added" data-template-added ${added(item.id) ? "" : "hidden"}>今日已添加</p>
<p class="todo-template-progress"><span data-template-status>${item.habit_status === "habit" ? "习惯" : "待办"}</span> ·
<span data-template-count>近30天已完成 ${Number(item.completed_days || 0)} 天</span></p></li>`).join("");
}
function todoTemplateEditor(store) {
  if (!store.editing) return "";
  return `<form id="todo-template-edit-form" class="todo-template-form" data-id="${e(store.editing.id)}">
<label for="todo-template-edit-text" class="sr-only">修改常用待办</label>
<input id="todo-template-edit-text" class="input" name="text" maxlength="500" required value="${e(store.editDraft)}">
<button class="btn" type="submit">保存</button><button class="btn text" type="button" data-action="todo-template-cancel">取消</button></form>`;
}
function renderTodoTemplates() {
  const store = templateState();
  return `<section id="todo-templates" class="daily-todo-templates todo-view" ${state.todoPanel === "templates" ? "" : "hidden"}>
<div class="todo-view-head"><h2>常用待办</h2><button class="btn" data-action="todo-panel-close">‹ 返回今日待办</button></div>
<div class="todo-template-content">
<form id="todo-template-form" class="todo-template-form" ${store.editing ? "hidden" : ""}>
<label for="todo-template-text" class="sr-only">新建常用待办</label>
<input id="todo-template-text" class="input" name="text" maxlength="500" required placeholder="新建常用待办" value="${e(store.draft)}">
<button class="btn" type="submit">保存</button></form><div id="todo-template-editor">${todoTemplateEditor(store)}</div>
<p id="todo-template-feedback" class="form-message" role="alert">${e(store.error)}</p>
<p id="todo-template-status" class="daily-todo-status" role="status">${store.loading ? "正在读取…" : ""}</p>
<ul id="todo-template-items" class="todo-template-items">${todoTemplateRows(store)}</ul></div></section>`;
}
function syncTemplateForm(root, id, value, pending) {
  const input = $(id, root);
  if (!input) return;
  if (input.value !== value) input.value = value;
  input.readOnly = pending;
  const button2 = $("button[type=submit]", input.form);
  if (button2) {
    button2.disabled = pending;
    button2.textContent = "保存";
    button2.setAttribute("aria-busy", String(pending));
  }
}
function paintTodoTemplates() {
  const root = $("#todo-templates");
  if (!root || state.page !== "todos" || !state.me) return;
  const store = templateState(), editor = $("#todo-template-editor", root), form = $("#todo-template-edit-form", root);
  if (editor && (form?.dataset.id || null) !== (store.editing?.id || null)) editor.innerHTML = todoTemplateEditor(store);
  root.dataset.loaded = String(store.loaded);
  const create = $("#todo-template-form", root);
  if (create) create.hidden = Boolean(store.editing);
  syncTemplateForm(root, "#todo-template-text", store.draft, store.adding);
  syncTemplateForm(root, "#todo-template-edit-text", store.editDraft, store.pending.has(store.editing?.id));
  for (const [id, html] of Object.entries({
    "todo-template-items": todoTemplateRows(store),
    "todo-template-feedback": e(store.error),
    "todo-template-status": store.loading ? "正在读取…" : ""
  })) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
}
function templateReadActive(store, owner, sequence, version) {
  return templateSessionActive(owner) && store.sequence === sequence && version === runtime.renderVersion && state.page === "todos";
}
async function loadTodoTemplates() {
  if (state.page !== "todos" || !state.me) return;
  const store = templateState(), owner = store.owner, sequence = ++store.sequence, revision = store.revision, version = runtime.renderVersion;
  store.loading = true;
  paintTodoTemplates();
  try {
    const data = await api("/todo-templates");
    if (!templateReadActive(store, owner, sequence, version)) return;
    if (revision !== store.revision) return loadTodoTemplates();
    store.items = data.items;
    store.loaded = true;
  } catch (error) {
    if (templateReadActive(store, owner, sequence, version) && !isRequestAbort(error) && !error.staleSession) store.error = error.message;
  } finally {
    if (templateReadActive(store, owner, sequence, version)) {
      store.loading = false;
      paintTodoTemplates();
    }
  }
}
function inputTodoTemplate(target) {
  if (target.id === "todo-template-text") templateState().draft = target.value;
  if (target.id === "todo-template-edit-text") templateState().editDraft = target.value;
}
async function templateWriteError(error, store, owner, editing3 = null) {
  if (!templateSessionActive(owner) || isRequestAbort(error) || error.staleSession) return;
  store.error = error.message;
  if (error.status === 409) {
    store.error = "这项常用待办已更新，草稿已保留，请核对后再保存。";
    await loadTodoTemplates();
    if (!templateSessionActive(owner) || !editing3 || store.editing !== editing3) return;
    const latest = store.items.find((item) => item.id === editing3.id);
    if (latest) editing3.version = latest.version;
  }
}
async function submitTodoTemplateForm({ data }) {
  const store = templateState(), owner = store.owner, text = String(data.text || "").trim();
  if (store.adding || !state.me) return;
  store.draft = String(data.text || "");
  if (!text || text.length > 500) {
    store.error = "请填写 1–500 字的常用待办。";
    paintTodoTemplates();
    return;
  }
  if (!store.create || store.create.text !== text) store.create = { id: crypto.randomUUID(), text };
  store.adding = true;
  store.error = "";
  store.revision++;
  paintTodoTemplates();
  try {
    const item = await api("/todo-templates", { method: "POST", body: store.create });
    if (!templateSessionActive(owner)) return;
    mergeTodoTemplate(item);
    store.draft = "";
    store.create = null;
  } catch (error) {
    if (!templateSessionActive(owner)) return;
    await templateWriteError(error, store, owner);
    if (!templateSessionActive(owner)) return;
    if (error.status === 410) {
      store.create = null;
      store.error = "这个模板已被删除，输入已保留，再次保存可新建。";
    }
  } finally {
    if (templateSessionActive(owner)) {
      store.adding = false;
      store.revision++;
      paintTodoTemplates();
    }
  }
}
function editTodoTemplate(id) {
  const store = templateState(), item = store.items.find((row) => row.id === id);
  if (!item || store.pending.has(id)) return;
  store.editing = { id, version: item.version };
  store.editDraft = item.text;
  store.error = "";
  paintTodoTemplates();
  $("#todo-template-edit-text")?.focus();
}
function cancelTodoTemplateEdit() {
  const store = templateState();
  if (store.pending.has(store.editing?.id)) return;
  store.editing = null;
  store.editDraft = "";
  paintTodoTemplates();
}
async function writeTodoTemplate(id, text, remove = false) {
  const store = templateState(), owner = store.owner, item = store.items.find((row) => row.id === id);
  if (!item || store.pending.has(id)) return;
  const editing3 = store.editing?.id === id ? store.editing : null;
  const version = remove ? item.version : editing3?.version;
  store.pending.add(id);
  store.error = "";
  store.revision++;
  paintTodoTemplates();
  try {
    const saved = await api(`/todo-templates/${encodeURIComponent(id)}`, {
      method: remove ? "DELETE" : "PATCH",
      body: remove ? { version } : { text, version }
    });
    if (!templateSessionActive(owner)) return;
    if (remove) store.items = store.items.filter((row) => row.id !== id);
    else mergeTodoTemplate(saved);
    if (store.editing?.id === id) store.editing = null;
    if (remove && state.page === "todos") await loadTodos();
  } catch (error) {
    if (templateSessionActive(owner)) await templateWriteError(error, store, owner, editing3);
  } finally {
    if (templateSessionActive(owner)) {
      store.pending.delete(id);
      store.revision++;
      paintTodoTemplates();
    }
  }
}
async function submitTodoTemplateEdit({ form, data }) {
  const store = templateState(), text = String(data.text || "").trim();
  store.editDraft = String(data.text || "");
  if (!store.editing || store.editing.id !== form.dataset.id) return;
  if (!text || text.length > 500) {
    store.error = "请填写 1–500 字的常用待办。";
    paintTodoTemplates();
    return;
  }
  await writeTodoTemplate(store.editing.id, text);
}
async function useTodoTemplate(id) {
  const store = templateState(), item = store.items.find((row) => row.id === id);
  if (item && !store.pending.has(id)) await submitTodoTemplate(item);
}
function refreshOpenTodoTemplates() {
  const store = templateState();
  store.revision++;
  if (state.todoPanel === "templates") loadTodoTemplates();
}

// web/pages/todo-actions.mjs
function todoBusy(day, id) {
  return day.updates.has(id) || day.removals.has(id) || day.templateWrites.has(id);
}
function todoActionContext({ id, date, owner = todoOwner() }) {
  if (!state.me || state.page !== "todos" || !validTodoDate(date) || date !== todoDate() || !todoSessionActive(owner)) return null;
  const day = todoDay(date), item = day.items.find((row) => row.id === id);
  return item ? { day, item, owner } : null;
}
function canOpenTodoMenu({ id, date, anchor }) {
  const context = todoActionContext({ id, date });
  return Boolean(context && anchor?.isConnected && !context.item.deleted_at && !todoBusy(context.day, id));
}
function openTodoMenu({ target, id, date, anchor }) {
  date ||= target?.dataset.date;
  anchor ||= target?.closest(".daily-todo-row");
  if (!canOpenTodoMenu({ id, date, anchor })) return;
  const { item, owner } = todoActionContext({ id, date });
  const trigger = target || $('[data-action="todo-menu"]', anchor);
  if (!trigger) return;
  const attributes = `data-id="${e(id)}" data-date="${e(date)}" data-owner="${e(owner)}" role="menuitem"`;
  const commonAction = item.template_active ? "todo-remove-template" : "todo-make-template";
  const commonLabel = item.template_active ? "取消常用待办" : "添加为常用待办";
  popover(trigger, `<button data-action="${commonAction}" ${attributes}>${commonLabel}</button>
<button data-action="todo-delete" ${attributes}>删除</button>`, { menu: true, label: "事项操作" });
}
function renderTodoUndo(day) {
  return [...day.removals.entries()].map(([id, ticket]) => {
    const label3 = ticket.phase === "deleting" ? "删除中…" : ticket.phase === "restoring" ? "恢复中…" : "已删除";
    return `<div class="todo-undo-entry"><span>${label3}：${e(ticket.item.text)}</span>
<button class="btn text small" data-action="todo-restore" data-id="${e(id)}" data-date="${e(day.date)}"
data-owner="${e(todoOwner())}" ${ticket.phase === "ready" ? "" : "disabled"}>撤销</button></div>`;
  }).join("");
}
function expireTodoUndo(day, id, ticket, owner) {
  clearTimeout(ticket.timer);
  ticket.timer = setTimeout(() => {
    if (!todoSessionActive(owner) || day.removals.get(id) !== ticket || ticket.phase !== "ready") return;
    day.removals.delete(id);
    paintTodos();
  }, 8e3);
  ticket.timer?.unref?.();
}
async function todoActionFailure(day, error, owner) {
  if (!todoSessionActive(owner) || isRequestAbort(error) || error.staleSession) return;
  day.error = error.message;
  if ([404, 409].includes(error.status) && day.date === todoDate()) {
    day.error = "这项计划已更新，请核对最新内容后再操作。";
    await loadTodos();
  }
}
async function deleteTodo(options2) {
  const context = todoActionContext(options2);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day, item, owner } = context, ticket = { item, phase: "deleting", timer: null };
  day.removals.set(item.id, ticket);
  day.error = "";
  day.notice = "";
  day.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "DELETE", body: { date: day.date, version: item.version } });
    if (!todoSessionActive(owner)) return;
    mergeTodo(day, saved);
    ticket.item = saved;
    ticket.phase = "ready";
    expireTodoUndo(day, item.id, ticket, owner);
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner)) return;
    day.removals.delete(item.id);
    await todoActionFailure(day, error, owner);
    if (todoSessionActive(owner) && item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner)) {
      day.revision++;
      paintTodos();
    }
  }
}
async function restoreTodo({ id, date, owner = todoOwner() }) {
  if (!state.me || state.page !== "todos" || date !== todoDate() || !todoSessionActive(owner)) return;
  const day = todoDay(date), ticket = day.removals.get(id);
  if (!ticket || ticket.phase !== "ready") return;
  clearTimeout(ticket.timer);
  ticket.phase = "restoring";
  mergeTodo(day, ticket.item);
  day.error = "";
  day.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      body: { date, version: ticket.item.version }
    });
    if (!todoSessionActive(owner)) return;
    mergeTodo(day, saved);
    day.removals.delete(id);
    setTodoNotice(day, "已恢复");
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner)) return;
    if (error.status === 409) day.removals.delete(id);
    else {
      ticket.phase = "ready";
      expireTodoUndo(day, id, ticket, owner);
    }
    await todoActionFailure(day, error, owner);
    if (todoSessionActive(owner) && ticket.item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner)) {
      day.revision++;
      paintTodos();
    }
  }
}
function todoTemplateRequest(day, item) {
  let request = day.templateLinks.get(item.id);
  if (!request || request.version !== item.version || request.template_version !== (item.template_version || 0)) {
    request = {
      date: day.date,
      version: item.version,
      template_id: item.template_id || crypto.randomUUID(),
      template_version: item.template_version || 0
    };
    day.templateLinks.set(item.id, request);
  }
  return request;
}
async function changeTodoTemplate(options2, remove = false) {
  const context = todoActionContext(options2);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day, item, owner } = context;
  if (remove !== Boolean(item.template_active) || templateState().pending.has(item.template_id)) return;
  day.templateWrites.add(item.id);
  day.error = "";
  day.notice = "";
  day.revision++;
  paintTodos();
  try {
    const saved = await api(remove ? `/todo-templates/${encodeURIComponent(item.template_id)}` : `/todos/${encodeURIComponent(item.id)}/template`, {
      method: remove ? "DELETE" : "POST",
      body: remove ? { version: item.template_version } : todoTemplateRequest(day, item)
    });
    if (!todoSessionActive(owner)) return;
    if (remove) templateState().items = templateState().items.filter((row) => row.id !== item.template_id);
    else {
      mergeTodo(day, saved.todo);
      mergeTodoTemplate(saved.template);
    }
    day.templateLinks.delete(item.id);
    setTodoNotice(day, remove ? "已取消常用，事项已保留" : "已添加为常用");
    refreshOpenTodoTemplates();
    if (remove && day.date === todoDate()) await loadTodos();
  } catch (error) {
    if (todoSessionActive(owner)) {
      await todoActionFailure(day, error, owner);
      if (todoSessionActive(owner) && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner)) {
      day.templateWrites.delete(item.id);
      day.revision++;
      paintTodos();
    }
  }
}

// web/pages/todo-preferences.mjs
function todoPreferences() {
  todoDay();
  return todosState.preferences;
}
function receiveTodoPreferences(mode, version) {
  const prefs = todoPreferences();
  if (!["strike", "hide"].includes(mode) || !Number.isInteger(version) || prefs.pending || version < prefs.version) return;
  prefs.mode = mode;
  prefs.version = version;
  prefs.loaded = true;
}
function todoCompletedMode() {
  const prefs = todoPreferences();
  return prefs.pending || prefs.mode;
}
function renderTodoPreferences() {
  const prefs = todoPreferences(), mode = todoCompletedMode();
  return `<div class="todo-list-options"><label for="todo-completed-mode">完成后</label>
<select id="todo-completed-mode" class="input" ${prefs.pending || !prefs.loaded ? "disabled" : ""}>
<option value="strike" ${mode === "strike" ? "selected" : ""}>划线显示</option>
<option value="hide" ${mode === "hide" ? "selected" : ""}>隐藏已完成</option></select></div>`;
}
function paintTodoPreferences() {
  const input = $("#todo-completed-mode"), prefs = todoPreferences();
  if (!input) return;
  input.value = todoCompletedMode();
  input.disabled = Boolean(prefs.pending) || !prefs.loaded;
}
async function changeTodoCompletedMode(mode) {
  if (!state.me || state.page !== "todos" || !["strike", "hide"].includes(mode)) return;
  const prefs = todoPreferences(), owner = todoOwner();
  if (prefs.pending || !prefs.loaded || mode === prefs.mode) {
    paintTodoPreferences();
    return;
  }
  prefs.pending = mode;
  prefs.error = "";
  paintTodos();
  try {
    const saved = await api("/todo-preferences", { method: "PATCH", body: { completed_mode: mode, version: prefs.version } });
    if (!todoSessionActive(owner)) return;
    prefs.mode = saved.completed_mode;
    prefs.version = saved.version;
    setTodoNotice(todoDay(), "已保存");
  } catch (error) {
    if (!todoSessionActive(owner) || isRequestAbort(error) || error.staleSession) return;
    prefs.error = error.message;
    if (error.status === 409) {
      try {
        const latest = await api("/todo-preferences");
        if (!todoSessionActive(owner)) return;
        prefs.mode = latest.completed_mode;
        prefs.version = latest.version;
        prefs.error = "显示方式已更新，请核对后再选择。";
      } catch (readError) {
        if (todoSessionActive(owner) && !isRequestAbort(readError) && !readError.staleSession) prefs.error = readError.message;
      }
    }
  } finally {
    if (todoSessionActive(owner)) {
      prefs.pending = null;
      paintTodos();
    }
  }
}

// web/pages/todos.mjs
var todoClock = null;
var savingTimes = /* @__PURE__ */ new WeakMap(), savingTimers = /* @__PURE__ */ new WeakMap();
function todoCalendarMonth(date) {
  if (todosState.calendarDate !== date || !validTodoDate(`${todosState.calendarMonth}-01`)) {
    todosState.calendarDate = date;
    todosState.calendarMonth = date.slice(0, 7);
  }
  return todosState.calendarMonth;
}
function todoCalendarDay(date, selected) {
  const today = date === bjtDate(), active2 = date === selected;
  return `<button class="todo-calendar-day${active2 ? " is-selected" : ""}${today ? " is-today" : ""}" type="button"
data-action="todo-calendar-date" data-date="${e(date)}" aria-label="${e(date)}" aria-pressed="${active2}"
${today ? 'aria-current="date"' : ""}>${Number(date.slice(-2))}</button>`;
}
function todoCalendar(date) {
  const month = todoCalendarMonth(date), first = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`), last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const blanks = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: last.getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  return `<div class="todo-calendar-head"><button class="icon-button" type="button" data-action="todo-calendar-prev"
aria-label="上一月" ${month === "0001-01" ? "disabled" : ""}>‹</button>
<span id="todo-calendar-month" aria-live="polite">${Number(month.slice(0, 4))}年${Number(month.slice(5))}月</span>
<button class="icon-button" type="button" data-action="todo-calendar-next" aria-label="下一月"
${month === "9999-12" ? "disabled" : ""}>›</button></div>
<div class="todo-calendar-grid" role="group" aria-labelledby="todo-calendar-month">
${["一", "二", "三", "四", "五", "六", "日"].map((day) => `<span class="todo-calendar-weekday" aria-hidden="true">${day}</span>`).join("")}
${'<span aria-hidden="true"></span>'.repeat(blanks)}${days.map((day) => todoCalendarDay(day, date)).join("")}</div>`;
}
function moveTodoMonth(offset) {
  if (!todosVisible()) return;
  if (state.todoPanel === "templates" && $("#todo-templates")?.dataset.loaded !== "true") void loadTodoTemplates();
  const day = todoDay(), date = /* @__PURE__ */ new Date(`${todoCalendarMonth(day.date)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const month = date.toISOString().slice(0, 7);
  if (!validTodoDate(`${month}-01`)) return;
  todosState.calendarMonth = month;
  const calendar = $("#todo-calendar"), action = document.activeElement?.dataset?.action;
  if (!calendar) return;
  paintTodoCalendar(day.date);
  if (["todo-calendar-prev", "todo-calendar-next"].includes(action)) $(`[data-action="${action}"]`, calendar)?.focus();
}
function paintTodoCalendar(date) {
  const calendar = $("#todo-calendar"), month = todoCalendarMonth(date), today = bjtDate();
  if (!calendar || calendar.dataset.month === month && calendar.dataset.today === today) return;
  const focusedDate = document.activeElement?.dataset?.date;
  calendar.innerHTML = todoCalendar(date);
  calendar.dataset.month = month;
  calendar.dataset.today = today;
  if (focusedDate) $(`[data-date="${CSS.escape(focusedDate)}"]`, calendar)?.focus();
}
function todoDateControls(date) {
  return `<div class="daily-todo-dates"><button class="btn small" data-action="todo-prev" aria-label="前一天">‹</button>
<label for="todo-date" class="sr-only">查看日期</label><input class="input" id="todo-date" type="date" value="${e(date)}">
<button class="btn small" data-action="todo-next" aria-label="后一天">›</button>
<button class="btn small" data-action="todo-today">今天</button></div>`;
}
function todoRow(item, day) {
  const pending = todoBusy(day, item.id);
  const completed = day.updates.has(item.id) ? day.updates.get(item.id) : item.completed;
  const removal = day.removals.get(item.id), deleted = removal ? removal.phase !== "restoring" : Boolean(item.deleted_at);
  if (deleted || completed && todoCompletedMode() === "hide" && state.todoPanel !== "history") return "";
  return `<li class="daily-todo-row${completed ? " is-complete" : ""}" data-id="${e(item.id)}" data-date="${e(day.date)}">
<label><input type="checkbox" data-todo-id="${e(item.id)}" data-date="${e(day.date)}" ${completed ? "checked" : ""}
aria-disabled="${pending}"><span class="daily-todo-text">${e(item.text)}</span></label>

<button class="todo-row-menu icon-button" type="button" data-action="todo-menu" data-id="${e(item.id)}" data-date="${e(day.date)}"
aria-label="事项操作" aria-haspopup="menu" aria-expanded="false" ${pending ? "disabled" : ""}>⋯</button></li>`;
}
function todoForm(day) {
  const label3 = day.date === bjtDate() ? "今天想完成什么？" : "这一天的计划";
  return `<form ${state.todoPanel === "history" ? "hidden" : ""} id="todo-form" class="daily-todo-form" data-date="${e(day.date)}" aria-label="添加每日计划">
<label for="todo-text" class="sr-only">${label3}</label><input id="todo-text" class="input" name="text" maxlength="500" required
autocomplete="off" placeholder="${label3}" value="${e(day.draft)}" >
<button class="btn primary" type="submit" ${day.adding ? "disabled" : ""}>添加</button></form>`;
}
function todoCaption(day) {
  const today = day.date === bjtDate();
  return `<time datetime="${e(day.date)}" title="北京时间">${today ? "今天 · " : ""}${e(day.date)}</time>`;
}
function todoHeading(day) {
  return `<span id="todo-caption">${todoCaption(day)}</span><div class="todo-view-links">
<button class="btn text" data-action="todo-panel" data-panel="history" aria-controls="todo-history"
aria-expanded="${state.todoPanel === "history"}">历史</button>
<button class="btn text" data-action="todo-panel" data-panel="templates" aria-controls="todo-templates"
aria-expanded="${state.todoPanel === "templates"}">常用</button></div>`;
}
function renderTodoHistory(day) {
  return `<section id="todo-history" class="todo-view" aria-label="待办历史" ${state.todoPanel === "history" ? "" : "hidden"}>
<div class="todo-view-head"><h2>待办历史</h2><button class="btn" data-action="todo-panel-close">‹ 返回今日待办</button></div>
<div id="todo-calendar" class="daily-todo-calendar" data-month="${todoCalendarMonth(day.date)}" data-today="${bjtDate()}">
${todoCalendar(day.date)}</div>${todoDateControls(day.date)}</section>`;
}
function paintTodoPanels(root) {
  const panel = state.todoPanel || "";
  for (const [id, value] of [["todo-main", ""], ["todo-history", "history"], ["todo-templates", "templates"]]) {
    const node = $("#" + id, root);
    if (node) node.hidden = id === "todo-main" ? panel === "templates" : panel !== value;
  }
  root?.querySelectorAll("#todo-form,.todo-list-options").forEach((node) => {
    node.hidden = panel === "history";
  });
  root?.querySelectorAll('[data-action="todo-panel"]').forEach((button2) => {
    button2.setAttribute("aria-expanded", String(button2.dataset.panel === panel));
  });
}
async function setTodoPanel(panel) {
  if (!todosVisible()) return;
  state.todoPanel = ["history", "templates"].includes(panel) ? panel : "";
  if (!state.todoPanel) state.todoDate = "";
  updateRoute(true);
  paintTodos();
  if (state.todoPanel === "templates") await loadTodos();
  else if (!state.todoPanel) await loadTodos();
  const selector = state.todoPanel ? "#todo-" + state.todoPanel + ' [data-action="todo-panel-close"]' : "#todo-text";
  $(selector)?.focus();
}
function todoPending(day) {
  return Boolean(day.adding || day.updates.size || day.templateWrites.size || [...day.removals.values()].some((ticket) => ticket.phase !== "ready") || todoPreferences().pending);
}
function todoStatus(day) {
  if (todoPending(day) || day.error || todoPreferences().error) return "";
  return day.loading && !day.loaded ? "正在读取…" : day.notice;
}
function paintTodoSaving(root, day) {
  const busy = todoPending(day);
  root.setAttribute("aria-busy", String(busy));
  if (!busy) {
    clearTimeout(savingTimers.get(day));
    savingTimers.delete(day);
    savingTimes.delete(day);
    return;
  }
  if (!savingTimes.has(day)) {
    savingTimes.set(day, Date.now());
    savingTimers.set(day, setTimeout(() => {
      if (todosVisible() && todoDay() === day) paintTodos();
    }, 900));
  } else if (Date.now() - savingTimes.get(day) >= 900) $("#todo-status", root).textContent = "正在同步…";
}
function pendingTodo(day) {
  return day.adding && day.submitting ? `<li class="todo-pending-row" aria-label="待添加">
<span class="todo-pending-marker" aria-hidden="true"></span><span>${e(day.submitting.text)}</span></li>` : "";
}
function todoFeedback(day) {
  const error = [day.error, todoPreferences().error].filter(Boolean).join(" ");
  return error ? `${e(error)} ${day.failedCreate ? `<span>「${e(day.failedCreate.text)}」</span>
<button class="btn text small" data-action="todo-retry-add">重试添加</button>` : ""} <button class="btn text small" data-action="todo-reload">重新读取</button>` : "";
}
function todoHistoryEmpty(day) {
  return state.todoPanel === "history" && day.loaded && !day.items.some((item) => !item.deleted_at) ? "这一天还没有待办。" : "";
}
function renderTodos() {
  const day = todoDay();
  return `<section id="daily-todos" class="daily-todos daily-todos-primary" data-date="${e(day.date)}" aria-label="每日计划">
<div id="todo-heading" class="daily-todo-toolbar">${todoHeading(day)}</div>
${renderTodoHistory(day)}<div id="todo-main" ${state.todoPanel === "templates" ? "hidden" : ""}>${todoForm(day)}
<div id="todo-feedback" class="form-message" role="alert">${todoFeedback(day)}</div>
<p id="todo-status" class="daily-todo-status" role="status">${todoStatus(day)}</p>
<div id="todo-undo" class="todo-undo" role="status">${renderTodoUndo(day)}</div>${renderTodoPreferences()}
<p id="todo-history-empty" class="daily-todo-status">${todoHistoryEmpty(day)}</p>
<ul id="todo-items" class="daily-todo-items">${day.items.map((item) => todoRow(item, day)).join("")}${pendingTodo(day)}</ul></div>
${renderTodoTemplates()}</section>`;
}
function todosVisible() {
  return Boolean(state.me) && state.page === "todos";
}
function paintTodos() {
  const root = $("#daily-todos");
  if (!root || !todosVisible()) return;
  const day = todoDay(), checkbox = document.activeElement?.dataset?.todoId;
  const menu = document.activeElement?.dataset?.action === "todo-menu" ? document.activeElement.dataset.id : null;
  if (root.dataset.date !== day.date) {
    root.outerHTML = renderTodos();
    paintTodoTemplates();
    return;
  }
  const parts = {
    "todo-caption": todoCaption(day),
    "todo-status": todoStatus(day),
    "todo-undo": renderTodoUndo(day),
    "todo-items": day.items.map((item) => todoRow(item, day)).join("") + pendingTodo(day),
    "todo-feedback": todoFeedback(day),
    "todo-history-empty": todoHistoryEmpty(day)
  };
  for (const [id, html] of Object.entries(parts)) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
  paintTodoCalendar(day.date);
  const input = $("#todo-text", root), button2 = $("#todo-form button[type=submit]", root);
  if (input && input.value !== day.draft) input.value = day.draft;
  if (input) input.readOnly = false;
  if (button2) {
    button2.disabled = day.adding;
    button2.textContent = "添加";
    button2.setAttribute("aria-busy", String(day.adding));
  }
  paintTodoSaving(root, day);
  paintTodoPanels(root);
  paintTodoPreferences();
  const focus = checkbox ? `[data-todo-id="${CSS.escape(checkbox)}"]` : menu ? `[data-action="todo-menu"][data-id="${CSS.escape(menu)}"]` : "";
  if (focus) ($(focus, root) || $("[data-todo-id]", root) || $("#todo-completed-mode", root))?.focus();
  paintTodoTemplates();
}
function todoReadActive(owner, version, date, day, sequence) {
  return todoSessionActive(owner) && version === runtime.renderVersion && todoDate() === date && day.sequence === sequence && todosVisible();
}
async function loadTodos(context) {
  if (!todosVisible()) return;
  if (state.todoPanel === "templates" && $("#todo-templates")?.dataset.loaded !== "true") void loadTodoTemplates();
  const day = todoDay(), date = day.date, owner = todoOwner(), version = runtime.renderVersion;
  const sequence = ++day.sequence, revision = day.revision;
  day.loading = true;
  day.error = "";
  paintTodos();
  try {
    const data = await api(`/todos?date=${encodeURIComponent(date)}`, { context });
    if (!todoReadActive(owner, version, date, day, sequence)) return;
    if (day.revision !== revision) return loadTodos(context);
    receiveTodoPreferences(data.completed_mode, data.preferences_version);
    day.items = data.items;
    day.loaded = true;
    if (state.todoPanel === "templates") paintTodoTemplates();
  } catch (error) {
    if (todoReadActive(owner, version, date, day, sequence) && !isRequestAbort(error) && !error.staleSession) day.error = error.message;
  } finally {
    if (todoReadActive(owner, version, date, day, sequence)) {
      day.loading = false;
      paintTodos();
    }
  }
}
function inputTodo(target) {
  const date = target.form?.dataset.date;
  if (target.id === "todo-text" && validTodoDate(date)) todoDay(date).draft = target.value;
}
function showTodoFailure(day, error) {
  if (!isRequestAbort(error) && !error.staleSession) day.error = error.message;
}
function setTodoNotice(day, text) {
  const owner = todoOwner(), version = ++day.noticeVersion;
  day.notice = text;
  const timer = setTimeout(() => {
    if (!todoSessionActive(owner) || day.noticeVersion !== version) return;
    day.notice = "";
    if (day.date === todoDate()) paintTodos();
  }, 2500);
  timer?.unref?.();
}
async function saveTodo(day, request, templateId = "") {
  const owner = todoOwner(), submittedDraft = day.draft;
  day.adding = true;
  day.submitting = request;
  day.failedCreate = null;
  day.error = "";
  day.notice = "";
  day.revision++;
  paintTodos();
  try {
    const item = await api("/todos", { method: "POST", body: request });
    if (!todoSessionActive(owner)) return;
    mergeTodo(day, item);
    if (templateId) day.templateCreates.delete(templateId);
    else {
      if (day.draft === submittedDraft && submittedDraft.trim() === request.text) day.draft = "";
      day.create = null;
    }
    setTodoNotice(day, "已添加");
  } catch (error) {
    if (todoSessionActive(owner)) {
      day.failedCreate = request;
      showTodoFailure(day, error);
      if (error.status === 410) {
        if (templateId) day.templateCreates.delete(templateId);
        else day.create = null;
        day.error = "原事项已被删除，输入已保留，可再次添加。";
      }
    }
  } finally {
    if (todoSessionActive(owner)) {
      day.adding = false;
      day.submitting = null;
      day.revision++;
      paintTodos();
    }
  }
}
async function retryTodoCreate() {
  const day = todoDay();
  if (todosVisible() && day.failedCreate && !day.adding)
    await saveTodo(day, day.failedCreate, day.failedCreate.template_id || "");
}
async function submitTodo({ form, data }) {
  if (!todosVisible() || !validTodoDate(form.dataset.date)) return;
  const day = todoDay(form.dataset.date), text = String(data.text || "").trim();
  if (day.adding) return;
  day.draft = String(data.text || "");
  if (day.date !== todoDate()) {
    paintTodos();
    return;
  }
  if (!text || text.length > 500) {
    day.error = "请填写 1–500 字的计划。";
    paintTodos();
    return;
  }
  if (!day.create || day.create.text !== text) day.create = { id: crypto.randomUUID(), date: day.date, text };
  await saveTodo(day, day.create);
}
async function submitTodoTemplate(template) {
  if (!todosVisible()) return;
  const day = todoDay(bjtDate());
  if (day.adding) return;
  let request = day.templateCreates.get(template.id);
  if (!request || request.text !== template.text) {
    request = { id: crypto.randomUUID(), date: day.date, text: template.text, template_id: template.id };
    day.templateCreates.set(template.id, request);
  }
  await saveTodo(day, request, template.id);
}
async function toggleTodo(target) {
  if (!todosVisible()) return;
  const day = todoDay(target.dataset.date), owner = todoOwner();
  const item = day.items.find((row) => row.id === target.dataset.todoId);
  if (!item || item.deleted_at || day.date !== todoDate()) return;
  if (todoBusy(day, item.id)) {
    target.checked = day.updates.has(item.id) ? day.updates.get(item.id) : item.completed;
    return;
  }
  const completed = target.checked;
  day.updates.set(item.id, completed);
  day.error = "";
  day.notice = "";
  day.revision++;
  paintTodos();
  try {
    const updated = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "PATCH", body: { completed, version: item.version } });
    if (todoSessionActive(owner)) {
      mergeTodo(day, updated);
      setTodoNotice(day, "已保存");
      if (updated.template_id) refreshOpenTodoTemplates();
    }
  } catch (error) {
    if (!todoSessionActive(owner)) return;
    day.updates.set(item.id, item.completed);
    showTodoFailure(day, error);
    if (error.status === 409 && day.date === todoDate()) {
      day.error = "这项计划已更新，已重新读取，请核对后再操作。";
      await loadTodos();
      if (todoSessionActive(owner) && item.template_id) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner)) {
      day.updates.delete(item.id);
      day.revision++;
      paintTodos();
    }
  }
}
function selectTodoDate(date) {
  if (!validTodoDate(date) || state.page !== "todos") return;
  state.todoDate = date === bjtDate() ? "" : date;
  todosState.calendarDate = date;
  todosState.calendarMonth = date.slice(0, 7);
  updateRoute(true);
  paintTodos();
  loadTodos();
}
function moveTodoDate(offset) {
  const date = /* @__PURE__ */ new Date(`${todoDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  selectTodoDate(date.toISOString().slice(0, 10));
}
function refreshTodos() {
  if (!todosVisible()) return;
  todoDay().error = "";
  todoPreferences().error = "";
  loadTodos();
}
function checkTodoDay() {
  if (!state.me || !syncTodoDay() || !todosVisible()) return;
  paintTodos();
  refreshOpenTodoTemplates();
  loadTodos();
}
function scheduleTodoClock() {
  clearTimeout(todoClock);
  const midnight = Date.parse(`${bjtDate()}T00:00:00+08:00`) + 864e5;
  todoClock = setTimeout(() => {
    checkTodoDay();
    scheduleTodoClock();
  }, Math.max(20, Math.min(6e4, midnight - Date.now() + 20)));
  todoClock?.unref?.();
}
function registerTodosClock() {
  window.addEventListener("focus", checkTodoDay);
  document.addEventListener("visibilitychange", checkTodoDay);
  scheduleTodoClock();
}

// web/pages/daily-notes.mjs
function renderDailyNotes() {
  return '<section id="daily-notes" class="daily-notes" aria-label="碎碎念"><div class="notes-toolbar"><div class="notes-date-controls"><button class="btn" type="button" data-notes-action="previous" aria-label="前一天">‹</button><label class="notes-date-label"><span class="sr-only">选择碎碎念日期</span><input id="notes-date" class="input" type="date" max="' + dailyNotesToday() + '"></label><button class="btn" type="button" data-notes-action="next" aria-label="后一天">›</button><button class="btn text" type="button" data-notes-action="today">今天</button></div><span id="notes-status" class="notes-status" role="status" aria-live="polite">正在读取…</span></div><div id="notes-drafts" class="notes-drafts" hidden></div><p id="notes-message" class="notes-message" role="alert" hidden></p><div class="notes-sheet"><label for="notes-editor" class="sr-only">这一天的碎碎念</label><textarea id="notes-editor" class="notes-editor" placeholder="写下一点想说的话…" hidden></textarea><div id="notes-reader" class="notes-reader" tabindex="0"></div><p id="notes-empty" class="notes-empty" hidden>这一天还没有留下文字。</p></div><div class="notes-footer"><span id="notes-detail" class="notes-detail"></span><button class="btn" type="button" data-notes-action="login" hidden>所有者登录</button><div id="notes-write-actions" class="notes-write-actions" hidden><button class="btn" type="button" data-notes-action="save">立即保存</button><button class="btn" type="button" data-notes-action="restore" hidden>恢复这一天</button><button class="btn text" type="button" data-notes-action="delete">删除这一天</button></div></div><div id="notes-delete-confirm" class="notes-confirm" hidden><p>删除这一天的文字？</p><button class="btn" type="button" data-notes-action="cancel-delete">取消</button><button class="btn" type="button" data-notes-action="confirm-delete">确认删除</button></div><div id="notes-resolution" class="notes-resolution" hidden><button class="btn" type="button" data-notes-action="check">核对服务器版本</button><button class="btn" type="button" data-notes-action="retry" hidden>重试同一保存</button><div id="notes-conflict-actions" hidden><p>服务器上的文字：</p><pre id="notes-remote"></pre><button class="btn" type="button" data-notes-action="use-server">采用服务器内容</button><button class="btn" type="button" data-notes-action="use-draft">用此草稿保存到新版本</button></div></div><aside class="notes-history" aria-label="已有碎碎念的日期"><h2>最近的文字</h2><div id="notes-dates"></div><p id="notes-dates-error" role="status"></p><button class="btn text" type="button" data-notes-action="more" hidden>更早的日期</button></aside></section>';
}
var statuses = {
  loading: "正在读取…",
  dirty: "等待保存",
  saving: "正在保存…",
  conflict: "草稿有冲突",
  unknown: "保存结果待核对",
  error: "暂未保存",
  oversize: "文字过长"
};
function paintDailyNotes(root, item, { drafts = [], dates = [], hasMore = false, datesLoading = false, datesError = "" } = {}) {
  if (!root) return;
  root.dataset.date = item.date;
  const find = (selector) => root.querySelector(selector);
  const date = find("#notes-date"), editor = find("#notes-editor"), reader = find("#notes-reader");
  if (date.value !== item.date) date.value = item.date;
  editor.dataset.date = item.date;
  editor.hidden = !item.loaded || !item.canEdit;
  editor.disabled = ["delete", "restore"].includes(item.pending?.kind);
  if (editor.dataset.composing !== "true" && editor.value !== item.draft) editor.value = item.draft;
  reader.hidden = !item.loaded || item.canEdit || !item.serverText;
  reader.textContent = item.serverText;
  find("#notes-empty").hidden = !item.loaded || item.canEdit || Boolean(item.serverText);
  const actual = statuses[item.phase] || (item.canEdit ? "已保存" : "公开只读");
  find("#notes-status").textContent = !item.loaded && item.loading ? "正在读取…" : item.canEdit && ["dirty", "saving", "saved"].includes(item.phase) ? "自动保存" : actual;
  find("#notes-status").setAttribute("aria-label", actual);
  find("#notes-status").dataset.phase = item.phase;
  find("#notes-message").hidden = !item.error;
  find("#notes-message").textContent = item.error;
  find("#notes-detail").textContent = item.canEdit ? dailyNotesBytes(item.draft) + " / 65536 字节 · 自动保存" : "所有访客都能阅读";
  find("#notes-write-actions").hidden = !item.loaded || !item.canEdit;
  find('[data-notes-action="login"]').hidden = !item.loaded || item.canEdit;
  const blocked = Boolean(item.pending) || ["conflict", "unknown"].includes(item.phase);
  find('[data-notes-action="save"]').disabled = blocked || !item.dirty;
  find('[data-notes-action="restore"]').hidden = !item.deleted;
  find('[data-notes-action="restore"]').disabled = blocked || item.dirty;
  find('[data-notes-action="delete"]').disabled = blocked || item.deleted || item.version === 0;
  find('[data-notes-action="next"]').disabled = item.date >= dailyNotesToday();
  const draftBox = find("#notes-drafts");
  const retained = drafts.filter((value) => value.date !== item.date || ["conflict", "unknown", "oversize", "error"].includes(value.phase));
  draftBox.hidden = !retained.length;
  draftBox.innerHTML = "<span>本页签保留的未保存草稿：</span>" + retained.map((value) => '<button class="btn text" type="button" data-notes-date="' + e(value.date) + '">' + e(value.date) + "</button>").join("");
  find("#notes-resolution").hidden = !["conflict", "unknown"].includes(item.phase) && !(item.phase === "error" && !item.loaded);
  find('[data-notes-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find('[data-notes-action="retry"]').hidden = item.phase !== "unknown" || !item.pending?.retryReady || !item.canEdit;
  find("#notes-conflict-actions").hidden = item.phase !== "conflict" || !item.remote;
  find("#notes-remote").textContent = item.remote?.deleted ? "（这一天已删除）" : item.remote?.text || "（空白）";
  find('[data-notes-action="use-draft"]').disabled = item.remote?.can_edit !== true;
  find("#notes-dates").innerHTML = dates.map((value) => '<button class="btn text notes-day' + (value === item.date ? " notes-day-current" : "") + '" type="button" data-notes-date="' + e(value) + '">' + e(value) + "</button>").join("");
  const more = find('[data-notes-action="more"]');
  more.hidden = !hasMore;
  more.disabled = datesLoading;
  more.textContent = datesLoading ? "正在读取…" : "更早的日期";
  find("#notes-dates-error").textContent = datesError || (!datesLoading && !dates.length ? "还没有已保存的文字。可用上方日期选择任意过去的一天。" : "");
}

// web/daily-notes-controller.mjs
var notesStore, notesIdentity = "", notesEventsRegistered = false, notesConfirmDate = "";
var notesDateIndex = { dates: [], hasMore: false, cursor: null, loading: false, error: "", sequence: 0 };
var notesIdentityNow = () => String(runtime.sessionEpoch) + ":" + String(state.me?.id || "") + ":" + String(state.me?.csrfToken || "");
var notesVisible = () => state.page === "notes" && notesIdentity === notesIdentityNow();
function ensureDailyNotesStore() {
  const next = notesIdentityNow();
  if (!notesStore || notesIdentity !== next) {
    notesStore?.dispose();
    notesIdentity = next;
    notesConfirmDate = "";
    notesDateIndex = { dates: [], hasMore: false, cursor: null, loading: false, error: "", sequence: 0 };
    const expected = next;
    const active2 = () => {
      if (notesIdentityNow() !== expected) {
        store.dispose();
        throw new DOMException("请求已取消", "AbortError");
      }
    };
    const request = async (path, options2) => {
      active2();
      const value = await api(path, options2);
      active2();
      return value;
    };
    const store = createDailyNotesStore({
      load: (date) => request("/daily-notes?date=" + encodeURIComponent(date)),
      put: (date, body) => request("/daily-notes/" + encodeURIComponent(date), { method: "PUT", body }),
      restore: (date, body) => request("/daily-notes/" + encodeURIComponent(date) + "/restore", { method: "POST", body }),
      remove: (date, body) => request("/daily-notes/" + encodeURIComponent(date), { method: "DELETE", body }),
      onChange: () => {
        if (expected === notesIdentityNow()) paintDailyNotesPage();
      },
      onSaved: () => {
        if (expected === notesIdentityNow()) void loadNoteDates();
      }
    });
    notesStore = store;
  }
  return notesStore;
}
function paintDailyNotesPage() {
  if (!notesVisible()) return;
  const root = document.querySelector("#daily-notes");
  if (!root) return;
  const item = notesStore.page(dailyNotesRouteDate());
  const drafts = [...notesStore.pages.values()].filter((value) => value.dirty || value.pending || ["unknown", "conflict", "oversize"].includes(value.phase));
  paintDailyNotes(root, item, {
    drafts,
    dates: notesDateIndex.dates,
    hasMore: notesDateIndex.hasMore,
    datesLoading: notesDateIndex.loading,
    datesError: notesDateIndex.error
  });
  root.querySelector("#notes-delete-confirm").hidden = notesConfirmDate !== item.date;
}
async function loadNoteDates(more = false) {
  ensureDailyNotesStore();
  if (more && (!notesDateIndex.hasMore || notesDateIndex.loading)) return;
  const expected = notesIdentity, current = notesDateIndex, sequence = ++current.sequence;
  const before = more ? current.cursor : null;
  current.loading = true;
  current.error = "";
  paintDailyNotesPage();
  try {
    const result = await api("/daily-notes/dates?page_size=30" + (before ? "&before=" + encodeURIComponent(before) : ""));
    if (expected !== notesIdentityNow() || current !== notesDateIndex || sequence !== current.sequence) return;
    if (!Array.isArray(result?.dates) || result.dates.some((value) => !validDailyNotesDate(value)) || typeof result.has_more !== "boolean" || result.has_more && (!validDailyNotesDate(result.next_before) || before && result.next_before >= before))
      throw new Error("日期列表不完整，请稍后重新读取。");
    current.dates = [.../* @__PURE__ */ new Set([...more ? current.dates : [], ...result.dates])].sort().reverse();
    current.hasMore = result.has_more;
    current.cursor = result.next_before;
  } catch (error) {
    if (expected === notesIdentityNow() && sequence === current.sequence) current.error = error.message;
  } finally {
    if (expected === notesIdentityNow() && current === notesDateIndex && sequence === current.sequence) {
      current.loading = false;
      paintDailyNotesPage();
    }
  }
}
async function selectDailyNotesDate(value) {
  if (!validDailyNotesDate(value) || value > dailyNotesToday()) return;
  ensureDailyNotesStore();
  notesConfirmDate = "";
  setDailyNotesRouteDate(value);
  updateRoute(true);
  paintDailyNotesPage();
  await notesStore.read(value);
}
function shiftedNotesDate(date, delta) {
  return new Date(Date.parse(date + "T12:00:00Z") + delta * 864e5).toISOString().slice(0, 10);
}
function registerDailyNotesEvents() {
  if (notesEventsRegistered) return;
  notesEventsRegistered = true;
  document.addEventListener("input", (event) => {
    if (!notesVisible() || event.target.id !== "notes-editor") return;
    ensureDailyNotesStore().edit(event.target.dataset.date, event.target.value, { composing: event.isComposing || event.target.dataset.composing === "true" });
  });
  document.addEventListener("compositionstart", (event) => {
    if (notesVisible() && event.target.id === "notes-editor") event.target.dataset.composing = "true";
  });
  document.addEventListener("compositionend", (event) => {
    if (event.target.id === "notes-editor") event.target.dataset.composing = "false";
    if (notesVisible() && event.target.id === "notes-editor")
      ensureDailyNotesStore().edit(event.target.dataset.date, event.target.value);
  });
  document.addEventListener("change", (event) => {
    if (notesVisible() && event.target.id === "notes-date") void selectDailyNotesDate(event.target.value);
  });
  document.addEventListener("click", async (event) => {
    if (!notesVisible()) return;
    const root = document.querySelector("#daily-notes"), target = event.target.closest("[data-notes-action],[data-notes-date]");
    if (!target || !root?.contains(target)) return;
    event.preventDefault();
    if (target.dataset.notesDate) {
      await selectDailyNotesDate(target.dataset.notesDate);
      return;
    }
    const store = ensureDailyNotesStore(), date = dailyNotesRouteDate(), action = target.dataset.notesAction;
    if (action === "previous" || action === "next") await selectDailyNotesDate(shiftedNotesDate(date, action === "previous" ? -1 : 1));
    else if (action === "login") renderLogin();
    else if (action === "today") await selectDailyNotesDate(dailyNotesToday());
    else if (action === "save") await store.save(date);
    else if (action === "restore") await store.restorePage(date);
    else if (action === "delete") {
      notesConfirmDate = date;
      paintDailyNotesPage();
    } else if (action === "cancel-delete") {
      notesConfirmDate = "";
      paintDailyNotesPage();
    } else if (action === "confirm-delete") {
      notesConfirmDate = "";
      await store.deletePage(date);
      paintDailyNotesPage();
    } else if (action === "check") {
      if (store.page(date).phase === "unknown") await store.reconcile(date);
      else await store.read(date);
    } else if (action === "use-server") store.useServer(date);
    else if (action === "retry") await store.retryPending(date);
    else if (action === "use-draft") await store.useDraft(date);
    else if (action === "more") await loadNoteDates(true);
  });
  window.addEventListener("beforeunload", (event) => {
    if (notesIdentity !== notesIdentityNow() || !notesStore) return;
    if ([...notesStore.pages.values()].some((item) => item.dirty || item.pending || item.phase === "unknown")) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
async function loadDailyNotes() {
  registerDailyNotesEvents();
  const store = ensureDailyNotesStore();
  await Promise.all([store.read(dailyNotesRouteDate()), loadNoteDates()]);
  paintDailyNotesPage();
}

// web/pages/memos.mjs
var button = (action, label3, extra = "") => '<button type="button" class="btn" data-memo-action="' + action + '" ' + extra + ">" + label3 + "</button>";
function renderMemos() {
  return '<section id="memos" data-pane="groups" aria-label="长期备忘录"><div class="memo-toolbar"><div class="memo-mobile-back">' + button("back-notes", "‹ 返回笔记") + '</div><span id="memo-status" role="status" aria-live="polite">正在读取…</span><div class="memo-toolbar-actions">' + button("exit-trash", "返回备忘录", "hidden") + button("login", "所有者登录", "hidden") + '</div></div><p id="memo-error" class="memo-message" role="alert" hidden></p><div id="memo-operation" class="memo-message" hidden><p id="memo-operation-text" role="status"></p>' + button("operation-check", "核对操作结果") + button("operation-retry", "重试同一操作", "hidden") + '</div><div id="memo-drafts" class="memo-drafts" hidden></div><section id="memo-recovery" class="memo-recovery" aria-label="找回本机草稿" hidden><div class="memo-panel-head"><h2>找回本机草稿</h2>' + button("close-recovery", "关闭") + '</div><p id="memo-recovery-status" role="status"></p><div id="memo-recovery-list"></div><div id="memo-recovery-detail" hidden><p id="memo-recovery-selected"></p><label for="memo-recovery-copy">草稿文字（可选中复制）</label><textarea id="memo-recovery-copy" readonly></textarea>' + button("restore-draft", "恢复此草稿并核对") + '</div></section><section id="memo-dialog" class="memo-dialog" aria-labelledby="memo-dialog-heading" hidden><h3 id="memo-dialog-heading"></h3><p id="memo-dialog-description"></p><label id="memo-dialog-label" for="memo-dialog-title">名称</label><input id="memo-dialog-title" class="input" maxlength="120" autocomplete="off"><div class="memo-dialog-actions">' + button("cancel", "取消") + button("confirm", "确认") + '</div></section><div class="memo-layout"><aside class="memo-library" aria-label="备忘录目录"><div class="memo-panel-head"><h2 id="memo-groups-heading">目录</h2>' + button("new-note", "＋", 'hidden aria-label="新建笔记"') + '</div><div id="memo-group-list" class="memo-list"></div></aside><article class="memo-editor" aria-label="笔记内容"><p id="memo-empty" class="memo-empty">选择一篇笔记，长期记录常用信息。</p><div id="memo-document" hidden><div class="memo-document-heading"><div class="memo-heading-title"><label for="memo-title" class="sr-only">笔记标题</label><input id="memo-title" class="memo-title" maxlength="120" placeholder="笔记标题" autocomplete="off"><h2 id="memo-read-title" class="memo-read-title" hidden></h2></div>' + button("fullscreen", '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" stroke-width="1.6"/></svg>', 'aria-label="放大正文" title="放大正文" aria-expanded="false"') + '</div><label for="memo-body" class="sr-only">笔记正文</label><textarea id="memo-body" class="memo-body" placeholder="写下需要长期记住的信息…"></textarea><div id="memo-read-body" class="memo-read-body" tabindex="0" hidden></div><div class="memo-document-footer"><span id="memo-detail"></span><div id="memo-note-actions" hidden><details class="memo-document-menu"><summary aria-label="笔记操作">⋯</summary><div class="memo-context-actions">' + button("save", "立即保存") + button("delete-note", "删除笔记") + button("restore-note", "恢复笔记", "hidden") + '</div></details></div></div><p id="memo-note-error" class="memo-message" role="alert" hidden></p><div id="memo-resolution" class="memo-resolution" hidden>' + button("check", "核对服务器结果") + button("retry", "重试同一保存", "hidden") + '<div id="memo-conflict" hidden><h3>服务器上的内容</h3><pre id="memo-remote"></pre>' + button("use-server", "采用服务器内容") + button("use-draft", "用此草稿保存到新版本") + '</div></div></div></article></div><dialog id="memo-fullscreen" aria-label="备忘录正文全屏"></dialog></section>';
}
var phases = {
  dirty: "等待自动保存",
  saving: "正在保存…",
  unknown: "保存结果待核对",
  conflict: "版本冲突 · 草稿已保留",
  offline: "离线 · 草稿保留在本机",
  error: "暂未保存 · 草稿已保留",
  oversize: "正文超过 64 KiB",
  loading: "正在读取…"
};
var active = (rows, trash) => rows.filter((row) => Boolean(row.deleted_at) === trash);
function listButton(kind, row, current, subtitle = "") {
  return '<button type="button" class="memo-list-item' + (row.id === current ? " is-selected" : "") + '" data-memo-' + kind + '="' + e(row.id) + '" aria-pressed="' + (row.id === current) + '"><span>' + e(row.title) + "</span>" + (subtitle ? "<small>" + e(subtitle) + "</small>" : "") + "</button>";
}
function flatNoteRow(note, store) {
  const s = store.state, group = s.groups.find((row) => row.id === note.group_id);
  const deleted = Boolean(note.deleted_at || group?.deleted_at), extra = ' data-memo-target="' + e(note.id) + '"';
  const control = !s.canEdit ? "" : s.trash ? button("restore-note", "恢复", extra) : button("delete-note", "×", extra + ' aria-label="删除' + e(note.title) + '" title="移至回收站"');
  return '<div class="memo-flat-row">' + listButton("note", note, s.noteId) + control + "</div>";
}
function paintLists(root, store) {
  const s = store.state, find = (q) => root.querySelector(q);
  find("#memo-groups-heading").textContent = s.trash ? "回收站" : "笔记";
  const notes = s.notes.filter((note) => {
    const group = s.groups.find((row) => row.id === note.group_id);
    return Boolean(note.deleted_at || group?.deleted_at) === s.trash;
  });
  const html = notes.map((note) => flatNoteRow(note, store)).join("") || '<p class="memo-empty">' + (s.trash ? "回收站是空的。" : "点 ＋ 开始记录。") + "</p>";
  const list = find("#memo-group-list");
  if (list.innerHTML !== html) list.innerHTML = html;
  find('[data-memo-action="new-note"]').hidden = !s.canEdit || s.trash;
  root.querySelectorAll('.memo-flat-row button,[data-memo-action="new-note"]').forEach((button2) => {
    button2.disabled = Boolean(s.operation?.pending);
  });
}
function paintDrafts(root, store) {
  const drafts = [...store.drafts.values()].filter((item) => ["unknown", "conflict", "offline", "error"].includes(item.phase) || item.id !== store.state.noteId && (item.dirty || item.pending));
  const box = root.querySelector("#memo-drafts");
  box.hidden = !store.state.canEdit || !drafts.length;
  box.innerHTML = "<span>本机保留的草稿：</span>" + drafts.map((item) => '<button type="button" class="btn text" data-memo-draft="' + e(item.id) + '">' + e(item.title || "未命名笔记") + "</button>").join("");
}
function paintDocument(root, store) {
  const s = store.state, item = store.drafts.get(s.noteId), find = (q) => root.querySelector(q);
  find("#memo-empty").hidden = Boolean(item);
  find("#memo-document").hidden = !item;
  if (!item) return;
  const group = s.groups.find((row) => row.id === item.group_id), deleted = Boolean(item.deleted_at || group?.deleted_at);
  const editable = s.canEdit && !deleted;
  const operation = s.operation?.pending;
  const structureBusy = operation && (operation.kind === "notes" && operation.id === item.id || operation.kind === "groups" && operation.id === item.group_id && operation.method === "DELETE");
  for (const field2 of ["title", "body"]) {
    const input = find("#memo-" + field2);
    input.hidden = !editable;
    input.disabled = Boolean(structureBusy || item.loading || item.pending && item.pending.method !== "PUT");
    if (input.dataset.composing !== "true" && input.value !== item[field2]) input.value = item[field2] || "";
    find("#memo-read-" + field2).hidden = editable;
    find("#memo-read-" + field2).textContent = item[field2] || (field2 === "body" ? "这篇笔记还没有正文。" : "未命名笔记");
  }
  find("#memo-detail").textContent = deleted ? "已删除 · 可恢复" : s.canEdit ? new TextEncoder().encode(item.body || "").length + " / 65536 字节 · 自动保存" : "公开只读";
  find("#memo-note-actions").hidden = !s.canEdit;
  find('[data-memo-action="save"]').hidden = deleted;
  find('[data-memo-action="save"]').disabled = !item.dirty || Boolean(item.pending) || item.phase === "conflict";
  root.querySelector('#memo-note-actions [data-memo-action="delete-note"]').hidden = true;
  const restore = root.querySelector('#memo-note-actions [data-memo-action="restore-note"]');
  restore.hidden = !deleted;
  restore.disabled = Boolean(s.operation?.pending || item.pending);
  const expanded = find("#memo-fullscreen").open, zoom = find('[data-memo-action="fullscreen"]');
  zoom.setAttribute("aria-label", expanded ? "退出全屏" : "放大正文");
  zoom.setAttribute("title", expanded ? "退出全屏" : "放大正文");
  zoom.setAttribute("aria-expanded", String(expanded));
  find("#memo-note-error").hidden = !item.error;
  find("#memo-note-error").textContent = item.error || "";
  find("#memo-resolution").hidden = !["unknown", "conflict"].includes(item.phase);
  find('[data-memo-action="retry"]').hidden = item.phase !== "unknown" || !item.pending?.retryReady;
  find("#memo-conflict").hidden = item.phase !== "conflict" || !item.remote;
  find("#memo-remote").textContent = item.remote ? (item.remote.deleted_at ? "（已删除）\n" : "") + item.remote.title + "\n\n" + item.remote.body : "";
  find('[data-memo-action="use-draft"]').disabled = !s.canEdit || !item.remote || Boolean(item.remote.deleted_at || group?.deleted_at);
}
function paintMemos(root, store) {
  if (!root) return;
  const s = store.state, item = store.drafts.get(s.noteId), find = (q) => root.querySelector(q);
  root.dataset.pane = s.pane;
  const actual = phases[item?.phase] || "已保存", routine = ["dirty", "saving", "saved"].includes(item?.phase) || !item;
  find("#memo-status").textContent = s.loading ? "正在读取…" : !s.canEdit ? "公开只读" : routine ? "自动保存" : actual;
  find("#memo-status").setAttribute("aria-label", actual);
  find("#memo-status").dataset.phase = item?.phase || "saved";
  find("#memo-error").hidden = !s.error && !s.storageError;
  find("#memo-error").textContent = [s.error, s.storageError].filter(Boolean).join(" ");
  find('[data-memo-action="login"]').hidden = s.canEdit || s.loading;
  if (!s.canEdit) find("#memo-recovery").hidden = true;
  find('[data-memo-action="exit-trash"]').hidden = !s.trash;
  find('[data-memo-action="back-notes"]').hidden = s.pane !== "editor";
  const operation = s.operation;
  find("#memo-operation").hidden = !operation?.error && operation?.phase !== "unknown";
  find("#memo-operation-text").textContent = operation?.error || (operation?.phase === "saving" ? "正在保存操作…" : "操作结果待核对");
  find('[data-memo-action="operation-check"]').hidden = operation?.phase !== "unknown";
  find('[data-memo-action="operation-retry"]').hidden = operation?.phase !== "unknown" || !operation?.retryReady;
  paintLists(root, store);
  paintDrafts(root, store);
  paintDocument(root, store);
}

// web/core/memos-state.mjs
var MEMOS_MAX_BYTES = 65536;
var memoBytes = (value) => new TextEncoder().encode(value).length;
var idPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var cleanTitle = (value) => typeof value === "string" && value.trim() && [...value].length <= 120;
var noteFields = ["group_id", "title", "body", "position"];
var changed = (item, value) => noteFields.some((field2) => item[field2] !== value[field2]);
var isUncertain = (item) => item.pending || ["unknown", "conflict"].includes(item.phase);
function checkedNote(value, id) {
  if (!value || value.id !== id || !idPattern.test(value.group_id) || !cleanTitle(value.title) || typeof value.body !== "string" || memoBytes(value.body) > MEMOS_MAX_BYTES || !Number.isSafeInteger(value.version) || value.version < 1 || !Number.isSafeInteger(value.position))
    throw new Error("笔记读取结果不完整，请核对。");
  return value;
}
function newDraft(value) {
  return {
    ...value,
    dirty: false,
    phase: "saved",
    error: "",
    pending: null,
    remote: null,
    server: { ...value },
    loading: false,
    sequence: 0,
    writeEpoch: 0,
    timer: null
  };
}
function validPending(value) {
  return value && ["groups", "notes"].includes(value.kind) && idPattern.test(value.id) && ["PUT", "POST", "DELETE"].includes(value.method) && value.path === "/memos/" + value.kind + "/" + value.id + (value.method === "POST" ? "/restore" : "") && value.body && idPattern.test(value.body.save_id) && Number.isSafeInteger(value.body.version) && value.body.version >= 0;
}
function recoveredDraft(raw) {
  if (!raw || !idPattern.test(raw.id) || !idPattern.test(raw.group_id) || typeof raw.title !== "string" || typeof raw.body !== "string" || raw.body.length > 262144 || !Number.isSafeInteger(raw.version) || raw.version < 0 || !Number.isSafeInteger(raw.position) || raw.position < 0 || raw.position > 1e6) return null;
  if (raw.pending && (!validPending(raw.pending) || raw.pending.kind !== "notes" || raw.pending.method !== "PUT" || raw.pending.id !== raw.id || raw.pending.body.group_id !== raw.group_id || typeof raw.pending.body.title !== "string" || typeof raw.pending.body.body !== "string")) return null;
  const item = { ...newDraft(raw), dirty: true, server: raw.server || null, remote: raw.remote || null };
  item.pending = raw.pending ? { ...raw.pending, checking: false, retryReady: false } : null;
  item.phase = item.pending ? "unknown" : raw.phase === "conflict" ? "conflict" : "dirty";
  item.error = item.pending ? "上次保存结果待核对，草稿已保留。" : "已找回此浏览器保留的草稿。";
  return item;
}
function makeContext(options2) {
  const { request, ownerId = "", storage: storage2, onChange = () => {
  }, uuid = () => globalThis.crypto.randomUUID(), delay = 700 } = options2;
  const state2 = {
    groups: [],
    notes: [],
    canEdit: false,
    loading: false,
    error: "",
    groupId: "",
    noteId: "",
    pane: "groups",
    trash: false,
    operation: null,
    storageError: ""
  };
  const context = { state: state2, drafts: /* @__PURE__ */ new Map(), request, ownerId, storage: storage2, uuid, delay, disposed: false, hydrated: false, loadSequence: 0 };
  context.draftScope = options2.draftScope || uuid();
  context.restoreDraftScope = options2.restoreDraftScope;
  context.storagePersistent = options2.storagePersistent !== false && Boolean(options2.draftScope);
  context.online = options2.online || (() => globalThis.navigator?.onLine !== false);
  context.stop = (item) => {
    clearTimeout(item.timer);
    item.timer = null;
  };
  context.emit = () => {
    if (!context.disposed) {
      context.persist();
      onChange();
    }
  };
  context.writable = () => !context.disposed && state2.canEdit && idPattern.test(context.ownerId);
  context.blocked = (item) => {
    const pending = state2.operation?.pending;
    return pending && (pending.kind === "notes" && pending.id === item.id || pending.kind === "groups" && pending.method === "DELETE" && pending.id === item.group_id);
  };
  context.upsert = (kind, value) => {
    const list = state2[kind], index = list.findIndex((row2) => row2.id === value.id);
    const row = { ...value };
    if (kind === "notes") delete row.body;
    if (index < 0) list.push(row);
    else list[index] = row;
    list.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    if (kind === "notes") for (const group of state2.groups)
      group.active_note_count = state2.notes.filter((note) => note.group_id === group.id && !note.deleted_at && note.version > 0).length;
  };
  context.schedule = (item) => {
    context.stop(item);
    if (context.writable() && item.dirty && !item.loading && !item.composing && !isUncertain(item) && item.phase === "dirty")
      item.timer = setTimeout(() => {
        item.timer = null;
        void context.saveNote(item.id);
      }, delay);
  };
  context.dispose = () => {
    context.persist();
    context.disposed = true;
    for (const item of context.drafts.values()) context.stop(item);
    context.drafts.clear();
    state2.groups = [];
    state2.notes = [];
    state2.operation = null;
    state2.canEdit = false;
  };
  return context;
}
function persistence(context) {
  const key = () => "haoduoyu.memos.drafts.v1." + context.ownerId + "." + context.draftScope;
  const previousKey = () => context.restoreDraftScope ? "haoduoyu.memos.drafts.v1." + context.ownerId + "." + context.restoreDraftScope : null;
  function persist() {
    if (!context.writable()) return;
    if (!context.storage) {
      context.state.storageError = "浏览器无法保留草稿，请暂时保持此页面打开。";
      return;
    }
    const drafts = [...context.drafts.values()].filter((item) => item.dirty || item.pending || item.phase === "conflict").slice(0, 200).map(({ timer, ...item }) => ({ ...item, loading: false }));
    try {
      context.storage.setItem(key(), JSON.stringify({ saved_at: (/* @__PURE__ */ new Date()).toISOString(), drafts, operation: context.state.operation }));
      context.state.storageError = context.storagePersistent ? "" : "浏览器无法记住此页签，刷新后可能无法找回草稿，请保持页面打开。";
    } catch {
      context.state.storageError = "浏览器无法保留草稿，请暂时保持此页面打开。";
    }
  }
  function hydrate() {
    if (context.hydrated || !context.writable()) return;
    context.hydrated = true;
    try {
      const current = context.storage?.getItem(key());
      const saved = JSON.parse(current ?? (previousKey() ? context.storage?.getItem(previousKey()) : null) ?? "{}");
      if (Array.isArray(saved.drafts)) for (const raw of saved.drafts.slice(0, 200)) {
        const item = recoveredDraft(raw);
        if (item) context.drafts.set(item.id, item);
      }
      if (validPending(saved.operation?.pending))
        context.state.operation = { ...saved.operation, phase: "unknown", checking: false, retryReady: false };
    } catch {
      context.state.storageError = "浏览器草稿读取失败，已保留原记录。";
    }
  }
  async function recoverDraft(raw) {
    if (!context.writable()) return false;
    const item = recoveredDraft(raw);
    if (!item) {
      context.state.error = "草稿格式不完整，请复制预览中的文字留存。";
      context.emit();
      return false;
    }
    const current = context.drafts.get(item.id);
    if (current && (current.dirty || current.pending)) {
      if (changed(current, item) || current.version !== item.version || current.pending?.body.save_id !== item.pending?.body.save_id) {
        context.state.error = "此笔记已有另一份草稿，未覆盖。请先复制预览文字，再处理当前草稿。";
        context.emit();
        return false;
      }
    } else context.drafts.set(item.id, item);
    context.state.groupId = item.group_id;
    context.state.noteId = item.id;
    context.state.pane = "editor";
    context.emit();
    await context.selectNote(item.id);
    return true;
  }
  return { persist, hydrate, recoverDraft };
}
function acceptNote(context, item, value, pending) {
  const preserve = changed(item, pending.snapshot || pending.body);
  if (!preserve) for (const field2 of noteFields) item[field2] = value[field2];
  item.server = { ...value };
  item.version = value.version;
  item.deleted_at = value.deleted_at;
  item.updated_at = value.updated_at;
  item.pending = null;
  item.remote = null;
  item.error = "";
  item.dirty = changed(item, value);
  item.phase = item.dirty ? "dirty" : "saved";
  item.writeEpoch++;
  context.upsert("notes", value);
  context.emit();
  context.schedule(item);
}
function memoReads(context) {
  async function selectNote(id, { open = true, select = true } = {}) {
    if (context.disposed || !idPattern.test(id)) return;
    const { state: state2, drafts } = context;
    if (select) {
      state2.noteId = id;
      if (open) state2.pane = "editor";
    }
    let item = drafts.get(id);
    if (!item) {
      item = newDraft({ id, title: "", body: "", version: 0 });
      drafts.set(id, item);
    }
    if (select && item.group_id) state2.groupId = item.group_id;
    if (item.version === 0 && item.dirty && item.phase !== "conflict") {
      context.emit();
      return;
    }
    const sequence = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true;
    context.emit();
    try {
      const value = checkedNote(await context.request("/memos/notes/" + id), id);
      if (context.disposed || sequence !== item.sequence || epoch !== item.writeEpoch || item.pending) return;
      if (select && state2.noteId === id) state2.groupId = value.group_id;
      if (item.dirty && item.version !== value.version || item.phase === "conflict") {
        item.remote = value;
        item.phase = "conflict";
        item.error = "服务器已有新版本，草稿已保留，请核对后选择。";
      } else {
        const preserve = item.dirty;
        if (!preserve) for (const field2 of noteFields) item[field2] = value[field2];
        item.server = value;
        item.version = value.version;
        item.deleted_at = value.deleted_at;
        item.updated_at = value.updated_at;
        item.dirty = changed(item, value);
        item.phase = item.dirty ? "dirty" : "saved";
        item.error = "";
        context.upsert("notes", value);
      }
    } catch (error) {
      if (!context.disposed && sequence === item.sequence) {
        item.error = error.message;
        if (!isUncertain(item)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence === item.sequence) {
        item.loading = false;
        context.emit();
      }
    }
  }
  async function load() {
    const { state: state2 } = context, sequence = ++context.loadSequence;
    state2.loading = true;
    state2.error = "";
    context.emit();
    try {
      const value = await context.request("/memos");
      if (context.disposed || sequence !== context.loadSequence) return;
      if (!Array.isArray(value?.groups) || !Array.isArray(value.notes) || typeof value.can_edit !== "boolean")
        throw new Error("备忘录列表不完整，请重新读取。");
      if (value.draft_scope && context.ownerId && value.draft_scope !== context.ownerId)
        throw new Error("工作区归属已变化，请重新打开页面核对本机草稿。");
      if (!context.ownerId && idPattern.test(value.draft_scope || "")) context.ownerId = value.draft_scope;
      state2.draftOwner = context.ownerId;
      state2.groups = value.groups;
      state2.notes = value.notes;
      state2.canEdit = value.can_edit === true && idPattern.test(context.ownerId);
      if (!state2.canEdit) {
        for (const item of context.drafts.values()) context.stop(item);
        context.drafts.clear();
        state2.operation = null;
      } else context.hydrate();
      if (!state2.groups.some((group) => group.id === state2.groupId && (state2.trash || !group.deleted_at)))
        state2.groupId = state2.groups.find((group) => state2.trash || !group.deleted_at)?.id || "";
      if (!state2.noteId) state2.noteId = state2.notes.find((note) => note.group_id === state2.groupId && (state2.trash || !note.deleted_at))?.id || "";
      if (state2.noteId) await selectNote(state2.noteId, { open: false });
    } catch (error) {
      if (!context.disposed && sequence === context.loadSequence) state2.error = error.message;
    } finally {
      if (!context.disposed && sequence === context.loadSequence) {
        state2.loading = false;
        context.emit();
      }
    }
  }
  async function selectGroup(id) {
    const group = context.state.groups.find((row) => row.id === id && (context.state.trash || !row.deleted_at));
    if (!group) return;
    context.state.groupId = id;
    context.state.noteId = "";
    context.state.pane = "notes";
    const note = context.state.notes.find((row) => row.group_id === id && (context.state.trash || !row.deleted_at));
    if (note) await selectNote(note.id, { open: false });
    context.emit();
  }
  return { load, selectNote, selectGroup };
}
function editing(context) {
  function edit(field2, value, { composing = false } = {}) {
    const item = context.drafts.get(context.state.noteId);
    if (!context.writable() || !item || item.loading || !idPattern.test(item.group_id) || !["title", "body"].includes(field2) || item.deleted_at || context.blocked(item)) return;
    item.composing = composing;
    item[field2] = value;
    item.dirty = !item.server || changed(item, item.server);
    context.stop(item);
    if (!isUncertain(item)) {
      item.phase = item.pending ? "saving" : item.dirty ? "dirty" : "saved";
      item.error = "";
      if (!composing && (!cleanTitle(item.title) || memoBytes(item.body) > MEMOS_MAX_BYTES)) {
        item.phase = "error";
        item.error = "标题须为 1–120 字，正文最多 64 KiB；草稿已保留。";
      }
    }
    context.emit();
    if (!composing) context.schedule(item);
  }
  async function sendNote(item, pending) {
    context.stop(item);
    item.pending = pending;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    context.emit();
    try {
      const value = checkedNote(await context.request(pending.path, { method: pending.method, body: pending.body }), item.id);
      if (context.disposed || item.pending !== pending) return;
      if (value.version !== pending.body.version + 1 || changed(value, pending.body)) throw new Error("保存响应需要重新核对。");
      acceptNote(context, item, value, pending);
    } catch (error) {
      if (context.disposed || item.pending !== pending) return;
      if (error.status === 409) {
        item.pending = null;
        item.phase = "conflict";
        item.error = "版本冲突，草稿已保留，不会自动覆盖。";
        await context.selectNote(item.id, { open: false, select: false });
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null;
        item.phase = "error";
        item.error = error.message;
        if ([401, 403].includes(error.status)) context.state.canEdit = false;
      } else {
        item.phase = "unknown";
        item.error = "保存结果待核对。草稿已保留，请先查询保存收据。";
      }
      context.emit();
    }
  }
  async function saveNote(id = context.state.noteId) {
    const item = context.drafts.get(id);
    if (!context.writable() || !item || !item.dirty || isUncertain(item) || item.loading || item.deleted_at || context.blocked(item)) return;
    context.stop(item);
    if (!cleanTitle(item.title) || memoBytes(item.body) > MEMOS_MAX_BYTES) {
      item.phase = "error";
      item.error = "标题须为 1–120 字，正文最多 64 KiB；草稿已保留。";
      context.emit();
      return;
    }
    if (!context.online()) {
      item.phase = "offline";
      item.error = "当前离线，草稿保留在此浏览器。联网后可立即保存。";
      context.emit();
      return;
    }
    const snapshot = Object.fromEntries(noteFields.map((field2) => [field2, item[field2]]));
    const body = { ...snapshot, title: snapshot.title.trim(), body: snapshot.body.replace(/\r\n?/g, "\n") };
    return sendNote(item, {
      kind: "notes",
      id,
      path: "/memos/notes/" + id,
      method: "PUT",
      body: { ...body, version: item.version, save_id: context.uuid() },
      snapshot
    });
  }
  async function createNote(groupId, title = "新笔记") {
    if (!context.writable() || !context.state.groups.some((group) => group.id === groupId && !group.deleted_at)) return;
    const id = context.uuid(), position = Math.min(1e6, Math.max(0, ...context.state.notes.map((note) => note.position)) + 1);
    const item = newDraft({ id, group_id: groupId, title, body: "", position, version: 0, deleted_at: null });
    item.dirty = true;
    item.phase = "dirty";
    item.server = null;
    context.drafts.set(id, item);
    context.state.groupId = groupId;
    context.state.noteId = id;
    context.state.pane = "editor";
    context.upsert("notes", item);
    context.emit();
    await saveNote(id);
    return id;
  }
  return { edit, sendNote, saveNote, createNote };
}
function resolution(context) {
  async function checkNote(id = context.state.noteId) {
    const item = context.drafts.get(id), pending = item?.pending;
    if (!context.writable() || !item) return;
    if (!pending) return context.selectNote(id, { open: false });
    if (pending.checking) return;
    pending.checking = true;
    pending.retryReady = false;
    context.emit();
    try {
      const receipt = await context.request("/memos/operations/" + pending.body.save_id);
      if (context.disposed || item.pending !== pending) return;
      if (receipt?.found === false) {
        pending.retryReady = true;
        item.error = "暂未找到保存收据；可手动重试同一保存，不会新建重复操作。";
        return;
      }
      if (receipt?.found !== true || receipt.kind !== "notes" || receipt.id !== id) throw new Error("保存收据不匹配。");
      const value = checkedNote(await context.request("/memos/notes/" + id), id);
      if (context.disposed || item.pending !== pending) return;
      if (value.version === receipt.version && !changed(value, pending.body)) acceptNote(context, item, value, pending);
      else {
        item.pending = null;
        item.remote = value;
        item.phase = "conflict";
        item.dirty = true;
        item.error = "原保存已记录，服务器随后又有更新。请核对两个版本。";
      }
    } catch (error) {
      if (!context.disposed && item.pending === pending) item.error = "核对失败，保留草稿并暂停发送：" + error.message;
    } finally {
      pending.checking = false;
      context.emit();
    }
  }
  async function retryPending(id = context.state.noteId) {
    const item = context.drafts.get(id), pending = item?.pending;
    if (!context.writable() || item?.phase !== "unknown" || !pending?.retryReady || pending.checking) return;
    pending.retryReady = false;
    return context.sendNote(item, pending);
  }
  function useServer(id = context.state.noteId) {
    const item = context.drafts.get(id);
    if (!context.writable() || !item?.remote || item.pending || item.phase !== "conflict") return;
    context.stop(item);
    const value = item.remote;
    Object.assign(item, newDraft(value));
    context.upsert("notes", value);
    context.emit();
  }
  async function useDraft(id = context.state.noteId) {
    const item = context.drafts.get(id);
    if (!context.writable() || !item?.remote || item.pending || item.phase !== "conflict" || item.remote.deleted_at) return;
    item.server = item.remote;
    item.version = item.remote.version;
    item.remote = null;
    item.dirty = changed(item, item.server);
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    context.emit();
    return context.saveNote(id);
  }
  return { checkNote, retryPending, useServer, useDraft };
}
function operations(context) {
  async function sendOperation(pending) {
    const operation2 = { pending, phase: "saving", error: "", retryReady: false };
    context.state.operation = operation2;
    context.emit();
    try {
      const value = await context.request(pending.path, { method: pending.method, body: pending.body });
      if (context.disposed || context.state.operation !== operation2) return;
      if (value?.id !== pending.id || !Number.isSafeInteger(value.version)) throw new Error("操作结果需要核对。");
      context.upsert(pending.kind, value);
      context.state.operation = null;
      if (pending.kind === "notes") context.drafts.delete(pending.id);
      await context.load();
    } catch (error) {
      if (context.disposed || context.state.operation !== operation2) return;
      operation2.error = error.message;
      if (error.status >= 400 && error.status < 500) {
        operation2.phase = "error";
        operation2.pending = null;
      } else {
        operation2.phase = "unknown";
        operation2.error = "操作结果待核对，请先查询保存收据，暂不重复操作。";
      }
      context.emit();
    }
  }
  async function operation(kind, id, method, body) {
    if (!context.writable() || context.state.operation?.pending) return;
    if (!context.online()) {
      context.state.operation = { phase: "offline", pending: null, error: "当前离线，请联网后重试此操作。" };
      context.emit();
      return;
    }
    return sendOperation({
      kind,
      id,
      method,
      path: "/memos/" + kind + "/" + id + (method === "POST" ? "/restore" : ""),
      body: { ...body, save_id: context.uuid() }
    });
  }
  async function checkOperation() {
    const value = context.state.operation, pending = value?.pending;
    if (!context.writable() || !pending || value.checking) return;
    value.checking = true;
    value.retryReady = false;
    context.emit();
    try {
      const receipt = await context.request("/memos/operations/" + pending.body.save_id);
      if (context.disposed || context.state.operation !== value) return;
      if (receipt?.found === false) {
        value.retryReady = true;
        value.error = "暂未找到收据，可手动重试同一操作。";
      } else if (receipt?.found === true && receipt.id === pending.id && receipt.kind === pending.kind) {
        context.state.operation = null;
        await context.load();
      } else throw new Error("操作收据不匹配。");
    } catch (error) {
      if (!context.disposed && context.state.operation === value) value.error = "核对失败：" + error.message;
    } finally {
      value.checking = false;
      context.emit();
    }
  }
  async function retryOperation() {
    const value = context.state.operation;
    if (!context.writable() || !value?.pending || !value.retryReady || value.checking) return;
    return sendOperation(value.pending);
  }
  function recoverOperation(raw) {
    if (!context.writable() || !validPending(raw?.pending)) return false;
    if (context.state.operation?.pending) {
      context.state.error = "当前已有待核对操作，请先核对，未替换原操作。";
      context.emit();
      return false;
    }
    context.state.operation = {
      ...raw,
      pending: { ...raw.pending },
      phase: "unknown",
      checking: false,
      retryReady: false,
      error: "已找回上次操作，请先核对保存收据。"
    };
    context.emit();
    return true;
  }
  return { operation, checkOperation, retryOperation, recoverOperation };
}
function structure(context) {
  const pendingInGroup = (id) => [...context.drafts.values()].some((item) => item.group_id === id && (item.dirty || item.pending));
  async function createGroup(title) {
    if (!cleanTitle(title)) return;
    const id = context.uuid(), position = Math.min(1e6, Math.max(0, ...context.state.groups.map((group) => group.position)) + 1);
    await context.operation("groups", id, "PUT", { title: title.trim(), position, version: 0 });
    if (context.state.groups.some((group) => group.id === id)) await context.selectGroup(id);
    return id;
  }
  async function renameGroup(id, title) {
    const group = context.state.groups.find((value) => value.id === id);
    if (!group || group.deleted_at || !cleanTitle(title)) return;
    return context.operation("groups", id, "PUT", { title: title.trim(), position: group.position, version: group.version });
  }
  async function removeGroup(id, confirmation) {
    const group = context.state.groups.find((value) => value.id === id);
    if (!group || group.deleted_at) return;
    const snapshot = confirmation || group;
    if (["version", "title", "active_note_count"].some((field2) => snapshot[field2] !== group[field2])) {
      context.state.error = "分组已更新，请重新核对标题和笔记数量后确认删除。";
      context.emit();
      return;
    }
    if (pendingInGroup(id)) {
      context.state.error = "此分组还有未保存草稿，请先保存或核对后再删除。";
      context.emit();
      return;
    }
    return context.operation("groups", id, "DELETE", {
      version: snapshot.version,
      confirm_title: snapshot.title,
      confirm_note_count: snapshot.active_note_count
    });
  }
  async function removeNote(id) {
    const item = context.drafts.get(id), note = context.state.notes.find((value) => value.id === id);
    if (!note || note.deleted_at || item && (item.dirty || item.pending)) {
      context.state.error = "请先保存或核对笔记草稿，再删除。";
      context.emit();
      return;
    }
    return context.operation("notes", id, "DELETE", { version: note.version });
  }
  async function restore(kind, id) {
    if (!["groups", "notes"].includes(kind)) return;
    const value = context.state[kind].find((row) => row.id === id);
    if (!value?.deleted_at) return;
    if (kind === "notes" && !context.state.groups.some((group) => group.id === value.group_id && !group.deleted_at)) {
      context.state.error = "请先恢复此笔记所属的分组。";
      context.emit();
      return;
    }
    return context.operation(kind, id, "POST", { version: value.version });
  }
  return { createGroup, renameGroup, removeGroup, removeNote, restore };
}
function createMemosStore(options2) {
  const context = makeContext(options2);
  Object.assign(context, persistence(context), memoReads(context), editing(context), resolution(context), operations(context), structure(context));
  const {
    state: state2,
    drafts,
    load,
    selectGroup,
    selectNote,
    edit,
    saveNote,
    createGroup,
    renameGroup,
    createNote,
    removeGroup,
    removeNote,
    restore,
    checkNote,
    useServer,
    useDraft,
    retryPending,
    checkOperation,
    retryOperation,
    recoverDraft,
    recoverOperation,
    dispose
  } = context;
  return {
    state: state2,
    drafts,
    load,
    selectGroup,
    selectNote,
    edit,
    saveNote,
    createGroup,
    renameGroup,
    createNote,
    removeGroup,
    removeNote,
    restore,
    checkNote,
    useServer,
    useDraft,
    retryPending,
    checkOperation,
    retryOperation,
    recoverDraft,
    recoverOperation,
    dispose
  };
}

// web/memos-recovery.mjs
var recoveries = [], selectedRecovery = -1;
function resetMemoRecovery() {
  recoveries = [];
  selectedRecovery = -1;
}
function recoverable(raw) {
  return raw && typeof raw.id === "string" && typeof raw.title === "string" && typeof raw.body === "string" && raw.body.length <= 262144 && (raw.dirty || raw.pending || raw.phase === "conflict");
}
function snapshots(storage2, ownerId) {
  const prefix = "haoduoyu.memos.drafts.v1." + ownerId, rows = [], seen = /* @__PURE__ */ new Set();
  const keys = [];
  for (let index = 0; index < Math.min(storage2.length, 1e3); index++) {
    const key = storage2.key(index);
    if (key === prefix || key?.startsWith(prefix + ".")) keys.push(key);
    if (keys.length === 200) break;
  }
  for (const key of keys) {
    try {
      const text = storage2.getItem(key);
      if (!text || text.length > 8 * 1024 * 1024) continue;
      const value = JSON.parse(text);
      if (!Array.isArray(value.drafts)) continue;
      for (const raw of value.drafts.slice(0, 200).filter(recoverable)) {
        const fingerprint = JSON.stringify([raw.id, raw.title, raw.body, raw.version, raw.pending?.body?.save_id || ""]);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        rows.push({ raw, savedAt: value.saved_at || raw.updated_at || "", key });
      }
    } catch {
    }
  }
  return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 100);
}
function label2(row, index) {
  const timestamp = Date.parse(row.savedAt), date = Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "保存时间未知";
  return index + 1 + ". " + (row.raw.title || "未命名笔记") + " · " + date + " · 版本 " + row.raw.version;
}
function openMemoRecovery(root, store, ownerId) {
  if (!store.state.canEdit || !ownerId || !root) return;
  resetMemoRecovery();
  const find = (q) => root.querySelector(q);
  try {
    recoveries = snapshots(window.localStorage, ownerId);
  } catch {
    store.state.error = "无法读取此浏览器保存的草稿。";
  }
  find("#memo-recovery").hidden = false;
  find("#memo-recovery-detail").hidden = true;
  find("#memo-recovery-list").innerHTML = recoveries.map((row, index) => '<button type="button" class="memo-recovery-item" data-memo-recovery="' + index + '">' + e(label2(row, index)) + "</button>").join("");
  find("#memo-recovery-status").textContent = recoveries.length ? "仅显示此所有者在本机保留的最近 100 份草稿。选择后可复制文字；恢复前会核对服务器版本。" : "此浏览器没有找到可恢复的草稿。";
}
function selectMemoRecovery(root, index) {
  const row = recoveries[index];
  if (!root || !row || !Number.isSafeInteger(index)) return;
  selectedRecovery = index;
  root.querySelector("#memo-recovery-detail").hidden = false;
  root.querySelector("#memo-recovery-selected").textContent = label2(row, index);
  root.querySelector("#memo-recovery-copy").value = row.raw.title + "\n\n" + row.raw.body;
  root.querySelector("#memo-recovery-copy").focus();
}
async function restoreMemoRecovery(root, store) {
  const row = recoveries[selectedRecovery];
  if (!row || !store.state.canEdit) return;
  await store.recoverDraft(row.raw);
  root.querySelector("#memo-recovery-status").textContent = store.state.error || "草稿已取回编辑区。请核对保存状态；存在服务器新版本时不会自动覆盖。";
}

// web/memos-controller.mjs
var memoStore, memoIdentity = "", memoEvents = false, memoDialog = null, memoDraftScope, memoCreating = false, memoTool = "";
var memoEditorFocus = null, memoDeleting = "", memoDeleteWait = null;
function requestMemoTool(tool) {
  memoTool = ["trash", "recovery"].includes(tool) ? tool : "";
}
function draftStorageScope() {
  if (memoDraftScope) return memoDraftScope;
  const generated = globalThis.crypto.randomUUID();
  try {
    const key = "haoduoyu.memos.tab.v1", saved = window.sessionStorage.getItem(key);
    const previous = /^[a-f0-9-]{36}$/i.test(saved || "") ? saved : "";
    window.sessionStorage.setItem(key, generated);
    memoDraftScope = { draftScope: generated, restoreDraftScope: previous, storagePersistent: true };
  } catch {
    memoDraftScope = { draftScope: generated, storagePersistent: false };
  }
  return memoDraftScope;
}
var currentIdentity = () => String(runtime.sessionEpoch) + ":" + String(state.me?.id || "") + ":" + String(state.me?.csrfToken || "");
var visible = () => state.page === "memos" && memoIdentity === currentIdentity();
function ensureStore() {
  const identity = currentIdentity();
  if (memoStore && memoIdentity === identity) return memoStore;
  memoDeleteWait?.(true);
  memoDeleteWait = null;
  memoDeleting = "";
  memoEditorFocus = null;
  memoStore?.dispose();
  memoIdentity = identity;
  memoDialog = null;
  resetMemoRecovery();
  const active2 = () => {
    if (currentIdentity() !== identity) throw new DOMException("登录状态已经改变", "AbortError");
  };
  const request = async (path, options2) => {
    active2();
    const value = await api(path, options2);
    active2();
    return value;
  };
  let local;
  try {
    local = window.localStorage;
  } catch {
    local = null;
  }
  memoStore = createMemosStore({
    request,
    storage: local,
    ...draftStorageScope(),
    ownerId: state.me?.publicBusiness ? "" : String(state.me?.id || ""),
    onChange: () => {
      if (identity === currentIdentity()) {
        memoDeleteWait?.();
        paintMemosPage();
      }
    }
  });
  return memoStore;
}
function paintDialog(root) {
  const find = (query) => root.querySelector(query), dialog = memoDialog;
  find("#memo-dialog").hidden = !dialog;
  if (!dialog) return;
  find("#memo-dialog-heading").textContent = dialog.heading;
  find("#memo-dialog-description").textContent = dialog.description || "";
  find("#memo-dialog-label").hidden = !dialog.input;
  find("#memo-dialog-title").hidden = !dialog.input;
  find('[data-memo-action="confirm"]').disabled = Boolean(dialog.saving);
  find('[data-memo-action="cancel"]').disabled = Boolean(dialog.saving);
}
function paintMemosPage() {
  if (!visible() || !memoStore) return;
  const root = document.querySelector("#memos");
  if (!root) return;
  paintMemos(root, memoStore);
  paintDialog(root);
  if (memoDeleting) root.querySelectorAll('[data-memo-action="delete-note"]').forEach((button2) => {
    if (button2.dataset.memoTarget === memoDeleting) button2.disabled = true;
  });
  if (memoCreating) root.querySelectorAll('[data-memo-action="new-group"],[data-memo-action="new-note"]').forEach((button2) => {
    button2.disabled = true;
  });
}
function openDialog(kind, id = "") {
  const s = memoStore.state, group = s.groups.find((row) => row.id === (id || s.groupId));
  const note = memoStore.drafts.get(id || s.noteId);
  const descriptions = {
    "new-group": { heading: "新建分组", input: true, value: "" },
    "new-note": { heading: "新建笔记", input: true, value: "新笔记" },
    "rename-group": { heading: "重命名分组", input: true, value: group?.title || "" },
    "delete-group": {
      heading: "删除整个分组？",
      input: false,
      description: "“" + (group?.title || "") + "”及其中 " + (group?.active_note_count || 0) + " 篇笔记将从公开页面隐藏。可在回收站恢复整个分组。"
    },
    "delete-note": {
      heading: "删除这篇笔记？",
      input: false,
      description: "“" + (note?.title || "") + "”将从公开页面隐藏。可在回收站恢复。"
    },
    "use-draft": {
      heading: "用草稿更新服务器版本？",
      input: false,
      description: "请先核对下方服务器内容。确认后，此草稿会保存为新版本。"
    },
    "use-server": {
      heading: "采用服务器内容？",
      input: false,
      description: "当前本机未保存的草稿将被替换，请先复制需要保留的文字。"
    }
  };
  memoDialog = {
    kind,
    id: id || (kind.includes("group") ? s.groupId : s.noteId),
    ...descriptions[kind],
    groupSnapshot: group ? { version: group.version, title: group.title, active_note_count: group.active_note_count } : null
  };
  paintMemosPage();
  const input = document.querySelector("#memo-dialog-title");
  input.value = memoDialog.value || "";
  if (memoDialog.input) {
    input.focus();
    input.select();
  } else document.querySelector('[data-memo-action="cancel"]')?.focus();
}
async function confirmDialog() {
  const dialog = memoDialog;
  if (!dialog || dialog.saving) return;
  const title = document.querySelector("#memo-dialog-title")?.value.trim() || "";
  if (dialog.input && !title) {
    dialog.description = "名称不能为空。";
    paintMemosPage();
    return;
  }
  dialog.saving = true;
  paintMemosPage();
  try {
    if (dialog.kind === "new-group") await memoStore.createGroup(title);
    else if (dialog.kind === "new-note") await memoStore.createNote(memoStore.state.groupId, title);
    else if (dialog.kind === "rename-group") await memoStore.renameGroup(dialog.id, title);
    else if (dialog.kind === "delete-group") await memoStore.removeGroup(dialog.id, dialog.groupSnapshot);
    else if (dialog.kind === "delete-note") await memoStore.removeNote(dialog.id);
    else if (dialog.kind === "use-draft") await memoStore.useDraft(dialog.id);
    else if (dialog.kind === "use-server") await memoStore.useServer(dialog.id);
    if (memoDialog === dialog) memoDialog = null;
  } finally {
    dialog.saving = false;
    paintMemosPage();
  }
}
async function createMemo(action, target) {
  if (memoCreating || !memoStore.state.canEdit) return;
  const store = memoStore;
  memoCreating = true;
  paintMemosPage();
  try {
    if (action === "new-group") await store.createGroup("未命名分组");
    else {
      let group = store.state.groups.find((row) => row.id === store.state.groupId && !row.deleted_at) || store.state.groups.find((row) => !row.deleted_at);
      if (!group) {
        const id = await store.createGroup("笔记");
        group = store.state.groups.find((row) => row.id === id && !row.deleted_at);
      }
      if (!group || store !== memoStore || !visible()) return;
      const pending = store.createNote(group.id, "未命名笔记");
      paintMemosPage();
      const field2 = document.querySelector("#memo-title");
      if (visible() && store === memoStore) {
        field2?.focus();
        field2?.select();
      }
      await pending;
    }
  } finally {
    memoCreating = false;
    paintMemosPage();
  }
  if (action === "new-group" && visible() && store === memoStore)
    document.querySelector('[data-memo-action="new-group"]')?.focus();
}
async function selectVisibleMemo(store) {
  const s = store.state, selected = store.drafts.get(s.noteId);
  if (selected?.dirty || selected?.pending) return;
  const rows = s.notes.filter((note) => Boolean(note.deleted_at || s.groups.find((group) => group.id === note.group_id)?.deleted_at) === s.trash);
  if (rows.some((note) => note.id === s.noteId)) return;
  s.noteId = rows[0]?.id || "";
  if (s.noteId) await store.selectNote(s.noteId, { open: false });
  else s.pane = "notes";
}
async function removeMemo(id) {
  const store = memoStore, item = store.drafts.get(id);
  if (memoDeleting || !store.state.canEdit) return;
  memoDeleting = id;
  store.state.error = "";
  paintMemosPage();
  try {
    if (item?.pending && item.phase === "saving") await new Promise((resolve) => {
      memoDeleteWait = (force) => {
        if (force || item.phase !== "saving") resolve();
      };
    });
    if (store !== memoStore || memoIdentity !== currentIdentity()) return;
    memoDeleteWait = null;
    if (item?.dirty && !item.pending) await store.saveNote(id);
    if (item?.dirty || item?.pending) {
      store.state.error = "笔记尚未确认保存，未删除。请先核对保留的草稿。";
      return;
    }
    await store.removeNote(id);
    await selectVisibleMemo(store);
  } finally {
    if (store === memoStore) {
      memoDeleting = "";
      memoDeleteWait = null;
      paintMemosPage();
    }
  }
}
async function restoreMemo(id) {
  const store = memoStore, note = store.state.notes.find((row) => row.id === id);
  if (!note) return;
  if (store.state.groups.find((row) => row.id === note.group_id)?.deleted_at) await store.restore("groups", note.group_id);
  if (store.state.groups.find((row) => row.id === note.group_id)?.deleted_at) return;
  if (note.deleted_at) await store.restore("notes", id);
  await selectVisibleMemo(store);
}
function toggleMemoFullscreen(expanded) {
  const root = document.querySelector("#memos"), dialog = root?.querySelector("#memo-fullscreen");
  if (!dialog) return;
  const editor = root.querySelector(".memo-editor"), field2 = root.contains(memoEditorFocus) ? memoEditorFocus : root.querySelector("#memo-body");
  const selection = field2 ? { start: field2.selectionStart, end: field2.selectionEnd, direction: field2.selectionDirection, scroll: field2.scrollTop } : null;
  if (expanded ?? !dialog.open) {
    dialog.append(editor);
    dialog.showModal();
  } else {
    dialog.close();
    root.querySelector(".memo-layout").append(editor);
  }
  paintMemosPage();
  if (field2 && !field2.hidden && !field2.disabled) {
    field2.focus({ preventScroll: true });
    field2.setSelectionRange(selection.start, selection.end, selection.direction);
    field2.scrollTop = selection.scroll;
  }
}
async function clickAction(action, target) {
  const store = ensureStore(), s = store.state;
  if (["new-group", "new-note"].includes(action)) return createMemo(action, target);
  if (action === "delete-note") return removeMemo(target?.dataset.memoTarget || s.noteId);
  if (action === "restore-note") return restoreMemo(target?.dataset.memoTarget || s.noteId);
  if (action === "fullscreen") return toggleMemoFullscreen();
  if (["rename-group", "delete-group", "use-draft", "use-server"].includes(action)) {
    if (s.canEdit) openDialog(action, target?.dataset.memoTarget);
    return;
  }
  if (action === "cancel") memoDialog = null;
  else if (action === "confirm") await confirmDialog();
  else if (action === "login") {
    renderLogin();
    return;
  } else if (action === "refresh") await store.load();
  else if (action === "recovery") openMemoRecovery(document.querySelector("#memos"), store, store.state.draftOwner);
  else if (action === "close-recovery") document.querySelector("#memo-recovery").hidden = true;
  else if (action === "restore-draft") await restoreMemoRecovery(document.querySelector("#memos"), store);
  else if (action === "save") await store.saveNote();
  else if (action === "check") await store.checkNote(s.noteId);
  else if (action === "retry") await store.retryPending(s.noteId);
  else if (action === "operation-check") await store.checkOperation();
  else if (action === "operation-retry") await store.retryOperation();
  else if (action === "restore-group") await store.restore("groups", target?.dataset.memoTarget || s.groupId);
  else if (action === "back-groups") s.pane = "groups";
  else if (action === "back-notes") s.pane = "notes";
  else if (["trash", "exit-trash"].includes(action) && s.canEdit) {
    s.trash = !s.trash;
    s.pane = "groups";
    s.groupId = "";
    s.noteId = "";
    memoDialog = null;
  }
  paintMemosPage();
}
function run(action) {
  Promise.resolve().then(action).catch((error) => {
    if (!visible() || error.name === "AbortError" || error.staleSession) return;
    memoStore.state.error = error.message || "操作失败，未保存草稿仍保留。";
    paintMemosPage();
  });
}
function editing2(event, composing) {
  if (!visible() || !["memo-title", "memo-body"].includes(event.target.id)) return;
  const root = document.querySelector("#memos");
  if (!root?.contains(event.target)) return;
  memoStore.edit(
    event.target.id === "memo-title" ? "title" : "body",
    event.target.value,
    { composing: composing || event.target.dataset.composing === "true" }
  );
}
function registerEvents() {
  if (memoEvents) return;
  memoEvents = true;
  document.addEventListener("focusin", (event) => {
    if (visible() && ["memo-title", "memo-body"].includes(event.target.id)) memoEditorFocus = event.target;
  });
  document.addEventListener("cancel", (event) => {
    if (visible() && event.target.id === "memo-fullscreen") {
      event.preventDefault();
      toggleMemoFullscreen(false);
    }
  }, true);
  document.addEventListener("input", (event) => editing2(event, event.isComposing));
  document.addEventListener("compositionstart", (event) => {
    if (visible() && ["memo-title", "memo-body"].includes(event.target.id)) event.target.dataset.composing = "true";
  });
  document.addEventListener("compositionend", (event) => {
    if (["memo-title", "memo-body"].includes(event.target.id)) event.target.dataset.composing = "false";
    editing2(event, false);
  });
  document.addEventListener("click", (event) => {
    if (!visible()) return;
    const target = event.target.closest("[data-memo-action],[data-memo-group],[data-memo-note],[data-memo-draft],[data-memo-recovery]");
    if (!target || !document.querySelector("#memos")?.contains(target)) return;
    event.preventDefault();
    run(async () => {
      if (target.dataset.memoAction) return clickAction(target.dataset.memoAction, target);
      if (target.dataset.memoRecovery !== void 0) {
        selectMemoRecovery(document.querySelector("#memos"), Number(target.dataset.memoRecovery));
        return;
      }
      memoDialog = null;
      if (target.dataset.memoGroup) await memoStore.selectGroup(target.dataset.memoGroup);
      else await memoStore.selectNote(target.dataset.memoNote || target.dataset.memoDraft);
      paintMemosPage();
    });
  });
  document.addEventListener("keydown", (event) => {
    if (!visible() || !memoDialog || !document.querySelector("#memo-dialog")?.contains(event.target)) return;
    if (event.key === "Escape" && !memoDialog.saving) {
      memoDialog = null;
      paintMemosPage();
    }
    if (event.key === "Enter" && event.target.id === "memo-dialog-title") {
      event.preventDefault();
      run(confirmDialog);
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (memoIdentity !== currentIdentity() || !memoStore?.state.canEdit) return;
    if (memoStore.state.operation?.pending || [...memoStore.drafts.values()].some((item) => item.dirty || item.pending)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("online", () => {
    if (visible()) paintMemosPage();
  });
  window.addEventListener("offline", () => {
    if (visible()) paintMemosPage();
  });
}
async function loadMemos() {
  registerEvents();
  const store = ensureStore();
  await store.load();
  await selectVisibleMemo(store);
  const tool = memoTool;
  memoTool = "";
  if (!tool && !store.state.trash && store.state.noteId) store.state.pane = "editor";
  if (tool && visible() && store.state.canEdit) {
    if (tool === "trash") {
      store.state.trash = true;
      store.state.pane = "groups";
      store.state.groupId = "";
      store.state.noteId = "";
    }
    paintMemosPage();
    if (tool === "recovery") openMemoRecovery(document.querySelector("#memos"), store, store.state.draftOwner);
  }
  paintMemosPage();
}

// web/ui/menu.mjs
function syncMenu() {
  const side = $(".sidebar");
  if (side) side.inert = Boolean(window.matchMedia?.("(max-width:760px)").matches && !$(".shell")?.classList.contains("menu-open"));
}
function setMenu(open) {
  const shell = $(".shell");
  if (!shell) return;
  closePopover();
  shell.classList.toggle("menu-open", open);
  $$("[data-action=menu]").forEach((b) => b.setAttribute("aria-expanded", String(open)));
  syncMenu();
  if (open) {
    runtime.menuFocus = document.activeElement;
    $(".sidebar .brand")?.focus();
  } else if (runtime.menuFocus?.isConnected) {
    runtime.menuFocus.focus();
    runtime.menuFocus = null;
  }
}

// web/ui/workbench.mjs
var mediaPages = /* @__PURE__ */ new Set(["dashboard", "articles", "reviews"]);
function navigationLink(item, mobile = false) {
  const selected = item.id === state.page;
  const query = item.id === "settings" ? "&amp;tab=workspace" : "";
  return `<a href="?page=${e(item.id)}${query}" data-nav="${e(item.id)}" title="${e(item.label)}"
class="${mobile ? "mobile-nav-item" : "nav-item"}${selected ? " active" : ""}" aria-label="${e(item.label)}"
${selected ? 'aria-current="page"' : ""}>${icon(item.icon, 18)}<span class="nav-label">${e(item.label)}</span></a>`;
}
function mediaNavigation(mobile = false) {
  const active2 = mediaPages.has(state.page), name = mobile ? "mobile-media-nav" : "media-nav";
  return `<details class="${name}${active2 ? " active" : ""}" ${!mobile && active2 ? "open" : ""}>
<summary title="好多鱼图文" aria-label="好多鱼图文">${icon("articles", 18)}<span class="nav-label">好多鱼图文</span></summary>
<div class="media-subnav">${nav.filter((item) => mediaPages.has(item.id)).map((item) => navigationLink(item)).join("")}</div></details>`;
}
function sidebarNavigation() {
  return mediaNavigation() + nav.filter((item) => !mediaPages.has(item.id) && item.id !== "settings").map((item) => navigationLink(item)).join("");
}
function settingsNavigation() {
  return navigationLink(nav.find((item) => item.id === "settings"));
}
function mobileNavigation() {
  return `<nav class="mobile-nav workbench-navigation" aria-label="切换模块">${mediaNavigation(true)}${nav.filter((item) => !mediaPages.has(item.id)).map((item) => navigationLink(item, true)).join("")}</nav>`;
}
function syncWorkbenchNavigation() {
  const active2 = mediaPages.has(state.page), side = document.querySelector(".media-nav");
  if (side) {
    side.open = active2;
    side.classList.toggle("active", active2);
  }
  const mobile = document.querySelector(".mobile-media-nav");
  if (mobile) {
    mobile.open = false;
    mobile.classList.toggle("active", active2);
  }
}
function closeMediaNavigation(target = null) {
  const menu = document.querySelector(".mobile-media-nav[open]");
  if (menu && (!target || !menu.contains(target))) menu.open = false;
}

// web/pages/workbench-settings.mjs
function renderWorkbenchSettings() {
  return `<section class="card workbench-settings"><h2>工作台设置</h2>
<p class="muted">整理内容与找回未保存的文字。</p><div class="workbench-setting-links">
<button class="btn" data-action="memo-tools" data-tool="trash">${icon("articles")}备忘录回收站</button>
<button class="btn text" data-action="memo-tools" data-tool="recovery">${icon("refresh")}找回未保存内容</button>
</div></section>`;
}

// web/controller.mjs
function mainContent() {
  return `<div id="page-header" class="page-head">${pageHeader()}</div>${state.page === "settings" ? segmented(
    "settings-tab",
    Object.entries(
      state.me?.publicBusiness ? { workspace: settingsTabs.workspace, accounts: settingsTabs.accounts } : settingsTabs
    ),
    state.settingsTab,
    "设置分类",
    "tab",
    "page-tabs"
  ) : ""}${state.page === "dashboard" ? `<div class="article-ledger-overview article-ledger-scope">${segmented(
    "article-overview-mode",
    [["drafts", "存稿台账"], ["published", "已发布数据"], ["reconciliation", "实际对账"]],
    state.articleOverviewMode,
    "总览口径",
    "mode"
  )}</div>` : ""}<div id="page-content"></div>`;
}
function reuseShell() {
  const shell = $(".shell"), main = $("#main");
  if (!main || shell?.dataset.session !== String(runtime.sessionEpoch) || shell.dataset.user !== state.me?.id) return false;
  setMenu(false);
  for (const link of $$(".nav-item,.mobile-nav-item", shell)) {
    const current = link.dataset.nav === state.page;
    link.classList.toggle("active", current);
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  syncWorkbenchNavigation();
  main.innerHTML = mainContent();
  return true;
}
function renderShell() {
  if (state.me?.publicBusiness && state.page === "settings" && !["workspace", "accounts"].includes(state.settingsTab))
    state.settingsTab = "workspace";
  stopPageEntry();
  closePopover({ restoreFocus: false });
  if (reuseShell()) {
    renderPage();
    return;
  }
  $("#app").innerHTML = `<div class="shell" data-session="${runtime.sessionEpoch}" data-user="${e(state.me.id)}"><aside id="site-nav" class="sidebar" aria-label="主要导航"><div class="sidebar-brand"><a href="?page=todos" class="brand" data-nav="todos"><span class="brand-mark">${icon("fish", 27)}</span><span class="brand-title">好多鱼工作台</span></a><button class="icon-button mobile-menu" data-action="menu" aria-label="关闭导航" aria-expanded="false" aria-controls="site-nav">${icon(
    "close"
  )}</button></div><nav class="nav-list">${sidebarNavigation()}</nav><div class="sidebar-bottom">${settingsNavigation()}<div class="user-row"><span class="avatar">${e((state.me.username || "我").slice(0, 1).toUpperCase())}</span><span class="user-name">${e(state.me.username)}</span>${state.me.publicBusiness ? "" : `<button class="logout" data-action="logout" title="退出登录" aria-label="退出登录">${icon("logout", 16)}</button>`}</div></div></aside><div class="workspace"><header class="mobile-bar"><button class="icon-button" data-action="menu" aria-label="打开导航" aria-expanded="false" aria-controls="site-nav">${icon("menu", 20)}</button><span>好多鱼工作台</span></header><main id="main" class="content" tabindex="-1">${mainContent()}</main>${mobileNavigation()}</div></div>`;
  syncMenu();
  renderPage();
}
function navigateLink(page) {
  const same2 = page === state.page && (page !== "settings" || state.settingsTab === "workspace") && (page !== "todos" || !state.todoDate && !state.todoPanel);
  if (same2 && !$("#overlay")?.firstChild && !runtime.activePopover) {
    setMenu(false);
    return;
  }
  navigate(page);
}
function navigate(page, tab) {
  const legacy = Object.hasOwn(legacyPages, page) ? legacyPages[page] : null;
  if (legacy) page = "settings";
  if (!nav.some((n) => n.id === page)) return;
  state.page = page;
  if (page === "todos") {
    state.todoDate = "";
    state.todoPanel = "";
  }
  if (page === "settings") state.settingsTab = legacy || tab || "workspace";
  if (page === "dashboard") state.account = "";
  updateRoute(true);
  closeModal();
  renderShell();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function pageLoading(page) {
  if (page === "todos") return renderTodos();
  if (page === "notes") return renderDailyNotes();
  if (page === "memos") return renderMemos();
  return skeleton();
}
function setPageBody(html, page) {
  if (page === "todos") paintTodos();
  else if (page === "notes") paintDailyNotesPage();
  else if (page === "memos") paintMemosPage();
  else replacePageContent(html, true);
}
function publishedArticleLinks(html) {
  const query = new URLSearchParams({ page: "articles", status: "published", sort: "reads", order: "desc" });
  if (state.topPlatform) query.set("platform", state.topPlatform);
  return html.replace('href="?page=articles&amp;sort=reads&amp;order=desc"', `href="?${e(query.toString())}"`);
}
async function loadArticleOverview(version, context) {
  if (state.articleOverviewMode === "reconciliation") {
    const data2 = await loadReconciliation(context);
    return version === runtime.renderVersion ? renderReconciliation(data2) : "";
  }
  if (state.articleOverviewMode !== "published") {
    state.dashboard = null;
    const summary = await loadArticleLedgerSummary(context);
    return version === runtime.renderVersion ? renderArticleLedgerSummary(summary) : "";
  }
  const data = await api(
    `/overview?period=${state.overviewPeriod}&top_n=${state.topN}&top_platform=${encodeURIComponent(state.topPlatform)}`,
    { context }
  );
  if (version !== runtime.renderVersion) return "";
  state.dashboard = data;
  return publishedArticleLinks(renderDashboardSummary(data));
}
async function renderPage() {
  stopPageEntry();
  closePopover({ restoreFocus: false });
  const version = ++runtime.renderVersion, page = state.page;
  const context = beginPageRequests();
  const counter = $("#page-count");
  if (counter) counter.hidden = true;
  const hasTodos = page === "todos";
  replacePageContent(pageLoading(page));
  if (hasTodos) loadTodos(context);
  $("#page-content")?.setAttribute("aria-busy", "true");
  try {
    let html = "", data;
    switch (page) {
      case "todos":
        html = renderTodos();
        break;
      case "notes":
        await loadDailyNotes();
        break;
      case "memos":
        await loadMemos();
        break;
      case "dashboard":
        html = await loadArticleOverview(version, context);
        break;
      case "articles":
        html = await renderArticles(version, context);
        break;
      case "reviews":
        html = await renderReviews(version, context);
        break;
      case "settings":
        if (state.settingsTab === "workspace") html = renderWorkbenchSettings();
        else if (state.settingsTab === "accounts") html = renderAccounts();
        else if (state.settingsTab === "keys") {
          data = await api("/api-keys", { context });
          html = renderKeys(data);
        } else if (state.settingsTab === "security") html = renderSecurity();
        else {
          const [audit, keys] = await Promise.all([api("/audit", { context }), api("/api-keys", { context })]);
          html = renderAudit(audit, keys);
        }
        break;
    }
    if (version === runtime.renderVersion && state.me) {
      setPageBody(html, page);
      if (counter?.isConnected) {
        const count = page === "articles" ? state.articleMeta?.total : page === "settings" && state.settingsTab === "accounts" ? rowsForAccount(
          state.accounts
        ).length : null;
        counter.hidden = count == null;
        counter.textContent = count == null ? "" : num(count);
      }
    }
  } catch (err) {
    if (!isRequestAbort(err) && !err.staleSession && version === runtime.renderVersion && state.me) setPageBody(`<div class="card error-panel" role="alert"><span class="empty-icon">${icon("info", 23)}</span><h3>本次数据读取失败</h3><p>${e(err.message)}</p><button class="btn" data-action="refresh">${icon("refresh")}重新加载</button></div>`, page);
  } finally {
    if (version === runtime.renderVersion) $("#page-content")?.setAttribute("aria-busy", "false");
  }
}
async function reloadFilteredPage(focus = "[data-action=article-filter]") {
  clearTimeout(runtime.searchTimer);
  state.listPage = 1;
  updateRoute();
  const version = runtime.renderVersion + 1;
  await renderPage();
  if (version === runtime.renderVersion && !$("#overlay").firstChild && document.activeElement === document.body) $(focus)?.focus();
}
function applyArticleFilters(form) {
  const draft = articleDraft(form);
  state.filters = draft.filters;
  state.columns = draft.columns;
  state.account = draft.account;
  closePopover();
  reloadFilteredPage();
}
async function init({ freshLogin = false } = {}) {
  resetSessionIndexes();
  const initEpoch = runtime.sessionEpoch;
  try {
    try {
      const views = JSON.parse(storage.get("haoduoyu.views") || "[]");
      state.savedViews = Array.isArray(views) ? views.filter((v) => typeof v?.id === "string" && typeof v.name === "string" && v.filters && typeof v.filters === "object" && Array.isArray(v.columns)).slice(-20) : [];
    } catch {
      state.savedViews = [];
    }
    const me = await api("/auth/me");
    if (initEpoch !== runtime.sessionEpoch) return;
    state.me = me;
    const accounts = await api("/accounts");
    if (initEpoch !== runtime.sessionEpoch) return;
    state.accounts = accounts.sort((a, b) => ["toutiao", "zhihu", "wechat", "other"].indexOf(a.platform) - [
      "toutiao",
      "zhihu",
      "wechat",
      "other"
    ].indexOf(b.platform));
    readRoute();
    if (freshLogin) {
      state.trendOpen = false;
      state.attentionExpanded = false;
    }
    updateRoute();
    renderShell();
  } catch (err) {
    if (initEpoch !== runtime.sessionEpoch || err.staleSession || isRequestAbort(err)) return;
    if (err.status !== 401) {
      renderLogin();
      toast(err.message, true);
    } else renderLogin();
  }
}

// web/pages/article-verification.mjs
var copy = (value) => structuredClone(value);
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validArticle(value, id) {
  return value?.id === id && Number.isSafeInteger(value.version) && value.version > 0 && (value.verify_items === null || Array.isArray(value.verify_items));
}
function verificationIntent(index, done) {
  return `第 ${index + 1} 项设为${done ? "已处理" : "待处理"}`;
}
function createArticleVerificationStore({ article, load, put, uuid = () => crypto.randomUUID(), onChange = () => {
}, isCurrent = () => true }) {
  let current = copy(article), phase = "idle", message = "", pending = null, busy = false, retryReady = false;
  const snapshot = () => ({ article: copy(current), phase, message, busy, retryReady });
  const notify = () => onChange(snapshot());
  function received(value) {
    if (!validArticle(value, current.id)) throw new Error("详情读取不完整，请重新打开核对。");
    current = copy(value);
  }
  async function reconcile(conflict = false) {
    let remote;
    try {
      remote = await load(current.id);
    } catch {
      phase = "unknown";
      retryReady = false;
      message = "保存结果尚未确认，请重新核对；不会自动重发。";
      return false;
    }
    if (!validArticle(remote, current.id)) {
      phase = "unknown";
      retryReady = false;
      message = "详情读取不完整，保存结果尚未确认。";
      return false;
    }
    if (pending && remote.version > pending.body.version && same(remote.verify_items, pending.body.verify_items)) {
      received(remote);
      pending = null;
      phase = "saved";
      retryReady = false;
      message = "已核对服务器记录，当前选择已保存。";
      return false;
    }
    if (conflict || pending && remote.version !== pending.body.version) {
      const intent = pending ? verificationIntent(pending.index, pending.done) : "本次选择";
      received(remote);
      pending = null;
      phase = "conflict";
      retryReady = false;
      message = `${intent}未保存；已显示最新版本，请核对后重新选择。`;
      return false;
    }
    received(remote);
    phase = pending ? "unknown" : "idle";
    retryReady = !!pending && same(remote.verify_items, pending.before);
    message = pending ? retryReady ? "原保存尚未确认；已读取当前版本，可显式重试原保存。" : "记录状态尚未确认，请重新核对；不会重发保存。" : "已重新读取最新记录。";
    return retryReady;
  }
  async function send() {
    if (!isCurrent()) return;
    phase = "saving";
    message = "正在保存…";
    retryReady = false;
    notify();
    let response;
    try {
      response = await put(current.id, copy(pending.body), pending.key);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 409) {
        pending = null;
        phase = "error";
        message = error.message || "保存被拒绝，请核对后重试。";
      } else await reconcile(error.status === 409);
      return;
    }
    if (!validArticle(response, current.id) || response.version <= pending.body.version || !same(response.verify_items, pending.body.verify_items)) {
      await reconcile();
      return;
    }
    received({ ...current, ...response });
    pending = null;
    phase = "saved";
    message = "已保存。";
    try {
      const remote = await load(current.id);
      if (validArticle(remote, current.id) && remote.version >= current.version) {
        const matches = same(remote.verify_items, current.verify_items);
        received(remote);
        if (!matches) {
          phase = "conflict";
          message = "保存后记录又有更新，已显示最新内容。";
        }
      }
    } catch {
      message = "已保存，最新详情暂未读取。";
    }
  }
  async function save(index, done) {
    if (busy || pending || !Number.isSafeInteger(index) || typeof done !== "boolean" || !Array.isArray(current.verify_items) || !current.verify_items[index] || typeof current.verify_items[index] !== "object") return;
    if (current.verify_items[index].done === done) return;
    const items = copy(current.verify_items);
    items[index].done = done;
    pending = { index, done, before: copy(current.verify_items), body: { version: current.version, verify_items: items }, key: uuid() };
    busy = true;
    try {
      await send();
    } finally {
      busy = false;
      notify();
    }
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    notify();
    try {
      await reconcile();
    } finally {
      busy = false;
      notify();
    }
  }
  async function retry() {
    if (busy || !pending) return;
    busy = true;
    notify();
    try {
      if (await reconcile()) await send();
    } finally {
      busy = false;
      notify();
    }
  }
  return { snapshot, save, refresh, retry };
}
var binding = null;
function bindArticleVerification(article, { isCurrent, render }) {
  const epoch = runtime.sessionEpoch, value = { articleId: article.id, epoch, isCurrent, render, store: null };
  value.store = createArticleVerificationStore({
    article,
    isCurrent: () => binding === value && epoch === runtime.sessionEpoch && isCurrent(),
    load: (id) => api(`/articles/${encodeURIComponent(id)}`),
    put: (id, body, key) => api(`/articles/${encodeURIComponent(id)}`, {
      method: "PUT",
      body,
      headers: { "Idempotency-Key": key }
    }),
    onChange: (state2) => {
      if (binding === value && epoch === runtime.sessionEpoch && isCurrent()) render(state2);
    }
  });
  binding = value;
  return value.store.snapshot();
}
function activeBinding() {
  return binding && binding.epoch === runtime.sessionEpoch && binding.isCurrent() ? binding : null;
}
async function handleArticleVerificationChange(target) {
  const active2 = activeBinding();
  if (!active2 || target.dataset.articleId !== active2.articleId) return;
  const index = Number(target.dataset.articleVerifyIndex);
  const value = target.type === "checkbox" ? target.checked : target.value === "true" ? true : target.value === "false" ? false : null;
  if (typeof value === "boolean") {
    try {
      await active2.store.save(index, value);
    } catch (error) {
      verificationFeedback(error);
    }
  }
}
function verificationFeedback(error) {
  if (!activeBinding()) return;
  const status = document.querySelector("#overlay [data-article-verify-status]");
  if (status) status.textContent = error.message || "详情暂时无法刷新，请重新打开核对。";
}
async function refreshArticleVerification() {
  try {
    await activeBinding()?.store.refresh();
  } catch (error) {
    verificationFeedback(error);
  }
}
async function retryArticleVerification() {
  try {
    await activeBinding()?.store.retry();
  } catch (error) {
    verificationFeedback(error);
  }
}

// web/ui/todo-gestures.mjs
function cancelTodoPress(gesture) {
  if (gesture.press) clearTimeout(gesture.press.timer);
  gesture.press = null;
}
function todoPressRow(target) {
  const row = target?.closest?.(".daily-todo-row");
  if (!row || target.closest("button,a,select,textarea,input:not([type=checkbox])")) return null;
  if (row.querySelector('input[aria-disabled="true"]')) return null;
  return row;
}
function todoPressEligible(gesture, press, x = press.x, y = press.y) {
  if (!press.row.isConnected || document.visibilityState === "hidden" || !press.row.getClientRects().length) return false;
  const rect = press.row.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  return gesture.isEligible({ id: press.id, date: press.date, anchor: press.row });
}
function openTodoPress(gesture, press) {
  if (gesture.press !== press) return;
  if (gesture.pointers.size !== 1 || !todoPressEligible(gesture, press)) {
    cancelTodoPress(gesture);
    return;
  }
  gesture.press = null;
  gesture.blocked = { pointerId: press.pointerId, row: press.row, x: press.x, y: press.y, until: Infinity };
  gesture.onOpen({ id: press.id, date: press.date, anchor: press.row });
}
function startTodoPress(gesture, event) {
  gesture.blocked = null;
  cancelTodoPress(gesture);
  if (!["touch", "pen"].includes(event.pointerType)) return;
  gesture.pointers.add(event.pointerId);
  if (gesture.pointers.size !== 1 || event.isPrimary === false || event.button !== 0) return;
  const row = todoPressRow(event.target);
  if (!row) return;
  const press = {
    row,
    id: row.dataset.id,
    date: row.dataset.date || row.querySelector("[data-date]")?.dataset.date,
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    timer: null
  };
  if (!press.id || !press.date || !todoPressEligible(gesture, press)) return;
  gesture.press = press;
  press.timer = setTimeout(() => openTodoPress(gesture, press), 650);
}
function moveTodoPress(gesture, event) {
  const press = gesture.press;
  if (!press || press.pointerId !== event.pointerId) return;
  const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10;
  if (moved || !todoPressEligible(gesture, press, event.clientX, event.clientY)) cancelTodoPress(gesture);
}
function endTodoPress(gesture, event) {
  gesture.pointers.delete(event.pointerId);
  if (gesture.press?.pointerId === event.pointerId) cancelTodoPress(gesture);
  if (gesture.blocked?.pointerId === event.pointerId) gesture.blocked.until = Date.now() + 800;
}
function blockTodoPressClick(gesture, event) {
  const blocked = gesture.blocked;
  if (!blocked || Date.now() > blocked.until || !event.pointerType && event.detail === 0) return;
  const samePointer = event.pointerId === blocked.pointerId;
  const samePosition = Math.hypot(event.clientX - blocked.x, event.clientY - blocked.y) <= 25;
  if (!samePointer && !samePosition) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
function blockTodoPressMenu(gesture, event) {
  if (event.pointerType === "mouse") return;
  const row = gesture.press?.row || (gesture.blocked && Date.now() <= gesture.blocked.until ? gesture.blocked.row : null);
  if (row?.contains(event.target)) event.preventDefault();
}
function resetTodoPress(gesture) {
  cancelTodoPress(gesture);
  gesture.pointers.clear();
  if (gesture.blocked) gesture.blocked.until = Date.now() + 800;
}
function registerTodoGestures(onOpen, isEligible = () => true) {
  const gesture = { onOpen, isEligible, press: null, blocked: null, pointers: /* @__PURE__ */ new Set() }, listeners = [];
  const listen = (target, name, handler, options2 = true) => {
    target.addEventListener(name, handler, options2);
    listeners.push(() => target.removeEventListener(name, handler, options2));
  };
  listen(document, "pointerdown", (event) => startTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "pointermove", (event) => moveTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "pointerup", (event) => endTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "pointercancel", (event) => endTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "click", (event) => blockTodoPressClick(gesture, event));
  listen(document, "contextmenu", (event) => blockTodoPressMenu(gesture, event));
  listen(document, "scroll", () => cancelTodoPress(gesture), { capture: true, passive: true });
  listen(document, "visibilitychange", () => resetTodoPress(gesture));
  listen(window, "blur", () => resetTodoPress(gesture));
  listen(window, "popstate", () => cancelTodoPress(gesture));
  return () => {
    resetTodoPress(gesture);
    for (const remove of listeners) remove();
  };
}

// web/pages/detail.mjs
var articleStatus = { drafting: "撰写中", illustrated: "已配图", draft_saved: "草稿已存", published: "已发布", failed: "失败" };
var articleWriter = { dedao: "得到大脑", gemini_web: "Gemini", human: "本人", other: "其他" };
var warningLabels2 = {
  TOUTIAO_TITLE_TOO_LONG: "头条标题超过 30 字",
  CHAR_COUNT_OUT_OF_RANGE: "字数不在 2000–2300",
  SUBHEADING_COUNT_OUT_OF_RANGE: "小标题不在 5–7",
  ENTERTAINMENT_IMAGES_TOO_FEW: "文娱图片少于 25 张",
  DRAFT_CREDENTIAL_MISSING: "草稿凭证未确认"
};
var isPublished2 = (a) => !Object.hasOwn(a, "status") || a.status === "published";
var observed = (value) => value === null || value === void 0 ? "未取得" : String(value);
function safeDetailURL(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}
function jsonText(value) {
  return JSON.stringify(value, null, 2) ?? "未取得";
}
function readonlyJSON(label3, value) {
  return `<details class="detail-section article-ledger-json"><summary>${e(label3)}</summary><pre>${e(
    value === null || value === void 0 ? "未取得" : jsonText(value)
  )}</pre></details>`;
}
function draftReference(a) {
  const ref = a.draft_ref || {}, ids = [["pgc_id", "头条草稿"], ["appmsgid", "公众号草稿"]].filter(([key]) => typeof ref[key] === "string" && ref[key].trim());
  return `<section class="detail-section"><h3>草稿凭证</h3>${ids.map(([key, label3]) => `<p>${e(label3)} · <code>${e(ref[key])}</code></p>`).join("")}${safeDetailURL(ref.editor_url) ? `<p><a href="${e(ref.editor_url)}" target="_blank" rel="noopener noreferrer">草稿编辑链接 ↗</a></p>` : ""}${!ids.length && !safeDetailURL(ref.editor_url) ? '<p class="cell-sub">未确认</p>' : ""}<p class="cell-sub">链接只校验格式，未验证远端权限或草稿是否存在。</p></section>`;
}
function itemText(item) {
  const label3 = ["label", "description", "text", "message", "title", "key"].find((name) => typeof item[name] === "string" && item[name]);
  return label3 ? item[label3] : jsonText(item);
}
function verificationControl(a, item, index, disabled) {
  const attrs = `data-article-id="${e(a.id)}" data-article-verify-index="${index}" ${disabled ? "disabled" : ""}`;
  if (typeof item.done === "boolean") return `<label class="check-option"><input type="checkbox" ${attrs} ${item.done ? "checked" : ""}><span>${e(itemText(item))}</span><small>${item.done ? "已处理" : "待处理"}</small></label>`;
  return `<label class="article-verify-unknown"><span>${e(itemText(item))}</span><span class="badge">未确认</span><select class="input" aria-label="第 ${index + 1} 项处理状态" ${attrs}><option value="" selected>未确认，请明确选择</option><option value="false">标记待处理</option><option value="true">标记已处理</option></select></label>`;
}
function verificationSection(a, view) {
  const items = Array.isArray(a.verify_items) ? a.verify_items : null;
  const disabled = view.busy || view.phase === "unknown";
  const stateLabel = { pending: "有待处理项", complete: "已确认处理状态", unknown: "状态未确认" }[a.verify_state] || "状态未确认";
  return `<section class="detail-section article-verification"><h3>待核清单 <span class="badge">${e(stateLabel)}</span></h3>${items ? items.length ? `<ul class="article-verification-items">${items.map((item, index) => `<li>${verificationControl(
    a,
    item,
    index,
    disabled
  )}<details><summary>原始信息</summary><pre>${e(jsonText(item))}</pre></details></li>`).join("")}</ul>` : '<p class="cell-sub">清单为空，没有已记录的待核项。</p>' : '<p class="cell-sub">未取得清单，不能判断是否已处理。</p>'}<p class="article-verify-status" data-article-verify-status role="status" aria-live="polite">${e(view.message || "修改后按当前版本保存。")}</p><div class="head-actions">${view.phase === "unknown" ? `<button class="btn small" data-action="article-verify-refresh" ${view.busy ? "disabled" : ""}>重新核对</button>${view.retryReady ? `<button class="btn small" data-action="article-verify-retry" ${view.busy ? "disabled" : ""}>重试原保存</button>` : ""}` : ""}</div></section>`;
}
function articlePipelineFields(a) {
  const topic = a.slot === "gzh" ? "保险" : ["zh1", "zh2", "zh3", "tt1", "tt2", "tt3"].includes(a.slot) ? "文娱" : "未标注";
  const seconds = a.started_at && a.timings?.finished_at ? (Date.parse(a.timings.finished_at) - Date.parse(a.started_at)) / 1e3 : null;
  return [
    ["状态", articleStatus[a.status] || "未确认"],
    ["槽位", a.slot || "未标注"],
    ["题材", topic],
    ["写作者", articleWriter[a.writer] || "未标注"],
    ["配图者", a.illustrator || "未标注"],
    ["字数", observed(a.char_count)],
    ["小标题", observed(a.subheading_count)],
    ["图数", observed(a.image_count)],
    ["流水线开始", displayTime(a.started_at)],
    ["流水线结束", displayTime(a.timings?.finished_at)],
    ["流水线总耗时", Number.isFinite(seconds) && seconds >= 0 ? duration(seconds) : "未取得"]
  ];
}
function renderArticleDetailBody(a, view = { phase: "idle", busy: false, retryReady: false, message: "" }) {
  const info = [
    ["生产方式", modeLabels[a.production_mode] || "未记录"],
    ["原始发布时间", isPublished2(a) ? displayTime(a.published_at) : "未发布"],
    ["录入者", a.recorded_by?.label || "未记录"],
    ["修改者", a.last_modified_by?.label || "未记录"],
    ["录入时间", displayTime(a.created_at)],
    ["修改时间", displayTime(a.updated_at)]
  ];
  return `<div class="article-ledger-detail" data-article-detail="${e(a.id)}"><div class="head-actions">${isPublished2(a) && safeDetailURL(a.url) ? `<a class="btn small" href="${e(a.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>` : ""}<button class="btn small" data-action="edit-article" data-id="${e(a.id)}">编辑</button>${isPublished2(a) ? `<button class="btn small primary" data-action="review-article" data-id="${e(a.id)}">+ 补充数据</button>` : ""}</div><dl class="detail-grid">${articlePipelineFields(a).map(([label3, value]) => `<div><dt>${e(label3)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl>${Array.isArray(a.warnings) && a.warnings.length ? `<p class="info-line warn">${a.warnings.map((code) => e(warningLabels2[code] || code)).join(" · ")}</p>` : ""}${draftReference(a)}${readonlyJSON("样本来源", a.sample)}${readonlyJSON("阶段时间线", a.timings)}${readonlyJSON("阻塞记录", a.blockers)}${verificationSection(a, view)}${renderArticleAnalytics(a)}<details class="detail-section"><summary>记录信息</summary><dl class="detail-grid">${info.map(([label3, value]) => `<div><dt>${e(label3)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl></details>${[["summary", "概况"], ["notes", "备注"]].filter(([key]) => typeof a[key] === "string" && a[key].trim()).map(([key, label3]) => `<section class="detail-section"><h3>${e(label3)}</h3><p>${e(
    a[key]
  )}</p></section>`).join("")}</div>`;
}
function renderArticleAnalytics(a) {
  if (!isPublished2(a)) return '<section class="detail-section article-unpublished"><h3>阅读与复盘</h3><strong>未发布</strong><p class="cell-sub">发布后再记录阅读指标和复盘节点。</p></section>';
  const timeline = a.timeline || [], nodes = a.nodes || [];
  return `${metricSummary(a)}<p class="cell-sub">截至 ${a.latest_metrics == null ? "未采集" : e(displayTime(a.latest_as_of))} · 采集于 ${a.latest_metrics == null ? "未采集" : e(displayTime(a.latest_collected_at))}</p><section class="detail-section"><h3>观察节点</h3><ol class="snapshot-nodes">${nodes.map((n) => {
    const unknown = n.kind !== "latest" && a.date_status === "unverified" && !n.snapshot, status = unknown ? "unknown" : n.status, label3 = unknown ? "日期待核实" : { recorded: "已记录", before_due: "记录早于节点", not_due: "未到期", not_collected: "未采集" }[status] || "状态未知";
    return `<li class="node ${e(status)}"><strong>${e(kindLabels[n.kind] || n.kind)}</strong><span>${e(label3)}</span><small>${e(displayTime(
      n.snapshot?.as_of || n.due_at
    ))}</small></li>`;
  }).join("")}</ol><h3>快照时间线 ${detailInfo(
    "按截至时间排序；相邻累计快照差值不等同每日新增。节点类型不代表先后。",
    "时间线口径",
    "timeline"
  )}</h3>${timeline.length < 2 ? `<p class="insufficient">${timeline.length ? "只有一期数据，暂不显示增长。" : "尚未采集快照。"}</p>` : ""}<ol class="snapshot-timeline">${timeline.map((r) => `<li>${renderSnapshot(r)}${r.changes ? `<div class="snapshot-changes">${[
    "reads",
    "likes",
    "comments",
    "approvals"
  ].filter((key) => metricData(r)[key] != null).map((key) => `<span>${e(metrics[key])}${comparisonHTML(
    r.changes[key]
  )}${detailInfo(r.changes[key]?.reason || "指标未取得", metrics[key] + "变化说明", r.id + "-" + key)}</span>`).join(
    ""
  )}</div>` : ""}</li>`).join("")}</ol></section>`;
}
async function articleDetail(id) {
  const context = beginModalRequests();
  const ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion, a = await modalRequest(
    `/articles/${encodeURIComponent(id)}`,
    ticket,
    version,
    context
  );
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  openModal(a.title, renderArticleDetailBody(a), { drawer: true, context: `<div class="account-title">${platformLogo(a.platform)}${e(
    a.account_name || accountName(a.account_id)
  )} · ${e(articleStatus[a.status] || "未确认")}</div>` });
  const modal = runtime.modalRequestVersion, epoch = runtime.sessionEpoch;
  const isCurrent = () => modal === runtime.modalRequestVersion && version === runtime.renderVersion && epoch === runtime.sessionEpoch && document.querySelector("#overlay .article-ledger-detail")?.dataset.articleDetail === a.id;
  bindArticleVerification(a, { isCurrent, render(view) {
    if (!isCurrent()) return;
    const focused = document.activeElement?.dataset?.articleVerifyIndex;
    document.querySelector("#overlay .article-ledger-detail").outerHTML = renderArticleDetailBody(view.article, view);
    document.querySelector("#modal-title").textContent = view.article.title;
    if (focused !== void 0 && !view.busy) Array.from(document.querySelectorAll("#overlay [data-article-verify-index]")).find((node) => node.dataset.articleVerifyIndex === focused)?.focus();
  } });
}

// web/actions.mjs
function actionMissingList({ target }) {
  state.filters = { ...defaultFilters(), status: "published", data_status: target.dataset.status || "incomplete" };
  state.account = "";
  state.listPage = 1;
  navigate("articles");
  return;
}
function actionListPrev({}) {
  state.listPage = Math.max(1, state.listPage - 1);
  updateRoute();
  renderPage();
  return;
}
function actionListNext({}) {
  if (state.articleMeta?.has_more) {
    state.listPage++;
    updateRoute();
    renderPage();
  }
  return;
}
function actionSortColumn({ target }) {
  const key = target.dataset.sort;
  state.filters.order = state.filters.sort === key && state.filters.order === "desc" ? "asc" : "desc";
  state.filters.sort = key;
  reloadFilteredPage('[data-sort="' + key + '"]');
  return;
}
function actionSaveView({ id }) {
  openModal("保存常用视图", `<form id="save-view-form">${field("name", '视图名称 <span class="required">*</span>', "text", "", 'maxlength="80" required')}${formEnd("保存视图")}</form>`);
  return;
}
function actionCloseModal({}) {
  closeModal();
  return;
}
function actionMenu({}) {
  setMenu(!$(".shell").classList.contains("menu-open"));
  return;
}
function actionSettingsTab({ target, action }) {
  if (Object.hasOwn(settingsTabs, target.dataset.tab)) {
    navigate("settings", target.dataset.tab);
    $("[data-action=settings-tab][data-tab=" + state.settingsTab + "]")?.focus();
  }
  return;
}
async function actionArticleFilter({ action }) {
  cancelModalRequests();
  runtime.modalRequestVersion++;
  if (runtime.searchTimer) {
    clearTimeout(runtime.searchTimer);
    runtime.searchTimer = null;
    const version = runtime.renderVersion + 1;
    await renderPage();
    if (version !== runtime.renderVersion || state.page !== "articles" || $("#overlay").firstChild) return;
  }
  const trigger = $("[data-action=article-filter]");
  if (trigger) popover(trigger, articleFilterPanel(), { label: "文章筛选" });
  return;
}
function actionResetDraft({}) {
  $("#filter-panel").outerHTML = articleFilterPanel({ filters: defaultFilters(), columns: new Set(defaultColumns), account: "" });
  $("#filter-panel select")?.focus();
  return;
}
function actionDraftSort({ target }) {
  const draft = articleDraft($("#filter-panel"));
  draft.filters.order = draft.filters.sort === target.dataset.sort && draft.filters.order === "desc" ? "asc" : "desc";
  draft.filters.sort = target.dataset.sort;
  $("#filter-panel").outerHTML = articleFilterPanel(draft);
  $('#filter-panel [data-sort="' + target.dataset.sort + '"]')?.focus();
  return;
}
function actionArticlePlatform({ target, action }) {
  state.filters.platform = target.dataset.platform;
  reloadFilteredPage("[data-action=" + action + "][aria-pressed=true]");
  return;
}
function actionRemoveFilter({ target }) {
  if (target.dataset.filter === "account") state.account = "";
  else if (Object.hasOwn(defaultFilters(), target.dataset.filter)) state.filters[target.dataset.filter] = defaultFilters()[target.dataset.filter];
  reloadFilteredPage();
  return;
}
function actionArticleMenu({ target, id }) {
  const article = state.articles.find((a) => a.id === id);
  if (article) popover(target, articleMenu(article), { menu: true, label: "文章操作" });
  return;
}
function actionDetailInfo({ target }) {
  popover(target, `<p>${e(target.dataset.reason)}</p>`, { label: target.getAttribute("aria-label") });
  return;
}
function actionDashboardInfo({ target, id }) {
  popover(target, dashboardInfoBody(target.dataset.kind, id), { label: target.getAttribute("aria-label") });
  return;
}
async function actionTopPlatform({ target, action }) {
  state.topPlatform = target.dataset.platform;
  updateRoute();
  await renderPage();
  if (!$("#overlay").firstChild && document.activeElement === document.body) $("[data-action=top-platform][aria-pressed=true]")?.focus();
  return;
}
function actionAllTop({ target, event, action }) {
  event.preventDefault();
  state.filters = {
    ...defaultFilters(),
    status: "published",
    platform: action === "all-top" ? state.topPlatform : target.dataset.platform,
    ...action === "all-top" ? { sort: "reads", order: "desc" } : {}
  };
  state.account = "";
  state.listPage = 1;
  navigate("articles");
  return;
}
async function actionNewDaily({}) {
  state.reviewTab = "daily";
  await reviewModal();
  return;
}
function actionTrendTab({ target, action }) {
  if (["metrics", "publication"].includes(target.dataset.tab)) {
    state.trendTab = target.dataset.tab;
    state.trendOpen = true;
    replacePageContent(publishedArticleLinks(renderDashboard(state.dashboard)));
    $("[data-action=trend-tab][data-tab=" + state.trendTab + "]")?.focus();
  }
  return;
}
function actionPageMenu({ target, action }) {
  popover(target, '<button data-action="refresh" role="menuitem">刷新数据</button><a href="/api/v1/export" download role="menuitem">导出发布记录 CSV</a><a href="/api-docs" target="_blank" rel="noopener noreferrer" role="menuitem">接入文档 ↗</a>', { menu: true, label: "页面操作" });
  return;
}
function actionKeyHelp({ target }) {
  popover(target, "<p>供自动化工具按账号范围读取或录入数据；凭据创建后仅显示一次。</p>", { label: "AI 凭据用途" });
  return;
}
async function actionLogout({}) {
  await api("/auth/logout", { method: "POST" });
  state.me = null;
  renderLogin();
  return;
}
function actionRefresh({}) {
  clearArticleIndexes();
  renderPage();
  return;
}
function actionOverviewPeriod({ target }) {
  if (["yesterday", "7d", "30d"].includes(target.dataset.period) && state.overviewPeriod !== target.dataset.period) {
    state.overviewPeriod = target.dataset.period;
    updateRoute();
    renderShell();
  }
  return;
}
function actionArticleOverviewMode({ target }) {
  const mode = target.dataset.mode;
  if (!["drafts", "published", "reconciliation"].includes(mode) || state.articleOverviewMode === mode) return;
  state.articleOverviewMode = mode;
  updateRoute(true);
  renderShell();
  $("[data-action=article-overview-mode][aria-pressed=true]")?.focus();
}
function actionShowDue({}) {
  state.reviewTab = "pending";
  navigate("reviews");
  return;
}
function actionToggleAttention({}) {
  state.attentionExpanded = !state.attentionExpanded;
  if (state.dashboard) {
    replacePageContent(publishedArticleLinks(renderDashboard(state.dashboard)));
  }
  return;
}
async function actionNewArticle({}) {
  await articleModal();
  return;
}
async function actionEditArticle({ id }) {
  await articleModal(id);
  return;
}
async function actionArticleDetail({ id }) {
  await articleDetail(id);
  return;
}
async function actionReviewArticle({ target, id }) {
  await reviewModal(id, target.dataset.kind || "latest");
  return;
}
async function actionNewReview({}) {
  await reviewModal();
  return;
}
async function actionReviewTab({ target, action }) {
  if (["pending", "observations", "daily"].includes(target.dataset.tab)) {
    state.reviewTab = target.dataset.tab;
    updateRoute(true);
    const version = runtime.renderVersion + 1;
    await renderPage();
    if (version === runtime.renderVersion && !$("#overlay").firstChild && document.activeElement === document.body) $(
      "[data-action=review-tab][data-tab=" + state.reviewTab + "]"
    )?.focus();
  }
  return;
}
function actionNewAccount({}) {
  accountModal();
  return;
}
function actionEditAccount({ id }) {
  accountModal(id);
  return;
}
function actionNewKey({}) {
  keyModal();
  return;
}
function actionSelectAccount({ id }) {
  state.filters = { ...defaultFilters(), status: "published" };
  state.account = id;
  state.listPage = 1;
  navigate("articles");
  return;
}
function actionRecordDetail({ id }) {
  const row = state.reviewRecords.find((r) => r.id === id);
  if (row) openModal("数据记录详情", `${renderSnapshot(row)}<p class="cell-sub record-context">${e(row.date ? "统计日期：" + row.date : "数据截至：" + time(row.as_of))}${row.updated_at ? " · 更新于 " + e(time(row.updated_at)) : ""}</p>`);
  return;
}
function actionRevokeKey({ target, id }) {
  openModal("撤销 AI 凭证", `<p class="revoke-context">撤销「${e(target.dataset.name)}」后凭证立即失效，已有数据保留。</p><form id="revoke-form" data-id="${e(
    id
  )}">${formEnd("确认撤销")}</form>`);
  return;
}
async function actionCopyToken({}) {
  const token = $("#created-token").textContent;
  try {
    await navigator.clipboard.writeText(token);
    toast("凭证已复制，请在安全位置保存。");
  } catch {
    const range = document.createRange();
    range.selectNodeContents($("#created-token"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    toast("已选中凭证，请手动复制。");
  }
  return;
}
function actionResetFilters({}) {
  state.filters = defaultFilters();
  state.account = "";
  state.listPage = 1;
  updateRoute();
  renderShell();
  return;
}
var actions = {
  "article-overview-mode": actionArticleOverviewMode,
  "article-verify-retry": retryArticleVerification,
  "article-verify-refresh": refreshArticleVerification,
  "todo-menu": openTodoMenu,
  "todo-delete": ({ target }) => deleteTodo(target.dataset),
  "todo-restore": ({ target }) => restoreTodo(target.dataset),
  "todo-make-template": ({ target }) => changeTodoTemplate(target.dataset),
  "todo-remove-template": ({ target }) => changeTodoTemplate(target.dataset, true),
  "todo-template-use": ({ id }) => useTodoTemplate(id),
  "todo-template-edit": ({ id }) => editTodoTemplate(id),
  "todo-template-delete": ({ id }) => writeTodoTemplate(id, void 0, true),
  "memo-tools": ({ target }) => {
    requestMemoTool(target.dataset.tool);
    navigate("memos");
  },
  "todo-panel": ({ target }) => setTodoPanel(target.dataset.panel),
  "todo-retry-add": retryTodoCreate,
  "todo-panel-close": () => setTodoPanel(""),
  "todo-template-cancel": cancelTodoTemplateEdit,
  "todo-calendar-prev": () => moveTodoMonth(-1),
  "todo-calendar-next": () => moveTodoMonth(1),
  "todo-calendar-date": ({ target }) => selectTodoDate(target.dataset.date),
  "todo-prev": () => moveTodoDate(-1),
  "todo-next": () => moveTodoDate(1),
  "todo-today": () => selectTodoDate(bjtDate()),
  "todo-reload": refreshTodos,
  "missing-list": actionMissingList,
  "list-prev": actionListPrev,
  "list-next": actionListNext,
  "sort-column": actionSortColumn,
  "save-view": actionSaveView,
  "close-modal": actionCloseModal,
  "menu": actionMenu,
  "settings-tab": actionSettingsTab,
  "article-filter": actionArticleFilter,
  "reset-draft": actionResetDraft,
  "draft-sort": actionDraftSort,
  "article-platform": actionArticlePlatform,
  "review-platform": actionArticlePlatform,
  "remove-filter": actionRemoveFilter,
  "article-menu": actionArticleMenu,
  "detail-info": actionDetailInfo,
  "dashboard-info": actionDashboardInfo,
  "top-platform": actionTopPlatform,
  "all-top": actionAllTop,
  "select-platform": actionAllTop,
  "new-daily": actionNewDaily,
  "trend-tab": actionTrendTab,
  "page-menu": actionPageMenu,
  "key-help": actionKeyHelp,
  "logout": actionLogout,
  "refresh": actionRefresh,
  "overview-period": actionOverviewPeriod,
  "show-due": actionShowDue,
  "toggle-attention": actionToggleAttention,
  "new-article": actionNewArticle,
  "edit-article": actionEditArticle,
  "article-detail": actionArticleDetail,
  "review-article": actionReviewArticle,
  "new-review": actionNewReview,
  "review-tab": actionReviewTab,
  "new-account": actionNewAccount,
  "edit-account": actionEditAccount,
  "new-key": actionNewKey,
  "select-account": actionSelectAccount,
  "record-detail": actionRecordDetail,
  "revoke-key": actionRevokeKey,
  "copy-token": actionCopyToken,
  "reset-filters": actionResetFilters
};

// web/pages/article-form.mjs
var textValue = (value) => typeof value === "string" ? value.trim() : "";
var objectValue = (value) => value && typeof value === "object" && !Array.isArray(value);
function articleFormCurrent(form, cache = runtime.articleFormRecord) {
  return !!cache && cache === runtime.articleFormRecord && cache.sessionEpoch === runtime.sessionEpoch && cache.ticket === runtime.modalRequestVersion && form.isConnected && (cache.record?.id || "") === (form.dataset.id || "") && String(cache.record?.version || "") === (form.dataset.version || "");
}
function articleFormRecord(form) {
  const cache = runtime.articleFormRecord, id = form.dataset.id || "";
  if (!articleFormCurrent(form, cache) || !objectValue(cache.record) || id && (!Number.isSafeInteger(cache.record.version) || cache.record.version < 1)) {
    throw new Error("表单记录已失效，请关闭后重新打开再保存。");
  }
  return cache;
}
function nullableNumber(value, label3, minimum = 0) {
  const raw = textValue(value);
  if (!raw) return null;
  const number = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`${label3}请填写${minimum ? "正" : "非负"}整数，未知时留空。`);
  }
  return number;
}
function choice(value, choices, label3, fallback = null) {
  const raw = textValue(value);
  if (!raw) return fallback;
  if (!Object.hasOwn(choices, raw)) throw new Error(`${label3}无效，请重新选择。`);
  return raw;
}
function articleTime(value, label3, original) {
  const raw = textValue(value);
  if (!raw) return null;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(raw);
  if (!parts) throw new Error(`${label3}请填写有效的北京时间。`);
  const canonical = `${parts[1]}T${parts[2]}:${parts[3] || "00"}.${(parts[4] || "").padEnd(3, "0")}`;
  const stamp = /* @__PURE__ */ new Date(`${canonical}+08:00`);
  if (!Number.isFinite(stamp.getTime()) || new Date(stamp.getTime() + 8 * 36e5).toISOString().slice(0, 23) !== canonical) {
    throw new Error(`${label3}请填写真实日期和时间。`);
  }
  if (original && raw === localDateTime(original)) return new Date(original).toISOString();
  return stamp.toISOString();
}
function mergedObject(original, fields) {
  if (original != null && !objectValue(original)) throw new Error("原记录的 JSON 字段无法安全编辑，请重新打开核对。");
  const result = original == null ? {} : structuredClone(original);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null || Object.hasOwn(result, key)) result[key] = value;
  }
  return Object.keys(result).length || original != null ? result : null;
}
function publicationFields(data, original, status) {
  const raw = textValue(data.url), time2 = textValue(data.published_at);
  if (status !== "published" && (raw || time2)) {
    throw new Error("未发布状态不能保留公开链接或发布时间，请明确清空发布信息或选择已发布。");
  }
  if (status !== "published") return { url: null, published_at: null };
  if (!raw || !time2 || !safeLedgerURL(raw)) throw new Error("已发布文章须填写真实的 HTTP/HTTPS 链接和实际发布时间。");
  const url = new URL(raw);
  url.hash = "";
  return { url: url.toString(), published_at: articleTime(time2, "实际发布时间", original.published_at) };
}
function buildArticleFormPayload(data, original = {}) {
  const status = choice(data.status, statusLabels, "文章状态");
  if (!status) throw new Error("请明确选择文章状态，未确认的状态不会自动保存为草稿或已发布。");
  const body = {
    account_id: textValue(data.account_id),
    title: textValue(data.title),
    status,
    ...publicationFields(data, original, status),
    started_at: articleTime(data.started_at, "流水线开始", original.started_at),
    production_mode: choice(data.production_mode, modeLabels, "生产方式", "unknown"),
    summary: textValue(data.summary),
    notes: textValue(data.notes),
    platform_article_id: textValue(data.platform_article_id) || null,
    slot: choice(data.slot, slotLabels, "槽位"),
    writer: choice(data.writer, writerLabels, "写作者"),
    illustrator: choice(data.illustrator, illustratorLabels, "配图者"),
    run_dir: textValue(data.run_dir) || null,
    run_date: textValue(data.run_date) || null,
    series_no: nullableNumber(data.series_no, "系列编号", 1),
    char_count: nullableNumber(data.char_count, "字数"),
    subheading_count: nullableNumber(data.subheading_count, "小标题数"),
    image_count: nullableNumber(data.image_count, "图数")
  };
  if (!body.account_id || !body.title) throw new Error("请填写文章标题并选择所属运营账号。");
  if (body.published_at && body.started_at && body.started_at > body.published_at) {
    throw new Error("流水线开始时间不能晚于发布时间。");
  }
  const editor = textValue(data.draft_editor_url);
  if (editor && !safeLedgerURL(editor)) throw new Error("草稿编辑链接请使用有效的 HTTP/HTTPS 地址。");
  body.draft_ref = mergedObject(original.draft_ref, {
    pgc_id: textValue(data.draft_pgc_id) || null,
    appmsgid: textValue(data.draft_appmsgid) || null,
    editor_url: editor || null
  });
  body.timings = mergedObject(original.timings, { finished_at: articleTime(data.finished_at, "流水线结束", original.timings?.finished_at) });
  if (original.id) body.version = original.version;
  return body;
}
function equalValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equalValue(a[key], b[key]));
}
function savedArticle(value, pending) {
  return typeof value?.id === "string" && !!value.id && (!pending.id || value.id === pending.id) && Number.isSafeInteger(value.version) && value.version > (pending.body.version || 0) && Object.entries(pending.body).every(([key, expected]) => key === "version" || equalValue(value[key], expected));
}
function uncertainArticleSave(cache, message) {
  cache.saveAttempt.phase = "unknown";
  return new Error(message || "保存结果尚未确认，请先在文章列表核对；当前表单不会重复提交，请勿重复新建。");
}
async function reconcileArticleSave(cache, request, isCurrent) {
  if (!cache.saveAttempt.id) throw uncertainArticleSave(cache);
  let remote;
  try {
    remote = await request(`/articles/${encodeURIComponent(cache.saveAttempt.id)}`);
  } catch {
    if (!isCurrent()) return null;
    throw uncertainArticleSave(cache, "保存结果尚未确认，当前表单不会再次提交。请稍后重新打开记录核对。");
  }
  if (!isCurrent()) return null;
  if (savedArticle(remote, cache.saveAttempt)) return remote;
  throw uncertainArticleSave(cache, "保存结果与当前记录未能确认一致，当前表单不会再次提交。请重新打开最新记录核对。");
}
async function saveArticleForm({ form, data }, { request = api, uuid = () => crypto.randomUUID() } = {}) {
  const cache = articleFormRecord(form), isCurrent = () => articleFormCurrent(form, cache);
  if (cache.saveAttempt) throw new Error("此表单已有保存请求，请关闭后核对文章列表或最新详情，不要重复新建。");
  const body = buildArticleFormPayload(data, cache.record), id = form.dataset.id || "";
  cache.saveAttempt = { id, body: structuredClone(body), key: uuid(), phase: "saving" };
  let value;
  try {
    value = await request(id ? `/articles/${encodeURIComponent(id)}` : "/articles", {
      method: id ? "PUT" : "POST",
      body,
      headers: { "Idempotency-Key": cache.saveAttempt.key }
    });
  } catch (error) {
    if (!isCurrent()) return null;
    if (error.status >= 400 && error.status < 500) {
      if (error.status === 409 && error.code === "VERSION_CONFLICT") cache.saveAttempt.phase = "conflict";
      else delete cache.saveAttempt;
      throw error;
    }
    value = await reconcileArticleSave(cache, request, isCurrent);
  }
  if (!isCurrent()) return null;
  if (!savedArticle(value, cache.saveAttempt)) value = await reconcileArticleSave(cache, request, isCurrent);
  if (!isCurrent()) return null;
  cache.saveAttempt.phase = "saved";
  return value;
}

// web/forms.mjs
async function submitSaveViewForm({ data }) {
  const saved = { id: crypto.randomUUID(), name: data.name.trim(), version: 2, filters: { ...state.filters }, columns: [...state.columns] };
  if (!saved.name) throw new Error("请填写视图名称。");
  state.savedViews = state.savedViews.filter((v) => v.name !== saved.name).concat(saved).slice(-20);
  storage.set("haoduoyu.views", JSON.stringify(state.savedViews));
  closeModal();
  toast("常用视图已保存在此浏览器。");
  await renderPage();
  return;
}
async function submitLoginForm({ data }) {
  await api("/auth/login", { method: "POST", body: { username: data.username, password: data.password } });
  await init({ freshLogin: true });
  return;
}
async function submitArticleForm({ form, data }) {
  const saved = await saveArticleForm({ form, data });
  if (!saved) return;
  closeModal();
  const epoch = runtime.sessionEpoch, ticket = runtime.modalRequestVersion;
  toast(form.dataset.id ? "文章台账已更新。" : "文章已保存。");
  try {
    await renderPage();
  } catch {
    if (epoch === runtime.sessionEpoch && ticket === runtime.modalRequestVersion) {
      toast("文章已保存，但列表暂时无法刷新，请稍后刷新页面。", true);
    }
  }
  return;
}
async function submitReviewForm({ form, data }) {
  const m = {};
  for (const key of Object.keys(metrics)) {
    const value = data[`metric_${key}`];
    if (value !== "" && value != null) m[key] = Number(value);
  }
  if (!Object.keys(m).length) throw new Error("请至少填写一个已取得的指标。");
  let body, path;
  if (form.dataset.type === "daily") {
    path = "/daily-metrics";
    body = { account_id: data.account_id, article_id: data.article_id || null, date: data.date, metrics: m, source: data.source.trim() };
  } else {
    path = "/observations";
    body = { article_id: data.article_id, kind: data.kind, as_of: iso(data.as_of), collected_at: iso(data.collected_at), metrics: m, source: data.source.trim(), note: data.note };
  }
  await api(path, { method: "POST", body });
  closeModal();
  toast("数据已保存，总览会同步更新。");
  await renderPage();
  return;
}
async function submitAccountForm({ form, data, values }) {
  const id = form.dataset.id;
  await api(id ? `/accounts/${encodeURIComponent(id)}` : "/accounts", { method: id ? "PUT" : "POST", body: id ? { name: data.name.trim(), active: values.has("active") } : { platform: data.platform, name: data.name.trim() } });
  state.accounts = (await api("/accounts")).sort((a, b) => ["toutiao", "zhihu", "wechat", "other"].indexOf(a.platform) - [
    "toutiao",
    "zhihu",
    "wechat",
    "other"
  ].indexOf(b.platform));
  closeModal();
  toast("运营账号已保存。");
  renderShell();
  return;
}
async function submitKeyForm({ form, data, values }) {
  const ids = values.getAll("account_ids"), permissions = values.getAll("permissions");
  if (!ids.length) throw new Error("请至少选择一个允许访问的账号。");
  if (!permissions.length) throw new Error("请至少选择一种操作权限。");
  const result = await api("/api-keys", { method: "POST", body: { name: data.name.trim(), account_ids: ids, permissions } });
  openModal("凭证已创建 · 请立即保存", `<div class="info-line warn">${icon("key", 15)}<span>凭证仅显示一次，请安全保存。</span></div><pre class="token-box" id="created-token">${e(result.token)}</pre><div class="form-actions"><button class="btn" data-action="copy-token">${icon(
    "copy",
    14
  )}复制凭证</button><button class="btn primary" data-action="close-modal">我已保存</button></div>`);
  await renderPage();
  return;
}
async function submitRevokeForm({ form }) {
  await api(`/api-keys/${encodeURIComponent(form.dataset.id)}`, { method: "DELETE" });
  closeModal();
  toast("凭证已撤销。");
  await renderPage();
  return;
}
async function submitPasswordForm({ form, data }) {
  if (data.newPassword !== data.confirmPassword) throw new Error("两次输入的新密码不一致。");
  await api("/auth/password", { method: "PUT", body: { currentPassword: data.currentPassword, newPassword: data.newPassword } });
  form.reset();
  toast("密码已更新，请使用新密码登录。");
  state.me = null;
  renderLogin();
  return;
}
var forms = {
  "save-view-form": submitSaveViewForm,
  "login-form": submitLoginForm,
  "article-form": submitArticleForm,
  "review-form": submitReviewForm,
  "account-form": submitAccountForm,
  "key-form": submitKeyForm,
  "revoke-form": submitRevokeForm,
  "password-form": submitPasswordForm
};
async function handleFormSubmit(event) {
  const form = event.target;
  if (["todo-template-form", "todo-template-edit-form"].includes(form.id)) {
    event.preventDefault();
    const handler = form.id === "todo-template-form" ? submitTodoTemplateForm : submitTodoTemplateEdit;
    await handler({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (form.id === "todo-form") {
    event.preventDefault();
    await submitTodo({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (!form.matches("#login-form,#article-form,#review-form,#account-form,#key-form,#password-form,#revoke-form,#article-filters,#save-view-form")) return;
  event.preventDefault();
  if (form.id === "article-filters") return;
  const button2 = $("button[type=submit]", form), message = $(".form-message", form), values = new FormData(form), data = Object.fromEntries(
    values
  );
  if (button2?.disabled) return;
  if (message) message.textContent = "";
  if (button2) button2.disabled = true;
  try {
    const handler = forms[form.id];
    if (handler) await handler({ form, data, values });
  } catch (err) {
    if (err.staleSession || isRequestAbort(err)) return;
    if (form.id === "article-form" && !articleFormCurrent(form)) return;
    if (message && message.isConnected) message.textContent = err.code === "VERSION_CONFLICT" ? "这条记录已被其他人或 AI 更新。请关闭后重新打开，核对最新内容再保存。" : err.message;
    else toast(err.message, true);
  } finally {
    if (button2?.isConnected) button2.disabled = false;
  }
}

// web/events.mjs
async function handleClick(event) {
  closeMediaNavigation(event.target);
  if (runtime.activePopover?.node.contains(event.target) && event.target.closest("[role=menuitem]")) closePopover();
  if (runtime.activePopover && !runtime.activePopover.node.contains(event.target) && !runtime.activePopover.trigger.contains(event.target)) {
    const control = event.target.closest('button,a[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])');
    closePopover();
    control?.focus();
  }
  const target = event.target.closest("[data-action],[data-nav]");
  if (!target) {
    if (event.target.classList.contains("modal-backdrop")) closeModal();
    if (event.target.classList.contains("shell") && $(".shell").classList.contains("menu-open")) setMenu(false);
    return;
  }
  if (runtime.activePopover?.node.contains(target) && !["reset-draft", "draft-sort"].includes(target.dataset.action)) closePopover();
  if (target.dataset.nav) {
    event.preventDefault();
    navigateLink(target.dataset.nav);
    return;
  }
  const action = target.dataset.action, id = target.dataset.id;
  try {
    const handler = Object.hasOwn(actions, action) ? actions[action] : null;
    if (handler) await handler({ target, event, action, id });
  } catch (err) {
    if (!err.staleSession && !isRequestAbort(err)) toast(err.message, true);
  }
}
function handleChange(event) {
  const el = event.target;
  if (changeReconciliationFilters(el)) return;
  if (el.matches?.("[data-article-verify-index]")) {
    handleArticleVerificationChange(el);
    return;
  }
  if (el.id === "todo-completed-mode") {
    changeTodoCompletedMode(el.value);
    return;
  }
  if (el.dataset?.todoId) {
    toggleTodo(el);
    return;
  }
  if (el.id === "todo-date") {
    selectTodoDate(el.value);
    return;
  }
  if (el.id === "filter-view") {
    const view = state.savedViews.find((v) => v.id === el.value);
    if (view) {
      $("#filter-panel").outerHTML = articleFilterPanel(viewDraft(view));
      $("#filter-panel select")?.focus();
    }
  } else if (el.name === "columns" && el.closest("#filter-panel")) {
    $("#filter-panel").outerHTML = articleFilterPanel(articleDraft(el.form));
    $('#filter-panel input[value="' + el.value + '"]')?.focus();
  } else if (el.id === "global-account") {
    state.account = el.value;
    state.listPage = 1;
    updateRoute();
    renderShell();
  } else if (el.id === "page-size") {
    state.pageSize = Number(el.value);
    state.listPage = 1;
    updateRoute();
    renderPage();
  } else if (el.id === "trend-date") {
    state.trendDate = el.value;
    state.trendOpen = true;
    replacePageContent(publishedArticleLinks(renderDashboard(state.dashboard)));
  } else if (el.id === "trend-metric") {
    state.trendMetric = el.value;
    state.trendOpen = true;
    replacePageContent(publishedArticleLinks(renderDashboard(state.dashboard)));
  } else if (el.closest("#article-filters") && el.name && el.name !== "q") {
    state.filters[el.name] = el.value;
    reloadFilteredPage("[name=" + el.name + "]");
  } else if (el.id === "review-account") {
    const select = $("#review-article");
    select.innerHTML = '<option value="">账号总体</option>' + state.reviewArticles.filter((a) => a.account_id === el.value).map((a) => `<option value="${e(a.id)}">${e(a.title)}</option>`).join("");
  }
}
function handleToggle(event) {
  if (event.target.id === "todo-templates" && event.target.isConnected && event.target.open) loadTodoTemplates();
  const key = event.target.dataset?.state;
  if (event.target.isConnected && key === "trendOpen") state[key] = event.target.open;
}
function handleInput(event) {
  const el = event.target;
  inputTodo(el);
  inputTodoTemplate(el);
  if (el.name === "q" && el.closest("#article-filters")) {
    state.filters.q = el.value;
    state.listPage = 1;
    updateRoute();
    clearTimeout(runtime.searchTimer);
    const query = el.value, version = runtime.renderVersion;
    runtime.searchTimer = setTimeout(async () => {
      runtime.searchTimer = null;
      if (state.page !== "articles" || state.filters.q !== query || runtime.renderVersion !== version) return;
      const start = el.selectionStart;
      await renderPage();
      if (runtime.renderVersion === version + 1 && !$("#overlay").firstChild) {
        const next = $("#article-filters input[name=q]");
        if (next) {
          next.focus();
          next.setSelectionRange(start, start);
        }
      }
    }, 350);
  }
}
function handleFilterSubmit(event) {
  if (event.target.id === "filter-panel") {
    event.preventDefault();
    applyArticleFilters(event.target);
  }
}
function handleKeydown(event) {
  if (event.key === "Escape") closeMediaNavigation();
  if (runtime.activePopover) {
    if (event.key === "Tab") {
      const current = runtime.activePopover;
      setTimeout(() => {
        if (runtime.activePopover === current && !current.node.contains(document.activeElement)) closePopover({ restoreFocus: false });
      }, 0);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePopover();
      return;
    }
    if (runtime.activePopover.menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = $$("[role=menuitem]", runtime.activePopover.node), i = items.indexOf(document.activeElement);
      items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (i + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      return;
    }
  }
  if (event.key === "Escape" && $(".shell")?.classList.contains("menu-open")) {
    event.preventDefault();
    setMenu(false);
    return;
  }
  if (event.key === "Escape" && state.page === "todos" && state.todoPanel && !$("#overlay").firstChild) {
    event.preventDefault();
    void setTodoPanel("");
    return;
  }
  if (!$("#overlay").firstChild) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
  }
  if (event.key === "Tab") {
    const nodes = $$('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]', $(
      "#overlay"
    )).filter((el) => el.getClientRects().length);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
function handleResize() {
  closePopover();
  if ($(".shell")?.classList.contains("menu-open")) setMenu(false);
  else syncMenu();
}
function handlePopstate() {
  closeModal();
  readRoute();
  if (state.me) {
    updateRoute();
    renderShell();
  }
}
function registerEvents2() {
  registerTodosClock();
  registerTodoGestures(openTodoMenu, canOpenTodoMenu);
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("toggle", handleToggle, true);
  document.addEventListener("input", handleInput);
  document.addEventListener("submit", handleFilterSubmit);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("submit", handleFormSubmit);
  window.addEventListener("resize", handleResize);
  window.addEventListener("popstate", handlePopstate);
}

// web/main.mjs
registerEvents2();
init();
