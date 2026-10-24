// web/core/constants.mjs
var platforms = { toutiao: "今日头条", zhihu: "知乎", wechat: "微信公众号", other: "其他平台" };
var modeLabels = { manual: "人工", automatic: "自动化", mixed: "人工＋自动化", unknown: "未记录" };
var kindLabels = { latest: "最新数据", d1: "第 1 天观察", d3: "第 3 天观察", d7: "第 7 天观察" };
var metrics = { reads: "阅读", impressions: "展现", likes: "点赞", comments: "评论", favorites: "收藏", shares: "分享", approvals: "赞同", reading_users: "阅读人数" };
var nav = [
  { id: "dashboard", label: "总览", icon: "grid" },
  { id: "articles", label: "文章", icon: "articles" },
  { id: "reviews", label: "数据", icon: "chart" },
  { id: "todos", label: "每日待办", icon: "check" },
  { id: "settings", label: "设置", icon: "settings" }
];
var settingsTabs = { accounts: "账号", keys: "AI 授权", security: "安全", log: "操作日志" };
var legacyPages = { management: "accounts", accounts: "accounts", keys: "keys" };
var defaultFilters = () => ({ q: "", mode: "", from: "", to: "", sort: "published_at", order: "desc", group: "", platform: "", topic: "", data_status: "" });
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
  account: ["账号", ""]
};
var articleStatuses = { no_snapshot: "未采集", missing_reads: "缺阅读数据", missing_likes: "缺点赞数据", missing_comments: "缺评论数据", incomplete: "指标不完整", zero_reads: "真实0阅读", date_unverified: "日期待核实" };
var articleChoices = {
  topic: { entertainment: "文娱（推断）", insurance: "保险（推断）", unknown: "未推断" },
  mode: modeLabels,
  group: { account: "按账号", mode: "按生产方式" }
};
var defaultColumns = ["reads", "likes", "comments", "as_of"];

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
function requestKey(path, options, envelope) {
  const settings = {};
  for (const key of Object.keys(options).sort()) {
    if (key === "signal") continue;
    const value = options[key];
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
function pendingGet(path, options, envelope, context, factory) {
  assertRequestActive(context, options.signal);
  const key = requestKey(path, options, envelope) ?? /* @__PURE__ */ Symbol("unshared request");
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
  return subscribeRequest(entry, options.signal);
}

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
  return state.page === "todos" && validTodoDate(state.todoDate) ? state.todoDate : bjtDate();
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
  const today = bjtDate(now), changed = todosState.today !== today;
  todosState.today = today;
  return changed;
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
function popover(trigger, body, { menu = false, label = "说明" } = {}) {
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
  node.setAttribute("aria-label", label);
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
  $("#app").innerHTML = `<main id="main" class="minimal-login"><section class="login-card"><div class="brand login-brand"><span class="brand-mark">${icon("fish", 27)}</span><h1 class="brand-title">好多鱼图文</h1></div><form id="login-form" aria-label="账号登录"><div class="form-field"><label for="username">账号</label><input class="input" id="username" name="username" autocomplete="username" required autofocus></div><div class="form-field"><label for="password">密码</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></div><p class="form-message" role="alert"></p><button class="btn primary" type="submit">登录 ${icon(
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
function apiOptions(options) {
  const opts = { credentials: "same-origin", ...options, headers: { Accept: "application/json", ...options.headers || {} } };
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
async function api(path, options = {}) {
  const epoch = runtime.sessionEpoch, identity = state.me?.id ?? null;
  const { envelope = false, context, ...requestOptions } = options;
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

// web/core/router.mjs
function updateRoute(push = false) {
  const u = new URL(location.href);
  u.searchParams.set("page", state.page);
  u.searchParams.set("period", state.overviewPeriod);
  if (state.page === "todos" && state.todoDate) u.searchParams.set("date", state.todoDate);
  else u.searchParams.delete("date");
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
  state.todoDate = state.page === "todos" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.settingsTab = (Object.hasOwn(legacyPages, raw) ? legacyPages[raw] : null) || (Object.hasOwn(settingsTabs, params.get("tab")) ? params.get("tab") : raw === "settings" && !params.has("tab") ? "security" : "accounts");
  state.reviewTab = ["pending", "observations", "daily"].includes(params.get("tab")) ? params.get("tab") : "observations";
  state.overviewPeriod = ["yesterday", "7d", "30d"].includes(params.get("period")) ? params.get("period") : "yesterday";
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

// web/ui/components.mjs
var platformLogo = (p) => `<span class="platform-logo platform-${e(["toutiao", "zhihu", "wechat"].includes(p) ? p : "other")}">${e({
  toutiao: "头",
  zhihu: "知",
  wechat: "微"
}[p] || "文")}</span>`;
function detailInfo(reason, label, id) {
  return `<button class="icon-button" data-action="detail-info" data-reason="${e(reason)}" aria-label="${e(label)}" aria-expanded="false" aria-controls="detail-info-${e(id)}">${icon("info", 14)}</button>`;
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
  if (state.page === "dashboard") return `${dashboardInfo("metrics", "总览数据口径", "header")}<button class="icon-button" data-action="refresh" title="刷新数据" aria-label="刷新数据">${icon("refresh")}</button><button class="btn primary" data-action="new-article">${icon(
    "plus"
  )}记录发布</button>`;
  if (state.page === "articles") return `<a class="btn" href="/api/v1/export" download>${icon("download")}导出 CSV</a><button class="btn primary" data-action="new-article">${icon("plus")}记录发布</button>`;
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
function dashboardInfo(kind, label, id = "") {
  return `<button class="icon-button" data-action="dashboard-info" data-kind="${e(kind)}" data-id="${e(id)}" aria-label="${e(label)}" aria-expanded="false" aria-controls="info-${e(kind)}-${e(id)}">${icon("info", 14)}</button>`;
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
function articleSelect(name, label, choices, value) {
  return `<label class="form-field">${e(label)}<select name="${e(name)}" class="input" aria-label="${e(label)}"><option value="">全部</option>${Object.entries(choices).map(([key, text]) => `<option value="${e(key)}" ${value === key ? "selected" : ""}>${e(text)}</option>`).join("")}</select></label>`;
}
function field(name, label, type = "text", value = "", options = "", full = false) {
  return `<div class="form-field${full ? " full" : ""}"><label for="field-${e(name)}">${label}</label><input id="field-${e(name)}" class="input" name="${e(name)}" type="${type}" value="${e(value)}" ${options}></div>`;
}
function formEnd(label = "保存") {
  return `<p class="form-message" role="alert"></p><div class="form-actions"><button type="button" class="btn" data-action="close-modal">取消</button><button class="btn primary" type="submit">${e(label)}</button></div>`;
}
function renderSnapshot(row) {
  const m = metricData(row);
  return `<article class="snapshot"><div class="snapshot-head"><span class="badge ${row.kind === "latest" ? "up" : "neutral"}">${e(kindLabels[row.kind] || row.kind || "每日数据")}</span><span class="snapshot-time">${e(row.date || displayTime(row.as_of))}</span></div><div class="snapshot-metrics">${Object.entries(metrics).filter(([key]) => m[key] != null).map(([key, label]) => `<span>${e(label)} <strong>${e(
    num(m[key])
  )}</strong></span>`).join("") || "未记录指标"}</div><p class="cell-sub">来源 ${e(row.source || "未记录")}${row.collected_at ? " · 采集 " + e(displayTime(row.collected_at)) : ""}</p>${row.note ? `<p class="cell-sub">${e(row.note)}</p>` : ""}</article>`;
}

// web/ui/segmented.mjs
function segmented(action, items, selected, label, attribute = "tab", classes = "") {
  return `<div class="segmented${classes ? " " + e(classes) : ""}" role="group" aria-label="${e(label)}">${items.map(([value, text]) => `<button type="button" class="btn" data-action="${e(action)}" data-${e(attribute)}="${e(value)}" aria-pressed="${selected === value}">${e(
    text
  )}</button>`).join("")}</div>`;
}
function platformFilter(action, selected, label = "平台") {
  return segmented(action, [["", "全部"], ...Object.entries(platforms)], selected, label, "platform");
}

// web/ui/table.mjs
function sortHeading(key, label) {
  return `<button class="sort-heading" data-action="sort-column" data-sort="${e(key)}" aria-label="按${e(label)}排序">${e(label)} ${state.filters.sort === key ? state.filters.order === "asc" ? "↑" : "↓" : "↕"}</button>`;
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
async function renderArticles(version = runtime.renderVersion, context) {
  const f = { ...state.filters }, params = new URLSearchParams();
  if (state.account) params.set("account_id", state.account);
  for (const key of ["q", "mode", "from", "to", "sort", "order", "platform", "topic", "data_status"]) if (f[key]) params.set(key, f[key]);
  params.set("page", state.listPage);
  params.set("page_size", state.pageSize);
  const payload = await api(`/articles?${params}`, { envelope: true, context });
  if (version !== runtime.renderVersion) return "";
  const articles = payload.data, meta = payload.meta || { total: articles.length, unfiltered_total: articles.length, has_more: false };
  state.articles = articles;
  state.articleMeta = meta;
  const chips = [["account", "账号", state.account ? accountName(state.account) : ""], ...Object.entries({
    q: "搜索",
    platform: "平台",
    data_status: "数据状态",
    from: "发布自",
    to: "发布至",
    topic: "题材",
    mode: "生产方式",
    group: "分组"
  }).map(([key, label]) => [
    key,
    label,
    (key === "platform" ? platforms : key === "data_status" ? articleStatuses : articleChoices[key])?.[f[key]] || f[key]
  ])].filter(
    ([, , value]) => value
  );
  return `<section class="card article-list"><form id="article-filters" class="filters"><label class="search">${icon("search", 15)}<input class="input" name="q" value="${e(f.q)}" placeholder="搜索标题或链接…" aria-label="搜索文章"></label>${platformFilter(
    "article-platform",
    f.platform,
    "文章平台"
  )}${articleSelect("data_status", "数据状态", articleStatuses, f.data_status)}<button type="button" class="btn" data-action="article-filter" aria-expanded="false" aria-controls="article-filter-popover">筛选 ▾</button></form>${chips.length ? `<div class="selected-filters" aria-label="已选条件">${chips.map(([key, label, value]) => `<button class="badge" data-action="remove-filter" data-filter="${e(key)}" aria-label="移除${e(label)}：${e(value)}">${e(label)}：${e(value)} ×</button>`).join("")}<button class="btn text" data-action="reset-filters">清空</button></div>` : ""}${articles.length ? articleTable(articles) : empty(meta.unfiltered_total ? "筛选无结果" : "尚未记录文章", "", '<button class="btn" data-action="reset-filters">清空筛选</button>')}<div class="pagination"><span>共 ${e(num(meta.total))} 篇</span><label>每页<select id="page-size" class="input">${[.../* @__PURE__ */ new Set([
    10,
    20,
    50,
    100,
    state.pageSize
  ])].sort((a, b) => a - b).map((n) => `<option value="${e(n)}" ${state.pageSize === n ? "selected" : ""}>${e(n)}</option>`).join(
    ""
  )}</select></label><button class="btn" data-action="list-prev" aria-label="上一页" ${state.listPage <= 1 ? "disabled" : ""}>‹</button><span>${e(num(state.listPage))} / ${e(num(Math.max(1, Math.ceil(meta.total / state.pageSize))))}</span><button class="btn" data-action="list-next" aria-label="下一页" ${meta.has_more ? "" : "disabled"}>›</button></div></section>`;
}
function articleFilterPanel({ filters: f = state.filters, columns: c = state.columns, account = state.account } = {}) {
  return `<form id="filter-panel">${["q", "platform", "data_status"].map((key) => `<input type="hidden" name="${e(key)}" value="${e(f[key])}">`).join("")}<h2>筛选 <span class="badge">草稿 · 应用后生效</span></h2><div class="form-grid"><label class="form-field full">运营账号<select name="account" class="input" aria-label="运营账号">${accountOptions(account)}</select></label>${field("from", "发布自", "date", f.from)}${field(
    "to",
    "发布至",
    "date",
    f.to
  )}${Object.entries({ topic: "题材", mode: "生产方式", group: "分组" }).map(([key, label]) => articleSelect(
    key,
    label,
    articleChoices[key],
    f[key]
  )).join("")}<fieldset class="form-field full permission-fields"><legend>显示字段</legend><div class="checkboxes">${Object.entries(articleColumns).map(([key, [label]]) => `<label class="check-option"><input type="checkbox" name="columns" value="${e(key)}" ${c.has(key) ? "checked" : ""}>${e(label)}</label>`).join("")}</div></fieldset><div class="form-field full"><span>更多排序</span><input type="hidden" name="sort" value="${e(f.sort)}"><input type="hidden" name="order" value="${e(f.order)}"><div class="head-actions">${Object.entries(articleColumns).filter(([, [, sort]]) => sort).map(([key, [label, sort]]) => `<button type="button" class="btn small" data-action="draft-sort" data-visible="${sort === "published_at" || c.has(key)}" data-sort="${e(sort)}" aria-pressed="${f.sort === sort}">${e(label)} ${f.sort === sort ? f.order === "asc" ? "↑" : "↓" : "↕"}</button>`).join("") || "使用表头排序"}</div></div><div class="form-field full"><label for="filter-view">常用视图（筛选和字段）</label><select id="filter-view" class="input"><option value="">选择视图后应用</option>${state.savedViews.map((v) => `<option value="${e(v.id)}">${e(v.name)}</option>`).join("")}</select><button type="button" class="btn" data-action="save-view">保存已应用视图</button></div></div><div class="form-actions"><button type="button" class="btn" data-action="reset-draft">重置草稿</button><button type="submit" class="btn">应用</button></div></form>`;
}
function articleDraft(form) {
  const values = new FormData(form), filters = { ...state.filters };
  for (const key of ["q", "platform", "data_status", "from", "to", "topic", "mode", "group", "sort", "order"]) filters[key] = String(values.get(key) || "");
  if (!Object.values(articleColumns).some(([, sort]) => sort === filters.sort)) filters.sort = "published_at";
  if (!["asc", "desc"].includes(filters.order)) filters.order = "desc";
  return { filters, columns: new Set(values.getAll("columns").filter((c) => Object.hasOwn(articleColumns, c))), account: String(values.get("account") || "") };
}
function viewDraft(view) {
  return { filters: { ...defaultFilters(), ...Object.fromEntries(Object.entries(view.filters).filter(([key]) => Object.hasOwn(
    defaultFilters(),
    key
  ))) }, columns: /* @__PURE__ */ new Set([...view.columns.filter((key) => Object.hasOwn(articleColumns, key)), ...view.version !== 2 && !view.columns.includes("as_of") ? ["likes", "comments", "as_of"] : []]), account: state.account };
}
function articleTable(rows) {
  const columns = Object.entries(articleColumns).filter(([key]) => state.columns.has(key));
  let previous = null;
  const cell = (a, key) => ["reads", "likes", "comments", "approvals"].includes(key) ? dashboardMetric(a, key) : key === "as_of" ? a.latest_as_of ? e(time(a.latest_as_of, true)) : dashboardMetric(a, "as_of") : key === "mode" ? badgeMode(a.production_mode) : key === "duration" ? e(duration(
    a.duration_seconds
  )) : key === "account" ? e(a.account_name) : a.date_status === "unverified" ? "日期待核实" : e(time(
    a.published_at,
    true
  ));
  return `<div class="table-scroll article-desktop"><table class="data-table article-table"><thead><tr><th aria-sort="${!state.columns.has(
    "published"
  ) && state.filters.sort === "published_at" ? state.filters.order === "asc" ? "ascending" : "descending" : "none"}">${state.columns.has("published") ? "标题" : sortHeading("published_at", "标题 / 发布")}</th>${columns.map(([key, [label, sort]]) => `<th ${sort ? `aria-sort="${state.filters.sort === sort ? state.filters.order === "asc" ? "ascending" : "descending" : "none"}"` : ""}>${sort ? sortHeading(
    sort,
    label
  ) : e(label)}${key === "likes" ? dashboardInfo("metrics", "点赞口径", "articles") : ""}</th>`).join("")}<th>操作</th></tr></thead><tbody class="article-cards">${rows.map((a) => {
    const group = state.filters.group ? state.filters.group === "account" ? a.account_name : modeLabels[a.production_mode] : null, heading = group && group !== previous ? `<tr class="group-row"><td colspan="${e(columns.length + 2)}">${e(group)}</td></tr>` : "";
    previous = group;
    return `${heading}<tr><td class="title-cell"><button class="article-link" data-action="article-detail" data-id="${e(a.id)}">${e(a.title)}</button><div class="cell-sub">${platformLogo(a.platform)} ${e(a.account_name)} · ${a.date_status === "unverified" ? "日期待核实" : e(
      time(a.published_at, true)
    )}</div></td>${columns.map(([key, [label]]) => `<td data-label="${e(label)}">${cell(a, key)}</td>`).join("")}<td><button class="icon-button" data-action="article-menu" data-id="${e(a.id)}" aria-label="操作：${e(a.title)}" aria-haspopup="menu" aria-expanded="false" aria-controls="article-menu-${e(a.id)}">⋯</button></td></tr>`;
  }).join("")}</tbody></table></div>`;
}
function articleMenu(a) {
  return `<button role="menuitem" data-action="article-detail" data-id="${e(a.id)}">详情</button>${safeURL(a.url) ? `<a role="menuitem" href="${e(a.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>` : ""}${[["edit-article", "编辑"], ["review-article", "补充数据"]].map(([action, label]) => `<button role="menuitem" data-action="${e(action)}" data-id="${e(a.id)}">${e(label)}</button>`).join("")}`;
}
async function articleModal(id = "") {
  const context = beginModalRequests();
  const ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion;
  let a = { account_id: state.account, production_mode: "unknown" };
  if (id) a = await modalRequest(`/articles/${encodeURIComponent(id)}`, ticket, version, context);
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  const activeAccounts = state.accounts.filter((x) => x.active || x.id === a.account_id);
  if (!activeAccounts.length) {
    toast("请先添加一个启用的运营账号。", true);
    return;
  }
  openModal(id ? "编辑发布记录" : "记录发布", `<form id="article-form" data-id="${e(id)}" data-version="${e(a.version || "")}"><p class="form-context">北京时间</p><div class="form-grid">${field(
    "title",
    '文章标题 <span class="required">*</span>',
    "text",
    a.title,
    'maxlength="500" required',
    true
  )}<div class="form-field full"><label for="field-account_id">所属运营账号 <span class="required">*</span></label><select class="input" id="field-account_id" name="account_id" required>${accountOptions(a.account_id, false, true)}</select></div>${field("url", '已发布文章链接 <span class="required">*</span>', "url", a.url, 'placeholder="https://…" required', true)}${field(
    "published_at",
    '实际发布时间 <span class="required">*</span>',
    "datetime-local",
    localDateTime(a.published_at),
    "required"
  )}${field(
    "started_at",
    "选题开始时间（可选）",
    "datetime-local",
    localDateTime(a.started_at)
  )}<div class="form-field"><label for="field-production_mode">文章生产方式</label><select class="input" id="field-production_mode" name="production_mode">${Object.entries(modeLabels).map(([key, label]) => `<option value="${key}" ${a.production_mode === key ? "selected" : ""}>${label}</option>`).join("")}</select></div>${field(
    "platform_article_id",
    "平台文章标识（可选）",
    "text",
    a.platform_article_id
  )}<div class="form-field full"><label for="field-summary">文章概况</label><textarea class="input" name="summary" id="field-summary" maxlength="5000">${e(a.summary)}</textarea></div><div class="form-field full"><label for="field-notes">备注</label><textarea class="input" name="notes" id="field-notes" maxlength="10000">${e(a.notes)}</textarea></div></div>${formEnd(id ? "保存修改" : "保存发布记录")}</form>`);
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
  const daily = dailyDates(data), articles = (data.attention_articles || []).filter((a) => ["up", "down"].includes(a.attention?.kind)), visible = state.attentionExpanded ? articles : articles.slice(0, 6);
  return `${renderCumulative(data)}<section class="card cycle-panel"><div class="section-heading"><h2>周期变化</h2>${periodControls()}</div>${daily.length ? `${renderPeriodAccounts(data.accounts || [])}${visible.length ? `<h3>表现异动</h3>${renderAttentionArticles(visible)}${articles.length > 6 ? `<button class="btn text" data-action="toggle-attention" aria-expanded="${state.attentionExpanded}">${state.attentionExpanded ? "收起" : "展开其余"}（${e(num(articles.length))}篇）</button>` : ""}` : ""}` : '<div class="empty inline-empty">还没有每日新增数据，录入后这里会显示周期变化和趋势。<button class="btn" data-action="new-daily">录入每日数据</button></div>'}</section>
 ${daily.length < 2 ? "" : `<details class="card trend-disclosure" data-state="trendOpen" ${state.trendOpen ? "open" : ""}><summary>趋势与发布量</summary><div class="panel"><div class="chart-header"><h2>每日新增趋势 ${dashboardInfo("trend", "趋势数据覆盖")}</h2><label><span class="sr-only">趋势指标</span><select id="trend-metric" class="input">${Object.entries(metrics).map(([key, label]) => `<option value="${e(
    key
  )}" ${state.trendMetric === key ? "selected" : ""}>${e(label)}</option>`).join("")}</select></label></div>${renderTrend(
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
  return `<div class="table-scroll"><table class="data-table period-table"><thead><tr><th>账号</th>${columns.map(([, label]) => `<th>${e(label)}</th>`).join("")}</tr></thead><tbody>${accounts.map((a) => `<tr><td><button class="article-link" data-action="select-account" data-id="${e(a.id)}">${platformLogo(a.platform)} ${e(a.name)}</button></td>${columns.map(([key, label]) => `<td data-label="${e(label)}">${dashboardMetric({
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
    const label = { up: "表现较高", down: "表现较低", normal: "近期文章", insufficient: "待积累数据" }[attention.kind] || "待积累数据";
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
    )}</span>${comparisonHTML(a.comparisons?.comments)}</div>${m.approvals != null ? `<div>赞同 ${e(num(m.approvals))}${comparisonHTML(a.comparisons?.approvals)}</div>` : ""}</td><td class="reason-cell"><span class="badge ${attention.kind === "up" ? "up" : attention.kind === "down" ? "warn" : ""}">${e(label)}</span>${dashboardInfo("attention", "比较依据", a.id)}</td></tr>`;
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
 <dl class="dashboard-stats">${stats.map(([label, value], i) => `<div class="stat"><dt>${e(label)}${i === 4 ? dashboardInfo(
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
    const accounts = state.accounts.filter((a) => a.platform === p.platform), label = accounts.map((a) => a.name).join("，") || platforms[p.platform] || p.platform;
    return `<tr data-action="${accounts.length === 1 ? "select-account" : "select-platform"}" data-id="${e(accounts[0]?.id || "")}" data-platform="${e(p.platform)}"><td><span class="account-title">${platformLogo(p.platform)}<button class="article-link" data-action="${accounts.length === 1 ? "select-account" : "select-platform"}" data-id="${e(accounts[0]?.id || "")}" data-platform="${e(p.platform)}">${e(label)}</button>${dashboardInfo(
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
  const items = pending ? due : records, columns = pending ? [["account", "账号"], ["due_kind", "观察节点"], ["due_at", "目标时间"]] : [["account", "账号"], ...Object.entries(metrics).filter(([key]) => records.some((r) => metricData(r)[key] != null)).map(([key, label]) => [
    key,
    ["likes", "approvals"].includes(key) ? `${label}（${key}）` : label
  ]), [
    tab === "observations" ? "as_of" : "source",
    tab === "observations" ? "数据截至" : "来源"
  ]];
  const cell = (r, key) => key === "account" ? e(accountName(account(r))) : key === "due_kind" ? e(kindLabels[r.due_kind] || r.due_kind) : [
    "as_of",
    "due_at"
  ].includes(key) ? e(displayTime(r[key])) : key === "source" ? e(r.source || "未标注来源") : metricData(r)[key] == null ? '<span class="missing-value">未取得</span>' : e(num(metricData(r)[key]));
  return tabs + `<section class="card">${items.length ? `<div class="table-scroll"><table class="data-table dashboard-table review-table"><thead><tr><th>${pending ? "文章" : tab === "observations" ? "文章／观察节点" : "日期／统计范围"}</th>${columns.map(([, label]) => `<th>${e(label)}</th>`).join("")}<th>操作</th></tr></thead><tbody>${items.map((r) => {
    const id = pending ? r.id : r.article_id, a = articles.find((a2) => a2.id === id);
    return `<tr><td class="title-cell">${id ? `<button class="article-link" data-action="article-detail" data-id="${e(id)}">${e(r.title || r.article_title || a?.title || "文章记录")}</button>` : e(r.date)}${pending ? "" : `<div class="cell-sub">${e(tab === "observations" ? kindLabels[r.kind] || r.kind : r.article_id ? r.date : "账号总体")}</div>`}</td>${columns.map(([key, label]) => `<td data-label="${e(
      label
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
  )}</option>`).join("")}</select></div>${field("date", '数据所属日期 <span class="required">*</span>', "date", bjtDate(), `max="${bjtDate()}" required`)}` : `<div class="form-field full"><label for="review-article">文章 <span class="required">*</span></label><select class="input" name="article_id" id="review-article" required>${articles.map((a) => `<option value="${e(a.id)}" ${a.id === articleId ? "selected" : ""}>${e(a.title)} · ${e(accountName(a.account_id))}</option>`).join("")}</select></div><div class="form-field"><label for="field-kind">观察节点</label><select class="input" id="field-kind" name="kind">${Object.entries(kindLabels).map(([key, label]) => `<option value="${key}" ${key === kind ? "selected" : ""}>${label}</option>`).join("")}</select></div>${field(
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
  )}<div class="form-field full"><span class="field-label">${daily ? "当天新增指标" : "累计指标"}</span><span class="hint">至少一项；缺失留空，真实为零才填 0。</span></div>${Object.entries(metrics).map(([key, label]) => field(
    `metric_${key}`,
    label,
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
    const day2 = Number.isFinite(Date.parse(row.created_at)) ? bjtDate(row.created_at) : "日期未知", label = auditLabel(row.action), last = groups.at(-1);
    if (last && day2 !== "日期未知" && last.day === day2 && last.actor === row.actor && last.label === label) last.rows.push(row);
    else groups.push({ day: day2, actor: row.actor, label, rows: [row] });
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
  ).map(([key, label]) => `<option value="${key}" ${a.platform === key ? "selected" : ""}>${label}</option>`).join(
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
  const adding = todoDay().adding;
  return store.items.map((item) => `<li class="todo-template-row" data-template-id="${e(item.id)}">
<div class="todo-template-line"><button class="todo-template-use" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="添加：${e(item.text)}" ${adding || store.pending.has(item.id) ? "disabled" : ""}>${e(item.text)}</button>
<button class="btn text small" data-action="todo-template-edit" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>改名</button>
<button class="btn text small" data-action="todo-template-delete" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>删除</button></div>
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
  return `<details id="todo-templates" class="daily-todo-templates"><summary>常用</summary><div class="todo-template-content">
<form id="todo-template-form" class="todo-template-form" ${store.editing ? "hidden" : ""}>
<label for="todo-template-text" class="sr-only">新建常用待办</label>
<input id="todo-template-text" class="input" name="text" maxlength="500" required placeholder="新建常用待办" value="${e(store.draft)}">
<button class="btn" type="submit">保存</button></form><div id="todo-template-editor">${todoTemplateEditor(store)}</div>
<p id="todo-template-feedback" class="form-message" role="alert">${e(store.error)}</p>
<p id="todo-template-status" class="daily-todo-status" role="status">${store.loading ? "正在读取…" : ""}</p>
<ul id="todo-template-items" class="todo-template-items">${todoTemplateRows(store)}</ul></div></details>`;
}
function syncTemplateForm(root, id, value, pending) {
  const input = $(id, root);
  if (!input) return;
  if (input.value !== value) input.value = value;
  input.readOnly = pending;
  const button = $("button[type=submit]", input.form);
  if (button) {
    button.disabled = pending;
    button.textContent = pending ? "保存中…" : "保存";
  }
}
function paintTodoTemplates() {
  const root = $("#todo-templates");
  if (!root || state.page !== "todos" || !state.me) return;
  const store = templateState(), editor = $("#todo-template-editor", root), form = $("#todo-template-edit-form", root);
  if (editor && (form?.dataset.id || null) !== (store.editing?.id || null)) editor.innerHTML = todoTemplateEditor(store);
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
async function templateWriteError(error, store, owner, editing = null) {
  if (!templateSessionActive(owner) || isRequestAbort(error) || error.staleSession) return;
  store.error = error.message;
  if (error.status === 409) {
    store.error = "这项常用待办已更新，草稿已保留，请核对后再保存。";
    await loadTodoTemplates();
    if (!templateSessionActive(owner) || !editing || store.editing !== editing) return;
    const latest = store.items.find((item) => item.id === editing.id);
    if (latest) editing.version = latest.version;
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
  const editing = store.editing?.id === id ? store.editing : null;
  const version = remove ? item.version : editing?.version;
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
    if (templateSessionActive(owner)) await templateWriteError(error, store, owner, editing);
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
  if ($("#todo-templates")?.open) loadTodoTemplates();
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
    const label = ticket.phase === "deleting" ? "删除中…" : ticket.phase === "restoring" ? "恢复中…" : "已删除";
    return `<div class="todo-undo-entry"><span>${label}：${e(ticket.item.text)}</span>
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
async function deleteTodo(options) {
  const context = todoActionContext(options);
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
async function changeTodoTemplate(options, remove = false) {
  const context = todoActionContext(options);
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
function todoCalendarMonth(date) {
  if (todosState.calendarDate !== date || !validTodoDate(`${todosState.calendarMonth}-01`)) {
    todosState.calendarDate = date;
    todosState.calendarMonth = date.slice(0, 7);
  }
  return todosState.calendarMonth;
}
function todoCalendarDay(date, selected) {
  const today = date === bjtDate(), active = date === selected;
  return `<button class="todo-calendar-day${active ? " is-selected" : ""}${today ? " is-today" : ""}" type="button"
data-action="todo-calendar-date" data-date="${e(date)}" aria-label="${e(date)}" aria-pressed="${active}"
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
  if (deleted || completed && todoCompletedMode() === "hide") return "";
  return `<li class="daily-todo-row${completed ? " is-complete" : ""}" data-id="${e(item.id)}" data-date="${e(day.date)}">
<label><input type="checkbox" data-todo-id="${e(item.id)}" data-date="${e(day.date)}" ${completed ? "checked" : ""}
aria-disabled="${pending}"><span class="daily-todo-text">${e(item.text)}</span></label>
${pending ? '<span class="cell-sub" role="status">保存中…</span>' : ""}
<button class="todo-row-menu icon-button" type="button" data-action="todo-menu" data-id="${e(item.id)}" data-date="${e(day.date)}"
aria-label="事项操作" aria-haspopup="menu" aria-expanded="false" ${pending ? "disabled" : ""}>⋯</button></li>`;
}
function todoForm(day) {
  const label = day.date === bjtDate() ? "今天想完成什么？" : "这一天的计划";
  return `<form id="todo-form" class="daily-todo-form" data-date="${e(day.date)}" aria-label="添加每日计划">
<label for="todo-text" class="sr-only">${label}</label><input id="todo-text" class="input" name="text" maxlength="500" required
autocomplete="off" placeholder="${label}" value="${e(day.draft)}" ${day.adding ? "readonly" : ""}>
<button class="btn primary" type="submit" ${day.adding ? "disabled" : ""}>${day.adding ? "保存中…" : "添加"}</button></form>`;
}
function todoCaption(day) {
  const today = day.date === bjtDate();
  return `<time datetime="${e(day.date)}" title="北京时间">${today ? "今天 · " : ""}${e(day.date)}</time>`;
}
function todoHeading(day) {
  return `<span id="todo-caption">${todoCaption(day)}</span>
<details id="todo-history" class="daily-todo-history" ${day.date !== bjtDate() ? "open" : ""}><summary>日历 / 历史</summary>
<div id="todo-calendar" class="daily-todo-calendar" data-month="${todoCalendarMonth(day.date)}" data-today="${bjtDate()}">
${todoCalendar(day.date)}</div>${todoDateControls(day.date)}</details>${renderTodoTemplates()}`;
}
function todoStatus(day) {
  const removing = [...day.removals.values()].some((ticket) => ticket.phase !== "ready");
  if (day.adding || day.updates.size || day.templateWrites.size || removing || todoPreferences().pending) return "保存中…";
  if (day.error || todoPreferences().error) return "";
  return day.loading && !day.loaded ? "正在读取…" : day.notice;
}
function todoFeedback(day) {
  const error = [day.error, todoPreferences().error].filter(Boolean).join(" ");
  return error ? `${e(error)} <button class="btn text small" data-action="todo-reload">重新读取</button>` : "";
}
function renderTodos() {
  const day = todoDay();
  return `<section id="daily-todos" class="daily-todos daily-todos-primary" data-date="${e(day.date)}" aria-label="每日计划">
<div id="todo-heading" class="daily-todo-toolbar">${todoHeading(day)}</div>
${todoForm(day)}
<div id="todo-feedback" class="form-message" role="alert">${todoFeedback(day)}</div>
<p id="todo-status" class="daily-todo-status" role="status">${todoStatus(day)}</p>
<div id="todo-undo" class="todo-undo" role="status">${renderTodoUndo(day)}</div>${renderTodoPreferences()}
<ul id="todo-items" class="daily-todo-items">${day.items.map((item) => todoRow(item, day)).join("")}</ul></section>`;
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
    "todo-items": day.items.map((item) => todoRow(item, day)).join(""),
    "todo-feedback": todoFeedback(day)
  };
  for (const [id, html] of Object.entries(parts)) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
  paintTodoCalendar(day.date);
  const input = $("#todo-text", root), button = $("#todo-form button[type=submit]", root);
  if (input && input.value !== day.draft) input.value = day.draft;
  if (input) input.readOnly = day.adding;
  if (button) {
    button.disabled = day.adding;
    button.textContent = day.adding ? "保存中…" : "添加";
  }
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
  const day = todoDay(), date = day.date, owner = todoOwner(), version = runtime.renderVersion;
  const sequence = ++day.sequence, revision = day.revision;
  day.loading = true;
  paintTodos();
  try {
    const data = await api(`/todos?date=${encodeURIComponent(date)}`, { context });
    if (!todoReadActive(owner, version, date, day, sequence)) return;
    if (day.revision !== revision) return loadTodos(context);
    receiveTodoPreferences(data.completed_mode, data.preferences_version);
    day.items = data.items;
    day.loaded = true;
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
  const owner = todoOwner();
  day.adding = true;
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
      day.draft = "";
      day.create = null;
    }
    setTodoNotice(day, "已添加");
  } catch (error) {
    if (todoSessionActive(owner)) {
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
      day.revision++;
      paintTodos();
    }
  }
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
  const day = todoDay();
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
  const commonOpen = $("#todo-templates")?.open;
  paintTodos();
  const common = $("#todo-templates");
  if (common && commonOpen) common.open = true;
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

// web/controller.mjs
function mainContent() {
  return `<div id="page-header" class="page-head">${pageHeader()}</div>${state.page === "settings" ? segmented(
    "settings-tab",
    Object.entries(
      state.me?.publicBusiness ? { accounts: settingsTabs.accounts } : settingsTabs
    ),
    state.settingsTab,
    "设置分类",
    "tab",
    "page-tabs"
  ) : ""}<div id="page-content"></div>`;
}
function mobileNavigation() {
  return `<nav class="mobile-nav" aria-label="切换模块">${nav.map((n) => `<a href="?page=${e(n.id)}${n.id === "settings" ? "&amp;tab=accounts" : ""}"
data-nav="${e(n.id)}" class="mobile-nav-item${n.id === state.page ? " active" : ""}" ${n.id === state.page ? 'aria-current="page"' : ""}>
${icon(n.icon, 18)}<span>${e(n.label)}</span></a>`).join("")}</nav>`;
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
  main.innerHTML = mainContent();
  return true;
}
function renderShell() {
  if (state.me?.publicBusiness && state.page === "settings") state.settingsTab = "accounts";
  stopPageEntry();
  closePopover({ restoreFocus: false });
  if (reuseShell()) {
    renderPage();
    return;
  }
  const navLink = (n) => `<a href="?page=${e(n.id)}${n.id === "settings" ? "&amp;tab=accounts" : ""}" data-nav="${e(n.id)}" class="nav-item ${n.id === state.page ? "active" : ""}" ${n.id === state.page ? 'aria-current="page"' : ""}>${icon(n.icon, 18)}${e(n.label)}</a>`;
  $("#app").innerHTML = `<div class="shell" data-session="${runtime.sessionEpoch}" data-user="${e(state.me.id)}"><aside id="site-nav" class="sidebar" aria-label="主要导航"><div class="sidebar-brand"><a href="?page=todos" class="brand" data-nav="todos"><span class="brand-mark">${icon("fish", 27)}</span><span class="brand-title">好多鱼图文</span></a><button class="icon-button mobile-menu" data-action="menu" aria-label="关闭导航" aria-expanded="false" aria-controls="site-nav">${icon(
    "close"
  )}</button></div><nav class="nav-list">${nav.filter((n) => n.id !== "settings").map(navLink).join("")}</nav><div class="sidebar-bottom">${navLink(nav.find((n) => n.id === "settings"))}<div class="user-row"><span class="avatar">${e((state.me.username || "我").slice(0, 1).toUpperCase())}</span><span class="user-name">${e(state.me.username)}</span>${state.me.publicBusiness ? "" : `<button class="logout" data-action="logout" title="退出登录" aria-label="退出登录">${icon("logout", 16)}</button>`}</div></div></aside><div class="workspace"><header class="mobile-bar"><button class="icon-button" data-action="menu" aria-label="打开导航" aria-expanded="false" aria-controls="site-nav">${icon("menu", 20)}</button><span>好多鱼图文</span></header><main id="main" class="content" tabindex="-1">${mainContent()}</main>${mobileNavigation()}</div></div>`;
  syncMenu();
  renderPage();
}
function navigateLink(page) {
  const same = page === state.page && (page !== "settings" || state.settingsTab === "accounts") && (page !== "todos" || !state.todoDate);
  if (same && !$("#overlay")?.firstChild && !runtime.activePopover) {
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
  if (page === "todos") state.todoDate = "";
  if (page === "settings") state.settingsTab = legacy || tab || "accounts";
  if (page === "dashboard") state.account = "";
  updateRoute(true);
  closeModal();
  renderShell();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function pageLoading(page) {
  if (page === "todos") return renderTodos();
  return skeleton();
}
function setPageBody(html, page) {
  if (page === "todos") paintTodos();
  else replacePageContent(html, true);
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
      case "dashboard":
        data = await api(
          `/overview?period=${state.overviewPeriod}&top_n=${state.topN}&top_platform=${encodeURIComponent(state.topPlatform)}`,
          { context }
        );
        if (version !== runtime.renderVersion) return;
        state.dashboard = data;
        html = renderDashboardSummary(data);
        break;
      case "articles":
        html = await renderArticles(version, context);
        break;
      case "reviews":
        html = await renderReviews(version, context);
        break;
      case "settings":
        if (state.settingsTab === "accounts") html = renderAccounts();
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
  const listen = (target, name, handler, options = true) => {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
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
function renderArticleAnalytics(a) {
  const timeline = a.timeline || [], nodes = a.nodes || [];
  return `${metricSummary(a)}<p class="cell-sub">截至 ${a.latest_metrics == null ? "未采集" : e(displayTime(a.latest_as_of))} · 采集于 ${a.latest_metrics == null ? "未采集" : e(displayTime(a.latest_collected_at))}</p><section class="detail-section"><h3>观察节点</h3><ol class="snapshot-nodes">${nodes.map((n) => {
    const unknown = n.kind !== "latest" && a.date_status === "unverified" && !n.snapshot, status = unknown ? "unknown" : n.status, label = unknown ? "日期待核实" : { recorded: "已记录", before_due: "记录早于节点", not_due: "未到期", not_collected: "未采集" }[status] || "状态未知";
    return `<li class="node ${e(status)}"><strong>${e(kindLabels[n.kind] || n.kind)}</strong><span>${e(label)}</span><small>${e(displayTime(
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
  const fields = [["生产方式", modeLabels[a.production_mode] || "未记录"], ["原始发布时间", displayTime(a.published_at)], ["选题时间", displayTime(a.started_at)], ["耗时", duration(a.duration_seconds)], ["录入者", a.recorded_by?.label || "未记录"], [
    "修改者",
    `${a.last_modified_by?.label || "未记录"} · ${displayTime(a.last_modified_by?.at)}`
  ], ["录入时间", displayTime(a.created_at)], ["修改时间", displayTime(a.updated_at)]];
  openModal(a.title, `<div class="head-actions">${safeURL(a.url) ? `<a class="btn small" href="${e(a.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a>` : ""}<button class="btn small" data-action="edit-article" data-id="${e(a.id)}">编辑</button><button class="btn small primary" data-action="review-article" data-id="${e(a.id)}">+ 补充数据</button></div>${renderArticleAnalytics(a)}<details class="detail-section"><summary>记录信息</summary><dl class="detail-grid">${fields.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(
    value
  )}</dd></div>`).join("")}</dl></details>${[["summary", "概况"], ["notes", "备注"]].filter(([key]) => a[key]?.trim()).map(([key, label]) => `<section class="detail-section"><h3>${e(label)}</h3><p>${e(a[key])}</p></section>`).join("")}`, { drawer: true, context: `<div class="account-title">${platformLogo(a.platform)}${e(a.account_name || accountName(a.account_id))} · ${a.date_status === "unverified" ? "日期待核实" : e(displayTime(a.published_at))}</div>` });
}

// web/actions.mjs
function actionMissingList({ target }) {
  state.filters = { ...defaultFilters(), data_status: target.dataset.status || "incomplete" };
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
    replacePageContent(renderDashboard(state.dashboard));
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
function actionShowDue({}) {
  state.reviewTab = "pending";
  navigate("reviews");
  return;
}
function actionToggleAttention({}) {
  state.attentionExpanded = !state.attentionExpanded;
  if (state.dashboard) {
    replacePageContent(renderDashboard(state.dashboard));
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
  "todo-menu": openTodoMenu,
  "todo-delete": ({ target }) => deleteTodo(target.dataset),
  "todo-restore": ({ target }) => restoreTodo(target.dataset),
  "todo-make-template": ({ target }) => changeTodoTemplate(target.dataset),
  "todo-remove-template": ({ target }) => changeTodoTemplate(target.dataset, true),
  "todo-template-use": ({ id }) => useTodoTemplate(id),
  "todo-template-edit": ({ id }) => editTodoTemplate(id),
  "todo-template-delete": ({ id }) => writeTodoTemplate(id, void 0, true),
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
  const body = { account_id: data.account_id, title: data.title.trim(), url: data.url.trim(), published_at: iso(data.published_at), started_at: iso(
    data.started_at
  ), production_mode: data.production_mode, summary: data.summary, notes: data.notes, platform_article_id: data.platform_article_id?.trim() || "" };
  if (!safeURL(body.url)) throw new Error("文章链接请使用 http 或 https 地址。");
  if (body.started_at && new Date(body.started_at) > new Date(body.published_at)) throw new Error("选题开始时间不能晚于发布时间。");
  const id = form.dataset.id;
  if (id) body.version = Number(form.dataset.version);
  await api(id ? `/articles/${encodeURIComponent(id)}` : "/articles", { method: id ? "PUT" : "POST", body });
  closeModal();
  toast(id ? "发布记录已更新。" : "发布记录已保存。");
  await renderPage();
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
  const button = $("button[type=submit]", form), message = $(".form-message", form), values = new FormData(form), data = Object.fromEntries(
    values
  );
  if (button?.disabled) return;
  if (message) message.textContent = "";
  if (button) button.disabled = true;
  try {
    const handler = forms[form.id];
    if (handler) await handler({ form, data, values });
  } catch (err) {
    if (err.staleSession || isRequestAbort(err)) return;
    if (message && message.isConnected) message.textContent = err.code === "VERSION_CONFLICT" ? "这条记录已被其他人或 AI 更新。请关闭后重新打开，核对最新内容再保存。" : err.message;
    else toast(err.message, true);
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

// web/events.mjs
async function handleClick(event) {
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
    replacePageContent(renderDashboard(state.dashboard));
  } else if (el.id === "trend-metric") {
    state.trendMetric = el.value;
    state.trendOpen = true;
    replacePageContent(renderDashboard(state.dashboard));
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
function registerEvents() {
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
registerEvents();
init();
