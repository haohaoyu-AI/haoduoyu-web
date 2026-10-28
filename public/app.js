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
  { id: "dashboard", label: "数据总览", icon: "grid" },
  { id: "articles", label: "文章详情", icon: "articles" },
  { id: "reviews", label: "数据", icon: "chart" },
  { id: "todos", label: "每日待办", icon: "check" },
  { id: "notes", label: "碎碎念", icon: "edit" },
  { id: "memos", label: "备忘录", icon: "articles" },
  { id: "reminders", label: "工作提醒", icon: "calendar" },
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
  status: "published",
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
var defaultColumns = ["account", "reads", "likes", "comments", "as_of"];

// web/core/state.mjs
var state = {
  me: null,
  savedViews: [],
  accounts: [],
  accountProfiles: [],
  page: "dashboard",
  settingsTab: "accounts",
  account: "",
  overviewPeriod: "yesterday",
  trendOpen: false,
  attentionExpanded: false,
  reviewTab: "observations",
  reviewArticles: [],
  articles: [],
  articleOverviewMode: "published",
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
function requestKey(path, options2, envelope2) {
  const settings = {};
  for (const key of Object.keys(options2).sort()) {
    if (key === "signal") continue;
    const value = options2[key];
    if (key === "headers") settings.headers = [...new Headers(value)].sort(([a], [b]) => a.localeCompare(b));
    else if (value == null || ["string", "number", "boolean", "undefined"].includes(typeof value)) settings[key] = value;
    else return null;
  }
  return JSON.stringify([runtime.sessionEpoch, runtime.articleIndexGeneration, state.me, path, envelope2, settings]);
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
function pendingGet(path, options2, envelope2, context, factory) {
  assertRequestActive(context, options2.signal);
  const key = requestKey(path, options2, envelope2) ?? /* @__PURE__ */ Symbol("unshared request");
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
  const stamp2 = Date.parse(value), diff = Date.now() - stamp2;
  return !Number.isFinite(stamp2) ? "未记录" : diff >= 0 && diff < 864e5 ? `${Math.floor(diff / 36e5)} 小时前` : time(value, bjtDate(value).slice(0, 4) === bjtDate().slice(0, 4));
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
  const today2 = bjtDate(now), changed4 = todosState.today !== today2;
  todosState.today = today2;
  return changed4;
}
function todoSessionActive(owner2) {
  return Boolean(state.me) && owner2 === todoOwner() && owner2 === todosState.owner;
}
function mergeTodo(day4, item) {
  const index = day4.items.findIndex((row) => row.id === item.id);
  if (index < 0) day4.items.push(item);
  else if (day4.items[index].version <= item.version) day4.items[index] = item;
}
function todoTemplateAdded(day4, id) {
  return day4.items.some((item) => item.date === day4.date && item.template_id === id && !item.deleted_at);
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
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h3m4 0h3"/>',
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
  const content2 = $("#page-content");
  if (!content2) return;
  content2.innerHTML = html;
  applyChartStyles(content2);
  if (animate) animatePageEntry(content2);
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
function popover(trigger, body2, { menu = false, label: label3 = "说明" } = {}) {
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
  node.innerHTML = body2;
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
function openModal(title, body2, { drawer = false, context = "" } = {}) {
  cancelModalRequests();
  closePopover();
  runtime.modalRequestVersion++;
  if (!$("#overlay").contains(document.activeElement)) runtime.lastFocus = document.activeElement;
  $("#overlay").innerHTML = `<div class="modal-backdrop ${drawer ? "drawer-backdrop" : ""}"><section class="modal ${drawer ? "drawer" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><div>${context}<h2 id="modal-title">${e(title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon("close", 20)}</button></header><div class="modal-body">${body2}</div></section></div>`;
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

// web/offline/db.mjs
var OFFLINE_STORES = Object.freeze(["entities", "outbox", "conflicts", "meta"]);
function entityKey(scope, id) {
  if (typeof scope !== "string" || !scope || typeof id !== "string" || !id) {
    throw new TypeError("Offline records require an explicit scope and identity");
  }
  return JSON.stringify([scope, id]);
}
function offlineValue(entity) {
  const value = entity?.dirty ? entity.local : entity?.server;
  if (entity?.entity_id?.startsWith("todo:") && value && [0, 1].includes(value.completed)) {
    return { ...value, completed: value.completed === 1 };
  }
  return value;
}
function assertOfflineData(value) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object" || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError("Offline storage accepts plain data only");
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:authorization|cookie|headers|csrf[_-]?token|access[_-]?token|token|password|__proto__|constructor|prototype)$/i.test(key)) {
      throw new TypeError("Credentials cannot be persisted in the offline database");
    }
    assertOfflineData(child);
  }
}
function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transactionAPI(transaction, schedule) {
  const store = (name) => transaction.objectStore(name);
  return {
    get: (name, key) => schedule(() => store(name).get(key)),
    getAll: (name) => schedule(() => store(name).getAll()),
    put(name, value) {
      assertOfflineData(value);
      if (typeof value.key !== "string") throw new TypeError("Offline record key is required");
      return schedule(() => store(name).put(value));
    },
    delete: (name, key) => schedule(() => store(name).delete(key))
  };
}
function keepTransactionAlive(transaction, name) {
  let stopped = false, finished = false;
  const queue = [];
  const schedule = (operation2) => new Promise((resolve, reject) => {
    queue.push({ operation: operation2, resolve, reject });
  });
  function pulse() {
    if (stopped) return;
    const request = transaction.objectStore(name).count();
    request.onsuccess = () => {
      if (stopped) return;
      for (const task of queue.splice(0)) {
        try {
          idbRequest(task.operation()).then(task.resolve, task.reject);
        } catch (error) {
          task.reject(error);
        }
      }
      if (!finished || queue.length) pulse();
    };
  }
  pulse();
  return { schedule, finish: () => {
    finished = true;
  }, stop: () => {
    stopped = true;
    for (const task of queue.splice(0)) task.reject(new Error("Offline transaction ended"));
  } };
}
function idbTransaction(database, names, mode, callback) {
  return new Promise((resolve, reject) => {
    let tx, result, finished = false;
    try {
      tx = database.transaction(names, mode, { durability: "strict" });
    } catch {
      tx = database.transaction(names, mode);
    }
    const keeper = keepTransactionAlive(tx, names[0]);
    const timer = setTimeout(() => {
      keeper.stop();
      try {
        tx.abort();
      } catch {
      }
    }, 1e4);
    const done = () => {
      keeper.stop();
      clearTimeout(timer);
    };
    tx.oncomplete = () => {
      done();
      finished ? resolve(result) : reject(new Error("Offline transaction became inactive"));
    };
    tx.onabort = () => {
      done();
      reject(tx.error || new Error("Offline transaction aborted"));
    };
    tx.onerror = () => {
    };
    Promise.resolve().then(() => callback(transactionAPI(tx, keeper.schedule))).then((value) => {
      result = value;
      finished = true;
      keeper.finish();
    }).catch((error) => {
      done();
      try {
        tx.abort();
      } catch {
      }
      reject(error);
    });
  });
}
function openOfflineDB({ indexedDB = globalThis.indexedDB, name = "haoduoyu-offline" } = {}) {
  if (!indexedDB) return Promise.reject(new Error("IndexedDB is unavailable; changes have not been saved"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let blocked2 = false;
    request.onupgradeneeded = () => {
      for (const store of OFFLINE_STORES) {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, { keyPath: "key" });
        }
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked2 = true;
      reject(new Error("Close the other tab before upgrading offline storage"));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked2) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve({
        transaction: (names, mode, callback) => idbTransaction(database, names, mode, callback),
        close: () => database.close()
      });
    };
  });
}
function createMemoryDB() {
  let tables = Object.fromEntries(OFFLINE_STORES.map((name) => [name, /* @__PURE__ */ new Map()]));
  let tail = Promise.resolve();
  function transaction(names, mode, callback) {
    const work = tail.then(async () => {
      const next = structuredClone(tables);
      const table2 = (name) => {
        if (!names.includes(name) || !next[name]) throw new Error("Store outside transaction");
        return next[name];
      };
      const api2 = {
        get: async (name, key) => structuredClone(table2(name).get(key)),
        getAll: async (name) => structuredClone([...table2(name).values()]),
        put: async (name, value) => {
          if (mode !== "readwrite") throw new Error("Readonly transaction");
          assertOfflineData(value);
          if (typeof value.key !== "string") throw new TypeError("Offline record key is required");
          table2(name).set(value.key, structuredClone(value));
        },
        delete: async (name, key) => {
          if (mode !== "readwrite") throw new Error("Readonly transaction");
          table2(name).delete(key);
        }
      };
      const result = await callback(api2);
      if (mode === "readwrite") tables = next;
      return result;
    });
    tail = work.catch(() => {
    });
    return work;
  }
  return { transaction, close() {
  } };
}

// web/offline/document.mjs
var localMarker = /* @__PURE__ */ Symbol("haoduoyu-local-durable-document");
var documents = /* @__PURE__ */ new WeakMap();
function localDocument({ local, server = null, operation: operation2 = null, conflict = null }) {
  const { content_hash, change_seq, ...value } = structuredClone(local);
  const document2 = Object.freeze({ ...value, [localMarker]: true });
  documents.set(document2, {
    local: value,
    server: structuredClone(server),
    operation: structuredClone(operation2),
    conflict: structuredClone(conflict)
  });
  return document2;
}
var isLocalDocument = (value) => Boolean(value && documents.has(value));
var documentValue = (value) => documents.get(value)?.local || value;
var documentState = (value) => documents.get(value) || null;

// web/offline/notes.mjs
var uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var hashPattern = /^[a-f0-9]{64}$/;
var isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
var fail = (message, code) => Object.assign(new Error(message), { code });
var missing = () => fail("此记录尚未完整保存在本机，请联网读取一次。", "OFFLINE_CACHE_MISS");
var validDay = (value) => typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
var timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
var noteEntity = (row) => row?.entity_id?.startsWith("note-entry:");
var removed = (row) => Boolean(row && (row.deleted || row.deleted_at));
var liveOperation = (row) => !["acked", "archived"].includes(row.status);
function noteReadRoute(path) {
  const url = new URL(path, "https://offline.invalid"), query = url.searchParams;
  if (url.origin !== "https://offline.invalid" || url.hash) return null;
  if (url.pathname === "/note-entries" && [...query.keys()].every((key) => ["category", "date"].includes(key)) && query.getAll("category").length === 1 && query.getAll("date").length === 1 && ["life", "work"].includes(query.get("category")) && validDay(query.get("date")))
    return { kind: "note_entries", date: query.get("date"), category: query.get("category") };
  const match = /^\/note-entries\/([^/]+)$/.exec(url.pathname);
  return match && !url.search && uuidPattern.test(match[1]) ? { kind: "note_entry", id: match[1].toLowerCase() } : null;
}
function isNoteApiRow(row) {
  return Boolean(isObject(row) && !Object.hasOwn(row, "entity_type") && uuidPattern.test(row.id) && ["life", "work"].includes(row.category) && validDay(row.date) && typeof row.text === "string" && new TextEncoder().encode(row.text).byteLength <= 65536 && Number.isSafeInteger(row.version) && row.version >= 1 && typeof row.deleted === "boolean" && typeof row.can_edit === "boolean" && timestamp(row.created_at) && timestamp(row.updated_at) && (row.deleted_at === null || timestamp(row.deleted_at)) && row.deleted === (row.deleted_at !== null) && Number.isSafeInteger(row.change_seq) && row.change_seq >= 0 && hashPattern.test(row.content_hash));
}
function awareLabel(row) {
  return row?.labels_version === 1 && Object.hasOwn(row, "label") && (row.label === null || typeof row.label === "string" && row.label.isWellFormed() && row.category === "life" && row.label === row.label.trim().normalize("NFC") && row.label.length > 0 && [...row.label].length <= 32 && !["生活", "工作"].includes(row.label) && !/[\u0000-\u001f\u007f]/.test(row.label));
}
function checkedResponse(route, value, labelsV1) {
  const invalid3 = () => fail("碎碎念读取结果不完整，未覆盖本机内容。", "OFFLINE_RESPONSE_INVALID");
  if (route.kind === "note_entry") {
    if (!isNoteApiRow(value) || value.id !== route.id || labelsV1 && !awareLabel(value)) throw invalid3();
    return structuredClone(value);
  }
  if (!isObject(value) || labelsV1 && value.labels_version !== 1 || value.category !== route.category || value.date !== route.date || typeof value.can_edit !== "boolean" || !Array.isArray(value.entries) || value.entries.length > 200) throw invalid3();
  const ids = /* @__PURE__ */ new Set();
  for (const row of value.entries) {
    if (!isNoteApiRow(row) || labelsV1 && !awareLabel(row) || row.category !== route.category || row.date !== route.date || row.deleted || row.can_edit !== value.can_edit || ids.has(row.id)) throw invalid3();
    ids.add(row.id);
  }
  return structuredClone(value);
}
function inRoute(entity, route) {
  if (!noteEntity(entity)) return false;
  if (route.kind === "note_entry") return entity.entity_id === "note-entry:" + route.id;
  const row = entity.dirty ? entity.local : entity.server || entity.api_server;
  return row?.category === route.category && row?.date === route.date;
}
function serverFence(rows, route, owner2) {
  return JSON.stringify(rows.filter((row) => row.scope === owner2 && inRoute(row, route)).map((row) => [row.entity_id, row.server || null, row.api_server || null, row.remote_missing === true]).sort((a, b) => a[0].localeCompare(b[0])));
}
function localValue(entity, capability) {
  const row = entity.dirty ? entity.local : entity.server;
  if (!row || !uuidPattern.test(row.id || row.source_id) || !["life", "work"].includes(row.category) || !validDay(row.date) || !Number.isSafeInteger(row.version) || row.version < 1) throw missing();
  if (!removed(row) && typeof row.text !== "string") throw missing();
  const evidence = entity.label_evidence;
  const matches2 = evidence && evidence.version === row.version && evidence.category === row.category && evidence.date === row.date && evidence.created_at === row.created_at;
  return {
    id: row.id || row.source_id,
    category: row.category,
    date: row.date,
    ...awareLabel(row) ? { labels_version: 1, label: row.label } : matches2 ? { labels_version: 1, label: evidence.label } : {},
    text: typeof row.text === "string" ? row.text : entity.local?.text ?? entity.api_server?.text ?? "",
    version: row.version,
    deleted: removed(row),
    can_edit: capability === true,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}
function realServer(entity) {
  if (isNoteApiRow(entity.server)) return entity.server;
  return isNoteApiRow(entity.api_server) ? entity.api_server : null;
}
function projectEntity(entity, capability, operations2, conflicts) {
  const local = localValue(entity, capability), server = realServer(entity);
  if (!entity.dirty && server?.version === local.version && server.deleted === local.deleted && (server.deleted || server.text === local.text)) {
    if (awareLabel(server) && local.labels_version === 1 && server.label !== local.label)
      throw fail("标签记录发生变化，请联网核对。", "OFFLINE_CACHE_CHANGED");
    return {
      ...structuredClone(server),
      ...local.labels_version === 1 ? { labels_version: 1, label: local.label } : {},
      can_edit: capability === true
    };
  }
  const pending = operations2.filter((row) => row.entity_id === entity.entity_id && liveOperation(row)).sort((a, b) => a.seq - b.seq).at(-1);
  const conflict = conflicts.find((row) => row.key === entity.conflict && row.resolved_at === null) || conflicts.filter((row) => row.entity_id === entity.entity_id && row.resolved_at === null).at(-1) || null;
  return localDocument({
    local,
    server: entity.dirty ? server : null,
    operation: entity.dirty ? pending || null : null,
    conflict: entity.dirty ? conflict : null
  });
}
function notesContext({ db, getScope, getGeneration = () => 0, now = Date.now, labelsV1 = false }) {
  const capture = () => {
    const scope = getScope();
    if (!scope) throw fail("请先联网核实身份，本机内容已保留。", "OFFLINE_SCOPE_REQUIRED");
    const generation = getGeneration();
    return { scope, active() {
      if (getScope() !== scope || getGeneration() !== generation)
        throw fail("身份范围已变化，本机内容未覆盖。", "OFFLINE_SCOPE_CHANGED");
    } };
  };
  const load = (tx, scope) => Promise.all(["entities", "outbox", "conflicts"].map((store) => tx.getAll(store))).then((rows) => Object.fromEntries(["entities", "outbox", "conflicts"].map((name, index) => [name, rows[index].filter((row) => row.scope === scope)])));
  const capabilityKey = (scope) => entityKey(scope, "capability:note-entry");
  return { db, capture, load, capabilityKey, now, labelsV1 };
}
function readingMethods(context) {
  const { db, capture, load, capabilityKey } = context;
  async function capability() {
    const owner2 = capture();
    const record = await db.transaction(["meta"], "readonly", (tx) => tx.get("meta", capabilityKey(owner2.scope)));
    owner2.active();
    return record?.scope === owner2.scope && typeof record.can_edit === "boolean" ? record.can_edit : null;
  }
  async function read(path, route = noteReadRoute(path)) {
    if (!route) throw missing();
    const owner2 = capture();
    const result = await db.transaction(["entities", "outbox", "conflicts", "meta"], "readonly", async (tx) => {
      owner2.active();
      const rows = await load(tx, owner2.scope), cap = await tx.get("meta", capabilityKey(owner2.scope));
      const capability2 = cap?.scope === owner2.scope ? cap.can_edit : null;
      const cached = await tx.get("meta", entityKey(owner2.scope, "get:" + path));
      const snapshot = await tx.get("meta", entityKey(owner2.scope, "snapshot"));
      const complete = snapshot?.value?.index?.complete === true && snapshot.value.index.scope_id === owner2.scope;
      const entities = rows.entities.filter((row) => inRoute(row, route) && (row.dirty || !row.remote_missing && row.server));
      if (route.kind === "note_entry") {
        if (!entities.length) throw missing();
        owner2.active();
        return {
          data: projectEntity(entities[0], capability2, rows.outbox, rows.conflicts),
          saved_at: cached?.saved_at || snapshot?.value?.verified_at || null
        };
      }
      if (!cached && !complete && !entities.some((row) => row.dirty)) throw missing();
      if (complete && Array.isArray(snapshot.value.index.entities)) {
        const present = new Set(entities.map((row) => row.entity_id));
        if (snapshot.value.index.entities.some((row) => row.entity_id?.startsWith("note-entry:") && row.date === route.date && row.entity_type === route.category + "_note" && !row.deleted_at && !present.has(row.entity_id)))
          throw missing();
      }
      const entries = entities.filter((row) => !removed(row.dirty ? row.local : row.server)).map((row) => projectEntity(row, capability2, rows.outbox, rows.conflicts));
      if (entries.length > 200) throw fail("本机当日记录较多，原文已保留，请联网核对。", "OFFLINE_CACHE_LIMIT");
      entries.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || a.id.localeCompare(b.id));
      owner2.active();
      return {
        data: {
          category: route.category,
          date: route.date,
          can_edit: capability2 === true,
          entries,
          ...!cached && !complete ? { offline_partial: true } : {}
        },
        saved_at: cached?.saved_at || snapshot?.value?.verified_at || null
      };
    });
    owner2.active();
    return result;
  }
  async function fence(pathOrRoute) {
    const route = typeof pathOrRoute === "string" ? noteReadRoute(pathOrRoute) : pathOrRoute, owner2 = capture();
    if (!route) throw missing();
    const result = await db.transaction(["entities"], "readonly", async (tx) => serverFence(await tx.getAll("entities"), route, owner2.scope));
    owner2.active();
    return result;
  }
  return { read, capability, fence };
}
function writingMethods(context) {
  const { db, capture, capabilityKey, now } = context;
  async function write(path, route, value, { baseline } = {}) {
    route ||= noteReadRoute(path);
    if (!route) throw missing();
    const owner2 = capture(), data = checkedResponse(route, value, context.labelsV1);
    const incoming = route.kind === "note_entry" ? [data] : data.entries;
    await db.transaction(["entities", "meta"], "readwrite", async (tx) => {
      owner2.active();
      const rows = await tx.getAll("entities");
      if (baseline !== void 0 && baseline !== serverFence(rows, route, owner2.scope))
        throw fail("本机刚确认了新版本，请重新读取完整记录。", "OFFLINE_CACHE_CHANGED");
      const found = new Set(incoming.map((row) => "note-entry:" + row.id));
      if (route.kind === "note_entries") for (const old of rows) {
        if (old.scope === owner2.scope && inRoute(old, route) && !found.has(old.entity_id))
          await tx.put("entities", { ...old, remote_missing: true });
      }
      for (const row of incoming) {
        const entity_id = "note-entry:" + row.id, key = entityKey(owner2.scope, entity_id);
        const old = await tx.get("entities", key);
        if (Math.max(old?.server?.version || 0, old?.api_server?.version || 0) > row.version)
          throw fail("读取结果早于本机已确认版本，原文已保留。", "OFFLINE_CACHE_CHANGED");
        const proof = awareLabel(row) ? {
          version: row.version,
          category: row.category,
          date: row.date,
          created_at: row.created_at,
          label: row.label
        } : null;
        if (proof && old?.label_evidence && (old.label_evidence.version > proof.version || old.label_evidence.version === proof.version && JSON.stringify(old.label_evidence) !== JSON.stringify(proof)))
          throw fail("标签证据已变化，请联网核对。", "OFFLINE_CACHE_CHANGED");
        await tx.put("entities", {
          ...old,
          key,
          scope: owner2.scope,
          entity_id,
          server: row,
          api_server: row,
          ...proof ? { label_evidence: proof } : {},
          remote_missing: false
        });
      }
      await tx.put("meta", { key: entityKey(owner2.scope, "get:" + path), scope: owner2.scope, path, data, saved_at: now() });
      await tx.put("meta", { key: capabilityKey(owner2.scope), scope: owner2.scope, can_edit: data.can_edit, verified_at: now() });
      owner2.active();
    });
    owner2.active();
    const result = await context.read(path, route);
    owner2.active();
    return result.data;
  }
  async function captureAcknowledged() {
    const owner2 = capture();
    const count = await db.transaction(["entities"], "readwrite", async (tx) => {
      owner2.active();
      let count2 = 0;
      for (const entity of await tx.getAll("entities")) {
        if (entity.scope !== owner2.scope || !noteEntity(entity) || !isNoteApiRow(entity.server) || entity.api_server?.version > entity.server.version) continue;
        await tx.put("entities", { ...entity, api_server: structuredClone(entity.server) });
        count2++;
      }
      owner2.active();
      return count2;
    });
    owner2.active();
    return count;
  }
  return { write, captureAcknowledged };
}
function createNotesCache(options2) {
  const context = notesContext(options2);
  const reading = readingMethods(context);
  Object.assign(context, reading);
  return { ...reading, ...writingMethods(context) };
}

// web/offline/read-only.mjs
var day = (value) => typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
var missing2 = () => Object.assign(new Error("此内容尚未完整缓存在本机，请联网读取。"), { code: "OFFLINE_CACHE_MISS" });
function readOnlyRoute(path) {
  const url = new URL(path, "https://offline.invalid"), query = url.searchParams;
  if (url.origin !== "https://offline.invalid" || url.hash) return null;
  if (url.pathname === "/work-reminders" && [...query.keys()].every((key) => key === "date") && query.getAll("date").length === 1 && day(query.get("date"))) return { kind: "reminders", date: query.get("date") };
  if (!["/note-entries/dates", "/daily-notes/dates"].includes(url.pathname) || [...query.keys()].some((key) => !["category", "before", "page_size"].includes(key) || query.getAll(key).length !== 1) || query.has("category") && !["life", "work"].includes(query.get("category")) || query.has("before") && !day(query.get("before"))) return null;
  const size = query.get("page_size") || "30";
  if (!/^[1-9]\d*$/.test(size) || Number(size) > 100) return null;
  return {
    kind: "dates",
    source: url.pathname.startsWith("/daily-notes") ? "legacy" : "note_entry",
    category: query.get("category") || "life",
    before: query.get("before"),
    size: Number(size)
  };
}
function matches(entity, route) {
  if (route.kind === "reminders") return entity.entity_id.startsWith("work-reminder:");
  return route.source === "legacy" ? entity.entity_id.startsWith("legacy-" + route.category + ":") : entity.entity_id.startsWith("note-entry:");
}
async function readOnlySnapshot({ db, scope, route, getScope, getGeneration }) {
  const generation = getGeneration();
  const result = await db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const snapshot = await tx.get("meta", entityKey(scope, "snapshot")), index = snapshot?.value?.index;
    if (index?.complete !== true || index.scope_id !== scope) throw missing2();
    const rows = (await tx.getAll("entities")).filter((row) => row.scope === scope && matches(row, route));
    for (const expected of index.entities.filter((row) => matches(row, route) && !row.deleted_at)) {
      if (!rows.some((row) => row.entity_id === expected.entity_id && row.server)) throw missing2();
    }
    const active5 = rows.filter((row) => row.dirty || !row.remote_missing).map((row) => route.source === "note_entry" && row.dirty ? row.local : row.server).filter((row) => row && !row.deleted && !row.deleted_at);
    let data;
    if (route.kind === "reminders") {
      const items = active5.filter((row) => row.date === route.date).map((row) => {
        if (typeof row.summary !== "string" || !Number.isFinite(Date.parse(row.updated_at))) throw missing2();
        return {
          id: row.id || row.source_id,
          date: row.date,
          summary: row.summary,
          source_key: row.source_key,
          version: row.version,
          updated_at: row.updated_at
        };
      });
      data = { date: route.date, can_edit: false, items, snapshot_complete: true };
    } else {
      const dates = [...new Set(active5.filter((row) => row.category === route.category && day(row.date) && (route.source !== "legacy" || typeof row.text === "string" && row.text !== "") && (!route.before || row.date < route.before)).map((row) => row.date))].sort().reverse();
      const selected = dates.slice(0, route.size), has_more = dates.length > route.size;
      data = { dates: selected, has_more, next_before: has_more ? selected.at(-1) : null, snapshot_complete: true };
    }
    return { data, saved_at: snapshot.value.verified_at || null };
  });
  if (scope !== getScope() || generation !== getGeneration()) throw missing2();
  return result;
}

// web/offline/cache.mjs
var dayPattern = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
var uuidPattern2 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var clone = (value) => structuredClone(value);
var missing3 = () => Object.assign(new Error("此内容尚未保存在本机，请联网读取一次。"), { code: "OFFLINE_CACHE_MISS" });
var active = (row) => row && !row.deleted && !row.deleted_at;
function offlineReadRoute(path) {
  const url = new URL(path, "https://offline.invalid");
  if (url.origin !== "https://offline.invalid" || url.hash) return null;
  const route = url.pathname, query = url.searchParams;
  if (["/work-reminders", "/note-entries/dates", "/daily-notes/dates"].includes(route)) return readOnlyRoute(path);
  if (route === "/todos" && [...query.keys()].every((key) => key === "date") && query.getAll("date").length === 1 && dayPattern.test(query.get("date"))) return { kind: "todo", date: query.get("date") };
  if (route === "/unscheduled-todos" && !url.search) return { kind: "unscheduled_todo" };
  if (route === "/todo-templates" && !url.search) return { kind: "template" };
  if (route === "/accounts" && !url.search) return { kind: "accounts" };
  if (route === "/overview") return { kind: "overview" };
  if (route === "/daily-notes" && query.getAll("date").length === 1 && dayPattern.test(query.get("date")) && [...query.keys()].every((key) => ["date", "category"].includes(key)) && query.getAll("category").length <= 1 && (!query.has("category") || ["life", "work"].includes(query.get("category"))))
    return { kind: "legacy", date: query.get("date"), category: query.get("category") || "life" };
  if (route === "/note-entries" || route.startsWith("/note-entries/")) return noteReadRoute(path);
  if (route === "/memos" && !url.search) return { kind: "memos" };
  if (/^\/memos\/notes\/[a-f0-9-]{36}$/i.test(route)) return { kind: "memo_note" };
  return null;
}
function safeIdentity(value) {
  if (!value || typeof value.id !== "string" || !value.id || typeof value.username !== "string")
    throw new Error("身份读取不完整，未启用本机数据。");
  return { id: value.id, username: value.username, ...value.publicBusiness === true ? { publicBusiness: true } : {} };
}
var identityFingerprint = (value) => JSON.stringify([value.id, value.publicBusiness === true]);
function safeAccounts(value) {
  if (!Array.isArray(value)) throw new Error("账户读取不完整。");
  if (value.some((row) => !row || ![0, 1].includes(row.active))) throw new Error("账户状态读取不完整。");
  const fields5 = ["id", "name", "platform", "active", "account_name", "position", "created_at", "updated_at"];
  return value.map((row) => Object.fromEntries(fields5.filter((key) => row[key] !== void 0).map((key) => [key, row[key]])));
}
function checkedResponse2(route, value) {
  const invalid3 = () => Object.assign(new Error("读取结果不完整，未覆盖本机数据。"), { code: "OFFLINE_RESPONSE_INVALID" });
  if (value === void 0 || value === null) throw invalid3();
  if (["todo", "template", "unscheduled_todo"].includes(route.kind) && (!Array.isArray(value.items) || value.items.some((row) => !row || !uuidPattern2.test(row.id) || !Number.isSafeInteger(row.version) || row.version < 1 || typeof row.text !== "string" || !row.text.trim() || row.text.length > 500 || !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.updated_at)) || route.kind === "todo" && (row.date !== route.date || typeof row.completed !== "boolean" || row.deleted_at !== null) || route.kind === "unscheduled_todo" && (typeof row.completed !== "boolean" || row.deleted_at !== null || Object.hasOwn(row, "date")))))
    throw invalid3();
  return route.kind === "accounts" ? safeAccounts(value) : clone(value);
}
function belongs(row, route) {
  const value = offlineValue(row);
  return row.entity_id.startsWith(route.kind + ":") && value && (route.kind !== "todo" || value.date === route.date);
}
function todoFence(value) {
  if (!value) return null;
  return [
    value.id || value.source_id,
    value.date,
    value.text ?? null,
    value.completed === true || value.completed === 1,
    value.version,
    value.created_at,
    value.updated_at,
    value.deleted_at ?? null,
    Boolean(value.deleted || value.deleted_at),
    value.template_id ?? null,
    value.template_version ?? null,
    value.template_active ?? null
  ];
}
function serverFence2(rows, route, owner2) {
  if (!["todo", "template", "unscheduled_todo"].includes(route.kind)) return null;
  return JSON.stringify(rows.filter((row) => row.scope === owner2 && belongs(row, route)).map((row) => [row.entity_id, route.kind === "todo" ? todoFence(row.server) : row.server || null, row.remote_missing === true]).sort((a, b) => a[0].localeCompare(b[0])));
}
function overlay(value, route, entities, dirtyOnly) {
  if (!["todo", "template", "unscheduled_todo"].includes(route.kind)) return value;
  const items = new Map(value.items.map((row) => [row.id, row]));
  for (const entity of entities) {
    if (!belongs(entity, route) || dirtyOnly && !entity.dirty) continue;
    const row = offlineValue(entity);
    if (active(row) && !entity.remote_missing || entity.dirty && active(row)) items.set(row.id, clone(row));
    else items.delete(row.id);
  }
  return { ...value, items: [...items.values()].filter(active).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || a.id.localeCompare(b.id)) };
}
function identityMethods(db, now) {
  const key = JSON.stringify(["haoduoyu-offline", "last-verified-identity"]);
  return {
    readIdentity: () => db.transaction(["meta"], "readonly", (tx) => tx.get("meta", key)),
    async saveIdentity(me, scope) {
      const identity4 = safeIdentity(me);
      await db.transaction(["meta"], "readwrite", (tx) => tx.put("meta", { key, identity: identity4, scope, verified_at: now() }));
      return identity4;
    },
    forgetIdentity: () => db.transaction(["meta"], "readwrite", (tx) => tx.delete("meta", key))
  };
}
async function legacySnapshot(db, owner2, route) {
  return db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const v1 = await tx.get("meta", entityKey(owner2, "snapshot"));
    const v2 = await tx.get("meta", entityKey(owner2, "snapshot-v2"));
    const snapshot = (v2?.value?.verified_at || 0) >= (v1?.value?.verified_at || 0) ? v2 || v1 : v1;
    if (snapshot?.value?.index?.complete !== true || snapshot.value.index.scope_id !== owner2) throw missing3();
    const entity = await tx.get("entities", entityKey(owner2, "legacy-" + route.category + ":" + route.date));
    const row = !entity?.remote_missing && entity?.server;
    if (!row && snapshot.value.index.entities?.some((value) => value.entity_id === "legacy-" + route.category + ":" + route.date)) throw missing3();
    if (row && (!Number.isSafeInteger(row.version) || row.version < 1 || !row.deleted_at && typeof row.text !== "string")) throw missing3();
    const data = {
      date: route.date,
      text: row?.text || "",
      version: row?.version || 0,
      updated_at: row?.updated_at || null,
      deleted: Boolean(row?.deleted_at),
      can_edit: false,
      snapshot_complete: true
    };
    return { data, saved_at: snapshot.value.verified_at || null };
  });
}
function createOfflineCache({ db, getScope, now = Date.now, getGeneration = () => 0, labelsV1 = false }) {
  const notes = createNotesCache({ db, getScope, now, getGeneration, labelsV1 });
  const scope = () => {
    const value = getScope();
    if (!value) throw Object.assign(new Error("请先联网核实当前身份，本机内容已保留。"), { code: "OFFLINE_SCOPE_REQUIRED" });
    return value;
  };
  async function write(path, value, { baseline } = {}) {
    const route = offlineReadRoute(path);
    if (!route) return value;
    if (["note_entries", "note_entry"].includes(route.kind)) return notes.write(path, route, value, { baseline });
    const owner2 = scope(), generation = getGeneration(), data = checkedResponse2(route, value), key = entityKey(owner2, "get:" + path);
    const active5 = () => {
      if (scope() !== owner2 || getGeneration() !== generation)
        throw Object.assign(new Error("身份范围已变化，本次读取未保存。"), { code: "OFFLINE_SCOPE_CHANGED" });
    };
    await db.transaction(["meta", "entities"], "readwrite", async (tx) => {
      active5();
      const rows = await tx.getAll("entities");
      if (baseline !== void 0 && baseline !== serverFence2(rows, route, owner2))
        throw Object.assign(new Error("本机刚同步了新版本，请重新读取完整列表。"), { code: "OFFLINE_CACHE_CHANGED" });
      await tx.put("meta", { key, scope: owner2, path, data, saved_at: now() });
      if (!["todo", "template", "unscheduled_todo"].includes(route.kind)) {
        active5();
        return;
      }
      const found = new Set(data.items.map((row) => row.id));
      for (const old of rows) {
        if (old.scope === owner2 && belongs(old, route) && !found.has(offlineValue(old).id))
          await tx.put("entities", { ...old, remote_missing: true });
      }
      for (const row of data.items) {
        const entity_id = route.kind + ":" + row.id, storageKey = entityKey(owner2, entity_id);
        const old = await tx.get("entities", storageKey);
        if (old?.server?.version > row.version)
          throw Object.assign(new Error("读取结果早于本机已确认版本，请重新读取。"), { code: "OFFLINE_CACHE_CHANGED" });
        await tx.put("entities", {
          ...old,
          key: storageKey,
          scope: owner2,
          entity_id,
          server: row,
          remote_missing: false,
          ...route.kind === "todo" ? { needs_api_refresh: false } : {}
        });
      }
      active5();
    });
    const result = overlay(route.kind === "accounts" ? value : data, route, await entities(owner2), true);
    active5();
    return result;
  }
  const entities = (owner2) => db.transaction(["entities"], "readonly", async (tx) => (await tx.getAll("entities")).filter((row) => row.scope === owner2));
  async function read(path) {
    const route = offlineReadRoute(path);
    if (!route) throw missing3();
    if (["note_entries", "note_entry"].includes(route.kind)) return notes.read(path, route);
    const owner2 = scope(), generation = getGeneration();
    const cached = await db.transaction(["meta"], "readonly", (tx) => tx.get("meta", entityKey(owner2, "get:" + path)));
    if (["reminders", "dates"].includes(route.kind)) {
      try {
        return await readOnlySnapshot({ db, scope: owner2, route, getScope, getGeneration });
      } catch (error) {
        if (error.code !== "OFFLINE_CACHE_MISS" || !cached) throw error;
      }
    }
    if (!cached || cached.data === void 0) {
      if (route.kind === "legacy") {
        const result2 = await legacySnapshot(db, owner2, route);
        if (scope() !== owner2 || getGeneration() !== generation) throw missing3();
        return result2;
      }
      const local = ["todo", "unscheduled_todo"].includes(route.kind) ? (await entities(owner2)).filter((row) => row.dirty && belongs(row, route)) : [];
      if (!local.length) throw missing3();
      const data = route.kind === "todo" ? {
        date: route.date,
        today: new Date(now() + 8 * 36e5).toISOString().slice(0, 10),
        completed_mode: "strike",
        preferences_version: 0,
        items: [],
        offline_partial: true
      } : { items: [], offline_partial: true };
      if (scope() !== owner2 || getGeneration() !== generation) throw missing3();
      return { data: overlay(data, route, local, false), saved_at: null };
    }
    const result = route.kind === "legacy" ? { ...clone(cached.data), can_edit: false } : overlay(clone(cached.data), route, await entities(owner2), false);
    if (scope() !== owner2 || getGeneration() !== generation) throw missing3();
    return { data: result, saved_at: cached.saved_at };
  }
  const entity = (id) => db.transaction(["entities"], "readonly", (tx) => tx.get("entities", entityKey(scope(), id)));
  const fence = async (path) => {
    const route = offlineReadRoute(path);
    return ["note_entries", "note_entry"].includes(route?.kind) ? notes.fence(route) : serverFence2(await entities(scope()), route, scope());
  };
  return {
    read,
    write,
    entity,
    fence,
    entities: () => entities(scope()),
    noteCapability: notes.capability,
    captureDocuments: notes.captureAcknowledged,
    ...identityMethods(db, now)
  };
}

// web/offline/resolution-ledger.mjs
function resolutionParent(rows, operation2) {
  return rows.find((row) => row.scope === operation2.scope && row.resolution?.id === operation2.resolution_id);
}
async function outstandingResolution(tx, conflict, acknowledgements = [], completedChild = null) {
  const children = new Set(conflict.resolution.conflict_keys || []), acked = new Set(acknowledgements.map((row) => row.operation_key));
  const pending = (await tx.getAll("outbox")).some((row) => row.scope === conflict.scope && row.resolution_id === conflict.resolution.id && !["acked", "archived"].includes(row.status) && !acked.has(row.key));
  const conflicts = (await tx.getAll("conflicts")).some((row) => row.scope === conflict.scope && row.resolved_at === null && row.key !== completedChild && (row.resolution_parent === conflict.key || children.has(row.key)));
  return { pending, conflicts };
}
async function finishParents(tx, conflict, time2) {
  let key = conflict.resolution_parent, completedChild = conflict.key;
  const seen = /* @__PURE__ */ new Set();
  while (key && !seen.has(key)) {
    seen.add(key);
    const parent = await tx.get("conflicts", key);
    if (!parent || parent.scope !== conflict.scope || !parent.resolution) return;
    const completed = [.../* @__PURE__ */ new Set([...parent.resolution.completed_children || [], completedChild])];
    const waiting = await outstandingResolution(tx, parent, parent.resolution.acknowledgements || [], completedChild);
    if (waiting.pending || waiting.conflicts) {
      await tx.put("conflicts", { ...parent, resolved_at: null, resolution: {
        ...parent.resolution,
        state: "conflict",
        completed_children: completed
      } });
      return;
    }
    await tx.put("conflicts", { ...parent, resolved_at: time2, resolution: {
      ...parent.resolution,
      completed_children: completed,
      state: "superseded",
      completed_by: conflict.key,
      completed_at: time2
    } });
    completedChild = parent.key;
    key = parent.resolution_parent;
  }
}
async function recordResolutionAck(tx, operation2, remote, time2) {
  if (!operation2.resolution_id) return;
  const conflict = resolutionParent(await tx.getAll("conflicts"), operation2);
  if ((operation2.protocol === 3 || operation2.protocol === 5) && (!conflict || conflict.key !== operation2.origin_conflict || conflict.resolved_at !== null || !conflict.resolution.operation_keys.includes(operation2.key)))
    throw Object.assign(new Error("本机选择凭据不完整，未确认此次保存。"), { code: "OFFLINE_DECISION_EVIDENCE_MISSING" });
  if (!conflict || conflict.resolved_at !== null || !conflict.resolution.operation_keys.includes(operation2.key)) return;
  const resolution2 = conflict.resolution;
  const acknowledgements = [
    ...(resolution2.acknowledgements || []).filter((row) => row.operation_key !== operation2.key),
    { operation_key: operation2.key, save_id: operation2.save_id, remote, acknowledged_at: time2 }
  ];
  const waiting = await outstandingResolution(tx, conflict, acknowledgements);
  const allAcknowledged = resolution2.operation_keys.every((key) => acknowledgements.some((row) => row.operation_key === key));
  const hasCompletedChildren = Boolean(resolution2.completed_children?.length);
  const complete = !waiting.pending && !waiting.conflicts && (allAcknowledged || hasCompletedChildren);
  const next = { ...conflict, resolved_at: complete ? time2 : null, resolution: {
    ...resolution2,
    acknowledgements,
    state: complete ? hasCompletedChildren ? "superseded" : "synced" : waiting.conflicts || hasCompletedChildren ? "conflict" : "queued",
    ...complete ? { completed_at: time2 } : {}
  } };
  await tx.put("conflicts", next);
  if (complete) await finishParents(tx, next, time2);
}
async function recordResolutionConflict(tx, operation2, child) {
  if (!operation2.resolution_id) return child;
  const parent = resolutionParent(await tx.getAll("conflicts"), operation2);
  if (!parent || parent.resolved_at !== null) return child;
  const keys = [.../* @__PURE__ */ new Set([...parent.resolution.conflict_keys || [], child.key])];
  await tx.put("conflicts", { ...parent, resolution: { ...parent.resolution, state: "conflict", conflict_keys: keys } });
  return { ...child, resolution_parent: parent.key };
}
async function recordResolutionFailure(tx, operation2, fields5) {
  if (!operation2.resolution_id) return;
  const conflict = resolutionParent(await tx.getAll("conflicts"), operation2);
  if (!conflict || conflict.resolved_at !== null) return;
  const waiting = await outstandingResolution(tx, conflict, conflict.resolution.acknowledgements || []);
  const state2 = waiting.conflicts || conflict.resolution.completed_children?.length ? "conflict" : fields5.status === "blocked" ? "blocked" : fields5.status === "paused" ? "paused" : "queued";
  await tx.put("conflicts", { ...conflict, resolution: {
    ...conflict.resolution,
    state: state2,
    last_error: fields5.error || null
  } });
}
async function finishServerResolution(tx, conflict, time2) {
  if (conflict.resolution?.state === "accepted-server") await finishParents(tx, conflict, time2);
}

// web/offline/conflict.mjs
function createConflictStore({ db, now = Date.now, canDispatch = () => true }) {
  async function record({ operation: operation2, remote = null, reason = "version" }) {
    return db.transaction(["entities", "outbox", "conflicts"], "readwrite", async (tx) => {
      const current2 = await tx.get("outbox", operation2.key);
      if (!current2 || current2.scope !== operation2.scope) throw new Error("Offline operation is no longer current");
      if (!canDispatch(operation2) || !canDispatch(current2)) return null;
      if (current2.claim_owner !== operation2.claim_owner || ["archived", "conflict"].includes(current2.status)) {
        throw new Error("Offline conflict claim changed");
      }
      const entity = await tx.get("entities", entityKey(operation2.scope, operation2.entity_id));
      const key = entityKey(operation2.scope, "conflict:" + operation2.id);
      let conflict = {
        key,
        scope: operation2.scope,
        entity_id: operation2.entity_id,
        operation: current2,
        local: entity?.local || operation2.local,
        remote,
        reason,
        created_at: now(),
        resolved_at: null
      };
      conflict = await recordResolutionConflict(tx, current2, conflict);
      await tx.put("conflicts", conflict);
      await tx.put("outbox", { ...current2, status: "conflict", error: reason });
      if (entity) await tx.put("entities", { ...entity, conflict: key, dirty: true });
      return conflict;
    });
  }
  const list = (scope) => db.transaction(["conflicts"], "readonly", async (tx) => (await tx.getAll("conflicts")).filter((value) => value.scope === scope && value.resolved_at === null));
  return { record, list };
}

// web/offline/conflict-plan.mjs
var prefixes = {
  unscheduled_todo: "unscheduled_todo:",
  todo: "todo:",
  template: "template:",
  note_entry: "note-entry:",
  memo_note: "memo-note:",
  memo_group: "memo-group:"
};
var uuidPattern3 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var clientIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
var removed2 = (value) => Boolean(value && (value.deleted || value.deleted_at));
var revision = (value) => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
var plain = (value) => typeof value === "string" && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
var invalid = () => {
  throw new TypeError("冲突内容不完整，请保留原文并重新核对。");
};
function checkedDay(value) {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const stamp2 = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(stamp2) || new Date(stamp2).toISOString().slice(0, 10) !== value) invalid();
  return value;
}
function shortText(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 500 || value.includes("\0")) invalid();
  return value.trim();
}
function longText(value) {
  if (!plain(value)) invalid();
  value = value.replace(/\r\n?/g, "\n");
  if (new TextEncoder().encode(value).length > 65536) invalid();
  return value;
}
function memoContent(local, type) {
  if (!plain(local.title) || !local.title.trim() || [...local.title.trim()].length > 120 || /[\r\n\t]/.test(local.title) || !Number.isSafeInteger(local.position) || local.position < 0 || local.position > 1e6) invalid();
  const value = { title: local.title.trim(), position: local.position };
  if (type === "memo_note") {
    if (!uuidPattern3.test(local.group_id)) invalid();
    Object.assign(value, { group_id: local.group_id.toLowerCase(), body: longText(local.body) });
  }
  return value;
}
function content(local, type) {
  if (!local || typeof local !== "object" || Array.isArray(local)) invalid();
  if (local.version !== void 0 && (!Number.isSafeInteger(local.version) || local.version < 0 || local.version >= Number.MAX_SAFE_INTEGER)) invalid();
  if (type === "unscheduled_todo") {
    if (typeof local.completed !== "boolean") invalid();
    return { text: shortText(local.text), completed: local.completed };
  }
  if (type === "todo") {
    if (typeof local.completed !== "boolean") invalid();
    return { date: checkedDay(local.date), text: shortText(local.text), completed: local.completed };
  }
  if (type === "template") return { text: shortText(local.text) };
  if (type === "note_entry") {
    if (!["life", "work"].includes(local.category)) invalid();
    return {
      category: local.category,
      date: checkedDay(local.date),
      text: longText(local.text),
      ...local.labels_version === 1 && local.label !== null ? { label: local.label } : {}
    };
  }
  return memoContent(local, type);
}
function contextFor({ conflict, remote, choice: choice2, uuid: uuid5 }) {
  const type = conflict?.operation?.entity_type, scope = conflict?.scope, prefix = prefixes[type];
  if (!prefix || !["use-server", "use-local", "keep-both"].includes(choice2) || typeof scope !== "string" || !scope) invalid();
  const entity = conflict.entity_id, pattern = ["todo", "template", "unscheduled_todo"].includes(type) ? clientIdPattern : uuidPattern3;
  if (typeof entity !== "string" || !entity.startsWith(prefix) || !pattern.test(entity.slice(prefix.length)) || conflict.operation.scope !== void 0 && conflict.operation.scope !== scope || conflict.operation.entity_id !== void 0 && conflict.operation.entity_id !== entity) invalid();
  const id = entity.slice(prefix.length).toLowerCase(), local = conflict.local;
  if (local?.id !== void 0 && local.id.toLowerCase?.() !== id || conflict.operation.source_id !== void 0 && conflict.operation.source_id.toLowerCase?.() !== id) invalid();
  if (remote && (typeof remote !== "object" || remote.id?.toLowerCase?.() !== id || !revision(remote.version))) invalid();
  const used = /* @__PURE__ */ new Set([id, conflict.operation.save_id?.toLowerCase?.(), local?.group_id?.toLowerCase?.()]);
  const fresh = () => {
    const value = uuid5();
    if (typeof value !== "string" || !pattern.test(value) || used.has(value.toLowerCase())) invalid();
    used.add(value.toLowerCase());
    return value.toLowerCase();
  };
  const reserve = (values) => {
    for (const value of values) if (typeof value === "string") used.add(value.toLowerCase());
  };
  return { type, scope, id, local, remote, choice: choice2, fresh, reserve };
}
function operation(context, id, method, path, body2, value, base = null, deleted2 = false) {
  const local = { ...value, id, version: (body2.version || 0) + 1, can_edit: true, deleted: deleted2, deleted_at: null };
  return {
    scope: context.scope,
    entity_type: context.type,
    entity_id: id,
    method,
    path,
    body: body2,
    base: base ? structuredClone(base) : null,
    local
  };
}
function copyResult(context, id, operations2) {
  return {
    mode: "copy",
    target_id: id,
    operations: operations2,
    explanation: removed2(context.local) ? "将删除前的本机内容另存为新记录，原记录保持原状。" : "将本机内容另存为新记录，原记录保持原状。"
  };
}
function todoPlan(context, value) {
  const { id, remote, local, choice: choice2, fresh } = context, path = "/todos/" + id;
  if (choice2 === "use-local" && remote && !removed2(remote) && remote.date === value.date && remote.text === value.text) {
    const method = removed2(local) ? "DELETE" : "PATCH";
    const body2 = method === "DELETE" ? { date: value.date, version: remote.version } : { completed: value.completed, version: remote.version };
    return {
      mode: "replace",
      target_id: id,
      operations: [operation(context, id, method, path, body2, value, remote, method === "DELETE")]
    };
  }
  const target = fresh(), created = { ...value, completed: false };
  const operations2 = [operation(context, target, "POST", "/todos", { id: target, date: value.date, text: value.text }, created)];
  if (value.completed) operations2.push(operation(context, target, "PATCH", "/todos/" + target, { completed: true, version: 1 }, value));
  return copyResult(context, target, operations2);
}
function undatedPlan(context, value) {
  const { id, remote, local, choice: choice2, fresh } = context, path = "/unscheduled-todos/" + id;
  if (choice2 === "use-local" && remote && !removed2(remote) && remote.text === value.text) {
    const method = removed2(local) ? "DELETE" : "PATCH";
    const body2 = method === "DELETE" ? { version: remote.version } : { completed: value.completed, version: remote.version };
    return { mode: "replace", target_id: id, operations: [operation(context, id, method, path, body2, value, remote, method === "DELETE")] };
  }
  const target = fresh(), created = { ...value, completed: false };
  const operations2 = [operation(context, target, "POST", "/unscheduled-todos", { id: target, text: value.text }, created)];
  if (value.completed) operations2.push(operation(context, target, "PATCH", "/unscheduled-todos/" + target, { completed: true, version: 1 }, value));
  return copyResult(context, target, operations2);
}
function templatePlan(context, value) {
  const { id, remote, local, choice: choice2, fresh } = context;
  if (choice2 === "use-local" && remote && !removed2(remote)) {
    const method = removed2(local) ? "DELETE" : "PATCH", body2 = { version: remote.version };
    if (method === "PATCH") body2.text = value.text;
    return { mode: "replace", target_id: id, operations: [
      operation(context, id, method, "/todo-templates/" + id, body2, value, remote, method === "DELETE")
    ] };
  }
  const target = fresh();
  return copyResult(context, target, [operation(context, target, "POST", "/todo-templates", { id: target, text: value.text }, value)]);
}
function notePlan(context, value) {
  const { id, remote, local, choice: choice2, fresh } = context;
  if (choice2 === "use-local" && remote && !removed2(remote) && remote.category === value.category && remote.date === value.date && (local.labels_version !== 1 || remote.labels_version === 1 && remote.label === (value.label ?? null))) {
    const method = removed2(local) ? "DELETE" : "PUT", body3 = { version: remote.version, save_id: fresh() };
    if (method === "PUT") {
      const { label: label3, ...fields5 } = value;
      Object.assign(body3, fields5);
    }
    return { mode: "replace", target_id: id, operations: [
      operation(context, id, method, "/note-entries/" + id, body3, value, remote, method === "DELETE")
    ] };
  }
  const target = fresh(), body2 = { ...value, version: 0, save_id: fresh() };
  return copyResult(context, target, [operation(context, target, "PUT", "/note-entries/" + target, body2, value)]);
}
function liveMemoGroup(group) {
  return group && uuidPattern3.test(group.id) && revision(group.version) && group.deleted_at === null && !group.deleted && (group.position === void 0 || Number.isSafeInteger(group.position) && group.position >= 0 && group.position <= 1e6);
}
function memoOperation(context, id, body2, value, base = null) {
  const kind = context.type === "memo_note" ? "notes" : "groups";
  const result = operation(context, id, "PUT", "/memos/" + kind + "/" + id, body2, value, base);
  if (context.type === "memo_note") Object.assign(result, { protocol: 2, depends_on: ["memo-group:" + body2.group_id] });
  return result;
}
function memoParentCopy(context, value, groups) {
  const live2 = groups.filter(liveMemoGroup).sort((a, b) => (a.position || 0) - (b.position || 0) || a.id.localeCompare(b.id));
  const operations2 = [];
  let parent = live2[0]?.id.toLowerCase();
  if (!parent) {
    parent = context.fresh();
    const groupValue = { title: "本机冲突副本", position: 0 };
    const groupBody = { ...groupValue, version: 0, save_id: context.fresh() };
    operations2.push(memoOperation({ ...context, type: "memo_group" }, parent, groupBody, groupValue));
  }
  const target = context.fresh(), local = { ...value, group_id: parent };
  const body2 = { ...local, version: 0, save_id: context.fresh() };
  operations2.push(memoOperation(context, target, body2, local));
  return {
    ...copyResult(context, target, operations2),
    explanation: "原笔记所在位置已不可用，将本机正文另存为新笔记，原内容保留。"
  };
}
function memoPlan(context, value, groups) {
  const { id, remote, local, choice: choice2, fresh, type } = context;
  if (removed2(local)) return {
    mode: "blocked",
    operations: [],
    target_id: id,
    explanation: "本机保留的是删除意图；备忘录删除需联网确认，原文与冲突仍保留。"
  };
  if (type === "memo_note" && !groups.some((group) => group?.id === value.group_id && liveMemoGroup(group)))
    return memoParentCopy(context, value, groups);
  const replace = choice2 === "use-local" && remote && !removed2(remote) && (type !== "memo_note" || remote.group_id === value.group_id);
  const target = replace ? id : fresh(), body2 = { ...value, version: replace ? remote.version : 0, save_id: fresh() };
  const operations2 = [memoOperation(context, target, body2, value, replace ? remote : null)];
  return replace ? { mode: "replace", target_id: target, operations: operations2 } : copyResult(context, target, operations2);
}
function planConflictResolution({ conflict, remote = null, choice: choice2, groups = [], uuid: uuid5 = () => crypto.randomUUID() }) {
  const context = contextFor({ conflict, remote, choice: choice2, uuid: uuid5 });
  if (choice2 === "use-server") return { mode: "server", target_id: context.id, operations: [] };
  if (choice2 === "use-local" && removed2(context.local) && (!remote || removed2(remote)))
    return { mode: "server", target_id: context.id, operations: [], explanation: "线上已删除，确认删除结果；删除前原文仍保留。" };
  if (!Array.isArray(groups)) invalid();
  context.reserve(groups.map((group) => group?.id));
  if (context.type === "note_entry" && context.local?.labels_version !== 1 && remote?.labels_version === 1 && remote.label !== null)
    throw new TypeError("标签尚未核实，请联网读取后重新核对；原文已保留。");
  const value = content(context.local, context.type);
  if (context.type === "todo") return todoPlan(context, value);
  if (context.type === "unscheduled_todo") return undatedPlan(context, value);
  if (context.type === "template") return templatePlan(context, value);
  if (context.type === "note_entry") return notePlan(context, value);
  return memoPlan(context, value, groups);
}

// web/offline/conflict-decisions.mjs
var live = (row) => !["acked", "archived"].includes(row.status);
var own = (value, key) => Object.hasOwn(value, key);
var currentLocal = (row) => own(row, "review_local") ? row.review_local : row.local;
var currentRemote = (row) => own(row, "review_remote") ? row.review_remote : row.remote;
var failure = (message, code = "OFFLINE_CONFLICT_CHANGED") => Object.assign(new Error(message), { code });
var canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
var stable = (value) => JSON.stringify(canonical(value));
function conflictDecisionToken(conflict) {
  return stable({
    key: conflict.key,
    local: currentLocal(conflict),
    remote: currentRemote(conflict),
    operation: conflict.operation,
    copy_required: conflict.copy_required === true,
    resolved_at: conflict.resolved_at
  });
}
function remoteEvidence(value, type) {
  if (!value) return null;
  const fields5 = type === "todo" ? ["date", "text", "completed"] : type === "unscheduled_todo" ? ["text", "completed"] : type === "template" ? ["text"] : type === "note_entry" ? ["category", "date", "text", "labels_version", "label"] : type === "memo_note" ? ["group_id", "title", "body", "position"] : ["title", "position"];
  return {
    id: value.id || value.source_id,
    version: value.version,
    deleted: Boolean(value.deleted || value.deleted_at),
    ...Object.fromEntries(fields5.filter((key) => own(value, key)).map((key) => [key, value[key]]))
  };
}
function branchState(conflict, entity, operations2, drafts) {
  return stable({ conflict, entity, operations: operations2, drafts });
}
async function storedState(tx, scope, key) {
  const conflict = await tx.get("conflicts", key);
  if (!conflict || conflict.scope !== scope) throw failure("冲突不属于当前身份。", "OFFLINE_SCOPE_CHANGED");
  const entity = await tx.get("entities", entityKey(scope, conflict.entity_id));
  const operations2 = (await tx.getAll("outbox")).filter((row) => row.scope === scope && row.entity_id === conflict.entity_id && live(row)).sort((a, b) => a.seq - b.seq);
  const id = conflict.operation.source_id;
  const drafts = (await tx.getAll("meta")).filter((row) => row.scope === scope && row.draft_kind && row.data?.id === id);
  return { conflict, entity, operations: operations2, drafts, signature: branchState(conflict, entity, operations2, drafts) };
}
function checkSelection(captured, expected, canDispatch) {
  const { conflict, entity, operations: operations2 } = captured;
  if (conflict.resolved_at !== null || conflict.resolution) return;
  if (expected !== void 0 && expected !== conflictDecisionToken(conflict)) throw failure("比较内容已变化，请重新核对。");
  if (!canDispatch(conflict.operation) || operations2.some((row) => !canDispatch(row)))
    throw failure("此本机操作需新版页面处理，原内容已保留。", "OFFLINE_UPGRADE_REQUIRED");
  if (!entity || entity.conflict !== conflict.key || !operations2.some((row) => row.key === conflict.operation.key))
    throw failure("这份冲突已变化，原文已保留，请重新核对。");
}
function createConflictDecisions({
  db,
  getScope,
  prepare,
  append,
  canDispatch = () => true,
  now = Date.now,
  uuid: uuid5 = () => crypto.randomUUID()
}) {
  async function transaction(captured, scope, assertActive, callback) {
    return db.transaction(["entities", "outbox", "conflicts", "meta"], "readwrite", async (tx) => {
      assertActive();
      const latest = await storedState(tx, scope, captured.conflict.key);
      if (latest.conflict.resolved_at !== null || latest.conflict.resolution) return { ...latest.conflict, already_resolved: true };
      if (latest.signature !== captured.signature) throw failure("本机内容刚有变化，原文已保留，请重新核对。");
      const result = await callback(tx, latest);
      assertActive();
      return result;
    });
  }
  async function review(captured, scope, active5, remote, message, extra = {}) {
    return transaction(captured, scope, active5, async (tx) => {
      const history2 = [...captured.conflict.remote_history || []];
      if (!history2.some((value) => stable(value) === stable(currentRemote(captured.conflict))))
        history2.push(currentRemote(captured.conflict));
      const next = {
        ...captured.conflict,
        remote_history: history2,
        review_local: captured.entity.local,
        review_remote: remote,
        needs_recompare: true,
        resolution_message: message,
        ...extra
      };
      await tx.put("conflicts", next);
      return next;
    });
  }
  async function commit(captured, scope, active5, choice2, prepared, plan) {
    return transaction(captured, scope, active5, async (tx) => {
      const conflict = captured.conflict, resolutionId = uuid5();
      for (const operation3 of captured.operations)
        await tx.put("outbox", { ...operation3, status: "archived", archived_by: resolutionId });
      const entity = {
        ...captured.entity,
        server: prepared.remote,
        local: prepared.remote,
        dirty: false,
        conflict: null,
        remote_missing: !prepared.remote
      };
      if (prepared.remote?.can_edit !== void 0) entity.api_server = prepared.remote;
      await tx.put("entities", entity);
      await rememberParents(tx, scope, prepared.groups || [], plan.operations);
      const stamp2 = new Date(now()).toISOString();
      const decisionProtocol = conflict.operation.protocol === 5 || conflict.operation.entity_type === "note_entry" && currentLocal(conflict)?.labels_version === 1 ? 5 : 3;
      const inputs = plan.operations.map((input) => ({
        ...input,
        protocol: decisionProtocol,
        resolution_id: resolutionId,
        origin_conflict: conflict.key,
        resolution_receipt: 1,
        local: {
          ...input.local,
          ...decisionProtocol === 5 ? { labels_version: 1, label: input.local.label ?? null } : {},
          created_at: input.base?.created_at || stamp2,
          updated_at: stamp2
        }
      }));
      const saved = await append(tx, inputs, { assertActive: active5 });
      const resolution2 = {
        id: resolutionId,
        mode: plan.mode,
        target_id: plan.target_id,
        operation_keys: saved.map((row) => row.operation.key),
        state: saved.length ? "queued" : "accepted-server"
      };
      const operation2 = saved.length ? {
        ...conflict.operation,
        protocol: decisionProtocol,
        resolution_id: resolutionId,
        origin_conflict: conflict.key,
        resolution_receipt: 1
      } : conflict.operation;
      const result = {
        ...conflict,
        choice: choice2,
        needs_recompare: false,
        needs_followup: false,
        resolved_at: saved.length ? null : now(),
        original_operation: conflict.original_operation || conflict.operation,
        operation: operation2,
        resolution: resolution2,
        resolution_remote: prepared.remote,
        resolution_message: plan.explanation || ""
      };
      await tx.put("conflicts", result);
      await finishServerResolution(tx, result, now());
      return result;
    });
  }
  async function resolve(key, choice2, { scope = getScope(), assertActive = () => {
  }, expected, copyConfirmed = false } = {}) {
    if (!["use-server", "use-local", "keep-both"].includes(choice2)) throw new TypeError("Unknown conflict choice");
    const active5 = () => {
      assertActive();
      if (!scope || scope !== getScope()) throw failure("身份范围已变化，冲突和原文保持原样。", "OFFLINE_SCOPE_CHANGED");
    };
    active5();
    const captured = await db.transaction(["entities", "outbox", "conflicts", "meta"], "readonly", (tx) => storedState(tx, scope, key));
    active5();
    if (captured.conflict.resolved_at !== null || captured.conflict.resolution)
      return { ...captured.conflict, already_resolved: true };
    checkSelection(captured, expected, canDispatch);
    if (stable(captured.entity.local) !== stable(currentLocal(captured.conflict)))
      return review(captured, scope, active5, currentRemote(captured.conflict), "本机已有后续修改，请核对新比较内容后再选择。");
    const prepared = await prepare(captured.conflict, { assertActive: active5 });
    active5();
    const type = captured.conflict.operation.entity_type;
    if (stable(remoteEvidence(prepared.remote, type)) !== stable(remoteEvidence(currentRemote(captured.conflict), type)))
      return review(captured, scope, active5, prepared.remote, "线上刚有更新，请核对新比较内容后再选择。");
    const selected = { ...captured.conflict, local: currentLocal(captured.conflict), remote: prepared.remote };
    const plan = planConflictResolution({ conflict: selected, remote: prepared.remote, choice: choice2, groups: prepared.groups || [], uuid: uuid5 });
    if (plan.mode === "blocked") return { ...captured.conflict, blocked: true, resolution_message: plan.explanation };
    if (choice2 === "use-local" && plan.mode === "copy" && !copyConfirmed)
      return review(captured, scope, active5, prepared.remote, plan.explanation + "请明确选择另存本地副本。", { copy_required: true });
    active5();
    return commit(captured, scope, active5, choice2, prepared, plan);
  }
  return { resolve };
}
async function rememberParents(tx, scope, groups, operations2) {
  for (const input of operations2.filter((row) => row.entity_type === "memo_note")) {
    const id = input.body.group_id, server = groups.find((row) => row.id === id && !row.deleted_at && !row.deleted);
    if (!server) continue;
    const entity_id = "memo-group:" + id, key = entityKey(scope, entity_id), old = await tx.get("entities", key);
    if (old?.server?.version > server.version) throw failure("分组刚有更新，请重新核对后保存。");
    await tx.put("entities", {
      ...old,
      key,
      scope,
      entity_id,
      server,
      local: old?.dirty ? old.local : server,
      dirty: old?.dirty === true,
      remote_missing: false
    });
  }
}

// web/offline/conflict-transport.mjs
var prefixes2 = {
  unscheduled_todo: "unscheduled_todo:",
  todo: "todo:",
  template: "template:",
  note_entry: "note-entry:",
  memo_note: "memo-note:",
  memo_group: "memo-group:"
};
var uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
var object = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
var version = (value) => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
var sequence = (value) => Number.isSafeInteger(value) && value >= 0;
var timestamp2 = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
var invalid2 = () => {
  throw Object.assign(new Error("线上内容读取不完整，原文已保留，请重新核对。"), { code: "OFFLINE_RESPONSE_INVALID" });
};
var removed3 = (row) => row?.deleted === true || row?.deleted_at !== null && row?.deleted_at !== void 0;
var own2 = (value, key) => Object.hasOwn(value, key);
function day2(value) {
  return typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
}
function shortText2(value) {
  return typeof value === "string" && value.isWellFormed() && value.trim().length > 0 && value.length <= 500 && !value.includes("\0");
}
function body(value) {
  return typeof value === "string" && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\r]/.test(value) && new TextEncoder().encode(value).byteLength <= 65536;
}
function identity(row, id, type) {
  return object(row) && (row.id === id || row.id === void 0 && row.source_id === id) && (!own2(row, "source_id") || row.source_id === id) && (!own2(row, "entity_id") || row.entity_id === prefixes2[type] + id);
}
function deletion(row) {
  return (!own2(row, "deleted") || typeof row.deleted === "boolean") && (!own2(row, "deleted_at") || row.deleted_at === null || timestamp2(row.deleted_at)) && (!own2(row, "deleted") || !own2(row, "deleted_at") || row.deleted === (row.deleted_at !== null));
}
function basicRemote(row, id, type) {
  if (!identity(row, id, type) || !version(row.version) || !deletion(row)) invalid2();
  if (type === "todo" && (!day2(row.date) || !removed3(row) && (!shortText2(row.text) || typeof row.completed !== "boolean"))) invalid2();
  if (type === "unscheduled_todo" && (!removed3(row) && (!shortText2(row.text) || typeof row.completed !== "boolean") || own2(row, "date"))) invalid2();
  if (type === "template" && !removed3(row) && !shortText2(row.text)) invalid2();
  return structuredClone(row);
}
function noteRemote(row, id) {
  if (!isNoteApiRow(row) || row.id !== id || row.can_edit !== true || !body(row.text)) invalid2();
  return structuredClone(row);
}
function memoMeta(row, note = false) {
  if (!object(row) || !uuid.test(row.id) || typeof row.title !== "string" || !row.title.isWellFormed() || !row.title.trim() || [...row.title].length > 120 || /[\u0000-\u001f\u007f]/.test(row.title) || !Number.isSafeInteger(row.position) || row.position < 0 || row.position > 1e6 || !version(row.version) || !sequence(row.change_seq) || !timestamp2(row.created_at) || !timestamp2(row.updated_at) || row.deleted_at !== null && !timestamp2(row.deleted_at) || note && !uuid.test(row.group_id)) invalid2();
  if (own2(row, "deleted") && row.deleted !== (row.deleted_at !== null)) invalid2();
  if (own2(row, "active_note_count") && (!sequence(row.active_note_count) || row.active_note_count > 200)) invalid2();
}
function memoIndex(value) {
  if (!object(value) || value.can_edit !== true || !Array.isArray(value.groups) || value.groups.length > 32 || !Array.isArray(value.notes) || value.notes.length > 200) invalid2();
  const groups = /* @__PURE__ */ new Set(), notes = /* @__PURE__ */ new Set();
  for (const row of value.groups) {
    memoMeta(row);
    if (groups.has(row.id)) invalid2();
    groups.add(row.id);
  }
  for (const row of value.notes) {
    memoMeta(row, true);
    if (notes.has(row.id) || !groups.has(row.group_id)) invalid2();
    notes.add(row.id);
  }
  return structuredClone(value);
}
function memoDetail(row, id, index) {
  if (!identity(row, id, "memo_note") || row.can_edit !== true || !body(row.body)) invalid2();
  memoMeta(row, true);
  const metadata2 = index.notes.find((value) => value.id === id);
  const fields5 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at", "group_id"];
  if (!metadata2 || fields5.some((key) => metadata2[key] !== row[key])) invalid2();
  return structuredClone(row);
}
function noteAbsence(value, local, id) {
  if (!object(value) || value.can_edit !== true || value.category !== local.category || value.date !== local.date || !Array.isArray(value.entries) || value.entries.length > 200) invalid2();
  const ids = /* @__PURE__ */ new Set();
  for (const row of value.entries) {
    noteRemote(row, row?.id);
    if (row.id === id || ids.has(row.id) || row.deleted || row.category !== local.category || row.date !== local.date) invalid2();
    ids.add(row.id);
  }
}
function conflictIdentity(conflict) {
  const operation2 = conflict?.operation, type = operation2?.entity_type, id = operation2?.source_id;
  if (!prefixes2[type] || !uuid.test(id) || typeof conflict.scope !== "string" || !conflict.scope || operation2.scope !== conflict.scope || operation2.entity_id !== prefixes2[type] + id || conflict.entity_id !== operation2.entity_id) invalid2();
  return { operation: operation2, type, id, scope: conflict.scope };
}
function createConflictPreparation({ readRemote, network }) {
  async function guarded(read, assertActive) {
    assertActive();
    const value = await read();
    assertActive();
    return value;
  }
  return async function prepare(conflict, { assertActive = () => {
  } } = {}) {
    assertActive();
    const { operation: operation2, type, id, scope } = conflictIdentity(conflict);
    if (type === "memo_group" || type === "memo_note") {
      const index = memoIndex(await guarded(() => network(scope, "/memos"), assertActive));
      if (type === "memo_group") {
        const row2 = index.groups.find((value) => value.id === id);
        return { remote: row2 ? { ...row2, can_edit: true } : null, groups: index.groups };
      }
      const row = await guarded(() => readRemote(operation2), assertActive);
      if (row === null) {
        if (index.notes.some((value) => value.id === id)) invalid2();
        return { remote: null, groups: index.groups };
      }
      return { remote: memoDetail(row, id, index), groups: index.groups };
    }
    const remote = await guarded(() => readRemote(operation2), assertActive);
    if (remote !== null) {
      if (type === "note_entry" && operation2.protocol === 5 && (remote.labels_version !== 1 || !own2(remote, "label"))) invalid2();
      return { remote: type === "note_entry" ? noteRemote(remote, id) : basicRemote(remote, id, type), groups: [] };
    }
    if (type === "note_entry") {
      const local = own2(conflict, "review_local") ? conflict.review_local : conflict.local;
      if (!object(local) || !["life", "work"].includes(local.category) || !day2(local.date)) invalid2();
      const path = "/note-entries?category=" + local.category + "&date=" + local.date;
      noteAbsence(await guarded(() => network(scope, path), assertActive), local, id);
    }
    return { remote: null, groups: [] };
  };
}

// web/offline/outbox.mjs
var RETRY_DELAYS = Object.freeze([5e3, 15e3, 6e4, 3e5]);
var prefixes3 = {
  unscheduled_todo: "unscheduled_todo:",
  todo: "todo:",
  template: "template:",
  note_entry: "note-entry:",
  memo_note: "memo-note:",
  memo_group: "memo-group:"
};
var uuidPattern4 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var active2 = (operation2) => !["acked", "archived"].includes(operation2.status);
var deleted = (value) => Boolean(value && (value.deleted || value.deleted_at));
var ordered = (rows) => rows.sort((a, b) => a.seq - b.seq);
var needsUpgrade = () => Object.assign(new Error("此本机操作需新版页面处理，原内容已保留。"), { code: "OFFLINE_UPGRADE_REQUIRED" });
function canonicalRoute(operation2) {
  const { entity_type: type, source_id: id, entity_id, method, path } = operation2;
  if (!uuidPattern4.test(id) || entity_id !== prefixes3[type] + id) return false;
  const base = type === "todo" ? "/todos" : type === "template" ? "/todo-templates" : type === "note_entry" ? "/note-entries" : type === "unscheduled_todo" ? "/unscheduled-todos" : "/memos/" + (type === "memo_note" ? "notes" : "groups");
  if (["todo", "template", "unscheduled_todo"].includes(type)) {
    if (method === "POST") return path === base || ["todo", "unscheduled_todo"].includes(type) && path === base + "/" + id + "/restore";
    return ["PATCH", "DELETE"].includes(method) && path === base + "/" + id;
  }
  return (method === "PUT" || type === "note_entry" && method === "DELETE") && path === base + "/" + id;
}
function dispatchCapabilities(options2) {
  const types2 = new Set(options2.enabledTypes || Object.keys(prefixes3));
  const protocols = new Set(options2.supportedProtocols || [1, 2, 3]);
  const memoDependencies = (operation2) => options2.supportedDependencies === true && operation2.entity_type === "memo_note" && operation2.method === "PUT" && uuidPattern4.test(operation2.body?.group_id) && Array.isArray(operation2.depends_on) && operation2.depends_on.length === 1 && operation2.depends_on[0] === "memo-group:" + operation2.body.group_id;
  const decision = (operation2) => {
    let origin;
    try {
      origin = JSON.parse(operation2.origin_conflict);
    } catch {
      return false;
    }
    return options2.resolutionReceipts !== false && uuidPattern4.test(operation2.resolution_id) && operation2.resolution_receipt === 1 && Array.isArray(origin) && origin.length === 2 && origin[0] === operation2.scope && typeof origin[1] === "string" && origin[1].startsWith("conflict:") && (!Object.hasOwn(operation2, "depends_on") || memoDependencies(operation2));
  };
  const canDispatch = (operation2) => {
    const legacySafe = operation2?.entity_type !== "note_entry" || !Object.hasOwn(operation2?.body || {}, "label");
    const protocol = operation2?.protocol === void 0 ? 1 : operation2.protocol;
    return Boolean(operation2 && Object.hasOwn(prefixes3, operation2.entity_type) && types2.has(operation2.entity_type) && Number.isSafeInteger(protocol) && protocols.has(protocol) && canonicalRoute(operation2) && (protocol === 1 && legacySafe && operation2.entity_type !== "unscheduled_todo" && !Object.hasOwn(operation2, "depends_on") || protocol === 2 && memoDependencies(operation2) || protocol === 3 && legacySafe && decision(operation2) || protocol === 4 && operation2.entity_type === "unscheduled_todo" && !Object.hasOwn(operation2, "depends_on") || protocol === 5 && operation2.entity_type === "note_entry" && !Object.hasOwn(operation2, "depends_on") && (!operation2.resolution_id || decision(operation2))));
  };
  const requireDispatch = (operation2) => {
    if (!canDispatch(operation2)) throw needsUpgrade();
  };
  return { canDispatch, requireDispatch };
}
function identity2(input, uuid5) {
  const prefix = prefixes3[input.entity_type];
  if (!prefix) throw new TypeError("This entity is read-only offline");
  const raw = input.entity_id || input.body?.id || uuid5();
  const id = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  if (!uuidPattern4.test(id)) throw new TypeError("Offline entity requires a stable UUID");
  return { id: id.toLowerCase(), entity_id: prefix + id.toLowerCase() };
}
function operationFor(input, uuid5, time2) {
  const initialStatus = input.initial_status || "queued";
  if (!["queued", "unknown"].includes(initialStatus)) throw new TypeError("Invalid initial offline operation status");
  if (initialStatus === "unknown" && (!uuidPattern4.test(input.body?.save_id) || !input.entity_id))
    throw new TypeError("Unknown operation import requires its original save_id and entity identity");
  const { id, entity_id } = identity2(input, uuid5), type = input.entity_type;
  const method = input.method?.toUpperCase();
  const base = type === "todo" ? "/todos" : type === "template" ? "/todo-templates" : type === "note_entry" ? "/note-entries" : type === "unscheduled_todo" ? "/unscheduled-todos" : "/memos/" + (type === "memo_note" ? "notes" : "groups");
  const restore = ["todo", "unscheduled_todo"].includes(type) && method === "POST" && input.path === base + "/" + id + "/restore";
  const create = ["todo", "template", "unscheduled_todo"].includes(type) && method === "POST" && !restore;
  const allowed = ["todo", "unscheduled_todo"].includes(type) ? ["POST", "PATCH", "DELETE"] : type === "template" ? ["POST", "PATCH", "DELETE"] : type === "note_entry" ? ["PUT", "DELETE"] : ["PUT"];
  if (!allowed.includes(method)) throw new TypeError("Unsupported offline mutation");
  const path = create ? base : base + "/" + id + (restore ? "/restore" : "");
  if (input.path && input.path !== path) throw new TypeError("Offline mutation path does not match its entity");
  const body2 = structuredClone(input.body || {});
  if (typeof body2.text === "string") {
    body2.text = ["todo", "template", "unscheduled_todo"].includes(type) ? body2.text.trim() : body2.text.replace(/\r\n?/g, "\n");
  }
  if (typeof body2.title === "string") body2.title = body2.title.trim();
  if (typeof body2.body === "string") body2.body = body2.body.replace(/\r\n?/g, "\n");
  if (create) {
    if (body2.id && body2.id.toLowerCase() !== id) throw new TypeError("Client UUID cannot change");
    body2.id = id;
  }
  const expected = create ? 0 : body2.version;
  if (!Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER) {
    throw new TypeError("Offline mutation requires an expected version");
  }
  const saveId = body2.save_id || uuid5();
  if (!uuidPattern4.test(saveId)) throw new TypeError("Offline save_id requires a UUID");
  if (!["todo", "template", "unscheduled_todo"].includes(type)) body2.save_id = saveId.toLowerCase();
  else delete body2.save_id;
  const operation2 = {
    id: uuid5(),
    scope: input.scope,
    entity_type: type,
    entity_id,
    source_id: id,
    protocol: input.protocol === void 0 ? 1 : input.protocol,
    method,
    path,
    body: body2,
    expected_version: expected,
    save_id: saveId.toLowerCase(),
    created_at: time2,
    attempts: 0,
    next_attempt_at: 0,
    status: initialStatus,
    base: input.base || null,
    local: { ...structuredClone(input.local || body2), id, version: expected + 1 },
    claim_owner: null,
    error: null
  };
  operation2.key = entityKey(input.scope, "operation:" + operation2.id);
  if (Object.hasOwn(input, "depends_on")) operation2.depends_on = structuredClone(input.depends_on);
  for (const field2 of ["resolution_id", "resolution_receipt", "origin_conflict"])
    if (Object.hasOwn(input, field2)) operation2[field2] = input[field2];
  assertOfflineData(operation2);
  return operation2;
}
async function digest(value) {
  const canonical4 = (node) => Array.isArray(node) ? node.map(canonical4) : node && typeof node === "object" ? Object.fromEntries(Object.keys(node).sort().map((key) => [key, canonical4(node[key])])) : node;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical4(value)));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value2) => value2.toString(16).padStart(2, "0")).join("");
}
async function memoHash(row, kind) {
  const fields5 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at"];
  if (kind === "memo_note") fields5.push("group_id", "body");
  return digest(Object.fromEntries(fields5.map((field2) => [field2, row[field2]])));
}
function desired(operation2, remote) {
  if (!remote || remote.id !== operation2.source_id) return false;
  if (operation2.method === "DELETE") return deleted(remote);
  if (deleted(remote)) return false;
  const keys = operation2.entity_type === "todo" ? operation2.path.endsWith("/restore") ? ["date"] : operation2.method === "POST" ? ["date", "text", ...operation2.body.template_id ? ["template_id"] : []] : ["completed"] : operation2.entity_type === "template" ? ["text"] : Object.keys(operation2.body).filter((key) => !["version", "save_id"].includes(key));
  return keys.every((key) => remote[key] === operation2.body[key]);
}
function expectedFields(operation2, remote) {
  const base = operation2.base;
  if (!base) return true;
  const fields5 = operation2.entity_type === "todo" ? deleted(remote) ? ["date"] : ["date", "text"] : operation2.entity_type === "unscheduled_todo" ? ["text"] : [];
  return fields5.every((key) => base[key] === void 0 || remote[key] === base[key]);
}
function completeNoteRow(remote) {
  const time2 = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
  return remote && uuidPattern4.test(remote.id) && ["life", "work"].includes(remote.category) && /^\d{4}-\d{2}-\d{2}$/.test(remote.date) && typeof remote.text === "string" && typeof remote.deleted === "boolean" && remote.can_edit === true && /^[a-f0-9]{64}$/.test(remote.content_hash) && Number.isSafeInteger(remote.change_seq) && remote.change_seq >= 0 && time2(remote.created_at) && time2(remote.updated_at) && (remote.deleted_at === null || time2(remote.deleted_at)) && remote.deleted === (remote.deleted_at !== null);
}
function validAcknowledgement(operation2, remote) {
  if (operation2.entity_type === "note_entry" && (!completeNoteRow(remote) || operation2.protocol === 5 && (remote.labels_version !== 1 || !Object.hasOwn(remote, "label") || remote.label !== operation2.local?.label))) return false;
  if (operation2.entity_type === "template" && operation2.method === "DELETE") {
    return remote?.id === operation2.source_id && remote.deleted === true;
  }
  if (operation2.path.endsWith("/restore") && remote?.version === operation2.expected_version) {
    return desired(operation2, remote) && expectedFields(operation2, remote);
  }
  return Number.isSafeInteger(remote?.version) && remote.version === operation2.expected_version + 1 && desired(operation2, remote) && expectedFields(operation2, remote);
}
function acceptedLabelEvidence(operation2, confirmed, entity) {
  if (operation2.entity_type !== "note_entry" || operation2.protocol !== 5) return null;
  const proof = {
    version: confirmed.version,
    category: confirmed.category,
    date: confirmed.date,
    created_at: confirmed.created_at,
    label: confirmed.label
  };
  if (entity?.label_evidence && (entity.label_evidence.version > proof.version || entity.label_evidence.version === proof.version && JSON.stringify(entity.label_evidence) !== JSON.stringify(proof)))
    throw new Error("标签证据已变化，原请求已保留。");
  return proof;
}
function createContext(options2) {
  const { db, request, getScope, now = Date.now, uuid: uuid5 = () => crypto.randomUUID(), timeout = 2e4 } = options2;
  const owner2 = uuid5();
  const state2 = { phase: "idle", pending: 0, unsupported: 0, error: null };
  const { canDispatch, requireDispatch } = dispatchCapabilities(options2);
  const conflicts = createConflictStore({ db, now, canDispatch });
  const leaseKey = (scope) => entityKey(scope, "outbox-lease");
  const checkScope = (scope) => {
    if (getScope() !== scope) throw Object.assign(new Error("Offline identity changed"), { code: "OFFLINE_SCOPE_CHANGED" });
  };
  const list = (scope) => db.transaction(["outbox"], "readonly", async (tx) => ordered((await tx.getAll("outbox")).filter((value) => value.scope === scope && active2(value))));
  const retryable = async (scope) => {
    const rows = await list(scope), first = /* @__PURE__ */ new Map(), ready = [];
    for (const row of rows) if (!first.has(row.entity_id)) first.set(row.entity_id, row);
    for (const row of first.values()) {
      if (!canDispatch(row) || !["queued", "unknown", "sending"].includes(row.status)) continue;
      const dependency = await dependencyState({ db }, row, rows);
      if (["ready", "deleted"].includes(dependency)) ready.push(row);
    }
    return ready;
  };
  async function lease(scope) {
    checkScope(scope);
    return db.transaction(["meta"], "readwrite", async (tx) => {
      const old = await tx.get("meta", leaseKey(scope));
      if (old && old.owner !== owner2 && old.expires_at > now()) return false;
      await tx.put("meta", { key: leaseKey(scope), owner: owner2, expires_at: now() + 9e4 });
      return true;
    });
  }
  async function network(scope, path, opts = {}, claim = true) {
    checkScope(scope);
    if (claim && !await lease(scope)) throw new Error("Offline sync lease changed");
    checkScope(scope);
    const controller = new AbortController();
    let timer;
    try {
      const expired = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error("Offline request outcome is unknown"), { code: "OFFLINE_TIMEOUT" }));
        }, timeout);
      });
      const result = await Promise.race([request(path, { ...opts, signal: controller.signal }), expired]);
      checkScope(scope);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  const readNetwork = (scope, path, opts = {}) => {
    if (!["GET", "HEAD"].includes((opts.method || "GET").toUpperCase())) throw new TypeError("Conflict preparation is read-only");
    return network(scope, path, opts, false);
  };
  return {
    db,
    request,
    getScope,
    now,
    uuid: uuid5,
    timeout,
    owner: owner2,
    conflicts,
    state: state2,
    leaseKey,
    checkScope,
    list,
    lease,
    network,
    readNetwork,
    canDispatch,
    requireDispatch,
    retryable
  };
}
async function replayOperation(tx, operation2, input, all) {
  const replay = all.find((value) => value.save_id === operation2.save_id);
  if (!replay) return null;
  if (replay.entity_id !== operation2.entity_id || replay.path !== operation2.path || replay.method !== operation2.method || JSON.stringify(replay.body) !== JSON.stringify(operation2.body)) throw new Error("Offline save_id cannot change its original request");
  const entity = await tx.get("entities", entityKey(input.scope, replay.entity_id));
  if (!entity) throw new Error("Offline operation entity is missing");
  if (input.initial_status === "unknown" && replay.status === "queued") {
    await tx.put("outbox", { ...replay, status: "unknown" });
    return { operation: { ...replay, status: "unknown" }, entity };
  }
  return { operation: replay, entity };
}
async function noteCapacity(tx, operation2, old) {
  if (operation2.entity_type !== "note_entry" || operation2.expected_version !== 0 || operation2.status === "unknown" || old) return;
  let count = 0;
  for (const entity of await tx.getAll("entities")) {
    const row = entity.dirty ? entity.local : entity.server;
    if (entity.scope === operation2.scope && entity.entity_id.startsWith("note-entry:") && (entity.dirty || !entity.remote_missing) && row?.category === operation2.body.category && row?.date === operation2.body.date && !deleted(row)) count++;
  }
  if (count >= 200) throw Object.assign(new Error("本机当日记录已达 200 条，草稿已保留。"), { code: "OFFLINE_CACHE_LIMIT" });
}
function storageMethods(context) {
  const { db, checkScope, uuid: uuid5, now, owner: owner2 } = context;
  async function enqueueInTransaction(tx, input) {
    input.assertActive?.();
    checkScope(input.scope);
    const operation2 = operationFor(input, uuid5, now());
    context.requireDispatch(operation2);
    checkScope(input.scope);
    input.assertActive?.();
    const all = (await tx.getAll("outbox")).filter((value) => value.scope === input.scope);
    const replay = await replayOperation(tx, operation2, input, all);
    if (replay) {
      input.assertActive?.();
      return replay;
    }
    const rows = all.filter(active2);
    if (rows.length >= 1e3) throw new Error("Offline queue is full; this edit was not saved");
    const previous = ordered(rows.filter((value) => value.entity_id === operation2.entity_id)).at(-1);
    const conflict = rows.some((value) => value.entity_id === operation2.entity_id && value.status === "conflict");
    if (conflict || previous && operation2.expected_version !== previous.expected_version + 1) {
      throw new Error("Offline edits must use the preceding local version");
    }
    const sequenceKey = entityKey(input.scope, "outbox-sequence");
    const sequence2 = (await tx.get("meta", sequenceKey))?.value || 0;
    operation2.seq = sequence2 + 1;
    const key = entityKey(input.scope, operation2.entity_id), old = await tx.get("entities", key);
    await noteCapacity(tx, operation2, old);
    const visible3 = old?.dirty ? old.local : old?.server || operation2.base;
    operation2.base = operation2.base || old?.server || null;
    operation2.local = {
      ...visible3,
      ...operation2.local,
      ...operation2.entity_type === "todo" && operation2.path === "/todos" ? { completed: false } : {},
      ...operation2.path.endsWith("/restore") ? { deleted: false, deleted_at: null } : {},
      ...operation2.method === "DELETE" ? { deleted: true } : {}
    };
    const entity = {
      ...old,
      key,
      scope: input.scope,
      entity_id: operation2.entity_id,
      server: old?.server || operation2.base,
      local: operation2.local,
      dirty: true
    };
    input.assertActive?.();
    await tx.put("entities", entity);
    await tx.put("outbox", operation2);
    await tx.put("meta", { key: sequenceKey, value: operation2.seq });
    input.assertActive?.();
    return { operation: operation2, entity };
  }
  async function enqueue(input) {
    return db.transaction(["entities", "outbox", "meta"], "readwrite", (tx) => enqueueInTransaction(tx, input));
  }
  async function update(operation2, fields5) {
    if (!context.canDispatch(operation2)) return null;
    return db.transaction(["outbox", "meta", "conflicts"], "readwrite", async (tx) => {
      const current2 = await tx.get("outbox", operation2.key);
      const held = await tx.get("meta", context.leaseKey(operation2.scope));
      if (!context.canDispatch(current2) || held?.owner !== owner2 || !["queued", "unknown", "sending"].includes(current2.status)) return null;
      if (!Object.hasOwn(fields5, "claim_owner") && current2.claim_owner !== owner2) return null;
      const result = { ...current2, ...fields5 };
      await tx.put("outbox", result);
      if (fields5.status) await recordResolutionFailure(tx, result, fields5);
      return result;
    });
  }
  async function acknowledge(operation2, remote) {
    context.requireDispatch(operation2);
    if (operation2.entity_type === "note_entry" && !completeNoteRow(remote)) throw new Error("Incomplete note acknowledgement");
    checkScope(operation2.scope);
    await db.transaction(["entities", "outbox", "conflicts"], "readwrite", async (tx) => {
      checkScope(operation2.scope);
      const current2 = await tx.get("outbox", operation2.key);
      if (!context.canDispatch(current2) || current2.claim_owner !== owner2 || !["sending", "unknown"].includes(current2.status)) {
        throw new Error("Offline operation claim changed");
      }
      const key = entityKey(operation2.scope, operation2.entity_id), entity = await tx.get("entities", key);
      const confirmed = operation2.entity_type === "template" && operation2.method === "DELETE" ? { ...operation2.base, ...entity.server, ...remote, version: operation2.expected_version + 1 } : remote;
      await tx.delete("outbox", operation2.key);
      const remaining = (await tx.getAll("outbox")).some((value) => value.scope === operation2.scope && value.entity_id === operation2.entity_id && active2(value));
      const proof = acceptedLabelEvidence(operation2, confirmed, entity);
      await tx.put("entities", {
        ...entity,
        server: confirmed,
        local: remaining ? entity.local : confirmed,
        ...proof ? { label_evidence: proof } : {},
        dirty: remaining,
        conflict: null
      });
      await recordResolutionAck(tx, current2, confirmed, now());
    });
  }
  return { enqueue, enqueueInTransaction, update, acknowledge };
}
function remoteMethods(context) {
  const { network } = context;
  async function readRemote(operation2) {
    const scope = operation2.scope, type = operation2.entity_type;
    if (type === "note_entry" || type === "memo_note" || type === "unscheduled_todo") {
      const path2 = type === "unscheduled_todo" ? "/unscheduled-todos/" + operation2.source_id : operation2.path;
      try {
        return await network(scope, path2);
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    }
    if (type === "memo_group") {
      const index2 = await network(scope, "/memos");
      if (index2?.can_edit !== true || !Array.isArray(index2.groups)) throw new Error("Invalid memo index");
      const row2 = index2.groups.find((value) => value.id === operation2.source_id);
      return row2 ? { ...row2, can_edit: true } : null;
    }
    const path = type === "template" ? "/todo-templates" : "/todos?date=" + (operation2.body.date || operation2.base?.date || operation2.local.date);
    const index = await network(scope, path);
    if (!Array.isArray(index?.items)) throw new Error("Incomplete offline entity index");
    const row = index.items.find((value) => value.id === operation2.source_id);
    if (row || type === "template") return row || null;
    const day4 = operation2.body.date || operation2.base?.date || operation2.local.date;
    const snapshot = await network(scope, "/workbench-snapshot?date=" + day4);
    if (snapshot?.complete !== true || snapshot.scope_id !== scope || !Array.isArray(snapshot.data?.todos)) {
      throw new Error("Todo absence could not be verified completely");
    }
    return snapshot.data.todos.find((value) => value.source_id === operation2.source_id) ? { ...snapshot.data.todos.find((value) => value.source_id === operation2.source_id), id: operation2.source_id } : null;
  }
  return { readRemote };
}
function receiptMethods(context) {
  const { network, readRemote } = context;
  async function receiptRead(operation2) {
    const note = operation2.entity_type === "note_entry", scope = operation2.scope;
    const receiptPath = (note ? "/note-entries" : "/memos") + "/operations/" + operation2.save_id;
    const receipt = await network(scope, receiptPath);
    if (!receipt || typeof receipt.found !== "boolean" || note && operation2.protocol === 5 && receipt.labels_version !== 1)
      throw new Error("Invalid offline save receipt");
    const remote = await readRemote(operation2);
    if (receipt.found) {
      const hash = note ? remote?.content_hash : remote && await memoHash(remote, operation2.entity_type);
      const expectedHash = note ? receipt.content_hash : receipt.entity_hash;
      const kind = operation2.entity_type === "memo_note" ? "notes" : "groups";
      if (receipt.id === operation2.source_id && receipt.version === operation2.expected_version + 1 && (operation2.protocol !== 5 || Object.hasOwn(receipt, "label") && receipt.label === operation2.local?.label && remote?.labels_version === 1 && remote.label === receipt.label) && (note || receipt.kind === kind) && remote?.can_edit === true && remote.version === receipt.version && hash === expectedHash && desired(operation2, remote)) {
        return { result: "ack", remote };
      }
      return { result: "conflict", remote };
    }
    if (!remote && operation2.expected_version === 0) {
      const path = note ? "/note-entries?category=" + operation2.body.category + "&date=" + operation2.body.date : "/memos";
      const index = await network(scope, path);
      if (index?.can_edit !== true) throw new Error("Offline editor capability could not be verified");
      const rows = note ? index.entries : operation2.entity_type === "memo_note" ? index.notes : index.groups;
      if (!Array.isArray(rows) || rows.some((value) => value.id === operation2.source_id)) {
        throw new Error("Offline create absence could not be verified");
      }
      return { result: "retry", remote };
    }
    if (remote?.can_edit === true && !deleted(remote) && remote.version === operation2.expected_version) {
      return { result: "retry", remote };
    }
    return { result: "conflict", remote };
  }
  return { receiptRead };
}
function processingMethods(context) {
  const { receiptRead, readRemote, acknowledge, update, network, conflicts, now, owner: owner2 } = context;
  async function reconcile(operation2) {
    if (!["todo", "template", "unscheduled_todo"].includes(operation2.entity_type)) return receiptRead(operation2);
    const remote = await readRemote(operation2);
    if (remote && remote.version === operation2.expected_version + 1 && desired(operation2, remote) && expectedFields(operation2, remote)) return { result: "ack", remote };
    if (!remote && operation2.expected_version === 0) return { result: "retry", remote };
    if (operation2.path.endsWith("/restore") && remote?.version === operation2.expected_version && deleted(remote)) {
      return { result: "retry", remote };
    }
    if (remote && !deleted(remote) && remote.version === operation2.expected_version && expectedFields(operation2, remote)) {
      return { result: "retry", remote };
    }
    return { result: "conflict", remote };
  }
  async function fail5(operation2, error) {
    if ([409, 410, 404].includes(error.status)) {
      const current2 = await context.db.transaction(["outbox"], "readonly", (tx) => tx.get("outbox", operation2.key));
      if (!context.canDispatch(current2)) return;
      let remote = null;
      try {
        remote = await readRemote(operation2);
      } catch {
      }
      return conflicts.record({ operation: operation2, remote, reason: deleted(remote) ? "deleted" : error.code || "version" });
    }
    const attempts = operation2.attempts + 1;
    const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
    const status = [401, 403].includes(error.status) ? "paused" : error.status && error.status < 500 && error.status !== 429 ? "blocked" : "unknown";
    return update(operation2, {
      status,
      attempts,
      next_attempt_at: now() + (error.status === 429 ? Math.max(6e4, delay) : delay),
      error: error.code || "OFFLINE_UNKNOWN"
    });
  }
  async function process(operation2) {
    if (!context.canDispatch(operation2)) return;
    try {
      const claimed = await update(operation2, { claim_owner: owner2 });
      if (!claimed) return;
      if (claimed.protocol === 3 || claimed.protocol === 5 && claimed.resolution_id) {
        const origin = await context.db.transaction(["conflicts"], "readonly", (tx) => tx.get("conflicts", claimed.origin_conflict));
        if (!origin || origin.scope !== claimed.scope || origin.resolved_at !== null || origin.resolution?.id !== claimed.resolution_id || !origin.resolution.operation_keys.includes(claimed.key))
          throw Object.assign(new Error("本机选择凭据不完整，原请求已保留。"), { status: 422, code: "OFFLINE_DECISION_EVIDENCE_MISSING" });
      }
      if (["unknown", "sending"].includes(operation2.status)) {
        const checked3 = await reconcile(claimed);
        if (checked3.result === "ack") return await acknowledge(claimed, checked3.remote);
        if (checked3.result === "conflict") return conflicts.record({
          operation: claimed,
          remote: checked3.remote,
          reason: deleted(checked3.remote) ? "deleted" : "version"
        });
      }
      const sending = await update(claimed, { status: "sending" });
      if (!sending) return;
      const remote = await network(operation2.scope, operation2.path, { method: operation2.method, body: operation2.body });
      if (!validAcknowledgement(operation2, remote)) throw new Error("Invalid offline write acknowledgement");
      return await acknowledge(sending, remote);
    } catch (error) {
      return fail5({ ...operation2, claim_owner: owner2 }, error);
    }
  }
  return { reconcile, fail: fail5, process };
}
async function dependencyState(context, operation2, rows) {
  if (!operation2.depends_on?.length) return "ready";
  if (operation2.depends_on.some((id) => rows.some((row) => row.entity_id === id && active2(row)))) return "pending";
  return context.db.transaction(["entities", "outbox"], "readonly", async (tx) => {
    for (const id of operation2.depends_on) {
      const parent = await tx.get("entities", entityKey(operation2.scope, id));
      if (deleted(parent?.server)) return "deleted";
      if (!parent?.server || parent.remote_missing || parent.server.version < 1) {
        const abandoned = operation2.protocol === 3 && (await tx.getAll("outbox")).some((row) => row.scope === operation2.scope && row.entity_id === id && row.resolution_id === operation2.resolution_id && row.status === "archived");
        return abandoned ? "deleted" : "unknown";
      }
    }
    return "ready";
  });
}
async function dependenciesReady(context, operation2, rows) {
  const state2 = await dependencyState(context, operation2, rows);
  if (state2 === "deleted") {
    const claimed = await context.update(operation2, { claim_owner: context.owner });
    if (claimed) {
      const entity = await context.db.transaction(["entities"], "readonly", (tx) => tx.get("entities", entityKey(operation2.scope, operation2.entity_id)));
      await context.conflicts.record({ operation: claimed, remote: entity?.server || null, reason: "MEMO_GROUP_UNAVAILABLE" });
    }
  }
  return state2 === "ready";
}
function executionMethods(context) {
  const { getScope, lease, state: state2, list, checkScope, process, db, leaseKey, owner: owner2, now, retryable, canDispatch } = context;
  let running = null;
  async function run2() {
    const scope = getScope();
    if (!scope) return { phase: "paused", pending: 0 };
    if (!await lease(scope)) return { phase: "busy", pending: (await list(scope)).length };
    state2.phase = "syncing";
    state2.error = null;
    try {
      for (let count = 0; count < 1e3; count++) {
        checkScope(scope);
        const rows = await list(scope);
        let operation2;
        for (const candidate of await retryable(scope)) {
          if (candidate.next_attempt_at <= now() && await dependenciesReady(context, candidate, rows)) {
            operation2 = candidate;
            break;
          }
        }
        if (!operation2) break;
        await process(operation2);
      }
      const pending = await list(scope);
      state2.pending = pending.length;
      state2.unsupported = pending.filter((value) => !canDispatch(value)).length;
      state2.phase = state2.unsupported ? "upgrade-required" : pending.some((value) => value.status === "conflict") ? "conflict" : pending.length ? "pending" : "synced";
      return { ...state2 };
    } catch (error) {
      state2.phase = "paused";
      state2.error = error.code || "OFFLINE_UNKNOWN";
      return { ...state2 };
    } finally {
      await db.transaction(["meta"], "readwrite", async (tx) => {
        if ((await tx.get("meta", leaseKey(scope)))?.owner === owner2) await tx.delete("meta", leaseKey(scope));
      });
    }
  }
  function drain() {
    if (!running) running = run2().finally(() => {
      running = null;
    });
    return running;
  }
  async function resume(scope) {
    checkScope(scope);
    return db.transaction(["outbox"], "readwrite", async (tx) => {
      checkScope(scope);
      let count = 0;
      for (const operation2 of await tx.getAll("outbox")) {
        if (operation2.scope === scope && canDispatch(operation2) && operation2.status === "paused") {
          await tx.put("outbox", { ...operation2, status: "unknown", next_attempt_at: 0, claim_owner: null });
          count++;
        }
      }
      return count;
    });
  }
  return { run: run2, drain, resume };
}
function createOutbox(options2) {
  const context = createContext(options2);
  Object.assign(context, storageMethods(context));
  Object.assign(context, remoteMethods(context));
  Object.assign(context, receiptMethods(context));
  Object.assign(context, processingMethods(context));
  Object.assign(context, executionMethods(context));
  const preparationReads = remoteMethods({ ...context, network: context.readNetwork });
  const prepare = createConflictPreparation({ readRemote: preparationReads.readRemote, network: context.readNetwork });
  const decisions = createConflictDecisions({
    db: context.db,
    getScope: context.getScope,
    now: context.now,
    uuid: context.uuid,
    canDispatch: context.canDispatch,
    prepare,
    append: async (tx, inputs, { assertActive }) => {
      const result = [];
      for (const input of inputs) result.push(await context.enqueueInTransaction(tx, { ...input, assertActive }));
      return result;
    }
  });
  async function resolve(...args) {
    const scope = context.getScope();
    try {
      return await decisions.resolve(...args);
    } finally {
      if (scope && context.state.phase !== "syncing") await context.db.transaction(["meta"], "readwrite", async (tx) => {
        const key = context.leaseKey(scope), held = await tx.get("meta", key);
        if (held?.owner === context.owner) await tx.delete("meta", key);
      }).catch(() => {
      });
    }
  }
  context.conflicts.resolve = resolve;
  const { enqueue, drain, resume, list, state: state2, conflicts, canDispatch, retryable } = context;
  return { enqueue, drain, resume, list, state: state2, conflicts, canDispatch, retryable, resolve };
}

// web/offline/sync.mjs
var FORMAT = "haoduoyu-workbench-snapshot-v1", FORMAT2 = "haoduoyu-workbench-snapshot-v2";
var collections = ["todos", "life_notes", "work_notes", "work_reminders", "memo_groups", "memos"];
var v2Collections = [...collections, "unscheduled_todos", "note_labels"];
var types = /* @__PURE__ */ new Set(["todo", "life_note", "work_note", "work_reminder", "memo_group", "memo_note"]);
var v2Types = /* @__PURE__ */ new Set([...types, "unscheduled_todo", "note_label"]);
var recordKeys = /* @__PURE__ */ new Set([
  "entity_id",
  "entity_type",
  "source",
  "source_id",
  "date",
  "category",
  "version",
  "change_seq",
  "created_at",
  "updated_at",
  "deleted_at",
  "content_hash",
  "text",
  "completed",
  "summary",
  "source_key",
  "title",
  "position",
  "body",
  "group_id",
  "label",
  "name"
]);
var hashPattern2 = /^[a-f0-9]{64}$/;
var datePattern = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
var supportedId = /^(?:todo|legacy-life|legacy-work|note-entry|work-reminder|memo-group|memo-note):/;
var supportedId2 = /^(?:todo|legacy-life|legacy-work|note-entry|work-reminder|memo-group|memo-note|unscheduled_todo|note-label):/;
var SNAPSHOT_PULL_LIMITS = Object.freeze({
  maxEntities: 4e3,
  maxDates: 1e3,
  maxResponseBytes: 1048576,
  maxBatchBytes: 8388608,
  maxHashBytes: 8388608,
  maxRequests: 128
});
var stable2 = (value) => Array.isArray(value) ? value.map(stable2) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable2(value[key])])) : value;
var canonical2 = (value) => JSON.stringify(stable2(value));
var equal = (a, b) => canonical2(a) === canonical2(b);
var object2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function fail2(code, message, status) {
  throw Object.assign(new Error(message), { code, ...status ? { status } : {} });
}
function requireValue(condition, message = "工作台快照内容不完整，未覆盖本地数据。") {
  if (!condition) fail2("OFFLINE_SNAPSHOT_INVALID", message);
}
function day3(value) {
  requireValue(typeof value === "string" && datePattern.test(value));
  const parsed = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  requireValue(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value);
  return value;
}
function stamp(value, nullable = false) {
  if (value === null && nullable) return;
  const parts = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireValue(parts && Number(parts[2]) < 24 && Number(parts[3]) < 60 && Number(parts[4]) < 60 && Number.isFinite(Date.parse(value)) && (parts[5] === "Z" || Number(parts[5].slice(1, 3)) < 24 && Number(parts[5].slice(4)) < 60));
  day3(parts[1]);
}
function identity3(scope, getScope) {
  if (getScope() !== scope) fail2("OFFLINE_SCOPE_CHANGED", "当前身份范围已变化，请重新核实；原本地内容已保留。");
}
function budget(limits, crypto2) {
  let bytes = 0, hashBytes = 0, requests = 0;
  const encoder = new TextEncoder();
  return {
    response(value) {
      let text;
      try {
        text = JSON.stringify(value);
      } catch {
        fail2("OFFLINE_SNAPSHOT_INVALID", "工作台快照无法解析。");
      }
      requireValue(typeof text === "string");
      const size = encoder.encode(text).byteLength;
      bytes += size;
      if (size > limits.maxResponseBytes || bytes > limits.maxBatchBytes) fail2("OFFLINE_SNAPSHOT_LIMIT", "本次完整快照超过本机读取预算，未覆盖本地数据。", 413);
    },
    request() {
      if (++requests > limits.maxRequests) fail2("OFFLINE_SNAPSHOT_LIMIT", "本次完整快照请求数超过预算，未覆盖本地数据。", 413);
    },
    async hash(value) {
      const input = encoder.encode(canonical2(value));
      hashBytes += input.byteLength;
      if (hashBytes > limits.maxHashBytes) fail2("OFFLINE_SNAPSHOT_LIMIT", "本次完整快照哈希预算不足，未覆盖本地数据。", 413);
      if (!crypto2?.subtle) fail2("OFFLINE_CRYPTO_UNAVAILABLE", "无法核实快照哈希，未覆盖本地数据。");
      const digest2 = await crypto2.subtle.digest("SHA-256", input);
      return [...new Uint8Array(digest2)].map((value2) => value2.toString(16).padStart(2, "0")).join("");
    }
  };
}
function metadata(row) {
  return {
    entity_id: row.entity_id,
    entity_type: row.entity_type,
    date: row.date,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    content_hash: row.content_hash
  };
}
function envelope(value, scope, limits, version2) {
  if (object2(value) && value.scope_id !== scope) fail2("OFFLINE_SCOPE_CHANGED", "快照身份范围与已核实范围不同，原本地内容已保留。");
  requireValue(object2(value) && value.snapshot_format === (version2 === 2 ? FORMAT2 : FORMAT) && value.projection === "current" && value.complete === true && value.scope_id === scope && value.timezone === "Asia/Shanghai" && hashPattern2.test(value.manifest_hash) && hashPattern2.test(value.global_content_hash) && Array.isArray(value.entities) && value.entities.length <= limits.maxEntities);
  stamp(value.generated_at);
  const seen = /* @__PURE__ */ new Set();
  let previous = "";
  for (const row of value.entities) {
    requireValue(object2(row) && Object.keys(row).sort().join(",") === "content_hash,date,deleted_at,entity_id,entity_type,updated_at" && typeof row.entity_id === "string" && row.entity_id.length > 0 && row.entity_id.length <= 256 && !seen.has(row.entity_id) && row.entity_id > previous && (version2 === 2 ? v2Types : types).has(row.entity_type) && hashPattern2.test(row.content_hash));
    if (row.date !== null) day3(row.date);
    stamp(row.updated_at);
    stamp(row.deleted_at, true);
    seen.add(row.entity_id);
    previous = row.entity_id;
  }
  return value;
}
async function indexFor(value, scope, limits, readBudget, version2) {
  envelope(value, scope, limits, version2);
  requireValue(Array.isArray(value.dates) && value.dates.length <= limits.maxDates && value.index_hash === value.manifest_hash);
  const represented = new Set(value.entities.filter((row) => row.date !== null).map((row) => row.date));
  let previous = "";
  for (const row of value.dates) {
    requireValue(object2(row) && Object.keys(row).sort().join(",") === "content_hash,date" && day3(row.date) > previous && hashPattern2.test(row.content_hash) && represented.has(row.date));
    previous = row.date;
    represented.delete(row.date);
    requireValue(row.content_hash === await readBudget.hash({ scope_id: scope, entities: value.entities.filter((entity) => entity.date === row.date) }));
  }
  requireValue(represented.size === 0);
  requireValue(value.manifest_hash === await readBudget.hash({ snapshot_format: version2 === 2 ? FORMAT2 : FORMAT, scope_id: scope, entities: value.entities }));
  requireValue(value.global_content_hash === await readBudget.hash({ scope_id: scope, entities: value.entities.filter((row) => row.date === null) }));
  return value;
}
function sameIndex(a, b) {
  return a.scope_id === b.scope_id && a.manifest_hash === b.manifest_hash && a.global_content_hash === b.global_content_hash && equal(a.entities, b.entities) && equal(a.dates, b.dates);
}
async function detailFor(value, date, index, limits, readBudget, version2) {
  envelope(value, index.scope_id, limits, version2);
  const selected = version2 === 2 ? v2Collections : collections;
  requireValue(value.date === date && value.manifest_hash === index.manifest_hash && value.global_content_hash === index.global_content_hash && equal(value.entities, index.entities) && object2(value.data) && Object.keys(value.data).sort().join(",") === [...selected].sort().join(",") && hashPattern2.test(value.content_hash) && hashPattern2.test(value.date_content_hash));
  const expected = new Map(index.entities.filter((row) => row.date === null || row.date === date).map((row) => [row.entity_id, row])), records = [];
  for (const name of selected) {
    const rows = value.data[name];
    requireValue(Array.isArray(rows));
    let previous = "";
    for (const row of rows) {
      requireValue(object2(row) && Object.keys(row).every((key) => recordKeys.has(key)) && row.entity_id > previous && expected.has(row.entity_id) && equal(metadata(row), expected.get(row.entity_id)) && typeof row.source === "string" && typeof row.source_id === "string" && Number.isSafeInteger(row.version) && row.version >= 1);
      stamp(row.created_at, true);
      if (row.change_seq !== void 0) requireValue(Number.isSafeInteger(row.change_seq) && row.change_seq >= 0);
      const { content_hash, ...content2 } = row;
      requireValue(content_hash === await readBudget.hash(content2));
      previous = row.entity_id;
      expected.delete(row.entity_id);
      records.push(row);
    }
  }
  requireValue(expected.size === 0);
  const dateEntities = index.entities.filter((row) => row.date === date);
  requireValue(value.date_content_hash === await readBudget.hash({ scope_id: index.scope_id, entities: dateEntities }));
  requireValue(value.content_hash === await readBudget.hash({
    snapshot_format: version2 === 2 ? FORMAT2 : FORMAT,
    scope_id: index.scope_id,
    date,
    timezone: "Asia/Shanghai",
    data: value.data
  }));
  return records;
}
async function applySnapshot({ db, getScope, scope, key, index, initial, cached, records, now, version: version2 }) {
  await db.transaction(["entities", "meta"], "readwrite", async (tx) => {
    identity3(scope, getScope);
    const current2 = await tx.get("meta", key);
    if (!equal(current2 ?? null, initial.meta ?? null)) fail2("OFFLINE_SNAPSHOT_CHANGED", "其他页面已更新本地快照，请重新核对。");
    const all = (await tx.getAll("entities")).filter((row) => row.scope === scope), manifest = new Set(index.entities.map((row) => row.entity_id));
    for (const record of records.values()) {
      const storageKey = entityKey(scope, record.entity_id), old = await tx.get("entities", storageKey);
      if (old?.server?.version > record.version) fail2("OFFLINE_SNAPSHOT_CHANGED", "本地已确认较新版本，未覆盖该版本。");
      const server = { ...record, id: record.source_id }, sameVersion = old?.server?.version === record.version;
      let labelEvidence = old?.label_evidence;
      if (version2 === 2 && record.source === "note_entry" && record.deleted_at === null) {
        labelEvidence = {
          version: record.version,
          category: record.category,
          date: record.date,
          created_at: record.created_at,
          label: record.label ?? null
        };
        if (old?.label_evidence && (old.label_evidence.version > labelEvidence.version || old.label_evidence.version === labelEvidence.version && !equal(old.label_evidence, labelEvidence)))
          fail2("OFFLINE_SNAPSHOT_CHANGED", "标签证据已变化，原本地数据已保留。");
        server.labels_version = 1;
        server.label = labelEvidence.label;
      }
      if (record.entity_type === "unscheduled_todo") {
        delete server.date;
        if (server.completed !== void 0) server.completed = Boolean(server.completed);
      }
      if (record.entity_type === "todo" && sameVersion) {
        for (const field2 of ["template_id", "template_version", "template_active"]) {
          if (Object.hasOwn(old.server, field2)) server[field2] = old.server[field2];
        }
      }
      await tx.put("entities", {
        ...old,
        key: storageKey,
        scope,
        entity_id: record.entity_id,
        server,
        ...labelEvidence ? { label_evidence: labelEvidence } : {},
        snapshot_hash: record.content_hash,
        remote_missing: false,
        synced_at: now(),
        ...record.entity_type === "todo" ? { needs_api_refresh: !sameVersion || old?.needs_api_refresh === true } : {}
      });
    }
    for (const row of all) if (row.server && (version2 === 2 ? supportedId2 : supportedId).test(row.entity_id) && !manifest.has(row.entity_id)) {
      if (!equal(row.server, cached.get(row.entity_id)?.server ?? null))
        fail2("OFFLINE_SNAPSHOT_CHANGED", "其他页面刚确认了记录，未把它判为线上缺失。");
      await tx.put("entities", { ...row, server: null, snapshot_hash: null, remote_missing: true, synced_at: now() });
    }
    identity3(scope, getScope);
    await tx.put("meta", { key, value: { index, verified_at: now() } });
  });
}
function createSnapshotSync({ db, request, getScope, now = Date.now, crypto: crypto2 = globalThis.crypto, limits = {}, version: version2 = 1 }) {
  if (!db?.transaction || typeof request !== "function" || typeof getScope !== "function") throw new TypeError("Snapshot sync dependencies required");
  if (![1, 2].includes(version2)) throw new TypeError("Unsupported snapshot version");
  limits = { ...SNAPSHOT_PULL_LIMITS, ...limits };
  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(SNAPSHOT_PULL_LIMITS, key) || !Number.isSafeInteger(value) || value < 1)
      throw new TypeError("Invalid snapshot pull limit");
  }
  const state2 = { status: "idle", last_success: null, error: null };
  let inFlight = null;
  async function run2({ date: probeDate } = {}) {
    const scope = getScope();
    if (typeof scope !== "string" || !hashPattern2.test(scope)) fail2("OFFLINE_SCOPE_REQUIRED", "请先联网核实当前身份范围。");
    const key = JSON.stringify([scope, version2 === 2 ? "snapshot-v2" : "snapshot"]), readBudget = budget(limits, crypto2);
    const initial = await db.transaction(["entities", "meta"], "readonly", async (tx) => ({
      meta: await tx.get("meta", key),
      entities: (await tx.getAll("entities")).filter((row) => row.scope === scope)
    }));
    identity3(scope, getScope);
    async function get(path) {
      identity3(scope, getScope);
      readBudget.request();
      const value = await request(path);
      identity3(scope, getScope);
      readBudget.response(value);
      return value;
    }
    const indexPath = "/workbench-snapshot/index" + (version2 === 2 ? "?version=2" : "");
    const index = await indexFor(await get(indexPath), scope, limits, readBudget, version2);
    const previous = initial.meta?.value?.index;
    const oldDates = new Map(previous?.scope_id === scope ? previous.dates.map((row) => [row.date, row.content_hash]) : []);
    const dates = new Map(index.dates.map((row) => [row.date, row.content_hash]));
    const changed4 = new Set([.../* @__PURE__ */ new Set([...oldDates.keys(), ...dates.keys()])].filter((date) => oldDates.get(date) !== dates.get(date)));
    const cached = new Map(initial.entities.map((row) => [row.entity_id, row]));
    let needGlobal = !previous || previous.global_content_hash !== index.global_content_hash;
    for (const entity of index.entities) {
      const row = cached.get(entity.entity_id);
      if (!row?.server || row.snapshot_hash !== entity.content_hash) {
        if (entity.date === null) needGlobal = true;
        else changed4.add(entity.date);
      }
    }
    if (!changed4.size && needGlobal && index.entities.some((row) => row.date === null))
      changed4.add(probeDate === void 0 ? new Date(now() + 8 * 36e5).toISOString().slice(0, 10) : day3(probeDate));
    if (changed4.size + 2 > limits.maxRequests) fail2("OFFLINE_SNAPSHOT_LIMIT", "变化日期过多，未返回部分同步结果。", 413);
    const records = /* @__PURE__ */ new Map();
    for (const date of [...changed4].sort()) {
      const path = "/workbench-snapshot?date=" + encodeURIComponent(date) + (version2 === 2 ? "&version=2" : "");
      const rows = await detailFor(await get(path), date, index, limits, readBudget, version2);
      for (const row of rows) {
        if (records.has(row.entity_id)) requireValue(equal(records.get(row.entity_id), row));
        records.set(row.entity_id, row);
      }
    }
    const verified = await indexFor(await get(indexPath), scope, limits, readBudget, version2);
    if (!sameIndex(index, verified)) fail2("OFFLINE_SNAPSHOT_CHANGED", "读取期间线上内容已变化，请稍后重新核对；本地内容已保留。");
    identity3(scope, getScope);
    await applySnapshot({ db, getScope, scope, key, index, initial, cached, records, now, version: version2 });
    state2.last_success = now();
    return { status: "synced", scope, changed_dates: [...changed4].sort(), entities: index.entities.length };
  }
  function pull(options2) {
    if (inFlight) return inFlight;
    state2.status = "pulling";
    state2.error = null;
    inFlight = run2(options2).then((result) => {
      state2.status = "synced";
      return result;
    }, (error) => {
      state2.status = error.code === "OFFLINE_SCOPE_CHANGED" ? "scope-changed" : "error";
      state2.error = { code: error.code || "OFFLINE_SNAPSHOT_NETWORK", status: error.status || null, message: error.message };
      throw error;
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  let stopTriggers = () => {
  };
  function start({
    window: window2 = globalThis.window,
    document: document2 = globalThis.document,
    setInterval: setInterval2 = globalThis.setInterval,
    clearInterval: clearInterval2 = globalThis.clearInterval
  } = {}) {
    stopTriggers();
    const refresh = () => {
      if (!document2 || document2.visibilityState !== "hidden") pull().catch(() => {
      });
    };
    window2?.addEventListener?.("online", refresh);
    document2?.addEventListener?.("visibilitychange", refresh);
    const timer = setInterval2(refresh, 3e5);
    stopTriggers = () => {
      window2?.removeEventListener?.("online", refresh);
      document2?.removeEventListener?.("visibilitychange", refresh);
      clearInterval2(timer);
    };
    refresh();
    return stopTriggers;
  }
  return { pull, state: state2, start, stop: () => stopTriggers() };
}

// web/offline/note-mutations.mjs
var uuid2 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var failure2 = (message, code = "OFFLINE_INVALID_MUTATION") => Object.assign(new Error(message), { code, localNotSaved: true });
function noteMutationRoute(path, options2, features) {
  const match = /^\/note-entries\/([a-f0-9-]{36})$/i.exec(path), method = (options2.method || "GET").toUpperCase();
  return features.notes && match && uuid2.test(match[1]) && ["PUT", "DELETE"].includes(method) ? { type: "note_entry", id: match[1].toLowerCase(), method } : null;
}
function checked(body2, method, labelsV1) {
  const fields5 = method === "PUT" ? [
    "category",
    "date",
    "text",
    "version",
    "save_id",
    ...labelsV1 && Object.hasOwn(body2 || {}, "label") ? ["label"] : []
  ] : ["version", "save_id"];
  if (!body2 || Object.keys(body2).sort().join(",") !== fields5.sort().join(",") || !uuid2.test(body2.save_id) || !Number.isSafeInteger(body2.version) || body2.version < (method === "PUT" ? 0 : 1) || body2.version >= Number.MAX_SAFE_INTEGER)
    throw failure2("保存字段或原保存标识不完整，本次修改未保存。");
  if (method === "PUT") {
    if (Object.hasOwn(body2, "label")) {
      const label3 = body2.label;
      if (body2.category !== "life" || typeof label3 !== "string" || !label3.isWellFormed() || !label3.trim() || [...label3.trim()].length > 32 || /[\u0000-\u001f\u007f]/.test(label3) || ["生活", "工作"].includes(label3.trim().normalize("NFC"))) throw failure2("标签无效，草稿已保留。");
      body2 = { ...body2, label: label3.trim().normalize("NFC") };
    }
    const day4 = /* @__PURE__ */ new Date(body2.date + "T00:00:00Z");
    if (!["life", "work"].includes(body2.category) || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body2.date) || !Number.isFinite(day4.getTime()) || day4.toISOString().slice(0, 10) !== body2.date || typeof body2.text !== "string" || !body2.text.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body2.text) || new TextEncoder().encode(body2.text.replace(/\r\n?/g, "\n")).byteLength > 65536)
      throw failure2("分类、日期或正文无效，草稿已保留。");
  }
  return structuredClone(body2);
}
function createNoteMutations(context) {
  async function mutate(path, options2, route, guard) {
    const { state: state2, cache: cache2, outbox, now } = context, owner2 = state2.scope, generation = context.generation;
    const active5 = () => {
      guard();
      if (!owner2 || owner2 !== state2.scope || generation !== context.generation)
        throw failure2("身份范围已变化，本次修改未保存。", "OFFLINE_SCOPE_CHANGED");
    };
    active5();
    const body2 = checked(options2.body, route.method, context.features.labelsV1 === true);
    if (!await cache2.noteCapability()) throw failure2("请先联网核实碎碎念编辑能力。", "OFFLINE_SCOPE_REQUIRED");
    active5();
    const stored = await cache2.entity("note-entry:" + route.id), visible3 = offlineValue(stored);
    active5();
    if (route.method === "PUT" && body2.version === 0 && !visible3) {
      const existing = await cache2.entities();
      active5();
      if (existing.filter((row) => row.entity_id.startsWith("note-entry:") && (row.dirty ? row.local : row.server)?.category === body2.category && (row.dirty ? row.local : row.server)?.date === body2.date && !(row.dirty ? row.local : row.server)?.deleted && !(row.dirty ? row.local : row.server)?.deleted_at && (row.dirty || !row.remote_missing)).length >= 200)
        throw failure2("本机该日记录已达 200 条，草稿已保留。", "OFFLINE_CACHE_LIMIT");
    }
    if (!options2.offlineUnknown && body2.version !== (visible3?.version || 0))
      throw failure2("本机已有更新，请重新读取后保存，草稿已保留。", "OFFLINE_CACHE_CHANGED");
    if (route.method === "DELETE" && !visible3) throw failure2("此记录尚未保存在本机。", "OFFLINE_CACHE_MISS");
    if (visible3 && route.method === "PUT" && (visible3.category !== body2.category || visible3.date !== body2.date))
      throw failure2("记录的分类和日期不可更改。");
    const labelMode = context.features.labelsV1 === true;
    const persisted = stored?.label_evidence;
    const matches2 = persisted && persisted.version === visible3?.version && persisted.category === visible3?.category && persisted.date === visible3?.date && persisted.created_at === visible3?.created_at;
    const evidence = visible3?.labels_version === 1 && Object.hasOwn(visible3, "label") ? visible3 : stored?.api_server?.labels_version === 1 && stored.api_server.version === visible3?.version && stored.api_server.category === visible3?.category && stored.api_server.date === visible3?.date && stored.api_server.created_at === visible3?.created_at ? stored.api_server : matches2 ? persisted : null;
    if (labelMode && visible3 && !evidence)
      throw failure2("标签尚未核实，请联网读取后再保存，原文已保留。", "OFFLINE_LABEL_UNVERIFIED");
    if (labelMode && visible3 && Object.hasOwn(body2, "label") && body2.label !== evidence.label)
      throw failure2("已有记录的标签不可更改，原文已保留。");
    const label3 = visible3 ? evidence?.label : body2.label ?? null;
    const stamp2 = new Date(now()).toISOString();
    const local = {
      ...visible3,
      ...body2,
      ...labelMode ? { labels_version: 1, label: label3 } : {},
      id: route.id,
      can_edit: true,
      deleted: route.method === "DELETE",
      created_at: visible3?.created_at || stamp2,
      updated_at: stamp2,
      deleted_at: route.method === "DELETE" ? stamp2 : null
    };
    let result;
    try {
      result = await outbox.enqueue({
        scope: owner2,
        entity_type: "note_entry",
        entity_id: route.id,
        method: route.method,
        path,
        body: body2,
        base: stored?.server || null,
        local,
        ...labelMode ? { protocol: 5 } : {},
        initial_status: options2.offlineUnknown ? "unknown" : "queued",
        assertActive: active5
      });
    } catch (error) {
      error.localNotSaved = true;
      if (!error.code) error.code = "OFFLINE_STORAGE_UNAVAILABLE";
      throw error;
    }
    active5();
    if (["acked", "archived"].includes(result.operation.status) && result.entity.server?.can_edit !== void 0)
      return result.entity.server;
    await context.refresh();
    context.broadcast();
    if (context.online()) context.scheduleRetry();
    return localDocument({ local: result.entity.local, server: stored?.api_server || (stored?.server?.can_edit !== void 0 ? stored.server : null), operation: result.operation });
  }
  return { mutate };
}

// web/offline/drafts.mjs
var fields = [
  "kind",
  "id",
  "category",
  "date",
  "draft",
  "version",
  "serverText",
  "contentHash",
  "label",
  "labelKnown",
  "createdAt",
  "updatedAt",
  "dirty",
  "phase",
  "pending",
  "remote",
  "localVersion",
  "durableText",
  "localBacked",
  "localQueued",
  "recoveredBaseline"
];
var unresolved = (row) => row.dirty || row.pending || ["unknown", "conflict", "error", "oversize"].includes(row.phase);
function safeDraft(row) {
  if (!row || !["legacy", "note_entry"].includes(row.kind) || !["life", "work"].includes(row.category) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || typeof row.draft !== "string" || row.draft.length > 262144 || row.kind === "note_entry" && !/^[a-f0-9-]{36}$/i.test(row.id)) throw new Error("本机草稿字段无效。");
  return Object.fromEntries(fields.filter((key) => row[key] !== void 0).map((key) => [key, structuredClone(row[key])]));
}
function createDraftJournal({ db, getScope, getGeneration = () => 0, now = Date.now, draftOwner = crypto.randomUUID() }) {
  const pending = /* @__PURE__ */ new Set();
  async function write(rows) {
    const owner2 = getScope(), generation = getGeneration();
    if (!owner2) return;
    const clean = rows.map(safeDraft);
    const active5 = () => {
      if (owner2 !== getScope() || generation !== getGeneration())
        throw Object.assign(new Error("身份范围已变化，旧草稿保持原范围。"), { code: "OFFLINE_SCOPE_CHANGED" });
    };
    await db.transaction(["meta"], "readwrite", async (tx) => {
      active5();
      for (const row of clean) {
        const identity4 = row.kind === "legacy" ? row.category + ":" + row.date : row.id;
        const key = entityKey(owner2, "draft:" + row.kind + ":" + identity4 + ":" + draftOwner);
        if (unresolved(row)) await tx.put("meta", { key, scope: owner2, draft_kind: row.kind, draft_owner: draftOwner, data: row, saved_at: now() });
        else if (row.kind === "note_entry") {
          await tx.delete("meta", key);
          for (const old of await tx.getAll("meta")) if (old.scope === owner2 && old.draft_kind === "note_entry" && old.data.id === row.id && old.data.draft === row.draft && !old.data.pending) await tx.delete("meta", old.key);
        }
      }
      active5();
    });
  }
  function capture(rows) {
    const work = write(rows);
    pending.add(work);
    work.finally(() => pending.delete(work)).catch(() => {
    });
    return work;
  }
  async function list(kind) {
    const owner2 = getScope(), generation = getGeneration();
    if (!owner2) return [];
    const rows = await db.transaction(["meta"], "readonly", async (tx) => (await tx.getAll("meta")).filter((row) => row.scope === owner2 && row.draft_kind === kind).sort((a, b) => b.saved_at - a.saved_at).map((row) => row.data));
    return owner2 === getScope() && generation === getGeneration() ? rows : [];
  }
  return { capture, list, flush: () => Promise.all([...pending]) };
}

// web/offline/conflict-draft-guards.mjs
var factories = /* @__PURE__ */ new Set();
var uuid3 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var changed = () => {
  throw Object.assign(new Error("本机输入或身份已变化，请保留原文并重新比较。"), { code: "OFFLINE_CONFLICT_CHANGED" });
};
var fields2 = (value, names) => value ? Object.fromEntries(names.filter((name) => value[name] !== void 0).map((name) => [name, value[name]])) : null;
var canonical3 = (value) => Array.isArray(value) ? value.map(canonical3) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical3(value[key])])) : value;
var stable3 = (value) => JSON.stringify(canonical3(value));
function pendingIntent(value) {
  if (!value) return null;
  return {
    ...fields2(value, ["kind", "id", "method", "path", "version", "text", "saveId"]),
    body: fields2(value.body, ["version", "save_id", "title", "body", "group_id", "position", "category", "date", "text", "completed"]),
    snapshot: fields2(value.snapshot, ["title", "body", "group_id", "position", "category", "date", "text", "completed"])
  };
}
function draftSnapshot(value, kind) {
  if (!value) return null;
  return {
    ...fields2(value, kind === "memo" ? ["title", "body", "group_id", "position"] : ["draft"]),
    composing: value.composing === true,
    pending: pendingIntent(value.pending)
  };
}
function entityId(value, prefix) {
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;
  const id = value.slice(prefix.length);
  return uuid3.test(id) ? id.toLowerCase() : null;
}
function privateMemoJournals(storage2, owner2, id) {
  if (!storage2 || typeof owner2 !== "string" || !owner2) changed();
  const prefix = "haoduoyu.memos.drafts.v1." + owner2 + ".", rows = [];
  try {
    const length = storage2.length;
    if (!Number.isSafeInteger(length) || length < 0) changed();
    for (let index = 0; index < length; index++) {
      const key = storage2.key(index);
      if (typeof key !== "string" || !key.startsWith(prefix)) continue;
      const raw = JSON.parse(storage2.getItem(key) || "{}");
      if (!Array.isArray(raw.drafts)) changed();
      const drafts = raw.drafts.filter((draft) => draft?.id === id).map((draft) => draftSnapshot(draft, "memo"));
      if (drafts.length) rows.push([key, drafts.sort((a, b) => stable3(a).localeCompare(stable3(b)))]);
    }
    return rows.sort((a, b) => a[0].localeCompare(b[0]));
  } catch {
    changed();
  }
}
function registerConflictDraftGuard(factory) {
  if (typeof factory !== "function") throw new TypeError("Conflict draft guard must be a factory");
  factories.add(factory);
  return () => factories.delete(factory);
}
function captureConflictDraftGuard(entity_id) {
  const checks = [...factories].map((factory) => factory(entity_id)).filter(Boolean);
  if (checks.some((check) => typeof check !== "function")) throw new TypeError("Conflict draft guard must return a function");
  return () => {
    for (const check of checks) check();
  };
}
function createMemoConflictDraftGuard({
  getStore,
  getIdentity,
  getStorage = () => globalThis.localStorage,
  getComposing = () => false
}) {
  return (entity_id) => {
    const id = entityId(entity_id, "memo-note:"), store = id && getStore();
    if (!store) return null;
    const identity4 = getIdentity(), owner2 = store.state.draftOwner;
    const snapshot = () => stable3({
      draft: draftSnapshot(store.drafts.get(id), "memo"),
      operation: store.state.operation?.pending?.id === id ? pendingIntent(store.state.operation.pending) : null,
      composing: getComposing(id) === true,
      journals: privateMemoJournals(getStorage(), owner2, id)
    });
    let initial;
    try {
      initial = snapshot();
    } catch {
      changed();
    }
    return () => {
      if (store !== getStore() || identity4 !== getIdentity() || owner2 !== store.state.draftOwner) changed();
      try {
        if (snapshot() !== initial) changed();
      } catch {
        changed();
      }
    };
  };
}
function createNoteConflictDraftGuard({ getStores, getIdentity, getComposing = () => false }) {
  return (entity_id) => {
    const id = entityId(entity_id, "note-entry:");
    if (!id) return null;
    const find = () => [...getStores()].filter(([, store]) => store.entries.has(id));
    const initialStores = find();
    if (!initialStores.length) return null;
    const identity4 = getIdentity();
    const snapshot = (rows) => stable3({
      drafts: rows.map(([category, store]) => [category, draftSnapshot(store.entries.get(id), "note")]),
      composing: getComposing(id) === true
    });
    const initial = snapshot(initialStores);
    return () => {
      const current2 = find();
      if (identity4 !== getIdentity() || current2.length !== initialStores.length || current2.some(([category, store], index) => category !== initialStores[index][0] || store !== initialStores[index][1])) changed();
      if (snapshot(current2) !== initial) changed();
    };
  };
}

// web/offline/memos.mjs
var uuid4 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var active3 = (value) => !["archived", "acked"].includes(value.status);
var fail3 = (message, code = "OFFLINE_MEMO_INVALID") => Object.assign(new Error(message), { code });
var keyFor = (scope, kind, id) => entityKey(scope, (kind === "notes" ? "memo-note:" : "memo-group:") + id);
var fields3 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at", "group_id", "body"];
function memoRoute(path) {
  if (path === "/memos") return { kind: "index" };
  const match = /^\/memos\/(notes|groups)\/([a-f0-9-]{36})$/i.exec(path);
  return match && uuid4.test(match[2]) ? { kind: match[1], id: match[2].toLowerCase() } : null;
}
function checked2(row, kind, detail = false) {
  if (!row || !uuid4.test(row.id) || typeof row.title !== "string" || !row.title.trim() || !Number.isSafeInteger(row.version) || row.version < 1 || !Number.isSafeInteger(row.position) || kind === "notes" && (!uuid4.test(row.group_id) || detail && typeof row.body !== "string")) {
    throw fail3("备忘录读取不完整，未覆盖本机内容。");
  }
  return Object.fromEntries(fields3.filter((field2) => row[field2] !== void 0).map((field2) => [field2, row[field2]]));
}
function memoDocument(entity, records, canEdit, index = false) {
  const value = offlineValue(entity);
  if (!value || entity.remote_missing && !entity.dirty) return null;
  const operation2 = records.operations.filter((row) => row.entity_id === entity.entity_id && active3(row)).at(-1) || null;
  const conflict = records.conflicts.find((row) => row.entity_id === entity.entity_id && row.resolved_at === null) || null;
  const local = { ...value, id: value.id || value.source_id, can_edit: canEdit };
  if (!entity.dirty && entity.remote_index?.version > value.version) {
    if (index) return { ...entity.remote_index, can_edit: canEdit };
    if (!entity.remote_index.deleted_at) throw fail3("正文已有新版本，请联网读取后编辑。", "OFFLINE_CACHE_MISS");
    return localDocument({ local: { ...local, deleted_at: entity.remote_index.deleted_at }, server: entity.server });
  }
  if (!entity.dirty && !operation2 && !conflict) return local;
  return localDocument({ local, server: entity.server || null, operation: operation2, conflict });
}
function scoped(context, assertActive = () => {
}) {
  assertActive();
  const scope = context.getScope(), generation = context.getGeneration();
  if (!scope) throw fail3("请先联网核实工作台，本机笔记仍保留。", "OFFLINE_SCOPE_REQUIRED");
  return { scope, check() {
    assertActive();
    if (context.getScope() !== scope || context.getGeneration() !== generation)
      throw fail3("身份范围已变化，输入内容已保留。", "OFFLINE_SCOPE_CHANGED");
  } };
}
function checkedInput(raw, kind, createId) {
  const body2 = structuredClone(raw || {});
  if (!body2.save_id) body2.save_id = createId();
  const fields5 = ["title", "position", "version", "save_id", ...kind === "notes" ? ["group_id", "body"] : []];
  const plain2 = (value) => typeof value === "string" && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  const invalid3 = () => {
    throw Object.assign(fail3("备忘录字段无效，输入仍保留。"), { status: 400 });
  };
  if (Object.keys(body2).sort().join(",") !== fields5.sort().join(",") || !uuid4.test(body2.save_id) || !Number.isSafeInteger(body2.version) || body2.version < 0 || body2.version >= Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(body2.position) || body2.position < 0 || body2.position > 1e6 || !plain2(body2.title) || !body2.title.trim() || [...body2.title.trim()].length > 120 || /[\r\n\t]/.test(body2.title)) invalid3();
  body2.title = body2.title.trim();
  if (kind === "notes") {
    if (!uuid4.test(body2.group_id) || !plain2(body2.body)) invalid3();
    body2.body = body2.body.replace(/\r\n?/g, "\n");
    if (new TextEncoder().encode(body2.body).length > 65536) invalid3();
  }
  return body2;
}
function memoReads(context) {
  async function project(path) {
    const route = memoRoute(path), guard = scoped(context);
    if (!route || route.kind === "groups") throw fail3("此备忘录尚未缓存。", "OFFLINE_CACHE_MISS");
    const result = await context.db.transaction(["entities", "outbox", "conflicts", "meta"], "readonly", async (tx) => {
      guard.check();
      const cap = await tx.get("meta", entityKey(guard.scope, "memo-capability"));
      const entities = (await tx.getAll("entities")).filter((row) => row.scope === guard.scope);
      const records = {
        operations: (await tx.getAll("outbox")).filter((row) => row.scope === guard.scope),
        conflicts: (await tx.getAll("conflicts")).filter((row) => row.scope === guard.scope)
      };
      const canEdit = cap?.can_edit === true;
      if (route.kind === "notes") {
        const entity = entities.find((row) => row.key === keyFor(guard.scope, "notes", route.id));
        if (!entity || typeof offlineValue(entity)?.body !== "string") throw fail3("请联网读取此笔记正文。", "OFFLINE_CACHE_MISS");
        const document2 = memoDocument(entity, records, canEdit);
        if (!document2) throw fail3("笔记已不在当前缓存范围。", "OFFLINE_CACHE_MISS");
        guard.check();
        return document2;
      }
      const values = (kind) => entities.filter((row) => row.entity_id.startsWith(kind === "groups" ? "memo-group:" : "memo-note:")).map((row) => memoDocument(row, records, canEdit, true)).filter(Boolean).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      const data = {
        groups: values("groups"),
        notes: values("notes"),
        can_edit: canEdit,
        ...cap?.draft_scope ? { draft_scope: cap.draft_scope } : {}
      };
      guard.check();
      return data;
    });
    guard.check();
    return result;
  }
  return { project };
}
function memoCache(context) {
  const serverFence3 = (rows, route) => JSON.stringify(rows.filter((row) => row.server && row.entity_id.startsWith("memo-") && (route.kind === "index" || row.entity_id === "memo-note:" + route.id)).map((row) => [row.entity_id, Object.fromEntries(fields3.map((field2) => [field2, row.server[field2]]))]).sort((a, b) => a[0].localeCompare(b[0])));
  async function fence(path) {
    const guard = scoped(context), route = memoRoute(path);
    const rows = await context.db.transaction(["entities"], "readonly", (tx) => tx.getAll("entities"));
    guard.check();
    return serverFence3(rows.filter((row) => row.scope === guard.scope), route);
  }
  async function remember(path, value, { baseline } = {}) {
    const route = memoRoute(path), guard = scoped(context);
    if (!route) return value;
    if (route.kind === "index" && (!Array.isArray(value?.groups) || !Array.isArray(value.notes) || typeof value.can_edit !== "boolean")) throw fail3("备忘录索引不完整，未覆盖本机内容。");
    await context.db.transaction(["entities", "meta"], "readwrite", async (tx) => {
      guard.check();
      const initial = (await tx.getAll("entities")).filter((row) => row.scope === guard.scope);
      if (baseline !== void 0 && baseline !== serverFence3(initial, route))
        throw fail3("本机刚确认了新版本，请重新读取备忘录。", "OFFLINE_CACHE_CHANGED");
      const collections2 = route.kind === "index" ? [["groups", value.groups], ["notes", value.notes]] : [[route.kind, [value]]];
      for (const [kind, rows] of collections2) for (const raw of rows) {
        const server = checked2(raw, kind, route.kind === "notes"), key = keyFor(guard.scope, kind, server.id);
        const old = await tx.get("entities", key);
        if (old?.server?.version > server.version) throw fail3("本机已有较新备忘录，请重读。", "OFFLINE_CACHE_CHANGED");
        const complete = kind === "groups" || typeof server.body === "string";
        const stored = complete ? server : old?.server?.version === server.version ? { ...old.server, ...server } : old?.server || server;
        await tx.put("entities", {
          ...old,
          key,
          scope: guard.scope,
          entity_id: (kind === "groups" ? "memo-group:" : "memo-note:") + server.id,
          server: stored,
          remote_index: server,
          remote_missing: false
        });
      }
      if (route.kind === "index") await tx.put("meta", {
        key: entityKey(guard.scope, "memo-capability"),
        can_edit: value.can_edit,
        ...value.draft_scope ? { draft_scope: value.draft_scope } : {},
        verified_at: context.now()
      });
      guard.check();
    });
    guard.check();
    return context.project(path);
  }
  return { remember, fence };
}
function memoWrites(context) {
  async function mutate(path, options2, assertActive) {
    const route = memoRoute(path), guard = scoped(context, assertActive);
    if (!route || !["notes", "groups"].includes(route.kind) || options2.method?.toUpperCase() !== "PUT") {
      throw fail3("备忘录删除和恢复需联网确认。", "OFFLINE_UNSUPPORTED");
    }
    const body2 = checkedInput(options2.body, route.kind, context.uuid);
    const cap = await context.db.transaction(["meta"], "readonly", (tx) => tx.get("meta", entityKey(guard.scope, "memo-capability")));
    guard.check();
    if (cap?.can_edit !== true) throw fail3("请先联网确认备忘录编辑权限。", "OFFLINE_SCOPE_REQUIRED");
    const key = keyFor(guard.scope, route.kind, route.id);
    const old = await context.db.transaction(["entities"], "readonly", (tx) => tx.get("entities", key));
    guard.check();
    const visible3 = offlineValue(old);
    if (visible3?.deleted_at || visible3?.deleted) throw fail3("笔记已删除，请联网核对后恢复。", "OFFLINE_MEMO_DELETED");
    const local = {
      ...visible3,
      ...body2,
      id: route.id,
      version: body2.version + 1,
      created_at: visible3?.created_at || new Date(context.now()).toISOString(),
      updated_at: new Date(context.now()).toISOString(),
      deleted_at: null
    };
    const result = await context.outbox.enqueue({
      scope: guard.scope,
      entity_type: route.kind === "notes" ? "memo_note" : "memo_group",
      entity_id: route.id,
      method: "PUT",
      path,
      body: body2,
      base: old?.server || null,
      local,
      assertActive: guard.check,
      ...route.kind === "notes" ? { protocol: 2, depends_on: ["memo-group:" + body2.group_id] } : {},
      ...options2.offlineUnknown ? { initial_status: "unknown" } : {}
    });
    guard.check();
    return localDocument({
      local: { ...result.entity.local, can_edit: true },
      server: result.entity.server,
      operation: result.operation,
      conflict: null
    });
  }
  return { mutate };
}
function createMemoOfflineAdapter(options2) {
  const context = { getGeneration: () => 0, now: Date.now, uuid: () => crypto.randomUUID(), ...options2 };
  Object.assign(context, memoReads(context), memoCache(context), memoWrites(context));
  return { project: context.project, remember: context.remember, mutate: context.mutate, fence: context.fence };
}

// web/offline/runtime.mjs
var OFFLINE_FEATURES = Object.freeze({ todos: true, notes: true, memos: true, snapshotV2: true, labelsV1: true });
var scopePattern = /^[a-f0-9]{64}$/;
var uuidPattern5 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var networkFailure = (error) => error?.code === "NETWORK_UNAVAILABLE" || error?.code === "OFFLINE_NETWORK";
var fail4 = (message, code) => Object.assign(new Error(message), { code });
var today = (now) => new Date(now() + 8 * 36e5).toISOString().slice(0, 10);
var offlineError = () => fail4("当前离线，此操作需联网；输入内容已保留。", "OFFLINE_NETWORK");
async function identityProbe(context, path, options2 = {}) {
  const controller = new AbortController(), external = options2.signal;
  const abort = () => controller.abort(external.reason);
  if (external?.aborted) abort();
  else external?.addEventListener("abort", abort, { once: true });
  let timer;
  try {
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(fail4("身份范围核实暂未完成，本机内容已保留。", "OFFLINE_NETWORK"));
        controller.abort();
      }, 1e4);
    });
    return await Promise.race([context.request(path, { ...options2, signal: controller.signal }), expired]);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", abort);
  }
}
function writableRoute(path, options2, features) {
  if (!features.todos) return null;
  const method = (options2.method || "GET").toUpperCase();
  if (["/todos", "/todo-templates", "/unscheduled-todos"].includes(path) && method === "POST")
    return { type: path === "/todos" ? "todo" : path === "/unscheduled-todos" ? "unscheduled_todo" : "template", create: true };
  const match = /^\/(todos|todo-templates|unscheduled-todos)\/([a-f0-9-]{36})(\/restore)?$/i.exec(path);
  if (!match || !uuidPattern5.test(match[2])) return null;
  if (match[3] && (method !== "POST" || !["todos", "unscheduled-todos"].includes(match[1])) || !match[3] && !["PATCH", "DELETE"].includes(method)) return null;
  return {
    type: match[1] === "todos" ? "todo" : match[1] === "unscheduled-todos" ? "unscheduled_todo" : "template",
    id: match[2].toLowerCase(),
    restore: Boolean(match[3])
  };
}
function checkedBody(route, options2, uuid5) {
  const body2 = structuredClone(options2.body || {}), method = (options2.method || "GET").toUpperCase();
  const required = route.create ? route.type === "todo" ? ["id", "date", "text"] : ["id", "text"] : route.type === "todo" ? route.restore || method === "DELETE" ? ["date", "version"] : ["completed", "version"] : route.type === "unscheduled_todo" ? route.restore || method === "DELETE" ? ["version"] : ["completed", "version"] : method === "DELETE" ? ["version"] : ["text", "version"];
  if (route.create && !body2.id) body2.id = uuid5();
  const allowed = [...required, ...route.create && route.type === "todo" ? ["template_id"] : []];
  if (required.some((key) => !Object.hasOwn(body2, key)) || Object.keys(body2).some((key) => !allowed.includes(key)))
    throw fail4("请求字段不完整，本次操作未保存。", "OFFLINE_INVALID_MUTATION");
  if (body2.id && !uuidPattern5.test(body2.id) || body2.template_id && !uuidPattern5.test(body2.template_id))
    throw fail4("事项标识无效，本次操作未保存。", "OFFLINE_INVALID_MUTATION");
  if (body2.date && (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body2.date) || !Number.isFinite(Date.parse(body2.date + "T00:00:00Z")) || (/* @__PURE__ */ new Date(body2.date + "T00:00:00Z")).toISOString().slice(0, 10) !== body2.date))
    throw fail4("请选择有效日期。", "OFFLINE_INVALID_MUTATION");
  if (Object.hasOwn(body2, "text") && (typeof body2.text !== "string" || !body2.text.trim() || body2.text.length > 500 || body2.text.includes("\0")))
    throw fail4("请填写 1–500 字的内容。", "OFFLINE_INVALID_MUTATION");
  if (Object.hasOwn(body2, "completed") && typeof body2.completed !== "boolean")
    throw fail4("完成状态无效。", "OFFLINE_INVALID_MUTATION");
  if (!route.create && (!Number.isSafeInteger(body2.version) || body2.version < 1 || body2.version >= Number.MAX_SAFE_INTEGER))
    throw fail4("版本无效，本次操作未保存。", "OFFLINE_INVALID_MUTATION");
  return body2;
}
function runtimeContext(options2) {
  const {
    db,
    request,
    now = Date.now,
    uuid: uuid5 = () => crypto.randomUUID(),
    online = () => globalThis.navigator?.onLine !== false,
    onIdentity = () => {
    },
    features = OFFLINE_FEATURES
  } = options2;
  const state2 = {
    scope: null,
    verifiedScope: null,
    identity: null,
    online: online(),
    phase: "idle",
    pending: 0,
    conflicts: 0,
    unsupported: 0,
    lastSuccess: null,
    cachedAt: null,
    error: null,
    ready: true
  };
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    for (const callback of listeners) callback({ ...state2 });
  };
  const cache2 = createOfflineCache({
    db,
    getScope: () => state2.scope,
    getGeneration: () => context.generation,
    now,
    labelsV1: features.labelsV1 === true
  });
  const context = {
    db,
    request,
    now,
    uuid: uuid5,
    online,
    onIdentity,
    features,
    state: state2,
    cache: cache2,
    emit,
    listeners,
    generation: 0,
    authFlight: null,
    syncFlight: null,
    timer: null,
    channel: null,
    stopped: false
  };
  const send = async (path, opts) => {
    if (opts?.method && !["GET", "HEAD"].includes(opts.method.toUpperCase()) && !writableRoute(path, opts, features) && !noteMutationRoute(path, opts, features) && !(features.memos && memoRoute(path) && opts.method.toUpperCase() === "PUT"))
      throw fail4("此本机操作需新版页面处理，原内容已保留。", "OFFLINE_UPGRADE_REQUIRED");
    if (!online() || !state2.verifiedScope || state2.verifiedScope !== state2.scope) throw offlineError();
    const owner2 = state2.scope, generation = context.generation;
    try {
      if (opts?.method && !["GET", "HEAD"].includes(opts.method.toUpperCase())) await context.verifyScope();
      if (!state2.verifiedScope || owner2 !== state2.scope || generation !== context.generation) throw offlineError();
      const labelOpts = features.labelsV1 && path.startsWith("/note-entries") ? { ...opts, headers: { ...opts?.headers, "X-Note-Labels-Version": "1" } } : opts;
      const result = await request(path, labelOpts);
      if (owner2 !== state2.scope || generation !== context.generation) throw fail4("身份范围已变化。", "OFFLINE_SCOPE_CHANGED");
      return result;
    } catch (error) {
      if ([401, 403].includes(error.status) && generation === context.generation) await context.invalidate({ forget: true });
      throw error;
    }
  };
  context.outbox = createOutbox({
    db,
    request: send,
    getScope: () => state2.scope,
    now,
    uuid: uuid5,
    timeout: options2.timeout,
    enabledTypes: [
      ...features.todos ? ["todo", "template", "unscheduled_todo"] : [],
      ...features.notes ? ["note_entry"] : [],
      ...features.memos ? ["memo_note", "memo_group"] : []
    ],
    supportedProtocols: features.memos ? [1, 2, 3, 4, 5] : [1, 3, 4, 5],
    supportedDependencies: features.memos === true,
    resolutionReceipts: true
  });
  context.snapshot = createSnapshotSync({ db, request: send, getScope: () => state2.scope, now });
  context.snapshotV2 = features.snapshotV2 === true ? createSnapshotSync({ db, request: send, getScope: () => state2.scope, now, version: 2 }) : null;
  context.memos = createMemoOfflineAdapter({
    db,
    cache: cache2,
    outbox: context.outbox,
    getScope: () => state2.scope,
    getGeneration: () => context.generation,
    now,
    uuid: uuid5
  });
  return context;
}
function identityActions(context) {
  const { cache: cache2, state: state2, emit, request, onIdentity } = context;
  async function invalidate({ forget = false } = {}) {
    context.generation++;
    context.authFlight = null;
    state2.scope = null;
    state2.verifiedScope = null;
    state2.identity = null;
    state2.pending = 0;
    state2.conflicts = 0;
    state2.unsupported = 0;
    state2.phase = "paused";
    if (forget) await cache2.forgetIdentity();
    emit();
  }
  async function adopt(me, index, generation) {
    const identity4 = safeIdentity(me);
    if (generation !== context.generation) throw fail4("身份读取已过期。", "OFFLINE_SCOPE_CHANGED");
    if (!scopePattern.test(index?.scope_id) || index.complete !== true || index.projection !== "current")
      throw fail4("身份范围读取不完整，请联网重试。", "OFFLINE_SCOPE_REQUIRED");
    if (state2.scope && (state2.scope !== index.scope_id || identityFingerprint(state2.identity) !== identityFingerprint(identity4))) {
      await invalidate({ forget: true });
      throw fail4("当前身份范围已变化，原本机内容与队列已保留，请重新打开页面。", "OFFLINE_SCOPE_CHANGED");
    }
    await cache2.saveIdentity(identity4, index.scope_id);
    if (generation !== context.generation || state2.scope && state2.scope !== index.scope_id) {
      await invalidate({ forget: true });
      throw fail4("身份核实已过期，原本机数据已保留。", "OFFLINE_SCOPE_CHANGED");
    }
    state2.scope = index.scope_id;
    state2.verifiedScope = index.scope_id;
    state2.identity = identity4;
    state2.online = true;
    state2.error = null;
    onIdentity(me);
    emit();
    return me;
  }
  async function authenticate(options2 = {}) {
    const generation = context.generation;
    let liveIdentity = null;
    try {
      const me = await identityProbe(context, "/auth/me", options2);
      liveIdentity = safeIdentity(me);
      const index = await identityProbe(context, "/workbench-snapshot/index");
      return await adopt(me, index, generation);
    } catch (error) {
      if (generation !== context.generation) throw fail4("身份核实已过期。", "OFFLINE_SCOPE_CHANGED");
      state2.verifiedScope = null;
      if ([401, 403].includes(error.status)) {
        await invalidate({ forget: true });
        throw error;
      }
      if (!networkFailure(error)) throw error;
      const cached = await cache2.readIdentity();
      if (generation !== context.generation || !cached?.identity || !scopePattern.test(cached.scope)) throw error;
      if (liveIdentity && identityFingerprint(liveIdentity) !== identityFingerprint(cached.identity)) {
        await invalidate({ forget: true });
        throw fail4("当前身份已变化，请联网核实后重新打开。", "OFFLINE_SCOPE_CHANGED");
      }
      state2.scope = cached.scope;
      state2.identity = safeIdentity(cached.identity);
      state2.online = false;
      state2.phase = "offline";
      emit();
      return { ...state2.identity, offlineIdentity: true };
    }
  }
  function verify() {
    if (!context.authFlight) {
      const flight = authenticate().finally(() => {
        if (context.authFlight === flight) context.authFlight = null;
      });
      context.authFlight = flight;
    }
    return context.authFlight;
  }
  async function verifyScope() {
    if (!state2.identity || !state2.verifiedScope) return verify();
    const generation = context.generation, owner2 = state2.scope;
    try {
      const index = await identityProbe(context, "/workbench-snapshot/index");
      if (generation !== context.generation || state2.scope !== owner2 || index?.scope_id !== owner2 || index.complete !== true || index.projection !== "current") {
        await invalidate({ forget: true });
        throw fail4("身份范围已变化，本机内容与队列已保留。", "OFFLINE_SCOPE_CHANGED");
      }
      return state2.identity;
    } catch (error) {
      state2.verifiedScope = null;
      if ([401, 403].includes(error.status)) await invalidate({ forget: true });
      throw error;
    }
  }
  return { authenticate, verify, verifyScope, invalidate };
}
function stateActions(context) {
  const { state: state2, outbox, emit, online } = context;
  async function refresh() {
    const sequence2 = context.refreshSequence = (context.refreshSequence || 0) + 1;
    if (!state2.scope) {
      emit();
      return { ...state2 };
    }
    const owner2 = state2.scope, generation = context.generation;
    const [pending, conflicts] = await Promise.all([outbox.list(owner2), outbox.conflicts.list(owner2)]);
    if (sequence2 !== context.refreshSequence || owner2 !== state2.scope || generation !== context.generation) return { ...state2 };
    state2.pending = pending.length;
    state2.conflicts = conflicts.length;
    state2.online = online() && state2.online;
    state2.unsupported = pending.filter((row) => !outbox.canDispatch(row)).length;
    if (state2.phase !== "syncing") state2.phase = state2.unsupported ? "upgrade-required" : conflicts.length ? "conflict" : state2.online ? pending.length ? "pending" : "synced" : "offline";
    emit();
    return { ...state2 };
  }
  async function queue() {
    if (!state2.scope) return { operations: [], conflicts: [] };
    const owner2 = state2.scope, generation = context.generation;
    const result = { operations: await outbox.list(owner2), conflicts: await outbox.conflicts.list(owner2) };
    result.operations = result.operations.map((row) => outbox.canDispatch(row) ? row : { ...row, needs_upgrade: true });
    result.conflicts = result.conflicts.map((row) => outbox.canDispatch(row.operation) ? row : { ...row, needs_upgrade: true });
    return owner2 === state2.scope && generation === context.generation ? result : { operations: [], conflicts: [] };
  }
  async function resolve(key, choice2, options2 = {}) {
    if (!state2.scope) throw fail4("请先核实身份。", "OFFLINE_SCOPE_REQUIRED");
    const conflict = (await outbox.conflicts.list(state2.scope)).find((row) => row.key === key);
    if (conflict && !outbox.canDispatch(conflict.operation)) throw fail4("此本机操作需新版页面处理，原内容已保留。", "OFFLINE_UPGRADE_REQUIRED");
    const owner2 = state2.scope, generation = context.generation;
    const checkDraft = captureConflictDraftGuard(conflict?.entity_id);
    const active5 = () => {
      if (options2.signal?.aborted) throw new DOMException("请求已取消", "AbortError");
      if (owner2 !== state2.scope || generation !== context.generation) throw fail4("身份已变化，原文已保留。", "OFFLINE_SCOPE_CHANGED");
      checkDraft();
    };
    active5();
    await context.verifyScope();
    active5();
    const result = await outbox.resolve(key, choice2, {
      scope: owner2,
      assertActive: active5,
      expected: options2.expected,
      copyConfirmed: options2.copyConfirmed
    });
    await refresh();
    context.broadcast();
    if (result.resolution?.state === "queued" && context.online()) context.scheduleRetry();
    return result;
  }
  return { refresh, queue, resolve };
}
function syncActions(context) {
  const { state: state2, emit, outbox, snapshot, now, online } = context;
  async function run2() {
    if (!online()) {
      state2.verifiedScope = null;
      return context.refresh();
    }
    if (context.cooldownUntil > now()) {
      context.scheduleRetry();
      return context.refresh();
    }
    try {
      await context.verify();
      if (!state2.verifiedScope) return context.refresh();
      state2.phase = "syncing";
      emit();
      await outbox.resume(state2.scope);
      await outbox.drain();
      if (state2.verifiedScope) await context.cache.captureDocuments();
      if (state2.verifiedScope) {
        await snapshot.pull({ date: today(now) });
        if (context.snapshotV2) await context.snapshotV2.pull({ date: today(now) });
        if (context.lastTodoPath) {
          const date = offlineReadRoute(context.lastTodoPath).date;
          if ((await context.cache.entities()).some((row) => row.needs_api_refresh && row.server?.date === date))
            await context.call(context.lastTodoPath);
        }
      }
      state2.lastSuccess = now();
      state2.error = null;
    } catch (error) {
      state2.error = error.message;
      if (error.status === 429) context.cooldownUntil = now() + 6e4;
      if (error.status) state2.online = true;
      else if (networkFailure(error)) state2.online = false;
    }
    state2.phase = "idle";
    await context.refresh();
    context.broadcast();
    if (state2.pending && state2.online && !context.stopped) context.scheduleRetry();
    return { ...state2 };
  }
  function sync() {
    if (context.syncFlight) {
      if (online()) context.syncAgain = true;
      return context.syncFlight;
    }
    context.syncFlight = run2().finally(() => {
      context.syncFlight = null;
      const again = context.syncAgain;
      context.syncAgain = false;
      if (again && !context.stopped) queueMicrotask(() => {
        if (!context.stopped && online()) void sync();
      });
    });
    return context.syncFlight;
  }
  function scheduleRetry() {
    clearTimeout(context.timer);
    const owner2 = state2.scope;
    if (!owner2) return;
    outbox.retryable(owner2).then((operations2) => {
      if (context.stopped || state2.scope !== owner2) return;
      if (!operations2.length) return;
      const next = Math.min(...operations2.map((row) => row.next_attempt_at || 0));
      const delay = Math.max(100, next - now(), (context.cooldownUntil || 0) - now());
      clearTimeout(context.timer);
      context.timer = setTimeout(() => {
        if (!context.stopped) void sync();
      }, delay);
      context.timer?.unref?.();
    }).catch((error) => {
      state2.error = error.message;
      emit();
    });
  }
  return { sync, scheduleRetry };
}
async function unmanaged(context, path, options2, guard) {
  try {
    guard();
    return await context.request(path, options2);
  } catch (error) {
    if ([401, 403].includes(error.status)) await context.invalidate({ forget: true });
    throw error;
  }
}
async function mutateMemo(context, path, options2, guard) {
  const value = await context.memos.mutate(path, options2, guard);
  guard();
  await context.refresh();
  context.broadcast();
  if (context.online()) context.scheduleRetry();
  return value;
}
async function rememberRead(context, path, value, baseline, memo) {
  if (memo) return context.memos.remember(path, value, { baseline });
  try {
    return await context.cache.write(path, value, { baseline });
  } catch (error) {
    if (["OFFLINE_RESPONSE_INVALID", "OFFLINE_SCOPE_CHANGED", "OFFLINE_CACHE_CHANGED"].includes(error.code)) throw error;
    context.state.error = error.message;
    context.emit();
    return value;
  }
}
function labelRequestOptions(path, options2, features) {
  return features.labelsV1 && path.startsWith("/note-entries") ? { ...options2, headers: { ...options2.headers, "X-Note-Labels-Version": "1" } } : options2;
}
function mutationActions(context) {
  const { state: state2, cache: cache2, now, uuid: uuid5, outbox, features } = context;
  async function mutate(path, options2, route, guard) {
    guard();
    if (!state2.scope || !state2.identity) throw fail4("请先联网读取此工作台，再保存离线内容。", "OFFLINE_SCOPE_REQUIRED");
    const owner2 = state2.scope, generation = context.generation;
    const active5 = () => {
      guard();
      if (owner2 !== state2.scope || generation !== context.generation)
        throw fail4("身份范围已变化，本次修改未保存，输入已保留。", "OFFLINE_SCOPE_CHANGED");
    };
    const body2 = checkedBody(route, options2, uuid5), id = route.id || body2.id;
    const old = await cache2.entity(route.type + ":" + id), base = old?.server || null, visible3 = offlineValue(old);
    active5();
    if (!route.create && !visible3) throw fail4("此事项尚未保存在本机，请联网读取后再操作。", "OFFLINE_CACHE_MISS");
    const stamp2 = new Date(now()).toISOString(), method = options2.method.toUpperCase();
    const local = {
      ...visible3,
      ...body2,
      id,
      created_at: visible3?.created_at || stamp2,
      updated_at: stamp2,
      deleted_at: method === "DELETE" ? stamp2 : route.restore ? null : visible3?.deleted_at || null,
      ...route.create ? { completed: false, ...route.type === "template" ? { completed_days: 0, habit_status: "todo" } : {} } : {},
      ...route.restore ? { deleted: false } : {}
    };
    if (body2.template_id) {
      const template = offlineValue(await cache2.entity("template:" + body2.template_id));
      active5();
      if (!template || template.deleted) throw fail4("常用待办尚未保存在本机，请联网读取。", "OFFLINE_CACHE_MISS");
      local.template_version = template.version;
      local.template_active = true;
    }
    active5();
    const { entity } = await outbox.enqueue({
      scope: owner2,
      entity_type: route.type,
      entity_id: id,
      method,
      path,
      body: body2,
      base,
      local,
      ...route.type === "unscheduled_todo" ? { protocol: 4 } : {},
      assertActive: active5
    });
    active5();
    await context.refresh();
    context.broadcast();
    if (context.online()) context.scheduleRetry();
    return structuredClone(entity.local);
  }
  async function call(path, input = {}, readRetried = false) {
    const { offlineGuard: guard = () => {
    }, ...options2 } = input;
    guard();
    const method = (options2.method || "GET").toUpperCase(), route = writableRoute(path, options2, features);
    const memo = features.memos && memoRoute(path);
    const noteRoute = noteMutationRoute(path, options2, features);
    if (noteRoute) return context.noteMutations.mutate(path, options2, noteRoute, guard);
    if (path === "/auth/me" && method === "GET") return options2.context || options2.signal ? context.authenticate(options2) : context.verify();
    if (["/auth/login", "/auth/logout"].includes(path) && method === "POST") {
      const value = await context.request(path, labelRequestOptions(path, options2, features));
      await context.invalidate({ forget: true });
      return value;
    }
    if (route) return mutate(path, options2, route, guard);
    if (memo && method === "PUT") return mutateMemo(context, path, options2, guard);
    if (method !== "GET" || !offlineReadRoute(path)) return unmanaged(context, path, options2, guard);
    if (offlineReadRoute(path).kind === "todo") context.lastTodoPath = path;
    try {
      if (context.online() && state2.identity) await context.verifyScope();
      guard();
      const owner2 = state2.scope, generation = context.generation;
      const baseline = owner2 ? await (memo ? context.memos.fence(path) : cache2.fence(path)) : void 0;
      guard();
      const value = await context.request(path, labelRequestOptions(path, options2, features));
      guard();
      if (owner2 !== state2.scope || generation !== context.generation) throw fail4("身份范围已变化，本次读取已取消。", "OFFLINE_SCOPE_CHANGED");
      if (offlineReadRoute(path).kind === "todo") state2.partial = false;
      if (!state2.scope) return value;
      return await rememberRead(context, path, value, baseline, memo);
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        await context.invalidate({ forget: true });
        throw error;
      }
      if (error.code === "OFFLINE_CACHE_CHANGED" && !readRetried) return call(path, input, true);
      if (!networkFailure(error)) throw error;
      state2.verifiedScope = null;
      state2.online = false;
      if (memo) {
        const value = await context.memos.project(path);
        guard();
        await context.refresh();
        return value;
      }
      const cached = await cache2.read(path);
      const kind = offlineReadRoute(path).kind;
      if (kind === "overview") state2.cachedAt = cached.saved_at;
      if (kind === "todo") state2.partial = cached.data.offline_partial === true;
      const data = ["legacy", ...!features.notes ? ["note_entries", "note_entry"] : [], "memos", "memo_note"].includes(kind) ? { ...cached.data, can_edit: false, ...Array.isArray(cached.data.entries) ? { entries: cached.data.entries.map((entry) => ({ ...entry, can_edit: false })) } : {} } : cached.data;
      await context.refresh();
      return data;
    }
  }
  return { call, mutate };
}
function lifecycleActions(context) {
  let stop = () => {
  };
  const broadcast = () => context.channel?.postMessage({ type: "changed", scope: context.state.scope });
  function start({ window: window2 = globalThis.window, document: document2 = globalThis.document, BroadcastChannel = globalThis.BroadcastChannel } = {}) {
    stop();
    context.stopped = false;
    const sync = () => {
      if (document2?.visibilityState !== "hidden") void context.sync();
    };
    const offline = () => {
      context.state.verifiedScope = null;
      void context.refresh();
    };
    window2?.addEventListener("online", sync);
    window2?.addEventListener("focus", sync);
    window2?.addEventListener("haoduoyu:sync-request", sync);
    window2?.addEventListener("offline", offline);
    document2?.addEventListener("visibilitychange", sync);
    const timer = setInterval(sync, 3e5);
    timer?.unref?.();
    if (BroadcastChannel) {
      context.channel = new BroadcastChannel("haoduoyu-offline-status-v1");
      context.channel.onmessage = (event) => {
        if (event.data?.type === "changed" && event.data.scope === context.state.scope) void context.refresh();
      };
    }
    stop = () => {
      context.stopped = true;
      clearTimeout(context.timer);
      clearInterval(timer);
      context.channel?.close();
      context.channel = null;
      window2?.removeEventListener("online", sync);
      window2?.removeEventListener("focus", sync);
      window2?.removeEventListener("haoduoyu:sync-request", sync);
      window2?.removeEventListener("offline", offline);
      document2?.removeEventListener("visibilitychange", sync);
    };
    sync();
    return stop;
  }
  return { start, stop: () => stop(), broadcast };
}
function createOfflineRuntime(options2) {
  const context = runtimeContext(options2);
  Object.assign(context, identityActions(context), stateActions(context), syncActions(context), lifecycleActions(context));
  Object.assign(context, mutationActions(context));
  context.noteMutations = createNoteMutations(context);
  const drafts = createDraftJournal({ db: context.db, getScope: () => context.state.scope, getGeneration: () => context.generation, now: context.now });
  return {
    call: context.call,
    sync: context.sync,
    start: context.start,
    stop: context.stop,
    refresh: context.refresh,
    readMemo: (path) => context.memos.project(path),
    queue: context.queue,
    resolve: context.resolve,
    invalidate: context.invalidate,
    state: context.state,
    localRead: async (path) => (await context.cache.read(path)).data,
    retainDrafts: drafts.capture,
    retainedDrafts: drafts.list,
    flushDrafts: drafts.flush,
    subscribe(callback) {
      context.listeners.add(callback);
      callback({ ...context.state });
      return () => context.listeners.delete(callback);
    }
  };
}
var singleton = null, initialization = null;
var readyListeners = /* @__PURE__ */ new Set();
function getOfflineRuntime() {
  return singleton;
}
function onOfflineRuntime(callback) {
  readyListeners.add(callback);
  if (singleton) callback(singleton);
  return () => readyListeners.delete(callback);
}
async function offlineRequest(path, options2, request, onIdentity, assertActive = () => {
}) {
  if (!initialization) initialization = openOfflineDB().then((db) => {
    singleton = createOfflineRuntime({ db, request, onIdentity });
    for (const callback of readyListeners) callback(singleton);
    return singleton;
  });
  let runtime2;
  try {
    runtime2 = await initialization;
  } catch {
    assertActive();
    if (writableRoute(path, options2, OFFLINE_FEATURES) || noteMutationRoute(path, options2, OFFLINE_FEATURES) || OFFLINE_FEATURES.memos && memoRoute(path) && options2.method?.toUpperCase() === "PUT")
      throw fail4("浏览器无法保存本机数据，本次修改未保存；输入已保留。", "OFFLINE_STORAGE_UNAVAILABLE");
    return request(path, options2);
  }
  assertActive();
  const managed = offlineReadRoute(path) || writableRoute(path, options2, OFFLINE_FEATURES) || noteMutationRoute(path, options2, OFFLINE_FEATURES) || ["/auth/me", "/auth/login", "/auth/logout"].includes(path);
  if (!managed) return runtime2.call(path, { ...options2, offlineGuard: assertActive });
  const { envelope: envelope2 = false, ...opts } = options2;
  const value = await runtime2.call(path, { ...opts, offlineGuard: assertActive });
  return envelope2 ? { data: value } : value;
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
    throw Object.assign(new Error("暂时无法连接网站，请检查网络后重试。"), { code: "NETWORK_UNAVAILABLE" });
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
    throw Object.assign(new Error("服务暂时不可用，请稍后重试。"), { code: "NETWORK_UNAVAILABLE" });
  }
  return { ok: response.ok, status: response.status, text };
}
function apiFailure(path, response, payload, epoch, identity4) {
  const current2 = epoch === runtime.sessionEpoch && identity4 === (state.me?.id ?? null);
  if (response.status === 401 && path !== "/auth/login" && current2) {
    state.me = null;
    closeModal();
    renderLogin();
  }
  const message = payload.error?.message || (response.status === 409 ? "记录已更新，请刷新后重新编辑。" : "操作失败，请稍后重试。");
  const error = new Error(message);
  error.status = response.status;
  error.code = payload.error?.code;
  if (response.status === 401 && !current2) error.staleSession = true;
  return error;
}
async function apiNetwork(path, options2 = {}) {
  const epoch = runtime.sessionEpoch, identity4 = state.me?.id ?? null;
  const { envelope: envelope2 = false, context, ...requestOptions } = options2;
  const opts = apiOptions(requestOptions), method = (opts.method || "GET").toUpperCase();
  const scope = method === "GET" ? context || backgroundRequests() : null;
  const response = scope ? await pendingGet(
    path,
    opts,
    envelope2,
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
  if (!response.ok) throw apiFailure(path, response, payload, epoch, identity4);
  return envelope2 ? payload : payload.data;
}
function api(path, options2 = {}) {
  const epoch = runtime.sessionEpoch, identity4 = state.me?.id ?? null;
  const active5 = () => {
    if (epoch !== runtime.sessionEpoch || identity4 !== (state.me?.id ?? null) || options2.signal?.aborted || options2.context?.controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
  };
  return offlineRequest(path, options2, apiNetwork, (me) => {
    if (state.me && state.me.id === me.id) state.me = me;
  }, active5);
}

// web/pages/unscheduled-todos.mjs
var cache = { owner: "", items: [], draft: "", loaded: false, loading: false, error: "", pending: false, request: null };
var owner = () => JSON.stringify([runtime.sessionEpoch, state.me?.id ?? null]);
function current() {
  const key = owner();
  if (cache.owner !== key) Object.assign(cache, { owner: key, items: [], draft: "", loaded: false, loading: false, error: "", pending: false, request: null });
  return cache;
}
var visible = () => Boolean(state.me) && state.page === "todos" && state.todoPanel === "future";
function renderUnscheduledTodos() {
  const v = current();
  return `<section id="todo-future" aria-label="未来待办" ${visible() ? "" : "hidden"}>
<form id="todo-future-form" class="daily-todo-form"><label class="sr-only" for="todo-future-text">未来待办</label>
<input id="todo-future-text" class="input" name="text" maxlength="500" required autocomplete="off" placeholder="还没确定日期的事" value="${e(v.draft)}">
<button class="btn primary" type="submit" ${v.pending ? "disabled" : ""}>添加</button></form>
<p id="todo-future-status" class="daily-todo-status" role="status"></p><p id="todo-future-error" class="form-message" role="alert"></p>
<ul id="todo-future-items" class="daily-todo-items"></ul></section>`;
}
function paintUnscheduledTodos() {
  const v = current(), root = $("#todo-future");
  if (!root) return;
  root.hidden = !visible();
  const input = $("#todo-future-text", root), button2 = $("#todo-future-form button", root), status = $("#todo-future-status", root), error = $("#todo-future-error", root), list = $("#todo-future-items", root);
  if (input && document.activeElement !== input && input.value !== v.draft) input.value = v.draft;
  if (button2) button2.disabled = v.pending;
  if (status) status.textContent = v.loading && !v.loaded ? "" : v.loaded && v.items.length === 0 ? "还没有未来待办。" : "";
  if (error) error.textContent = v.error;
  if (list) list.innerHTML = v.items.filter((x) => !x.deleted_at && !x.deleted).map((x) => `<li class="daily-todo-row${x.completed ? " is-complete" : ""}">
<label><input type="checkbox" data-future-todo-id="${e(x.id)}" ${x.completed ? "checked" : ""} ${v.pending ? "disabled" : ""}>
<span class="daily-todo-text">${e(x.text)}</span></label><button class="icon-button" type="button"
 data-action="todo-future-delete" data-id="${e(x.id)}" aria-label="删除 ${e(x.text)}" ${v.pending ? "disabled" : ""}>×</button></li>`).join("");
}
async function loadUnscheduledTodos() {
  if (!visible()) return;
  const v = current(), key = v.owner;
  if (v.loading) return;
  v.loading = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const data = await api("/unscheduled-todos");
    if (v.owner !== key || owner() !== key || !Array.isArray(data.items)) return;
    v.items = data.items;
    v.loaded = true;
  } catch (error) {
    if (v.owner === key && owner() === key && !error.staleSession && error.name !== "AbortError") v.error = error.message;
  } finally {
    if (v.owner === key && owner() === key) {
      v.loading = false;
      paintUnscheduledTodos();
    }
  }
}
function inputUnscheduledTodo(el) {
  if (el.id === "todo-future-text") current().draft = el.value;
}
async function submitUnscheduledTodo({ data }) {
  if (!visible()) return;
  const v = current(), key = v.owner, text = String(data.text || "").trim();
  if (v.pending) return;
  if (!text || text.length > 500) {
    v.error = "请填写 1–500 字的内容。";
    paintUnscheduledTodos();
    return;
  }
  if (!v.request || v.request.text !== text) v.request = { id: crypto.randomUUID(), text };
  const submitted = v.request;
  v.pending = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const row = await api("/unscheduled-todos", { method: "POST", body: submitted });
    if (v.owner !== key || owner() !== key) return;
    v.items = [...v.items.filter((x) => x.id !== row.id), row];
    if (v.draft.trim() === text) v.draft = "";
    v.request = null;
    const input = $("#todo-future-text");
    if (input && input.value.trim() === text) input.value = "";
  } catch (error) {
    if (v.owner === key && owner() === key && !error.staleSession) v.error = error.message;
  } finally {
    if (v.owner === key && owner() === key) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
async function change(id, method, body2) {
  if (!visible()) return;
  const v = current(), key = v.owner, row = v.items.find((x) => x.id === id);
  if (!row || v.pending) return;
  v.pending = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const updated = await api("/unscheduled-todos/" + encodeURIComponent(id), { method, body: { ...body2, version: row.version } });
    if (v.owner === key && owner() === key) v.items = v.items.map((x) => x.id === id ? updated : x);
  } catch (error) {
    if (v.owner === key && owner() === key && !error.staleSession) v.error = error.message;
  } finally {
    if (v.owner === key && owner() === key) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
function toggleUnscheduledTodo(el) {
  return change(el.dataset.futureTodoId, "PATCH", { completed: el.checked });
}
function deleteUnscheduledTodo(id) {
  return change(id, "DELETE", {});
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
  if (["notes", "memos", "reminders"].includes(state.page) || state.page === "settings" && state.settingsTab === "workspace") return "";
  if (state.page === "dashboard") return `${state.articleOverviewMode === "published" ? dashboardInfo("metrics", "总览数据口径", "header") : ""}<button class="icon-button" data-action="refresh" title="刷新数据" aria-label="刷新数据">${icon("refresh")}</button>`;
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
  if (state.page === "reminders") return '<div class="heading-left"><h1>每日工作提醒</h1></div>';
  if (state.page === "memos") return '<div class="heading-left"><h1>' + (state.memoView === "trash" ? "备忘录回收站" : "备忘录") + "</h1></div>";
  if (state.page === "notes") return '<div class="heading-left"><h1>碎碎念</h1></div>';
  if (state.page === "todos") return '<div class="heading-left"><h1>每日待办</h1></div>';
  const count = state.page === "articles" ? state.articleMeta?.total : state.page === "settings" && state.settingsTab === "accounts" ? rowsForAccount(
    state.accounts
  ).length : null;
  const account = ["dashboard", "articles"].includes(state.page) || state.page === "settings" && state.settingsTab === "accounts";
  return `<div class="heading-left"><h1>${e(nav.find((n) => n.id === state.page)?.label || "总览")}</h1><span id="page-count" class="page-count" ${count == null ? "hidden" : ""}>${count == null ? "" : e(num(count))}</span></div><div class="head-actions">${account ? accountFilter() : ""}${headerActions()}<button class="icon-button" data-action="page-menu" aria-label="更多页面操作" aria-haspopup="menu" aria-expanded="false" aria-controls="page-menu">⋯</button></div>`;
}
function skeleton() {
  return '<div class="skeleton" role="status" aria-label="正在读取数据"><span></span><span></span><span></span><span class="sr-only">正在读取数据…</span></div>';
}
function comparisonHTML(comparison) {
  if (!comparison?.comparable) return `<span class="comparison muted" title="${e(comparison?.reason || "缺少完整的可比数据")}">暂不可比</span>`;
  const delta = Number(comparison.delta), direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const change2 = delta === 0 ? "持平" : `${delta > 0 ? "+" : ""}${num(delta)}`;
  const percent = comparison.percent == null ? "" : `（${Number(comparison.percent) > 0 ? "+" : ""}${num(comparison.percent)}%）`;
  return `<span class="comparison ${direction}" title="${e(comparison.reason || "与前一等长周期比较")}">${change2}${percent}</span>`;
}
function dashboardInfo(kind, label3, id = "") {
  return `<button class="icon-button inline-info" data-action="dashboard-info" data-kind="${e(kind)}" data-id="${e(id)}" aria-label="${e(label3)}" aria-expanded="false" aria-controls="info-${e(kind)}-${e(id)}">${icon("info", 14)}</button>`;
}
function platformColor(platform) {
  return `var(--p-${["toutiao", "zhihu", "wechat"].includes(platform) ? platform : "other"})`;
}
function freshness(c, now = Date.now()) {
  const stamp2 = [c.as_of, c.collected_at].find((v) => v && Number.isFinite(Date.parse(v)));
  if (!stamp2) return { kind: "unknown", label: "数据新鲜度未知" };
  const days = Math.floor((Date.parse(bjtDate(now)) - Date.parse(bjtDate(stamp2))) / 864e5);
  return days < 0 ? { kind: "unknown", label: "数据日期待核实" } : { kind: days <= 1 ? "up" : days <= 3 ? "warn" : "danger", label: `数据截至 ${time(
    stamp2,
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
function hasRecordedUnknownMetrics(row) {
  return !isPublished(row) && !Object.hasOwn(statusLabels, row.status) && (row.latest_metrics != null || Array.isArray(row.observations) && row.observations.length > 0 || Array.isArray(row.timeline) && row.timeline.length > 0);
}
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
    if (!isPublished(row) && !hasRecordedUnknownMetrics(row)) return '<span class="article-ledger-muted">未发布</span>';
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
  return `<section class="card"><h2 title="仅按公众号槽位统计">保险编号进度</h2>
<dl class="article-ledger-stats"><div><dt>实际记录</dt><dd>${e(value.recorded)}</dd></div><div><dt>去重编号</dt><dd>${e(value.unique_count)}</dd></div>
<div><dt>最高编号</dt><dd>${e(value.highest ?? "未知")}</dd></div></dl><p>${e(statusCounts(value.counts))}</p>
<p>重复号：${e(value.duplicate_numbers.map((row) => `${row.number}（${row.article_ids.length}条）`).join("、") || "无")}</p>
<p>缺号候选：${e(value.observed_gap_ranges.map((row) => row.from === row.to ? row.from : `${row.from}–${row.to}`).join("、") || "未观察到内部间隔")}</p>
<details><summary>编号口径</summary><p>起点、目标与样本编号映射未知；候选仅为已记录编号之间的间隔。</p></details></section>`;
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
  return `<p role="status">筛选结果 ${e(rows.length)} 条</p>${rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>文章</th><th>存稿日期</th><th>槽位</th><th>状态</th>
<th>写作者</th><th>编号</th><th>缺字段</th><th>待核</th><th>警告</th><th>样本</th></tr></thead><tbody>${articleRows(rows)}</tbody></table></div>` : '<p class="muted">没有符合条件的实际文章记录。</p>'}`;
}
function changeReconciliationFilters(element) {
  const form = element.closest("#reconciliation-filters");
  if (!form || !reconciliationData) return false;
  document.querySelector("#reconciliation-results").innerHTML = table(reconciliationData, Object.fromEntries(new FormData(form)));
  return true;
}
function renderReconciliation(data) {
  if (data?.complete !== true || !Array.isArray(data.rows)) throw new Error("发布情况未完整取得，请重试。");
  reconciliationData = data;
  const values = (key) => [...new Set(data.rows.map((row) => row[key] ?? "unknown"))].sort();
  const dates = Object.fromEntries(values("run_date").map((value) => [value, value === "unknown" ? "日期未标注" : value]));
  return `<div class="article-ledger-overview article-reconciliation"><section class="card"><h2>发布情况</h2>
<p>应产出：未配置 · 缺产：未配置 · 逾期：未配置</p><p>${e(statusCounts(data.counts))}</p>
<form id="reconciliation-filters" class="filters">
<label class="form-field">日期<select class="input" name="run_date">${options(values("run_date"), dates)}</select></label>
<label class="form-field">槽位<select class="input" name="slot">${options(values("slot"), slotLabels)}</select></label>
<label class="form-field">写作者<select class="input" name="writer">${options(values("writer"), writerLabels)}</select></label>
<label class="form-field">状态<select class="input" name="status">${options(values("status"), statusLabels)}</select></label></form>
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
var routeDate = "", routeCategory = "life";
var dailyNotesRouteCategory = () => routeCategory;
function setDailyNotesRouteCategory(value) {
  routeCategory = value === "work" ? "work" : "life";
}
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
  uuid: uuid5 = () => crypto.randomUUID(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = 700
}) {
  const context = { pages: /* @__PURE__ */ new Map(), disposed: false, options: { load, put, remove, restore, onSaved, uuid: uuid5 } };
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
  const matches2 = (value, operation2) => value.version === operation2.version + 1 && (operation2.kind === "delete" ? value.deleted === true : operation2.kind === "restore" ? value.deleted === false : value.deleted === false && value.text === operation2.text);
  function accepted(item, value, operation2) {
    const keep = operation2.kind === "put" && item.draft !== operation2.text;
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
  Object.assign(context, { page, emit, stopTimer, adopt, schedule, matches: matches2, accepted, dispose });
  return context;
}
function createReadingActions(context) {
  const { page, emit, stopTimer, adopt, schedule } = context;
  const { load } = context.options;
  async function read(date) {
    const item = page(date), sequence2 = ++item.sequence, writeEpoch = item.writeEpoch;
    item.loading = true;
    emit();
    try {
      const value = checkedPage(await load(date), date);
      if (context.disposed || sequence2 !== item.sequence) return;
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
      if (!context.disposed && sequence2 === item.sequence) {
        item.error = error.message;
        if (!["conflict", "unknown"].includes(item.phase)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence2 === item.sequence) {
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
  const { page, emit, stopTimer, matches: matches2, accepted } = context;
  const { put, remove, restore, uuid: uuid5 } = context.options;
  async function send(item, operation2) {
    stopTimer(item);
    item.pending = operation2;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    emit();
    try {
      const raw = await (operation2.kind === "restore" ? restore(item.date, {
        version: operation2.version,
        save_id: operation2.saveId
      }) : operation2.kind === "delete" ? remove(item.date, {
        version: operation2.version,
        save_id: operation2.saveId
      }) : put(item.date, { text: operation2.text, version: operation2.version, save_id: operation2.saveId }));
      if (context.disposed || item.pending !== operation2) return;
      const value = checkedPage(raw, item.date);
      if (!matches2(value, operation2)) throw new Error("保存响应需要重新核对。");
      accepted(item, value, operation2);
    } catch (error) {
      if (context.disposed || item.pending !== operation2) return;
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
    return send(item, { kind: "put", text: item.draft, version: item.version, saveId: uuid5() });
  }
  async function deletePage(date) {
    const item = page(date);
    if (context.disposed || !item.canEdit || !item.loaded || item.pending || ["conflict", "unknown"].includes(item.phase) || item.version === 0 || item.deleted) return;
    return send(item, { kind: "delete", text: item.draft, version: item.version, saveId: uuid5() });
  }
  async function retryPending(date) {
    const item = page(date), operation2 = item.pending;
    if (context.disposed || item.phase !== "unknown" || !operation2?.retryReady || operation2.checking || !item.canEdit) return;
    operation2.retryReady = false;
    return send(item, operation2);
  }
  async function restorePage(date) {
    const item = page(date);
    if (context.disposed || !item.canEdit || !item.loaded || !item.deleted || item.pending || item.dirty || ["conflict", "unknown"].includes(item.phase)) return;
    return send(item, { kind: "restore", text: "", version: item.version, saveId: uuid5() });
  }
  return { save, deletePage, restorePage, retryPending };
}
function createResolutionActions(context) {
  const { page, emit, stopTimer, adopt, matches: matches2, accepted } = context;
  const { load } = context.options;
  async function reconcile(date) {
    const item = page(date), operation2 = item.pending;
    if (context.disposed || item.phase !== "unknown" || !operation2 || operation2.checking) return;
    operation2.checking = true;
    operation2.retryReady = false;
    emit();
    try {
      const value = checkedPage(await load(date), date);
      if (context.disposed || item.pending !== operation2) return;
      item.canEdit = value.can_edit;
      if (matches2(value, operation2)) accepted(item, value, operation2);
      else if (value.version > operation2.version) {
        item.remote = value;
        item.pending = null;
        item.phase = "conflict";
        item.dirty = true;
        item.error = "服务器已有不同的新版本，草稿已保留，不会自动覆盖。";
      } else {
        item.remote = value;
        operation2.retryReady = value.can_edit && value.version === operation2.version;
        item.error = operation2.retryReady ? "已核对服务器尚无新版本。可手动重试原保存，后续草稿仍会保留。" : "保存结果尚未确认，草稿已保留。请再次核对，暂不重复发送。";
      }
    } catch (error) {
      if (!context.disposed && item.pending === operation2) item.error = "核对失败，草稿已保留：" + error.message;
    } finally {
      operation2.checking = false;
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
    status: ["published"],
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
function isMobileLayout() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") return window.matchMedia("(max-width: 767px)").matches;
  return Number.isFinite(window.innerWidth) && window.innerWidth < 768;
}
function mobilePage(page) {
  return isMobileLayout() && ["articles", "reviews"].includes(page) ? "dashboard" : page;
}
function updateRoute(push = false) {
  const page = mobilePage(state.page), redirected = page !== state.page;
  if (redirected) {
    state.page = page;
    state.account = "";
  }
  state.filters.status = "published";
  const u = new URL(location.href);
  u.searchParams.set("page", state.page);
  if (state.page === "notes" && dailyNotesRouteCategory() === "work") u.searchParams.set("notes_category", "work");
  else u.searchParams.delete("notes_category");
  if (state.page === "memos" && state.memoView === "trash") u.searchParams.set("memo_view", "trash");
  else u.searchParams.delete("memo_view");
  u.searchParams.set("period", state.overviewPeriod);
  u.searchParams.delete("article_scope");
  if (state.page === "todos" && state.todoDate) u.searchParams.set("date", state.todoDate);
  else if (state.page === "notes") u.searchParams.set("date", dailyNotesRouteDate());
  else if (state.page === "reminders" && state.reminderDate) u.searchParams.set("date", state.reminderDate);
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
  history[push && !redirected ? "pushState" : "replaceState"]({}, "", u);
  storage.set("haoduoyu.account", state.account);
}
function readRoute() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("page");
  const fallback = "todos";
  state.page = Object.hasOwn(legacyPages, raw) ? "settings" : nav.some((n) => n.id === raw) ? raw : fallback;
  if (state.page === "reviews") state.page = "articles";
  state.page = mobilePage(state.page);
  if (state.page === "notes") {
    setDailyNotesRouteDate(params.get("date"));
    setDailyNotesRouteCategory(params.get("notes_category"));
  }
  state.memoView = state.page === "memos" && params.get("memo_view") === "trash" ? "trash" : "";
  if (state.memoView === "trash") {
    state.page = "settings";
    state.memoView = "";
  }
  state.reminderDate = state.page === "reminders" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoDate = state.page === "todos" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoPanel = state.page === "todos" && ["history", "templates", "future"].includes(params.get("todo_panel")) ? params.get("todo_panel") : "";
  state.settingsTab = (Object.hasOwn(legacyPages, raw) ? legacyPages[raw] : null) || (Object.hasOwn(settingsTabs, params.get("tab")) ? params.get("tab") : raw === "settings" && !params.has("tab") ? "workspace" : "accounts");
  if (raw === "memos" && params.get("memo_view") === "trash") state.settingsTab = "workspace";
  state.reviewTab = ["pending", "observations", "daily"].includes(params.get("tab")) ? params.get("tab") : "observations";
  state.overviewPeriod = ["yesterday", "7d", "30d"].includes(params.get("period")) ? params.get("period") : "yesterday";
  state.articleOverviewMode = "published";
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
async function modalRequest(path, ticket, version2, context) {
  try {
    return await api(path, { context });
  } catch (err) {
    if (ticket !== runtime.modalRequestVersion || version2 !== runtime.renderVersion) return null;
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
var pipelineFilters = ["slot", "writer", "has_warnings", "has_pending_verify", "series_no_min", "series_no_max"];
var boolChoices = { true: "是", false: "否" };
var publishedArticle = (article) => !Object.hasOwn(article, "status") || article.status === "published";
function statusSelect(value = "draft_saved", allowUnknown = false) {
  const known = Object.hasOwn(statusLabels, value);
  const unknown = allowUnknown && !known;
  if (!unknown && !known) value = "draft_saved";
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
async function renderArticles(version2 = runtime.renderVersion, context) {
  state.filters.status = "published";
  const f = { ...state.filters }, params = new URLSearchParams(), account = state.account, epoch = runtime.sessionEpoch;
  if (account) params.set("account_id", account);
  for (const key of ["q", "mode", "from", "to", "sort", "order", "platform", "topic", "data_status", ...pipelineFilters]) {
    if (f[key]) params.set(key, f[key]);
  }
  params.set("status", "published");
  params.set("page", state.listPage);
  params.set("page_size", state.pageSize);
  const payload = await api(`/articles?${params}`, { envelope: true, context });
  if (version2 !== runtime.renderVersion || epoch !== runtime.sessionEpoch || account !== state.account) return "";
  const allowed = new Set(state.accounts.map((row) => row.id));
  if (!Array.isArray(payload.data) || payload.data.some((row) => row?.status !== "published" || !allowed.has(row.account_id) || account && row.account_id !== account)) {
    throw Object.assign(new Error("已发布文章读取未完成，请重新加载。"), { code: "ARTICLE_PAGE_INCOMPLETE" });
  }
  const articles = payload.data, meta = payload.meta || { total: articles.length, unfiltered_total: articles.length, has_more: false };
  state.articles = articles;
  state.articleMeta = meta;
  const content2 = articles.length ? articleTable(articles) : empty(
    meta.unfiltered_total ? "筛选无结果" : "暂无已发布文章",
    "",
    '<button class="btn" data-action="reset-filters">清空筛选</button>'
  );
  return `<section class="card article-list article-ledger article-ledger-list" aria-label="已发布文章详情"><form id="article-filters" class="filters">
<label class="search">${icon("search", 15)}<input class="input" name="q" value="${e(f.q)}"
placeholder="搜索标题或链接…" aria-label="搜索文章"></label>
${platformFilter("article-platform", f.platform, "文章平台")}${articleSelect("data_status", "数据状态", articleStatuses, f.data_status)}
<button type="button" class="btn" data-action="article-filter" aria-expanded="false" aria-controls="article-filter-popover">筛选 ▾</button>
</form>${filterChips(f)}${content2}${articlePagination(meta)}</section>`;
}
function pipelineFilterFields(f) {
  return `${articleSelect("slot", "槽位", slotLabels, f.slot)}
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
  filters.status = "published";
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
  if (["reads", "likes", "comments", "approvals", "as_of"].includes(key) && !publishedArticle(article) && !hasRecordedUnknownMetrics(article)) return "未发布";
  if (key === "published" && !publishedArticle(article)) return hasRecordedUnknownMetrics(article) ? article.published_at ? e(time(article.published_at, true)) : "未取得" : "未发布";
  if (["reads", "likes", "comments", "approvals"].includes(key)) return dashboardMetric(article, key);
  if (key === "as_of") return article.latest_as_of ? e(time(article.latest_as_of, true)) : dashboardMetric(article, "as_of");
  if (key === "mode") return badgeMode(article.production_mode);
  if (key === "duration") return publishedArticle(article) ? e(duration(article.duration_seconds)) : "未发布";
  if (key === "account") return e(article.account_name);
  return article.date_status === "unverified" ? "日期待核实" : e(time(article.published_at, true));
}
function articleSubtitle(article) {
  const stamp2 = publishedArticle(article) ? article.date_status === "unverified" ? "日期待核实" : time(article.published_at, true) : article.run_date || "日期未标注";
  return `${platformLogo(article.platform)} ${e(article.account_name)} · ${e(stamp2)} · ${e(ledgerTopic(article))}`;
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
<p class="form-context">北京时间</p><div class="form-grid">
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
  const context = beginModalRequests(), ticket = ++runtime.modalRequestVersion, version2 = runtime.renderVersion;
  let article = { account_id: state.account, production_mode: "unknown", status: "draft_saved" };
  if (id) article = await modalRequest(`/articles/${encodeURIComponent(id)}`, ticket, version2, context);
  if (ticket !== runtime.modalRequestVersion || version2 !== runtime.renderVersion) return;
  const active5 = state.accounts.filter((account) => account.active || account.id === article.account_id);
  if (!active5.length) {
    toast("请先添加一个启用的运营账号。", true);
    return;
  }
  openModal(id ? "编辑文章" : "记录文章", articleForm(article, id));
  runtime.articleFormRecord = { record: article, sessionEpoch: runtime.sessionEpoch, ticket: runtime.modalRequestVersion };
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
  const daily = dailyDates(data);
  return `${renderCumulative(data)}
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
  const c = data.cumulative || {}, rows = data.top_articles || [], fresh = freshness(c);
  const interactions = c.totals?.likes == null || c.totals?.comments == null ? null : c.totals.likes + c.totals.comments;
  const stats = [["已发布文章", num(c.article_count)], ["累计阅读", num(c.totals?.reads)], ["篇均阅读", num(c.mean_reads)], ["互动（赞+评）", num(
    interactions
  )], ["数据覆盖", c.coverage == null ? "—" : num(c.coverage * 100) + "%"]];
  return `<div class="overview-status" role="status"><span><i class="fresh-dot ${e(fresh.kind)}"></i>${e(fresh.label)}</span><div>${c.no_snapshot_count ? `<button class="btn text" data-action="missing-list" data-status="no_snapshot">未采集 ${e(num(c.no_snapshot_count))} 篇 →</button>` : ""}</div></div>
 <dl class="dashboard-stats">${stats.map(([label3, value], i) => `<div class="stat"><dt>${e(label3)}${i === 4 ? dashboardInfo(
    "coverage",
    "数据覆盖与统计口径"
  ) : ""}</dt><dd class="${value === "—" ? "missing-value" : ""}">${e(value)}</dd></div>`).join("")}</dl>
 <div class="dashboard-grid dashboard-results"><section class="card"><div class="section-heading"><h2>账号表现</h2></div>${renderPlatformTable(data.platform_comparison || [])}</section></div>
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
  if (kind === "coverage") return `<p>${e(c.metric_note)}</p><p>篇均分母：有阅读数据 ${e(num(c.data_article_count))} 篇。</p><p>截至 ${e(time(c.as_of))} · 采集 ${e(time(c.collected_at))}</p><p><button class="btn text" data-action="missing-list" data-status="missing_reads">缺阅读 ${e(num(c.missing_reads_count))} 篇 →</button><button class="btn text" data-action="missing-list" data-status="date_unverified">日期待核实 ${e(num(c.unverified_date_count))} 篇 →</button></p><p>点赞 ${e(num(c.totals?.likes))} · 评论 ${e(num(c.totals?.comments))} · 赞同 ${e(num(c.totals?.approvals))}；互动仅在赞、评均取得时相加。</p><p>自动化占比 ${totals.article_count ? e(num(totals.automatic_count / totals.article_count * 100)) + "%" : "—"} · 耗时中位数 ${e(duration(totals.median_duration_seconds))}</p>`;
  if (kind === "platform") {
    const p = (d.platform_comparison || []).find((p2) => p2.platform === id) || {}, accounts = state.accounts.filter((a) => a.platform === id);
    return `<p>${accounts.length > 1 ? "同平台多账号，表中为平台汇总；各账号可分别进入文章列表。" : "累计指标来自该平台汇总。"}</p>${accounts.map((a) => `<button class="btn text" data-action="select-account" data-id="${e(a.id)}">${e(a.name)} →</button>`).join(
      ""
    )}<p>覆盖 ${p.coverage == null ? "—" : e(num(p.coverage * 100)) + "%"} · 截至 ${e(time(p.as_of))}</p>${p.best_article ? `<p>最佳文章：<button class="article-link" data-action="article-detail" data-id="${e(p.best_article.id)}">${e(p.best_article.title)}</button> · 阅读 ${e(num(p.best_article.latest_metrics?.reads))}</p>` : "<p>暂无有阅读数据的文章。</p>"}`;
  }
  if (kind === "attention") {
    const a = (d.attention_articles || []).find((a2) => a2.id === id);
    return `<p>${e(a?.attention?.reason)}</p><p>${e(a?.attention?.baseline)}</p>`;
  }
  if (kind === "series") return "<p>按完整标题编号识别，仅计已发布且日期已记录的文章。编号进度不代表本站收录篇数。</p>";
  if (kind === "publication") return `<p>${e(d.publication_note)}</p>`;
  if (kind === "trend") return `<p>只用真实每日新增，不以累计快照补零或插值。</p>${(d.accounts || []).map((a) => `<p>${e(
    accountLabel(a)
  )}：${e(num((d.trend || []).filter((day4) => day4.accounts.some((r) => r.account_id === a.id && r.metrics?.[state.trendMetric] != null)).length))}/${e(num((d.trend || []).length))}天有该指标；缺日处断开。</p>`).join("")}`;
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
  const identity4 = state.me?.id, generation = runtime.articleIndexGeneration;
  if (!identity4) throw Object.assign(new Error("索引会话已失效"), { staleIndex: true });
  const scope = context || backgroundRequests();
  const params = new URLSearchParams(Object.entries(Object.fromEntries(new URLSearchParams(query))).sort(([a], [b]) => a.localeCompare(b)));
  params.set("fields", "index");
  const key = identity4 + ":" + params.toString();
  let pending = articleIndexes.get(key);
  const owner2 = pending && indexRequests.get(pending);
  if (owner2 && !owner2.done && owner2.scope !== scope) pending = null;
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
  if (generation !== runtime.articleIndexGeneration || identity4 !== state.me?.id) {
    if (!state.me || identity4 !== state.me.id) throw Object.assign(new Error("索引会话已失效"), { staleIndex: true });
    return articleIndex(query, context);
  }
  return rows;
}

// web/pages/reviews.mjs
async function renderReviews(version2 = runtime.renderVersion, context, { isCurrent = () => true, compactFilters = false } = {}) {
  const generation = runtime.articleIndexGeneration, tab = state.reviewTab, pending = tab === "pending", query = selectedQuery(), matches2 = (id) => !state.filters.platform || state.accounts.find((a) => a.id === id)?.platform === state.filters.platform;
  const [articles, rows, dueRows] = await Promise.all([articleIndex(query, context), pending ? [] : api(`/${tab === "observations" ? "observations" : "daily-metrics"}?${query}`, { context }), api(`/due-reviews${query ? "?" + query : ""}`, { context })]);
  if (version2 !== runtime.renderVersion || !isCurrent()) return "";
  if (generation !== runtime.articleIndexGeneration) return renderReviews(version2, context, { isCurrent, compactFilters });
  state.reviewArticles = articles;
  const account = (r) => r.account_id || articles.find((a) => a.id === r.article_id)?.account_id, records = rows.filter((r) => matches2(account(
    r
  ))), due = dueRows.filter((r) => matches2(r.account_id));
  state.reviewRecords = records;
  const tabs = `${segmented(
    "review-tab",
    [["pending", `待办 ${num(due.length)}`], ["observations", "文章快照"], ["daily", "每日数据"]],
    tab,
    "数据类型",
    "tab",
    "page-tabs"
  )}${compactFilters ? "" : `<div class="review-summary">${platformFilter("review-platform", state.filters.platform, "数据平台")}${accountFilter()}</div>`}`;
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
async function reviewRecordsModal() {
  openModal("数据记录", '<div id="media-records" role="status"></div>', { drawer: true });
  const ticket = runtime.modalRequestVersion, version2 = runtime.renderVersion, context = beginModalRequests();
  const isCurrent = () => ticket === runtime.modalRequestVersion && version2 === runtime.renderVersion;
  try {
    const html = await renderReviews(version2, context, { isCurrent, compactFilters: true });
    const root = document.querySelector("#media-records");
    if (isCurrent() && root) {
      root.innerHTML = html;
      root.removeAttribute("role");
    }
  } catch (error) {
    const root = document.querySelector("#media-records");
    if (isCurrent() && root) {
      root.setAttribute("role", "alert");
      root.textContent = error.message || "数据记录读取失败，请重试";
    }
  }
}
async function reviewModal(articleId = "", kind = "latest", indexRetry = false) {
  const context = beginModalRequests();
  const ticket = ++runtime.modalRequestVersion, version2 = runtime.renderVersion, generation = runtime.articleIndexGeneration;
  const directArticle = Boolean(articleId);
  let articles;
  try {
    articles = await articleIndex("", context);
  } catch (err) {
    if (ticket !== runtime.modalRequestVersion || version2 !== runtime.renderVersion) return;
    throw err;
  }
  if (ticket !== runtime.modalRequestVersion || version2 !== runtime.renderVersion) return;
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
function profileForAccount(id) {
  return (state.accountProfiles || []).find((profile) => profile.account_id === id);
}
function profileLink(account) {
  const profile = profileForAccount(account.id);
  if (!profile?.profile_url) return `<div class="cell-sub">尚未关联公开主页</div>`;
  let url;
  try {
    url = new URL(profile.profile_url);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !["www.zhihu.com", "www.toutiao.com", "mp.weixin.qq.com"].includes(url.hostname)) return "";
  return `<div class="cell-sub"><a href="${e(url.href)}" target="_blank" rel="noopener noreferrer">打开公开主页 ${icon("link", 11)}</a></div>`;
}
function renderAccounts() {
  const accounts = rowsForAccount(state.accounts);
  return `<section class="card">${accounts.length ? `<div class="table-scroll"><table class="data-table accounts-table"><thead><tr><th>账号</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${accounts.map((a) => `<tr><td><span class="account-title">${platformLogo(
    a.platform
  )}${e(a.name)}</span><div class="cell-sub">${e(platforms[a.platform] || a.platform)}</div>${profileLink(a)}</td><td><span class="badge ${a.active ? "up" : ""}">${a.active ? "使用中" : "已停用"}</span></td><td>${e(time(a.created_at))}</td><td><button class="btn small" data-action="edit-account" data-id="${e(a.id)}">${icon("edit", 13)}编辑</button></td></tr>`).join("")}</tbody></table></div>` : empty("暂无账号")}</section>`;
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
    const day22 = Number.isFinite(Date.parse(row.created_at)) ? bjtDate(row.created_at) : "日期未知", label3 = auditLabel(row.action), last = groups.at(-1);
    if (last && day22 !== "日期未知" && last.day === day22 && last.actor === row.actor && last.label === label3) last.rows.push(row);
    else groups.push({ day: day22, actor: row.actor, label: label3, rows: [row] });
  }
  let day4 = "";
  return `<section class="card panel"><h2>最近操作</h2><div class="audit-list">${groups.map((g) => {
    const heading = day4 === g.day ? "" : `<h3>${e(g.day === bjtDate() ? "今天" : g.day === bjtDate(Date.now() - 864e5) ? "昨天" : g.day)}</h3>`;
    day4 = g.day;
    return `${heading}<details class="audit-item"><summary><div><strong>${e(g.label)} ×${e(num(g.rows.length))}</strong><div class="audit-meta">${e(actor(g.actor))} · ${e(time(g.rows.at(-1).created_at, true))}${g.rows.length > 1 ? " — " + e(time(g.rows[0].created_at, true)) : ""}</div></div></summary><ol class="snapshot-timeline">${g.rows.map((r) => {
      const article = r.entity_id && typeof r.entity_label === "string" && r.entity_label ? r : null;
      return `<li>${e(auditLabel(r.action))} · <time datetime="${e(r.created_at)}" title="${e(time(r.created_at))}">${e(displayTime(r.created_at))}</time>${article ? `<br><button class="article-link" data-action="article-detail" data-id="${e(article.entity_id)}">${e(article.entity_label)}</button>` : ""}</li>`;
    }).join("")}</ol></details>`;
  }).join("") || empty("暂无操作记录")}</div></section>`;
}
function accountModal(id = "") {
  const a = state.accounts.find((a2) => a2.id === id) || { platform: "", name: "", active: true };
  const profile = profileForAccount(id);
  const homepage = `<div class="form-field full"><label for="field-profile-url">公开主页链接</label><input class="input" type="url" id="field-profile-url" name="profile_url" value="${e(profile?.profile_url || "")}" maxlength="2048" placeholder="粘贴今日头条、知乎或微信公众号主页"><span class="hint">保存主页无需登录平台。支持识别重复主页；后台统计仍需另行录入。</span></div>`;
  openModal(id ? "管理运营账号" : "添加运营账号", `<form id="account-form" data-id="${e(id)}"><div class="form-grid">${homepage}<div class="form-field"><label for="field-platform">所属平台</label><select class="input" id="field-platform" name="platform" ${id ? "disabled" : ""}>${Object.entries(
    id ? platforms : { "": "根据主页自动识别", ...platforms }
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
  const owner2 = todoOwner();
  if (todoTemplatesState.owner !== owner2) {
    Object.assign(todoTemplatesState, {
      owner: owner2,
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
      pending: /* @__PURE__ */ new Set(),
      readDate: "",
      readVersion: -1
    });
  }
  return todoTemplatesState;
}
function templateSessionActive(owner2) {
  return Boolean(state.me) && owner2 === todoOwner() && owner2 === todoTemplatesState.owner;
}
function mergeTodoTemplate(item) {
  const store = templateState(), index = store.items.findIndex((row) => row.id === item.id);
  if (index < 0) store.items.push(item);
  else if (store.items[index].version <= item.version) store.items[index] = item;
}

// web/pages/todo-templates.mjs
function templateUnavailable(store, day4, id) {
  return !store.loaded || !day4.loaded || day4.loading || day4.adding || store.pending.has(id) || todoTemplateAdded(day4, id) || [...day4.removals.values()].some((ticket) => ticket.phase === "restoring" && ticket.item.template_id === id);
}
function inlineTodoTemplateContent(store) {
  const day4 = todoDay(), label3 = day4.date === bjtDate() ? "今日已添加" : "当日已添加";
  const status = "";
  const error = store.error ? `<p class="form-message" role="alert">${e(store.error)}
<button class="btn text small" data-action="todo-reload">重新读取</button></p>` : "";
  return status + error + store.items.map((item) => {
    const added = todoTemplateAdded(day4, item.id);
    return `<button type="button" class="todo-template-chip${added ? " is-added" : ""}" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="${e(added ? item.text + "，" + label3 : "添加：" + item.text)}" ${templateUnavailable(store, day4, item.id) ? "disabled" : ""}>
<span class="todo-template-chip-text">${e(item.text)}</span>${added ? `<span class="todo-template-chip-status">${label3}</span>` : ""}</button>`;
  }).join("");
}
function inlineTodoTemplatesEmpty(store) {
  return store.loaded && !store.items.length && !store.loading && !store.error;
}
function renderInlineTodoTemplates() {
  const store = templateState();
  return `<div id="todo-inline-templates" class="todo-inline-templates" role="group" aria-label="常用待办"
aria-busy="${store.loading}" ${inlineTodoTemplatesEmpty(store) ? "hidden" : ""}>${inlineTodoTemplateContent(store)}</div>`;
}
function paintInlineTodoTemplates(store) {
  const root = $("#todo-inline-templates");
  if (!root) return;
  const html = inlineTodoTemplateContent(store);
  if (root.innerHTML !== html) root.innerHTML = html;
  root.hidden = inlineTodoTemplatesEmpty(store);
  root.setAttribute("aria-busy", String(store.loading));
}
function todoTemplateRows(store) {
  const day4 = todoDay();
  const added = (id) => todoTemplateAdded(day4, id);
  const addedLabel = day4.date === bjtDate() ? "今日已添加" : "当日已添加";
  return store.items.map((item) => `<li class="todo-template-row" data-template-id="${e(item.id)}">
<div class="todo-template-line"><button class="todo-template-use" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="添加：${e(item.text)}" ${templateUnavailable(store, day4, item.id) ? "disabled" : ""}>${e(item.text)}</button>
<button class="btn text small" data-action="todo-template-edit" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>改名</button>
<button class="btn text small" data-action="todo-template-delete" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>删除</button></div>
<p class="todo-template-added" data-template-added ${added(item.id) ? "" : "hidden"}>${addedLabel}</p>
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
<p id="todo-template-status" class="daily-todo-status" role="status"></p>
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
  if (state.page !== "todos" || !state.me) return;
  const store = templateState();
  paintInlineTodoTemplates(store);
  const root = $("#todo-templates");
  if (!root) return;
  const editor = $("#todo-template-editor", root), form = $("#todo-template-edit-form", root);
  if (editor && (form?.dataset.id || null) !== (store.editing?.id || null)) editor.innerHTML = todoTemplateEditor(store);
  root.dataset.loaded = String(store.loaded);
  const create = $("#todo-template-form", root);
  if (create) create.hidden = Boolean(store.editing);
  syncTemplateForm(root, "#todo-template-text", store.draft, store.adding);
  syncTemplateForm(root, "#todo-template-edit-text", store.editDraft, store.pending.has(store.editing?.id));
  for (const [id, html] of Object.entries({
    "todo-template-items": todoTemplateRows(store),
    "todo-template-feedback": e(store.error),
    "todo-template-status": ""
  })) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
}
function templateReadActive(store, owner2, sequence2, version2, date) {
  return templateSessionActive(owner2) && store.sequence === sequence2 && version2 === runtime.renderVersion && state.page === "todos" && date === todoDate();
}
async function loadTodoTemplates({ ensure = false } = {}) {
  if (state.page !== "todos" || !state.me) return;
  const store = templateState(), date = todoDate(), version2 = runtime.renderVersion;
  if (ensure && (store.loaded && !store.error && !store.loading || store.loading && store.readDate === date && store.readVersion === version2)) return;
  const owner2 = store.owner, sequence2 = ++store.sequence, revision2 = store.revision;
  store.readDate = date;
  store.readVersion = version2;
  store.loading = true;
  store.error = "";
  paintTodoTemplates();
  try {
    const data = await api("/todo-templates");
    if (!templateReadActive(store, owner2, sequence2, version2, date)) return;
    if (revision2 !== store.revision) return loadTodoTemplates();
    store.items = data.items;
    store.loaded = true;
  } catch (error) {
    if (templateReadActive(store, owner2, sequence2, version2, date) && !isRequestAbort(error) && !error.staleSession) store.error = error.message;
  } finally {
    if (templateSessionActive(owner2) && store.sequence === sequence2) {
      store.loading = false;
      paintTodoTemplates();
    }
  }
}
function inputTodoTemplate(target) {
  if (target.id === "todo-template-text") templateState().draft = target.value;
  if (target.id === "todo-template-edit-text") templateState().editDraft = target.value;
}
async function templateWriteError(error, store, owner2, editing3 = null) {
  if (!templateSessionActive(owner2) || isRequestAbort(error) || error.staleSession) return;
  store.error = error.message;
  if (error.status === 409) {
    store.error = "这项常用待办已更新，草稿已保留，请核对后再保存。";
    await loadTodoTemplates();
    if (!templateSessionActive(owner2) || !editing3 || store.editing !== editing3) return;
    const latest = store.items.find((item) => item.id === editing3.id);
    if (latest) editing3.version = latest.version;
  }
}
async function submitTodoTemplateForm({ data }) {
  const store = templateState(), owner2 = store.owner, text = String(data.text || "").trim();
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
    if (!templateSessionActive(owner2)) return;
    mergeTodoTemplate(item);
    store.draft = "";
    store.create = null;
  } catch (error) {
    if (!templateSessionActive(owner2)) return;
    await templateWriteError(error, store, owner2);
    if (!templateSessionActive(owner2)) return;
    if (error.status === 410) {
      store.create = null;
      store.error = "这个模板已被删除，输入已保留，再次保存可新建。";
    }
  } finally {
    if (templateSessionActive(owner2)) {
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
  const store = templateState(), owner2 = store.owner, item = store.items.find((row) => row.id === id);
  if (!item || store.pending.has(id)) return;
  const editing3 = store.editing?.id === id ? store.editing : null;
  const version2 = remove ? item.version : editing3?.version;
  store.pending.add(id);
  store.error = "";
  store.revision++;
  paintTodoTemplates();
  try {
    const saved = await api(`/todo-templates/${encodeURIComponent(id)}`, {
      method: remove ? "DELETE" : "PATCH",
      body: remove ? { version: version2 } : { text, version: version2 }
    });
    if (!templateSessionActive(owner2)) return;
    if (remove) store.items = store.items.filter((row) => row.id !== id);
    else mergeTodoTemplate(saved);
    if (store.editing?.id === id) store.editing = null;
    if (remove && state.page === "todos") await loadTodos();
  } catch (error) {
    if (templateSessionActive(owner2)) await templateWriteError(error, store, owner2, editing3);
  } finally {
    if (templateSessionActive(owner2)) {
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
  if (item && !templateUnavailable(store, todoDay(), id)) await submitTodoTemplate(item);
}
function refreshOpenTodoTemplates() {
  const store = templateState();
  store.revision++;
  if (state.page === "todos") void loadTodoTemplates();
}

// web/pages/todo-actions.mjs
function todoBusy(day4, id) {
  return day4.updates.has(id) || day4.removals.has(id) || day4.templateWrites.has(id);
}
function todoActionContext({ id, date, owner: owner2 = todoOwner() }) {
  if (!state.me || state.page !== "todos" || !validTodoDate(date) || date !== todoDate() || !todoSessionActive(owner2)) return null;
  const day4 = todoDay(date), item = day4.items.find((row) => row.id === id);
  return item ? { day: day4, item, owner: owner2 } : null;
}
function canOpenTodoMenu({ id, date, anchor }) {
  const context = todoActionContext({ id, date });
  return Boolean(context && anchor?.isConnected && !context.item.deleted_at && !todoBusy(context.day, id));
}
function openTodoMenu({ target, id, date, anchor }) {
  date ||= target?.dataset.date;
  anchor ||= target?.closest(".daily-todo-row");
  if (!canOpenTodoMenu({ id, date, anchor })) return;
  const { item, owner: owner2 } = todoActionContext({ id, date });
  const trigger = target || $('[data-action="todo-menu"]', anchor);
  if (!trigger) return;
  const attributes = `data-id="${e(id)}" data-date="${e(date)}" data-owner="${e(owner2)}" role="menuitem"`;
  const commonAction = item.template_active ? "todo-remove-template" : "todo-make-template";
  const commonLabel = item.template_active ? "取消常用待办" : "添加为常用待办";
  popover(trigger, `<button data-action="${commonAction}" ${attributes}>${commonLabel}</button>
<button data-action="todo-delete" ${attributes}>删除</button>`, { menu: true, label: "事项操作" });
}
function renderTodoUndo(day4) {
  return [...day4.removals.entries()].map(([id, ticket]) => {
    const label3 = ticket.phase === "deleting" ? "删除中…" : ticket.phase === "restoring" ? "恢复中…" : "已删除";
    return `<div class="todo-undo-entry"><span>${label3}：${e(ticket.item.text)}</span>
<button class="btn text small" data-action="todo-restore" data-id="${e(id)}" data-date="${e(day4.date)}"
data-owner="${e(todoOwner())}" ${ticket.phase === "ready" ? "" : "disabled"}>撤销</button></div>`;
  }).join("");
}
function expireTodoUndo(day4, id, ticket, owner2) {
  clearTimeout(ticket.timer);
  ticket.timer = setTimeout(() => {
    if (!todoSessionActive(owner2) || day4.removals.get(id) !== ticket || ticket.phase !== "ready") return;
    day4.removals.delete(id);
    paintTodos();
  }, 8e3);
  ticket.timer?.unref?.();
}
async function todoActionFailure(day4, error, owner2) {
  if (!todoSessionActive(owner2) || isRequestAbort(error) || error.staleSession) return;
  day4.error = error.message;
  if ([404, 409].includes(error.status) && day4.date === todoDate()) {
    day4.error = "这项计划已更新，请核对最新内容后再操作。";
    await loadTodos();
  }
}
async function deleteTodo(options2) {
  const context = todoActionContext(options2);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day: day4, item, owner: owner2 } = context, ticket = { item, phase: "deleting", timer: null };
  day4.removals.set(item.id, ticket);
  day4.error = "";
  day4.notice = "";
  day4.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "DELETE", body: { date: day4.date, version: item.version } });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day4, saved);
    ticket.item = saved;
    ticket.phase = "ready";
    expireTodoUndo(day4, item.id, ticket, owner2);
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner2)) return;
    day4.removals.delete(item.id);
    await todoActionFailure(day4, error, owner2);
    if (todoSessionActive(owner2) && item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner2)) {
      day4.revision++;
      paintTodos();
    }
  }
}
async function restoreTodo({ id, date, owner: owner2 = todoOwner() }) {
  if (!state.me || state.page !== "todos" || date !== todoDate() || !todoSessionActive(owner2)) return;
  const day4 = todoDay(date), ticket = day4.removals.get(id);
  if (!ticket || ticket.phase !== "ready") return;
  clearTimeout(ticket.timer);
  ticket.phase = "restoring";
  mergeTodo(day4, ticket.item);
  day4.error = "";
  day4.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      body: { date, version: ticket.item.version }
    });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day4, saved);
    day4.removals.delete(id);
    setTodoNotice(day4, "已恢复");
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner2)) return;
    if (error.status === 409) day4.removals.delete(id);
    else {
      ticket.phase = "ready";
      expireTodoUndo(day4, id, ticket, owner2);
    }
    await todoActionFailure(day4, error, owner2);
    if (todoSessionActive(owner2) && ticket.item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner2)) {
      day4.revision++;
      paintTodos();
    }
  }
}
function todoTemplateRequest(day4, item) {
  let request = day4.templateLinks.get(item.id);
  if (!request || request.version !== item.version || request.template_version !== (item.template_version || 0)) {
    request = {
      date: day4.date,
      version: item.version,
      template_id: item.template_id || crypto.randomUUID(),
      template_version: item.template_version || 0
    };
    day4.templateLinks.set(item.id, request);
  }
  return request;
}
async function changeTodoTemplate(options2, remove = false) {
  const context = todoActionContext(options2);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day: day4, item, owner: owner2 } = context;
  if (remove !== Boolean(item.template_active) || templateState().pending.has(item.template_id)) return;
  day4.templateWrites.add(item.id);
  day4.error = "";
  day4.notice = "";
  day4.revision++;
  paintTodos();
  try {
    const saved = await api(remove ? `/todo-templates/${encodeURIComponent(item.template_id)}` : `/todos/${encodeURIComponent(item.id)}/template`, {
      method: remove ? "DELETE" : "POST",
      body: remove ? { version: item.template_version } : todoTemplateRequest(day4, item)
    });
    if (!todoSessionActive(owner2)) return;
    if (remove) templateState().items = templateState().items.filter((row) => row.id !== item.template_id);
    else {
      mergeTodo(day4, saved.todo);
      mergeTodoTemplate(saved.template);
    }
    day4.templateLinks.delete(item.id);
    setTodoNotice(day4, remove ? "已取消常用，事项已保留" : "已添加为常用");
    refreshOpenTodoTemplates();
    if (remove && day4.date === todoDate()) await loadTodos();
  } catch (error) {
    if (todoSessionActive(owner2)) {
      await todoActionFailure(day4, error, owner2);
      if (todoSessionActive(owner2) && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day4.templateWrites.delete(item.id);
      day4.revision++;
      paintTodos();
    }
  }
}

// web/pages/todo-preferences.mjs
function todoPreferences() {
  todoDay();
  return todosState.preferences;
}
function receiveTodoPreferences(mode, version2) {
  const prefs = todoPreferences();
  if (!["strike", "hide"].includes(mode) || !Number.isInteger(version2) || prefs.pending || version2 < prefs.version) return;
  prefs.mode = mode;
  prefs.version = version2;
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
  const prefs = todoPreferences(), owner2 = todoOwner();
  if (prefs.pending || !prefs.loaded || mode === prefs.mode) {
    paintTodoPreferences();
    return;
  }
  prefs.pending = mode;
  prefs.error = "";
  paintTodos();
  try {
    const saved = await api("/todo-preferences", { method: "PATCH", body: { completed_mode: mode, version: prefs.version } });
    if (!todoSessionActive(owner2)) return;
    prefs.mode = saved.completed_mode;
    prefs.version = saved.version;
  } catch (error) {
    if (!todoSessionActive(owner2) || isRequestAbort(error) || error.staleSession) return;
    prefs.error = error.message;
    if (error.status === 409) {
      try {
        const latest = await api("/todo-preferences");
        if (!todoSessionActive(owner2)) return;
        prefs.mode = latest.completed_mode;
        prefs.version = latest.version;
        prefs.error = "显示方式已更新，请核对后再选择。";
      } catch (readError) {
        if (todoSessionActive(owner2) && !isRequestAbort(readError) && !readError.staleSession) prefs.error = readError.message;
      }
    }
  } finally {
    if (todoSessionActive(owner2)) {
      prefs.pending = null;
      paintTodos();
    }
  }
}

// web/pages/todos.mjs
var todoClock = null;
var monthSnapshot = { month: "", owner: "", days: /* @__PURE__ */ new Map(), loading: false, error: "" };
var savingTimes = /* @__PURE__ */ new WeakMap(), savingTimers = /* @__PURE__ */ new WeakMap();
function todoCalendarMonth(date) {
  if (todosState.calendarDate !== date || !validTodoDate(`${todosState.calendarMonth}-01`)) {
    todosState.calendarDate = date;
    todosState.calendarMonth = date.slice(0, 7);
  }
  return todosState.calendarMonth;
}
function todoCalendarDay(date, selected) {
  const today2 = date === bjtDate(), active5 = date === selected;
  const items = (monthSnapshot.days.get(date) || []).filter((item) => !item.deleted_at);
  const content2 = items.slice(0, 4).map((item) => `<span class="todo-calendar-task${item.completed ? " is-complete" : ""}">${item.completed ? "✓" : "○"} ${e(item.text)}</span>`).join("");
  return `<button class="todo-calendar-day${active5 ? " is-selected" : ""}${today2 ? " is-today" : ""}" type="button"
data-action="todo-calendar-date" data-date="${e(date)}" aria-label="${e(date)}" aria-pressed="${active5}"
${today2 ? 'aria-current="date"' : ""}><span class="todo-calendar-day-head"><strong>${Number(date.slice(-2))}</strong><small>${monthSnapshot.days.has(date) ? items.length + " 项" : ""}</small></span>${content2}</button>`;
}
function todoCalendar(date) {
  const month = todoCalendarMonth(date), first = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`), last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const blanks = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: last.getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const cells = [...Array(blanks).fill(null), ...days];
  const index = Math.max(0, cells.indexOf(date));
  const visible3 = todosState.calendarView === "week" ? cells.slice(Math.floor(index / 7) * 7, Math.floor(index / 7) * 7 + 7) : cells;
  const all = [...monthSnapshot.days.values()].flat().filter((item) => !item.deleted_at), done = all.filter((item) => item.completed).length;
  const currentSnapshot = monthSnapshot.month === month && monthSnapshot.owner === todoOwner();
  const stats = !currentSnapshot || monthSnapshot.loading ? "" : monthSnapshot.error ? `<p role="alert">${e(monthSnapshot.error)}</p>` : monthSnapshot.days.size ? `<div class="todo-calendar-stats"><span>本月 ${all.length}</span><span>已完成 ${done}</span><span>未完成 ${all.length - done}</span></div>` : "";
  return `${stats}<div class="todo-calendar-head"><button type="button" class="btn" data-todo-calendar-view="week" aria-pressed="${todosState.calendarView === "week"}">周</button><button type="button" class="btn" data-todo-calendar-view="month" aria-pressed="${todosState.calendarView !== "week"}">月</button><button class="icon-button" type="button" data-action="todo-calendar-prev"
aria-label="上一月" ${month === "0001-01" ? "disabled" : ""}>‹</button>
<span id="todo-calendar-month" aria-live="polite">${Number(month.slice(0, 4))}年${Number(month.slice(5))}月</span>
<button class="icon-button" type="button" data-action="todo-calendar-next" aria-label="下一月"
${month === "9999-12" ? "disabled" : ""}>›</button></div>
<div class="todo-calendar-grid" role="group" aria-labelledby="todo-calendar-month">
${["一", "二", "三", "四", "五", "六", "日"].map((day4) => `<span class="todo-calendar-weekday" aria-hidden="true">${day4}</span>`).join("")}
${visible3.map((day4) => day4 ? todoCalendarDay(day4, date) : '<span aria-hidden="true"></span>').join("")}</div>`;
}
function moveTodoMonth(offset) {
  if (!todosVisible()) return;
  if (state.todoPanel === "templates" && $("#todo-templates")?.dataset.loaded !== "true") void loadTodoTemplates();
  const day4 = todoDay(), date = /* @__PURE__ */ new Date(`${todoCalendarMonth(day4.date)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const month = date.toISOString().slice(0, 7);
  if (!validTodoDate(`${month}-01`)) return;
  todosState.calendarMonth = month;
  const calendar = $("#todo-calendar"), action = document.activeElement?.dataset?.action;
  if (!calendar) return;
  paintTodoCalendar(day4.date);
  void loadTodoMonth(month);
  if (["todo-calendar-prev", "todo-calendar-next"].includes(action)) $(`[data-action="${action}"]`, calendar)?.focus();
}
function paintTodoCalendar(date) {
  const calendar = $("#todo-calendar"), month = todoCalendarMonth(date), today2 = bjtDate();
  if (!calendar) return;
  if (!calendar.dataset.viewBound) {
    calendar.addEventListener("click", (event) => {
      const button2 = event.target.closest("[data-todo-calendar-view]");
      if (!button2) return;
      todosState.calendarView = button2.dataset.todoCalendarView;
      calendar.dataset.month = "";
      paintTodoCalendar(todoDay().date);
    });
    calendar.dataset.viewBound = "true";
  }
  if (calendar.dataset.month === month && calendar.dataset.today === today2) return;
  const focusedDate = document.activeElement?.dataset?.date;
  calendar.innerHTML = todoCalendar(date);
  calendar.dataset.month = month;
  calendar.dataset.today = today2;
  if (focusedDate) $(`[data-date="${CSS.escape(focusedDate)}"]`, calendar)?.focus();
}
async function loadTodoMonth(month) {
  const owner2 = todoOwner();
  if (monthSnapshot.month === month && monthSnapshot.owner === owner2 && (monthSnapshot.loading || monthSnapshot.days.size)) return;
  const snapshot = { month, owner: owner2, days: /* @__PURE__ */ new Map(), loading: true, error: "" };
  monthSnapshot = snapshot;
  const first = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`), last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  try {
    for (let start = 1; start <= last.getUTCDate(); start += 5) {
      const dates = Array.from({ length: Math.min(5, last.getUTCDate() - start + 1) }, (_, i) => `${month}-${String(start + i).padStart(2, "0")}`);
      const results = await Promise.all(dates.map((date) => api(`/todos?date=${encodeURIComponent(date)}`)));
      if (monthSnapshot !== snapshot || !todoSessionActive(owner2)) return;
      for (let i = 0; i < dates.length; i++) snapshot.days.set(dates[i], results[i].items || []);
    }
  } catch (error) {
    snapshot.days.clear();
    snapshot.error = error.message || "月记录读取失败，请重试";
  } finally {
    snapshot.loading = false;
    if (monthSnapshot === snapshot && todosVisible()) {
      const node = $("#todo-calendar");
      if (node) {
        node.dataset.month = "";
        paintTodoCalendar(todoDay().date);
      }
    }
  }
}
function todoDateControls(date) {
  return `<div class="daily-todo-dates"><button class="btn small" data-action="todo-prev" aria-label="前一天">‹</button>
<label for="todo-date" class="sr-only">选择计划日期</label><input class="input" id="todo-date" type="date" value="${e(date)}">
<button class="btn small" data-action="todo-next" aria-label="后一天">›</button>
<button class="btn small" data-action="todo-today">今天</button></div>`;
}
function todoRow(item, day4) {
  const pending = todoBusy(day4, item.id);
  const completed = day4.updates.has(item.id) ? day4.updates.get(item.id) : item.completed;
  const removal = day4.removals.get(item.id), deleted2 = removal ? removal.phase !== "restoring" : Boolean(item.deleted_at);
  if (deleted2 || completed && todoCompletedMode() === "hide" && state.todoPanel !== "history") return "";
  return `<li class="daily-todo-row${completed ? " is-complete" : ""}" data-id="${e(item.id)}" data-date="${e(day4.date)}">
<label><input type="checkbox" data-todo-id="${e(item.id)}" data-date="${e(day4.date)}" ${completed ? "checked" : ""}
aria-disabled="${pending}"><span class="daily-todo-text">${e(item.text)}</span></label>

<button class="todo-row-menu icon-button" type="button" data-action="todo-menu" data-id="${e(item.id)}" data-date="${e(day4.date)}"
aria-label="事项操作" aria-haspopup="menu" aria-expanded="false" ${pending ? "disabled" : ""}>⋯</button></li>`;
}
function todoForm(day4) {
  const label3 = day4.date === bjtDate() ? "今天想完成什么？" : "这一天的计划";
  return `<form id="todo-form" class="daily-todo-form" data-date="${e(day4.date)}" aria-label="添加 ${e(day4.date)} 的计划">
<label for="todo-text" class="sr-only">${label3}</label><input id="todo-text" class="input" name="text" maxlength="500" required
autocomplete="off" placeholder="${label3}" value="${e(day4.draft)}" >
<button class="btn primary" type="submit" ${day4.adding ? "disabled" : ""}>添加</button></form>`;
}
function todoCaption(day4) {
  const today2 = day4.date === bjtDate();
  return `<time datetime="${e(day4.date)}" title="北京时间">${today2 ? "今天 · " : ""}${e(day4.date)}</time>`;
}
function todoHeading(day4) {
  const selected = state.todoPanel || "today";
  return `<span id="todo-caption" hidden>${todoCaption(day4)}</span><nav class="todo-page-tabs" aria-label="待办页面">
${[["today", "今日"], ["future", "未来待办"], ["history", "历史"], ["templates", "常用"]].map(([panel, label3]) => `<button class="btn todo-page-tab" type="button" data-action="todo-panel" data-panel="${panel === "today" ? "" : panel}"
  aria-current="${selected === panel ? "page" : "false"}" ${panel === "templates" ? 'aria-label="管理常用"' : ""}>${label3}</button>`).join("")}</nav>`;
}
function renderTodoHistory(day4) {
  return `<section id="todo-history" class="todo-view" aria-label="待办日历" ${state.todoPanel === "history" ? "" : "hidden"}>
<div class="todo-view-head"><h2>待办日历</h2><button class="btn" data-action="todo-panel-close">‹ 返回今日待办</button></div>
<div id="todo-calendar" class="daily-todo-calendar" data-month="${todoCalendarMonth(day4.date)}" data-today="${bjtDate()}">
${todoCalendar(day4.date)}</div>${todoDateControls(day4.date)}</section>`;
}
function paintTodoPanels(root) {
  const panel = state.todoPanel || "";
  for (const [id, value] of [["todo-main", ""], ["todo-history", "history"], ["todo-templates", "templates"], ["todo-future", "future"]]) {
    const node = $("#" + id, root);
    if (node) node.hidden = id === "todo-main" ? ["templates", "future"].includes(panel) : panel !== value;
  }
  root?.querySelectorAll(".todo-list-options").forEach((node) => {
    node.hidden = panel === "history";
  });
  const back = $("#todo-return-today", root);
  if (back) back.hidden = !state.todoDate || Boolean(panel);
  root?.querySelectorAll('[data-action="todo-panel"]').forEach((button2) => {
    button2.setAttribute("aria-current", button2.dataset.panel === panel ? "page" : "false");
  });
}
async function setTodoPanel(panel) {
  if (!todosVisible()) return;
  state.todoPanel = ["history", "templates", "future"].includes(panel) ? panel : "";
  if (!state.todoPanel) state.todoDate = "";
  updateRoute(true);
  paintTodos();
  if (state.todoPanel === "future") await loadUnscheduledTodos();
  else {
    await loadTodos();
    if (state.todoPanel === "history") void loadTodoMonth(todoCalendarMonth(todoDay().date));
  }
  const selector = state.todoPanel === "future" ? "#todo-future-text" : state.todoPanel ? "#todo-" + state.todoPanel + ' [data-action="todo-panel-close"]' : "#todo-text";
  $(selector)?.focus();
}
function todoPending(day4) {
  return Boolean(day4.adding || day4.updates.size || day4.templateWrites.size || [...day4.removals.values()].some((ticket) => ticket.phase !== "ready") || todoPreferences().pending);
}
function todoStatus(day4) {
  if (todoPending(day4) || day4.error || todoPreferences().error) return "";
  return day4.loading && !day4.loaded ? "" : day4.notice;
}
function paintTodoSaving(root, day4) {
  const busy = todoPending(day4);
  root.setAttribute("aria-busy", String(busy));
  if (!busy) {
    clearTimeout(savingTimers.get(day4));
    savingTimers.delete(day4);
    savingTimes.delete(day4);
    return;
  }
  if (!savingTimes.has(day4)) {
    savingTimes.set(day4, Date.now());
    savingTimers.set(day4, setTimeout(() => {
      if (todosVisible() && todoDay() === day4) paintTodos();
    }, 900));
  } else if (Date.now() - savingTimes.get(day4) >= 900) $("#todo-status", root).textContent = "正在同步…";
}
function pendingTodo(day4) {
  return day4.adding && day4.submitting ? `<li class="todo-pending-row" aria-label="待添加">
<span class="todo-pending-marker" aria-hidden="true"></span><span>${e(day4.submitting.text)}</span></li>` : "";
}
function todoFeedback(day4) {
  const error = [day4.error, todoPreferences().error].filter(Boolean).join(" ");
  return error ? `${e(error)} ${day4.failedCreate ? `<span>「${e(day4.failedCreate.text)}」</span>
<button class="btn text small" data-action="todo-retry-add">重试添加</button>` : ""} <button class="btn text small" data-action="todo-reload">重新读取</button>` : "";
}
function todoHistoryEmpty(day4) {
  return state.todoPanel === "history" && day4.loaded && !day4.items.some((item) => !item.deleted_at) ? "这一天还没有待办。" : "";
}
function renderTodos() {
  const day4 = todoDay();
  return `<section id="daily-todos" class="daily-todos daily-todos-primary" data-date="${e(day4.date)}" aria-label="每日计划">
<div id="todo-heading" class="daily-todo-toolbar">${todoHeading(day4)}</div>
${renderTodoHistory(day4)}<div id="todo-main" ${["templates", "future"].includes(state.todoPanel) ? "hidden" : ""}>${todoForm(day4)}${renderInlineTodoTemplates()}
<div id="todo-feedback" class="form-message" role="alert">${todoFeedback(day4)}</div>
<p id="todo-status" class="daily-todo-status" role="status">${todoStatus(day4)}</p>
<div id="todo-undo" class="todo-undo" role="status">${renderTodoUndo(day4)}</div>${renderTodoPreferences()}
<p id="todo-history-empty" class="daily-todo-status">${todoHistoryEmpty(day4)}</p>
<ul id="todo-items" class="daily-todo-items">${day4.items.map((item) => todoRow(item, day4)).join("")}${pendingTodo(day4)}</ul></div>
${renderTodoTemplates()}${renderUnscheduledTodos()}</section>`;
}
function todosVisible() {
  return Boolean(state.me) && state.page === "todos";
}
function paintTodos() {
  const root = $("#daily-todos");
  if (!root || !todosVisible()) return;
  const day4 = todoDay(), checkbox = document.activeElement?.dataset?.todoId;
  const menu = document.activeElement?.dataset?.action === "todo-menu" ? document.activeElement.dataset.id : null;
  if (root.dataset.date !== day4.date) {
    root.outerHTML = renderTodos();
    paintTodoTemplates();
    return;
  }
  const parts = {
    "todo-caption": todoCaption(day4),
    "todo-status": todoStatus(day4),
    "todo-undo": renderTodoUndo(day4),
    "todo-items": day4.items.map((item) => todoRow(item, day4)).join("") + pendingTodo(day4),
    "todo-feedback": todoFeedback(day4),
    "todo-history-empty": todoHistoryEmpty(day4)
  };
  for (const [id, html] of Object.entries(parts)) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
  paintTodoCalendar(day4.date);
  const input = $("#todo-text", root), button2 = $("#todo-form button[type=submit]", root);
  const prompt = day4.date === bjtDate() ? "今天想完成什么？" : "这一天的计划", label3 = $('label[for="todo-text"]', root);
  if (input && input.value !== day4.draft) input.value = day4.draft;
  if (input) {
    input.readOnly = false;
    input.placeholder = prompt;
  }
  if (label3) label3.textContent = prompt;
  if (button2) {
    button2.disabled = day4.adding;
    button2.textContent = "添加";
    button2.setAttribute("aria-busy", String(day4.adding));
  }
  paintTodoSaving(root, day4);
  paintTodoPanels(root);
  paintUnscheduledTodos();
  paintTodoPreferences();
  const focus = checkbox ? `[data-todo-id="${CSS.escape(checkbox)}"]` : menu ? `[data-action="todo-menu"][data-id="${CSS.escape(menu)}"]` : "";
  if (focus) ($(focus, root) || $("[data-todo-id]", root) || $("#todo-completed-mode", root))?.focus();
  paintTodoTemplates();
}
function todoReadActive(owner2, version2, date, day4, sequence2) {
  return todoSessionActive(owner2) && version2 === runtime.renderVersion && todoDate() === date && day4.sequence === sequence2 && todosVisible();
}
async function loadTodos(context) {
  if (!todosVisible()) return;
  if (state.todoPanel === "future") {
    await loadUnscheduledTodos();
    return;
  }
  void loadTodoTemplates({ ensure: true });
  const day4 = todoDay(), date = day4.date, owner2 = todoOwner(), version2 = runtime.renderVersion;
  const sequence2 = ++day4.sequence, revision2 = day4.revision;
  day4.loading = true;
  day4.error = "";
  paintTodos();
  try {
    const data = await api(`/todos?date=${encodeURIComponent(date)}`, { context });
    if (!todoReadActive(owner2, version2, date, day4, sequence2)) return;
    if (day4.revision !== revision2) return loadTodos(context);
    receiveTodoPreferences(data.completed_mode, data.preferences_version);
    day4.items = data.items;
    day4.loaded = true;
    if (monthSnapshot.owner === owner2 && monthSnapshot.month === date.slice(0, 7) && !monthSnapshot.loading) {
      monthSnapshot.days.set(date, data.items);
      const calendar = $("#todo-calendar");
      if (calendar) calendar.dataset.month = "";
    }
    if (state.todoPanel === "templates") paintTodoTemplates();
  } catch (error) {
    if (todoReadActive(owner2, version2, date, day4, sequence2) && !isRequestAbort(error) && !error.staleSession) day4.error = error.message;
  } finally {
    if (todoReadActive(owner2, version2, date, day4, sequence2)) {
      day4.loading = false;
      paintTodos();
      if (state.todoPanel === "history") void loadTodoMonth(todoCalendarMonth(date));
    }
  }
}
function inputTodo(target) {
  const date = target.form?.dataset.date;
  if (target.id === "todo-text" && validTodoDate(date)) todoDay(date).draft = target.value;
}
function showTodoFailure(day4, error) {
  if (!isRequestAbort(error) && !error.staleSession) day4.error = error.message;
}
function setTodoNotice(day4, text) {
  const owner2 = todoOwner(), version2 = ++day4.noticeVersion;
  day4.notice = text;
  const timer = setTimeout(() => {
    if (!todoSessionActive(owner2) || day4.noticeVersion !== version2) return;
    day4.notice = "";
    if (day4.date === todoDate()) paintTodos();
  }, 2500);
  timer?.unref?.();
}
async function saveTodo(day4, request, templateId = "") {
  const owner2 = todoOwner(), submittedDraft = day4.draft;
  day4.adding = true;
  day4.submitting = request;
  day4.failedCreate = null;
  day4.error = "";
  day4.notice = "";
  day4.revision++;
  paintTodos();
  try {
    const item = await api("/todos", { method: "POST", body: request });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day4, item);
    if (templateId) day4.templateCreates.delete(templateId);
    else {
      if (day4.draft === submittedDraft && submittedDraft.trim() === request.text) day4.draft = "";
      day4.create = null;
    }
    setTodoNotice(day4, "已添加");
  } catch (error) {
    if (todoSessionActive(owner2)) {
      day4.failedCreate = request;
      showTodoFailure(day4, error);
      if (error.status === 410) {
        if (templateId) day4.templateCreates.delete(templateId);
        else day4.create = null;
        day4.error = "原事项已被删除，输入已保留，可再次添加。";
      }
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day4.adding = false;
      day4.submitting = null;
      day4.revision++;
      paintTodos();
    }
  }
}
async function retryTodoCreate() {
  const day4 = todoDay();
  if (todosVisible() && day4.failedCreate && !day4.adding)
    await saveTodo(day4, day4.failedCreate, day4.failedCreate.template_id || "");
}
async function submitTodo({ form, data }) {
  if (!todosVisible() || !validTodoDate(form.dataset.date)) return;
  const day4 = todoDay(form.dataset.date), text = String(data.text || "").trim();
  if (day4.adding) return;
  day4.draft = String(data.text || "");
  if (day4.date !== todoDate()) {
    paintTodos();
    return;
  }
  if (!text || text.length > 500) {
    day4.error = "请填写 1–500 字的计划。";
    paintTodos();
    return;
  }
  if (!day4.create || day4.create.text !== text) day4.create = { id: crypto.randomUUID(), date: day4.date, text };
  await saveTodo(day4, day4.create);
}
async function submitTodoTemplate(template) {
  if (!todosVisible()) return;
  const day4 = todoDay();
  if (day4.adding || todoTemplateAdded(day4, template.id)) return;
  let request = day4.templateCreates.get(template.id);
  if (!request || request.text !== template.text) {
    request = { id: crypto.randomUUID(), date: day4.date, text: template.text, template_id: template.id };
    day4.templateCreates.set(template.id, request);
  }
  await saveTodo(day4, request, template.id);
}
async function toggleTodo(target) {
  if (!todosVisible()) return;
  const day4 = todoDay(target.dataset.date), owner2 = todoOwner();
  const item = day4.items.find((row) => row.id === target.dataset.todoId);
  if (!item || item.deleted_at || day4.date !== todoDate()) return;
  if (todoBusy(day4, item.id)) {
    target.checked = day4.updates.has(item.id) ? day4.updates.get(item.id) : item.completed;
    return;
  }
  const completed = target.checked;
  day4.updates.set(item.id, completed);
  day4.error = "";
  day4.notice = "";
  day4.revision++;
  paintTodos();
  try {
    const updated = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "PATCH", body: { completed, version: item.version } });
    if (todoSessionActive(owner2)) {
      mergeTodo(day4, updated);
      if (updated.template_id) refreshOpenTodoTemplates();
    }
  } catch (error) {
    if (!todoSessionActive(owner2)) return;
    day4.updates.set(item.id, item.completed);
    showTodoFailure(day4, error);
    if (error.status === 409 && day4.date === todoDate()) {
      day4.error = "这项计划已更新，已重新读取，请核对后再操作。";
      await loadTodos();
      if (todoSessionActive(owner2) && item.template_id) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day4.updates.delete(item.id);
      day4.revision++;
      paintTodos();
    }
  }
}
function selectTodoDate(date) {
  if (!validTodoDate(date) || state.page !== "todos") return;
  state.todoDate = date;
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

// web/core/notes-editor-view.mjs
var attentionPhases = ["unknown", "conflict", "oversize", "error"];
function noteDraftNeedsAttention(item) {
  return Boolean(item && (item.dirty || item.pending || attentionPhases.includes(item.phase)));
}
function noteEditorCanCollapse(item) {
  return Boolean(item && item.loaded && !item.loading && !item.composing && !noteDraftNeedsAttention(item) && (item.version > 0 || item.localBacked && item.localVersion > 0 || item.phase === "empty" && !item.draft.trim()));
}
function createNotesEditorView() {
  const views = /* @__PURE__ */ new Map();
  const page = (category, date) => {
    const key = category + ":" + date;
    if (!views.has(key)) views.set(key, { active: "", revision: 0, collapseRequested: false, explicit: false });
    return views.get(key);
  };
  function activate(category, date, key) {
    const view = page(category, date);
    view.active = key;
    view.revision++;
    view.collapseRequested = false;
    view.explicit = false;
    return view;
  }
  function requestCollapse(category, date, key, revision2, { explicit = false } = {}) {
    const view = page(category, date);
    if (view.active !== key || view.revision !== revision2) return;
    view.collapseRequested = true;
    view.explicit = explicit;
  }
  function sync(category, date, items, legacy, { focused = false, composing = false } = {}) {
    const view = page(category, date), item = view.active === "legacy" ? legacy : items.find((value) => value.id === view.active);
    if (view.active && !item) activate(category, date, "");
    else if (view.collapseRequested && noteEditorCanCollapse(item) && !composing && (!focused || view.explicit)) {
      activate(category, date, "");
    }
    if (!view.active) {
      const draft = items.find(noteDraftNeedsAttention);
      if (draft) activate(category, date, draft.id);
      else if (noteDraftNeedsAttention(legacy)) activate(category, date, "legacy");
    }
    return view;
  }
  const clear = () => views.clear();
  return { page, activate, requestCollapse, sync, clear };
}

// web/core/note-entries-state.mjs
var uuidPattern6 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var blocked = (item) => ["conflict", "unknown"].includes(item.phase);
var timestamp3 = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
var noteValue = (value) => isLocalDocument(value) ? documentValue(value) : value;
var persistedVersion = (item) => item.localBacked ? item.localVersion : item.version;
var savedText = (item) => item.localBacked ? item.durableText : item.serverText;
var savedPhase = (item) => item.localBacked ? item.localQueued ? "queued" : "cached" : item.version ? "saved" : "empty";
var localFailure = (error) => error.localNotSaved === true || /^OFFLINE_(?:STORAGE|CACHE|INVALID|SCOPE)/.test(error.code || "");
function validCustomNoteLabel(value) {
  return typeof value === "string" && value.isWellFormed() && value === value.trim().normalize("NFC") && [...value].length >= 1 && [...value].length <= 32 && !/[\u0000-\u001f\u007f]/.test(value) && !["生活", "工作"].includes(value);
}
function checkedLocalDocument(value, category, date, id) {
  const { local, server } = documentState(value);
  if (!local || !uuidPattern6.test(local.id) || id && local.id !== id || local.category !== category || local.date !== date || typeof local.text !== "string" || dailyNotesBytes(local.text) > DAILY_NOTES_MAX_BYTES || !Number.isSafeInteger(local.version) || local.version < 1 || typeof local.deleted !== "boolean" || typeof local.can_edit !== "boolean" || local.label != null && (category !== "life" || !validCustomNoteLabel(local.label))) throw new Error("本机记录读取不完整，草稿已保留。");
  if (server) checkedEntry(server, category, date, local.id);
  return value;
}
function checkedEntry(value, category, date, id) {
  if (isLocalDocument(value)) return checkedLocalDocument(value, category, date, id);
  if (!value || !uuidPattern6.test(value.id) || id && value.id !== id || value.category !== category || value.date !== date || typeof value.text !== "string" || dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES || !Number.isSafeInteger(value.version) || value.version < 1 || typeof value.deleted !== "boolean" || typeof value.can_edit !== "boolean" || !timestamp3(value.created_at) || !timestamp3(value.updated_at) || typeof value.content_hash !== "string" || !value.content_hash || value.label != null && (category !== "life" || !validCustomNoteLabel(value.label))) {
    throw new Error("记录读取不完整，请重新核对。");
  }
  return value;
}
function checkedCollection(value, category, date) {
  if (!value || value.category !== category || value.date !== date || !Array.isArray(value.entries) || value.entries.length > 200 || typeof value.can_edit !== "boolean") throw new Error("记录列表不完整，请重新读取。");
  const ids = /* @__PURE__ */ new Set();
  for (const raw of value.entries) {
    checkedEntry(raw, category, date);
    const entry = noteValue(raw);
    if (entry.deleted || ids.has(entry.id)) throw new Error("记录列表不完整，请重新读取。");
    ids.add(entry.id);
  }
  return value;
}
function createEntriesContext({
  category,
  load,
  loadEntry,
  loadOperation,
  put,
  remove,
  restore,
  onChange = () => {
  },
  onSaved = () => {
  },
  uuid: uuid5 = () => crypto.randomUUID(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = 400,
  manualSave = false
}) {
  if (!["life", "work"].includes(category)) throw new Error("请选择有效分类。");
  const pages = /* @__PURE__ */ new Map(), entries = /* @__PURE__ */ new Map();
  const context = {
    category,
    pages,
    entries,
    disposed: false,
    options: { load, loadEntry, loadOperation, put, remove, restore, onSaved, uuid: uuid5 }
  };
  const emit = () => {
    if (!context.disposed) onChange();
  };
  const page = (date) => {
    if (!validDailyNotesDate(date)) throw new Error("请选择有效日期。");
    if (!pages.has(date)) pages.set(date, {
      category,
      date,
      ids: [],
      loaded: false,
      loading: false,
      canEdit: false,
      error: "",
      sequence: 0,
      composerId: ""
    });
    return pages.get(date);
  };
  const entry = (id) => entries.get(id);
  const stopTimer = (item) => {
    if (item.timer !== null) clearTimer(item.timer);
    item.timer = null;
  };
  function makeEntry(id, date, canEdit) {
    return {
      id,
      category,
      date,
      loaded: true,
      loading: false,
      canEdit,
      serverText: "",
      draft: "",
      version: 0,
      createdAt: null,
      updatedAt: null,
      contentHash: "",
      label: "",
      labelKnown: false,
      deleted: false,
      dirty: false,
      phase: "empty",
      error: "",
      remote: null,
      pending: null,
      timer: null,
      sequence: 0,
      writeEpoch: 0,
      composing: false,
      localVersion: 0,
      durableText: "",
      localBacked: false,
      localQueued: false,
      localOperation: null,
      localConflict: null,
      localCreatedAt: null,
      localUpdatedAt: null
    };
  }
  function adopt(item, value, preserve = false) {
    if (isLocalDocument(value)) return context.adoptLocal(item, value, preserve);
    item.canEdit = value.can_edit;
    item.serverText = value.deleted ? "" : value.text;
    item.version = value.version;
    item.createdAt = value.created_at;
    item.updatedAt = value.updated_at;
    item.label = value.label || "";
    item.labelKnown = category === "work" || value.labels_version === 1 && Object.hasOwn(value, "label");
    item.contentHash = value.content_hash;
    item.deleted = value.deleted;
    item.localVersion = value.version;
    item.durableText = item.serverText;
    item.localBacked = false;
    item.localQueued = false;
    item.localOperation = null;
    item.localConflict = null;
    item.localCreatedAt = null;
    item.localUpdatedAt = null;
    if (!preserve) item.draft = item.serverText;
    item.dirty = item.draft !== item.serverText;
    item.loaded = true;
  }
  function schedule(item) {
    stopTimer(item);
    if (!manualSave && !context.disposed && !context.autosavePaused && item.canEdit && item.dirty && !item.pending && !item.loading && !item.composing && !blocked(item) && !["error", "oversize"].includes(item.phase) && (persistedVersion(item) > 0 || item.draft.trim())) {
      item.timer = setTimer(() => {
        item.timer = null;
        void context.save(item.id);
      }, delay);
    }
  }
  function merge(item, value) {
    if (isLocalDocument(value)) return context.mergeLocal(item, value);
    if (item.localBacked && !item.localConflict && value.version < item.localVersion) return;
    if (item.localQueued && !item.localConflict && (value.deleted !== item.deleted || !value.deleted && (value.text !== item.durableText || (value.label || "") !== item.label))) {
      item.remote = value;
      return;
    }
    if (item.localBacked && (!blocked(item) || item.localConflict)) {
      const retainedConflictDraft = Boolean(item.localConflict && item.dirty);
      item.writeEpoch++;
      adopt(item, value, item.dirty);
      item.remote = null;
      item.phase = retainedConflictDraft ? "error" : item.dirty ? "dirty" : "saved";
      item.error = retainedConflictDraft ? "已采用线上版本，后续未提交草稿仍保留；请核对后手动保存。" : "";
      return;
    }
    if (value.version < Math.max(item.version, item.remote?.version || 0)) return;
    item.writeEpoch++;
    item.canEdit = value.can_edit;
    if (blocked(item)) item.remote = value;
    else if (item.dirty && value.version !== item.version) {
      item.remote = value;
      item.phase = "conflict";
      item.error = "这条记录已有新版本，草稿已保留，请核对。";
      stopTimer(item);
    } else {
      adopt(item, value, item.dirty);
      item.phase = item.dirty ? "dirty" : "saved";
      item.error = "";
    }
  }
  function dispose() {
    context.disposed = true;
    for (const item of entries.values()) stopTimer(item);
  }
  Object.assign(context, { page, entry, emit, stopTimer, adopt, schedule, merge, makeEntry, dispose });
  return context;
}
function createEntryLocalActions(context) {
  const { adopt, stopTimer } = context;
  function adoptLocal(item, value, preserve = false) {
    const { local, server, operation: operation2, conflict } = documentState(value), draft = item.draft;
    if (server && server.version >= item.version) adopt(item, server, true);
    item.localVersion = local.version;
    item.durableText = local.deleted ? "" : local.text;
    item.label = local.label || "";
    item.labelKnown = item.category === "work" || local.labels_version === 1 && Object.hasOwn(local, "label");
    item.localBacked = true;
    item.localQueued = Boolean(operation2);
    item.localOperation = operation2;
    item.localConflict = conflict;
    item.localCreatedAt = local.created_at || null;
    item.localUpdatedAt = local.updated_at || null;
    item.canEdit = local.can_edit;
    item.deleted = local.deleted;
    item.loaded = true;
    item.draft = preserve ? draft : item.durableText;
    item.dirty = item.draft !== item.durableText;
    if (conflict) {
      let remote = null;
      try {
        if (conflict.remote) remote = checkedEntry(conflict.remote, item.category, item.date, item.id);
      } catch {
      }
      item.remote = remote;
      item.phase = "conflict";
      item.error = "本机与线上内容均已保留，请从顶部同步状态处理冲突。";
      stopTimer(item);
    } else {
      item.remote = null;
      item.phase = item.dirty ? "dirty" : savedPhase(item);
      item.error = "";
    }
  }
  function mergeLocal(item, value) {
    const { local, operation: operation2, conflict, server } = documentState(value);
    if (local.version < persistedVersion(item) || item.pending) return;
    if (item.localQueued && !operation2 && !conflict) {
      if (server) context.merge(item, server);
      return;
    }
    item.writeEpoch++;
    adoptLocal(item, value, item.dirty || item.composing);
  }
  return { adoptLocal, mergeLocal };
}
function createEntryReadingActions(context) {
  const { category, page, entry, entries, emit, adopt, merge, schedule, makeEntry } = context;
  const { load, loadEntry } = context.options;
  async function read(date, options2 = {}) {
    const current2 = page(date), sequence2 = ++current2.sequence;
    const epochs = new Map(current2.ids.map((id) => [id, entry(id)?.writeEpoch]));
    current2.loading = true;
    current2.error = "";
    emit();
    try {
      const value = checkedCollection(await load(date, options2), category, date);
      if (context.disposed || sequence2 !== current2.sequence) return;
      current2.canEdit = value.can_edit;
      const found = /* @__PURE__ */ new Set();
      for (const raw of value.entries) {
        const visible3 = noteValue(raw);
        found.add(visible3.id);
        let item = entry(visible3.id);
        if (!item) {
          item = makeEntry(visible3.id, date, visible3.can_edit);
          entries.set(visible3.id, item);
          adopt(item, raw);
          if (!isLocalDocument(raw)) item.phase = "saved";
        } else if (!item.pending && item.writeEpoch === epochs.get(item.id)) merge(item, raw);
      }
      const retained = current2.ids.filter((id) => {
        const item = entry(id);
        return found.has(id) || item.version === 0 || item.dirty || item.pending || item.deleted || item.localBacked || blocked(item) || item.writeEpoch !== epochs.get(id);
      });
      current2.ids = [.../* @__PURE__ */ new Set([...retained, ...value.entries.map((raw) => noteValue(raw).id)])];
      current2.loaded = true;
      await Promise.all(current2.ids.filter((id) => !found.has(id) && persistedVersion(entry(id)) > 0 && (entry(id).dirty || entry(id).localBacked) && !entry(id).pending).map((id) => readOne(id, options2)));
    } catch (error) {
      if (!context.disposed && sequence2 === current2.sequence) current2.error = error.message;
    } finally {
      if (!context.disposed && sequence2 === current2.sequence) {
        current2.loading = false;
        emit();
        for (const id of current2.ids) schedule(entry(id));
      }
    }
  }
  async function readOne(id, options2 = {}) {
    const item = entry(id);
    if (!item || context.disposed) return;
    const sequence2 = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true;
    emit();
    try {
      const value = checkedEntry(await loadEntry(id, options2), category, item.date, id);
      if (!context.disposed && sequence2 === item.sequence && !item.pending && epoch === item.writeEpoch) merge(item, value);
    } catch (error) {
      if (!context.disposed && sequence2 === item.sequence) {
        item.error = error.message;
        if (!blocked(item)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence2 === item.sequence) {
        item.loading = false;
        emit();
        schedule(item);
      }
    }
  }
  return { read, readOne };
}
function createEntryEditingActions(context) {
  const { page, entry, entries, emit, stopTimer, schedule, makeEntry } = context;
  const { uuid: uuid5 } = context.options;
  function start(date, { label: label3 = "" } = {}) {
    const current2 = page(date);
    if (label3 && (context.category !== "life" || !validCustomNoteLabel(label3))) throw new Error("标签无效。");
    if (context.disposed || !current2.loaded || !current2.canEdit) return;
    const existing = entry(current2.composerId);
    if (existing && persistedVersion(existing) === 0 && !existing.deleted && existing.label === label3) return existing;
    const id = uuid5();
    if (!uuidPattern6.test(id) || entries.has(id)) throw new Error("暂时无法新建记录，请重试。");
    const item = makeEntry(id, date, current2.canEdit);
    item.label = label3;
    item.labelKnown = true;
    entries.set(id, item);
    current2.ids.push(id);
    current2.composerId = id;
    emit();
    return item;
  }
  function edit(id, text, { composing = false } = {}) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || item.deleted || ["delete", "restore"].includes(item.pending?.kind)) return;
    item.draft = text;
    item.composing = composing;
    item.dirty = text !== savedText(item);
    stopTimer(item);
    if (dailyNotesBytes(text) > DAILY_NOTES_MAX_BYTES) {
      if (!blocked(item)) item.phase = "oversize";
      item.error = "文字超过 64 KiB，草稿已保留，请缩短后再保存。";
    } else if (!blocked(item)) {
      item.phase = item.pending ? "saving" : item.dirty ? "dirty" : savedPhase(item);
      item.error = "";
    }
    emit();
    if (!composing) schedule(item);
  }
  return { start, edit };
}
function createEntryRecoveryActions(context) {
  const { category, page, entry, entries, makeEntry, stopTimer, emit } = context;
  function restoreDraft(raw) {
    if (!raw || raw.category !== category || !validDailyNotesDate(raw.date) || !uuidPattern6.test(raw.id) || raw.label && (category !== "life" || !validCustomNoteLabel(raw.label)) || typeof raw.draft !== "string" || raw.draft.length > 262144 || context.disposed) return;
    const current2 = page(raw.date);
    let item = entry(raw.id);
    if (item && (item.pending || item.composing || item.dirty)) return item;
    const pendingDurable = item && raw.pending?.saveId && raw.pending.saveId === item.localOperation?.save_id;
    if (item && persistedVersion(item) > 0 && raw.draft === savedText(item) && (!raw.pending || pendingDurable)) return item;
    if (!item) {
      item = makeEntry(raw.id, raw.date, current2.canEdit);
      entries.set(item.id, item);
    }
    if (!persistedVersion(item)) {
      item.label = raw.label || "";
      item.labelKnown = raw.labelKnown === true;
    }
    if (!current2.ids.includes(item.id)) current2.ids.push(item.id);
    stopTimer(item);
    item.writeEpoch++;
    item.draft = raw.draft;
    item.dirty = item.draft !== savedText(item);
    item.recoveredBaseline = raw.recoveredBaseline || {
      version: raw.version ?? null,
      serverText: raw.serverText ?? null,
      contentHash: raw.contentHash ?? null,
      createdAt: raw.createdAt ?? null,
      updatedAt: raw.updatedAt ?? null,
      localVersion: raw.localVersion ?? null,
      durableText: raw.durableText ?? null
    };
    if (raw.pending && !pendingDurable) {
      const operation2 = raw.pending;
      const valid = ["put", "delete", "restore"].includes(operation2.kind) && uuidPattern6.test(operation2.saveId) && Number.isSafeInteger(operation2.version) && operation2.version >= 0 && (operation2.kind !== "put" || typeof operation2.text === "string" && dailyNotesBytes(operation2.text) <= DAILY_NOTES_MAX_BYTES && (!operation2.label || category === "life" && validCustomNoteLabel(operation2.label)) && (!operation2.expectedLabel || category === "life" && validCustomNoteLabel(operation2.expectedLabel)));
      item.pending = valid ? {
        kind: operation2.kind,
        version: operation2.version,
        saveId: operation2.saveId,
        ...operation2.kind === "put" ? {
          text: operation2.text,
          ...operation2.label ? { label: operation2.label } : {},
          ...operation2.expectedLabel ? { expectedLabel: operation2.expectedLabel } : {}
        } : {},
        uncertain: true,
        checking: false,
        retryReady: false
      } : { kind: "recovery-blocked", uncertain: true, invalid: true, checking: false, retryReady: false };
      item.phase = "unknown";
      item.error = valid ? "已找回未确认的原保存，请手动核对结果；不会自动重发。" : "旧保存凭据不完整，草稿已保留供查看或导出。";
    } else {
      item.phase = dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES ? "oversize" : "error";
      item.error = "已找回未提交草稿，请核对后手动保存；不会自动上传。";
    }
    emit();
    return item;
  }
  return { restoreDraft };
}
function createEntryWritingActions(context) {
  const { category, page, entry, entries, emit, stopTimer, adopt, schedule } = context;
  const { put, remove, restore, uuid: uuid5, onSaved } = context.options;
  const matches2 = (value, operation2) => value.version === operation2.version + 1 && (operation2.kind === "delete" ? value.deleted : operation2.kind === "restore" ? !value.deleted : !value.deleted && value.text === operation2.text && (!operation2.label || value.labels_version === 1 && value.label === operation2.label) && (!operation2.expectedLabel || value.labels_version === 1 && value.label === operation2.expectedLabel));
  function accepted(item, value, operation2) {
    const preserve = operation2.kind === "put" && item.draft !== operation2.text;
    item.writeEpoch++;
    adopt(item, value, preserve);
    item.remote = null;
    item.pending = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit();
    onSaved(item.date);
    schedule(item);
  }
  function acceptedLocal(item, value, operation2) {
    const local = documentValue(value);
    if (!matches2(local, operation2)) throw new Error("本机保存结果需要重新核对。");
    const preserve = operation2.kind === "put" && item.draft !== operation2.text;
    item.writeEpoch++;
    adopt(item, value, preserve);
    item.pending = null;
    emit();
    onSaved(item.date);
    schedule(item);
  }
  async function send(item, operation2) {
    stopTimer(item);
    item.pending = operation2;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    emit();
    try {
      const body2 = { version: operation2.version, save_id: operation2.saveId };
      const options2 = operation2.uncertain ? { offlineUnknown: true } : void 0;
      const raw = operation2.kind === "delete" ? await remove(item.id, body2, options2) : operation2.kind === "restore" ? await restore(item.id, body2, options2) : await put(item.id, {
        ...body2,
        category: item.category,
        date: item.date,
        text: operation2.text,
        ...operation2.label ? { label: operation2.label } : {}
      }, options2);
      if (context.disposed || item.pending !== operation2) return;
      const value = checkedEntry(raw, category, item.date, item.id);
      if (isLocalDocument(value)) {
        acceptedLocal(item, value, operation2);
        return;
      }
      if (!matches2(value, operation2)) throw new Error("保存响应需要重新核对。");
      accepted(item, value, operation2);
    } catch (error) {
      if (context.disposed || item.pending !== operation2) return;
      if (localFailure(error)) {
        item.pending = operation2.uncertain ? operation2 : null;
        item.phase = operation2.uncertain ? "unknown" : "error";
        item.error = operation2.uncertain ? "原保存仍待核对，本机接管未完成：" + error.message : error.message;
        emit();
      } else if (error.status === 409 && (!error.code || ["VERSION_CONFLICT", "NOTE_ENTRY_DELETED"].includes(error.code))) {
        item.pending = null;
        item.phase = "conflict";
        item.error = error.message || "这条记录已有新版本，草稿已保留。";
        emit();
        await context.readOne(item.id);
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null;
        item.phase = "error";
        item.error = error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
        emit();
      } else {
        operation2.uncertain = true;
        item.phase = "unknown";
        item.error = "正在核对保存结果，草稿已保留。";
        emit();
        await context.reconcile(item.id);
      }
    }
  }
  async function save(id) {
    const item = entry(id);
    if (!item) return;
    stopTimer(item);
    if (context.disposed || !item.canEdit || item.deleted || item.loading || item.pending || blocked(item) || !item.dirty || item.composing) return;
    if (!persistedVersion(item) && !item.draft.trim()) return;
    if (dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES) {
      item.phase = "oversize";
      item.error = "文字超过 64 KiB，草稿已保留。";
      emit();
      return;
    }
    return send(item, {
      kind: "put",
      version: persistedVersion(item),
      text: item.draft,
      saveId: uuid5(),
      ...!persistedVersion(item) && item.label ? { label: item.label } : {},
      ...item.label ? { expectedLabel: item.label } : {}
    });
  }
  async function deleteEntry(id) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || item.pending || blocked(item) || item.deleted) return;
    if (!persistedVersion(item)) {
      stopTimer(item);
      const current2 = page(item.date);
      current2.ids = current2.ids.filter((value) => value !== id);
      entries.delete(id);
      if (current2.composerId === id) current2.composerId = "";
      emit();
      return;
    }
    return send(item, { kind: "delete", version: persistedVersion(item), saveId: uuid5() });
  }
  async function restoreEntry(id) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || !item.deleted || item.pending || blocked(item)) return;
    return send(item, { kind: "restore", version: persistedVersion(item), saveId: uuid5() });
  }
  return { matches: matches2, accepted, acceptedLocal, send, save, deleteEntry, restoreEntry };
}
function createEntryResolutionActions(context) {
  const { category, entry, emit, stopTimer, adopt, matches: matches2, accepted, acceptedLocal } = context;
  const { load, loadEntry, loadOperation } = context.options;
  async function reconcile(id) {
    const item = entry(id), operation2 = item?.pending;
    if (context.disposed || item?.phase !== "unknown" || !operation2 || operation2.checking) return;
    operation2.checking = true;
    operation2.retryReady = false;
    emit();
    try {
      const receipt = await loadOperation(operation2.saveId);
      if (context.disposed || item.pending !== operation2) return;
      if (!receipt || typeof receipt.found !== "boolean" || receipt.found && (receipt.id !== id || receipt.version !== operation2.version + 1 || typeof receipt.content_hash !== "string")) {
        throw new Error("保存凭据不完整。");
      }
      let value;
      try {
        value = checkedEntry(await loadEntry(id), category, item.date, id);
      } catch (error) {
        if (error.status !== 404 || receipt.found || operation2.version !== 0 || operation2.kind !== "put") throw error;
        const collection = checkedCollection(await load(item.date), category, item.date);
        value = collection.entries.find((raw) => noteValue(raw).id === id);
        if (isLocalDocument(value)) throw new Error("原保存结果仍由同步队列核实，本机内容已保留。");
        if (!value) {
          if (context.disposed || item.pending !== operation2) return;
          item.canEdit = collection.can_edit;
          operation2.retryReady = collection.can_edit;
          item.error = operation2.retryReady ? "服务器尚未收到此保存，可重试；后续草稿已保留。" : "保存尚未确认，草稿已保留。";
          return;
        }
      }
      if (context.disposed || item.pending !== operation2) return;
      if (isLocalDocument(value)) {
        if (documentState(value).operation?.save_id === operation2.saveId) return acceptedLocal(item, value, operation2);
        throw new Error("保存结果仍由同步队列核实，本机内容已保留。");
      }
      item.canEdit = value.can_edit;
      if (receipt.found && receipt.content_hash === value.content_hash && receipt.version === value.version && matches2(value, operation2)) {
        accepted(item, value, operation2);
      } else if (value.version > operation2.version) {
        item.remote = value;
        item.pending = null;
        item.phase = "conflict";
        item.error = "服务器已有更新，草稿已保留，请核对后选择。";
      } else {
        item.remote = value;
        operation2.retryReady = !receipt.found && value.can_edit && value.version === operation2.version;
        item.error = operation2.retryReady ? "服务器尚无新版本，可重试原保存；后续草稿已保留。" : "保存结果尚未确认，草稿已保留，请再次核对。";
      }
    } catch (error) {
      if (!context.disposed && item.pending === operation2) {
        item.error = "核对失败，草稿已保留：" + error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
      }
    } finally {
      operation2.checking = false;
      emit();
    }
  }
  async function retryPending(id) {
    const item = entry(id), operation2 = item?.pending;
    if (context.disposed || item?.phase !== "unknown" || !item.canEdit || !operation2?.retryReady || operation2.checking) return;
    operation2.retryReady = false;
    return context.send(item, operation2);
  }
  function useServer(id) {
    const item = entry(id);
    if (item?.localConflict) {
      item.error = "请从顶部同步状态选择线上版本，本机原文会保留。";
      emit();
      return;
    }
    if (!item?.remote || item.pending || item.phase !== "conflict") return;
    stopTimer(item);
    adopt(item, item.remote);
    item.remote = null;
    item.phase = "saved";
    item.error = "";
    emit();
  }
  async function useDraft(id) {
    const item = entry(id);
    if (item?.localConflict) {
      item.error = "冲突的两份内容已保留，请从顶部同步状态处理。";
      emit();
      return;
    }
    if (!item?.remote || item.pending || item.phase !== "conflict" || !item.remote.can_edit || item.remote.deleted) return;
    adopt(item, item.remote, true);
    item.remote = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit();
    return context.save(id);
  }
  return { reconcile, retryPending, useServer, useDraft };
}
function createNoteEntriesStore(options2) {
  const context = createEntriesContext(options2);
  Object.assign(context, createEntryLocalActions(context));
  Object.assign(
    context,
    createEntryReadingActions(context),
    createEntryEditingActions(context),
    createEntryWritingActions(context),
    createEntryRecoveryActions(context)
  );
  Object.assign(context, createEntryResolutionActions(context));
  const {
    category,
    pages,
    entries,
    page,
    entry,
    start,
    read,
    readOne,
    edit,
    save,
    deleteEntry,
    restoreEntry,
    reconcile,
    retryPending,
    useServer,
    useDraft,
    restoreDraft,
    dispose
  } = context;
  const pauseAutosave = () => {
    context.autosavePaused = true;
    for (const item of entries.values()) context.stopTimer(item);
    return () => {
      context.autosavePaused = false;
    };
  };
  return {
    category,
    pages,
    entries,
    page,
    entry,
    start,
    read,
    readOne,
    edit,
    save,
    deleteEntry,
    restoreEntry,
    reconcile,
    retryPending,
    useServer,
    useDraft,
    restoreDraft,
    pauseAutosave,
    dispose
  };
}

// web/core/notes-month.mjs
function validNoteMonth(month) {
  return typeof month === "string" && /^\d{4}-\d{2}$/.test(month) && validDailyNotesDate(month + "-01");
}
function coalesceNoteMonthFlight(current2, next) {
  if (!current2 || current2.root !== next.root || current2.target !== next.target || current2.expected !== next.expected || current2.sequence !== next.sequence) return false;
  if (next.chosenDate) current2.chosenDate = next.chosenDate;
  return true;
}
function shiftNoteMonth(month, delta) {
  if (!validNoteMonth(month) || !Number.isInteger(delta)) throw new Error("请选择有效月份。");
  const date = /* @__PURE__ */ new Date(month + "-01T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + delta);
  const value = date.toISOString().slice(0, 7);
  if (!validNoteMonth(value)) throw new Error("请选择有效月份。");
  return value;
}
function noteMonthWeeks(month) {
  if (!validNoteMonth(month)) throw new Error("请选择有效月份。");
  const first = /* @__PURE__ */ new Date(month + "-01T12:00:00Z"), offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const weeks = Array.from({ length: Math.ceil((offset + last.getUTCDate()) / 7) }, () => Array(7).fill(null));
  for (let day4 = 1; day4 <= last.getUTCDate(); day4++)
    weeks[Math.floor((offset + day4 - 1) / 7)][(offset + day4 - 1) % 7] = month + "-" + String(day4).padStart(2, "0");
  return weeks;
}
function checkedNoteMonth(data, month) {
  const fail5 = () => {
    throw new Error("月记录不完整，请联网重试。");
  };
  if (!validNoteMonth(month) || !data || data.month !== month || data.complete !== true || data.labels_version !== 1 || !Array.isArray(data.days) || data.days.length > 31) fail5();
  const result = /* @__PURE__ */ new Map(), ids = /* @__PURE__ */ new Set();
  let total = 0;
  for (const day4 of data.days) {
    if (!day4 || !validDailyNotesDate(day4.date) || !day4.date.startsWith(month + "-") || result.has(day4.date) || !Array.isArray(day4.items)) fail5();
    const items = day4.items.map((item) => {
      if (!item || typeof item.entity_id !== "string" || ids.has(item.entity_id) || !["note_entry", "legacy_daily_note"].includes(item.source) || !["life", "work"].includes(item.category) || !Object.hasOwn(item, "label") || item.label !== null && (item.category !== "life" || !validCustomNoteLabel(item.label)) || typeof item.text !== "string" || !item.text || !Object.hasOwn(item, "created_at") || item.created_at !== null && !Number.isFinite(Date.parse(item.created_at)) || item.source === "legacy_daily_note" && item.created_at !== null || !Number.isFinite(Date.parse(item.updated_at))) fail5();
      ids.add(item.entity_id);
      total++;
      return { ...item, displayLabel: item.label || (item.category === "work" ? "工作" : "生活") };
    });
    result.set(day4.date, items);
  }
  if (total > 2e3) fail5();
  return result;
}

// web/notes-month-controller.mjs
function renderNotesMonthMarkup() {
  return '<details id="notes-month-panel" class="notes-month-panel"><summary>月历与历史</summary><div class="notes-month-controls"><button class="btn" type="button" data-notes-month-step="-1" aria-label="上个月">‹</button><label>月份 <input id="notes-month-input" class="input" type="month"></label><button class="btn" type="button" data-notes-month-step="1" aria-label="下个月">›</button><label>分类 <select id="notes-month-category" class="input"><option value="">全部</option><option value="life">生活</option><option value="work">工作</option></select></label><button class="btn text" type="button" data-notes-month-refresh>刷新</button></div><p id="notes-month-status" role="status" aria-live="polite"></p><div class="notes-month-weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div id="notes-month-grid" class="notes-month-grid"></div><h3 id="notes-month-day-title"></h3><div id="notes-month-history" class="notes-entry-list"></div></details>';
}
function mountNotesMonth(root, { request, selectDate, identity: identity4 }) {
  const panel = root.querySelector("#notes-month-panel");
  if (!panel) return () => {
  };
  const find = (selector) => panel.querySelector(selector), doc = root.ownerDocument;
  const identityNow = typeof identity4 === "function" ? identity4 : () => identity4, expected = identityNow();
  let disposed = false, sequence2 = 0, days = /* @__PURE__ */ new Map(), loaded = "", selected = dailyNotesToday(), month = selected.slice(0, 7), category = "";
  const active5 = () => !disposed && root.isConnected && identityNow() === expected;
  const visibleRows = (date) => (days.get(date) || []).filter((item) => !category || item.category === category);
  find("#notes-month-input").value = month;
  function node(tag, text, className = "") {
    const result = doc.createElement(tag);
    result.textContent = text;
    if (className) result.className = className;
    return result;
  }
  function paintHistory() {
    const rows = visibleRows(selected), list = find("#notes-month-history");
    list.replaceChildren();
    find("#notes-month-day-title").textContent = selected + " · " + rows.length + " 条记录";
    for (const item of rows) {
      const card = node("article", "", "note-entry note-entry-saved"), head = node("div", "", "note-entry-head");
      head.append(node("span", item.displayLabel + (item.source === "legacy_daily_note" ? " · 原有记录" : "")));
      const time2 = node("time", new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.updated_at)));
      time2.dateTime = item.updated_at;
      head.append(time2);
      card.append(head, node("div", item.text || "这条记录没有文字。", "note-entry-reader"));
      const open = node("button", "查看当天", "btn text");
      open.type = "button";
      open.addEventListener("click", () => {
        if (active5()) void selectDate(selected, item.category);
      });
      card.append(open);
      list.append(card);
    }
    if (!rows.length) list.append(node("p", "这一天没有符合分类的已同步记录。", "notes-empty"));
  }
  function paint() {
    const grid = find("#notes-month-grid");
    grid.replaceChildren();
    for (const date of noteMonthWeeks(month).flat()) {
      if (!date) {
        grid.append(node("span", ""));
        continue;
      }
      const count = visibleRows(date).length, button2 = node("button", String(Number(date.slice(-2))) + (count ? " · " + count : ""), "btn");
      button2.type = "button";
      button2.dataset.notesMonthDate = date;
      button2.setAttribute("aria-label", date + "，" + count + " 条记录");
      button2.setAttribute("aria-pressed", String(date === selected));
      button2.classList.toggle("has-records", count > 0);
      grid.append(button2);
    }
    paintHistory();
  }
  async function load(force = false) {
    if (!active5() || !panel.open || !validNoteMonth(month) || !force && loaded === month) return;
    const current2 = ++sequence2, target = month;
    loaded = "";
    days = /* @__PURE__ */ new Map();
    find("#notes-month-grid").replaceChildren();
    find("#notes-month-history").replaceChildren();
    find("#notes-month-day-title").textContent = "";
    find("#notes-month-status").textContent = "";
    try {
      const data = await request("/note-entries/month?month=" + target);
      if (!active5() || current2 !== sequence2 || target !== month) return;
      days = checkedNoteMonth(data, target);
      loaded = target;
      if (!selected.startsWith(target + "-")) selected = [...days.keys()][0] || target + "-01";
      find("#notes-month-status").textContent = "仅展示已同步记录；待同步草稿请在原日期查看。";
      paint();
    } catch (error) {
      if (!active5() || current2 !== sequence2) return;
      find("#notes-month-status").textContent = error.message || "月记录读取失败，请重试。";
    }
  }
  function toggle() {
    if (panel.open) void load();
  }
  function change2(event) {
    if (!active5()) return;
    if (event.target.id === "notes-month-input") {
      if (!validNoteMonth(event.target.value)) {
        find("#notes-month-status").textContent = "请选择有效月份。";
        return;
      }
      month = event.target.value;
      void load();
    } else if (event.target.id === "notes-month-category") {
      category = event.target.value;
      if (loaded === month) paint();
    }
  }
  function click(event) {
    if (!active5()) return;
    const target = event.target.closest("[data-notes-month-step],[data-notes-month-date],[data-notes-month-refresh]");
    if (!target || !panel.contains(target)) return;
    event.preventDefault();
    if (target.dataset.notesMonthStep) {
      try {
        month = shiftNoteMonth(month, Number(target.dataset.notesMonthStep));
        find("#notes-month-input").value = month;
        void load();
      } catch (error) {
        find("#notes-month-status").textContent = error.message;
      }
    } else if (target.dataset.notesMonthDate) {
      selected = target.dataset.notesMonthDate;
      paint();
    } else void load(true);
  }
  panel.addEventListener("toggle", toggle);
  panel.addEventListener("change", change2);
  panel.addEventListener("click", click);
  return () => {
    disposed = true;
    sequence2++;
    panel.removeEventListener("toggle", toggle);
    panel.removeEventListener("change", change2);
    panel.removeEventListener("click", click);
  };
}

// web/pages/daily-notes.mjs
function legacyEditorMarkup() {
  return '<article id="notes-legacy-card" class="note-entry note-entry-editing notes-legacy-card" hidden><div class="note-entry-head"><time id="notes-legacy-time" class="note-entry-time" hidden></time><span id="notes-legacy-status" class="note-entry-status" role="status" aria-live="polite"></span></div><p id="notes-message" class="notes-message" role="alert" hidden></p><div class="notes-sheet"><label for="notes-editor" class="sr-only">原有记录内容</label><textarea id="notes-editor" class="notes-editor" aria-label="原有记录或保留草稿，只读" readonly hidden></textarea><div id="notes-reader" class="notes-reader"></div><p id="notes-empty" hidden>这条记录没有文字。</p></div><div class="notes-footer"><span id="notes-detail" class="notes-detail"></span><button class="btn text" type="button" data-notes-action="export-legacy" hidden>导出保留的原有草稿</button><div id="notes-write-actions" class="notes-write-actions" hidden><button class="btn" type="button" data-notes-action="save">立即保存</button><button class="btn" type="button" data-notes-action="restore" hidden>恢复原有记录</button><button class="btn text" type="button" data-notes-action="delete">删除原有记录</button></div></div><div id="notes-delete-confirm" class="notes-confirm" hidden><p>删除原有记录？</p><button class="btn" type="button" data-notes-action="cancel-delete">取消</button><button class="btn" type="button" data-notes-action="confirm-delete">确认删除</button></div><div id="notes-resolution" class="notes-resolution" hidden><button class="btn" type="button" data-notes-action="check">核对服务器版本</button><button class="btn" type="button" data-notes-action="retry" hidden>重试同一保存</button><div id="notes-conflict-actions" hidden><p>服务器上的文字：</p><pre id="notes-remote"></pre><button class="btn" type="button" data-notes-action="use-server">采用服务器内容</button><button class="btn" type="button" data-notes-action="use-draft">用此草稿保存到新版本</button></div></div></article>';
}
function renderDailyNotes() {
  const category = dailyNotesRouteCategory();
  return '<section id="daily-notes" class="daily-notes" aria-label="碎碎念" data-category="' + category + '"><div class="segmented" role="group" aria-label="碎碎念视图"><button type="button" data-notes-view="today" aria-pressed="true">今日碎碎念</button><button type="button" data-notes-view="history" aria-pressed="false">历史</button></div><section id="notes-history" hidden aria-label="碎碎念历史"><div class="notes-calendar-layout"><aside class="notes-calendar-filters"><label>月份 <input type="month" id="notes-history-month" class="input"></label><div class="notes-calendar-month-actions"><button type="button" class="btn" data-notes-month="prev">上个月</button><button type="button" class="btn" data-notes-month="next">下个月</button></div><label hidden>周次 <select id="notes-history-week" class="input"><option value="">全部周次</option></select></label><label>标签 <select id="notes-history-label" class="input"><option value="">全部标签</option></select></label><label hidden>日期 <select id="notes-history-date" class="input"></select></label></aside><div class="notes-calendar-main"><div class="notes-history-views" role="group" aria-label="历史显示方式"><button type="button" data-history-display="calendar" aria-pressed="true">日历</button><button type="button" data-history-display="timeline" aria-pressed="false">时间轴</button></div><p id="notes-history-summary" class="notes-calendar-summary"></p><p id="notes-history-status" role="status" aria-live="polite"></p><div class="notes-calendar-weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div id="notes-history-grid" class="notes-calendar-grid"></div><div id="notes-history-list" class="notes-entry-list"></div></div></div></section><div id="notes-today"><div class="notes-categories"><label>标签 <select id="notes-compose-label" class="input"><option value="生活">生活</option><option value="工作">工作</option></select></label><label><span class="sr-only">新标签名称</span><input id="notes-new-label" class="input" maxlength="64" placeholder="新标签"></label><button class="btn text" type="button" data-notes-action="create-label">添加标签</button><span id="notes-label-status" role="status" aria-live="polite"></span></div><div class="notes-toolbar"><div class="notes-date-controls"><button class="btn" type="button" data-notes-action="previous" aria-label="前一天">‹</button><label class="notes-date-label"><span class="sr-only">选择碎碎念日期</span><input id="notes-date" class="input" type="date" max="' + dailyNotesToday() + '"></label><button class="btn" type="button" data-notes-action="next" aria-label="后一天">›</button><button class="btn text" type="button" data-notes-action="today">今天</button></div><span id="notes-status" class="notes-status" role="status" aria-live="polite"></span></div><div id="notes-drafts" class="notes-drafts" hidden></div><p id="notes-entry-message" class="notes-message" role="alert" hidden></p><div class="notes-entry-toolbar"><button class="btn notes-add-entry" type="button" data-notes-action="new" hidden>＋ 写一条</button><button class="btn text" type="button" data-notes-action="login" hidden>所有者登录</button></div><section id="notes-composer" class="notes-composer" aria-label="当前编辑的碎碎念" hidden><div class="notes-composer-heading" hidden><button class="btn text" type="button" data-notes-action="collapse">收起</button></div><div id="notes-active-entry"></div>' + legacyEditorMarkup() + '</section><p id="notes-entry-empty" class="notes-empty" hidden>这一天还没有记录。</p><div id="notes-unpublished" class="notes-entry-list"></div><details class="notes-published"><summary>已发布记录</summary><div id="notes-entry-list" class="notes-entry-list"></div><article id="notes-legacy-saved" class="note-entry note-entry-saved notes-legacy-saved" hidden><div class="note-entry-head"><time class="note-entry-time" hidden></time><span class="note-entry-status"></span></div><div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><button class="btn text note-entry-edit" type="button" data-notes-action="edit-legacy">查看原有记录</button><button class="btn text" type="button" data-notes-action="export-legacy" hidden>导出保留的原有草稿</button></article></details></div></section>';
}
var statuses = {
  loading: "",
  dirty: "未发送",
  saving: "发送中…",
  conflict: "草稿有冲突",
  unknown: "保存结果待核对",
  error: "暂未保存",
  oversize: "文字过长",
  queued: "已存本机，待同步",
  cached: "本机缓存"
};
function retainedLegacy(item) {
  return Boolean(item.dirty || item.pending || ["unknown", "conflict", "oversize", "error"].includes(item.phase));
}
function displayedText(item) {
  if (item.dirty || item.phase !== "queued" && noteDraftNeedsAttention(item)) return item.draft;
  return item.localBacked || item.localQueued || item.phase === "queued" ? item.durableText ?? item.draft : item.serverText;
}
function noteEntryTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
function paintTime(time2, value) {
  const actual = noteEntryTime(value);
  time2.textContent = actual;
  time2.hidden = !actual;
  if (actual) {
    time2.dateTime = value;
    time2.title = "修改时间（北京时间）：" + new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  } else {
    time2.removeAttribute("datetime");
    time2.removeAttribute("title");
  }
}
function paintEditorValue(editor, text) {
  if (editor.dataset.composing === "true" || editor.value === text) return;
  const active5 = typeof document !== "undefined" && document.activeElement === editor, start = editor.selectionStart, end = editor.selectionEnd, direction = editor.selectionDirection, scroll = editor.scrollTop;
  editor.value = text;
  if (active5) {
    editor.setSelectionRange(Math.min(start, text.length), Math.min(end, text.length), direction);
    editor.scrollTop = scroll;
  }
}
function paintDailyNotes(root, item, { compatibility = false, editing: editing3 = false } = {}) {
  if (!root) return;
  const find = (selector) => root.querySelector(selector), editor = find("#notes-editor"), reader = find("#notes-reader");
  const retained = retainedLegacy(item);
  editor.dataset.date = item.date;
  editor.dataset.category = root.dataset.category || dailyNotesRouteCategory();
  editor.hidden = !editing3 || !item.loaded || item.deleted && !retained;
  editor.readOnly = true;
  editor.disabled = false;
  paintEditorValue(editor, item.draft);
  reader.hidden = !item.loaded || editing3 && (!item.deleted || retained);
  reader.textContent = retained ? item.draft : item.deleted ? "原有记录已删除。" : item.serverText;
  find("#notes-empty").hidden = !item.loaded || Boolean(item.serverText || retained && item.draft);
  const status = find(compatibility ? "#notes-legacy-status" : "#notes-status");
  status.textContent = retained ? statuses[item.phase] || "保留的原有草稿" : item.deleted ? "原有记录已删除" : "原有记录 · 只读";
  status.dataset.phase = item.phase;
  find("#notes-message").hidden = !item.error;
  find("#notes-message").textContent = item.error;
  find("#notes-detail").textContent = retained ? "原有草稿已保留，仅供查看与导出，不会自动上传。" : "原有逐日记录，只读保留。";
  find("#notes-write-actions").hidden = true;
  for (const action of ["save", "restore", "delete", "retry", "use-server", "use-draft", "confirm-delete"]) {
    const button2 = find('[data-notes-action="' + action + '"]');
    button2.hidden = true;
    button2.disabled = true;
  }
  find('#notes-legacy-card [data-notes-action="export-legacy"]').hidden = !retained;
  find("#notes-delete-confirm").hidden = true;
  find("#notes-resolution").hidden = true;
  find('[data-notes-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find("#notes-conflict-actions").hidden = true;
  find("#notes-remote").textContent = item.remote?.deleted ? "（原有记录已删除）" : item.remote?.text || "（空白）";
  if (compatibility) paintTime(find("#notes-legacy-time"), item.updatedAt);
}
function entryControlsMarkup() {
  return '<p class="note-entry-message" role="alert" hidden></p><div class="note-entry-actions"><button class="btn note-entry-send" type="button" data-note-entry-action="save" aria-label="发送">发送</button><span class="note-entry-send-feedback" role="status" aria-live="polite"></span><button class="btn text" type="button" data-note-entry-action="restore" hidden>恢复</button><button class="btn text" type="button" data-note-entry-action="delete">删除</button></div><div class="note-entry-confirm notes-confirm" hidden><p>删除这条记录？</p><button class="btn" type="button" data-note-entry-action="cancel-delete">取消</button><button class="btn" type="button" data-note-entry-action="confirm-delete">确认删除</button></div><div class="note-entry-resolution notes-resolution" hidden><button class="btn" type="button" data-note-entry-action="check">核对保存结果</button><button class="btn" type="button" data-note-entry-action="retry" hidden>重试原保存</button><div class="note-entry-conflict" hidden><p>服务器上的文字：</p><pre></pre><button class="btn" type="button" data-note-entry-action="use-server">采用服务器内容</button><button class="btn" type="button" data-note-entry-action="use-draft">用此草稿保存</button></div></div>';
}
function createEntryElement(item, editing3) {
  const node = document.createElement("article");
  node.className = "note-entry " + (editing3 ? "note-entry-editing" : "note-entry-saved");
  node.dataset.noteEntry = item.id;
  node.dataset.category = item.category;
  node.innerHTML = '<div class="note-entry-head"><span class="note-entry-label"></span><time class="note-entry-time"></time><span class="note-entry-status" role="status" aria-live="polite"></span></div>' + (editing3 ? '<label class="sr-only" for="entry-' + e(item.id) + '">碎碎念内容</label><textarea id="entry-' + e(item.id) + '" class="note-entry-editor" data-note-entry-editor="' + e(item.id) + '" placeholder="写下一点想说的话…" rows="3"></textarea><div class="note-entry-reader" hidden></div>' + entryControlsMarkup() : '<div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><span class="note-entry-send-feedback" role="status" aria-live="polite"></span><button class="btn text note-entry-edit" type="button" data-note-entry-action="edit">编辑</button>');
  return node;
}
function paintEntrySummary(node, item) {
  node.dataset.category = item.category;
  node.querySelector(".note-entry-label").textContent = item.category === "work" ? "工作" : !item.labelKnown ? "标签未核实" : item.label || "生活";
  paintTime(node.querySelector("time"), item.updatedAt);
  const status = node.querySelector(".note-entry-status");
  status.textContent = statuses[item.phase] || (item.deleted ? "已删除" : item.version ? "已保存" : "未发送");
  status.dataset.phase = item.phase;
  const message = node.querySelector(".note-entry-message");
  message.textContent = item.error;
  message.hidden = !item.error;
}
function paintSavedEntry(node, item) {
  paintEntrySummary(node, item);
  node.querySelector(".note-entry-send-feedback").textContent = item.manualSubmitted && !item.dirty && item.phase === "saved" ? "发送成功" : "";
  const draft = noteDraftNeedsAttention(item), body2 = node.querySelector(".note-entry-reader");
  body2.textContent = item.deleted ? "这条记录已删除。" : displayedText(item);
  body2.classList.toggle("note-entry-draft-label", draft);
  node.dataset.draft = String(draft);
  const edit = node.querySelector('[data-note-entry-action="edit"]');
  edit.hidden = !item.canEdit && !draft;
  edit.textContent = draft ? "继续编辑草稿" : item.deleted ? "查看" : "编辑";
}
function paintEntryEditor(node, item, confirmId) {
  paintEntrySummary(node, item);
  const find = (selector) => node.querySelector(selector), editor = find("textarea");
  editor.dataset.date = item.date;
  editor.dataset.category = item.category;
  editor.hidden = item.deleted;
  editor.readOnly = !item.canEdit;
  editor.disabled = ["delete", "restore"].includes(item.pending?.kind);
  paintEditorValue(editor, item.draft);
  const reader = find(".note-entry-reader");
  reader.textContent = item.deleted ? "这条记录已删除。" : item.serverText;
  reader.hidden = !item.deleted;
  find(".note-entry-actions").hidden = !item.canEdit;
  const busy = Boolean(item.pending) || ["conflict", "unknown"].includes(item.phase);
  const save = find('[data-note-entry-action="save"]');
  save.hidden = item.deleted || !item.canEdit;
  save.textContent = item.pending ? "发送中…" : item.phase === "error" ? "重试发送" : "发送";
  save.setAttribute("aria-label", save.textContent);
  save.disabled = busy || !item.dirty || item.composing || item.phase === "oversize";
  const feedback = find(".note-entry-send-feedback");
  feedback.textContent = item.pending ? "发送中…" : !item.manualSubmitted || item.dirty ? "" : item.phase === "queued" ? "已存本机，待同步" : item.phase === "saved" ? "发送成功" : "";
  find('[data-note-entry-action="delete"]').hidden = item.deleted;
  find('[data-note-entry-action="delete"]').disabled = busy;
  find('[data-note-entry-action="restore"]').hidden = !item.deleted;
  find('[data-note-entry-action="restore"]').disabled = busy;
  find(".note-entry-confirm").hidden = confirmId !== item.id;
  find(".note-entry-resolution").hidden = !["unknown", "conflict"].includes(item.phase) && item.phase !== "error";
  find('[data-note-entry-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find('[data-note-entry-action="retry"]').hidden = item.phase !== "unknown" || !item.pending?.retryReady || !item.canEdit;
  find(".note-entry-conflict").hidden = item.phase !== "conflict" || !item.remote;
  find(".note-entry-conflict pre").textContent = item.remote?.deleted ? "（这条记录已删除）" : item.remote?.text || "（空白）";
  find('[data-note-entry-action="use-draft"]').disabled = !item.remote?.can_edit || item.remote?.deleted;
}
var editorNodes = /* @__PURE__ */ new WeakMap();
function paintActiveEditor(root, store, active5, legacy, confirmId) {
  const host = root.querySelector("#notes-active-entry");
  if (!editorNodes.has(root)) editorNodes.set(root, /* @__PURE__ */ new Map());
  const nodes = editorNodes.get(root), item = store.entry(active5);
  host.hidden = !item;
  if (item) {
    if (!nodes.has(active5)) nodes.set(active5, createEntryElement(item, true));
    const node = nodes.get(active5);
    if (host.firstElementChild !== node) host.replaceChildren(node);
    paintEntryEditor(node, item, confirmId);
  }
  root.querySelector("#notes-legacy-card").hidden = active5 !== "legacy";
  paintDailyNotes(root, legacy, { compatibility: true, editing: active5 === "legacy" });
}
function paintLegacySummary(root, legacy, active5) {
  const node = root.querySelector("#notes-legacy-saved"), draft = retainedLegacy(legacy);
  let label3 = node.querySelector(".note-entry-label");
  if (!label3) {
    label3 = document.createElement("span");
    label3.className = "note-entry-label";
    node.querySelector(".note-entry-head").prepend(label3);
  }
  label3.textContent = root.dataset.category === "work" ? "工作" : "生活";
  node.hidden = active5 === "legacy" || !(legacy.version > 0 || draft);
  paintTime(node.querySelector("time"), legacy.updatedAt);
  node.querySelector(".note-entry-reader").textContent = draft ? legacy.draft : legacy.deleted ? "原有记录已删除。" : legacy.serverText;
  node.querySelector(".note-entry-status").textContent = draft ? statuses[legacy.phase] || "保留的原有草稿" : "原有记录 · 只读";
  node.querySelector(".note-entry-status").dataset.phase = legacy.phase;
  node.querySelector(".note-entry-message").textContent = legacy.error;
  node.querySelector(".note-entry-message").hidden = !legacy.error;
  const edit = node.querySelector('[data-notes-action="edit-legacy"]');
  edit.hidden = false;
  edit.textContent = draft ? "查看保留的原有草稿" : "查看原有记录";
  node.querySelector('[data-notes-action="export-legacy"]').hidden = !draft;
}
function paintRetainedDrafts(root, current2, drafts) {
  const box = root.querySelector("#notes-drafts");
  const retained = [...new Set(drafts.filter((value) => value.date !== current2.date || value.category !== current2.category).map((value) => value.category + ":" + value.date))];
  box.hidden = !retained.length;
  box.innerHTML = "<span>保留的草稿：</span>" + retained.map((key) => {
    const [category, date] = key.split(":");
    return '<button class="btn text" type="button" data-notes-draft-category="' + e(category) + '" data-notes-date="' + e(date) + '">' + (category === "work" ? "工作 " : "生活 ") + e(date) + "</button>";
  }).join("");
}
function paintOtherLegacy(root, list, legacy, category) {
  let node = root.querySelector("#notes-legacy-other");
  if (!node) {
    node = document.createElement("article");
    node.id = "notes-legacy-other";
    node.className = "note-entry note-entry-saved notes-legacy-saved";
    node.innerHTML = '<div class="note-entry-head"><span class="note-entry-label"></span><time class="note-entry-time" hidden></time><span class="note-entry-status"></span></div><div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><button class="btn text note-entry-edit" type="button" data-notes-action="edit-other-legacy">查看原有记录</button><button class="btn text" type="button" data-notes-action="export-other-legacy" hidden>导出保留的原有草稿</button>';
  }
  list.append(node);
  const draft = legacy && retainedLegacy(legacy);
  node.hidden = !legacy || !(legacy.version > 0 || draft);
  if (!legacy) return;
  node.querySelector(".note-entry-label").textContent = category === "work" ? "工作" : "生活";
  paintTime(node.querySelector("time"), legacy.updatedAt);
  node.querySelector(".note-entry-reader").textContent = draft ? legacy.draft : legacy.deleted ? "原有记录已删除。" : legacy.serverText;
  node.querySelector(".note-entry-status").textContent = draft ? statuses[legacy.phase] || "保留的原有草稿" : "原有记录 · 只读";
  const message = node.querySelector(".note-entry-message");
  message.textContent = legacy.error;
  message.hidden = !legacy.error;
  const edit = node.querySelector('[data-notes-action="edit-other-legacy"]');
  edit.dataset.legacyCategory = category;
  edit.textContent = draft ? "查看保留的原有草稿" : "查看原有记录";
  const exportButton = node.querySelector('[data-notes-action="export-other-legacy"]');
  exportButton.dataset.legacyCategory = category;
  exportButton.hidden = !draft;
}
function paintNoteEntries(root, store, current2, legacy, { drafts = [], confirmId = "", active: active5 = "", otherLegacy = null, otherCategory = "" } = {}) {
  const find = (selector) => root.querySelector(selector), list = find("#notes-entry-list");
  root.dataset.date = current2.date;
  const dateInput = find("#notes-date");
  if (dateInput.value !== current2.date) dateInput.value = current2.date;
  find('[data-notes-action="next"]').disabled = current2.date >= dailyNotesToday();
  const canEdit = current2.loaded && current2.canEdit;
  find('[data-notes-action="new"]').hidden = !canEdit;
  find('[data-notes-action="login"]').hidden = !current2.loaded || current2.canEdit;
  find("#notes-entry-message").textContent = current2.error;
  find("#notes-entry-message").hidden = !current2.error;
  const items = current2.ids.map((id) => store.entry(id)).filter(Boolean);
  const saved = items.filter((item) => item.id !== active5 && (item.version > 0 || item.localVersion > 0 || noteDraftNeedsAttention(item)));
  const unpublished = find("#notes-unpublished");
  const nodes = new Map([...list.children, ...unpublished.children].filter((node) => node.dataset.noteEntry).map((node) => [node.dataset.noteEntry, node])), wanted = new Set(saved.map((item) => item.id));
  for (const [id, node] of nodes) if (!wanted.has(id)) node.remove();
  for (const item of saved) {
    const node = nodes.get(item.id) || createEntryElement(item, false);
    (noteDraftNeedsAttention(item) ? unpublished : list).append(node);
    paintSavedEntry(node, item);
  }
  paintActiveEditor(root, store, active5, legacy, confirmId);
  paintLegacySummary(root, legacy, active5);
  (retainedLegacy(legacy) ? unpublished : list).append(root.querySelector("#notes-legacy-saved"));
  paintOtherLegacy(root, list, otherLegacy, otherCategory);
  if (otherLegacy && retainedLegacy(otherLegacy)) unpublished.append(root.querySelector("#notes-legacy-other"));
  const composer = find("#notes-composer"), activeItem = active5 === "legacy" ? legacy : store.entry(active5);
  composer.hidden = !activeItem;
  composer.dataset.active = active5;
  find('[data-notes-action="collapse"]').disabled = !noteEditorCanCollapse(activeItem);
  find("#notes-entry-empty").hidden = !(current2.allLoaded ?? current2.loaded) || Boolean(activeItem) || saved.length > 0 || legacy.version > 0 || noteDraftNeedsAttention(legacy) || Boolean(otherLegacy && (otherLegacy.version > 0 || noteDraftNeedsAttention(otherLegacy)));
  const unresolved2 = items.some(noteDraftNeedsAttention) || noteDraftNeedsAttention(legacy);
  const status = find("#notes-status");
  status.textContent = !current2.loaded && current2.loading ? "" : current2.error ? "读取失败" : unresolved2 ? "有未发送内容" : canEdit ? "" : current2.loaded ? "公开只读" : "";
  status.hidden = canEdit && !current2.error && !unresolved2;
  paintRetainedDrafts(root, current2, drafts);
}

// web/daily-notes-controller.mjs
var notesStore, entryStore, notesIdentity = "", notesEventsRegistered = false, notesConfirmDate = "", notesConfirmEntry = "", notesActiveCategory = "", notesRefreshPaused = false, notesDraftError = "", notesDraftRevision = 0;
var notesView = "today", historyMonth = "", historyDate = "", historyDays = /* @__PURE__ */ new Map(), historySequence = 0;
var historyActiveLoad = null;
var notesSelectedLabel = "生活", notesLabels = [], notesLabelIntent = null, notesLabelBusy = false, notesLabelMessage = "";
var notesStores = /* @__PURE__ */ new Map(), entryStores = /* @__PURE__ */ new Map(), editorViews = createNotesEditorView();
var notesIdentityNow = () => JSON.stringify([
  runtime.sessionEpoch,
  state.me?.id || "",
  state.me?.publicBusiness === true,
  getOfflineRuntime()?.state.scope || ""
]);
var notesVisible = () => state.page === "notes" && notesIdentity === notesIdentityNow();
var draftFields = [
  "id",
  "date",
  "draft",
  "version",
  "serverText",
  "contentHash",
  "label",
  "labelKnown",
  "createdAt",
  "updatedAt",
  "dirty",
  "phase",
  "pending",
  "remote",
  "localVersion",
  "durableText",
  "localBacked",
  "localQueued",
  "recoveredBaseline"
];
var hydratedDrafts = /* @__PURE__ */ new WeakMap();
var hydrationReady = /* @__PURE__ */ new WeakSet();
var entryIdentities = /* @__PURE__ */ new WeakMap();
var sendFeedbackTimers = /* @__PURE__ */ new WeakMap();
function scheduleSendFeedback(entries, expected) {
  for (const item of entries.entries.values()) {
    if (!item.manualSubmitted || item.phase !== "saved" || item.dirty || item.pending || sendFeedbackTimers.has(item)) continue;
    const attempt = item.manualSubmitted;
    const timer = setTimeout(() => {
      sendFeedbackTimers.delete(item);
      if (expected !== notesIdentityNow() || item.manualSubmitted !== attempt) return;
      item.manualSubmitted = null;
      paintDailyNotesPage();
    }, 2500);
    sendFeedbackTimers.set(item, timer);
  }
}
function captureNotesDrafts(legacy, entries, category) {
  const offline = getOfflineRuntime();
  if (!offline || !hydrationReady.has(entries) || entryIdentities.get(entries) !== notesIdentityNow()) return;
  const rows = [];
  for (const [kind, values] of [["legacy", legacy.pages.values()], ["note_entry", entries.entries.values()]]) for (const item of values)
    rows.push({ kind, category, ...Object.fromEntries(draftFields.filter((key) => item[key] !== void 0).map((key) => [key, item[key]])) });
  return offline.retainDrafts(rows);
}
async function hydrateNotesDrafts(legacy, entries, category) {
  const offline = getOfflineRuntime(), expected = entryIdentities.get(entries);
  const active5 = () => expected === notesIdentityNow();
  if (!offline || !active5()) return;
  const seen = hydratedDrafts.get(entries) || /* @__PURE__ */ new Set();
  hydratedDrafts.set(entries, seen);
  const entryDrafts = await offline.retainedDrafts("note_entry");
  if (!active5()) return;
  for (const raw of entryDrafts) {
    if (raw.category !== category || seen.has(raw.id)) continue;
    entries.restoreDraft(raw);
    seen.add(raw.id);
  }
  const legacyDrafts = await offline.retainedDrafts("legacy");
  if (!active5()) return;
  for (const raw of legacyDrafts) {
    const key = "legacy:" + raw.date;
    if (raw.category !== category || seen.has(key)) continue;
    const item = legacy.page(raw.date);
    Object.assign(item, {
      draft: raw.draft,
      dirty: true,
      canEdit: false,
      phase: raw.phase || "error",
      pending: raw.pending || null,
      remote: raw.remote || null,
      error: "保留的原有草稿只读，可导出；不会自动上传。"
    });
    seen.add(key);
  }
  hydrationReady.add(entries);
  await captureNotesDrafts(legacy, entries, category);
  await showRetainedArchive();
}
async function archivedDrafts() {
  const offline = getOfflineRuntime();
  return offline ? [...await offline.retainedDrafts("legacy"), ...await offline.retainedDrafts("note_entry")] : [];
}
async function showRetainedArchive() {
  const expected = notesIdentityNow(), rows = await archivedDrafts(), root = document.querySelector("#daily-notes");
  if (!root || !notesVisible() || expected !== notesIdentityNow() || !rows.length) return;
  let box = root.querySelector("#notes-retained-archive");
  if (!box) {
    box = document.createElement("details");
    box.id = "notes-retained-archive";
    box.className = "notes-drafts";
    const summary = document.createElement("summary");
    box.append(summary);
    const button2 = document.createElement("button");
    button2.className = "btn text";
    button2.type = "button";
    button2.dataset.notesAction = "export-drafts";
    button2.textContent = "导出本机保留草稿";
    box.append(button2);
    const body2 = document.createElement("div");
    body2.className = "notes-retained-texts";
    box.append(body2);
    box.addEventListener("toggle", async () => {
      if (!box.open || expected !== notesIdentityNow()) return;
      const current2 = await archivedDrafts();
      if (expected !== notesIdentityNow()) return;
      body2.replaceChildren(...current2.map((row) => {
        const pre = document.createElement("pre");
        pre.textContent = `${row.kind === "legacy" ? "原有记录" : "条目"} · ${row.category === "work" ? "工作" : "生活"} · ${row.date}
${row.draft}`;
        return pre;
      }));
    });
    root.querySelector("#notes-drafts").after(box);
  }
  box.querySelector("summary").textContent = `本机保留草稿（${rows.length} 份，只读）`;
}
async function exportDraftArchive() {
  const expected = notesIdentityNow(), rows = await archivedDrafts();
  if (expected !== notesIdentityNow()) return;
  const text = JSON.stringify({ format: "haoduoyu-retained-drafts-v1", drafts: rows }, null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "好多鱼本机保留草稿.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function exportLegacyDraft(item, category) {
  const text = [
    "好多鱼原有记录草稿（只读保留）",
    "分类：" + (category === "work" ? "工作" : "生活"),
    "日期：" + item.date,
    "状态：" + item.phase,
    "原保存标识：" + (item.pending?.saveId || "无"),
    "",
    "当前草稿：",
    item.draft,
    ...item.pending?.text !== void 0 ? ["", "原未确认提交：", item.pending.text] : []
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "原有碎碎念草稿-" + category + "-" + item.date + ".txt";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}
function ensureDailyNotesStore(category = dailyNotesRouteCategory(), select = true) {
  const next = notesIdentityNow();
  if (notesIdentity !== next) {
    for (const store of [...notesStores.values(), ...entryStores.values()]) store.dispose();
    notesStores.clear();
    entryStores.clear();
    editorViews.clear();
    notesIdentity = next;
    notesConfirmDate = "";
    notesConfirmEntry = "";
    notesRefreshPaused = false;
    notesDraftError = "";
    notesDraftRevision++;
    notesView = "today";
    historyMonth = "";
    historyDate = "";
    historyDays = /* @__PURE__ */ new Map();
    historySequence++;
    historyActiveLoad = null;
    notesSelectedLabel = "生活";
    notesLabels = [];
    notesLabelIntent = null;
    notesLabelBusy = false;
    notesLabelMessage = "";
    notesActiveCategory = "";
  }
  if (select && notesActiveCategory !== category) {
    if (category === "work") notesSelectedLabel = "工作";
    else if (notesSelectedLabel === "工作") notesSelectedLabel = "生活";
    notesActiveCategory = category;
    notesConfirmDate = "";
    notesConfirmEntry = "";
  }
  if (!notesStores.has(category)) {
    const expected = next;
    const active5 = () => {
      if (notesIdentityNow() !== expected) {
        legacy.dispose();
        entries.dispose();
        throw new DOMException("请求已取消", "AbortError");
      }
    };
    const request = async (path, options2) => {
      active5();
      const value = await api(path, options2);
      active5();
      return value;
    };
    const noteRequest = (path, options2 = {}) => request(path, {
      ...options2,
      headers: { ...options2.headers, "X-Note-Labels-Version": "1" }
    });
    const suffix = (separator) => category === "work" ? separator + "category=work" : "";
    const changed4 = () => {
      if (expected !== notesIdentityNow()) return;
      scheduleSendFeedback(entries, expected);
      const revision2 = ++notesDraftRevision, saved = captureNotesDrafts(legacy, entries, category);
      if (!getOfflineRuntime()?.state.scope && [...entries.entries.values()].some((item) => item.dirty)) {
        notesDraftError = "本机草稿保存不可用，请保持页面打开或发送后再离开。";
      }
      if (saved) void saved.then(() => {
        if (expected !== notesIdentityNow() || revision2 !== notesDraftRevision || !notesDraftError || !getOfflineRuntime()?.state.scope) return;
        notesDraftError = "";
        paintDailyNotesPage();
      }).catch(() => {
        if (expected !== notesIdentityNow() || revision2 !== notesDraftRevision) return;
        notesDraftError = "草稿未能保存在本机，请保持页面打开并检查存储空间。";
        paintDailyNotesPage();
      });
      paintDailyNotesPage();
    };
    const readOnly = async () => {
      throw Object.assign(new Error("原有逐日记录只读，草稿可导出。"), { code: "LEGACY_READ_ONLY" });
    };
    const legacy = createDailyNotesStore({
      delay: 400,
      load: async (date) => ({ ...await request("/daily-notes?date=" + encodeURIComponent(date) + suffix("&")), can_edit: false }),
      put: readOnly,
      restore: readOnly,
      remove: readOnly,
      onChange: changed4,
      onSaved: changed4
    });
    const entries = createNoteEntriesStore({
      category,
      manualSave: true,
      load: (date, options2) => options2?.localOnly ? getOfflineRuntime().localRead("/note-entries?category=" + category + "&date=" + date) : noteRequest("/note-entries?category=" + category + "&date=" + encodeURIComponent(date)),
      loadEntry: (id, options2) => options2?.localOnly ? getOfflineRuntime().localRead("/note-entries/" + id) : noteRequest("/note-entries/" + encodeURIComponent(id)),
      loadOperation: (id) => noteRequest("/note-entries/operations/" + encodeURIComponent(id)),
      put: (id, body2, options2) => noteRequest("/note-entries/" + encodeURIComponent(id), { ...options2, method: "PUT", body: body2 }),
      remove: (id, body2, options2) => noteRequest("/note-entries/" + encodeURIComponent(id), { ...options2, method: "DELETE", body: body2 }),
      restore: (id, body2, options2) => noteRequest("/note-entries/" + encodeURIComponent(id) + "/restore", { ...options2, method: "POST", body: body2 }),
      onChange: changed4,
      onSaved: changed4
    });
    entryIdentities.set(entries, expected);
    notesStores.set(category, legacy);
    entryStores.set(category, entries);
  }
  if (select) {
    notesStore = notesStores.get(category);
    entryStore = entryStores.get(category);
  }
  return notesStores.get(category);
}
async function readMixedNotes(date) {
  const expected = notesIdentityNow();
  ensureDailyNotesStore();
  for (const category of ["life", "work"]) ensureDailyNotesStore(category, false);
  const pairs = ["life", "work"].map((category) => ({ category, legacy: notesStores.get(category), entries: entryStores.get(category) }));
  await Promise.all(pairs.flatMap(({ legacy, entries }) => [legacy.read(date), entries.read(date)]));
  if (expected !== notesIdentityNow()) return;
  await Promise.all(pairs.map(({ category, legacy, entries }) => hydrateNotesDrafts(legacy, entries, category)));
  if (expected === notesIdentityNow() && date === dailyNotesRouteDate()) paintDailyNotesPage();
}
function retainedDrafts() {
  const result = [];
  for (const [category, store] of notesStores) for (const item of store.pages.values()) {
    if (item.dirty || item.pending || ["unknown", "conflict", "oversize", "error"].includes(item.phase)) result.push({ category, ...item });
  }
  for (const [category, store] of entryStores) for (const item of store.entries.values()) {
    if (item.dirty || item.pending || ["unknown", "conflict", "oversize", "error"].includes(item.phase)) result.push({ category, ...item });
  }
  return result;
}
function paintDailyNotesPage() {
  if (!notesVisible() || notesRefreshPaused) return;
  const root = document.querySelector("#daily-notes");
  if (!root || !notesStore || !entryStore) return;
  root.querySelector("#notes-today").hidden = notesView !== "today";
  root.querySelector("#notes-history").hidden = notesView !== "history";
  for (const button2 of root.querySelectorAll("[data-notes-view]"))
    button2.setAttribute("aria-pressed", String(button2.dataset.notesView === notesView));
  const date = dailyNotesRouteDate(), category = dailyNotesRouteCategory(), legacy = notesStore.page(date), current2 = entryStore.page(date);
  const labelSelect = root.querySelector("#notes-compose-label"), labelValues = ["生活", "工作", ...notesLabels];
  if (!labelValues.includes(notesSelectedLabel)) labelValues.push(notesSelectedLabel);
  if (JSON.stringify([...labelSelect.options].map((option) => option.value)) !== JSON.stringify(labelValues)) {
    labelSelect.replaceChildren(...labelValues.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      return option;
    }));
  }
  labelSelect.value = notesSelectedLabel;
  root.querySelector("#notes-label-status").textContent = notesLabelMessage;
  root.querySelector('[data-notes-action="create-label"]').disabled = notesLabelBusy;
  const otherCategory = category === "life" ? "work" : "life";
  const otherStore = entryStores.get(otherCategory), otherLegacy = notesStores.get(otherCategory)?.page(date);
  const otherPage = otherStore?.page(date);
  const mixedStore = { entry: (id) => entryStore.entry(id) || otherStore?.entry(id) };
  const mixed = {
    ...current2,
    ids: [...current2.ids, ...otherPage?.ids || []],
    error: [
      current2.error,
      otherPage?.error && (otherCategory === "work" ? "工作：" : "生活：") + otherPage.error,
      legacy.error && (category === "work" ? "工作原记录：" : "生活原记录：") + legacy.error,
      otherLegacy?.error && (otherCategory === "work" ? "工作原记录：" : "生活原记录：") + otherLegacy.error
    ].filter(Boolean).join("；"),
    loading: current2.loading || Boolean(otherPage?.loading) || legacy.loading || Boolean(otherLegacy?.loading),
    allLoaded: current2.loaded && Boolean(otherPage?.loaded) && legacy.loaded && Boolean(otherLegacy?.loaded) && !current2.error && !otherPage?.error && !legacy.error && !otherLegacy?.error
  };
  mixed.ids.sort((a, b) => {
    const first = mixedStore.entry(a), second = mixedStore.entry(b);
    return String(first?.createdAt || first?.localCreatedAt || "").localeCompare(String(second?.createdAt || second?.localCreatedAt || "")) || a.localeCompare(b);
  });
  const host = root.querySelector("#notes-composer"), view = editorViews.page(category, date), active5 = view.active;
  const field2 = active5 === "legacy" ? root.querySelector("#notes-editor") : host.querySelector('[data-note-entry-editor="' + active5 + '"]');
  const selected = editorViews.sync(
    category,
    date,
    mixed.ids.map((id) => mixedStore.entry(id)).filter(Boolean),
    legacy,
    { focused: host.contains(document.activeElement), composing: field2?.dataset.composing === "true" }
  );
  paintNoteEntries(
    root,
    mixedStore,
    mixed,
    legacy,
    { drafts: retainedDrafts(), confirmId: notesConfirmEntry, active: selected.active, otherLegacy, otherCategory }
  );
  if (notesDraftError) {
    const message = root.querySelector("#notes-entry-message");
    message.textContent = notesDraftError;
    message.hidden = false;
  }
  if (mixed.ids.some((id) => mixedStore.entry(id)?.category === "life" && !mixedStore.entry(id)?.labelKnown)) {
    const message = root.querySelector("#notes-entry-message");
    if (message.hidden) {
      message.textContent = "部分记录标签尚未核实，请联网读取后查看。";
      message.hidden = false;
    }
  }
  root.querySelector("#notes-delete-confirm").hidden = true;
}
async function readNoteLabels() {
  const expected = notesIdentityNow();
  try {
    const data = await apiNetwork("/note-entries/labels", { headers: { "X-Note-Labels-Version": "1" } });
    if (expected !== notesIdentityNow() || data?.labels_version !== 1 || !Array.isArray(data?.labels) || data.labels.some((row) => !validCustomNoteLabel(row?.name))) throw new Error("标签列表未核实。");
    notesLabels = [...new Set(data.labels.map((row) => row.name))];
    notesLabelMessage = "";
  } catch (error) {
    if (expected !== notesIdentityNow()) return;
    notesLabelMessage = "标签需联网核实：" + (error.message || "请稍后重试。");
  }
  paintDailyNotesPage();
}
async function createNoteLabel(root) {
  if (notesLabelBusy) return;
  const input = root.querySelector("#notes-new-label"), label3 = input.value.trim().normalize("NFC");
  if (!validCustomNoteLabel(label3)) {
    notesLabelMessage = "标签须为 1–32 个字符，且不能叫生活或工作。";
    paintDailyNotesPage();
    return;
  }
  if (!notesLabelIntent || notesLabelIntent.name !== label3) notesLabelIntent = { name: label3, save_id: crypto.randomUUID() };
  const expected = notesIdentityNow(), intent = notesLabelIntent;
  notesLabelBusy = true;
  notesLabelMessage = "正在添加标签…";
  paintDailyNotesPage();
  try {
    const saved = await apiNetwork("/note-entries/labels", { method: "POST", body: intent, headers: { "X-Note-Labels-Version": "1" } });
    if (expected !== notesIdentityNow()) return;
    if (saved?.labels_version !== 1 || saved.name !== label3) throw new Error("标签保存结果尚未核实，请重试原请求。");
    notesLabels = [.../* @__PURE__ */ new Set([...notesLabels, label3])];
    notesSelectedLabel = label3;
    notesLabelIntent = null;
    notesLabelMessage = "标签已添加";
    input.value = "";
    setDailyNotesRouteCategory("life");
    updateRoute(true);
    renderShell();
  } catch (error) {
    if (expected === notesIdentityNow()) notesLabelMessage = "添加失败，输入已保留，可重试：" + (error.message || "请联网后重试。");
  } finally {
    notesLabelBusy = false;
    if (expected === notesIdentityNow()) paintDailyNotesPage();
  }
}
function monthTime(value) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "";
}
function monthOptions(select, values, current2, allLabel) {
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || allLabel;
    return option;
  }));
  select.value = values.includes(current2) ? current2 : "";
}
function makeMonthCard(date, items, selected) {
  const button2 = document.createElement("button");
  button2.type = "button";
  button2.className = "notes-calendar-day";
  if (!date) {
    button2.disabled = true;
    button2.classList.add("is-empty");
    return button2;
  }
  button2.dataset.notesHistoryDay = date;
  button2.setAttribute("aria-pressed", String(date === selected));
  button2.setAttribute("aria-label", date + "，" + items.length + " 条记录");
  const heading = document.createElement("span");
  heading.className = "notes-calendar-day-heading";
  heading.textContent = String(Number(date.slice(8)));
  button2.append(heading);
  return button2;
}
function paintHistoryRows(root) {
  const label3 = root.querySelector("#notes-history-label").value, weekValue = root.querySelector("#notes-history-week").value;
  const weeks = noteMonthWeeks(historyMonth), selected = root.querySelector("#notes-history-date").value;
  historyDate = selected;
  const grid = root.querySelector("#notes-history-grid"), list = root.querySelector("#notes-history-list");
  const shown = (item) => !label3 || item.displayLabel === label3;
  const visibleWeeks = weeks.filter((_, index) => !weekValue || Number(weekValue) === index + 1);
  grid.replaceChildren(...visibleWeeks.flatMap((week) => week.map((date) => makeMonthCard(date, (historyDays.get(date) || []).filter(shown), selected))));
  const timeline = root.dataset.historyDisplay === "timeline";
  root.querySelector(".notes-calendar-weekdays").hidden = timeline;
  grid.hidden = timeline;
  const rows = timeline ? [...historyDays.entries()].sort(([a], [b]) => b.localeCompare(a)).flatMap(([date, items]) => items.filter(shown).map((item) => ({ ...item, timelineDate: date }))) : (historyDays.get(selected) || []).filter(shown);
  list.replaceChildren(...rows.map((row) => {
    const article = document.createElement("article");
    article.className = "note-entry note-entry-saved";
    const heading = document.createElement("div");
    heading.className = "note-entry-head";
    heading.textContent = [row.timelineDate, row.displayLabel, monthTime(row.updated_at)].filter(Boolean).join(" · ");
    const text = document.createElement("div");
    text.className = "note-entry-reader";
    text.textContent = row.text;
    article.append(heading, text);
    return article;
  }));
  const total = [...historyDays.values()].flat().filter(shown).length;
  root.querySelector("#notes-history-summary").textContent = historyMonth + " · " + total + " 条已同步记录";
  root.querySelector("#notes-history-status").textContent = rows.length ? "待同步内容请在原日期查看。" : !total && !label3 ? "本月没有已同步记录。" : "所选日期没有符合条件的已同步记录。";
}
function applyHistoryMonth(root, month, days, chosenDate) {
  const weeks = noteMonthWeeks(month), dates = weeks.flat().filter(Boolean);
  const dateSelect = root.querySelector("#notes-history-date"), labelSelect = root.querySelector("#notes-history-label");
  const oldLabel = labelSelect.value, oldDate = dateSelect.value;
  const selected = dates.includes(chosenDate) ? chosenDate : dates.includes(oldDate) ? oldDate : dates[0];
  historyMonth = month;
  historyDays = days;
  root.dataset.historyLoadedMonth = month;
  root.querySelector("#notes-history-month").value = month;
  monthOptions(dateSelect, dates, selected, "");
  monthOptions(root.querySelector("#notes-history-week"), ["", ...weeks.map((_, index) => String(index + 1))], "", "全部周次");
  const labels = ["", .../* @__PURE__ */ new Set(["生活", "工作", ...[...days.values()].flat().map((row) => row.displayLabel)])];
  monthOptions(labelSelect, labels, oldLabel, "全部标签");
  paintHistoryRows(root);
}
async function loadHistory(month = "", chosenDate = "") {
  const root = document.querySelector("#daily-notes"), expected = notesIdentityNow();
  if (!root) return;
  const target = month || historyMonth || dailyNotesToday().slice(0, 7);
  if (coalesceNoteMonthFlight(historyActiveLoad, { root, target, expected, sequence: historySequence, chosenDate })) return;
  const sequence2 = ++historySequence;
  historyActiveLoad = { root, target, expected, sequence: sequence2, chosenDate };
  const active5 = () => notesVisible() && notesView === "history" && sequence2 === historySequence && expected === notesIdentityNow();
  const status = root.querySelector("#notes-history-status");
  status.textContent = "";
  try {
    const value = await apiNetwork(
      "/note-entries/month?month=" + encodeURIComponent(target),
      { headers: { "X-Note-Labels-Version": "1" } }
    );
    const days = checkedNoteMonth(value, target);
    if (!active5()) return;
    applyHistoryMonth(root, target, days, historyActiveLoad.chosenDate || historyDate || dailyNotesRouteDate());
  } catch (error) {
    if (!active5()) return;
    status.textContent = "月记录读取失败，保留当前内容：" + (error.message || "请联网重试。");
    if (historyMonth) root.querySelector("#notes-history-month").value = historyMonth;
  } finally {
    if (historyActiveLoad?.sequence === sequence2) historyActiveLoad = null;
  }
}
async function selectDailyNotesDate(value) {
  if (!validDailyNotesDate(value) || value > dailyNotesToday()) return;
  ensureDailyNotesStore();
  notesConfirmDate = "";
  notesConfirmEntry = "";
  setDailyNotesRouteDate(value);
  updateRoute(true);
  paintDailyNotesPage();
  await readMixedNotes(value);
}
function shiftedNotesDate(date, delta) {
  return new Date(Date.parse(date + "T12:00:00Z") + delta * 864e5).toISOString().slice(0, 10);
}
function openEditor(key) {
  editorViews.activate(dailyNotesRouteCategory(), dailyNotesRouteDate(), key);
  paintDailyNotesPage();
  const editor = key === "legacy" ? document.querySelector("#notes-editor") : document.querySelector('#notes-active-entry [data-note-entry-editor="' + key + '"]');
  editor?.focus();
  document.querySelector("#notes-composer")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
}
function requestEditorCollapse(event) {
  if (!notesVisible() || notesRefreshPaused || !event.target.closest("#notes-composer")) return;
  const root = document.querySelector("#daily-notes"), host = root?.querySelector("#notes-composer");
  if (!host || host.contains(event.relatedTarget) || event.relatedTarget?.closest(
    '[data-note-entry-action="edit"],[data-notes-action="new"],[data-notes-action="edit-legacy"]'
  )) return;
  const category = root.dataset.category, date = root.dataset.date, { active: active5, revision: revision2 } = editorViews.page(category, date);
  setTimeout(() => {
    editorViews.requestCollapse(category, date, active5, revision2);
    if (notesVisible() && category === dailyNotesRouteCategory() && date === dailyNotesRouteDate()) paintDailyNotesPage();
  }, 0);
}
function registerNotesInputEvents() {
  document.addEventListener("input", (event) => {
    if (!notesVisible()) return;
    const composing = event.isComposing || event.target.dataset.composing === "true";
    if (event.target.id === "notes-editor") notesStores.get(event.target.dataset.category)?.edit(event.target.dataset.date, event.target.value, { composing });
    else if (event.target.dataset.noteEntryEditor) {
      entryStores.get(event.target.dataset.category)?.edit(event.target.dataset.noteEntryEditor, event.target.value, { composing });
    }
  });
  document.addEventListener("compositionstart", (event) => {
    if (notesVisible() && (event.target.id === "notes-editor" || event.target.dataset.noteEntryEditor)) event.target.dataset.composing = "true";
  });
  document.addEventListener("compositionend", (event) => {
    if (event.target.id !== "notes-editor" && !event.target.dataset.noteEntryEditor) return;
    event.target.dataset.composing = "false";
    if (!notesVisible()) return;
    if (event.target.id === "notes-editor") notesStores.get(event.target.dataset.category)?.edit(event.target.dataset.date, event.target.value);
    else entryStores.get(event.target.dataset.category)?.edit(event.target.dataset.noteEntryEditor, event.target.value);
  });
  document.addEventListener("change", (event) => {
    if (notesVisible() && event.target.id === "notes-date") void selectDailyNotesDate(event.target.value);
    else if (notesVisible() && event.target.id === "notes-history-date") {
      const root = event.target.closest("#daily-notes"), week = root.querySelector("#notes-history-week");
      if (week.value && !noteMonthWeeks(historyMonth)[Number(week.value) - 1]?.includes(event.target.value)) week.value = "";
      paintHistoryRows(root);
    } else if (notesVisible() && event.target.id === "notes-history-week") {
      const root = event.target.closest("#daily-notes"), week = Number(event.target.value);
      const date = root.querySelector("#notes-history-date"), dates = noteMonthWeeks(historyMonth)[week - 1];
      if (dates && !dates.includes(date.value)) date.value = dates.find(Boolean);
      paintHistoryRows(root);
    } else if (notesVisible() && event.target.id === "notes-history-label") paintHistoryRows(event.target.closest("#daily-notes"));
    else if (notesVisible() && event.target.id === "notes-history-month" && validNoteMonth(event.target.value)) void loadHistory(event.target.value);
    else if (notesVisible() && event.target.id === "notes-compose-label") {
      notesSelectedLabel = event.target.value;
      const category = notesSelectedLabel === "工作" ? "work" : "life";
      if (category !== dailyNotesRouteCategory()) {
        setDailyNotesRouteCategory(category);
        updateRoute(true);
        renderShell();
      } else paintDailyNotesPage();
    }
  });
  document.addEventListener("focusout", requestEditorCollapse);
}
async function handleEntryAction(target, entries) {
  const id = target.closest("[data-note-entry]")?.dataset.noteEntry, item = entries.entry(id);
  if (!item) return;
  const action = target.dataset.noteEntryAction;
  if (action === "edit") openEditor(id);
  else if (action === "save") {
    const attempt = /* @__PURE__ */ Symbol("note-send");
    item.manualSubmitted = attempt;
    await entries.save(id);
    paintDailyNotesPage();
  } else if (action === "restore") await entries.restoreEntry(id);
  else if (action === "delete") {
    notesConfirmEntry = id;
    paintDailyNotesPage();
  } else if (action === "cancel-delete") {
    notesConfirmEntry = "";
    paintDailyNotesPage();
  } else if (action === "confirm-delete") {
    notesConfirmEntry = "";
    await entries.deleteEntry(id);
    paintDailyNotesPage();
  } else if (action === "check") {
    if (item.phase === "unknown") await entries.reconcile(id);
    else await entries.readOne(id);
  } else if (action === "retry") await entries.retryPending(id);
  else if (action === "use-server") entries.useServer(id);
  else if (action === "use-draft") await entries.useDraft(id);
}
async function handleNotesClick(event) {
  if (!notesVisible() || notesRefreshPaused) return;
  const root = document.querySelector("#daily-notes");
  const target = event.target.closest("[data-notes-action],[data-notes-date],[data-notes-category],[data-note-entry-action],[data-notes-view],[data-notes-month],[data-notes-history-day],[data-history-display]");
  if (!target || !root?.contains(target)) return;
  event.preventDefault();
  if (target.dataset.historyDisplay) {
    root.dataset.historyDisplay = target.dataset.historyDisplay;
    for (const button2 of root.querySelectorAll("[data-history-display]")) button2.setAttribute("aria-pressed", String(button2 === target));
    if (historyMonth) paintHistoryRows(root);
    return;
  }
  if (target.dataset.notesMonth) {
    const month = historyMonth || dailyNotesToday().slice(0, 7);
    await loadHistory(shiftNoteMonth(month, target.dataset.notesMonth === "prev" ? -1 : 1));
    return;
  }
  if (target.dataset.notesHistoryDay) {
    root.querySelector("#notes-history-date").value = target.dataset.notesHistoryDay;
    paintHistoryRows(root);
    return;
  }
  if (target.dataset.notesView) {
    notesView = target.dataset.notesView === "history" ? "history" : "today";
    historySequence++;
    paintDailyNotesPage();
    if (notesView === "history") await loadHistory();
    return;
  }
  if (target.dataset.notesCategory) {
    notesSelectedLabel = target.dataset.notesCategory === "work" ? "工作" : "生活";
    setDailyNotesRouteCategory(target.dataset.notesCategory);
    updateRoute(true);
    renderShell();
    return;
  }
  if (target.dataset.notesDate) {
    if (target.dataset.notesDraftCategory && target.dataset.notesDraftCategory !== dailyNotesRouteCategory()) {
      notesSelectedLabel = target.dataset.notesDraftCategory === "work" ? "工作" : "生活";
      setDailyNotesRouteCategory(target.dataset.notesDraftCategory);
      setDailyNotesRouteDate(target.dataset.notesDate);
      updateRoute(true);
      renderShell();
    } else await selectDailyNotesDate(target.dataset.notesDate);
    return;
  }
  const store = ensureDailyNotesStore(), entries = entryStore, date = dailyNotesRouteDate();
  if (target.dataset.noteEntryAction) {
    const id = target.closest("[data-note-entry]")?.dataset.noteEntry;
    const owner2 = [...entryStores.values()].find((candidate) => candidate.entry(id));
    if (owner2) await handleEntryAction(target, owner2);
    return;
  }
  if (target.dataset.notesAction === "edit-other-legacy") {
    const category = target.dataset.legacyCategory;
    if (!["life", "work"].includes(category)) return;
    notesSelectedLabel = category === "work" ? "工作" : "生活";
    setDailyNotesRouteCategory(category);
    updateRoute(true);
    ensureDailyNotesStore();
    root.dataset.category = category;
    openEditor("legacy");
    return;
  }
  if (target.dataset.notesAction === "export-other-legacy") {
    const category = target.dataset.legacyCategory;
    if (["life", "work"].includes(category)) exportLegacyDraft(notesStores.get(category).page(date), category);
    return;
  }
  const action = target.dataset.notesAction;
  if (action === "new") {
    const label3 = ["生活", "工作"].includes(notesSelectedLabel) ? "" : notesSelectedLabel;
    const item = entries.start(date, { label: label3 });
    if (item) openEditor(item.id);
  } else if (action === "create-label") await createNoteLabel(root);
  else if (action === "edit-legacy") openEditor("legacy");
  else if (action === "collapse") {
    const { active: active5, revision: revision2 } = editorViews.page(dailyNotesRouteCategory(), date);
    editorViews.requestCollapse(dailyNotesRouteCategory(), date, active5, revision2, { explicit: true });
    paintDailyNotesPage();
  } else if (action === "previous" || action === "next") await selectDailyNotesDate(shiftedNotesDate(date, action === "previous" ? -1 : 1));
  else if (action === "login") renderLogin();
  else if (action === "today") await selectDailyNotesDate(dailyNotesToday());
  else if (action === "export-legacy") exportLegacyDraft(store.page(date), dailyNotesRouteCategory());
  else if (action === "export-drafts") await exportDraftArchive();
}
function registerDailyNotesEvents() {
  if (notesEventsRegistered) return;
  notesEventsRegistered = true;
  registerNotesInputEvents();
  registerConflictDraftGuard(createNoteConflictDraftGuard({
    getStores: () => entryStores,
    getIdentity: notesIdentityNow,
    getComposing: (id) => document.querySelector('[data-note-entry-editor="' + id + '"]')?.dataset.composing === "true"
  }));
  window.addEventListener("haoduoyu:before-refresh", (event) => {
    if (typeof event.detail?.waitUntil !== "function" || notesIdentity !== notesIdentityNow()) return;
    const resumes = [], expected = notesIdentityNow(), root = document.querySelector("#daily-notes");
    const controls = [...root?.querySelectorAll("button,input,select") || []].map((control) => [control, control.disabled]);
    const field2 = root?.querySelector("#notes-active-entry textarea"), readOnly = field2?.readOnly;
    const wasInert = root?.inert;
    notesRefreshPaused = true;
    if (root) root.inert = true;
    for (const [control] of controls) control.disabled = true;
    if (field2) field2.readOnly = true;
    event.detail.onFailure?.(() => {
      for (const resume of resumes) resume();
      if (expected !== notesIdentityNow()) return;
      notesRefreshPaused = false;
      if (root) root.inert = wasInert;
      for (const [control, disabled] of controls) control.disabled = disabled;
      if (field2) field2.readOnly = readOnly;
      paintDailyNotesPage();
    });
    try {
      for (const store of entryStores.values()) resumes.push(store.pauseAutosave());
      if (field2) entryStores.get(field2.dataset.category)?.edit(
        field2.dataset.noteEntryEditor,
        field2.value,
        { composing: field2.dataset.composing === "true" }
      );
      const offline = getOfflineRuntime();
      const writes = [...notesStores.keys()].map((category) => captureNotesDrafts(notesStores.get(category), entryStores.get(category), category));
      event.detail.waitUntil(Promise.allSettled(writes).then((results) => {
        const failed = results.find((result) => result.status === "rejected");
        if (failed) throw failed.reason;
        return offline?.flushDrafts();
      }).then(() => {
        if (expected !== notesIdentityNow()) throw new Error("REFRESH_IDENTITY_CHANGED");
      }));
    } catch (error) {
      event.detail.waitUntil(Promise.reject(error));
    }
  });
  onOfflineRuntime((offline) => {
    let signature = "";
    offline.subscribe((value) => {
      const next = JSON.stringify([value.pending, value.conflicts, value.lastSuccess, value.phase]);
      if (next === signature || value.phase === "syncing") return;
      signature = next;
      if (notesVisible()) {
        for (const entries of entryStores.values())
          if (hydrationReady.has(entries)) void entries.read(dailyNotesRouteDate(), { localOnly: true });
      }
    });
  });
  document.addEventListener("click", (event) => {
    void handleNotesClick(event);
  });
  window.addEventListener("beforeunload", (event) => {
    if (notesIdentity !== notesIdentityNow() || !notesStore) return;
    if (retainedDrafts().some((item) => item.dirty || item.pending || item.phase === "unknown")) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
async function loadDailyNotes() {
  registerDailyNotesEvents();
  setDailyNotesRouteDate(dailyNotesRouteDate());
  ensureDailyNotesStore();
  const date = dailyNotesRouteDate(), expected = notesIdentityNow();
  await readMixedNotes(date);
  if (expected !== notesIdentityNow()) return;
  void readNoteLabels();
  const historyRoot = document.querySelector("#daily-notes");
  if (notesView === "history" && (!historyMonth || historyRoot?.dataset.historyLoadedMonth !== historyMonth))
    void loadHistory(historyMonth, historyDate);
}

// web/pages/memos.mjs
var button = (action, label3, extra = "") => '<button type="button" class="btn" data-memo-action="' + action + '" ' + extra + ">" + label3 + "</button>";
function renderMemos() {
  return '<section id="memos" data-pane="groups" aria-label="长期备忘录"><div class="memo-toolbar"><div class="memo-mobile-back">' + button("back-notes", "‹ 返回笔记") + '</div><span id="memo-status" role="status" aria-live="polite"></span><div class="memo-toolbar-actions">' + button("exit-trash", "‹ 返回工作台设置", "hidden") + button("login", "所有者登录", "hidden") + '</div></div><p id="memo-error" class="memo-message" role="alert" hidden></p><div id="memo-operation" class="memo-message" hidden><p id="memo-operation-text" role="status"></p>' + button("operation-check", "核对操作结果") + button("operation-retry", "重试同一操作", "hidden") + '</div><div id="memo-drafts" class="memo-drafts" hidden></div><section id="memo-recovery" class="memo-recovery" aria-label="找回本机草稿" hidden><div class="memo-panel-head"><h2>找回本机草稿</h2>' + button("close-recovery", "关闭") + '</div><p id="memo-recovery-status" role="status"></p><div id="memo-recovery-list"></div><div id="memo-recovery-detail" hidden><p id="memo-recovery-selected"></p><label for="memo-recovery-copy">草稿文字（可选中复制）</label><textarea id="memo-recovery-copy" readonly></textarea>' + button("restore-draft", "恢复此草稿并核对") + '</div></section><section id="memo-dialog" class="memo-dialog" aria-labelledby="memo-dialog-heading" hidden><h3 id="memo-dialog-heading"></h3><p id="memo-dialog-description"></p><label id="memo-dialog-label" for="memo-dialog-title">名称</label><input id="memo-dialog-title" class="input" maxlength="120" autocomplete="off"><div class="memo-dialog-actions">' + button("cancel", "取消") + button("confirm", "确认") + '</div></section><div class="memo-layout"><aside class="memo-library" aria-label="备忘录目录"><div class="memo-panel-head"><h2 id="memo-groups-heading">目录</h2>' + button("new-note", "＋", 'hidden aria-label="新建笔记"') + '</div><div id="memo-group-list" class="memo-list"></div></aside><div id="memo-resizer" class="memo-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整笔记列表宽度" aria-controls="memo-group-list memo-document" aria-valuemin="160" aria-valuemax="480" aria-valuenow="240" title="拖动调整列表与正文比例；方向键微调，Home / End 到边界"></div><article class="memo-editor" aria-label="笔记内容"><p id="memo-empty" class="memo-empty">选择一篇笔记，长期记录常用信息。</p><div id="memo-document" hidden><div class="memo-document-heading"><div class="memo-heading-title"><label for="memo-title" class="sr-only">笔记标题</label><input id="memo-title" class="memo-title" maxlength="120" placeholder="笔记标题" autocomplete="off"><h2 id="memo-read-title" class="memo-read-title" hidden></h2><time id="memo-edited-at" class="memo-edited-at" hidden></time></div>' + button("fullscreen", '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" stroke-width="1.6"/></svg>', 'aria-label="放大正文" title="放大正文" aria-expanded="false"') + '</div><label for="memo-body" class="sr-only">笔记正文</label><textarea id="memo-body" class="memo-body" placeholder="写下需要长期记住的信息…"></textarea><div id="memo-read-body" class="memo-read-body" tabindex="0" hidden></div><div class="memo-document-footer"><span id="memo-detail"></span><div id="memo-note-actions" hidden><details class="memo-document-menu"><summary aria-label="笔记操作">⋯</summary><div class="memo-context-actions">' + button("save", "立即保存") + button("delete-note", "删除笔记") + button("restore-note", "恢复笔记", "hidden") + '</div></details></div></div><p id="memo-note-error" class="memo-message" role="alert" hidden></p><div id="memo-resolution" class="memo-resolution" hidden>' + button("check", "核对服务器结果") + button("retry", "重试同一保存", "hidden") + '<div id="memo-conflict" hidden><h3>服务器上的内容</h3><pre id="memo-remote"></pre>' + button("use-server", "采用服务器内容") + button("use-draft", "用此草稿保存到新版本") + '</div></div></div></article></div><dialog id="memo-fullscreen" aria-label="备忘录正文全屏"></dialog></section>';
}
var phases = {
  dirty: "等待自动保存",
  saving: "正在保存…",
  unknown: "保存结果待核对",
  conflict: "版本冲突 · 草稿已保留",
  queued: "已保存到本机 · 等待同步",
  offline: "离线 · 草稿保留在本机",
  error: "暂未保存 · 草稿已保留",
  oversize: "正文超过 64 KiB",
  loading: ""
};
var active4 = (rows, trash) => rows.filter((row) => Boolean(row.deleted_at) === trash);
function paintEditedTime(node, item) {
  const local = item.localQueued && item.localUpdatedAt;
  const value = local || item.updated_at;
  const timestamp4 = value && Date.parse(value);
  node.hidden = !Number.isFinite(timestamp4);
  node.dateTime = node.hidden ? "" : value;
  node.textContent = node.hidden ? "" : (local ? "本机编辑于 " : "编辑于 ") + new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(timestamp4);
}
function listButton(kind, row, current2, subtitle = "") {
  return '<button type="button" class="memo-list-item' + (row.id === current2 ? " is-selected" : "") + '" data-memo-' + kind + '="' + e(row.id) + '" aria-pressed="' + (row.id === current2) + '"><span>' + e(row.title) + "</span>" + (subtitle ? "<small>" + e(subtitle) + "</small>" : "") + "</button>";
}
function flatNoteRow(note, store) {
  const s = store.state, group = s.groups.find((row) => row.id === note.group_id);
  const deleted2 = Boolean(note.deleted_at || group?.deleted_at), extra = ' data-memo-target="' + e(note.id) + '"';
  const control = !s.canEdit ? "" : s.trash ? button("restore-note", "恢复", extra) : button("delete-note", "×", extra + ' aria-label="删除' + e(note.title) + '" title="移至回收站"');
  const removed4 = note.deleted_at || group?.deleted_at;
  const days = removed4 ? Math.max(0, 30 - Math.floor((Date.now() - Date.parse(removed4)) / 864e5)) : 0;
  const retention = s.trash ? '<small class="memo-retention">' + (days ? "30天恢复期 · 剩余" + days + "天" : "已归档 · 可恢复") + "</small>" : "";
  return '<div class="memo-flat-row">' + listButton("note", note, s.noteId) + control + retention + "</div>";
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
  box.hidden = store.state.trash || !store.state.canEdit || !drafts.length;
  box.innerHTML = "<span>本机保留的草稿：</span>" + drafts.map((item) => '<button type="button" class="btn text" data-memo-draft="' + e(item.id) + '">' + e(item.title || "未命名笔记") + "</button>").join("");
}
function paintDocument(root, store) {
  const s = store.state, item = store.drafts.get(s.noteId), find = (q) => root.querySelector(q);
  find("#memo-empty").hidden = Boolean(item);
  find("#memo-empty").textContent = s.trash ? "选择笔记查看" : "选择一篇笔记";
  find("#memo-document").hidden = !item;
  if (!item) return;
  const group = s.groups.find((row) => row.id === item.group_id), deleted2 = Boolean(item.deleted_at || group?.deleted_at);
  const editable = s.canEdit && !deleted2;
  const operation2 = s.operation?.pending;
  const structureBusy = operation2 && (operation2.kind === "notes" && operation2.id === item.id || operation2.kind === "groups" && operation2.id === item.group_id && operation2.method === "DELETE");
  for (const field2 of ["title", "body"]) {
    const input = find("#memo-" + field2);
    input.hidden = !editable;
    input.disabled = Boolean(structureBusy || item.loading || item.pending && item.pending.method !== "PUT");
    if (input.dataset.composing !== "true" && input.value !== item[field2]) input.value = item[field2] || "";
    find("#memo-read-" + field2).hidden = editable;
    find("#memo-read-" + field2).textContent = item[field2] || (field2 === "body" ? "这篇笔记还没有正文。" : "未命名笔记");
  }
  paintEditedTime(find("#memo-edited-at"), item);
  find("#memo-detail").textContent = deleted2 ? "已删除 · 可恢复" : s.canEdit ? "" : "公开只读";
  find("#memo-note-actions").hidden = !s.canEdit;
  find('[data-memo-action="save"]').hidden = deleted2;
  find('[data-memo-action="save"]').disabled = !item.dirty || Boolean(item.pending) || item.phase === "conflict";
  root.querySelector('#memo-note-actions [data-memo-action="delete-note"]').hidden = true;
  const restore = root.querySelector('#memo-note-actions [data-memo-action="restore-note"]');
  restore.hidden = !deleted2;
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
  const actual = phases[item?.phase] || "已保存", routine = ["dirty", "saving", "saved", "loading"].includes(item?.phase) || !item;
  find("#memo-status").textContent = s.loading ? "" : !s.canEdit ? "公开只读" : routine ? "自动保存" : actual;
  find("#memo-status").hidden = s.loading || s.trash || s.canEdit && routine;
  find("#memo-status").setAttribute("aria-label", actual);
  find("#memo-status").dataset.phase = item?.phase || "saved";
  find("#memo-error").hidden = !s.error && !s.storageError;
  find("#memo-error").textContent = [s.error, s.storageError].filter(Boolean).join(" ");
  find('[data-memo-action="login"]').hidden = s.canEdit || s.loading;
  if (!s.canEdit) find("#memo-recovery").hidden = true;
  find('[data-memo-action="exit-trash"]').hidden = !s.trash || root.closest(".workbench-settings") !== null;
  find('[data-memo-action="back-notes"]').hidden = s.pane !== "editor";
  const operation2 = s.operation;
  find("#memo-operation").hidden = !operation2?.error && operation2?.phase !== "unknown";
  find("#memo-operation-text").textContent = operation2?.error || (operation2?.phase === "saving" ? "正在保存操作…" : "操作结果待核对");
  find('[data-memo-action="operation-check"]').hidden = operation2?.phase !== "unknown";
  find('[data-memo-action="operation-retry"]').hidden = operation2?.phase !== "unknown" || !operation2?.retryReady;
  paintLists(root, store);
  paintDrafts(root, store);
  paintDocument(root, store);
}

// web/core/memos-local.mjs
var fields4 = ["group_id", "title", "body", "position"];
var changed2 = (a, b) => fields4.some((field2) => a[field2] !== b?.[field2]);
function memoLocalProtocol(context) {
  function reset(item, value) {
    item.localVersion = value.version;
    item.localQueued = false;
    item.localOperation = null;
    item.localConflict = null;
    item.durable = Object.fromEntries(fields4.map((field2) => [field2, value[field2]]));
  }
  function accept(item, value, pending = null) {
    const document2 = documentState(value);
    if (!document2) return false;
    const local = document2.local, server = document2.server;
    if (local.id !== item.id || !Number.isSafeInteger(local.version) || local.version < 1 || typeof local.body !== "string")
      throw new Error("本机保存记录不完整，原稿已保留。");
    const preserve = pending ? changed2(item, pending.snapshot || pending.body) : item.dirty;
    const concurrent = !pending && item.dirty && item.localVersion && item.localVersion !== local.version;
    if (!preserve) for (const field2 of fields4) item[field2] = local[field2];
    if (server && typeof server.body === "string") {
      item.server = { ...server };
      item.version = server.version;
      item.updated_at = server.updated_at;
    } else if (!item.server) item.version = 0;
    item.localVersion = local.version;
    item.localQueued = Boolean(document2.operation) || Boolean(document2.conflict);
    item.localOperation = document2.operation;
    item.localConflict = document2.conflict;
    item.localCreatedAt = local.created_at || null;
    item.localUpdatedAt = local.updated_at || null;
    item.durable = Object.fromEntries(fields4.map((field2) => [field2, local[field2]]));
    item.deleted_at = local.deleted_at || null;
    item.pending = null;
    item.writeEpoch++;
    item.dirty = changed2(item, local);
    item.phase = document2.conflict || concurrent ? "conflict" : item.dirty ? "dirty" : item.localQueued ? "queued" : "saved";
    item.remote = document2.conflict?.remote || (concurrent ? server : null);
    item.error = item.phase === "conflict" ? "两份内容已保留，请核对后处理。" : "";
    context.upsert("notes", { ...local, version: item.version, localVersion: item.localVersion, localQueued: item.localQueued });
    context.emit();
    context.schedule(item);
    return true;
  }
  function row(value) {
    if (!isLocalDocument(value)) return value;
    const data = documentState(value), local = documentValue(value);
    return {
      ...local,
      version: data.server?.version || 0,
      localVersion: local.version,
      localQueued: Boolean(data.operation) || Boolean(data.conflict),
      server: data.server
    };
  }
  function index(value) {
    return { ...value, groups: value.groups.map(row), notes: value.notes.map(row) };
  }
  return { accept, reset, row, index };
}

// web/core/memos-state.mjs
var MEMOS_MAX_BYTES = 65536;
var memoBytes = (value) => new TextEncoder().encode(value).length;
var idPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var cleanTitle = (value) => typeof value === "string" && value.trim() && [...value].length <= 120;
var noteFields = ["group_id", "title", "body", "position"];
var changed3 = (item, value) => noteFields.some((field2) => item[field2] !== value[field2]);
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
    localVersion: value.version,
    localQueued: false,
    localOperation: null,
    localConflict: null,
    durable: null,
    autosaveHeld: false,
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
  const item = {
    ...newDraft(raw),
    dirty: true,
    server: raw.server || null,
    remote: raw.remote || null,
    composing: false,
    autosaveHeld: true
  };
  item.pending = raw.pending ? { ...raw.pending, checking: false, retryReady: false } : null;
  item.phase = item.pending ? "unknown" : raw.phase === "conflict" ? "conflict" : "dirty";
  item.error = item.pending ? "上次保存结果待核对，草稿已保留。" : "已找回此浏览器保留的草稿。";
  return item;
}
function makeContext(options2) {
  const { request, ownerId = "", storage: storage2, onChange = () => {
  }, uuid: uuid5 = () => globalThis.crypto.randomUUID(), delay = 700 } = options2;
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
  const context = { state: state2, drafts: /* @__PURE__ */ new Map(), request, ownerId, storage: storage2, uuid: uuid5, delay, disposed: false, hydrated: false, loadSequence: 0 };
  context.draftScope = options2.draftScope || uuid5();
  context.restoreDraftScope = options2.restoreDraftScope;
  context.storagePersistent = options2.storagePersistent !== false && Boolean(options2.draftScope);
  context.online = options2.online || (() => globalThis.navigator?.onLine !== false);
  context.durable = options2.durable === true;
  context.readLocal = options2.readLocal;
  context.resolveLocal = options2.resolveLocal;
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
      group.active_note_count = state2.notes.filter((note) => note.group_id === group.id && !note.deleted_at && (note.version > 0 || note.localVersion > 0)).length;
  };
  context.schedule = (item) => {
    context.stop(item);
    if (!context.autosavePaused && !item.autosaveHeld && context.writable() && item.dirty && !item.loading && !item.composing && !isUncertain(item) && item.phase === "dirty")
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
  function persist({ verify = false } = {}) {
    if (!context.writable()) {
      if (verify) throw new Error("备忘录身份已变化，未更新页面。");
      return;
    }
    const drafts = [...context.drafts.values()].filter((item) => item.dirty || item.pending || item.phase === "conflict").slice(0, 200).map(({ timer, ...item }) => ({ ...item, loading: false }));
    try {
      if (!context.storage || verify && !context.storagePersistent) throw new Error("Draft storage unavailable");
      const value = JSON.stringify({ saved_at: (/* @__PURE__ */ new Date()).toISOString(), drafts, operation: context.state.operation });
      context.storage.setItem(key(), value);
      if (verify && context.storage.getItem(key()) !== value) throw new Error("Draft readback failed");
      context.state.storageError = context.storagePersistent ? "" : "浏览器无法记住此页签，刷新后可能无法找回草稿，请保持页面打开。";
    } catch {
      context.state.storageError = "浏览器无法保留草稿，请暂时保持此页面打开。";
      if (verify) throw new Error(context.state.storageError);
    }
  }
  function hydrate() {
    if (context.hydrated || !context.writable()) return;
    context.hydrated = true;
    try {
      const current2 = context.storage?.getItem(key());
      const saved = JSON.parse(current2 ?? (previousKey() ? context.storage?.getItem(previousKey()) : null) ?? "{}");
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
    const current2 = context.drafts.get(item.id);
    if (current2 && (current2.dirty || current2.pending)) {
      if (changed3(current2, item) || current2.version !== item.version || current2.pending?.body.save_id !== item.pending?.body.save_id) {
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
  return { persist, hydrate, recoverDraft, flushDrafts: async () => persist({ verify: true }) };
}
function acceptNote(context, item, value, pending) {
  const preserve = changed3(item, pending.snapshot || pending.body);
  if (!preserve) for (const field2 of noteFields) item[field2] = value[field2];
  item.server = { ...value };
  item.version = value.version;
  item.deleted_at = value.deleted_at;
  item.updated_at = value.updated_at;
  item.pending = null;
  item.remote = null;
  item.error = "";
  context.local.reset(item, value);
  item.dirty = changed3(item, value);
  item.phase = item.dirty ? "dirty" : "saved";
  item.writeEpoch++;
  context.upsert("notes", value);
  context.emit();
  context.schedule(item);
}
function memoReads2(context) {
  async function selectNote(id, { open = true, select = true, local = false } = {}) {
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
    if (item.version === 0 && item.dirty && !item.localQueued && item.phase !== "conflict" && !(context.durable && item.autosaveHeld)) {
      context.emit();
      return;
    }
    const reschedule = context.durable && (item.localQueued || Boolean(item.timer));
    const sequence2 = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true;
    context.emit();
    try {
      const raw = await (local && context.readLocal ? context.readLocal("/memos/notes/" + id) : context.request("/memos/notes/" + id));
      if (context.disposed || sequence2 !== item.sequence || epoch !== item.writeEpoch || item.pending) return;
      if (isLocalDocument(raw)) {
        context.local.accept(item, raw);
        return;
      }
      const value = checkedNote(raw, id);
      if (select && state2.noteId === id) state2.groupId = value.group_id;
      if (item.dirty && (item.localQueued ? item.localVersion : item.version) !== value.version || item.phase === "conflict") {
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
        item.dirty = changed3(item, value);
        item.phase = item.dirty ? "dirty" : "saved";
        item.error = "";
        context.local.reset(item, value);
        context.upsert("notes", value);
      }
    } catch (error) {
      if (!context.disposed && sequence2 === item.sequence) {
        item.error = error.message;
        if (!isUncertain(item)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence2 === item.sequence) {
        item.loading = false;
        context.emit();
        if (reschedule) context.schedule(item);
      }
    }
  }
  async function load({ local = false } = {}) {
    const { state: state2 } = context, sequence2 = ++context.loadSequence;
    state2.loading = true;
    state2.error = "";
    context.emit();
    try {
      const raw = await (local && context.readLocal ? context.readLocal("/memos") : context.request("/memos"));
      if (context.disposed || sequence2 !== context.loadSequence) return;
      if (!Array.isArray(raw?.groups) || !Array.isArray(raw.notes) || typeof raw.can_edit !== "boolean")
        throw new Error("备忘录列表不完整，请重新读取。");
      const value = context.local.index(raw);
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
      if (state2.noteId) await selectNote(state2.noteId, { open: false, local });
    } catch (error) {
      if (!context.disposed && sequence2 === context.loadSequence) state2.error = error.message;
    } finally {
      if (!context.disposed && sequence2 === context.loadSequence) {
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
  function edit(field2, value, { composing = false, retainPrivate = false } = {}) {
    const item = context.drafts.get(context.state.noteId);
    if (!context.writable() || !item || item.loading || !idPattern.test(item.group_id) || !["title", "body"].includes(field2) || item.deleted_at || context.blocked(item)) return;
    item.composing = composing;
    if (!retainPrivate) item.autosaveHeld = false;
    const baseline = item.localQueued ? item.durable : item.server;
    item[field2] = value;
    item.dirty = !baseline || changed3(item, baseline);
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
  async function sendNote(item, pending, { offlineUnknown = false } = {}) {
    context.stop(item);
    item.pending = pending;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    context.emit();
    try {
      const raw = await context.request(pending.path, {
        method: pending.method,
        body: pending.body,
        ...offlineUnknown ? { offlineUnknown: true } : {}
      });
      if (context.disposed || item.pending !== pending) return;
      if (isLocalDocument(raw)) {
        context.local.accept(item, raw, pending);
        return;
      }
      const value = checkedNote(raw, item.id);
      if (value.version !== pending.body.version + 1 || changed3(value, pending.body)) throw new Error("保存响应需要重新核对。");
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
    if (context.autosavePaused || !context.writable() || !item || !item.dirty || isUncertain(item) || item.loading || item.deleted_at || item.composing || context.blocked(item)) return;
    item.autosaveHeld = false;
    context.stop(item);
    if (!cleanTitle(item.title) || memoBytes(item.body) > MEMOS_MAX_BYTES) {
      item.phase = "error";
      item.error = "标题须为 1–120 字，正文最多 64 KiB；草稿已保留。";
      context.emit();
      return;
    }
    if (!context.online() && !context.durable) {
      item.phase = "offline";
      item.error = "当前离线，草稿保留在此浏览器。联网后可立即保存。";
      context.emit();
      return;
    }
    const snapshot = Object.fromEntries(noteFields.map((field2) => [field2, item[field2]]));
    const body2 = { ...snapshot, title: snapshot.title.trim(), body: snapshot.body.replace(/\r\n?/g, "\n") };
    return sendNote(item, {
      kind: "notes",
      id,
      path: "/memos/notes/" + id,
      method: "PUT",
      body: { ...body2, version: item.localQueued ? item.localVersion : item.version, save_id: context.uuid() },
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
    if (context.durable && pending.method === "PUT") return context.sendNote(item, pending, { offlineUnknown: true });
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
      if (value.version === receipt.version && !changed3(value, pending.body)) acceptNote(context, item, value, pending);
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
    if (item.localConflict && context.resolveLocal) return context.resolveLocal(item.localConflict.key, "use-server").then(() => {
      item.localQueued = false;
      item.localConflict = null;
      item.dirty = false;
      item.phase = "saved";
      return context.selectNote(id, { open: false, local: true });
    });
    context.stop(item);
    const value = item.remote;
    Object.assign(item, newDraft(value));
    context.upsert("notes", value);
    context.emit();
  }
  async function useDraft(id = context.state.noteId) {
    const item = context.drafts.get(id);
    if (!context.writable() || !item?.remote || item.pending || item.phase !== "conflict" || item.remote.deleted_at) return;
    if (item.localConflict) {
      item.error = "两份内容仍保留，请在同步队列核对后处理。";
      context.emit();
      return;
    }
    item.server = item.remote;
    item.version = item.remote.version;
    item.remote = null;
    item.dirty = changed3(item, item.server);
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    context.emit();
    return context.saveNote(id);
  }
  return { checkNote, retryPending, useServer, useDraft };
}
function operations(context) {
  async function sendOperation(pending) {
    const operation3 = { pending, phase: "saving", error: "", retryReady: false };
    context.state.operation = operation3;
    context.emit();
    try {
      const raw = await context.request(pending.path, { method: pending.method, body: pending.body });
      if (context.disposed || context.state.operation !== operation3) return;
      if (isLocalDocument(raw)) {
        context.upsert(pending.kind, context.local.row(raw));
        context.state.operation = null;
        context.emit();
        return;
      }
      const value = raw;
      if (value?.id !== pending.id || !Number.isSafeInteger(value.version)) throw new Error("操作结果需要核对。");
      context.upsert(pending.kind, value);
      context.state.operation = null;
      if (pending.kind === "notes") context.drafts.delete(pending.id);
      await context.load();
    } catch (error) {
      if (context.disposed || context.state.operation !== operation3) return;
      operation3.error = error.message;
      if (error.status >= 400 && error.status < 500) {
        operation3.phase = "error";
        operation3.pending = null;
      } else {
        operation3.phase = "unknown";
        operation3.error = "操作结果待核对，请先查询保存收据，暂不重复操作。";
      }
      context.emit();
    }
  }
  async function operation2(kind, id, method, body2) {
    if (!context.writable() || context.state.operation?.pending) return;
    if (!context.online() && !(context.durable && method === "PUT")) {
      context.state.operation = { phase: "offline", pending: null, error: "当前离线，请联网后重试此操作。" };
      context.emit();
      return;
    }
    return sendOperation({
      kind,
      id,
      method,
      path: "/memos/" + kind + "/" + id + (method === "POST" ? "/restore" : ""),
      body: { ...body2, save_id: context.uuid() }
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
  return { operation: operation2, checkOperation, retryOperation, recoverOperation };
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
    return context.operation("groups", id, "PUT", {
      title: title.trim(),
      position: group.position,
      version: group.localQueued ? group.localVersion : group.version
    });
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
    if (group.localQueued || pendingInGroup(id)) {
      context.state.error = "此分组还有未同步内容，请联网同步后再删除。";
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
    if (!context.online()) {
      context.state.error = "删除笔记需联网；本机正文已保留。";
      context.emit();
      return;
    }
    const item = context.drafts.get(id), note = context.state.notes.find((value) => value.id === id);
    if (!note || note.deleted_at || note.localQueued || item && (item.dirty || item.pending || item.localQueued)) {
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
  context.local = memoLocalProtocol(context);
  Object.assign(context, persistence(context), memoReads2(context), editing(context), resolution(context), operations(context), structure(context));
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
    flushDrafts,
    dispose
  } = context;
  const pauseAutosave = () => {
    const scheduled = [...drafts.values()].filter((item) => item.timer);
    context.autosavePaused = true;
    for (const item of drafts.values()) context.stop(item);
    return () => {
      if (!context.disposed) {
        context.autosavePaused = false;
        for (const item of scheduled) context.schedule(item);
      }
    };
  };
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
    pauseAutosave,
    flushDrafts,
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
  const timestamp4 = Date.parse(row.savedAt), date = Number.isFinite(timestamp4) ? new Date(timestamp4).toLocaleString() : "保存时间未知";
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
var memoOfflineRefresh = false, memoOfflineLoading = false, memoOfflineFlight = null, memoPendingCount = 0, memoConflictCount = 0;
var memoRefreshPaused = false, memoRefreshReady = false;
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
var currentIdentity = () => JSON.stringify([
  runtime.sessionEpoch,
  state.me?.id || "",
  state.me?.publicBusiness === true,
  getOfflineRuntime()?.state.scope || ""
]);
var settingsTrash = () => state.page === "settings" && state.settingsTab === "workspace";
var visible2 = () => (state.page === "memos" || settingsTrash()) && memoIdentity === currentIdentity();
function ensureStore() {
  const identity4 = currentIdentity();
  if (memoStore && memoIdentity === identity4) return memoStore;
  memoDeleteWait?.(true);
  memoDeleteWait = null;
  memoDeleting = "";
  memoEditorFocus = null;
  memoRefreshPaused = false;
  memoRefreshReady = false;
  memoStore?.dispose();
  memoIdentity = identity4;
  memoDialog = null;
  resetMemoRecovery();
  const active5 = () => {
    if (currentIdentity() !== identity4) throw new DOMException("登录状态已经改变", "AbortError");
  };
  const request = async (path, options2) => {
    active5();
    const value = await api(path, options2);
    active5();
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
    durable: true,
    readLocal: (path) => getOfflineRuntime()?.readMemo(path) || request(path),
    resolveLocal: (key, choice2) => getOfflineRuntime().resolve(key, choice2),
    ownerId: state.me?.publicBusiness ? "" : String(state.me?.id || ""),
    onChange: () => {
      if (identity4 === currentIdentity()) {
        memoDeleteWait?.();
        paintMemosPage();
        refreshDurableMemos();
      }
    }
  });
  return memoStore;
}
function refreshDurableMemos() {
  if (!memoOfflineRefresh || memoOfflineLoading || memoDeleting || memoRefreshPaused || !visible2() || !memoStore || memoStore.state.loading || [...memoStore.drafts.values()].some((item) => item.composing || item.pending || item.phase === "saving")) return;
  const store = memoStore;
  memoOfflineRefresh = false;
  memoOfflineLoading = true;
  memoOfflineFlight = Promise.resolve().then(() => store.load({ local: true })).finally(() => {
    memoOfflineLoading = false;
    memoOfflineFlight = null;
    if (store === memoStore) {
      paintMemosPage();
      refreshDurableMemos();
    }
  });
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
  if (!visible2() || !memoStore) return;
  const root = document.querySelector("#memos");
  if (!root) return;
  paintMemos(root, memoStore);
  paintDialog(root);
  setupMemoSplit(root);
  if (memoRefreshPaused) {
    root.inert = true;
    root.querySelectorAll("button,input,select").forEach((control) => {
      control.disabled = true;
    });
    root.querySelectorAll("#memo-title,#memo-body").forEach((field2) => {
      field2.readOnly = true;
    });
  }
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
      if (!group || store !== memoStore || !visible2()) return;
      const pending = store.createNote(group.id, "未命名笔记");
      paintMemosPage();
      const field2 = document.querySelector("#memo-title");
      if (visible2() && store === memoStore) {
        field2?.focus();
        field2?.select();
      }
      await pending;
    }
  } finally {
    memoCreating = false;
    paintMemosPage();
  }
  if (action === "new-group" && visible2() && store === memoStore)
    document.querySelector('[data-memo-action="new-group"]')?.focus();
}
async function selectVisibleMemo(store) {
  const s = store.state, selected = store.drafts.get(s.noteId);
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
    await memoOfflineFlight;
    if (item?.loading || item?.pending && item.phase === "saving") await new Promise((resolve) => {
      memoDeleteWait = (force) => {
        if (force || !item.loading && (!item.pending || item.phase !== "saving")) resolve();
      };
    });
    if (store !== memoStore || memoIdentity !== currentIdentity()) return;
    memoDeleteWait = null;
    if (item?.dirty && !item.pending) await store.saveNote(id);
    if (item?.localQueued && navigator.onLine !== false) {
      await getOfflineRuntime()?.sync();
      await store.selectNote(id, { open: false, select: false, local: true });
    }
    if (item?.dirty || item?.pending || item?.localQueued) {
      store.state.error = "本机正文已保留，删除需联网完成同步后再确认。";
      return;
    }
    await store.removeNote(id);
    await selectVisibleMemo(store);
  } finally {
    if (store === memoStore) {
      memoDeleting = "";
      memoDeleteWait = null;
      paintMemosPage();
      refreshDurableMemos();
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
  else if (action === "exit-trash") {
    navigate("settings", "workspace");
    return;
  } else if (action === "trash" && s.canEdit) {
    navigate("memos", "trash");
    return;
  }
  paintMemosPage();
}
function run(action) {
  Promise.resolve().then(action).catch((error) => {
    if (!visible2() || error.name === "AbortError" || error.staleSession) return;
    memoStore.state.error = error.message || "操作失败，未保存草稿仍保留。";
    paintMemosPage();
  });
}
function editing2(event, composing) {
  if (memoRefreshPaused || !visible2() || !["memo-title", "memo-body"].includes(event.target.id)) return;
  const root = document.querySelector("#memos");
  if (!root?.contains(event.target)) return;
  memoStore.edit(
    event.target.id === "memo-title" ? "title" : "body",
    event.target.value,
    { composing: composing || event.target.dataset.composing === "true" }
  );
}
function preserveMemosBeforeRefresh(event) {
  if (typeof event.detail?.waitUntil !== "function" || memoIdentity !== currentIdentity() || !memoStore?.state.canEdit) return;
  const store = memoStore, expected = memoIdentity, resume = store.pauseAutosave(), root = document.querySelector("#memos");
  const controls = [...root?.querySelectorAll("button,input,select") || []].map((control) => [control, control.disabled]);
  const fields5 = [...root?.querySelectorAll("#memo-title,#memo-body") || []].map((field2) => ({ field: field2, value: field2.value, readOnly: field2.readOnly, composing: field2.dataset.composing === "true" }));
  const focused = fields5.find((row) => row.field === document.activeElement)?.field;
  const selection = focused ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection, focused.scrollTop] : null;
  const wasInert = root?.inert;
  memoRefreshPaused = true;
  memoRefreshReady = false;
  event.detail.onFailure?.(() => {
    resume();
    if (store !== memoStore || expected !== currentIdentity()) return;
    memoRefreshPaused = false;
    memoRefreshReady = false;
    if (root) root.inert = wasInert;
    for (const [control, disabled] of controls) control.disabled = disabled;
    for (const { field: field2, readOnly } of fields5) field2.readOnly = readOnly;
    paintMemosPage();
    refreshDurableMemos();
    if (focused?.isConnected && !focused.disabled) {
      focused.focus({ preventScroll: true });
      focused.setSelectionRange(...selection.slice(0, 3));
      focused.scrollTop = selection[3];
    }
  });
  try {
    const composing = fields5.some((row) => row.composing);
    for (const { field: field2, value } of fields5) store.edit(field2.id === "memo-title" ? "title" : "body", value, { composing, retainPrivate: true });
    if (root) root.inert = true;
    for (const [control] of controls) control.disabled = true;
    for (const { field: field2 } of fields5) field2.readOnly = true;
    event.detail.waitUntil(store.flushDrafts().then(() => {
      if (store !== memoStore || expected !== currentIdentity()) throw new Error("REFRESH_IDENTITY_CHANGED");
      memoRefreshReady = true;
    }));
  } catch (error) {
    event.detail.waitUntil(Promise.reject(error));
  }
}
function registerEvents() {
  if (memoEvents) return;
  memoEvents = true;
  registerMemoSplitEvents();
  registerConflictDraftGuard(createMemoConflictDraftGuard({
    getStore: () => memoStore,
    getIdentity: currentIdentity,
    getStorage: () => window.localStorage,
    getComposing: (id) => memoStore?.state.noteId === id && [...document.querySelectorAll("#memo-title,#memo-body")].some((field2) => field2.dataset.composing === "true")
  }));
  document.addEventListener("focusin", (event) => {
    if (visible2() && ["memo-title", "memo-body"].includes(event.target.id)) memoEditorFocus = event.target;
  });
  document.addEventListener("cancel", (event) => {
    if (visible2() && event.target.id === "memo-fullscreen") {
      event.preventDefault();
      toggleMemoFullscreen(false);
    }
  }, true);
  document.addEventListener("input", (event) => editing2(event, event.isComposing));
  document.addEventListener("compositionstart", (event) => {
    if (!memoRefreshPaused && visible2() && ["memo-title", "memo-body"].includes(event.target.id)) event.target.dataset.composing = "true";
  });
  document.addEventListener("compositionend", (event) => {
    if (memoRefreshPaused) return;
    if (["memo-title", "memo-body"].includes(event.target.id)) event.target.dataset.composing = "false";
    editing2(event, false);
  });
  document.addEventListener("click", (event) => {
    if (!visible2()) return;
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
    if (!visible2() || !memoDialog || !document.querySelector("#memo-dialog")?.contains(event.target)) return;
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
    if (memoRefreshPaused && memoRefreshReady) return;
    if (memoIdentity !== currentIdentity() || !memoStore?.state.canEdit) return;
    if (memoStore.state.operation?.pending || [...memoStore.drafts.values()].some((item) => item.dirty || item.pending)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("haoduoyu:before-refresh", preserveMemosBeforeRefresh);
  window.addEventListener("online", () => {
    if (visible2()) paintMemosPage();
  });
  window.addEventListener("offline", () => {
    if (visible2()) paintMemosPage();
  });
  window.addEventListener("haoduoyu-offline-status", (event) => {
    const pending = event.detail?.pending || 0, conflicts = event.detail?.conflicts || 0;
    if (pending < memoPendingCount || conflicts !== memoConflictCount) memoOfflineRefresh = true;
    memoPendingCount = pending;
    memoConflictCount = conflicts;
    refreshDurableMemos();
  });
}
async function loadMemos() {
  registerEvents();
  const store = ensureStore();
  const trash = settingsTrash() || state.memoView === "trash";
  if (store.state.trash !== trash) {
    store.state.noteId = "";
    store.state.groupId = "";
    store.state.pane = "notes";
  }
  store.state.trash = trash;
  await store.load();
  await selectVisibleMemo(store);
  const tool = memoTool;
  memoTool = "";
  if (!tool && !store.state.trash && store.state.noteId) store.state.pane = "editor";
  if (tool && visible2() && store.state.canEdit) {
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
var memoSplitRoot = null, memoSplitObserver = null, memoSplitRatio, memoSplitDrag = null;
var memoSplitStorage = "haoduoyu.memos.split-ratio.v1";
function applyMemoSplit(width = null, persist = false) {
  const root = memoSplitRoot, layout = root?.querySelector(".memo-layout"), handle = root?.querySelector("#memo-resizer");
  if (!root?.isConnected || !layout || !handle) return;
  const mobile = window.innerWidth <= 760;
  handle.hidden = mobile;
  if (mobile) {
    root.style.removeProperty("--memo-list-w");
    return;
  }
  const area = layout.clientWidth - 10, min = area < 400 ? 120 : 160;
  const max = Math.max(min, Math.floor(Math.min(480, area - 200, area * 0.65)));
  if (memoSplitRatio === void 0) {
    const saved = Number(storage.get(memoSplitStorage));
    memoSplitRatio = Number.isFinite(saved) && saved >= 0.1 && saved <= 0.8 ? saved : 0.24;
  }
  const value = Math.round(Math.max(min, Math.min(max, width ?? area * memoSplitRatio)));
  root.style.setProperty("--memo-list-w", value + "px");
  for (const [name, number] of Object.entries({ min, max, now: value })) handle.setAttribute("aria-value" + name, String(number));
  handle.setAttribute("aria-valuetext", "笔记列表宽度 " + value + " 像素");
  if (width !== null) memoSplitRatio = value / area;
  if (persist) storage.set(memoSplitStorage, String(memoSplitRatio));
}
function setupMemoSplit(root) {
  if (root === memoSplitRoot) return;
  memoSplitObserver?.disconnect();
  memoSplitRoot = root;
  if (typeof ResizeObserver === "function") {
    memoSplitObserver = new ResizeObserver(() => applyMemoSplit());
    memoSplitObserver.observe(root.querySelector(".memo-layout"));
  }
  applyMemoSplit();
}
function finishMemoSplit(cancel = false) {
  const drag = memoSplitDrag;
  if (!drag) return;
  memoSplitDrag = null;
  if (cancel) {
    memoSplitRatio = drag.ratio;
    applyMemoSplit();
  } else applyMemoSplit(Number(drag.handle.getAttribute("aria-valuenow")), true);
  drag.root.classList.remove("memo-resizing");
  if (drag.handle.hasPointerCapture?.(drag.pointer)) drag.handle.releasePointerCapture(drag.pointer);
}
function startMemoSplit(event) {
  const handle = event.target.closest?.("#memo-resizer");
  if (!handle || handle.hidden || event.button !== 0 || event.isPrimary === false) return;
  event.preventDefault();
  finishMemoSplit();
  memoSplitDrag = {
    root: memoSplitRoot,
    handle,
    pointer: event.pointerId,
    x: event.clientX,
    width: Number(handle.getAttribute("aria-valuenow")),
    ratio: memoSplitRatio
  };
  memoSplitRoot.classList.add("memo-resizing");
  handle.focus({ preventScroll: true });
  handle.setPointerCapture(event.pointerId);
}
function keyMemoSplit(event) {
  if (memoSplitDrag && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    finishMemoSplit(true);
    return;
  }
  const handle = event.target.closest?.("#memo-resizer");
  if (!handle || handle.hidden || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const value = event.key === "Home" ? Number(handle.getAttribute("aria-valuemin")) : event.key === "End" ? Number(handle.getAttribute("aria-valuemax")) : Number(handle.getAttribute("aria-valuenow")) + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 32 : 16);
  applyMemoSplit(value, true);
}
function registerMemoSplitEvents() {
  document.addEventListener("pointerdown", startMemoSplit);
  document.addEventListener("pointermove", (event) => {
    if (event.pointerId === memoSplitDrag?.pointer) {
      event.preventDefault();
      applyMemoSplit(memoSplitDrag.width + event.clientX - memoSplitDrag.x);
    }
  });
  document.addEventListener("pointerup", (event) => {
    if (event.pointerId === memoSplitDrag?.pointer) finishMemoSplit();
  });
  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId === memoSplitDrag?.pointer) finishMemoSplit(true);
  });
  document.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId === memoSplitDrag?.pointer) finishMemoSplit();
  });
  document.addEventListener("keydown", keyMemoSplit, true);
  window.addEventListener("resize", () => {
    finishMemoSplit(true);
    applyMemoSplit();
  });
}

// web/ui/menu.mjs
function syncMenu() {
  const phone = isMobileLayout(), open = Boolean($(".shell")?.classList.contains("menu-open")), side = $(".sidebar");
  if (side) side.inert = phone;
  const panel = $("#mobile-settings-menu");
  if (panel) {
    panel.hidden = !phone || !open;
    panel.inert = !phone || !open;
  }
  const trigger = $(".mobile-settings-trigger");
  if (trigger) {
    trigger.classList.toggle("active", state.page === "settings");
    if (state.page === "settings") trigger.setAttribute("aria-current", "page");
    else trigger.removeAttribute("aria-current");
  }
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
    $(isMobileLayout() ? "#mobile-settings-menu a[href]" : ".sidebar .brand")?.focus();
  } else if (runtime.menuFocus?.isConnected) {
    runtime.menuFocus.focus();
    runtime.menuFocus = null;
  }
}
function closeMobileMenuOutside(target) {
  if (!isMobileLayout() || !$(".shell")?.classList.contains("menu-open")) return;
  if (!target?.closest?.('#mobile-settings-menu,[data-action="menu"]')) setMenu(false);
}
function trapMobileMenuFocus(event) {
  if (event.key !== "Tab" || !isMobileLayout() || !$(".shell")?.classList.contains("menu-open")) return false;
  const panel = $("#mobile-settings-menu");
  if (!panel) return false;
  const nodes = $$("a[href],button:not(:disabled)", panel);
  if (!nodes.length) return false;
  const first = nodes[0], last = nodes.at(-1), outside = !panel.contains(document.activeElement);
  if (outside || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  return false;
}

// web/ui/workbench.mjs
var mediaPages = /* @__PURE__ */ new Set(["dashboard", "articles", "reviews"]);
function navigationLink(item, mobile = false) {
  const selected = item.id === state.page && (!item.category || item.category === dailyNotesRouteCategory());
  const query = item.id === "settings" ? "&amp;tab=workspace" : item.category ? "&amp;notes_category=" + item.category : "";
  return `<a href="?page=${e(item.id)}${query}" data-nav="${e(item.id)}" ${item.category ? `data-notes-category="${item.category}"` : ""}
title="${e(item.label)}"
class="${mobile ? "mobile-nav-item" : "nav-item"}${selected ? " active" : ""}" aria-label="${e(item.label)}"
${selected ? 'aria-current="page"' : ""}>${icon(item.icon, 18)}<span class="nav-label">${e(item.label)}</span></a>`;
}
function mediaNavigation(mobile = false) {
  const active5 = mediaPages.has(state.page), name = mobile ? "mobile-nav-item" : "nav-item";
  return `<a href="?page=dashboard" data-nav="dashboard" class="${name} media-link${active5 ? " active" : ""}"
aria-label="好多鱼图文" ${active5 ? 'aria-current="page"' : ""}>${icon("articles", 18)}<span class="nav-label">${mobile ? "图文" : "好多鱼图文"}</span></a>`;
}
function renderMediaTabs() {
  if (!mediaPages.has(state.page)) return "";
  return '<nav class="media-page-tabs" aria-label="图文页面">' + [["dashboard", "数据总览"], ["articles", "文章详情"]].map(([page, label3]) => `<a href="?page=${page}" data-nav="${page}" class="btn media-page-tab${state.page === page ? " active" : ""}"
${state.page === page ? 'aria-current="page"' : ""}>${label3}</a>`).join("") + "</nav>";
}
function notesNavigation(mobile = false) {
  return navigationLink({ id: "notes", icon: "edit", label: "碎碎念" }, mobile);
}
function sidebarNavigation() {
  return mediaNavigation() + nav.filter((item) => !mediaPages.has(item.id) && item.id !== "settings").map((item) => item.id === "notes" ? notesNavigation() : navigationLink(item)).join("");
}
function settingsNavigation() {
  return navigationLink(nav.find((item) => item.id === "settings"));
}
function mobileNavigation() {
  const items = [["todos", "待办"], ["notes", "碎碎念"], ["memos", "备忘录"], ["reminders", "提醒"]];
  return `<nav class="mobile-nav workbench-navigation" aria-label="切换模块">${items.map(([id, label3]) => navigationLink({ ...nav.find((item) => item.id === id), label: label3 }, true)).join("")}${mediaNavigation(true)}</nav>`;
}
function mobileSettingsMenu() {
  return `<nav id="mobile-settings-menu" class="mobile-settings-menu" aria-label="设置菜单" hidden>
${settingsNavigation()}${state.me?.publicBusiness ? "" : `<button class="btn text" data-action="logout">${icon("logout", 18)}退出登录</button>`}</nav>`;
}
function syncWorkbenchNavigation() {
  const active5 = mediaPages.has(state.page);
  for (const link of document.querySelectorAll(".media-link")) {
    link.classList.toggle("active", active5);
    if (active5) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  for (const menu of document.querySelectorAll(".notes-nav,.mobile-notes-nav")) {
    menu.open = state.page === "notes" && menu.classList.contains("notes-nav");
    menu.classList.toggle("active", state.page === "notes");
    syncMediaExpanded(menu);
  }
  for (const link of document.querySelectorAll("[data-notes-category]")) {
    const selected = state.page === "notes" && link.dataset.notesCategory === dailyNotesRouteCategory();
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  const mobile = document.querySelector(".mobile-media-nav");
  if (mobile) {
    mobile.open = false;
    mobile.classList.toggle("active", active5);
    syncMediaExpanded(mobile);
  }
}
function closeMediaNavigation(target = null) {
  for (const menu of document.querySelectorAll(".mobile-media-nav[open],.mobile-notes-nav[open]"))
    if (!target || !menu.contains(target)) {
      menu.open = false;
      syncMediaExpanded(menu);
    }
}
function syncMediaExpanded(menu) {
  menu?.querySelector?.("summary")?.setAttribute("aria-expanded", String(menu.open));
}
var sidebarWidthKey = "haoduoyu.workbench.sidebar-width.v1";
var sidebarPreference, sidebarDrag = null, sidebarResizeEvents = false;
function readSidebarWidth() {
  if (sidebarPreference === void 0) {
    const saved = Number(storage.get(sidebarWidthKey));
    sidebarPreference = Number.isFinite(saved) && saved >= 88 && saved <= 420 ? saved : null;
  }
  return sidebarPreference;
}
function sidebarWidthLimits(viewport, shellWidth) {
  if (viewport < 768) return null;
  const min = viewport < 1200 ? 88 : 200;
  return { min, max: Math.max(min, Math.min(420, Math.floor(shellWidth - (viewport < 1200 ? 420 : 540)))) };
}
function renderSidebarResizer() {
  return '<div id="sidebar-resizer" class="sidebar-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整导航宽度" aria-controls="site-nav main" aria-valuemin="200" aria-valuemax="420" aria-valuenow="232" title="拖动调整导航宽度；方向键微调，Home / End 调到最小 / 最大"></div>';
}
function applySidebarWidth(value = readSidebarWidth(), persist = false) {
  const shell = document.querySelector(".shell"), handle = document.querySelector("#sidebar-resizer");
  if (!shell?.style?.setProperty || !handle || typeof window.innerWidth !== "number") return null;
  const limits = sidebarWidthLimits(window.innerWidth, shell.clientWidth);
  handle.hidden = !limits;
  if (!limits) {
    shell.style.removeProperty("--sidebar-w");
    delete shell.dataset.sidebarExpanded;
    return null;
  }
  const fallback = window.innerWidth < 1200 ? 88 : 232;
  const width = Math.round(Math.max(limits.min, Math.min(limits.max, value ?? fallback)));
  shell.style.setProperty("--sidebar-w", width + "px");
  shell.dataset.sidebarExpanded = String(width >= 200);
  for (const [name, number] of Object.entries({ min: limits.min, max: limits.max, now: width }))
    handle.setAttribute("aria-value" + name, String(number));
  handle.setAttribute("aria-valuetext", "导航宽度 " + width + " 像素");
  if (persist) {
    sidebarPreference = width;
    storage.set(sidebarWidthKey, String(width));
  }
  return width;
}
function finishSidebarDrag(cancel = false) {
  const drag = sidebarDrag;
  if (!drag) return;
  sidebarDrag = null;
  if (cancel) {
    sidebarPreference = drag.preference;
    applySidebarWidth(drag.width);
  } else applySidebarWidth(Number(drag.handle.getAttribute("aria-valuenow")), true);
  drag.shell.classList.remove("sidebar-resizing");
  if (drag.handle.hasPointerCapture?.(drag.pointer)) drag.handle.releasePointerCapture(drag.pointer);
}
function startSidebarDrag(event) {
  const handle = event.target.closest?.("#sidebar-resizer");
  if (!handle || event.button !== 0 || event.isPrimary === false || window.innerWidth < 768) return;
  event.preventDefault();
  finishSidebarDrag();
  const shell = handle.closest(".shell");
  sidebarDrag = {
    handle,
    shell,
    pointer: event.pointerId,
    x: event.clientX,
    width: Number(handle.getAttribute("aria-valuenow")),
    preference: readSidebarWidth()
  };
  shell.classList.add("sidebar-resizing");
  handle.focus({ preventScroll: true });
  handle.setPointerCapture(event.pointerId);
}
function moveSidebarDrag(event) {
  if (!sidebarDrag || event.pointerId !== sidebarDrag.pointer) return;
  event.preventDefault();
  applySidebarWidth(sidebarDrag.width + event.clientX - sidebarDrag.x);
}
function keySidebarResize(event) {
  if (sidebarDrag && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    finishSidebarDrag(true);
    return;
  }
  const handle = event.target.closest?.("#sidebar-resizer");
  if (!handle || handle.hidden || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const current2 = Number(handle.getAttribute("aria-valuenow")), step = event.shiftKey ? 32 : 16;
  const next = event.key === "Home" ? Number(handle.getAttribute("aria-valuemin")) : event.key === "End" ? Number(handle.getAttribute("aria-valuemax")) : current2 + (event.key === "ArrowRight" ? step : -step);
  applySidebarWidth(next, true);
}
function setupSidebarResize() {
  if (applySidebarWidth() === null && typeof window.innerWidth !== "number") return;
  if (sidebarResizeEvents) return;
  sidebarResizeEvents = true;
  document.addEventListener("toggle", (event) => {
    if (event.target.matches?.(".media-nav,.mobile-media-nav,.notes-nav,.mobile-notes-nav")) syncMediaExpanded(event.target);
  }, true);
  document.addEventListener("pointerdown", startSidebarDrag);
  document.addEventListener("pointermove", moveSidebarDrag);
  document.addEventListener("pointerup", (event) => {
    if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag();
  });
  document.addEventListener("pointercancel", (event) => {
    if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag(true);
  });
  document.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag();
  });
  document.addEventListener("keydown", keySidebarResize, true);
  window.addEventListener("resize", () => {
    finishSidebarDrag(true);
    applySidebarWidth();
    syncMobileViewport();
  });
}
var mobileViewportEvents = false;
function keepMobileInputVisible() {
  const field2 = document.activeElement, viewport = window.visualViewport;
  if (!isMobileLayout() || !viewport || !field2?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
  requestAnimationFrame(() => {
    if (document.activeElement !== field2 || !field2.isConnected) return;
    const rect = field2.getBoundingClientRect(), top = viewport.offsetTop || 0;
    if (rect.bottom > top + viewport.height - 16 || rect.top < top + 12) field2.scrollIntoView?.({ block: "nearest" });
  });
}
function syncMobileViewport() {
  const root = document.documentElement;
  if (!root?.style?.setProperty) return;
  if (!isMobileLayout()) {
    for (const key of ["height", "top", "keyboard"]) root.style.removeProperty("--mobile-viewport-" + key);
    delete root.dataset.mobileKeyboard;
    return;
  }
  const viewport = window.visualViewport, height = viewport?.height || window.innerHeight, top = viewport?.offsetTop || 0;
  if (!Number.isFinite(height) || height <= 0) return;
  const editing3 = document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
  const keyboard = editing3 ? Math.max(0, (window.innerHeight || height) - height - top) : 0;
  root.style.setProperty("--mobile-viewport-height", Math.round(height) + "px");
  root.style.setProperty("--mobile-viewport-top", Math.round(top) + "px");
  root.style.setProperty("--mobile-viewport-keyboard", Math.round(keyboard) + "px");
  root.dataset.mobileKeyboard = String(keyboard > 80);
  keepMobileInputVisible();
}
function setupMobileViewport() {
  syncMobileViewport();
  if (mobileViewportEvents) return;
  mobileViewportEvents = true;
  window.visualViewport?.addEventListener("resize", syncMobileViewport);
  window.visualViewport?.addEventListener("scroll", syncMobileViewport);
  document.addEventListener("focusin", syncMobileViewport);
  document.addEventListener("focusout", () => requestAnimationFrame(syncMobileViewport));
}

// web/pages/workbench-settings.mjs
function renderWorkbenchSettings() {
  return `<section class="workbench-settings"><div class="section-heading"><h2>回收站</h2>
<button class="btn text" data-action="memo-tools" data-tool="recovery">${icon("refresh")}找回未保存内容</button></div>
<p class="trash-policy">删除后30天内可恢复；超过30天归档保留，仍可恢复。</p>${renderMemos()}</section>`;
}

// web/pages/work-reminders.mjs
function renderWorkReminders() {
  return '<section id="work-reminders" aria-label="每日工作提醒"><div class="reminder-toolbar"><label for="reminder-date" class="sr-only">提醒日期</label><input id="reminder-date" class="input" type="date"><button type="button" class="btn text" data-reminder-today>今天</button></div><p id="reminder-error" role="alert" hidden></p><div id="reminder-list" aria-live="polite"></div></section>';
}
function paintWorkReminders(data, error = "") {
  const root = document.querySelector("#work-reminders");
  if (!root) return;
  const date = data?.date || bjtDate(), field2 = root.querySelector("#reminder-date");
  if (document.activeElement !== field2) field2.value = date;
  const message = root.querySelector("#reminder-error");
  message.hidden = !error;
  message.textContent = error;
  const rows = data?.items || [];
  root.querySelector("#reminder-list").innerHTML = rows.length ? rows.map((row) => '<article class="card reminder-card"><time datetime="' + e(row.updated_at) + '">' + e(new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(row.updated_at))) + "</time><p>" + e(row.summary) + "</p></article>").join("") : data?.loading ? "" : '<div class="card reminder-empty">暂无工作提醒</div>';
}

// web/work-reminders-controller.mjs
var reminderSequence = 0, reminderEvents = false;
async function loadWorkReminders() {
  registerReminderEvents();
  const sequence2 = ++reminderSequence, session = runtime.sessionEpoch, date = state.reminderDate || bjtDate();
  const current2 = () => sequence2 === reminderSequence && session === runtime.sessionEpoch && state.page === "reminders";
  paintWorkReminders({ date, items: [], loading: true });
  try {
    const data = await api("/work-reminders?date=" + encodeURIComponent(date));
    if (current2()) paintWorkReminders(data);
  } catch (error) {
    if (current2()) paintWorkReminders({ date, items: [] }, error.message || "提醒读取失败，请稍后重试");
  }
}
function selectReminderDate(value) {
  if (!validTodoDate(value)) return;
  state.reminderDate = value;
  updateRoute(true);
  void loadWorkReminders();
}
function registerReminderEvents() {
  if (reminderEvents) return;
  reminderEvents = true;
  document.addEventListener("change", (event) => {
    if (state.page === "reminders" && event.target.id === "reminder-date") selectReminderDate(event.target.value);
  });
  document.addEventListener("click", (event) => {
    if (state.page === "reminders" && event.target.closest("[data-reminder-today]")) selectReminderDate(bjtDate());
  });
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
  ) : ""}${renderMediaTabs()}<div id="page-content"></div>`;
}
function reuseShell() {
  const shell = $(".shell"), main = $("#main");
  if (!main || shell?.dataset.session !== String(runtime.sessionEpoch) || shell.dataset.user !== state.me?.id) return false;
  setMenu(false);
  for (const link of $$(".nav-item,.mobile-nav-item", shell)) {
    const current2 = link.dataset.nav === state.page;
    link.classList.toggle("active", current2);
    if (current2) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  syncWorkbenchNavigation();
  main.innerHTML = mainContent();
  return true;
}
function renderShell() {
  redirectMobileArticlePage();
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
  )}</button></div><nav class="nav-list" tabindex="0" aria-label="模块导航">${sidebarNavigation()}</nav><div class="sidebar-bottom">${settingsNavigation()}${state.me.publicBusiness ? "" : `<div class="user-row"><span class="avatar">${e((state.me.username || "我").slice(0, 1).toUpperCase())}</span><span class="user-name">${e(state.me.username)}</span>${state.me.publicBusiness ? "" : `<button class="logout" data-action="logout" title="退出登录" aria-label="退出登录">${icon("logout", 16)}</button>`}</div>`}</div></aside>${renderSidebarResizer()}<div class="workspace"><header class="mobile-bar"><span>好多鱼工作台</span><button class="icon-button mobile-settings-trigger" data-action="menu" aria-label="设置菜单" aria-expanded="false" aria-controls="mobile-settings-menu">${icon("settings", 20)}</button>${mobileSettingsMenu()}</header><main id="main" class="content" tabindex="-1">${mainContent()}</main>${mobileNavigation()}</div></div>`;
  syncMenu();
  setupSidebarResize();
  setupMobileViewport();
  renderPage();
}
function redirectMobileArticlePage() {
  const page = mobilePage(state.page);
  if (page === state.page) return false;
  state.page = page;
  state.account = "";
  updateRoute();
  return true;
}
function handleResponsiveLayout() {
  syncMobileViewport();
  syncMenu();
  const redirected = redirectMobileArticlePage();
  if (redirected && state.me) renderShell();
  return redirected;
}
function navigateLink(page) {
  const target = mobilePage(page);
  const same2 = target === state.page && (target !== "memos" || !state.memoView) && (page !== "settings" || state.settingsTab === "workspace") && (page !== "todos" || !state.todoDate && !state.todoPanel);
  if (same2 && !$("#overlay")?.firstChild && !runtime.activePopover) {
    setMenu(false);
    return;
  }
  navigate(page);
}
function navigate(page, tab) {
  if (page === "reviews") page = "articles";
  if (page === "memos" && tab === "trash") {
    page = "settings";
    tab = "workspace";
  }
  const legacy = Object.hasOwn(legacyPages, page) ? legacyPages[page] : null;
  if (legacy) page = "settings";
  if (!nav.some((n) => n.id === page)) return;
  state.page = page;
  if (page === "memos") state.memoView = tab === "trash" ? "trash" : "";
  if (page === "todos") {
    state.todoDate = "";
    state.todoPanel = "";
  }
  if (page === "settings") state.settingsTab = legacy || tab || "workspace";
  if (mobilePage(page) === "dashboard") state.account = "";
  updateRoute(true);
  closeModal();
  renderShell();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function pageLoading(page) {
  if (page === "todos") return renderTodos();
  if (page === "notes") return renderDailyNotes();
  if (page === "memos") return renderMemos();
  if (page === "reminders") return renderWorkReminders();
  if (page === "settings" && state.settingsTab === "workspace") return renderWorkbenchSettings();
  return skeleton();
}
function setPageBody(html, page) {
  if (page === "todos") paintTodos();
  else if (page === "notes") paintDailyNotesPage();
  else if (page === "memos") paintMemosPage();
  else if (page === "settings" && state.settingsTab === "workspace") paintMemosPage();
  else if (page === "reminders") return;
  else replacePageContent(html, true);
}
function publishedArticleLinks(html) {
  const query = new URLSearchParams({ page: "articles", status: "published", sort: "reads", order: "desc" });
  if (state.topPlatform) query.set("platform", state.topPlatform);
  return html.replace('href="?page=articles&amp;sort=reads&amp;order=desc"', `href="?${e(query.toString())}"`);
}
async function loadArticleOverview(version2, context) {
  const query = new URLSearchParams({ period: state.overviewPeriod, top_n: state.topN, top_platform: state.topPlatform });
  if (state.account) query.set("account_id", state.account);
  const data = await api(`/overview?${query}`, { context });
  if (version2 !== runtime.renderVersion) return "";
  state.dashboard = data;
  return renderMediaOverview(data);
}
function renderMediaOverview(data) {
  return publishedArticleLinks(renderDashboardSummary(data));
}
async function renderPage() {
  if (redirectMobileArticlePage()) {
    renderShell();
    return;
  }
  stopPageEntry();
  closePopover({ restoreFocus: false });
  const version2 = ++runtime.renderVersion, page = state.page;
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
      case "reminders":
        await loadWorkReminders();
        break;
      case "dashboard":
        html = await loadArticleOverview(version2, context);
        break;
      case "articles":
        html = await renderArticles(version2, context);
        break;
      case "reviews":
        html = await renderReviews(version2, context);
        break;
      case "settings":
        if (state.settingsTab === "workspace") {
          await loadMemos();
          break;
        } else if (state.settingsTab === "accounts") {
          data = await api("/account-profiles", { context });
          if (version2 !== runtime.renderVersion) return;
          state.accountProfiles = data;
          html = renderAccounts();
        } else if (state.settingsTab === "keys") {
          data = await api("/api-keys", { context });
          html = renderKeys(data);
        } else if (state.settingsTab === "security") html = renderSecurity();
        else {
          const [audit, keys] = await Promise.all([api("/audit", { context }), api("/api-keys", { context })]);
          html = renderAudit(audit, keys);
        }
        break;
    }
    if (version2 === runtime.renderVersion && state.me) {
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
    if (!isRequestAbort(err) && !err.staleSession && version2 === runtime.renderVersion && state.me) setPageBody(`<div class="card error-panel" role="alert"><span class="empty-icon">${icon("info", 23)}</span><h3>本次数据读取失败</h3><p>${e(err.message)}</p><button class="btn" data-action="refresh">${icon("refresh")}重新加载</button></div>`, page);
  } finally {
    if (version2 === runtime.renderVersion) $("#page-content")?.setAttribute("aria-busy", "false");
  }
}
async function reloadFilteredPage(focus = "[data-action=article-filter]") {
  clearTimeout(runtime.searchTimer);
  state.listPage = 1;
  updateRoute();
  const version2 = runtime.renderVersion + 1;
  await renderPage();
  if (version2 === runtime.renderVersion && !$("#overlay").firstChild && document.activeElement === document.body) $(focus)?.focus();
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
function createArticleVerificationStore({ article, load, put, uuid: uuid5 = () => crypto.randomUUID(), onChange = () => {
}, isCurrent = () => true }) {
  let current2 = copy(article), phase = "idle", message = "", pending = null, busy = false, retryReady = false;
  const snapshot = () => ({ article: copy(current2), phase, message, busy, retryReady });
  const notify = () => onChange(snapshot());
  function received(value) {
    if (!validArticle(value, current2.id)) throw new Error("详情读取不完整，请重新打开核对。");
    current2 = copy(value);
  }
  async function reconcile(conflict = false) {
    let remote;
    try {
      remote = await load(current2.id);
    } catch {
      phase = "unknown";
      retryReady = false;
      message = "保存结果尚未确认，请重新核对；不会自动重发。";
      return false;
    }
    if (!validArticle(remote, current2.id)) {
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
    message = pending ? retryReady ? "原保存尚未确认；已读取当前版本，可显式重试原保存。" : "记录状态尚未确认，请重新核对；不会重发保存。" : "";
    return retryReady;
  }
  async function send() {
    if (!isCurrent()) return;
    phase = "saving";
    message = "";
    retryReady = false;
    notify();
    let response;
    try {
      response = await put(current2.id, copy(pending.body), pending.key);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 409) {
        pending = null;
        phase = "error";
        message = error.message || "保存被拒绝，请核对后重试。";
      } else await reconcile(error.status === 409);
      return;
    }
    if (!validArticle(response, current2.id) || response.version <= pending.body.version || !same(response.verify_items, pending.body.verify_items)) {
      await reconcile();
      return;
    }
    received({ ...current2, ...response });
    pending = null;
    phase = "saved";
    message = "";
    try {
      const remote = await load(current2.id);
      if (validArticle(remote, current2.id) && remote.version >= current2.version) {
        const matches2 = same(remote.verify_items, current2.verify_items);
        received(remote);
        if (!matches2) {
          phase = "conflict";
          message = "保存后记录又有更新，已显示最新内容。";
        }
      }
    } catch {
      message = "已保存，最新详情暂未读取。";
    }
  }
  async function save(index, done) {
    if (busy || pending || !Number.isSafeInteger(index) || typeof done !== "boolean" || !Array.isArray(current2.verify_items) || !current2.verify_items[index] || typeof current2.verify_items[index] !== "object") return;
    if (current2.verify_items[index].done === done) return;
    const items = copy(current2.verify_items);
    items[index].done = done;
    pending = { index, done, before: copy(current2.verify_items), body: { version: current2.version, verify_items: items }, key: uuid5() };
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
    put: (id, body2, key) => api(`/articles/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: body2,
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
  const active5 = activeBinding();
  if (!active5 || target.dataset.articleId !== active5.articleId) return;
  const index = Number(target.dataset.articleVerifyIndex);
  const value = target.type === "checkbox" ? target.checked : target.value === "true" ? true : target.value === "false" ? false : null;
  if (typeof value === "boolean") {
    try {
      await active5.store.save(index, value);
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
  const blocked2 = gesture.blocked;
  if (!blocked2 || Date.now() > blocked2.until || !event.pointerType && event.detail === 0) return;
  const samePointer = event.pointerId === blocked2.pointerId;
  const samePosition = Math.hypot(event.clientX - blocked2.x, event.clientY - blocked2.y) <= 25;
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
  const publication = isPublished2(a) ? displayTime(a.published_at) : hasRecordedUnknownMetrics(a) ? a.published_at ? displayTime(a.published_at) : "未取得" : "未发布";
  const info = [
    ["生产方式", modeLabels[a.production_mode] || "未记录"],
    ["原始发布时间", publication],
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
  const unconfirmed = hasRecordedUnknownMetrics(a);
  if (!isPublished2(a) && !unconfirmed) return '<section class="detail-section article-unpublished"><h3>阅读与复盘</h3><strong>未发布</strong><p class="cell-sub">发布后再记录阅读指标和复盘节点。</p></section>';
  const timeline = a.timeline || a.observations || [], nodes = a.nodes || [], missing4 = unconfirmed ? "未取得" : "未采集";
  const summary = unconfirmed && a.latest_metrics == null ? '<p class="cell-sub">最新汇总指标未取得。</p>' : metricSummary(a);
  return `${unconfirmed ? '<section class="detail-section"><h3>状态未确认</h3><p>以下为已有指标与历史记录。</p></section>' : ""}${summary}<p class="cell-sub">截至 ${a.latest_metrics == null ? missing4 : e(displayTime(a.latest_as_of))} · 采集于 ${a.latest_metrics == null ? missing4 : e(displayTime(a.latest_collected_at))}</p><section class="detail-section">${unconfirmed ? "" : `<h3>观察节点</h3><ol class="snapshot-nodes">${nodes.map((n) => {
    const unknown = n.kind !== "latest" && a.date_status === "unverified" && !n.snapshot, status = unknown ? "unknown" : n.status, label3 = unknown ? "日期待核实" : { recorded: "已记录", before_due: "记录早于节点", not_due: "未到期", not_collected: "未采集" }[status] || "状态未知";
    return `<li class="node ${e(status)}"><strong>${e(kindLabels[n.kind] || n.kind)}</strong><span>${e(label3)}</span><small>${e(displayTime(
      n.snapshot?.as_of || n.due_at
    ))}</small></li>`;
  }).join("")}</ol>`}<h3>快照时间线 ${detailInfo(
    "按截至时间排序；相邻累计快照差值不等同每日新增。节点类型不代表先后。",
    "时间线口径",
    "timeline"
  )}</h3>${timeline.length < 2 ? `<p class="insufficient">${timeline.length ? "只有一期数据，暂不显示增长。" : unconfirmed ? "没有已记录的历史快照。" : "尚未采集快照。"}</p>` : ""}<ol class="snapshot-timeline">${timeline.map((r) => `<li>${renderSnapshot(r)}${r.changes ? `<div class="snapshot-changes">${[
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
  const ticket = ++runtime.modalRequestVersion, version2 = runtime.renderVersion, a = await modalRequest(
    `/articles/${encodeURIComponent(id)}`,
    ticket,
    version2,
    context
  );
  if (ticket !== runtime.modalRequestVersion || version2 !== runtime.renderVersion) return;
  openModal(a.title, renderArticleDetailBody(a), { drawer: true, context: `<div class="account-title">${platformLogo(a.platform)}${e(
    a.account_name || accountName(a.account_id)
  )} · ${e(articleStatus[a.status] || "未确认")}</div>` });
  const modal = runtime.modalRequestVersion, epoch = runtime.sessionEpoch;
  const isCurrent = () => modal === runtime.modalRequestVersion && version2 === runtime.renderVersion && epoch === runtime.sessionEpoch && document.querySelector("#overlay .article-ledger-detail")?.dataset.articleDetail === a.id;
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
    const version2 = runtime.renderVersion + 1;
    await renderPage();
    if (version2 !== runtime.renderVersion || state.page !== "articles" || $("#overlay").firstChild) return;
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
    replacePageContent(renderMediaOverview(state.dashboard));
    $("[data-action=trend-tab][data-tab=" + state.trendTab + "]")?.focus();
  }
  return;
}
function actionPageMenu({ target, action }) {
  const records = ["dashboard", "articles"].includes(state.page) ? '<button data-action="media-records" role="menuitem">查看数据记录</button>' : "";
  popover(target, '<button data-action="refresh" role="menuitem">刷新数据</button>' + records + '<a href="/api/v1/export" download role="menuitem">导出发布记录 CSV</a><a href="/api-docs" target="_blank" rel="noopener noreferrer" role="menuitem">接入文档 ↗</a>', { menu: true, label: "页面操作" });
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
async function actionShowDue({}) {
  state.reviewTab = "pending";
  await reviewRecordsModal();
  return;
}
function actionToggleAttention({}) {
  state.attentionExpanded = !state.attentionExpanded;
  if (state.dashboard) {
    replacePageContent(renderMediaOverview(state.dashboard));
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
    if ($("#media-records")) {
      await reviewRecordsModal();
      return;
    }
    updateRoute(true);
    const version2 = runtime.renderVersion + 1;
    await renderPage();
    if (version2 === runtime.renderVersion && !$("#overlay").firstChild && document.activeElement === document.body) $(
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
  "media-menu": ({ event }) => {
    event.preventDefault();
    navigate("dashboard");
  },
  "notes-menu": ({ event }) => {
    if (state.page !== "notes") {
      event.preventDefault();
      navigate("notes");
      document.querySelector(".mobile-notes-nav").open = true;
    }
  },
  "article-overview-mode": actionArticleOverviewMode,
  "media-records": reviewRecordsModal,
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
    if (target.dataset.tool === "trash") navigate("settings", "workspace");
    else {
      requestMemoTool(target.dataset.tool);
      navigate("memos");
    }
  },
  "todo-panel": ({ target }) => setTodoPanel(target.dataset.panel),
  "todo-future-delete": ({ id }) => deleteUnscheduledTodo(id),
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
function articleFormCurrent(form, cache2 = runtime.articleFormRecord) {
  return !!cache2 && cache2 === runtime.articleFormRecord && cache2.sessionEpoch === runtime.sessionEpoch && cache2.ticket === runtime.modalRequestVersion && form.isConnected && (cache2.record?.id || "") === (form.dataset.id || "") && String(cache2.record?.version || "") === (form.dataset.version || "");
}
function articleFormRecord(form) {
  const cache2 = runtime.articleFormRecord, id = form.dataset.id || "";
  if (!articleFormCurrent(form, cache2) || !objectValue(cache2.record) || id && (!Number.isSafeInteger(cache2.record.version) || cache2.record.version < 1)) {
    throw new Error("表单记录已失效，请关闭后重新打开再保存。");
  }
  return cache2;
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
  const canonical4 = `${parts[1]}T${parts[2]}:${parts[3] || "00"}.${(parts[4] || "").padEnd(3, "0")}`;
  const stamp2 = /* @__PURE__ */ new Date(`${canonical4}+08:00`);
  if (!Number.isFinite(stamp2.getTime()) || new Date(stamp2.getTime() + 8 * 36e5).toISOString().slice(0, 23) !== canonical4) {
    throw new Error(`${label3}请填写真实日期和时间。`);
  }
  if (original && raw === localDateTime(original)) return new Date(original).toISOString();
  return stamp2.toISOString();
}
function mergedObject(original, fields5) {
  if (original != null && !objectValue(original)) throw new Error("原记录的 JSON 字段无法安全编辑，请重新打开核对。");
  const result = original == null ? {} : structuredClone(original);
  for (const [key, value] of Object.entries(fields5)) {
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
  const body2 = {
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
  if (!body2.account_id || !body2.title) throw new Error("请填写文章标题并选择所属运营账号。");
  if (body2.published_at && body2.started_at && body2.started_at > body2.published_at) {
    throw new Error("流水线开始时间不能晚于发布时间。");
  }
  const editor = textValue(data.draft_editor_url);
  if (editor && !safeLedgerURL(editor)) throw new Error("草稿编辑链接请使用有效的 HTTP/HTTPS 地址。");
  body2.draft_ref = mergedObject(original.draft_ref, {
    pgc_id: textValue(data.draft_pgc_id) || null,
    appmsgid: textValue(data.draft_appmsgid) || null,
    editor_url: editor || null
  });
  body2.timings = mergedObject(original.timings, { finished_at: articleTime(data.finished_at, "流水线结束", original.timings?.finished_at) });
  if (original.id) body2.version = original.version;
  return body2;
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
function uncertainArticleSave(cache2, message) {
  cache2.saveAttempt.phase = "unknown";
  return new Error(message || "保存结果尚未确认，请先在文章列表核对；当前表单不会重复提交，请勿重复新建。");
}
async function reconcileArticleSave(cache2, request, isCurrent) {
  if (!cache2.saveAttempt.id) throw uncertainArticleSave(cache2);
  let remote;
  try {
    remote = await request(`/articles/${encodeURIComponent(cache2.saveAttempt.id)}`);
  } catch {
    if (!isCurrent()) return null;
    throw uncertainArticleSave(cache2, "保存结果尚未确认，当前表单不会再次提交。请稍后重新打开记录核对。");
  }
  if (!isCurrent()) return null;
  if (savedArticle(remote, cache2.saveAttempt)) return remote;
  throw uncertainArticleSave(cache2, "保存结果与当前记录未能确认一致，当前表单不会再次提交。请重新打开最新记录核对。");
}
async function saveArticleForm({ form, data }, { request = api, uuid: uuid5 = () => crypto.randomUUID() } = {}) {
  const cache2 = articleFormRecord(form), isCurrent = () => articleFormCurrent(form, cache2);
  if (cache2.saveAttempt) throw new Error("此表单已有保存请求，请关闭后核对文章列表或最新详情，不要重复新建。");
  const body2 = buildArticleFormPayload(data, cache2.record), id = form.dataset.id || "";
  cache2.saveAttempt = { id, body: structuredClone(body2), key: uuid5(), phase: "saving" };
  let value;
  try {
    value = await request(id ? `/articles/${encodeURIComponent(id)}` : "/articles", {
      method: id ? "PUT" : "POST",
      body: body2,
      headers: { "Idempotency-Key": cache2.saveAttempt.key }
    });
  } catch (error) {
    if (!isCurrent()) return null;
    if (error.status >= 400 && error.status < 500) {
      if (error.status === 409 && error.code === "VERSION_CONFLICT") cache2.saveAttempt.phase = "conflict";
      else delete cache2.saveAttempt;
      throw error;
    }
    value = await reconcileArticleSave(cache2, request, isCurrent);
  }
  if (!isCurrent()) return null;
  if (!savedArticle(value, cache2.saveAttempt)) value = await reconcileArticleSave(cache2, request, isCurrent);
  if (!isCurrent()) return null;
  cache2.saveAttempt.phase = "saved";
  return value;
}

// web/forms.mjs
async function submitSaveViewForm({ data }) {
  const saved = { id: crypto.randomUUID(), name: data.name.trim(), version: 2, filters: { ...state.filters }, columns: [...state.columns] };
  if (!saved.name) throw new Error("请填写视图名称。");
  state.savedViews = state.savedViews.filter((v) => v.name !== saved.name).concat(saved).slice(-20);
  storage.set("haoduoyu.views", JSON.stringify(state.savedViews));
  closeModal();
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
  let body2, path;
  if (form.dataset.type === "daily") {
    path = "/daily-metrics";
    body2 = { account_id: data.account_id, article_id: data.article_id || null, date: data.date, metrics: m, source: data.source.trim() };
  } else {
    path = "/observations";
    body2 = { article_id: data.article_id, kind: data.kind, as_of: iso(data.as_of), collected_at: iso(data.collected_at), metrics: m, source: data.source.trim(), note: data.note };
  }
  await api(path, { method: "POST", body: body2 });
  closeModal();
  await renderPage();
  return;
}
async function submitAccountForm({ form, data, values }) {
  const id = form.dataset.id, epoch = runtime.sessionEpoch, ticket = runtime.modalRequestVersion;
  const profile = String(data.profile_url || "").trim();
  const body2 = id ? { name: data.name.trim(), active: values.has("active") } : { platform: data.platform, name: data.name.trim() };
  if (profile || id && (state.accountProfiles || []).some((row) => row.account_id === id)) body2.profile_url = profile;
  const signature = JSON.stringify(body2);
  if (form.accountSaveSignature !== signature) {
    form.accountSaveSignature = signature;
    form.accountSaveKey = crypto.randomUUID();
  }
  const saved = await api(id ? `/accounts/${encodeURIComponent(id)}` : "/accounts", {
    method: id ? "PUT" : "POST",
    body: body2,
    headers: { "Idempotency-Key": form.accountSaveKey }
  });
  if (epoch !== runtime.sessionEpoch || ticket !== runtime.modalRequestVersion) return;
  const [accounts, profiles] = await Promise.all([api("/accounts"), api("/account-profiles")]);
  if (epoch !== runtime.sessionEpoch || ticket !== runtime.modalRequestVersion) return;
  state.accountProfiles = profiles;
  state.accounts = accounts.sort((a, b) => ["toutiao", "zhihu", "wechat", "other"].indexOf(a.platform) - [
    "toutiao",
    "zhihu",
    "wechat",
    "other"
  ].indexOf(b.platform));
  closeModal();
  if (saved.profile_reused) toast(`该主页已关联「${saved.name}」，已使用现有账号。`);
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
  if (form.id === "todo-future-form") {
    event.preventDefault();
    await submitUnscheduledTodo({ data: Object.fromEntries(new FormData(form)) });
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
  closeMobileMenuOutside(event.target);
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
    if (target.dataset.notesCategory) {
      setDailyNotesRouteCategory(target.dataset.notesCategory);
      navigate("notes");
    } else navigateLink(target.dataset.nav);
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
  if (el.dataset?.futureTodoId) {
    toggleUnscheduledTodo(el);
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
    replacePageContent(renderMediaOverview(state.dashboard));
  } else if (el.id === "trend-metric") {
    state.trendMetric = el.value;
    state.trendOpen = true;
    replacePageContent(renderMediaOverview(state.dashboard));
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
  inputUnscheduledTodo(el);
  inputTodo(el);
  inputTodoTemplate(el);
  if (el.name === "q" && el.closest("#article-filters")) {
    state.filters.q = el.value;
    state.listPage = 1;
    updateRoute();
    clearTimeout(runtime.searchTimer);
    const query = el.value, version2 = runtime.renderVersion;
    runtime.searchTimer = setTimeout(async () => {
      runtime.searchTimer = null;
      if (state.page !== "articles" || state.filters.q !== query || runtime.renderVersion !== version2) return;
      const start = el.selectionStart;
      await renderPage();
      if (runtime.renderVersion === version2 + 1 && !$("#overlay").firstChild) {
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
  if (trapMobileMenuFocus(event)) return;
  if (event.key === "Escape") closeMediaNavigation();
  if (runtime.activePopover) {
    if (event.key === "Tab") {
      const current2 = runtime.activePopover;
      setTimeout(() => {
        if (runtime.activePopover === current2 && !current2.node.contains(document.activeElement)) closePopover({ restoreFocus: false });
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
  handleResponsiveLayout();
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

// web/offline/sw-client.mjs
var VERSION = /^[a-f0-9]{64}$/;
async function beforeRefresh(page) {
  const pending = [], failures = [];
  let collecting = true, dispatchError;
  const detail = Object.freeze({
    waitUntil(promise) {
      if (!collecting) throw new Error("REFRESH_WAIT_CLOSED");
      pending.push(Promise.resolve(promise));
    },
    onFailure(callback) {
      if (!collecting || typeof callback !== "function") throw new Error("REFRESH_FAILURE_CALLBACK_INVALID");
      failures.push(callback);
    }
  });
  const fail5 = (error) => Promise.allSettled(failures.map((callback) => Promise.resolve().then(() => callback(error))));
  try {
    page.dispatchEvent(new page.CustomEvent("haoduoyu:before-refresh", { detail }));
  } catch (error) {
    dispatchError = error;
  }
  collecting = false;
  const results = await Promise.allSettled(pending);
  const rejected = results.find((result) => result.status === "rejected");
  if (dispatchError || rejected) {
    const error = dispatchError || rejected.reason;
    await fail5(error);
    throw error;
  }
  return fail5;
}
function updateAction(page, button2, activate) {
  let preparing = false, activated = false;
  return async () => {
    if (preparing || activated) return;
    preparing = true;
    button2.disabled = true;
    let onFailure;
    try {
      onFailure = await beforeRefresh(page);
      activated = activate();
      if (!activated) throw new Error("REFRESH_ACTIVATION_UNAVAILABLE");
    } catch (error) {
      if (onFailure) await onFailure(error);
      button2.textContent = onFailure ? "更新失败，点此重试" : "草稿保存失败，点此重试";
      button2.setAttribute("aria-label", button2.textContent);
    } finally {
      preparing = false;
      if (!activated) button2.disabled = false;
    }
  };
}
async function startServiceWorker({
  navigator: browser = globalThis.navigator,
  window: page = globalThis.window,
  document: document2 = globalThis.document,
  onSyncRequest
} = {}) {
  if (!browser?.serviceWorker || !page || !document2) return null;
  const serviceWorker = browser.serviceWorker;
  const version2 = document2.querySelector('meta[name="haoduoyu-shell-version"]')?.content;
  const cleanups = [];
  let registration, button2, optedIn = false, reloaded = false, destroyed = false;
  function listen(target, type, callback) {
    target.addEventListener(type, callback);
    cleanups.push(() => target.removeEventListener(type, callback));
  }
  function announce() {
    if (VERSION.test(version2)) serviceWorker.controller?.postMessage({ type: "HAODUOYU_SHELL_CLIENT_VERSION", version: version2 });
  }
  function reload() {
    if (!optedIn || reloaded) return;
    reloaded = true;
    page.location.reload();
  }
  function notice() {
    const waiting = registration?.waiting;
    if (!waiting || !registration.active || button2) return;
    button2 = document2.createElement("button");
    button2.type = "button";
    button2.className = "sw-update-notice";
    button2.textContent = "有新版本";
    button2.setAttribute("aria-label", "有新版本，点此更新");
    button2.setAttribute("aria-live", "polite");
    listen(button2, "click", updateAction(page, button2, () => {
      const update = registration.waiting || (waiting.state === "activated" ? waiting : null);
      if (destroyed || !update || update.state === "redundant") return false;
      optedIn = true;
      listen(update, "statechange", () => {
        if (update.state === "activated") reload();
      });
      try {
        update.postMessage({ type: "HAODUOYU_SHELL_ACTIVATE" });
      } catch (error) {
        optedIn = false;
        throw error;
      }
      if (update.state === "activated") reload();
      return true;
    }));
    document2.body.append(button2);
  }
  function watchInstall() {
    const installing = registration.installing;
    if (!installing) return;
    listen(installing, "statechange", () => {
      if (installing.state === "installed") notice();
    });
  }
  listen(serviceWorker, "controllerchange", () => {
    if (optedIn) reload();
    else announce();
  });
  listen(page, "haoduoyu:native-online", (event) => {
    if (event.detail?.protocol !== 1 || event.detail?.reason !== "network-restored") return;
    if (onSyncRequest) onSyncRequest({ source: "native-online" });
    else page.dispatchEvent(new page.CustomEvent("haoduoyu:sync-request", { detail: { source: "native-online" } }));
  });
  try {
    registration = await serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    announce();
    notice();
    watchInstall();
    listen(registration, "updatefound", watchInstall);
    listen(page, "online", () => {
      registration.update().catch(() => {
      });
    });
    listen(document2, "visibilitychange", () => {
      if (document2.visibilityState === "visible") registration.update().catch(() => {
      });
    });
    return { registration, destroy() {
      destroyed = true;
      for (const remove of cleanups) remove();
      button2?.remove();
    } };
  } catch {
    for (const remove of cleanups) remove();
    return null;
  }
}

// web/offline/ui.mjs
function offlineStatusLabel(state2) {
  if (state2.unsupported) return "需新版";
  if (state2.conflicts) return "有冲突";
  if (!state2.online) return `离线（${state2.pending || 0} 条待同步）`;
  if (state2.error) return "同步失败，等待重试";
  if (state2.phase === "syncing") return "";
  if (state2.pending) return `待同步（${state2.pending} 条）`;
  return "";
}
function textNode(document2, tag, text, className) {
  const node = document2.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function readable(value) {
  if (!value) return "（线上已不存在）";
  const text = value.body !== void 0 ? value.title + "\n" + value.body : value.text ?? value.title;
  if (typeof value.completed === "boolean") return `${text || ""}${value.date ? "\n日期：" + value.date : ""}
完成：${value.completed ? "是" : "否"}
版本：${value.version || ""}`;
  return typeof text === "string" ? text : JSON.stringify(value, null, 2);
}
var absent = (value) => !value || value.deleted || value.deleted_at;
var selectedLocal = (row) => Object.hasOwn(row, "review_local") ? row.review_local : row.local;
var selectedRemote = (row) => Object.hasOwn(row, "review_remote") ? row.review_remote : row.remote;
function conflictLocalChoiceLabel(conflict) {
  const local = selectedLocal(conflict), remote = selectedRemote(conflict), type = conflict.operation.entity_type;
  if (absent(local) && absent(remote)) return "确认删除结果";
  if (conflict.copy_required || absent(remote) || conflict.reason === "MEMO_GROUP_UNAVAILABLE" || type === "todo" && (local?.date !== remote.date || local?.text !== remote.text) || type === "unscheduled_todo" && local?.text !== remote.text || type === "note_entry" && (local?.date !== remote.date || local?.category !== remote.category) || type === "memo_note" && local?.group_id !== remote.group_id) return "另存本地副本";
  return "用本地";
}
function conflictActions(document2, conflict, runtime2, refresh, requests) {
  const actions2 = document2.createElement("div");
  actions2.className = "offline-conflict-actions";
  const localLabel = conflictLocalChoiceLabel(conflict);
  for (const [choice2, label3] of [["use-local", localLabel], ["use-server", "用线上"], ["keep-both", "两份都留"]]) {
    const button2 = textNode(document2, "button", label3, "btn text");
    button2.type = "button";
    button2.disabled = requests.busy(conflict.key);
    button2.addEventListener("click", async () => {
      const controller = requests.begin(conflict.key);
      if (!controller) return;
      for (const control of actions2.children) control.disabled = true;
      const cancel = textNode(document2, "button", "取消", "btn text");
      cancel.type = "button";
      cancel.addEventListener("click", () => controller.abort());
      actions2.append(cancel);
      try {
        const result = await runtime2.resolve(conflict.key, choice2, {
          signal: controller.signal,
          expected: conflictDecisionToken(conflict),
          copyConfirmed: localLabel === "另存本地副本"
        });
        requests.message(conflict.key, result.blocked ? result.resolution_message : "");
      } catch (error) {
        requests.message(conflict.key, error.name === "AbortError" ? "本次选择已取消，原文仍保留。" : error.message);
      } finally {
        requests.end(conflict.key, controller);
        cancel.remove();
        await refresh();
      }
    });
    actions2.append(button2);
  }
  return actions2;
}
function conflictEvidence(document2, conflict) {
  const history2 = document2.createElement("details");
  history2.append(textNode(document2, "summary", "先前对比（原文保留）"));
  for (const row of conflict.remote_history || []) history2.append(textNode(document2, "pre", readable(row)));
  return history2;
}
function queueRows(document2, queue, runtime2, refresh, requests) {
  const root = document2.createDocumentFragment();
  if (!queue.operations.length && !queue.conflicts.length) root.append(textNode(document2, "p", "暂无待处理内容。"));
  const labels = {
    queued: "等待同步",
    sending: "待同步",
    unknown: "结果待核对",
    paused: "需联网核实身份",
    blocked: "需处理",
    conflict: "有冲突"
  };
  for (const operation2 of queue.operations) {
    const item = textNode(
      document2,
      "p",
      `${operation2.needs_upgrade ? "需新版" : labels[operation2.status] || "等待同步"} · ${readable(operation2.local)}`,
      "offline-queue-row"
    );
    if (operation2.error) item.append(textNode(document2, "span", " · " + operation2.error));
    root.append(item);
  }
  for (const conflict of queue.conflicts) {
    const item = document2.createElement("article");
    item.className = "offline-conflict";
    item.append(
      textNode(document2, "h3", "两份内容已保留"),
      textNode(document2, "p", "本机内容"),
      textNode(document2, "pre", readable(selectedLocal(conflict))),
      textNode(document2, "p", "线上内容"),
      textNode(document2, "pre", readable(selectedRemote(conflict)))
    );
    if (conflict.remote_history?.length) item.append(conflictEvidence(document2, conflict));
    if (conflict.resolution_message) item.append(textNode(document2, "p", conflict.resolution_message));
    if (requests.message(conflict.key)) item.append(textNode(document2, "p", requests.message(conflict.key)));
    if (conflict.needs_upgrade) {
      item.append(textNode(document2, "p", "此本机操作需新版页面处理，原内容已保留。"));
      root.append(item);
      continue;
    }
    if (conflict.resolution) {
      const labels2 = {
        queued: "选择已存本机，正在核对线上结果。",
        conflict: "新保存有冲突，请核对下方的新比较内容。",
        blocked: "新保存暂未完成，原文与选择仍保留。",
        paused: "需联网核实后继续，原文与选择仍保留。"
      };
      item.append(textNode(document2, "p", labels2[conflict.resolution.state] || "正在核对线上结果。"));
      root.append(item);
      continue;
    }
    if (conflictLocalChoiceLabel(conflict) === "另存本地副本")
      item.append(textNode(document2, "p", "副本会使用新记录，原记录保持原状。"));
    item.append(conflictActions(document2, conflict, runtime2, refresh, requests));
    root.append(item);
  }
  return root;
}
function pageAnnotation(document2, state2) {
  const page = new URL(document2.defaultView.location.href).searchParams.get("page") || "dashboard";
  const header = document2.querySelector("#page-header");
  let banner = document2.querySelector("#offline-page-note");
  let label3 = "";
  if (page === "settings" && !state2.online) label3 = "设置需联网后使用。";
  if (page === "todos" && state2.partial) label3 = "当前仅显示本机已保存的事项，完整列表需联网读取。";
  if (page === "dashboard" && !state2.online && state2.cachedAt) label3 = "数据截至 " + new Date(state2.cachedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  if (label3 && header) {
    if (!banner) {
      banner = textNode(document2, "p", "", "offline-page-note");
      banner.id = "offline-page-note";
      header.append(banner);
    }
    if (banner.textContent !== label3) banner.textContent = label3;
  } else banner?.remove();
  const content2 = document2.querySelector("#page-content");
  if (content2) {
    const unavailable = page === "settings" && !state2.online;
    content2.inert = unavailable;
    if (unavailable || content2.dataset.offlineHidden === "true") content2.hidden = unavailable;
    content2.dataset.offlineHidden = String(unavailable);
  }
}
function mountRuntimeUI(runtime2, { document: document2, window: window2 }) {
  let state2 = { ...runtime2.state }, expanded = false, rendering = 0;
  const pending = /* @__PURE__ */ new Map(), messages = /* @__PURE__ */ new Map(), requests = {
    busy: (key) => pending.has(key),
    begin(key) {
      if (pending.has(key)) return null;
      const controller = new AbortController();
      pending.set(key, controller);
      return controller;
    },
    end(key, controller) {
      if (pending.get(key) === controller) pending.delete(key);
    },
    message(key, value) {
      if (value !== void 0) messages.set(key, value);
      return messages.get(key) || "";
    },
    cancel() {
      for (const controller of pending.values()) controller.abort();
    }
  };
  const root = document2.createElement("aside");
  root.className = "offline-indicator";
  root.setAttribute("aria-label", "同步状态");
  const button2 = textNode(document2, "button", "", "offline-state-button");
  button2.type = "button";
  button2.setAttribute("aria-controls", "offline-queue");
  button2.setAttribute("aria-expanded", "false");
  const panel = document2.createElement("section");
  panel.id = "offline-queue";
  panel.className = "offline-queue";
  panel.setAttribute("aria-label", "本机待同步内容与冲突");
  panel.hidden = true;
  root.append(button2, panel);
  async function refreshQueue() {
    if (!expanded) return;
    const sequence2 = ++rendering, queue = await runtime2.queue();
    if (sequence2 !== rendering || !expanded) return;
    panel.replaceChildren(textNode(document2, "h2", "同步队列"), queueRows(document2, queue, runtime2, refreshQueue, requests));
  }
  function mount() {
    if (!root.isConnected && document2.body) document2.body.append(root);
    const label3 = offlineStatusLabel(state2);
    root.hidden = !state2.identity || !label3;
    if (button2.textContent !== label3) button2.textContent = label3;
    root.dataset.phase = state2.conflicts ? "conflict" : state2.phase;
    pageAnnotation(document2, state2);
  }
  button2.addEventListener("click", () => {
    expanded = !expanded;
    panel.hidden = !expanded;
    button2.setAttribute("aria-expanded", String(expanded));
    if (!expanded) requests.cancel();
    if (expanded) void refreshQueue();
  });
  const unsubscribe = runtime2.subscribe((next) => {
    state2 = next;
    mount();
    if (expanded) void refreshQueue();
    window2.dispatchEvent(new CustomEvent("haoduoyu-offline-status", { detail: { pending: state2.pending, conflicts: state2.conflicts } }));
  });
  const observer = new MutationObserver(mount);
  observer.observe(document2.body, { childList: true, subtree: true });
  const stop = runtime2.start({ window: window2, document: document2 });
  mount();
  return () => {
    requests.cancel();
    unsubscribe();
    observer.disconnect();
    stop();
    root.remove();
  };
}
function startOfflineUI({ document: document2 = globalThis.document, window: window2 = globalThis.window } = {}) {
  if (!document2?.body || !window2) return () => {
  };
  let stop = () => {
  };
  const unsubscribe = onOfflineRuntime((runtime2) => {
    stop();
    stop = mountRuntimeUI(runtime2, { document: document2, window: window2 });
  });
  return () => {
    unsubscribe();
    stop();
  };
}

// web/main.mjs
startOfflineUI();
registerEvents2();
startServiceWorker();
init();
