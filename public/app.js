var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e2) {
    throw err = [e2], e2;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// web/core/constants.mjs
var platforms, modeLabels, kindLabels, statusLabels, slotLabels, writerLabels, illustratorLabels, metrics, nav, settingsTabs, legacyPages, defaultFilters, articleColumns, articleStatuses, articleChoices, defaultColumns;
var init_constants = __esm({
  "web/core/constants.mjs"() {
    platforms = { toutiao: "今日头条", zhihu: "知乎", wechat: "微信公众号", other: "其他平台" };
    modeLabels = { manual: "人工", automatic: "自动化", mixed: "人工＋自动化", unknown: "未记录" };
    kindLabels = { latest: "最新数据", d1: "第 1 天观察", d3: "第 3 天观察", d7: "第 7 天观察" };
    statusLabels = { drafting: "起草中", illustrated: "已配图", draft_saved: "草稿已存", published: "已发布", failed: "受阻" };
    slotLabels = { zh1: "知乎 1", zh2: "知乎 2", tt1: "头条 1", tt2: "头条 2", zh3: "知乎 3", tt3: "头条 3", gzh: "公众号" };
    writerLabels = { dedao: "得到大脑", gemini_web: "Gemini", human: "本人", other: "其他" };
    illustratorLabels = { codex: "Codex", pil: "PIL", human: "本人" };
    metrics = { reads: "阅读", impressions: "展现", likes: "点赞", comments: "评论", favorites: "收藏", shares: "分享", approvals: "赞同", reading_users: "阅读人数" };
    nav = [
      { id: "review", label: "内容复盘", icon: "chart" },
      { id: "todos", label: "每日待办", icon: "check" },
      { id: "notes", label: "碎碎念", icon: "edit" },
      { id: "ai-reports", label: "AI 日报", icon: "calendar" },
      { id: "settings", label: "设置", icon: "settings" }
    ];
    settingsTabs = { workspace: "回收站", todo: "待办切换", ai: "AI", openai: "OpenAI API", keys: "AI 授权", security: "安全", log: "操作日志" };
    legacyPages = { management: "workspace", accounts: "workspace", keys: "keys" };
    defaultFilters = () => ({
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
    articleColumns = {
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
    articleStatuses = { no_snapshot: "未采集", missing_reads: "缺阅读数据", missing_likes: "缺点赞数据", missing_comments: "缺评论数据", incomplete: "指标不完整", zero_reads: "真实0阅读", date_unverified: "日期待核实" };
    articleChoices = {
      topic: { entertainment: "文娱（推断）", insurance: "保险（推断）", unknown: "未推断" },
      mode: modeLabels,
      group: { account: "按账号", mode: "按生产方式" }
    };
    defaultColumns = ["account", "reads", "likes", "comments", "as_of"];
  }
});

// web/core/state.mjs
var state_exports = {};
__export(state_exports, {
  runtime: () => runtime,
  state: () => state
});
var state, runtime;
var init_state = __esm({
  "web/core/state.mjs"() {
    init_constants();
    state = {
      me: null,
      savedViews: [],
      accounts: [],
      accountProfiles: [],
      page: "review",
      settingsTab: "workspace",
      account: "V字",
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
    runtime = {
      renderVersion: 0,
      lastFocus: null,
      activePopover: null,
      popoverId: 0,
      modalRequestVersion: 0,
      menuFocus: null,
      entryObserver: null,
      entryBlocks: [],
      articleIndexGeneration: 0,
      sessionEpoch: 0
    };
  }
});

// web/core/requests.mjs
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
function requestKey(path, options4, envelope2) {
  const settings = {};
  for (const key of Object.keys(options4).sort()) {
    if (key === "signal") continue;
    const value = options4[key];
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
function pendingGet(path, options4, envelope2, context, factory) {
  assertRequestActive(context, options4.signal);
  const key = requestKey(path, options4, envelope2) ?? /* @__PURE__ */ Symbol("unshared request");
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
  return subscribeRequest(entry, options4.signal);
}
var pageContext, modalContext, backgroundContext, backgroundKey, contextId;
var init_requests = __esm({
  "web/core/requests.mjs"() {
    init_state();
    pageContext = null, modalContext = null, backgroundContext = null, backgroundKey = "";
    contextId = 0;
  }
});

// web/core/format.mjs
function displayTime(value) {
  const stamp3 = Date.parse(value), diff = Date.now() - stamp3;
  return !Number.isFinite(stamp3) ? "未记录" : diff >= 0 && diff < 864e5 ? `${Math.floor(diff / 36e5)} 小时前` : time(value, bjtDate(value).slice(0, 4) === bjtDate().slice(0, 4));
}
function safeURL(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
var num, compact, bjtDate, time, duration, localDateTime, iso, metricData, accountLabel, accountName, selectedQuery, rowsForAccount;
var init_format = __esm({
  "web/core/format.mjs"() {
    init_constants();
    init_state();
    num = (value) => value === null || value === void 0 || value === "" ? "—" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(Number(value));
    compact = (value) => value == null ? "—" : Number(value) >= 1e4 ? `${num(Number(value) / 1e4)}万` : num(value);
    bjtDate = (value = /* @__PURE__ */ new Date()) => new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(value));
    time = (value, short = false) => {
      if (!value) return "未记录";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return "未记录";
      return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", ...short ? {} : {
        year: "numeric",
        second: "2-digit"
      }, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    };
    duration = (seconds) => {
      if (seconds == null) return "未记录";
      const n = Number(seconds);
      if (n < 60) return `${Math.round(n)} 秒`;
      if (n < 3600) return `${Math.round(n / 60)} 分钟`;
      const h = Math.floor(n / 3600), m = Math.round(n % 3600 / 60);
      return m === 60 ? `${h + 1} 小时` : `${h} 小时${m ? ` ${m} 分钟` : ""}`;
    };
    localDateTime = (value) => {
      if (!value) return "";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return "";
      return new Date(d.getTime() + 8 * 36e5).toISOString().slice(0, 16);
    };
    iso = (value) => value ? (/* @__PURE__ */ new Date(`${value}:00+08:00`)).toISOString() : null;
    metricData = (item) => {
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
    accountLabel = (account3) => `${platforms[account3.platform] || account3.platform} · ${account3.name}`;
    accountName = (id2) => {
      const a = state.accounts.find((a2) => a2.id === id2);
      return a ? accountLabel(a) : "未找到账号";
    };
    selectedQuery = () => state.account ? `account_id=${encodeURIComponent(state.account)}` : "";
    rowsForAccount = (rows) => state.account ? rows.filter((a) => a.account_id === state.account) : rows;
  }
});

// web/core/todos-state.mjs
function todoOwner() {
  return JSON.stringify([runtime.sessionEpoch, state.me?.id ?? null]);
}
function resetTodos() {
  if (typeof window !== "undefined" && typeof Event === "function") window.dispatchEvent(new Event("haoduoyu-todos-reset"));
  todosState.owner = todoOwner();
  todosState.days.clear();
  todosState.today = bjtDate();
  todosState.calendarMonth = "";
  todosState.calendarDate = "";
  todosState.preferences = { mode: "strike", version: 0, loaded: false, pending: null, error: "" };
}
function validTodoDate(date) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
  const parsed2 = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed2.getTime()) && parsed2.toISOString().slice(0, 10) === date;
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
function mergeTodo(day6, item) {
  const index = day6.items.findIndex((row) => row.id === item.id);
  if (index < 0) day6.items.push(item);
  else if (day6.items[index].version <= item.version) day6.items[index] = item;
}
function todoTemplateAdded(day6, id2) {
  return day6.items.some((item) => item.date === day6.date && item.template_id === id2 && !item.deleted_at);
}
var todosState;
var init_todos_state = __esm({
  "web/core/todos-state.mjs"() {
    init_format();
    init_state();
    todosState = { owner: "", days: /* @__PURE__ */ new Map(), today: "", calendarMonth: "", calendarDate: "" };
  }
});

// web/core/session-index-state.mjs
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
var articleIndexes;
var init_session_index_state = __esm({
  "web/core/session-index-state.mjs"() {
    init_requests();
    init_state();
    init_todos_state();
    articleIndexes = /* @__PURE__ */ new Map();
  }
});

// web/core/dom.mjs
var $, $$, e, icons, icon;
var init_dom = __esm({
  "web/core/dom.mjs"() {
    $ = (q, root3 = document) => root3.querySelector(q);
    $$ = (q, root3 = document) => [...root3.querySelectorAll(q)];
    e = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    icons = {
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
    icon = (name, size = 17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.articles}</svg>`;
  }
});

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
  for (const node2 of container.querySelectorAll(".publication-bars i[data-chart-color],.legend-dot[data-chart-color]")) {
    const color = node2.dataset.chartColor;
    node2.style.setProperty("--plot-color", /^var\(--p-(?:toutiao|zhihu|wechat|other)\)$/.test(color) ? color : "var(--p-other)");
    if (node2.hasAttribute("data-chart-height")) {
      const height = Number(node2.dataset.chartHeight);
      node2.style.setProperty("--h", Number.isFinite(height) && height >= 0 && height <= 80 ? `${height}px` : "0px");
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
var init_entry = __esm({
  "web/ui/entry.mjs"() {
    init_dom();
    init_state();
  }
});

// web/ui/popover.mjs
function closePopover({ restoreFocus = true } = {}) {
  if (!runtime.activePopover) return;
  const { node: node2, trigger } = runtime.activePopover;
  runtime.activePopover = null;
  node2.remove();
  trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus && trigger.isConnected) trigger.focus();
}
function popover(trigger, body2, { menu = false, label: label3 = "说明" } = {}) {
  if (runtime.activePopover?.trigger === trigger) {
    closePopover();
    return;
  }
  closePopover();
  const id2 = trigger.getAttribute("aria-controls") || `popover-${++runtime.popoverId}`, node2 = document.createElement("div");
  trigger.setAttribute("aria-controls", id2);
  trigger.setAttribute("aria-expanded", "true");
  node2.id = id2;
  node2.className = "popover";
  node2.setAttribute("role", menu ? "menu" : "dialog");
  node2.setAttribute("aria-label", label3);
  node2.tabIndex = -1;
  node2.innerHTML = body2;
  (trigger.closest("[role=dialog]") || document.body).append(node2);
  runtime.activePopover = { node: node2, trigger, menu };
  const anchor = trigger.getBoundingClientRect(), r = node2.getBoundingClientRect();
  node2.style.left = `var(--popover-left,${Math.max(16, Math.min(anchor.right - r.width, innerWidth - r.width - 16))}px)`;
  node2.style.top = `var(--popover-top,${Math.max(16, Math.min(anchor.bottom + 8, innerHeight - r.height - 16))}px)`;
  (node2.querySelector('button,a[href],input:not([type=hidden]),select,[tabindex="0"]') || node2).focus();
}
var init_popover = __esm({
  "web/ui/popover.mjs"() {
    init_state();
  }
});

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
function renderInitializationError(message, onRetry, { status } = {}) {
  stopPageEntry();
  closePopover({ restoreFocus: false });
  runtime.modalRequestVersion++;
  runtime.renderVersion++;
  const explanation = status === 429 ? "请求较多，请稍后重试。" : "未能完成连接或读取，请检查网络后重试。";
  $("#app").innerHTML = `<main id="main" class="minimal-login"><section class="login-card" role="alert"><div class="brand login-brand"><span class="brand-mark">${icon("fish", 27)}</span><h1 class="brand-title">工作台暂时无法打开</h1></div><p>${explanation}</p><p>${e(message || "请稍后重试。")}</p><button id="init-retry" class="btn primary" type="button">重新连接</button></section></main>`;
  $("#init-retry")?.addEventListener("click", onRetry);
}
var init_login = __esm({
  "web/pages/login.mjs"() {
    init_dom();
    init_session_index_state();
    init_state();
    init_entry();
    init_popover();
  }
});

// web/ui/modal.mjs
function openModal(title, body2, { drawer: drawer2 = false, context = "" } = {}) {
  cancelModalRequests();
  closePopover();
  runtime.modalRequestVersion++;
  if (!$("#overlay").contains(document.activeElement)) runtime.lastFocus = document.activeElement;
  $("#overlay").innerHTML = `<div class="modal-backdrop ${drawer2 ? "drawer-backdrop" : ""}"><section class="modal ${drawer2 ? "drawer" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><div>${context}<h2 id="modal-title">${e(title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon("close", 20)}</button></header><div class="modal-body">${body2}</div></section></div>`;
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
var init_modal = __esm({
  "web/ui/modal.mjs"() {
    init_requests();
    init_dom();
    init_state();
    init_popover();
  }
});

// web/offline/db.mjs
function entityKey(scope, id2) {
  if (typeof scope !== "string" || !scope || typeof id2 !== "string" || !id2) {
    throw new TypeError("Offline records require an explicit scope and identity");
  }
  return JSON.stringify([scope, id2]);
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
function idbRequest(request2) {
  return new Promise((resolve, reject) => {
    request2.onsuccess = () => resolve(request2.result);
    request2.onerror = () => reject(request2.error);
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
    const request2 = transaction.objectStore(name).count();
    request2.onsuccess = () => {
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
    const timer2 = setTimeout(() => {
      keeper.stop();
      try {
        tx.abort();
      } catch {
      }
    }, 1e4);
    const done2 = () => {
      keeper.stop();
      clearTimeout(timer2);
    };
    tx.oncomplete = () => {
      done2();
      finished ? resolve(result) : reject(new Error("Offline transaction became inactive"));
    };
    tx.onabort = () => {
      done2();
      reject(tx.error || new Error("Offline transaction aborted"));
    };
    tx.onerror = () => {
    };
    Promise.resolve().then(() => callback(transactionAPI(tx, keeper.schedule))).then((value) => {
      result = value;
      finished = true;
      keeper.finish();
    }).catch((error) => {
      done2();
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
    const request2 = indexedDB.open(name, 1);
    let blocked2 = false;
    request2.onupgradeneeded = () => {
      for (const store of OFFLINE_STORES) {
        if (!request2.result.objectStoreNames.contains(store)) {
          request2.result.createObjectStore(store, { keyPath: "key" });
        }
      }
    };
    request2.onerror = () => reject(request2.error);
    request2.onblocked = () => {
      blocked2 = true;
      reject(new Error("Close the other tab before upgrading offline storage"));
    };
    request2.onsuccess = () => {
      const database = request2.result;
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
var OFFLINE_STORES;
var init_db = __esm({
  "web/offline/db.mjs"() {
    OFFLINE_STORES = Object.freeze(["entities", "outbox", "conflicts", "meta"]);
  }
});

// web/offline/document.mjs
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
var localMarker, documents, isLocalDocument, documentValue, documentState;
var init_document = __esm({
  "web/offline/document.mjs"() {
    localMarker = /* @__PURE__ */ Symbol("haoduoyu-local-durable-document");
    documents = /* @__PURE__ */ new WeakMap();
    isLocalDocument = (value) => Boolean(value && documents.has(value));
    documentValue = (value) => documents.get(value)?.local || value;
    documentState = (value) => documents.get(value) || null;
  }
});

// web/offline/read-only.mjs
async function latestCompleteSnapshot(tx, scope) {
  const v1 = await tx.get("meta", entityKey(scope, "snapshot"));
  const v2 = await tx.get("meta", entityKey(scope, "snapshot-v2"));
  const valid2 = (value) => value?.value?.index?.complete === true && value.value.index.scope_id === scope;
  if (!valid2(v1)) return valid2(v2) ? v2 : null;
  if (!valid2(v2)) return v1;
  return (v2.value.verified_at || 0) >= (v1.value.verified_at || 0) ? v2 : v1;
}
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
function matches(entity, route2) {
  if (route2.kind === "reminders") return entity.entity_id.startsWith("work-reminder:");
  return route2.source === "legacy" ? entity.entity_id.startsWith("legacy-" + route2.category + ":") : entity.entity_id.startsWith("note-entry:");
}
async function readOnlySnapshot({ db, scope, route: route2, getScope, getGeneration }) {
  const generation = getGeneration();
  const result = await db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const snapshot = await latestCompleteSnapshot(tx, scope), index = snapshot?.value?.index;
    if (index?.complete !== true || index.scope_id !== scope) throw missing();
    const rows = (await tx.getAll("entities")).filter((row) => row.scope === scope && matches(row, route2));
    for (const expected of index.entities.filter((row) => matches(row, route2) && !row.deleted_at)) {
      if (!rows.some((row) => row.entity_id === expected.entity_id && row.server)) throw missing();
    }
    const active5 = rows.filter((row) => row.dirty || !row.remote_missing).map((row) => route2.source === "note_entry" && row.dirty ? row.local : row.server).filter((row) => row && !row.deleted && !row.deleted_at);
    let data3;
    if (route2.kind === "reminders") {
      const items = active5.filter((row) => row.date === route2.date).map((row) => {
        if (typeof row.summary !== "string" || !Number.isFinite(Date.parse(row.updated_at))) throw missing();
        return {
          id: row.id || row.source_id,
          date: row.date,
          summary: row.summary,
          source_key: row.source_key,
          version: row.version,
          updated_at: row.updated_at
        };
      });
      data3 = { date: route2.date, can_edit: false, items, snapshot_complete: true };
    } else {
      const dates = [...new Set(active5.filter((row) => row.category === route2.category && day(row.date) && (route2.source !== "legacy" || typeof row.text === "string" && row.text !== "") && (!route2.before || row.date < route2.before)).map((row) => row.date))].sort().reverse();
      const selected = dates.slice(0, route2.size), has_more = dates.length > route2.size;
      data3 = { dates: selected, has_more, next_before: has_more ? selected.at(-1) : null, snapshot_complete: true };
    }
    return { data: data3, saved_at: snapshot.value.verified_at || null };
  });
  if (scope !== getScope() || generation !== getGeneration()) throw missing();
  return result;
}
var day, missing;
var init_read_only = __esm({
  "web/offline/read-only.mjs"() {
    init_db();
    day = (value) => typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
    missing = () => Object.assign(new Error("此内容尚未完整缓存在本机，请联网读取。"), { code: "OFFLINE_CACHE_MISS" });
  }
});

// web/offline/notes.mjs
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
function checkedResponse(route2, value, labelsV1) {
  const invalid4 = () => fail("碎碎念读取结果不完整，未覆盖本机内容。", "OFFLINE_RESPONSE_INVALID");
  if (route2.kind === "note_entry") {
    if (!isNoteApiRow(value) || value.id !== route2.id || labelsV1 && !awareLabel(value)) throw invalid4();
    return structuredClone(value);
  }
  if (!isObject(value) || labelsV1 && value.labels_version !== 1 || value.category !== route2.category || value.date !== route2.date || typeof value.can_edit !== "boolean" || !Array.isArray(value.entries) || value.entries.length > 200) throw invalid4();
  const ids = /* @__PURE__ */ new Set();
  for (const row of value.entries) {
    if (!isNoteApiRow(row) || labelsV1 && !awareLabel(row) || row.category !== route2.category || row.date !== route2.date || row.deleted || row.can_edit !== value.can_edit || ids.has(row.id)) throw invalid4();
    ids.add(row.id);
  }
  return structuredClone(value);
}
function inRoute(entity, route2) {
  if (!noteEntity(entity)) return false;
  if (route2.kind === "note_entry") return entity.entity_id === "note-entry:" + route2.id;
  const row = entity.dirty ? entity.local : entity.server || entity.api_server;
  return row?.category === route2.category && row?.date === route2.date;
}
function serverFence(rows, route2, owner2) {
  return JSON.stringify(rows.filter((row) => row.scope === owner2 && inRoute(row, route2)).map((row) => [row.entity_id, row.server || null, row.api_server || null, row.remote_missing === true]).sort((a, b) => a[0].localeCompare(b[0])));
}
function localValue(entity, capability) {
  const row = entity.dirty ? entity.local : entity.server;
  if (!row || !uuidPattern.test(row.id || row.source_id) || !["life", "work"].includes(row.category) || !validDay(row.date) || !Number.isSafeInteger(row.version) || row.version < 1) throw missing2();
  if (!removed(row) && typeof row.text !== "string") throw missing2();
  const evidence2 = entity.label_evidence;
  const matches2 = evidence2 && evidence2.version === row.version && evidence2.category === row.category && evidence2.date === row.date && evidence2.created_at === row.created_at;
  return {
    id: row.id || row.source_id,
    category: row.category,
    date: row.date,
    ...awareLabel(row) ? { labels_version: 1, label: row.label } : matches2 ? { labels_version: 1, label: evidence2.label } : {},
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
  async function read2(path, route2 = noteReadRoute(path)) {
    if (!route2) throw missing2();
    const owner2 = capture();
    const result = await db.transaction(["entities", "outbox", "conflicts", "meta"], "readonly", async (tx) => {
      owner2.active();
      const rows = await load(tx, owner2.scope), cap = await tx.get("meta", capabilityKey(owner2.scope));
      const capability2 = cap?.scope === owner2.scope ? cap.can_edit : null;
      const cached = await tx.get("meta", entityKey(owner2.scope, "get:" + path));
      const snapshot = await latestCompleteSnapshot(tx, owner2.scope);
      const complete = snapshot?.value?.index?.complete === true && snapshot.value.index.scope_id === owner2.scope;
      const entities = rows.entities.filter((row) => inRoute(row, route2) && (row.dirty || !row.remote_missing && row.server));
      if (route2.kind === "note_entry") {
        if (!entities.length) throw missing2();
        owner2.active();
        return {
          data: projectEntity(entities[0], capability2, rows.outbox, rows.conflicts),
          saved_at: cached?.saved_at || snapshot?.value?.verified_at || null
        };
      }
      if (!cached && !complete && !entities.some((row) => row.dirty)) throw missing2();
      if (complete && Array.isArray(snapshot.value.index.entities)) {
        const present = new Set(entities.map((row) => row.entity_id));
        if (snapshot.value.index.entities.some((row) => row.entity_id?.startsWith("note-entry:") && row.date === route2.date && row.entity_type === route2.category + "_note" && !row.deleted_at && !present.has(row.entity_id)))
          throw missing2();
      }
      const entries = entities.filter((row) => !removed(row.dirty ? row.local : row.server)).map((row) => projectEntity(row, capability2, rows.outbox, rows.conflicts));
      if (entries.length > 200) throw fail("本机当日记录较多，原文已保留，请联网核对。", "OFFLINE_CACHE_LIMIT");
      entries.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || a.id.localeCompare(b.id));
      owner2.active();
      return {
        data: {
          category: route2.category,
          date: route2.date,
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
    const route2 = typeof pathOrRoute === "string" ? noteReadRoute(pathOrRoute) : pathOrRoute, owner2 = capture();
    if (!route2) throw missing2();
    const result = await db.transaction(["entities"], "readonly", async (tx) => serverFence(await tx.getAll("entities"), route2, owner2.scope));
    owner2.active();
    return result;
  }
  return { read: read2, capability, fence };
}
function writingMethods(context) {
  const { db, capture, capabilityKey, now } = context;
  async function write(path, route2, value, { baseline } = {}) {
    route2 ||= noteReadRoute(path);
    if (!route2) throw missing2();
    const owner2 = capture(), data3 = checkedResponse(route2, value, context.labelsV1);
    const incoming = route2.kind === "note_entry" ? [data3] : data3.entries;
    await db.transaction(["entities", "meta"], "readwrite", async (tx) => {
      owner2.active();
      const rows = await tx.getAll("entities");
      if (baseline !== void 0 && baseline !== serverFence(rows, route2, owner2.scope))
        throw fail("本机刚确认了新版本，请重新读取完整记录。", "OFFLINE_CACHE_CHANGED");
      const found = new Set(incoming.map((row) => "note-entry:" + row.id));
      if (route2.kind === "note_entries") for (const old of rows) {
        if (old.scope === owner2.scope && inRoute(old, route2) && !found.has(old.entity_id))
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
      await tx.put("meta", { key: entityKey(owner2.scope, "get:" + path), scope: owner2.scope, path, data: data3, saved_at: now() });
      await tx.put("meta", { key: capabilityKey(owner2.scope), scope: owner2.scope, can_edit: data3.can_edit, verified_at: now() });
      owner2.active();
    });
    owner2.active();
    const result = await context.read(path, route2);
    owner2.active();
    return result.data;
  }
  async function captureAcknowledged() {
    const owner2 = capture();
    const count3 = await db.transaction(["entities"], "readwrite", async (tx) => {
      owner2.active();
      let count4 = 0;
      for (const entity of await tx.getAll("entities")) {
        if (entity.scope !== owner2.scope || !noteEntity(entity) || !isNoteApiRow(entity.server) || entity.api_server?.version > entity.server.version) continue;
        await tx.put("entities", { ...entity, api_server: structuredClone(entity.server) });
        count4++;
      }
      owner2.active();
      return count4;
    });
    owner2.active();
    return count3;
  }
  return { write, captureAcknowledged };
}
function createNotesCache(options4) {
  const context = notesContext(options4);
  const reading = readingMethods(context);
  Object.assign(context, reading);
  return { ...reading, ...writingMethods(context) };
}
var uuidPattern, hashPattern, isObject, fail, missing2, validDay, timestamp, noteEntity, removed, liveOperation;
var init_notes = __esm({
  "web/offline/notes.mjs"() {
    init_db();
    init_document();
    init_read_only();
    uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    hashPattern = /^[a-f0-9]{64}$/;
    isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
    fail = (message, code) => Object.assign(new Error(message), { code });
    missing2 = () => fail("此记录尚未完整保存在本机，请联网读取一次。", "OFFLINE_CACHE_MISS");
    validDay = (value) => typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
    timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
    noteEntity = (row) => row?.entity_id?.startsWith("note-entry:");
    removed = (row) => Boolean(row && (row.deleted || row.deleted_at));
    liveOperation = (row) => !["acked", "archived"].includes(row.status);
  }
});

// web/offline/cache.mjs
function offlineReadRoute(path) {
  const url = new URL(path, "https://offline.invalid");
  if (url.origin !== "https://offline.invalid" || url.hash) return null;
  const route2 = url.pathname, query = url.searchParams;
  if (["/work-reminders", "/note-entries/dates", "/daily-notes/dates"].includes(route2)) return readOnlyRoute(path);
  if (route2 === "/todos" && [...query.keys()].every((key) => key === "date") && query.getAll("date").length === 1 && dayPattern.test(query.get("date"))) return { kind: "todo", date: query.get("date") };
  if (route2 === "/unscheduled-todos" && !url.search) return { kind: "unscheduled_todo" };
  if (route2 === "/todo-templates" && !url.search) return { kind: "template" };
  if (route2 === "/accounts" && !url.search) return { kind: "accounts" };
  if (route2 === "/overview") return { kind: "overview" };
  if (route2 === "/daily-notes" && query.getAll("date").length === 1 && dayPattern.test(query.get("date")) && [...query.keys()].every((key) => ["date", "category"].includes(key)) && query.getAll("category").length <= 1 && (!query.has("category") || ["life", "work"].includes(query.get("category"))))
    return { kind: "legacy", date: query.get("date"), category: query.get("category") || "life" };
  if (route2 === "/note-entries" || route2.startsWith("/note-entries/")) return noteReadRoute(path);
  if (route2 === "/memos" && !url.search) return { kind: "memos" };
  if (/^\/memos\/notes\/[a-f0-9-]{36}$/i.test(route2)) return { kind: "memo_note" };
  return null;
}
function safeIdentity(value) {
  if (!value || typeof value.id !== "string" || !value.id || typeof value.username !== "string")
    throw new Error("身份读取不完整，未启用本机数据。");
  return { id: value.id, username: value.username, ...value.publicBusiness === true ? { publicBusiness: true } : {} };
}
function safeAccounts(value) {
  if (!Array.isArray(value)) throw new Error("账户读取不完整。");
  if (value.some((row) => !row || ![0, 1].includes(row.active))) throw new Error("账户状态读取不完整。");
  const fields5 = ["id", "name", "platform", "active", "account_name", "position", "created_at", "updated_at"];
  return value.map((row) => Object.fromEntries(fields5.filter((key) => row[key] !== void 0).map((key) => [key, row[key]])));
}
function checkedResponse2(route2, value) {
  const invalid4 = () => Object.assign(new Error("读取结果不完整，未覆盖本机数据。"), { code: "OFFLINE_RESPONSE_INVALID" });
  if (value === void 0 || value === null) throw invalid4();
  if (["todo", "template", "unscheduled_todo"].includes(route2.kind) && (!Array.isArray(value.items) || value.items.some((row) => !row || !uuidPattern2.test(row.id) || !Number.isSafeInteger(row.version) || row.version < 1 || typeof row.text !== "string" || !row.text.trim() || row.text.length > 500 || !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.updated_at)) || route2.kind === "todo" && (row.date !== route2.date || typeof row.completed !== "boolean" || row.deleted_at !== null) || route2.kind === "unscheduled_todo" && (typeof row.completed !== "boolean" || row.deleted_at !== null || Object.hasOwn(row, "date")))))
    throw invalid4();
  return route2.kind === "accounts" ? safeAccounts(value) : clone(value);
}
function belongs(row, route2) {
  const value = offlineValue(row);
  return row.entity_id.startsWith(route2.kind + ":") && value && (route2.kind !== "todo" || value.date === route2.date);
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
function serverFence2(rows, route2, owner2) {
  if (!["todo", "template", "unscheduled_todo"].includes(route2.kind)) return null;
  return JSON.stringify(rows.filter((row) => row.scope === owner2 && belongs(row, route2)).map((row) => [row.entity_id, route2.kind === "todo" ? todoFence(row.server) : row.server || null, row.remote_missing === true]).sort((a, b) => a[0].localeCompare(b[0])));
}
function overlay(value, route2, entities, dirtyOnly) {
  if (!["todo", "template", "unscheduled_todo"].includes(route2.kind)) return value;
  const items = new Map(value.items.map((row) => [row.id, row]));
  for (const entity of entities) {
    if (!belongs(entity, route2) || dirtyOnly && !entity.dirty) continue;
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
      const identity6 = safeIdentity(me);
      await db.transaction(["meta"], "readwrite", (tx) => tx.put("meta", { key, identity: identity6, scope, verified_at: now() }));
      return identity6;
    },
    forgetIdentity: () => db.transaction(["meta"], "readwrite", (tx) => tx.delete("meta", key))
  };
}
async function legacySnapshot(db, owner2, route2) {
  return db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const v1 = await tx.get("meta", entityKey(owner2, "snapshot"));
    const v2 = await tx.get("meta", entityKey(owner2, "snapshot-v2"));
    const snapshot = (v2?.value?.verified_at || 0) >= (v1?.value?.verified_at || 0) ? v2 || v1 : v1;
    if (snapshot?.value?.index?.complete !== true || snapshot.value.index.scope_id !== owner2) throw missing3();
    const entity = await tx.get("entities", entityKey(owner2, "legacy-" + route2.category + ":" + route2.date));
    const row = !entity?.remote_missing && entity?.server;
    if (!row && snapshot.value.index.entities?.some((value) => value.entity_id === "legacy-" + route2.category + ":" + route2.date)) throw missing3();
    if (row && (!Number.isSafeInteger(row.version) || row.version < 1 || !row.deleted_at && typeof row.text !== "string")) throw missing3();
    const data3 = {
      date: route2.date,
      text: row?.text || "",
      version: row?.version || 0,
      updated_at: row?.updated_at || null,
      deleted: Boolean(row?.deleted_at),
      can_edit: false,
      snapshot_complete: true
    };
    return { data: data3, saved_at: snapshot.value.verified_at || null };
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
    const route2 = offlineReadRoute(path);
    if (!route2) return value;
    if (["note_entries", "note_entry"].includes(route2.kind)) return notes.write(path, route2, value, { baseline });
    const owner2 = scope(), generation = getGeneration(), data3 = checkedResponse2(route2, value), key = entityKey(owner2, "get:" + path);
    const active5 = () => {
      if (scope() !== owner2 || getGeneration() !== generation)
        throw Object.assign(new Error("身份范围已变化，本次读取未保存。"), { code: "OFFLINE_SCOPE_CHANGED" });
    };
    await db.transaction(["meta", "entities"], "readwrite", async (tx) => {
      active5();
      const rows = await tx.getAll("entities");
      if (baseline !== void 0 && baseline !== serverFence2(rows, route2, owner2))
        throw Object.assign(new Error("本机刚同步了新版本，请重新读取完整列表。"), { code: "OFFLINE_CACHE_CHANGED" });
      await tx.put("meta", { key, scope: owner2, path, data: data3, saved_at: now() });
      if (!["todo", "template", "unscheduled_todo"].includes(route2.kind)) {
        active5();
        return;
      }
      const found = new Set(data3.items.map((row) => row.id));
      for (const old of rows) {
        if (old.scope === owner2 && belongs(old, route2) && !found.has(offlineValue(old).id))
          await tx.put("entities", { ...old, remote_missing: true });
      }
      for (const row of data3.items) {
        const entity_id = route2.kind + ":" + row.id, storageKey = entityKey(owner2, entity_id);
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
          ...route2.kind === "todo" ? { needs_api_refresh: false } : {}
        });
      }
      active5();
    });
    const result = overlay(route2.kind === "accounts" ? value : data3, route2, await entities(owner2), true);
    active5();
    return result;
  }
  const entities = (owner2) => db.transaction(["entities"], "readonly", async (tx) => (await tx.getAll("entities")).filter((row) => row.scope === owner2));
  async function read2(path) {
    const route2 = offlineReadRoute(path);
    if (!route2) throw missing3();
    if (["note_entries", "note_entry"].includes(route2.kind)) return notes.read(path, route2);
    const owner2 = scope(), generation = getGeneration();
    const cached = await db.transaction(["meta"], "readonly", (tx) => tx.get("meta", entityKey(owner2, "get:" + path)));
    if (["reminders", "dates"].includes(route2.kind)) {
      try {
        return await readOnlySnapshot({ db, scope: owner2, route: route2, getScope, getGeneration });
      } catch (error) {
        if (error.code !== "OFFLINE_CACHE_MISS" || !cached) throw error;
      }
    }
    if (!cached || cached.data === void 0) {
      if (route2.kind === "legacy") {
        const result2 = await legacySnapshot(db, owner2, route2);
        if (scope() !== owner2 || getGeneration() !== generation) throw missing3();
        return result2;
      }
      const local = ["todo", "unscheduled_todo"].includes(route2.kind) ? (await entities(owner2)).filter((row) => row.dirty && belongs(row, route2)) : [];
      if (!local.length) throw missing3();
      const data3 = route2.kind === "todo" ? {
        date: route2.date,
        today: new Date(now() + 8 * 36e5).toISOString().slice(0, 10),
        completed_mode: "strike",
        preferences_version: 0,
        items: [],
        offline_partial: true
      } : { items: [], offline_partial: true };
      if (scope() !== owner2 || getGeneration() !== generation) throw missing3();
      return { data: overlay(data3, route2, local, false), saved_at: null };
    }
    const result = route2.kind === "legacy" ? { ...clone(cached.data), can_edit: false } : overlay(clone(cached.data), route2, await entities(owner2), false);
    if (scope() !== owner2 || getGeneration() !== generation) throw missing3();
    return { data: result, saved_at: cached.saved_at };
  }
  const entity = (id2) => db.transaction(["entities"], "readonly", (tx) => tx.get("entities", entityKey(scope(), id2)));
  const fence = async (path) => {
    const route2 = offlineReadRoute(path);
    return ["note_entries", "note_entry"].includes(route2?.kind) ? notes.fence(route2) : serverFence2(await entities(scope()), route2, scope());
  };
  return {
    read: read2,
    write,
    entity,
    fence,
    entities: () => entities(scope()),
    noteCapability: notes.capability,
    captureDocuments: notes.captureAcknowledged,
    ...identityMethods(db, now)
  };
}
var dayPattern, uuidPattern2, clone, missing3, active, identityFingerprint;
var init_cache = __esm({
  "web/offline/cache.mjs"() {
    init_db();
    init_notes();
    init_read_only();
    dayPattern = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
    uuidPattern2 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    clone = (value) => structuredClone(value);
    missing3 = () => Object.assign(new Error("此内容尚未保存在本机，请联网读取一次。"), { code: "OFFLINE_CACHE_MISS" });
    active = (row) => row && !row.deleted && !row.deleted_at;
    identityFingerprint = (value) => JSON.stringify([value.id, value.publicBusiness === true]);
  }
});

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
var init_resolution_ledger = __esm({
  "web/offline/resolution-ledger.mjs"() {
  }
});

// web/offline/conflict.mjs
function createConflictStore({ db, now = Date.now, canDispatch = () => true }) {
  async function record({ operation: operation2, remote = null, reason = "version" }) {
    return db.transaction(["entities", "outbox", "conflicts"], "readwrite", async (tx) => {
      const current3 = await tx.get("outbox", operation2.key);
      if (!current3 || current3.scope !== operation2.scope) throw new Error("Offline operation is no longer current");
      if (!canDispatch(operation2) || !canDispatch(current3)) return null;
      if (current3.claim_owner !== operation2.claim_owner || ["archived", "conflict"].includes(current3.status)) {
        throw new Error("Offline conflict claim changed");
      }
      const entity = await tx.get("entities", entityKey(operation2.scope, operation2.entity_id));
      const key = entityKey(operation2.scope, "conflict:" + operation2.id);
      let conflict = {
        key,
        scope: operation2.scope,
        entity_id: operation2.entity_id,
        operation: current3,
        local: entity?.local || operation2.local,
        remote,
        reason,
        created_at: now(),
        resolved_at: null
      };
      conflict = await recordResolutionConflict(tx, current3, conflict);
      await tx.put("conflicts", conflict);
      await tx.put("outbox", { ...current3, status: "conflict", error: reason });
      if (entity) await tx.put("entities", { ...entity, conflict: key, dirty: true });
      return conflict;
    });
  }
  const list2 = (scope) => db.transaction(["conflicts"], "readonly", async (tx) => (await tx.getAll("conflicts")).filter((value) => value.scope === scope && value.resolved_at === null));
  return { record, list: list2 };
}
var init_conflict = __esm({
  "web/offline/conflict.mjs"() {
    init_db();
    init_resolution_ledger();
  }
});

// web/offline/conflict-plan.mjs
function checkedDay(value) {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const stamp3 = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(stamp3) || new Date(stamp3).toISOString().slice(0, 10) !== value) invalid();
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
  const entity = conflict.entity_id, pattern2 = ["todo", "template", "unscheduled_todo"].includes(type) ? clientIdPattern : uuidPattern3;
  if (typeof entity !== "string" || !entity.startsWith(prefix) || !pattern2.test(entity.slice(prefix.length)) || conflict.operation.scope !== void 0 && conflict.operation.scope !== scope || conflict.operation.entity_id !== void 0 && conflict.operation.entity_id !== entity) invalid();
  const id2 = entity.slice(prefix.length).toLowerCase(), local = conflict.local;
  if (local?.id !== void 0 && local.id.toLowerCase?.() !== id2 || conflict.operation.source_id !== void 0 && conflict.operation.source_id.toLowerCase?.() !== id2) invalid();
  if (remote && (typeof remote !== "object" || remote.id?.toLowerCase?.() !== id2 || !revision(remote.version))) invalid();
  const used = /* @__PURE__ */ new Set([id2, conflict.operation.save_id?.toLowerCase?.(), local?.group_id?.toLowerCase?.()]);
  const fresh = () => {
    const value = uuid5();
    if (typeof value !== "string" || !pattern2.test(value) || used.has(value.toLowerCase())) invalid();
    used.add(value.toLowerCase());
    return value.toLowerCase();
  };
  const reserve = (values) => {
    for (const value of values) if (typeof value === "string") used.add(value.toLowerCase());
  };
  return { type, scope, id: id2, local, remote, choice: choice2, fresh, reserve };
}
function operation(context, id2, method2, path, body2, value, base = null, deleted2 = false) {
  const local = { ...value, id: id2, version: (body2.version || 0) + 1, can_edit: true, deleted: deleted2, deleted_at: null };
  return {
    scope: context.scope,
    entity_type: context.type,
    entity_id: id2,
    method: method2,
    path,
    body: body2,
    base: base ? structuredClone(base) : null,
    local
  };
}
function copyResult(context, id2, operations2) {
  return {
    mode: "copy",
    target_id: id2,
    operations: operations2,
    explanation: removed2(context.local) ? "将删除前的本机内容另存为新记录，原记录保持原状。" : "将本机内容另存为新记录，原记录保持原状。"
  };
}
function todoPlan(context, value) {
  const { id: id2, remote, local, choice: choice2, fresh } = context, path = "/todos/" + id2;
  if (choice2 === "use-local" && remote && !removed2(remote) && remote.date === value.date && remote.text === value.text) {
    const method2 = removed2(local) ? "DELETE" : "PATCH";
    const body2 = method2 === "DELETE" ? { date: value.date, version: remote.version } : { completed: value.completed, version: remote.version };
    return {
      mode: "replace",
      target_id: id2,
      operations: [operation(context, id2, method2, path, body2, value, remote, method2 === "DELETE")]
    };
  }
  const target = fresh(), created = { ...value, completed: false };
  const operations2 = [operation(context, target, "POST", "/todos", { id: target, date: value.date, text: value.text }, created)];
  if (value.completed) operations2.push(operation(context, target, "PATCH", "/todos/" + target, { completed: true, version: 1 }, value));
  return copyResult(context, target, operations2);
}
function undatedPlan(context, value) {
  const { id: id2, remote, local, choice: choice2, fresh } = context, path = "/unscheduled-todos/" + id2;
  if (choice2 === "use-local" && remote && !removed2(remote) && remote.text === value.text) {
    const method2 = removed2(local) ? "DELETE" : "PATCH";
    const body2 = method2 === "DELETE" ? { version: remote.version } : { completed: value.completed, version: remote.version };
    return { mode: "replace", target_id: id2, operations: [operation(context, id2, method2, path, body2, value, remote, method2 === "DELETE")] };
  }
  const target = fresh(), created = { ...value, completed: false };
  const operations2 = [operation(context, target, "POST", "/unscheduled-todos", { id: target, text: value.text }, created)];
  if (value.completed) operations2.push(operation(context, target, "PATCH", "/unscheduled-todos/" + target, { completed: true, version: 1 }, value));
  return copyResult(context, target, operations2);
}
function templatePlan(context, value) {
  const { id: id2, remote, local, choice: choice2, fresh } = context;
  if (choice2 === "use-local" && remote && !removed2(remote)) {
    const method2 = removed2(local) ? "DELETE" : "PATCH", body2 = { version: remote.version };
    if (method2 === "PATCH") body2.text = value.text;
    return { mode: "replace", target_id: id2, operations: [
      operation(context, id2, method2, "/todo-templates/" + id2, body2, value, remote, method2 === "DELETE")
    ] };
  }
  const target = fresh();
  return copyResult(context, target, [operation(context, target, "POST", "/todo-templates", { id: target, text: value.text }, value)]);
}
function notePlan(context, value) {
  const { id: id2, remote, local, choice: choice2, fresh } = context;
  if (choice2 === "use-local" && remote && !removed2(remote) && remote.category === value.category && remote.date === value.date && (local.labels_version !== 1 || remote.labels_version === 1 && remote.label === (value.label ?? null))) {
    const method2 = removed2(local) ? "DELETE" : "PUT", body3 = { version: remote.version, save_id: fresh() };
    if (method2 === "PUT") {
      const { label: label3, ...fields5 } = value;
      Object.assign(body3, fields5);
    }
    return { mode: "replace", target_id: id2, operations: [
      operation(context, id2, method2, "/note-entries/" + id2, body3, value, remote, method2 === "DELETE")
    ] };
  }
  const target = fresh(), body2 = { ...value, version: 0, save_id: fresh() };
  return copyResult(context, target, [operation(context, target, "PUT", "/note-entries/" + target, body2, value)]);
}
function liveMemoGroup(group) {
  return group && uuidPattern3.test(group.id) && revision(group.version) && group.deleted_at === null && !group.deleted && (group.position === void 0 || Number.isSafeInteger(group.position) && group.position >= 0 && group.position <= 1e6);
}
function memoOperation(context, id2, body2, value, base = null) {
  const kind = context.type === "memo_note" ? "notes" : "groups";
  const result = operation(context, id2, "PUT", "/memos/" + kind + "/" + id2, body2, value, base);
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
  const { id: id2, remote, local, choice: choice2, fresh, type } = context;
  if (removed2(local)) return {
    mode: "blocked",
    operations: [],
    target_id: id2,
    explanation: "本机保留的是删除意图；备忘录删除需联网确认，原文与冲突仍保留。"
  };
  if (type === "memo_note" && !groups.some((group) => group?.id === value.group_id && liveMemoGroup(group)))
    return memoParentCopy(context, value, groups);
  const replace = choice2 === "use-local" && remote && !removed2(remote) && (type !== "memo_note" || remote.group_id === value.group_id);
  const target = replace ? id2 : fresh(), body2 = { ...value, version: replace ? remote.version : 0, save_id: fresh() };
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
var prefixes, uuidPattern3, clientIdPattern, removed2, revision, plain, invalid;
var init_conflict_plan = __esm({
  "web/offline/conflict-plan.mjs"() {
    prefixes = {
      unscheduled_todo: "unscheduled_todo:",
      todo: "todo:",
      template: "template:",
      note_entry: "note-entry:",
      memo_note: "memo-note:",
      memo_group: "memo-group:"
    };
    uuidPattern3 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    clientIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
    removed2 = (value) => Boolean(value && (value.deleted || value.deleted_at));
    revision = (value) => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
    plain = (value) => typeof value === "string" && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
    invalid = () => {
      throw new TypeError("冲突内容不完整，请保留原文并重新核对。");
    };
  }
});

// web/offline/conflict-decisions.mjs
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
  const id2 = conflict.operation.source_id;
  const drafts = (await tx.getAll("meta")).filter((row) => row.scope === scope && row.draft_kind && row.data?.id === id2);
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
      const stamp3 = new Date(now()).toISOString();
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
          created_at: input.base?.created_at || stamp3,
          updated_at: stamp3
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
    const id2 = input.body.group_id, server = groups.find((row) => row.id === id2 && !row.deleted_at && !row.deleted);
    if (!server) continue;
    const entity_id = "memo-group:" + id2, key = entityKey(scope, entity_id), old = await tx.get("entities", key);
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
var live, own, currentLocal, currentRemote, failure, canonical, stable;
var init_conflict_decisions = __esm({
  "web/offline/conflict-decisions.mjs"() {
    init_db();
    init_conflict_plan();
    init_resolution_ledger();
    live = (row) => !["acked", "archived"].includes(row.status);
    own = (value, key) => Object.hasOwn(value, key);
    currentLocal = (row) => own(row, "review_local") ? row.review_local : row.local;
    currentRemote = (row) => own(row, "review_remote") ? row.review_remote : row.remote;
    failure = (message, code = "OFFLINE_CONFLICT_CHANGED") => Object.assign(new Error(message), { code });
    canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
    stable = (value) => JSON.stringify(canonical(value));
  }
});

// web/offline/conflict-transport.mjs
function day2(value) {
  return typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
}
function shortText2(value) {
  return typeof value === "string" && value.isWellFormed() && value.trim().length > 0 && value.length <= 500 && !value.includes("\0");
}
function body(value) {
  return typeof value === "string" && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\r]/.test(value) && new TextEncoder().encode(value).byteLength <= 65536;
}
function identity(row, id2, type) {
  return object(row) && (row.id === id2 || row.id === void 0 && row.source_id === id2) && (!own2(row, "source_id") || row.source_id === id2) && (!own2(row, "entity_id") || row.entity_id === prefixes2[type] + id2);
}
function deletion(row) {
  return (!own2(row, "deleted") || typeof row.deleted === "boolean") && (!own2(row, "deleted_at") || row.deleted_at === null || timestamp2(row.deleted_at)) && (!own2(row, "deleted") || !own2(row, "deleted_at") || row.deleted === (row.deleted_at !== null));
}
function basicRemote(row, id2, type) {
  if (!identity(row, id2, type) || !version(row.version) || !deletion(row)) invalid2();
  if (type === "todo" && (!day2(row.date) || !removed3(row) && (!shortText2(row.text) || typeof row.completed !== "boolean"))) invalid2();
  if (type === "unscheduled_todo" && (!removed3(row) && (!shortText2(row.text) || typeof row.completed !== "boolean") || own2(row, "date"))) invalid2();
  if (type === "template" && !removed3(row) && !shortText2(row.text)) invalid2();
  return structuredClone(row);
}
function noteRemote(row, id2) {
  if (!isNoteApiRow(row) || row.id !== id2 || row.can_edit !== true || !body(row.text)) invalid2();
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
function memoDetail(row, id2, index) {
  if (!identity(row, id2, "memo_note") || row.can_edit !== true || !body(row.body)) invalid2();
  memoMeta(row, true);
  const metadata2 = index.notes.find((value) => value.id === id2);
  const fields5 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at", "group_id"];
  if (!metadata2 || fields5.some((key) => metadata2[key] !== row[key])) invalid2();
  return structuredClone(row);
}
function noteAbsence(value, local, id2) {
  if (!object(value) || value.can_edit !== true || value.category !== local.category || value.date !== local.date || !Array.isArray(value.entries) || value.entries.length > 200) invalid2();
  const ids = /* @__PURE__ */ new Set();
  for (const row of value.entries) {
    noteRemote(row, row?.id);
    if (row.id === id2 || ids.has(row.id) || row.deleted || row.category !== local.category || row.date !== local.date) invalid2();
    ids.add(row.id);
  }
}
function conflictIdentity(conflict) {
  const operation2 = conflict?.operation, type = operation2?.entity_type, id2 = operation2?.source_id;
  if (!prefixes2[type] || !uuid.test(id2) || typeof conflict.scope !== "string" || !conflict.scope || operation2.scope !== conflict.scope || operation2.entity_id !== prefixes2[type] + id2 || conflict.entity_id !== operation2.entity_id) invalid2();
  return { operation: operation2, type, id: id2, scope: conflict.scope };
}
function createConflictPreparation({ readRemote, network }) {
  async function guarded(read2, assertActive) {
    assertActive();
    const value = await read2();
    assertActive();
    return value;
  }
  return async function prepare(conflict, { assertActive = () => {
  } } = {}) {
    assertActive();
    const { operation: operation2, type, id: id2, scope } = conflictIdentity(conflict);
    if (type === "memo_group" || type === "memo_note") {
      const index = memoIndex(await guarded(() => network(scope, "/memos"), assertActive));
      if (type === "memo_group") {
        const row2 = index.groups.find((value) => value.id === id2);
        return { remote: row2 ? { ...row2, can_edit: true } : null, groups: index.groups };
      }
      const row = await guarded(() => readRemote(operation2), assertActive);
      if (row === null) {
        if (index.notes.some((value) => value.id === id2)) invalid2();
        return { remote: null, groups: index.groups };
      }
      return { remote: memoDetail(row, id2, index), groups: index.groups };
    }
    const remote = await guarded(() => readRemote(operation2), assertActive);
    if (remote !== null) {
      if (type === "note_entry" && operation2.protocol === 5 && (remote.labels_version !== 1 || !own2(remote, "label"))) invalid2();
      return { remote: type === "note_entry" ? noteRemote(remote, id2) : basicRemote(remote, id2, type), groups: [] };
    }
    if (type === "note_entry") {
      const local = own2(conflict, "review_local") ? conflict.review_local : conflict.local;
      if (!object(local) || !["life", "work"].includes(local.category) || !day2(local.date)) invalid2();
      const path = "/note-entries?category=" + local.category + "&date=" + local.date;
      noteAbsence(await guarded(() => network(scope, path), assertActive), local, id2);
    }
    return { remote: null, groups: [] };
  };
}
var prefixes2, uuid, object, version, sequence, timestamp2, invalid2, removed3, own2;
var init_conflict_transport = __esm({
  "web/offline/conflict-transport.mjs"() {
    init_notes();
    prefixes2 = {
      unscheduled_todo: "unscheduled_todo:",
      todo: "todo:",
      template: "template:",
      note_entry: "note-entry:",
      memo_note: "memo-note:",
      memo_group: "memo-group:"
    };
    uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
    object = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
    version = (value) => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
    sequence = (value) => Number.isSafeInteger(value) && value >= 0;
    timestamp2 = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
    invalid2 = () => {
      throw Object.assign(new Error("线上内容读取不完整，原文已保留，请重新核对。"), { code: "OFFLINE_RESPONSE_INVALID" });
    };
    removed3 = (row) => row?.deleted === true || row?.deleted_at !== null && row?.deleted_at !== void 0;
    own2 = (value, key) => Object.hasOwn(value, key);
  }
});

// web/core/retry-after.mjs
function parseRetryAfter(value, now = Date.now()) {
  if (typeof value !== "string") return DEFAULT_RETRY_AFTER;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isFinite(seconds) ? Math.min(Number.MAX_SAFE_INTEGER, seconds * 1e3) : Number.MAX_SAFE_INTEGER;
  }
  if (!/[a-z]/i.test(text) || !/^(?:[a-z]{3},|[a-z]+,|[a-z]{3}\s)/i.test(text)) return DEFAULT_RETRY_AFTER;
  const at = Date.parse(text);
  return Number.isFinite(at) && Number.isFinite(now) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, at - now)) : DEFAULT_RETRY_AFTER;
}
function retryAfterDelay(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(DEFAULT_RETRY_AFTER, Math.ceil(value))) : DEFAULT_RETRY_AFTER;
}
function retryUntil(now, delay) {
  return Math.min(Number.MAX_SAFE_INTEGER - 1, Math.max(0, now) + retryAfterDelay(delay));
}
var DEFAULT_RETRY_AFTER, MAX_TIMER_DELAY;
var init_retry_after = __esm({
  "web/core/retry-after.mjs"() {
    DEFAULT_RETRY_AFTER = 6e4;
    MAX_TIMER_DELAY = 2147483647;
  }
});

// web/offline/outbox.mjs
function canonicalRoute(operation2) {
  const { entity_type: type, source_id: id2, entity_id, method: method2, path } = operation2;
  if (!uuidPattern4.test(id2) || entity_id !== prefixes3[type] + id2) return false;
  const base = type === "todo" ? "/todos" : type === "template" ? "/todo-templates" : type === "note_entry" ? "/note-entries" : type === "unscheduled_todo" ? "/unscheduled-todos" : "/memos/" + (type === "memo_note" ? "notes" : "groups");
  if (["todo", "template", "unscheduled_todo"].includes(type)) {
    if (method2 === "POST") return path === base || ["todo", "unscheduled_todo"].includes(type) && path === base + "/" + id2 + "/restore";
    return ["PATCH", "DELETE"].includes(method2) && path === base + "/" + id2;
  }
  return (method2 === "PUT" || type === "note_entry" && method2 === "DELETE") && path === base + "/" + id2;
}
function dispatchCapabilities(options4) {
  const types2 = new Set(options4.enabledTypes || Object.keys(prefixes3));
  const protocols = new Set(options4.supportedProtocols || [1, 2, 3]);
  const memoDependencies = (operation2) => options4.supportedDependencies === true && operation2.entity_type === "memo_note" && operation2.method === "PUT" && uuidPattern4.test(operation2.body?.group_id) && Array.isArray(operation2.depends_on) && operation2.depends_on.length === 1 && operation2.depends_on[0] === "memo-group:" + operation2.body.group_id;
  const decision = (operation2) => {
    let origin;
    try {
      origin = JSON.parse(operation2.origin_conflict);
    } catch {
      return false;
    }
    return options4.resolutionReceipts !== false && uuidPattern4.test(operation2.resolution_id) && operation2.resolution_receipt === 1 && Array.isArray(origin) && origin.length === 2 && origin[0] === operation2.scope && typeof origin[1] === "string" && origin[1].startsWith("conflict:") && (!Object.hasOwn(operation2, "depends_on") || memoDependencies(operation2));
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
  const id2 = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  if (!uuidPattern4.test(id2)) throw new TypeError("Offline entity requires a stable UUID");
  return { id: id2.toLowerCase(), entity_id: prefix + id2.toLowerCase() };
}
function operationFor(input, uuid5, time2) {
  const initialStatus = input.initial_status || "queued";
  if (!["queued", "unknown"].includes(initialStatus)) throw new TypeError("Invalid initial offline operation status");
  if (initialStatus === "unknown" && (!uuidPattern4.test(input.body?.save_id) || !input.entity_id))
    throw new TypeError("Unknown operation import requires its original save_id and entity identity");
  const { id: id2, entity_id } = identity2(input, uuid5), type = input.entity_type;
  const method2 = input.method?.toUpperCase();
  const base = type === "todo" ? "/todos" : type === "template" ? "/todo-templates" : type === "note_entry" ? "/note-entries" : type === "unscheduled_todo" ? "/unscheduled-todos" : "/memos/" + (type === "memo_note" ? "notes" : "groups");
  const restore = ["todo", "unscheduled_todo"].includes(type) && method2 === "POST" && input.path === base + "/" + id2 + "/restore";
  const create = ["todo", "template", "unscheduled_todo"].includes(type) && method2 === "POST" && !restore;
  const allowed = ["todo", "unscheduled_todo"].includes(type) ? ["POST", "PATCH", "DELETE"] : type === "template" ? ["POST", "PATCH", "DELETE"] : type === "note_entry" ? ["PUT", "DELETE"] : ["PUT"];
  if (!allowed.includes(method2)) throw new TypeError("Unsupported offline mutation");
  const path = create ? base : base + "/" + id2 + (restore ? "/restore" : "");
  if (input.path && input.path !== path) throw new TypeError("Offline mutation path does not match its entity");
  const body2 = structuredClone(input.body || {});
  if (typeof body2.text === "string") {
    body2.text = ["todo", "template", "unscheduled_todo"].includes(type) ? body2.text.trim() : body2.text.replace(/\r\n?/g, "\n");
  }
  if (typeof body2.title === "string") body2.title = body2.title.trim();
  if (typeof body2.body === "string") body2.body = body2.body.replace(/\r\n?/g, "\n");
  if (create) {
    if (body2.id && body2.id.toLowerCase() !== id2) throw new TypeError("Client UUID cannot change");
    body2.id = id2;
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
    source_id: id2,
    protocol: input.protocol === void 0 ? 1 : input.protocol,
    method: method2,
    path,
    body: body2,
    expected_version: expected,
    save_id: saveId.toLowerCase(),
    created_at: time2,
    attempts: 0,
    next_attempt_at: 0,
    status: initialStatus,
    base: input.base || null,
    local: { ...structuredClone(input.local || body2), id: id2, version: expected + 1 },
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
  const canonical4 = (node2) => Array.isArray(node2) ? node2.map(canonical4) : node2 && typeof node2 === "object" ? Object.fromEntries(Object.keys(node2).sort().map((key) => [key, canonical4(node2[key])])) : node2;
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
function acceptedLabelEvidence(operation2, confirmed2, entity) {
  if (operation2.entity_type !== "note_entry" || operation2.protocol !== 5) return null;
  const proof = {
    version: confirmed2.version,
    category: confirmed2.category,
    date: confirmed2.date,
    created_at: confirmed2.created_at,
    label: confirmed2.label
  };
  if (entity?.label_evidence && (entity.label_evidence.version > proof.version || entity.label_evidence.version === proof.version && JSON.stringify(entity.label_evidence) !== JSON.stringify(proof)))
    throw new Error("标签证据已变化，原请求已保留。");
  return proof;
}
function createContext(options4) {
  const { db, request: request2, getScope, now = Date.now, uuid: uuid5 = () => crypto.randomUUID(), timeout = 2e4 } = options4;
  const owner2 = uuid5();
  const state2 = { phase: "idle", pending: 0, unsupported: 0, error: null };
  const { canDispatch, requireDispatch } = dispatchCapabilities(options4);
  const conflicts = createConflictStore({ db, now, canDispatch });
  const leaseKey = (scope) => entityKey(scope, "outbox-lease");
  const rateLimitKey = (scope) => entityKey(scope, "outbox-rate-limit");
  const checkScope = (scope) => {
    if (getScope() !== scope) throw Object.assign(new Error("Offline identity changed"), { code: "OFFLINE_SCOPE_CHANGED" });
  };
  const list2 = (scope) => db.transaction(["outbox"], "readonly", async (tx) => ordered((await tx.getAll("outbox")).filter((value) => value.scope === scope && active2(value))));
  const cooldown = async (scope) => {
    checkScope(scope);
    const item = await db.transaction(["meta"], "readonly", (tx) => tx.get("meta", rateLimitKey(scope)));
    checkScope(scope);
    return Number.isSafeInteger(item?.until) && item.until >= 0 ? item.until : 0;
  };
  const setCooldown = async (scope, until, assertActive = () => {
  }) => {
    checkScope(scope);
    assertActive();
    if (!Number.isSafeInteger(until) || until < 0) throw new TypeError("Invalid rate-limit deadline");
    return db.transaction(["meta"], "readwrite", async (tx) => {
      checkScope(scope);
      assertActive();
      const key = rateLimitKey(scope), old = await tx.get("meta", key);
      const value = Math.max(Number.isSafeInteger(old?.until) ? old.until : 0, until);
      await tx.put("meta", { key, until: value });
      checkScope(scope);
      assertActive();
      return value;
    });
  };
  const retryable = (scope) => retryableOperations({ db, list: list2, canDispatch }, scope);
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
    let timer2;
    try {
      const expired = new Promise((_, reject) => {
        timer2 = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error("Offline request outcome is unknown"), { code: "OFFLINE_TIMEOUT" }));
        }, timeout);
      });
      const result = await Promise.race([request2(path, { ...opts, signal: controller.signal }), expired]);
      checkScope(scope);
      return result;
    } finally {
      clearTimeout(timer2);
    }
  }
  const readNetwork = (scope, path, opts = {}) => {
    if (!["GET", "HEAD"].includes((opts.method || "GET").toUpperCase())) throw new TypeError("Conflict preparation is read-only");
    return network(scope, path, opts, false);
  };
  return {
    db,
    request: request2,
    getScope,
    now,
    uuid: uuid5,
    timeout,
    owner: owner2,
    conflicts,
    state: state2,
    leaseKey,
    rateLimitKey,
    cooldown,
    setCooldown,
    checkScope,
    list: list2,
    lease,
    network,
    readNetwork,
    canDispatch,
    requireDispatch,
    retryable
  };
}
async function retryableOperations({ db, list: list2, canDispatch }, scope) {
  const rows = await list2(scope), first = /* @__PURE__ */ new Map(), ready = [];
  for (const row of rows) if (!first.has(row.entity_id)) first.set(row.entity_id, row);
  for (const row of first.values()) {
    if (!canDispatch(row) || !["queued", "unknown", "sending"].includes(row.status)) continue;
    const dependency = await dependencyState({ db }, row, rows);
    if (["ready", "deleted"].includes(dependency)) ready.push(row);
  }
  return ready;
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
  let count3 = 0;
  for (const entity of await tx.getAll("entities")) {
    const row = entity.dirty ? entity.local : entity.server;
    if (entity.scope === operation2.scope && entity.entity_id.startsWith("note-entry:") && (entity.dirty || !entity.remote_missing) && row?.category === operation2.body.category && row?.date === operation2.body.date && !deleted(row)) count3++;
  }
  if (count3 >= 200) throw Object.assign(new Error("本机当日记录已达 200 条，草稿已保留。"), { code: "OFFLINE_CACHE_LIMIT" });
}
async function acknowledgeOperation(context, operation2, remote) {
  const { db, checkScope, owner: owner2, now } = context;
  context.requireDispatch(operation2);
  if (operation2.entity_type === "note_entry" && !completeNoteRow(remote)) throw new Error("Incomplete note acknowledgement");
  checkScope(operation2.scope);
  await db.transaction(["entities", "outbox", "conflicts"], "readwrite", async (tx) => {
    checkScope(operation2.scope);
    const current3 = await tx.get("outbox", operation2.key);
    if (!context.canDispatch(current3) || current3.claim_owner !== owner2 || !["sending", "unknown"].includes(current3.status)) {
      throw new Error("Offline operation claim changed");
    }
    const key = entityKey(operation2.scope, operation2.entity_id), entity = await tx.get("entities", key);
    const confirmed2 = operation2.entity_type === "template" && operation2.method === "DELETE" ? { ...operation2.base, ...entity.server, ...remote, version: operation2.expected_version + 1 } : remote;
    await tx.delete("outbox", operation2.key);
    const remaining = (await tx.getAll("outbox")).some((value) => value.scope === operation2.scope && value.entity_id === operation2.entity_id && active2(value));
    const proof = acceptedLabelEvidence(operation2, confirmed2, entity);
    await tx.put("entities", {
      ...entity,
      server: confirmed2,
      local: remaining ? entity.local : confirmed2,
      ...proof ? { label_evidence: proof } : {},
      dirty: remaining,
      conflict: null
    });
    await recordResolutionAck(tx, current3, confirmed2, now());
  });
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
    const sequence5 = (await tx.get("meta", sequenceKey))?.value || 0;
    operation2.seq = sequence5 + 1;
    const key = entityKey(input.scope, operation2.entity_id), old = await tx.get("entities", key);
    await noteCapacity(tx, operation2, old);
    const visible4 = old?.dirty ? old.local : old?.server || operation2.base;
    operation2.base = operation2.base || old?.server || null;
    operation2.local = {
      ...visible4,
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
  async function update(operation2, fields5, { rateLimitedUntil } = {}) {
    if (!context.canDispatch(operation2)) return null;
    return db.transaction(["outbox", "meta", "conflicts"], "readwrite", async (tx) => {
      const current3 = await tx.get("outbox", operation2.key);
      const held = await tx.get("meta", context.leaseKey(operation2.scope));
      if (!context.canDispatch(current3) || held?.owner !== owner2 || !["queued", "unknown", "sending"].includes(current3.status)) return null;
      if (!Object.hasOwn(fields5, "claim_owner") && current3.claim_owner !== owner2) return null;
      const result = { ...current3, ...fields5 };
      await tx.put("outbox", result);
      if (Number.isSafeInteger(rateLimitedUntil)) {
        const key = context.rateLimitKey(operation2.scope), old = await tx.get("meta", key);
        await tx.put("meta", { key, until: Math.max(Number.isSafeInteger(old?.until) ? old.until : 0, rateLimitedUntil) });
      }
      if (fields5.status) await recordResolutionFailure(tx, result, fields5);
      return result;
    });
  }
  const acknowledge = (operation2, remote) => acknowledgeOperation(context, operation2, remote);
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
    const day6 = operation2.body.date || operation2.base?.date || operation2.local.date;
    const snapshot = await network(scope, "/workbench-snapshot?date=" + day6);
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
  async function fail6(operation2, error) {
    if ([409, 410, 404].includes(error.status)) {
      const current3 = await context.db.transaction(["outbox"], "readonly", (tx) => tx.get("outbox", operation2.key));
      if (!context.canDispatch(current3)) return;
      let remote = null;
      try {
        remote = await readRemote(operation2);
      } catch (readError) {
        if (readError.status === 429) return fail6(operation2, readError);
      }
      return conflicts.record({ operation: operation2, remote, reason: deleted(remote) ? "deleted" : error.code || "version" });
    }
    const attempts = operation2.attempts + 1;
    const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
    const status = [401, 403].includes(error.status) ? "paused" : error.status && error.status < 500 && error.status !== 429 ? "blocked" : "unknown";
    const next = error.status === 429 ? retryUntil(now(), Math.max(delay, retryAfterDelay(error.retryAfterMs))) : now() + delay;
    if (error.status === 429) {
      if (context.rateLimitScope !== operation2.scope) context.rateLimitedUntil = 0;
      context.rateLimitScope = operation2.scope;
      context.rateLimitedUntil = Math.max(context.rateLimitedUntil || 0, next);
    }
    return update(operation2, {
      status,
      attempts,
      next_attempt_at: next,
      error: error.code || "OFFLINE_UNKNOWN"
    }, error.status === 429 ? { rateLimitedUntil: next } : {});
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
      return fail6({ ...operation2, claim_owner: owner2 }, error);
    }
  }
  return { reconcile, fail: fail6, process };
}
async function dependencyState(context, operation2, rows) {
  if (!operation2.depends_on?.length) return "ready";
  if (operation2.depends_on.some((id2) => rows.some((row) => row.entity_id === id2 && active2(row)))) return "pending";
  return context.db.transaction(["entities", "outbox"], "readonly", async (tx) => {
    for (const id2 of operation2.depends_on) {
      const parent = await tx.get("entities", entityKey(operation2.scope, id2));
      if (deleted(parent?.server)) return "deleted";
      if (!parent?.server || parent.remote_missing || parent.server.version < 1) {
        const abandoned = operation2.protocol === 3 && (await tx.getAll("outbox")).some((row) => row.scope === operation2.scope && row.entity_id === id2 && row.resolution_id === operation2.resolution_id && row.status === "archived");
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
  const { getScope, lease, state: state2, list: list2, checkScope, process, db, leaseKey, owner: owner2, now, retryable, canDispatch, cooldown } = context;
  let running = null;
  async function run2() {
    const scope = getScope();
    if (!scope) return { phase: "paused", pending: 0 };
    if (context.rateLimitScope !== scope) {
      context.rateLimitScope = scope;
      context.rateLimitedUntil = 0;
    }
    if (!await lease(scope)) return { phase: "busy", pending: (await list2(scope)).length };
    state2.phase = "syncing";
    state2.error = null;
    state2.rateLimitedUntil = 0;
    try {
      for (let count3 = 0; count3 < 1e3; count3++) {
        checkScope(scope);
        const blockedUntil = Math.max(await cooldown(scope), context.rateLimitedUntil || 0);
        if (blockedUntil > now()) {
          state2.rateLimitedUntil = blockedUntil;
          break;
        }
        const rows = await list2(scope);
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
      const pending = await list2(scope);
      state2.pending = pending.length;
      state2.unsupported = pending.filter((value) => !canDispatch(value)).length;
      state2.phase = state2.unsupported ? "upgrade-required" : pending.some((value) => value.status === "conflict") ? "conflict" : pending.length ? "pending" : "synced";
      return { ...state2 };
    } catch (error) {
      state2.phase = "paused";
      state2.error = error.code || "OFFLINE_UNKNOWN";
      state2.rateLimitedUntil = context.rateLimitedUntil || 0;
      return { ...state2 };
    } finally {
      await db.transaction(["meta"], "readwrite", async (tx) => {
        if ((await tx.get("meta", leaseKey(scope)))?.owner === owner2) await tx.delete("meta", leaseKey(scope));
      }).catch(() => {
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
      let count3 = 0;
      for (const operation2 of await tx.getAll("outbox")) {
        if (operation2.scope === scope && canDispatch(operation2) && operation2.status === "paused") {
          await tx.put("outbox", { ...operation2, status: "unknown", next_attempt_at: 0, claim_owner: null });
          count3++;
        }
      }
      return count3;
    });
  }
  return { run: run2, drain, resume };
}
function createOutbox(options4) {
  const context = createContext(options4);
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
  const { enqueue, drain, resume, list: list2, state: state2, conflicts, canDispatch, retryable, cooldown, setCooldown } = context;
  return { enqueue, drain, resume, list: list2, state: state2, conflicts, canDispatch, retryable, cooldown, setCooldown, resolve };
}
var RETRY_DELAYS, prefixes3, uuidPattern4, active2, deleted, ordered, needsUpgrade;
var init_outbox = __esm({
  "web/offline/outbox.mjs"() {
    init_db();
    init_conflict();
    init_conflict_decisions();
    init_conflict_transport();
    init_resolution_ledger();
    init_retry_after();
    RETRY_DELAYS = Object.freeze([5e3, 15e3, 6e4, 3e5]);
    prefixes3 = {
      unscheduled_todo: "unscheduled_todo:",
      todo: "todo:",
      template: "template:",
      note_entry: "note-entry:",
      memo_note: "memo-note:",
      memo_group: "memo-group:"
    };
    uuidPattern4 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    active2 = (operation2) => !["acked", "archived"].includes(operation2.status);
    deleted = (value) => Boolean(value && (value.deleted || value.deleted_at));
    ordered = (rows) => rows.sort((a, b) => a.seq - b.seq);
    needsUpgrade = () => Object.assign(new Error("此本机操作需新版页面处理，原内容已保留。"), { code: "OFFLINE_UPGRADE_REQUIRED" });
  }
});

// web/offline/sync.mjs
function fail2(code, message, status) {
  throw Object.assign(new Error(message), { code, ...status ? { status } : {} });
}
function requireValue(condition, message = "工作台快照内容不完整，未覆盖本地数据。") {
  if (!condition) fail2("OFFLINE_SNAPSHOT_INVALID", message);
}
function day3(value) {
  requireValue(typeof value === "string" && datePattern.test(value));
  const parsed2 = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  requireValue(Number.isFinite(parsed2.getTime()) && parsed2.toISOString().slice(0, 10) === value);
  return value;
}
function stamp(value, nullable = false) {
  if (value === null && nullable) return;
  const parts2 = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireValue(parts2 && Number(parts2[2]) < 24 && Number(parts2[3]) < 60 && Number(parts2[4]) < 60 && Number.isFinite(Date.parse(value)) && (parts2[5] === "Z" || Number(parts2[5].slice(1, 3)) < 24 && Number(parts2[5].slice(4)) < 60));
  day3(parts2[1]);
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
    const current3 = await tx.get("meta", key);
    if (!equal(current3 ?? null, initial.meta ?? null)) fail2("OFFLINE_SNAPSHOT_CHANGED", "其他页面已更新本地快照，请重新核对。");
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
function createSnapshotSync({ db, request: request2, getScope, now = Date.now, crypto: crypto2 = globalThis.crypto, limits = {}, version: version2 = 1 }) {
  if (!db?.transaction || typeof request2 !== "function" || typeof getScope !== "function") throw new TypeError("Snapshot sync dependencies required");
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
      const value = await request2(path);
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
  function pull(options4) {
    if (inFlight) return inFlight;
    state2.status = "pulling";
    state2.error = null;
    inFlight = run2(options4).then((result) => {
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
    const timer2 = setInterval2(refresh, 3e5);
    stopTriggers = () => {
      window2?.removeEventListener?.("online", refresh);
      document2?.removeEventListener?.("visibilitychange", refresh);
      clearInterval2(timer2);
    };
    refresh();
    return stopTriggers;
  }
  return { pull, state: state2, start, stop: () => stopTriggers() };
}
var FORMAT, FORMAT2, collections, v2Collections, types, v2Types, recordKeys, hashPattern2, datePattern, supportedId, supportedId2, SNAPSHOT_PULL_LIMITS, stable2, canonical2, equal, object2;
var init_sync = __esm({
  "web/offline/sync.mjs"() {
    init_db();
    FORMAT = "haoduoyu-workbench-snapshot-v1", FORMAT2 = "haoduoyu-workbench-snapshot-v2";
    collections = ["todos", "life_notes", "work_notes", "work_reminders", "memo_groups", "memos"];
    v2Collections = [...collections, "unscheduled_todos", "note_labels"];
    types = /* @__PURE__ */ new Set(["todo", "life_note", "work_note", "work_reminder", "memo_group", "memo_note"]);
    v2Types = /* @__PURE__ */ new Set([...types, "unscheduled_todo", "note_label"]);
    recordKeys = /* @__PURE__ */ new Set([
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
    hashPattern2 = /^[a-f0-9]{64}$/;
    datePattern = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
    supportedId = /^(?:todo|legacy-life|legacy-work|note-entry|work-reminder|memo-group|memo-note):/;
    supportedId2 = /^(?:todo|legacy-life|legacy-work|note-entry|work-reminder|memo-group|memo-note|unscheduled_todo|note-label):/;
    SNAPSHOT_PULL_LIMITS = Object.freeze({
      maxEntities: 4e3,
      maxDates: 1e3,
      maxResponseBytes: 1048576,
      maxBatchBytes: 8388608,
      maxHashBytes: 8388608,
      maxRequests: 128
    });
    stable2 = (value) => Array.isArray(value) ? value.map(stable2) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable2(value[key])])) : value;
    canonical2 = (value) => JSON.stringify(stable2(value));
    equal = (a, b) => canonical2(a) === canonical2(b);
    object2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  }
});

// web/core/daily-notes-state.mjs
function validDailyNotesDate(value) {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed2 = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed2.getTime()) && parsed2.toISOString().slice(0, 10) === value;
}
function dailyNotesToday() {
  const parts2 = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(/* @__PURE__ */ new Date()).map((part) => [part.type, part.value]));
  return parts2.year + "-" + parts2.month + "-" + parts2.day;
}
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
  const emit2 = () => {
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
    emit2();
    onSaved(item.date);
    schedule(item);
  }
  function dispose() {
    context.disposed = true;
    for (const item of pages.values()) stopTimer(item);
  }
  Object.assign(context, { page, emit: emit2, stopTimer, adopt, schedule, matches: matches2, accepted, dispose });
  return context;
}
function createReadingActions(context) {
  const { page, emit: emit2, stopTimer, adopt, schedule } = context;
  const { load } = context.options;
  async function read2(date) {
    const item = page(date), sequence5 = ++item.sequence, writeEpoch = item.writeEpoch;
    item.loading = true;
    emit2();
    try {
      const value = checkedPage(await load(date), date);
      if (context.disposed || sequence5 !== item.sequence) return;
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
      if (!context.disposed && sequence5 === item.sequence) {
        item.error = error.message;
        if (!["conflict", "unknown"].includes(item.phase)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence5 === item.sequence) {
        item.loading = false;
        emit2();
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
    emit2();
    if (!composing) schedule(item);
  }
  return { read: read2, edit };
}
function createWritingActions(context) {
  const { page, emit: emit2, stopTimer, matches: matches2, accepted } = context;
  const { put, remove, restore, uuid: uuid5 } = context.options;
  async function send(item, operation2) {
    stopTimer(item);
    item.pending = operation2;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    emit2();
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
        emit2();
        await context.read(item.date);
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null;
        item.phase = "error";
        item.error = error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
        emit2();
      } else {
        item.phase = "unknown";
        item.error = "正在核对保存结果，草稿已保留。";
        emit2();
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
      emit2();
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
  const { page, emit: emit2, stopTimer, adopt, matches: matches2, accepted } = context;
  const { load } = context.options;
  async function reconcile(date) {
    const item = page(date), operation2 = item.pending;
    if (context.disposed || item.phase !== "unknown" || !operation2 || operation2.checking) return;
    operation2.checking = true;
    operation2.retryReady = false;
    emit2();
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
      emit2();
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
    emit2();
  }
  async function useDraft(date) {
    const item = page(date);
    if (!item.remote || item.pending || item.phase !== "conflict" || !item.remote.can_edit) return;
    adopt(item, item.remote, true);
    item.remote = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit2();
    return context.save(date);
  }
  return { reconcile, useServer, useDraft };
}
function createDailyNotesStore(options4) {
  const context = createDailyNotesContext(options4);
  Object.assign(context, createReadingActions(context), createWritingActions(context), createResolutionActions(context));
  const { page, pages, read: read2, edit, save, deletePage, restorePage, reconcile, retryPending, useServer, useDraft, dispose } = context;
  return { page, pages, read: read2, edit, save, deletePage, restorePage, reconcile, retryPending, useServer, useDraft, dispose };
}
var DAILY_NOTES_MAX_BYTES, routeDate, routeCategory, dailyNotesRouteCategory;
var init_daily_notes_state = __esm({
  "web/core/daily-notes-state.mjs"() {
    DAILY_NOTES_MAX_BYTES = 65536;
    routeDate = "", routeCategory = "life";
    dailyNotesRouteCategory = () => routeCategory;
  }
});

// web/offline/note-mutations.mjs
function noteMutationRoute(path, options4, features) {
  const match = /^\/note-entries\/([a-f0-9-]{36})$/i.exec(path), method2 = (options4.method || "GET").toUpperCase();
  return features.notes && match && uuid2.test(match[1]) && ["PUT", "DELETE"].includes(method2) ? { type: "note_entry", id: match[1].toLowerCase(), method: method2 } : null;
}
function checked(body2, method2, labelsV1) {
  const fields5 = method2 === "PUT" ? [
    "category",
    "date",
    "text",
    "version",
    "save_id",
    ...labelsV1 && Object.hasOwn(body2 || {}, "label") ? ["label"] : []
  ] : ["version", "save_id"];
  if (!body2 || Object.keys(body2).sort().join(",") !== fields5.sort().join(",") || !uuid2.test(body2.save_id) || !Number.isSafeInteger(body2.version) || body2.version < (method2 === "PUT" ? 0 : 1) || body2.version >= Number.MAX_SAFE_INTEGER)
    throw failure2("保存字段或原保存标识不完整，本次修改未保存。");
  if (method2 === "PUT") {
    if (Object.hasOwn(body2, "label")) {
      const label3 = body2.label;
      if (body2.category !== "life" || typeof label3 !== "string" || !label3.isWellFormed() || !label3.trim() || [...label3.trim()].length > 32 || /[\u0000-\u001f\u007f]/.test(label3) || ["生活", "工作"].includes(label3.trim().normalize("NFC"))) throw failure2("标签无效，草稿已保留。");
      body2 = { ...body2, label: label3.trim().normalize("NFC") };
    }
    const day6 = /* @__PURE__ */ new Date(body2.date + "T00:00:00Z");
    if (!["life", "work"].includes(body2.category) || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body2.date) || !Number.isFinite(day6.getTime()) || day6.toISOString().slice(0, 10) !== body2.date || typeof body2.text !== "string" || !body2.text.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body2.text) || new TextEncoder().encode(body2.text.replace(/\r\n?/g, "\n")).byteLength > 65536)
      throw failure2("分类、日期或正文无效，草稿已保留。");
  }
  return structuredClone(body2);
}
function createNoteMutations(context) {
  async function mutate(path, options4, route2, guard) {
    const { state: state2, cache: cache2, outbox, now } = context, owner2 = state2.scope, generation = context.generation;
    const active5 = () => {
      guard();
      if (!owner2 || owner2 !== state2.scope || generation !== context.generation)
        throw failure2("身份范围已变化，本次修改未保存。", "OFFLINE_SCOPE_CHANGED");
    };
    active5();
    const body2 = checked(options4.body, route2.method, context.features.labelsV1 === true);
    if (!await cache2.noteCapability()) throw failure2("请先联网核实碎碎念编辑能力。", "OFFLINE_SCOPE_REQUIRED");
    active5();
    const stored = await cache2.entity("note-entry:" + route2.id), visible4 = offlineValue(stored);
    active5();
    if (route2.method === "PUT" && body2.version === 0 && !visible4 && body2.date !== dailyNotesToday())
      throw failure2("只能新增北京时间当天的碎碎念，草稿已保留。", "OFFLINE_NOTES_TODAY_ONLY");
    if (route2.method === "PUT" && body2.version === 0 && !visible4) {
      const existing = await cache2.entities();
      active5();
      if (existing.filter((row) => row.entity_id.startsWith("note-entry:") && (row.dirty ? row.local : row.server)?.category === body2.category && (row.dirty ? row.local : row.server)?.date === body2.date && !(row.dirty ? row.local : row.server)?.deleted && !(row.dirty ? row.local : row.server)?.deleted_at && (row.dirty || !row.remote_missing)).length >= 200)
        throw failure2("本机该日记录已达 200 条，草稿已保留。", "OFFLINE_CACHE_LIMIT");
    }
    if (!options4.offlineUnknown && body2.version !== (visible4?.version || 0))
      throw failure2("本机已有更新，请重新读取后保存，草稿已保留。", "OFFLINE_CACHE_CHANGED");
    if (route2.method === "DELETE" && !visible4) throw failure2("此记录尚未保存在本机。", "OFFLINE_CACHE_MISS");
    if (visible4 && route2.method === "PUT" && (visible4.category !== body2.category || visible4.date !== body2.date))
      throw failure2("记录的分类和日期不可更改。");
    const labelMode = context.features.labelsV1 === true;
    const persisted = stored?.label_evidence;
    const matches2 = persisted && persisted.version === visible4?.version && persisted.category === visible4?.category && persisted.date === visible4?.date && persisted.created_at === visible4?.created_at;
    const evidence2 = visible4?.labels_version === 1 && Object.hasOwn(visible4, "label") ? visible4 : stored?.api_server?.labels_version === 1 && stored.api_server.version === visible4?.version && stored.api_server.category === visible4?.category && stored.api_server.date === visible4?.date && stored.api_server.created_at === visible4?.created_at ? stored.api_server : matches2 ? persisted : null;
    if (labelMode && visible4 && !evidence2)
      throw failure2("标签尚未核实，请联网读取后再保存，原文已保留。", "OFFLINE_LABEL_UNVERIFIED");
    if (labelMode && visible4 && Object.hasOwn(body2, "label") && body2.label !== evidence2.label)
      throw failure2("已有记录的标签不可更改，原文已保留。");
    const label3 = visible4 ? evidence2?.label : body2.label ?? null;
    const stamp3 = new Date(now()).toISOString();
    const local = {
      ...visible4,
      ...body2,
      ...labelMode ? { labels_version: 1, label: label3 } : {},
      id: route2.id,
      can_edit: true,
      deleted: route2.method === "DELETE",
      created_at: visible4?.created_at || stamp3,
      updated_at: stamp3,
      deleted_at: route2.method === "DELETE" ? stamp3 : null
    };
    let result;
    try {
      result = await outbox.enqueue({
        scope: owner2,
        entity_type: "note_entry",
        entity_id: route2.id,
        method: route2.method,
        path,
        body: body2,
        base: stored?.server || null,
        local,
        ...labelMode ? { protocol: 5 } : {},
        initial_status: options4.offlineUnknown ? "unknown" : "queued",
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
var uuid2, failure2;
var init_note_mutations = __esm({
  "web/offline/note-mutations.mjs"() {
    init_daily_notes_state();
    init_db();
    init_document();
    uuid2 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    failure2 = (message, code = "OFFLINE_INVALID_MUTATION") => Object.assign(new Error(message), { code, localNotSaved: true });
  }
});

// web/offline/retained-drafts.mjs
function createDraftRevisionTracker() {
  const revisions = /* @__PURE__ */ new WeakMap();
  return (item) => {
    const signature2 = JSON.stringify([item.draft, item.labels, item.label, item.dirty, item.composing]);
    const previous = revisions.get(item);
    const revision2 = previous ? previous.revision + Number(previous.signature !== signature2) : 0;
    revisions.set(item, { signature: signature2, revision: revision2 });
    return revision2;
  };
}
function unchangedEntrySinceSnapshot(epochs, id2, current3, snapshotRevision, currentRevision) {
  return epochs.has(id2) === Boolean(current3) && (!current3 || current3.writeEpoch === epochs.get(id2) && (snapshotRevision === void 0 || snapshotRevision === currentRevision));
}
function uniqueRetainedDrafts(rows) {
  const seen = /* @__PURE__ */ new Set();
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return true;
    const key = signature(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function matchesDeletedEntry(row, value) {
  if (row.kind !== "note_entry" || !value || value.id !== row.id || value.category !== row.category || value.date !== row.date || value.deleted !== true || value.can_edit !== true || typeof value.deleted_at !== "string" || !Number.isFinite(Date.parse(value.deleted_at)) || typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at)) || typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at)) || typeof value.content_hash !== "string" || !/^[a-f0-9]{64}$/i.test(value.content_hash) || !Number.isSafeInteger(value.version) || !Number.isSafeInteger(row.version) || value.version <= row.version || typeof value.text !== "string" || value.text !== row.draft || value.labels_version !== 3 || !Array.isArray(value.labels) || !Array.isArray(row.labels) || JSON.stringify(labels(value)) !== JSON.stringify(labels(row)) || row.pending || row.remote || row.localQueued || Number.isSafeInteger(row.localVersion) && row.localVersion > row.version || row.labelKnown === false || ["unknown", "conflict"].includes(row.phase)) return false;
  return true;
}
async function visibleRetainedDrafts(rows, readEntry, active5 = () => true) {
  const tombstones = /* @__PURE__ */ new Map();
  const ids = [...new Set(rows.filter((row) => row?.kind === "note_entry" && /^[a-f0-9-]{36}$/i.test(row.id)).map((row) => row.id))];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, ids.length) }, async () => {
    while (active5() && next < ids.length) {
      const id2 = ids[next++];
      try {
        tombstones.set(id2, await readEntry(id2));
      } catch {
      }
    }
  }));
  return uniqueRetainedDrafts(rows.filter((row) => !row || !matchesDeletedEntry(row, tombstones.get(row.id))));
}
function createLegacyRecoveryGuard() {
  const restored = /* @__PURE__ */ new WeakMap();
  const signature2 = (item) => JSON.stringify([item.draft, item.pending || null, item.remote || null]);
  return {
    remember(item) {
      restored.set(item, signature2(item));
    },
    unchanged(item) {
      return restored.has(item) && restored.get(item) === signature2(item);
    },
    forget(item) {
      restored.delete(item);
    }
  };
}
function createEntryRecoveryGuard(fields5) {
  const restored = /* @__PURE__ */ new WeakMap();
  const signature2 = (item) => JSON.stringify(fields5.map((key) => item[key]));
  return {
    remember(item, record) {
      if (item && typeof record?.key === "string" && typeof record?.write_id === "string")
        restored.set(item, { signature: signature2(item), key: record.key, write_id: record.write_id });
    },
    proof(item) {
      const saved = restored.get(item);
      return saved && saved.signature === signature2(item) ? { key: saved.key, write_id: saved.write_id } : null;
    }
  };
}
var labels, signature;
var init_retained_drafts = __esm({
  "web/offline/retained-drafts.mjs"() {
    labels = (row) => Array.isArray(row.labels) ? [...row.labels].sort() : row.label ? [row.label] : [];
    signature = (row) => JSON.stringify([
      row.kind,
      row.id || "",
      row.category,
      row.date,
      row.draft,
      Array.isArray(row.labels) ? labels(row) : null,
      row.label ?? null,
      row.pending ?? null,
      row.remote ?? null,
      row.phase ?? null,
      row.version ?? null,
      row.localVersion ?? null,
      row.localQueued ?? null,
      row.labelKnown ?? null
    ]);
  }
});

// web/offline/drafts.mjs
function samePendingOperation(original, restored) {
  if (!original || !restored) return !original && !restored;
  const fields5 = ["kind", "version", "saveId", "text", "labels", "label", "expectedLabel"];
  const permitted = /* @__PURE__ */ new Set([...fields5, "uncertain", "checking", "retryReady"]);
  if (typeof original !== "object" || typeof restored !== "object" || Array.isArray(original) || Array.isArray(restored) || Object.keys(original).some((key) => !permitted.has(key)) || Object.keys(restored).some((key) => !permitted.has(key)) || !["put", "delete", "restore"].includes(original.kind)) return false;
  return fields5.every((key) => JSON.stringify(original[key] ?? null) === JSON.stringify(restored[key] ?? null));
}
function safeDraft(row) {
  if (!row || !["legacy", "note_entry"].includes(row.kind) || !["life", "work"].includes(row.category) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || typeof row.draft !== "string" || row.draft.length > 262144 || row.kind === "note_entry" && !/^[a-f0-9-]{36}$/i.test(row.id)) throw new Error("本机草稿字段无效。");
  return Object.fromEntries(fields.filter((key) => row[key] !== void 0).map((key) => [key, structuredClone(row[key])]));
}
async function noteDigest(row) {
  const value = JSON.stringify([row.id, row.category, row.date, row.draft, [...row.labels].sort()]);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function purgeVerifiedDrafts({ db, getScope, getGeneration }, snapshots2, tombstones, stillActive = () => true) {
  const owner2 = getScope(), generation = getGeneration();
  if (!owner2) return;
  const active5 = () => {
    if (owner2 !== getScope() || generation !== getGeneration() || !stillActive())
      throw new Error("Draft cleanup was cancelled");
  };
  const candidates = [];
  for (const snapshot of snapshots2) {
    const value = tombstones.get(snapshot.data?.id);
    if (snapshot.scope === owner2 && matchesDeletedEntry(snapshot.data, value))
      candidates.push({ snapshot, value, digest: await noteDigest(snapshot.data) });
  }
  active5();
  await db.transaction(["meta"], "readwrite", async (tx) => {
    active5();
    for (const { snapshot, value, digest: digest2 } of candidates) {
      active5();
      const current3 = await tx.get("meta", snapshot.key);
      if (!current3 || current3.scope !== owner2 || current3.draft_kind !== "note_entry" || JSON.stringify(current3) !== JSON.stringify(snapshot) || !matchesDeletedEntry(current3.data, value)) continue;
      const key = entityKey(owner2, "deleted-note-proof:" + digest2);
      const previous = await tx.get("meta", key);
      await tx.put("meta", { key, scope: owner2, version: Math.max(previous?.version || 0, value.version) });
      await tx.delete("meta", current3.key);
    }
    active5();
  });
}
async function purgeUserDeletedDrafts({ db, getScope, getGeneration }, raw, snapshots2, value, stillActive = () => true) {
  const owner2 = getScope(), generation = getGeneration(), target = safeDraft(raw);
  const evidenceRow = { ...target, draft: value?.text, labels: value?.labels };
  if (!owner2 || !eligible(target) || !matchesDeletedEntry(evidenceRow, value) || value.version !== target.version + 1) return;
  const digest2 = await noteDigest(target);
  const active5 = () => {
    if (owner2 !== getScope() || generation !== getGeneration() || !stillActive()) throw new Error("Draft cleanup was cancelled");
  };
  await db.transaction(["meta"], "readwrite", async (tx) => {
    active5();
    let removed4 = false;
    for (const snapshot of snapshots2) {
      const row = snapshot.data;
      if (snapshot.scope !== owner2 || snapshot.draft_kind !== "note_entry" || !row || !eligible(row) || row.id !== target.id || row.category !== target.category || row.date !== target.date || row.version !== target.version || row.draft !== target.draft || JSON.stringify([...row.labels].sort()) !== JSON.stringify([...target.labels].sort())) continue;
      const current3 = await tx.get("meta", snapshot.key);
      if (current3 && JSON.stringify(current3) === JSON.stringify(snapshot)) {
        await tx.delete("meta", current3.key);
        removed4 = true;
      }
    }
    if (removed4) {
      const key = entityKey(owner2, "deleted-note-proof:" + digest2), previous = await tx.get("meta", key);
      await tx.put("meta", { key, scope: owner2, version: Math.max(previous?.version || 0, value.version) });
    }
    active5();
  });
}
async function discardUnsentDraft({ db, getScope, getGeneration }, raw) {
  const owner2 = getScope(), generation = getGeneration(), row = safeDraft(raw);
  if (!owner2 || !eligible(row) || row.version !== 0 || (row.localVersion || 0) !== 0)
    throw new Error("本机草稿状态需要重新核对，内容已保留。");
  const digest2 = await noteDigest(row);
  const active5 = () => {
    if (owner2 !== getScope() || generation !== getGeneration()) throw new Error("草稿身份范围已变化。");
  };
  await db.transaction(["meta"], "readwrite", async (tx) => {
    active5();
    for (const stored of await tx.getAll("meta")) {
      const data3 = stored.data;
      if (stored.scope !== owner2 || stored.draft_kind !== "note_entry" || !data3 || !eligible(data3) || data3.version !== 0 || (data3.localVersion || 0) !== 0 || data3.id !== row.id || data3.category !== row.category || data3.date !== row.date || data3.draft !== row.draft || JSON.stringify([...data3.labels].sort()) !== JSON.stringify([...row.labels].sort())) continue;
      await tx.delete("meta", stored.key);
    }
    const key = entityKey(owner2, "deleted-note-proof:" + digest2);
    const previous = await tx.get("meta", key);
    await tx.put("meta", { key, scope: owner2, version: Math.max(previous?.version || 0, 1) });
    active5();
  });
}
async function discardSelectedDraft({ db, getScope, getGeneration, pending }, snapshot) {
  const owner2 = getScope(), generation = getGeneration();
  if (!owner2 || snapshot?.scope !== owner2 || !["legacy", "note_entry"].includes(snapshot?.draft_kind))
    throw new Error("草稿身份范围已变化，请重新查看。");
  await Promise.all([...pending]);
  return db.transaction(["meta"], "readwrite", async (tx) => {
    if (owner2 !== getScope() || generation !== getGeneration()) throw new Error("草稿身份范围已变化。");
    const current3 = await tx.get("meta", snapshot.key);
    if (!current3 || current3.scope !== owner2 || current3.draft_kind !== snapshot.draft_kind || JSON.stringify(current3) !== JSON.stringify(snapshot))
      throw new Error("草稿已变化，请重新查看后再删除。");
    await tx.delete("meta", snapshot.key);
    if (owner2 !== getScope() || generation !== getGeneration()) throw new Error("草稿身份范围已变化。");
    return true;
  });
}
function createDraftJournal({ db, getScope, getGeneration = () => 0, now = Date.now, draftOwner = crypto.randomUUID() }) {
  const pending = /* @__PURE__ */ new Set();
  async function write(rows) {
    const owner2 = getScope(), generation = getGeneration();
    if (!owner2) return;
    const clean = rows.map(safeDraft);
    const digests = await Promise.all(clean.map((row) => eligible(row) ? noteDigest(row) : null));
    const active5 = () => {
      if (owner2 !== getScope() || generation !== getGeneration())
        throw Object.assign(new Error("身份范围已变化，旧草稿保持原范围。"), { code: "OFFLINE_SCOPE_CHANGED" });
    };
    await db.transaction(["meta"], "readwrite", async (tx) => {
      active5();
      for (const [index, row] of clean.entries()) {
        const identity6 = row.kind === "legacy" ? row.category + ":" + row.date : row.id;
        const key = entityKey(owner2, "draft:" + row.kind + ":" + identity6 + ":" + draftOwner);
        const recovered = rows[index].recoveryProof;
        if (row.kind === "note_entry" && unresolved(row) && recovered && typeof recovered.key === "string" && typeof recovered.write_id === "string") {
          const source = await tx.get("meta", recovered.key), original = source?.data;
          if (source?.scope === owner2 && source.draft_kind === row.kind && source.write_id === recovered.write_id && original?.id === row.id && original.category === row.category && original.date === row.date && original.draft === row.draft && JSON.stringify(original.labels ?? (original.label ? [original.label] : [])) === JSON.stringify(row.labels ?? (row.label ? [row.label] : [])) && samePendingOperation(original.pending, row.pending) && JSON.stringify(original.remote ?? null) === JSON.stringify(row.remote ?? null) && (original.version === row.version || row.recoveredBaseline?.version === original.version && row.recoveredBaseline?.serverText === (original.serverText ?? null) && row.recoveredBaseline?.contentHash === (original.contentHash ?? null))) continue;
        }
        const proof = digests[index] && await tx.get("meta", entityKey(owner2, "deleted-note-proof:" + digests[index]));
        if (proof && row.version < proof.version) continue;
        if (unresolved(row)) await tx.put("meta", {
          key,
          scope: owner2,
          draft_kind: row.kind,
          draft_owner: draftOwner,
          data: row,
          saved_at: now(),
          write_id: crypto.randomUUID()
        });
        else if (row.kind === "note_entry") {
          await tx.delete("meta", key);
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
  async function records(kind) {
    const owner2 = getScope(), generation = getGeneration();
    if (!owner2) return [];
    const rows = await db.transaction(["meta"], "readonly", async (tx) => (await tx.getAll("meta")).filter((row) => row.scope === owner2 && row.draft_kind === kind).sort((a, b) => b.saved_at - a.saved_at));
    return owner2 === getScope() && generation === getGeneration() ? rows : [];
  }
  async function list2(kind) {
    return (await records(kind)).map((row) => row.data);
  }
  const tools = { db, getScope, getGeneration, pending };
  const purgeVerified = (snapshots2, tombstones, stillActive) => purgeVerifiedDrafts(tools, snapshots2, tombstones, stillActive);
  const purgeUserDeleted = (raw, snapshots2, value, stillActive) => purgeUserDeletedDrafts(tools, raw, snapshots2, value, stillActive);
  const discardUnsent = (raw) => discardUnsentDraft(tools, raw);
  const discardSelected = (snapshot) => discardSelectedDraft(tools, snapshot);
  return { capture, list: list2, records, purgeVerified, purgeUserDeleted, discardUnsent, discardSelected, flush: () => Promise.all([...pending]) };
}
var fields, unresolved, eligible;
var init_drafts = __esm({
  "web/offline/drafts.mjs"() {
    init_db();
    init_retained_drafts();
    fields = [
      "kind",
      "id",
      "category",
      "date",
      "draft",
      "version",
      "serverText",
      "contentHash",
      "label",
      "labels",
      "labelKnown",
      "createdAt",
      "updatedAt",
      "dirty",
      "phase",
      "pending",
      "remote",
      "deleted",
      "localVersion",
      "durableText",
      "localBacked",
      "localQueued",
      "recoveredBaseline"
    ];
    unresolved = (row) => row.dirty || row.pending || ["unknown", "conflict", "error", "oversize"].includes(row.phase);
    eligible = (row) => row.kind === "note_entry" && Array.isArray(row.labels) && Number.isSafeInteger(row.version) && row.version >= 0 && !row.pending && !row.remote && !row.localQueued && (!Number.isSafeInteger(row.localVersion) || row.localVersion <= row.version) && row.labelKnown !== false && !["unknown", "conflict"].includes(row.phase);
  }
});

// web/offline/conflict-draft-guards.mjs
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
  const id2 = value.slice(prefix.length);
  return uuid3.test(id2) ? id2.toLowerCase() : null;
}
function privateMemoJournals(storage2, owner2, id2) {
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
      const drafts = raw.drafts.filter((draft) => draft?.id === id2).map((draft) => draftSnapshot(draft, "memo"));
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
    const id2 = entityId(entity_id, "memo-note:"), store = id2 && getStore();
    if (!store) return null;
    const identity6 = getIdentity(), owner2 = store.state.draftOwner;
    const snapshot = () => stable3({
      draft: draftSnapshot(store.drafts.get(id2), "memo"),
      operation: store.state.operation?.pending?.id === id2 ? pendingIntent(store.state.operation.pending) : null,
      composing: getComposing(id2) === true,
      journals: privateMemoJournals(getStorage(), owner2, id2)
    });
    let initial;
    try {
      initial = snapshot();
    } catch {
      changed();
    }
    return () => {
      if (store !== getStore() || identity6 !== getIdentity() || owner2 !== store.state.draftOwner) changed();
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
    const id2 = entityId(entity_id, "note-entry:");
    if (!id2) return null;
    const find = () => [...getStores()].filter(([, store]) => store.entries.has(id2));
    const initialStores = find();
    if (!initialStores.length) return null;
    const identity6 = getIdentity();
    const snapshot = (rows) => stable3({
      drafts: rows.map(([category, store]) => [category, draftSnapshot(store.entries.get(id2), "note")]),
      composing: getComposing(id2) === true
    });
    const initial = snapshot(initialStores);
    return () => {
      const current3 = find();
      if (identity6 !== getIdentity() || current3.length !== initialStores.length || current3.some(([category, store], index) => category !== initialStores[index][0] || store !== initialStores[index][1])) changed();
      if (snapshot(current3) !== initial) changed();
    };
  };
}
var factories, uuid3, changed, fields2, canonical3, stable3;
var init_conflict_draft_guards = __esm({
  "web/offline/conflict-draft-guards.mjs"() {
    factories = /* @__PURE__ */ new Set();
    uuid3 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    changed = () => {
      throw Object.assign(new Error("本机输入或身份已变化，请保留原文并重新比较。"), { code: "OFFLINE_CONFLICT_CHANGED" });
    };
    fields2 = (value, names) => value ? Object.fromEntries(names.filter((name) => value[name] !== void 0).map((name) => [name, value[name]])) : null;
    canonical3 = (value) => Array.isArray(value) ? value.map(canonical3) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical3(value[key])])) : value;
    stable3 = (value) => JSON.stringify(canonical3(value));
  }
});

// web/offline/memos.mjs
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
  const invalid4 = () => {
    throw Object.assign(fail3("备忘录字段无效，输入仍保留。"), { status: 400 });
  };
  if (Object.keys(body2).sort().join(",") !== fields5.sort().join(",") || !uuid4.test(body2.save_id) || !Number.isSafeInteger(body2.version) || body2.version < 0 || body2.version >= Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(body2.position) || body2.position < 0 || body2.position > 1e6 || !plain2(body2.title) || !body2.title.trim() || [...body2.title.trim()].length > 120 || /[\r\n\t]/.test(body2.title)) invalid4();
  body2.title = body2.title.trim();
  if (kind === "notes") {
    if (!uuid4.test(body2.group_id) || !plain2(body2.body)) invalid4();
    body2.body = body2.body.replace(/\r\n?/g, "\n");
    if (new TextEncoder().encode(body2.body).length > 65536) invalid4();
  }
  return body2;
}
function memoReads(context) {
  async function project(path) {
    const route2 = memoRoute(path), guard = scoped(context);
    if (!route2 || route2.kind === "groups") throw fail3("此备忘录尚未缓存。", "OFFLINE_CACHE_MISS");
    const result = await context.db.transaction(["entities", "outbox", "conflicts", "meta"], "readonly", async (tx) => {
      guard.check();
      const cap = await tx.get("meta", entityKey(guard.scope, "memo-capability"));
      const entities = (await tx.getAll("entities")).filter((row) => row.scope === guard.scope);
      const records = {
        operations: (await tx.getAll("outbox")).filter((row) => row.scope === guard.scope),
        conflicts: (await tx.getAll("conflicts")).filter((row) => row.scope === guard.scope)
      };
      const canEdit = cap?.can_edit === true;
      if (route2.kind === "notes") {
        const entity = entities.find((row) => row.key === keyFor(guard.scope, "notes", route2.id));
        if (!entity || typeof offlineValue(entity)?.body !== "string") throw fail3("请联网读取此笔记正文。", "OFFLINE_CACHE_MISS");
        const document2 = memoDocument(entity, records, canEdit);
        if (!document2) throw fail3("笔记已不在当前缓存范围。", "OFFLINE_CACHE_MISS");
        guard.check();
        return document2;
      }
      const values = (kind) => entities.filter((row) => row.entity_id.startsWith(kind === "groups" ? "memo-group:" : "memo-note:")).map((row) => memoDocument(row, records, canEdit, true)).filter(Boolean).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
      const data3 = {
        groups: values("groups"),
        notes: values("notes"),
        can_edit: canEdit,
        ...cap?.draft_scope ? { draft_scope: cap.draft_scope } : {}
      };
      guard.check();
      return data3;
    });
    guard.check();
    return result;
  }
  return { project };
}
function memoCache(context) {
  const serverFence3 = (rows, route2) => JSON.stringify(rows.filter((row) => row.server && row.entity_id.startsWith("memo-") && (route2.kind === "index" || row.entity_id === "memo-note:" + route2.id)).map((row) => [row.entity_id, Object.fromEntries(fields3.map((field2) => [field2, row.server[field2]]))]).sort((a, b) => a[0].localeCompare(b[0])));
  async function fence(path) {
    const guard = scoped(context), route2 = memoRoute(path);
    const rows = await context.db.transaction(["entities"], "readonly", (tx) => tx.getAll("entities"));
    guard.check();
    return serverFence3(rows.filter((row) => row.scope === guard.scope), route2);
  }
  async function remember(path, value, { baseline } = {}) {
    const route2 = memoRoute(path), guard = scoped(context);
    if (!route2) return value;
    if (route2.kind === "index" && (!Array.isArray(value?.groups) || !Array.isArray(value.notes) || typeof value.can_edit !== "boolean")) throw fail3("备忘录索引不完整，未覆盖本机内容。");
    await context.db.transaction(["entities", "meta"], "readwrite", async (tx) => {
      guard.check();
      const initial = (await tx.getAll("entities")).filter((row) => row.scope === guard.scope);
      if (baseline !== void 0 && baseline !== serverFence3(initial, route2))
        throw fail3("本机刚确认了新版本，请重新读取备忘录。", "OFFLINE_CACHE_CHANGED");
      const collections2 = route2.kind === "index" ? [["groups", value.groups], ["notes", value.notes]] : [[route2.kind, [value]]];
      for (const [kind, rows] of collections2) for (const raw of rows) {
        const server = checked2(raw, kind, route2.kind === "notes"), key = keyFor(guard.scope, kind, server.id);
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
      if (route2.kind === "index") await tx.put("meta", {
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
  async function mutate(path, options4, assertActive) {
    const route2 = memoRoute(path), guard = scoped(context, assertActive);
    if (!route2 || !["notes", "groups"].includes(route2.kind) || options4.method?.toUpperCase() !== "PUT") {
      throw fail3("备忘录删除和恢复需联网确认。", "OFFLINE_UNSUPPORTED");
    }
    const body2 = checkedInput(options4.body, route2.kind, context.uuid);
    const cap = await context.db.transaction(["meta"], "readonly", (tx) => tx.get("meta", entityKey(guard.scope, "memo-capability")));
    guard.check();
    if (cap?.can_edit !== true) throw fail3("请先联网确认备忘录编辑权限。", "OFFLINE_SCOPE_REQUIRED");
    const key = keyFor(guard.scope, route2.kind, route2.id);
    const old = await context.db.transaction(["entities"], "readonly", (tx) => tx.get("entities", key));
    guard.check();
    const visible4 = offlineValue(old);
    if (visible4?.deleted_at || visible4?.deleted) throw fail3("笔记已删除，请联网核对后恢复。", "OFFLINE_MEMO_DELETED");
    const local = {
      ...visible4,
      ...body2,
      id: route2.id,
      version: body2.version + 1,
      created_at: visible4?.created_at || new Date(context.now()).toISOString(),
      updated_at: new Date(context.now()).toISOString(),
      deleted_at: null
    };
    const result = await context.outbox.enqueue({
      scope: guard.scope,
      entity_type: route2.kind === "notes" ? "memo_note" : "memo_group",
      entity_id: route2.id,
      method: "PUT",
      path,
      body: body2,
      base: old?.server || null,
      local,
      assertActive: guard.check,
      ...route2.kind === "notes" ? { protocol: 2, depends_on: ["memo-group:" + body2.group_id] } : {},
      ...options4.offlineUnknown ? { initial_status: "unknown" } : {}
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
function createMemoOfflineAdapter(options4) {
  const context = { getGeneration: () => 0, now: Date.now, uuid: () => crypto.randomUUID(), ...options4 };
  Object.assign(context, memoReads(context), memoCache(context), memoWrites(context));
  return { project: context.project, remember: context.remember, mutate: context.mutate, fence: context.fence };
}
var uuid4, active3, fail3, keyFor, fields3;
var init_memos = __esm({
  "web/offline/memos.mjs"() {
    init_db();
    init_document();
    uuid4 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    active3 = (value) => !["archived", "acked"].includes(value.status);
    fail3 = (message, code = "OFFLINE_MEMO_INVALID") => Object.assign(new Error(message), { code });
    keyFor = (scope, kind, id2) => entityKey(scope, (kind === "notes" ? "memo-note:" : "memo-group:") + id2);
    fields3 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at", "group_id", "body"];
  }
});

// web/offline/runtime.mjs
async function identityProbe(context, path, options4 = {}) {
  const scope = context.state.scope, generation = context.generation;
  if (scope) {
    const deadline = Math.max(context.cooldownUntil || 0, await context.outbox.cooldown(scope));
    if (generation !== context.generation || scope !== context.state.scope) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
    if (deadline > context.now()) throw Object.assign(
      new Error("请求较多，请稍后重试。"),
      { status: 429, rateLimitedUntil: deadline, retryAfterMs: deadline - context.now() }
    );
  }
  const controller = new AbortController(), external2 = options4.signal;
  const abort = () => controller.abort(external2.reason);
  if (external2?.aborted) abort();
  else external2?.addEventListener("abort", abort, { once: true });
  let timer2;
  try {
    const expired = new Promise((_, reject) => {
      timer2 = setTimeout(() => {
        reject(fail4("身份范围核实暂未完成，本机内容已保留。", "OFFLINE_NETWORK"));
        controller.abort();
      }, 1e4);
    });
    return await Promise.race([context.request(path, { ...options4, signal: controller.signal }), expired]);
  } finally {
    clearTimeout(timer2);
    external2?.removeEventListener("abort", abort);
  }
}
function writableRoute(path, options4, features) {
  if (!features.todos) return null;
  const method2 = (options4.method || "GET").toUpperCase();
  if (["/todos", "/todo-templates", "/unscheduled-todos"].includes(path) && method2 === "POST")
    return { type: path === "/todos" ? "todo" : path === "/unscheduled-todos" ? "unscheduled_todo" : "template", create: true };
  const match = /^\/(todos|todo-templates|unscheduled-todos)\/([a-f0-9-]{36})(\/restore)?$/i.exec(path);
  if (!match || !uuidPattern5.test(match[2])) return null;
  if (match[3] && (method2 !== "POST" || !["todos", "unscheduled-todos"].includes(match[1])) || !match[3] && !["PATCH", "DELETE"].includes(method2)) return null;
  return {
    type: match[1] === "todos" ? "todo" : match[1] === "unscheduled-todos" ? "unscheduled_todo" : "template",
    id: match[2].toLowerCase(),
    restore: Boolean(match[3])
  };
}
function checkedBody(route2, options4, uuid5) {
  const body2 = structuredClone(options4.body || {}), method2 = (options4.method || "GET").toUpperCase();
  const required = route2.create ? route2.type === "todo" ? ["id", "date", "text"] : ["id", "text"] : route2.type === "todo" ? route2.restore || method2 === "DELETE" ? ["date", "version"] : ["completed", "version"] : route2.type === "unscheduled_todo" ? route2.restore || method2 === "DELETE" ? ["version"] : ["completed", "version"] : method2 === "DELETE" ? ["version"] : ["text", "version"];
  if (route2.create && !body2.id) body2.id = uuid5();
  const allowed = [...required, ...route2.create && route2.type === "todo" ? ["template_id"] : []];
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
  if (!route2.create && (!Number.isSafeInteger(body2.version) || body2.version < 1 || body2.version >= Number.MAX_SAFE_INTEGER))
    throw fail4("版本无效，本次操作未保存。", "OFFLINE_INVALID_MUTATION");
  return body2;
}
function runtimeContext(options4) {
  const {
    db,
    request: request2,
    now = Date.now,
    uuid: uuid5 = () => crypto.randomUUID(),
    online = () => globalThis.navigator?.onLine !== false,
    onIdentity = () => {
    },
    features = OFFLINE_FEATURES
  } = options4;
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
    errorStage: null,
    ready: true
  };
  const listeners2 = /* @__PURE__ */ new Set();
  const emit2 = () => {
    for (const callback of listeners2) callback({ ...state2 });
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
    request: request2,
    now,
    uuid: uuid5,
    online,
    onIdentity,
    features,
    state: state2,
    cache: cache2,
    emit: emit2,
    listeners: listeners2,
    generation: 0,
    authFlight: null,
    scopeFlight: null,
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
    const checkCooldown = async () => {
      const deadline = Math.max(context.cooldownUntil || 0, await context.outbox.cooldown(owner2));
      if (owner2 !== state2.scope || generation !== context.generation) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
      if (deadline > now()) throw Object.assign(
        new Error("请求较多，请稍后重试。"),
        { status: 429, rateLimitedUntil: deadline, retryAfterMs: deadline - now() }
      );
    };
    try {
      await checkCooldown();
      if (opts?.method && !["GET", "HEAD"].includes(opts.method.toUpperCase())) await context.verifyScope();
      if (!state2.verifiedScope || owner2 !== state2.scope || generation !== context.generation) throw offlineError();
      await checkCooldown();
      const labelOpts = features.labelsV1 && path.startsWith("/note-entries") ? { ...opts, headers: { ...opts?.headers, "X-Note-Labels-Version": "1" } } : opts;
      const result = await request2(path, labelOpts);
      if (owner2 !== state2.scope || generation !== context.generation) throw fail4("身份范围已变化。", "OFFLINE_SCOPE_CHANGED");
      return result;
    } catch (error) {
      if (owner2 !== state2.scope || generation !== context.generation)
        throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
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
    timeout: options4.timeout,
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
async function adoptIdentity(context, me, index, generation, invalidate) {
  const { cache: cache2, state: state2, emit: emit2, onIdentity } = context;
  const identity6 = safeIdentity(me);
  if (generation !== context.generation) throw fail4("身份读取已过期。", "OFFLINE_SCOPE_CHANGED");
  if (!scopePattern.test(index?.scope_id) || index.complete !== true || index.projection !== "current")
    throw fail4("身份范围读取不完整，请联网重试。", "OFFLINE_SCOPE_REQUIRED");
  if (state2.scope && (state2.scope !== index.scope_id || identityFingerprint(state2.identity) !== identityFingerprint(identity6))) {
    await invalidate({ forget: true });
    throw fail4("当前身份范围已变化，原本机内容与队列已保留，请重新打开页面。", "OFFLINE_SCOPE_CHANGED");
  }
  await cache2.saveIdentity(identity6, index.scope_id);
  if (generation !== context.generation || state2.scope && state2.scope !== index.scope_id) {
    await invalidate({ forget: true });
    throw fail4("身份核实已过期，原本机数据已保留。", "OFFLINE_SCOPE_CHANGED");
  }
  state2.scope = index.scope_id;
  state2.verifiedScope = index.scope_id;
  state2.identity = identity6;
  state2.online = true;
  onIdentity(me);
  emit2();
  return me;
}
function identityActions(context) {
  const { cache: cache2, state: state2, emit: emit2, request: request2, onIdentity } = context;
  async function invalidate({ forget = false } = {}) {
    context.generation++;
    context.authFlight = null;
    context.scopeFlight = null;
    context.cooldownUntil = 0;
    state2.scope = null;
    state2.verifiedScope = null;
    state2.identity = null;
    state2.pending = 0;
    state2.conflicts = 0;
    state2.unsupported = 0;
    state2.phase = "paused";
    if (forget) await cache2.forgetIdentity();
    emit2();
  }
  const adopt = (me, index, generation) => adoptIdentity(context, me, index, generation, invalidate);
  async function authenticate(options4 = {}) {
    const generation = context.generation;
    let liveIdentity = null;
    try {
      const me = await identityProbe(context, "/auth/me", options4);
      liveIdentity = safeIdentity(me);
      let index;
      try {
        index = await identityProbe(context, "/workbench-snapshot/index", { suppressAuthRedirect: true });
      } catch (error) {
        error.offlineScopeFailure = true;
        throw error;
      }
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
      emit2();
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
  async function verifyScopeOnce() {
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
      if (generation !== context.generation || state2.scope !== owner2) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
      state2.verifiedScope = null;
      if ([401, 403].includes(error.status)) await invalidate({ forget: true });
      throw error;
    }
  }
  function verifyScope() {
    if (!context.scopeFlight) {
      const flight = verifyScopeOnce().finally(() => {
        if (context.scopeFlight === flight) context.scopeFlight = null;
      });
      context.scopeFlight = flight;
    }
    return context.scopeFlight;
  }
  return { authenticate, verify, verifyScope, invalidate };
}
function stateActions(context) {
  const { state: state2, outbox, emit: emit2, online } = context;
  async function refresh() {
    const sequence5 = context.refreshSequence = (context.refreshSequence || 0) + 1;
    if (!state2.scope) {
      emit2();
      return { ...state2 };
    }
    const owner2 = state2.scope, generation = context.generation;
    const [pending, conflicts] = await Promise.all([outbox.list(owner2), outbox.conflicts.list(owner2)]);
    if (sequence5 !== context.refreshSequence || owner2 !== state2.scope || generation !== context.generation) return { ...state2 };
    state2.pending = pending.length;
    state2.conflicts = conflicts.length;
    state2.online = online() && state2.online;
    state2.unsupported = pending.filter((row) => !outbox.canDispatch(row)).length;
    if (state2.phase !== "syncing") state2.phase = state2.unsupported ? "upgrade-required" : conflicts.length ? "conflict" : state2.online ? pending.length ? "pending" : "synced" : "offline";
    emit2();
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
  async function resolve(key, choice2, options4 = {}) {
    if (!state2.scope) throw fail4("请先核实身份。", "OFFLINE_SCOPE_REQUIRED");
    const conflict = (await outbox.conflicts.list(state2.scope)).find((row) => row.key === key);
    if (conflict && !outbox.canDispatch(conflict.operation)) throw fail4("此本机操作需新版页面处理，原内容已保留。", "OFFLINE_UPGRADE_REQUIRED");
    const owner2 = state2.scope, generation = context.generation;
    const checkDraft = captureConflictDraftGuard(conflict?.entity_id);
    const active5 = () => {
      if (options4.signal?.aborted) throw new DOMException("请求已取消", "AbortError");
      if (owner2 !== state2.scope || generation !== context.generation) throw fail4("身份已变化，原文已保留。", "OFFLINE_SCOPE_CHANGED");
      checkDraft();
    };
    active5();
    await context.verifyScope();
    active5();
    const result = await outbox.resolve(key, choice2, {
      scope: owner2,
      assertActive: active5,
      expected: options4.expected,
      copyConfirmed: options4.copyConfirmed
    });
    await refresh();
    context.broadcast();
    if (result.resolution?.state === "queued" && context.online()) context.scheduleRetry();
    return result;
  }
  return { refresh, queue, resolve };
}
async function runSync(context) {
  const { state: state2, emit: emit2, outbox, snapshot, now, online } = context;
  if (!online()) {
    state2.verifiedScope = null;
    return context.refresh();
  }
  let stage = "identity";
  let owner2 = state2.scope, generation = context.generation;
  const active5 = () => generation === context.generation && owner2 === state2.scope;
  try {
    if (state2.scope) context.cooldownUntil = Math.max(context.cooldownUntil || 0, await outbox.cooldown(state2.scope));
    if (!active5()) return { ...state2 };
    if (context.cooldownUntil > now()) {
      context.scheduleRetry();
      return context.refresh();
    }
    await context.verify();
    if (generation !== context.generation || owner2 && owner2 !== state2.scope) return { ...state2 };
    if (!state2.verifiedScope) return context.refresh();
    owner2 = state2.scope;
    generation = context.generation;
    state2.phase = "syncing";
    emit2();
    stage = "outbox";
    await outbox.resume(state2.scope);
    if (!active5()) return { ...state2 };
    const drained = await outbox.drain();
    if (!active5()) return { ...state2 };
    if (drained.rateLimitedUntil > now()) throw Object.assign(
      new Error("请求较多，请稍后重试。"),
      { status: 429, rateLimitedUntil: drained.rateLimitedUntil }
    );
    stage = "cache";
    if (state2.verifiedScope) await context.cache.captureDocuments();
    if (!active5()) return { ...state2 };
    if (state2.verifiedScope) {
      stage = "snapshot";
      await (context.snapshotV2 || snapshot).pull({ date: today(now) });
      if (!active5()) return { ...state2 };
      if (context.lastTodoPath) {
        stage = "cache";
        const date = offlineReadRoute(context.lastTodoPath).date;
        if ((await context.cache.entities()).some((row) => row.needs_api_refresh && row.server?.date === date))
          await context.call(context.lastTodoPath);
      }
    }
    if (!active5()) return { ...state2 };
    state2.lastSuccess = now();
    state2.error = null;
    state2.errorStage = null;
  } catch (error) {
    if (!active5()) return { ...state2 };
    if (error.status === 429) {
      const deadline = Number.isSafeInteger(error.rateLimitedUntil) ? error.rateLimitedUntil : retryUntil(now(), error.retryAfterMs);
      context.cooldownUntil = Math.max(context.cooldownUntil || 0, deadline);
      if (owner2) {
        const assertActive = () => {
          if (!active5()) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
        };
        try {
          await outbox.setCooldown(owner2, context.cooldownUntil, assertActive);
        } catch {
        }
      }
    }
    if (!active5()) return { ...state2 };
    state2.error = error.message;
    state2.errorStage = stage;
    if (error.status) state2.online = true;
    else if (networkFailure(error)) state2.online = false;
  }
  state2.phase = "idle";
  await context.refresh();
  if (!active5()) return { ...state2 };
  context.broadcast();
  if (state2.pending && state2.online && !context.stopped) context.scheduleRetry();
  return { ...state2 };
}
function syncActions(context) {
  const { state: state2, emit: emit2, outbox, snapshot, now, online } = context;
  const run2 = () => runSync(context);
  function sync({ rerun = false } = {}) {
    if (context.syncFlight) {
      context.syncAgain = true;
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
    const owner2 = state2.scope, generation = context.generation;
    if (!owner2) return;
    outbox.retryable(owner2).then(async (operations2) => {
      if (context.stopped || state2.scope !== owner2 || context.generation !== generation) return;
      if (!operations2.length) return;
      const next = Math.min(...operations2.map((row) => row.next_attempt_at || 0));
      const deadline = Math.max(context.cooldownUntil || 0, await outbox.cooldown(owner2));
      if (context.stopped || state2.scope !== owner2 || context.generation !== generation) return;
      const delay = Math.min(MAX_TIMER_DELAY, Math.max(100, next - now(), deadline - now()));
      clearTimeout(context.timer);
      context.timer = setTimeout(() => {
        if (!context.stopped) void sync({ rerun: true });
      }, delay);
      context.timer?.unref?.();
    }).catch((error) => {
      if (!context.stopped && state2.scope === owner2 && context.generation === generation) {
        state2.error = error.message;
        emit2();
      }
    });
  }
  return { sync, scheduleRetry };
}
async function unmanaged(context, path, options4, guard) {
  try {
    guard();
    return await context.request(path, options4);
  } catch (error) {
    if ([401, 403].includes(error.status)) await context.invalidate({ forget: true });
    throw error;
  }
}
async function mutateMemo(context, path, options4, guard) {
  const value = await context.memos.mutate(path, options4, guard);
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
    context.state.errorStage = "cache";
    context.emit();
    return value;
  }
}
function labelRequestOptions(path, options4, features) {
  return features.labelsV1 && path.startsWith("/note-entries") ? { ...options4, headers: { ...options4.headers, "X-Note-Labels-Version": "1" } } : options4;
}
async function readCachedOffline(context, path, guard) {
  const { state: state2, cache: cache2, features } = context;
  state2.verifiedScope = null;
  state2.online = false;
  const memo = features.memos && memoRoute(path);
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
  const data3 = ["legacy", ...!features.notes ? ["note_entries", "note_entry"] : [], "memos", "memo_note"].includes(kind) ? { ...cached.data, can_edit: false, ...Array.isArray(cached.data.entries) ? { entries: cached.data.entries.map((entry) => ({ ...entry, can_edit: false })) } : {} } : cached.data;
  await context.refresh();
  return data3;
}
function mutationActions(context) {
  const { state: state2, cache: cache2, now, uuid: uuid5, outbox, features } = context;
  async function mutate(path, options4, route2, guard) {
    guard();
    if (!state2.scope || !state2.identity) throw fail4("请先联网读取此工作台，再保存离线内容。", "OFFLINE_SCOPE_REQUIRED");
    const owner2 = state2.scope, generation = context.generation;
    const active5 = () => {
      guard();
      if (owner2 !== state2.scope || generation !== context.generation)
        throw fail4("身份范围已变化，本次修改未保存，输入已保留。", "OFFLINE_SCOPE_CHANGED");
    };
    const body2 = checkedBody(route2, options4, uuid5), id2 = route2.id || body2.id;
    const old = await cache2.entity(route2.type + ":" + id2), base = old?.server || null, visible4 = offlineValue(old);
    active5();
    if (route2.create && route2.type === "todo" && visible4) {
      if (!visible4.deleted_at && !visible4.deleted && visible4.date === body2.date && visible4.text === body2.text && (visible4.template_id || void 0) === (body2.template_id || void 0)) return structuredClone(visible4);
      throw fail4(visible4.date ? `此待办已安排到 ${visible4.date}，原未来待办仍保留。` : "该待办标识已使用，原未来待办仍保留。", "TODO_ID_IN_USE");
    }
    if (!route2.create && !visible4) throw fail4("此事项尚未保存在本机，请联网读取后再操作。", "OFFLINE_CACHE_MISS");
    const stamp3 = new Date(now()).toISOString(), method2 = options4.method.toUpperCase();
    const local = {
      ...visible4,
      ...body2,
      id: id2,
      created_at: visible4?.created_at || stamp3,
      updated_at: stamp3,
      deleted_at: method2 === "DELETE" ? stamp3 : route2.restore ? null : visible4?.deleted_at || null,
      ...route2.create ? { completed: false, ...route2.type === "template" ? { completed_days: 0, habit_status: "todo" } : {} } : {},
      ...route2.restore ? { deleted: false } : {}
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
      entity_type: route2.type,
      entity_id: id2,
      method: method2,
      path,
      body: body2,
      base,
      local,
      ...route2.type === "unscheduled_todo" ? { protocol: 4 } : {},
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
    }, ...options4 } = input;
    guard();
    const method2 = (options4.method || "GET").toUpperCase(), route2 = writableRoute(path, options4, features);
    const memo = features.memos && memoRoute(path);
    const noteRoute = noteMutationRoute(path, options4, features);
    if (noteRoute) return context.noteMutations.mutate(path, options4, noteRoute, guard);
    if (path === "/auth/me" && method2 === "GET") return options4.context || options4.signal ? context.authenticate(options4) : context.verify();
    if (["/auth/login", "/auth/logout"].includes(path) && method2 === "POST") {
      const value = await context.request(path, labelRequestOptions(path, options4, features));
      await context.invalidate({ forget: true });
      return value;
    }
    if (route2) return mutate(path, options4, route2, guard);
    if (memo && method2 === "PUT") return mutateMemo(context, path, options4, guard);
    if (method2 !== "GET" || !offlineReadRoute(path)) return unmanaged(context, path, options4, guard);
    if (offlineReadRoute(path).kind === "todo") context.lastTodoPath = path;
    try {
      if (context.online() && state2.identity) await context.verifyScope();
      guard();
      const owner2 = state2.scope, generation = context.generation;
      const baseline = owner2 ? await (memo ? context.memos.fence(path) : cache2.fence(path)) : void 0;
      guard();
      const value = await context.request(path, labelRequestOptions(path, options4, features));
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
      return readCachedOffline(context, path, guard);
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
    const timer2 = setInterval(sync, 3e5);
    timer2?.unref?.();
    if (BroadcastChannel) {
      context.channel = new BroadcastChannel("haoduoyu-offline-status-v1");
      context.channel.onmessage = (event) => {
        if (event.data?.type === "changed" && event.data.scope === context.state.scope) void context.refresh();
      };
    }
    stop = () => {
      context.stopped = true;
      clearTimeout(context.timer);
      clearInterval(timer2);
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
async function readTodoMonthSnapshot(context, month) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000")) return null;
  if (context.syncFlight) {
    let timer2;
    const completed = await Promise.race([
      context.syncFlight.then(() => true),
      new Promise((resolve) => {
        timer2 = setTimeout(() => resolve(false), 5e3);
      })
    ]);
    clearTimeout(timer2);
    if (!completed) return null;
  }
  const owner2 = context.state.scope, generation = context.generation;
  if (!owner2 || context.state.verifiedScope !== owner2) return null;
  const result = await context.db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const snapshot = await tx.get("meta", entityKey(owner2, "snapshot-v2"));
    const index = snapshot?.value?.index, verified = snapshot?.value?.verified_at;
    if (index?.complete !== true || index.scope_id !== owner2 || !Array.isArray(index.entities) || !Number.isFinite(verified) || verified > context.now() || context.now() - verified > 6e4) return null;
    const entities = (await tx.getAll("entities")).filter((row) => row.scope === owner2);
    const byId = new Map(entities.map((row) => [row.entity_id, row]));
    const items = /* @__PURE__ */ new Map();
    for (const expected of index.entities.filter((row) => row.entity_type === "todo" && row.date?.startsWith(month + "-") && !row.deleted_at)) {
      const entity = byId.get(expected.entity_id);
      if (!entity?.server || entity.remote_missing || entity.snapshot_hash !== expected.content_hash || entity.server.date !== expected.date || entity.server.updated_at !== expected.updated_at || entity.server.deleted_at) return null;
      items.set(expected.entity_id, { ...entity.server, completed: Boolean(entity.server.completed) });
    }
    for (const entity of entities) {
      const server = entity.server;
      if (entity.entity_id.startsWith("todo:") && !entity.dirty && !entity.remote_missing && server && !server.deleted_at && server.date?.startsWith(month + "-") && !items.has(entity.entity_id)) return null;
    }
    for (const entity of entities.filter((row) => row.entity_id.startsWith("todo:") && row.dirty)) {
      items.delete(entity.entity_id);
      const value = offlineValue(entity);
      if (value && !value.deleted && !value.deleted_at && value.date?.startsWith(month + "-"))
        items.set(entity.entity_id, { ...value, completed: Boolean(value.completed) });
    }
    const days = {};
    for (const item of items.values()) (days[item.date] ||= []).push(item);
    return { days, verified_at: verified };
  });
  if (generation !== context.generation || owner2 !== context.state.scope || context.state.verifiedScope !== owner2)
    throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
  return result;
}
async function acceptMovedTodo(context, { source, todo }, token) {
  const active5 = () => token && context.state.scope === token.scope && context.state.verifiedScope === token.scope && context.generation === token.generation;
  if (!active5() || !source?.id || source.id !== todo?.id) return "refresh";
  const ids = ["unscheduled_todo:" + source.id, "todo:" + source.id];
  return context.db.transaction(["entities", "outbox", "conflicts", "meta"], "readwrite", async (tx) => {
    if (!active5()) return "refresh";
    const [operations2, conflicts] = await Promise.all([tx.getAll("outbox"), tx.getAll("conflicts")]);
    if (operations2.some((op) => op.scope === token.scope && ids.includes(op.entity_id) && !["done", "archived"].includes(op.status)) || conflicts.some((conflict) => conflict.scope === token.scope && conflict.resolved_at === null && ids.includes(conflict.operation?.entity_id || conflict.entity_id))) return "pending";
    const keys = ids.map((id2) => entityKey(token.scope, id2));
    const old = await Promise.all(keys.map((key) => tx.get("entities", key)));
    if (!active5()) return "refresh";
    if (old.some((entity) => entity?.dirty)) return "pending";
    if (old.some((entity, i) => entity?.server?.version > [source, todo][i].version)) return "refresh";
    for (const [i, row] of [source, todo].entries()) {
      await tx.put("entities", {
        ...old[i],
        key: keys[i],
        scope: token.scope,
        entity_id: ids[i],
        server: structuredClone(row),
        remote_missing: false,
        ...i === 1 ? { needs_api_refresh: false } : {}
      });
    }
    if (!active5()) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
    const day6 = await tx.get("meta", entityKey(token.scope, "get:/todos?date=" + encodeURIComponent(todo.date)));
    if (!active5()) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
    return Array.isArray(day6?.data?.items) ? "saved" : "refresh";
  });
}
function createOfflineRuntime(options4) {
  const context = runtimeContext(options4);
  Object.assign(context, identityActions(context), stateActions(context), syncActions(context), lifecycleActions(context));
  Object.assign(context, mutationActions(context));
  context.noteMutations = createNoteMutations(context);
  const drafts = createDraftJournal({ db: context.db, getScope: () => context.state.scope, getGeneration: () => context.generation, now: context.now });
  function captureRateLimitContext() {
    const scope = context.state.scope;
    return scope && context.state.verifiedScope === scope ? { scope, generation: context.generation } : null;
  }
  async function recordRateLimit(token, delay) {
    const active5 = () => {
      if (!token || context.generation !== token.generation || context.state.scope !== token.scope || context.state.verifiedScope !== token.scope) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
    };
    try {
      active5();
      const deadline = retryUntil(context.now(), delay);
      context.cooldownUntil = Math.max(context.cooldownUntil || 0, deadline);
      await context.outbox.setCooldown(token.scope, context.cooldownUntil, active5);
      active5();
      if (!context.stopped) context.scheduleRetry();
    } catch {
    }
  }
  async function callWithRateLimit(path, options5) {
    const token = captureRateLimitContext();
    try {
      return await context.call(path, options5);
    } catch (error) {
      if (error.status === 429) await recordRateLimit(token, error.retryAfterMs);
      throw error;
    }
  }
  return {
    call: callWithRateLimit,
    sync: context.sync,
    start: context.start,
    stop: context.stop,
    refresh: context.refresh,
    captureRateLimitContext,
    recordRateLimit,
    readMemo: (path) => context.memos.project(path),
    readTodoMonthSnapshot: (month) => readTodoMonthSnapshot(context, month),
    async findTodo(id2) {
      const owner2 = context.state.scope, generation = context.generation;
      if (!owner2) throw fail4("请先读取工作台数据，原未来待办仍保留。", "OFFLINE_SCOPE_REQUIRED");
      const entity = await context.cache.entity("todo:" + id2);
      if (owner2 !== context.state.scope || generation !== context.generation) throw fail4("账号已切换，原未来待办仍保留。", "OFFLINE_SCOPE_CHANGED");
      return structuredClone(offlineValue(entity) || null);
    },
    // Confirmed server moves are reflected without discarding local edits.
    acceptMovedTodo: (move, token) => acceptMovedTodo(context, move, token),
    queue: context.queue,
    resolve: context.resolve,
    invalidate: context.invalidate,
    state: context.state,
    localRead: async (path) => (await context.cache.read(path)).data,
    retainDrafts: drafts.capture,
    retainedDrafts: drafts.list,
    retainedDraftRecords: drafts.records,
    purgeVerifiedNoteDrafts: drafts.purgeVerified,
    purgeUserDeletedNoteDrafts: drafts.purgeUserDeleted,
    discardUnsentNoteDraft: drafts.discardUnsent,
    discardSelectedDraft: drafts.discardSelected,
    flushDrafts: drafts.flush,
    subscribe(callback) {
      context.listeners.add(callback);
      callback({ ...context.state });
      return () => context.listeners.delete(callback);
    }
  };
}
function getOfflineRuntime() {
  return singleton;
}
function captureOfflineRateLimitContext() {
  const token = singleton?.captureRateLimitContext();
  return token ? { runtime: singleton, token } : null;
}
async function recordOfflineRateLimit(captured, delay) {
  if (captured?.runtime === singleton) await singleton.recordRateLimit(captured.token, delay);
}
function onOfflineRuntime(callback) {
  readyListeners.add(callback);
  if (singleton) callback(singleton);
  return () => readyListeners.delete(callback);
}
async function offlineRequest(path, options4, request2, onIdentity, assertActive = () => {
}) {
  if (!initialization) initialization = openOfflineDB().then((db) => {
    singleton = createOfflineRuntime({ db, request: request2, onIdentity });
    for (const callback of readyListeners) callback(singleton);
    return singleton;
  });
  let runtime2;
  try {
    runtime2 = await initialization;
  } catch {
    assertActive();
    if (writableRoute(path, options4, OFFLINE_FEATURES) || noteMutationRoute(path, options4, OFFLINE_FEATURES) || OFFLINE_FEATURES.memos && memoRoute(path) && options4.method?.toUpperCase() === "PUT")
      throw fail4("浏览器无法保存本机数据，本次修改未保存；输入已保留。", "OFFLINE_STORAGE_UNAVAILABLE");
    return request2(path, options4);
  }
  assertActive();
  const managed = offlineReadRoute(path) || writableRoute(path, options4, OFFLINE_FEATURES) || noteMutationRoute(path, options4, OFFLINE_FEATURES) || ["/auth/me", "/auth/login", "/auth/logout"].includes(path);
  if (!managed) return runtime2.call(path, { ...options4, offlineGuard: assertActive });
  const { envelope: envelope2 = false, ...opts } = options4;
  const value = await runtime2.call(path, { ...opts, offlineGuard: assertActive });
  return envelope2 ? { data: value } : value;
}
var OFFLINE_FEATURES, scopePattern, uuidPattern5, networkFailure, fail4, today, offlineError, singleton, initialization, readyListeners;
var init_runtime = __esm({
  "web/offline/runtime.mjs"() {
    init_db();
    init_cache();
    init_outbox();
    init_sync();
    init_note_mutations();
    init_drafts();
    init_conflict_draft_guards();
    init_memos();
    init_retry_after();
    OFFLINE_FEATURES = Object.freeze({ todos: true, notes: true, memos: true, snapshotV2: true, labelsV1: true });
    scopePattern = /^[a-f0-9]{64}$/;
    uuidPattern5 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    networkFailure = (error) => error?.code === "NETWORK_UNAVAILABLE" || error?.code === "OFFLINE_NETWORK";
    fail4 = (message, code) => Object.assign(new Error(message), { code });
    today = (now) => new Date(now() + 8 * 36e5).toISOString().slice(0, 10);
    offlineError = () => fail4("当前离线，此操作需联网；输入内容已保留。", "OFFLINE_NETWORK");
    singleton = null, initialization = null;
    readyListeners = /* @__PURE__ */ new Set();
  }
});

// web/core/api.mjs
var api_exports = {};
__export(api_exports, {
  api: () => api,
  apiNetwork: () => apiNetwork
});
function apiOptions(options4) {
  const opts = { credentials: "same-origin", ...options4, headers: { Accept: "application/json", ...options4.headers || {} } };
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
  return {
    ok: response.ok,
    status: response.status,
    text,
    retryAfter: response.headers?.get?.("Retry-After") ?? null,
    serverDate: response.headers?.get?.("Date") ?? null
  };
}
function apiFailure(path, response, payload, epoch, identity6, suppressAuthRedirect = false) {
  const current3 = epoch === runtime.sessionEpoch && identity6 === (state.me?.id ?? null);
  if (response.status === 401 && path !== "/auth/login" && current3 && !suppressAuthRedirect) {
    state.me = null;
    closeModal();
    renderLogin();
  }
  const message = payload.error?.message || (response.status === 409 ? "记录已更新，请刷新后重新编辑。" : "操作失败，请稍后重试。");
  const error = new Error(message);
  error.status = response.status;
  error.code = payload.error?.code;
  if (error.code === "OPENAI_REVIEW_IN_FLIGHT" && typeof payload.error?.run_id === "string") error.run_id = payload.error.run_id;
  if (error.code === "OPENAI_CONNECTIVITY_IN_FLIGHT" && typeof payload.error?.test_id === "string") error.test_id = payload.error.test_id;
  if (response.status === 429) {
    const serverTime = Date.parse(response.serverDate);
    error.retryAfterMs = retryAfterDelay(parseRetryAfter(response.retryAfter, Number.isFinite(serverTime) ? serverTime : Date.now()));
  }
  if (response.status === 401 && !current3) error.staleSession = true;
  return error;
}
async function apiNetwork(path, options4 = {}) {
  const epoch = runtime.sessionEpoch, identity6 = state.me?.id ?? null;
  const rateLimitContext = captureOfflineRateLimitContext();
  const { envelope: envelope2 = false, context, suppressAuthRedirect = false, ...requestOptions } = options4;
  const opts = apiOptions(requestOptions), method2 = (opts.method || "GET").toUpperCase();
  const scope = method2 === "GET" ? context || backgroundRequests() : null;
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
    if (response.status === 429) payload = { error: { code: "RATE_LIMITED", message: "请求较多，请稍后重试。" } };
    else throw new Error("服务暂时不可用，请稍后重试。");
  }
  if (!response.ok) {
    const error = apiFailure(path, response, payload, epoch, identity6, suppressAuthRedirect);
    if (error.status === 429 && epoch === runtime.sessionEpoch && identity6 === (state.me?.id ?? null))
      await recordOfflineRateLimit(rateLimitContext, error.retryAfterMs);
    throw error;
  }
  return envelope2 ? payload : payload.data;
}
function api(path, options4 = {}) {
  const epoch = runtime.sessionEpoch, identity6 = state.me?.id ?? null;
  const active5 = () => {
    if (epoch !== runtime.sessionEpoch || identity6 !== (state.me?.id ?? null) || options4.signal?.aborted || options4.context?.controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
  };
  return offlineRequest(path, options4, apiNetwork, (me) => {
    if (state.me && state.me.id === me.id) state.me = me;
  }, active5);
}
var init_api = __esm({
  "web/core/api.mjs"() {
    init_session_index_state();
    init_state();
    init_login();
    init_modal();
    init_requests();
    init_runtime();
    init_retry_after();
  }
});

// web/ui/toast.mjs
init_dom();
function toast(message, error = false) {
  const node2 = document.createElement("div");
  node2.className = `toast${error ? " error" : ""}`;
  node2.setAttribute("role", error ? "alert" : "status");
  node2.textContent = message;
  $("#toasts").append(node2);
  while ($("#toasts").children.length > 3) $("#toasts").firstElementChild.remove();
  setTimeout(() => node2.remove(), error ? 8e3 : 4500);
}

// web/pages/todo-note-field.mjs
init_dom();
function todoNoteField(item, { pending = false, editing: editing3 = null, error = "", date = "", future = false } = {}) {
  const active5 = editing3?.id === item.id;
  const alert = error && active5 ? `<span class="todo-note-error" role="alert">${e(error)}</span>` : "";
  const marker = future ? ` data-future="1"` : "";
  if (active5) {
    const editable = pending ? "false" : "true";
    return `<span class="todo-note-hit todo-note-text todo-note-input" data-todo-note-input role="textbox" contenteditable="${editable}" enterkeyhint="done" spellcheck="false" aria-multiline="false" aria-label="备注" data-id="${e(item.id)}" data-date="${e(date)}"${marker}>${e(editing3.text ?? "")}</span>${alert}`;
  }
  const text = item.note ? `<span class="todo-note-text">${e(item.note)}</span>` : "";
  const label3 = item.note ? "编辑备注" : "添加备注";
  return `<button class="todo-note-hit${item.note ? "" : " is-empty"}" type="button" data-action="todo-note" data-id="${e(item.id)}" data-date="${e(date)}"${marker} aria-label="${label3}"${pending ? " disabled" : ""}>${text}</button>`;
}

// web/pages/unscheduled-todos.mjs
init_api();
init_dom();
init_state();
init_todos_state();
init_format();
init_runtime();
var cache = {
  owner: "",
  items: [],
  draft: "",
  loaded: false,
  loading: false,
  error: "",
  notice: "",
  pending: false,
  request: null,
  dates: {},
  uncertain: {},
  noteEdit: null,
  noteError: ""
};
var paintingFuture = false;
var owner = () => JSON.stringify([runtime.sessionEpoch, state.me?.id ?? null, getOfflineRuntime()?.state.scope ?? null]);
function current() {
  const key = owner();
  if (cache.owner !== key) Object.assign(cache, {
    owner: key,
    items: [],
    draft: "",
    loaded: false,
    loading: false,
    error: "",
    notice: "",
    pending: false,
    request: null,
    dates: {},
    uncertain: {},
    noteEdit: null,
    noteError: ""
  });
  return cache;
}
var visible = () => Boolean(state.me) && state.page === "todos" && state.todoPanel === "future";
function renderUnscheduledTodos() {
  const v = current();
  return `<section id="todo-future" aria-label="未来待办" ${visible() ? "" : "hidden"}>
<form id="todo-future-form" class="daily-todo-form"><label class="sr-only" for="todo-future-text">未来待办</label>
<input id="todo-future-text" class="input" name="text" maxlength="500" required autocomplete="off" placeholder="还没确定日期的事" value="${e(v.draft)}">
<button class="btn primary" type="submit" ${v.pending ? "disabled" : ""}>添加</button></form>
<p class="todo-future-help">勾选完成后移至今日待办（需联网）；也可选择日期移动。</p>
<p id="todo-future-status" class="daily-todo-status" role="status"></p><p id="todo-future-error" class="form-message" role="alert"></p>
<ul id="todo-future-items" class="daily-todo-items"></ul></section>`;
}
function futureTodoView() {
  return current();
}
function futureRepainting() {
  return paintingFuture;
}
function futureRow(item) {
  const v = current(), busy2 = v.pending || v.uncertain[item.id], off = busy2 ? "disabled" : "", check = `future-check-${item.id}`;
  const note = todoNoteField(item, { pending: busy2, editing: v.noteEdit, error: v.noteError, future: true });
  return `<li class="daily-todo-row${item.completed ? " is-complete" : ""}"><label class="daily-todo-check" for="${e(check)}"><input id="${e(check)}" type="checkbox" data-future-todo-id="${e(item.id)}" ${item.completed ? "checked" : ""} ${off}></label><div class="daily-todo-main"><label class="daily-todo-text" for="${e(check)}">${e(item.text)}</label>${note}</div><div class="todo-future-schedule"><input class="input" type="date" data-future-date-id="${e(item.id)}" value="${e(v.dates[item.id] || "")}" aria-label="为 ${e(item.text)} 选择日期" ${off}><button class="btn small" type="button" data-action="todo-future-schedule" data-id="${e(item.id)}" ${v.pending ? "disabled" : ""}>${v.uncertain[item.id] ? "核实移动结果" : "移至该日期"}</button></div><button class="icon-button" type="button" data-action="todo-future-delete" data-id="${e(item.id)}" aria-label="删除 ${e(item.text)}" ${off}>×</button></li>`;
}
function paintUnscheduledTodos() {
  paintingFuture = true;
  try {
    paintFutureList();
  } finally {
    paintingFuture = false;
  }
}
function paintFutureList() {
  const v = current(), root3 = $("#todo-future");
  if (!root3) return;
  root3.hidden = !visible();
  const input = $("#todo-future-text", root3), button3 = $("#todo-future-form button", root3), status = $("#todo-future-status", root3), error = $("#todo-future-error", root3), list2 = $("#todo-future-items", root3);
  if (input && document.activeElement !== input && input.value !== v.draft) input.value = v.draft;
  if (button3) button3.disabled = v.pending;
  if (status) status.textContent = v.notice || (v.loading && !v.loaded ? "" : v.loaded && v.items.length === 0 ? "还没有未来待办。" : "");
  if (error) error.textContent = v.error;
  const live2 = document.activeElement;
  const keep = live2?.matches?.('[data-todo-note-input][data-future="1"]') && live2.isConnected && v.noteEdit?.id === live2.dataset.id;
  if (list2 && !keep) list2.innerHTML = v.items.filter((x) => !x.deleted_at && !x.deleted).map(futureRow).join("");
}
async function loadUnscheduledTodos() {
  if (!visible()) return;
  const v = current(), key = v.owner;
  if (v.loading) return;
  v.loading = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const data3 = await api("/unscheduled-todos");
    if (v.owner !== key || owner() !== key || !Array.isArray(data3.items)) return;
    const ids = new Set(data3.items.map((item) => item.id));
    v.items = [...data3.items, ...Object.values(v.uncertain).map((item) => item.row).filter((item) => !ids.has(item.id))];
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
  if (el.dataset?.futureDateId) current().dates[el.dataset.futureDateId] = el.value;
}
function moved(row, date, source, todo, complete = false) {
  const completed = complete ? true : row.completed;
  return source?.id === row.id && source.text === row.text && source.version === row.version + 1 && source.completed === completed && typeof source.deleted_at === "string" && todo?.id === row.id && todo.date === date && todo.text === row.text && todo.deleted_at === null && Number.isSafeInteger(todo.version) && todo.version >= 1 && todo.completed === completed && Number.isFinite(Date.parse(todo.created_at)) && Number.isFinite(Date.parse(todo.updated_at));
}
function unchanged(row, source) {
  return source?.id === row.id && source.text === row.text && source.version === row.version && source.completed === row.completed && source.deleted_at === null;
}
async function verifyFutureMove(row, date, { readSource, readDay, guard = () => {
}, complete = false }) {
  try {
    const source = await readSource(row.id);
    guard();
    const day6 = await readDay(date);
    guard();
    const todo = Array.isArray(day6?.items) ? day6.items.find((item) => item.id === row.id) : null;
    if (moved(row, date, source, todo, complete)) return { state: "confirmed", source, todo };
    const compatible = !todo || todo.date === date && todo.text === row.text && (complete || todo.completed === row.completed) && todo.deleted_at === null && !todo.template_id;
    return unchanged(row, source) && day6?.date === date && Array.isArray(day6.items) && compatible ? { state: "retryable" } : { state: "unknown", source };
  } catch {
    return { state: "unknown" };
  }
}
async function planFutureMove(row, date, { checkReady, move, readSource, readDay, guard = () => {
}, priorUncertain = false, complete = false }) {
  if (!validTodoDate(date)) return { state: "not_started", reason: "请选择有效日期" };
  try {
    await checkReady(row);
    guard();
  } catch (error) {
    if (error.staleSession) return { state: "cancelled" };
    if (priorUncertain) return { state: "unknown" };
    if (error.status === 429 || error.code === "NETWORK_UNAVAILABLE" || error.name === "AbortError")
      return { state: "not_started", reason: error.message || "请稍后重试" };
    try {
      const source = await readSource(row.id);
      guard();
      if (source?.id === row.id && source.deleted_at === null) return { state: "failed", reason: error.message || "暂时无法核对数据" };
    } catch {
    }
    return { state: "not_started", reason: error.message || "暂时无法核对数据" };
  }
  try {
    const result2 = await move(row.id, { date, version: row.version });
    guard();
    if (moved(row, date, result2?.source, result2?.todo, complete)) return { state: "confirmed", ...result2 };
  } catch (error) {
    if (error.staleSession) return { state: "unknown" };
    if (error.status === 429) return priorUncertain ? { state: "unknown" } : { state: "not_started", reason: error.message || "请求较多，请稍后重试" };
    if (!priorUncertain && error.status >= 400 && error.status < 500 && ![408, 425].includes(error.status)) {
      try {
        const source = await readSource(row.id);
        guard();
        if (source?.id === row.id && source.deleted_at === null) return { state: "failed", reason: error.message || "请稍后重试" };
      } catch {
      }
    }
  }
  const result = await verifyFutureMove(row, date, { readSource, readDay, guard, complete });
  return result.state === "retryable" ? { state: "unknown" } : result;
}
function timedNetwork(path, options4 = {}) {
  const controller = new AbortController(), timer2 = setTimeout(() => controller.abort(), 12e3);
  return apiNetwork(path, { ...options4, signal: controller.signal }).finally(() => clearTimeout(timer2));
}
function formatMovedDate(date) {
  const [, month, day6] = date.split("-");
  return `${Number(month)}月${Number(day6)}日`;
}
async function scheduleUnscheduledTodo(id2, { complete = false } = {}) {
  if (!visible()) return;
  const v = current(), key = v.owner, row = v.items.find((item) => item.id === id2 && !item.deleted_at && !item.deleted);
  if (!row || v.pending) return;
  const unresolved2 = v.uncertain[id2], original = unresolved2?.row || structuredClone(row), finishing = unresolved2?.complete ?? complete, date = unresolved2?.date || (finishing ? bjtDate() : v.dates[id2] || "");
  v.pending = true;
  v.error = "";
  v.notice = "";
  paintUnscheduledTodos();
  const offline = getOfflineRuntime(), token = offline?.captureRateLimitContext();
  if (!offline || !token) {
    v.pending = false;
    paintUnscheduledTodos();
    toast("未执行移动：请联网并确认数据后重试", true);
    return;
  }
  const guard = () => {
    const currentToken = offline?.captureRateLimitContext();
    if (v.owner !== key || owner() !== key || !token || !currentToken || currentToken.scope !== token.scope || currentToken.generation !== token.generation)
      throw Object.assign(new Error("账号或数据范围已变化"), { staleSession: true });
  };
  const readSource = (sourceId) => timedNetwork("/unscheduled-todos/" + encodeURIComponent(sourceId));
  const readDay = (day6) => timedNetwork("/todos?date=" + encodeURIComponent(day6));
  const services = {
    guard,
    readSource,
    readDay,
    complete: finishing,
    move: (sourceId, body2) => timedNetwork("/unscheduled-todos/" + encodeURIComponent(sourceId) + (finishing ? "/complete-today" : "/move"), { method: "POST", body: body2 }),
    async checkReady(item) {
      guard();
      const index = await timedNetwork("/workbench-snapshot/index?version=2");
      guard();
      if (index?.complete !== true || index.projection !== "current" || index.scope_id !== token.scope) throw new Error("无法核对当前数据范围");
      const queue = await offline.queue();
      guard();
      const ids = ["unscheduled_todo:" + item.id, "todo:" + item.id];
      const pending = (value) => value.operations.some((op) => ids.includes(op.entity_id)) || value.conflicts.some((conflict) => ids.includes(conflict.entity_id || conflict.operation?.entity_id));
      if (pending(queue)) throw new Error("该待办有未同步内容，请同步后重试");
      const source = await readSource(item.id);
      guard();
      if (!unchanged(item, source)) throw new Error("待办已变化，请刷新后重试");
      const latest = await offline.queue();
      guard();
      if (pending(latest)) throw new Error("该待办有未同步内容，请同步后重试");
    }
  };
  try {
    let result;
    if (unresolved2) {
      result = await verifyFutureMove(original, date, services);
      if (result.state === "retryable") result = await planFutureMove(original, date, { ...services, priorUncertain: true });
    } else result = await planFutureMove(original, date, services);
    if (v.owner !== key || owner() !== key) return;
    try {
      guard();
    } catch {
      return;
    }
    if (result.state === "confirmed") {
      delete v.uncertain[id2];
      v.items = v.items.filter((item) => item.id !== id2);
      let cacheStatus = "refresh";
      try {
        cacheStatus = await offline.acceptMovedTodo({ source: result.source, todo: result.todo }, token);
      } catch {
      }
      if (v.owner !== key || owner() !== key) return;
      try {
        guard();
      } catch {
        return;
      }
      if (cacheStatus === "saved" && todosState.owner === todoOwner()) {
        const day6 = todosState.days.get(date);
        if (day6) {
          mergeTodo(day6, result.todo);
          day6.revision++;
        }
      }
      const note = cacheStatus === "pending" ? "；本地仍有待处理内容，请在设置中处理" : cacheStatus === "saved" ? "" : "；本地缓存待刷新";
      toast(`已移至 ${formatMovedDate(date)}${note}`);
    } else if (result.state === "failed") {
      toast(`移动失败，原项已保留：${result.reason}`, true);
    } else if (result.state === "not_started") {
      toast(`未执行移动：${result.reason}`, true);
    } else if (result.state === "cancelled") {
      return;
    } else {
      v.uncertain[id2] = { row: original, date, complete: finishing };
      v.notice = "移动结果尚未确认，请联网后点击“核实移动结果”。";
      toast(v.notice, true);
    }
  } finally {
    if (v.owner === key && owner() === key) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
async function submitUnscheduledTodo({ data: data3 }) {
  if (!visible()) return;
  const v = current(), key = v.owner, text = String(data3.text || "").trim();
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
async function change(id2, method2, body2) {
  if (!visible()) return;
  const v = current(), key = v.owner, row = v.items.find((x) => x.id === id2);
  if (!row || v.pending) return;
  v.pending = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const updated = await api("/unscheduled-todos/" + encodeURIComponent(id2), { method: method2, body: { ...body2, version: row.version } });
    if (v.owner === key && owner() === key) v.items = v.items.map((x) => x.id === id2 ? updated : x);
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
  return el.checked ? scheduleUnscheduledTodo(el.dataset.futureTodoId, { complete: true }) : change(el.dataset.futureTodoId, "PATCH", { completed: false });
}
function deleteUnscheduledTodo(id2) {
  return change(id2, "DELETE", {});
}

// web/ui/components.mjs
init_constants();
init_dom();
init_format();
init_state();
var platformLogo = (p) => `<span class="platform-logo platform-${e(["toutiao", "zhihu", "wechat"].includes(p) ? p : "other")}">${e({
  toutiao: "头",
  zhihu: "知",
  wechat: "微"
}[p] || "文")}</span>`;
function detailInfo(reason, label3, id2) {
  return `<button class="icon-button inline-info" data-action="detail-info" data-reason="${e(reason)}" aria-label="${e(label3)}" aria-expanded="false" aria-controls="detail-info-${e(id2)}">${icon("info", 14)}</button>`;
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
  if (["notes", "memos", "reminders", "ai-reports", "ai-diagnosis"].includes(state.page) || state.page === "settings" && state.settingsTab === "workspace") return "";
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
  if (state.page === "ai-diagnosis") return '<div class="heading-left"><h1>AI诊断</h1></div>';
  if (state.page === "ai-reports") return '<div class="heading-left"><h1>AI 日报</h1></div>';
  if (state.page === "reminders") return '<div class="heading-left"><h1>每日工作提醒</h1></div>';
  if (state.page === "memos") return '<div class="heading-left"><h1>' + (state.memoView === "trash" ? "备忘录回收站" : "备忘录") + "</h1></div>";
  if (state.page === "notes") return '<div class="heading-left"><h1>碎碎念</h1></div>';
  if (state.page === "todos") return '<div class="heading-left"><h1>每日待办</h1></div>';
  const count3 = state.page === "articles" ? state.articleMeta?.total : state.page === "settings" && state.settingsTab === "accounts" ? rowsForAccount(
    state.accounts
  ).length : null;
  const account3 = ["dashboard", "articles"].includes(state.page) || state.page === "settings" && state.settingsTab === "accounts";
  return `<div class="heading-left"><h1>${e(nav.find((n) => n.id === state.page)?.label || "总览")}</h1><span id="page-count" class="page-count" ${count3 == null ? "hidden" : ""}>${count3 == null ? "" : e(num(count3))}</span></div><div class="head-actions">${account3 ? accountFilter() : ""}${headerActions()}<button class="icon-button" data-action="page-menu" aria-label="更多页面操作" aria-haspopup="menu" aria-expanded="false" aria-controls="page-menu">⋯</button></div>`;
}
function skeleton() {
  return '<div class="skeleton" role="status" aria-label="正在读取数据"><span></span><span></span><span></span><span class="sr-only">正在读取数据…</span></div>';
}
function comparisonHTML(comparison) {
  if (!comparison?.comparable) return `<span class="comparison muted" title="${e(comparison?.reason || "缺少完整的可比数据")}">暂不可比</span>`;
  const delta2 = Number(comparison.delta), direction = delta2 > 0 ? "up" : delta2 < 0 ? "down" : "flat";
  const change3 = delta2 === 0 ? "持平" : `${delta2 > 0 ? "+" : ""}${num(delta2)}`;
  const percent3 = comparison.percent == null ? "" : `（${Number(comparison.percent) > 0 ? "+" : ""}${num(comparison.percent)}%）`;
  return `<span class="comparison ${direction}" title="${e(comparison.reason || "与前一等长周期比较")}">${change3}${percent3}</span>`;
}
function dashboardInfo(kind, label3, id2 = "") {
  return `<button class="icon-button inline-info" data-action="dashboard-info" data-kind="${e(kind)}" data-id="${e(id2)}" aria-label="${e(label3)}" aria-expanded="false" aria-controls="info-${e(kind)}-${e(id2)}">${icon("info", 14)}</button>`;
}
function platformColor(platform) {
  return `var(--p-${["toutiao", "zhihu", "wechat"].includes(platform) ? platform : "other"})`;
}
function freshness(c, now = Date.now()) {
  const stamp3 = [c.as_of, c.collected_at].find((v) => v && Number.isFinite(Date.parse(v)));
  if (!stamp3) return { kind: "unknown", label: "数据新鲜度未知" };
  const days = Math.floor((Date.parse(bjtDate(now)) - Date.parse(bjtDate(stamp3))) / 864e5);
  return days < 0 ? { kind: "unknown", label: "数据日期待核实" } : { kind: days <= 1 ? "up" : days <= 3 ? "warn" : "danger", label: `数据截至 ${time(
    stamp3,
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
function field(name, label3, type = "text", value = "", options4 = "", full = false) {
  return `<div class="form-field${full ? " full" : ""}"><label for="field-${e(name)}">${label3}</label><input id="field-${e(name)}" class="input" name="${e(name)}" type="${type}" value="${e(value)}" ${options4}></div>`;
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
init_dom();
init_format();
init_constants();
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
init_api();
init_dom();
init_constants();
var reconciliationData = null;
var fieldLabels = { run_date: "日期", status: "状态", slot: "槽位", writer: "写作者", series_no: "编号" };
var label = (choices, value) => choices[value] || "未知";
function options(values, choices) {
  return '<option value="">全部</option>' + values.map((value) => `<option value="${e(value)}">${e(choices ? label(choices, value) : value)}</option>`).join("");
}
function statusCounts(counts) {
  return Object.entries(counts).map(([key, value]) => `${label(statusLabels, key)} ${value}`).join(" · ");
}
function insurance(data3) {
  const value = data3.insurance;
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
function table(data3, filters = {}) {
  const rows = data3.rows.filter((row) => ["run_date", "slot", "writer", "status"].every((key) => !filters[key] || (row[key] ?? "unknown") === filters[key]));
  return `<p role="status">筛选结果 ${e(rows.length)} 条</p>${rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>文章</th><th>存稿日期</th><th>槽位</th><th>状态</th>
<th>写作者</th><th>编号</th><th>缺字段</th><th>待核</th><th>警告</th><th>样本</th></tr></thead><tbody>${articleRows(rows)}</tbody></table></div>` : '<p class="muted">没有符合条件的实际文章记录。</p>'}`;
}
function changeReconciliationFilters(element) {
  const form = element.closest("#reconciliation-filters");
  if (!form || !reconciliationData) return false;
  document.querySelector("#reconciliation-results").innerHTML = table(reconciliationData, Object.fromEntries(new FormData(form)));
  return true;
}
function renderReconciliation(data3) {
  if (data3?.complete !== true || !Array.isArray(data3.rows)) throw new Error("发布情况未完整取得，请重试。");
  reconciliationData = data3;
  const values = (key) => [...new Set(data3.rows.map((row) => row[key] ?? "unknown"))].sort();
  const dates = Object.fromEntries(values("run_date").map((value) => [value, value === "unknown" ? "日期未标注" : value]));
  return `<div class="article-ledger-overview article-reconciliation"><section class="card"><h2>发布情况</h2>
<p>应产出：未配置 · 缺产：未配置 · 逾期：未配置</p><p>${e(statusCounts(data3.counts))}</p>
<form id="reconciliation-filters" class="filters">
<label class="form-field">日期<select class="input" name="run_date">${options(values("run_date"), dates)}</select></label>
<label class="form-field">槽位<select class="input" name="slot">${options(values("slot"), slotLabels)}</select></label>
<label class="form-field">写作者<select class="input" name="writer">${options(values("writer"), writerLabels)}</select></label>
<label class="form-field">状态<select class="input" name="status">${options(values("status"), statusLabels)}</select></label></form>
<div id="reconciliation-results">${table(data3)}</div></section>${insurance(data3)}</div>`;
}
async function loadReconciliation(context) {
  return api("/article-reconciliation", { context });
}

// web/core/openai-review-state.mjs
var OPENAI_TABS = Object.freeze(["reminders", "reports"]);
var openAiSessionAvailable = (me) => Boolean(me?.id);
var openAiRunActive = (run2) => ["running"].includes(run2?.status);
var openAiRunFinished = (run2) => ["succeeded", "failed"].includes(run2?.status) || Boolean(run2?.released_at);
var openAiPendingRunUncertain = (vm3) => Boolean(vm3?.pendingId && vm3.run?.id === vm3.pendingId && vm3.run.status === "uncertain");
function openAiPendingRunSettled(previous, next) {
  const run2 = next.run;
  return Boolean(previous.pendingId && run2?.id === previous.pendingId && ["succeeded", "failed", "cancelled", "uncertain"].includes(run2.status) && (previous.run?.id !== run2.id || previous.run?.status !== run2.status));
}
function openAiRunDay(run2) {
  const date = new Date(run2?.created_at);
  if (!Number.isFinite(date.getTime())) return "";
  const parts2 = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts2.year}-${parts2.month}-${parts2.day}`;
}
function openAiDiaryLink(run2) {
  const query = new URLSearchParams({ page: "ai-diagnosis", diagnosis_tab: "reports", date: openAiRunDay(run2) });
  if (run2?.id) query.set("openai_run", run2.id);
  return "?" + query;
}
function openAiRunsForDate(items, date) {
  return items.filter((run2) => openAiRunDay(run2) === date).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)));
}
async function readOpenAiRuns(read2, date = "", current3 = () => true) {
  const items = [], seen = /* @__PURE__ */ new Set();
  for (let offset = 0; ; ) {
    const query = new URLSearchParams({ offset: String(offset) });
    if (date) query.set("date", date);
    const page = await read2("/openai-review/runs?" + query);
    if (!current3()) return null;
    if (!Array.isArray(page?.items) || typeof page.has_more !== "boolean" || page.has_more && !page.items.length)
      throw new Error("分析记录读取不完整，请重新读取。");
    for (const row of page.items) {
      if (!row.id || seen.has(row.id)) throw new Error("分析记录在读取时发生变化，请重新读取。");
      seen.add(row.id);
      items.push(row);
    }
    if (!page.has_more) return date ? openAiRunsForDate(items, date) : items;
    offset += page.items.length;
  }
}
function openAiDraft(saved, retained = null) {
  const text = typeof retained?.text === "string" ? retained.text : saved.instructions;
  const dirty = text !== saved.instructions;
  return {
    saved,
    text,
    dirty,
    baseVersion: retained?.version ?? saved.version,
    conflict: dirty && retained?.version !== saved.version,
    saving: false,
    error: "",
    message: ""
  };
}
function editOpenAiDraft(draft, text) {
  return { ...draft, text, dirty: text !== draft.saved.instructions, message: "" };
}
async function saveOpenAiDraft(draft, request2) {
  if (draft.saving || draft.conflict || !draft.dirty) return draft;
  const result = { ...draft, saving: false, message: "", error: "" };
  try {
    const saved = await request2("/openai-review/config", {
      method: "PATCH",
      body: { instructions: draft.text, version: draft.saved.version }
    });
    return { ...openAiDraft(saved), message: "已保存。下次分析使用这份指令。" };
  } catch (error) {
    return { ...result, conflict: error.status === 409, error: error.status === 409 ? "指令已在别处更新。你的修改已保留，请读取最新版本并比较后再保存。" : error.message || "保存失败，修改已保留。" };
  }
}

// web/core/openai-review-progress.mjs
function openAiStartTime(storage2, key, id2) {
  try {
    const saved = JSON.parse(storage2.getItem(key + ":started"));
    return id2 && saved?.id === id2 && Number.isFinite(saved.at) && saved.at > 0 ? saved.at : 0;
  } catch {
    return 0;
  }
}
function openAiElapsed(startedAt, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1e3));
  return seconds < 60 ? `${seconds}秒` : `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}
function openAiCompletedElapsed(run2) {
  if (!["succeeded", "failed", "cancelled"].includes(run2?.status)) return "";
  const duration3 = Number.isFinite(run2.elapsed_ms) ? run2.elapsed_ms : Date.parse(run2.completed_at) - Date.parse(run2.created_at);
  return Number.isFinite(duration3) && duration3 >= 0 ? openAiElapsed(0, duration3) : "";
}
function openAiProgressLabel(event) {
  const round = Number.isInteger(event?.round) && event.round >= 1 && event.round <= 4 ? event.round : null;
  const prefix = round ? `第 ${round} 轮 · ` : "";
  switch (event?.stage) {
    case "source_ready": {
      const articles = Number.isSafeInteger(event.article_count) && event.article_count >= 0 ? event.article_count : null;
      const records = Number.isSafeInteger(event.record_count) && event.record_count >= 0 ? event.record_count : null;
      return "诊断资料已整理" + (articles !== null && records !== null ? `：${articles} 篇文章，${records} 条记录` : "");
    }
    case "provider_started":
      return prefix + "已登记模型调用，等待响应";
    case "provider_responded":
      return prefix + "已收到 API 响应";
    case "evidence_lookup":
      return prefix + "正在核对历史证据";
    case "synthesizing":
      return prefix + "正在生成诊断报告";
    case "saving_report":
      return "报告已生成，正在保存";
    case "completed":
      return "报告已保存，诊断完成";
    default:
      return "";
  }
}
function openAiProgressEvents(run2) {
  return Array.isArray(run2?.progress) ? run2.progress.filter((event) => openAiProgressLabel(event) && Number.isFinite(event.elapsed_ms) && event.elapsed_ms >= 0).slice(0, 18) : [];
}
function openAiReviewFeedback(vm3) {
  const run2 = !vm3.pendingId || vm3.run?.id === vm3.pendingId ? vm3.run : null;
  const error = run2?.error_message || "";
  if (run2?.status === "uncertain") return {
    title: "结果待确认",
    detail: error || "API 执行结果尚未确认。",
    note: "无法确定是否已经计费。不会自动重试；请只读核查状态。"
  };
  if (vm3.pendingId && vm3.error) return {
    title: "当前请求结果待确认",
    detail: vm3.error,
    note: "不会自动重复分析。可以只读核查状态。"
  };
  if (run2?.status === "running" || vm3.operation === "start" && vm3.pendingId) return {
    title: openAiProgressLabel(openAiProgressEvents(run2).at(-1)) || (run2?.stage === "awaiting_provider" || run2?.provider_calls > 0 ? "已登记调用，等待结果" : run2?.stage === "preparing" ? "正在准备诊断资料…" : "请求已发出，等待服务器确认…"),
    waiting: true,
    detail: "以下步骤随实际执行更新。无需再次点击；离开后可回来查看进度。"
  };
  if (vm3.pendingId) return {
    title: vm3.operation === "check" ? "正在只读核查状态…" : "当前请求结果待确认",
    detail: "请求编号已保留，不会自动重复分析。请核查状态。"
  };
  if (run2?.status === "failed") return { title: "本次分析未完成", detail: error || "未生成完整报告。历史记录仍保留。" };
  if (vm3.error) return { title: "操作未完成", detail: vm3.error };
  if (run2?.status === "succeeded") return { title: "分析完成", detail: "报告已保存，可在诊断报告查看。" };
  return null;
}
function createOpenAiElapsedClock(target, { now = Date.now, every = globalThis.setInterval, cancel = globalThis.clearInterval } = {}) {
  let timer2 = null;
  const stop = () => {
    if (timer2 !== null) cancel(timer2);
    timer2 = null;
  };
  const tick = () => {
    const value = target();
    if (!value?.node || !Number.isFinite(value.startedAt) || value.startedAt <= 0) {
      stop();
      return false;
    }
    value.node.textContent = openAiElapsed(value.startedAt, now());
    return true;
  };
  return { stop, refresh() {
    stop();
    if (tick()) timer2 = every(tick, 1e3);
  } };
}

// web/core/openai-review-runner.mjs
function createOpenAiRunner({ request: request2, storage: storage2, key, onChange = () => {
}, uuid: uuid5 = () => crypto.randomUUID(), now = Date.now }) {
  let active5 = true;
  const state2 = { run: null, pendingId: "", notFound: false, busy: false, operation: "", startedAt: 0, error: "" };
  try {
    state2.pendingId = storage2.getItem(key) || "";
  } catch {
  }
  state2.startedAt = openAiStartTime(storage2, key, state2.pendingId);
  const change3 = () => {
    if (active5) onChange({ ...state2 });
  };
  const retain = (id2) => {
    storage2.setItem(key, id2);
    if (storage2.getItem(key) !== id2) throw new Error("无法保存分析请求编号，请允许本机存储后再开始。");
    state2.pendingId = id2;
    state2.startedAt = openAiStartTime(storage2, key, id2);
  };
  const accept = (run2) => {
    if (!active5) return;
    if (state2.run?.id === run2?.id && openAiRunFinished(state2.run) && !openAiRunFinished(run2)) return;
    if (!run2?.id || typeof run2.status !== "string") throw new Error("分析状态暂时无法确认，请核查状态。");
    state2.run = run2;
    state2.notFound = false;
    if (openAiRunFinished(run2)) {
      if (storage2.getItem(key) === state2.pendingId) storage2.removeItem(key);
      state2.pendingId = "";
    } else retain(run2.id);
    state2.startedAt = Date.parse(run2.created_at) || state2.startedAt;
  };
  async function recover() {
    if (!active5 || state2.busy || !state2.pendingId) return;
    state2.busy = true;
    state2.operation = "check";
    state2.error = "";
    change3();
    try {
      accept(await request2("/openai-review/runs/" + encodeURIComponent(state2.pendingId)));
    } catch (error) {
      state2.notFound = error.status === 404;
      state2.error = error.status === 404 ? "尚未查到这次请求，请稍后核查。不会自动重复提交。" : error.message || "暂时无法确认结果，请核查状态。";
    } finally {
      state2.busy = false;
      state2.operation = "";
      change3();
    }
  }
  const observe = createObserver({ state: state2, request: request2, active: () => active5, accept, change: change3 });
  async function start(mode = "incremental", model = "") {
    if (!active5 || state2.busy || state2.pendingId || !["incremental", "full"].includes(mode)) return;
    state2.busy = true;
    state2.operation = "start";
    state2.error = "";
    change3();
    try {
      const existing = storage2.getItem(key);
      if (existing) {
        retain(existing);
        return;
      }
      const id2 = uuid5(), timing = JSON.stringify({ id: id2, at: now() });
      storage2.setItem(key + ":started", timing);
      if (storage2.getItem(key + ":started") !== timing) throw new Error("无法保存分析开始时间，未开始分析。");
      retain(id2);
      change3();
      const run2 = await request2("/openai-review/runs", { method: "POST", body: { run_id: state2.pendingId, mode, ...model ? { model } : {} } });
      accept(run2);
    } catch (error) {
      if (!active5 || openAiRunFinished(state2.run) && !state2.pendingId) return;
      state2.error = state2.pendingId ? "请求结果尚未确认，请核查状态。不会自动重复提交。" : error.message || "无法保存请求编号，未开始分析。";
      if (error.code === "OPENAI_REVIEW_IN_FLIGHT" && error.run_id) {
        retain(error.run_id);
        state2.error = "已有分析请求，请核查状态。";
      }
      if ([
        "OPENAI_NOT_CONFIGURED",
        "OPENAI_REVIEW_NOT_CONFIGURED",
        "FORBIDDEN",
        "UNAUTHORIZED",
        "OPENAI_REVIEW_RATE_LIMIT",
        "OPENAI_REVIEW_INPUT_LIMIT",
        "OPENAI_REVIEW_NO_DATA",
        "OPENAI_REVIEW_INVALID_KEY_FORMAT",
        "OPENAI_REVIEW_SOURCE_INVALID",
        "VALIDATION_ERROR"
      ].includes(error.code)) {
        try {
          storage2.removeItem(key);
        } catch {
        }
        state2.pendingId = "";
        state2.error = error.message;
      }
    } finally {
      state2.busy = false;
      state2.operation = "";
      change3();
    }
  }
  async function release() {
    if (!active5 || state2.busy || !state2.pendingId || !(state2.notFound || state2.run?.status === "uncertain")) return;
    state2.busy = true;
    state2.operation = "release";
    state2.error = "";
    change3();
    try {
      accept(await request2("/openai-review/runs/" + encodeURIComponent(state2.pendingId) + "/release", {
        method: "POST",
        body: { acknowledgement: "provider_outcome_unknown_no_automatic_retry" }
      }));
    } catch (error) {
      state2.error = error.message || "解除结果尚未确认，请核查状态。";
      if (["OPENAI_REVIEW_RECOVERY_RATE_LIMIT", "OPENAI_REVIEW_PUBLIC_RATE_LIMIT"].includes(error.code))
        state2.error += " 请稍后只读核查状态，不会自动重复提交。";
    } finally {
      state2.busy = false;
      state2.operation = "";
      change3();
    }
  }
  return { state: state2, start, recover, observe, release, adopt(run2) {
    accept(run2);
    change3();
  }, dispose() {
    active5 = false;
  } };
}
function createObserver({ state: state2, request: request2, active: active5, accept, change: change3 }) {
  let observing = false;
  return async function observe() {
    if (!active5() || observing || state2.operation !== "start" || !state2.pendingId || openAiPendingRunUncertain(state2)) return;
    const id2 = state2.pendingId;
    observing = true;
    try {
      const run2 = await request2("/openai-review/runs/" + encodeURIComponent(id2));
      if (active5() && state2.pendingId === id2 && run2?.id === id2) {
        accept(run2);
        change3();
      }
    } catch {
    } finally {
      observing = false;
      if (active5()) change3();
    }
  };
}

// web/core/safe-markdown.mjs
init_dom();
function safeLink(value) {
  try {
    if (/[\u0000-\u0020\u007f]/.test(value)) return "";
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
function inlineToken(part) {
  const link = part.match(/^\[([^\[\]\n]+)\]\(([^()\n]+)\)$/);
  if (link) {
    const href = safeLink(link[2]);
    return href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(link[1])}</a>` : e(part);
  }
  if (part.startsWith("**") || part.startsWith("__")) return `<strong>${e(part.slice(2, -2))}</strong>`;
  if (part.startsWith("`")) return `<code>${e(part.slice(1, -1))}</code>`;
  return `<em>${e(part.slice(1, -1))}</em>`;
}
function inline(value) {
  const text = String(value);
  const tokens = /\[[^\[\]\n]+\]\([^()\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`/g;
  let output = "", offset = 0;
  for (const match of text.matchAll(tokens)) {
    output += e(text.slice(offset, match.index)) + inlineToken(match[0]);
    offset = match.index + match[0].length;
  }
  return output + e(text.slice(offset));
}
function renderSafeMarkdown(value) {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  let out = "", list2 = "", paragraph = [], code = false;
  const flushParagraph = () => {
    if (paragraph.length) {
      out += "<p>" + paragraph.map(inline).join("<br>") + "</p>";
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list2) {
      out += `</${list2}>`;
      list2 = "";
    }
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph();
      closeList();
      out += code ? "</code></pre>" : "<pre><code>";
      code = !code;
      continue;
    }
    if (code) {
      out += e(line) + "\n";
      continue;
    }
    const item = line.match(/^\s*(?:(- |\* |\+ )|([0-9]{1,8})[.)] )(.*)$/);
    if (item) {
      flushParagraph();
      const type = item[2] ? "ol" : "ul";
      if (list2 !== type) {
        closeList();
        list2 = type;
        out += type === "ol" ? `<ol start="${Number(item[2])}">` : "<ul>";
      }
      out += `<li>${inline(item[3])}</li>`;
      continue;
    }
    closeList();
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length + 2, 6);
      out += `<h${level}>${inline(heading[2])}</h${level}>`;
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  closeList();
  if (code) out += "</code></pre>";
  return out;
}

// web/pages/openai-review.mjs
init_dom();
var openAiLogin = '<p class="hint">请先<a href="?page=login">登录</a>，再查看或使用 OpenAI API。</p>';
var timestamp3 = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date) + "（北京时间）" : "时间未知";
};
function openAiRunLabel(run2) {
  if (run2?.status === "succeeded") return "分析完成";
  if (run2?.status === "failed") return "本次分析未完成";
  if (run2?.status === "cancelled") return "本次分析已取消";
  return openAiRunActive(run2) ? "正在分析…" : "结果待确认";
}
function openAiRunModeLabel(run2) {
  if (run2.mode === "full") {
    if (run2.baseline_run_id === null) return "首次全量分析";
    return run2.baseline_run_id ? "全量重查" : "全量分析";
  }
  return run2.mode === "incremental" ? "累计复盘" : "文章复盘";
}
function renderOpenAiRun(run2) {
  const elapsed = openAiCompletedElapsed(run2);
  return `<article class="card panel openai-run" id="openai-run-${e(run2.id)}" tabindex="-1">
    <div class="openai-run-heading"><h3>${e(openAiRunLabel(run2))}</h3>
    <time datetime="${e(run2.created_at)}">${e(timestamp3(run2.created_at))}</time></div>
    <p class="hint">${e(openAiRunModeLabel(run2))}
    ${run2.model ? " · " + e(run2.model) : ""}${run2.instruction_version ? " · 指令版本 " + e(run2.instruction_version) : ""}${elapsed ? " · 用时 " + e(elapsed) : ""}</p>
    ${run2.report_markdown ? `<div class="ai-report-markdown">${renderSafeMarkdown(run2.report_markdown)}</div>` : ""}
    ${run2.status === "failed" ? `<p role="alert">${e(run2.error_message || "未生成完整报告。历史记录仍保留。")}</p>` : ""}
    ${run2.status === "uncertain" ? `<p role="status">${e(run2.error_message || "API 执行结果尚未确认，可能已经计费；不会自动重试。")}</p>
      <p><a href="?page=ai-diagnosis&amp;diagnosis_tab=help">前往求助API核查状态</a></p>` : ""}
    ${openAiRunActive(run2) ? '<p role="status">分析进行中。可在求助API核查状态，无需再次发起。</p>' : ""}</article>`;
}
function renderOpenAiReviewPanel(vm3 = {}) {
  const header = '<div class="openai-review-heading"><h2>求助API</h2></div>';
  if (!vm3.owner) return header + openAiLogin;
  const connectionBusy = vm3.connection?.busy || Boolean(vm3.connection?.pendingId);
  const busy2 = vm3.loading || vm3.busy, disabled = busy2 || connectionBusy || !vm3.config?.configured || Boolean(vm3.pendingId);
  const status = vm3.loading ? "正在读取分析配置…" : !vm3.config ? "暂时无法读取配置。" : vm3.config.configuration_error_message || (vm3.config.configured ? vm3.pendingId || vm3.busy ? "本次请求处理中或等待核查" : "可发起分析" : "尚未配置 OpenAI API，暂不能发起分析。");
  const selectedModel = vm3.pendingId && vm3.run?.id === vm3.pendingId && vm3.run.model || vm3.selectedModel || vm3.config?.default_model || vm3.config?.model;
  return header + `<p class="hint">${e(status)}</p>
    <label for="openai-model">模型</label>
    <select class="input" id="openai-model" ${disabled ? "disabled" : ""}>
      ${(vm3.config?.supported_models || []).map((model) => `<option value="${e(model.id)}"
        ${model.id === selectedModel ? "selected" : ""}>${e(model.label)}</option>`).join("")}
    </select><p class="hint">模型能否调用以账户权限为准。</p>
    <div class="openai-review-actions"><button class="btn primary" type="button" data-openai-action="start"
    ${disabled ? "disabled" : ""} aria-busy="${Boolean(vm3.busy)}">求助API</button>
    <button class="btn" type="button" data-openai-action="test-connection" ${disabled ? "disabled" : ""}>测试连接</button>
    ${vm3.connection?.pendingId ? '<button class="btn" type="button" data-openai-action="check-connection">核查连接测试</button>' : ""}
    ${vm3.pendingId ? `<button class="btn" type="button" data-openai-action="check" ${busy2 ? "disabled" : ""}>核查状态</button>` : ""}
    ${vm3.pendingId && (vm3.notFound || vm3.run?.status === "uncertain") ? `<button class="btn" type="button" data-openai-action="release" ${busy2 ? "disabled" : ""}>结束本次状态核查</button>` : ""}
    ${!vm3.config && !vm3.loading ? '<button class="btn" type="button" data-openai-action="reload">重新读取</button>' : ""}</div>
    <p class="hint">首次使用先点“测试连接”：只发送一条简短测试消息，成功后再运行完整诊断。</p>
    ${renderOpenAiConnectivity(vm3.connection)}
    ${renderOpenAiReviewStatus(vm3)}
    ${vm3.run ? `<p>最近记录：${e(openAiRunLabel(vm3.run))} · ${e(timestamp3(vm3.run.created_at))}
      <a href="${e(openAiDiaryLink(vm3.run))}">在诊断报告查看这条记录</a></p>` : ""}`;
}
function renderOpenAiReviewStatus(vm3) {
  const feedback = openAiReviewFeedback(vm3);
  if (!feedback) return "";
  const elapsed = !vm3.pendingId || vm3.run?.id === vm3.pendingId ? openAiCompletedElapsed(vm3.run) : "";
  const startedAt = vm3.startedAt || (vm3.run?.id === vm3.pendingId ? Date.parse(vm3.run.created_at) : 0);
  return `<div class="openai-review-status"><p role="status" aria-live="polite"><strong>${e(feedback.title)}</strong></p>
    ${feedback.waiting ? '<progress aria-label="诊断正在进行，步骤随实际执行更新"></progress>' : ""}
    ${feedback.waiting && Number.isFinite(startedAt) && startedAt > 0 ? `<p aria-live="off">已等待 <span data-openai-elapsed="${startedAt}">${e(openAiElapsed(startedAt))}</span></p>` : ""}
    ${elapsed ? `<p>用时 ${e(elapsed)}</p>` : ""}
    <p>${e(feedback.detail)}</p>${feedback.note ? `<p>${e(feedback.note)}</p>` : ""}
    ${renderOpenAiProgress(!vm3.pendingId || vm3.run?.id === vm3.pendingId ? vm3.run : null)}
    ${vm3.error && vm3.error !== feedback.detail ? `<p role="alert">${e(vm3.error)}</p>` : ""}</div>`;
}
function renderOpenAiProgress(run2) {
  const events = openAiProgressEvents(run2);
  if (!events.length) return "";
  return `<ol class="openai-progress-log" aria-label="诊断执行进度">${events.map((event, index) => `<li class="${index === events.length - 1 && run2.status === "running" ? "is-current" : "is-observed"}">
      <span class="openai-progress-mark" aria-hidden="true"></span><span>${e(openAiProgressLabel(event))}</span>
      <time>+${e(openAiElapsed(0, event.elapsed_ms))}</time></li>`).join("")}</ol>`;
}
function renderOpenAiConnectivity(connection) {
  if (!connection) return "";
  const result = connection.result;
  if (!result && !connection.busy && !connection.error && !connection.pendingId) return "";
  const current3 = !connection.pendingId || result?.id === connection.pendingId ? result : null;
  const waiting = connection.pendingId && (connection.busy || current3?.status === "running");
  const title = waiting ? "正在进行最小连接测试…" : current3?.status === "succeeded" ? "连接测试通过" : current3?.status === "failed" ? "连接测试未通过" : "连接测试结果待确认";
  const detail = current3?.status === "succeeded" ? `模型 ${current3.model} 已回复 OK，可以开始完整诊断。` : connection.error || current3?.error_message || "只发送简短测试消息，不读取文章，也不更新诊断报告。";
  const elapsed = current3?.status === "succeeded" || current3?.status === "failed" ? openAiCompletedElapsed(current3) : "";
  return `<section class="openai-connectivity" aria-label="最小连接测试"><p role="status" aria-live="polite"><strong>${e(title)}</strong></p>
    <p>${e(detail)}</p>${elapsed ? `<p class="hint">用时 ${e(elapsed)}</p>` : ""}
    ${waiting && connection.startedAt ? `<p class="hint" aria-live="off">已等待 <span data-connectivity-elapsed="${connection.startedAt}">${e(openAiElapsed(connection.startedAt))}</span></p>` : ""}</section>`;
}
function renderOpenAiSettings(vm3 = {}) {
  if (!vm3.owner) return `<section id="openai-settings" class="card panel"><h2>AI诊断 · 完整提示词</h2>${openAiLogin}</section>`;
  const draft = vm3.draft;
  const status = vm3.loading ? "正在读取…" : !draft ? "配置读取失败。" : draft.saved.configuration_error_message || (draft.saved.configured ? "可发起分析" : "尚未配置 OpenAI API");
  return `<section id="openai-settings" class="card panel"><h2>AI诊断 · 完整提示词</h2><p class="hint">${e(status)}</p>
    <p class="hint">密钥由服务器管理，此处不显示或录入密钥。<a href="?page=ai-diagnosis">前往AI诊断</a></p>
    ${draft ? renderInstructions(draft) : ""}<p role="alert">${e(vm3.error || "")}</p>
    ${!draft && !vm3.loading ? '<button class="btn" type="button" data-openai-action="reload-settings">重新读取</button>' : ""}</section>`;
}
function renderInstructions(draft) {
  return `<form id="openai-instructions-form"><label for="openai-instructions">完整分析指令</label>
    <p class="hint" id="openai-instructions-help">版本 ${e(draft.saved.version)}。点击保存后才生效，分析使用当时最新的已保存版本。</p>
    <textarea class="input openai-instructions" id="openai-instructions" name="instructions" rows="18" required
    aria-describedby="openai-instructions-help openai-instructions-status" ${draft.saving ? "readonly" : ""}>${e(draft.text)}</textarea>
    <p id="openai-instructions-status" role="status">${e(draft.error || draft.message || (draft.dirty ? "有未保存修改。" : "已保存"))}</p>
    ${draft.conflict ? '<p role="alert">版本已变化。读取最新版本会保留你的文字，比较并确认后才能再次保存。</p>' : ""}
    <div class="openai-review-actions"><button class="btn primary" type="submit"
    ${!draft.dirty || draft.conflict || draft.saving ? "disabled" : ""}>${draft.saving ? "保存中…" : "保存指令"}</button>
    <button class="btn" type="button" data-openai-action="compare" ${draft.saving ? "disabled" : ""}>读取最新版本</button>
    <button class="btn" type="button" data-openai-action="discard" ${draft.saving ? "disabled" : ""}>放弃本机修改</button></div></form>
    ${draft.latest ? `<section class="openai-latest"><h3>服务器最新指令（版本 ${e(draft.latest.version)}）</h3>
      <pre>${e(draft.latest.instructions)}</pre><button class="btn" type="button" data-openai-action="rebase">
      已比较，保留我的文字继续编辑</button></section>` : ""}`;
}

// web/core/openai-connectivity-runner.mjs
var endpoint = "/openai-review/connectivity";
var terminal = (value) => ["succeeded", "failed", "uncertain"].includes(value?.status);
var noDispatch = /* @__PURE__ */ new Set([
  "OPENAI_REVIEW_NOT_CONFIGURED",
  "OPENAI_REVIEW_INVALID_KEY_FORMAT",
  "OPENAI_CONNECTIVITY_TEST_LIMIT",
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "CSRF",
  "MEMOS_RATE_LIMIT"
]);
var unknown = "最小测试结果尚未确认，请只读核查状态。不会自动重复调用。";
function createConnectivityContext({ storage: storage2, key, onChange }) {
  const context = { active: true, generation: 0 };
  const state2 = { result: null, pendingId: "", busy: false, error: "", startedAt: 0, operation: "" };
  try {
    state2.pendingId = storage2.getItem(key) || "";
    const timing = JSON.parse(storage2.getItem(key + ":started"));
    if (timing?.id === state2.pendingId && Number.isFinite(timing.at)) state2.startedAt = timing.at;
  } catch {
  }
  const change3 = () => {
    if (context.active) onChange({ ...state2 });
  };
  const retain = (id2) => {
    storage2.setItem(key, id2);
    if (storage2.getItem(key) !== id2) throw new Error("无法保存最小测试编号，未发起新的 API 调用。");
    state2.pendingId = id2;
  };
  const clear = (id2) => {
    if (storage2.getItem(key) === id2) {
      storage2.removeItem(key);
      if (storage2.getItem(key) === id2) throw new Error("无法清理本机测试编号，请恢复本机存储后再测。");
    }
  };
  const accept = (result, expectedId) => {
    if (!context.active) return;
    if (!result?.id || !["running", "succeeded", "failed", "uncertain"].includes(result.status) || expectedId && result.id !== expectedId) throw new Error(unknown);
    if (state2.pendingId && state2.pendingId !== result.id) return;
    if (state2.result?.id === result.id && terminal(state2.result) && (result.status === "running" || state2.result.status !== "uncertain" && result.status === "uncertain")) return;
    state2.result = result;
    state2.startedAt = Date.parse(result.created_at) || state2.startedAt;
    state2.error = "";
    if (terminal(result)) {
      state2.pendingId = "";
      try {
        clear(result.id);
      } catch (error) {
        state2.error = error.message;
      }
    } else {
      state2.pendingId = result.id;
      retain(result.id);
    }
  };
  const current3 = (version2, id2) => context.active && context.generation === version2 && (state2.pendingId === id2 || !state2.pendingId && state2.result?.id === id2);
  return Object.assign(context, { state: state2, change: change3, retain, clear, accept, current: current3 });
}
function createConnectivityObserver(context, request2) {
  const { state: state2, accept, current: current3, change: change3 } = context;
  let observing = false;
  return async function observe() {
    if (!context.active || observing || state2.operation !== "start" || !state2.pendingId) return;
    const id2 = state2.pendingId, version2 = context.generation;
    observing = true;
    try {
      const result = await request2(endpoint + "/" + encodeURIComponent(id2));
      if (current3(version2, id2)) accept(result, id2);
    } catch (error) {
      if (error.staleSession) {
        context.active = false;
        context.generation++;
      }
    } finally {
      observing = false;
      if (current3(version2, id2)) change3();
    }
  };
}
function createOpenAiConnectivityRunner({
  request: request2,
  storage: storage2,
  key,
  onChange = () => {
  },
  uuid: uuid5 = () => crypto.randomUUID(),
  now = Date.now
}) {
  const context = createConnectivityContext({ storage: storage2, key, onChange });
  const { state: state2, change: change3, retain, clear, accept, current: current3 } = context;
  const observe = createConnectivityObserver(context, request2);
  async function recover() {
    if (state2.operation === "start") return observe();
    if (!context.active || state2.busy || !state2.pendingId) return;
    const id2 = state2.pendingId, version2 = context.generation;
    state2.busy = true;
    state2.operation = "check";
    state2.error = "";
    change3();
    try {
      const result = await request2(endpoint + "/" + encodeURIComponent(id2));
      if (current3(version2, id2)) accept(result, id2);
    } catch (error) {
      if (error.staleSession) {
        context.active = false;
        context.generation++;
        return;
      }
      if (current3(version2, id2)) state2.error = error.status === 404 ? "尚未查到这次最小测试，请稍后核查。不会自动重复调用。" : unknown;
    } finally {
      if (context.active && context.generation === version2) {
        state2.busy = false;
        state2.operation = "";
        change3();
      }
    }
  }
  async function start(model) {
    if (!context.active || state2.busy || state2.pendingId) return;
    const version2 = ++context.generation;
    let id2 = "", dispatched = false;
    state2.busy = true;
    state2.operation = "start";
    state2.error = "";
    change3();
    try {
      let existing = storage2.getItem(key);
      if (existing && state2.result?.id === existing && terminal(state2.result)) {
        clear(existing);
        existing = storage2.getItem(key);
      }
      if (existing) {
        state2.pendingId = existing;
        if (state2.result?.id !== existing) {
          state2.result = null;
          state2.startedAt = 0;
        }
        return;
      }
      id2 = uuid5();
      const at = now(), timing = JSON.stringify({ id: id2, at });
      storage2.setItem(key + ":started", timing);
      if (storage2.getItem(key + ":started") !== timing) throw new Error("无法保存最小测试开始时间，未调用 API。");
      retain(id2);
      state2.startedAt = at;
      state2.result = null;
      change3();
      if (!context.active || context.generation !== version2) return;
      dispatched = true;
      const result = await request2(endpoint, { method: "POST", body: { test_id: id2, model } });
      if (current3(version2, id2)) accept(result, id2);
    } catch (error) {
      if (error.staleSession) {
        context.active = false;
        context.generation++;
        return;
      }
      if (!context.active || context.generation !== version2 || terminal(state2.result) && state2.result.id === id2 && !state2.pendingId) return;
      state2.error = dispatched ? unknown : error.message || "无法保存最小测试编号，未调用 API。";
      if (dispatched && error.code === "OPENAI_CONNECTIVITY_IN_FLIGHT" && typeof error.test_id === "string" && error.test_id) {
        state2.pendingId = error.test_id;
        try {
          retain(error.test_id);
        } catch {
        }
        state2.startedAt = 0;
        state2.error = "已有最小测试正在执行，请只读核查状态。";
      } else if (dispatched && noDispatch.has(error.code)) {
        state2.pendingId = "";
        state2.error = error.message || "最小测试未发起，请检查配置后再试。";
        try {
          clear(id2);
        } catch (storageError) {
          state2.error += " " + storageError.message;
        }
      }
    } finally {
      if (context.active && context.generation === version2) {
        state2.busy = false;
        state2.operation = "";
        change3();
      }
    }
  }
  return { state: state2, start, recover, observe, adopt(result) {
    if (!context.active || !result || state2.pendingId && state2.pendingId !== result.id || state2.busy && state2.result?.id !== result.id && !state2.pendingId) return;
    try {
      accept(result);
    } catch (error) {
      state2.error = error.message;
    }
    change3();
  }, dispose() {
    context.active = false;
    context.generation++;
  } };
}

// web/openai-review-controller.mjs
init_api();
init_state();
var session = "", runner, connectivityRunner, vm = {}, registered = false, timer = null, connectionTimer = null, loadSequence = 0;
var identity4 = () => `${runtime.sessionEpoch}:${state.me?.id || ""}:${Boolean(state.me?.publicBusiness)}`;
var current2 = () => session === identity4();
var clock = createOpenAiElapsedClock(() => {
  if (!current2() || (state.page !== "ai-diagnosis" || state.diagnosisTab !== "help") || document.visibilityState === "hidden") return null;
  const node2 = document.querySelector("#openai-review-panel [data-openai-elapsed]");
  return node2 ? { node: node2, startedAt: Number(node2.dataset.openaiElapsed) } : null;
});
var connectionClock = createOpenAiElapsedClock(() => {
  if (!current2() || state.page !== "ai-diagnosis" || state.diagnosisTab !== "help" || document.visibilityState === "hidden") return null;
  const node2 = document.querySelector("#openai-review-panel [data-connectivity-elapsed]");
  return node2 ? { node: node2, startedAt: Number(node2.dataset.connectivityElapsed) } : null;
});
function stopOpenAiReviewTimers() {
  clock.stop();
  connectionClock.stop();
  clearTimeout(timer);
  timer = null;
  clearTimeout(connectionTimer);
  connectionTimer = null;
}
function openAiReviewTimeout(path, options4 = {}) {
  if (path === "/openai-review/runs" && options4.method === "POST") return 78e4;
  return path === "/openai-review/connectivity" && options4.method === "POST" ? 15e4 : 75e3;
}
async function read(path, options4 = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), openAiReviewTimeout(path, options4));
  try {
    return await apiNetwork(path, { ...options4, signal: controller.signal, suppressAuthRedirect: true });
  } finally {
    clearTimeout(timeout);
  }
}
function reset() {
  if (session === identity4()) return;
  runner?.dispose();
  connectivityRunner?.dispose();
  stopOpenAiReviewTimers();
  session = identity4();
  vm = { owner: openAiSessionAvailable(state.me), config: null, loading: false, error: "" };
  if (!vm.owner) {
    runner = null;
    connectivityRunner = null;
    return;
  }
  const captured = session;
  runner = createOpenAiRunner({
    request: read,
    key: `haoduoyu.openai.run.v1:${state.me.id}:V字`,
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key)
    },
    onChange(next) {
      if (captured !== identity4() || session !== captured) return;
      const settled = openAiPendingRunSettled(vm, next);
      vm = { ...vm, ...next };
      paintOpenAiReview();
      scheduleCheck();
      if (settled) document.dispatchEvent(new CustomEvent("openai-run-settled", {
        detail: { sessionEpoch: runtime.sessionEpoch, userId: state.me?.id, runId: next.run.id }
      }));
    }
  });
  vm = { ...vm, ...runner.state };
  connectivityRunner = createOpenAiConnectivityRunner({
    request: read,
    key: `haoduoyu.openai.connectivity.v1:${state.me.id}:V字`,
    storage: localStorage,
    onChange(next) {
      if (captured !== identity4() || session !== captured) return;
      vm = { ...vm, connection: next };
      paintOpenAiReview();
      scheduleConnectionCheck();
    }
  });
  vm.connection = { ...connectivityRunner.state };
}
function paintOpenAiReview() {
  reset();
  const node2 = document.querySelector("#openai-review-panel");
  if (node2) node2.innerHTML = renderOpenAiReviewPanel(vm);
  clock.refresh();
  connectionClock.refresh();
}
function scheduleConnectionCheck() {
  clearTimeout(connectionTimer);
  connectionTimer = null;
  if (!current2() || document.visibilityState === "hidden" || state.page !== "ai-diagnosis" || state.diagnosisTab !== "help" || !connectivityRunner?.state.pendingId) return;
  connectionTimer = setTimeout(() => {
    if (current2() && document.visibilityState !== "hidden" && state.page === "ai-diagnosis" && state.diagnosisTab === "help")
      void connectivityRunner.recover();
  }, 3e3);
}
function scheduleCheck() {
  clearTimeout(timer);
  timer = null;
  if (document.visibilityState === "hidden" || openAiPendingRunUncertain(runner?.state)) return;
  if (!current2() || state.page !== "ai-diagnosis" || state.diagnosisTab !== "help" || !runner?.state.pendingId || runner.state.busy && runner.state.operation !== "start" || vm.error) return;
  timer = setTimeout(() => {
    if (document.visibilityState !== "hidden" && current2() && state.page === "ai-diagnosis" && state.diagnosisTab === "help" && document.querySelector("#openai-review-panel"))
      void (runner.state.operation === "start" ? runner.observe() : runner.recover());
  }, 5e3);
}
async function loadOpenAiReview() {
  reset();
  register();
  if (!vm.owner) {
    paintOpenAiReview();
    return;
  }
  const ticket2 = ++loadSequence, captured = session;
  const fresh = () => ticket2 === loadSequence && captured === identity4();
  vm.loading = true;
  vm.config = null;
  vm.error = "";
  paintOpenAiReview();
  try {
    const config = await read("/openai-review/config");
    if (!fresh()) return;
    vm.config = config;
    if (!config.supported_models?.some((model) => model.id === vm.selectedModel)) vm.selectedModel = config.default_model || config.model;
    if (runner.state.pendingId) await runner.recover();
    else {
      const page = await read("/openai-review/runs?offset=0");
      if (!fresh()) return;
      const latest = page?.items?.[0];
      if (latest) runner.adopt(latest);
    }
    if (!fresh()) return;
    if (connectivityRunner.state.pendingId) await connectivityRunner.recover();
    else {
      const latestTest = await read("/openai-review/connectivity");
      if (fresh() && latestTest) connectivityRunner.adopt(latestTest);
    }
  } catch (error) {
    if (fresh()) vm.error = error.message || "读取失败，请重新读取。";
  } finally {
    if (fresh()) {
      vm.loading = false;
      paintOpenAiReview();
      scheduleCheck();
      scheduleConnectionCheck();
    }
  }
}
function register() {
  if (registered) return;
  registered = true;
  document.addEventListener("change", (event) => {
    if (event.target.id === "openai-model" && current2() && !runner?.state.busy && !runner?.state.pendingId && vm.config?.supported_models?.some((model) => model.id === event.target.value)) vm.selectedModel = event.target.value;
  });
  document.addEventListener("click", (event) => {
    const button3 = event.target.closest?.("#openai-review-panel [data-openai-action]");
    if (!button3 || button3.disabled || !current2() || !vm.owner) return;
    const action = button3.dataset.openaiAction;
    if (action === "check-connection") {
      void connectivityRunner?.recover();
      return;
    }
    if (action === "reload") {
      void loadOpenAiReview();
      return;
    }
    if (action === "check") {
      void runner.recover();
      return;
    }
    if (action === "release") {
      if (window.confirm("这次请求可能已经产生 API 费用，但结果无法确认。结束核查不会重试，也不会自动发起新分析。确定结束？"))
        void runner.release();
      return;
    }
    if (!vm.config?.configured || vm.loading) return;
    if (action === "test-connection" && !runner?.state.pendingId && !runner?.state.busy) {
      void connectivityRunner.start(vm.selectedModel || vm.config.default_model || vm.config.model);
      return;
    }
    if (connectivityRunner?.state.busy || connectivityRunner?.state.pendingId) return;
    if (action === "full" && !window.confirm("重新分析全部已登记文章和指标，会产生一次新的 API 调用。继续吗？")) return;
    if (["start", "full"].includes(action)) void runner.start(action === "full" ? "full" : "incremental", vm.selectedModel);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === `haoduoyu.openai.connectivity.v1:${state.me?.id}:V字` && current2() && !connectivityRunner?.state.busy) {
      if (state.page === "ai-diagnosis" && state.diagnosisTab === "help") void loadOpenAiReview();
    }
    if (event.key === `haoduoyu.openai.run.v1:${state.me?.id}:V字` && current2() && !runner?.state.busy) {
      stopOpenAiReviewTimers();
      if (state.page === "ai-diagnosis" && state.diagnosisTab === "help") void loadOpenAiReview();
    }
  });
  window.addEventListener("pagehide", stopOpenAiReviewTimers);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopOpenAiReviewTimers();
    else if (current2() && state.page === "ai-diagnosis" && state.diagnosisTab === "help") {
      clock.refresh();
      connectionClock.refresh();
      scheduleCheck();
      scheduleConnectionCheck();
    }
  });
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
init_constants();
init_state();
init_daily_notes_state();
init_todos_state();
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
  return ["overview", "dashboard", "articles", "reviews"].includes(page) ? "review" : page;
}
function updateRoute(push = false) {
  const page = mobilePage(state.page), redirected = page !== state.page;
  if (redirected) state.page = page;
  state.filters.status = "published";
  const u = new URL(location.href);
  u.searchParams.set("page", state.page);
  if (u.hash === "#openai-review-panel") u.hash = "";
  if (state.page === "notes" && dailyNotesRouteCategory() === "work") u.searchParams.set("notes_category", "work");
  else u.searchParams.delete("notes_category");
  if (state.page === "memos" && state.memoView === "trash") u.searchParams.set("memo_view", "trash");
  else u.searchParams.delete("memo_view");
  u.searchParams.delete("period");
  u.searchParams.delete("article_scope");
  u.searchParams.delete("q");
  if (state.page === "todos" && state.todoDate) u.searchParams.set("date", state.todoDate);
  else if (state.page === "notes") u.searchParams.set("date", dailyNotesRouteDate());
  else if (state.page === "reminders" && state.reminderDate) u.searchParams.set("date", state.reminderDate);
  else if (["ai-reports", "ai-diagnosis"].includes(state.page) && state.aiDailyDate) u.searchParams.set("date", state.aiDailyDate);
  else u.searchParams.delete("date");
  if (state.page === "ai-diagnosis") {
    u.searchParams.set("diagnosis_tab", state.diagnosisTab || "help");
    u.searchParams.delete("ai_tab");
    if (state.openAiRun) u.searchParams.set("openai_run", state.openAiRun);
    else u.searchParams.delete("openai_run");
  } else if (state.page === "ai-reports") {
    u.searchParams.set("ai_tab", state.aiDailyTab || "reminders");
    if (state.openAiRun) u.searchParams.set("openai_run", state.openAiRun);
    else u.searchParams.delete("openai_run");
  } else {
    u.searchParams.delete("ai_tab");
    u.searchParams.delete("openai_run");
  }
  if (state.page !== "ai-diagnosis") u.searchParams.delete("diagnosis_tab");
  if (state.page === "todos" && state.todoPanel) u.searchParams.set("todo_panel", state.todoPanel);
  else u.searchParams.delete("todo_panel");
  if (state.page === "settings") u.searchParams.set("tab", state.settingsTab);
  else u.searchParams.delete("tab");
  if (state.page === "review") u.searchParams.set("account", state.account || "V字");
  else u.searchParams.delete("account");
  for (const key of [...Object.keys(defaultFilters()), "list_page", "page_size", "top_n", "top_platform", "columns"])
    u.searchParams.delete(key);
  if (state.page !== "review") {
    for (const key of ["review_view", "review_date", "review_period", "review_article", "review_version", "review_compare"])
      u.searchParams.delete(key);
  }
  history[push && !redirected ? "pushState" : "replaceState"]({}, "", u);
  storage.set("haoduoyu.account", state.account);
}
function readRoute() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("page");
  const fallback = "review";
  state.page = raw === "reminders" ? "ai-reports" : Object.hasOwn(legacyPages, raw) ? "settings" : nav.some((n) => n.id === raw) ? raw : fallback;
  state.page = mobilePage(state.page);
  if (state.page === "notes") {
    setDailyNotesRouteDate(params.get("date"));
    setDailyNotesRouteCategory(params.get("notes_category"));
  }
  state.diagnosisTab = params.get("diagnosis_tab") === "reports" ? "reports" : "help";
  state.aiDailyTab = ["reminders", "reports"].includes(params.get("ai_tab")) ? params.get("ai_tab") : "reminders";
  state.aiDailyDate = ["ai-reports", "ai-diagnosis"].includes(state.page) && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.openAiRun = state.page === "ai-diagnosis" && /^[a-zA-Z0-9-]{1,80}$/.test(params.get("openai_run") || "") ? params.get("openai_run") : "";
  state.memoView = state.page === "memos" && params.get("memo_view") === "trash" ? "trash" : "";
  if (state.memoView === "trash") {
    state.page = "settings";
    state.memoView = "";
  }
  state.reminderDate = state.page === "reminders" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoDate = state.page === "todos" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoPanel = state.page === "todos" && ["history", "templates", "future"].includes(params.get("todo_panel")) ? params.get("todo_panel") : "";
  state.settingsTab = (Object.hasOwn(legacyPages, raw) ? legacyPages[raw] : null) || (Object.hasOwn(settingsTabs, params.get("tab")) ? params.get("tab") : "workspace");
  if (raw === "memos" && params.get("memo_view") === "trash") state.settingsTab = "workspace";
  state.reviewTab = ["pending", "observations", "daily"].includes(params.get("tab")) ? params.get("tab") : "observations";
  state.overviewPeriod = ["yesterday", "7d", "30d"].includes(params.get("period")) ? params.get("period") : "yesterday";
  state.articleOverviewMode = "published";
  state.account = params.get("account")?.trim() || "V字";
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
init_api();
init_state();
async function modalRequest(path, ticket2, version2, context) {
  try {
    return await api(path, { context });
  } catch (err) {
    if (ticket2 !== runtime.modalRequestVersion || version2 !== runtime.renderVersion) return null;
    throw err;
  }
}

// web/ui/segmented.mjs
init_constants();
init_dom();
function segmented(action, items, selected, label3, attribute = "tab", classes = "") {
  return `<div class="segmented${classes ? " " + e(classes) : ""}" role="group" aria-label="${e(label3)}">${items.map(([value, text]) => `<button type="button" class="btn" data-action="${e(action)}" data-${e(attribute)}="${e(value)}" aria-pressed="${selected === value}">${e(
    text
  )}</button>`).join("")}</div>`;
}
function platformFilter(action, selected, label3 = "平台") {
  return segmented(action, [["", "全部"], ...Object.entries(platforms)], selected, label3, "platform");
}

// web/ui/table.mjs
init_dom();
init_state();
function sortHeading(key, label3) {
  return `<button class="sort-heading" data-action="sort-column" data-sort="${e(key)}" aria-label="按${e(label3)}排序">${e(label3)} ${state.filters.sort === key ? state.filters.order === "asc" ? "↑" : "↓" : "↕"}</button>`;
}

// web/pages/articles.mjs
init_requests();
init_api();
init_constants();
init_dom();
init_format();
init_state();
init_modal();
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
  const known3 = Object.hasOwn(statusLabels, value);
  const unknown2 = allowUnknown && !known3;
  if (!unknown2 && !known3) value = "draft_saved";
  return `<label class="form-field">状态<select name="status" class="input" aria-label="文章状态">
${unknown2 ? '<option value="" selected disabled>未确认，请选择状态</option>' : ""}
${Object.entries(statusLabels).map(([key, label3]) => `<option value="${e(key)}" ${value === key ? "selected" : ""}>${e(label3)}</option>`).join("")}
</select></label>`;
}
function filterChips(f) {
  const labels4 = {
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
  const chips = [["account", "账号", state.account ? accountName(state.account) : ""], ...Object.entries(labels4).map(([key, label3]) => [key, label3, choices[key]?.[f[key]] || f[key]])].filter(([, , value]) => value);
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
  const f = { ...state.filters }, params = new URLSearchParams(), account3 = state.account, epoch = runtime.sessionEpoch;
  if (account3) params.set("account_id", account3);
  for (const key of ["mode", "from", "to", "sort", "order", "platform", "topic", "data_status", ...pipelineFilters]) {
    if (f[key]) params.set(key, f[key]);
  }
  params.set("status", "published");
  params.set("page", state.listPage);
  params.set("page_size", state.pageSize);
  const payload = await api(`/articles?${params}`, { envelope: true, context });
  if (version2 !== runtime.renderVersion || epoch !== runtime.sessionEpoch || account3 !== state.account) return "";
  const allowed = new Set(state.accounts.map((row) => row.id));
  if (!Array.isArray(payload.data) || payload.data.some((row) => row?.status !== "published" || !allowed.has(row.account_id) || account3 && row.account_id !== account3)) {
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
${platformFilter("article-platform", f.platform, "文章平台")}
</form>${filterChips(f)}${content2}${articlePagination(meta)}</section>`;
}
function pipelineFilterFields(f) {
  return `${articleSelect("slot", "槽位", slotLabels, f.slot)}
${articleSelect("writer", "写作者", writerLabels, f.writer)}${articleSelect("has_warnings", "有警告", boolChoices, f.has_warnings)}
${articleSelect("has_pending_verify", "有明确待核", boolChoices, f.has_pending_verify)}
${field("series_no_min", "系列编号自", "number", f.series_no_min, 'min="1" step="1"')}
${field("series_no_max", "系列编号至", "number", f.series_no_max, 'min="1" step="1"')}`;
}
function articleFilterPanel({ filters: f = state.filters, columns: c = state.columns, account: account3 = state.account } = {}) {
  return `<form id="filter-panel">${["platform", "data_status"].map((key) => `<input type="hidden" name="${e(key)}" value="${e(f[key])}">`).join("")}
<h2>文章筛选 <span class="badge">应用后生效</span></h2><div class="form-grid"><label class="form-field full">运营账号
<select name="account" class="input" aria-label="运营账号">${accountOptions(account3)}</select></label>${pipelineFilterFields(f)}
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
  for (const key of ["platform", "data_status", "from", "to", "mode", "group", "sort", "order", ...pipelineFilters]) {
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
  const stamp3 = publishedArticle(article) ? article.date_status === "unverified" ? "日期待核实" : time(article.published_at, true) : article.run_date || "日期未标注";
  return `${platformLogo(article.platform)} ${e(article.account_name)} · ${e(stamp3)} · ${e(ledgerTopic(article))}`;
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
function articleForm(article, id2) {
  return `<form id="article-form" class="article-ledger article-ledger-form" data-id="${e(id2)}" data-version="${e(article.version || "")}">
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
</div>${formEnd(id2 ? "保存修改" : "保存文章")}</form>`;
}
async function articleModal(id2 = "") {
  const context = beginModalRequests(), ticket2 = ++runtime.modalRequestVersion, version2 = runtime.renderVersion;
  let article = { account_id: state.account, production_mode: "unknown", status: "draft_saved" };
  if (id2) article = await modalRequest(`/articles/${encodeURIComponent(id2)}`, ticket2, version2, context);
  if (ticket2 !== runtime.modalRequestVersion || version2 !== runtime.renderVersion) return;
  const active5 = state.accounts.filter((account3) => account3.active || account3.id === article.account_id);
  if (!active5.length) {
    toast("请先添加一个启用的运营账号。", true);
    return;
  }
  openModal(id2 ? "编辑文章" : "记录文章", articleForm(article, id2));
  runtime.articleFormRecord = { record: article, sessionEpoch: runtime.sessionEpoch, ticket: runtime.modalRequestVersion };
}

// web/pages/dashboard.mjs
init_constants();
init_dom();
init_format();
init_state();
function dailyDates(data3) {
  return (data3.trend || []).filter((d) => (d.accounts || []).some((a) => Object.values(a.metrics || {}).some((v) => v != null)));
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
function renderDashboard(data3) {
  return renderDashboardSummary(data3);
}
function renderDashboardSummary(data3) {
  const daily = dailyDates(data3);
  const selector = `<label class="form-field"><span>统计账号</span><select id="overview-account" class="input"><option value="">全部账号</option>${state.accounts.map((a) => `<option value="${e(a.id)}" ${state.account === a.id ? "selected" : ""}>${e(accountLabel(a))}</option>`).join("")}</select></label>`;
  return `${selector}${renderCumulative(data3)}
 ${daily.length < 2 ? "" : `<details class="card trend-disclosure" data-state="trendOpen" ${state.trendOpen ? "open" : ""}><summary>趋势与发布量</summary><div class="panel"><div class="chart-header"><h2>每日新增趋势 ${dashboardInfo("trend", "趋势数据覆盖")}</h2><label><span class="sr-only">趋势指标</span><select id="trend-metric" class="input">${Object.entries(metrics).map(([key, label3]) => `<option value="${e(
    key
  )}" ${state.trendMetric === key ? "selected" : ""}>${e(label3)}</option>`).join("")}</select></label></div>${renderTrend(
    data3
  )}<h3>本站发布量 ${dashboardInfo("publication", "发布量口径")}</h3>${renderPublicationTrend(data3)}${segmented("trend-tab", [
    ["metrics", "每日明细"],
    ["publication", "各账号每日发布量"]
  ], state.trendTab || "metrics", "趋势明细")}${renderDailyTable(data3)}</div></details>`}`;
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
function renderCumulative(data3) {
  const c = data3.cumulative || {}, rows = data3.top_articles || [], fresh = freshness(c);
  const interactions = c.totals?.likes == null || c.totals?.comments == null ? null : c.totals.likes + c.totals.comments;
  const stats = [["已发布文章", num(c.article_count)], ["累计阅读", num(c.totals?.reads)], ["篇均阅读", num(c.mean_reads)], ["互动（赞+评）", num(
    interactions
  )], ["数据覆盖", c.coverage == null ? "—" : num(c.coverage * 100) + "%"]];
  return `<div class="overview-status" role="status"><span><i class="fresh-dot ${e(fresh.kind)}"></i>${e(fresh.label)}</span><div>${c.no_snapshot_count ? `<button class="btn text" data-action="missing-list" data-status="no_snapshot">未采集 ${e(num(c.no_snapshot_count))} 篇 →</button>` : ""}</div></div>
 <dl class="dashboard-stats">${stats.map(([label3, value], i) => `<div class="stat"><dt>${e(label3)}${i === 4 ? dashboardInfo(
    "coverage",
    "数据覆盖与统计口径"
  ) : ""}</dt><dd class="${value === "—" ? "missing-value" : ""}">${e(value)}</dd></div>`).join("")}</dl>
 <div class="dashboard-grid dashboard-results"><section class="card"><div class="section-heading"><h2>账号表现</h2></div>${renderPlatformTable(data3.platform_comparison || [])}</section></div>
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
    const accounts = state.accounts.filter((a) => a.platform === p.platform && (!state.account || state.account === a.id)), label3 = accounts.map((a) => accountLabel(a)).join("，") || platforms[p.platform] || p.platform;
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
function dashboardInfoBody(kind, id2) {
  const d = state.dashboard || {}, c = d.cumulative || {}, totals = d.totals || {};
  if (kind === "coverage") return `<p>${e(c.metric_note)}</p><p>篇均分母：有阅读数据 ${e(num(c.data_article_count))} 篇。</p><p>截至 ${e(time(c.as_of))} · 采集 ${e(time(c.collected_at))}</p><p><button class="btn text" data-action="missing-list" data-status="missing_reads">缺阅读 ${e(num(c.missing_reads_count))} 篇 →</button><button class="btn text" data-action="missing-list" data-status="date_unverified">日期待核实 ${e(num(c.unverified_date_count))} 篇 →</button></p><p>点赞 ${e(num(c.totals?.likes))} · 评论 ${e(num(c.totals?.comments))} · 赞同 ${e(num(c.totals?.approvals))}；互动仅在赞、评均取得时相加。</p><p>自动化占比 ${totals.article_count ? e(num(totals.automatic_count / totals.article_count * 100)) + "%" : "—"} · 耗时中位数 ${e(duration(totals.median_duration_seconds))}</p>`;
  if (kind === "platform") {
    const p = (d.platform_comparison || []).find((p2) => p2.platform === id2) || {}, accounts = state.accounts.filter((a) => a.platform === id2 && (!state.account || state.account === a.id));
    return `<p>${accounts.length > 1 ? "同平台多账号，表中为平台汇总；各账号可分别进入文章列表。" : "累计指标来自该平台汇总。"}</p>${accounts.map((a) => `<button class="btn text" data-action="select-account" data-id="${e(a.id)}">${e(a.name)} →</button>`).join(
      ""
    )}<p>覆盖 ${p.coverage == null ? "—" : e(num(p.coverage * 100)) + "%"} · 截至 ${e(time(p.as_of))}</p>${p.best_article ? `<p>最佳文章：<button class="article-link" data-action="article-detail" data-id="${e(p.best_article.id)}">${e(p.best_article.title)}</button> · 阅读 ${e(num(p.best_article.latest_metrics?.reads))}</p>` : "<p>暂无有阅读数据的文章。</p>"}`;
  }
  if (kind === "attention") {
    const a = (d.attention_articles || []).find((a2) => a2.id === id2);
    return `<p>${e(a?.attention?.reason)}</p><p>${e(a?.attention?.baseline)}</p>`;
  }
  if (kind === "series") return "<p>按完整标题编号识别，仅计已发布且日期已记录的文章。编号进度不代表本站收录篇数。</p>";
  if (kind === "publication") return `<p>${e(d.publication_note)}</p>`;
  if (kind === "trend") return `<p>只用真实每日新增，不以累计快照补零或插值。</p>${(d.accounts || []).map((a) => `<p>${e(
    accountLabel(a)
  )}：${e(num((d.trend || []).filter((day6) => day6.accounts.some((r) => r.account_id === a.id && r.metrics?.[state.trendMetric] != null)).length))}/${e(num((d.trend || []).length))}天有该指标；缺日处断开。</p>`).join("")}`;
  return `<p>${e(c.metric_note || "likes为点赞，approvals为赞同，分别记录；未采集、未取得和真实0分开。")}</p><p>周期仅使用真实每日新增，不补零、不插值。累计快照不补每日数据。</p>`;
}
function renderPublicationTrend(data3) {
  const rows = data3.publication_trend || [], max = Math.max(1, ...rows.map((r) => r.accounts.reduce((n, a) => n + a.count, 0)));
  return `<div class="publication-bars" aria-label="本站每日发布量">${rows.map((row) => `<div><span>${e(row.date.slice(5))}</span><div class="publication-stack">${row.accounts.map((a) => `<i data-chart-height="${e(a.count / max * 80)}" data-chart-color="${e(platformColor((data3.accounts || []).find((v) => v.id === a.account_id)?.platform))}" title="${e(accountName(a.account_id))} ${e(num(a.count))}篇"></i>`).join(
    ""
  )}</div><strong>${e(num(row.accounts.reduce((n, a) => n + a.count, 0)))}</strong></div>`).join("")}</div>`;
}
function renderDailyTable(data3) {
  const publication = state.trendTab === "publication", rows = publication ? data3.publication_trend || [] : data3.trend || [], accounts = data3.accounts || [];
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>日期</th>${accounts.map((a) => `<th>${e(accountLabel(a))}</th>`).join(
    ""
  )}</tr></thead><tbody>${rows.map((d) => `<tr><td>${e(d.date)}</td>${accounts.map((a) => {
    const r = d.accounts.find((r2) => r2.account_id === a.id), value = publication ? r?.count : r?.metrics?.[state.trendMetric];
    return `<td>${value == null ? "未取得" : e(num(value))}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function renderTrend(data3) {
  const dates = data3.trend || [], accounts = data3.accounts || [], key = state.trendMetric, colors = accounts.map((a) => platformColor(a.platform));
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

// src/lib/errors.mjs
function fail5(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}

// src/account-profiles.mjs
var invalid3 = (message) => fail5(400, "VALIDATION_ERROR", message);
var unsupported = () => invalid3("请粘贴今日头条、知乎或微信公众号的公开主页链接，文章和后台链接不能作为账号主页");
function normalizeAccountProfile(value, expectedPlatform) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value) || /\s/.test(value.trim())) {
    invalid3("账号主页须为完整 HTTP(S) 链接，且不能包含空格或控制字符");
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    invalid3("账号主页须为完整 HTTP(S) 链接");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
    invalid3("账号主页须为不含登录凭据和自定义端口的 HTTP(S) 链接");
  }
  const host = url.hostname.toLowerCase();
  let platform, profile_url, platform_identity;
  if (["zhihu.com", "www.zhihu.com"].includes(host)) {
    const match = /^\/(people|org)\/([A-Za-z0-9_-]{1,128})(?:\/(?:activities|answers|posts|followers|following|collections))?\/?$/.exec(url.pathname);
    if (!match) unsupported();
    platform = "zhihu";
    profile_url = `https://www.zhihu.com/${match[1]}/${match[2]}`;
    platform_identity = `zhihu:${match[1]}:${match[2]}`;
  } else if (["toutiao.com", "www.toutiao.com", "m.toutiao.com"].includes(host)) {
    const token = /^\/c\/user\/token\/([A-Za-z0-9_-]{8,512})((?:=|%3[dD]){0,2})\/?$/.exec(url.pathname);
    const numeric = /^\/(?:user(?:\/profile)?|c\/user)\/(\d{1,30})\/?$/.exec(url.pathname);
    if (!token && !numeric) unsupported();
    platform = "toutiao";
    const tokenIdentity = token ? token[1] + token[2].replace(/%3d/gi, "=") : null;
    profile_url = token ? `https://www.toutiao.com/c/user/token/${tokenIdentity}/` : `https://www.toutiao.com/user/${numeric[1]}/`;
    platform_identity = token ? `toutiao:token:${tokenIdentity}` : `toutiao:user:${numeric[1]}`;
  } else if (host === "mp.weixin.qq.com") {
    const actions2 = url.searchParams.getAll("action"), identities = url.searchParams.getAll("__biz");
    if (!/^\/mp\/profile_ext\/?$/.test(url.pathname) || actions2.length !== 1 || actions2[0] !== "home" || identities.length !== 1 || !/^[A-Za-z0-9+/]{4,160}={0,2}$/.test(identities[0])) unsupported();
    platform = "wechat";
    const identity6 = identities[0];
    const query = new URLSearchParams({ action: "home", __biz: identity6 });
    profile_url = `https://mp.weixin.qq.com/mp/profile_ext?${query}`;
    platform_identity = `wechat:biz:${identity6}`;
  } else unsupported();
  if (expectedPlatform && expectedPlatform !== platform) invalid3("主页链接与所选平台不一致，请修改平台或主页链接");
  return { platform, profile_url, platform_identity };
}
var hasAccountProfileInput = (body2) => Object.hasOwn(body2, "profile_url");
var hasAccountProfileValue = (body2) => hasAccountProfileInput(body2) && body2.profile_url !== "" && body2.profile_url !== null;

// web/pages/settings.mjs
init_constants();
init_dom();
init_format();
init_state();
init_modal();
function profileForAccount(id2) {
  return (state.accountProfiles || []).find((profile) => profile.account_id === id2);
}
function profileLink(account3) {
  const profile = profileForAccount(account3.id);
  if (!profile?.profile_url) return `<div class="cell-sub">尚未关联公开主页</div>`;
  let url;
  try {
    url = new URL(profile.profile_url);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !["www.zhihu.com", "www.toutiao.com", "mp.weixin.qq.com"].includes(url.hostname)) return "";
  return `<div class="cell-sub"><a href="${e(url.href)}" target="_blank" rel="noopener noreferrer">打开主页核验 ${icon("link", 11)}</a> · 访问状态未自动验证</div>`;
}
function renderAccounts() {
  const accounts = state.accounts;
  return `<section class="card"><div class="section-heading"><div><h2>运营账号</h2><p class="hint">只需填写公开主页链接即可添加账号。</p></div><button type="button" class="btn primary" data-action="new-account">${icon("plus")}添加账号</button></div>${accounts.length ? `<div class="table-scroll"><table class="data-table accounts-table"><thead><tr><th>账号</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${accounts.map((a) => `<tr><td><span class="account-title">${platformLogo(
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
    return `<tr><td>${e(k.name)}<div class="cell-sub">创建 ${e(time(k.created_at))}</div></td><td class="key-scope">${ids.map((id2) => e(accountName(
      id2
    ))).join("<br>") || "无账号权限"}</td><td>${permissions.map((p) => `<span class="badge ${p === "write" ? "up" : ""}">${p === "read" ? "读取" : p === "write" ? "写入" : e(p)}</span>`).join(" ")}</td><td>${k.last_used_at ? e(time(k.last_used_at)) : "尚未使用"}</td><td><span class="badge ${k.revoked_at ? "" : "up"}">${k.revoked_at ? "已撤销" : "有效"}</span></td><td>${k.revoked_at ? "" : `<button class="btn small danger" data-action="revoke-key" data-id="${e(k.id)}" data-name="${e(k.name)}">撤销</button>`}</td></tr>`;
  }).join("")}</tbody></table></div>` : empty("暂无凭证", "供自动化工具按账号范围读取或录入数据。")}</section>`;
}
function auditLabel(action) {
  const labels4 = [
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
  const route2 = String(action || "").replace(/^(PUT|DELETE) \/(articles|accounts|api-keys)\/[^/]+$/, "$1 /$2/:id");
  return labels4.find((row) => row.includes(route2))?.[0] || route2 || "未知操作";
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
  let day6 = "";
  return `<section class="card panel"><h2>最近操作</h2><div class="audit-list">${groups.map((g) => {
    const heading = day6 === g.day ? "" : `<h3>${e(g.day === bjtDate() ? "今天" : g.day === bjtDate(Date.now() - 864e5) ? "昨天" : g.day)}</h3>`;
    day6 = g.day;
    return `${heading}<details class="audit-item"><summary><div><strong>${e(g.label)} ×${e(num(g.rows.length))}</strong><div class="audit-meta">${e(actor(g.actor))} · ${e(time(g.rows.at(-1).created_at, true))}${g.rows.length > 1 ? " — " + e(time(g.rows[0].created_at, true)) : ""}</div></div></summary><ol class="snapshot-timeline">${g.rows.map((r) => {
      const article = r.entity_id && typeof r.entity_label === "string" && r.entity_label ? r : null;
      return `<li>${e(auditLabel(r.action))} · <time datetime="${e(r.created_at)}" title="${e(time(r.created_at))}">${e(displayTime(r.created_at))}</time>${article ? `<br><span class="article-title">${e(article.entity_label)}</span>` : ""}</li>`;
    }).join("")}</ol></details>`;
  }).join("") || empty("暂无操作记录")}</div></section>`;
}
function accountModal(id2 = "") {
  const a = state.accounts.find((a2) => a2.id === id2) || { platform: "", name: "", active: true };
  const profile = profileForAccount(id2);
  const homepage = `<div class="form-field full"><label for="field-profile-url">公开主页链接</label><input class="input" type="url" id="field-profile-url" name="profile_url" value="${e(profile?.profile_url || "")}" maxlength="2048" placeholder="粘贴今日头条、知乎或微信公众号主页" ${id2 ? "" : "required"}><span class="hint">只校验和保存主页地址，不自动访问平台。支持知乎 /people/ 或 /org/ 主页、今日头条用户主页，以及微信公众平台 profile_ext?action=home&amp;__biz=… 主页；文章链接不可用。知乎的动态、回答等子页面会规范化为对应主页；后台统计仍需另行录入。</span><button type="button" class="btn small" data-action="test-profile">测试链接格式</button><div id="profile-test-result" class="hint" role="status" aria-live="polite"></div></div>`;
  openModal(id2 ? "管理运营账号" : "添加运营账号", `<form id="account-form" data-id="${e(id2)}"><div class="form-grid">${homepage}<div class="form-field"><label for="field-platform">所属平台</label><select class="input" id="field-platform" name="platform" disabled>${Object.entries(
    id2 ? platforms : { "": "根据主页自动识别", ...platforms }
  ).map(([key, label3]) => `<option value="${key}" ${a.platform === key ? "selected" : ""}>${label3}</option>`).join(
    ""
  )}</select></div>${id2 ? field("name", '账号名称 <span class="required">*</span>', "text", a.name, 'required maxlength="100"') : '<p class="hint full">平台自动识别，账号名称暂用主页标识，可在保存后编辑。</p>'}${id2 ? `<div class="form-field full"><label class="check-option"><input type="checkbox" name="active" ${a.active ? "checked" : ""}>启用此账号</label><span class="hint">停用保留历史数据。</span></div>` : ""}</div>${formEnd(id2 ? "保存账号" : "添加账号")}</form>`);
  document.querySelector("#field-profile-url")?.addEventListener?.("input", () => {
    const result = document.querySelector("#profile-test-result");
    if (result) result.textContent = "";
  });
}
function testProfile() {
  const input = document.querySelector("#field-profile-url"), result = document.querySelector("#profile-test-result");
  if (!input || !result) return;
  try {
    const id2 = document.querySelector("#account-form")?.dataset.id;
    const account3 = state.accounts.find((a) => a.id === id2);
    const profile = normalizeAccountProfile(input.value, account3?.platform);
    result.innerHTML = `格式有效（${e(platforms[profile.platform])}）；访问情况无法自动核验。<a href="${e(profile.profile_url)}" target="_blank" rel="noopener noreferrer">打开官方主页自行核验</a>`;
  } catch (error) {
    result.textContent = `格式未通过：${error.message}`;
  }
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

// web/core/todo-count.mjs
var pattern = /^(\d{1,3})\/(\d{1,3}) 次(?: · ([\s\S]*))?$/;
var TODO_COUNT_MAX = 99;
function todoCount(note) {
  const match = pattern.exec(String(note ?? ""));
  if (!match) return null;
  const done2 = Number(match[1]), target = Number(match[2]);
  if (target < 1 || target > TODO_COUNT_MAX || done2 > target) return null;
  return { done: done2, target, rest: match[3] || "" };
}
function todoCountNote(done2, target, rest = "") {
  return `${done2}/${target} 次${rest ? ` · ${rest}` : ""}`;
}
function todoCountChange(note, action, target = 0) {
  const current3 = todoCount(note), text = String(note ?? "");
  if (action === "set") {
    if (!Number.isInteger(target) || target < 1 || target > TODO_COUNT_MAX) return null;
    return todoCountNote(Math.min(current3?.done ?? 0, target), target, current3 ? current3.rest : text);
  }
  if (!current3) return null;
  if (action === "clear") return current3.rest;
  if (action === "add") return current3.done < current3.target ? todoCountNote(current3.done + 1, current3.target, current3.rest) : null;
  if (action === "undo") return current3.done > 0 ? todoCountNote(current3.done - 1, current3.target, current3.rest) : null;
  return null;
}

// web/core/todo-month.mjs
function todoMonthScopeTransition(snapshotOwner, nextOwner, previousReady, ready) {
  if (snapshotOwner !== nextOwner) return ready ? "replace-and-load" : "replace";
  if (previousReady === ready) return "none";
  return ready ? "resume" : "pause";
}
function todoMonthSeed(month, snapshot, loaded) {
  const days = {};
  if (snapshot?.days) {
    const last = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`);
    last.setUTCMonth(last.getUTCMonth() + 1);
    last.setUTCDate(0);
    for (let i = 1; i <= last.getUTCDate(); i++) {
      const date = `${month}-${String(i).padStart(2, "0")}`;
      days[date] = snapshot.days[date] || [];
    }
  }
  for (const day6 of loaded) {
    if (!snapshot?.days || day6.pending || day6.readAt > snapshot.verified_at) days[day6.date] = day6.items;
  }
  return days;
}
async function loadTodoMonth(snapshot, controller, expired, deps) {
  const { monthDays, seed, active: active5, now, limits, isCurrent, changed: changed4 } = deps;
  const valid2 = () => snapshot.controller === controller && !controller.signal.aborted && active5(snapshot.owner);
  const count3 = monthDays(snapshot.month);
  const dates = Array.from({ length: count3 }, (_, i) => `${snapshot.month}-${String(i + 1).padStart(2, "0")}`);
  const revisions = new Map(snapshot.revisions);
  try {
    const initial = await seed(snapshot.month, snapshot.owner, { refresh: expired });
    if (!valid2()) return;
    if (initial) for (const [date, items] of Object.entries(initial)) {
      if (dates.includes(date) && Array.isArray(items) && !snapshot.fresh.has(date) && (snapshot.revisions.get(date) || 0) === (revisions.get(date) || 0)) {
        snapshot.days.set(date, items);
        snapshot.fresh.add(date);
      }
    }
    for (let start = 0; start < dates.length; start += 5) {
      const batch = dates.slice(start, start + 5).filter((date) => !snapshot.fresh.has(date));
      if (!batch.length) continue;
      const context = { controller, pending: /* @__PURE__ */ new Map() };
      const results = await Promise.allSettled(batch.map(async (date) => {
        const revision2 = revisions.get(date) || 0;
        const value = await deps.read(date, context);
        if (!Array.isArray(value?.items)) throw new Error("月记录读取不完整，请重试");
        if (valid2()) {
          if ((snapshot.revisions.get(date) || 0) === revision2) snapshot.days.set(date, value.items);
          snapshot.fresh.add(date);
        }
        return value;
      }));
      if (!valid2()) return;
      let failure3;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "rejected") {
          const error = result.reason || new Error("月记录读取失败，请重试");
          if (!failure3 || error?.status === 429 && (failure3.status !== 429 || (error.retryAfterMs || 6e4) > (failure3.retryAfterMs || 6e4))) failure3 = error;
        }
      }
      if (failure3) {
        if (failure3.status === 429) {
          const deadline = Math.min(Number.MAX_SAFE_INTEGER - 1, now() + (failure3.retryAfterMs || 6e4));
          limits.cooldown = Math.max(limits.cooldown, deadline);
          snapshot.retryAt = Math.max(snapshot.retryAt, deadline);
        }
        snapshot.error = failure3.message || "月记录读取失败，请重试";
        break;
      }
    }
    if (snapshot.fresh.size === count3) snapshot.expiresAt = now() + 6e4;
  } catch (error) {
    if (valid2()) snapshot.error = error.message || "月记录读取失败，请重试";
  } finally {
    if (snapshot.controller === controller) {
      snapshot.controller = null;
      snapshot.loading = false;
      if (isCurrent(snapshot) && active5(snapshot.owner)) changed4(snapshot);
    }
  }
}
function createTodoMonthLoader({ read: read2, seed, active: active5, changed: changed4 = () => {
}, now = Date.now }) {
  let owner2 = "", current3 = null;
  const limits = { cooldown: 0 };
  const monthDays = (month) => {
    const end = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    return end.getUTCDate();
  };
  const months = /* @__PURE__ */ new Map();
  function cancel(snapshot) {
    if (!snapshot?.controller) return;
    snapshot.controller.abort();
    snapshot.controller = null;
    snapshot.loading = false;
  }
  function open(month, nextOwner) {
    if (owner2 !== nextOwner) {
      cancel(current3);
      months.clear();
      owner2 = nextOwner;
      current3 = null;
      limits.cooldown = 0;
    }
    if (current3?.month !== month) cancel(current3);
    let snapshot = months.get(month);
    if (!snapshot) {
      snapshot = { month, owner: owner2, days: /* @__PURE__ */ new Map(), fresh: /* @__PURE__ */ new Set(), revisions: /* @__PURE__ */ new Map(), expiresAt: 0, loading: false, error: "", retryAt: 0 };
      months.set(month, snapshot);
    }
    current3 = snapshot;
    const count3 = monthDays(month), deadline = Math.max(snapshot.retryAt, limits.cooldown);
    if (snapshot.fresh.size === count3 && now() < snapshot.expiresAt) snapshot.error = "";
    const expired = snapshot.fresh.size === count3 && now() >= snapshot.expiresAt;
    if (expired) snapshot.fresh.clear();
    if (!snapshot.loading && snapshot.fresh.size < count3 && now() < deadline && !snapshot.error)
      snapshot.error = "请求较多，请稍后重试。";
    if (!snapshot.loading && snapshot.fresh.size < count3 && now() >= deadline) {
      const controller = new AbortController();
      snapshot.controller = controller;
      snapshot.loading = true;
      snapshot.error = "";
      snapshot.promise = loadTodoMonth(snapshot, controller, expired, {
        monthDays,
        seed,
        read: read2,
        active: active5,
        now,
        limits,
        changed: changed4,
        isCurrent: (value) => current3 === value
      });
    }
    return snapshot;
  }
  function update(nextOwner, date, items) {
    if (owner2 !== nextOwner || !Array.isArray(items)) return false;
    const snapshot = months.get(date.slice(0, 7));
    if (!snapshot || JSON.stringify(snapshot.days.get(date)) === JSON.stringify(items)) return false;
    snapshot.days.set(date, items);
    snapshot.revisions.set(date, (snapshot.revisions.get(date) || 0) + 1);
    return true;
  }
  return { open, update, cancel: () => cancel(current3) };
}

// web/core/todo-templates-state.mjs
init_state();
init_todos_state();
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
init_api();
init_dom();
init_requests();
init_format();
init_state();
init_todos_state();
function templateUnavailable(store, day6, id2) {
  return !store.loaded || !day6.loaded || day6.loading || day6.adding || store.pending.has(id2) || todoTemplateAdded(day6, id2) || [...day6.removals.values()].some((ticket2) => ticket2.phase === "restoring" && ticket2.item.template_id === id2);
}
function inlineTodoTemplateContent(store) {
  const day6 = todoDay(), label3 = day6.date === bjtDate() ? "今日已添加" : "当日已添加";
  const status = "";
  const error = store.error ? `<p class="form-message" role="alert">${e(store.error)}
<button class="btn text small" data-action="todo-reload">重新读取</button></p>` : "";
  return status + error + store.items.map((item) => {
    const added = todoTemplateAdded(day6, item.id);
    return `<button type="button" class="todo-template-chip${added ? " is-added" : ""}" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="${e(added ? item.text + "，" + label3 : "添加：" + item.text)}" ${templateUnavailable(store, day6, item.id) ? "disabled" : ""}>
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
  const root3 = $("#todo-inline-templates");
  if (!root3) return;
  const html = inlineTodoTemplateContent(store);
  if (root3.innerHTML !== html) root3.innerHTML = html;
  root3.hidden = inlineTodoTemplatesEmpty(store);
  root3.setAttribute("aria-busy", String(store.loading));
}
function todoTemplateRows(store) {
  const day6 = todoDay();
  const added = (id2) => todoTemplateAdded(day6, id2);
  const addedLabel = day6.date === bjtDate() ? "今日已添加" : "当日已添加";
  return store.items.map((item) => `<li class="todo-template-row" data-template-id="${e(item.id)}">
<div class="todo-template-line"><button class="todo-template-use" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="添加：${e(item.text)}" ${templateUnavailable(store, day6, item.id) ? "disabled" : ""}>${e(item.text)}</button>
<button class="btn text small" data-action="todo-template-edit" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>改名</button>
<button class="btn text small" data-action="todo-template-archive" data-id="${e(item.id)}" ${store.pending.has(item.id) ? "disabled" : ""}>归档</button>
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
function renderTodoTemplates(floatingControl = "") {
  const store = templateState();
  return `<section id="todo-templates" class="daily-todo-templates todo-view" aria-label="常用待办" ${state.todoPanel === "templates" ? "" : "hidden"}>
<div class="todo-view-head">${floatingControl}</div>
<div class="todo-template-content">
<form id="todo-template-form" class="todo-template-form" ${store.editing ? "hidden" : ""}>
<label for="todo-template-text" class="sr-only">新建常用待办</label>
<input id="todo-template-text" class="input" name="text" maxlength="500" required placeholder="新建常用待办" value="${e(store.draft)}">
<button class="btn" type="submit">保存</button></form><div id="todo-template-editor">${todoTemplateEditor(store)}</div>
<p id="todo-template-feedback" class="form-message" role="alert">${e(store.error)}</p>
<p id="todo-template-status" class="daily-todo-status" role="status"></p>
<ul id="todo-template-items" class="todo-template-items">${todoTemplateRows(store)}</ul>
<details><summary>已归档的常用待办</summary><div id="todo-template-archived">${archivedRows(store)}</div></details></div></section>`;
}
function archivedRows(store) {
  if (store.archiveError) return `<p role="status">${e(store.archiveError)}</p>`;
  return (store.archived || []).map((item) => `<div class="todo-template-line"><span>${e(item.text)}</span>
<button class="btn text small" data-action="todo-template-restore-archive" data-id="${e(item.id)}"
${store.pending.has(item.id) ? "disabled" : ""}>恢复</button></div>`).join("") || "<p>暂无归档</p>";
}
function syncTemplateForm(root3, id2, value, pending) {
  const input = $(id2, root3);
  if (!input) return;
  if (input.value !== value) input.value = value;
  input.readOnly = pending;
  const button3 = $("button[type=submit]", input.form);
  if (button3) {
    button3.disabled = pending;
    button3.textContent = "保存";
    button3.setAttribute("aria-busy", String(pending));
  }
}
function paintTodoTemplates() {
  if (state.page !== "todos" || !state.me) return;
  const store = templateState();
  paintInlineTodoTemplates(store);
  const root3 = $("#todo-templates");
  if (!root3) return;
  const editor = $("#todo-template-editor", root3), form = $("#todo-template-edit-form", root3);
  if (editor && (form?.dataset.id || null) !== (store.editing?.id || null)) editor.innerHTML = todoTemplateEditor(store);
  root3.dataset.loaded = String(store.loaded);
  const create = $("#todo-template-form", root3);
  if (create) create.hidden = Boolean(store.editing);
  syncTemplateForm(root3, "#todo-template-text", store.draft, store.adding);
  syncTemplateForm(root3, "#todo-template-edit-text", store.editDraft, store.pending.has(store.editing?.id));
  for (const [id2, html] of Object.entries({
    "todo-template-items": todoTemplateRows(store),
    "todo-template-feedback": e(store.error),
    "todo-template-status": "",
    "todo-template-archived": archivedRows(store)
  })) {
    const node2 = $("#" + id2, root3);
    if (node2 && node2.innerHTML !== html) node2.innerHTML = html;
  }
}
function templateReadActive(store, owner2, sequence5, version2, date) {
  return templateSessionActive(owner2) && store.sequence === sequence5 && version2 === runtime.renderVersion && state.page === "todos" && date === todoDate();
}
async function loadTodoTemplates({ ensure = false } = {}) {
  if (state.page !== "todos" || !state.me) return;
  const store = templateState(), date = todoDate(), version2 = runtime.renderVersion;
  if (ensure && (store.loaded && !store.error && !store.loading || store.loading && store.readDate === date && store.readVersion === version2)) return;
  const owner2 = store.owner, sequence5 = ++store.sequence, revision2 = store.revision;
  store.readDate = date;
  store.readVersion = version2;
  store.loading = true;
  store.error = "";
  paintTodoTemplates();
  try {
    const data3 = await api("/todo-templates");
    let archived;
    try {
      archived = await api("/todo-templates?archived=1");
      store.archiveError = "";
    } catch {
      store.archiveError = "归档列表暂时不可用，请联网后重试。";
    }
    if (!templateReadActive(store, owner2, sequence5, version2, date)) return;
    if (revision2 !== store.revision) return loadTodoTemplates();
    store.items = data3.items;
    if (archived) store.archived = archived.items;
    store.loaded = true;
  } catch (error) {
    if (templateReadActive(store, owner2, sequence5, version2, date) && !isRequestAbort(error) && !error.staleSession) store.error = error.message;
  } finally {
    if (templateSessionActive(owner2) && store.sequence === sequence5) {
      store.loading = false;
      paintTodoTemplates();
    }
  }
}
async function archiveTodoTemplate(id2, restore = false) {
  const store = templateState(), owner2 = store.owner, item = (restore ? store.archived || [] : store.items).find((row) => row.id === id2);
  if (!item || store.pending.has(id2)) return;
  store.pending.add(id2);
  store.revision++;
  store.error = "";
  paintTodoTemplates();
  try {
    const saved = await api(`/todo-templates/${encodeURIComponent(id2)}/${restore ? "restore" : "archive"}`, { method: "POST", body: { version: item.version } });
    if (!templateSessionActive(owner2)) return;
    if (restore) {
      store.archived = (store.archived || []).filter((row) => row.id !== id2);
      mergeTodoTemplate(saved);
    } else {
      store.items = store.items.filter((row) => row.id !== id2);
      store.archived = [...store.archived || [], saved];
    }
    await loadTodoTemplates();
    await loadTodos();
  } catch (error) {
    if (templateSessionActive(owner2)) store.error = error.status === 404 ? "常用待办可能仍在同步，请稍后重试。" : error.message;
  } finally {
    if (templateSessionActive(owner2)) {
      store.pending.delete(id2);
      store.revision++;
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
async function submitTodoTemplateForm({ data: data3 }) {
  const store = templateState(), owner2 = store.owner, text = String(data3.text || "").trim();
  if (store.adding || !state.me) return;
  store.draft = String(data3.text || "");
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
function editTodoTemplate(id2) {
  const store = templateState(), item = store.items.find((row) => row.id === id2);
  if (!item || store.pending.has(id2)) return;
  store.editing = { id: id2, version: item.version };
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
async function writeTodoTemplate(id2, text, remove = false) {
  const store = templateState(), owner2 = store.owner, item = store.items.find((row) => row.id === id2);
  if (!item || store.pending.has(id2)) return;
  const editing3 = store.editing?.id === id2 ? store.editing : null;
  const version2 = remove ? item.version : editing3?.version;
  store.pending.add(id2);
  store.error = "";
  store.revision++;
  paintTodoTemplates();
  try {
    const saved = await api(`/todo-templates/${encodeURIComponent(id2)}`, {
      method: remove ? "DELETE" : "PATCH",
      body: remove ? { version: version2 } : { text, version: version2 }
    });
    if (!templateSessionActive(owner2)) return;
    if (remove) store.items = store.items.filter((row) => row.id !== id2);
    else mergeTodoTemplate(saved);
    if (store.editing?.id === id2) store.editing = null;
    if (remove && state.page === "todos") await loadTodos();
  } catch (error) {
    if (templateSessionActive(owner2)) await templateWriteError(error, store, owner2, editing3);
  } finally {
    if (templateSessionActive(owner2)) {
      store.pending.delete(id2);
      store.revision++;
      paintTodoTemplates();
    }
  }
}
async function submitTodoTemplateEdit({ form, data: data3 }) {
  const store = templateState(), text = String(data3.text || "").trim();
  store.editDraft = String(data3.text || "");
  if (!store.editing || store.editing.id !== form.dataset.id) return;
  if (!text || text.length > 500) {
    store.error = "请填写 1–500 字的常用待办。";
    paintTodoTemplates();
    return;
  }
  await writeTodoTemplate(store.editing.id, text);
}
async function useTodoTemplate(id2) {
  const store = templateState(), item = store.items.find((row) => row.id === id2);
  if (item && !templateUnavailable(store, todoDay(), id2)) await submitTodoTemplate(item);
}
function refreshOpenTodoTemplates() {
  const store = templateState();
  store.revision++;
  if (state.page === "todos") void loadTodoTemplates();
}

// web/pages/todo-actions.mjs
init_api();
init_dom();
init_requests();
init_state();
init_todos_state();
init_popover();
init_modal();
function todoBusy(day6, id2) {
  return day6.updates.has(id2) || day6.removals.has(id2) || day6.templateWrites.has(id2);
}
function todoActionContext({ id: id2, date, owner: owner2 = todoOwner() }) {
  if (!state.me || state.page !== "todos" || !validTodoDate(date) || date !== todoDate() || !todoSessionActive(owner2)) return null;
  const day6 = todoDay(date), item = day6.items.find((row) => row.id === id2);
  return item ? { day: day6, item, owner: owner2 } : null;
}
function canOpenTodoMenu({ id: id2, date, anchor }) {
  const context = todoActionContext({ id: id2, date });
  return Boolean(context && anchor?.isConnected && !context.item.deleted_at && !todoBusy(context.day, id2));
}
function openTodoMenu({ target, id: id2, date, anchor }) {
  date ||= target?.dataset.date;
  anchor ||= target?.closest(".daily-todo-row");
  if (!canOpenTodoMenu({ id: id2, date, anchor })) return;
  const { item, owner: owner2 } = todoActionContext({ id: id2, date });
  const trigger = target || $('[data-action="todo-menu"]', anchor);
  if (!trigger) return;
  const attributes = `data-id="${e(id2)}" data-date="${e(date)}" data-owner="${e(owner2)}" role="menuitem"`;
  const commonAction = item.template_active ? "todo-remove-template" : "todo-make-template";
  const commonLabel = item.template_active ? "取消常用待办" : "添加为常用待办";
  const count3 = todoCount(item.note);
  const counting = count3 ? `<button data-action="todo-count-set" ${attributes}>修改次数（${count3.target} 次）</button>
${count3.done ? `<button data-action="todo-count-undo" ${attributes}>撤回一次</button>` : ""}
<button data-action="todo-count-clear" ${attributes}>取消计次</button>` : `<button data-action="todo-count-set" ${attributes}>设置次数</button>`;
  popover(trigger, `${counting}<button data-action="${commonAction}" ${attributes}>${commonLabel}</button>
<button data-action="todo-delete" ${attributes}>删除</button>`, { menu: true, label: "事项操作" });
}
async function changeTodoCount(options4, action, target = 0) {
  const context = todoActionContext({ ...options4, owner: options4.owner || todoOwner() });
  if (!context || todoBusy(context.day, context.item.id) || context.day.countWrites?.has(context.item.id)) return false;
  const { day: day6, item, owner: owner2 } = context, note = todoCountChange(item.note, action, target);
  if (note === null) return false;
  (day6.countWrites ||= /* @__PURE__ */ new Set()).add(item.id);
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}/note`, { method: "PATCH", body: { note, version: item.version } });
    if (!todoSessionActive(owner2)) return false;
    mergeTodo(day6, saved);
    day6.noteError = "";
    return true;
  } catch (error) {
    if (isRequestAbort(error) || !todoSessionActive(owner2)) return false;
    setTodoNotice(day6, error.status === 404 ? "这项待办可能仍在同步，请稍后再记。" : error.message || "没有记上，请重试");
    return false;
  } finally {
    day6.countWrites.delete(item.id);
    if (todoSessionActive(owner2)) paintTodos();
  }
}
function openTodoCount({ id: id2, date, owner: owner2 }) {
  const context = todoActionContext({ id: id2, date, owner: owner2 || todoOwner() });
  if (!context) return;
  const count3 = todoCount(context.item.note);
  openModal("设置次数", `<form id="todo-count-form" data-id="${e(id2)}" data-date="${e(date)}" data-owner="${e(context.owner)}">
<p class="muted">${e(context.item.text)}</p>
<label for="todo-count-target">一共要做几次</label>
<input class="input" id="todo-count-target" name="target" type="number" inputmode="numeric" min="1" max="${TODO_COUNT_MAX}" step="1" required
  value="${count3?.target ?? ""}">
<p class="muted">设置后每做一次点“+1”，备注会自动显示“2/5 次”。次数满了仍由你点左边的圆圈完成。</p>
<p class="form-message" role="alert"></p>
<div class="form-actions"><button class="btn primary" type="submit">确定</button></div></form>`);
}
async function submitTodoCount({ form, data: data3 }) {
  const target = Number(data3.target), message = form.querySelector(".form-message"), button3 = form.querySelector("button[type=submit]");
  if (!Number.isInteger(target) || target < 1 || target > TODO_COUNT_MAX) {
    message.textContent = `请填 1 到 ${TODO_COUNT_MAX} 之间的整数`;
    return;
  }
  if (button3.disabled) return;
  button3.disabled = true;
  message.textContent = "";
  const saved = await changeTodoCount({ id: form.dataset.id, date: form.dataset.date, owner: form.dataset.owner }, "set", target);
  if (saved) closeModal();
  else {
    button3.disabled = false;
    message.textContent = "没有保存，请重试";
  }
}
function readNote(node2) {
  const raw = node2?.isContentEditable ? node2.textContent : node2?.value;
  return String(raw ?? "").replace(/\r?\n/g, "").slice(0, 4e3);
}
function placeNoteCaret(node2) {
  if (!node2) return;
  node2.focus();
  const selection = window.getSelection?.();
  if (!selection || !node2.isContentEditable) {
    const end = node2.value?.length || 0;
    node2.setSelectionRange?.(end, end);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(node2);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
function rememberNote(node2) {
  const text = readNote(node2);
  const shown = node2.isContentEditable ? node2.textContent : node2.value;
  if (shown !== text) {
    if (node2.isContentEditable) node2.textContent = text;
    else node2.value = text;
    placeNoteCaret(node2);
  }
  if (node2.dataset.future === "1") {
    const view = futureTodoView();
    if (view.noteEdit?.id === node2.dataset.id) view.noteEdit.text = text;
    return;
  }
  const day6 = todoDay(node2.dataset.date);
  if (day6.noteEdit?.id === node2.dataset.id) day6.noteEdit.text = text;
}
function watchTodoNotes() {
  if (watchTodoNotes.ready || typeof document === "undefined") return;
  watchTodoNotes.ready = true;
  document.addEventListener("beforeinput", (event) => {
    const node2 = event.target;
    if (!node2?.matches?.("[data-todo-note-input]")) return;
    if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      event.preventDefault();
      node2.blur();
    }
  });
  document.addEventListener("paste", (event) => {
    const node2 = event.target?.closest?.("[data-todo-note-input]");
    if (!node2) return;
    event.preventDefault();
    const text = (event.clipboardData?.getData("text/plain") || "").replace(/\r?\n/g, "");
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    node2.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener("input", (event) => {
    if (event.target?.matches?.("[data-todo-note-input]")) rememberNote(event.target);
  });
  document.addEventListener("focusout", (event) => {
    if (event.target?.matches?.("[data-todo-note-input]")) void commitTodoNote(event.target);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target?.matches?.("[data-todo-note-input]")) {
      event.preventDefault();
      event.target.blur();
    }
  });
}
function openFutureNote(options4) {
  const view = futureTodoView(), id2 = options4.id || options4.target?.dataset.id;
  const item = view.items.find((row) => row.id === id2 && !row.deleted_at && !row.deleted);
  if (!item || view.pending || view.uncertain[id2]) return;
  view.noteEdit = { id: item.id, text: item.note || "" };
  view.noteError = "";
  paintUnscheduledTodos();
  placeNoteCaret(document.querySelector(`#todo-future [data-todo-note-input][data-id="${CSS.escape(item.id)}"]`));
}
function openTodoNote(options4) {
  watchTodoNotes();
  if (options4.target?.dataset.future === "1") return openFutureNote(options4);
  const context = todoActionContext({ ...options4, date: options4.date || options4.target?.dataset.date, owner: options4.owner || options4.target?.dataset.owner });
  if (!context || todoBusy(context.day, context.item.id)) return;
  const { item, day: day6 } = context;
  day6.noteEdit = { id: item.id, text: item.note || "" };
  day6.noteError = "";
  paintTodos();
  placeNoteCaret(document.querySelector(`[data-todo-note-input][data-id="${CSS.escape(item.id)}"]`));
}
async function commitFutureNote(input) {
  if (futureRepainting()) return;
  const view = futureTodoView(), item = view.items.find((row) => row.id === input.dataset.id);
  if (!item || view.noteEdit?.id !== item.id || view.noteEdit.committing) return;
  const text = readNote(input);
  if (text === (item.note || "")) {
    view.noteEdit = null;
    view.noteError = "";
    paintUnscheduledTodos();
    return;
  }
  view.noteEdit.committing = true;
  view.noteEdit.text = text;
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}/note`, { method: "PATCH", body: { note: text, version: item.version } });
    Object.assign(item, saved);
    if (!saved.note) delete item.note;
    if (view.noteEdit?.id === item.id) view.noteEdit = null;
    view.noteError = "";
  } catch (error) {
    if (isRequestAbort(error)) return;
    if (view.noteEdit?.id === item.id) {
      view.noteEdit.committing = false;
      view.noteError = error.status === 404 ? "这项待办可能仍在同步，请稍后重试；备注内容已保留。" : error.message || "保存失败，请重试";
    }
  }
  paintUnscheduledTodos();
  if (view.noteEdit?.id === item.id) document.querySelector(`#todo-future [data-todo-note-input][data-id="${CSS.escape(item.id)}"]`)?.focus();
}
async function commitTodoNote(input) {
  if (input?.dataset?.future === "1") return commitFutureNote(input);
  if (todoRepainting()) return;
  const context = todoActionContext({ id: input.dataset.id, date: input.dataset.date });
  if (!context) return;
  const { day: day6, item, owner: owner2 } = context;
  if (day6.noteEdit?.id !== item.id || day6.noteEdit.committing) return;
  const text = readNote(input);
  if (text === (item.note || "")) {
    day6.noteEdit = null;
    day6.noteError = "";
    paintTodos();
    return;
  }
  day6.noteEdit.committing = true;
  day6.noteEdit.text = text;
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}/note`, { method: "PATCH", body: { note: text, version: item.version } });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day6, saved);
    if (day6.noteEdit?.id === item.id) day6.noteEdit = null;
    day6.noteError = "";
  } catch (error) {
    if (!todoSessionActive(owner2)) return;
    if (day6.noteEdit?.id === item.id) {
      day6.noteEdit.committing = false;
      day6.noteError = error.status === 404 ? "这项待办可能仍在同步，请稍后重试；备注内容已保留。" : error.message || "保存失败，请重试";
    }
  }
  if (todoSessionActive(owner2)) {
    paintTodos();
    if (day6.noteEdit?.id === item.id) document.querySelector(`[data-todo-note-input][data-id="${CSS.escape(item.id)}"]`)?.focus();
  }
}
async function submitTodoNote({ form, data: data3 }) {
  const context = todoActionContext({ id: form.dataset.id, date: form.dataset.date, owner: form.dataset.owner });
  if (!context) return;
  const button3 = form.querySelector("button[type=submit]"), message = form.querySelector(".form-message");
  if (button3.disabled) return;
  button3.disabled = true;
  message.textContent = "";
  try {
    const saved = await api(`/todos/${encodeURIComponent(context.item.id)}/note`, {
      method: "PATCH",
      body: { note: String(data3.note ?? ""), version: Number(form.dataset.version) }
    });
    if (!todoSessionActive(context.owner)) return;
    mergeTodo(context.day, saved);
    context.day.revision++;
    closeModal();
    paintTodos();
    await loadTodos();
  } catch (error) {
    message.textContent = error.status === 404 ? "这项待办可能仍在同步，请稍后重试；备注内容已保留。" : error.message || "保存失败，请重试";
  } finally {
    button3.disabled = false;
  }
}
function renderTodoUndo(day6) {
  return [...day6.removals.entries()].map(([id2, ticket2]) => {
    const label3 = ticket2.phase === "deleting" ? "删除中…" : ticket2.phase === "restoring" ? "恢复中…" : "已删除";
    return `<div class="todo-undo-entry"><span>${label3}：${e(ticket2.item.text)}</span>
<button class="btn text small" data-action="todo-restore" data-id="${e(id2)}" data-date="${e(day6.date)}"
data-owner="${e(todoOwner())}" ${ticket2.phase === "ready" ? "" : "disabled"}>撤销</button></div>`;
  }).join("");
}
function expireTodoUndo(day6, id2, ticket2, owner2) {
  clearTimeout(ticket2.timer);
  ticket2.timer = setTimeout(() => {
    if (!todoSessionActive(owner2) || day6.removals.get(id2) !== ticket2 || ticket2.phase !== "ready") return;
    day6.removals.delete(id2);
    paintTodos();
  }, 8e3);
  ticket2.timer?.unref?.();
}
async function todoActionFailure(day6, error, owner2) {
  if (!todoSessionActive(owner2) || isRequestAbort(error) || error.staleSession) return;
  day6.error = error.message;
  if ([404, 409].includes(error.status) && day6.date === todoDate()) {
    day6.error = "这项计划已更新，请核对最新内容后再操作。";
    await loadTodos();
  }
}
async function deleteTodo(options4) {
  const context = todoActionContext(options4);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day: day6, item, owner: owner2 } = context, ticket2 = { item, phase: "deleting", timer: null };
  day6.removals.set(item.id, ticket2);
  day6.error = "";
  day6.notice = "";
  day6.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "DELETE", body: { date: day6.date, version: item.version } });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day6, saved);
    ticket2.item = saved;
    ticket2.phase = "ready";
    expireTodoUndo(day6, item.id, ticket2, owner2);
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner2)) return;
    day6.removals.delete(item.id);
    await todoActionFailure(day6, error, owner2);
    if (todoSessionActive(owner2) && item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner2)) {
      day6.revision++;
      paintTodos();
    }
  }
}
async function restoreTodo({ id: id2, date, owner: owner2 = todoOwner() }) {
  if (!state.me || state.page !== "todos" || date !== todoDate() || !todoSessionActive(owner2)) return;
  const day6 = todoDay(date), ticket2 = day6.removals.get(id2);
  if (!ticket2 || ticket2.phase !== "ready") return;
  clearTimeout(ticket2.timer);
  ticket2.phase = "restoring";
  mergeTodo(day6, ticket2.item);
  day6.error = "";
  day6.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(id2)}/restore`, {
      method: "POST",
      body: { date, version: ticket2.item.version }
    });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day6, saved);
    day6.removals.delete(id2);
    setTodoNotice(day6, "已恢复");
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner2)) return;
    if (error.status === 409) day6.removals.delete(id2);
    else {
      ticket2.phase = "ready";
      expireTodoUndo(day6, id2, ticket2, owner2);
    }
    await todoActionFailure(day6, error, owner2);
    if (todoSessionActive(owner2) && ticket2.item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner2)) {
      day6.revision++;
      paintTodos();
    }
  }
}
function todoTemplateRequest(day6, item) {
  let request2 = day6.templateLinks.get(item.id);
  if (!request2 || request2.version !== item.version || request2.template_version !== (item.template_version || 0)) {
    request2 = {
      date: day6.date,
      version: item.version,
      template_id: item.template_id || crypto.randomUUID(),
      template_version: item.template_version || 0
    };
    day6.templateLinks.set(item.id, request2);
  }
  return request2;
}
async function changeTodoTemplate(options4, remove = false) {
  const context = todoActionContext(options4);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day: day6, item, owner: owner2 } = context;
  if (remove !== Boolean(item.template_active) || templateState().pending.has(item.template_id)) return;
  day6.templateWrites.add(item.id);
  day6.error = "";
  day6.notice = "";
  day6.revision++;
  paintTodos();
  try {
    const saved = await api(remove ? `/todo-templates/${encodeURIComponent(item.template_id)}` : `/todos/${encodeURIComponent(item.id)}/template`, {
      method: remove ? "DELETE" : "POST",
      body: remove ? { version: item.template_version } : todoTemplateRequest(day6, item)
    });
    if (!todoSessionActive(owner2)) return;
    if (remove) templateState().items = templateState().items.filter((row) => row.id !== item.template_id);
    else {
      mergeTodo(day6, saved.todo);
      mergeTodoTemplate(saved.template);
    }
    day6.templateLinks.delete(item.id);
    setTodoNotice(day6, remove ? "已取消常用，事项已保留" : "已添加为常用");
    refreshOpenTodoTemplates();
    if (remove && day6.date === todoDate()) await loadTodos();
  } catch (error) {
    if (todoSessionActive(owner2)) {
      await todoActionFailure(day6, error, owner2);
      if (todoSessionActive(owner2) && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day6.templateWrites.delete(item.id);
      day6.revision++;
      paintTodos();
    }
  }
}

// web/pages/todo-preferences.mjs
init_api();
init_dom();
init_requests();
init_state();
init_todos_state();
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
<option value="hide" ${mode === "hide" ? "selected" : ""}>隐藏已完成</option></select>
<p id="todo-preferences-error" class="form-message" role="alert">${e(prefs.error)}</p></div>`;
}
function paintTodoPreferences() {
  const input = $("#todo-completed-mode"), prefs = todoPreferences();
  if (!input) return;
  input.value = todoCompletedMode();
  input.disabled = Boolean(prefs.pending) || !prefs.loaded;
  const error = $("#todo-preferences-error");
  if (error) error.textContent = prefs.error;
}
async function loadTodoPreferences(context) {
  const prefs = todoPreferences(), owner2 = todoOwner();
  try {
    const saved = await api("/todo-preferences", { context });
    if (!todoSessionActive(owner2)) return;
    receiveTodoPreferences(saved.completed_mode, saved.version);
    prefs.error = "";
  } catch (error) {
    if (todoSessionActive(owner2) && !isRequestAbort(error) && !error.staleSession) prefs.error = error.message;
  } finally {
    if (todoSessionActive(owner2)) paintTodoPreferences();
  }
}
async function changeTodoCompletedMode(mode) {
  if (!state.me || !(state.page === "todos" || state.page === "settings" && state.settingsTab === "todo") || !["strike", "hide"].includes(mode)) return;
  const prefs = todoPreferences(), owner2 = todoOwner();
  if (prefs.pending || !prefs.loaded || mode === prefs.mode) {
    paintTodoPreferences();
    return;
  }
  prefs.pending = mode;
  prefs.error = "";
  paintTodos();
  paintTodoPreferences();
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
      paintTodoPreferences();
    }
  }
}

// web/pages/todos.mjs
init_api();
init_runtime();
init_dom();
init_format();
init_requests();
init_state();
init_todos_state();
init_todos_state();
var todoClock = null;
var monthSnapshot = { month: "", owner: "", days: /* @__PURE__ */ new Map(), loading: false, error: "" };
var calendarStatus = "all";
var savingTimes = /* @__PURE__ */ new WeakMap(), savingTimers = /* @__PURE__ */ new WeakMap();
var todoObservers = /* @__PURE__ */ new Set();
var monthDayOwners = /* @__PURE__ */ new WeakMap();
function monthOwner() {
  const offline = getOfflineRuntime();
  return JSON.stringify([todoOwner(), offline?.state.scope || null]);
}
var monthLoader = createTodoMonthLoader({
  read: (date, context) => api(`/todos?date=${encodeURIComponent(date)}`, { context }),
  active: (owner2) => owner2 === monthOwner() && todoSessionActive(todoOwner()),
  async seed(month, owner2, { refresh = false } = {}) {
    const loaded = [];
    if (todosState.owner === todoOwner()) for (const [date, day6] of todosState.days) {
      const stamp3 = monthDayOwners.get(day6);
      if (date.startsWith(month + "-") && day6.loaded && stamp3?.owner === owner2 && (!refresh || todoPending(day6))) {
        loaded.push({ date, items: monthDayItems(day6), readAt: stamp3.at, pending: todoPending(day6) });
      }
    }
    const offline = getOfflineRuntime(), scope = offline?.state.scope;
    if (!scope || offline.state.verifiedScope !== scope) return todoMonthSeed(month, null, loaded);
    let snapshot = null;
    try {
      snapshot = await offline.readTodoMonthSnapshot?.(month);
    } catch {
    }
    if (owner2 !== monthOwner() || !todoSessionActive(todoOwner()) || offline.state.scope !== scope || offline.state.verifiedScope !== scope) return {};
    return todoMonthSeed(month, snapshot, loaded);
  },
  changed(snapshot) {
    if (monthSnapshot !== snapshot || !todosVisible()) return;
    const node2 = $("#todo-calendar");
    if (node2) {
      node2.dataset.month = "";
      paintTodoCalendar(todoDay().date);
    }
  }
});
function observeTodoChanges(callback) {
  todoObservers.add(callback);
  return () => todoObservers.delete(callback);
}
function notifyTodoChanges() {
  for (const callback of todoObservers) callback();
}
function todoCalendarMonth(date) {
  if (todosState.calendarDate !== date || !validTodoDate(`${todosState.calendarMonth}-01`)) {
    todosState.calendarDate = date;
    todosState.calendarMonth = date.slice(0, 7);
  }
  return todosState.calendarMonth;
}
function todoCalendarDay(date, selected) {
  const today2 = date === bjtDate(), active5 = date === selected;
  const items = (monthSnapshot.month === date.slice(0, 7) && monthSnapshot.owner === monthOwner() ? monthSnapshot.days.get(date) || [] : []).filter((item) => !item.deleted_at);
  const shown = items.filter((item) => calendarStatus === "all" || Boolean(item.completed) === (calendarStatus === "done"));
  const content2 = shown.slice(0, 4).map((item) => `<span class="todo-calendar-task${item.completed ? " is-complete" : ""}">${item.completed ? "✓" : "○"} ${e(item.text)}</span>`).join("");
  const more = shown.length > 4 ? `<span class="todo-calendar-more">还有 ${shown.length - 4} 项</span>` : "";
  return `<button class="todo-calendar-day${active5 ? " is-selected" : ""}${today2 ? " is-today" : ""}" type="button"
data-action="todo-calendar-date" data-date="${e(date)}" aria-label="${e(date)}" aria-pressed="${active5}"
${today2 ? 'aria-current="date"' : ""}><span class="todo-calendar-day-head"><strong>${Number(date.slice(-2))}</strong><small>${monthSnapshot.owner === monthOwner() && monthSnapshot.month === date.slice(0, 7) && monthSnapshot.days.has(date) ? shown.length + " 项" : ""}</small></span>${content2}${more}</button>`;
}
function todoCalendar(date) {
  const month = todoCalendarMonth(date), first = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`), last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const blanks = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: last.getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const cells = [...Array(blanks).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const index = Math.max(0, cells.indexOf(date));
  const weekIndex = Math.floor(index / 7);
  const visible4 = todosState.calendarView === "week" ? cells.slice(weekIndex * 7, weekIndex * 7 + 7) : cells;
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7).filter(Boolean));
  const all = [...monthSnapshot.days.values()].flat().filter((item) => !item.deleted_at), done2 = all.filter((item) => item.completed).length;
  const currentSnapshot = monthSnapshot.month === month && monthSnapshot.owner === monthOwner();
  const activeDays = [...monthSnapshot.days.values()].filter((items) => items.some((item) => !item.deleted_at)).length;
  const stats = !currentSnapshot || monthSnapshot.loading ? `<p class="todo-calendar-loading" role="status">正在读取本月待办…</p>` : monthSnapshot.error ? `<p role="alert">部分日期未加载：${e(monthSnapshot.error)} <button class="btn text small" type="button" data-todo-calendar-retry>重试缺失日期</button></p>` : `<div class="todo-calendar-stats">${[["总任务", all.length], ["已完成", done2], ["未完成", all.length - done2], ["活跃天数", activeDays], ["完成率", `${all.length ? Math.round(done2 / all.length * 100) : 0}%`]].map(([label3, value]) => `<span><small>${label3}</small><strong>${value}</strong></span>`).join("")}</div>`;
  return `<aside class="todo-calendar-sidebar"><label for="todo-calendar-month-input">月份</label><input id="todo-calendar-month-input" type="month" class="input" data-todo-calendar-month value="${e(month)}">
<label for="todo-calendar-week">周日期</label><select id="todo-calendar-week" class="input" data-todo-calendar-week>${weeks.map((week, i) => `<option value="${week[0]}" ${i === weekIndex ? "selected" : ""}>${week[0].slice(5)} — ${week.at(-1).slice(5)}</option>`).join("")}</select>
<label for="todo-calendar-status">任务状态</label><select id="todo-calendar-status" class="input" data-todo-calendar-status><option value="all" ${calendarStatus === "all" ? "selected" : ""}>全部任务</option><option value="open" ${calendarStatus === "open" ? "selected" : ""}>未完成</option><option value="done" ${calendarStatus === "done" ? "selected" : ""}>已完成</option></select></aside>
<div class="todo-calendar-main"><div class="todo-calendar-head"><div class="todo-calendar-navigation"><button class="icon-button" type="button" data-action="todo-calendar-prev" aria-label="上一${todosState.calendarView === "week" ? "周" : "月"}" ${month === "0001-01" ? "disabled" : ""}>‹</button><span id="todo-calendar-month" aria-live="polite">${Number(month.slice(0, 4))}年${Number(month.slice(5))}月</span><button class="icon-button" type="button" data-action="todo-calendar-next" aria-label="下一${todosState.calendarView === "week" ? "周" : "月"}" ${month === "9999-12" ? "disabled" : ""}>›</button><button class="btn" type="button" data-action="todo-today">今天</button></div><div class="todo-calendar-views"><button type="button" class="btn" data-todo-calendar-view="week" aria-pressed="${todosState.calendarView === "week"}">周</button><button type="button" class="btn" data-todo-calendar-view="month" aria-pressed="${todosState.calendarView !== "week"}">月</button></div></div>${stats}
<div class="todo-calendar-scroll"><div class="todo-calendar-grid" role="group" aria-labelledby="todo-calendar-month">
${["一", "二", "三", "四", "五", "六", "日"].map((day6) => `<span class="todo-calendar-weekday" aria-hidden="true">周${day6}</span>`).join("")}
${visible4.map((day6) => day6 ? todoCalendarDay(day6, date) : '<span class="todo-calendar-blank" aria-hidden="true"></span>').join("")}</div></div></div>`;
}
function moveTodoMonth(offset) {
  if (!todosVisible()) return;
  if (state.todoPanel === "templates" && $("#todo-templates")?.dataset.loaded !== "true") void loadTodoTemplates();
  const day6 = todoDay(), month = todoCalendarMonth(day6.date);
  if (todosState.calendarView === "week") {
    const anchor = day6.date.startsWith(month) ? day6.date : `${month}-01`;
    const weekDate = /* @__PURE__ */ new Date(`${anchor}T00:00:00Z`);
    weekDate.setUTCDate(weekDate.getUTCDate() + offset * 7);
    const next = weekDate.toISOString().slice(0, 10);
    if (validTodoDate(next)) selectTodoDate(next);
    return;
  }
  const date = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const nextMonth = date.toISOString().slice(0, 7);
  if (!validTodoDate(`${nextMonth}-01`)) return;
  todosState.calendarMonth = nextMonth;
  const calendar = $("#todo-calendar"), action = document.activeElement?.dataset?.action;
  if (!calendar) return;
  paintTodoCalendar(day6.date);
  void loadTodoMonth2(nextMonth);
  if (["todo-calendar-prev", "todo-calendar-next"].includes(action)) $(`[data-action="${action}"]`, calendar)?.focus();
}
function paintTodoCalendar(date) {
  const calendar = $("#todo-calendar"), month = todoCalendarMonth(date), today2 = bjtDate();
  if (!calendar) return;
  if (!calendar.dataset.viewBound) {
    calendar.addEventListener("click", (event) => {
      const retry = event.target.closest("[data-todo-calendar-retry]");
      if (retry) {
        void loadTodoMonth2(todoCalendarMonth(todoDay().date));
        return;
      }
      const button3 = event.target.closest("[data-todo-calendar-view]");
      if (!button3) return;
      todosState.calendarView = button3.dataset.todoCalendarView;
      calendar.dataset.month = "";
      paintTodoCalendar(todoDay().date);
    });
    calendar.addEventListener("change", (event) => {
      if (event.target.matches("[data-todo-calendar-status]")) {
        calendarStatus = event.target.value;
        calendar.dataset.month = "";
        paintTodoCalendar(todoDay().date);
        return;
      }
      if (event.target.matches("[data-todo-calendar-week]")) {
        selectTodoDate(event.target.value);
        return;
      }
      if (!event.target.matches("[data-todo-calendar-month]")) return;
      const month2 = event.target.value;
      if (!validTodoDate(`${month2}-01`)) return;
      todosState.calendarMonth = month2;
      calendar.dataset.month = "";
      paintTodoCalendar(todoDay().date);
      void loadTodoMonth2(month2);
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
async function loadTodoMonth2(month) {
  const snapshot = monthLoader.open(month, monthOwner());
  monthSnapshot = snapshot;
  if (todosVisible()) {
    const node2 = $("#todo-calendar");
    if (node2) {
      node2.dataset.month = "";
      paintTodoCalendar(todoDay().date);
    }
  }
  await snapshot.promise;
}
function todoDateControls(date) {
  return `<div class="daily-todo-dates"><button class="btn small" data-action="todo-prev" aria-label="前一天">‹</button>
<label for="todo-date" class="sr-only">选择计划日期</label><input class="input" id="todo-date" type="date" value="${e(date)}">
<button class="btn small" data-action="todo-next" aria-label="后一天">›</button>
<button class="btn small" data-action="todo-today">今天</button></div>`;
}
function todoNoteField2(item, day6, pending) {
  return todoNoteField(item, { date: day6.date, pending, editing: day6.noteEdit, error: day6.noteError });
}
function todoCountButton(item, day6, pending) {
  const count3 = todoCount(item.note);
  if (!count3 || day6.noteEdit?.id === item.id) return "";
  const full = count3.done >= count3.target;
  return `<button class="todo-count-add btn small" type="button" data-action="todo-count-add" data-id="${e(item.id)}" data-date="${e(day6.date)}"
aria-label="${full ? `已记满 ${count3.target} 次` : `记一次，目前 ${count3.done}/${count3.target} 次`}" ${pending || full ? "disabled" : ""}>${full ? "已满" : "+1"}</button>`;
}
function todoRow(item, day6) {
  const pending = todoBusy(day6, item.id);
  const completed = day6.updates.has(item.id) ? day6.updates.get(item.id) : item.completed;
  const removal = day6.removals.get(item.id), deleted2 = removal ? removal.phase !== "restoring" : Boolean(item.deleted_at);
  if (deleted2 || completed && todoCompletedMode() === "hide" && state.todoPanel !== "history") return "";
  const check = `todo-check-${e(item.id)}`;
  return `<li class="daily-todo-row${completed ? " is-complete" : ""}" data-id="${e(item.id)}" data-date="${e(day6.date)}">
<label class="daily-todo-check" for="${check}"><input id="${check}" type="checkbox" data-todo-id="${e(item.id)}" data-date="${e(day6.date)}"
${completed ? "checked" : ""} aria-disabled="${pending}"></label>
<div class="daily-todo-main"><label class="daily-todo-text" for="${check}">${e(item.text)}</label>
${todoNoteField2(item, day6, pending)}</div>${todoCountButton(item, day6, pending)}
<button class="todo-row-menu icon-button" type="button" data-action="todo-menu" data-id="${e(item.id)}" data-date="${e(day6.date)}"
aria-label="事项操作" aria-haspopup="menu" aria-expanded="false" ${pending ? "disabled" : ""}>⋯</button></li>`;
}
function todoForm(day6) {
  const label3 = day6.date === bjtDate() ? "今天想完成什么？" : "这一天的计划";
  return `<form id="todo-form" class="daily-todo-form" data-date="${e(day6.date)}" aria-label="添加 ${e(day6.date)} 的计划">
<label for="todo-text" class="sr-only">${label3}</label><input id="todo-text" class="input" name="text" maxlength="500" required
autocomplete="off" placeholder="${label3}" value="${e(day6.draft)}" >
<button class="btn primary" type="submit" ${day6.adding ? "disabled" : ""}>添加</button></form>`;
}
function todoCaption(day6) {
  const today2 = day6.date === bjtDate();
  return `<time datetime="${e(day6.date)}" title="北京时间">${today2 ? "今天 · " : ""}${e(day6.date)}</time>`;
}
function floatingTodoSupported() {
  return typeof window !== "undefined" && typeof window.documentPictureInPicture?.requestWindow === "function";
}
function todoHeading(day6) {
  const selected = state.todoPanel || "today";
  return `<span id="todo-caption" hidden>${todoCaption(day6)}</span><nav class="todo-page-tabs" aria-label="待办页面">
${[["today", "今日"], ["future", "未来待办"], ["history", "日历"], ["templates", "常用"]].map(([panel2, label3]) => `<button class="btn todo-page-tab" type="button" data-action="todo-panel" data-panel="${panel2 === "today" ? "" : panel2}"
  aria-current="${selected === panel2 ? "page" : "false"}" ${panel2 === "templates" ? 'aria-label="管理常用"' : ""}>${label3}</button>`).join("")}</nav>`;
}
function renderTodoHistory(day6) {
  return `<section id="todo-history" class="todo-view" aria-label="待办日历" ${state.todoPanel === "history" ? "" : "hidden"}>
<div id="todo-calendar" class="daily-todo-calendar" data-month="${todoCalendarMonth(day6.date)}" data-today="${bjtDate()}">
${todoCalendar(day6.date)}</div></section>`;
}
function paintTodoPanels(root3) {
  const panel2 = state.todoPanel || "";
  for (const [id2, value] of [["todo-main", ""], ["todo-history", "history"], ["todo-templates", "templates"], ["todo-future", "future"]]) {
    const node2 = $("#" + id2, root3);
    if (node2) node2.hidden = id2 === "todo-main" ? ["templates", "future"].includes(panel2) : panel2 !== value;
  }
  root3?.querySelectorAll('[data-action="todo-panel"]').forEach((button3) => {
    button3.setAttribute("aria-current", button3.dataset.panel === panel2 ? "page" : "false");
  });
}
async function setTodoPanel(panel2) {
  if (!todosVisible()) return;
  state.todoPanel = ["history", "templates", "future"].includes(panel2) ? panel2 : "";
  if (state.todoPanel !== "history") monthLoader.cancel();
  if (!state.todoPanel) state.todoDate = "";
  updateRoute(true);
  paintTodos();
  if (state.todoPanel === "future") await loadUnscheduledTodos();
  else {
    await loadTodos();
    if (state.todoPanel === "history") void loadTodoMonth2(todoCalendarMonth(todoDay().date));
  }
  const selector = state.todoPanel === "future" ? "#todo-future-text" : state.todoPanel ? state.todoPanel === "history" ? "#todo-calendar-month-input" : "#todo-template-text" : "#todo-text";
  $(selector)?.focus();
}
function todoPending(day6) {
  return Boolean(day6.adding || day6.updates.size || day6.templateWrites.size || [...day6.removals.values()].some((ticket2) => ticket2.phase !== "ready") || todoPreferences().pending);
}
function todoStatus(day6) {
  if (todoPending(day6) || day6.error || todoPreferences().error) return "";
  return day6.loading && !day6.loaded ? "" : day6.notice;
}
function paintTodoSaving(root3, day6) {
  const busy2 = todoPending(day6);
  root3.setAttribute("aria-busy", String(busy2));
  if (!busy2) {
    clearTimeout(savingTimers.get(day6));
    savingTimers.delete(day6);
    savingTimes.delete(day6);
    return;
  }
  if (!savingTimes.has(day6)) {
    savingTimes.set(day6, Date.now());
    savingTimers.set(day6, setTimeout(() => {
      if (todosVisible() && todoDay() === day6) paintTodos();
    }, 900));
  } else if (Date.now() - savingTimes.get(day6) >= 900) $("#todo-status", root3).textContent = "正在同步…";
}
function pendingTodo(day6) {
  return day6.adding && day6.submitting ? `<li class="todo-pending-row" aria-label="待添加">
<span class="todo-pending-marker" aria-hidden="true"></span><span>${e(day6.submitting.text)}</span></li>` : "";
}
function todoFeedback(day6) {
  const error = [day6.error, todoPreferences().error].filter(Boolean).join(" ");
  return error ? `${e(error)} ${day6.failedCreate ? `<span>「${e(day6.failedCreate.text)}」</span>
<button class="btn text small" data-action="todo-retry-add">重试添加</button>` : ""} <button class="btn text small" data-action="todo-reload">重新读取</button>` : "";
}
function todoHistoryEmpty(day6) {
  return state.todoPanel === "history" && day6.loaded && !day6.items.some((item) => !item.deleted_at) ? "这一天还没有待办。" : "";
}
function renderTodos() {
  const day6 = todoDay();
  return `<section id="daily-todos" class="daily-todos daily-todos-primary" data-date="${e(day6.date)}" aria-label="每日计划">
<div id="todo-heading" class="daily-todo-toolbar">${todoHeading(day6)}</div>
${renderTodoHistory(day6)}<div id="todo-main" ${["templates", "future"].includes(state.todoPanel) ? "hidden" : ""}><div id="todo-form-top"></div>${state.todoPanel === "history" ? "" : todoForm(day6)}${renderInlineTodoTemplates()}
<div id="todo-feedback" class="form-message" role="alert">${todoFeedback(day6)}</div>
<p id="todo-status" class="daily-todo-status" role="status">${todoStatus(day6)}</p>
<div id="todo-undo" class="todo-undo" role="status">${renderTodoUndo(day6)}</div>
<p id="todo-history-empty" class="daily-todo-status">${todoHistoryEmpty(day6)}</p>
<ul id="todo-items" class="daily-todo-items">${day6.items.map((item) => todoRow(item, day6)).join("")}${pendingTodo(day6)}</ul><div id="todo-form-bottom"></div>${state.todoPanel === "history" ? todoForm(day6) : ""}</div>
${renderTodoTemplates()}${renderUnscheduledTodos()}</section>`;
}
function todosVisible() {
  return Boolean(state.me) && state.page === "todos";
}
function monthDayItems(day6) {
  return day6.items.filter((item) => {
    const removal = day6.removals.get(item.id);
    return !removal || removal.phase === "restoring";
  }).map((item) => day6.updates.has(item.id) ? { ...item, completed: day6.updates.get(item.id) } : item);
}
var repaintingTodos = false;
function todoRepainting() {
  return repaintingTodos;
}
function paintTodos() {
  repaintingTodos = true;
  try {
    paintTodoDom();
  } finally {
    repaintingTodos = false;
  }
}
function paintTodoDom() {
  notifyTodoChanges();
  const root3 = $("#daily-todos");
  if (!root3 || !todosVisible()) return;
  const day6 = todoDay(), checkbox = document.activeElement?.dataset?.todoId;
  const stamp3 = monthDayOwners.get(day6);
  if (day6.loaded && stamp3?.owner === monthOwner()) {
    if (stamp3.revision !== day6.revision) {
      stamp3.at = Date.now();
      stamp3.revision = day6.revision;
    }
    if (monthLoader.update(monthOwner(), day6.date, monthDayItems(day6))) {
      const calendar = $("#todo-calendar");
      if (calendar) calendar.dataset.month = "";
    }
  }
  const menu = document.activeElement?.dataset?.action === "todo-menu" ? document.activeElement.dataset.id : null;
  if (root3.dataset.date !== day6.date) {
    root3.outerHTML = renderTodos();
    paintTodoTemplates();
    return;
  }
  const form = $("#todo-form", root3), formSlot = $(state.todoPanel === "history" ? "#todo-form-bottom" : "#todo-form-top", root3);
  if (form && formSlot && formSlot.nextElementSibling !== form) formSlot.after(form);
  const liveNote = document.activeElement?.matches?.("[data-todo-note-input]:not([data-future])") ? document.activeElement : null;
  const keepNote = liveNote?.isConnected && day6.noteEdit?.id === liveNote.dataset.id;
  const parts2 = {
    "todo-caption": todoCaption(day6),
    "todo-status": todoStatus(day6),
    "todo-undo": renderTodoUndo(day6),
    "todo-items": day6.items.map((item) => todoRow(item, day6)).join("") + pendingTodo(day6),
    "todo-feedback": todoFeedback(day6),
    "todo-history-empty": todoHistoryEmpty(day6)
  };
  for (const [id2, html] of Object.entries(parts2)) {
    if (id2 === "todo-items" && keepNote) continue;
    const node2 = $("#" + id2, root3);
    if (node2 && node2.innerHTML !== html) node2.innerHTML = html;
  }
  paintTodoCalendar(day6.date);
  const input = $("#todo-text", root3), button3 = $("#todo-form button[type=submit]", root3);
  const prompt = day6.date === bjtDate() ? "今天想完成什么？" : "这一天的计划", label3 = $('label[for="todo-text"]', root3);
  if (input && input.value !== day6.draft) input.value = day6.draft;
  if (input) {
    input.readOnly = false;
    input.placeholder = prompt;
  }
  if (label3) label3.textContent = prompt;
  if (button3) {
    button3.disabled = day6.adding;
    button3.textContent = "添加";
    button3.setAttribute("aria-busy", String(day6.adding));
  }
  paintTodoSaving(root3, day6);
  paintTodoPanels(root3);
  paintUnscheduledTodos();
  const focus = checkbox ? `[data-todo-id="${CSS.escape(checkbox)}"]` : menu ? `[data-action="todo-menu"][data-id="${CSS.escape(menu)}"]` : "";
  if (focus) ($(focus, root3) || $("[data-todo-id]", root3) || $("#todo-text", root3))?.focus();
  paintTodoTemplates();
}
function todoReadActive(owner2, version2, date, day6, sequence5) {
  return todoSessionActive(owner2) && version2 === runtime.renderVersion && todoDate() === date && day6.sequence === sequence5 && todosVisible();
}
async function loadTodos(context) {
  if (!todosVisible()) return;
  if (context?.controller?.signal) {
    context.controller.signal.addEventListener("abort", () => monthLoader.cancel(), { once: true });
  }
  if (state.todoPanel === "future") {
    await loadUnscheduledTodos();
    return;
  }
  void loadTodoTemplates({ ensure: true });
  const day6 = todoDay(), date = day6.date, owner2 = todoOwner(), priorScope = getOfflineRuntime()?.state.scope || null, version2 = runtime.renderVersion;
  const sequence5 = ++day6.sequence, revision2 = day6.revision;
  day6.loading = true;
  day6.error = "";
  paintTodos();
  try {
    const data3 = await api(`/todos?date=${encodeURIComponent(date)}`, { context });
    if (!todoReadActive(owner2, version2, date, day6, sequence5) || priorScope && priorScope !== getOfflineRuntime()?.state.scope) return;
    if (day6.revision !== revision2) return loadTodos(context);
    receiveTodoPreferences(data3.completed_mode, data3.preferences_version);
    day6.items = data3.items;
    day6.loaded = true;
    monthDayOwners.set(day6, { owner: monthOwner(), at: Date.now(), revision: day6.revision });
    if (monthSnapshot.owner === monthOwner() && monthSnapshot.month === date.slice(0, 7) && !monthSnapshot.loading) {
      monthSnapshot.days.set(date, data3.items);
      const calendar = $("#todo-calendar");
      if (calendar) calendar.dataset.month = "";
    }
    if (state.todoPanel === "templates") paintTodoTemplates();
  } catch (error) {
    if (todoReadActive(owner2, version2, date, day6, sequence5) && !isRequestAbort(error) && !error.staleSession) day6.error = error.message;
  } finally {
    if (todoSessionActive(owner2) && day6.sequence === sequence5) {
      const visible4 = todoReadActive(owner2, version2, date, day6, sequence5);
      day6.loading = false;
      paintTodos();
      if (visible4 && state.todoPanel === "history") void loadTodoMonth2(todoCalendarMonth(date));
      if (!visible4 && todoObservers.size && date === bjtDate()) void loadFloatingToday();
    }
  }
}
function inputTodo(target) {
  const date = target.form?.dataset.date;
  if (target.id === "todo-text" && validTodoDate(date)) {
    todoDay(date).draft = target.value;
    notifyTodoChanges();
  }
}
function showTodoFailure(day6, error) {
  if (!isRequestAbort(error) && !error.staleSession) day6.error = error.message;
}
function setTodoNotice(day6, text) {
  const owner2 = todoOwner(), version2 = ++day6.noticeVersion;
  day6.notice = text;
  const timer2 = setTimeout(() => {
    if (!todoSessionActive(owner2) || day6.noticeVersion !== version2) return;
    day6.notice = "";
    if (day6.date === todoDate()) paintTodos();
  }, 2500);
  timer2?.unref?.();
}
async function saveTodo(day6, request2, templateId = "") {
  const owner2 = todoOwner(), submittedDraft = day6.draft;
  day6.adding = true;
  day6.submitting = request2;
  day6.failedCreate = null;
  day6.error = "";
  day6.notice = "";
  day6.revision++;
  paintTodos();
  try {
    const item = await api("/todos", { method: "POST", body: request2 });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day6, item);
    if (monthSnapshot.owner === monthOwner() && monthSnapshot.month === day6.date.slice(0, 7)) {
      monthSnapshot.days.set(day6.date, [...day6.items]);
      const calendar = $("#todo-calendar");
      if (calendar) calendar.dataset.month = "";
    }
    if (templateId) day6.templateCreates.delete(templateId);
    else {
      if (day6.draft === submittedDraft && submittedDraft.trim() === request2.text) day6.draft = "";
      day6.create = null;
    }
    setTodoNotice(day6, "已添加");
  } catch (error) {
    if (todoSessionActive(owner2)) {
      day6.failedCreate = request2;
      showTodoFailure(day6, error);
      if (error.status === 410) {
        if (templateId) day6.templateCreates.delete(templateId);
        else day6.create = null;
        day6.error = "原事项已被删除，输入已保留，可再次添加。";
      }
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day6.adding = false;
      day6.submitting = null;
      day6.revision++;
      paintTodos();
    }
  }
}
async function retryTodoCreate() {
  const day6 = todoDay();
  if (todosVisible() && day6.failedCreate && !day6.adding)
    await saveTodo(day6, day6.failedCreate, day6.failedCreate.template_id || "");
}
async function submitTodo({ form, data: data3 }) {
  if (!todosVisible() || !validTodoDate(form.dataset.date)) return;
  const day6 = todoDay(form.dataset.date), text = String(data3.text || "").trim();
  if (day6.adding) return;
  day6.draft = String(data3.text || "");
  if (day6.date !== todoDate()) {
    paintTodos();
    return;
  }
  if (!text || text.length > 500) {
    day6.error = "请填写 1–500 字的计划。";
    paintTodos();
    return;
  }
  if (!day6.create || day6.create.text !== text) day6.create = { id: crypto.randomUUID(), date: day6.date, text };
  await saveTodo(day6, day6.create);
}
async function submitTodoTemplate(template) {
  if (!todosVisible()) return;
  const day6 = todoDay();
  if (day6.adding || todoTemplateAdded(day6, template.id)) return;
  let request2 = day6.templateCreates.get(template.id);
  if (!request2 || request2.text !== template.text) {
    request2 = { id: crypto.randomUUID(), date: day6.date, text: template.text, template_id: template.id };
    day6.templateCreates.set(template.id, request2);
  }
  await saveTodo(day6, request2, template.id);
}
async function toggleTodo(target, { floating = false } = {}) {
  if (!(floating ? Boolean(state.me) : todosVisible())) return;
  const day6 = todoDay(target.dataset.date), owner2 = todoOwner();
  const item = day6.items.find((row) => row.id === target.dataset.todoId);
  if (!item || item.deleted_at || day6.date !== (floating ? bjtDate() : todoDate())) return;
  if (todoBusy(day6, item.id)) {
    target.checked = day6.updates.has(item.id) ? day6.updates.get(item.id) : item.completed;
    return;
  }
  const completed = target.checked;
  day6.updates.set(item.id, completed);
  day6.error = "";
  day6.notice = "";
  day6.revision++;
  paintTodos();
  try {
    const updated = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "PATCH", body: { completed, version: item.version } });
    if (todoSessionActive(owner2)) {
      mergeTodo(day6, updated);
      if (updated.template_id) refreshOpenTodoTemplates();
    }
  } catch (error) {
    if (!todoSessionActive(owner2)) return;
    day6.updates.set(item.id, item.completed);
    showTodoFailure(day6, error);
    if (error.status === 409 && (floating || day6.date === todoDate())) {
      day6.error = "这项计划已更新，已重新读取，请核对后再操作。";
      if (floating) {
        await loadFloatingToday();
        if (todoSessionActive(owner2)) day6.error = "这项计划已更新，已重新读取，请核对后再操作。";
      } else await loadTodos();
      if (todoSessionActive(owner2) && item.template_id) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day6.updates.delete(item.id);
      day6.revision++;
      paintTodos();
    }
  }
}
async function loadFloatingToday() {
  if (!state.me) return;
  const date = bjtDate(), day6 = todoDay(date), owner2 = todoOwner();
  const sequence5 = ++day6.sequence, revision2 = day6.revision;
  const current3 = () => todoSessionActive(owner2) && date === bjtDate() && day6.sequence === sequence5;
  day6.loading = true;
  day6.error = "";
  paintTodos();
  try {
    const data3 = await api(`/todos?date=${encodeURIComponent(date)}`);
    if (!current3()) return;
    if (day6.revision !== revision2) {
      void loadFloatingToday();
      return;
    }
    receiveTodoPreferences(data3.completed_mode, data3.preferences_version);
    day6.items = data3.items;
    day6.loaded = true;
  } catch (error) {
    if (current3() && !isRequestAbort(error) && !error.staleSession) day6.error = error.message;
  } finally {
    if (current3()) {
      day6.loading = false;
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
  onOfflineRuntime((offline) => {
    let previousReady;
    offline.subscribe(() => {
      const ready = Boolean(offline.state.scope && offline.state.verifiedScope === offline.state.scope);
      const action = todoMonthScopeTransition(monthSnapshot.owner, monthOwner(), previousReady, ready);
      previousReady = ready;
      if (!todosVisible() || state.todoPanel !== "history" || action === "none") return;
      monthLoader.cancel();
      const month = todoCalendarMonth(todoDay().date);
      if (action.startsWith("replace")) {
        monthSnapshot = { month, owner: monthOwner(), days: /* @__PURE__ */ new Map(), loading: false, error: "" };
      } else if (action === "pause") {
        monthSnapshot.loading = false;
        monthSnapshot.error = "身份范围暂未核实，请稍后重试。";
      }
      const node2 = $("#todo-calendar");
      if (node2) {
        node2.dataset.month = "";
        paintTodoCalendar(todoDay().date);
      }
      if (ready) void loadTodoMonth2(month);
    });
  });
  window.addEventListener("haoduoyu-todos-reset", () => monthLoader.cancel());
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
    else if (view.collapseRequested && (noteEditorCanCollapse(item) || view.explicit && item && !item.pending) && !composing && (!focused || view.explicit)) {
      activate(category, date, "");
    }
    return view;
  }
  const clear = () => views.clear();
  return { page, activate, requestCollapse, sync, clear };
}

// web/core/note-entries-state.mjs
init_daily_notes_state();
init_document();
var uuidPattern6 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var blocked = (item) => ["conflict", "unknown"].includes(item.phase);
var timestamp4 = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
var noteValue = (value) => isLocalDocument(value) ? documentValue(value) : value;
var persistedVersion = (item) => item.localBacked ? item.localVersion : item.version;
var savedText = (item) => item.localBacked ? item.durableText : item.serverText;
var savedPhase = (item) => item.localBacked ? item.localQueued ? "queued" : "cached" : item.version ? "saved" : "empty";
var labelsOf = (value) => Array.isArray(value?.labels) ? value.labels : value?.label ? [value.label] : [];
var equalLabels = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
var validLabels = (labels4) => Array.isArray(labels4) && labels4.every(validNoteLabel) && new Set(labels4).size === labels4.length;
var validLegacyLabels = (labels4, category) => validLabels(labels4) && (category === "life" || labels4.length === 0) && labels4.every(validCustomNoteLabel);
var localFailure = (error) => error.localNotSaved === true || /^OFFLINE_(?:STORAGE|CACHE|INVALID|SCOPE)/.test(error.code || "");
function validNoteLabel(value) {
  return typeof value === "string" && value.isWellFormed() && value === value.trim().normalize("NFC") && [...value].length >= 1 && [...value].length <= 32 && !/[\u0000-\u001f\u007f]/.test(value);
}
function validCustomNoteLabel(value) {
  return typeof value === "string" && value.isWellFormed() && value === value.trim().normalize("NFC") && [...value].length >= 1 && [...value].length <= 32 && !/[\u0000-\u001f\u007f]/.test(value) && !["生活", "工作"].includes(value);
}
function checkedLocalDocument(value, category, date, id2) {
  const { local, server } = documentState(value);
  if (!local || !uuidPattern6.test(local.id) || id2 && local.id !== id2 || local.category !== category || local.date !== date || typeof local.text !== "string" || dailyNotesBytes(local.text) > DAILY_NOTES_MAX_BYTES || !Number.isSafeInteger(local.version) || local.version < 1 || typeof local.deleted !== "boolean" || typeof local.can_edit !== "boolean" || local.label != null && (category !== "life" || !validCustomNoteLabel(local.label))) throw new Error("本机记录读取不完整，草稿已保留。");
  if (server) checkedEntry(server, category, date, local.id);
  return value;
}
function checkedEntry(value, category, date, id2) {
  if (isLocalDocument(value)) return checkedLocalDocument(value, category, date, id2);
  if (!value || !uuidPattern6.test(value.id) || id2 && value.id !== id2 || value.category !== category || value.date !== date || typeof value.text !== "string" || dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES || !Number.isSafeInteger(value.version) || value.version < 1 || typeof value.deleted !== "boolean" || typeof value.can_edit !== "boolean" || !timestamp4(value.created_at) || !timestamp4(value.updated_at) || typeof value.content_hash !== "string" || !value.content_hash || [2, 3].includes(value.labels_version) && !Array.isArray(value.labels) || value.labels !== void 0 && !(value.labels_version === 3 ? validLabels(value.labels) : validLegacyLabels(value.labels, category)) || value.label != null && (category !== "life" || !validCustomNoteLabel(value.label))) {
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
  loadVerified,
  onChange = () => {
  },
  onSaved = () => {
  },
  discardUnsent = async () => {
  },
  prepareDelete = async () => null,
  finishDelete = async () => {
  },
  uuid: uuid5 = () => crypto.randomUUID(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = 400,
  manualSave = false,
  multiLabels = false
}) {
  if (!["life", "work"].includes(category)) throw new Error("请选择有效分类。");
  const pages = /* @__PURE__ */ new Map(), entries = /* @__PURE__ */ new Map();
  const context = {
    category,
    pages,
    entries,
    multiLabels,
    disposed: false,
    options: { load, loadEntry, loadOperation, loadVerified, put, remove, restore, onSaved, discardUnsent, prepareDelete, finishDelete, uuid: uuid5 }
  };
  const emit2 = () => {
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
  const entry = (id2) => entries.get(id2);
  const stopTimer = (item) => {
    if (item.timer !== null) clearTimer(item.timer);
    item.timer = null;
  };
  function makeEntry(id2, date, canEdit) {
    return {
      id: id2,
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
      labels: [],
      serverLabels: [],
      labelKnown: false,
      labelComplete: false,
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
    item.labelComplete = [2, 3].includes(value.labels_version) && Array.isArray(value.labels);
    item.serverLabels = labelsOf(value);
    if (!preserve) item.labels = [...item.serverLabels];
    item.label = item.labels[0] || "";
    item.labelKnown = category === "work" || [2, 3].includes(value.labels_version) && Array.isArray(value.labels) || value.labels_version === 1 && Object.hasOwn(value, "label");
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
    item.dirty = item.draft !== item.serverText || !equalLabels(item.labels, item.serverLabels);
    item.loaded = true;
  }
  function schedule(item) {
    stopTimer(item);
    if (!manualSave && !item.recoveredBaseline && !context.disposed && !context.autosavePaused && item.canEdit && item.dirty && !item.pending && !item.loading && !item.composing && !blocked(item) && !["error", "oversize"].includes(item.phase) && (persistedVersion(item) > 0 || item.draft.trim())) {
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
  Object.assign(context, { page, entry, emit: emit2, stopTimer, adopt, schedule, merge, makeEntry, dispose });
  return context;
}
function createEntryLocalActions(context) {
  const { adopt, stopTimer } = context;
  function adoptLocal(item, value, preserve = false) {
    const { local, server, operation: operation2, conflict } = documentState(value), draft = item.draft;
    if (server && server.version >= item.version) adopt(item, server, true);
    item.localVersion = local.version;
    item.durableText = local.deleted ? "" : local.text;
    item.labelComplete = false;
    item.labels = labelsOf(local);
    item.serverLabels = [...item.labels];
    item.label = item.labels[0] || "";
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
  const { category, page, entry, entries, emit: emit2, adopt, merge, schedule, makeEntry } = context;
  const { load, loadEntry } = context.options;
  async function read2(date, options4 = {}) {
    const current3 = page(date), sequence5 = ++current3.sequence;
    const epochs = new Map(current3.ids.map((id2) => [id2, entry(id2)?.writeEpoch]));
    current3.loading = true;
    current3.error = "";
    emit2();
    try {
      const value = checkedCollection(await load(date, options4), category, date);
      if (context.disposed || sequence5 !== current3.sequence) return;
      current3.canEdit = value.can_edit;
      current3.labelsComplete = [2, 3].includes(value.labels_version);
      const found = /* @__PURE__ */ new Set();
      for (const raw of value.entries) {
        const visible4 = noteValue(raw);
        found.add(visible4.id);
        let item = entry(visible4.id);
        if (!item) {
          item = makeEntry(visible4.id, date, visible4.can_edit);
          entries.set(visible4.id, item);
          adopt(item, raw);
          if (!isLocalDocument(raw)) item.phase = "saved";
        } else if (!item.pending && item.writeEpoch === epochs.get(item.id)) merge(item, raw);
      }
      const retained = current3.ids.filter((id2) => {
        const item = entry(id2);
        return found.has(id2) || item.version === 0 || item.dirty || item.pending || item.deleted || item.localBacked || blocked(item) || item.writeEpoch !== epochs.get(id2);
      });
      current3.ids = [.../* @__PURE__ */ new Set([...retained, ...value.entries.map((raw) => noteValue(raw).id)])];
      current3.loaded = true;
      await Promise.all(current3.ids.filter((id2) => !found.has(id2) && persistedVersion(entry(id2)) > 0 && (entry(id2).dirty || entry(id2).localBacked) && !entry(id2).pending).map((id2) => readOne(id2, options4)));
    } catch (error) {
      if (!context.disposed && sequence5 === current3.sequence) current3.error = error.message;
    } finally {
      if (!context.disposed && sequence5 === current3.sequence) {
        current3.loading = false;
        emit2();
        for (const id2 of current3.ids) schedule(entry(id2));
      }
    }
  }
  async function readOne(id2, options4 = {}) {
    const item = entry(id2);
    if (!item || context.disposed) return;
    const sequence5 = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true;
    emit2();
    try {
      const value = checkedEntry(await loadEntry(id2, options4), category, item.date, id2);
      if (!context.disposed && sequence5 === item.sequence && !item.pending && epoch === item.writeEpoch) merge(item, value);
    } catch (error) {
      if (!context.disposed && sequence5 === item.sequence) {
        item.error = error.message;
        if (!blocked(item)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence5 === item.sequence) {
        item.loading = false;
        emit2();
        schedule(item);
      }
    }
  }
  return { read: read2, readOne };
}
function createEntryEditingActions(context) {
  const { page, entry, entries, emit: emit2, stopTimer, schedule, makeEntry } = context;
  const { uuid: uuid5 } = context.options;
  function start(date, { label: label3 = "", labels: labels4 = label3 ? [label3] : [] } = {}) {
    const current3 = page(date);
    if (!validLabels(labels4, context.category)) throw new Error("标签无效。");
    if (context.disposed || !current3.loaded || !current3.canEdit || date !== dailyNotesToday()) return;
    const existing = entry(current3.composerId);
    if (existing && persistedVersion(existing) === 0 && !existing.deleted && existing.label === label3) return existing;
    const id2 = uuid5();
    if (!uuidPattern6.test(id2) || entries.has(id2)) throw new Error("暂时无法新建记录，请重试。");
    const item = makeEntry(id2, date, current3.canEdit);
    item.labels = [...labels4];
    item.label = item.labels[0] || "";
    item.labelKnown = true;
    item.labelComplete = true;
    entries.set(id2, item);
    current3.ids.push(id2);
    current3.composerId = id2;
    emit2();
    return item;
  }
  function edit(id2, text, { composing = false } = {}) {
    const item = entry(id2);
    if (!item || context.disposed || !item.canEdit || item.deleted || item.discarding || ["delete", "restore"].includes(item.pending?.kind)) return;
    item.draft = text;
    item.composing = composing;
    item.dirty = text !== savedText(item) || !equalLabels(item.labels, item.serverLabels);
    stopTimer(item);
    if (dailyNotesBytes(text) > DAILY_NOTES_MAX_BYTES) {
      if (!blocked(item)) item.phase = "oversize";
      item.error = "文字超过 64 KiB，草稿已保留，请缩短后再保存。";
    } else if (!blocked(item)) {
      item.phase = item.pending ? "saving" : item.dirty ? "dirty" : savedPhase(item);
      item.error = "";
    }
    emit2();
    if (!composing) schedule(item);
  }
  function relabelDraft(id2, labels4 = []) {
    const item = entry(id2);
    if (typeof labels4 === "string") labels4 = labels4 ? [labels4] : [];
    if (!item || context.disposed || !item.canEdit || item.deleted || item.discarding || item.pending || (!item.labelKnown || context.multiLabels && !item.labelComplete) || !validLabels(labels4, context.category)) return false;
    item.labels = [...labels4];
    item.label = labels4[0] || "";
    item.dirty = item.draft !== savedText(item) || !equalLabels(item.labels, item.serverLabels);
    item.phase = item.dirty ? "dirty" : savedPhase(item);
    emit2();
    return true;
  }
  return { start, edit, relabelDraft };
}
function createEntryRecoveryActions(context) {
  const { category, page, entry, entries, makeEntry, stopTimer, emit: emit2 } = context;
  function restoreDraft(raw) {
    if (!raw || raw.category !== category || !validDailyNotesDate(raw.date) || !uuidPattern6.test(raw.id) || raw.label && !validNoteLabel(raw.label) || typeof raw.draft !== "string" || raw.draft.length > 262144 || context.disposed) return;
    const current3 = page(raw.date);
    let item = entry(raw.id);
    if (item?.deleted || item && (item.pending || item.composing || item.dirty)) return item;
    const pendingDurable = item && raw.pending?.saveId && raw.pending.saveId === item.localOperation?.save_id;
    if (item && persistedVersion(item) > 0 && raw.draft === savedText(item) && (!raw.labels || equalLabels(raw.labels, item.serverLabels)) && (!raw.pending || pendingDurable)) return item;
    if (!item) {
      item = makeEntry(raw.id, raw.date, current3.canEdit);
      entries.set(item.id, item);
    }
    if (!persistedVersion(item)) {
      item.labels = validLabels(raw.labels, category) ? raw.labels : raw.label ? [raw.label] : [];
      item.label = item.labels[0] || "";
      item.labelKnown = raw.labelKnown === true;
      item.labelComplete = current3.labelsComplete === true;
    }
    if (!current3.ids.includes(item.id)) current3.ids.push(item.id);
    stopTimer(item);
    item.writeEpoch++;
    item.draft = raw.draft;
    if (validLabels(raw.labels, category)) item.labels = [...raw.labels];
    item.dirty = item.draft !== savedText(item) || !equalLabels(item.labels, item.serverLabels);
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
      const valid2 = ["put", "delete", "restore"].includes(operation2.kind) && uuidPattern6.test(operation2.saveId) && Number.isSafeInteger(operation2.version) && operation2.version >= 0 && (operation2.kind !== "put" || typeof operation2.text === "string" && dailyNotesBytes(operation2.text) <= DAILY_NOTES_MAX_BYTES && (!operation2.labels || validLabels(operation2.labels, category)) && (!operation2.label || category === "life" && validCustomNoteLabel(operation2.label)) && (!operation2.expectedLabel || category === "life" && validCustomNoteLabel(operation2.expectedLabel)));
      item.pending = valid2 ? {
        kind: operation2.kind,
        version: operation2.version,
        saveId: operation2.saveId,
        ...operation2.kind === "put" ? {
          text: operation2.text,
          ...operation2.labels ? { labels: operation2.labels } : {},
          ...operation2.label ? { label: operation2.label } : {},
          ...operation2.expectedLabel ? { expectedLabel: operation2.expectedLabel } : {}
        } : {},
        uncertain: true,
        checking: false,
        retryReady: false
      } : { kind: "recovery-blocked", uncertain: true, invalid: true, checking: false, retryReady: false };
      item.phase = "unknown";
      item.error = valid2 ? "已找回未确认的原保存，请手动核对结果；不会自动重发。" : "旧保存凭据不完整，草稿已保留供查看或导出。";
    } else {
      item.phase = dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES ? "oversize" : "error";
      item.error = "已找回未提交草稿，请核对后手动保存；不会自动上传。";
    }
    emit2();
    return item;
  }
  function dropRestoredDraft(id2, draft) {
    const item = entry(id2);
    if (!item?.recoveredBaseline || item.draft !== draft || item.composing || item.discarding || item.localQueued || item.pending && !item.pending.uncertain || context.disposed) return false;
    stopTimer(item);
    item.writeEpoch++;
    item.recoveredBaseline = null;
    item.pending = null;
    item.remote = null;
    item.error = "";
    if (persistedVersion(item) > 0) {
      item.draft = savedText(item);
      item.labels = [...item.serverLabels];
      item.label = item.labels[0] || "";
      item.dirty = false;
      item.phase = savedPhase(item);
    } else {
      entries.delete(item.id);
      const current3 = page(item.date);
      current3.ids = current3.ids.filter((value) => value !== item.id);
    }
    emit2();
    return true;
  }
  return { restoreDraft, dropRestoredDraft };
}
function createEntryPersistActions(context) {
  const { category, page, entry, entries, emit: emit2, stopTimer } = context;
  const { uuid: uuid5, onSaved, discardUnsent, prepareDelete, finishDelete, loadVerified } = context.options;
  async function save(id2) {
    const item = entry(id2);
    if (!item) return;
    stopTimer(item);
    if (context.disposed || !item.canEdit || item.deleted || item.discarding || item.loading || item.pending || blocked(item) || !item.dirty || item.composing) return;
    if (item.recoveredBaseline) {
      const snapshot = { draft: item.draft, labels: [...item.labels], epoch: item.writeEpoch, version: persistedVersion(item) };
      item.loading = true;
      item.error = "正在核对线上记录，本机草稿会保留。";
      emit2();
      try {
        if (!loadVerified) throw new Error("无法直接核对线上记录");
        const list2 = checkedCollection(await loadVerified(item.date), category, item.date);
        if (context.disposed || entry(id2) !== item || item.writeEpoch !== snapshot.epoch || item.draft !== snapshot.draft || !equalLabels(item.labels, snapshot.labels) || item.pending || item.composing || !item.canEdit || item.deleted || item.discarding) return;
        if (list2.entries.some(isLocalDocument)) throw new Error("无法确认线上最新状态");
        const same2 = list2.entries.find((value) => value.id === id2);
        if (same2 && same2.text === snapshot.draft && equalLabels(labelsOf(same2), snapshot.labels)) {
          item.error = "线上已有这条记录，无需重复发送；本机草稿仍保留。";
          return;
        }
        if (list2.entries.some((value) => value.id !== id2 && value.text === snapshot.draft)) {
          item.error = "线上有内容相同的其他记录，请先核对；本机草稿仍保留。";
          return;
        }
        if (!list2.can_edit || same2 && (same2.version !== item.recoveredBaseline.version || !item.recoveredBaseline.contentHash || same2.content_hash !== item.recoveredBaseline.contentHash) || !same2 && snapshot.version !== 0) {
          item.error = "线上状态发生变化，请先核对；本机草稿仍保留。";
          return;
        }
      } catch {
        if (!context.disposed && entry(id2) === item) item.error = "无法核对线上记录，请稍后重试；本机草稿仍保留。";
        return;
      } finally {
        item.loading = false;
        emit2();
      }
    }
    if (!persistedVersion(item) && item.date !== dailyNotesToday()) {
      item.phase = "error";
      item.error = "只能新增北京时间当天的碎碎念，草稿已保留。";
      emit2();
      return;
    }
    if (!persistedVersion(item) && !item.draft.trim()) return;
    if (context.multiLabels && !item.labelComplete && !equalLabels(item.labels, item.serverLabels)) {
      item.phase = "error";
      item.error = "请联网核实完整标签后再保存，草稿已保留。";
      emit2();
      return;
    }
    if (dailyNotesBytes(item.draft) > DAILY_NOTES_MAX_BYTES) {
      item.phase = "oversize";
      item.error = "文字超过 64 KiB，草稿已保留。";
      emit2();
      return;
    }
    return context.send(item, {
      kind: "put",
      version: persistedVersion(item),
      text: item.draft,
      saveId: uuid5(),
      ...context.multiLabels && item.labelComplete && (!persistedVersion(item) || !equalLabels(item.labels, item.serverLabels)) ? { labels: [...item.labels] } : {},
      ...!context.multiLabels && !persistedVersion(item) && item.label ? { label: item.label } : {},
      ...!context.multiLabels && item.label ? { expectedLabel: item.label } : {}
    });
  }
  async function deleteEntry(id2) {
    const item = entry(id2);
    if (!item || context.disposed || !item.canEdit || item.discarding || item.pending || blocked(item) || item.deleted) return;
    if (!persistedVersion(item)) {
      stopTimer(item);
      item.discarding = true;
      emit2();
      try {
        await discardUnsent(item);
      } catch (error) {
        item.discarding = false;
        item.phase = "error";
        item.error = "本机草稿未能清理，内容已保留：" + error.message;
        emit2();
        return;
      }
      if (context.disposed || entry(id2) !== item) return;
      const current3 = page(item.date);
      current3.ids = current3.ids.filter((value) => value !== id2);
      entries.delete(id2);
      if (current3.composerId === id2) current3.composerId = "";
      emit2();
      return;
    }
    item.discarding = true;
    emit2();
    let prepared;
    try {
      prepared = await prepareDelete(item);
    } catch (error) {
      item.discarding = false;
      item.phase = "error";
      item.error = "本机草稿未能核对，内容已保留：" + error.message;
      emit2();
      return;
    }
    if (context.disposed || entry(id2) !== item) return;
    item.discarding = false;
    const result = await context.send(item, { kind: "delete", version: persistedVersion(item), saveId: uuid5() });
    if (result && prepared) {
      try {
        await finishDelete(prepared, result);
      } catch {
      }
    }
  }
  return { save, deleteEntry };
}
function createEntryWritingActions(context) {
  const { category, page, entry, entries, emit: emit2, stopTimer, adopt, schedule } = context;
  const { put, remove, restore, uuid: uuid5, onSaved, discardUnsent, prepareDelete, finishDelete, loadVerified } = context.options;
  const matches2 = (value, operation2) => value.version === operation2.version + 1 && (operation2.kind === "delete" ? value.deleted : operation2.kind === "restore" ? !value.deleted : !value.deleted && value.text === operation2.text && (!operation2.labels || [2, 3].includes(value.labels_version) && equalLabels(value.labels, operation2.labels) || value.labels_version === 1 && equalLabels(labelsOf(value), operation2.labels)) && (!operation2.label || value.labels_version === 1 && value.label === operation2.label) && (!operation2.expectedLabel || value.labels_version === 1 && value.label === operation2.expectedLabel));
  function accepted(item, value, operation2) {
    const preserve = operation2.kind === "put" && item.draft !== operation2.text;
    item.writeEpoch++;
    adopt(item, value, preserve);
    item.remote = null;
    item.pending = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit2();
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
    emit2();
    onSaved(item.date);
    schedule(item);
  }
  async function send(item, operation2) {
    stopTimer(item);
    item.pending = operation2;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    emit2();
    try {
      const body2 = { version: operation2.version, save_id: operation2.saveId };
      const options4 = operation2.uncertain ? { offlineUnknown: true } : void 0;
      const raw = operation2.kind === "delete" ? await remove(item.id, body2, options4) : operation2.kind === "restore" ? await restore(item.id, body2, options4) : await put(item.id, {
        ...body2,
        category: item.category,
        date: item.date,
        text: operation2.text,
        ...operation2.labels ? { labels: operation2.labels } : operation2.label ? { label: operation2.label } : {}
      }, options4);
      if (context.disposed || item.pending !== operation2) return;
      const value = checkedEntry(raw, category, item.date, item.id);
      if (isLocalDocument(value)) {
        acceptedLocal(item, value, operation2);
        return;
      }
      if (!matches2(value, operation2)) throw new Error("保存响应需要重新核对。");
      accepted(item, value, operation2);
      return value;
    } catch (error) {
      if (context.disposed || item.pending !== operation2) return;
      if (localFailure(error)) {
        item.pending = operation2.uncertain ? operation2 : null;
        item.phase = operation2.uncertain ? "unknown" : "error";
        item.error = operation2.uncertain ? "原保存仍待核对，本机接管未完成：" + error.message : error.message;
        emit2();
      } else if (error.status === 409 && (!error.code || ["VERSION_CONFLICT", "NOTE_ENTRY_DELETED"].includes(error.code))) {
        item.pending = null;
        item.phase = "conflict";
        item.error = error.message || "这条记录已有新版本，草稿已保留。";
        emit2();
        await context.readOne(item.id);
      } else if (error.status >= 400 && error.status < 500) {
        item.pending = null;
        item.phase = "error";
        item.error = error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
        emit2();
      } else {
        operation2.uncertain = true;
        item.phase = "unknown";
        item.error = "正在核对保存结果，草稿已保留。";
        emit2();
        await context.reconcile(item.id);
      }
    }
  }
  context.send = send;
  const { save, deleteEntry } = createEntryPersistActions(context);
  async function restoreEntry(id2) {
    const item = entry(id2);
    if (!item || context.disposed || !item.canEdit || !item.deleted || item.pending || blocked(item)) return;
    return send(item, { kind: "restore", version: persistedVersion(item), saveId: uuid5() });
  }
  return { matches: matches2, accepted, acceptedLocal, send, save, deleteEntry, restoreEntry };
}
function createEntryResolutionActions(context) {
  const { category, entry, emit: emit2, stopTimer, adopt, matches: matches2, accepted, acceptedLocal } = context;
  const { load, loadEntry, loadOperation } = context.options;
  async function reconcile(id2) {
    const item = entry(id2), operation2 = item?.pending;
    if (context.disposed || item?.phase !== "unknown" || !operation2 || operation2.checking) return;
    operation2.checking = true;
    operation2.retryReady = false;
    emit2();
    try {
      const receipt = await loadOperation(operation2.saveId);
      if (context.disposed || item.pending !== operation2) return;
      if (!receipt || typeof receipt.found !== "boolean" || receipt.found && (receipt.id !== id2 || receipt.version !== operation2.version + 1 || typeof receipt.content_hash !== "string")) {
        throw new Error("保存凭据不完整。");
      }
      let value;
      try {
        value = checkedEntry(await loadEntry(id2), category, item.date, id2);
      } catch (error) {
        if (error.status !== 404 || receipt.found || operation2.version !== 0 || operation2.kind !== "put") throw error;
        const collection = checkedCollection(await load(item.date), category, item.date);
        value = collection.entries.find((raw) => noteValue(raw).id === id2);
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
      emit2();
    }
  }
  async function retryPending(id2) {
    const item = entry(id2), operation2 = item?.pending;
    if (context.disposed || item?.phase !== "unknown" || !item.canEdit || !operation2?.retryReady || operation2.checking) return;
    operation2.retryReady = false;
    return context.send(item, operation2);
  }
  function useServer(id2) {
    const item = entry(id2);
    if (item?.localConflict) {
      item.error = "请从顶部同步状态选择线上版本，本机原文会保留。";
      emit2();
      return;
    }
    if (!item?.remote || item.pending || item.phase !== "conflict") return;
    stopTimer(item);
    adopt(item, item.remote);
    item.remote = null;
    item.phase = "saved";
    item.error = "";
    emit2();
  }
  async function useDraft(id2) {
    const item = entry(id2);
    if (item?.localConflict) {
      item.error = "冲突的两份内容已保留，请从顶部同步状态处理。";
      emit2();
      return;
    }
    if (!item?.remote || item.pending || item.phase !== "conflict" || !item.remote.can_edit || item.remote.deleted) return;
    adopt(item, item.remote, true);
    item.remote = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit2();
    return context.save(id2);
  }
  return { reconcile, retryPending, useServer, useDraft };
}
function createNoteEntriesStore(options4) {
  const context = createEntriesContext(options4);
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
    read: read2,
    readOne,
    edit,
    relabelDraft,
    save,
    deleteEntry,
    restoreEntry,
    reconcile,
    retryPending,
    useServer,
    useDraft,
    restoreDraft,
    dropRestoredDraft,
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
    read: read2,
    readOne,
    edit,
    relabelDraft,
    save,
    deleteEntry,
    restoreEntry,
    reconcile,
    retryPending,
    useServer,
    useDraft,
    restoreDraft,
    dropRestoredDraft,
    pauseAutosave,
    dispose
  };
}

// web/core/notes-month.mjs
init_daily_notes_state();
function validNoteMonth(month) {
  return typeof month === "string" && /^\d{4}-\d{2}$/.test(month) && validDailyNotesDate(month + "-01");
}
function coalesceNoteMonthFlight(current3, next) {
  if (!current3 || current3.root !== next.root || current3.target !== next.target || current3.expected !== next.expected || current3.sequence !== next.sequence) return false;
  if (next.chosenDate) current3.chosenDate = next.chosenDate;
  return true;
}
function shiftNoteMonth(month, delta2) {
  if (!validNoteMonth(month) || !Number.isInteger(delta2)) throw new Error("请选择有效月份。");
  const date = /* @__PURE__ */ new Date(month + "-01T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + delta2);
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
  for (let day6 = 1; day6 <= last.getUTCDate(); day6++)
    weeks[Math.floor((offset + day6 - 1) / 7)][(offset + day6 - 1) % 7] = month + "-" + String(day6).padStart(2, "0");
  return weeks;
}
function checkedNoteMonth(data3, month) {
  const fail6 = () => {
    throw new Error("月记录不完整，请联网重试。");
  };
  if (!validNoteMonth(month) || !data3 || data3.month !== month || data3.complete !== true || ![1, 2, 3].includes(data3.labels_version) || !Array.isArray(data3.days) || data3.days.length > 31) fail6();
  const result = /* @__PURE__ */ new Map(), ids = /* @__PURE__ */ new Set();
  let total = 0;
  for (const day6 of data3.days) {
    if (!day6 || !validDailyNotesDate(day6.date) || !day6.date.startsWith(month + "-") || result.has(day6.date) || !Array.isArray(day6.items)) fail6();
    const items = day6.items.map((item) => {
      if (!item || typeof item.entity_id !== "string" || ids.has(item.entity_id) || !["note_entry", "legacy_daily_note"].includes(item.source) || !["life", "work"].includes(item.category) || data3.labels_version === 1 && (!Object.hasOwn(item, "label") || item.label !== null && (item.category !== "life" || !validCustomNoteLabel(item.label))) || data3.labels_version >= 2 && (!Array.isArray(item.labels) || item.labels.some((label3) => data3.labels_version === 3 ? !validNoteLabel(label3) : item.category !== "life" || !validCustomNoteLabel(label3)) || new Set(item.labels).size !== item.labels.length) || typeof item.text !== "string" || !item.text || !Object.hasOwn(item, "created_at") || item.created_at !== null && !Number.isFinite(Date.parse(item.created_at)) || item.source === "legacy_daily_note" && item.created_at !== null || !Number.isFinite(Date.parse(item.updated_at))) fail6();
      ids.add(item.entity_id);
      total++;
      const displayLabels = data3.labels_version === 3 ? item.labels : item.labels?.length ? item.labels : item.label ? [item.label] : [item.category === "work" ? "工作" : "生活"];
      return { ...item, displayLabels, displayLabel: displayLabels.join("、") };
    });
    result.set(day6.date, items);
  }
  if (total > 2e3) fail6();
  return result;
}

// web/notes-month-controller.mjs
init_daily_notes_state();
function renderNotesMonthMarkup() {
  return '<details id="notes-month-panel" class="notes-month-panel"><summary>月历与历史</summary><div class="notes-month-controls"><button class="btn" type="button" data-notes-month-step="-1" aria-label="上个月">‹</button><label>月份 <input id="notes-month-input" class="input" type="month"></label><button class="btn" type="button" data-notes-month-step="1" aria-label="下个月">›</button><label>分类 <select id="notes-month-category" class="input"><option value="">全部</option><option value="life">生活</option><option value="work">工作</option></select></label><button class="btn text" type="button" data-notes-month-refresh>刷新</button></div><p id="notes-month-status" role="status" aria-live="polite"></p><div class="notes-month-weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div id="notes-month-grid" class="notes-month-grid"></div><h3 id="notes-month-day-title"></h3><div id="notes-month-history" class="notes-entry-list"></div></details>';
}
function mountNotesMonth(root3, { request: request2, selectDate, identity: identity6 }) {
  const panel2 = root3.querySelector("#notes-month-panel");
  if (!panel2) return () => {
  };
  const find = (selector) => panel2.querySelector(selector), doc = root3.ownerDocument;
  const identityNow = typeof identity6 === "function" ? identity6 : () => identity6, expected = identityNow();
  let disposed = false, sequence5 = 0, days = /* @__PURE__ */ new Map(), loaded = "", selected = dailyNotesToday(), month = selected.slice(0, 7), category = "";
  const active5 = () => !disposed && root3.isConnected && identityNow() === expected;
  const visibleRows = (date) => (days.get(date) || []).filter((item) => !category || item.category === category);
  find("#notes-month-input").value = month;
  function node2(tag2, text, className = "") {
    const result = doc.createElement(tag2);
    result.textContent = text;
    if (className) result.className = className;
    return result;
  }
  function paintHistory() {
    const rows = visibleRows(selected), list2 = find("#notes-month-history");
    list2.replaceChildren();
    find("#notes-month-day-title").textContent = selected + " · " + rows.length + " 条记录";
    for (const item of rows) {
      const card2 = node2("article", "", "note-entry note-entry-saved"), head = node2("div", "", "note-entry-head");
      head.append(node2("span", item.displayLabel + (item.source === "legacy_daily_note" ? " · 原有记录" : "")));
      const time2 = node2("time", new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.updated_at)));
      time2.dateTime = item.updated_at;
      head.append(time2);
      card2.append(head, node2("div", item.text || "这条记录没有文字。", "note-entry-reader"));
      const open = node2("button", "查看当天", "btn text");
      open.type = "button";
      open.addEventListener("click", () => {
        if (active5()) void selectDate(selected, item.category);
      });
      card2.append(open);
      list2.append(card2);
    }
    if (!rows.length) list2.append(node2("p", "这一天没有符合分类的已同步记录。", "notes-empty"));
  }
  function paint3() {
    const grid = find("#notes-month-grid");
    grid.replaceChildren();
    for (const date of noteMonthWeeks(month).flat()) {
      if (!date) {
        grid.append(node2("span", ""));
        continue;
      }
      const count3 = visibleRows(date).length, button3 = node2("button", String(Number(date.slice(-2))) + (count3 ? " · " + count3 : ""), "btn");
      button3.type = "button";
      button3.dataset.notesMonthDate = date;
      button3.setAttribute("aria-label", date + "，" + count3 + " 条记录");
      button3.setAttribute("aria-pressed", String(date === selected));
      button3.classList.toggle("has-records", count3 > 0);
      grid.append(button3);
    }
    paintHistory();
  }
  async function load(force = false) {
    if (!active5() || !panel2.open || !validNoteMonth(month) || !force && loaded === month) return;
    const current3 = ++sequence5, target = month;
    loaded = "";
    days = /* @__PURE__ */ new Map();
    find("#notes-month-grid").replaceChildren();
    find("#notes-month-history").replaceChildren();
    find("#notes-month-day-title").textContent = "";
    find("#notes-month-status").textContent = "";
    try {
      const data3 = await request2("/note-entries/month?month=" + target);
      if (!active5() || current3 !== sequence5 || target !== month) return;
      days = checkedNoteMonth(data3, target);
      loaded = target;
      if (!selected.startsWith(target + "-")) selected = [...days.keys()][0] || target + "-01";
      find("#notes-month-status").textContent = "仅展示已同步记录；待同步草稿请在原日期查看。";
      paint3();
    } catch (error) {
      if (!active5() || current3 !== sequence5) return;
      find("#notes-month-status").textContent = error.message || "月记录读取失败，请重试。";
    }
  }
  function toggle() {
    if (panel2.open) void load();
  }
  function change3(event) {
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
      if (loaded === month) paint3();
    }
  }
  function click(event) {
    if (!active5()) return;
    const target = event.target.closest("[data-notes-month-step],[data-notes-month-date],[data-notes-month-refresh]");
    if (!target || !panel2.contains(target)) return;
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
      paint3();
    } else void load(true);
  }
  panel2.addEventListener("toggle", toggle);
  panel2.addEventListener("change", change3);
  panel2.addEventListener("click", click);
  return () => {
    disposed = true;
    sequence5++;
    panel2.removeEventListener("toggle", toggle);
    panel2.removeEventListener("change", change3);
    panel2.removeEventListener("click", click);
  };
}

// web/pages/daily-notes.mjs
init_dom();
init_daily_notes_state();
function legacyEditorMarkup() {
  return '<article id="notes-legacy-card" class="note-entry note-entry-editing notes-legacy-card" hidden><div class="note-entry-head"><time id="notes-legacy-time" class="note-entry-time" hidden></time><span id="notes-legacy-status" class="note-entry-status" role="status" aria-live="polite"></span></div><p id="notes-message" class="notes-message" role="alert" hidden></p><div class="notes-sheet"><label for="notes-editor" class="sr-only">原有记录内容</label><textarea id="notes-editor" class="notes-editor" aria-label="原有记录或保留草稿，只读" readonly hidden></textarea><div id="notes-reader" class="notes-reader"></div><p id="notes-empty" hidden>这条记录没有文字。</p></div><div class="notes-footer"><span id="notes-detail" class="notes-detail"></span><button class="btn text" type="button" data-notes-action="export-legacy" hidden>导出保留的原有草稿</button><div id="notes-write-actions" class="notes-write-actions" hidden><button class="btn" type="button" data-notes-action="save">立即保存</button><button class="btn" type="button" data-notes-action="restore" hidden>恢复原有记录</button><button class="btn text" type="button" data-notes-action="delete">删除原有记录</button></div></div><div id="notes-delete-confirm" class="notes-confirm" hidden><p>删除原有记录？</p><button class="btn" type="button" data-notes-action="cancel-delete">取消</button><button class="btn" type="button" data-notes-action="confirm-delete">确认删除</button></div><div id="notes-resolution" class="notes-resolution" hidden><button class="btn" type="button" data-notes-action="check">核对服务器版本</button><button class="btn" type="button" data-notes-action="retry" hidden>重试同一保存</button><div id="notes-conflict-actions" hidden><p>服务器上的文字：</p><pre id="notes-remote"></pre><button class="btn" type="button" data-notes-action="use-server">采用服务器内容</button><button class="btn" type="button" data-notes-action="use-draft">用此草稿保存到新版本</button></div></div></article>';
}
function renderDailyNotes() {
  const category = dailyNotesRouteCategory();
  return '<section id="daily-notes" class="daily-notes" aria-label="碎碎念" data-category="' + category + '"><div class="segmented" role="group" aria-label="碎碎念视图"><button type="button" data-notes-view="today" aria-pressed="true">今日碎碎念</button><button type="button" data-notes-view="history" aria-pressed="false">历史</button><button type="button" data-notes-view="labels" aria-pressed="false">标签</button></div><section id="notes-history" hidden aria-label="碎碎念历史"><div class="notes-calendar-layout"><aside class="notes-calendar-filters"><label>月份 <input type="month" id="notes-history-month" class="input"></label><div class="notes-calendar-month-actions"><button type="button" class="notes-month-step" data-notes-month="prev" aria-label="上个月" title="上个月">‹</button><button type="button" class="notes-month-step" data-notes-month="next" aria-label="下个月" title="下个月">›</button></div><label hidden>周次 <select id="notes-history-week" class="input"><option value="">全部周次</option></select></label><label>标签 <select id="notes-history-label" class="input"><option value="">全部标签</option></select></label><label hidden>日期 <select id="notes-history-date" class="input"></select></label></aside><div class="notes-calendar-main"><div class="notes-history-views" role="group" aria-label="历史显示方式"><button type="button" data-history-display="calendar" aria-pressed="true">日历</button><button type="button" data-history-display="timeline" aria-pressed="false">时间轴</button><button type="button" class="notes-timeline-order" data-history-order="desc" aria-label="切换时间轴排序" hidden>时间：从新到旧</button></div><p id="notes-history-summary" class="notes-calendar-summary"></p><p id="notes-history-status" role="status" aria-live="polite"></p><div class="notes-calendar-weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div id="notes-history-grid" class="notes-calendar-grid"></div><div id="notes-history-list" class="notes-entry-list"></div></div></div></section><section id="notes-labels" hidden aria-label="标签管理"><div class="notes-categories"><label><span class="sr-only">新标签名称</span><input id="notes-new-label" class="input" maxlength="64" placeholder="新标签"></label><button class="btn text" type="button" data-notes-action="create-label">添加标签</button></div><p id="notes-label-status" role="status" aria-live="polite"></p><ul id="notes-label-list"></ul></section><div id="notes-today"><div class="notes-toolbar"><div class="notes-date-controls"><button class="btn" type="button" data-notes-action="previous" aria-label="前一天">‹</button><label class="notes-date-label"><span class="sr-only">选择碎碎念日期</span><input id="notes-date" class="input" type="date" max="' + dailyNotesToday() + '"></label><button class="btn" type="button" data-notes-action="next" aria-label="后一天">›</button><button class="btn text" type="button" data-notes-action="today">今天</button></div><section id="daily-score" class="daily-score is-open" aria-label="今日打分"><button id="daily-score-chip" class="daily-score-chip" type="button" data-daily-score-toggle aria-expanded="false" hidden></button><span id="daily-score-trend" class="daily-score-trend"></span><div class="daily-score-picker"><span class="daily-score-label" id="daily-score-label">今日打分</span><span class="daily-score-end" aria-hidden="true">很糟</span><div class="daily-score-scale" role="group" aria-label="1 到 10 分，1 很糟，10 很好">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => '<button type="button" data-daily-score="' + score + '" aria-pressed="false">' + score + "</button>").join("") + '</div><span class="daily-score-end" aria-hidden="true">很好</span></div><span id="daily-score-status" class="notes-status" role="status" aria-live="polite"></span></section><div class="notes-entry-toolbar"><button class="btn notes-add-entry" type="button" data-notes-action="new" hidden>＋ 写一条</button><button class="btn text" type="button" data-notes-action="login" hidden>所有者登录</button></div><span id="notes-status" class="notes-status" role="status" aria-live="polite"></span></div><div class="notes-published"><div id="notes-entry-list" class="notes-entry-list"></div><article id="notes-legacy-saved" class="note-entry note-entry-saved notes-legacy-saved" hidden><div class="note-entry-head"><time class="note-entry-time" hidden></time><span class="note-entry-status"></span></div><div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><button class="btn text note-entry-edit" type="button" data-notes-action="edit-legacy">查看原有记录</button><button class="btn text" type="button" data-notes-action="export-legacy" hidden>导出保留的原有草稿</button></article></div><div id="notes-drafts" class="notes-drafts" hidden></div><p id="notes-entry-message" class="notes-message" role="alert" hidden></p><section id="notes-composer" class="notes-composer" aria-label="当前编辑的碎碎念" hidden><div class="notes-composer-heading"><button class="btn text" type="button" data-notes-action="collapse">取消</button></div><div id="notes-active-entry"></div>' + legacyEditorMarkup() + '</section><p id="notes-entry-empty" class="notes-empty" hidden>这一天还没有记录。</p><div id="notes-unpublished" class="notes-entry-list"></div></div></section>';
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
function paintDailyNotes(root3, item, { compatibility = false, editing: editing3 = false } = {}) {
  if (!root3) return;
  const find = (selector) => root3.querySelector(selector), editor = find("#notes-editor"), reader = find("#notes-reader");
  const retained = retainedLegacy(item);
  editor.dataset.date = item.date;
  editor.dataset.category = root3.dataset.category || dailyNotesRouteCategory();
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
    const button3 = find('[data-notes-action="' + action + '"]');
    button3.hidden = true;
    button3.disabled = true;
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
  return '<p class="note-entry-message" role="alert" hidden></p><div class="note-entry-actions"><button class="btn note-entry-send" type="button" data-note-entry-action="save" aria-label="发送"></button><span class="note-entry-send-feedback" role="status" aria-live="polite"></span><button class="btn text" type="button" data-note-entry-action="restore" hidden>恢复</button><button class="btn text" type="button" data-note-entry-action="delete">删除</button></div><div class="note-entry-confirm notes-confirm" hidden><p>删除这条记录？</p><button class="btn" type="button" data-note-entry-action="cancel-delete">取消</button><button class="btn" type="button" data-note-entry-action="confirm-delete">确认删除</button></div><div class="note-entry-resolution notes-resolution" hidden><button class="btn" type="button" data-note-entry-action="check">核对保存结果</button><button class="btn" type="button" data-note-entry-action="retry" hidden>重试原保存</button><div class="note-entry-conflict" hidden><p>服务器上的文字：</p><pre></pre><button class="btn" type="button" data-note-entry-action="use-server">采用服务器内容</button><button class="btn" type="button" data-note-entry-action="use-draft">用此草稿保存</button></div></div>';
}
function createEntryElement(item, editing3) {
  const node2 = document.createElement("article");
  node2.className = "note-entry " + (editing3 ? "note-entry-editing" : "note-entry-saved");
  node2.dataset.noteEntry = item.id;
  node2.dataset.category = item.category;
  node2.innerHTML = '<div class="note-entry-head"><span class="note-entry-label"></span><time class="note-entry-time"></time><span class="note-entry-status" role="status" aria-live="polite"></span></div>' + (editing3 ? '<label class="sr-only" for="entry-' + e(item.id) + '">碎碎念内容</label><textarea id="entry-' + e(item.id) + '" class="note-entry-editor" data-note-entry-editor="' + e(item.id) + '" placeholder="写下一点想说的话…" rows="3"></textarea><fieldset class="note-entry-labels"><legend>标签（可多选）</legend><div class="note-entry-label-options"></div></fieldset><div class="note-entry-reader" hidden></div>' + entryControlsMarkup() : '<div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><span class="note-entry-send-feedback" role="status" aria-live="polite"></span><button class="btn text note-entry-edit" type="button" data-note-entry-action="edit">编辑</button>');
  return node2;
}
function paintEntrySummary(node2, item) {
  node2.dataset.category = item.category;
  node2.querySelector(".note-entry-label").textContent = !item.labelKnown || !item.labelComplete ? "标签待联网核实" : (item.labels || []).join("、");
  paintTime(node2.querySelector("time"), item.updatedAt);
  const status = node2.querySelector(".note-entry-status");
  status.textContent = statuses[item.phase] || (item.deleted ? "已删除" : item.version ? "已保存" : "未发送");
  status.dataset.phase = item.phase;
  const message = node2.querySelector(".note-entry-message");
  message.textContent = item.error;
  message.hidden = !item.error;
}
function paintSavedEntry(node2, item) {
  paintEntrySummary(node2, item);
  node2.querySelector(".note-entry-send-feedback").textContent = item.manualSubmitted && !item.dirty && item.phase === "saved" ? "发送成功" : "";
  const draft = noteDraftNeedsAttention(item), body2 = node2.querySelector(".note-entry-reader");
  body2.textContent = item.deleted ? "这条记录已删除。" : displayedText(item);
  body2.classList.toggle("note-entry-draft-label", draft);
  node2.dataset.draft = String(draft);
  const edit = node2.querySelector('[data-note-entry-action="edit"]');
  edit.hidden = !item.canEdit && !draft;
  edit.textContent = draft ? "继续编辑草稿" : item.deleted ? "查看" : "编辑";
}
function paintEntryEditor(node2, item, confirmId, labels4, labelsVerified) {
  paintEntrySummary(node2, item);
  const find = (selector) => node2.querySelector(selector), editor = find("textarea");
  editor.dataset.date = item.date;
  editor.dataset.category = item.category;
  editor.hidden = item.deleted;
  editor.readOnly = !item.canEdit;
  editor.disabled = ["delete", "restore"].includes(item.pending?.kind);
  paintEditorValue(editor, item.draft);
  const fieldset = find(".note-entry-labels"), options4 = find(".note-entry-label-options");
  fieldset.hidden = item.deleted;
  fieldset.disabled = !item.canEdit || !item.labelComplete || !labelsVerified || Boolean(item.pending);
  fieldset.title = item.labelComplete && labelsVerified ? "" : "请联网核实标签状态后再修改。";
  const available = [.../* @__PURE__ */ new Set([...labels4, ...item.labels || []])];
  if (JSON.stringify([...options4.querySelectorAll("input")].map((input) => input.value)) !== JSON.stringify(available)) {
    options4.replaceChildren(...available.map((value) => {
      const label3 = document.createElement("label"), input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.dataset.noteLabel = item.id;
      label3.append(input, document.createTextNode(value));
      return label3;
    }));
  }
  for (const input of options4.querySelectorAll("input")) input.checked = (item.labels || []).includes(input.value);
  const reader = find(".note-entry-reader");
  reader.textContent = item.deleted ? "这条记录已删除。" : item.serverText;
  reader.hidden = !item.deleted;
  find(".note-entry-actions").hidden = !item.canEdit;
  const busy2 = Boolean(item.pending) || ["conflict", "unknown"].includes(item.phase);
  const save = find('[data-note-entry-action="save"]');
  save.hidden = item.deleted || !item.canEdit;
  const sendLabel = item.pending ? "发送中…" : item.phase === "error" ? "重试发送" : "发送";
  save.setAttribute("aria-label", sendLabel);
  save.setAttribute("title", sendLabel);
  save.disabled = busy2 || !item.dirty || item.composing || item.phase === "oversize";
  const feedback = find(".note-entry-send-feedback");
  feedback.textContent = item.pending ? "发送中…" : !item.manualSubmitted || item.dirty ? "" : item.phase === "queued" ? "已存本机，待同步" : item.phase === "saved" ? "发送成功" : "";
  find('[data-note-entry-action="delete"]').hidden = item.deleted;
  find('[data-note-entry-action="delete"]').disabled = busy2;
  find('[data-note-entry-action="restore"]').hidden = !item.deleted;
  find('[data-note-entry-action="restore"]').disabled = busy2;
  find(".note-entry-confirm").hidden = confirmId !== item.id;
  find(".note-entry-resolution").hidden = !["unknown", "conflict"].includes(item.phase) && item.phase !== "error";
  find('[data-note-entry-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find('[data-note-entry-action="retry"]').hidden = item.phase !== "unknown" || !item.pending?.retryReady || !item.canEdit;
  find(".note-entry-conflict").hidden = item.phase !== "conflict" || !item.remote;
  find(".note-entry-conflict pre").textContent = item.remote?.deleted ? "（这条记录已删除）" : item.remote?.text || "（空白）";
  find('[data-note-entry-action="use-draft"]').disabled = !item.remote?.can_edit || item.remote?.deleted;
}
var editorNodes = /* @__PURE__ */ new WeakMap();
function paintActiveEditor(root3, store, active5, legacy, confirmId, labels4, labelsVerified) {
  const host = root3.querySelector("#notes-active-entry");
  if (!editorNodes.has(root3)) editorNodes.set(root3, /* @__PURE__ */ new Map());
  const nodes = editorNodes.get(root3), item = store.entry(active5);
  host.hidden = !item;
  if (item) {
    if (!nodes.has(active5)) nodes.set(active5, createEntryElement(item, true));
    const node2 = nodes.get(active5);
    if (host.firstElementChild !== node2) host.replaceChildren(node2);
    paintEntryEditor(node2, item, confirmId, labels4, labelsVerified);
  }
  root3.querySelector("#notes-legacy-card").hidden = active5 !== "legacy";
  paintDailyNotes(root3, legacy, { compatibility: true, editing: active5 === "legacy" });
}
function paintLegacySummary(root3, legacy, active5) {
  const node2 = root3.querySelector("#notes-legacy-saved"), draft = retainedLegacy(legacy);
  let label3 = node2.querySelector(".note-entry-label");
  if (!label3) {
    label3 = document.createElement("span");
    label3.className = "note-entry-label";
    node2.querySelector(".note-entry-head").prepend(label3);
  }
  label3.textContent = root3.dataset.category === "work" ? "工作" : "生活";
  node2.hidden = active5 === "legacy" || !(legacy.version > 0 || draft);
  paintTime(node2.querySelector("time"), legacy.updatedAt);
  node2.querySelector(".note-entry-reader").textContent = draft ? legacy.draft : legacy.deleted ? "原有记录已删除。" : legacy.serverText;
  node2.querySelector(".note-entry-status").textContent = draft ? statuses[legacy.phase] || "保留的原有草稿" : "原有记录 · 只读";
  node2.querySelector(".note-entry-status").dataset.phase = legacy.phase;
  node2.querySelector(".note-entry-message").textContent = legacy.error;
  node2.querySelector(".note-entry-message").hidden = !legacy.error;
  const edit = node2.querySelector('[data-notes-action="edit-legacy"]');
  edit.hidden = false;
  edit.textContent = draft ? "查看保留的原有草稿" : "查看原有记录";
  node2.querySelector('[data-notes-action="export-legacy"]').hidden = !draft;
}
function paintRetainedDrafts(root3, current3, drafts) {
  const box = root3.querySelector("#notes-drafts");
  const retained = [...new Set(drafts.filter((value) => value.date !== current3.date || value.category !== current3.category).map((value) => value.category + ":" + value.date))];
  box.hidden = !retained.length;
  box.innerHTML = "<span>保留的草稿：</span>" + retained.map((key) => {
    const [category, date] = key.split(":");
    return '<button class="btn text" type="button" data-notes-draft-category="' + e(category) + '" data-notes-date="' + e(date) + '">' + (category === "work" ? "工作 " : "生活 ") + e(date) + "</button>";
  }).join("");
}
function paintOtherLegacy(root3, list2, legacy, category) {
  let node2 = root3.querySelector("#notes-legacy-other");
  if (!node2) {
    node2 = document.createElement("article");
    node2.id = "notes-legacy-other";
    node2.className = "note-entry note-entry-saved notes-legacy-saved";
    node2.innerHTML = '<div class="note-entry-head"><span class="note-entry-label"></span><time class="note-entry-time" hidden></time><span class="note-entry-status"></span></div><div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><button class="btn text note-entry-edit" type="button" data-notes-action="edit-other-legacy">查看原有记录</button><button class="btn text" type="button" data-notes-action="export-other-legacy" hidden>导出保留的原有草稿</button>';
  }
  list2.append(node2);
  const draft = legacy && retainedLegacy(legacy);
  node2.hidden = !legacy || !(legacy.version > 0 || draft);
  if (!legacy) return;
  node2.querySelector(".note-entry-label").textContent = category === "work" ? "工作" : "生活";
  paintTime(node2.querySelector("time"), legacy.updatedAt);
  node2.querySelector(".note-entry-reader").textContent = draft ? legacy.draft : legacy.deleted ? "原有记录已删除。" : legacy.serverText;
  node2.querySelector(".note-entry-status").textContent = draft ? statuses[legacy.phase] || "保留的原有草稿" : "原有记录 · 只读";
  const message = node2.querySelector(".note-entry-message");
  message.textContent = legacy.error;
  message.hidden = !legacy.error;
  const edit = node2.querySelector('[data-notes-action="edit-other-legacy"]');
  edit.dataset.legacyCategory = category;
  edit.textContent = draft ? "查看保留的原有草稿" : "查看原有记录";
  const exportButton = node2.querySelector('[data-notes-action="export-other-legacy"]');
  exportButton.dataset.legacyCategory = category;
  exportButton.hidden = !draft;
}
function paintNoteEntries(root3, store, current3, legacy, {
  drafts = [],
  confirmId = "",
  active: active5 = "",
  otherLegacy = null,
  otherCategory = "",
  labels: labels4 = [],
  labelsVerified = true
} = {}) {
  const find = (selector) => root3.querySelector(selector), list2 = find("#notes-entry-list");
  root3.dataset.date = current3.date;
  const dateInput = find("#notes-date");
  if (dateInput.value !== current3.date) dateInput.value = current3.date;
  find('[data-notes-action="next"]').disabled = current3.date >= dailyNotesToday();
  const canEdit = current3.loaded && current3.canEdit;
  find('[data-notes-action="new"]').hidden = !canEdit;
  find('[data-notes-action="login"]').hidden = !current3.loaded || current3.canEdit;
  find("#notes-entry-message").textContent = current3.error;
  find("#notes-entry-message").hidden = !current3.error;
  const items = current3.ids.map((id2) => store.entry(id2)).filter(Boolean);
  const saved = items.filter((item) => !item.deleted && item.id !== active5 && (item.version > 0 || item.localVersion > 0 || noteDraftNeedsAttention(item)));
  const unpublished2 = find("#notes-unpublished");
  const nodes = new Map([...list2.children, ...unpublished2.children].filter((node2) => node2.dataset.noteEntry).map((node2) => [node2.dataset.noteEntry, node2])), wanted = new Set(saved.map((item) => item.id));
  for (const [id2, node2] of nodes) if (!wanted.has(id2)) node2.remove();
  for (const item of saved) {
    const node2 = nodes.get(item.id) || createEntryElement(item, false);
    (noteDraftNeedsAttention(item) ? unpublished2 : list2).append(node2);
    paintSavedEntry(node2, item);
    node2.dataset.sortTime = item.createdAt || item.localCreatedAt || "";
  }
  paintActiveEditor(root3, store, active5, legacy, confirmId, labels4, labelsVerified);
  paintLegacySummary(root3, legacy, active5);
  (retainedLegacy(legacy) ? unpublished2 : list2).append(root3.querySelector("#notes-legacy-saved"));
  root3.querySelector("#notes-legacy-saved").dataset.sortTime = legacy.updatedAt || "";
  paintOtherLegacy(root3, list2, otherLegacy, otherCategory);
  root3.querySelector("#notes-legacy-other").dataset.sortTime = otherLegacy?.updatedAt || "";
  if (otherLegacy && retainedLegacy(otherLegacy)) unpublished2.append(root3.querySelector("#notes-legacy-other"));
  const composer = find("#notes-composer"), activeItem = active5 === "legacy" ? legacy : store.entry(active5);
  composer.hidden = !activeItem;
  composer.dataset.active = active5;
  find(".notes-published").hidden = Boolean(activeItem);
  unpublished2.hidden = Boolean(activeItem);
  find('[data-notes-action="new"]').hidden = !canEdit || current3.date !== dailyNotesToday() || Boolean(activeItem);
  find('[data-notes-action="collapse"]').disabled = Boolean(activeItem?.pending || activeItem?.composing);
  const ordered2 = [...list2.children].sort((a, b) => String(a.dataset.sortTime || "").localeCompare(String(b.dataset.sortTime || "")));
  list2.append(...ordered2);
  find("#notes-entry-empty").hidden = !(current3.allLoaded ?? current3.loaded) || Boolean(activeItem) || saved.length > 0 || legacy.version > 0 || noteDraftNeedsAttention(legacy) || Boolean(otherLegacy && (otherLegacy.version > 0 || noteDraftNeedsAttention(otherLegacy)));
  const unresolved2 = items.some(noteDraftNeedsAttention) || noteDraftNeedsAttention(legacy);
  const status = find("#notes-status");
  status.textContent = !current3.loaded && current3.loading ? "" : current3.error ? "读取失败" : unresolved2 ? "有未发送内容" : canEdit ? "" : current3.loaded ? "公开只读" : "";
  status.hidden = canEdit && !current3.error && !unresolved2;
  paintRetainedDrafts(root3, current3, drafts);
}

// web/daily-notes-controller.mjs
init_api();
init_state();
init_daily_notes_state();
init_login();
init_runtime();
init_document();
init_conflict_draft_guards();
init_retained_drafts();
var notesStore, entryStore, notesIdentity = "", notesEventsRegistered = false, notesConfirmDate = "", notesConfirmEntry = "", notesActiveCategory = "", notesRefreshPaused = false, notesDraftError = "", notesDraftRevision = 0;
var notesView = "today", historyMonth = "", historyDate = "", historyDays = /* @__PURE__ */ new Map(), historySequence = 0;
var scoreByDate = /* @__PURE__ */ new Map(), scoreRecord = { date: "", score: null, version: 0, status: "", saveId: "", pending: null, canEdit: false };
var historyActiveLoad = null;
var notesSelectedLabel = "生活", notesLabels = [], notesArchivedLabels = [], notesLabelsVerified = false, notesLabelIntent = null, notesArchiveIntent = null, notesLabelBusy = false, notesLabelMessage = "", notesLabelSequence = 0;
var notesStores = /* @__PURE__ */ new Map(), entryStores = /* @__PURE__ */ new Map(), editorViews = createNotesEditorView();
var floatingNoteObservers = /* @__PURE__ */ new Set();
var floatingNoteId = "", floatingNoteDate = "", floatingNoteCategory = "life", floatingComposingId = "";
function observeFloatingNotes(callback) {
  floatingNoteObservers.add(callback);
  return () => floatingNoteObservers.delete(callback);
}
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
  "labels",
  "labelKnown",
  "createdAt",
  "updatedAt",
  "dirty",
  "phase",
  "pending",
  "remote",
  "deleted",
  "localVersion",
  "durableText",
  "localBacked",
  "localQueued",
  "recoveredBaseline"
];
var hydratedDrafts = /* @__PURE__ */ new WeakMap();
var hydrationReady = /* @__PURE__ */ new WeakSet();
var entryIdentities = /* @__PURE__ */ new WeakMap();
var entryDraftRevision = createDraftRevisionTracker();
var legacyRecoveryGuard = createLegacyRecoveryGuard();
var entryRecoveryGuard = createEntryRecoveryGuard(draftFields);
var sendFeedbackTimers = /* @__PURE__ */ new WeakMap();
function scheduleSendFeedback(entries, expected) {
  for (const item of entries.entries.values()) {
    if (!item.manualSubmitted || item.phase !== "saved" || item.dirty || item.pending || sendFeedbackTimers.has(item)) continue;
    const attempt = item.manualSubmitted;
    const timer2 = setTimeout(() => {
      sendFeedbackTimers.delete(item);
      if (expected !== notesIdentityNow() || item.manualSubmitted !== attempt) return;
      item.manualSubmitted = null;
      paintDailyNotesPage();
    }, 2500);
    sendFeedbackTimers.set(item, timer2);
  }
}
function captureNotesDrafts(legacy, entries, category) {
  const offline = getOfflineRuntime();
  if (!offline || !hydrationReady.has(entries) || entryIdentities.get(entries) !== notesIdentityNow()) return;
  const rows = [];
  for (const [kind, values] of [["legacy", legacy.pages.values()], ["note_entry", entries.entries.values()]]) for (const item of values) {
    if (item.discarding || kind === "legacy" && legacyRecoveryGuard.unchanged(item)) continue;
    if (kind === "note_entry" && item.recoveredBaseline && !noteDraftNeedsAttention(item)) continue;
    const recoveryProof = kind === "note_entry" ? entryRecoveryGuard.proof(item) : null;
    rows.push({
      kind,
      category,
      ...Object.fromEntries(draftFields.filter((key) => item[key] !== void 0).map((key) => [key, item[key]])),
      ...recoveryProof ? { recoveryProof } : {}
    });
  }
  return offline.retainDrafts(rows);
}
async function hydrateNotesDrafts(legacy, entries, category) {
  const offline = getOfflineRuntime(), expected = entryIdentities.get(entries);
  const active5 = () => expected === notesIdentityNow();
  if (!offline || !active5()) return;
  const seen = hydratedDrafts.get(entries) || /* @__PURE__ */ new Set();
  hydratedDrafts.set(entries, seen);
  const originals = new Map(entries.entries);
  const epochs = new Map([...entries.entries].map(([id2, item]) => [id2, item.writeEpoch]));
  const revisions = new Map([...entries.entries].map(([id2, item]) => [id2, entryDraftRevision(item)]));
  const entryDrafts = await visibleArchive();
  if (!active5()) return;
  for (const { raw, record } of entryDrafts) {
    if (!raw || raw.kind !== "note_entry" || raw.category !== category || seen.has(raw.id)) continue;
    const current3 = entries.entries.get(raw.id);
    if (current3 && originals.get(raw.id) !== current3) continue;
    if (!unchangedEntrySinceSnapshot(epochs, raw.id, current3, revisions.get(raw.id), current3 && entryDraftRevision(current3))) continue;
    if (current3 && (current3.pending || current3.composing || current3.dirty)) continue;
    const restored = entries.restoreDraft(raw);
    if (restored?.recoveredBaseline) entryRecoveryGuard.remember(restored, record);
    seen.add(raw.id);
  }
  const legacyDrafts = await offline.retainedDrafts("legacy");
  if (!active5()) return;
  for (const raw of legacyDrafts) {
    if (!raw) continue;
    const key = "legacy:" + raw.date;
    if (!raw || raw.category !== category || seen.has(key)) continue;
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
    legacyRecoveryGuard.remember(item);
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
var visibleArchiveFlight = null, visibleArchiveSequence = 0, visibleArchiveTimer;
function scheduleArchiveRefresh(expected, force = false) {
  if (!force && !document.querySelector("#notes-retained-archive")) return;
  clearTimeout(visibleArchiveTimer);
  visibleArchiveTimer = setTimeout(async () => {
    const revision2 = notesDraftRevision;
    try {
      await getOfflineRuntime()?.flushDrafts();
    } catch {
      return;
    }
    if (expected !== notesIdentityNow()) return;
    if (revision2 !== notesDraftRevision) return scheduleArchiveRefresh(expected, true);
    await showRetainedArchive();
  }, 300);
}
async function visibleArchive() {
  const identity6 = notesIdentityNow(), revision2 = notesDraftRevision;
  if (visibleArchiveFlight?.identity === identity6 && visibleArchiveFlight.revision === revision2) return visibleArchiveFlight.promise;
  const promise = (async () => {
    const offline = getOfflineRuntime();
    if (!offline) return [];
    const snapshots2 = await offline.retainedDraftRecords("note_entry");
    const controller = new AbortController(), tombstones = /* @__PURE__ */ new Map();
    const active5 = () => !controller.signal.aborted && identity6 === notesIdentityNow();
    const ids = [...new Set(snapshots2.map((row) => row.data?.id).filter((id2) => /^[a-f0-9-]{36}$/i.test(id2 || "")))];
    let timer2, next = 0;
    await Promise.race([
      Promise.all(Array.from({ length: Math.min(6, ids.length) }, async () => {
        while (active5() && next < ids.length) {
          const id2 = ids[next++];
          try {
            tombstones.set(id2, await apiNetwork(
              "/note-entries/" + encodeURIComponent(id2),
              { headers: { "X-Note-Labels-Version": "3" }, suppressAuthRedirect: true, signal: controller.signal }
            ));
          } catch {
          }
        }
      })),
      new Promise((resolve) => {
        timer2 = setTimeout(() => {
          controller.abort();
          resolve();
        }, 2e3);
      })
    ]).finally(() => clearTimeout(timer2));
    const rows = uniqueRetainedDrafts(snapshots2.map((record) => record.data).filter((row) => !row || !matchesDeletedEntry(row, tombstones.get(row.id))));
    return identity6 === notesIdentityNow() ? rows.map((raw) => ({ raw, record: snapshots2.find((record) => record.data === raw) })) : [];
  })();
  visibleArchiveFlight = { identity: identity6, revision: revision2, promise };
  try {
    return await promise;
  } finally {
    if (visibleArchiveFlight?.promise === promise) visibleArchiveFlight = null;
  }
}
var archiveConfirm = "", archiveMessage = "", archiveBusy = false;
var archiveGroupKey = ({ draft_kind: kind, data: data3 }) => JSON.stringify([kind, data3?.kind, data3?.category, data3?.date, data3?.draft]);
function groupArchiveRecords(records) {
  const groups = /* @__PURE__ */ new Map();
  for (const record of records) {
    const key = archiveGroupKey(record);
    if (!groups.has(key)) groups.set(key, { key, row: record.data, records: [] });
    groups.get(key).records.push(record);
  }
  return [...groups.values()];
}
function archiveButton(text, onClick, className = "btn text") {
  const button3 = document.createElement("button");
  button3.type = "button";
  button3.className = className;
  button3.textContent = text;
  button3.disabled = archiveBusy;
  button3.addEventListener("click", onClick);
  return button3;
}
function archiveConfirmRow(key, question, expected) {
  const row = document.createElement("div"), text = document.createElement("span");
  row.className = "notes-retained-confirm";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", question);
  text.textContent = question;
  const accept = archiveButton("确认删除", () => void deleteArchiveRecords(key, expected), "btn text notes-retained-danger");
  const cancel = archiveButton("取消", () => {
    archiveConfirm = "";
    void showRetainedArchive();
  });
  row.append(text, accept, cancel);
  return row;
}
function askArchiveDelete(key) {
  archiveConfirm = key;
  archiveMessage = "";
  void showRetainedArchive();
}
function archiveRecordBusy(record) {
  const row = record.data;
  const item = row?.kind === "note_entry" && entryStores.get(row.category)?.entry(row.id);
  if (!item) return false;
  if (item.composing || item.discarding || item.localQueued || item.pending && !item.pending.uncertain) return true;
  if (item.recoveredBaseline) return !entryRecoveryGuard.proof(item);
  return Boolean(item.pending || item.dirty && item.draft === row.draft);
}
async function restoreLegacyAfterDiscard(row, expected) {
  if (row?.kind !== "legacy" || expected !== notesIdentityNow()) return;
  const remaining = await getOfflineRuntime().retainedDraftRecords("legacy");
  const item = notesStores.get(row.category)?.pages.get(row.date);
  const same2 = ({ data: data3 }) => data3?.category === row.category && data3?.date === row.date && data3?.draft === row.draft;
  if (expected === notesIdentityNow() && !remaining.some(same2) && item && legacyRecoveryGuard.unchanged(item) && item.draft === row.draft && !item.pending && !item.remote) {
    item.draft = item.serverText;
    item.dirty = false;
    item.error = "";
    item.phase = item.version ? "saved" : "empty";
    legacyRecoveryGuard.forget(item);
    paintDailyNotesPage();
  }
}
async function deleteArchiveRecords(key, expected) {
  const offline = getOfflineRuntime();
  if (!offline || archiveBusy || expected !== notesIdentityNow()) return;
  archiveBusy = true;
  archiveConfirm = "";
  archiveMessage = "正在删除…";
  await showRetainedArchive();
  let removed4 = 0, editing3 = 0, failed = 0;
  try {
    const records = [...await offline.retainedDraftRecords("legacy"), ...await offline.retainedDraftRecords("note_entry")];
    for (const record of records.filter((record2) => key === "all" || archiveGroupKey(record2) === key)) {
      if (expected !== notesIdentityNow()) return;
      if (archiveRecordBusy(record)) {
        editing3++;
        continue;
      }
      try {
        await offline.discardSelectedDraft(record);
        removed4++;
        const row = record.data;
        if (row?.kind === "note_entry") entryStores.get(row.category)?.dropRestoredDraft(row.id, row.draft);
        await restoreLegacyAfterDiscard(row, expected);
      } catch {
        failed++;
      }
    }
    archiveMessage = [
      `已删除 ${removed4} 份。`,
      editing3 && `${editing3} 份正在编辑或等待确认，已保留。`,
      failed && `${failed} 份刚刚发生变化，未删除，请再试一次。`
    ].filter(Boolean).join("");
  } finally {
    archiveBusy = false;
    if (expected === notesIdentityNow()) {
      notesDraftRevision++;
      await showRetainedArchive();
    }
  }
}
function archiveGroupSection(group, expected) {
  const { row, records } = group, section = document.createElement("section"), pre = document.createElement("pre");
  const copies = records.length > 1 ? `（相同内容 ${records.length} 份）` : "";
  const kind = row?.kind === "legacy" ? "原有记录" : "条目", category = row?.category === "work" ? "工作" : "生活";
  pre.textContent = row && `${kind} · ${category} · ${row.date}${copies}
${row.draft}`;
  section.append(pre);
  const question = `永久删除这条草稿${records.length > 1 ? `的全部 ${records.length} 份本机副本` : ""}？删除后无法恢复。`;
  if (archiveConfirm === group.key) section.append(archiveConfirmRow(group.key, question, expected));
  else section.append(archiveButton(records.length > 1 ? `删除这条（${records.length} 份）` : "删除这份草稿", () => askArchiveDelete(group.key)));
  return section;
}
function archiveBox(root3, expected) {
  let box = root3.querySelector("#notes-retained-archive");
  if (box) return box;
  box = document.createElement("details");
  box.id = "notes-retained-archive";
  box.className = "notes-drafts";
  const summary = document.createElement("summary");
  box.append(summary);
  const tools = document.createElement("div");
  tools.className = "notes-retained-tools";
  box.append(tools);
  const status = document.createElement("p");
  status.className = "notes-retained-status";
  status.setAttribute("role", "status");
  box.append(status);
  const body2 = document.createElement("div");
  body2.className = "notes-retained-texts";
  box.append(body2);
  box.addEventListener("toggle", async () => {
    if (!box.open || expected !== notesIdentityNow()) return;
    void showRetainedArchive();
  });
  root3.querySelector("#notes-drafts").after(box);
  return box;
}
async function showRetainedArchive() {
  const expected = notesIdentityNow(), revision2 = notesDraftRevision, sequence5 = ++visibleArchiveSequence;
  const offline = getOfflineRuntime();
  const records = offline ? [...await offline.retainedDraftRecords("legacy"), ...await offline.retainedDraftRecords("note_entry")] : [];
  const root3 = document.querySelector("#daily-notes");
  if (!root3 || !notesVisible() || expected !== notesIdentityNow() || sequence5 !== visibleArchiveSequence) return;
  if (revision2 !== notesDraftRevision) return scheduleArchiveRefresh(expected, true);
  if (!records.length) {
    root3.querySelector("#notes-retained-archive")?.remove();
    archiveConfirm = "";
    archiveMessage = "";
    return;
  }
  const box = archiveBox(root3, expected), groups = groupArchiveRecords(records);
  const total = records.length > groups.length ? `，共 ${records.length} 份` : "";
  box.querySelector("summary").textContent = `本机保留草稿（${groups.length} 条${total}）`;
  box.querySelector(".notes-retained-status").textContent = archiveMessage;
  box.querySelector(".notes-retained-tools").replaceChildren(
    archiveButton("导出本机保留草稿", () => void exportDraftArchive()),
    ...archiveConfirm === "all" ? [archiveConfirmRow("all", `永久删除全部 ${records.length} 份本机保留草稿？删除后无法恢复。`, expected)] : [archiveButton(`全部删除（${records.length} 份）`, () => askArchiveDelete("all"))]
  );
  if (box.open) box.querySelector(".notes-retained-texts").replaceChildren(...groups.map((group) => archiveGroupSection(group, expected)));
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
function dailyNotesTransport(category, expected, active5) {
  const request2 = async (path, options4) => {
    active5();
    const value = await api(path, options4);
    active5();
    return value;
  };
  const noteRequest = async (path, options4 = {}) => {
    active5();
    if (options4.method && options4.method !== "GET") {
      const date = options4.body?.date || dailyNotesRouteDate();
      await noteRequest("/note-entries?category=" + category + "&date=" + encodeURIComponent(date));
    }
    const value = await apiNetwork(path, { ...options4, headers: { ...options4.headers, "X-Note-Labels-Version": "3" } });
    active5();
    if (value?.labels_version !== 3) throw Object.assign(
      new Error("服务器尚不支持多标签，草稿已保留。"),
      { code: "NOTE_LABELS_VERSION", localNotSaved: !options4.method || options4.method === "GET" }
    );
    return value;
  };
  const noteRead = async (path) => {
    const cached = await request2(path, { headers: { "X-Note-Labels-Version": "1" } });
    if (isLocalDocument(cached) || cached?.entries?.some(isLocalDocument)) return cached;
    try {
      return await noteRequest(path);
    } catch (error) {
      if (error.code === "NETWORK_UNAVAILABLE") return cached;
      throw error;
    }
  };
  const noteWrite = async (path, options4) => {
    try {
      return await noteRequest(path, options4);
    } catch (error) {
      if (error.code !== "NETWORK_UNAVAILABLE") throw error;
      const body2 = options4.body || {}, labels4 = body2.labels;
      if (labels4)
        throw Object.assign(new Error("多标签修改需要联网，草稿已保留。"), { code: "OFFLINE_MULTI_LABEL", localNotSaved: true });
      const { labels: ignored, ...legacyBody } = body2;
      return request2(path, { ...options4, offlineUnknown: true, body: legacyBody, headers: { "X-Note-Labels-Version": "1" } });
    }
  };
  return { request: request2, noteRequest, noteRead, noteWrite };
}
function publishNotesChange(expected, category, stores) {
  if (expected !== notesIdentityNow()) return;
  const { legacy, entries } = stores;
  for (const item of entries.entries.values()) entryDraftRevision(item);
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
  scheduleArchiveRefresh(expected);
  return saved;
}
function openCategoryNotes(category, expected) {
  const stores = {};
  const active5 = () => {
    if (notesIdentityNow() !== expected) {
      stores.legacy.dispose();
      stores.entries.dispose();
      throw new DOMException("请求已取消", "AbortError");
    }
  };
  const { request: request2, noteRequest, noteRead, noteWrite } = dailyNotesTransport(category, expected, active5);
  const suffix = (separator) => category === "work" ? separator + "category=work" : "";
  const changed4 = () => publishNotesChange(expected, category, stores);
  const readOnly = async () => {
    throw Object.assign(new Error("原有逐日记录只读，草稿可导出。"), { code: "LEGACY_READ_ONLY" });
  };
  const legacy = createDailyNotesStore({
    delay: 400,
    load: async (date) => ({ ...await request2("/daily-notes?date=" + encodeURIComponent(date) + suffix("&")), can_edit: false }),
    put: readOnly,
    restore: readOnly,
    remove: readOnly,
    onChange: changed4,
    onSaved: changed4
  });
  stores.legacy = legacy;
  const entries = createNoteEntriesStore({
    category,
    manualSave: true,
    multiLabels: true,
    load: (date) => noteRead("/note-entries?category=" + category + "&date=" + encodeURIComponent(date)),
    loadVerified: (date) => noteRequest("/note-entries?category=" + category + "&date=" + encodeURIComponent(date)),
    loadEntry: (id2) => noteRead("/note-entries/" + encodeURIComponent(id2)),
    loadOperation: (id2) => noteRequest("/note-entries/operations/" + encodeURIComponent(id2)),
    put: (id2, body2, options4) => noteWrite("/note-entries/" + encodeURIComponent(id2), { ...options4, method: "PUT", body: body2 }),
    remove: (id2, body2, options4) => noteWrite("/note-entries/" + encodeURIComponent(id2), { ...options4, method: "DELETE", body: body2 }),
    restore: (id2, body2, options4) => noteRequest("/note-entries/" + encodeURIComponent(id2) + "/restore", { ...options4, method: "POST", body: body2 }),
    prepareDelete: async (item) => {
      const offline = getOfflineRuntime();
      if (!offline?.state.scope || expected !== notesIdentityNow() || !hydrationReady.has(entries)) return null;
      await offline.flushDrafts();
      if (expected !== notesIdentityNow()) throw new Error("身份已变化");
      const row = { kind: "note_entry", category, ...Object.fromEntries(
        draftFields.filter((key) => item[key] !== void 0).map((key) => [key, structuredClone(item[key])])
      ) };
      return { row, snapshots: await offline.retainedDraftRecords("note_entry") };
    },
    finishDelete: async ({ row, snapshots: snapshots2 }, result) => {
      const offline = getOfflineRuntime();
      if (offline && expected === notesIdentityNow()) {
        await offline.flushDrafts();
        await offline.purgeUserDeletedNoteDrafts(row, snapshots2, result, () => expected === notesIdentityNow());
        scheduleArchiveRefresh(expected, true);
      }
    },
    discardUnsent: async (item) => {
      const offline = getOfflineRuntime();
      if (!offline?.state.scope || expected !== notesIdentityNow() || !hydrationReady.has(entries))
        throw new Error("本机草稿暂不可用");
      await offline.flushDrafts();
      if (expected !== notesIdentityNow()) throw new Error("身份已变化");
      await offline.discardUnsentNoteDraft({ kind: "note_entry", category, ...Object.fromEntries(
        draftFields.filter((key) => item[key] !== void 0).map((key) => [key, item[key]])
      ) });
    },
    onChange: changed4,
    onSaved: () => {
      changed4();
      scheduleArchiveRefresh(expected, true);
    }
  });
  stores.entries = entries;
  return stores;
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
    notesArchivedLabels = [];
    notesLabelsVerified = false;
    notesLabelIntent = null;
    notesArchiveIntent = null;
    notesLabelBusy = false;
    notesLabelMessage = "";
    notesLabelSequence++;
    notesActiveCategory = "";
    floatingNoteId = "";
    floatingNoteDate = "";
    floatingNoteCategory = "life";
    floatingComposingId = "";
  }
  if (select && notesActiveCategory !== category) {
    if (category === "work") notesSelectedLabel = "工作";
    else if (notesSelectedLabel === "工作") notesSelectedLabel = "生活";
    notesActiveCategory = category;
    notesConfirmDate = "";
    notesConfirmEntry = "";
  }
  if (!notesStores.has(category)) {
    const { legacy, entries } = openCategoryNotes(category, next);
    entryIdentities.set(entries, next);
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
  await Promise.all([...pairs.flatMap(({ legacy, entries }) => [legacy.read(date), entries.read(date)]), readDailyScore(date, expected)]);
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
function joinNotesErrors(values) {
  const messages = values.filter(Boolean).map(String);
  return messages.map((message, index) => index < messages.length - 1 ? message.replace(/[。；]+$/u, "") : message).join("；");
}
function paintDailyNotesPage() {
  for (const callback of floatingNoteObservers) callback();
  paintDailyScore();
  if (!notesVisible() || notesRefreshPaused) return;
  const root3 = document.querySelector("#daily-notes");
  if (!root3 || !notesStore || !entryStore) return;
  root3.querySelector("#notes-today").hidden = notesView !== "today";
  root3.querySelector("#notes-history").hidden = notesView !== "history";
  root3.querySelector("#notes-labels").hidden = notesView !== "labels";
  for (const button3 of root3.querySelectorAll("[data-notes-view]"))
    button3.setAttribute("aria-pressed", String(button3.dataset.notesView === notesView));
  const date = dailyNotesRouteDate(), category = dailyNotesRouteCategory(), legacy = notesStore.page(date), current3 = entryStore.page(date);
  root3.querySelector("#notes-label-status").textContent = notesLabelMessage;
  const archivedNames = new Set(notesArchivedLabels.map((row) => row.name));
  const activeLabels = [.../* @__PURE__ */ new Set(["生活", "工作", ...notesLabels])].filter((name) => !archivedNames.has(name));
  const paintLabels = (selector, names, action, buttonText) => {
    const list2 = root3.querySelector(selector);
    list2.replaceChildren(...names.map((name) => {
      const item = document.createElement("li"), text = document.createElement("span"), button3 = document.createElement("button");
      text.textContent = name;
      button3.type = "button";
      button3.className = "btn text";
      button3.dataset.notesAction = action;
      button3.dataset.labelName = name;
      button3.textContent = buttonText;
      button3.setAttribute("aria-label", buttonText + "标签 " + name);
      button3.disabled = notesLabelBusy || !notesLabelsVerified;
      item.append(text, button3);
      return item;
    }));
  };
  paintLabels("#notes-label-list", activeLabels, "delete-label", "删除");
  root3.querySelector('[data-notes-action="create-label"]').disabled = notesLabelBusy || !notesLabelsVerified;
  const otherCategory = category === "life" ? "work" : "life";
  const otherStore = entryStores.get(otherCategory), otherLegacy = notesStores.get(otherCategory)?.page(date);
  const otherPage = otherStore?.page(date);
  const mixedStore = { entry: (id2) => entryStore.entry(id2) || otherStore?.entry(id2) };
  const mixed = {
    ...current3,
    ids: [...current3.ids, ...otherPage?.ids || []],
    error: joinNotesErrors([
      current3.error,
      otherPage?.error && (otherCategory === "work" ? "工作：" : "生活：") + otherPage.error,
      legacy.error && (category === "work" ? "工作原记录：" : "生活原记录：") + legacy.error,
      otherLegacy?.error && (otherCategory === "work" ? "工作原记录：" : "生活原记录：") + otherLegacy.error
    ]),
    loading: current3.loading || Boolean(otherPage?.loading) || legacy.loading || Boolean(otherLegacy?.loading),
    allLoaded: current3.loaded && Boolean(otherPage?.loaded) && legacy.loaded && Boolean(otherLegacy?.loaded) && !current3.error && !otherPage?.error && !legacy.error && !otherLegacy?.error
  };
  mixed.ids.sort((a, b) => {
    const first = mixedStore.entry(a), second = mixedStore.entry(b);
    return String(first?.createdAt || first?.localCreatedAt || "").localeCompare(String(second?.createdAt || second?.localCreatedAt || "")) || a.localeCompare(b);
  });
  const host = root3.querySelector("#notes-composer"), view = editorViews.page(category, date), active5 = view.active;
  const field2 = active5 === "legacy" ? root3.querySelector("#notes-editor") : host.querySelector('[data-note-entry-editor="' + active5 + '"]');
  const selected = editorViews.sync(
    category,
    date,
    mixed.ids.map((id2) => mixedStore.entry(id2)).filter(Boolean),
    legacy,
    { focused: host.contains(document.activeElement), composing: field2?.dataset.composing === "true" }
  );
  paintNoteEntries(
    root3,
    mixedStore,
    mixed,
    legacy,
    { drafts: retainedDrafts(), confirmId: notesConfirmEntry, active: selected.active, otherLegacy, otherCategory, labels: activeLabels, labelsVerified: notesLabelsVerified }
  );
  if (notesDraftError) {
    const message = root3.querySelector("#notes-entry-message");
    message.textContent = notesDraftError;
    message.hidden = false;
  }
  if (mixed.ids.some((id2) => mixedStore.entry(id2)?.category === "life" && !mixedStore.entry(id2)?.labelKnown)) {
    const message = root3.querySelector("#notes-entry-message");
    if (message.hidden) {
      message.textContent = "部分记录标签尚未核实，请联网读取后查看。";
      message.hidden = false;
    }
  }
  root3.querySelector("#notes-delete-confirm").hidden = true;
}
async function readNoteLabels({ afterWrite = false } = {}) {
  if (notesLabelBusy && !afterWrite) return false;
  const expected = notesIdentityNow(), sequence5 = ++notesLabelSequence;
  try {
    const data3 = await apiNetwork("/note-entries/labels", { headers: { "X-Note-Labels-Version": "3", "X-Note-Labels-Archive": "1" } });
    if (expected !== notesIdentityNow() || sequence5 !== notesLabelSequence) return;
    if (data3?.labels_version !== 3 || !Array.isArray(data3?.labels) || !Array.isArray(data3?.archived_labels) || data3.labels.some((row) => !validCustomNoteLabel(row?.name)) || data3.archived_labels.some((row) => typeof row?.name !== "string" || !(row.name === "生活" || row.name === "工作" || validCustomNoteLabel(row.name)) || typeof row.archived_at !== "string" || !Number.isFinite(Date.parse(row.archived_at))))
      throw new Error("服务器未提供可核实的归档状态。");
    notesLabels = [...new Set(data3.labels.map((row) => row.name))];
    notesArchivedLabels = [...new Map(data3.archived_labels.map((row) => [row.name, row])).values()];
    notesLabelsVerified = true;
    notesLabelMessage = "";
    paintDailyNotesPage();
    return true;
  } catch (error) {
    if (expected !== notesIdentityNow() || sequence5 !== notesLabelSequence) return;
    notesLabelsVerified = false;
    notesLabelMessage = "标签状态读取失败，请联网后重新打开标签管理：" + (error.message || "请稍后重试。");
  }
  paintDailyNotesPage();
  return false;
}
function confirmLabelDeletion(name) {
  if (!name || notesLabelBusy || !notesLabelsVerified) return false;
  const builtin = name === "生活" || name === "工作";
  const consequence = builtin ? "此标签将从可选列表隐藏，历史记录和标签关联会保留。" : "此标签及已有记录中的标签关联将被永久删除，正文保留。此操作无法撤销。";
  return window.confirm("确定删除标签“" + name + "”吗？\n\n" + consequence);
}
async function deleteNoteLabel(name) {
  if (notesLabelBusy || !notesLabelsVerified) return;
  if (!notesArchiveIntent || notesArchiveIntent.name !== name || notesArchiveIntent.action !== "delete")
    notesArchiveIntent = { name, action: "delete", save_id: crypto.randomUUID() };
  const expected = notesIdentityNow(), intent = notesArchiveIntent, date = dailyNotesRouteDate();
  ++notesLabelSequence;
  notesLabelBusy = true;
  notesLabelMessage = "";
  paintDailyNotesPage();
  try {
    const saved = await apiNetwork("/note-entries/labels", {
      method: "POST",
      body: intent,
      headers: { "X-Note-Labels-Version": "3", "X-Note-Labels-Archive": "1" }
    });
    if (expected !== notesIdentityNow()) return;
    if (saved?.labels_version !== 3 || saved.name !== name || saved.deleted !== true || !["deleted", "builtin-hidden"].includes(saved.mode)) throw new Error("服务器返回的状态无法核实。");
    ++notesLabelSequence;
    notesLabelsVerified = false;
    const verified = await readNoteLabels({ afterWrite: true });
    if (expected !== notesIdentityNow()) return;
    if (verified) {
      const active5 = ["生活", "工作", ...notesLabels].includes(name) && !notesArchivedLabels.some((row) => row.name === name);
      if (active5) notesLabelMessage = "删除结果已变化，请核对当前标签。";
      else {
        notesArchiveIntent = null;
        await readMixedNotes(date);
      }
    }
  } catch (error) {
    ++notesLabelSequence;
    if (expected === notesIdentityNow()) notesLabelMessage = "删除结果未确认，请重试或重新打开标签管理核实：" + (error.message || "请联网后重试。");
  } finally {
    notesLabelBusy = false;
    if (expected === notesIdentityNow()) paintDailyNotesPage();
  }
}
async function createNoteLabel(root3) {
  if (notesLabelBusy || !notesLabelsVerified) return;
  const input = root3.querySelector("#notes-new-label"), label3 = input.value.trim().normalize("NFC");
  if (!validCustomNoteLabel(label3)) {
    notesLabelMessage = "标签须为 1–32 个字符，且不能叫生活或工作。";
    paintDailyNotesPage();
    return;
  }
  if (notesArchivedLabels.some((row) => row.name === label3)) {
    notesLabelMessage = "该标签名称暂不可用。";
    paintDailyNotesPage();
    return;
  }
  if (!notesLabelIntent || notesLabelIntent.name !== label3) notesLabelIntent = { name: label3, save_id: crypto.randomUUID() };
  const expected = notesIdentityNow(), intent = notesLabelIntent;
  ++notesLabelSequence;
  notesLabelBusy = true;
  notesLabelMessage = "正在添加标签…";
  paintDailyNotesPage();
  try {
    const saved = await apiNetwork("/note-entries/labels", { method: "POST", body: intent, headers: { "X-Note-Labels-Version": "2" } });
    if (expected !== notesIdentityNow()) return;
    if (saved?.labels_version !== 2 || saved.name !== label3) throw new Error("标签保存结果尚未核实，请重试原请求。");
    notesLabels = [.../* @__PURE__ */ new Set([...notesLabels, label3])];
    notesLabelIntent = null;
    notesLabelMessage = "";
    input.value = "";
  } catch (error) {
    if (expected === notesIdentityNow()) notesLabelMessage = "添加失败，输入已保留，可重试：" + (error.message || "请联网后重试。");
  } finally {
    notesLabelBusy = false;
    if (expected === notesIdentityNow()) paintDailyNotesPage();
  }
}
var scoreTrend = /* @__PURE__ */ new Map(), scoreTrendMonths = /* @__PURE__ */ new Set(), scoreOpen = false;
var scoreDayBefore = (date, days) => new Date(Date.parse(date + "T00:00:00Z") - days * 864e5).toISOString().slice(0, 10);
function scoreTrendSvg(date) {
  const days = Array.from({ length: 7 }, (_, index) => scoreDayBefore(date, 6 - index));
  const points = days.map((day6, index) => scoreTrend.has(day6) ? { x: 6 + index * 12, y: 21 - (scoreTrend.get(day6) - 1) * 2, day: day6 } : null);
  if (points.filter(Boolean).length < 2) return "";
  let lines = "";
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    if (from && to) lines += '<line x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '"/>';
  }
  const dots = points.filter(Boolean).map((point) => '<circle cx="' + point.x + '" cy="' + point.y + '" r="' + (point.day === date ? 3 : 2) + '"/>').join("");
  const spoken = days.filter((day6) => scoreTrend.has(day6)).map((day6) => day6.slice(5) + " " + scoreTrend.get(day6) + " 分").join("，");
  return '<svg width="84" height="24" viewBox="0 0 84 24" role="img" aria-label="近 7 天打分：' + spoken + '">' + lines + dots + "</svg>";
}
async function readScoreTrend(date, expected = notesIdentityNow()) {
  const months = [.../* @__PURE__ */ new Set([date.slice(0, 7), scoreDayBefore(date, 6).slice(0, 7)])].filter((month) => !scoreTrendMonths.has(month));
  try {
    for (const month of months) {
      const data3 = await api("/daily-scores?month=" + encodeURIComponent(month));
      if (expected !== notesIdentityNow()) return;
      for (const item of data3.items || []) scoreTrend.set(item.date, item.score);
      scoreTrendMonths.add(month);
    }
  } catch {
  }
  if (expected === notesIdentityNow() && date === dailyNotesRouteDate()) paintDailyScore();
}
function paintDailyScore() {
  const root3 = document.querySelector("#daily-score");
  if (!root3) return;
  const date = scoreRecord.date || dailyNotesRouteDate();
  const label3 = root3.querySelector("#daily-score-label");
  if (label3) label3.textContent = date === dailyNotesToday() ? "今日打分" : date + " 打分";
  const scored = scoreRecord.score != null, open = !scored || scoreOpen || scoreRecord.pending != null;
  root3.classList.toggle("is-open", open);
  const chip = root3.querySelector("#daily-score-chip");
  if (chip) {
    chip.hidden = !scored;
    chip.textContent = (date === dailyNotesToday() ? "今日 " : date.slice(5) + " ") + scoreRecord.score + " 分";
    chip.setAttribute("aria-expanded", String(open));
    chip.setAttribute("aria-label", chip.textContent + (scoreRecord.canEdit === false ? "" : "，点击修改"));
    chip.disabled = scoreRecord.canEdit === false;
  }
  const trend = root3.querySelector("#daily-score-trend");
  if (trend) {
    if (scored) scoreTrend.set(date, scoreRecord.score);
    trend.innerHTML = scoreTrendSvg(date);
  }
  for (const button3 of root3.querySelectorAll("[data-daily-score]")) {
    button3.setAttribute("aria-pressed", String(Number(button3.dataset.dailyScore) === scoreRecord.score));
    button3.disabled = scoreRecord.canEdit === false || scoreRecord.pending != null;
  }
  const status = root3.querySelector("#daily-score-status");
  if (status) status.textContent = scoreRecord.status === "已保存" ? "" : scoreRecord.status || "";
}
async function readDailyScore(date, expected = notesIdentityNow()) {
  try {
    const data3 = await api("/daily-scores?date=" + encodeURIComponent(date));
    if (expected !== notesIdentityNow() || date !== dailyNotesRouteDate()) return;
    scoreRecord = { date, score: data3.score ?? null, version: data3.version || 0, status: "", saveId: "", pending: null, canEdit: data3.can_edit !== false };
    scoreOpen = false;
    if (data3.score != null) scoreByDate.set(date, data3.score);
    else scoreTrend.delete(date);
    void readScoreTrend(date, expected);
  } catch (error) {
    if (expected === notesIdentityNow()) scoreRecord = { date, score: null, version: 0, status: error.message || "打分读取失败", saveId: "", pending: null, canEdit: false };
  }
  paintDailyScore();
}
async function saveDailyScore(date, score) {
  if (!Number.isInteger(score) || score < 1 || score > 10 || scoreRecord.canEdit === false) return;
  const current3 = scoreRecord.date === date ? scoreRecord : { date, score: null, version: 0, saveId: "", canEdit: true };
  const saveId = current3.pending === score && current3.saveId ? current3.saveId : crypto.randomUUID();
  scoreRecord = { ...current3, date, status: "保存中…", saveId, pending: score };
  paintDailyScore();
  const expected = notesIdentityNow();
  try {
    const saved = await api("/daily-scores/" + date, { method: "PUT", body: { score, version: current3.version || 0, save_id: saveId } });
    if (expected !== notesIdentityNow()) return;
    scoreRecord = { date, score: saved.score, version: saved.version, status: "已保存", saveId: "", pending: null, canEdit: saved.can_edit !== false };
    scoreByDate.set(date, saved.score);
    scoreOpen = false;
  } catch (error) {
    if (expected !== notesIdentityNow()) return;
    if (error.status === 409) await readDailyScore(date, expected);
    if (expected !== notesIdentityNow()) return;
    scoreRecord = { ...scoreRecord, status: error.message || "保存失败，可再点一次", pending: null, saveId };
  }
  paintDailyScore();
}
function monthTime(value) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "";
}
function monthOptions(select, values, current3, allLabel) {
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || allLabel;
    return option;
  }));
  select.value = values.includes(current3) ? current3 : "";
}
function makeMonthCard(date, items, selected) {
  const button3 = document.createElement("button");
  button3.type = "button";
  button3.className = "notes-calendar-day";
  if (!date) {
    button3.disabled = true;
    button3.classList.add("is-empty");
    return button3;
  }
  const score = scoreByDate.get(date);
  button3.dataset.notesHistoryDay = date;
  button3.setAttribute("aria-pressed", String(date === selected));
  button3.setAttribute("aria-label", date + "，" + items.length + " 条记录" + (score ? "，" + score + " 分" : ""));
  const heading = document.createElement("span");
  heading.className = "notes-calendar-day-heading";
  heading.textContent = String(Number(date.slice(8)));
  button3.append(heading);
  if (score) {
    const mark = document.createElement("span");
    mark.className = "notes-score-mark";
    mark.textContent = score + "分";
    button3.append(mark);
  }
  return button3;
}
function paintHistoryRows(root3) {
  const label3 = root3.querySelector("#notes-history-label").value, weekValue = root3.querySelector("#notes-history-week").value;
  const weeks = noteMonthWeeks(historyMonth), selected = root3.querySelector("#notes-history-date").value;
  historyDate = selected;
  const grid = root3.querySelector("#notes-history-grid"), list2 = root3.querySelector("#notes-history-list");
  const shown = (item) => !label3 || (item.displayLabels || [item.displayLabel]).includes(label3);
  const visibleWeeks = weeks.filter((_, index) => !weekValue || Number(weekValue) === index + 1);
  grid.replaceChildren(...visibleWeeks.flatMap((week) => week.map((date) => makeMonthCard(date, (historyDays.get(date) || []).filter(shown), selected))));
  const timeline = root3.dataset.historyDisplay === "timeline";
  root3.querySelector(".notes-calendar-weekdays").hidden = timeline;
  grid.hidden = timeline;
  const order = root3.dataset.historyOrder === "asc" ? "asc" : "desc";
  const orderButton = root3.querySelector("[data-history-order]");
  orderButton.hidden = !timeline;
  orderButton.dataset.historyOrder = order;
  orderButton.textContent = order === "asc" ? "时间：从旧到新" : "时间：从新到旧";
  const card2 = (row) => {
    const article = document.createElement("article");
    article.className = "note-entry note-entry-saved";
    const heading = document.createElement("div");
    heading.className = "note-entry-head";
    heading.textContent = [row.displayLabel, monthTime(row.updated_at)].filter(Boolean).join(" · ");
    const text = document.createElement("div");
    text.className = "note-entry-reader";
    text.textContent = row.text;
    article.append(heading, text);
    return article;
  };
  let rows;
  if (timeline) {
    const direction = order === "asc" ? 1 : -1;
    const groups = [...historyDays.entries()].sort(([a], [b]) => direction * a.localeCompare(b)).map(([date, items]) => [date, items.filter(shown).sort((a, b) => direction * String(a.updated_at || "").localeCompare(String(b.updated_at || "")))]).filter(([, items]) => items.length);
    rows = groups.flatMap(([, items]) => items);
    list2.replaceChildren(...groups.map(([date, items]) => {
      const section = document.createElement("section");
      section.className = "notes-timeline-day";
      const heading = document.createElement("h3");
      heading.className = "notes-timeline-date";
      heading.textContent = date + (scoreByDate.get(date) ? " · " + scoreByDate.get(date) + "分" : "");
      section.append(heading, ...items.map(card2));
      return section;
    }));
  } else {
    rows = (historyDays.get(selected) || []).filter(shown);
    const dayScore = scoreByDate.get(selected);
    const scoreLine = dayScore ? Object.assign(document.createElement("p"), { className: "notes-score-mark", textContent: selected + " 打分 " + dayScore }) : null;
    list2.replaceChildren(...[scoreLine, ...rows.map(card2)].filter(Boolean));
  }
  const total = [...historyDays.values()].flat().filter(shown).length;
  root3.querySelector("#notes-history-summary").textContent = historyMonth + " · " + total + " 条已同步记录";
  root3.querySelector("#notes-history-status").textContent = rows.length ? "待同步内容请在原日期查看。" : !total && !label3 ? "本月没有已同步记录。" : "所选日期没有符合条件的已同步记录。";
}
function applyHistoryMonth(root3, month, days, chosenDate) {
  const weeks = noteMonthWeeks(month), dates = weeks.flat().filter(Boolean);
  const dateSelect = root3.querySelector("#notes-history-date"), labelSelect = root3.querySelector("#notes-history-label");
  const oldLabel = labelSelect.value, oldDate = dateSelect.value;
  const selected = dates.includes(chosenDate) ? chosenDate : dates.includes(oldDate) ? oldDate : dates[0];
  historyMonth = month;
  historyDays = days;
  root3.dataset.historyLoadedMonth = month;
  root3.querySelector("#notes-history-month").value = month;
  monthOptions(dateSelect, dates, selected, "");
  monthOptions(root3.querySelector("#notes-history-week"), ["", ...weeks.map((_, index) => String(index + 1))], "", "全部周次");
  const labels4 = ["", .../* @__PURE__ */ new Set(["生活", "工作", ...[...days.values()].flat().flatMap((row) => row.displayLabels || [row.displayLabel])])];
  monthOptions(labelSelect, labels4, oldLabel, "全部标签");
  paintHistoryRows(root3);
}
async function loadHistory(month = "", chosenDate = "") {
  const root3 = document.querySelector("#daily-notes"), expected = notesIdentityNow();
  if (!root3) return;
  const target = month || historyMonth || dailyNotesToday().slice(0, 7);
  if (coalesceNoteMonthFlight(historyActiveLoad, { root: root3, target, expected, sequence: historySequence, chosenDate })) return;
  const sequence5 = ++historySequence;
  historyActiveLoad = { root: root3, target, expected, sequence: sequence5, chosenDate };
  const active5 = () => notesVisible() && notesView === "history" && sequence5 === historySequence && expected === notesIdentityNow();
  const status = root3.querySelector("#notes-history-status");
  status.textContent = "";
  try {
    const value = await apiNetwork(
      "/note-entries/month?month=" + encodeURIComponent(target),
      { headers: { "X-Note-Labels-Version": "3" } }
    );
    const days = checkedNoteMonth(value, target);
    if (!active5()) return;
    try {
      const scored = await api("/daily-scores?month=" + encodeURIComponent(target));
      if (active5() && scored?.month === target && Array.isArray(scored.items))
        scoreByDate = new Map(scored.items.map((item) => [item.date, item.score]));
    } catch {
    }
    if (!active5()) return;
    applyHistoryMonth(root3, target, days, historyActiveLoad.chosenDate || historyDate || dailyNotesRouteDate());
  } catch (error) {
    if (!active5()) return;
    status.textContent = "月记录读取失败，保留当前内容：" + (error.message || "请联网重试。");
    if (historyMonth) root3.querySelector("#notes-history-month").value = historyMonth;
  } finally {
    if (historyActiveLoad?.sequence === sequence5) historyActiveLoad = null;
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
function shiftedNotesDate(date, delta2) {
  return new Date(Date.parse(date + "T12:00:00Z") + delta2 * 864e5).toISOString().slice(0, 10);
}
function openEditor(key) {
  editorViews.activate(dailyNotesRouteCategory(), dailyNotesRouteDate(), key);
  paintDailyNotesPage();
  const editor = key === "legacy" ? document.querySelector("#notes-editor") : document.querySelector('#notes-active-entry [data-note-entry-editor="' + key + '"]');
  editor?.focus();
  document.querySelector("#notes-composer")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
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
  document.addEventListener("change", async (event) => {
    if (notesVisible() && event.target.dataset.noteLabel) {
      const itemId = event.target.dataset.noteLabel, source = [...entryStores.values()].find((store) => store.entry(itemId));
      const selected = [...event.target.closest(".note-entry-label-options").querySelectorAll("input:checked")].map((input) => input.value);
      if (!source?.relabelDraft(itemId, selected)) paintDailyNotesPage();
    } else if (notesVisible() && event.target.id === "notes-date") void selectDailyNotesDate(event.target.value);
    else if (notesVisible() && event.target.id === "notes-history-date") {
      const root3 = event.target.closest("#daily-notes"), week = root3.querySelector("#notes-history-week");
      if (week.value && !noteMonthWeeks(historyMonth)[Number(week.value) - 1]?.includes(event.target.value)) week.value = "";
      paintHistoryRows(root3);
    } else if (notesVisible() && event.target.id === "notes-history-week") {
      const root3 = event.target.closest("#daily-notes"), week = Number(event.target.value);
      const date = root3.querySelector("#notes-history-date"), dates = noteMonthWeeks(historyMonth)[week - 1];
      if (dates && !dates.includes(date.value)) date.value = dates.find(Boolean);
      paintHistoryRows(root3);
    } else if (notesVisible() && event.target.id === "notes-history-label") paintHistoryRows(event.target.closest("#daily-notes"));
    else if (notesVisible() && event.target.id === "notes-history-month" && validNoteMonth(event.target.value)) void loadHistory(event.target.value);
  });
}
async function handleEntryAction(target, entries) {
  const id2 = target.closest("[data-note-entry]")?.dataset.noteEntry, item = entries.entry(id2);
  if (!item) return;
  const action = target.dataset.noteEntryAction;
  if (action === "edit") openEditor(id2);
  else if (action === "save") {
    const attempt = /* @__PURE__ */ Symbol("note-send");
    item.manualSubmitted = attempt;
    const category = dailyNotesRouteCategory(), date = dailyNotesRouteDate();
    const revision2 = editorViews.page(category, date).revision;
    await entries.save(id2);
    if (!item.dirty && !item.pending && ["saved", "queued", "cached"].includes(item.phase)) {
      editorViews.requestCollapse(category, date, id2, revision2, { explicit: true });
    }
    paintDailyNotesPage();
  } else if (action === "restore") await entries.restoreEntry(id2);
  else if (action === "delete") {
    notesConfirmEntry = id2;
    paintDailyNotesPage();
  } else if (action === "cancel-delete") {
    notesConfirmEntry = "";
    paintDailyNotesPage();
  } else if (action === "confirm-delete") {
    const view = editorViews.page(item.category, item.date), revision2 = view.revision;
    notesConfirmEntry = "";
    await entries.deleteEntry(id2);
    if ((!entries.entry(id2) || entries.entry(id2).deleted && !entries.entry(id2).pending) && view.active === id2 && view.revision === revision2)
      editorViews.activate(item.category, item.date, "");
    paintDailyNotesPage();
  } else if (action === "check") {
    if (item.phase === "unknown") await entries.reconcile(id2);
    else await entries.readOne(id2);
  } else if (action === "retry") await entries.retryPending(id2);
  else if (action === "use-server") entries.useServer(id2);
  else if (action === "use-draft") await entries.useDraft(id2);
}
async function handleNotesClick(event) {
  if (!notesVisible() || notesRefreshPaused) return;
  const root3 = document.querySelector("#daily-notes");
  const target = event.target.closest("[data-notes-action],[data-notes-date],[data-notes-category],[data-note-entry-action],[data-notes-view],[data-notes-month],[data-notes-history-day],[data-history-display],[data-history-order],[data-daily-score],[data-daily-score-toggle]");
  if (target?.matches("[data-daily-score-toggle]")) {
    scoreOpen = !scoreOpen;
    paintDailyScore();
    return;
  }
  if (!target || !root3?.contains(target)) return;
  event.preventDefault();
  if (target.dataset.dailyScore) {
    await saveDailyScore(dailyNotesRouteDate(), Number(target.dataset.dailyScore));
    return;
  }
  if (target.dataset.historyOrder) {
    root3.dataset.historyOrder = target.dataset.historyOrder === "asc" ? "desc" : "asc";
    if (historyMonth) paintHistoryRows(root3);
    return;
  }
  if (target.dataset.historyDisplay) {
    root3.dataset.historyDisplay = target.dataset.historyDisplay;
    for (const button3 of root3.querySelectorAll("[data-history-display]")) button3.setAttribute("aria-pressed", String(button3 === target));
    if (historyMonth) paintHistoryRows(root3);
    return;
  }
  if (target.dataset.notesMonth) {
    const month = historyMonth || dailyNotesToday().slice(0, 7);
    await loadHistory(shiftNoteMonth(month, target.dataset.notesMonth === "prev" ? -1 : 1));
    return;
  }
  if (target.dataset.notesHistoryDay) {
    root3.querySelector("#notes-history-date").value = target.dataset.notesHistoryDay;
    paintHistoryRows(root3);
    return;
  }
  if (target.dataset.notesView) {
    notesView = ["history", "labels"].includes(target.dataset.notesView) ? target.dataset.notesView : "today";
    historySequence++;
    paintDailyNotesPage();
    if (notesView === "history") await loadHistory();
    else if (notesView === "labels") await readNoteLabels();
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
    const id2 = target.closest("[data-note-entry]")?.dataset.noteEntry;
    const owner2 = [...entryStores.values()].find((candidate) => candidate.entry(id2));
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
    root3.dataset.category = category;
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
    const item = entries.start(date);
    if (item) openEditor(item.id);
  } else if (action === "create-label") await createNoteLabel(root3);
  else if (action === "delete-label" && confirmLabelDeletion(target.dataset.labelName)) await deleteNoteLabel(target.dataset.labelName);
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
    getComposing: (id2) => floatingComposingId === id2 || document.querySelector('[data-note-entry-editor="' + id2 + '"]')?.dataset.composing === "true"
  }));
  window.addEventListener("haoduoyu:before-refresh", (event) => {
    if (typeof event.detail?.waitUntil !== "function" || notesIdentity !== notesIdentityNow()) return;
    const resumes = [], expected = notesIdentityNow(), root3 = document.querySelector("#daily-notes");
    const controls2 = [...root3?.querySelectorAll("button,input,select") || []].map((control) => [control, control.disabled]);
    const field2 = root3?.querySelector("#notes-active-entry textarea"), readOnly = field2?.readOnly;
    const wasInert = root3?.inert;
    notesRefreshPaused = true;
    if (root3) root3.inert = true;
    for (const [control] of controls2) control.disabled = true;
    if (field2) field2.readOnly = true;
    event.detail.onFailure?.(() => {
      for (const resume of resumes) resume();
      if (expected !== notesIdentityNow()) return;
      notesRefreshPaused = false;
      if (root3) root3.inert = wasInert;
      for (const [control, disabled] of controls2) control.disabled = disabled;
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
    let signature2 = "";
    offline.subscribe((value) => {
      const next = JSON.stringify([value.pending, value.conflicts, value.lastSuccess, value.phase]);
      if (next === signature2 || value.phase === "syncing") return;
      signature2 = next;
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
  void readNoteLabels();
  await readMixedNotes(date);
  if (expected !== notesIdentityNow()) return;
  const historyRoot = document.querySelector("#daily-notes");
  if (notesView === "history" && (!historyMonth || historyRoot?.dataset.historyLoadedMonth !== historyMonth))
    void loadHistory(historyMonth, historyDate);
}
function selectedFloatingEntry(store, id2, date) {
  const item = id2 && store?.entry(id2);
  return item && item.date === date && !item.deleted ? item : null;
}
function floatingNotesSnapshot() {
  if (notesIdentity !== notesIdentityNow()) return null;
  const date = dailyNotesToday(), store = entryStores.get(floatingNoteCategory), page = entryStores.get("life")?.page(date);
  const item = selectedFloatingEntry(store, floatingNoteId, floatingNoteDate);
  const entries = [], errors = [];
  for (const category of ["life", "work"]) {
    const source = entryStores.get(category), current3 = source?.page(date);
    if (current3?.error) errors.push(current3.error);
    for (const id2 of current3?.ids || []) {
      const value = source.entry(id2);
      if (value && !value.deleted && (value.version || value.localVersion || value.dirty || value.pending)) entries.push(value);
    }
    const legacy = notesStores.get(category)?.page(date);
    if (legacy?.error) errors.push(legacy.error);
    if (legacy && (!legacy.deleted || legacy.dirty || legacy.pending) && (legacy.version || legacy.dirty || legacy.pending))
      entries.push({
        id: "legacy-" + category,
        category,
        legacy: true,
        draft: legacy.dirty ? legacy.draft : legacy.serverText,
        updatedAt: legacy.updatedAt
      });
  }
  entries.sort((a, b) => String(a.createdAt || a.localCreatedAt || a.updatedAt || "").localeCompare(
    String(b.createdAt || b.localCreatedAt || b.updatedAt || "")
  ));
  const archived = new Set(notesArchivedLabels.map((row) => row.name));
  return {
    date,
    page,
    item,
    entries,
    error: errors.join("；"),
    labels: [.../* @__PURE__ */ new Set(["生活", "工作", ...notesLabels])].filter((name) => !archived.has(name)),
    labelsVerified: notesLabelsVerified,
    labelError: notesLabelMessage,
    draftError: notesDraftError
  };
}
async function loadFloatingNotes() {
  if (!state.me) return;
  registerDailyNotesEvents();
  ensureDailyNotesStore();
  const date = dailyNotesToday(), expected = notesIdentityNow();
  void readNoteLabels();
  await readMixedNotes(date);
  if (expected === notesIdentityNow()) {
    floatingNoteEntry(false);
    paintDailyNotesPage();
  }
}
function floatingNoteEntry(create = false) {
  if (!state.me || notesIdentity !== notesIdentityNow() || notesRefreshPaused) return null;
  const date = dailyNotesToday(), store = entryStores.get(floatingNoteCategory);
  if (!store) return null;
  const selected = selectedFloatingEntry(store, floatingNoteId, floatingNoteDate);
  if (selected) return selected;
  const page = store.page(date);
  const candidate = page.ids.map((id2) => store.entry(id2)).find((item2) => item2 && !item2.version && !item2.localVersion && (item2.dirty || item2.pending || ["unknown", "conflict", "error", "oversize"].includes(item2.phase)));
  const item = candidate || (create ? store.start(date) : null);
  if (item) {
    floatingNoteId = item.id;
    floatingNoteDate = date;
  }
  return item;
}
function hasFloatingNoteDraft() {
  return retainedDrafts().some((item) => item.dirty || item.pending || item.phase === "unknown");
}
function selectFloatingNote(id2, category) {
  if (!["life", "work"].includes(category) || notesIdentity !== notesIdentityNow()) return;
  const item = entryStores.get(category)?.entry(id2);
  if (!item || item.date !== dailyNotesToday() || item.deleted) return;
  floatingNoteId = id2;
  floatingNoteDate = item.date;
  floatingNoteCategory = category;
  paintDailyNotesPage();
}
function newFloatingNote() {
  floatingNoteId = "";
  floatingNoteDate = "";
  floatingNoteCategory = "life";
  floatingNoteEntry(true);
  paintDailyNotesPage();
}
function markFloatingNoteComposing(value) {
  floatingComposingId = value ? floatingNoteId : "";
}
function editFloatingNote(text, composing = false) {
  const item = floatingNoteEntry(true);
  if (item) entryStores.get(item.category).edit(item.id, text, { composing });
}
function labelFloatingNote(labels4) {
  const item = floatingNoteEntry(true);
  if (!item || !notesLabelsVerified) return false;
  return entryStores.get(item.category).relabelDraft(item.id, labels4);
}
async function sendFloatingNote() {
  const item = floatingNoteEntry(false), store = item && entryStores.get(item.category);
  if (!item || !store || item.date !== dailyNotesToday()) return;
  const selectedId = floatingNoteId, selectedDate2 = floatingNoteDate, selectedCategory = floatingNoteCategory;
  item.manualSubmitted = /* @__PURE__ */ Symbol("note-send");
  await store.save(item.id);
  if (floatingNoteId === selectedId && floatingNoteDate === selectedDate2 && floatingNoteCategory === selectedCategory && !item.dirty && !item.pending && ["saved", "queued", "cached"].includes(item.phase)) {
    floatingNoteId = "";
    floatingNoteDate = "";
    floatingNoteCategory = "life";
  }
  paintDailyNotesPage();
}
async function checkFloatingNote(retry = false) {
  const item = floatingNoteEntry(false), store = item && entryStores.get(item.category);
  if (!item || !store) return;
  if (retry) await store.retryPending(item.id);
  else if (item.phase === "unknown") await store.reconcile(item.id);
  paintDailyNotesPage();
}

// web/pages/memos.mjs
init_dom();
var button = (action, label3, extra = "") => '<button type="button" class="btn" data-memo-action="' + action + '" ' + extra + ">" + label3 + "</button>";
function renderMemos() {
  return '<section id="memos" data-pane="groups" aria-label="长期备忘录"><div class="memo-toolbar"><div class="memo-mobile-back">' + button("back-notes", "‹ 返回笔记") + '</div><div class="memo-toolbar-actions">' + button("exit-trash", "‹ 返回工作台设置", "hidden") + button("login", "所有者登录", "hidden") + "</div></div>" + button("empty-trash", "清空回收站", "hidden") + '<p id="memo-error" class="memo-message" role="alert" hidden></p><div id="memo-operation" class="memo-message" hidden><p id="memo-operation-text" role="status"></p>' + button("operation-check", "核对操作结果") + button("operation-retry", "重试同一操作", "hidden") + '</div><section id="memo-recovery" class="memo-recovery" aria-label="找回本机草稿" hidden><div class="memo-panel-head"><h2>找回本机草稿</h2>' + button("close-recovery", "关闭") + '</div><p id="memo-recovery-status" role="status"></p><div id="memo-recovery-list"></div><div id="memo-recovery-detail" hidden><p id="memo-recovery-selected"></p><label for="memo-recovery-copy">草稿文字（可选中复制）</label><textarea id="memo-recovery-copy" readonly></textarea>' + button("restore-draft", "恢复此草稿并核对") + '</div></section><section id="memo-dialog" class="memo-dialog" aria-labelledby="memo-dialog-heading" hidden><h3 id="memo-dialog-heading"></h3><p id="memo-dialog-description"></p><label id="memo-dialog-label" for="memo-dialog-title">名称</label><input id="memo-dialog-title" class="input" maxlength="120" autocomplete="off"><div class="memo-dialog-actions">' + button("cancel", "取消") + button("confirm", "确认") + '</div></section><div class="memo-layout"><aside class="memo-library" aria-label="备忘录目录"><div class="memo-panel-head"><h2 id="memo-groups-heading">目录</h2>' + button("new-note", '<span class="memo-add-page-visual"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="m8 16 1-3 6.8-6.8 2 2L11 15l-3 1Z"/></svg><span>添加页</span></span>', 'hidden aria-label="添加页" title="添加页"') + '</div><div id="memo-group-list" class="memo-list"></div></aside><div id="memo-resizer" class="memo-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整笔记列表宽度" aria-controls="memo-group-list memo-document" aria-valuemin="160" aria-valuemax="480" aria-valuenow="240" title="拖动调整列表与正文比例；方向键微调，Home / End 到边界"></div><article class="memo-editor" aria-label="笔记内容"><div id="memo-save-notice" class="memo-save-notice" hidden><span id="memo-status" role="status" aria-live="polite" hidden></span><span id="memo-note-error" role="alert" hidden></span><div id="memo-drafts" class="memo-drafts" hidden></div>' + button("recovery", "找回本机草稿", "hidden") + '</div><p id="memo-empty" class="memo-empty">选择一篇笔记，长期记录常用信息。</p><div id="memo-document" hidden><div class="memo-document-heading"><div class="memo-heading-title"><label for="memo-title" class="sr-only">笔记标题</label><input id="memo-title" class="memo-title" maxlength="120" placeholder="笔记标题" autocomplete="off"><h2 id="memo-read-title" class="memo-read-title" hidden></h2><time id="memo-edited-at" class="memo-edited-at" hidden></time></div>' + button("fullscreen", '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" aria-hidden="true"><path d="M14 4h6v6m0-6-7 7M10 20H4v-6m0 6 7-7" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'aria-label="放大正文" title="放大正文" aria-expanded="false"') + '</div><label for="memo-body" class="sr-only">笔记正文</label><textarea id="memo-body" class="memo-body" placeholder="写下需要长期记住的信息…"></textarea><div id="memo-read-body" class="memo-read-body" tabindex="0" hidden></div><div class="memo-document-footer"><span id="memo-detail"></span><div id="memo-note-actions" hidden><details class="memo-document-menu"><summary aria-label="笔记操作">⋯</summary><div class="memo-context-actions">' + button("save", "立即保存") + button("delete-note", "删除笔记") + button("restore-note", "恢复笔记", "hidden") + '</div></details></div></div><div id="memo-resolution" class="memo-resolution" hidden>' + button("check", "核对服务器结果") + button("retry", "重试同一保存", "hidden") + '<div id="memo-conflict" hidden><h3>服务器上的内容</h3><pre id="memo-remote"></pre>' + button("use-server", "采用服务器内容") + button("use-draft", "用此草稿保存到新版本") + '</div></div></div></article></div><dialog id="memo-fullscreen" aria-label="备忘录正文全屏"></dialog></section>';
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
function paintEditedTime(node2, item) {
  const local = item.localQueued && item.localUpdatedAt;
  const value = local || item.updated_at;
  const timestamp5 = value && Date.parse(value);
  node2.hidden = !Number.isFinite(timestamp5);
  node2.dateTime = node2.hidden ? "" : value;
  node2.textContent = node2.hidden ? "" : new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(timestamp5);
}
function listButton(kind, row, current3, subtitle = "") {
  return '<button type="button" class="memo-list-item' + (row.id === current3 ? " is-selected" : "") + '" data-memo-' + kind + '="' + e(row.id) + '" aria-pressed="' + (row.id === current3) + '"><span>' + e(row.title) + "</span>" + (subtitle ? "<small>" + e(subtitle) + "</small>" : "") + "</button>";
}
function flatNoteRow(note, store) {
  const s = store.state, group = s.groups.find((row) => row.id === note.group_id);
  const deleted2 = Boolean(note.deleted_at || group?.deleted_at), extra = ' data-memo-target="' + e(note.id) + '"';
  const control = !s.canEdit ? "" : s.trash ? button("restore-note", "恢复", extra) : button("delete-note", "×", extra + ' aria-label="删除' + e(note.title) + '" title="移至回收站"');
  const removed4 = note.deleted_at || group?.deleted_at;
  const days = removed4 ? Math.max(0, 30 - Math.floor((Date.now() - Date.parse(removed4)) / 864e5)) : 0;
  const retention = s.trash ? '<small class="memo-retention">' + (days ? "30天恢复期 · 剩余" + days + "天" : "已超过30天") + "</small>" : "";
  return '<div class="memo-flat-row">' + listButton("note", note, s.noteId) + control + retention + "</div>";
}
function paintLists(root3, store) {
  const s = store.state, find = (q) => root3.querySelector(q);
  find("#memo-groups-heading").textContent = s.trash ? "回收站" : "";
  find("#memo-groups-heading").hidden = !s.trash || Boolean(root3.closest(".workbench-settings"));
  const notes = s.notes.filter((note) => {
    const group = s.groups.find((row) => row.id === note.group_id);
    return Boolean(note.deleted_at || group?.deleted_at) === s.trash;
  });
  const html = notes.map((note) => flatNoteRow(note, store)).join("") || '<p class="memo-empty">' + (s.trash ? "回收站是空的。" : "点 ＋ 开始记录。") + "</p>";
  const list2 = find("#memo-group-list");
  if (list2.innerHTML !== html) list2.innerHTML = html;
  find('[data-memo-action="new-note"]').hidden = !s.canEdit || s.trash;
  root3.querySelectorAll('.memo-flat-row button,[data-memo-action="new-note"]').forEach((button3) => {
    button3.disabled = Boolean(s.operation?.pending);
  });
}
function paintDrafts(root3, store) {
  const drafts = [...store.drafts.values()].filter((item) => ["unknown", "conflict", "offline", "error"].includes(item.phase) || item.id !== store.state.noteId && (item.dirty || item.pending));
  const box = root3.querySelector("#memo-drafts");
  box.hidden = store.state.trash || !store.state.canEdit || !drafts.length;
  box.innerHTML = "<span>本机保留的草稿：</span>" + drafts.map((item) => '<button type="button" class="btn text" data-memo-draft="' + e(item.id) + '">' + e(item.title || "未命名笔记") + "</button>").join("");
}
function paintDocument(root3, store) {
  const s = store.state, item = store.drafts.get(s.noteId), find = (q) => root3.querySelector(q);
  find("#memo-empty").hidden = Boolean(item);
  find("#memo-empty").textContent = s.trash ? "选择笔记查看" : "选择一篇笔记";
  find("#memo-document").hidden = !item;
  if (!item) {
    find("#memo-note-error").hidden = true;
    find("#memo-note-error").textContent = "";
    return;
  }
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
  root3.querySelector('#memo-note-actions [data-memo-action="delete-note"]').hidden = true;
  const restore = root3.querySelector('#memo-note-actions [data-memo-action="restore-note"]');
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
function paintMemos(root3, store) {
  if (!root3) return;
  const s = store.state, item = store.drafts.get(s.noteId), find = (q) => root3.querySelector(q);
  root3.dataset.pane = s.pane;
  const actual = phases[item?.phase] || "已保存", routine = ["dirty", "saving", "saved", "loading"].includes(item?.phase) || !item;
  find("#memo-status").textContent = s.loading ? "" : !s.canEdit ? "公开只读" : routine ? "自动保存" : actual;
  find("#memo-status").hidden = s.loading || s.trash || s.canEdit && routine;
  find("#memo-status").setAttribute("aria-label", actual);
  find("#memo-status").dataset.phase = item?.phase || "saved";
  find("#memo-error").hidden = !s.error && !s.storageError;
  find("#memo-error").textContent = [s.error, s.storageError].filter(Boolean).join(" ");
  find('[data-memo-action="login"]').hidden = s.canEdit || s.loading;
  if (!s.canEdit) find("#memo-recovery").hidden = true;
  find('[data-memo-action="exit-trash"]').hidden = !s.trash || root3.closest(".workbench-settings") !== null;
  find('[data-memo-action="back-notes"]').hidden = s.pane !== "editor";
  const operation2 = s.operation;
  find("#memo-operation").hidden = !operation2?.error && operation2?.phase !== "unknown";
  find("#memo-operation-text").textContent = operation2?.error || (operation2?.phase === "saving" ? "正在保存操作…" : "操作结果待核对");
  find('[data-memo-action="operation-check"]').hidden = operation2?.phase !== "unknown";
  find('[data-memo-action="operation-retry"]').hidden = operation2?.phase !== "unknown" || !operation2?.retryReady;
  paintLists(root3, store);
  paintDrafts(root3, store);
  paintDocument(root3, store);
  const recovery = find('[data-memo-action="recovery"]');
  recovery.hidden = !s.canEdit || s.trash || find("#memo-drafts").hidden && find("#memo-note-error").hidden && !["error", "offline", "unknown", "conflict"].includes(item?.phase);
  find("#memo-save-notice").hidden = find("#memo-status").hidden && find("#memo-note-error").hidden && find("#memo-drafts").hidden && recovery.hidden;
}

// web/core/memos-local.mjs
init_document();
var fields4 = ["group_id", "title", "body", "position"];
var changed2 = (a, b) => fields4.some((field2) => a[field2] !== b?.[field2]);
function memoLocalProtocol(context) {
  function reset2(item, value) {
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
    const data3 = documentState(value), local = documentValue(value);
    return {
      ...local,
      version: data3.server?.version || 0,
      localVersion: local.version,
      localQueued: Boolean(data3.operation) || Boolean(data3.conflict),
      server: data3.server
    };
  }
  function index(value) {
    return { ...value, groups: value.groups.map(row), notes: value.notes.map(row) };
  }
  return { accept, reset: reset2, row, index };
}

// web/core/memos-state.mjs
init_document();
var MEMOS_MAX_BYTES = 65536;
var memoBytes = (value) => new TextEncoder().encode(value).length;
var idPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var cleanTitle = (value) => typeof value === "string" && value.trim() && [...value].length <= 120;
var noteFields = ["group_id", "title", "body", "position"];
var changed3 = (item, value) => noteFields.some((field2) => item[field2] !== value[field2]);
var isUncertain = (item) => item.pending || ["unknown", "conflict"].includes(item.phase);
function checkedNote(value, id2) {
  if (!value || value.id !== id2 || !idPattern.test(value.group_id) || !cleanTitle(value.title) || typeof value.body !== "string" || memoBytes(value.body) > MEMOS_MAX_BYTES || !Number.isSafeInteger(value.version) || value.version < 1 || !Number.isSafeInteger(value.position))
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
function makeContext(options4) {
  const { request: request2, ownerId = "", storage: storage2, onChange = () => {
  }, uuid: uuid5 = () => globalThis.crypto.randomUUID(), delay = 700 } = options4;
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
  const context = { state: state2, drafts: /* @__PURE__ */ new Map(), request: request2, ownerId, storage: storage2, uuid: uuid5, delay, disposed: false, hydrated: false, loadSequence: 0 };
  context.draftScope = options4.draftScope || uuid5();
  context.restoreDraftScope = options4.restoreDraftScope;
  context.storagePersistent = options4.storagePersistent !== false && Boolean(options4.draftScope);
  context.online = options4.online || (() => globalThis.navigator?.onLine !== false);
  context.durable = options4.durable === true;
  context.readLocal = options4.readLocal;
  context.resolveLocal = options4.resolveLocal;
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
    const list2 = state2[kind], index = list2.findIndex((row2) => row2.id === value.id);
    const row = { ...value };
    if (kind === "notes") delete row.body;
    if (index < 0) list2.push(row);
    else list2[index] = row;
    list2.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
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
    const drafts = [...context.drafts.values()].filter((item) => item.dirty || item.pending || item.phase === "conflict").slice(0, 200).map(({ timer: timer2, ...item }) => ({ ...item, loading: false }));
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
      const current3 = context.storage?.getItem(key());
      const saved = JSON.parse(current3 ?? (previousKey() ? context.storage?.getItem(previousKey()) : null) ?? "{}");
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
    const current3 = context.drafts.get(item.id);
    if (current3 && (current3.dirty || current3.pending)) {
      if (changed3(current3, item) || current3.version !== item.version || current3.pending?.body.save_id !== item.pending?.body.save_id) {
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
  async function selectNote(id2, { open = true, select = true, local = false } = {}) {
    if (context.disposed || !idPattern.test(id2)) return;
    const { state: state2, drafts } = context;
    if (select) {
      state2.noteId = id2;
      if (open) state2.pane = "editor";
    }
    let item = drafts.get(id2);
    if (!item) {
      item = newDraft({ id: id2, title: "", body: "", version: 0 });
      drafts.set(id2, item);
    }
    if (select && item.group_id) state2.groupId = item.group_id;
    if (item.version === 0 && item.dirty && !item.localQueued && item.phase !== "conflict" && !(context.durable && item.autosaveHeld)) {
      context.emit();
      return;
    }
    const reschedule = context.durable && (item.localQueued || Boolean(item.timer));
    const sequence5 = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true;
    context.emit();
    try {
      const raw = await (local && context.readLocal ? context.readLocal("/memos/notes/" + id2) : context.request("/memos/notes/" + id2));
      if (context.disposed || sequence5 !== item.sequence || epoch !== item.writeEpoch || item.pending) return;
      if (isLocalDocument(raw)) {
        context.local.accept(item, raw);
        return;
      }
      const value = checkedNote(raw, id2);
      if (select && state2.noteId === id2) state2.groupId = value.group_id;
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
      if (!context.disposed && sequence5 === item.sequence) {
        item.error = error.message;
        if (!isUncertain(item)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence5 === item.sequence) {
        item.loading = false;
        context.emit();
        if (reschedule) context.schedule(item);
      }
    }
  }
  async function load({ local = false } = {}) {
    const { state: state2 } = context, sequence5 = ++context.loadSequence;
    state2.loading = true;
    state2.error = "";
    context.emit();
    try {
      const raw = await (local && context.readLocal ? context.readLocal("/memos") : context.request("/memos"));
      if (context.disposed || sequence5 !== context.loadSequence) return;
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
      if (!context.disposed && sequence5 === context.loadSequence) state2.error = error.message;
    } finally {
      if (!context.disposed && sequence5 === context.loadSequence) {
        state2.loading = false;
        context.emit();
      }
    }
  }
  async function selectGroup(id2) {
    const group = context.state.groups.find((row) => row.id === id2 && (context.state.trash || !row.deleted_at));
    if (!group) return;
    context.state.groupId = id2;
    context.state.noteId = "";
    context.state.pane = "notes";
    const note = context.state.notes.find((row) => row.group_id === id2 && (context.state.trash || !row.deleted_at));
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
  async function saveNote(id2 = context.state.noteId) {
    const item = context.drafts.get(id2);
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
      id: id2,
      path: "/memos/notes/" + id2,
      method: "PUT",
      body: { ...body2, version: item.localQueued ? item.localVersion : item.version, save_id: context.uuid() },
      snapshot
    });
  }
  async function createNote(groupId, title = "新笔记") {
    if (!context.writable() || !context.state.groups.some((group) => group.id === groupId && !group.deleted_at)) return;
    const id2 = context.uuid(), position = Math.min(1e6, Math.max(0, ...context.state.notes.map((note) => note.position)) + 1);
    const item = newDraft({ id: id2, group_id: groupId, title, body: "", position, version: 0, deleted_at: null });
    item.dirty = true;
    item.phase = "dirty";
    item.server = null;
    context.drafts.set(id2, item);
    context.state.groupId = groupId;
    context.state.noteId = id2;
    context.state.pane = "editor";
    context.upsert("notes", item);
    context.emit();
    await saveNote(id2);
    return id2;
  }
  return { edit, sendNote, saveNote, createNote };
}
function resolution(context) {
  async function checkNote(id2 = context.state.noteId) {
    const item = context.drafts.get(id2), pending = item?.pending;
    if (!context.writable() || !item) return;
    if (!pending) return context.selectNote(id2, { open: false });
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
      if (receipt?.found !== true || receipt.kind !== "notes" || receipt.id !== id2) throw new Error("保存收据不匹配。");
      const value = checkedNote(await context.request("/memos/notes/" + id2), id2);
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
  async function retryPending(id2 = context.state.noteId) {
    const item = context.drafts.get(id2), pending = item?.pending;
    if (!context.writable() || item?.phase !== "unknown" || !pending?.retryReady || pending.checking) return;
    pending.retryReady = false;
    return context.sendNote(item, pending);
  }
  function useServer(id2 = context.state.noteId) {
    const item = context.drafts.get(id2);
    if (!context.writable() || !item?.remote || item.pending || item.phase !== "conflict") return;
    if (item.localConflict && context.resolveLocal) return context.resolveLocal(item.localConflict.key, "use-server").then(() => {
      item.localQueued = false;
      item.localConflict = null;
      item.dirty = false;
      item.phase = "saved";
      return context.selectNote(id2, { open: false, local: true });
    });
    context.stop(item);
    const value = item.remote;
    Object.assign(item, newDraft(value));
    context.upsert("notes", value);
    context.emit();
  }
  async function useDraft(id2 = context.state.noteId) {
    const item = context.drafts.get(id2);
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
    return context.saveNote(id2);
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
  async function operation2(kind, id2, method2, body2) {
    if (!context.writable() || context.state.operation?.pending) return;
    if (!context.online() && !(context.durable && method2 === "PUT")) {
      context.state.operation = { phase: "offline", pending: null, error: "当前离线，请联网后重试此操作。" };
      context.emit();
      return;
    }
    return sendOperation({
      kind,
      id: id2,
      method: method2,
      path: "/memos/" + kind + "/" + id2 + (method2 === "POST" ? "/restore" : ""),
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
  const pendingInGroup = (id2) => [...context.drafts.values()].some((item) => item.group_id === id2 && (item.dirty || item.pending));
  async function createGroup(title) {
    if (!cleanTitle(title)) return;
    const id2 = context.uuid(), position = Math.min(1e6, Math.max(0, ...context.state.groups.map((group) => group.position)) + 1);
    await context.operation("groups", id2, "PUT", { title: title.trim(), position, version: 0 });
    if (context.state.groups.some((group) => group.id === id2)) await context.selectGroup(id2);
    return id2;
  }
  async function renameGroup(id2, title) {
    const group = context.state.groups.find((value) => value.id === id2);
    if (!group || group.deleted_at || !cleanTitle(title)) return;
    return context.operation("groups", id2, "PUT", {
      title: title.trim(),
      position: group.position,
      version: group.localQueued ? group.localVersion : group.version
    });
  }
  async function removeGroup(id2, confirmation) {
    const group = context.state.groups.find((value) => value.id === id2);
    if (!group || group.deleted_at) return;
    const snapshot = confirmation || group;
    if (["version", "title", "active_note_count"].some((field2) => snapshot[field2] !== group[field2])) {
      context.state.error = "分组已更新，请重新核对标题和笔记数量后确认删除。";
      context.emit();
      return;
    }
    if (group.localQueued || pendingInGroup(id2)) {
      context.state.error = "此分组还有未同步内容，请联网同步后再删除。";
      context.emit();
      return;
    }
    return context.operation("groups", id2, "DELETE", {
      version: snapshot.version,
      confirm_title: snapshot.title,
      confirm_note_count: snapshot.active_note_count
    });
  }
  async function removeNote(id2) {
    if (!context.online()) {
      context.state.error = "删除笔记需联网；本机正文已保留。";
      context.emit();
      return;
    }
    const item = context.drafts.get(id2), note = context.state.notes.find((value) => value.id === id2);
    if (!note || note.deleted_at || note.localQueued || item && (item.dirty || item.pending || item.localQueued)) {
      context.state.error = "请先保存或核对笔记草稿，再删除。";
      context.emit();
      return;
    }
    return context.operation("notes", id2, "DELETE", { version: note.version });
  }
  async function restore(kind, id2) {
    if (!["groups", "notes"].includes(kind)) return;
    const value = context.state[kind].find((row) => row.id === id2);
    if (!value?.deleted_at) return;
    if (kind === "notes" && !context.state.groups.some((group) => group.id === value.group_id && !group.deleted_at)) {
      context.state.error = "请先恢复此笔记所属的分组。";
      context.emit();
      return;
    }
    return context.operation(kind, id2, "POST", { version: value.version });
  }
  return { createGroup, renameGroup, removeGroup, removeNote, restore };
}
function createMemosStore(options4) {
  const context = makeContext(options4);
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
init_dom();
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
  const timestamp5 = Date.parse(row.savedAt), date = Number.isFinite(timestamp5) ? new Date(timestamp5).toLocaleString() : "保存时间未知";
  return index + 1 + ". " + (row.raw.title || "未命名笔记") + " · " + date + " · 版本 " + row.raw.version;
}
function openMemoRecovery(root3, store, ownerId) {
  if (!store.state.canEdit || !ownerId || !root3) return;
  resetMemoRecovery();
  const find = (q) => root3.querySelector(q);
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
function selectMemoRecovery(root3, index) {
  const row = recoveries[index];
  if (!root3 || !row || !Number.isSafeInteger(index)) return;
  selectedRecovery = index;
  root3.querySelector("#memo-recovery-detail").hidden = false;
  root3.querySelector("#memo-recovery-selected").textContent = label2(row, index);
  root3.querySelector("#memo-recovery-copy").value = row.raw.title + "\n\n" + row.raw.body;
  root3.querySelector("#memo-recovery-copy").focus();
}
async function restoreMemoRecovery(root3, store) {
  const row = recoveries[selectedRecovery];
  if (!row || !store.state.canEdit) return;
  await store.recoverDraft(row.raw);
  root3.querySelector("#memo-recovery-status").textContent = store.state.error || "草稿已取回编辑区。请核对保存状态；存在服务器新版本时不会自动覆盖。";
}

// web/memos-controller.mjs
init_api();
init_state();
init_runtime();
init_conflict_draft_guards();
init_login();
var memoStore, memoIdentity = "", memoEvents = false, memoDialog = null, memoDraftScope, memoCreating = false, memoTool = "";
var memoEditorFocus = null, memoDeleting = "", memoDeleteWait = null;
var memoOfflineRefresh = false, memoOfflineLoading = false, memoOfflineFlight = null, memoPendingCount = 0, memoConflictCount = 0;
var memoRefreshPaused = false, memoRefreshReady = false;
var memoPurgeIntent = null, memoPurgeBusy = false;
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
  const identity6 = currentIdentity();
  if (memoStore && memoIdentity === identity6) return memoStore;
  memoDeleteWait?.(true);
  memoDeleteWait = null;
  memoDeleting = "";
  memoEditorFocus = null;
  memoRefreshPaused = false;
  memoRefreshReady = false;
  memoStore?.dispose();
  memoIdentity = identity6;
  memoDialog = null;
  resetMemoRecovery();
  const active5 = () => {
    if (currentIdentity() !== identity6) throw new DOMException("登录状态已经改变", "AbortError");
  };
  const request2 = async (path, options4) => {
    active5();
    const value = await api(path, options4);
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
    request: request2,
    storage: local,
    ...draftStorageScope(),
    durable: true,
    readLocal: (path) => getOfflineRuntime()?.readMemo(path) || request2(path),
    resolveLocal: (key, choice2) => getOfflineRuntime().resolve(key, choice2),
    ownerId: state.me?.publicBusiness ? "" : String(state.me?.id || ""),
    onChange: () => {
      if (identity6 === currentIdentity()) {
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
function paintDialog(root3) {
  const find = (query) => root3.querySelector(query), dialog = memoDialog;
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
  const root3 = document.querySelector("#memos");
  if (!root3) return;
  paintMemos(root3, memoStore);
  paintDialog(root3);
  setupMemoSplit(root3);
  const purge = root3.querySelector('[data-memo-action="empty-trash"]');
  if (purge) {
    purge.hidden = !settingsTrash() || !state.me?.id;
    purge.disabled = memoPurgeBusy || memoStore.state.loading;
    purge.textContent = memoPurgeIntent?.identity === memoIdentity ? "核对清空结果" : "清空回收站";
  }
  if (memoRefreshPaused) {
    root3.inert = true;
    root3.querySelectorAll("button,input,select").forEach((control) => {
      control.disabled = true;
    });
    root3.querySelectorAll("#memo-title,#memo-body").forEach((field2) => {
      field2.readOnly = true;
    });
  }
  if (memoDeleting) root3.querySelectorAll('[data-memo-action="delete-note"]').forEach((button3) => {
    if (button3.dataset.memoTarget === memoDeleting) button3.disabled = true;
  });
  if (memoCreating) root3.querySelectorAll('[data-memo-action="new-group"],[data-memo-action="new-note"]').forEach((button3) => {
    button3.disabled = true;
  });
}
function openDialog(kind, id2 = "") {
  const s = memoStore.state, group = s.groups.find((row) => row.id === (id2 || s.groupId));
  const note = memoStore.drafts.get(id2 || s.noteId);
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
    id: id2 || (kind.includes("group") ? s.groupId : s.noteId),
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
async function clearMemoTrash() {
  if (!settingsTrash() || !state.me?.id || memoPurgeBusy) return;
  const owner2 = currentIdentity(), store = memoStore, offline = getOfflineRuntime();
  const safe = () => store === memoStore && owner2 === currentIdentity() && settingsTrash() && offline?.state?.online === true && Boolean(offline.state.verifiedScope) && !offline.state.pending && !offline.state.conflicts && !offline.state.unsupported && !store.state.operation?.pending && !store.state.loading && ![...store.drafts.values()].some((item) => item.dirty || item.pending || item.localQueued || item.composing);
  if (!safe()) throw new Error("请先联网并处理所有待同步操作和未保存草稿，再清空回收站。");
  memoPurgeBusy = true;
  paintMemosPage();
  try {
    let intent = memoPurgeIntent?.identity === owner2 ? memoPurgeIntent : null;
    if (!intent) {
      const fresh = await apiNetwork("/memos");
      if (!safe()) throw new Error("数据状态已变化，请处理待同步操作后重试。");
      if (!Array.isArray(fresh?.groups) || !Array.isArray(fresh.notes) || !fresh.can_edit)
        throw new Error("回收站未能完整读取，请稍后重试。");
      const groups = fresh.groups.filter((x) => x.deleted_at);
      const deletedGroups = new Set(groups.map((x) => x.id));
      const notes = fresh.notes.filter((x) => x.deleted_at || deletedGroups.has(x.group_id));
      if (!groups.length && !notes.length) {
        store.state.error = "回收站是空的。";
        return;
      }
      const lines = [...groups.map((x) => "分组：" + x.title), ...notes.map((x) => "笔记：" + x.title)];
      if (!window.confirm("将永久删除回收站中 " + groups.length + " 个分组和 " + notes.length + " 篇笔记，无法恢复。\n\n" + lines.join("\n") + "\n\n确定清空吗？")) return;
      if (!safe()) throw new Error("数据状态已变化，请重新核对。");
      intent = { identity: owner2, body: {
        groups: groups.map(({ id: id2, version: version2 }) => ({ id: id2, version: version2 })),
        notes: notes.map(({ id: id2, version: version2 }) => ({ id: id2, version: version2 })),
        save_id: crypto.randomUUID()
      } };
      memoPurgeIntent = intent;
    } else if (!window.confirm("上次清空结果尚未确认。使用同一请求核对结果吗？")) return;
    const result = await apiNetwork("/memos/trash/clear", { method: "POST", body: intent.body });
    if (owner2 !== currentIdentity()) return;
    if (result?.cleared !== true || result.groups !== intent.body.groups.length || result.notes !== intent.body.notes.length)
      throw new Error("服务器返回的清空结果无法核实，请重试同一请求。");
    memoPurgeIntent = null;
    store.state.noteId = "";
    store.state.groupId = "";
    await store.load();
    store.state.error = "回收站已清空。";
  } catch (error) {
    if (error.status === 409 || error.status === 403 || error.status === 401) memoPurgeIntent = null;
    throw error;
  } finally {
    memoPurgeBusy = false;
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
        const id2 = await store.createGroup("笔记");
        group = store.state.groups.find((row) => row.id === id2 && !row.deleted_at);
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
async function removeMemo(id2) {
  const store = memoStore, item = store.drafts.get(id2);
  if (memoDeleting || !store.state.canEdit) return;
  memoDeleting = id2;
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
    if (item?.dirty && !item.pending) await store.saveNote(id2);
    if (item?.localQueued && navigator.onLine !== false) {
      await getOfflineRuntime()?.sync();
      await store.selectNote(id2, { open: false, select: false, local: true });
    }
    if (item?.dirty || item?.pending || item?.localQueued) {
      store.state.error = "本机正文已保留，删除需联网完成同步后再确认。";
      return;
    }
    await store.removeNote(id2);
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
async function restoreMemo(id2) {
  const store = memoStore, note = store.state.notes.find((row) => row.id === id2);
  if (!note) return;
  if (store.state.groups.find((row) => row.id === note.group_id)?.deleted_at) await store.restore("groups", note.group_id);
  if (store.state.groups.find((row) => row.id === note.group_id)?.deleted_at) return;
  if (note.deleted_at) await store.restore("notes", id2);
  await selectVisibleMemo(store);
}
function toggleMemoFullscreen(expanded) {
  const root3 = document.querySelector("#memos"), dialog = root3?.querySelector("#memo-fullscreen");
  if (!dialog) return;
  const editor = root3.querySelector(".memo-editor"), field2 = root3.contains(memoEditorFocus) ? memoEditorFocus : root3.querySelector("#memo-body");
  const selection = field2 ? { start: field2.selectionStart, end: field2.selectionEnd, direction: field2.selectionDirection, scroll: field2.scrollTop } : null;
  if (expanded ?? !dialog.open) {
    dialog.append(editor);
    dialog.showModal();
  } else {
    dialog.close();
    root3.querySelector(".memo-layout").append(editor);
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
  if (action === "empty-trash") return clearMemoTrash();
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
  else if (action === "recovery") {
    if (document.querySelector("#memo-fullscreen")?.open) toggleMemoFullscreen(false);
    openMemoRecovery(document.querySelector("#memos"), store, store.state.draftOwner);
  } else if (action === "close-recovery") document.querySelector("#memo-recovery").hidden = true;
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
  const root3 = document.querySelector("#memos");
  if (!root3?.contains(event.target)) return;
  memoStore.edit(
    event.target.id === "memo-title" ? "title" : "body",
    event.target.value,
    { composing: composing || event.target.dataset.composing === "true" }
  );
}
function preserveMemosBeforeRefresh(event) {
  if (typeof event.detail?.waitUntil !== "function" || memoIdentity !== currentIdentity() || !memoStore?.state.canEdit) return;
  const store = memoStore, expected = memoIdentity, resume = store.pauseAutosave(), root3 = document.querySelector("#memos");
  const controls2 = [...root3?.querySelectorAll("button,input,select") || []].map((control) => [control, control.disabled]);
  const fields5 = [...root3?.querySelectorAll("#memo-title,#memo-body") || []].map((field2) => ({ field: field2, value: field2.value, readOnly: field2.readOnly, composing: field2.dataset.composing === "true" }));
  const focused = fields5.find((row) => row.field === document.activeElement)?.field;
  const selection = focused ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection, focused.scrollTop] : null;
  const wasInert = root3?.inert;
  memoRefreshPaused = true;
  memoRefreshReady = false;
  event.detail.onFailure?.(() => {
    resume();
    if (store !== memoStore || expected !== currentIdentity()) return;
    memoRefreshPaused = false;
    memoRefreshReady = false;
    if (root3) root3.inert = wasInert;
    for (const [control, disabled] of controls2) control.disabled = disabled;
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
    if (root3) root3.inert = true;
    for (const [control] of controls2) control.disabled = true;
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
    getComposing: (id2) => memoStore?.state.noteId === id2 && [...document.querySelectorAll("#memo-title,#memo-body")].some((field2) => field2.dataset.composing === "true")
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
  const root3 = memoSplitRoot, layout = root3?.querySelector(".memo-layout"), handle = root3?.querySelector("#memo-resizer");
  if (!root3?.isConnected || !layout || !handle) return;
  const mobile = window.innerWidth <= 760;
  handle.hidden = mobile;
  if (mobile) {
    root3.style.removeProperty("--memo-list-w");
    return;
  }
  const area = layout.clientWidth - 10, min = area < 400 ? 120 : 160;
  const max = Math.max(min, Math.floor(Math.min(480, area - 200, area * 0.65)));
  if (memoSplitRatio === void 0) {
    const saved = Number(storage.get(memoSplitStorage));
    memoSplitRatio = Number.isFinite(saved) && saved >= 0.1 && saved <= 0.8 ? saved : 0.16;
  }
  const value = Math.round(Math.max(min, Math.min(max, width ?? area * memoSplitRatio)));
  root3.style.setProperty("--memo-list-w", value + "px");
  for (const [name, number3] of Object.entries({ min, max, now: value })) handle.setAttribute("aria-value" + name, String(number3));
  handle.setAttribute("aria-valuetext", "笔记列表宽度 " + value + " 像素");
  if (width !== null) memoSplitRatio = value / area;
  if (persist) storage.set(memoSplitStorage, String(memoSplitRatio));
}
function setupMemoSplit(root3) {
  if (root3 === memoSplitRoot) return;
  memoSplitObserver?.disconnect();
  memoSplitRoot = root3;
  if (typeof ResizeObserver === "function") {
    memoSplitObserver = new ResizeObserver(() => applyMemoSplit());
    memoSplitObserver.observe(root3.querySelector(".memo-layout"));
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
init_dom();
init_state();
init_popover();
function syncMenu() {
  const phone = isMobileLayout(), open = Boolean($(".shell")?.classList.contains("menu-open")), side = $(".sidebar");
  if (side) side.inert = phone;
  const panel2 = $("#mobile-settings-menu");
  if (panel2) {
    panel2.hidden = !phone || !open;
    panel2.inert = !phone || !open;
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
  const panel2 = $("#mobile-settings-menu");
  if (!panel2) return false;
  const nodes = $$("a[href],button:not(:disabled)", panel2);
  if (!nodes.length) return false;
  const first = nodes[0], last = nodes.at(-1), outside = !panel2.contains(document.activeElement);
  if (outside || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  return false;
}

// web/ui/workbench.mjs
init_constants();
init_dom();
init_state();
init_daily_notes_state();
var mediaPages = /* @__PURE__ */ new Set(["review"]);
function navigationLink(item, mobile = false) {
  const selected = item.id === state.page && (!item.category || item.category === dailyNotesRouteCategory());
  const query = item.id === "settings" ? "&amp;tab=workspace" : item.id === "review" ? "&amp;account=" + encodeURIComponent(item.account || state.account || "V字") : item.category ? "&amp;notes_category=" + item.category : "";
  return `<a href="?page=${e(item.id)}${query}" data-nav="${e(item.id)}" ${item.category ? `data-notes-category="${item.category}"` : ""}
title="${e(item.label)}"
class="${mobile ? "mobile-nav-item" : "nav-item"}${selected ? " active" : ""}" aria-label="${e(item.label)}"
${selected ? 'aria-current="page"' : ""}>${icon(item.icon, 18)}<span class="nav-label">${e(item.label)}</span></a>`;
}
function mediaNavigation(mobile = false) {
  const account3 = state.account || "V字";
  return navigationLink({ id: "review", icon: "chart", label: mobile ? "复盘" : "内容复盘", account: account3 }, mobile);
}
function renderMediaTabs() {
  return "";
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
  const items = [["todos", "待办"], ["notes", "碎碎念"]];
  return `<nav class="mobile-nav workbench-navigation" aria-label="切换模块">${items.map(([id2, label3]) => navigationLink({ ...nav.find((item) => item.id === id2), label: label3 }, true)).join("")}${mediaNavigation(true)}${navigationLink(nav.find((item) => item.id === "ai-reports"), true)}</nav>`;
}
function mobileSettingsMenu() {
  return `<nav id="mobile-settings-menu" class="mobile-settings-menu" aria-label="设置菜单" hidden>
${settingsNavigation()}${state.me?.publicBusiness ? "" : `<button class="btn text" data-action="logout">${icon("logout", 18)}退出登录</button>`}</nav>`;
}
function syncWorkbenchNavigation() {
  const active5 = mediaPages.has(state.page);
  for (const link of document.querySelectorAll("[data-nav=review]")) {
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
  for (const [name, number3] of Object.entries({ min: limits.min, max: limits.max, now: width }))
    handle.setAttribute("aria-value" + name, String(number3));
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
  const current3 = Number(handle.getAttribute("aria-valuenow")), step = event.shiftKey ? 32 : 16;
  const next = event.key === "Home" ? Number(handle.getAttribute("aria-valuemin")) : event.key === "End" ? Number(handle.getAttribute("aria-valuemax")) : current3 + (event.key === "ArrowRight" ? step : -step);
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
  const root3 = document.documentElement;
  if (!root3?.style?.setProperty) return;
  if (!isMobileLayout()) {
    for (const key of ["height", "top", "keyboard"]) root3.style.removeProperty("--mobile-viewport-" + key);
    delete root3.dataset.mobileKeyboard;
    return;
  }
  const viewport = window.visualViewport, height = viewport?.height || window.innerHeight, top = viewport?.offsetTop || 0;
  if (!Number.isFinite(height) || height <= 0) return;
  const editing3 = document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
  const keyboard = editing3 ? Math.max(0, (window.innerHeight || height) - height - top) : 0;
  root3.style.setProperty("--mobile-viewport-height", Math.round(height) + "px");
  root3.style.setProperty("--mobile-viewport-top", Math.round(top) + "px");
  root3.style.setProperty("--mobile-viewport-keyboard", Math.round(keyboard) + "px");
  root3.dataset.mobileKeyboard = String(keyboard > 80);
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
  return '<section class="workbench-settings"></section>';
}
function renderTodoSettings() {
  return `<section class="card panel todo-settings" aria-label="今日待办设置">${renderTodoPreferences()}</section>`;
}

// web/pages/work-reminders.mjs
init_dom();
init_format();
function renderWorkReminders() {
  return '<section id="work-reminders" aria-label="每日工作提醒"><div class="reminder-toolbar"><label for="reminder-date" class="sr-only">提醒日期</label><input id="reminder-date" class="input" type="date"><button type="button" class="btn text" data-reminder-today>今天</button></div><p id="reminder-error" role="alert" hidden></p><div id="reminder-list" aria-live="polite"></div></section>';
}
function paintWorkReminders(data3, error = "") {
  const root3 = document.querySelector("#work-reminders");
  if (!root3) return;
  const date = data3?.date || bjtDate(), field2 = root3.querySelector("#reminder-date");
  if (document.activeElement !== field2) field2.value = date;
  const message = root3.querySelector("#reminder-error");
  message.hidden = !error;
  message.textContent = error;
  const rows = data3?.items || [];
  root3.querySelector("#reminder-list").innerHTML = rows.length ? rows.map((row) => '<article class="card reminder-card"><time datetime="' + e(row.updated_at) + '">' + e(new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(row.updated_at))) + "</time><p>" + e(row.summary) + "</p></article>").join("") : data3?.loading ? "" : '<div class="card reminder-empty">暂无工作提醒</div>';
}

// web/work-reminders-controller.mjs
init_api();
init_format();
init_state();
init_todos_state();
var reminderSequence = 0, reminderEvents = false;
async function loadWorkReminders() {
  registerReminderEvents();
  const sequence5 = ++reminderSequence, session2 = runtime.sessionEpoch, date = state.reminderDate || bjtDate();
  const current3 = () => sequence5 === reminderSequence && session2 === runtime.sessionEpoch && state.page === "reminders";
  paintWorkReminders({ date, items: [], loading: true });
  try {
    const data3 = await api("/work-reminders?date=" + encodeURIComponent(date));
    if (current3()) paintWorkReminders(data3);
  } catch (error) {
    if (current3()) paintWorkReminders({ date, items: [] }, error.message || "提醒读取失败，请稍后重试");
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

// web/pages/ai-reports.mjs
init_dom();
init_daily_notes_state();
function renderAiReports() {
  return `<section id="ai-reports" aria-label="AI 日报">
    <div>
      <div class="page-tabs segmented ai-daily-tabs" role="group" aria-label="AI 日报模块">
        <button class="btn" type="button" data-ai-daily-tab="reminders" aria-pressed="true">每日提醒</button>
        <button class="btn" type="button" data-ai-daily-tab="reports" aria-pressed="false">AI汇报</button>
      </div>
      <div class="ai-calendar-layout"><button class="btn ai-calendar-step" type="button" data-ai-report-month="-1" aria-label="上个月">‹</button>
        <div class="ai-calendar-body"><h2 id="ai-report-date-title" aria-live="polite"></h2><div id="ai-report-calendar"></div></div>
        <button class="btn ai-calendar-step" type="button" data-ai-report-month="1" aria-label="下个月">›</button></div>
      <section data-ai-daily-panel="reminders"><div id="ai-experiments" class="content-review ai-experiments"></div>
      <p id="ai-reminder-status" role="status"></p><div id="ai-reminder-list"></div></section>
      <section data-ai-daily-panel="reports" hidden><p id="ai-report-list-status" role="status"></p>
      <div id="ai-report-list" aria-live="polite"></div>
      </section>
    </div>
  </section>`;
}
var dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
var timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
function reportContent(value) {
  const content2 = String(value ?? "");
  const firstLine = content2.split(/\r?\n/, 1)[0];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(firstLine) ? /* @__PURE__ */ new Date(`${firstLine}T00:00:00Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== firstLine)
    return { workDate: null, body: content2 };
  return { workDate: firstLine, body: content2.slice(firstLine.length).replace(/^\r?\n/, "") };
}
function reportDay(row) {
  const { workDate } = reportContent(row.content);
  const date = new Date(row.created_at);
  if (workDate) return workDate;
  if (!Number.isFinite(date.getTime())) return "";
  const parts2 = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts2.year}-${parts2.month}-${parts2.day}`;
}
function reportGroup(author) {
  const name = String(author ?? "").trim().toLowerCase();
  if (["grok bot", "grok bot-小小鱼"].includes(name)) return "Grok bot";
  if (name === "gemini") return "Gemini";
  if (["gpt", "chatgpt", "chatgpt-dot小鱼"].includes(name)) return "GPT";
  return "其他作者";
}
function reportAuthorClass(author) {
  const colors = { "Grok bot": "grok", Gemini: "gemini", GPT: "gpt", "其他作者": "other" };
  return `ai-report-author ai-report-author--${colors[reportGroup(author)]}`;
}
function paintAiCalendar(selectedDate2, visibleMonth2 = selectedDate2.slice(0, 7), selector = "#ai-reports") {
  const root3 = document.querySelector(selector);
  if (!root3) return;
  root3.querySelector("#ai-report-date-title").textContent = `${Number(visibleMonth2.slice(0, 4))}年${Number(visibleMonth2.slice(5, 7))}月`;
  const first = /* @__PURE__ */ new Date(`${visibleMonth2}-01T00:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  let calendar = '<div class="ai-calendar-grid">' + ["日", "一", "二", "三", "四", "五", "六"].map((d) => `<span>${d}</span>`).join("");
  calendar += "<span></span>".repeat(first.getUTCDay());
  for (let day6 = 1; day6 <= days; day6++) {
    const date = `${visibleMonth2}-${String(day6).padStart(2, "0")}`;
    calendar += `<button type="button" class="btn text" data-ai-report-select="${date}" aria-label="${date}" ${date === selectedDate2 ? 'aria-current="date"' : ""}>${day6}</button>`;
  }
  root3.querySelector("#ai-report-calendar").innerHTML = calendar + "</div>";
}
function paintAiReports(items, error = "", loading = false, selectedDate2 = dailyNotesToday(), visibleMonth2 = selectedDate2.slice(0, 7)) {
  const root3 = document.querySelector("#ai-reports");
  if (!root3) return;
  const status = root3.querySelector("#ai-report-list-status");
  status.textContent = error || (loading || items.length ? "" : "暂无汇报");
  paintAiCalendar(selectedDate2, visibleMonth2);
  const rows = [];
  const groups = { "Grok bot": [], Gemini: [], GPT: [], "其他作者": [] };
  for (const row of items) {
    const date = new Date(row.created_at);
    const validDate = Number.isFinite(date.getTime());
    const submissionDay = validDate ? dateFormatter.format(date) : "日期未知";
    const { body: body2 } = reportContent(row.content);
    const stamp3 = validDate ? `${submissionDay} ${timeFormatter.format(date)}（北京时间）` : String(row.created_at ?? "未知");
    const author = String(row.author ?? "");
    const group = reportGroup(author);
    groups[group].push(`<article class="card field-spaced" style="overflow-wrap:anywhere" title="提交于 ${e(stamp3)}"><p><strong class="${reportAuthorClass(author)}">${e(author)}：</strong></p><div class="ai-report-markdown">${renderSafeMarkdown(body2)}</div></article>`);
  }
  for (const [name, entries] of Object.entries(groups)) {
    if (name === "其他作者" && !entries.length) continue;
    const heading = name === "其他作者" ? `<h3 class="${reportAuthorClass(name)}">${name}</h3>` : "";
    rows.push(`<section>${heading}${entries.length ? entries.join("") : "<p>暂无汇报</p>"}</section>`);
  }
  root3.querySelector("#ai-report-list").innerHTML = loading || error ? "" : rows.join("");
}
function paintAiDailyReminders(data3, error = "", loading = false) {
  const root3 = document.querySelector("#ai-reports");
  if (!root3) return;
  root3.querySelector("#ai-reminder-status").textContent = error || (loading ? "正在读取工作提醒…" : "");
  const items = data3?.items || [];
  root3.querySelector("#ai-reminder-list").innerHTML = items.length ? items.map((row) => `<article class="card field-spaced" style="overflow-wrap:anywhere"><div class="ai-report-markdown">${renderSafeMarkdown(row.summary)}</div></article>`).join("") : loading || error ? "" : "<p>暂无工作提醒</p>";
}
function paintOpenAiDiary(items = [], { error = "", loading = false, owner: owner2 = true } = {}) {
  const root3 = document.querySelector("#ai-diagnosis");
  if (!root3) return;
  root3.querySelector("#openai-diary-status").textContent = error || (loading ? "正在读取分析记录…" : "");
  root3.querySelector("#openai-diary-list").innerHTML = !owner2 ? openAiLogin : loading || error ? "" : items.length ? items.map(renderOpenAiRun).join("") : "<p>这一天没有 OpenAI API 分析记录。</p>";
}

// web/core/review-data.mjs
var SNAPSHOT_NUMBERS = [
  "impressions",
  "fan_impressions",
  "reads",
  "fan_reads",
  "ctr",
  "completion_rate",
  "avg_read_seconds",
  "likes",
  "comments",
  "reposts",
  "shares",
  "favorites",
  "revenue"
];
var SNAPSHOT_JSON = ["traffic_sources", "completion_curve", "audience"];
var SUM_FIELDS = ["impressions", "fan_impressions", "reads", "fan_reads", "likes", "comments", "reposts", "shares", "favorites", "revenue"];
var AVG_FIELDS = ["ctr", "completion_rate", "avg_read_seconds"];
function parseJson(value, fallback = null) {
  if (value === null || value === void 0 || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function finiteNumber(value) {
  if (typeof value !== "number" && typeof value !== "string" || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number3 = Number(value);
  return Number.isFinite(number3) ? number3 : null;
}
function calendarDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const stamp3 = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(stamp3) && new Date(stamp3).toISOString().slice(0, 10) === date ? date : "";
}
var shanghaiClock = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function shanghaiParts(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !calendarDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59 || match[6] !== "Z" && (Number(match[6].slice(1, 3)) > 23 || Number(match[6].slice(4, 6)) > 59)) return null;
  const stamp3 = Date.parse(value);
  if (!Number.isFinite(stamp3)) return null;
  return Object.fromEntries(shanghaiClock.formatToParts(stamp3).map((part) => [part.type, part.value]));
}
function day4(value) {
  if (typeof value !== "string") return "";
  if (calendarDate(value)) return value;
  const parts2 = shanghaiParts(value);
  return parts2 ? calendarDate(`${parts2.year.padStart(4, "0")}-${parts2.month}-${parts2.day}`) : "";
}
function reviewDateTime(value) {
  if (typeof value !== "string") return "";
  if (calendarDate(value)) return value;
  const parts2 = shanghaiParts(value), date = day4(value);
  return parts2 && date ? `${date} ${parts2.hour}:${parts2.minute}` : "";
}
function shiftDay(value, amount) {
  const date = day4(value);
  if (!date || !Number.isFinite(amount)) return "";
  return new Date(Date.parse(`${date}T00:00:00Z`) + amount * 864e5).toISOString().slice(0, 10);
}
function list(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
}
function object3(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function rules(value) {
  return list(parseJson(value, [])).filter((rule) => rule && typeof rule === "object" && typeof rule.rule_id === "string");
}
function normalizeReviewData(input = {}) {
  return {
    benchmarkAccounts: list(input.benchmarkAccounts || input["benchmark-accounts"]).filter(Boolean),
    benchmarkArticles: list(input.benchmarkArticles || input["benchmark-articles"]).filter(Boolean),
    notes: list(input.notes).filter(Boolean),
    accountHealth: list(input.accountHealth || input["account-health"]).filter(Boolean),
    articles: list(input.articles).filter(Boolean).map((article) => ({ ...article, image_count: finiteNumber(article.image_count) })),
    snapshots: list(input.snapshots).filter(Boolean).map((snapshot) => {
      const normalized = { ...snapshot };
      for (const field2 of SNAPSHOT_NUMBERS) normalized[field2] = finiteNumber(snapshot[field2]);
      for (const field2 of SNAPSHOT_JSON) normalized[field2] = parseJson(snapshot[field2]);
      return normalized;
    }),
    reports: list(input.reports).filter(Boolean).map((report) => ({
      ...report,
      verdicts: object3(parseJson(report.verdicts, {})),
      findings: object3(parseJson(report.findings, {})),
      metrics: object3(parseJson(report.metrics, {}))
    })),
    prompts: list(input.prompts || input["prompts/current"]).filter(Boolean),
    playbooks: list(input.playbooks).filter(Boolean).map((playbook2) => ({ ...playbook2, rules: rules(playbook2.rules) }))
  };
}
function latestSnapshots(snapshots2 = [], cutoff = "9999-12-31") {
  const result = /* @__PURE__ */ new Map();
  for (const snapshot of list(snapshots2)) {
    const date = day4(snapshot.snapshot_date);
    if (!date || date > cutoff || snapshot.article_id === null || snapshot.article_id === void 0) continue;
    const key = String(snapshot.article_id);
    const previous = result.get(key);
    if (!previous || date > day4(previous.snapshot_date) || date === day4(previous.snapshot_date) && String(snapshot.id || "") > String(previous.id || "")) result.set(key, snapshot);
  }
  return result;
}
function verdictMap(reports = [], { end = "9999-12-31", periodType } = {}) {
  const result = /* @__PURE__ */ new Map();
  const ordered2 = list(reports).filter((report) => (!periodType || report.period_type === periodType) && day4(report.period_end) && day4(report.period_end) <= end).sort((a, b) => day4(a.period_end).localeCompare(day4(b.period_end)) || String(a.id || "").localeCompare(String(b.id || "")));
  for (const report of ordered2) {
    for (const [id2, raw] of Object.entries(object3(parseJson(report.verdicts, {})))) {
      const entry = typeof raw === "string" ? { verdict: raw } : object3(raw);
      if (!["爆", "中", "扑"].includes(entry.verdict)) continue;
      result.set(String(id2), { verdict: entry.verdict, reason: typeof entry.reason === "string" ? entry.reason : "", report_id: report.id });
    }
  }
  return result;
}
function articleRows2(data3 = {}, { start = "", end = "9999-12-31", periodType } = {}) {
  const snapshots2 = latestSnapshots(data3.snapshots, end);
  const verdicts = verdictMap(data3.reports, { end, periodType });
  return list(data3.articles).filter((article) => {
    const published = day4(article.published_at);
    return published && (!start || published >= start) && published <= end;
  }).map((article) => ({
    ...article,
    snapshot: snapshots2.get(String(article.id)) || null,
    verdict: verdicts.get(String(article.id))?.verdict || "",
    reason: verdicts.get(String(article.id))?.reason || ""
  })).sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)) || String(a.id).localeCompare(String(b.id)));
}
function aggregate(rows = []) {
  const result = { count: rows.length, hits: 0, flops: 0, judged_count: 0, hit_rate: null, coverage: {}, partial: {} };
  for (const field2 of [...SUM_FIELDS, ...AVG_FIELDS]) {
    const values = rows.map((row) => finiteNumber(row.snapshot?.[field2])).filter((value) => value !== null);
    result.coverage[field2] = values.length;
    result.partial[field2] = values.length > 0 && values.length < rows.length;
    result[field2] = values.length ? values.reduce((sum, value) => sum + value, 0) / (AVG_FIELDS.includes(field2) ? values.length : 1) : null;
  }
  for (const row of rows) {
    if (["爆", "中", "扑"].includes(row.verdict)) result.judged_count += 1;
    if (row.verdict === "爆") result.hits += 1;
    if (row.verdict === "扑") result.flops += 1;
  }
  if (!result.judged_count) {
    result.hits = null;
    result.flops = null;
  } else result.hit_rate = result.hits / result.judged_count * 100;
  result.coverage.verdict = result.judged_count;
  result.partial.verdict = result.judged_count > 0 && result.judged_count < rows.length;
  return result;
}
function compareMetrics(current3 = {}, previous = {}) {
  const result = {};
  for (const field2 of ["count", ...SUM_FIELDS, ...AVG_FIELDS, "hits", "flops", "hit_rate", "published_count", "total_reads", "average_ctr", "recent_hits"]) {
    const now = finiteNumber(current3[field2]);
    const before = finiteNumber(previous[field2]);
    result[field2] = {
      current: now,
      previous: before,
      delta: now !== null && before !== null ? now - before : null,
      percent: now !== null && before !== null && before !== 0 ? (now - before) / Math.abs(before) * 100 : null
    };
  }
  return result;
}
function periodSummary(data3, { start, end, periodType } = {}) {
  const duration3 = day4(start) && day4(end) ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 864e5) + 1 : 0;
  const previousEnd = duration3 > 0 ? shiftDay(start, -1) : "";
  const previousStart = duration3 > 0 ? shiftDay(start, -duration3) : "";
  const rows = articleRows2(data3, { start, end, periodType });
  const previousRows = duration3 > 0 ? articleRows2(data3, { start: previousStart, end: previousEnd, periodType }) : [];
  const current3 = aggregate(rows), previous = aggregate(previousRows);
  return { start, end, previousStart, previousEnd, rows, previousRows, current: current3, previous, changes: compareMetrics(current3, previous) };
}
function dailySummary(data3, date) {
  const previousDate = shiftDay(date, -1);
  const result = periodSummary(data3, { start: date, end: date, periodType: "daily" });
  const recentRows = articleRows2(data3, { start: shiftDay(date, -2), end: date });
  const previousRecentRows = articleRows2(data3, { start: shiftDay(date, -3), end: previousDate });
  const recent = aggregate(recentRows), previousRecent = aggregate(previousRecentRows);
  const stats = { published_count: result.current.count, total_reads: result.current.reads, average_ctr: result.current.ctr, recent_hits: recent.hits };
  const previousStats = { published_count: result.previous.count, total_reads: result.previous.reads, average_ctr: result.previous.ctr, recent_hits: previousRecent.hits };
  return { ...result, date, previousDate, recentRows, stats, previousStats, statChanges: compareMetrics(stats, previousStats) };
}
function groupPerformance(rows = [], field2 = "topic_category") {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = typeof row[field2] === "string" && row[field2].trim() ? row[field2] : "未分类";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([name, members]) => {
    const summary = aggregate(members);
    return { name, ...summary, average_reads: summary.coverage.reads ? summary.reads / summary.coverage.reads : null, rows: members };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
function dailySeries(data3 = {}, { start = "", end = "9999-12-31" } = {}) {
  const dates = [...new Set(list(data3.snapshots).map((snapshot) => day4(snapshot.snapshot_date)).filter((date) => date && date >= start && date <= end))].sort();
  const articles = new Map(list(data3.articles).map((article) => [String(article.id), article]));
  return dates.map((date) => {
    const sameDay = list(data3.snapshots).filter((snapshot) => day4(snapshot.snapshot_date) === date);
    const snapshots2 = latestSnapshots(sameDay, date);
    const rows = [...snapshots2.entries()].filter(([id2]) => articles.has(id2)).map(([id2, snapshot]) => ({ ...articles.get(id2), snapshot }));
    return { date, ...aggregate(rows) };
  });
}
function diffRules(previous, current3) {
  const before = new Map(rules(previous?.rules ?? previous).map((rule) => [rule.rule_id, rule]));
  const after = new Map(rules(current3?.rules ?? current3).map((rule) => [rule.rule_id, rule]));
  const added = [], removed4 = [], unchanged2 = [], changed4 = [];
  for (const [id2, rule] of before) {
    const next = after.get(id2);
    if (!next) removed4.push(rule);
    else if (String(rule.text || "") !== String(next.text || "") || String(rule.section || "") !== String(next.section || "")) {
      removed4.push(rule);
      added.push(next);
      changed4.push({ before: rule, after: next });
    } else unchanged2.push(next);
  }
  for (const [id2, rule] of after) if (!before.has(id2)) added.push(rule);
  return { added, removed: removed4, unchanged: unchanged2, changed: changed4 };
}
function metricDiscrepancies(report = {}, computed = {}) {
  const metrics2 = object3(parseJson(report.metrics, {}));
  const aliases3 = {
    total_reads: "reads",
    average_ctr: "ctr",
    avg_ctr: "ctr",
    total_impressions: "impressions",
    average_completion_rate: "completion_rate",
    avg_completion_rate: "completion_rate",
    total_revenue: "revenue",
    article_count: "count",
    published_count: "count",
    hit_count: "hits",
    flop_count: "flops"
  };
  return Object.entries(metrics2).map(([key, value]) => {
    const field2 = aliases3[key] || key;
    const authorValue = finiteNumber(value), calculated = finiteNumber(computed[field2]);
    const comparable = authorValue !== null && calculated !== null;
    return {
      key,
      field: field2,
      authorValue,
      computedValue: calculated,
      comparable,
      mismatch: comparable ? Math.abs(authorValue - calculated) > Math.max(5e-3, Math.abs(calculated) * 1e-6) : false,
      partial: Boolean(computed.partial?.[field2])
    };
  });
}
function periodsFor(data3 = {}, type = "daily") {
  const periods = /* @__PURE__ */ new Map();
  for (const report of list(data3.reports)) {
    if (report.period_type !== type) continue;
    const start = day4(report.period_start), end = day4(report.period_end);
    if (!start || !end || start > end) continue;
    periods.set(`${start}/${end}`, { start, end, label: start === end ? end : `${start} — ${end}`, report });
  }
  if (!periods.size) {
    const dates = [...new Set([...list(data3.snapshots).map((snapshot) => day4(snapshot.snapshot_date)), ...list(data3.articles).map((article) => day4(article.published_at))].filter(Boolean))].sort().reverse();
    const duration3 = type === "weekly" ? 7 : type === "three_day" ? 3 : 1;
    for (const end of dates) {
      const start = shiftDay(end, -(duration3 - 1));
      periods.set(`${start}/${end}`, { start, end, label: start === end ? end : `${start} — ${end}`, report: null });
    }
  }
  return [...periods.values()].sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start));
}

// web/core/review-rule-scopes.mjs
var aliases = /* @__PURE__ */ new Map([
  ["整体", "global"],
  ["global", "global"],
  ["头条", "toutiao"],
  ["toutiao", "toutiao"],
  ["V字", "vzi"],
  ["vzi", "vzi"],
  ["鱼见", "yujian"],
  ["yujian", "yujian"],
  ["公众号", "wechat"],
  ["wechat", "wechat"]
]);
var scopeOf = (value) => aliases.get(String(value || "")) || String(value || "");
var labels2 = /* @__PURE__ */ new Map([
  ["global", "整体规则"],
  ["toutiao", "头条平台规则"],
  ["vzi", "V字账号规则"],
  ["yujian", "鱼见账号规则"],
  ["wechat", "公众号平台规则"]
]);
var scopeLabel = (scope) => labels2.get(scope) || scope;
function applicableScopes(account3) {
  const scope = scopeOf(account3);
  if (["vzi", "yujian"].includes(scope)) return ["global", "toutiao", scope];
  if (scope === "wechat") return ["wechat"];
  return scope === "global" ? ["global"] : ["global", scope];
}
function newest(a, b) {
  return String(b.version ?? "").localeCompare(String(a.version ?? ""), void 0, { numeric: true }) || String(b.published_on || b.updated_at || "").localeCompare(String(a.published_on || a.updated_at || "")) || String(b.id).localeCompare(String(a.id));
}
function currentPlaybooks(books = [], account3) {
  const latest = /* @__PURE__ */ new Map(), scopes = applicableScopes(account3);
  for (const book of [...books].filter((book2) => book2.status === "active").sort(newest)) {
    const scope = scopeOf(book.account);
    if (!latest.has(scope)) latest.set(scope, book);
  }
  const current3 = [...latest.values()].map((book) => ({
    ...book,
    rules: (book.rules || []).filter((rule) => scopes.includes(scopeOf(rule.scope ?? book.account)))
  })).filter((book) => scopes.includes(scopeOf(book.account)) || book.rules.length);
  return resolveRuleOverrides(current3, account3);
}
function resolveRuleOverrides(books, account3) {
  const scopes = applicableScopes(account3), occurrences = /* @__PURE__ */ new Map();
  for (const book of books) for (const rule of book.rules) {
    const scope = scopeOf(rule.scope ?? book.account);
    if (typeof rule.rule_id !== "string" || !rule.rule_id || !scopes.includes(scope)) continue;
    if (!occurrences.has(rule.rule_id)) occurrences.set(rule.rule_id, /* @__PURE__ */ new Set());
    occurrences.get(rule.rule_id).add(scope);
  }
  return books.map((book) => ({ ...book, rules: book.rules.map((rule) => {
    const scope = scopeOf(rule.scope ?? book.account);
    const seen = occurrences.get(rule.rule_id) || /* @__PURE__ */ new Set();
    const winner = scopes.findLast((layer) => seen.has(layer));
    const overriddenByScope = scopes.indexOf(winner) > scopes.indexOf(scope) ? winner : "";
    const overridesScopes = overriddenByScope ? [] : scopes.filter((layer) => seen.has(layer) && scopes.indexOf(layer) < scopes.indexOf(scope));
    return { ...rule, overriddenByScope, overridesScopes };
  }) }));
}
function ruleCountLabel(rules2) {
  const overridden = rules2.filter((rule) => rule.overriddenByScope).length;
  return `${rules2.length} 条规则 · ${rules2.length - overridden} 条当前生效${overridden ? ` · ${overridden} 条被覆盖` : ""}`;
}
function currentPrompts(prompts = [], account3) {
  const scopes = applicableScopes(account3), latest = /* @__PURE__ */ new Map();
  for (const prompt of [...prompts].filter((prompt2) => prompt2.status === "active" && scopes.includes(prompt2.scope)).sort(newest)) {
    const key = `${prompt.scope}:${prompt.prompt_key}`;
    if (!latest.has(key)) latest.set(key, prompt);
  }
  return [...latest.values()].sort((a, b) => scopes.indexOf(a.scope) - scopes.indexOf(b.scope) || String(a.prompt_key).localeCompare(String(b.prompt_key)));
}

// web/review-ai-controller.mjs
init_api();
var ai = { status: "idle", messages: {} }, account = "", ticket = 0, autoWeekly = "";
var listeners = /* @__PURE__ */ new Set();
var emit = () => {
  for (const listener of listeners) listener();
};
var request = (path, options4 = {}) => apiNetwork(path, { ...options4, suppressAuthRedirect: true });
var reviewAiView = () => ai;
function watchReviewAi(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function resetReviewAi() {
  ticket++;
  ai = { status: "idle", messages: {} };
  account = "";
  autoWeekly = "";
}
async function loadReviewAi(nextAccount = "V字", { force = false } = {}) {
  if (!force && account === nextAccount && ["ready", "loading"].includes(ai.status)) return;
  account = nextAccount;
  const current3 = ++ticket, quiet = ai.status === "ready";
  if (!quiet) {
    ai = { ...ai, status: "loading" };
    emit();
  }
  try {
    const data3 = await request("/review/ai?account=" + encodeURIComponent(nextAccount));
    if (current3 !== ticket) return;
    ai = { ...ai, status: "ready", data: data3, error: "", ...ai.dirty ? {} : { draft: structuredClone(data3.settings) } };
  } catch (error) {
    if (current3 !== ticket) return;
    ai = quiet ? ai : { ...ai, status: "error", error: error.message || "AI 结果读取失败" };
  }
  emit();
}
async function loadModels() {
  if (ai.models?.length || ai.modelsLoading) return;
  ai = { ...ai, modelsLoading: true, modelsError: "" };
  emit();
  try {
    const data3 = await request("/review/ai/models");
    ai = { ...ai, models: data3.models || [], modelsLoading: false };
  } catch (error) {
    ai = { ...ai, models: [], modelsLoading: false, modelsError: error.message || "模型列表读取失败，可稍后再试" };
  }
  emit();
}
function loadReviewAiModels() {
  return loadModels();
}
var say = (key, text, error = false) => {
  ai = { ...ai, messages: { ...ai.messages, [key]: text ? { text, error } : null } };
};
var done = {
  weekly: () => "周报已生成。",
  titles: (data3) => data3.labelled ? `已归类 ${data3.labelled} 篇${data3.remaining ? `，还剩 ${data3.remaining} 篇` : ""}。` : "没有需要归类的标题。",
  benchmarks: (data3) => data3.done ? `已拆解 ${data3.done} 篇${data3.remaining ? `，还剩 ${data3.remaining} 篇` : ""}。` : "没有需要拆解的爆文。"
};
async function runFeature(feature, once = {}) {
  if (ai.busy || !done[feature]) return;
  ai = { ...ai, busy: feature, options: "" };
  say(feature, "");
  emit();
  try {
    const body2 = { account, ...once.model ? { model: once.model } : {}, ...once.effort ? { effort: once.effort } : {} };
    const result = await request("/review/ai/" + feature, { method: "POST", body: body2 });
    say(feature, done[feature](result));
  } catch (error) {
    say(feature, error.message || "没有完成，请稍后重试。", true);
  }
  ai = { ...ai, busy: "", once: {} };
  await loadReviewAi(account, { force: true });
}
function autoGenerateWeekly() {
  const due = ai.data?.pending?.weekly;
  if (ai.status !== "ready" || !ai.data.configured || !due || ai.busy || autoWeekly === due.start) return;
  autoWeekly = due.start;
  void runFeature("weekly");
}
async function changeRule(target, context) {
  const id2 = target.dataset.ruleId, status = target.dataset.status;
  const playbook2 = context.playbooks().find((item) => String(item.id) === target.dataset.playbookId);
  if (!playbook2?.content_hash || ai.busy) return;
  ai = { ...ai, busy: "rule:" + id2 };
  say("rules", "");
  emit();
  try {
    const saved = await request("/review/rules/" + encodeURIComponent(id2), {
      method: "PATCH",
      body: { account: playbook2.account, playbook_id: playbook2.id, expected_hash: playbook2.content_hash, save_id: crypto.randomUUID(), status }
    });
    context.applyPlaybook(saved);
    say("rules", status === "trial" ? "已进入试验。之后用了这条的文章会自动对比。" : status === "kept" ? "已采纳，记入规则。" : "已放弃这条。");
  } catch (error) {
    say("rules", error.status === 409 ? "规则刚刚被更新过，已重新读取，请再点一次。" : error.message || "没有保存，请重试。", true);
    if (error.status === 409) context.reload?.();
  }
  ai = { ...ai, busy: "" };
  emit();
}
function reviewAiClick(target, context = {}) {
  const action = target.dataset.aiAction, feature = target.dataset.aiFeature;
  if (action === "reload") {
    void loadReviewAi(account || context.account, { force: true });
    return true;
  }
  if (action === "options") {
    ai = { ...ai, options: ai.options === feature ? "" : feature, once: {} };
    emit();
    void loadModels();
    return true;
  }
  if (action === "run") {
    void runFeature(feature, ai.options === feature ? ai.once : {});
    return true;
  }
  if (action === "rule-status") {
    void changeRule(target, context);
    return true;
  }
  return false;
}
function reviewAiInput(target) {
  if (target.dataset.aiOnce) {
    ai = { ...ai, once: { ...ai.once, [target.dataset.aiOnce]: target.value } };
    return true;
  }
  const key = target.dataset.aiSetting;
  if (!key || !ai.data) return false;
  const draft = structuredClone(ai.draft || ai.data.settings);
  if (key === "daily_limit") draft.daily_limit = Number(target.value);
  else draft.features[target.dataset.aiFeature][key] = target.value;
  ai = { ...ai, draft, dirty: true };
  say("settings", "");
  return true;
}
async function saveReviewAiSettings() {
  if (!ai.draft || ai.busy) return;
  if (!Number.isInteger(ai.draft.daily_limit) || ai.draft.daily_limit < 0 || ai.draft.daily_limit > 200) {
    say("settings", "每日上限请填 0 到 200 的整数", true);
    emit();
    return;
  }
  ai = { ...ai, busy: "settings" };
  say("settings", "");
  emit();
  try {
    const saved = await request("/review/ai/settings", { method: "PUT", body: ai.draft });
    ai = { ...ai, dirty: false, draft: structuredClone(saved.settings), data: { ...ai.data, settings: saved.settings, usage: {
      ...ai.data.usage,
      limit: saved.settings.daily_limit
    } } };
    say("settings", "已保存");
  } catch (error) {
    say("settings", error.message || "保存失败，请重试", true);
  }
  ai = { ...ai, busy: "" };
  emit();
}

// shared/review-analytics.mjs
var array = (value) => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
var id = (value) => String(value ?? "");
var compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function parsed(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function finiteNumber2(value) {
  if (!["number", "string"].includes(typeof value) || typeof value === "string" && !value.trim()) return null;
  const number3 = Number(value);
  return Number.isFinite(number3) ? number3 : null;
}
function calendarDate2(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const stamp3 = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp3) && new Date(stamp3).toISOString().slice(0, 10) === value ? value : "";
}
var clock2 = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function parts(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !calendarDate2(match[1]) || +match[2] > 23 || +match[3] > 59 || +match[4] > 59 || match[5] !== "Z" && (+match[5].slice(1, 3) > 23 || +match[5].slice(4, 6) > 59)) return null;
  const stamp3 = Date.parse(value);
  return Number.isFinite(stamp3) ? Object.fromEntries(clock2.formatToParts(stamp3).map((part) => [part.type, part.value])) : null;
}
function day5(value) {
  if (calendarDate2(value)) return value;
  const p = parts(value);
  return p ? calendarDate2(`${p.year.padStart(4, "0")}-${p.month}-${p.day}`) : "";
}
function reviewDateTime2(value) {
  if (calendarDate2(value)) return value;
  const p = parts(value);
  return p ? `${day5(value)} ${p.hour}:${p.minute}` : "";
}
function shiftDay2(value, amount) {
  const date = day5(value);
  return date && Number.isInteger(amount) ? new Date(Date.parse(`${date}T00:00:00Z`) + amount * 864e5).toISOString().slice(0, 10) : "";
}
function median(values = []) {
  const sorted = values.map(finiteNumber2).filter((value) => value !== null).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
}
var nonnegative = (value) => {
  const n = finiteNumber2(value);
  return n !== null && n >= 0 ? n : null;
};
var rate = (value) => {
  const n = nonnegative(value);
  return n !== null && n <= 100 ? n : null;
};
var validAge = (snapshot) => {
  const n = finiteNumber2(snapshot.age_hours);
  return n !== null && Number.isInteger(n) && n >= 12 && n <= 72;
};
function select24hSnapshot(snapshots2 = [], articleId) {
  return array(snapshots2).filter((snapshot) => snapshot && (articleId === void 0 || id(snapshot.article_id) === id(articleId)) && validAge(snapshot)).sort((a, b) => Math.abs(Number(a.age_hours) - 24) - Math.abs(Number(b.age_hours) - 24) || Number(a.age_hours) - Number(b.age_hours) || compare(id(a.snapshot_date), id(b.snapshot_date)) || compare(id(a.id), id(b.id)))[0] ?? null;
}
var selectSample24h = select24hSnapshot;
function normalizeRule(rule) {
  return rule && typeof rule === "object" && !Array.isArray(rule) ? { ...rule, status: rule.status ?? "candidate" } : null;
}
function normalizeRules(rules2) {
  return array(parsed(rules2, [])).map(normalizeRule).filter(Boolean);
}
function normalizePlaybook(playbook2) {
  return { ...playbook2, rules: normalizeRules(playbook2?.rules ?? playbook2?.rules_json) };
}
function appliedRules(article, playbooks = []) {
  const version2 = finiteNumber2(article?.playbook_version_used);
  const specified = parsed(article?.applied_rule_ids, null);
  if (version2 === null || !Array.isArray(specified)) return [];
  const playbook2 = array(playbooks).filter((item) => item.account === article.account && finiteNumber2(item.version) === version2).sort((a, b) => compare(id(a.id), id(b.id)))[0];
  if (!playbook2) return [];
  const rules2 = normalizeRules(playbook2.rules ?? playbook2.rules_json);
  return rules2.filter((rule) => specified.includes(rule.rule_id));
}
function recentArticles(a, b) {
  const dateOrder = compare(day5(b.published_at), day5(a.published_at));
  if (dateOrder) return dateOrder;
  const aTimed = Boolean(parts(a.published_at)), bTimed = Boolean(parts(b.published_at));
  return (aTimed && bTimed ? Date.parse(b.published_at) - Date.parse(a.published_at) : Number(bTimed) - Number(aTimed)) || compare(id(a.id), id(b.id));
}
function quantile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}
function enrichArticles(data3 = {}, { account: account3, baselineData } = {}) {
  const articles = array(data3.articles).filter((article) => article && (account3 === void 0 || article.account === account3));
  const rows = articles.map((article) => {
    const sample24h = select24hSnapshot(data3.snapshots, article.id);
    return {
      ...article,
      sample24h,
      reads_24h: nonnegative(sample24h?.reads),
      ctr_24h: rate(sample24h?.ctr),
      completion_24h: rate(sample24h?.completion_rate),
      applied_rules: appliedRules(article, data3.playbooks)
    };
  });
  const baselineRows = baselineData === void 0 ? rows : enrichArticles(baselineData, { account: account3 });
  const cohorts = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (!cohorts.has(row.account)) {
      const samples = baselineRows.filter((item) => item.account === row.account && item.reads_24h !== null).sort(recentArticles).slice(0, 30);
      const values = samples.map((item) => item.reads_24h).sort((a, b) => a - b);
      cohorts.set(row.account, { sample_count: values.length, low: quantile(values, 0.3), high: quantile(values, 0.8), sample_ids: samples.map((item) => item.id) });
    }
    const cohort = cohorts.get(row.account), reliable = cohort.sample_count >= 10 && row.reads_24h !== null;
    let verdict = null;
    if (row.reads_24h !== null) verdict = reliable ? row.reads_24h > cohort.high ? "爆" : row.reads_24h <= cohort.low && row.reads_24h < cohort.high ? "扑" : "中" : row.reads_24h >= 1e3 ? "爆" : row.reads_24h <= 100 ? "扑" : "中";
    Object.assign(row, { verdict, reliable, verdict_reliable: reliable, verdict_basis: {
      method: cohort.sample_count >= 10 ? "recent30_quantiles" : "fixed_thresholds",
      sample_count: cohort.sample_count,
      sample_ids: cohort.sample_ids,
      high_threshold: cohort.sample_count >= 10 ? cohort.high : 1e3,
      low_threshold: cohort.sample_count >= 10 ? cohort.low : 100,
      high_inclusive: cohort.sample_count < 10,
      low_inclusive: true,
      ties: "never_split",
      missing_reads: row.reads_24h === null
    } });
  }
  return rows.sort(recentArticles);
}
function enrichArticle(article, snapshots2 = [], playbooks = [], reports = [], articles = [article]) {
  const cohort = [...array(articles).filter((item) => id(item.id) !== id(article.id)), article];
  return enrichArticles({ articles: cohort, snapshots: snapshots2, playbooks, reports }).find((item) => id(item.id) === id(article.id));
}
function weekBounds(now = (/* @__PURE__ */ new Date()).toISOString(), week = "this") {
  const today2 = day5(now instanceof Date ? now.toISOString() : now);
  if (!today2) throw new TypeError("now must be a valid date or explicit ISO timestamp");
  if (!["this", "last"].includes(week)) throw new TypeError("week must be this or last");
  const weekday = (/* @__PURE__ */ new Date(`${today2}T00:00:00Z`)).getUTCDay();
  const start = shiftDay2(today2, -(weekday + 6) % 7 - (week === "last" ? 7 : 0));
  return { today: today2, start, end: shiftDay2(start, 6), previousStart: shiftDay2(start, -7), previousEnd: shiftDay2(start, -1) };
}
function summarizeArticles(rows = []) {
  const judged = rows.filter((row) => nonnegative(row.reads_24h) !== null && ["爆", "中", "扑"].includes(row.verdict));
  const ctrs = rows.map((row) => rate(row.ctr_24h)).filter((value) => value !== null);
  const hits = judged.filter((row) => row.verdict === "爆").length, flops = judged.filter((row) => row.verdict === "扑").length;
  return {
    count: rows.length,
    published_count: rows.length,
    hits,
    flops,
    judged_count: judged.length,
    hit_rate: judged.length ? hits / judged.length * 100 : null,
    flop_rate: judged.length ? flops / judged.length * 100 : null,
    miss_rate: judged.length ? flops / judged.length * 100 : null,
    median_ctr: median(ctrs),
    ctr_median: median(ctrs),
    ctr_count: ctrs.length,
    missing_24h_count: rows.filter((row) => !row.sample24h).length,
    reliable_count: judged.filter((row) => row.reliable).length,
    rate_denominator: "Articles in this publication week with valid reads_24h and a computed verdict; includes provisional fixed-threshold judgments."
  };
}
function summarySentence(current3, week) {
  const label3 = week === "last" ? "上周" : "本周";
  const judged = current3.judged_count;
  return `${label3}发布 ${current3.count} 篇，${judged ? `可判定 ${judged} 篇，爆款 ${current3.hits} 篇、扑街 ${current3.flops} 篇` : "暂无有效 24h 阅读样本"}。`;
}
function firstSentence(markdown) {
  if (typeof markdown !== "string") return "";
  const text = markdown.replace(/^\s{0,3}(?:#{1,6}\s+|>\s?)/gm, "").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<[^>]*>/g, "").replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim();
  const ending = /[。！？!?][”’"')）]*|\.(?=\s|$)/.exec(text);
  return ending ? text.slice(0, ending.index + ending[0].length) : text;
}
function weeklyConclusion(reports, account3, bounds, week) {
  const report = array(reports).filter((item) => item?.account === account3 && item.period_type === "weekly" && day5(item.period_start) === bounds.start && day5(item.period_end) === bounds.end).sort((a, b) => compare(id(b.created_at), id(a.created_at)) || compare(id(a.id), id(b.id)))[0];
  return firstSentence(report?.summary_md) || `${week === "last" ? "上周" : "本周"}尚未生成周报`;
}
function buildOverview(data3 = {}, options4 = {}) {
  const { account: account3, week = "this", range = "7d", now = (/* @__PURE__ */ new Date()).toISOString() } = options4;
  if (!["7d", "30d"].includes(range)) throw new TypeError("range must be 7d or 30d");
  const bounds = weekBounds(now, week), allRows = enrichArticles(data3, { account: account3 });
  const cohort = (start, end) => allRows.filter((row) => {
    const published = day5(row.published_at);
    return published && published >= start && published <= end;
  });
  const rows = cohort(bounds.start, bounds.end), previousRows = cohort(bounds.previousStart, bounds.previousEnd);
  const current3 = summarizeArticles(rows), previous = summarizeArticles(previousRows), changes = {};
  for (const field2 of ["count", "published_count", "hits", "flops", "hit_rate", "flop_rate", "miss_rate", "median_ctr", "ctr_median"]) {
    changes[field2] = {
      current: current3[field2],
      previous: previous[field2],
      delta: current3[field2] !== null && previous[field2] !== null ? current3[field2] - previous[field2] : null,
      unit: ["hit_rate", "flop_rate", "miss_rate", "median_ctr", "ctr_median"].includes(field2) ? "percentage_points" : "count"
    };
  }
  const trendDays = range === "30d" ? 30 : 7;
  const trend = Array.from({ length: trendDays }, (_, index) => {
    const date = shiftDay2(bounds.today, index - trendDays + 1), daily = cohort(date, date), result = { date, count: daily.length, published_count: daily.length };
    for (const field2 of ["reads_24h", "ctr_24h", "completion_24h"]) {
      const values = daily.map((row) => row[field2]).filter((value) => value !== null);
      result[field2] = median(values);
      result[`${field2}_count`] = values.length;
    }
    return { ...result, reads_median: result.reads_24h, ctr_median: result.ctr_24h, completion_median: result.completion_24h };
  });
  const alerts = [];
  if (current3.missing_24h_count) alerts.push({
    code: "missing_24h",
    count: current3.missing_24h_count,
    last_snapshot_date: null,
    days_since_snapshot: null,
    message: `${current3.missing_24h_count} 篇缺少已记录年龄 12–72 小时的快照；24h 指标暂缺。`
  });
  const articleIds = new Set(allRows.map((row) => id(row.id)));
  const dates = array(data3.snapshots).filter((snapshot) => articleIds.has(id(snapshot.article_id))).map((snapshot) => day5(snapshot.snapshot_date)).filter(Boolean).sort();
  const latest = dates.at(-1) ?? null;
  const elapsed = latest ? Math.round((Date.parse(`${bounds.today}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 864e5) : null;
  if (allRows.length && (latest === null || elapsed > 2)) alerts.push({
    code: "collection_interruption",
    count: allRows.length,
    last_snapshot_date: latest,
    days_since_snapshot: elapsed,
    message: latest ? `最近快照为 ${latest}，距今 ${elapsed} 个上海日历日，已超过 2 日采集间隔。` : "已有文章但尚无有效日期的采集快照，无法确认采集连续性。"
  });
  const summary = summarySentence(current3, week);
  const conclusion = weeklyConclusion(data3.reports, account3, bounds, week);
  return { account: account3 ?? null, week, range, ...bounds, rows, previousRows, current: current3, previous, changes, trend, alerts, summary, conclusion };
}

// shared/article-diagnosis.mjs
var ARTICLE_DIAGNOSIS_KEY = "article_diagnosis";
var ARTICLE_DIAGNOSIS_PROMPT = [
  "你是头条图文数据复盘助手。只根据我给你的这一篇数据，和同账号最近30篇的平均值做对比，写且只写三句话，不要标题、不要列表、不要开头客套。",
  "第一句：这篇好在哪，必须点出明显高于均值的指标，并带上这篇的数字和均值。",
  "第二句：这篇差在哪，必须点出明显低于均值的指标，并带上这篇的数字和均值。如果没有明显短板，就写最接近均值、提升空间最大的一项。",
  "第三句：下一篇同类稿的标题或开头怎么改，只给一个具体改法，不要空话。",
  "只谈标题、展现、阅读、点击率、完读率，不要编造未提供的数据，不要评价正文内容。"
].join("\n");
var aliases2 = /* @__PURE__ */ new Map([
  ["整体", "global"],
  ["global", "global"],
  ["头条", "toutiao"],
  ["toutiao", "toutiao"],
  ["V字", "vzi"],
  ["vzi", "vzi"],
  ["鱼见", "yujian"],
  ["yujian", "yujian"],
  ["公众号", "wechat"],
  ["wechat", "wechat"]
]);
var scopeOf2 = (value) => aliases2.get(String(value || "")) || String(value || "");
function diagnosisScopes(account3) {
  const scope = scopeOf2(account3);
  if (scope === "vzi" || scope === "yujian") return ["global", "toutiao", scope];
  if (scope === "wechat") return ["wechat"];
  return scope === "global" ? ["global"] : ["global", scope];
}
function versionOf(row) {
  const value = Number(row?.version);
  return Number.isSafeInteger(value) ? value : 0;
}
function selectDiagnosisPrompt(prompts, account3) {
  const scopes = diagnosisScopes(account3);
  const rows = (Array.isArray(prompts) ? prompts : []).filter((row) => row && row.prompt_key === ARTICLE_DIAGNOSIS_KEY && row.status === "active" && scopes.includes(row.scope) && String(row.content_md || "").trim());
  rows.sort((a, b) => scopes.indexOf(b.scope) - scopes.indexOf(a.scope) || versionOf(b) - versionOf(a) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return rows[0] || null;
}
function diagnosisPromptText(prompts, account3) {
  return selectDiagnosisPrompt(prompts, account3)?.content_md?.trim() || ARTICLE_DIAGNOSIS_PROMPT;
}
function latestDiagnosisSnapshot(snapshots2, articleId) {
  const rows = (snapshots2 || []).filter((row) => row && String(row.article_id) === String(articleId));
  rows.sort((a, b) => String(b.snapshot_date || "").localeCompare(String(a.snapshot_date || "")) || (Number(b.age_hours) || 0) - (Number(a.age_hours) || 0) || String(b.id || "").localeCompare(String(a.id || "")));
  return rows[0] || null;
}
function metricValue(snapshot, key) {
  if (!snapshot) return null;
  const value = finiteNumber2(snapshot[key]);
  return value === null || value < 0 ? null : value;
}
function formatFact(value) {
  return value === null ? "未提供" : String(Math.round(value * 100) / 100);
}
var FIELDS = [["展现", "impressions"], ["阅读", "reads"], ["点击率", "ctr"], ["完读率", "completion_rate"]];
function articleDiagnosisFacts(data3, article) {
  const peers = (data3.articles || []).filter((row) => row && row.account === article.account && String(row.id) !== String(article.id)).sort(recentArticles).slice(0, 30);
  const current3 = latestDiagnosisSnapshot(data3.snapshots, article.id);
  const metrics2 = {};
  const lines = ["标题：" + (String(article.title || "").trim() || "（无标题）")];
  for (const [label3, key] of FIELDS) {
    const samples = peers.map((row) => metricValue(latestDiagnosisSnapshot(data3.snapshots, row.id), key)).filter((value2) => value2 !== null);
    const average2 = samples.length ? samples.reduce((sum, value2) => sum + value2, 0) / samples.length : null;
    const value = metricValue(current3, key);
    metrics2[key] = { value, average: average2, samples: samples.length };
    lines.push(`${label3}：${formatFact(value)}；同账号最近30篇平均：${formatFact(average2)}（有效样本 ${samples.length}）`);
  }
  return { title: article.title || "", metrics: metrics2, text: lines.join("\n") };
}

// shared/review-experiments.mjs
var EXPERIMENT_SAMPLES = 6;
var RULE_STATUS_LABELS = { candidate: "待确认", trial: "试验中", kept: "已采纳", dropped: "已放弃", hold: "暂缓" };
var measured = (row) => row.reads_24h !== null && row.reads_24h !== void 0;
var mid = (values) => {
  const known3 = values.filter((value) => value !== null && value !== void 0);
  return known3.length ? median(known3) : null;
};
function experimentEvidence(ruleId, rows = []) {
  const using = rows.filter((row) => (row.applied_rule_ids || []).includes(ruleId));
  const first = using.map((row) => day5(row.published_at)).filter(Boolean).sort()[0] || null;
  const withRows = using.filter(measured);
  const others = first ? rows.filter((row) => !(row.applied_rule_ids || []).includes(ruleId) && measured(row) && day5(row.published_at) >= first) : [];
  return {
    rule_id: ruleId,
    first_day: first,
    tagged: using.length,
    n_with: withRows.length,
    n_without: others.length,
    reads_with: mid(withRows.map((row) => row.reads_24h)),
    reads_without: mid(others.map((row) => row.reads_24h)),
    ctr_with: mid(withRows.map((row) => row.ctr_24h)),
    ctr_without: mid(others.map((row) => row.ctr_24h)),
    hits_with: withRows.filter((row) => row.verdict === "爆").length,
    needed: EXPERIMENT_SAMPLES,
    ready: withRows.length >= EXPERIMENT_SAMPLES
  };
}
function experiments(playbooks = [], rows = [], { explicit = null } = {}) {
  const rules2 = [];
  for (const book of playbooks) for (const rule of book.rules || []) {
    if (!rule || typeof rule.rule_id !== "string" || rule.overriddenByScope) continue;
    const proposed = explicit ? (explicit[book.id] || []).includes(rule.rule_id) && (rule.status ?? "candidate") === "candidate" : rule.status === "candidate";
    if (rule.status !== "trial" && !proposed) continue;
    rules2.push({
      ...rule,
      status: rule.status === "trial" ? "trial" : "candidate",
      live: experimentEvidence(rule.rule_id, rows),
      playbook: { id: book.id, account: book.account, version: book.version, content_hash: book.content_hash }
    });
  }
  return rules2;
}
function splitPattern(label3) {
  const text = String(label3 ?? "").trim(), match = /^([A-Za-z]{1,3}\d{1,3})[\s·:：.、-]+(\S[\s\S]*)$/.exec(text);
  return match ? { code: match[1], name: match[2].trim() } : { code: "", name: text };
}
function patternStats(rows = [], labels4 = {}) {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const label3 = row.title_pattern || labels4[row.id];
    if (!label3 || !measured(row)) continue;
    const { code, name } = splitPattern(label3);
    if (!groups.has(name)) groups.set(name, { code: "", items: [] });
    const group = groups.get(name);
    group.items.push(row);
    group.code ||= code;
  }
  for (const [name, group] of [...groups]) {
    const full = name.length >= 8 && [...groups.keys()].filter((other) => other !== name && other.startsWith(name));
    if (!full || full.length !== 1) continue;
    const target = groups.get(full[0]);
    target.items.push(...group.items);
    target.code ||= group.code;
    groups.delete(name);
  }
  return [...groups.entries()].map(([pattern2, { code, items }]) => ({
    pattern: pattern2,
    code,
    count: items.length,
    reads: mid(items.map((row) => row.reads_24h)),
    ctr: mid(items.map((row) => row.ctr_24h)),
    hits: items.filter((row) => row.verdict === "爆").length,
    articles: [...items].sort((x, y) => y.reads_24h - x.reads_24h).map((row) => ({ id: row.id, title: row.title || "", reads: row.reads_24h, verdict: row.verdict || "" }))
  })).sort((x, y) => y.count - x.count || (y.reads ?? 0) - (x.reads ?? 0));
}
function weeklyPeriod(today2) {
  const at = /* @__PURE__ */ new Date(today2 + "T00:00:00Z"), weekday = at.getUTCDay();
  let back = (weekday - 5 + 7) % 7;
  if (back < 2) back += 7;
  const end = new Date(at.getTime() - back * 864e5), start = new Date(end.getTime() - 6 * 864e5);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
function ruleShortName(text, max = 22) {
  const line = String(text ?? "").split("\n").map((part) => part.replace(/[*_`#>]/g, "").replace(/^[\s\-·•\d.、)）]+/, "").trim()).find(Boolean) || "";
  const sentence = line.split(/[。；;！!？?]/)[0].trim();
  return sentence.length > max ? sentence.slice(0, max) + "…" : sentence;
}
function ruleNames(playbooks = []) {
  const names = /* @__PURE__ */ new Map();
  for (const book of playbooks) for (const rule of book.rules || []) {
    if (!rule || typeof rule.rule_id !== "string" || names.has(rule.rule_id)) continue;
    const name = ruleShortName(rule.text);
    if (name && name !== rule.rule_id) names.set(rule.rule_id, name);
  }
  return names;
}
var namedPattern = (pattern2, names) => names?.has(pattern2) ? `${names.get(pattern2)}（${pattern2}）` : pattern2;

// web/core/review-markdown.mjs
init_dom();
function safeReviewUrl(value) {
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
function inline2(value, depth = 0) {
  const text = String(value);
  if (depth >= 8) return e(text);
  const last = new Map(["[/red]", "[/blue]", "[/green]", "[/amber]", "**", "`"].map((token) => [token, text.lastIndexOf(token)]));
  let out = "", plain2 = 0, pos = 0;
  let linkMiddle = text.indexOf("]("), linkEnd = linkMiddle < 0 ? -1 : text.indexOf(")", linkMiddle + 2);
  const emit2 = (end, html) => {
    out += e(text.slice(plain2, pos)) + html;
    pos = end;
    plain2 = end;
  };
  while (pos < text.length) {
    const color = text[pos] === "[" ? text.slice(pos, pos + 7).match(/^\[(red|blue|green|amber)\]/) : null;
    if (color) {
      const close = `[/${color[1]}]`, start = pos + color[0].length;
      const end = last.get(close) >= start ? text.indexOf(close, start) : -1;
      if (end >= start) {
        emit2(end + close.length, `<span class="review-color-${color[1]}">${inline2(text.slice(start, end), depth + 1)}</span>`);
        continue;
      }
    }
    const token = text.startsWith("**", pos) ? "**" : text[pos] === "`" ? "`" : "";
    if (token && last.get(token) > pos + token.length) {
      const end = text.indexOf(token, pos + token.length), content2 = text.slice(pos + token.length, end);
      emit2(end + token.length, token === "`" ? `<code>${e(content2)}</code>` : `<strong>${inline2(content2, depth + 1)}</strong>`);
      continue;
    }
    if (text[pos] === "[") {
      if (linkMiddle >= 0 && linkMiddle <= pos) {
        linkMiddle = text.indexOf("](", pos + 1);
        linkEnd = linkMiddle < 0 ? -1 : text.indexOf(")", linkMiddle + 2);
      }
      if (linkMiddle > pos && linkEnd > linkMiddle + 2) {
        const label3 = text.slice(pos + 1, linkMiddle), href = safeReviewUrl(text.slice(linkMiddle + 2, linkEnd));
        emit2(linkEnd + 1, href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(label3)}</a>` : e(label3));
        continue;
      }
    }
    pos++;
  }
  return out + e(text.slice(plain2));
}
function renderReviewMarkdown(value) {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  let list2 = false, code = false, out = "";
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (list2) {
        out += "</ul>";
        list2 = false;
      }
      out += code ? "</code></pre>" : "<pre><code>";
      code = !code;
      continue;
    }
    if (code) {
      out += e(line) + "\n";
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) {
      if (!list2) {
        out += "<ul>";
        list2 = true;
      }
      out += `<li>${inline2(item[1])}</li>`;
      continue;
    }
    if (list2) {
      out += "</ul>";
      list2 = false;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const h = Math.min(heading[1].length + 1, 5);
      out += `<h${h}>${inline2(heading[2])}</h${h}>`;
    } else if (line.trim()) out += /^>\s?/.test(line) ? `<blockquote>${inline2(line.replace(/^>\s?/, ""))}</blockquote>` : `<p>${inline2(line)}</p>`;
  }
  return out + (list2 ? "</ul>" : "") + (code ? "</code></pre>" : "");
}

// web/pages/review-ai.mjs
init_dom();
var AI_FEATURE_LABELS = { weekly: "周报", titles: "标题归类", benchmarks: "爆文拆解", diagnosis: "单篇诊断" };
var AI_EFFORT_LABELS = [["", "模型默认"], ["low", "低"], ["medium", "中"], ["high", "高"]];
var known = (value) => value !== null && value !== void 0 && Number.isFinite(value);
var reads = (value) => !known(value) ? "—" : value >= 1e4 ? `${(value / 1e4).toFixed(1)} 万` : Math.round(value).toLocaleString("zh-CN");
var rate2 = (value) => known(value) ? `${value.toFixed(1)}%` : "—";
var busy = (ai2, key) => ai2?.busy === key;
var nameCache = /* @__PURE__ */ new WeakMap();
function namesOf(data3) {
  const books = data3?.playbooks;
  if (!Array.isArray(books)) return /* @__PURE__ */ new Map();
  if (!nameCache.has(books)) nameCache.set(books, ruleNames(books));
  return nameCache.get(books);
}
function patternHtml(pattern2, names) {
  return names.has(pattern2) ? `${e(names.get(pattern2))} <small class="review-pattern-code">${e(pattern2)}</small>` : e(pattern2);
}
var button2 = (label3, action, attrs = "", kind = "btn small") => `<button class="${kind}" type="button" data-ai-action="${action}" ${attrs}>${e(label3)}</button>`;
function onceOptions(ai2, feature) {
  if (ai2?.options !== feature) return "";
  const models = ai2.models?.length ? ai2.models : [];
  return `<div class="review-ai-once" role="group" aria-label="仅这一次的模型和强度"><label>模型<select class="input" data-ai-once="model">
    <option value="">按设置</option>${models.map((id2) => `<option value="${e(id2)}"${ai2.once?.model === id2 ? " selected" : ""}>${e(id2)}</option>`).join("")}</select></label>
    <label>强度<select class="input" data-ai-once="effort"><option value="">按设置</option>${AI_EFFORT_LABELS.slice(1).map(([id2, label3]) => `<option value="${id2}"${ai2.once?.effort === id2 ? " selected" : ""}>${label3}</option>`).join("")}</select></label>
    <span class="review-note">${ai2.modelsError ? e(ai2.modelsError) : models.length ? "只对这一次生效" : "正在读取模型列表…"}</span></div>`;
}
function runControls(ai2, feature, label3) {
  const working = busy(ai2, feature);
  return `<div class="review-ai-run">${button2(
    working ? "正在生成…" : label3,
    "run",
    `data-ai-feature="${feature}"${working || ai2?.busy ? " disabled" : ""}`,
    "btn small primary"
  )}
    ${button2("⚙", "options", `data-ai-feature="${feature}" aria-label="这一次用别的模型或强度" aria-expanded="${ai2?.options === feature}"`, "btn small review-ai-gear")}
    ${onceOptions(ai2, feature)}</div>`;
}
function notice(ai2, feature) {
  const message = ai2?.messages?.[feature];
  return message ? `<p class="review-ai-message${message.error ? " is-error" : ""}" role="${message.error ? "alert" : "status"}">${e(message.text)}</p>` : "";
}
function unavailable(ai2) {
  if (!ai2 || ai2.status === "loading") return '<p class="review-note" role="status">正在读取 AI 结果…</p>';
  if (ai2.status === "error") return `<p class="review-ai-message is-error" role="alert">${e(ai2.error || "AI 结果读取失败")} ${button2("重试", "reload")}</p>`;
  if (!ai2.data?.configured) return '<p class="review-note">服务器还没有配置 API 密钥和默认模型，AI 功能暂不可用。</p>';
  return "";
}
function evidenceLine(live2) {
  if (!live2.n_with) return live2.tagged ? `已有 ${live2.tagged} 篇用了这条，数据还没满 24 小时。` : "还没有文章标明用了这条。";
  const compare3 = live2.n_without ? `；同期没用的 ${live2.n_without} 篇：阅读 ${reads(live2.reads_without)}，点击率 ${rate2(live2.ctr_without)}` : "";
  return `用了的 ${live2.n_with} 篇：阅读中位数 ${reads(live2.reads_with)}，点击率 ${rate2(live2.ctr_with)}${compare3}。`;
}
function ruleCard(rule, ai2) {
  const working = ai2?.busy === "rule:" + rule.rule_id, canWrite = Boolean(rule.playbook.content_hash);
  const attrs = `data-rule-id="${e(rule.rule_id)}" data-playbook-id="${e(rule.playbook.id)}"${working || ai2?.busy || !canWrite ? " disabled" : ""}`;
  const trial = rule.status === "trial", live2 = rule.live;
  const actions2 = trial ? `${button2("采纳", "rule-status", `data-status="kept" ${attrs}`, "btn small primary")}
      ${button2("放弃", "rule-status", `data-status="dropped" ${attrs}`)}${live2.ready ? "" : '<span class="review-note">样本还少，建议先继续观察</span>'}` : `${button2("同意试验", "rule-status", `data-status="trial" ${attrs}`, "btn small primary")}${button2("不采纳", "rule-status", `data-status="dropped" ${attrs}`)}`;
  const progress = trial ? `<div class="review-exp-progress"><span class="review-exp-bar"><i class="review-exp-fill review-exp-fill-${Math.min(
    6,
    live2.n_with
  )}"></i></span>
      <strong>${live2.n_with}/${live2.needed} 篇</strong>${live2.ready ? '<span class="review-exp-ready">可以下结论</span>' : ""}</div>
      <p class="review-exp-evidence">${e(evidenceLine(live2))}</p>` : "";
  return `<article class="review-exp-card${trial ? " is-trial" : ""}"><p class="review-exp-text">${e(rule.text || rule.rule_id)}</p>${progress}
    <div class="review-exp-actions">${actions2}</div><span
      class="review-exp-id">${e(rule.rule_id)} · ${e(rule.playbook.account)} v${e(rule.playbook.version)}</span></article>`;
}
function renderExperiments(data3, vm3, { compact: compact2 = false } = {}) {
  const ai2 = vm3.ai, rows = enrichArticles(data3, { account: vm3.account });
  const rules2 = experiments(data3.playbooks, rows, { explicit: ai2?.data?.candidates || {} });
  const waiting = rules2.filter((rule) => rule.status === "candidate").slice(0, 8), running = rules2.filter((rule) => rule.status === "trial");
  if (compact2 && !waiting.length && !running.length) return "";
  const message = ai2?.messages?.rules;
  const group = (title, hint, items, none) => `<div class="review-exp-group"><h3>${title} <small>${items.length} 条</small></h3>${items.length ? `<p class="review-note">${hint}</p><div class="review-exp-list">${items.map((rule) => ruleCard(
    rule,
    ai2
  )).join("")}</div>` : `<p class="review-note">${none}</p>`}</div>`;
  return `<section class="review-exp" aria-label="小改试验"><div class="review-exp-head"><h2>小改试验</h2></div>
    ${message ? `<p class="review-ai-message${message.error ? " is-error" : ""}" role="${message.error ? "alert" : "status"}">${e(message.text)}</p>` : ""}
    ${group("待你确认", "同意后进入试验；之后的文章标明用了它，数据会自动对比。", waiting, ai2?.status === "ready" ? "没有新的小改建议。" : "正在读取…")}
    ${group("进行中的试验", `每条攒够 ${running[0]?.live.needed ?? 6} 篇有数据的文章再下结论；阅读取发布后约 24 小时。`, running, "没有进行中的试验。")}</section>`;
}
function weeklySection(vm3) {
  const ai2 = vm3.ai, gate = unavailable(ai2);
  if (gate) return `<section class="review-ai-block"><h2>周报</h2>${gate}</section>`;
  const reports = ai2.data.weekly || [], latest = reports[0], due = ai2.data.pending?.weekly;
  const body2 = (report) => `<div class="review-markdown review-weekly-body">${renderReviewMarkdown(report.summary_md || "")}</div>
    <p class="review-note">${e(report.period_start)} 至 ${e(report.period_end)} · ${e(report.model || "")}${report.effort ? " · 强度" + e(AI_EFFORT_LABELS.find(([id2]) => id2 === report.effort)?.[1] || "") : ""}</p>`;
  const older = reports.slice(1).map((report) => `<details
    class="review-weekly-old"><summary>${e(report.period_start)} 至 ${e(report.period_end)}</summary>${body2(report)}</details>`).join("");
  const hint = due ? `${due.start} 至 ${due.end} 的周报还没生成。` : latest ? "本期已生成，可以重新生成。" : "";
  return `<section class="review-ai-block" aria-label="周报"><div class="review-ai-head"><h2>周报</h2><span class="review-note">${e(hint)}</span></div>
    ${runControls(ai2, "weekly", latest && !due ? "重新生成" : "立即生成")}${notice(ai2, "weekly")}
    ${latest ? body2(latest) : '<p class="review-note">还没有周报。每周日生成上周六到本周五的总结，也可以现在点“立即生成”。</p>'}${older}</section>`;
}
function patternSection(data3, vm3) {
  const ai2 = vm3.ai, gate = unavailable(ai2), rows = enrichArticles(data3, { account: vm3.account });
  const labels4 = ai2?.data?.titles || {}, stats = patternStats(rows, labels4), pending = ai2?.data?.pending?.titles || 0, names = namesOf(data3);
  const article = (item) => `<li><button type="button" class="review-title-button" data-review-article="${e(item.id)}"
    aria-haspopup="dialog">${e(item.title || "未命名文章")}</button>
    <span class="review-note">阅读 ${e(reads(item.reads))}${item.verdict ? " · " + e(item.verdict) : ""}</span></li>`;
  const block = (item) => {
    const best = item.articles[0], few = item.count < 3;
    const code = item.code && !names.has(item.pattern);
    return `<details class="review-pattern-item"><summary><span class="review-pattern-name">${patternHtml(item.pattern, names)}${code ? ` <small class="review-pattern-code">${e(item.code)}</small>` : ""}${few ? ' <small class="review-pattern-code">样本少</small>' : ""}</span>
      <span class="review-pattern-figures"><span><b>${item.count}</b> 篇</span><span>阅读中位数 <b>${e(reads(item.reads))}</b></span>
      <span>点击率 <b>${e(rate2(item.ctr))}</b></span><span>爆款 <b>${item.hits}</b></span></span>
      <span class="review-pattern-example">例：${e(best?.title || "未命名文章")}<span class="review-note">（阅读 ${e(reads(best?.reads))}）</span></span></summary>
      <ul class="review-pattern-articles">${item.articles.map(article).join("")}</ul></details>`;
  };
  const table2 = stats.length ? `<div class="review-pattern-list">${stats.map(block).join("")}</div>
    <p class="review-note">每个套路下面的“例”是其中阅读最高的一篇，点开可以看全部文章。只统计有 24 小时数据的文章；少于 3 篇的套路仅供参考。</p>` : '<p class="review-note">还没有归类好的标题。</p>';
  return `<section class="review-ai-block" aria-label="标题套路"><div class="review-ai-head"><h2>标题套路</h2>
    <span class="review-note">${pending ? `${pending} 篇还没归类` : "全部已归类"}</span></div>
    ${gate || (pending ? runControls(ai2, "titles", `归类 ${Math.min(pending, 60)} 篇`) : "")}${notice(ai2, "titles")}${table2}</section>`;
}
function renderWeeklyPage(data3, vm3) {
  return `<div class="review-weekly-page">${renderExperiments(data3, vm3)}${weeklySection(vm3)}${patternSection(data3, vm3)}</div>`;
}
function benchmarkAiBar(vm3) {
  const ai2 = vm3.ai, gate = unavailable(ai2), pending = ai2?.data?.pending?.benchmarks || 0;
  return `<div class="review-ai-block review-ai-bar"><div class="review-ai-head"><h2>爆文拆解</h2>
    <span class="review-note">${gate ? "" : pending ? `${pending} 篇还没拆解 · 只根据标题和阅读量` : "全部已拆解 · 只根据标题和阅读量"}</span></div>
    ${gate || (pending ? runControls(ai2, "benchmarks", `拆解 ${Math.min(pending, 30)} 篇`) : "")}${notice(ai2, "benchmarks")}</div>`;
}
function renderBenchmarkBreakdown(data3, vm3) {
  const notes = vm3.ai?.data?.benchmarks || {}, accounts = new Map((data3.benchmarkAccounts || []).map((item) => [String(item.id), item.name]));
  const used = new Set((data3.articles || []).map((row) => row.reference_article_id).filter(Boolean).map(String));
  const items = (data3.benchmarkArticles || []).filter((item) => notes[item.id]).sort((a, b) => (b.reads ?? 0) - (a.reads ?? 0)).slice(0, 30);
  const safe = (value) => {
    try {
      const url = new URL(String(value));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  };
  const list2 = items.map((item) => {
    const url = safe(item.url), title = e(item.title || "未命名文章");
    return `<li class="review-breakdown-item"><div class="review-breakdown-title">${url ? `<a href="${e(url)}" target="_blank"
      rel="noopener noreferrer">${title}</a>` : title}
      <span class="review-note">${e(accounts.get(String(item.benchmark_account_id)) || "")} · 阅读 ${e(reads(item.reads))}${used.has(String(item.id)) ? " · 已仿写" : ""}</span></div>
      ${benchmarkAiNote(vm3, item.id)}</li>`;
  }).join("");
  return `${benchmarkAiBar(vm3)}${list2 ? `<ul class="review-breakdown-list">${list2}</ul>` : ""}`;
}
function benchmarkAiNote(vm3, id2) {
  const note = vm3.ai?.data?.benchmarks?.[id2];
  if (!note) return "";
  const part = (label3, value) => value ? `<span><b>${label3}</b>${e(value)}</span>` : "";
  return `<div class="review-ai-note">${part("套路", note.pattern)}${part("钩子", note.hook)}${part("题材", note.topic)}${part("可套用", note.template)}</div>`;
}
function titlePattern(vm3, row, data3) {
  const own3 = row.title_pattern, label3 = own3 || vm3.ai?.data?.titles?.[row.id], names = namesOf(data3);
  const shown = names.has(label3) ? names.get(label3) : label3, origin = own3 ? "已登记的标题套路" : "AI 归类";
  return label3 ? `<span class="review-pattern-tag${own3 ? "" : " is-ai"}" title="${e(origin + (shown === label3 ? "" : "：" + label3))}">${e(shown)}</span>` : "";
}
function renderAiSettings(ai2) {
  if (!ai2 || ai2.status === "loading") return '<section id="ai-settings" class="ai-settings"><p role="status">正在读取 AI 设置…</p></section>';
  if (ai2.status === "error") return `<section id="ai-settings" class="ai-settings"><p role="alert">${e(ai2.error || "读取失败")}</p>${button2(
    "重试",
    "reload"
  )}</section>`;
  const data3 = ai2.data, draft = ai2.draft || data3.settings, models = ai2.models || [];
  const modelSelect = (feature, value) => {
    const list2 = [.../* @__PURE__ */ new Set([...value ? [value] : [], ...models])];
    return `<select class="input" data-ai-setting="model" data-ai-feature="${feature}" aria-label="${AI_FEATURE_LABELS[feature]}的模型">
      <option value="">服务器默认${data3.default_model ? `（${e(data3.default_model)}）` : ""}</option>${list2.map((id2) => `<option value="${e(id2)}"${id2 === value ? " selected" : ""}>${e(id2)}</option>`).join("")}</select>`;
  };
  const effortSelect = (feature, value) => `<select class="input" data-ai-setting="effort" data-ai-feature="${feature}"
    aria-label="${AI_FEATURE_LABELS[feature]}的强度">
    ${AI_EFFORT_LABELS.map(([id2, label3]) => `<option value="${id2}"${id2 === value ? " selected" : ""}>${label3}</option>`).join("")}</select>`;
  const rows = Object.entries(AI_FEATURE_LABELS).map(([feature, label3]) => `<tr><th scope="row">${label3}</th>
    <td data-label="模型">${modelSelect(feature, draft.features[feature].model)}</td><td data-label="强度">${effortSelect(
    feature,
    draft.features[feature].effort
  )}</td></tr>`).join("");
  const status = { succeeded: "成功", failed: "失败", running: "进行中" };
  const time2 = (value) => value ? new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value)) : "";
  const runs = (data3.runs || []).map((run2) => `<tr><td>${e(time2(run2.started_at))}</td><td>${e(AI_FEATURE_LABELS[run2.feature] || run2.feature)}</td><td>${e(run2.model || "")}${run2.effort ? " · " + e(run2.effort) : ""}</td>
    <td class="${run2.status === "failed" ? "ai-run-failed" : ""}">${status[run2.status] || run2.status}${run2.effort_ignored ? "（该模型不支持强度，已忽略）" : ""}${run2.message ? "：" + e(run2.message) : ""}</td>
    <td>${known(run2.input_tokens) ? `${run2.input_tokens} / ${run2.output_tokens ?? "—"}` : "—"}</td></tr>`).join("");
  const message = ai2.messages?.settings;
  return `<section id="ai-settings" class="ai-settings" aria-label="AI 设置">
    ${data3.configured ? "" : '<p role="alert">服务器还没有配置 API 密钥和默认模型。密钥只保存在服务器后台，不会出现在网页里。</p>'}
    <form id="ai-settings-form"><h2>每个功能的默认模型和强度</h2>
    <div class="ai-settings-table-wrap"><table class="ai-settings-table"><thead><tr><th>功能</th><th>模型</th><th>强度</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="muted">${ai2.modelsError ? e(ai2.modelsError) : models.length ? "模型列表来自你的 API 账号。强度只对支持推理强度的模型有效，不支持时会自动忽略。" : "正在读取模型列表…"}</p>
    <label class="ai-settings-limit">每日最多调用次数<input class="input" type="number" min="0" max="200" step="1" inputmode="numeric"
      data-ai-setting="daily_limit" value="${draft.daily_limit}"></label>
    <p class="muted">今天已用 ${data3.usage.used} / ${data3.usage.limit} 次。到上限后当天不再调用；单篇诊断另有每天 20 篇的上限。</p>
    <div class="form-actions"><button class="btn primary" type="submit"${ai2.busy === "settings" || !ai2.dirty ? " disabled" : ""}>${ai2.busy === "settings" ? "正在保存…" : "保存"}</button>
    <span role="${message?.error ? "alert" : "status"}" class="${message?.error ? "ai-run-failed" : "muted"}">${e(message?.text || (ai2.dirty ? "有未保存的修改" : ""))}</span></div></form>
    <h2>最近运行</h2>${runs ? `<div class="ai-settings-table-wrap"><table
      class="ai-runs-table"><thead><tr><th>时间</th><th>功能</th><th>模型</th><th>结果</th><th>输入 / 输出 token</th></tr></thead><tbody>${runs}</tbody></table></div>
    <p class="muted">这里显示 token 用量；折合金额请以 OpenAI 后台账单为准。</p>` : '<p class="muted">最近三天没有运行记录。</p>'}</section>`;
}

// web/pages/review-traffic-card.mjs
init_dom();
var valid = (value, max = Infinity) => {
  const n = finiteNumber(value);
  return n !== null && n >= 0 && n <= max ? n : null;
};
var count = (value) => {
  const n = valid(value);
  return n === null ? "—" : n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
};
var percent = (value) => {
  const n = valid(value, 100);
  return n === null ? "—" : `${n.toFixed(1)}%`;
};
var duration2 = (value) => {
  const n = valid(value);
  if (n === null) return "—";
  const seconds = Math.round(n);
  return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
};
function renderTrafficCard(snapshots2, articleId) {
  const matching = (Array.isArray(snapshots2) ? snapshots2 : []).filter((s) => String(s?.article_id) === String(articleId));
  const snapshot = latestSnapshots(matching).get(String(articleId));
  const primary = [
    ["展现量", count(snapshot?.impressions), "粉丝展现量", count(snapshot?.fan_impressions)],
    ["阅读量", count(snapshot?.reads), "粉丝阅读量", count(snapshot?.fan_reads)]
  ];
  const secondary = [
    ["点击率", percent(snapshot?.ctr)],
    ["平均阅读完成率", percent(snapshot?.completion_rate)],
    ["平均阅读时长", duration2(snapshot?.avg_read_seconds)]
  ];
  return `<section class="review-traffic-card" aria-label="文章流量数据">${snapshot ? `<div class="review-traffic-date">数据日期 ${e(snapshot.snapshot_date)}</div>` : ""}<dl class="review-traffic-primary">${primary.map(([label3, value, subLabel, subValue]) => `<div><dt>${e(label3)}</dt><dd>${e(value)}</dd><div class="review-traffic-fan">${e(subLabel)} <span>${e(subValue)}</span></div></div>`).join("")}</dl><dl class="review-traffic-secondary">${secondary.map(([label3, value]) => `<div><dt>${e(label3)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl></section>`;
}

// web/pages/review-diagnosis.mjs
init_dom();
function renderArticleDiagnosis(row, vm3) {
  const saved = vm3.diagnoses?.[row.id] || {};
  if (saved.text) return `<section class="review-diagnosis" aria-label="AI诊断"><h3>AI诊断</h3><p class="review-diagnosis-result">${e(saved.text)}</p></section>`;
  const busy2 = saved.status === "saving";
  const error = saved.status === "error" && saved.error ? `<p class="review-note" role="alert">${e(saved.error)}</p>` : "";
  const label3 = busy2 ? "正在诊断…" : "AI诊断";
  const disabled = busy2 ? " disabled" : "";
  return `<section class="review-diagnosis" aria-label="AI诊断"><h3>AI诊断</h3>${error}<button class="btn" type="button" data-review-action="diagnose-article" data-article-id="${e(row.id)}"${disabled}>${label3}</button></section>`;
}

// web/core/review-trends.mjs
var ROLLING_DAYS = 7;
var ROLLING_MIN_SAMPLES = 3;
var DAY_MS = 864e5, BEIJING_OFFSET_MS = 8 * 36e5;
var instant = (value) => typeof value === "string" && value.includes("T") && day4(value) ? Date.parse(value) : null;
var stamp2 = (value) => Number.isFinite(instant(value)) ? instant(value) : null;
var number = (value, max = Infinity) => {
  const n = finiteNumber(value);
  return n !== null && n >= 0 && n <= max ? n : null;
};
var statusOf = (row) => row.publication_status ?? row.publish_status ?? row.status;
var unpublishedStatuses = ["draft", "drafting", "illustrated", "draft_saved", "scheduled", "pending", "failed", "unpublished", "deleted", "retracted"];
var unpublished = (row) => unpublishedStatuses.includes(statusOf(row));
var confirmed = (row) => statusOf(row) === "published";
function trendBounds({ range = "30d", from = "", to = "", now = (/* @__PURE__ */ new Date()).toISOString() } = {}) {
  const today2 = day4(now);
  if (!today2 || stamp2(now) === null) throw new TypeError("趋势需要带时区的当前时间。");
  if (!["7d", "30d", "custom"].includes(range)) throw new TypeError("请选择近 7 天、近 30 天或自定义日期。");
  const start = range === "custom" ? from : shiftDay(today2, range === "30d" ? -29 : -6);
  const end = range === "custom" ? to : today2;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || day4(start) !== start || !/^\d{4}-\d{2}-\d{2}$/.test(end) || day4(end) !== end)
    throw new TypeError("请选择有效的开始日期和结束日期。");
  const days = (Date.parse(end) - Date.parse(start)) / DAY_MS + 1;
  if (days < 1) throw new TypeError("结束日期不能早于开始日期。");
  if (end > today2) throw new TypeError("结束日期不能晚于今天。");
  if (days > 366) throw new TypeError("自定义范围最多 366 天。");
  return { range, start, end, today: today2, days };
}
function summarize(rows) {
  const sample = (key, max) => rows.map((row) => number(row.sample24h?.[key], max)).filter((value) => value !== null);
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const reads3 = sample("reads"), ctr = sample("ctr", 100), completion = sample("completion_rate", 100), seconds = sample("avg_read_seconds");
  const judged = rows.filter((row) => row.verdict), verdicts = (name) => judged.filter((row) => row.verdict === name).length;
  const hits = verdicts("爆");
  const unknown2 = rows.filter((row) => !confirmed(row)).length;
  const dates = rows.map((row) => day4(row.sample24h?.snapshot_date)).filter(Boolean).sort();
  const ages = rows.map((row) => number(row.sample24h?.age_hours)).filter((value) => value !== null);
  return {
    record_count: rows.length,
    published_count: unknown2 ? null : rows.length,
    confirmed_count: rows.length - unknown2,
    unverified_count: unknown2,
    median_reads: median(reads3),
    median_ctr: median(ctr),
    average_reads: mean(reads3),
    average_ctr: mean(ctr),
    average_completion: mean(completion),
    average_seconds: mean(seconds),
    hits: judged.length || !rows.length ? hits : null,
    middles: verdicts("中"),
    flops: verdicts("扑"),
    hit_rate: judged.length ? hits / judged.length * 100 : null,
    coverage: {
      average_reads: reads3.length,
      average_ctr: ctr.length,
      average_completion: completion.length,
      average_seconds: seconds.length,
      hits: judged.length,
      hit_rate: judged.length,
      published_count: rows.length - unknown2,
      record_count: rows.length
    },
    provisional_count: rows.filter((row) => row.trend_provisional).length,
    unknown_age_count: rows.filter((row) => row.trend_unknown_age).length,
    fixed_threshold_count: judged.filter((row) => !row.verdict_reliable).length,
    provisional_judged_count: judged.filter((row) => row.trend_provisional || !row.verdict_reliable).length,
    unjudged_count: rows.length - judged.length,
    snapshot_start: dates[0] || null,
    snapshot_end: dates.at(-1) || null,
    min_hours: ages.length ? Math.min(...ages) : null,
    max_hours: ages.length ? Math.max(...ages) : null
  };
}
function headline(current3, previous) {
  const comparable = previous.record_count > 0;
  const both = (key) => comparable && current3[key] !== null && previous[key] !== null;
  const tile = (key, unit, extra = {}) => ({
    key,
    unit,
    value: current3[key],
    previous: comparable ? previous[key] : null,
    // Reads span orders of magnitude, so their change is relative; rates change in percentage points.
    delta: !both(key) ? null : unit === "relative" ? previous[key] ? (current3[key] - previous[key]) / previous[key] * 100 : null : current3[key] - previous[key],
    ...extra
  });
  return [
    tile("record_count", "count"),
    tile("median_reads", "relative", { sample: current3.coverage.average_reads }),
    tile("hit_rate", "points", { hits: current3.hits, sample: current3.coverage.hits }),
    tile("median_ctr", "points", { sample: current3.coverage.average_ctr })
  ];
}
function reviewTrends(data3 = {}, options4 = {}) {
  const { account: account3 = "V字", verdict = "", now = (/* @__PURE__ */ new Date()).toISOString() } = options4;
  const bounds = trendBounds({ ...options4, now }), nowMs = stamp2(now);
  const source = (data3.articles || []).filter((row) => row.account === account3);
  const past = (row) => day4(row.published_at) && day4(row.published_at) <= bounds.today && (stamp2(row.published_at) === null || stamp2(row.published_at) <= nowMs);
  const articles = source.filter((row) => !unpublished(row) && past(row));
  const byId = new Map(articles.map((row) => [String(row.id), row]));
  const snapshots2 = (data3.snapshots || []).filter((snapshot) => {
    const row = byId.get(String(snapshot.article_id)), date = day4(snapshot.snapshot_date);
    if (!row || !date || date > bounds.today || date < day4(row.published_at)) return false;
    const published = stamp2(row.published_at), hours = number(snapshot.age_hours);
    return published === null || hours === null || hours <= (nowMs - published) / 36e5 + 1;
  });
  const rows = enrichArticles({ ...data3, articles, snapshots: snapshots2 }, { account: account3, baselineData: data3 }).map((row) => {
    const published = stamp2(row.published_at), age = number(row.sample24h?.age_hours);
    const elapsed = published === null ? null : (nowMs - published) / 36e5;
    return {
      ...row,
      trend_provisional: elapsed !== null && elapsed < 24 || age !== null && age < 24,
      trend_unknown_age: published === null && age === null && day4(row.published_at) >= shiftDay(bounds.today, -1)
    };
  });
  const pool = rows.filter((row) => !verdict || row.verdict === verdict);
  const between = (start, end) => pool.filter((row) => day4(row.published_at) >= start && day4(row.published_at) <= end);
  const selected = between(bounds.start, bounds.end);
  const previous = { start: shiftDay(bounds.start, -bounds.days), end: shiftDay(bounds.start, -1) };
  const rolling = (date, key) => {
    const values = between(shiftDay(date, 1 - ROLLING_DAYS), date).map((row) => row[key]).filter((value) => value !== null);
    return values.length >= ROLLING_MIN_SAMPLES ? median(values) : null;
  };
  const first = selected.map((row) => day4(row.published_at)).sort()[0];
  const plot = { start: first || bounds.start, end: bounds.end };
  const startMs = Date.parse(`${plot.start}T00:00:00Z`);
  plot.days = (Date.parse(`${plot.end}T00:00:00Z`) - startMs) / DAY_MS + 1;
  const series = Array.from({ length: bounds.days }, (_, index) => {
    const date = shiftDay(bounds.start, index);
    return {
      date,
      position: date < plot.start ? null : ((Date.parse(`${date}T00:00:00Z`) - startMs) / DAY_MS + 0.5) / plot.days,
      ...summarize(between(date, date)),
      rolling_reads: rolling(date, "reads_24h"),
      rolling_ctr: rolling(date, "ctr_24h")
    };
  });
  const points = selected.map((row) => {
    const date = day4(row.published_at), published = stamp2(row.published_at);
    const position = published === null ? ((Date.parse(`${date}T00:00:00Z`) - startMs) / DAY_MS + 0.5) / plot.days : (published + BEIJING_OFFSET_MS - startMs) / (plot.days * DAY_MS);
    return {
      id: row.id,
      title: row.title || "",
      date,
      published_at: row.published_at,
      timed: published !== null,
      position: Math.min(1, Math.max(0, position)),
      reads: row.reads_24h,
      ctr: row.ctr_24h,
      verdict: row.verdict,
      provisional: row.trend_provisional || row.trend_unknown_age
    };
  }).sort((a, b) => a.position - b.position);
  const basis = rows[0]?.verdict_basis;
  const summary = summarize(selected);
  return {
    ...bounds,
    account: account3,
    verdict,
    previous,
    plot,
    kpis: headline(summary, summarize(between(previous.start, previous.end))),
    points,
    series,
    top: points.filter((point) => point.reads !== null).sort((a, b) => b.reads - a.reads)[0] || null,
    thresholds: basis ? { hit: basis.high_threshold, flop: basis.low_threshold, method: basis.method, sample_count: basis.sample_count } : null,
    rolling: { days: ROLLING_DAYS, min_samples: ROLLING_MIN_SAMPLES },
    rows: selected,
    summary,
    excluded: {
      unpublished: source.filter(unpublished).length,
      undated: source.filter((row) => !unpublished(row) && !day4(row.published_at)).length,
      future: source.filter((row) => !unpublished(row) && day4(row.published_at) && !past(row)).length
    },
    loaded_at: data3.loadedAt || null,
    generated_at: now
  };
}

// web/pages/review-trends.mjs
init_dom();
var RANGES = [["7d", "近 7 天"], ["30d", "近 30 天"], ["custom", "自定义"]];
var KPI_LABELS = { record_count: "发文数", median_reads: "阅读中位数", hit_rate: "爆款率", median_ctr: "点击率中位数" };
var VERDICT_CLASS = { 爆: "hit", 中: "middle", 扑: "flop" };
var known2 = (value) => value !== null && value !== void 0 && Number.isFinite(value);
var reads2 = (value) => !known2(value) ? "—" : value >= 1e4 ? `${(value / 1e4).toFixed(1)} 万` : value.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
var percent2 = (value) => known2(value) ? `${value.toFixed(1)}%` : "—";
var readsTick = (value) => value >= 1e4 ? `${value / 1e4} 万` : value.toLocaleString("zh-CN");
var percentTick = (value) => `${value}%`;
var count2 = (value) => known2(value) ? value.toLocaleString("zh-CN") : "—";
var options2 = (values, selected) => values.map(([value, label3]) => `<option value="${e(value)}"${value === selected ? " selected" : ""}>${e(label3)}</option>`).join("");
function controls({ range, from, to, today: today2 }) {
  const dates = range === "custom" ? `<label>开始日期<input class="input" type="date" data-review-trend="from"
    value="${e(from)}" max="${e(today2)}"></label><label>结束日期<input class="input" type="date"
    data-review-trend="to" value="${e(to)}" max="${e(today2)}"></label>` : "";
  return `<div class="review-filters review-trend-controls"><label>时间范围<select class="input" data-review-trend="range"
    >${options2(RANGES, range)}</select></label>${dates}
    <button class="btn text" type="button" data-review-action="refresh">刷新数据</button></div>`;
}
function change2(tile) {
  if (!known2(tile.previous)) return "";
  if (!known2(tile.delta)) return '<small class="review-trend-delta">较上期 —</small>';
  const size = Math.abs(tile.delta), flat = size < 0.05;
  const amount = tile.unit === "relative" ? `${size.toFixed(1)}%` : tile.unit === "points" ? `${size.toFixed(1)} 个百分点` : `${count2(size)} 篇`;
  const tone = flat || tile.unit === "count" ? "" : tile.delta > 0 ? " up" : " down";
  return `<small class="review-trend-delta${tone}">较上期 ${flat ? "持平" : `${tile.delta > 0 ? "↑" : "↓"} ${amount}`}</small>`;
}
function tiles(result) {
  return `<div class="review-trend-stats">${result.kpis.map((tile) => {
    const value = tile.key === "record_count" ? count2(tile.value) : tile.key === "median_reads" ? reads2(tile.value) : percent2(tile.value);
    const basis = tile.key === "record_count" ? "篇" : tile.key === "hit_rate" ? `爆 ${count2(tile.hits)} / 可判定 ${tile.sample} 篇` : `${tile.sample} 篇有数据`;
    return `<article class="review-trend-stat"><span>${KPI_LABELS[tile.key]}</span>
      <strong>${e(value)}</strong><small>${e(basis)}</small>${change2(tile)}</article>`;
  }).join("")}</div>`;
}
function scale(values, kind, top, bottom) {
  const height = bottom - top;
  if (kind === "log") {
    const positive = values.filter((value) => value > 0);
    const floor = Math.floor(Math.log10(positive.length ? Math.min(...positive) : 1));
    const low = floor, high = Math.max(low + 1, Math.log10(Math.max(1, ...values)) + 0.12);
    return {
      y: (value) => bottom - (Math.log10(Math.max(value, 10 ** low)) - low) / (high - low) * height,
      ticks: Array.from({ length: Math.floor(high) - low + 1 }, (_, index) => 10 ** (low + index))
    };
  }
  const max = Math.max(5, Math.ceil(Math.max(...values) / 5) * 5);
  return { y: (value) => bottom - value / max * height, ticks: [0, max / 2, max] };
}
function dateLabels(series) {
  const plotted = series.filter((day6) => day6.position !== null), step = Math.ceil(plotted.length / 6);
  return plotted.filter((_, index) => (plotted.length - 1 - index) % step === 0);
}
function readout(point) {
  if (!point) return "";
  const when = point.timed ? reviewDateTime(point.published_at) : point.date;
  return `${when}《${point.title || "未命名"}》阅读 ${reads2(point.reads)} · 点击率 ${percent2(point.ctr)}${point.verdict ? ` · ${point.verdict}` : ""}${point.provisional ? " · 不满 24 小时的数据，暂定" : ""}`;
}
function figure(result, { key, rolling, kind, title, hint, format, tick, height, threshold, daily = true }) {
  const plotted = result.series.filter((day6) => day6.position !== null);
  const points = result.points.filter((point) => point[key] !== null), curve = plotted.filter((day6) => day6[rolling] !== null);
  const head = `<div class="review-trend-figure-head"><h3>${e(title)}</h3><span class="review-note">${e(hint)}</span></div>`;
  if (!points.length && !curve.length) return `<section class="review-trend-figure">${head}
    <p class="review-trend-empty" role="status">当前范围没有可绘制的有效数据。缺失值不补零。</p></section>`;
  const top = 16, bottom = height - 30;
  const values = [...points.map((point) => point[key]), ...curve.map((day6) => day6[rolling]), ...known2(threshold) ? [threshold] : []];
  const { y, ticks } = scale(values, kind, top, bottom), x = (position) => `${(position * 100).toFixed(2)}%`;
  const grid = ticks.map((mark) => `<line class="review-trend-grid" x1="0" x2="100%" y1="${y(mark).toFixed(2)}" y2="${y(mark).toFixed(2)}"/>
    <text x="-8" y="${(y(mark) + 4).toFixed(2)}" text-anchor="end">${e(tick(mark))}</text>`).join("");
  const days = dateLabels(result.series).map((day6) => `<text x="${x(day6.position)}" y="${height - 8}" text-anchor="middle">${e(day6.date.slice(5))}</text>`).join("");
  const hitLine = known2(threshold) ? `<line class="review-trend-threshold" x1="0" x2="100%" y1="${y(threshold).toFixed(2)}" y2="${y(threshold).toFixed(2)}"/>` : "";
  const hitLabel = known2(threshold) ? `<text class="review-trend-threshold-label" x="100%" y="${(y(threshold) - 6).toFixed(2)}"
    text-anchor="end">爆款线 ${e(format(threshold))}</text>` : "";
  const order = { 爆: 2, 扑: 1 }, dots = [...points].sort((a, b) => (order[a.verdict] || 0) - (order[b.verdict] || 0)).map((point) => `<circle class="review-trend-dot ${VERDICT_CLASS[point.verdict] || "unjudged"}${point.provisional ? " provisional" : ""}"
      cx="${x(point.position)}" cy="${y(point[key]).toFixed(2)}" r="${point.verdict === "爆" ? 5.5 : 4.5}"
      data-review-row="${e(point.id)}" data-trend-readout="${e(readout(point))}"><title>${e(readout(point))}</title></circle>`).join("");
  let previous = null, lines = "";
  for (const day6 of plotted) {
    if (day6[rolling] === null) {
      previous = null;
      continue;
    }
    const now = { x: x(day6.position), y: y(day6[rolling]).toFixed(2) };
    if (previous) lines += `<line class="review-trend-line" x1="${previous.x}" y1="${previous.y}" x2="${now.x}" y2="${now.y}"/>`;
    previous = now;
  }
  const best = [...points].sort((a, b) => b[key] - a[key])[0];
  const resting = best ? `最高：${readout(best)}` : "";
  const latest = curve.at(-1);
  const curveLabel = latest ? `最新近 ${result.rolling.days} 天中位数 ${format(latest[rolling])}` : "样本不足以画出走势线";
  return `<section class="review-trend-figure">${head}<div class="review-trend-chart"><svg height="${height}" role="img"
    aria-label="${e(title)}：${points.length} 篇文章按北京时间发布时间排列，${curveLabel}。${daily ? "逐日数字见下方表格。" : ""}"
    >${grid}${hitLine}${dots}${lines}${hitLabel}${days}</svg></div>
    <p class="review-trend-readout" data-trend-readout-target data-default="${e(resting)}">${e(resting)}</p></section>`;
}
function legend(result) {
  const item = (mark, label3) => `<li><i class="review-trend-key ${mark}" aria-hidden="true"></i>${e(label3)}</li>`;
  return `<ul class="review-trend-legend">${item("hit", "爆")}${item("middle", "中")}${item("flop", "扑")}
    ${result.summary.provisional_count || result.summary.unknown_age_count ? item("provisional", "不满 24 小时的数据，暂定") : ""}
    ${item("line", `近 ${result.rolling.days} 天中位数`)}</ul>`;
}
function method(result) {
  const s = result.summary, dates = s.snapshot_start ? `${s.snapshot_start}${s.snapshot_end !== s.snapshot_start ? " 至 " + s.snapshot_end : ""}` : "未取得";
  const ages = s.min_hours !== null ? `所用快照年龄 ${s.min_hours}–${s.max_hours} 小时。` : "";
  const status = s.unverified_count ? `发文数是有发布时间的记录数；其中 ${s.unverified_count} 篇没有逐条的平台发布核验。` : "";
  return `<details class="review-trend-method"><summary>统计口径与数据时间</summary>
    <p>每篇取已记录年龄 12–72 小时内最接近 24 小时的快照，按北京时间发布日期归日；不拿长尾累计数补缺，缺失不补零。
    中位数只用有数据的文章。走势线是当天及此前共 ${result.rolling.days} 天内发布文章的中位数，不足 ${result.rolling.min_samples} 篇时断开。
    趋势剔除未来、早于发布时间及观察年龄矛盾的快照；列表原始快照异常时，两处所用样本可能不同。</p>
    <p>爆款沿用账号最近 30 篇有效阅读样本：至少 10 篇时高于 80% 分位数判爆；不足 10 篇时暂用阅读 ≥ 1000。
    爆款率分母为可判定篇数：可判定 ${s.coverage.hits} 篇，未判定 ${s.unjudged_count} 篇，其中暂定判定 ${s.provisional_judged_count} 篇。
    “较上期”对比 ${result.previous.start} 至 ${result.previous.end}。${status}</p>
    <p>所用快照日期：${dates}。${ages}资料读取时间：${e(reviewDateTime(result.loaded_at) || "未记录")}（北京时间）。
    已排除：明确未发布 ${result.excluded.unpublished} 篇，发布时间缺失 ${result.excluded.undated} 篇，未来发布时间 ${result.excluded.future} 篇。</p></details>`;
}
function dailyTable(result) {
  const rows = result.series.map((point) => `<tr><th scope="row">${e(point.date)}</th><td>${point.record_count}</td>
    <td>${point.hits ?? 0} / ${point.middles} / ${point.flops}</td><td>${e(reads2(point.median_reads))}</td>
    <td>${e(percent2(point.median_ctr))}</td><td>${e(reads2(point.rolling_reads))}</td></tr>`).join("");
  return `<details class="review-trend-details"><summary>逐日数据</summary>
    <div class="review-trend-table-wrap"><table class="review-trend-table">
    <caption class="review-sr-only">趋势逐日数据，缺失为横线</caption>
    <thead><tr><th>日期</th><th>发文</th><th>爆 / 中 / 扑</th><th>阅读中位数</th><th>点击率中位数</th>
    <th>近 ${result.rolling.days} 天阅读中位数</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
function renderCockpitMethod(data3, vm3, window2) {
  const now = vm3.now || (/* @__PURE__ */ new Date()).toISOString();
  return method(reviewTrends(data3, { account: vm3.account, range: "custom", from: window2.start, to: window2.end, now }));
}
function renderCockpitTrends(data3, vm3, window2) {
  const now = vm3.now || (/* @__PURE__ */ new Date()).toISOString();
  const result = reviewTrends(data3, { account: vm3.account, range: "custom", from: window2.start, to: window2.end, now });
  const pending = result.points.filter((point) => point.provisional && (known2(point.reads) || known2(point.ctr))).length;
  const note = `按发布日期统计，阅读取发布后约 24 小时的数据。${pending ? `空心点 ${pending} 篇只有发布后不满 24 小时的数据，为暂定。` : ""}${result.end === day4(now) ? "今天尚未结束。" : ""}缺失不补零；黑线为当天及此前共 7 天中位数，不足 ${result.rolling.min_samples} 篇时断开。`;
  return `<section class="review-trends review-cockpit-trends" aria-label="文章阅读与点击率走势">${legend(result)}
    ${figure(result, {
    key: "reads",
    rolling: "rolling_reads",
    kind: "log",
    title: "阅读走势",
    height: 260,
    format: reads2,
    tick: readsTick,
    hint: "每个点是一篇文章，线越往上整体越好",
    threshold: result.thresholds?.hit,
    daily: false
  })}
    ${figure(result, {
    key: "ctr",
    rolling: "rolling_ctr",
    kind: "linear",
    title: "点击率走势",
    height: 190,
    format: percent2,
    tick: percentTick,
    hint: "标题和封面吸不吸引人",
    daily: false
  })}
    <p class="review-note review-trend-note">${e(note)}</p></section>`;
}
function renderReviewTrends(data3, vm3) {
  const now = vm3.now || (/* @__PURE__ */ new Date()).toISOString(), today2 = day4(now), t = vm3.trends || {};
  const range = RANGES.some(([id2]) => id2 === t.range) ? t.range : "30d";
  const from = range === "custom" ? t.from || "" : shiftDay(today2, range === "30d" ? -29 : -6);
  const to = range === "custom" ? t.to || "" : today2;
  const filters = controls({ range, from, to, today: today2 });
  let result;
  try {
    result = reviewTrends(data3, { account: vm3.account, range, from, to, now });
  } catch (error) {
    return `<section class="review-trends" aria-label="数据趋势"><div class="review-panel-head"><h2>数据趋势</h2></div>${filters}
      <p role="alert">${e(error.message)}</p></section>`;
  }
  const s = result.summary, pending = s.provisional_count + s.unknown_age_count;
  const note = `按发布日期统计，阅读取发布后约 24 小时的数据。${pending ? `空心点 ${pending} 篇只有发布后不满 24 小时的数据，为暂定。` : ""}${result.end === today2 ? "今天尚未结束。" : ""}${result.kpis.some((tile) => known2(tile.previous)) ? "" : "上一个同样长的周期还没有数据，暂不对比。"}`;
  return `<section class="review-trends" aria-label="数据趋势"><div class="review-panel-head"><div><h2>数据趋势</h2>
    <span class="review-note">${e(vm3.account)} · ${result.start} 至 ${result.end}</span></div>${filters}</div>
    ${tiles(result)}${legend(result)}
    ${figure(result, {
    key: "reads",
    rolling: "rolling_reads",
    kind: "log",
    title: "阅读走势",
    height: 260,
    format: reads2,
    tick: readsTick,
    hint: "每个点是一篇文章，线越往上整体越好",
    threshold: result.thresholds?.hit
  })}
    ${figure(result, {
    key: "ctr",
    rolling: "rolling_ctr",
    kind: "linear",
    title: "点击率走势",
    height: 190,
    format: percent2,
    tick: percentTick,
    hint: "标题和封面吸不吸引人"
  })}
    <p class="review-note review-trend-note">${e(note)}</p>${dailyTable(result)}${method(result)}</section>`;
}

// web/pages/review-prompt-page.mjs
init_dom();
function rulesIntroMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((line) => /^##\s/.test(line));
  const head = first < 0 ? lines : lines.slice(0, first);
  const cut = head.findIndex((line) => /^#{1,6}\s+.*提示词/.test(line));
  return (cut < 0 ? head : head.slice(0, cut)).filter((line) => !/^#\s/.test(line) && !/^\s*[-*_]{3,}\s*$/.test(line)).join("\n").trim();
}
function playbookPromptBlocks(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let current3 = null;
  const flush = () => {
    const content2 = current3?.lines.join("\n").trim();
    if (content2) blocks.push({ title: current3.title, content: content2 });
    current3 = null;
  };
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      flush();
      if (heading[1].includes("提示词")) current3 = { title: heading[1], lines: [] };
      continue;
    }
    if (current3) current3.lines.push(line);
  }
  flush();
  return blocks;
}
var labels3 = { longform_write: "写文章", image: "配图", weitoutiao_write: "微头条", transfer_chat: "转写" };
function copyButton(action, id2 = "") {
  const marker = id2 ? ` data-prompt-id="${e(id2)}"` : "";
  return `<button type="button" class="btn" data-review-action="${action}"${marker}>复制完整提示词</button>`;
}
function card(title, note, time2, content2, action) {
  const long = String(content2).split("\n").length > 10 || String(content2).length > 600;
  const when = time2 ? `<p class="review-note">生效时间：${e(time2)} · 上海时间</p>` : "";
  return `<article class="review-prompt-card"><div class="review-v13-rule-meta"><h2>${e(title)}</h2><span class="review-note">${e(note)}</span></div>${when}<div class="review-prompt-copy-actions">${action}<span class="review-note" role="status" aria-live="polite" data-prompt-copy-status></span></div><pre class="review-prompt-source${long ? " is-folded" : ""}">${e(content2)}</pre>` + // Folding only limits what is shown; the element still holds the whole prompt for copying.
  (long ? '<button type="button" class="btn text review-prompt-toggle" data-review-action="toggle-prompt" aria-expanded="false">展开全文</button>' : "") + "</article>";
}
function renderPromptPage(data3, vm3) {
  const order = ["longform_write", "image", "weitoutiao_write", "transfer_chat"];
  const prompts = (data3.prompts || []).filter((row) => row.prompt_key !== "article_diagnosis").slice().sort((a, b) => {
    const ai2 = order.indexOf(a.prompt_key), bi = order.indexOf(b.prompt_key);
    return (ai2 < 0 ? order.length : ai2) - (bi < 0 ? order.length : bi) || String(a.prompt_key).localeCompare(String(b.prompt_key), "zh");
  });
  const diagnosis = diagnosisPromptText(data3.prompts, vm3.account);
  const selected = selectDiagnosisPrompt(data3.prompts, vm3.account);
  const shown = /* @__PURE__ */ new Set([diagnosis.trim(), ...prompts.map((row) => String(row.content_md || "").trim())]);
  const extras = (data3.playbooks || []).flatMap((book) => playbookPromptBlocks(book.content_md)).filter((block) => block.content && !shown.has(block.content));
  const cards = prompts.map((prompt) => card(
    labels3[prompt.prompt_key] || prompt.title || prompt.prompt_key,
    [prompt.title, "v" + prompt.version, scopeLabel(prompt.scope)].filter(Boolean).join(" · "),
    reviewDateTime(prompt.updated_at) || "未记录",
    prompt.content_md || "",
    copyButton("copy-prompt", prompt.id)
  ));
  const diagnosisNote = selected ? [selected.title, "v" + selected.version, scopeLabel(selected.scope)].filter(Boolean).join(" · ") : "默认提示词";
  cards.push(card("AI诊断", diagnosisNote, selected ? reviewDateTime(selected.updated_at) || "未记录" : "", diagnosis, copyButton("copy-diagnosis-prompt")));
  for (const block of extras) cards.push(card(block.title, "规则手册中的提示词", "", block.content, copyButton("copy-prompt-block")));
  return `<div class="review-prompt-page">${cards.join("")}</div>`;
}

// web/core/review-overview-metrics.mjs
function instant2(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day4(value)) return null;
  const stamp3 = Date.parse(value);
  return Number.isFinite(stamp3) ? stamp3 : null;
}
function metricSample(rows, valueOf, maximum = Infinity) {
  const entries = rows.map((row) => ({ value: finiteNumber(valueOf(row)), hours: finiteNumber(row.sample24h?.age_hours) })).filter(({ value, hours: hours2 }) => value !== null && value >= 0 && value <= maximum && hours2 !== null);
  const hours = entries.map((entry) => entry.hours);
  return { values: entries.map((entry) => entry.value), sample: {
    count: entries.length,
    minHours: hours.length ? Math.min(...hours) : null,
    maxHours: hours.length ? Math.max(...hours) : null
  } };
}
function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function mondayOf(today2) {
  const weekday = (/* @__PURE__ */ new Date(`${today2}T00:00:00Z`)).getUTCDay();
  return shiftDay(today2, -((weekday + 6) % 7));
}
function metricWindow(range, today2) {
  const monday = mondayOf(today2);
  if (range === "24h") return { rolling: true };
  if (range === "30d") return {
    start: shiftDay(today2, -29),
    end: today2,
    label: "较前30天",
    previous: { start: shiftDay(today2, -59), end: shiftDay(today2, -30), closed: true }
  };
  if (range === "last") return {
    start: shiftDay(monday, -7),
    end: shiftDay(monday, -1),
    closed: true,
    label: "较上上周",
    previous: { start: shiftDay(monday, -14), end: shiftDay(monday, -8), closed: true }
  };
  return { start: monday, end: today2, label: "较上周", previous: { start: shiftDay(monday, -7), end: shiftDay(monday, -1), closed: true } };
}
function publishedIn(row, bounds, nowMs) {
  const publishedDay = day4(row.published_at);
  const publishedMs = instant2(row.published_at);
  if (bounds.rolling) return publishedMs !== null && publishedMs >= nowMs - 864e5 && publishedMs <= nowMs;
  return Boolean(publishedDay && publishedDay >= bounds.start && publishedDay <= bounds.end && (bounds.closed || publishedMs === null || publishedMs <= nowMs));
}
function summarize2(rows) {
  const hits = rows.filter((row) => row.verdict === "爆").length;
  const middle = rows.filter((row) => row.verdict === "中").length;
  const flops = rows.filter((row) => row.verdict === "扑").length;
  const unknownVerdicts = rows.length > 0 && hits + middle + flops === 0;
  const reads3 = metricSample(rows, (row) => row.reads_24h);
  const ctr = metricSample(rows, (row) => row.ctr_24h, 100);
  const seconds = metricSample(rows, (row) => row.sample24h?.avg_read_seconds);
  const completion = metricSample(rows, (row) => row.completion_24h, 100);
  const judged = metricSample(rows, (row) => row.verdict ? row.reads_24h : null);
  return {
    count: rows.length,
    observedCount: rows.filter((row) => row.sample24h).length,
    hits: unknownVerdicts ? null : hits,
    middle: unknownVerdicts ? null : middle,
    flops: unknownVerdicts ? null : flops,
    readsMedian: median(reads3.values),
    ctrMedian: median(ctr.values),
    avgReadSeconds: average(seconds.values),
    completion: average(completion.values),
    samples: { judged: judged.sample, readsMedian: reads3.sample, ctrMedian: ctr.sample, avgReadSeconds: seconds.sample, completion: completion.sample }
  };
}
function metricDelta(current3, previous) {
  if (current3 === null || previous === null || !Number.isFinite(current3) || !Number.isFinite(previous)) return null;
  if (current3 === previous) return 0;
  if (previous === 0) return null;
  const rounded = Math.round((current3 - previous) / Math.abs(previous) * 100);
  return Number.isFinite(rounded) ? rounded : null;
}
function dailySeries2(rows, bounds, nowMs) {
  if (!bounds.start || !bounds.end) return [];
  const days = [];
  for (let date = bounds.start; date <= bounds.end; date = shiftDay(date, 1)) {
    const dayRows = rows.filter((row) => publishedIn(row, { start: date, end: date, closed: true }, nowMs));
    days.push({ date, ...summarize2(dayRows) });
  }
  return days;
}
function reviewOverviewMetrics(data3, { account: account3, range = "24h", now = (/* @__PURE__ */ new Date()).toISOString() } = {}) {
  const nowMs = instant2(now);
  if (nowMs === null) throw new TypeError("now must be an explicit ISO timestamp");
  const bounds = metricWindow(range, day4(now));
  const rows = enrichArticles(data3, { account: account3 });
  const current3 = summarize2(rows.filter((row) => publishedIn(row, bounds, nowMs)));
  if (!bounds.previous) return current3;
  const previous = summarize2(rows.filter((row) => publishedIn(row, bounds.previous, nowMs)));
  return {
    ...current3,
    previous,
    comparisonLabel: bounds.label,
    window: { start: bounds.start, end: bounds.end },
    series: dailySeries2(rows, bounds, nowMs)
  };
}
function reviewDuration(value) {
  const n = finiteNumber(value);
  if (n === null || n < 0) return "—";
  const seconds = Math.round(n);
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`;
}

// web/core/review-list-metrics.mjs
var REVIEW_LIST_METRICS = Object.freeze([
  { key: "reads", label: "阅读" },
  { key: "impressions", label: "展现量" },
  { key: "fan_impressions", label: "粉丝展现量" },
  { key: "fan_reads", label: "粉丝阅读量" },
  { key: "ctr", label: "点击率" },
  { key: "avg_read_seconds", label: "平均阅读时长" },
  { key: "completion_rate", label: "平均阅读完成率" }
]);
function formatReviewListMetric(observation, key) {
  if (!REVIEW_LIST_METRICS.some((metric) => metric.key === key)) return "—";
  if (observation?.kind === "immature" && key === "reads") return "未满24h";
  const number3 = finiteNumber(observation?.snapshot?.[key]);
  if (number3 === null || number3 < 0) return "—";
  if (key === "ctr" || key === "completion_rate") return number3 <= 100 ? `${number3.toFixed(1)}%` : "—";
  if (key === "avg_read_seconds") return reviewDuration(number3);
  return number3 >= 1e4 ? `${(number3 / 1e4).toFixed(1)} 万` : number3.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}

// web/pages/review-imitation.mjs
init_dom();
function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
function renderImitation(row, data3, account3) {
  if (!row || row.account !== account3) return "";
  const reference = row.reference_article_id == null ? null : (data3.benchmarkArticles || []).find((item) => item.account === account3 && String(item.id) === String(row.reference_article_id));
  let value;
  if (reference) {
    const id2 = String(reference.id);
    const query = new URLSearchParams({ page: "review", account: account3, review_section: "benchmarks", review_benchmark: id2 });
    value = `<a href="?${e(query.toString())}" data-review-benchmark="${e(id2)}">${e(reference.title || "未命名文章")}</a>`;
  } else {
    const title = String(row?.sample_title || "").trim();
    const rawUrl = String(row?.sample_url || "").trim();
    const url = safeUrl(rawUrl);
    const label3 = title || (rawUrl ? "参考文章" : "自选题");
    value = url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label3)}</a>` : e(label3);
  }
  return `<div class="review-imitation"><span>仿</span><div>${value}</div></div>`;
}

// web/pages/review-benchmark-library.mjs
init_dom();
function safeUrl2(value) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
function number2(value) {
  const n = finiteNumber(value);
  if (n === null || n < 0) return "";
  return n >= 1e4 ? `${(n / 1e4).toFixed(1)} 万` : n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}
function articleLink(article, account3) {
  const external2 = safeUrl2(article.url);
  const local = `?page=review&account=${encodeURIComponent(account3)}&review_article=${encodeURIComponent(article.id)}`;
  return `<a href="${e(external2 || local)}"${external2 ? ' target="_blank" rel="noopener noreferrer"' : ""}>${e(article.title || "未命名文章")}</a>`;
}
function latestSnapshot(snapshots2, articleId) {
  return (snapshots2 || []).filter((row) => String(row.article_id) === String(articleId)).sort((a, b) => String(b.snapshot_date || "").localeCompare(String(a.snapshot_date || "")))[0] || null;
}
function metricText(snapshot) {
  if (!snapshot) return "—";
  const parts2 = [];
  for (const [label3, key] of [["阅读", "reads"], ["点赞", "likes"], ["评论", "comments"], ["收藏", "favorites"], ["分享", "shares"], ["展现", "impressions"]]) {
    const text = number2(snapshot[key]);
    if (text) parts2.push(`${label3} ${text}`);
  }
  const ctr = finiteNumber(snapshot.ctr);
  if (ctr !== null && ctr >= 0) parts2.push(`点击率 ${ctr.toFixed(1)}%`);
  return parts2.length ? parts2.join(" · ") : "—";
}
function renderBenchmarkLibrary(data3 = {}, account3 = "") {
  const accounts = new Map((data3.benchmarkAccounts || []).filter((item) => item.account === account3).map((item) => [String(item.id), item]));
  const ownArticles = (data3.articles || []).filter((item) => item.account === account3);
  const samples = (data3.benchmarkArticles || []).filter((item) => item.account === account3 && accounts.has(String(item.benchmark_account_id))).map((item) => ({
    item,
    published: reviewDateTime(item.published_at),
    used: ownArticles.filter((article) => article.reference_article_id != null && String(article.reference_article_id) === String(item.id))
  })).filter((row) => row.used.length).sort((a, b) => {
    const dayOrder = b.published.slice(0, 10).localeCompare(a.published.slice(0, 10));
    if (dayOrder) return dayOrder;
    const aTimed = a.published.length > 10, bTimed = b.published.length > 10;
    return Number(bTimed) - Number(aTimed) || (aTimed && bTimed ? Date.parse(b.item.published_at) - Date.parse(a.item.published_at) : 0) || String(a.item.id).localeCompare(String(b.item.id));
  });
  if (!samples.length) return '<section class="review-benchmark-library"><h2>爆文库</h2><p class="review-note">暂无已仿写爆文</p></section>';
  const headers = ["对标账号", "样本标题", "样本阅读", "仿写标题", "仿写数据"];
  const body2 = samples.flatMap(({ item, used }) => used.map((article, index) => {
    const owner2 = accounts.get(String(item.benchmark_account_id));
    const target = safeUrl2(item.url);
    const title = e(item.title || "未命名文章");
    const reads3 = number2(item.reads);
    const cells = [
      e(owner2.name || "未命名账号"),
      target ? `<a href="${e(target)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title,
      e(reads3 || "—"),
      articleLink(article, account3),
      e(metricText(latestSnapshot(data3.snapshots, article.id)))
    ];
    const id2 = index === 0 ? ` id="review-benchmark-${e(encodeURIComponent(item.id))}"` : "";
    return `<tr${id2} tabindex="-1">${cells.map((cell, cellIndex) => `<td data-label="${headers[cellIndex]}">${cell}</td>`).join("")}</tr>`;
  })).join("");
  return `<section class="review-benchmark-library"><h2>爆文库</h2><div class="review-benchmark-table-wrap"><table class="review-benchmark-table"><thead><tr>${headers.map((label3) => `<th scope="col">${label3}</th>`).join("")}</tr></thead><tbody>${body2}</tbody></table></div></section>`;
}

// web/core/review-list-observation.mjs
function instant3(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day4(value)) return null;
  const stamp3 = Date.parse(value);
  return Number.isFinite(stamp3) ? stamp3 : null;
}
var compare2 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function reviewListObservation(row, snapshots2 = [], now = (/* @__PURE__ */ new Date()).toISOString()) {
  if (row.sample24h) return { kind: "sample", snapshot: row.sample24h, reads: row.reads_24h, hours: finiteNumber(row.sample24h.age_hours) };
  const published = instant3(row.published_at);
  const candidates = (Array.isArray(snapshots2) ? snapshots2 : []).filter((snapshot) => String(snapshot?.article_id) === String(row.id)).map((snapshot) => {
    const explicitAge = finiteNumber(snapshot.age_hours);
    const observed2 = instant3(snapshot.observed_at) ?? instant3(snapshot.snapshot_date);
    const computedAge = published !== null && observed2 !== null ? (observed2 - published) / 36e5 : null;
    const hours = explicitAge !== null && Number.isInteger(explicitAge) && explicitAge >= 0 ? explicitAge : explicitAge === null ? computedAge : null;
    const reads3 = finiteNumber(snapshot.reads);
    return { snapshot, hours, observed: observed2, reads: reads3 !== null && reads3 >= 0 ? reads3 : null };
  }).filter((candidate) => candidate.hours !== null && candidate.hours > 72).sort((a, b) => a.hours - b.hours || (a.observed ?? Infinity) - (b.observed ?? Infinity) || compare2(String(a.snapshot.id ?? ""), String(b.snapshot.id ?? "")));
  const first = candidates.find((candidate) => candidate.reads !== null) || candidates[0];
  if (first) return { kind: "longtail", snapshot: first.snapshot, reads: first.reads, hours: first.hours };
  const nowMs = instant3(now);
  if (published !== null && nowMs !== null && nowMs >= published && nowMs - published < 12 * 36e5) return {
    kind: "immature",
    snapshot: null,
    reads: null,
    hours: null
  };
  return { kind: "missing", snapshot: null, reads: null, hours: null };
}
function reviewObservationHours(value) {
  const hours = finiteNumber(value);
  return hours === null ? "" : String(Number(hours.toFixed(4)));
}

// web/pages/content-review.mjs
init_dom();
var REVIEW_VIEWS = [["overview", "总览"], ["articles", "文章库"], ["playbook", "手册"]];
var percentageKeys = /* @__PURE__ */ new Set(["ctr", "completion_rate", "ctr_24h", "completion_24h", "hit_rate", "flop_rate", "median_ctr"]);
function reviewNumber(value, key = "") {
  const n = finiteNumber(value);
  if (n === null) return "—";
  if (percentageKeys.has(key)) return `${n.toFixed(1)}%`;
  return Math.abs(n) >= 1e4 ? `${(n / 1e4).toFixed(1)} 万` : n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}
var empty2 = (title, text = "") => `<div class="review-empty"><strong>${e(title)}</strong>${text ? `<p>${e(text)}</p>` : ""}</div>`;
var panel = (title, body2, note = "", css = "") => `<section class="review-panel ${css}"><div class="review-panel-head"><h2>${e(title)}</h2>${note ? `<span class="review-note">${e(note)}</span>` : ""}</div>${body2}</section>`;
var options3 = (rows, value) => rows.map(([id2, label3]) => `<option value="${e(id2)}"${String(id2) === String(value) ? " selected" : ""}>${e(label3)}</option>`).join("");
var firstSentence2 = (value) => String(value || "").replace(/^#+\s*/gm, "").trim().match(/^[\s\S]*?[。！？!?](?:[”」』])?|^[^\n]+/)?.[0] || "";
function external(url, label3) {
  const safe = safeReviewUrl(url);
  return safe ? `<a href="${e(safe)}" target="_blank" rel="noopener noreferrer">${e(label3)}</a>` : '<span class="review-note">未提供原文链接</span>';
}
function tag(verdict) {
  if (!["爆", "中", "扑"].includes(verdict)) return "";
  const css = verdict === "爆" ? "hit" : verdict === "扑" ? "flop" : "middle";
  return `<span class="review-tag ${css}">${e(verdict)}</span>`;
}
function delta(value, key) {
  const n = finiteNumber(typeof value === "object" && value ? value.delta : value);
  return n === null ? '<span class="review-change">较前一周 —</span>' : `<span class="review-change">较前一周 ${n > 0 ? "+" : n < 0 ? "−" : ""}${e(percentageKeys.has(key) ? Math.abs(n).toFixed(1) : reviewNumber(Math.abs(n)))}${percentageKeys.has(key) ? " 个百分点" : ""}</span>`;
}
function chart(points, { small = false } = {}) {
  if (!points.some((p) => finiteNumber(p.ctr_24h) !== null || finiteNumber(p.reads_24h) !== null)) return empty2("暂无趋势数据", "采集后显示阅读与 CTR 中位数。");
  const width = 720, height = small ? 120 : 180, left = 28, right = 692, top = 18, bottom = top + height;
  const x = (i) => left + (points.length < 2 ? (right - left) / 2 : i / (points.length - 1) * (right - left));
  const max = (key) => Math.max(1, ...points.map((p) => finiteNumber(p[key]) ?? 0));
  let lines = "", dots = "";
  for (const [key, css, label3] of [["reads_24h", "reads", "阅读"], ["ctr_24h", "ctr", "CTR"]]) {
    let segment = [];
    const flush = () => {
      if (segment.length) lines += `<polyline class="review-line-${css}" points="${segment.join(" ")}"/>`;
      segment = [];
    };
    points.forEach((p, i) => {
      const n = finiteNumber(p[key]);
      if (n === null) {
        flush();
        return;
      }
      const px = x(i).toFixed(2), py = (bottom - n / max(key) * height).toFixed(2);
      segment.push(`${px},${py}`);
      dots += `<circle class="review-point review-point-${css}" cx="${px}" cy="${py}" r="3" tabindex="0"><title>${e(p.date)} · ${label3} ${e(reviewNumber(
        n,
        key
      ))} · 当日 ${e(p.count ?? 0)} 篇</title></circle>`;
    });
    flush();
  }
  const labels4 = [.../* @__PURE__ */ new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map((i) => `<text x="${x(i).toFixed(2)}" y="${bottom + 24}" text-anchor="${i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}">${e(String(points[i].date).slice(5))}</text>`).join("");
  const bandWidth = (right - left) / Math.max(points.length - 1, 1);
  const hover = small ? "" : points.map((p, i) => `<rect class="review-hover-band" x="${Math.max(left, x(i) - bandWidth / 2).toFixed(2)}" y="${top}" width="${(i === 0 || i === points.length - 1 ? bandWidth / 2 : bandWidth).toFixed(2)}" height="${height}" tabindex="0"><title>${e(p.date)} · 当日 ${e(p.count ?? 0)} 篇 · 阅读中位数 ${e(reviewNumber(p.reads_24h))} · CTR 中位数 ${e(reviewNumber(p.ctr_24h, "ctr"))}</title></rect>`).join("");
  return `<div class="review-chart"><div class="review-chart-legend"><span class="reads">${small ? "阅读" : "阅读中位数"}</span><span class="ctr">${small ? "CTR" : "CTR 中位数"}</span>${small ? "" : '<span class="review-note">独立纵轴 · 悬停或聚焦查看当日篇数</span>'}</div><svg viewBox="0 0 ${width} ${bottom + 36}" role="img" aria-label="阅读和 CTR 趋势，两条线分别按各自纵轴绘制"><line class="review-axis" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>${lines}${dots}${hover}${labels4}</svg><div class="review-chart-scale"><span>阅读轴 0 – ${e(reviewNumber(max("reads_24h")))}</span><span>CTR 轴 0 – ${e(reviewNumber(max("ctr_24h"), "ctr"))}</span></div></div>`;
}
function sampleFor(row, data3) {
  const reference = row.reference_article_id == null ? null : (data3.benchmarkArticles || []).find((item) => item.account === row.account && String(item.id) === String(row.reference_article_id));
  const title = reference?.title || row.sample_title || "";
  const url = safeReviewUrl(reference?.url) || safeReviewUrl(row.sample_url);
  const reads3 = finiteNumber(reference?.reads);
  return title || url ? { title, url, reads: reads3 !== null && reads3 >= 0 ? reads3 : null } : null;
}
function sampleLabel(row, data3) {
  const sample = sampleFor(row, data3);
  if (!sample) return "";
  const label3 = `仿：${sample.title || "参考文章"}${sample.reads == null ? "" : `（阅读 ${reviewNumber(sample.reads)}）`}`;
  const href = safeReviewUrl(sample.url);
  return `<span class="review-reference">${href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(label3)}</a>` : e(label3)}</span>`;
}
function articleReason(row, data3, account3) {
  return (data3.reports || []).filter((report) => report.account === account3).map((report) => report.verdicts?.[row.id]).filter(Boolean).map((v) => typeof v === "object" ? v.reason : "").find(Boolean) || "";
}
function reasonPreview(value) {
  const chars = Array.from(firstSentence2(value));
  return chars.length > 40 ? `${chars.slice(0, 40).join("")}…` : chars.join("");
}
function healthRows(data3, account3) {
  return (data3.accountHealth || []).filter((row) => row.account === account3).sort((a, b) => String(b.observed_on || "").localeCompare(String(
    a.observed_on || ""
  )) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")) || String(b.id || "").localeCompare(String(a.id || "")));
}
function healthLabel(row) {
  return { normal: "正常", "限流": "限流", "降权": "降权", "封禁": "封禁" }[row?.judgement] || "未记录";
}
function collapsed(title, body2, id2 = "") {
  return `<details class="review-panel review-extra"${id2 ? ` id="${e(id2)}"` : ""}><summary>${e(
    title
  )}</summary>${body2}</details>`;
}
var REVIEW_SECTIONS = [["cockpit", "驾驶舱"], ["weekly", "周报"], ["articles", "文章详情"], ["benchmarks", "对标账号"], ["rules", "规则"], ["prompts", "提示词"], ["library", "爆文库"]];
function activeSection(vm3) {
  const raw = vm3.secondary === "review" ? "rules" : vm3.secondary === "trends" ? "cockpit" : vm3.secondary;
  if (REVIEW_SECTIONS.some(([id2]) => id2 === raw)) return raw;
  if (vm3.view === "articles") return "articles";
  if (vm3.view === "playbook") return "rules";
  return "cockpit";
}
function v13Accounts(data3) {
  const accounts = data3.benchmarkAccounts || [];
  if (!accounts.length) return empty2("暂无对标账号");
  return accounts.map((account3) => {
    const topic = String(account3.topic_focus || "").trim();
    const rawPatterns = parseJson(account3.title_patterns, []);
    const patterns = Array.isArray(rawPatterns) ? rawPatterns.filter((item) => typeof item === "string" && item.trim()) : [];
    const structure2 = String(account3.structure_notes_md || "").trim();
    const structureParts = structure2.includes("\n") ? [structure2] : structure2.split(/(?<=。)(?=\S)/u);
    const details = [
      topic ? `<section class="review-account-feature"><h4>选题方向</h4><div class="review-markdown">${renderReviewMarkdown(topic)}</div></section>` : "",
      patterns.length ? `<section class="review-account-feature"><h4>标题特点</h4><div class="review-markdown">${patterns.map((item) => renderReviewMarkdown(item)).join("")}</div></section>` : "",
      structure2 ? `<details class="review-account-feature review-account-more"><summary><h4>其他特点</h4></summary><div
        class="review-markdown">${structureParts.map((part) => renderReviewMarkdown(part)).join("")}</div></details>` : ""
    ].join("");
    const profile = safeReviewUrl(account3.profile_url);
    const name = e(account3.name || "未命名账号");
    return `<section class="review-v13-benchmark-group"><div class="review-v13-group-head"><h3>${profile ? `<a class="review-account-link" href="${e(profile)}" target="_blank" rel="noopener noreferrer">${name}</a>` : name}</h3></div><div class="review-v13-account-features">${details || "<p>暂无特点记录</p>"}</div></section>`;
  }).join("");
}
function sectionBody(selected, data3, vm3, rows) {
  if (selected === "articles") return articleListPanel(rows, vm3, data3);
  if (selected === "benchmarks") return v13Accounts(data3);
  if (selected === "rules") return playbook(data3, vm3);
  if (selected === "prompts") return promptPage(data3, vm3);
  if (selected === "weekly") return renderWeeklyPage(data3, vm3);
  if (selected === "library") return renderBenchmarkBreakdown(data3, vm3) + renderBenchmarkLibrary(data3, vm3.account);
  return overview(data3, vm3);
}
function archives(data3, vm3, rows, override) {
  const selected = activeSection(vm3);
  const body2 = override ?? sectionBody(selected, data3, vm3, rows);
  return `<section class="review-secondary"><div class="review-secondary-tabs" role="tablist" aria-label="内容复盘">${REVIEW_SECTIONS.map(([id2, label3]) => `<button type="button" id="review-secondary-${id2}" role="tab" data-review-secondary="${id2}" aria-controls="review-secondary-panel" aria-selected="${selected === id2}" tabindex="${selected === id2 ? "0" : "-1"}">${label3}</button>`).join("")}</div><div class="review-secondary-panel" id="review-secondary-panel" role="tabpanel" aria-labelledby="review-secondary-${selected}">${body2}</div></section>`;
}
function metricChange(label3, current3, previous, prefix = "") {
  const delta2 = metricDelta(current3, previous);
  const head = prefix ? `${label3} ${prefix}` : label3;
  if (delta2 === null) return `<small class="review-stat-change">${e(head)} —</small>`;
  if (delta2 === 0) return `<small class="review-stat-change">${e(head)} 持平</small>`;
  const tone = delta2 > 0 ? " up" : " down";
  return `<small class="review-stat-change${tone}">${e(head)} ${delta2 > 0 ? "+" : ""}${delta2}%</small>`;
}
function statCard(label3, body2, change3) {
  return `<article class="review-stat"><span>${label3}</span>${body2}${change3}</article>`;
}
function overview(data3, vm3) {
  const range = ["this", "last", "30d"].includes(vm3.filters?.metricsRange) ? vm3.filters.metricsRange : "this";
  const current3 = reviewOverviewMetrics(data3, { account: vm3.account, range, now: vm3.now || (/* @__PURE__ */ new Date()).toISOString() });
  const noSample = range !== "last" && current3.observedCount === 0;
  const value = (formatted) => noSample ? '<strong class="review-stat-empty">数据未满24h</strong>' : `<strong>${e(formatted)}</strong>`;
  const earlier = current3.previous || {};
  const change3 = (left, right, prefix = "") => current3.comparisonLabel ? metricChange(current3.comparisonLabel, left, right, prefix) : "";
  const cards = [
    statCard("发文数", `<strong>${e(current3.count)}<small>篇</small></strong>`, change3(current3.count, earlier.count)),
    statCard(
      "爆 / 中 / 扑",
      `<strong>${e(reviewNumber(current3.hits))} / ${e(reviewNumber(current3.middle))} / ${e(reviewNumber(current3.flops))}</strong>`,
      change3(current3.hits, earlier.hits, "爆")
    ),
    statCard("阅读中位数", value(reviewNumber(current3.readsMedian)), change3(current3.readsMedian, earlier.readsMedian)),
    statCard("CTR 中位数", value(reviewNumber(current3.ctrMedian, "ctr")), change3(current3.ctrMedian, earlier.ctrMedian)),
    statCard("平均阅读时长", value(reviewDuration(current3.avgReadSeconds)), change3(current3.avgReadSeconds, earlier.avgReadSeconds)),
    statCard("平均阅读完成率", value(reviewNumber(current3.completion, "completion_rate")), change3(current3.completion, earlier.completion))
  ].join("");
  return `<section class="review-overview-metrics" aria-label="文章指标"><div class="review-filters"><label>统计时间<select class="input" data-review-filter="metricsRange">${options3([["this", "本周"], ["last", "上周"], ["30d", "近30天"]], range)}</select></label><button class="btn text review-inline-refresh" type="button" data-review-action="refresh">刷新</button></div><div class="review-stats">${cards}</div>${renderCockpitTrends(data3, vm3, current3.window)}</section>`;
}
function articleListPanel(rows, vm3, data3) {
  return `<section class="review-panel review-articles-panel" data-review-articles-expanded="true">
<div class="review-panel-head"><h2 class="review-articles-heading">文章列表</h2>
<button class="btn text" type="button" data-review-action="toggle-fullscreen" aria-pressed="false">全屏展示</button></div>
<div id="review-article-library" class="review-article-library">${articleLibrary(rows, vm3, data3)}</div></section>`;
}
function articleLibrary(rows, vm3, data3 = {}) {
  const f = vm3.filters || {}, range = f.range || "30d", today2 = day4(vm3.now || (/* @__PURE__ */ new Date()).toISOString()), from = range === "all" ? "" : shiftDay(today2, range === "7d" ? -6 : -29);
  const selected = rows.filter((r) => (!from || day4(r.published_at) && day4(r.published_at) >= from && day4(r.published_at) <= today2) && (!f.from || day4(r.published_at) >= f.from && day4(r.published_at)) && (!f.to || day4(r.published_at) <= f.to && day4(r.published_at)) && (!f.verdict || r.verdict === f.verdict)).sort(recentArticles);
  const chosen = Array.isArray(vm3.metricColumns) ? vm3.metricColumns : ["reads"];
  const columns = REVIEW_LIST_METRICS.filter((metric) => chosen.includes(metric.key));
  const picker = `<details class="review-columns-picker" data-review-columns-picker${vm3.metricPickerOpen ? " open" : ""}><summary data-review-columns-trigger>显示指标</summary><div class="review-columns-menu">${REVIEW_LIST_METRICS.map((metric) => `<label><input type="checkbox" data-review-column="${e(metric.key)}"${chosen.includes(metric.key) ? " checked" : ""}>${e(metric.label)}</label>`).join("")}</div></details>`;
  const filters = `<div class="review-filters"><label>发布时间<select class="input" data-review-filter="range">${options3([["7d", "近 7 天"], ["30d", "近 30 天"], [
    "all",
    "全部时间"
  ]], range)}</select></label><label>表现判定<select class="input" data-review-filter="verdict">${options3(
    [["", "全部判定"], ["爆", "爆"], ["中", "中"], ["扑", "扑"]],
    f.verdict || ""
  )}</select></label>${picker}<span class="review-note">${selected.length} 篇</span></div>`;
  if (!selected.length) return filters + empty2("当前筛选下没有文章");
  const cells = (row) => {
    const observation = reviewListObservation(row, data3.snapshots, vm3.now || (/* @__PURE__ */ new Date()).toISOString());
    const age = observation.hours !== null ? `<span class="review-note review-observation-age">发布后 ${e(reviewObservationHours(observation.hours))} 小时</span>` : "";
    const metrics2 = columns.map((metric) => [metric.label, `${e(formatReviewListMetric(observation, metric.key))}${metric.key === "reads" ? age : ""}`]);
    const judgement = observation.kind === "longtail" ? '<span class="review-tag">长尾</span>' : tag(row.verdict);
    const supplement = chosen.includes("reads") ? "" : observation.kind === "immature" ? "未满24h" : age;
    return [
      ["发布时间", e(reviewDateTime(row.published_at) || "—")],
      ["标题", `<button type="button" class="review-title-button" data-review-article="${e(row.id)}" aria-haspopup="dialog">${e(row.title || "未命名文章")}</button>${titlePattern(vm3, row, data3)}${sampleLabel(row, data3)}`],
      ...metrics2,
      ["判定", `${judgement}${supplement}`]
    ];
  };
  const wide = columns.length > 1;
  return filters + `<div class="review-table-wrap${wide ? " review-columns-wide" : ""}"${wide ? ` style="--review-columns-min:${520 + columns.length * 140}px"` : ""}><table class="review-table review-articles-table"><caption class="review-sr-only">文章表现，点击文章行查看详细指标与判定依据</caption><thead><tr>${[
    "发布时间",
    "标题",
    ...columns.map((metric) => metric.label),
    "判定"
  ].map((t) => `<th scope="col">${e(t)}</th>`).join("")}</tr></thead><tbody>${selected.map((row) => `<tr data-review-row="${e(row.id)}">${cells(row).map(([label3, body2]) => `<td data-label="${e(label3)}">${body2}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
var sections = [["keep_topic", "保留选题"], ["drop_topic", "放弃选题"], ["title", "标题"], ["body", "正文"], ["audience", "读者"], ["checklist", "发布检查"]];
var statuses2 = [["candidate", "待验证"], ["trial", "试用中"], ["kept", "有效"], ["dropped", "无效"], ["hold", "观察中"]];
function evidence(value) {
  if (value === null || value === void 0 || value === "") return "—";
  if (typeof value !== "object") return String(value);
  if (!value.metric) return "—";
  const labels4 = { ctr: "CTR", ctr_24h: "CTR", reads: "阅读", reads_24h: "阅读", completion_rate: "完读率", completion_24h: "完读率", avg_read_seconds: "平均阅读时长" };
  const key = value.metric, label3 = labels4[key] || key;
  return `命中 ${reviewNumber(value.n_with)} 篇，${label3} ${reviewNumber(value.with_median, key)}；未命中 ${reviewNumber(value.n_without)} 篇，${label3} ${reviewNumber(value.without_median, key)}`;
}
function ruleCard2(rule, index = "", historical = false) {
  const attributes = historical ? "" : ` id="review-rule-${e(encodeURIComponent(rule.rule_id))}" tabindex="-1"`;
  return `<article class="review-rule"${attributes}>
    <div class="review-rule-head"><span class="review-rule-id">${e(rule.rule_id || index)}</span></div>
    <div class="review-markdown">${renderReviewMarkdown(rule.text || "未提供规则内容")}</div>
    <dl class="review-rule-evidence"><div><dt>证据</dt><dd>${e(evidence(rule.evidence))}
      ${rule.evidence_note ? `<br>${e(rule.evidence_note)}` : ""}</dd></div>
      <div><dt>试验</dt><dd>${e(evidence(rule.trials))}</dd></div></dl>
  </article>`;
}
function articleRules(row) {
  const ids = parseJson(row.applied_rule_ids, null);
  if (!Array.isArray(ids)) return '<p class="review-note">未记录命中规则。</p>';
  if (!ids.length) return '<p class="review-note">已记录：无命中规则。</p>';
  const resolved = row.applied_rules || [];
  const known3 = new Set(resolved.map((rule) => String(rule.rule_id)));
  const missing4 = ids.filter((id2) => !known3.has(String(id2)));
  return `<p class="review-note">已记录 ${ids.length} 条命中规则。</p>${resolved.length ? `<div class="review-rule-list">${resolved.map((rule, i) => ruleCard2(
    rule,
    i,
    true
  )).join("")}</div>` : ""}${missing4.length ? `<p class="review-note">未找到对应规则：${missing4.map((id2) => e(String(id2))).join("、")}</p>` : ""}`;
}
var v13RuleGroups = [["keep_topic", "选题"], ["drop_topic", "放弃选题"], ["title", "标题"], ["body", "正文"], ["audience", "读者"], ["checklist", "自检清单"]];
function v13Evidence(rule) {
  const note = String(rule.evidence_note || "").trim();
  if (note) return firstSentence2(note);
  if (rule.evidence === null || rule.evidence === void 0 || rule.evidence === "") return "";
  const value = evidence(rule.evidence);
  return value === "—" ? "" : firstSentence2(value);
}
function v13RuleRow(rule, index, prefix = "") {
  const text = renderReviewMarkdown(String(rule.text || "").trim());
  const overridden = rule.overriddenByScope;
  const state2 = overridden ? "overridden" : "effective";
  const id2 = e(encodeURIComponent(`${prefix}:${rule.section || ""}:${rule.rule_id || ""}:${index}`));
  const body2 = overridden ? `<details class="review-overridden-rule">
    <summary>已被${e(scopeLabel(overridden))}覆盖 · 查看原文</summary>${text}</details>` : `${rule.overridesScopes?.length ? '<p class="review-note">当前生效 · 覆盖上层同 ID 规则</p>' : ""}${text}`;
  return `<article class="review-v13-rule-row" id="review-rule-${id2}" data-rule-state="${state2}">
    <span class="review-v13-rule-id">${e(rule.rule_id || index)}</span>
    <div class="review-v13-rule-text review-markdown">${body2}</div>
    <span class="review-v13-rule-evidence">${e(v13Evidence(rule))}</span>
  </article>`;
}
function renderRuleBook(book, scope) {
  const rules2 = book.rules.filter((rule) => scopeOf(rule.scope ?? book.account) === scope);
  const ownLayer = scopeOf(book.account) === scope;
  const lines = String(ownLayer ? book.content_md || "" : "").replace(/\r\n?/g, "\n").split("\n");
  const firstSection = lines.findIndex((line) => /^##\s/.test(line));
  const titleLines = firstSection < 0 ? lines : lines.slice(0, firstSection);
  const title = titleLines.map((line) => line.match(/^#\s+(.+?)\s*$/)?.[1]?.trim()).find(Boolean) || (ownLayer ? `规则手册 ${book.version}` : `适用规则`);
  const content2 = rulesIntroMarkdown(ownLayer ? book.content_md || "" : "");
  const intro = content2 ? `<div class="review-v13-intro review-markdown">${renderReviewMarkdown(content2)}</div>` : "";
  const groups = v13RuleGroups.map(([id2, label3]) => {
    const group = rules2.filter((rule) => rule.section === id2);
    return `<details class="review-v13-rule-group" open><summary>${e(label3)} · ${ruleCountLabel(group)}</summary>
    ${group.map((rule, index) => v13RuleRow(rule, index + 1, `${scope}:${book.id}`)).join("")}</details>`;
  }).join("");
  const ungrouped = rules2.filter((rule) => !v13RuleGroups.some(([id2]) => id2 === rule.section));
  const other = ungrouped.length ? `<details class="review-v13-rule-group" open><summary>其他 · ${ruleCountLabel(ungrouped)}</summary>
    ${ungrouped.map((rule, index) => v13RuleRow(rule, index + 1, `${scope}:${book.id}`)).join("")}</details>` : "";
  return `<section class="review-v13-rules">
    <div class="review-v13-rule-meta"><h2>${e(title)}</h2>
    <span class="review-note">生效于 ${e(ownLayer ? day4(book.published_on) || "—" : "—")}</span>
    <span class="review-note">共 ${ruleCountLabel(rules2)}</span></div>
    ${intro}${groups}${other}</section>`;
}
function promptPage(data3, vm3) {
  return renderPromptPage(data3, vm3);
}
function playbook(data3, vm3) {
  const books = currentPlaybooks(data3.playbooks, vm3.account);
  const layers = applicableScopes(vm3.account).map((scope) => {
    const matches2 = books.filter((book) => book.rules.some((rule) => scopeOf(rule.scope ?? book.account) === scope) || scopeOf(book.account) === scope);
    if (!matches2.length) return "";
    const layerRules = matches2.flatMap((book) => book.rules.filter((rule) => scopeOf(rule.scope ?? book.account) === scope));
    return `<details class="review-rule-layer" data-rule-scope="${e(scope)}"${scope === scopeOf(vm3.account) ? " open" : ""}>
      <summary class="review-rule-layer-title">${e(scopeLabel(scope))}<span class="review-note"> · ${ruleCountLabel(layerRules)}</span></summary>
      ${matches2.map((book) => renderRuleBook(book, scope)).join("")}</details>`;
  }).join("");
  return layers ? `<div class="review-rule-hierarchy">${layers}</div>` : empty2("暂无生效手册");
}
function verdictBasis(row) {
  if (!row.verdict || !row.verdict_basis) return "";
  const b = row.verdict_basis;
  if (b.method === "recent30_quantiles") return `同账号最近 ${reviewNumber(b.sample_count)} 篇有效样本；爆 > ${reviewNumber(b.high_threshold)}，扑 ≤ ${reviewNumber(b.low_threshold)}`;
  if (b.method === "fixed_thresholds") return `有效样本 ${reviewNumber(b.sample_count)} 篇；暂按阅读量 ≥ ${reviewNumber(b.high_threshold)} 判爆，≤ ${reviewNumber(b.low_threshold)} 判扑`;
  return "";
}
function drawer(data3, rows, vm3) {
  if (!vm3.article) return "";
  const row = rows.find((r) => String(r.id) === String(vm3.article));
  const close = '<button class="btn text review-drawer-close" type="button" data-review-action="close-article" aria-label="关闭文章详情">关闭 <span aria-hidden="true">×</span></button>';
  if (!row) return `<div class="review-drawer-overlay"><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1">${close}<h2 id="review-detail-title">未找到文章</h2><p>文章可能已移除或不属于当前账号。</p></aside></div>`;
  return `<div class="review-drawer-overlay"><button class="review-drawer-backdrop" type="button" data-review-action="close-article" tabindex="-1" aria-label="关闭文章详情"></button><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1"><div class="review-drawer-header"><span class="review-note">文章详情</span>${close}</div><div class="review-detail-heading"><span class="review-note">${e(reviewDateTime(row.published_at) || "发布时间未提供")} · 上海时间</span><h2 id="review-detail-title">${e(row.title || "未命名文章")}</h2><div class="review-detail-links">${tag(row.verdict)}${external(row.url, "查看原文 ↗")}</div></div>${renderTrafficCard(
    data3.snapshots,
    row.id
  )}${renderArticleDiagnosis(row, vm3)}${renderImitation(row, data3, vm3.account)}</aside></div>`;
}
function renderContentReview() {
  return '<section id="content-review" class="content-review" aria-label="内容复盘"><p class="review-status" role="status" aria-live="polite">正在读取内容复盘…</p></section>';
}
function scopedReviewData(data3, account3) {
  const result = { ...data3 };
  for (const key of ["articles", "reports", "benchmarkAccounts", "notes", "accountHealth"]) result[key] = (data3[key] || []).filter((row) => row.account === account3);
  result.playbooks = currentPlaybooks(data3.playbooks, account3);
  result.prompts = currentPrompts(data3.prompts, account3);
  const benchmarkIds = new Set(result.benchmarkAccounts.map((row) => String(row.id)));
  result.benchmarkArticles = (data3.benchmarkArticles || []).filter((row) => benchmarkIds.has(String(row.benchmark_account_id)) && (row.account == null || row.account === account3));
  const ids = new Set(result.articles.map((row) => String(row.id)));
  result.snapshots = (data3.snapshots || []).filter((row) => ids.has(String(row.article_id)));
  return result;
}
function renderContentReviewContent(data3, vm3) {
  data3 = scopedReviewData(data3, vm3.account);
  if (vm3.loading) return '<p class="review-status" role="status" aria-live="polite">正在读取完整数据…</p>';
  if (vm3.error) return `<div class="review-empty" role="alert"><strong>内容复盘读取失败</strong><p>${e(vm3.error)}</p><button class="btn" type="button" data-review-action="refresh">重新读取</button></div>`;
  const rows = enrichArticles(data3, { account: vm3.account });
  const hasData = ["articles", "snapshots", "reports", "playbooks", "benchmarkAccounts", "benchmarkArticles", "notes", "prompts"].some((key) => (data3[key] || []).length);
  const selected = activeSection(vm3);
  const quiet = !hasData && selected !== "trends";
  const body2 = archives(data3, vm3, rows, quiet ? empty2("暂无内容复盘数据") + '<button class="btn text" type="button" data-review-action="refresh">刷新</button>' : void 0);
  return `<div class="review-body"${vm3.article ? " inert" : ""}>${body2}</div>${drawer(data3, rows, vm3)}`;
}

// web/review-controller.mjs
var columnStorageKey = "haoduoyu.review.columns.v1";
var REVIEW_METRIC_COLUMNS = Object.freeze(["reads", "impressions", "fan_impressions", "fan_reads", "ctr", "avg_read_seconds", "completion_rate"]);
function readReviewColumnPreference(raw) {
  try {
    const parsed2 = JSON.parse(raw);
    if (!Array.isArray(parsed2)) return ["reads"];
    const selected = REVIEW_METRIC_COLUMNS.filter((key) => parsed2.includes(key));
    return parsed2.length && !selected.length ? ["reads"] : selected;
  } catch {
    return ["reads"];
  }
}
var resources = ["articles", "snapshots", "reports", "playbooks", "benchmark-accounts", "benchmark-articles", "notes", "account-health", "prompts/current"];
var data = normalizeReviewData(), sequence2 = 0, registered2 = false, identity5 = "", pageContext2;
var vm2 = {
  account: "V字",
  view: "overview",
  secondary: "cockpit",
  week: "this",
  date: "",
  start: "",
  end: "",
  periods: [],
  filters: {},
  metricColumns: readReviewColumnPreference(storage.get(columnStorageKey)),
  metricPickerOpen: false,
  articlesExpanded: true,
  diagnoses: {},
  article: "",
  version: "",
  compare: "",
  loading: true,
  error: ""
};
var root = () => typeof document === "undefined" ? null : document.querySelector("#content-review");
function staleRead(message = "复盘资料在读取时发生变化，请重新读取。") {
  return Object.assign(new Error(message), { code: "READ_REVISION_CHANGED" });
}
async function readReviewCollection(read2, resource, selectedAccount, current3 = () => true) {
  if (!resources.includes(resource)) throw new Error("未知的复盘资料类型。");
  const items = [], seen = /* @__PURE__ */ new Set(), foreignIds = /* @__PURE__ */ new Set();
  let revision2;
  for (let offset = 0; ; offset += 100) {
    const accountQuery = resource === "playbooks" ? "" : `account=${encodeURIComponent(selectedAccount)}&`;
    const revisionQuery = revision2 === void 0 ? "" : `&read_revision=${encodeURIComponent(revision2)}`;
    const page = await read2(`/review/${resource}?${accountQuery}offset=${offset}${revisionQuery}`);
    if (!current3()) return null;
    if (!Array.isArray(page?.items) || typeof page.has_more !== "boolean" || page.items.length > 100 || page.has_more && page.items.length !== 100) throw new Error("复盘分页资料不完整，请重新读取。");
    if (page.read_revision !== void 0) {
      if (revision2 !== void 0 && revision2 !== page.read_revision) throw staleRead();
      revision2 = page.read_revision;
    }
    for (const row of page.items) {
      if (!row || typeof row !== "object" || row.id === null || row.id === void 0 || seen.has(String(row.id))) throw staleRead("复盘资料存在重复或无效记录，请重新读取。");
      seen.add(String(row.id));
      if (!["snapshots", "playbooks", "prompts/current"].includes(resource) && row.account !== selectedAccount) {
        foreignIds.add(String(row.id));
        continue;
      }
      items.push(row);
    }
    if (!page.has_more) return { items, read_revision: revision2, foreignIds };
  }
}
async function readContentReviewData(read2, selectedAccount, current3 = () => true) {
  const results = await Promise.all(resources.map((name) => readReviewCollection(read2, name, selectedAccount, current3)));
  if (!current3() || results.some((result2) => result2 === null)) return null;
  const revisions = results.map((result2) => result2.read_revision).filter((value) => value !== void 0);
  if (revisions.length && revisions.some((value) => value !== revisions[0])) throw staleRead();
  const result = normalizeReviewData(Object.fromEntries(resources.map((key, index) => [key, results[index].items])));
  const articles = new Set(result.articles.map((row) => String(row.id)));
  const foreignArticles = results[0].foreignIds;
  if (result.snapshots.some((row) => !articles.has(String(row.article_id)) && !foreignArticles.has(String(row.article_id))))
    throw staleRead("快照对应的文章不完整，请重新读取。");
  result.snapshots = result.snapshots.filter((row) => articles.has(String(row.article_id)));
  result.playbooks.sort((a, b) => String(b.published_on || "").localeCompare(String(a.published_on || "")) || String(b.version).localeCompare(String(a.version), void 0, { numeric: true }));
  result.reports.sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)) || String(b.id).localeCompare(String(a.id)));
  result.loadedAt = (/* @__PURE__ */ new Date()).toISOString();
  return result;
}
async function readContentReviewDataWithRetry(read2, selectedAccount, current3 = () => true) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await readContentReviewData(read2, selectedAccount, current3);
    } catch (error) {
      if (!current3()) return null;
      if (error.code !== "READ_REVISION_CHANGED" || attempt) throw error;
    }
  }
}
function reviewRoute(href, defaultAccount = vm2.account) {
  const p = new URL(href).searchParams, legacy = p.get("review_view");
  const requested = p.get("tab") || (legacy === "playbooks" ? "playbook" : legacy);
  const view = REVIEW_VIEWS.some(([id2]) => id2 === requested) ? requested : "overview";
  const section = p.get("review_section");
  const benchmark = p.get("review_benchmark") || "";
  const listed = REVIEW_SECTIONS.some(([id2]) => id2 === section) ? section : "";
  const secondary = benchmark ? "library" : listed || (section === "trends" ? "cockpit" : "") || (section === "review" || section === "playbook" || view === "playbook" ? "rules" : view === "articles" ? "articles" : "cockpit");
  const trendRange = p.get("review_trend_range");
  const trends = {
    range: ["7d", "30d", "custom"].includes(trendRange) ? trendRange : "30d",
    from: p.get("review_trend_from") || "",
    to: p.get("review_trend_to") || ""
  };
  return {
    account: p.get("account")?.trim() || defaultAccount,
    view,
    secondary,
    trends,
    week: p.get("review_week") === "last" ? "last" : "this",
    article: benchmark ? "" : p.get("review_article") || "",
    benchmark,
    version: p.get("review_version") || ""
  };
}
var route = () => reviewRoute(location.href);
function writeRoute(values) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(values)) {
    const name = key === "view" ? "tab" : `review_${key}`;
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  for (const key of ["review_view", "review_date", "review_period", "review_compare"]) url.searchParams.delete(key);
  if (!url.searchParams.has("tab")) url.searchParams.set("tab", vm2.view);
  history.replaceState({}, "", url);
}
function syncViewFromRoute() {
  vm2 = { ...vm2, ...route(), loading: false, error: "" };
}
function focusBenchmark(id2) {
  if (!id2) return;
  const node2 = document.getElementById(`review-benchmark-${encodeURIComponent(id2)}`);
  if (!node2 || !root()?.contains(node2)) return;
  node2.scrollIntoView({ block: "start" });
  node2.focus({ preventScroll: true });
}
function positionReviewColumnsPicker() {
  const picker = root()?.querySelector("[data-review-columns-picker]");
  if (!picker?.open) return;
  const trigger = picker.querySelector("[data-review-columns-trigger]");
  const menu = picker.querySelector(".review-columns-menu");
  if (!trigger || !menu) return;
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  let viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
  const nav2 = document.querySelector(".mobile-nav");
  if (nav2 && nav2.getClientRects().length && getComputedStyle(nav2).visibility !== "hidden") {
    const rect2 = nav2.getBoundingClientRect();
    if (rect2.bottom > viewportTop && rect2.top < viewportBottom) viewportBottom = Math.min(viewportBottom, rect2.top);
  }
  const rect = trigger.getBoundingClientRect();
  const gap = 8;
  const above = Math.max(0, rect.top - viewportTop - gap);
  const below = Math.max(0, viewportBottom - rect.bottom - gap);
  const placeUp = menu.scrollHeight + 2 > below && above > below;
  picker.dataset.reviewColumnsPlacement = placeUp ? "up" : "down";
  menu.style.setProperty("--review-columns-max-height", `${Math.floor(placeUp ? above : below)}px`);
}
var columnPositionFrame = 0;
function scheduleReviewColumnsPosition() {
  if (columnPositionFrame || !root()?.querySelector("[data-review-columns-picker][open]")) return;
  columnPositionFrame = requestAnimationFrame(() => {
    columnPositionFrame = 0;
    positionReviewColumnsPicker();
  });
}
var returnFocusId = "", returnScroll = 0;
function syncReviewFullscreen() {
  const node2 = root(), button3 = node2?.querySelector('[data-review-action="toggle-fullscreen"]');
  if (!button3) return;
  const active5 = node2.classList.contains("review-list-fullscreen");
  button3.textContent = active5 ? "退出全屏" : "全屏展示";
  button3.setAttribute("aria-pressed", String(active5));
}
async function toggleReviewFullscreen() {
  const node2 = root();
  if (!node2) return;
  if (node2.classList.contains("review-list-fullscreen")) {
    node2.classList.remove("review-list-fullscreen");
    if (document.fullscreenElement === node2) await document.exitFullscreen().catch(() => {
    });
  } else {
    vm2.articlesExpanded = true;
    paintContentReviewPage();
    node2.classList.add("review-list-fullscreen");
    if (node2.requestFullscreen) await node2.requestFullscreen().catch(() => {
    });
  }
  syncReviewFullscreen();
}
async function toggleArticleList() {
  const node2 = root();
  if (!node2 || vm2.loading || vm2.error) return;
  const expanded = !vm2.articlesExpanded;
  if (!expanded && node2.classList.contains("review-list-fullscreen")) await toggleReviewFullscreen();
  vm2.articlesExpanded = expanded;
  vm2.metricPickerOpen = false;
  paintContentReviewPage();
  const button3 = root()?.querySelector(".review-articles-toggle");
  button3?.focus({ preventScroll: true });
  if (!expanded) root()?.querySelector(".review-articles-panel")?.scrollIntoView({ block: "start", behavior: "instant" });
}
var aiContext = () => ({
  account: vm2.account,
  playbooks: () => data.playbooks,
  reload: () => void loadContentReview(pageContext2),
  applyPlaybook: (saved) => {
    data = { ...data, playbooks: data.playbooks.map((item) => String(item.id) === String(saved.id) ? { ...item, ...saved } : item) };
  }
});
function paintContentReviewPage() {
  const node2 = root();
  if (!node2) return;
  vm2.ai = reviewAiView();
  const focused = document.activeElement?.dataset?.aiOnce ? document.activeElement.dataset.aiOnce : "";
  node2.innerHTML = renderContentReviewContent(data, vm2);
  if (focused) node2.querySelector(`[data-ai-once="${focused}"]`)?.focus({ preventScroll: true });
  if (!vm2.loading && !vm2.error && vm2.secondary === "weekly") autoGenerateWeekly();
  syncReviewFullscreen();
  const dialog = node2.querySelector('[role="dialog"]');
  for (const child of node2.children) if (child !== dialog?.parentElement && dialog) child.inert = true;
  if (dialog) dialog.querySelector(".review-drawer-close")?.focus({ preventScroll: true });
  if (vm2.metricPickerOpen) positionReviewColumnsPicker();
}
async function loadContentReview(context) {
  registerEvents2();
  pageContext2 = context;
  const [{ apiNetwork: apiNetwork2 }, { state: state2, runtime: runtime2 }] = await Promise.all([Promise.resolve().then(() => (init_api(), api_exports)), Promise.resolve().then(() => (init_state(), state_exports))]);
  const requested = route(), currentIdentity2 = `${runtime2.sessionEpoch}:${state2.me?.id || ""}:${requested.account}`;
  if (identity5 !== currentIdentity2) {
    data = normalizeReviewData();
    vm2.filters = {};
    vm2.articlesExpanded = true;
    vm2.diagnoses = {};
    identity5 = currentIdentity2;
  }
  vm2 = { ...vm2, ...requested, loading: true, error: "" };
  paintContentReviewPage();
  const ticket2 = ++sequence2, epoch = runtime2.sessionEpoch;
  const current3 = () => ticket2 === sequence2 && epoch === runtime2.sessionEpoch && state2.page === "review" && route().account === requested.account && Boolean(root());
  const read2 = (path) => apiNetwork2(path, context ? { context } : {});
  try {
    const result = await readContentReviewDataWithRetry(read2, requested.account, current3);
    if (!current3() || !result) return;
    data = result;
    syncViewFromRoute();
    paintContentReviewPage();
    focusBenchmark(vm2.benchmark);
    void loadReviewAi(requested.account, { force: true });
    if (vm2.article) void loadStoredDiagnosis(vm2.article);
  } catch (error) {
    if (!current3() || error.name === "AbortError") return;
    vm2.loading = false;
    vm2.error = error.message || "读取失败，请稍后重试。";
    paintContentReviewPage();
  }
}
function closeArticle() {
  vm2.article = "";
  writeRoute({ article: "" });
  paintContentReviewPage();
  const node2 = [...root()?.querySelectorAll("[data-review-article]") || []].find((el) => el.dataset.reviewArticle === returnFocusId);
  node2?.focus({ preventScroll: true });
  window.scrollTo({ top: returnScroll, behavior: "instant" });
}
function selectTab(view, focus = false) {
  vm2.view = view;
  vm2.article = "";
  vm2.benchmark = "";
  writeRoute({ view, article: "", benchmark: "" });
  paintContentReviewPage();
  if (focus) root()?.querySelector(`#review-tab-${view}`)?.focus({ preventScroll: true });
}
function changeTrend(target) {
  const key = target.dataset.reviewTrend;
  if (!["range", "from", "to"].includes(key)) return;
  const today2 = day4((/* @__PURE__ */ new Date()).toISOString());
  vm2.trends = { ...vm2.trends, [key]: target.value };
  if (key === "range" && vm2.trends.range === "custom") {
    vm2.trends.from ||= shiftDay(today2, -6);
    vm2.trends.to ||= today2;
  }
  writeRoute({ ...Object.fromEntries(Object.entries(vm2.trends).map(([name, value]) => [`trend_${name}`, value])), trend_metric: "" });
  paintContentReviewPage();
  root()?.querySelector(`[data-review-trend="${key}"]`)?.focus({ preventScroll: true });
}
async function copyReviewPrompt(prompts, account3, id2, clipboard = globalThis.navigator?.clipboard) {
  const prompt = currentPrompts(prompts, account3).find((row) => String(row.id) === String(id2));
  if (!prompt) throw new Error("提示词已更新，请重新读取后复制。");
  if (!clipboard?.writeText) throw new Error("当前浏览器不支持剪贴板，请从页面上的全文手动复制。");
  try {
    await clipboard.writeText(String(prompt.content_md || ""));
  } catch {
    throw new Error("复制失败，请允许剪贴板访问，或从页面上的全文手动复制。");
  }
}
async function reviewWrite(path, options4) {
  const { apiNetwork: apiNetwork2 } = await Promise.resolve().then(() => (init_api(), api_exports));
  return apiNetwork2(path, options4 || {});
}
async function loadStoredDiagnosis(articleId) {
  const current3 = vm2.diagnoses?.[articleId];
  if (!articleId || current3?.text || current3?.checked || current3?.status === "saving") return;
  vm2.diagnoses = { ...vm2.diagnoses, [articleId]: { status: "checking", checked: false } };
  try {
    const row = await reviewWrite("/review/articles/" + encodeURIComponent(articleId) + "/diagnosis");
    const latest = vm2.diagnoses?.[articleId];
    if (latest?.text || latest?.status === "saving") return;
    const text = typeof row?.result_text === "string" ? row.result_text : "";
    vm2.diagnoses = { ...vm2.diagnoses, [articleId]: { status: text ? "saved" : "ready", text, checked: true } };
  } catch {
    const latest = vm2.diagnoses?.[articleId];
    if (latest?.text || latest?.status === "saving") return;
    vm2.diagnoses = { ...vm2.diagnoses, [articleId]: { status: "ready", text: "", checked: true } };
  }
  if (vm2.article === articleId) paintContentReviewPage();
}
async function runArticleDiagnosis(articleId) {
  const current3 = vm2.diagnoses?.[articleId];
  if (!articleId || current3?.text || current3?.status === "saving") return;
  vm2.diagnoses = { ...vm2.diagnoses, [articleId]: { status: "saving", text: "", checked: true } };
  paintContentReviewPage();
  try {
    const row = await reviewWrite("/review/articles/" + encodeURIComponent(articleId) + "/diagnosis", { method: "POST", body: {} });
    const text = typeof row?.result_text === "string" ? row.result_text : "";
    if (!text) throw new Error("没有得到诊断结果。");
    vm2.diagnoses = { ...vm2.diagnoses, [articleId]: { status: "saved", text, checked: true } };
  } catch (error) {
    vm2.diagnoses = { ...vm2.diagnoses, [articleId]: { status: "error", text: "", error: error.message || "诊断失败，请稍后重试。", checked: true } };
  }
  if (vm2.article === articleId) paintContentReviewPage();
}
async function copyPromptText(button3, text) {
  const status = button3.closest(".review-prompt-card")?.querySelector("[data-prompt-copy-status]");
  button3.disabled = true;
  if (status) status.textContent = "正在复制…";
  try {
    if (!navigator.clipboard?.writeText) throw new Error("当前浏览器不支持剪贴板，请从页面上的全文手动复制。");
    await navigator.clipboard.writeText(text);
    if (status?.isConnected) status.textContent = "已复制完整提示词。";
  } catch (error) {
    if (status?.isConnected) status.textContent = error.message || "复制失败，请从页面上的全文手动复制。";
  } finally {
    if (button3.isConnected) button3.disabled = false;
  }
}
async function copyPromptButton(button3) {
  const status = button3.closest(".review-prompt-card, .review-current-prompt")?.querySelector("[data-prompt-copy-status]");
  button3.disabled = true;
  if (status) status.textContent = "正在复制…";
  try {
    await copyReviewPrompt(data.prompts, vm2.account, button3.dataset.promptId);
    if (status?.isConnected) status.textContent = "已复制完整提示词。";
  } catch (error) {
    if (status?.isConnected) status.textContent = error.message;
  } finally {
    if (button3.isConnected) button3.disabled = false;
  }
}
function describeTrendPoint(event, leaving) {
  const point = event.target.closest?.("[data-trend-readout]");
  const target = point?.closest(".review-trend-figure")?.querySelector("[data-trend-readout-target]");
  if (target && root()?.contains(target)) target.textContent = leaving ? target.dataset.default : point.dataset.trendReadout;
}
function onReviewClick(event) {
  const node2 = root();
  const picker = node2?.querySelector("[data-review-columns-picker]");
  if (picker?.open && !picker.contains(event.target)) {
    picker.open = false;
    vm2.metricPickerOpen = false;
  }
  const benchmarkLink = event.target.closest?.("a[data-review-benchmark]");
  if (benchmarkLink && node2?.contains(benchmarkLink)) {
    event.preventDefault();
    vm2.article = "";
    vm2.secondary = "library";
    vm2.benchmark = benchmarkLink.dataset.reviewBenchmark;
    writeRoute({ section: "library", article: "", benchmark: vm2.benchmark });
    paintContentReviewPage();
    focusBenchmark(vm2.benchmark);
    return;
  }
  if (event.target.closest?.("a")) return;
  const target = event.target.closest?.("button,[data-review-row]");
  if (!target || !node2?.contains(target)) return;
  if (target.dataset.reviewAction === "toggle-articles") {
    void toggleArticleList();
    return;
  }
  if (target.dataset.reviewAction === "toggle-fullscreen") {
    void toggleReviewFullscreen();
    return;
  }
  if (target.dataset.reviewAction === "show-health") {
    vm2.view = "overview";
    vm2.secondary = "attention";
    vm2.article = "";
    writeRoute({ view: "overview", section: "attention", article: "" });
    paintContentReviewPage();
    const history2 = node2.querySelector("#review-health-history");
    history2?.scrollIntoView({ behavior: "smooth", block: "start" });
    history2?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.reviewAction === "refresh") {
    void loadContentReview(pageContext2);
    return;
  }
  if (vm2.loading || vm2.error) return;
  if (target.dataset.aiAction) {
    reviewAiClick(target, aiContext());
    return;
  }
  if (target.dataset.reviewAction === "toggle-prompt") {
    const source = target.closest(".review-prompt-card")?.querySelector(".review-prompt-source"), folded = source?.classList.toggle("is-folded");
    target.textContent = folded ? "展开全文" : "收起";
    target.setAttribute("aria-expanded", String(!folded));
    return;
  }
  if (target.dataset.reviewAction === "copy-prompt") {
    void copyPromptButton(target);
    return;
  }
  if (target.dataset.reviewAction === "copy-diagnosis-prompt") {
    void copyPromptText(target, diagnosisPromptText(data.prompts, vm2.account));
    return;
  }
  if (target.dataset.reviewAction === "copy-prompt-block") {
    void copyPromptText(target, target.closest(".review-prompt-card")?.querySelector("pre")?.textContent || "");
    return;
  }
  if (target.dataset.reviewAction === "diagnose-article") {
    void runArticleDiagnosis(target.dataset.articleId);
    return;
  }
  if (target.dataset.reviewSecondary) {
    vm2.secondary = target.dataset.reviewSecondary;
    vm2.benchmark = "";
    writeRoute({ section: vm2.secondary, benchmark: "" });
    paintContentReviewPage();
    root()?.querySelector(`#review-secondary-${vm2.secondary}`)?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.reviewView) {
    selectTab(target.dataset.reviewView, true);
    return;
  }
  if (target.dataset.reviewWeek) {
    vm2.week = target.dataset.reviewWeek;
    writeRoute({ week: vm2.week });
    paintContentReviewPage();
    root()?.querySelector(`[data-review-week="${vm2.week}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.reviewAction === "close-article") {
    closeArticle();
    return;
  }
  const article = target.dataset.reviewArticle || target.dataset.reviewRow;
  if (article) {
    returnFocusId = article;
    returnScroll = window.scrollY;
    vm2.article = article;
    vm2.benchmark = "";
    writeRoute({ article, benchmark: "" });
    paintContentReviewPage();
    void loadStoredDiagnosis(article);
  }
}
function onReviewKeydown(event) {
  const node2 = root();
  if (!node2?.contains(event.target)) return;
  const dialog = node2.querySelector('[role="dialog"]');
  if (dialog) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeArticle();
      return;
    }
    if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll('button:not([disabled]),a[href],summary,[tabindex="0"]')].filter((el) => !el.hidden && el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    return;
  }
  const picker = node2.querySelector("[data-review-columns-picker]");
  if (event.key === "Escape" && picker?.open) {
    event.preventDefault();
    picker.open = false;
    vm2.metricPickerOpen = false;
    picker.querySelector("[data-review-columns-trigger]")?.focus({ preventScroll: true });
    return;
  }
  if (event.key === "Escape" && node2.classList.contains("review-list-fullscreen")) {
    event.preventDefault();
    void toggleReviewFullscreen();
    return;
  }
  if (event.target.matches("[data-review-secondary]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const ids = REVIEW_SECTIONS.map(([id2]) => id2), current3 = vm2.secondary === "review" ? "rules" : vm2.secondary, index = Math.max(
      0,
      ids.indexOf(current3)
    );
    vm2.secondary = event.key === "Home" ? ids[0] : event.key === "End" ? ids.at(-1) : ids[(index + (event.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    vm2.benchmark = "";
    writeRoute({ section: vm2.secondary, benchmark: "" });
    paintContentReviewPage();
    root()?.querySelector(`#review-secondary-${vm2.secondary}`)?.focus({ preventScroll: true });
    return;
  }
  if (event.target.matches("[data-review-view]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const ids = REVIEW_VIEWS.map(([id2]) => id2), index = ids.indexOf(vm2.view);
    selectTab(event.key === "Home" ? ids[0] : event.key === "End" ? ids.at(-1) : ids[(index + (event.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length], true);
  }
}
function registerEvents2() {
  if (registered2 || typeof document === "undefined") return;
  registered2 = true;
  watchReviewAi(() => {
    if (root() && !vm2.loading) paintContentReviewPage();
  });
  document.addEventListener("fullscreenchange", () => {
    const node2 = root();
    if (node2?.classList.contains("review-list-fullscreen") && !document.fullscreenElement && node2.dataset.nativeFullscreen === "true") {
      node2.classList.remove("review-list-fullscreen");
      node2.dataset.nativeFullscreen = "";
    } else if (node2 && document.fullscreenElement === node2) node2.dataset.nativeFullscreen = "true";
    syncReviewFullscreen();
  });
  document.addEventListener("toggle", (event) => {
    const picker = event.target;
    if (picker.matches?.("[data-review-columns-picker]") && root()?.contains(picker)) {
      vm2.metricPickerOpen = picker.open;
      if (picker.open) positionReviewColumnsPicker();
    }
  }, true);
  window.addEventListener("resize", scheduleReviewColumnsPosition, { passive: true });
  document.addEventListener("scroll", scheduleReviewColumnsPosition, { capture: true, passive: true });
  window.visualViewport?.addEventListener("resize", scheduleReviewColumnsPosition, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleReviewColumnsPosition, { passive: true });
  document.addEventListener("click", onReviewClick);
  document.addEventListener("mouseover", (event) => describeTrendPoint(event, false));
  document.addEventListener("mouseout", (event) => describeTrendPoint(event, true));
  document.addEventListener("change", (event) => {
    const target = event.target;
    const node2 = root();
    if (!node2?.contains(target) || vm2.loading || vm2.error) return;
    if (reviewAiInput(target)) return;
    if (target.dataset.reviewTrend) {
      changeTrend(target);
      return;
    }
    const column = target.dataset.reviewColumn;
    if (column !== void 0) {
      if (!REVIEW_METRIC_COLUMNS.includes(column)) return;
      const selected = new Set(vm2.metricColumns);
      if (target.checked) selected.add(column);
      else selected.delete(column);
      vm2.metricColumns = REVIEW_METRIC_COLUMNS.filter((key2) => selected.has(key2));
      vm2.metricPickerOpen = true;
      storage.set(columnStorageKey, JSON.stringify(vm2.metricColumns));
      const scrollLeft = node2.querySelector(".review-table-wrap")?.scrollLeft || 0;
      const scrollY = window.scrollY;
      paintContentReviewPage();
      const current3 = root();
      const picker = current3?.querySelector("[data-review-columns-picker]");
      if (picker) picker.open = true;
      const table2 = current3?.querySelector(".review-table-wrap");
      if (table2) table2.scrollLeft = scrollLeft;
      current3?.querySelector(`[data-review-column="${column}"]`)?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollY, behavior: "instant" });
      positionReviewColumnsPicker();
      return;
    }
    if (!target.dataset.reviewFilter) return;
    const key = target.dataset.reviewFilter;
    vm2.filters[key] = target.value;
    paintContentReviewPage();
    const filterRoot = target.closest(".review-trends") ? root()?.querySelector(".review-trends") : root();
    filterRoot?.querySelector(`[data-review-filter="${key}"]`)?.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", onReviewKeydown);
  window.addEventListener("popstate", () => {
    if (!root()) return;
    const next = route();
    if (next.account !== vm2.account) void loadContentReview(pageContext2);
    else {
      syncViewFromRoute();
      paintContentReviewPage();
      focusBenchmark(vm2.benchmark);
    }
  });
}

// web/experiments-panel-controller.mjs
init_api();
init_state();
var data2 = null, sequence3 = 0, registered3 = false;
var account2 = () => state.account || "V字";
var root2 = () => document.querySelector("#ai-experiments");
function paint() {
  const node2 = root2();
  if (!node2 || state.page !== "ai-reports") return;
  node2.innerHTML = data2 ? renderExperiments(data2, { account: account2(), ai: reviewAiView() }, { compact: true }) : "";
}
function register2() {
  if (registered3) return;
  registered3 = true;
  watchReviewAi(paint);
  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("#ai-experiments [data-ai-action]");
    if (!target || state.page !== "ai-reports" || !data2) return;
    reviewAiClick(target, {
      account: account2(),
      playbooks: () => data2.playbooks,
      reload: () => void loadExperimentsPanel(),
      applyPlaybook: (saved) => {
        data2 = { ...data2, playbooks: data2.playbooks.map((item) => String(item.id) === String(saved.id) ? { ...item, ...saved } : item) };
      }
    });
  });
}
async function loadExperimentsPanel() {
  register2();
  const ticket2 = ++sequence3, session2 = runtime.sessionEpoch, name = account2();
  void loadReviewAi(name);
  const current3 = () => ticket2 === sequence3 && session2 === runtime.sessionEpoch && state.page === "ai-reports";
  const read2 = (path) => apiNetwork(path, { suppressAuthRedirect: true });
  try {
    const [articles, snapshots2, playbooks] = await Promise.all(["articles", "snapshots", "playbooks"].map((kind) => readReviewCollection(
      read2,
      kind,
      name,
      current3
    )));
    if (!current3() || !articles || !snapshots2 || !playbooks) return;
    const ids = new Set(articles.items.map((row) => String(row.id)));
    data2 = normalizeReviewData({
      articles: articles.items,
      snapshots: snapshots2.items.filter((row) => ids.has(String(row.article_id))),
      playbooks: currentPlaybooks(playbooks.items, name)
    });
  } catch {
    if (current3()) data2 = null;
  }
  if (current3()) paint();
}

// web/ai-reports-controller.mjs
init_api();
init_state();
init_daily_notes_state();
var sequence4 = 0, registered4 = false, selectedDate = "", visibleMonth = "", pageSession = null;
function selectDailyTab(name) {
  if (!OPENAI_TABS.includes(name)) return;
  state.aiDailyTab = name;
  const root3 = document.querySelector("#ai-reports");
  if (!root3) return;
  for (const button3 of root3.querySelectorAll("[data-ai-daily-tab]"))
    button3.setAttribute("aria-pressed", String(button3.dataset.aiDailyTab === name));
  for (const panel2 of root3.querySelectorAll("[data-ai-daily-panel]"))
    panel2.hidden = panel2.dataset.aiDailyPanel !== name;
}
function aiReportsYesterday(today2 = dailyNotesToday()) {
  const date = /* @__PURE__ */ new Date(today2 + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
function reportRank(author) {
  const value = String(author ?? "");
  if (/gpt/i.test(value)) return 0;
  if (/(?:^|[^a-z0-9])bot(?:$|[^a-z0-9])/i.test(value)) return 1;
  if (/gemini/i.test(value)) return 2;
  return 3;
}
var compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function sortAiReports(items) {
  return [...items].sort((a, b) => reportRank(a.author) - reportRank(b.author) || compareText(String(a.author ?? "").toLowerCase(), String(b.author ?? "").toLowerCase()) || compareText(String(a.created_at ?? ""), String(b.created_at ?? "")) || compareText(String(a.id ?? ""), String(b.id ?? "")));
}
function reportsForDailyDate(items, date) {
  return sortAiReports(items.filter((row) => reportDay(row) === aiReportsYesterday(date)));
}
async function readAllAiReports(read2, current3 = () => true) {
  const items = [], seen = /* @__PURE__ */ new Set();
  for (let offset = 0; ; offset += 100) {
    const data3 = await read2("/ai-reports?offset=" + offset);
    if (!current3()) return null;
    if (!Array.isArray(data3?.items) || typeof data3.has_more !== "boolean" || data3.items.length > 100 || data3.has_more && data3.items.length !== 100)
      throw new Error("汇报读取不完整，请稍后重试。");
    for (const row of data3.items) if (!seen.has(row.id)) {
      seen.add(row.id);
      items.push(row);
    }
    if (!data3.has_more) return items;
  }
}
async function loadAiReports({ resetDate = false } = {}) {
  registerAiReportEvents();
  const session2 = runtime.sessionEpoch;
  if (pageSession !== session2 || resetDate) {
    pageSession = session2;
    selectedDate = validDailyNotesDate(state.aiDailyDate) ? state.aiDailyDate : dailyNotesToday();
    visibleMonth = selectedDate.slice(0, 7);
  }
  if (!selectedDate) selectedDate = dailyNotesToday();
  if (!visibleMonth) visibleMonth = selectedDate.slice(0, 7);
  const ticket2 = ++sequence4, date = selectedDate;
  const current3 = () => ticket2 === sequence4 && session2 === runtime.sessionEpoch && state.page === "ai-reports";
  paintAiReports([], "", true, date, visibleMonth);
  paintAiDailyReminders(null, "", true);
  selectDailyTab(state.aiDailyTab || "reminders");
  const report = readAllAiReports(api, current3).then((items) => {
    if (current3() && items) paintAiReports(reportsForDailyDate(items, date), "", false, date, visibleMonth);
  }).catch((error) => {
    if (current3()) paintAiReports([], error.message || "读取失败，请稍后重试。", false, date, visibleMonth);
  });
  const reminders = api("/work-reminders?date=" + encodeURIComponent(date)).then((data3) => {
    if (current3()) paintAiDailyReminders(data3);
  }).catch((error) => {
    if (current3()) paintAiDailyReminders(null, error.message || "提醒读取失败，请稍后重试");
  });
  void loadExperimentsPanel();
  await Promise.all([report, reminders]);
}
function moveMonth(offset) {
  const d = /* @__PURE__ */ new Date(visibleMonth + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + offset);
  if (!Number.isFinite(d.getTime())) return;
  const next = d.toISOString().slice(0, 7);
  if (validDailyNotesDate(next + "-01")) {
    visibleMonth = next;
    paintAiCalendar(selectedDate, visibleMonth);
  }
}
function registerAiReportEvents() {
  if (registered4) return;
  registered4 = true;
  document.addEventListener("click", (event) => {
    if (state.page !== "ai-reports") return;
    const tab = event.target.closest?.("[data-ai-daily-tab]")?.dataset.aiDailyTab;
    if (tab) {
      selectDailyTab(tab);
      updateRoute();
      if (tab === "openai") void loadAiReports();
    } else if (event.target.closest?.("[data-openai-diary-refresh]")) void loadAiReports();
    else if (event.target.closest?.("[data-ai-report-month]")) moveMonth(Number(event.target.closest("[data-ai-report-month]").dataset.aiReportMonth));
    else {
      const day6 = event.target.closest?.("[data-ai-report-select]")?.dataset.aiReportSelect;
      if (day6 && validDailyNotesDate(day6)) {
        selectedDate = day6;
        visibleMonth = day6.slice(0, 7);
        state.aiDailyDate = day6;
        state.openAiRun = "";
        updateRoute();
        void loadAiReports();
      }
    }
  });
}

// web/ai-settings-controller.mjs
init_state();
var registered5 = false;
var visible3 = () => state.page === "settings" && state.settingsTab === "ai";
function paint2() {
  const node2 = document.querySelector("#ai-settings");
  if (!visible3() || !node2) return;
  const active5 = document.activeElement, focus = node2.contains(active5) && active5.dataset.aiSetting ? [
    active5.dataset.aiSetting,
    active5.dataset.aiFeature || ""
  ] : null;
  node2.outerHTML = renderAiSettings(reviewAiView());
  if (focus) document.querySelector(`#ai-settings [data-ai-setting="${focus[0]}"]${focus[1] ? `[data-ai-feature="${focus[1]}"]` : ""}`)?.focus({ preventScroll: true });
}
function register3() {
  if (registered5) return;
  registered5 = true;
  watchReviewAi(paint2);
  document.addEventListener("change", (event) => {
    if (visible3() && event.target.closest?.("#ai-settings") && reviewAiInput(event.target)) paint2();
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "ai-settings-form") return;
    event.preventDefault();
    if (visible3()) void saveReviewAiSettings();
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("#ai-settings [data-ai-action]");
    if (target && visible3()) reviewAiClick(target, { account: state.account || "V字" });
  });
}
function aiSettingsPage() {
  register3();
  return renderAiSettings(reviewAiView().status === "idle" ? { status: "loading" } : reviewAiView());
}
async function loadAiSettings() {
  register3();
  await loadReviewAi(state.account || "V字", { force: true });
  if (reviewAiView().data?.configured) void loadReviewAiModels();
}

// web/controller.mjs
init_requests();
init_api();
init_retry_after();
init_constants();
init_dom();
init_format();
init_session_index_state();
init_state();
init_login();
init_entry();
init_modal();
init_popover();
function mainContent() {
  const settingsChoices = state.me?.publicBusiness ? { todo: settingsTabs.todo, ai: settingsTabs.ai } : Object.fromEntries(Object.entries(settingsTabs).filter(([key]) => key !== "workspace" && key !== "openai"));
  const settingsHint = state.page !== "settings" ? "" : state.me?.publicBusiness ? '<p class="hint"><a href="?page=login">管理员登录</a></p>' : state.me ? '<p class="hint"><button class="btn text" type="button" data-action="logout">退出登录</button></p>' : "";
  return `<div id="page-header" class="page-head"></div>${state.page === "settings" ? segmented(
    "settings-tab",
    Object.entries(
      settingsChoices
    ),
    state.settingsTab,
    "设置分类",
    "tab",
    "page-tabs"
  ) : ""}${settingsHint}${state.page === "settings" ? '<section class="card panel" aria-label="本地待处理"><h2>本地待处理</h2><p class="hint">后台会自动同步；如有冲突，可在这里查看和处理。</p><div id="offline-settings-entry"></div></section>' : ""}${renderMediaTabs()}<div id="page-content"></div>`;
}
function reuseShell() {
  const shell = $(".shell"), main = $("#main");
  if (!main || shell?.dataset.session !== String(runtime.sessionEpoch) || shell.dataset.user !== state.me?.id) return false;
  setMenu(false);
  for (const link of $$(".nav-item,.mobile-nav-item", shell)) {
    const current3 = link.dataset.nav === state.page;
    link.classList.toggle("active", current3);
    if (current3) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  syncWorkbenchNavigation();
  main.innerHTML = mainContent();
  return true;
}
function renderShell() {
  redirectMobileArticlePage();
  if (state.page === "settings" && (state.settingsTab === "workspace" || state.settingsTab === "openai" || state.me?.publicBusiness && !["todo", "ai"].includes(state.settingsTab)))
    state.settingsTab = "todo";
  stopPageEntry();
  closePopover({ restoreFocus: false });
  if (reuseShell()) {
    renderPage();
    return;
  }
  $("#app").innerHTML = `<div class="shell" data-session="${runtime.sessionEpoch}" data-user="${e(state.me.id)}"><aside id="site-nav" class="sidebar" aria-label="主要导航"><div class="sidebar-brand"><a href="?page=review&amp;account=${e(encodeURIComponent(state.account || "V字"))}" class="brand" data-nav="review"><span class="brand-mark">${icon("fish", 27)}</span><span class="brand-title">好多鱼工作台</span></a><button class="icon-button mobile-menu" data-action="menu" aria-label="关闭导航" aria-expanded="false" aria-controls="site-nav">${icon(
    "close"
  )}</button></div><nav class="nav-list" tabindex="0" aria-label="模块导航">${sidebarNavigation()}</nav><div class="sidebar-bottom">${settingsNavigation()}${state.me.publicBusiness ? "" : `<div class="user-row"><span class="avatar">${e((state.me.username || "我").slice(0, 1).toUpperCase())}</span><span class="user-name">${e(state.me.username)}</span>${state.me.publicBusiness ? "" : `<button class="logout" data-action="logout" title="退出登录" aria-label="退出登录">${icon("logout", 16)}</button>`}</div>`}</div></aside>${renderSidebarResizer()}<div class="workspace"><header class="mobile-bar"><span>好多鱼工作台</span><a class="icon-button mobile-settings-trigger" href="?page=settings&amp;tab=todo" data-nav="settings" aria-label="设置">${icon("settings", 20)}</a></header><main id="main" class="content" tabindex="-1">${mainContent()}</main>${mobileNavigation()}</div></div>`;
  syncMenu();
  setupSidebarResize();
  setupMobileViewport();
  renderPage();
}
function redirectMobileArticlePage() {
  const page = mobilePage(state.page);
  if (page === state.page) return false;
  state.page = page;
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
  const same2 = target === state.page && (target !== "memos" || !state.memoView) && (page !== "settings" || state.settingsTab === "todo") && (page !== "todos" || !state.todoDate && !state.todoPanel);
  if (same2 && !$("#overlay")?.firstChild && !runtime.activePopover) {
    setMenu(false);
    return;
  }
  navigate(page);
}
function navigate(page, tab) {
  page = mobilePage(page);
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
  if (page === "settings") state.settingsTab = (legacy || tab) === "workspace" ? "todo" : legacy || (Object.hasOwn(settingsTabs, tab) ? tab : "todo");
  updateRoute(true);
  closeModal();
  renderShell();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function pageLoading(page) {
  if (page === "review") return renderContentReview();
  if (page === "todos") return renderTodos();
  if (page === "notes") return renderDailyNotes();
  if (page === "memos") return renderMemos();
  if (page === "reminders") return renderWorkReminders();
  if (page === "ai-reports") return renderAiReports();
  if (page === "settings" && state.settingsTab === "workspace") return renderWorkbenchSettings();
  return skeleton();
}
function setPageBody(html, page) {
  if (page === "review") {
    if (html) replacePageContent(html, true);
    else paintContentReviewPage();
  } else if (page === "todos") paintTodos();
  else if (page === "notes") paintDailyNotesPage();
  else if (page === "memos") paintMemosPage();
  else if (page === "settings" && state.settingsTab === "workspace") paintMemosPage();
  else if (page === "reminders" || page === "ai-reports") return;
  else replacePageContent(html, true);
}
function publishedArticleLinks(html) {
  const query = new URLSearchParams({ page: "articles", status: "published", sort: "reads", order: "desc" });
  if (state.topPlatform) query.set("platform", state.topPlatform);
  if (state.account) query.set("account", state.account);
  return html.replace('href="?page=articles&amp;sort=reads&amp;order=desc"', `href="?${e(query.toString())}"`);
}
async function loadArticleOverview(version2, context) {
  const query = new URLSearchParams({ period: state.overviewPeriod, top_n: state.topN, top_platform: state.topPlatform });
  if (state.account) query.set("account_id", state.account);
  const data3 = await api(`/overview?${query}`, { context });
  if (version2 !== runtime.renderVersion) return "";
  state.dashboard = data3;
  return renderMediaOverview(data3);
}
function renderMediaOverview(data3) {
  return publishedArticleLinks(renderDashboardSummary(data3));
}
async function renderPage() {
  stopOpenAiReviewTimers();
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
    let html = "", data3;
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
      case "ai-reports":
        await loadAiReports({ resetDate: true });
        break;
      case "review":
        await loadContentReview(context);
        break;
      case "settings":
        if (state.settingsTab === "workspace") break;
        else if (state.settingsTab === "todo") {
          await loadTodoPreferences(context);
          html = renderTodoSettings();
        } else if (state.settingsTab === "ai") {
          html = aiSettingsPage();
          void loadAiSettings();
        } else if (state.settingsTab === "keys") {
          data3 = await api("/api-keys", { context });
          html = renderKeys(data3);
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
        const count3 = null;
        counter.hidden = count3 == null;
        counter.textContent = count3 == null ? "" : num(count3);
      }
    }
  } catch (err) {
    if (!isRequestAbort(err) && !err.staleSession && version2 === runtime.renderVersion && state.me) setPageBody(`<div class="card error-panel" role="alert"><span class="empty-icon">${icon("info", 23)}</span><h3>本次数据读取失败</h3><p>${e(err.message)}</p><button class="btn" data-action="refresh">${icon("refresh")}重新加载</button></div>`, page);
  } finally {
    if (version2 === runtime.renderVersion) $("#page-content")?.setAttribute("aria-busy", "false");
  }
}
async function reloadFilteredPage(focus = "[data-action=article-filter]") {
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
    if (me.publicBusiness && new URLSearchParams(location.search).get("page") === "login") {
      renderLogin();
      return;
    }
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
    if (err.status === 401 && !err.offlineScopeFailure) renderLogin();
    else {
      const retryAt = err.status === 429 ? retryUntil(Date.now(), err.retryAfterMs) : 0;
      let retrying = false;
      renderInitializationError(err.message, () => {
        if (retrying || Date.now() < retryAt) return;
        retrying = true;
        void init();
      }, { status: err.status });
    }
  }
}

// web/pages/article-verification.mjs
init_api();
init_state();
var copy = (value) => structuredClone(value);
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validArticle(value, id2) {
  return value?.id === id2 && Number.isSafeInteger(value.version) && value.version > 0 && (value.verify_items === null || Array.isArray(value.verify_items));
}
function verificationIntent(index, done2) {
  return `第 ${index + 1} 项设为${done2 ? "已处理" : "待处理"}`;
}
function createArticleVerificationStore({ article, load, put, uuid: uuid5 = () => crypto.randomUUID(), onChange = () => {
}, isCurrent = () => true }) {
  let current3 = copy(article), phase = "idle", message = "", pending = null, busy2 = false, retryReady = false;
  const snapshot = () => ({ article: copy(current3), phase, message, busy: busy2, retryReady });
  const notify = () => onChange(snapshot());
  function received(value) {
    if (!validArticle(value, current3.id)) throw new Error("详情读取不完整，请重新打开核对。");
    current3 = copy(value);
  }
  async function reconcile(conflict = false) {
    let remote;
    try {
      remote = await load(current3.id);
    } catch {
      phase = "unknown";
      retryReady = false;
      message = "保存结果尚未确认，请重新核对；不会自动重发。";
      return false;
    }
    if (!validArticle(remote, current3.id)) {
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
      response = await put(current3.id, copy(pending.body), pending.key);
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 409) {
        pending = null;
        phase = "error";
        message = error.message || "保存被拒绝，请核对后重试。";
      } else await reconcile(error.status === 409);
      return;
    }
    if (!validArticle(response, current3.id) || response.version <= pending.body.version || !same(response.verify_items, pending.body.verify_items)) {
      await reconcile();
      return;
    }
    received({ ...current3, ...response });
    pending = null;
    phase = "saved";
    message = "";
    try {
      const remote = await load(current3.id);
      if (validArticle(remote, current3.id) && remote.version >= current3.version) {
        const matches2 = same(remote.verify_items, current3.verify_items);
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
  async function save(index, done2) {
    if (busy2 || pending || !Number.isSafeInteger(index) || typeof done2 !== "boolean" || !Array.isArray(current3.verify_items) || !current3.verify_items[index] || typeof current3.verify_items[index] !== "object") return;
    if (current3.verify_items[index].done === done2) return;
    const items = copy(current3.verify_items);
    items[index].done = done2;
    pending = { index, done: done2, before: copy(current3.verify_items), body: { version: current3.version, verify_items: items }, key: uuid5() };
    busy2 = true;
    try {
      await send();
    } finally {
      busy2 = false;
      notify();
    }
  }
  async function refresh() {
    if (busy2) return;
    busy2 = true;
    notify();
    try {
      await reconcile();
    } finally {
      busy2 = false;
      notify();
    }
  }
  async function retry() {
    if (busy2 || !pending) return;
    busy2 = true;
    notify();
    try {
      if (await reconcile()) await send();
    } finally {
      busy2 = false;
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
    load: (id2) => api(`/articles/${encodeURIComponent(id2)}`),
    put: (id2, body2, key) => api(`/articles/${encodeURIComponent(id2)}`, {
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
  const moved2 = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10;
  if (moved2 || !todoPressEligible(gesture, press, event.clientX, event.clientY)) cancelTodoPress(gesture);
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
  const gesture = { onOpen, isEligible, press: null, blocked: null, pointers: /* @__PURE__ */ new Set() }, listeners2 = [];
  const listen = (target, name, handler, options4 = true) => {
    target.addEventListener(name, handler, options4);
    listeners2.push(() => target.removeEventListener(name, handler, options4));
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
    for (const remove of listeners2) remove();
  };
}

// web/offline/ui.mjs
init_runtime();
init_conflict_decisions();
function offlineStatusLabel(state2) {
  if (state2.unsupported) return "需新版";
  if (state2.conflicts) return "有冲突";
  if (!state2.online) return `离线（${state2.pending || 0} 条待同步）`;
  if (state2.error) return "同步检查失败";
  if (state2.phase === "syncing") return "正在同步…";
  if (state2.pending) return `待同步（${state2.pending} 条）`;
  return "查看同步状态";
}
function textNode(document2, tag2, text, className) {
  const node2 = document2.createElement(tag2);
  node2.textContent = text;
  if (className) node2.className = className;
  return node2;
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
    const button3 = textNode(document2, "button", label3, "btn text");
    button3.type = "button";
    button3.disabled = requests.busy(conflict.key);
    button3.addEventListener("click", async () => {
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
    actions2.append(button3);
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
  const root3 = document2.createDocumentFragment();
  if (!queue.operations.length && !queue.conflicts.length) root3.append(textNode(document2, "p", "暂无待处理内容。"));
  const labels4 = {
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
      `${operation2.needs_upgrade ? "需新版" : labels4[operation2.status] || "等待同步"} · ${readable(operation2.local)}`,
      "offline-queue-row"
    );
    if (operation2.error) item.append(textNode(document2, "span", " · " + operation2.error));
    root3.append(item);
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
      root3.append(item);
      continue;
    }
    if (conflict.resolution) {
      const labels5 = {
        queued: "选择已存本机，正在核对线上结果。",
        conflict: "新保存有冲突，请核对下方的新比较内容。",
        blocked: "新保存暂未完成，原文与选择仍保留。",
        paused: "需联网核实后继续，原文与选择仍保留。"
      };
      item.append(textNode(document2, "p", labels5[conflict.resolution.state] || "正在核对线上结果。"));
      root3.append(item);
      continue;
    }
    if (conflictLocalChoiceLabel(conflict) === "另存本地副本")
      item.append(textNode(document2, "p", "副本会使用新记录，原记录保持原状。"));
    item.append(conflictActions(document2, conflict, runtime2, refresh, requests));
    root3.append(item);
  }
  return root3;
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
    const unavailable2 = page === "settings" && !state2.online;
    content2.inert = unavailable2;
    if (unavailable2 || content2.dataset.offlineHidden === "true") content2.hidden = unavailable2;
    content2.dataset.offlineHidden = String(unavailable2);
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
  const root3 = document2.createElement("section");
  root3.className = "offline-settings-panel";
  root3.setAttribute("aria-label", "本地待处理");
  const button3 = textNode(document2, "button", "", "btn text offline-settings-toggle");
  button3.type = "button";
  button3.setAttribute("aria-controls", "offline-queue");
  button3.setAttribute("aria-expanded", "false");
  const panel2 = document2.createElement("section");
  panel2.id = "offline-queue";
  panel2.className = "offline-queue";
  panel2.setAttribute("aria-label", "本机待同步内容与冲突");
  panel2.hidden = true;
  root3.append(button3, panel2);
  async function refreshQueue() {
    if (!expanded) return;
    const sequence5 = ++rendering, queue = await runtime2.queue();
    if (sequence5 !== rendering || !expanded) return;
    const title = textNode(document2, "h2", "同步状态");
    const details = document2.createDocumentFragment();
    if (state2.error) {
      const stages = { identity: "身份核验", outbox: "提交队列", cache: "本地缓存", snapshot: "服务器快照" };
      details.append(textNode(document2, "p", `${stages[state2.errorStage] || "同步检查"}失败：${state2.error}`, "offline-sync-error"));
    }
    details.append(textNode(document2, "h3", "待提交队列"));
    panel2.replaceChildren(title, details, queueRows(document2, queue, runtime2, refreshQueue, requests));
  }
  function mount() {
    const host = document2.querySelector("#offline-settings-entry");
    if (host && !host.contains(root3)) host.append(root3);
    else if (!host && root3.isConnected) root3.remove();
    const label3 = state2.conflicts ? `查看待处理项（${state2.conflicts} 项冲突）` : state2.pending ? `查看待处理项（${state2.pending} 项）` : "查看待处理项";
    root3.hidden = !state2.identity;
    if (button3.textContent !== label3) button3.textContent = label3;
    root3.dataset.phase = state2.conflicts ? "conflict" : state2.phase;
    pageAnnotation(document2, state2);
  }
  button3.addEventListener("click", () => {
    expanded = !expanded;
    panel2.hidden = !expanded;
    button3.setAttribute("aria-expanded", String(expanded));
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
    root3.remove();
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

// web/floating-workbench.mjs
init_format();
init_state();
init_todos_state();
init_runtime();
var activeWindow = null, opening = false;
function node(doc, tag2, text = "", className = "") {
  const result = doc.createElement(tag2);
  result.textContent = text;
  if (className) result.className = className;
  return result;
}
function makeView(pip) {
  const doc = pip.document;
  doc.title = "好多鱼桌面便签";
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) doc.head.append(link.cloneNode());
  doc.body.className = "floating-workbench";
  const main = node(doc, "main", "", "floating-main");
  const head = node(doc, "header", "", "floating-head");
  head.append(node(doc, "time", "", "floating-date"));
  const close = node(doc, "button", "", "floating-close");
  close.type = "button";
  close.setAttribute("aria-label", "关闭便签");
  head.append(close);
  close.addEventListener("click", () => pip.close());
  const tabs = node(doc, "nav", "", "floating-tabs");
  tabs.setAttribute("aria-label", "便签内容");
  for (const [id2, text] of [["todos", "今日待办"], ["notes", "今日碎碎念"]]) {
    const button3 = node(doc, "button", text);
    button3.type = "button";
    button3.dataset.tab = id2;
    tabs.append(button3);
  }
  const offline = node(doc, "p", "", "floating-offline");
  offline.setAttribute("role", "status");
  const todo = node(doc, "section", "", "floating-panel");
  todo.dataset.panel = "todos";
  todo.append(node(doc, "h2", "⌄  今日待办", "floating-group-title"));
  const todoMessage = node(doc, "p", "", "floating-message");
  todoMessage.setAttribute("role", "alert");
  const todoList = node(doc, "ul", "", "floating-list");
  todo.append(todoMessage, todoList);
  const notes = node(doc, "section", "", "floating-panel");
  notes.dataset.panel = "notes";
  notes.hidden = true;
  notes.append(node(doc, "h2", "⌄  今日碎碎念", "floating-group-title"));
  const noteList = node(doc, "ul", "", "floating-note-list");
  const newNote = node(doc, "button", "写一条");
  newNote.type = "button";
  const notesInput = node(doc, "textarea");
  notesInput.placeholder = "写下一点想说的话…";
  notesInput.setAttribute("aria-label", "碎碎念内容");
  notesInput.rows = 5;
  const labels4 = node(doc, "fieldset", "", "floating-labels");
  labels4.append(node(doc, "legend", "标签（可多选）"));
  const options4 = node(doc, "div");
  labels4.append(options4);
  const noteMessage = node(doc, "p", "", "floating-message");
  noteMessage.setAttribute("role", "status");
  const noteActions = node(doc, "div", "", "floating-actions");
  const send = node(doc, "button", "发送");
  send.type = "button";
  const check = node(doc, "button", "核对保存结果");
  check.type = "button";
  check.hidden = true;
  const retry = node(doc, "button", "重试原保存");
  retry.type = "button";
  retry.hidden = true;
  noteActions.append(send, check, retry);
  notes.append(noteList, newNote, notesInput, labels4, noteMessage, noteActions);
  main.append(head, tabs, offline, todo, notes);
  doc.body.replaceChildren(main);
  return {
    doc,
    head,
    tabs,
    offline,
    todo,
    todoMessage,
    todoList,
    notes,
    noteList,
    newNote,
    notesInput,
    labels: labels4,
    options: options4,
    noteMessage,
    send,
    check,
    retry
  };
}
function paintTodo(view) {
  const day6 = todoDay(bjtDate());
  view.head.querySelector("time").textContent = day6.date;
  view.todoMessage.textContent = day6.error || (!day6.loaded && day6.loading ? "正在读取待办…" : "");
  const fragment = view.doc.createDocumentFragment();
  for (const item of day6.items) {
    const removal = day6.removals.get(item.id);
    if (item.deleted_at || removal && removal.phase !== "restoring") continue;
    const li = node(view.doc, "li"), label3 = node(view.doc, "label"), check = node(view.doc, "input");
    check.type = "checkbox";
    check.dataset.todoId = item.id;
    check.dataset.date = day6.date;
    check.checked = day6.updates.has(item.id) ? day6.updates.get(item.id) : Boolean(item.completed);
    check.disabled = !day6.loaded || todoBusy(day6, item.id);
    label3.append(check, node(view.doc, "span", item.text));
    li.append(label3);
    if (check.checked) li.classList.add("is-complete");
    fragment.append(li);
  }
  if (!day6.items.some((item) => !item.deleted_at) && day6.loaded) fragment.append(node(view.doc, "li", "今天还没有待办。", "floating-empty"));
  view.todoList.replaceChildren(fragment);
}
function paintNotes(view) {
  const snap = floatingNotesSnapshot(), item = snap?.item, page = snap?.page;
  const previousDate = Boolean(item && item.date !== snap?.date);
  const text = item?.draft || "";
  const fragment = view.doc.createDocumentFragment();
  for (const record of snap?.entries || []) {
    const row = node(view.doc, "li");
    const content2 = record.legacy ? node(view.doc, "div") : node(view.doc, "button");
    if (!record.legacy) {
      content2.type = "button";
      content2.dataset.noteId = record.id;
      content2.dataset.category = record.category;
    }
    const time2 = record.createdAt || record.localCreatedAt || record.updatedAt;
    const caption = time2 && Number.isFinite(Date.parse(time2)) ? new Intl.DateTimeFormat(
      "zh-CN",
      { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
    ).format(new Date(time2)) : "";
    content2.append(
      node(view.doc, "small", [caption, record.legacy ? "原有记录 · 只读" : record.dirty ? "草稿" : ""].filter(Boolean).join(" · ")),
      node(view.doc, "span", record.dirty ? record.draft : record.draft ?? record.serverText ?? "")
    );
    row.append(content2);
    fragment.append(row);
  }
  view.noteList.replaceChildren(fragment);
  view.newNote.disabled = !page?.loaded || !page.canEdit;
  if ((view.doc.activeElement !== view.notesInput || !view.doc.hasFocus()) && view.notesInput.value !== text)
    view.notesInput.value = text;
  view.notesInput.disabled = !page?.loaded || !page.canEdit || item?.canEdit === false;
  view.notesInput.readOnly = Boolean(view.frozen);
  view.labels.disabled = Boolean(view.frozen) || !snap?.labelsVerified || !page?.canEdit || Boolean(item?.pending) || item?.labelComplete === false;
  const current3 = [...view.options.querySelectorAll("input")].map((input) => input.value);
  const available = [.../* @__PURE__ */ new Set([...snap?.labels || [], ...item?.labels || []])];
  if (JSON.stringify(current3) !== JSON.stringify(available)) {
    const fragment2 = view.doc.createDocumentFragment();
    for (const name of available) {
      const label3 = node(view.doc, "label"), input = node(view.doc, "input");
      input.type = "checkbox";
      input.value = name;
      label3.append(input, node(view.doc, "span", name));
      fragment2.append(label3);
    }
    view.options.replaceChildren(fragment2);
  }
  for (const input of view.options.querySelectorAll("input")) input.checked = Boolean(item?.labels?.includes(input.value));
  const blocked2 = item?.pending || item?.composing || ["unknown", "conflict", "oversize"].includes(item?.phase);
  view.send.disabled = Boolean(view.frozen) || !item?.dirty || Boolean(blocked2) || !item.canEdit || previousDate;
  view.check.hidden = item?.phase !== "unknown";
  view.check.disabled = Boolean(view.frozen || item?.pending?.checking);
  view.retry.hidden = item?.phase !== "unknown" || !item?.pending?.retryReady;
  view.retry.disabled = Boolean(view.frozen);
  view.newNote.disabled ||= Boolean(view.frozen);
  view.noteMessage.textContent = item?.error || snap?.error || page?.error || snap?.draftError || snap?.labelError || (previousDate ? `此草稿属于 ${item.date}，请在原日期处理；点击“写一条”可继续今日记录。` : !page?.loaded ? "正在读取碎碎念…" : !page.canEdit ? "当前身份为只读。" : item?.phase === "queued" ? "已存本机，待同步。" : "");
}
function bindOfflineStatus(view, active5) {
  let unsubscribe = () => {
  };
  const stop = onOfflineRuntime((runtime2) => {
    unsubscribe();
    unsubscribe = runtime2.subscribe((value) => {
      if (active5()) view.offline.textContent = [
        offlineStatusLabel(value),
        value.partial ? "仅显示本机已保存事项，完整列表需联网读取。" : ""
      ].filter(Boolean).join(" ");
    });
  });
  return () => {
    stop();
    unsubscribe();
  };
}
function mountFloating(pip) {
  const view = makeView(pip), owner2 = todoOwner();
  let alive = true, tab = "todos", notesLoaded = false, composing = false, date = bjtDate();
  const active5 = () => alive && !pip.closed && todoSessionActive(owner2);
  const paint3 = () => {
    if (active5()) {
      paintTodo(view);
      if (tab === "notes") paintNotes(view);
    }
  };
  const stopTodos = observeTodoChanges(paint3), stopNotes = observeFloatingNotes(paint3);
  const stopRuntime = bindOfflineStatus(view, active5);
  const beforeUnload = (event) => {
    if (active5() && hasFloatingNoteDraft()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  const beforeRefresh2 = (event) => {
    if (!active5() || typeof event.detail?.waitUntil !== "function") return;
    if (composing) {
      event.detail.waitUntil(Promise.reject(new Error("输入尚未完成，请结束输入后再刷新。")));
      return;
    }
    const current3 = floatingNotesSnapshot()?.item;
    if (tab === "notes" && view.notesInput.value !== (current3?.draft || "")) editFloatingNote(view.notesInput.value);
    view.frozen = true;
    paint3();
    event.detail.onFailure?.(() => {
      view.frozen = false;
      if (active5()) paint3();
    });
  };
  const reset2 = () => {
    if (alive) pip.close();
  };
  const focus = () => {
    if (active5()) {
      void loadFloatingToday();
      if (tab === "notes") void loadFloatingNotes();
    }
  };
  const timer2 = setInterval(() => {
    if (!active5()) {
      if (alive) pip.close();
      return;
    }
    if (date !== bjtDate()) {
      if (hasFloatingNoteDraft()) toast("前一天仍有未发送内容，请确认保存后再关闭主页面。");
      date = bjtDate();
      notesLoaded = false;
      void loadFloatingToday();
      if (tab === "notes") {
        notesLoaded = true;
        void loadFloatingNotes();
      }
    }
  }, 3e4);
  function cleanup() {
    if (!alive) return;
    if (composing && todoSessionActive(owner2)) {
      editFloatingNote(view.notesInput.value, false);
      composing = false;
    }
    markFloatingNoteComposing(false);
    const draft = hasFloatingNoteDraft();
    alive = false;
    clearInterval(timer2);
    stopTodos();
    stopNotes();
    stopRuntime();
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("haoduoyu:before-refresh", beforeRefresh2);
    window.removeEventListener("haoduoyu-todos-reset", reset2);
    pip.removeEventListener("focus", focus);
    if (activeWindow === pip) activeWindow = null;
    if (draft && todoSessionActive(owner2)) toast("未发送内容仍在当前页面，请确认保存后再关闭主页面。");
  }
  view.tabs.addEventListener("click", (event) => {
    const button3 = event.target.closest("button[data-tab]");
    if (!button3) return;
    tab = button3.dataset.tab;
    view.todo.hidden = tab !== "todos";
    view.notes.hidden = tab !== "notes";
    for (const control of view.tabs.querySelectorAll("button")) control.setAttribute("aria-pressed", String(control === button3));
    if (tab === "notes" && !notesLoaded) {
      notesLoaded = true;
      void loadFloatingNotes();
    }
    paint3();
  });
  view.todoList.addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.todoId) void toggleTodo(input, { floating: true });
  });
  view.newNote.addEventListener("click", () => {
    newFloatingNote();
    paint3();
    view.notesInput.focus();
  });
  view.noteList.addEventListener("click", (event) => {
    const button3 = event.target.closest("[data-note-id]");
    if (button3) selectFloatingNote(button3.dataset.noteId, button3.dataset.category);
  });
  view.notesInput.addEventListener("compositionstart", () => {
    composing = true;
    markFloatingNoteComposing(true);
  });
  view.notesInput.addEventListener("input", (event) => {
    editFloatingNote(view.notesInput.value, composing || event.isComposing);
    if (composing || event.isComposing) markFloatingNoteComposing(true);
  });
  view.notesInput.addEventListener("compositionend", () => {
    composing = false;
    editFloatingNote(view.notesInput.value);
    markFloatingNoteComposing(false);
  });
  view.options.addEventListener("change", () => {
    labelFloatingNote([...view.options.querySelectorAll("input:checked")].map((input) => input.value));
    paint3();
  });
  view.send.addEventListener("click", () => {
    void sendFloatingNote();
  });
  view.check.addEventListener("click", () => {
    void checkFloatingNote();
  });
  view.retry.addEventListener("click", () => {
    void checkFloatingNote(true);
  });
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("haoduoyu:before-refresh", beforeRefresh2);
  window.addEventListener("haoduoyu-todos-reset", reset2);
  pip.addEventListener("focus", focus);
  pip.addEventListener("pagehide", cleanup, { once: true });
  view.tabs.querySelector('[data-tab="todos"]').setAttribute("aria-pressed", "true");
  paint3();
  void loadFloatingToday();
}
async function openFloatingWorkbench() {
  if (!floatingTodoSupported()) {
    toast("当前浏览器不支持置顶便签。", true);
    return;
  }
  if (activeWindow && !activeWindow.closed) {
    activeWindow.focus();
    return;
  }
  if (opening || !state.me) return;
  opening = true;
  try {
    const request2 = window.documentPictureInPicture.requestWindow({ width: 390, height: 520 });
    todoDay(bjtDate());
    const owner2 = todoOwner();
    const pip = await request2;
    if (!todoSessionActive(owner2) || pip.closed) {
      if (!pip.closed) pip.close();
      return;
    }
    activeWindow = pip;
    try {
      mountFloating(pip);
    } catch (error) {
      activeWindow = null;
      pip.close();
      throw error;
    }
  } catch (error) {
    toast("无法打开置顶便签：" + (error?.message || "请稍后重试。"), true);
  } finally {
    opening = false;
  }
}

// web/pages/detail.mjs
init_requests();
init_constants();
init_dom();
init_format();
init_state();
init_modal();
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
    const unknown2 = n.kind !== "latest" && a.date_status === "unverified" && !n.snapshot, status = unknown2 ? "unknown" : n.status, label3 = unknown2 ? "日期待核实" : { recorded: "已记录", before_due: "记录早于节点", not_due: "未到期", not_collected: "未采集" }[status] || "状态未知";
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
async function articleDetail(id2) {
  const context = beginModalRequests();
  const ticket2 = ++runtime.modalRequestVersion, version2 = runtime.renderVersion, a = await modalRequest(
    `/articles/${encodeURIComponent(id2)}`,
    ticket2,
    version2,
    context
  );
  if (ticket2 !== runtime.modalRequestVersion || version2 !== runtime.renderVersion) return;
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
    if (focused !== void 0 && !view.busy) Array.from(document.querySelectorAll("#overlay [data-article-verify-index]")).find((node2) => node2.dataset.articleVerifyIndex === focused)?.focus();
  } });
}

// web/core/article-index.mjs
init_api();
init_session_index_state();
init_state();
init_requests();
var indexRequests = /* @__PURE__ */ new WeakMap();
async function articleIndex(query = "", context) {
  const identity6 = state.me?.id, generation = runtime.articleIndexGeneration;
  if (!identity6) throw Object.assign(new Error("索引会话已失效"), { staleIndex: true });
  const scope = context || backgroundRequests();
  const params = new URLSearchParams(Object.entries(Object.fromEntries(new URLSearchParams(query))).sort(([a], [b]) => a.localeCompare(b)));
  params.set("fields", "index");
  const key = identity6 + ":" + params.toString();
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
  if (generation !== runtime.articleIndexGeneration || identity6 !== state.me?.id) {
    if (!state.me || identity6 !== state.me.id) throw Object.assign(new Error("索引会话已失效"), { staleIndex: true });
    return articleIndex(query, context);
  }
  return rows;
}

// web/pages/reviews.mjs
init_requests();
init_api();
init_constants();
init_dom();
init_format();
init_session_index_state();
init_state();
init_modal();
async function renderReviews(version2 = runtime.renderVersion, context, { isCurrent = () => true, compactFilters = false } = {}) {
  const generation = runtime.articleIndexGeneration, tab = state.reviewTab, pending = tab === "pending", query = selectedQuery(), matches2 = (id2) => !state.filters.platform || state.accounts.find((a) => a.id === id2)?.platform === state.filters.platform;
  const [articles, rows, dueRows] = await Promise.all([articleIndex(query, context), pending ? [] : api(`/${tab === "observations" ? "observations" : "daily-metrics"}?${query}`, { context }), api(`/due-reviews${query ? "?" + query : ""}`, { context })]);
  if (version2 !== runtime.renderVersion || !isCurrent()) return "";
  if (generation !== runtime.articleIndexGeneration) return renderReviews(version2, context, { isCurrent, compactFilters });
  state.reviewArticles = articles;
  const account3 = (r) => r.account_id || articles.find((a) => a.id === r.article_id)?.account_id, records = rows.filter((r) => matches2(account3(
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
  const cell = (r, key) => key === "account" ? e(accountName(account3(r))) : key === "due_kind" ? e(kindLabels[r.due_kind] || r.due_kind) : [
    "as_of",
    "due_at"
  ].includes(key) ? e(displayTime(r[key])) : key === "source" ? e(r.source || "未标注来源") : metricData(r)[key] == null ? '<span class="missing-value">未取得</span>' : e(num(metricData(r)[key]));
  return tabs + `<section class="card">${items.length ? `<div class="table-scroll"><table class="data-table dashboard-table review-table"><thead><tr><th>${pending ? "文章" : tab === "observations" ? "文章／观察节点" : "日期／统计范围"}</th>${columns.map(([, label3]) => `<th>${e(label3)}</th>`).join("")}<th>操作</th></tr></thead><tbody>${items.map((r) => {
    const id2 = pending ? r.id : r.article_id, a = articles.find((a2) => a2.id === id2);
    return `<tr><td class="title-cell">${id2 ? `<button class="article-link" data-action="article-detail" data-id="${e(id2)}">${e(r.title || r.article_title || a?.title || "文章记录")}</button>` : e(r.date)}${pending ? "" : `<div class="cell-sub">${e(tab === "observations" ? kindLabels[r.kind] || r.kind : r.article_id ? r.date : "账号总体")}</div>`}</td>${columns.map(([key, label3]) => `<td data-label="${e(
      label3
    )}">${cell(r, key)}</td>`).join("")}<td>${pending ? `<button class="btn small" data-action="review-article" data-id="${e(
      id2
    )}" data-kind="${e(r.due_kind)}">补录快照</button>` : `<button class="btn small" data-action="record-detail" data-id="${e(r.id)}">详情</button>`}</td></tr>`;
  }).join("")}</tbody></table></div><div class="table-footer">共 ${e(num(items.length))} 条</div>` : empty(pending ? "暂无到期提醒" : "暂无记录", "", pending ? "" : '<button class="btn" data-action="new-review">录入数据</button>')}</section>`;
}
async function reviewRecordsModal() {
  openModal("数据记录", '<div id="media-records" role="status"></div>', { drawer: true });
  const ticket2 = runtime.modalRequestVersion, version2 = runtime.renderVersion, context = beginModalRequests();
  const isCurrent = () => ticket2 === runtime.modalRequestVersion && version2 === runtime.renderVersion;
  try {
    const html = await renderReviews(version2, context, { isCurrent, compactFilters: true });
    const root3 = document.querySelector("#media-records");
    if (isCurrent() && root3) {
      root3.innerHTML = html;
      root3.removeAttribute("role");
    }
  } catch (error) {
    const root3 = document.querySelector("#media-records");
    if (isCurrent() && root3) {
      root3.setAttribute("role", "alert");
      root3.textContent = error.message || "数据记录读取失败，请重试";
    }
  }
}
async function reviewModal(articleId = "", kind = "latest", indexRetry = false) {
  const context = beginModalRequests();
  const ticket2 = ++runtime.modalRequestVersion, version2 = runtime.renderVersion, generation = runtime.articleIndexGeneration;
  const directArticle = Boolean(articleId);
  let articles;
  try {
    articles = await articleIndex("", context);
  } catch (err) {
    if (ticket2 !== runtime.modalRequestVersion || version2 !== runtime.renderVersion) return;
    throw err;
  }
  if (ticket2 !== runtime.modalRequestVersion || version2 !== runtime.renderVersion) return;
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

// web/actions.mjs
init_requests();
init_api();
init_constants();
init_dom();
init_format();
init_format();
init_session_index_state();
init_state();
init_login();
init_entry();
init_modal();
init_popover();
function actionMissingList({ target }) {
  state.filters = { ...defaultFilters(), status: "published", data_status: target.dataset.status || "incomplete" };
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
function actionSaveView({ id: id2 }) {
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
function actionArticleMenu({ target, id: id2 }) {
  const article = state.articles.find((a) => a.id === id2);
  if (article) popover(target, articleMenu(article), { menu: true, label: "文章操作" });
  return;
}
function actionDetailInfo({ target }) {
  popover(target, `<p>${e(target.dataset.reason)}</p>`, { label: target.getAttribute("aria-label") });
  return;
}
function actionDashboardInfo({ target, id: id2 }) {
  popover(target, dashboardInfoBody(target.dataset.kind, id2), { label: target.getAttribute("aria-label") });
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
  if (action !== "all-top") state.account = "";
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
async function actionEditArticle({ id: id2 }) {
  await articleModal(id2);
  return;
}
async function actionArticleDetail({ id: id2 }) {
  await articleDetail(id2);
  return;
}
async function actionReviewArticle({ target, id: id2 }) {
  await reviewModal(id2, target.dataset.kind || "latest");
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
function actionNewKey({}) {
  keyModal();
  return;
}
function actionSelectAccount({ id: id2 }) {
  state.filters = { ...defaultFilters(), status: "published" };
  state.account = id2;
  state.listPage = 1;
  navigate("articles");
  return;
}
function actionRecordDetail({ id: id2 }) {
  const row = state.reviewRecords.find((r) => r.id === id2);
  if (row) openModal("数据记录详情", `${renderSnapshot(row)}<p class="cell-sub record-context">${e(row.date ? "统计日期：" + row.date : "数据截至：" + time(row.as_of))}${row.updated_at ? " · 更新于 " + e(time(row.updated_at)) : ""}</p>`);
  return;
}
function actionRevokeKey({ target, id: id2 }) {
  openModal("撤销 AI 凭证", `<p class="revoke-context">撤销「${e(target.dataset.name)}」后凭证立即失效，已有数据保留。</p><form id="revoke-form" data-id="${e(
    id2
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
    navigate("review");
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
  "todo-floating": openFloatingWorkbench,
  "todo-menu": openTodoMenu,
  "todo-note": openTodoNote,
  "todo-count-set": ({ target }) => openTodoCount(target.dataset),
  "todo-count-add": ({ target }) => void changeTodoCount(target.dataset, "add"),
  "todo-count-undo": ({ target }) => void changeTodoCount(target.dataset, "undo"),
  "todo-count-clear": ({ target }) => void changeTodoCount(target.dataset, "clear"),
  "todo-delete": ({ target }) => deleteTodo(target.dataset),
  "todo-restore": ({ target }) => restoreTodo(target.dataset),
  "todo-make-template": ({ target }) => changeTodoTemplate(target.dataset),
  "todo-remove-template": ({ target }) => changeTodoTemplate(target.dataset, true),
  "todo-template-use": ({ id: id2 }) => useTodoTemplate(id2),
  "todo-template-edit": ({ id: id2 }) => editTodoTemplate(id2),
  "todo-template-archive": ({ id: id2 }) => archiveTodoTemplate(id2),
  "todo-template-restore-archive": ({ id: id2 }) => archiveTodoTemplate(id2, true),
  "todo-template-delete": ({ id: id2 }) => writeTodoTemplate(id2, void 0, true),
  "memo-tools": ({ target }) => {
    if (target.dataset.tool === "trash") navigate("settings", "workspace");
    else {
      requestMemoTool(target.dataset.tool);
      navigate("memos");
    }
  },
  "todo-panel": ({ target }) => setTodoPanel(target.dataset.panel),
  "todo-future-delete": ({ id: id2 }) => deleteUnscheduledTodo(id2),
  "todo-future-schedule": ({ id: id2 }) => scheduleUnscheduledTodo(id2),
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
  "new-key": actionNewKey,
  "select-account": actionSelectAccount,
  "record-detail": actionRecordDetail,
  "revoke-key": actionRevokeKey,
  "copy-token": actionCopyToken,
  "reset-filters": actionResetFilters
};

// web/pages/article-form.mjs
init_api();
init_constants();
init_format();
init_state();
var textValue = (value) => typeof value === "string" ? value.trim() : "";
var objectValue = (value) => value && typeof value === "object" && !Array.isArray(value);
function articleFormCurrent(form, cache2 = runtime.articleFormRecord) {
  return !!cache2 && cache2 === runtime.articleFormRecord && cache2.sessionEpoch === runtime.sessionEpoch && cache2.ticket === runtime.modalRequestVersion && form.isConnected && (cache2.record?.id || "") === (form.dataset.id || "") && String(cache2.record?.version || "") === (form.dataset.version || "");
}
function articleFormRecord(form) {
  const cache2 = runtime.articleFormRecord, id2 = form.dataset.id || "";
  if (!articleFormCurrent(form, cache2) || !objectValue(cache2.record) || id2 && (!Number.isSafeInteger(cache2.record.version) || cache2.record.version < 1)) {
    throw new Error("表单记录已失效，请关闭后重新打开再保存。");
  }
  return cache2;
}
function nullableNumber(value, label3, minimum = 0) {
  const raw = textValue(value);
  if (!raw) return null;
  const number3 = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number3) || number3 < minimum) {
    throw new Error(`${label3}请填写${minimum ? "正" : "非负"}整数，未知时留空。`);
  }
  return number3;
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
  const parts2 = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(raw);
  if (!parts2) throw new Error(`${label3}请填写有效的北京时间。`);
  const canonical4 = `${parts2[1]}T${parts2[2]}:${parts2[3] || "00"}.${(parts2[4] || "").padEnd(3, "0")}`;
  const stamp3 = /* @__PURE__ */ new Date(`${canonical4}+08:00`);
  if (!Number.isFinite(stamp3.getTime()) || new Date(stamp3.getTime() + 8 * 36e5).toISOString().slice(0, 23) !== canonical4) {
    throw new Error(`${label3}请填写真实日期和时间。`);
  }
  if (original && raw === localDateTime(original)) return new Date(original).toISOString();
  return stamp3.toISOString();
}
function mergedObject(original, fields5) {
  if (original != null && !objectValue(original)) throw new Error("原记录的 JSON 字段无法安全编辑，请重新打开核对。");
  const result = original == null ? {} : structuredClone(original);
  for (const [key, value] of Object.entries(fields5)) {
    if (value !== null || Object.hasOwn(result, key)) result[key] = value;
  }
  return Object.keys(result).length || original != null ? result : null;
}
function publicationFields(data3, original, status) {
  const raw = textValue(data3.url), time2 = textValue(data3.published_at);
  if (status !== "published" && (raw || time2)) {
    throw new Error("未发布状态不能保留公开链接或发布时间，请明确清空发布信息或选择已发布。");
  }
  if (status !== "published") return { url: null, published_at: null };
  if (!raw || !time2 || !safeLedgerURL(raw)) throw new Error("已发布文章须填写真实的 HTTP/HTTPS 链接和实际发布时间。");
  const url = new URL(raw);
  url.hash = "";
  return { url: url.toString(), published_at: articleTime(time2, "实际发布时间", original.published_at) };
}
function buildArticleFormPayload(data3, original = {}) {
  const status = choice(data3.status, statusLabels, "文章状态");
  if (!status) throw new Error("请明确选择文章状态，未确认的状态不会自动保存为草稿或已发布。");
  const body2 = {
    account_id: textValue(data3.account_id),
    title: textValue(data3.title),
    status,
    ...publicationFields(data3, original, status),
    started_at: articleTime(data3.started_at, "流水线开始", original.started_at),
    production_mode: choice(data3.production_mode, modeLabels, "生产方式", "unknown"),
    summary: textValue(data3.summary),
    notes: textValue(data3.notes),
    platform_article_id: textValue(data3.platform_article_id) || null,
    slot: choice(data3.slot, slotLabels, "槽位"),
    writer: choice(data3.writer, writerLabels, "写作者"),
    illustrator: choice(data3.illustrator, illustratorLabels, "配图者"),
    run_dir: textValue(data3.run_dir) || null,
    run_date: textValue(data3.run_date) || null,
    series_no: nullableNumber(data3.series_no, "系列编号", 1),
    char_count: nullableNumber(data3.char_count, "字数"),
    subheading_count: nullableNumber(data3.subheading_count, "小标题数"),
    image_count: nullableNumber(data3.image_count, "图数")
  };
  if (!body2.account_id || !body2.title) throw new Error("请填写文章标题并选择所属运营账号。");
  if (body2.published_at && body2.started_at && body2.started_at > body2.published_at) {
    throw new Error("流水线开始时间不能晚于发布时间。");
  }
  const editor = textValue(data3.draft_editor_url);
  if (editor && !safeLedgerURL(editor)) throw new Error("草稿编辑链接请使用有效的 HTTP/HTTPS 地址。");
  body2.draft_ref = mergedObject(original.draft_ref, {
    pgc_id: textValue(data3.draft_pgc_id) || null,
    appmsgid: textValue(data3.draft_appmsgid) || null,
    editor_url: editor || null
  });
  body2.timings = mergedObject(original.timings, { finished_at: articleTime(data3.finished_at, "流水线结束", original.timings?.finished_at) });
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
async function reconcileArticleSave(cache2, request2, isCurrent) {
  if (!cache2.saveAttempt.id) throw uncertainArticleSave(cache2);
  let remote;
  try {
    remote = await request2(`/articles/${encodeURIComponent(cache2.saveAttempt.id)}`);
  } catch {
    if (!isCurrent()) return null;
    throw uncertainArticleSave(cache2, "保存结果尚未确认，当前表单不会再次提交。请稍后重新打开记录核对。");
  }
  if (!isCurrent()) return null;
  if (savedArticle(remote, cache2.saveAttempt)) return remote;
  throw uncertainArticleSave(cache2, "保存结果与当前记录未能确认一致，当前表单不会再次提交。请重新打开最新记录核对。");
}
async function saveArticleForm({ form, data: data3 }, { request: request2 = api, uuid: uuid5 = () => crypto.randomUUID() } = {}) {
  const cache2 = articleFormRecord(form), isCurrent = () => articleFormCurrent(form, cache2);
  if (cache2.saveAttempt) throw new Error("此表单已有保存请求，请关闭后核对文章列表或最新详情，不要重复新建。");
  const body2 = buildArticleFormPayload(data3, cache2.record), id2 = form.dataset.id || "";
  cache2.saveAttempt = { id: id2, body: structuredClone(body2), key: uuid5(), phase: "saving" };
  let value;
  try {
    value = await request2(id2 ? `/articles/${encodeURIComponent(id2)}` : "/articles", {
      method: id2 ? "PUT" : "POST",
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
    value = await reconcileArticleSave(cache2, request2, isCurrent);
  }
  if (!isCurrent()) return null;
  if (!savedArticle(value, cache2.saveAttempt)) value = await reconcileArticleSave(cache2, request2, isCurrent);
  if (!isCurrent()) return null;
  cache2.saveAttempt.phase = "saved";
  return value;
}

// web/forms.mjs
init_requests();
init_api();
init_constants();
init_dom();
init_format();
init_state();
init_login();
init_modal();
async function submitSaveViewForm({ data: data3 }) {
  const saved = { id: crypto.randomUUID(), name: data3.name.trim(), version: 2, filters: { ...state.filters }, columns: [...state.columns] };
  if (!saved.name) throw new Error("请填写视图名称。");
  state.savedViews = state.savedViews.filter((v) => v.name !== saved.name).concat(saved).slice(-20);
  storage.set("haoduoyu.views", JSON.stringify(state.savedViews));
  closeModal();
  await renderPage();
  return;
}
async function submitLoginForm({ data: data3 }) {
  await api("/auth/login", { method: "POST", body: { username: data3.username, password: data3.password } });
  await init({ freshLogin: true });
  return;
}
async function submitArticleForm({ form, data: data3 }) {
  const saved = await saveArticleForm({ form, data: data3 });
  if (!saved) return;
  closeModal();
  const epoch = runtime.sessionEpoch, ticket2 = runtime.modalRequestVersion;
  try {
    await renderPage();
  } catch {
    if (epoch === runtime.sessionEpoch && ticket2 === runtime.modalRequestVersion) {
      toast("文章已保存，但列表暂时无法刷新，请稍后刷新页面。", true);
    }
  }
  return;
}
async function submitReviewForm({ form, data: data3 }) {
  const m = {};
  for (const key of Object.keys(metrics)) {
    const value = data3[`metric_${key}`];
    if (value !== "" && value != null) m[key] = Number(value);
  }
  if (!Object.keys(m).length) throw new Error("请至少填写一个已取得的指标。");
  let body2, path;
  if (form.dataset.type === "daily") {
    path = "/daily-metrics";
    body2 = { account_id: data3.account_id, article_id: data3.article_id || null, date: data3.date, metrics: m, source: data3.source.trim() };
  } else {
    path = "/observations";
    body2 = { article_id: data3.article_id, kind: data3.kind, as_of: iso(data3.as_of), collected_at: iso(data3.collected_at), metrics: m, source: data3.source.trim(), note: data3.note };
  }
  await api(path, { method: "POST", body: body2 });
  closeModal();
  await renderPage();
  return;
}
async function submitAccountForm({ form, data: data3, values }) {
  const id2 = form.dataset.id, epoch = runtime.sessionEpoch, ticket2 = runtime.modalRequestVersion;
  const profile = String(data3.profile_url || "").trim();
  const body2 = id2 ? { name: data3.name.trim(), active: values.has("active") } : {};
  if (profile || id2 && (state.accountProfiles || []).some((row) => row.account_id === id2)) body2.profile_url = profile;
  const signature2 = JSON.stringify(body2);
  if (form.accountSaveSignature !== signature2) {
    form.accountSaveSignature = signature2;
    form.accountSaveKey = crypto.randomUUID();
  }
  const saved = await api(id2 ? `/accounts/${encodeURIComponent(id2)}` : "/accounts", {
    method: id2 ? "PUT" : "POST",
    body: body2,
    headers: { "Idempotency-Key": form.accountSaveKey }
  });
  if (epoch !== runtime.sessionEpoch || ticket2 !== runtime.modalRequestVersion) return;
  const [accounts, profiles] = await Promise.all([api("/accounts"), api("/account-profiles")]);
  if (epoch !== runtime.sessionEpoch || ticket2 !== runtime.modalRequestVersion) return;
  state.accountProfiles = profiles;
  state.accounts = accounts.sort((a, b) => ["toutiao", "zhihu", "wechat", "other"].indexOf(a.platform) - [
    "toutiao",
    "zhihu",
    "wechat",
    "other"
  ].indexOf(b.platform));
  closeModal();
  if (saved.profile_reused) toast(`该主页已关联「${saved.name}」，已使用现有账号。访问状态未自动验证。`);
  else toast("账号已保存。请打开主页自行核验；访问状态未自动验证。");
  renderShell();
  return;
}
async function submitKeyForm({ form, data: data3, values }) {
  const ids = values.getAll("account_ids"), permissions = values.getAll("permissions");
  if (!ids.length) throw new Error("请至少选择一个允许访问的账号。");
  if (!permissions.length) throw new Error("请至少选择一种操作权限。");
  const result = await api("/api-keys", { method: "POST", body: { name: data3.name.trim(), account_ids: ids, permissions } });
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
async function submitPasswordForm({ form, data: data3 }) {
  if (data3.newPassword !== data3.confirmPassword) throw new Error("两次输入的新密码不一致。");
  await api("/auth/password", { method: "PUT", body: { currentPassword: data3.currentPassword, newPassword: data3.newPassword } });
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
  "key-form": submitKeyForm,
  "revoke-form": submitRevokeForm,
  "password-form": submitPasswordForm
};
async function handleFormSubmit(event) {
  const form = event.target;
  if (form.id === "todo-count-form") {
    event.preventDefault();
    await submitTodoCount({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (form.id === "todo-note-form") {
    event.preventDefault();
    await submitTodoNote({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
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
  if (!form.matches("#login-form,#article-form,#review-form,#key-form,#password-form,#revoke-form,#article-filters,#save-view-form")) return;
  event.preventDefault();
  if (form.id === "article-filters") return;
  const button3 = $("button[type=submit]", form), message = $(".form-message", form), values = new FormData(form), data3 = Object.fromEntries(
    values
  );
  if (button3?.disabled) return;
  if (message) message.textContent = "";
  if (button3) button3.disabled = true;
  try {
    const handler = forms[form.id];
    if (handler) await handler({ form, data: data3, values });
  } catch (err) {
    if (err.staleSession || isRequestAbort(err)) return;
    if (form.id === "article-form" && !articleFormCurrent(form)) return;
    if (message && message.isConnected) message.textContent = err.code === "VERSION_CONFLICT" ? "这条记录已被其他人或 AI 更新。请关闭后重新打开，核对最新内容再保存。" : err.message;
    else toast(err.message, true);
  } finally {
    if (button3?.isConnected) button3.disabled = false;
  }
}

// web/events.mjs
init_requests();
init_dom();
init_state();
init_entry();
init_modal();
init_popover();
init_daily_notes_state();
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
  const action = target.dataset.action, id2 = target.dataset.id;
  try {
    const handler = Object.hasOwn(actions, action) ? actions[action] : null;
    if (handler) await handler({ target, event, action, id: id2 });
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
  if (el.dataset?.futureDateId) {
    inputUnscheduledTodo(el);
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
  } else if (el.id === "global-account" || el.id === "overview-account") {
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
  } else if (el.closest("#article-filters") && el.name) {
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
      const current3 = runtime.activePopover;
      setTimeout(() => {
        if (runtime.activePopover === current3 && !current3.node.contains(document.activeElement)) closePopover({ restoreFocus: false });
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
function registerEvents3() {
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
  const fail6 = (error) => Promise.allSettled(failures.map((callback) => Promise.resolve().then(() => callback(error))));
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
    await fail6(error);
    throw error;
  }
  return fail6;
}
function updateAction(page, button3, activate) {
  let preparing = false, activated = false;
  return async () => {
    if (preparing || activated) return;
    preparing = true;
    button3.disabled = true;
    let onFailure;
    try {
      onFailure = await beforeRefresh(page);
      activated = activate();
      if (!activated) throw new Error("REFRESH_ACTIVATION_UNAVAILABLE");
    } catch (error) {
      if (onFailure) await onFailure(error);
      button3.textContent = onFailure ? "更新失败，点此重试" : "草稿保存失败，点此重试";
      button3.setAttribute("aria-label", button3.textContent);
    } finally {
      preparing = false;
      if (!activated) button3.disabled = false;
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
  let registration, button3, optedIn = false, reloaded = false, destroyed = false;
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
  function notice2() {
    const waiting = registration?.waiting, previousActive = registration?.active;
    if (!waiting || !registration.active || button3) return;
    button3 = document2.createElement("button");
    button3.type = "button";
    button3.className = "sw-update-notice";
    button3.textContent = "有新版本";
    button3.setAttribute("aria-label", "有新版本，点此更新");
    button3.setAttribute("aria-live", "polite");
    listen(button3, "click", updateAction(page, button3, () => {
      const active5 = registration.active;
      const newerActive = active5 !== previousActive && ["activating", "activated"].includes(active5?.state) ? active5 : null;
      const update = registration.waiting || newerActive || (waiting.state === "activated" ? waiting : null);
      if (destroyed || !update || update.state === "redundant") return false;
      if (update.state !== "activated") update.postMessage({ type: "HAODUOYU_SHELL_ACTIVATE" });
      optedIn = true;
      listen(update, "statechange", () => {
        if (update.state === "activated") reload();
      });
      if (update.state === "activated") reload();
      return true;
    }));
    document2.body.append(button3);
  }
  function watchInstall() {
    const installing = registration.installing;
    if (!installing) return;
    listen(installing, "statechange", () => {
      if (installing.state === "installed") notice2();
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
    notice2();
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
      button3?.remove();
    } };
  } catch {
    for (const remove of cleanups) remove();
    return null;
  }
}

// web/main.mjs
startOfflineUI();
registerEvents3();
startServiceWorker();
init();
