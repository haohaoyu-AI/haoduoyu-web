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
      { id: "ideas", label: "想法池", icon: "bulb" },
      { id: "ai-reports", label: "AI 日报", icon: "calendar" },
      { id: "settings", label: "设置", icon: "settings" }
    ];
    settingsTabs = { todo: "待办切换", ai: "AI 与授权", security: "安全", log: "操作日志" };
    legacyPages = { management: "todo", accounts: "todo", keys: "ai", openai: "ai", workspace: "todo" };
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
      settingsTab: "todo",
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
function isRequestAbort(error2) {
  return error2?.name === "AbortError";
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
function requestKey(path, options3, envelope2) {
  const settings = {};
  for (const key of Object.keys(options3).sort()) {
    if (key === "signal") continue;
    const value = options3[key];
    if (key === "headers") settings.headers = [...new Headers(value)].sort(([a], [b]) => a.localeCompare(b));
    else if (value == null || ["string", "number", "boolean", "undefined"].includes(typeof value)) settings[key] = value;
    else return null;
  }
  return JSON.stringify([runtime.sessionEpoch, runtime.articleIndexGeneration, state.me, path, envelope2, settings]);
}
function forgetRequest(entry) {
  if (entry.context.pending.get(entry.key) === entry) entry.context.pending.delete(entry.key);
}
function settleRequest(entry, error2, value) {
  entry.done = true;
  forgetRequest(entry);
  for (const consumer of entry.consumers) {
    consumer.cleanup();
    if (error2) consumer.reject(error2);
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
function pendingGet(path, options3, envelope2, context, factory) {
  assertRequestActive(context, options3.signal);
  const key = requestKey(path, options3, envelope2) ?? /* @__PURE__ */ Symbol("unshared request");
  let entry = context.pending.get(key);
  if (!entry) {
    entry = { key, context, controller: new AbortController(), consumers: /* @__PURE__ */ new Set(), done: false };
    context.pending.set(key, entry);
    let pending;
    try {
      pending = factory(entry.controller.signal);
    } catch (error2) {
      pending = Promise.reject(error2);
    }
    Promise.resolve(pending).then((value) => settleRequest(entry, null, value), (error2) => settleRequest(entry, error2));
  }
  return subscribeRequest(entry, options3.signal);
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
  const stamp4 = Date.parse(value), diff = Date.now() - stamp4;
  return !Number.isFinite(stamp4) ? "未记录" : diff >= 0 && diff < 864e5 ? `${Math.floor(diff / 36e5)} 小时前` : time(value, bjtDate(value).slice(0, 4) === bjtDate().slice(0, 4));
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
    time = (value, short3 = false) => {
      if (!value) return "未记录";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return "未记录";
      return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", ...short3 ? {} : {
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
function validTodoDate(date2) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date2 || "")) return false;
  const parsed2 = /* @__PURE__ */ new Date(`${date2}T00:00:00Z`);
  return Number.isFinite(parsed2.getTime()) && parsed2.toISOString().slice(0, 10) === date2;
}
function todoDate() {
  return state.page === "todos" && validTodoDate(state.todoDate) ? state.todoDate : bjtDate();
}
function todoDay(date2 = todoDate()) {
  if (todosState.owner !== todoOwner()) resetTodos();
  if (!todosState.days.has(date2)) {
    todosState.days.set(date2, {
      date: date2,
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
      templateWrites: /* @__PURE__ */ new Set(),
      noteDrafts: /* @__PURE__ */ new Map(),
      noteCompletions: /* @__PURE__ */ new Set()
    });
  }
  return todosState.days.get(date2);
}
function syncTodoDay(now = Date.now()) {
  if (todosState.owner !== todoOwner()) resetTodos();
  const today2 = bjtDate(now), changed2 = todosState.today !== today2;
  todosState.today = today2;
  return changed2;
}
function todoSessionActive(owner2) {
  return Boolean(state.me) && owner2 === todoOwner() && owner2 === todosState.owner;
}
function mergeTodo(day9, item) {
  const index = day9.items.findIndex((row) => row.id === item.id);
  if (index < 0) day9.items.push(item);
  else if (day9.items[index].version <= item.version) day9.items[index] = item;
}
function todoTemplateAdded(day9, id2) {
  return day9.items.some((item) => item.date === day9.date && item.template_id === id2 && !item.deleted_at);
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
      key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-3-3 3-3m-6 0 3-3"/>',
      bulb: '<path d="M9 18h6m-5 3h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'
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
  for (const node3 of container.querySelectorAll(".publication-bars i[data-chart-color],.legend-dot[data-chart-color]")) {
    const color = node3.dataset.chartColor;
    node3.style.setProperty("--plot-color", /^var\(--p-(?:toutiao|zhihu|wechat|other)\)$/.test(color) ? color : "var(--p-other)");
    if (node3.hasAttribute("data-chart-height")) {
      const height = Number(node3.dataset.chartHeight);
      node3.style.setProperty("--h", Number.isFinite(height) && height >= 0 && height <= 80 ? `${height}px` : "0px");
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
  const { node: node3, trigger } = runtime.activePopover;
  runtime.activePopover = null;
  node3.remove();
  trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus && trigger.isConnected) trigger.focus();
}
function popover(trigger, body4, { menu = false, label = "说明" } = {}) {
  if (runtime.activePopover?.trigger === trigger) {
    closePopover();
    return;
  }
  closePopover();
  const id2 = trigger.getAttribute("aria-controls") || `popover-${++runtime.popoverId}`, node3 = document.createElement("div");
  trigger.setAttribute("aria-controls", id2);
  trigger.setAttribute("aria-expanded", "true");
  node3.id = id2;
  node3.className = "popover";
  node3.setAttribute("role", menu ? "menu" : "dialog");
  node3.setAttribute("aria-label", label);
  node3.tabIndex = -1;
  node3.innerHTML = body4;
  (trigger.closest("[role=dialog]") || document.body).append(node3);
  runtime.activePopover = { node: node3, trigger, menu };
  const anchor = trigger.getBoundingClientRect(), r = node3.getBoundingClientRect();
  node3.style.left = `var(--popover-left,${Math.max(16, Math.min(anchor.right - r.width, innerWidth - r.width - 16))}px)`;
  node3.style.top = `var(--popover-top,${Math.max(16, Math.min(anchor.bottom + 8, innerHeight - r.height - 16))}px)`;
  (node3.querySelector('button,a[href],input:not([type=hidden]),select,[tabindex="0"]') || node3).focus();
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
function sessionEnded() {
  let tried = false;
  try {
    tried = sessionStorage.getItem(SESSION_RETRY) === "1";
    sessionStorage.setItem(SESSION_RETRY, "1");
  } catch {
  }
  if (!tried && typeof location !== "undefined" && typeof location.reload === "function") {
    location.reload();
    return;
  }
  renderLogin();
}
function sessionStarted() {
  try {
    sessionStorage.removeItem(SESSION_RETRY);
  } catch {
  }
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
var SESSION_RETRY;
var init_login = __esm({
  "web/pages/login.mjs"() {
    init_dom();
    init_session_index_state();
    init_state();
    init_entry();
    init_popover();
    SESSION_RETRY = "haoduoyu.sessionEnded";
  }
});

// web/ui/modal.mjs
function openModal(title, body4, { drawer: drawer2 = false, context = "" } = {}) {
  cancelModalRequests();
  closePopover();
  runtime.modalRequestVersion++;
  if (!$("#overlay").contains(document.activeElement)) runtime.lastFocus = document.activeElement;
  $("#overlay").innerHTML = `<div class="modal-backdrop ${drawer2 ? "drawer-backdrop" : ""}"><section class="modal ${drawer2 ? "drawer" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><div>${context}<h2 id="modal-title">${e(title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon("close", 20)}</button></header><div class="modal-body">${body4}</div></section></div>`;
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
        } catch (error2) {
          task.reject(error2);
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
    const done3 = () => {
      keeper.stop();
      clearTimeout(timer);
    };
    tx.oncomplete = () => {
      done3();
      finished ? resolve(result) : reject(new Error("Offline transaction became inactive"));
    };
    tx.onabort = () => {
      done3();
      reject(tx.error || new Error("Offline transaction aborted"));
    };
    tx.onerror = () => {
    };
    Promise.resolve().then(() => callback(transactionAPI(tx, keeper.schedule))).then((value) => {
      result = value;
      finished = true;
      keeper.finish();
    }).catch((error2) => {
      done3();
      try {
        tx.abort();
      } catch {
      }
      reject(error2);
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
async function snapshotEvidence(tx, scope) {
  const rows = /* @__PURE__ */ new Map();
  for (const row of await tx.getAll("meta")) {
    let key;
    try {
      key = JSON.parse(row.key);
    } catch {
      continue;
    }
    if (!Array.isArray(key) || key.length !== 2 || key[0] !== scope || typeof key[1] !== "string") continue;
    if (legacyNames.includes(key[1]) || legacyNames.some((name) => key[1] === name + "-archive") || key[1] === "snapshot-v2-window" || key[1].startsWith("snapshot-v2-date:")) rows.set(key[1], row);
  }
  return rows;
}
function windowProof(name, row, scope) {
  const value = row?.value, coverage = value?.coverage;
  if (!valid(row, scope) || value.partial !== true || !Array.isArray(value.index.entities) || value.index.snapshot_format !== "haoduoyu-workbench-snapshot-v2" || value.index.projection !== "current" || value.index.timezone !== "Asia/Shanghai" || !hash(value.index.manifest_hash) || !hash(value.index.global_content_hash) || !Number.isFinite(value.verified_at) || value.verified_at < 0 || !coverage || Object.keys(coverage).sort().join(",") !== "from,to" || !day(coverage.from) || !day(coverage.to) || coverage.from > coverage.to) return false;
  if (name === "snapshot-v2-window")
    return (Date.parse(coverage.to) - Date.parse(coverage.from)) / 864e5 < 60;
  return name === "snapshot-v2-date:" + coverage.from && coverage.from === coverage.to;
}
function limitedProof(row, date2) {
  return { ...row, value: {
    ...row.value,
    partial: true,
    limited: true,
    ...row.value.coverage ? {} : { coverage: { from: date2, to: date2 } }
  } };
}
function legacyProof(rows, scope, date2) {
  const complete = latest(legacyNames.slice(0, 2).map((name) => rows.get(name)).filter((row) => valid(row, scope)));
  const partial = latest(legacyNames.slice(2).map((name) => rows.get(name)).filter((row) => valid(row, scope) && row.value.partial === true));
  if (partial && (partial.value.verified_at || 0) >= (complete?.value?.verified_at || 0))
    return date2 && partial.value.covered_dates?.includes(date2) ? partial : null;
  return complete;
}
async function latestCompleteSnapshot(tx, scope, date2) {
  const rows = await snapshotEvidence(tx, scope);
  const limited = [...rows.keys()].some((name) => !legacyNames.includes(name));
  if (!limited) return legacyProof(rows, scope, date2);
  if (!day(date2)) return null;
  const candidates = [];
  for (const [name, row] of rows) {
    if (windowProof(name, row, scope)) {
      if (date2 >= row.value.coverage.from && date2 <= row.value.coverage.to) candidates.push(limitedProof(row, date2));
    } else if ((legacyNames.includes(name) || name.endsWith("-archive")) && valid(row, scope) && Array.isArray(row.value.index.entities) && Number.isFinite(row.value.verified_at) && hash(row.value.index.manifest_hash) && hash(row.value.index.global_content_hash) && (!name.includes("progress") && row.value.partial !== true || row.value.covered_dates?.includes(date2)))
      candidates.push(limitedProof(row, date2));
  }
  return latest(candidates);
}
async function latestGlobalSnapshot(tx, scope) {
  const rows = await snapshotEvidence(tx, scope);
  const candidates = [...rows].filter(([name, row]) => windowProof(name, row, scope) && hash(row.value.index.global_content_hash)).map(([, row]) => ({ ...row, value: { ...row.value, partial: true, limited: true, global_complete: true } }));
  if (candidates.length) return latest(candidates);
  const full = [...rows.keys()].every((name) => legacyNames.includes(name)) ? legacyProof(rows, scope) : null;
  return full?.value?.index?.snapshot_format === "haoduoyu-workbench-snapshot-v2" && Array.isArray(full.value.index.entities) && hash(full.value.index.global_content_hash) ? full : null;
}
function snapshotExcludesEntity(snapshot, row) {
  const marker = row?.window_exclusion, value = snapshot?.value;
  return Boolean(value?.index && marker && row.server && !row.dirty && hash(marker.manifest_hash) && marker.manifest_hash === value.index.manifest_hash && marker.version === row.server.version && marker.updated_at === row.server.updated_at && marker.date === row.server.date && marker.snapshot_hash === (row.snapshot_hash ?? null));
}
function matchesSnapshotEntity(expected, row, date2) {
  const server = row?.server, actualDate = server?.entity_type === "unscheduled_todo" ? null : server?.date;
  return Boolean(expected && server && !row.remote_missing && expected.date === date2 && actualDate === date2 && hash(expected.content_hash) && row.snapshot_hash === expected.content_hash && server.content_hash === expected.content_hash && server.entity_id === row.entity_id && server.updated_at === expected.updated_at && server.deleted_at === expected.deleted_at);
}
function snapshotHasUnverifiedRows(snapshot, rows, date2) {
  if (!snapshot?.value?.limited) return false;
  const expected = new Set(snapshot.value.index.entities.map((row) => row.entity_id));
  return rows.some((row) => !row.dirty && !row.remote_missing && row.server && (row.server.entity_type === "unscheduled_todo" ? null : row.server.date) === date2 && !expected.has(row.entity_id) && !snapshotExcludesEntity(snapshot, row));
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
    const snapshot = await latestCompleteSnapshot(tx, scope, route2.kind === "reminders" ? route2.date : void 0), index = snapshot?.value?.index;
    if (index?.complete !== true || index.scope_id !== scope) throw missing();
    const expectedById = new Map(index.entities.map((row) => [row.entity_id, row]));
    const available = (await tx.getAll("entities")).filter((row) => row.scope === scope && matches(row, route2));
    if (snapshotHasUnverifiedRows(snapshot, available, route2.date)) throw missing();
    const rows = available.filter((row) => !snapshot.value.partial || row.dirty || matchesSnapshotEntity(expectedById.get(row.entity_id), row, route2.date) && !expectedById.get(row.entity_id)?.deleted_at);
    for (const expected of index.entities.filter((row) => matches(row, route2) && !row.deleted_at && (route2.kind !== "reminders" || row.date === route2.date))) {
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
var day, missing, hash, legacyNames, valid, latest;
var init_read_only = __esm({
  "web/offline/read-only.mjs"() {
    day = (value) => typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
    missing = () => Object.assign(new Error("此内容尚未完整缓存在本机，请联网读取。"), { code: "OFFLINE_CACHE_MISS" });
    hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
    legacyNames = ["snapshot", "snapshot-v2", "snapshot-progress", "snapshot-v2-progress"];
    valid = (row, scope) => row?.value?.index?.complete === true && row.value.index.scope_id === scope;
    latest = (rows) => rows.sort((a, b) => (b.value.verified_at || 0) - (a.value.verified_at || 0))[0] || null;
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
function projectEntity(entity, capability, operations, conflicts) {
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
  const pending = operations.filter((row) => row.entity_id === entity.entity_id && liveOperation(row)).sort((a, b) => a.seq - b.seq).at(-1);
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
  const load2 = (tx, scope) => Promise.all(["entities", "outbox", "conflicts"].map((store) => tx.getAll(store))).then((rows) => Object.fromEntries(["entities", "outbox", "conflicts"].map((name, index) => [name, rows[index].filter((row) => row.scope === scope)])));
  const capabilityKey = (scope) => entityKey(scope, "capability:note-entry");
  return { db, capture, load: load2, capabilityKey, now, labelsV1 };
}
function readingMethods(context) {
  const { db, capture, load: load2, capabilityKey } = context;
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
      const rows = await load2(tx, owner2.scope), cap = await tx.get("meta", capabilityKey(owner2.scope));
      const capability2 = cap?.scope === owner2.scope ? cap.can_edit : null;
      const cached = await tx.get("meta", entityKey(owner2.scope, "get:" + path));
      const evidence2 = await latestCompleteSnapshot(tx, owner2.scope, route2.date);
      const snapshot = evidence2?.value?.partial && cached?.saved_at >= evidence2.value.verified_at ? null : evidence2;
      const complete = snapshot?.value?.index?.complete === true && snapshot.value.index.scope_id === owner2.scope;
      const expectedById = new Map(snapshot?.value?.index?.entities?.map((row) => [row.entity_id, row]) || []);
      if (route2.kind === "note_entries" && snapshotHasUnverifiedRows(snapshot, rows.entities.filter((row) => inRoute(row, route2)), route2.date))
        throw missing2();
      const entities = rows.entities.filter((row) => inRoute(row, route2) && (row.dirty || !row.remote_missing && row.server) && (!snapshot?.value?.partial || row.dirty || matchesSnapshotEntity(expectedById.get(row.entity_id), row, route2.date) && !expectedById.get(row.entity_id)?.deleted_at));
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
          remote_missing: false,
          snapshot_hash: null,
          window_exclusion: null
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
function createNotesCache(options3) {
  const context = notesContext(options3);
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
  const fields4 = ["id", "name", "platform", "active", "account_name", "position", "created_at", "updated_at"];
  return value.map((row) => Object.fromEntries(fields4.filter((key) => row[key] !== void 0).map((key) => [key, row[key]])));
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
      const identity5 = safeIdentity(me);
      await db.transaction(["meta"], "readwrite", (tx) => tx.put("meta", { key, identity: identity5, scope, verified_at: now() }));
      return identity5;
    },
    forgetIdentity: () => db.transaction(["meta"], "readwrite", (tx) => tx.delete("meta", key))
  };
}
async function legacySnapshot(db, owner2, route2) {
  return db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const snapshot = await latestCompleteSnapshot(tx, owner2, route2.date);
    if (snapshot?.value?.index?.complete !== true || snapshot.value.index.scope_id !== owner2) throw missing3();
    const entity = await tx.get("entities", entityKey(owner2, "legacy-" + route2.category + ":" + route2.date));
    const represented = snapshot.value.index.entities?.find((value) => value.entity_id === "legacy-" + route2.category + ":" + route2.date);
    if (snapshotHasUnverifiedRows(snapshot, entity ? [entity] : [], route2.date)) throw missing3();
    const row = !entity?.remote_missing && (!snapshot.value.partial || matchesSnapshotEntity(represented, entity, route2.date)) && entity?.server;
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
async function todoSnapshot(db, owner2, route2, now) {
  return db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const snapshot = await latestCompleteSnapshot(tx, owner2, route2.date), index = snapshot?.value?.index;
    if (!index) throw missing3();
    const rows = (await tx.getAll("entities")).filter((row) => row.scope === owner2), byId = new Map(rows.map((row) => [row.entity_id, row]));
    if (snapshotHasUnverifiedRows(snapshot, rows.filter((row) => row.entity_id.startsWith("todo:")), route2.date)) throw missing3();
    const items = index.entities.filter((row) => row.entity_type === "todo" && row.date === route2.date && !row.deleted_at).map((expected) => {
      const entity = byId.get(expected.entity_id);
      if (!entity?.server || entity.remote_missing || entity.snapshot_hash !== expected.content_hash || entity.server.date !== route2.date || entity.server.deleted_at || snapshot.value.partial && !matchesSnapshotEntity(expected, entity, route2.date)) throw missing3();
      return { ...entity.server, id: entity.server.id || entity.server.source_id, completed: Boolean(entity.server.completed) };
    });
    const data3 = {
      date: route2.date,
      today: new Date(now() + 8 * 36e5).toISOString().slice(0, 10),
      completed_mode: "strike",
      preferences_version: 0,
      items,
      snapshot_complete: true
    };
    return { data: overlay(data3, route2, rows, true), saved_at: snapshot.value.verified_at || null };
  });
}
async function undatedSnapshot(db, owner2, route2) {
  return db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const snapshot = await latestGlobalSnapshot(tx, owner2), index = snapshot?.value?.index;
    if (!index) throw missing3();
    const rows = (await tx.getAll("entities")).filter((row) => row.scope === owner2 && row.entity_id.startsWith("unscheduled_todo:"));
    if (snapshotHasUnverifiedRows(snapshot, rows, null)) throw missing3();
    const byId = new Map(rows.map((row) => [row.entity_id, row]));
    const items = index.entities.filter((row) => row.entity_type === "unscheduled_todo" && row.date === null && !row.deleted_at).map((expected) => {
      const entity = byId.get(expected.entity_id);
      if (!matchesSnapshotEntity(expected, entity, null)) throw missing3();
      return { ...entity.server, id: entity.server.id || entity.server.source_id, completed: Boolean(entity.server.completed) };
    });
    return { data: overlay({ items, snapshot_complete: true }, route2, rows, true), saved_at: snapshot.value.verified_at || null };
  });
}
async function availableSnapshot(db, owner2, route2, now) {
  try {
    if (route2.kind === "legacy") return await legacySnapshot(db, owner2, route2);
    if (route2.kind === "todo") return await todoSnapshot(db, owner2, route2, now);
    if (route2.kind === "unscheduled_todo") return await undatedSnapshot(db, owner2, route2);
    return null;
  } catch (error2) {
    if (error2.code !== "OFFLINE_CACHE_MISS") throw error2;
    return null;
  }
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
          snapshot_hash: null,
          window_exclusion: null,
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
      } catch (error2) {
        if (error2.code !== "OFFLINE_CACHE_MISS" || !cached) throw error2;
      }
    }
    const saved = await availableSnapshot(db, owner2, route2, now);
    if (saved && (!cached || !Number.isFinite(cached.saved_at) || saved.saved_at >= cached.saved_at)) {
      if (scope() !== owner2 || getGeneration() !== generation) throw missing3();
      return saved;
    }
    if (!cached || cached.data === void 0) {
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
    const result = route2.kind === "legacy" ? { ...clone(cached.data), can_edit: false } : route2.kind === "dates" ? { ...clone(cached.data), snapshot_complete: false, offline_partial: true } : overlay(clone(cached.data), route2, await entities(owner2), false);
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
async function finishParents(tx, conflict, time3) {
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
    await tx.put("conflicts", { ...parent, resolved_at: time3, resolution: {
      ...parent.resolution,
      completed_children: completed,
      state: "superseded",
      completed_by: conflict.key,
      completed_at: time3
    } });
    completedChild = parent.key;
    key = parent.resolution_parent;
  }
}
async function recordResolutionAck(tx, operation2, remote, time3) {
  if (!operation2.resolution_id) return;
  const conflict = resolutionParent(await tx.getAll("conflicts"), operation2);
  if ((operation2.protocol === 3 || operation2.protocol === 5) && (!conflict || conflict.key !== operation2.origin_conflict || conflict.resolved_at !== null || !conflict.resolution.operation_keys.includes(operation2.key)))
    throw Object.assign(new Error("本机选择凭据不完整，未确认此次保存。"), { code: "OFFLINE_DECISION_EVIDENCE_MISSING" });
  if (!conflict || conflict.resolved_at !== null || !conflict.resolution.operation_keys.includes(operation2.key)) return;
  const resolution = conflict.resolution;
  const acknowledgements = [
    ...(resolution.acknowledgements || []).filter((row) => row.operation_key !== operation2.key),
    { operation_key: operation2.key, save_id: operation2.save_id, remote, acknowledged_at: time3 }
  ];
  const waiting = await outstandingResolution(tx, conflict, acknowledgements);
  const allAcknowledged = resolution.operation_keys.every((key) => acknowledgements.some((row) => row.operation_key === key));
  const hasCompletedChildren = Boolean(resolution.completed_children?.length);
  const complete = !waiting.pending && !waiting.conflicts && (allAcknowledged || hasCompletedChildren);
  const next = { ...conflict, resolved_at: complete ? time3 : null, resolution: {
    ...resolution,
    acknowledgements,
    state: complete ? hasCompletedChildren ? "superseded" : "synced" : waiting.conflicts || hasCompletedChildren ? "conflict" : "queued",
    ...complete ? { completed_at: time3 } : {}
  } };
  await tx.put("conflicts", next);
  if (complete) await finishParents(tx, next, time3);
}
async function recordResolutionConflict(tx, operation2, child) {
  if (!operation2.resolution_id) return child;
  const parent = resolutionParent(await tx.getAll("conflicts"), operation2);
  if (!parent || parent.resolved_at !== null) return child;
  const keys = [.../* @__PURE__ */ new Set([...parent.resolution.conflict_keys || [], child.key])];
  await tx.put("conflicts", { ...parent, resolution: { ...parent.resolution, state: "conflict", conflict_keys: keys } });
  return { ...child, resolution_parent: parent.key };
}
async function recordResolutionFailure(tx, operation2, fields4) {
  if (!operation2.resolution_id) return;
  const conflict = resolutionParent(await tx.getAll("conflicts"), operation2);
  if (!conflict || conflict.resolved_at !== null) return;
  const waiting = await outstandingResolution(tx, conflict, conflict.resolution.acknowledgements || []);
  const state2 = waiting.conflicts || conflict.resolution.completed_children?.length ? "conflict" : fields4.status === "blocked" ? "blocked" : fields4.status === "paused" ? "paused" : "queued";
  await tx.put("conflicts", { ...conflict, resolution: {
    ...conflict.resolution,
    state: state2,
    last_error: fields4.error || null
  } });
}
async function finishServerResolution(tx, conflict, time3) {
  if (conflict.resolution?.state === "accepted-server") await finishParents(tx, conflict, time3);
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
  const list3 = (scope) => db.transaction(["conflicts"], "readonly", async (tx) => (await tx.getAll("conflicts")).filter((value) => value.scope === scope && value.resolved_at === null));
  return { record, list: list3 };
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
  const stamp4 = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(stamp4) || new Date(stamp4).toISOString().slice(0, 10) !== value) invalid();
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
function contextFor({ conflict, remote, choice, uuid: uuid5 }) {
  const type = conflict?.operation?.entity_type, scope = conflict?.scope, prefix = prefixes[type];
  if (!prefix || !["use-server", "use-local", "keep-both"].includes(choice) || typeof scope !== "string" || !scope) invalid();
  const entity = conflict.entity_id, pattern = ["todo", "template", "unscheduled_todo"].includes(type) ? clientIdPattern : uuidPattern3;
  if (typeof entity !== "string" || !entity.startsWith(prefix) || !pattern.test(entity.slice(prefix.length)) || conflict.operation.scope !== void 0 && conflict.operation.scope !== scope || conflict.operation.entity_id !== void 0 && conflict.operation.entity_id !== entity) invalid();
  const id2 = entity.slice(prefix.length).toLowerCase(), local = conflict.local;
  if (local?.id !== void 0 && local.id.toLowerCase?.() !== id2 || conflict.operation.source_id !== void 0 && conflict.operation.source_id.toLowerCase?.() !== id2) invalid();
  if (remote && (typeof remote !== "object" || remote.id?.toLowerCase?.() !== id2 || !revision(remote.version))) invalid();
  const used = /* @__PURE__ */ new Set([id2, conflict.operation.save_id?.toLowerCase?.(), local?.group_id?.toLowerCase?.()]);
  const fresh = () => {
    const value = uuid5();
    if (typeof value !== "string" || !pattern.test(value) || used.has(value.toLowerCase())) invalid();
    used.add(value.toLowerCase());
    return value.toLowerCase();
  };
  const reserve = (values) => {
    for (const value of values) if (typeof value === "string") used.add(value.toLowerCase());
  };
  return { type, scope, id: id2, local, remote, choice, fresh, reserve };
}
function operation(context, id2, method2, path, body4, value, base = null, deleted2 = false) {
  const local = { ...value, id: id2, version: (body4.version || 0) + 1, can_edit: true, deleted: deleted2, deleted_at: null };
  return {
    scope: context.scope,
    entity_type: context.type,
    entity_id: id2,
    method: method2,
    path,
    body: body4,
    base: base ? structuredClone(base) : null,
    local
  };
}
function copyResult(context, id2, operations) {
  return {
    mode: "copy",
    target_id: id2,
    operations,
    explanation: removed2(context.local) ? "将删除前的本机内容另存为新记录，原记录保持原状。" : "将本机内容另存为新记录，原记录保持原状。"
  };
}
function todoPlan(context, value) {
  const { id: id2, remote, local, choice, fresh } = context, path = "/todos/" + id2;
  if (choice === "use-local" && remote && !removed2(remote) && remote.date === value.date && remote.text === value.text) {
    const method2 = removed2(local) ? "DELETE" : "PATCH";
    const body4 = method2 === "DELETE" ? { date: value.date, version: remote.version } : { completed: value.completed, version: remote.version };
    return {
      mode: "replace",
      target_id: id2,
      operations: [operation(context, id2, method2, path, body4, value, remote, method2 === "DELETE")]
    };
  }
  const target = fresh(), created = { ...value, completed: false };
  const operations = [operation(context, target, "POST", "/todos", { id: target, date: value.date, text: value.text }, created)];
  if (value.completed) operations.push(operation(context, target, "PATCH", "/todos/" + target, { completed: true, version: 1 }, value));
  return copyResult(context, target, operations);
}
function undatedPlan(context, value) {
  const { id: id2, remote, local, choice, fresh } = context, path = "/unscheduled-todos/" + id2;
  if (choice === "use-local" && remote && !removed2(remote) && remote.text === value.text) {
    const method2 = removed2(local) ? "DELETE" : "PATCH";
    const body4 = method2 === "DELETE" ? { version: remote.version } : { completed: value.completed, version: remote.version };
    return { mode: "replace", target_id: id2, operations: [operation(context, id2, method2, path, body4, value, remote, method2 === "DELETE")] };
  }
  const target = fresh(), created = { ...value, completed: false };
  const operations = [operation(context, target, "POST", "/unscheduled-todos", { id: target, text: value.text }, created)];
  if (value.completed) operations.push(operation(context, target, "PATCH", "/unscheduled-todos/" + target, { completed: true, version: 1 }, value));
  return copyResult(context, target, operations);
}
function templatePlan(context, value) {
  const { id: id2, remote, local, choice, fresh } = context;
  if (choice === "use-local" && remote && !removed2(remote)) {
    const method2 = removed2(local) ? "DELETE" : "PATCH", body4 = { version: remote.version };
    if (method2 === "PATCH") body4.text = value.text;
    return { mode: "replace", target_id: id2, operations: [
      operation(context, id2, method2, "/todo-templates/" + id2, body4, value, remote, method2 === "DELETE")
    ] };
  }
  const target = fresh();
  return copyResult(context, target, [operation(context, target, "POST", "/todo-templates", { id: target, text: value.text }, value)]);
}
function notePlan(context, value) {
  const { id: id2, remote, local, choice, fresh } = context;
  if (choice === "use-local" && remote && !removed2(remote) && remote.category === value.category && remote.date === value.date && (local.labels_version !== 1 || remote.labels_version === 1 && remote.label === (value.label ?? null))) {
    const method2 = removed2(local) ? "DELETE" : "PUT", body5 = { version: remote.version, save_id: fresh() };
    if (method2 === "PUT") {
      const { label, ...fields4 } = value;
      Object.assign(body5, fields4);
    }
    return { mode: "replace", target_id: id2, operations: [
      operation(context, id2, method2, "/note-entries/" + id2, body5, value, remote, method2 === "DELETE")
    ] };
  }
  const target = fresh(), body4 = { ...value, version: 0, save_id: fresh() };
  return copyResult(context, target, [operation(context, target, "PUT", "/note-entries/" + target, body4, value)]);
}
function liveMemoGroup(group) {
  return group && uuidPattern3.test(group.id) && revision(group.version) && group.deleted_at === null && !group.deleted && (group.position === void 0 || Number.isSafeInteger(group.position) && group.position >= 0 && group.position <= 1e6);
}
function memoOperation(context, id2, body4, value, base = null) {
  const kind = context.type === "memo_note" ? "notes" : "groups";
  const result = operation(context, id2, "PUT", "/memos/" + kind + "/" + id2, body4, value, base);
  if (context.type === "memo_note") Object.assign(result, { protocol: 2, depends_on: ["memo-group:" + body4.group_id] });
  return result;
}
function memoParentCopy(context, value, groups) {
  const live3 = groups.filter(liveMemoGroup).sort((a, b) => (a.position || 0) - (b.position || 0) || a.id.localeCompare(b.id));
  const operations = [];
  let parent = live3[0]?.id.toLowerCase();
  if (!parent) {
    parent = context.fresh();
    const groupValue = { title: "本机冲突副本", position: 0 };
    const groupBody = { ...groupValue, version: 0, save_id: context.fresh() };
    operations.push(memoOperation({ ...context, type: "memo_group" }, parent, groupBody, groupValue));
  }
  const target = context.fresh(), local = { ...value, group_id: parent };
  const body4 = { ...local, version: 0, save_id: context.fresh() };
  operations.push(memoOperation(context, target, body4, local));
  return {
    ...copyResult(context, target, operations),
    explanation: "原笔记所在位置已不可用，将本机正文另存为新笔记，原内容保留。"
  };
}
function memoPlan(context, value, groups) {
  const { id: id2, remote, local, choice, fresh, type } = context;
  if (removed2(local)) return {
    mode: "blocked",
    operations: [],
    target_id: id2,
    explanation: "本机保留的是删除意图；备忘录删除需联网确认，原文与冲突仍保留。"
  };
  if (type === "memo_note" && !groups.some((group) => group?.id === value.group_id && liveMemoGroup(group)))
    return memoParentCopy(context, value, groups);
  const replace = choice === "use-local" && remote && !removed2(remote) && (type !== "memo_note" || remote.group_id === value.group_id);
  const target = replace ? id2 : fresh(), body4 = { ...value, version: replace ? remote.version : 0, save_id: fresh() };
  const operations = [memoOperation(context, target, body4, value, replace ? remote : null)];
  return replace ? { mode: "replace", target_id: target, operations } : copyResult(context, target, operations);
}
function planConflictResolution({ conflict, remote = null, choice, groups = [], uuid: uuid5 = () => crypto.randomUUID() }) {
  const context = contextFor({ conflict, remote, choice, uuid: uuid5 });
  if (choice === "use-server") return { mode: "server", target_id: context.id, operations: [] };
  if (choice === "use-local" && removed2(context.local) && (!remote || removed2(remote)))
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
  const fields4 = type === "todo" ? ["date", "text", "completed"] : type === "unscheduled_todo" ? ["text", "completed"] : type === "template" ? ["text"] : type === "note_entry" ? ["category", "date", "text", "labels_version", "label"] : type === "memo_note" ? ["group_id", "title", "body", "position"] : ["title", "position"];
  return {
    id: value.id || value.source_id,
    version: value.version,
    deleted: Boolean(value.deleted || value.deleted_at),
    ...Object.fromEntries(fields4.filter((key) => own(value, key)).map((key) => [key, value[key]]))
  };
}
function branchState(conflict, entity, operations, drafts) {
  return stable({ conflict, entity, operations, drafts });
}
async function storedState(tx, scope, key) {
  const conflict = await tx.get("conflicts", key);
  if (!conflict || conflict.scope !== scope) throw failure("冲突不属于当前身份。", "OFFLINE_SCOPE_CHANGED");
  const entity = await tx.get("entities", entityKey(scope, conflict.entity_id));
  const operations = (await tx.getAll("outbox")).filter((row) => row.scope === scope && row.entity_id === conflict.entity_id && live(row)).sort((a, b) => a.seq - b.seq);
  const id2 = conflict.operation.source_id;
  const drafts = (await tx.getAll("meta")).filter((row) => row.scope === scope && row.draft_kind && row.data?.id === id2);
  return { conflict, entity, operations, drafts, signature: branchState(conflict, entity, operations, drafts) };
}
function checkSelection(captured, expected, canDispatch) {
  const { conflict, entity, operations } = captured;
  if (conflict.resolved_at !== null || conflict.resolution) return;
  if (expected !== void 0 && expected !== conflictDecisionToken(conflict)) throw failure("比较内容已变化，请重新核对。");
  if (!canDispatch(conflict.operation) || operations.some((row) => !canDispatch(row)))
    throw failure("此本机操作需新版页面处理，原内容已保留。", "OFFLINE_UPGRADE_REQUIRED");
  if (!entity || entity.conflict !== conflict.key || !operations.some((row) => row.key === conflict.operation.key))
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
      const latest2 = await storedState(tx, scope, captured.conflict.key);
      if (latest2.conflict.resolved_at !== null || latest2.conflict.resolution) return { ...latest2.conflict, already_resolved: true };
      if (latest2.signature !== captured.signature) throw failure("本机内容刚有变化，原文已保留，请重新核对。");
      const result = await callback(tx, latest2);
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
  async function commit(captured, scope, active5, choice, prepared, plan) {
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
      const stamp4 = new Date(now()).toISOString();
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
          created_at: input.base?.created_at || stamp4,
          updated_at: stamp4
        }
      }));
      const saved = await append(tx, inputs, { assertActive: active5 });
      const resolution = {
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
        choice,
        needs_recompare: false,
        needs_followup: false,
        resolved_at: saved.length ? null : now(),
        original_operation: conflict.original_operation || conflict.operation,
        operation: operation2,
        resolution,
        resolution_remote: prepared.remote,
        resolution_message: plan.explanation || ""
      };
      await tx.put("conflicts", result);
      await finishServerResolution(tx, result, now());
      return result;
    });
  }
  async function resolve(key, choice, { scope = getScope(), assertActive = () => {
  }, expected, copyConfirmed = false } = {}) {
    if (!["use-server", "use-local", "keep-both"].includes(choice)) throw new TypeError("Unknown conflict choice");
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
    const plan = planConflictResolution({ conflict: selected, remote: prepared.remote, choice, groups: prepared.groups || [], uuid: uuid5 });
    if (plan.mode === "blocked") return { ...captured.conflict, blocked: true, resolution_message: plan.explanation };
    if (choice === "use-local" && plan.mode === "copy" && !copyConfirmed)
      return review(captured, scope, active5, prepared.remote, plan.explanation + "请明确选择另存本地副本。", { copy_required: true });
    active5();
    return commit(captured, scope, active5, choice, prepared, plan);
  }
  return { resolve };
}
async function rememberParents(tx, scope, groups, operations) {
  for (const input of operations.filter((row) => row.entity_type === "memo_note")) {
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
  const fields4 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at", "group_id"];
  if (!metadata2 || fields4.some((key) => metadata2[key] !== row[key])) invalid2();
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
function dispatchCapabilities(options3) {
  const types2 = new Set(options3.enabledTypes || Object.keys(prefixes3));
  const protocols = new Set(options3.supportedProtocols || [1, 2, 3]);
  const memoDependencies = (operation2) => options3.supportedDependencies === true && operation2.entity_type === "memo_note" && operation2.method === "PUT" && uuidPattern4.test(operation2.body?.group_id) && Array.isArray(operation2.depends_on) && operation2.depends_on.length === 1 && operation2.depends_on[0] === "memo-group:" + operation2.body.group_id;
  const decision = (operation2) => {
    let origin;
    try {
      origin = JSON.parse(operation2.origin_conflict);
    } catch {
      return false;
    }
    return options3.resolutionReceipts !== false && uuidPattern4.test(operation2.resolution_id) && operation2.resolution_receipt === 1 && Array.isArray(origin) && origin.length === 2 && origin[0] === operation2.scope && typeof origin[1] === "string" && origin[1].startsWith("conflict:") && (!Object.hasOwn(operation2, "depends_on") || memoDependencies(operation2));
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
function operationFor(input, uuid5, time3) {
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
  const body4 = structuredClone(input.body || {});
  if (typeof body4.text === "string") {
    body4.text = ["todo", "template", "unscheduled_todo"].includes(type) ? body4.text.trim() : body4.text.replace(/\r\n?/g, "\n");
  }
  if (typeof body4.title === "string") body4.title = body4.title.trim();
  if (typeof body4.body === "string") body4.body = body4.body.replace(/\r\n?/g, "\n");
  if (create) {
    if (body4.id && body4.id.toLowerCase() !== id2) throw new TypeError("Client UUID cannot change");
    body4.id = id2;
  }
  const expected = create ? 0 : body4.version;
  if (!Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER) {
    throw new TypeError("Offline mutation requires an expected version");
  }
  const saveId = body4.save_id || uuid5();
  if (!uuidPattern4.test(saveId)) throw new TypeError("Offline save_id requires a UUID");
  if (!["todo", "template", "unscheduled_todo"].includes(type)) body4.save_id = saveId.toLowerCase();
  else delete body4.save_id;
  const operation2 = {
    id: uuid5(),
    scope: input.scope,
    entity_type: type,
    entity_id,
    source_id: id2,
    protocol: input.protocol === void 0 ? 1 : input.protocol,
    method: method2,
    path,
    body: body4,
    expected_version: expected,
    save_id: saveId.toLowerCase(),
    created_at: time3,
    attempts: 0,
    next_attempt_at: 0,
    status: initialStatus,
    base: input.base || null,
    local: { ...structuredClone(input.local || body4), id: id2, version: expected + 1 },
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
  const canonical4 = (node3) => Array.isArray(node3) ? node3.map(canonical4) : node3 && typeof node3 === "object" ? Object.fromEntries(Object.keys(node3).sort().map((key) => [key, canonical4(node3[key])])) : node3;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical4(value)));
  const hash2 = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash2)].map((value2) => value2.toString(16).padStart(2, "0")).join("");
}
async function memoHash(row, kind) {
  const fields4 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at"];
  if (kind === "memo_note") fields4.push("group_id", "body");
  return digest(Object.fromEntries(fields4.map((field2) => [field2, row[field2]])));
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
  const fields4 = operation2.entity_type === "todo" ? deleted(remote) ? ["date"] : ["date", "text"] : operation2.entity_type === "unscheduled_todo" ? ["text"] : [];
  return fields4.every((key) => base[key] === void 0 || remote[key] === base[key]);
}
function completeNoteRow(remote) {
  const time3 = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
  return remote && uuidPattern4.test(remote.id) && ["life", "work"].includes(remote.category) && /^\d{4}-\d{2}-\d{2}$/.test(remote.date) && typeof remote.text === "string" && typeof remote.deleted === "boolean" && remote.can_edit === true && /^[a-f0-9]{64}$/.test(remote.content_hash) && Number.isSafeInteger(remote.change_seq) && remote.change_seq >= 0 && time3(remote.created_at) && time3(remote.updated_at) && (remote.deleted_at === null || time3(remote.deleted_at)) && remote.deleted === (remote.deleted_at !== null);
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
function createContext(options3) {
  const { db, request: request2, getScope, now = Date.now, uuid: uuid5 = () => crypto.randomUUID(), timeout = 2e4 } = options3;
  const owner2 = uuid5();
  const state2 = { phase: "idle", pending: 0, unsupported: 0, error: null };
  const { canDispatch, requireDispatch } = dispatchCapabilities(options3);
  const conflicts = createConflictStore({ db, now, canDispatch });
  const leaseKey = (scope) => entityKey(scope, "outbox-lease");
  const rateLimitKey = (scope) => entityKey(scope, "outbox-rate-limit");
  const checkScope = (scope) => {
    if (getScope() !== scope) throw Object.assign(new Error("Offline identity changed"), { code: "OFFLINE_SCOPE_CHANGED" });
  };
  const list3 = (scope) => db.transaction(["outbox"], "readonly", async (tx) => ordered((await tx.getAll("outbox")).filter((value) => value.scope === scope && active2(value))));
  const cooldown = async (scope) => {
    checkScope(scope);
    const item = await db.transaction(["meta"], "readonly", (tx) => tx.get("meta", rateLimitKey(scope)));
    checkScope(scope);
    return storedPause(item?.until, now());
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
      const kept = storedPause(old?.until, now());
      const value = Math.max(kept, Math.min(until, now() + STORED_COOLDOWN_MAX_MS));
      await tx.put("meta", { key, until: value });
      checkScope(scope);
      assertActive();
      return value;
    });
  };
  const retryable = (scope) => retryableOperations({ db, list: list3, canDispatch }, scope);
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
      const result = await Promise.race([request2(path, { ...opts, signal: controller.signal }), expired]);
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
    list: list3,
    lease,
    network,
    readNetwork,
    canDispatch,
    requireDispatch,
    retryable
  };
}
async function retryableOperations({ db, list: list3, canDispatch }, scope) {
  const rows = await list3(scope), first = /* @__PURE__ */ new Map(), ready = [];
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
  async function update(operation2, fields4, { rateLimitedUntil } = {}) {
    if (!context.canDispatch(operation2)) return null;
    return db.transaction(["outbox", "meta", "conflicts"], "readwrite", async (tx) => {
      const current3 = await tx.get("outbox", operation2.key);
      const held = await tx.get("meta", context.leaseKey(operation2.scope));
      if (!context.canDispatch(current3) || held?.owner !== owner2 || !["queued", "unknown", "sending"].includes(current3.status)) return null;
      if (!Object.hasOwn(fields4, "claim_owner") && current3.claim_owner !== owner2) return null;
      const result = { ...current3, ...fields4 };
      await tx.put("outbox", result);
      if (Number.isSafeInteger(rateLimitedUntil)) {
        const key = context.rateLimitKey(operation2.scope), old = await tx.get("meta", key);
        await tx.put("meta", { key, until: Math.max(Number.isSafeInteger(old?.until) ? old.until : 0, rateLimitedUntil) });
      }
      if (fields4.status) await recordResolutionFailure(tx, result, fields4);
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
      } catch (error2) {
        if (error2.status === 404) return null;
        throw error2;
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
    const day9 = operation2.body.date || operation2.base?.date || operation2.local.date;
    const snapshot = await network(scope, "/workbench-snapshot?window=date&date=" + day9 + "&version=2");
    const head = snapshot?.batch_format === "haoduoyu-workbench-window-v1" ? snapshot.index : snapshot;
    if (head?.complete !== true || head.scope_id !== scope || !Array.isArray(snapshot.data?.todos) || snapshot.coverage && (snapshot.coverage.from !== day9 || snapshot.coverage.to !== day9)) {
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
      const hash2 = note ? remote?.content_hash : remote && await memoHash(remote, operation2.entity_type);
      const expectedHash = note ? receipt.content_hash : receipt.entity_hash;
      const kind = operation2.entity_type === "memo_note" ? "notes" : "groups";
      if (receipt.id === operation2.source_id && receipt.version === operation2.expected_version + 1 && (operation2.protocol !== 5 || Object.hasOwn(receipt, "label") && receipt.label === operation2.local?.label && remote?.labels_version === 1 && remote.label === receipt.label) && (note || receipt.kind === kind) && remote?.can_edit === true && remote.version === receipt.version && hash2 === expectedHash && desired(operation2, remote)) {
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
  async function fail6(operation2, error2) {
    if ([409, 410, 404].includes(error2.status)) {
      const current3 = await context.db.transaction(["outbox"], "readonly", (tx) => tx.get("outbox", operation2.key));
      if (!context.canDispatch(current3)) return;
      let remote = null;
      try {
        remote = await readRemote(operation2);
      } catch (readError) {
        if (readError.status === 429) return fail6(operation2, readError);
      }
      return conflicts.record({ operation: operation2, remote, reason: deleted(remote) ? "deleted" : error2.code || "version" });
    }
    const attempts = operation2.attempts + 1;
    const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
    const status = [401, 403].includes(error2.status) ? "paused" : error2.status && error2.status < 500 && error2.status !== 429 ? "blocked" : "unknown";
    const next = error2.status === 429 ? retryUntil(now(), Math.max(delay, retryAfterDelay(error2.retryAfterMs))) : now() + delay;
    if (error2.status === 429) {
      if (context.rateLimitScope !== operation2.scope) context.rateLimitedUntil = 0;
      context.rateLimitScope = operation2.scope;
      context.rateLimitedUntil = Math.max(context.rateLimitedUntil || 0, next);
    }
    return update(operation2, {
      status,
      attempts,
      next_attempt_at: next,
      error: error2.code || "OFFLINE_UNKNOWN"
    }, error2.status === 429 ? { rateLimitedUntil: next } : {});
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
        const checked4 = await reconcile(claimed);
        if (checked4.result === "ack") return await acknowledge(claimed, checked4.remote);
        if (checked4.result === "conflict") return conflicts.record({
          operation: claimed,
          remote: checked4.remote,
          reason: deleted(checked4.remote) ? "deleted" : "version"
        });
      }
      const sending = await update(claimed, { status: "sending" });
      if (!sending) return;
      const remote = await network(operation2.scope, operation2.path, { method: operation2.method, body: operation2.body });
      if (!validAcknowledgement(operation2, remote)) throw new Error("Invalid offline write acknowledgement");
      return await acknowledge(sending, remote);
    } catch (error2) {
      return fail6({ ...operation2, claim_owner: owner2 }, error2);
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
  const { getScope, lease, state: state2, list: list3, checkScope, process, db, leaseKey, owner: owner2, now, retryable, canDispatch, cooldown } = context;
  let running = null;
  async function run() {
    const scope = getScope();
    if (!scope) return { phase: "paused", pending: 0 };
    if (context.rateLimitScope !== scope) {
      context.rateLimitScope = scope;
      context.rateLimitedUntil = 0;
    }
    if (!await lease(scope)) return { phase: "busy", pending: (await list3(scope)).length };
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
        const rows = await list3(scope);
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
      const pending = await list3(scope);
      state2.pending = pending.length;
      state2.unsupported = pending.filter((value) => !canDispatch(value)).length;
      state2.phase = state2.unsupported ? "upgrade-required" : pending.some((value) => value.status === "conflict") ? "conflict" : pending.length ? "pending" : "synced";
      return { ...state2 };
    } catch (error2) {
      state2.phase = "paused";
      state2.error = error2.code || "OFFLINE_UNKNOWN";
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
    if (!running) running = run().finally(() => {
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
  return { run, drain, resume };
}
function createOutbox(options3) {
  const context = createContext(options3);
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
  const { enqueue, drain, resume, list: list3, state: state2, conflicts, canDispatch, retryable, cooldown, setCooldown } = context;
  return { enqueue, drain, resume, list: list3, state: state2, conflicts, canDispatch, retryable, cooldown, setCooldown, resolve };
}
var RETRY_DELAYS, STORED_COOLDOWN_MAX_MS, storedPause, prefixes3, uuidPattern4, active2, deleted, ordered, needsUpgrade;
var init_outbox = __esm({
  "web/offline/outbox.mjs"() {
    init_db();
    init_conflict();
    init_conflict_decisions();
    init_conflict_transport();
    init_resolution_ledger();
    init_retry_after();
    RETRY_DELAYS = Object.freeze([5e3, 15e3, 6e4, 3e5]);
    STORED_COOLDOWN_MAX_MS = 12e4;
    storedPause = (until, time3) => Number.isSafeInteger(until) && until >= 0 && until <= time3 + STORED_COOLDOWN_MAX_MS ? until : 0;
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
async function detailFor(value, date2, index, limits, readBudget, version2) {
  envelope(value, index.scope_id, limits, version2);
  const selected = version2 === 2 ? v2Collections : collections;
  requireValue(value.date === date2 && value.manifest_hash === index.manifest_hash && value.global_content_hash === index.global_content_hash && equal(value.entities, index.entities) && object2(value.data) && Object.keys(value.data).sort().join(",") === [...selected].sort().join(",") && hashPattern2.test(value.content_hash) && hashPattern2.test(value.date_content_hash));
  const records = await snapshotRecords(value.data, index.entities.filter((row) => row.date === null || row.date === date2), readBudget, version2);
  const dateEntities = index.entities.filter((row) => row.date === date2);
  requireValue(value.date_content_hash === await readBudget.hash({ scope_id: index.scope_id, entities: dateEntities }));
  requireValue(value.content_hash === await readBudget.hash({
    snapshot_format: version2 === 2 ? FORMAT2 : FORMAT,
    scope_id: index.scope_id,
    date: date2,
    timezone: "Asia/Shanghai",
    data: value.data
  }));
  return records;
}
async function snapshotRecords(data3, entities, readBudget, version2 = 2) {
  const selected = version2 === 2 ? v2Collections : collections;
  requireValue(object2(data3) && Object.keys(data3).sort().join(",") === [...selected].sort().join(","));
  const expected = new Map(entities.map((row) => [row.entity_id, row])), records = [];
  for (const name of selected) {
    const rows = data3[name];
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
  return records;
}
async function applySnapshot({
  db,
  getScope,
  scope,
  key,
  index,
  initial,
  cached,
  records,
  now,
  version: version2,
  progressKey,
  otherKey,
  covered = [],
  pending = [],
  complete = true
}) {
  await db.transaction(["entities", "meta"], "readwrite", async (tx) => {
    identity3(scope, getScope);
    const current3 = await tx.get("meta", key);
    if (!equal(current3 ?? null, initial.meta ?? null)) fail2("OFFLINE_SNAPSHOT_CHANGED", "其他页面已更新本地快照，请重新核对。");
    if (progressKey && !equal(await tx.get("meta", progressKey) ?? null, initial.progress ?? null))
      fail2("OFFLINE_SNAPSHOT_CHANGED", "其他页面已更新同步进度，请重新核对。");
    if (otherKey && !equal(await tx.get("meta", otherKey) ?? null, initial.otherMeta ?? null))
      fail2("OFFLINE_SNAPSHOT_CHANGED", "其他版本页面已更新完整快照，请重新核对。");
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
    for (const row of all) if (complete && row.server && (version2 === 2 ? supportedId2 : supportedId).test(row.entity_id) && !manifest.has(row.entity_id)) {
      if (!equal(row.server, cached.get(row.entity_id)?.server ?? null))
        fail2("OFFLINE_SNAPSHOT_CHANGED", "其他页面刚确认了记录，未把它判为线上缺失。");
      await tx.put("entities", { ...row, server: null, snapshot_hash: null, remote_missing: true, synced_at: now() });
    }
    identity3(scope, getScope);
    if (complete) {
      await tx.put("meta", { key, value: { index, verified_at: now() } });
      if (progressKey) await tx.delete("meta", progressKey);
    } else {
      await tx.delete("meta", key);
      await tx.delete("meta", otherKey);
      await tx.put("meta", { key: progressKey, value: { index, verified_at: now(), covered_dates: covered, pending_dates: pending, partial: true } });
    }
  });
}
async function readDates(dates, read2, concurrency) {
  let next = 0, error2 = null;
  await Promise.all(Array.from({ length: Math.min(concurrency, dates.length) }, async () => {
    while (!error2 && next < dates.length) {
      const date2 = dates[next++];
      try {
        await read2(date2);
      } catch (failure3) {
        if (!error2 || failure3.code === "OFFLINE_SCOPE_CHANGED" || failure3.status === 429 && error2.code !== "OFFLINE_SCOPE_CHANGED") error2 = failure3;
      }
    }
  }));
  if (error2) throw error2;
}
async function pullSnapshotBatch({ db, request: request2, getScope, now, crypto: crypto2, limits, version: version2, progressive, state: state2 }, { date: probeDate } = {}) {
  const scope = getScope();
  if (typeof scope !== "string" || !hashPattern2.test(scope)) fail2("OFFLINE_SCOPE_REQUIRED", "请先联网核实当前身份范围。");
  const key = JSON.stringify([scope, version2 === 2 ? "snapshot-v2" : "snapshot"]), progressKey = progressive ? entityKey(
    scope,
    version2 === 2 ? "snapshot-v2-progress" : "snapshot-progress"
  ) : null, readBudget = budget(limits, crypto2);
  const otherKey = progressive ? entityKey(scope, version2 === 2 ? "snapshot" : "snapshot-v2") : null;
  const initial = await db.transaction(["entities", "meta"], "readonly", async (tx) => ({
    meta: await tx.get("meta", key),
    progress: progressKey ? await tx.get("meta", progressKey) : null,
    otherMeta: otherKey ? await tx.get("meta", otherKey) : null,
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
  const progress = initial.progress?.value, covered = /* @__PURE__ */ new Set();
  if (progress?.partial === true && progress.index?.scope_id === scope)
    for (const row of progress.index.dates) oldDates.set(row.date, row.content_hash);
  const dates = new Map(index.dates.map((row) => [row.date, row.content_hash]));
  const changed2 = new Set([.../* @__PURE__ */ new Set([...oldDates.keys(), ...dates.keys()])].filter((date2) => oldDates.get(date2) !== dates.get(date2)));
  if (progress?.partial === true && progress.index?.scope_id === scope)
    for (const date2 of progress.pending_dates || []) changed2.add(date2);
  if (progress?.partial === true && progress.index?.scope_id === scope && Array.isArray(progress.covered_dates)) {
    const priorDates = new Map(progress.index.dates.map((row) => [row.date, row.content_hash]));
    for (const date2 of progress.covered_dates) if (priorDates.get(date2) === dates.get(date2)) {
      changed2.delete(date2);
      covered.add(date2);
    }
  }
  const cached = new Map(initial.entities.map((row) => [row.entity_id, row]));
  let needGlobal = !(progress?.index?.scope_id === scope && progress.index.global_content_hash === index.global_content_hash) && (!previous || previous.global_content_hash !== index.global_content_hash);
  for (const entity of index.entities) {
    const row = cached.get(entity.entity_id);
    if (!row?.server || row.snapshot_hash !== entity.content_hash) {
      if (entity.date === null) needGlobal = true;
      else changed2.add(entity.date);
    }
  }
  const preferred = probeDate === void 0 ? new Date(now() + 8 * 36e5).toISOString().slice(0, 10) : day3(probeDate);
  if (!changed2.size && needGlobal && index.entities.some((row) => row.date === null)) changed2.add(preferred);
  if (!progressive && changed2.size + 2 > limits.maxRequests || changed2.size && limits.maxRequests < 3)
    fail2("OFFLINE_SNAPSHOT_LIMIT", "变化日期过多，未返回部分同步结果。", 413);
  for (const date2 of [...oldDates.keys(), ...dates.keys()]) if (!changed2.has(date2)) covered.add(date2);
  for (const date2 of changed2) covered.delete(date2);
  if (progressive && !dates.has(preferred)) covered.add(preferred);
  const ordered2 = [...changed2].sort().reverse();
  if (ordered2.includes(preferred)) {
    ordered2.splice(ordered2.indexOf(preferred), 1);
    ordered2.unshift(preferred);
  }
  const selected = progressive ? ordered2.slice(0, Math.min(6, limits.maxRequests - 2)) : [...changed2].sort();
  const remaining = changed2.size - selected.length;
  const records = /* @__PURE__ */ new Map();
  await readDates(selected, async (date2) => {
    const path = "/workbench-snapshot?date=" + encodeURIComponent(date2) + (version2 === 2 ? "&version=2" : "") + (progressive ? "&manifest_hash=" + index.manifest_hash : "");
    const value = await get(path);
    const rows = await detailFor(
      progressive && !Object.hasOwn(value, "entities") ? { ...value, entities: index.entities } : value,
      date2,
      index,
      limits,
      readBudget,
      version2
    );
    for (const row of rows) {
      if (records.has(row.entity_id)) requireValue(equal(records.get(row.entity_id), row));
      records.set(row.entity_id, row);
    }
  }, progressive ? 3 : 1);
  const verified = await indexFor(await get(indexPath), scope, limits, readBudget, version2);
  if (!sameIndex(index, verified)) fail2("OFFLINE_SNAPSHOT_CHANGED", "读取期间线上内容已变化，请稍后重新核对；本地内容已保留。");
  identity3(scope, getScope);
  for (const date2 of selected) covered.add(date2);
  await applySnapshot({
    db,
    getScope,
    scope,
    key,
    index,
    initial,
    cached,
    records,
    now,
    version: version2,
    progressKey,
    otherKey,
    covered: [...covered].sort(),
    pending: ordered2.slice(selected.length),
    complete: remaining === 0
  });
  if (!remaining) state2.last_success = now();
  return { status: remaining ? "partial" : "synced", scope, changed_dates: selected, remaining_dates: remaining, entities: index.entities.length };
}
function createSnapshotSync({ db, request: request2, getScope, now = Date.now, crypto: crypto2 = globalThis.crypto, limits = {}, version: version2 = 1, progressive = false }) {
  if (!db?.transaction || typeof request2 !== "function" || typeof getScope !== "function") throw new TypeError("Snapshot sync dependencies required");
  if (![1, 2].includes(version2)) throw new TypeError("Unsupported snapshot version");
  limits = { ...SNAPSHOT_PULL_LIMITS, ...limits };
  for (const [key, value] of Object.entries(limits)) {
    if (!Object.hasOwn(SNAPSHOT_PULL_LIMITS, key) || !Number.isSafeInteger(value) || value < 1)
      throw new TypeError("Invalid snapshot pull limit");
  }
  const state2 = { status: "idle", last_success: null, error: null };
  let inFlight = null;
  function pull(options3) {
    if (inFlight) return inFlight;
    state2.status = "pulling";
    state2.error = null;
    inFlight = pullSnapshotBatch({ db, request: request2, getScope, now, crypto: crypto2, limits, version: version2, progressive, state: state2 }, options3).then((result) => {
      state2.status = result.status;
      return result;
    }, (error2) => {
      state2.status = error2.code === "OFFLINE_SCOPE_CHANGED" ? "scope-changed" : "error";
      state2.error = { code: error2.code || "OFFLINE_SNAPSHOT_NETWORK", status: error2.status || null, message: error2.message };
      throw error2;
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
      "name",
      "note"
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

// web/offline/window-sync.mjs
function active3(context, scope, generation) {
  if (context.getScope() !== scope || context.getGeneration() !== generation)
    throw error("OFFLINE_SCOPE_CHANGED", "身份范围已变化，原本机内容和待提交内容已保留。");
}
async function acquire(context, scope, generation, historyDate2) {
  return context.db.transaction(["meta", "entities"], "readwrite", async (tx) => {
    active3(context, scope, generation);
    const key = entityKey(scope, "snapshot-window-gate"), old = (await tx.get("meta", key))?.value || {}, time3 = context.now();
    if (old.retry_at > time3 || old.lease_until > time3 || !historyDate2 && old.next_auto_at > time3) return null;
    const token = context.uuid(), gate = {
      ...old,
      lease_token: token,
      lease_until: time3 + LEASE_MS,
      ...!historyDate2 ? { next_auto_at: time3 + WINDOW_REFRESH_MS } : {}
    };
    await tx.put("meta", { key, value: gate });
    const rows = (await tx.getAll("entities")).filter((row) => row.scope === scope);
    const proofs = await Promise.all(legacy.map((name) => tx.get("meta", entityKey(scope, name))));
    return { key, token, gate, rows, proofs };
  });
}
async function verifiedBatch(context, value, scope, historyDate2) {
  const budget2 = budget(SNAPSHOT_PULL_LIMITS, context.crypto);
  budget2.request();
  budget2.response(value);
  check(value?.batch_format === "haoduoyu-workbench-window-v1");
  const coverage = value.coverage;
  check(coverage && Object.keys(coverage).sort().join(",") === "from,to" && date(coverage.from) && date(coverage.to));
  if (historyDate2) check(coverage.from === historyDate2 && coverage.to === historyDate2);
  else {
    const today2 = new Date(Date.parse(value.index?.generated_at) + 8 * 36e5).toISOString().slice(0, 10);
    const from = new Date(Date.parse(today2 + "T00:00:00Z") - 59 * 864e5).toISOString().slice(0, 10);
    check(coverage.to === today2 && coverage.from === from);
  }
  const index = await indexFor(value.index, scope, SNAPSHOT_PULL_LIMITS, budget2, 2);
  check(index.entities.every((row) => row.date === null || inside(row.date, coverage)));
  const records = await snapshotRecords(value.data, index.entities, budget2, 2);
  return { index, coverage, records };
}
function serverRow(old, record, time3) {
  if (old?.server?.version > record.version) throw error("OFFLINE_SNAPSHOT_CHANGED", "本机已有较新版本，稍后重试。");
  const server = { ...record, id: record.source_id }, sameVersion = old?.server?.version === record.version;
  let labelEvidence = old?.label_evidence;
  if (record.source === "note_entry" && record.deleted_at === null) {
    labelEvidence = {
      version: record.version,
      category: record.category,
      date: record.date,
      created_at: record.created_at,
      label: record.label ?? null
    };
    if (old?.label_evidence && (old.label_evidence.version > record.version || old.label_evidence.version === record.version && !same(old.label_evidence, labelEvidence)))
      throw error("OFFLINE_SNAPSHOT_CHANGED", "标签证据已变化，本机内容已保留。");
    server.labels_version = 1;
    server.label = labelEvidence.label;
  }
  if (record.entity_type === "unscheduled_todo") {
    delete server.date;
    server.completed = Boolean(server.completed);
  }
  if (record.entity_type === "todo" && sameVersion) {
    for (const field2 of ["template_id", "template_version", "template_active"])
      if (Object.hasOwn(old.server, field2)) server[field2] = old.server[field2];
  }
  return {
    ...old,
    server,
    ...labelEvidence ? { label_evidence: labelEvidence } : {},
    window_exclusion: null,
    snapshot_hash: record.content_hash,
    remote_missing: false,
    synced_at: time3,
    ...record.entity_type === "todo" ? { needs_api_refresh: !sameVersion || old?.needs_api_refresh === true } : {}
  };
}
async function archiveProofs(tx, scope, initial) {
  for (const [i, name] of legacy.entries()) {
    const key = entityKey(scope, name), current3 = await tx.get("meta", key);
    if (!same(current3, initial.proofs[i])) throw error("OFFLINE_SNAPSHOT_CHANGED", "其他页面已更新快照，请稍后重试。");
    if (current3) {
      const archive = entityKey(scope, name + "-archive"), previous = await tx.get("meta", archive);
      if ((current3.value?.verified_at || 0) >= (previous?.value?.verified_at || 0)) await tx.put("meta", { ...current3, key: archive });
      await tx.delete("meta", key);
    }
  }
}
async function applyBatch(context, scope, generation, initial, batch, historyDate2) {
  await context.db.transaction(["entities", "meta"], "readwrite", async (tx) => {
    active3(context, scope, generation);
    const gate = await tx.get("meta", initial.key);
    if (gate?.value?.lease_token !== initial.token) throw error("OFFLINE_SNAPSHOT_CHANGED", "另一个页面已接手同步，请稍后重试。");
    const { index, coverage, records } = batch, ids = new Set(index.entities.map((row) => row.entity_id));
    const cached = new Map(initial.rows.map((row) => [row.entity_id, row])), time3 = context.now();
    for (const record of records) {
      const key2 = entityKey(scope, record.entity_id), old = await tx.get("entities", key2);
      await tx.put("entities", { ...serverRow(old, record, time3), key: key2, scope, entity_id: record.entity_id });
    }
    const rows = (await tx.getAll("entities")).filter((row) => row.scope === scope);
    for (const row of rows) if (row.server && inside(row.server.date, coverage) && !ids.has(row.entity_id)) {
      if (!same(row.server, cached.get(row.entity_id)?.server))
        throw error("OFFLINE_SNAPSHOT_CHANGED", "线上读取期间本机已收到更新，原内容已保留。");
      await tx.put("entities", { ...row, window_exclusion: {
        manifest_hash: index.manifest_hash,
        version: row.server.version,
        updated_at: row.server.updated_at,
        date: row.server.date,
        snapshot_hash: row.snapshot_hash ?? null
      } });
    }
    await archiveProofs(tx, scope, initial);
    active3(context, scope, generation);
    const key = entityKey(scope, historyDate2 ? "snapshot-v2-date:" + historyDate2 : "snapshot-v2-window");
    await tx.put("meta", { key, value: { index, coverage, verified_at: time3, partial: true } });
    await tx.put("meta", { key: initial.key, value: { ...gate.value, lease_token: null, lease_until: 0, retry_at: 0, failures: 0 } });
  });
}
async function failedAttempt(context, scope, generation, initial, failure3) {
  if (context.getScope() !== scope || context.getGeneration() !== generation) return;
  await context.db.transaction(["meta"], "readwrite", async (tx) => {
    active3(context, scope, generation);
    const row = await tx.get("meta", initial.key);
    if (row?.value?.lease_token !== initial.token) return;
    const failures = Math.min(5, (row.value.failures || 0) + 1), delay = Math.max(RETRY_MS * 2 ** (failures - 1), failure3.retryAfterMs || 0);
    await tx.put("meta", { key: initial.key, value: {
      ...row.value,
      lease_token: null,
      lease_until: 0,
      failures,
      retry_at: Math.max(context.now() + Math.min(delay, 36e5), failure3.rateLimitedUntil || 0)
    } });
  });
}
async function pullWindow(context, { historyDate: historyDate2 } = {}) {
  if (historyDate2 !== void 0) check(date(historyDate2), "请选择有效的历史日期。");
  const scope = context.getScope(), generation = context.getGeneration();
  if (!/^[a-f0-9]{64}$/.test(scope || "")) throw error("OFFLINE_SCOPE_REQUIRED", "请先联网核实身份。");
  const initial = await acquire(context, scope, generation, historyDate2);
  if (!initial) return { status: "throttled", scope, remaining_dates: 0, history_incomplete: true };
  try {
    const path = "/workbench-snapshot?window=" + (historyDate2 ? "date&date=" + historyDate2 : "recent") + "&version=2";
    const value = await context.request(path);
    active3(context, scope, generation);
    const batch = await verifiedBatch(context, value, scope, historyDate2);
    active3(context, scope, generation);
    await applyBatch(context, scope, generation, initial, batch, historyDate2);
    return { status: "synced", scope, remaining_dates: 0, history_incomplete: true, coverage: batch.coverage };
  } catch (failure3) {
    await failedAttempt(context, scope, generation, initial, failure3).catch(() => {
    });
    throw failure3;
  }
}
function createWindowSnapshotSync({
  db,
  request: request2,
  getScope,
  getGeneration = () => 0,
  now = Date.now,
  crypto: crypto2 = globalThis.crypto,
  uuid: uuid5 = () => globalThis.crypto.randomUUID()
}) {
  const context = { db, request: request2, getScope, getGeneration, now, crypto: crypto2, uuid: uuid5 };
  let flight = null, selectedDate2;
  return { pull(options3) {
    if (flight && options3?.historyDate !== selectedDate2)
      return Promise.reject(error("OFFLINE_SYNC_BUSY", "正在保存另一份快照，请稍后选择历史日期。"));
    selectedDate2 = options3?.historyDate;
    if (!flight) flight = pullWindow(context, options3).finally(() => {
      flight = null;
    });
    return flight;
  } };
}
var WINDOW_REFRESH_MS, RETRY_MS, LEASE_MS, legacy, same, error, check, date, inside;
var init_window_sync = __esm({
  "web/offline/window-sync.mjs"() {
    init_db();
    init_sync();
    WINDOW_REFRESH_MS = 15 * 60 * 1e3;
    RETRY_MS = 5 * 60 * 1e3, LEASE_MS = 12e4;
    legacy = ["snapshot", "snapshot-v2", "snapshot-progress", "snapshot-v2-progress"];
    same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    error = (code, message) => Object.assign(new Error(message), { code });
    check = (condition, message = "近期离线快照不完整，原本机内容已保留。") => {
      if (!condition) throw error("OFFLINE_SNAPSHOT_INVALID", message);
    };
    date = (value) => typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && (/* @__PURE__ */ new Date(value + "T00:00:00Z")).toISOString().slice(0, 10) === value;
    inside = (value, coverage) => typeof value === "string" && value >= coverage.from && value <= coverage.to;
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
function checkedPage(value, date2) {
  if (!value || value.date !== date2 || typeof value.text !== "string" || !Number.isSafeInteger(value.version) || value.version < 0 || typeof value.deleted !== "boolean" || typeof value.can_edit !== "boolean" || dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES) throw new Error("碎碎念读取结果不完整，请重新核对。");
  return value;
}
function createDailyNotesContext({
  load: load2,
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
  const context = { pages: /* @__PURE__ */ new Map(), disposed: false, options: { load: load2, put, remove, restore, onSaved, uuid: uuid5 } };
  const pages = context.pages;
  const emit2 = () => {
    if (!context.disposed) onChange();
  };
  const page = (date2) => {
    if (!validDailyNotesDate(date2)) throw new Error("请选择有效日期。");
    if (!pages.has(date2)) pages.set(date2, {
      date: date2,
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
    return pages.get(date2);
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
  const { load: load2 } = context.options;
  async function read2(date2) {
    const item = page(date2), sequence5 = ++item.sequence, writeEpoch = item.writeEpoch;
    item.loading = true;
    emit2();
    try {
      const value = checkedPage(await load2(date2), date2);
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
    } catch (error2) {
      if (!context.disposed && sequence5 === item.sequence) {
        item.error = error2.message;
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
  function edit(date2, text, { composing = false } = {}) {
    const item = page(date2);
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
    } catch (error2) {
      if (context.disposed || item.pending !== operation2) return;
      if (error2.status === 409) {
        item.pending = null;
        item.phase = "conflict";
        item.dirty = true;
        item.error = "服务器已有新版本，草稿已保留，不会自动覆盖。";
        emit2();
        await context.read(item.date);
      } else if (error2.status >= 400 && error2.status < 500) {
        item.pending = null;
        item.phase = "error";
        item.error = error2.message;
        if ([401, 403].includes(error2.status)) item.canEdit = false;
        emit2();
      } else {
        item.phase = "unknown";
        item.error = "正在核对保存结果，草稿已保留。";
        emit2();
        await context.reconcile(item.date);
      }
    }
  }
  async function save(date2) {
    const item = page(date2);
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
  async function deletePage(date2) {
    const item = page(date2);
    if (context.disposed || !item.canEdit || !item.loaded || item.pending || ["conflict", "unknown"].includes(item.phase) || item.version === 0 || item.deleted) return;
    return send(item, { kind: "delete", text: item.draft, version: item.version, saveId: uuid5() });
  }
  async function retryPending(date2) {
    const item = page(date2), operation2 = item.pending;
    if (context.disposed || item.phase !== "unknown" || !operation2?.retryReady || operation2.checking || !item.canEdit) return;
    operation2.retryReady = false;
    return send(item, operation2);
  }
  async function restorePage(date2) {
    const item = page(date2);
    if (context.disposed || !item.canEdit || !item.loaded || !item.deleted || item.pending || item.dirty || ["conflict", "unknown"].includes(item.phase)) return;
    return send(item, { kind: "restore", text: "", version: item.version, saveId: uuid5() });
  }
  return { save, deletePage, restorePage, retryPending };
}
function createResolutionActions(context) {
  const { page, emit: emit2, stopTimer, adopt, matches: matches2, accepted } = context;
  const { load: load2 } = context.options;
  async function reconcile(date2) {
    const item = page(date2), operation2 = item.pending;
    if (context.disposed || item.phase !== "unknown" || !operation2 || operation2.checking) return;
    operation2.checking = true;
    operation2.retryReady = false;
    emit2();
    try {
      const value = checkedPage(await load2(date2), date2);
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
    } catch (error2) {
      if (!context.disposed && item.pending === operation2) item.error = "核对失败，草稿已保留：" + error2.message;
    } finally {
      operation2.checking = false;
      emit2();
    }
  }
  function useServer(date2) {
    const item = page(date2);
    if (!item.remote || item.pending || item.phase !== "conflict") return;
    stopTimer(item);
    adopt(item, item.remote);
    item.remote = null;
    item.phase = "saved";
    item.error = "";
    emit2();
  }
  async function useDraft(date2) {
    const item = page(date2);
    if (!item.remote || item.pending || item.phase !== "conflict" || !item.remote.can_edit) return;
    adopt(item, item.remote, true);
    item.remote = null;
    item.phase = item.dirty ? "dirty" : "saved";
    item.error = "";
    emit2();
    return context.save(date2);
  }
  return { reconcile, useServer, useDraft };
}
function createDailyNotesStore(options3) {
  const context = createDailyNotesContext(options3);
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
function noteMutationRoute(path, options3, features) {
  const match = /^\/note-entries\/([a-f0-9-]{36})$/i.exec(path), method2 = (options3.method || "GET").toUpperCase();
  return features.notes && match && uuid2.test(match[1]) && ["PUT", "DELETE"].includes(method2) ? { type: "note_entry", id: match[1].toLowerCase(), method: method2 } : null;
}
function checked(body4, method2, labelsV1) {
  const fields4 = method2 === "PUT" ? [
    "category",
    "date",
    "text",
    "version",
    "save_id",
    ...labelsV1 && Object.hasOwn(body4 || {}, "label") ? ["label"] : []
  ] : ["version", "save_id"];
  if (!body4 || Object.keys(body4).sort().join(",") !== fields4.sort().join(",") || !uuid2.test(body4.save_id) || !Number.isSafeInteger(body4.version) || body4.version < (method2 === "PUT" ? 0 : 1) || body4.version >= Number.MAX_SAFE_INTEGER)
    throw failure2("保存字段或原保存标识不完整，本次修改未保存。");
  if (method2 === "PUT") {
    if (Object.hasOwn(body4, "label")) {
      const label = body4.label;
      if (body4.category !== "life" || typeof label !== "string" || !label.isWellFormed() || !label.trim() || [...label.trim()].length > 32 || /[\u0000-\u001f\u007f]/.test(label) || ["生活", "工作"].includes(label.trim().normalize("NFC"))) throw failure2("标签无效，草稿已保留。");
      body4 = { ...body4, label: label.trim().normalize("NFC") };
    }
    const day9 = /* @__PURE__ */ new Date(body4.date + "T00:00:00Z");
    if (!["life", "work"].includes(body4.category) || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body4.date) || !Number.isFinite(day9.getTime()) || day9.toISOString().slice(0, 10) !== body4.date || typeof body4.text !== "string" || !body4.text.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body4.text) || new TextEncoder().encode(body4.text.replace(/\r\n?/g, "\n")).byteLength > 65536)
      throw failure2("分类、日期或正文无效，草稿已保留。");
  }
  return structuredClone(body4);
}
function createNoteMutations(context) {
  async function mutate(path, options3, route2, guard) {
    const { state: state2, cache: cache2, outbox, now } = context, owner2 = state2.scope, generation = context.generation;
    const active5 = () => {
      guard();
      if (!owner2 || owner2 !== state2.scope || generation !== context.generation)
        throw failure2("身份范围已变化，本次修改未保存。", "OFFLINE_SCOPE_CHANGED");
    };
    active5();
    const body4 = checked(options3.body, route2.method, context.features.labelsV1 === true);
    if (!await cache2.noteCapability()) throw failure2("请先联网核实碎碎念编辑能力。", "OFFLINE_SCOPE_REQUIRED");
    active5();
    const stored = await cache2.entity("note-entry:" + route2.id), visible3 = offlineValue(stored);
    active5();
    if (route2.method === "PUT" && body4.version === 0 && !visible3 && body4.date !== dailyNotesToday())
      throw failure2("只能新增北京时间当天的碎碎念，草稿已保留。", "OFFLINE_NOTES_TODAY_ONLY");
    if (route2.method === "PUT" && body4.version === 0 && !visible3) {
      const existing = await cache2.entities();
      active5();
      if (existing.filter((row) => row.entity_id.startsWith("note-entry:") && (row.dirty ? row.local : row.server)?.category === body4.category && (row.dirty ? row.local : row.server)?.date === body4.date && !(row.dirty ? row.local : row.server)?.deleted && !(row.dirty ? row.local : row.server)?.deleted_at && (row.dirty || !row.remote_missing)).length >= 200)
        throw failure2("本机该日记录已达 200 条，草稿已保留。", "OFFLINE_CACHE_LIMIT");
    }
    if (!options3.offlineUnknown && body4.version !== (visible3?.version || 0))
      throw failure2("本机已有更新，请重新读取后保存，草稿已保留。", "OFFLINE_CACHE_CHANGED");
    if (route2.method === "DELETE" && !visible3) throw failure2("此记录尚未保存在本机。", "OFFLINE_CACHE_MISS");
    if (visible3 && route2.method === "PUT" && (visible3.category !== body4.category || visible3.date !== body4.date))
      throw failure2("记录的分类和日期不可更改。");
    const labelMode = context.features.labelsV1 === true;
    const persisted = stored?.label_evidence;
    const matches2 = persisted && persisted.version === visible3?.version && persisted.category === visible3?.category && persisted.date === visible3?.date && persisted.created_at === visible3?.created_at;
    const evidence2 = visible3?.labels_version === 1 && Object.hasOwn(visible3, "label") ? visible3 : stored?.api_server?.labels_version === 1 && stored.api_server.version === visible3?.version && stored.api_server.category === visible3?.category && stored.api_server.date === visible3?.date && stored.api_server.created_at === visible3?.created_at ? stored.api_server : matches2 ? persisted : null;
    if (labelMode && visible3 && !evidence2)
      throw failure2("标签尚未核实，请联网读取后再保存，原文已保留。", "OFFLINE_LABEL_UNVERIFIED");
    if (labelMode && visible3 && Object.hasOwn(body4, "label") && body4.label !== evidence2.label)
      throw failure2("已有记录的标签不可更改，原文已保留。");
    const label = visible3 ? evidence2?.label : body4.label ?? null;
    const stamp4 = new Date(now()).toISOString();
    const local = {
      ...visible3,
      ...body4,
      ...labelMode ? { labels_version: 1, label } : {},
      id: route2.id,
      can_edit: true,
      deleted: route2.method === "DELETE",
      created_at: visible3?.created_at || stamp4,
      updated_at: stamp4,
      deleted_at: route2.method === "DELETE" ? stamp4 : null
    };
    let result;
    try {
      result = await outbox.enqueue({
        scope: owner2,
        entity_type: "note_entry",
        entity_id: route2.id,
        method: route2.method,
        path,
        body: body4,
        base: stored?.server || null,
        local,
        ...labelMode ? { protocol: 5 } : {},
        initial_status: options3.offlineUnknown ? "unknown" : "queued",
        assertActive: active5
      });
    } catch (error2) {
      error2.localNotSaved = true;
      if (!error2.code) error2.code = "OFFLINE_STORAGE_UNAVAILABLE";
      throw error2;
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
function createEntryRecoveryGuard(fields4) {
  const restored = /* @__PURE__ */ new WeakMap();
  const signature2 = (item) => JSON.stringify(fields4.map((key) => item[key]));
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
  const fields4 = ["kind", "version", "saveId", "text", "labels", "label", "expectedLabel"];
  const permitted = /* @__PURE__ */ new Set([...fields4, "uncertain", "checking", "retryReady"]);
  if (typeof original !== "object" || typeof restored !== "object" || Array.isArray(original) || Array.isArray(restored) || Object.keys(original).some((key) => !permitted.has(key)) || Object.keys(restored).some((key) => !permitted.has(key)) || !["put", "delete", "restore"].includes(original.kind)) return false;
  return fields4.every((key) => JSON.stringify(original[key] ?? null) === JSON.stringify(restored[key] ?? null));
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
async function purgeVerifiedDrafts({ db, getScope, getGeneration }, snapshots, tombstones, stillActive = () => true) {
  const owner2 = getScope(), generation = getGeneration();
  if (!owner2) return;
  const active5 = () => {
    if (owner2 !== getScope() || generation !== getGeneration() || !stillActive())
      throw new Error("Draft cleanup was cancelled");
  };
  const candidates = [];
  for (const snapshot of snapshots) {
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
async function purgeUserDeletedDrafts({ db, getScope, getGeneration }, raw, snapshots, value, stillActive = () => true) {
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
    for (const snapshot of snapshots) {
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
        const identity5 = row.kind === "legacy" ? row.category + ":" + row.date : row.id;
        const key = entityKey(owner2, "draft:" + row.kind + ":" + identity5 + ":" + draftOwner);
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
  async function list3(kind) {
    return (await records(kind)).map((row) => row.data);
  }
  const tools = { db, getScope, getGeneration, pending };
  const purgeVerified = (snapshots, tombstones, stillActive) => purgeVerifiedDrafts(tools, snapshots, tombstones, stillActive);
  const purgeUserDeleted = (raw, snapshots, value, stillActive) => purgeUserDeletedDrafts(tools, raw, snapshots, value, stillActive);
  const discardUnsent = (raw) => discardUnsentDraft(tools, raw);
  const discardSelected = (snapshot) => discardSelectedDraft(tools, snapshot);
  return { capture, list: list3, records, purgeVerified, purgeUserDeleted, discardUnsent, discardSelected, flush: () => Promise.all([...pending]) };
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
  if (checks.some((check2) => typeof check2 !== "function")) throw new TypeError("Conflict draft guard must return a function");
  return () => {
    for (const check2 of checks) check2();
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
    const identity5 = getIdentity(), owner2 = store.state.draftOwner;
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
      if (store !== getStore() || identity5 !== getIdentity() || owner2 !== store.state.draftOwner) changed();
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
    const identity5 = getIdentity();
    const snapshot = (rows) => stable3({
      drafts: rows.map(([category, store]) => [category, draftSnapshot(store.entries.get(id2), "note")]),
      composing: getComposing(id2) === true
    });
    const initial = snapshot(initialStores);
    return () => {
      const current3 = find();
      if (identity5 !== getIdentity() || current3.length !== initialStores.length || current3.some(([category, store], index) => category !== initialStores[index][0] || store !== initialStores[index][1])) changed();
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
  const operation2 = records.operations.filter((row) => row.entity_id === entity.entity_id && active4(row)).at(-1) || null;
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
  const body4 = structuredClone(raw || {});
  if (!body4.save_id) body4.save_id = createId();
  const fields4 = ["title", "position", "version", "save_id", ...kind === "notes" ? ["group_id", "body"] : []];
  const plain3 = (value) => typeof value === "string" && value.isWellFormed() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  const invalid4 = () => {
    throw Object.assign(fail3("备忘录字段无效，输入仍保留。"), { status: 400 });
  };
  if (Object.keys(body4).sort().join(",") !== fields4.sort().join(",") || !uuid4.test(body4.save_id) || !Number.isSafeInteger(body4.version) || body4.version < 0 || body4.version >= Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(body4.position) || body4.position < 0 || body4.position > 1e6 || !plain3(body4.title) || !body4.title.trim() || [...body4.title.trim()].length > 120 || /[\r\n\t]/.test(body4.title)) invalid4();
  body4.title = body4.title.trim();
  if (kind === "notes") {
    if (!uuid4.test(body4.group_id) || !plain3(body4.body)) invalid4();
    body4.body = body4.body.replace(/\r\n?/g, "\n");
    if (new TextEncoder().encode(body4.body).length > 65536) invalid4();
  }
  return body4;
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
  async function mutate(path, options3, assertActive) {
    const route2 = memoRoute(path), guard = scoped(context, assertActive);
    if (!route2 || !["notes", "groups"].includes(route2.kind) || options3.method?.toUpperCase() !== "PUT") {
      throw fail3("备忘录删除和恢复需联网确认。", "OFFLINE_UNSUPPORTED");
    }
    const body4 = checkedInput(options3.body, route2.kind, context.uuid);
    const cap = await context.db.transaction(["meta"], "readonly", (tx) => tx.get("meta", entityKey(guard.scope, "memo-capability")));
    guard.check();
    if (cap?.can_edit !== true) throw fail3("请先联网确认备忘录编辑权限。", "OFFLINE_SCOPE_REQUIRED");
    const key = keyFor(guard.scope, route2.kind, route2.id);
    const old = await context.db.transaction(["entities"], "readonly", (tx) => tx.get("entities", key));
    guard.check();
    const visible3 = offlineValue(old);
    if (visible3?.deleted_at || visible3?.deleted) throw fail3("笔记已删除，请联网核对后恢复。", "OFFLINE_MEMO_DELETED");
    const local = {
      ...visible3,
      ...body4,
      id: route2.id,
      version: body4.version + 1,
      created_at: visible3?.created_at || new Date(context.now()).toISOString(),
      updated_at: new Date(context.now()).toISOString(),
      deleted_at: null
    };
    const result = await context.outbox.enqueue({
      scope: guard.scope,
      entity_type: route2.kind === "notes" ? "memo_note" : "memo_group",
      entity_id: route2.id,
      method: "PUT",
      path,
      body: body4,
      base: old?.server || null,
      local,
      assertActive: guard.check,
      ...route2.kind === "notes" ? { protocol: 2, depends_on: ["memo-group:" + body4.group_id] } : {},
      ...options3.offlineUnknown ? { initial_status: "unknown" } : {}
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
function createMemoOfflineAdapter(options3) {
  const context = { getGeneration: () => 0, now: Date.now, uuid: () => crypto.randomUUID(), ...options3 };
  Object.assign(context, memoReads(context), memoCache(context), memoWrites(context));
  return { project: context.project, remember: context.remember, mutate: context.mutate, fence: context.fence };
}
var uuid4, active4, fail3, keyFor, fields3;
var init_memos = __esm({
  "web/offline/memos.mjs"() {
    init_db();
    init_document();
    uuid4 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    active4 = (value) => !["archived", "acked"].includes(value.status);
    fail3 = (message, code = "OFFLINE_MEMO_INVALID") => Object.assign(new Error(message), { code });
    keyFor = (scope, kind, id2) => entityKey(scope, (kind === "notes" ? "memo-note:" : "memo-group:") + id2);
    fields3 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at", "group_id", "body"];
  }
});

// web/offline/runtime.mjs
async function scopeProbe(context, options3 = {}) {
  if (!context.scopeProbe) return identityProbe(context, SCOPE_INDEX, options3);
  try {
    return await identityProbe(context, SCOPE_ONLY, options3);
  } catch (error2) {
    if (error2?.status !== 404) throw error2;
    return identityProbe(context, SCOPE_INDEX, options3);
  }
}
function recentScope({ scopeReuseMs, scopeCheckedAt, now, state: state2 }) {
  const age = now() - scopeCheckedAt;
  return Boolean(scopeReuseMs && state2.identity && state2.verifiedScope && state2.verifiedScope === state2.scope && scopeCheckedAt && age >= 0 && age < scopeReuseMs);
}
async function identityProbe(context, path, options3 = {}) {
  const scope = context.state.scope, generation = context.generation;
  if (scope) {
    const deadline = Math.max(context.cooldownUntil || 0, await context.outbox.cooldown(scope));
    if (generation !== context.generation || scope !== context.state.scope) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
    if (deadline > context.now()) throw Object.assign(
      new Error("请求较多，请稍后重试。"),
      { status: 429, rateLimitedUntil: deadline, retryAfterMs: deadline - context.now() }
    );
  }
  const controller = new AbortController(), external2 = options3.signal;
  const abort = () => controller.abort(external2.reason);
  if (external2?.aborted) abort();
  else external2?.addEventListener("abort", abort, { once: true });
  let timer;
  try {
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(fail4("身份范围核实暂未完成，本机内容已保留。", "OFFLINE_NETWORK"));
        controller.abort();
      }, 1e4);
    });
    return await Promise.race([context.request(path, { ...options3, signal: controller.signal }), expired]);
  } finally {
    clearTimeout(timer);
    external2?.removeEventListener("abort", abort);
  }
}
function writableRoute(path, options3, features) {
  if (!features.todos) return null;
  const method2 = (options3.method || "GET").toUpperCase();
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
function checkedBody(route2, options3, uuid5) {
  const body4 = structuredClone(options3.body || {}), method2 = (options3.method || "GET").toUpperCase();
  const required = route2.create ? route2.type === "todo" ? ["id", "date", "text"] : ["id", "text"] : route2.type === "todo" ? route2.restore || method2 === "DELETE" ? ["date", "version"] : ["completed", "version"] : route2.type === "unscheduled_todo" ? route2.restore || method2 === "DELETE" ? ["version"] : ["completed", "version"] : method2 === "DELETE" ? ["version"] : ["text", "version"];
  if (route2.create && !body4.id) body4.id = uuid5();
  const allowed = [...required, ...route2.create && route2.type === "todo" ? ["template_id"] : []];
  if (required.some((key) => !Object.hasOwn(body4, key)) || Object.keys(body4).some((key) => !allowed.includes(key)))
    throw fail4("请求字段不完整，本次操作未保存。", "OFFLINE_INVALID_MUTATION");
  if (body4.id && !uuidPattern5.test(body4.id) || body4.template_id && !uuidPattern5.test(body4.template_id))
    throw fail4("事项标识无效，本次操作未保存。", "OFFLINE_INVALID_MUTATION");
  if (body4.date && (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body4.date) || !Number.isFinite(Date.parse(body4.date + "T00:00:00Z")) || (/* @__PURE__ */ new Date(body4.date + "T00:00:00Z")).toISOString().slice(0, 10) !== body4.date))
    throw fail4("请选择有效日期。", "OFFLINE_INVALID_MUTATION");
  if (Object.hasOwn(body4, "text") && (typeof body4.text !== "string" || !body4.text.trim() || body4.text.length > 500 || body4.text.includes("\0")))
    throw fail4("请填写 1–500 字的内容。", "OFFLINE_INVALID_MUTATION");
  if (Object.hasOwn(body4, "completed") && typeof body4.completed !== "boolean")
    throw fail4("完成状态无效。", "OFFLINE_INVALID_MUTATION");
  if (!route2.create && (!Number.isSafeInteger(body4.version) || body4.version < 1 || body4.version >= Number.MAX_SAFE_INTEGER))
    throw fail4("版本无效，本次操作未保存。", "OFFLINE_INVALID_MUTATION");
  return body4;
}
function runtimeContext(options3) {
  const {
    db,
    request: request2,
    now = Date.now,
    uuid: uuid5 = () => crypto.randomUUID(),
    online = () => globalThis.navigator?.onLine !== false,
    onIdentity = () => {
    },
    features = OFFLINE_FEATURES,
    scopeProbe: scopeProbe2 = false,
    scopeReuseMs = 0,
    progressiveSnapshot = false,
    windowedSnapshot = false
  } = options3;
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
    historyRemaining: 0,
    historyIncomplete: windowedSnapshot,
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
    stopped: false,
    windowedSnapshot,
    syncNotBefore: 0,
    scopeProbe: scopeProbe2 === true,
    scopeReuseMs: Math.max(0, Math.min(Number(scopeReuseMs) || 0, 6e4)),
    scopeCheckedAt: 0,
    pulledAt: 0
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
    } catch (error2) {
      if (owner2 !== state2.scope || generation !== context.generation)
        throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
      if ([401, 403].includes(error2.status) && generation === context.generation) await context.invalidate({ forget: true });
      throw error2;
    }
  };
  context.outbox = createOutbox({
    db,
    request: send,
    getScope: () => state2.scope,
    now,
    uuid: uuid5,
    timeout: options3.timeout,
    enabledTypes: [
      ...features.todos ? ["todo", "template", "unscheduled_todo"] : [],
      ...features.notes ? ["note_entry"] : [],
      ...features.memos ? ["memo_note", "memo_group"] : []
    ],
    supportedProtocols: features.memos ? [1, 2, 3, 4, 5] : [1, 3, 4, 5],
    supportedDependencies: features.memos === true,
    resolutionReceipts: true
  });
  context.snapshot = createSnapshotSync({ db, request: send, getScope: () => state2.scope, now, progressive: progressiveSnapshot });
  context.snapshotV2 = windowedSnapshot ? createWindowSnapshotSync({
    db,
    request: send,
    getScope: () => state2.scope,
    getGeneration: () => context.generation,
    now,
    uuid: uuid5
  }) : features.snapshotV2 === true ? createSnapshotSync({ db, request: send, getScope: () => state2.scope, now, version: 2, progressive: progressiveSnapshot }) : null;
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
  const identity5 = safeIdentity(me);
  if (generation !== context.generation) throw fail4("身份读取已过期。", "OFFLINE_SCOPE_CHANGED");
  if (!scopePattern.test(index?.scope_id) || index.complete !== true || index.projection !== "current")
    throw fail4("身份范围读取不完整，请联网重试。", "OFFLINE_SCOPE_REQUIRED");
  if (state2.scope && (state2.scope !== index.scope_id || identityFingerprint(state2.identity) !== identityFingerprint(identity5))) {
    await invalidate({ forget: true });
    throw fail4("当前身份范围已变化，原本机内容与队列已保留，请重新打开页面。", "OFFLINE_SCOPE_CHANGED");
  }
  await cache2.saveIdentity(identity5, index.scope_id);
  if (generation !== context.generation || state2.scope && state2.scope !== index.scope_id) {
    await invalidate({ forget: true });
    throw fail4("身份核实已过期，原本机数据已保留。", "OFFLINE_SCOPE_CHANGED");
  }
  state2.scope = index.scope_id;
  state2.verifiedScope = index.scope_id;
  state2.identity = identity5;
  context.scopeCheckedAt = context.now();
  state2.online = true;
  onIdentity(me);
  emit2();
  return me;
}
function identityActions(context) {
  const { cache: cache2, state: state2, emit: emit2, request: request2, onIdentity } = context;
  async function invalidate({ forget = false } = {}) {
    context.generation++;
    context.scopeCheckedAt = 0;
    context.pulledAt = 0;
    context.syncNotBefore = 0;
    context.readFailures = 0;
    context.readPauseUntil = 0;
    clearTimeout(context.historyTimer);
    context.historyRetry = false;
    state2.historyRemaining = 0;
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
  async function authenticate(options3 = {}) {
    const generation = context.generation;
    let liveIdentity = null;
    try {
      const me = await identityProbe(context, "/auth/me", options3);
      liveIdentity = safeIdentity(me);
      let index;
      try {
        index = await scopeProbe(context, { suppressAuthRedirect: true });
      } catch (error2) {
        error2.offlineScopeFailure = true;
        throw error2;
      }
      return await adopt(me, index, generation);
    } catch (error2) {
      if (generation !== context.generation) throw fail4("身份核实已过期。", "OFFLINE_SCOPE_CHANGED");
      state2.verifiedScope = null;
      if ([401, 403].includes(error2.status)) {
        await invalidate({ forget: true });
        throw error2;
      }
      if (!networkFailure(error2)) throw error2;
      const cached = await cache2.readIdentity();
      if (generation !== context.generation || !cached?.identity || !scopePattern.test(cached.scope)) throw error2;
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
      const index = await scopeProbe(context);
      if (generation !== context.generation || state2.scope !== owner2 || index?.scope_id !== owner2 || index.complete !== true || index.projection !== "current") {
        await invalidate({ forget: true });
        throw fail4("身份范围已变化，本机内容与队列已保留。", "OFFLINE_SCOPE_CHANGED");
      }
      context.scopeCheckedAt = context.now();
      return state2.identity;
    } catch (error2) {
      if (generation !== context.generation || state2.scope !== owner2) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
      state2.verifiedScope = null;
      if ([401, 403].includes(error2.status)) await invalidate({ forget: true });
      throw error2;
    }
  }
  function verifyScope() {
    if (recentScope(context)) return Promise.resolve(state2.identity);
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
    if (state2.phase !== "syncing") state2.phase = state2.unsupported ? "upgrade-required" : conflicts.length ? "conflict" : state2.online ? pending.length ? "pending" : state2.historyRemaining ? "partial" : "synced" : "offline";
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
  async function resolve(key, choice, options3 = {}) {
    if (!state2.scope) throw fail4("请先核实身份。", "OFFLINE_SCOPE_REQUIRED");
    const conflict = (await outbox.conflicts.list(state2.scope)).find((row) => row.key === key);
    if (conflict && !outbox.canDispatch(conflict.operation)) throw fail4("此本机操作需新版页面处理，原内容已保留。", "OFFLINE_UPGRADE_REQUIRED");
    const owner2 = state2.scope, generation = context.generation;
    const checkDraft = captureConflictDraftGuard(conflict?.entity_id);
    const active5 = () => {
      if (options3.signal?.aborted) throw new DOMException("请求已取消", "AbortError");
      if (owner2 !== state2.scope || generation !== context.generation) throw fail4("身份已变化，原文已保留。", "OFFLINE_SCOPE_CHANGED");
      checkDraft();
    };
    active5();
    await context.verifyScope();
    active5();
    const result = await outbox.resolve(key, choice, {
      scope: owner2,
      assertActive: active5,
      expected: options3.expected,
      copyConfirmed: options3.copyConfirmed
    });
    await refresh();
    context.broadcast();
    if (result.resolution?.state === "queued" && context.online()) context.scheduleRetry();
    return result;
  }
  return { refresh, queue, resolve };
}
function pauseFailedRead(context, stage, error2) {
  if (!context.windowedSnapshot || !["identity", "cache", "snapshot"].includes(stage) || [401, 403].includes(error2.status)) return;
  context.readFailures = Math.min(5, (context.readFailures || 0) + 1);
  const delay = Math.min(READ_PAUSE_MAX_MS, 6e4 * 2 ** (context.readFailures - 1));
  context.readPauseUntil = Math.max(context.readPauseUntil || 0, context.now() + delay, error2.rateLimitedUntil || 0);
}
async function pauseRefused(context, stage, error2, owner2, active5) {
  const { now } = context;
  if (error2.status !== 429) return;
  const deadline = Math.min(
    now() + STORED_COOLDOWN_MAX_MS,
    Number.isSafeInteger(error2.rateLimitedUntil) ? error2.rateLimitedUntil : retryUntil(now(), error2.retryAfterMs)
  );
  if (stage === "snapshot") context.historyRetry = true;
  if (["cache", "snapshot"].includes(stage)) {
    context.readPauseUntil = Math.max(context.readPauseUntil || 0, deadline);
    return;
  }
  context.cooldownUntil = Math.max(context.cooldownUntil || 0, deadline);
  if (!owner2) return;
  const assertActive = () => {
    if (!active5()) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
  };
  try {
    await context.outbox.setCooldown(owner2, context.cooldownUntil, assertActive);
  } catch {
  }
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
    if (context.cooldownUntil > now() || (context.readPauseUntil || 0) > now()) {
      context.scheduleRetry();
      if (state2.historyRemaining || context.historyRetry) context.scheduleHistory();
      return context.refresh();
    }
    if (!recentScope(context)) await context.verify();
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
    if (state2.verifiedScope && !((context.readPauseUntil || 0) > now())) await context.cache.captureDocuments();
    if (!active5()) return { ...state2 };
    const pulled = now() - context.pulledAt;
    if (state2.verifiedScope && !((context.readPauseUntil || 0) > now()) && !(state2.historyRemaining === 0 && context.scopeReuseMs && context.pulledAt && pulled >= 0 && pulled < context.scopeReuseMs)) {
      stage = "snapshot";
      const result = await (context.snapshotV2 || snapshot).pull({ date: today(now) });
      if (!active5()) return { ...state2 };
      state2.historyRemaining = result.remaining_dates || 0;
      if (context.windowedSnapshot) state2.historyIncomplete = true;
      context.historyRetry = false;
      if (!state2.historyRemaining && (!context.windowedSnapshot || result.status === "synced")) context.pulledAt = now();
      if (context.lastTodoPath) {
        stage = "cache";
        const date2 = offlineReadRoute(context.lastTodoPath).date;
        if ((await context.cache.entities()).some((row) => row.needs_api_refresh && row.server?.date === date2))
          await context.call(context.lastTodoPath);
      }
    }
    if (!active5()) return { ...state2 };
    if (!state2.historyRemaining && (!context.windowedSnapshot || context.pulledAt))
      state2.lastSuccess = context.windowedSnapshot ? context.pulledAt : now();
    state2.error = null;
    state2.errorStage = null;
    context.readFailures = 0;
  } catch (error2) {
    if (!active5()) return { ...state2 };
    pauseFailedRead(context, stage, error2);
    await pauseRefused(context, stage, error2, owner2, active5);
    if (!active5()) return { ...state2 };
    state2.error = error2.message;
    state2.errorStage = stage;
    if (error2.status) state2.online = true;
    else if (networkFailure(error2)) state2.online = false;
  }
  state2.phase = "idle";
  await context.refresh();
  if (!active5()) return { ...state2 };
  context.broadcast();
  if (state2.pending && state2.online && !context.stopped) context.scheduleRetry();
  if ((state2.historyRemaining || context.historyRetry) && state2.online && (!state2.error || Math.max(context.cooldownUntil || 0, context.readPauseUntil || 0) > now()))
    context.scheduleHistory();
  return { ...state2 };
}
function syncActions(context) {
  const { state: state2, emit: emit2, outbox, snapshot, now, online } = context;
  const run = () => runSync(context);
  function scheduleHistory() {
    clearTimeout(context.historyTimer);
    if (context.stopped || context.windowedSnapshot) return;
    const owner2 = state2.scope, generation = context.generation;
    context.historyTimer = setTimeout(() => {
      if (!context.stopped && owner2 === state2.scope && generation === context.generation && online()) void sync();
    }, Math.min(MAX_TIMER_DELAY, Math.max(500, (context.cooldownUntil || 0) - now(), (context.readPauseUntil || 0) - now())));
    context.historyTimer?.unref?.();
  }
  function sync({ rerun = false } = {}) {
    if (context.syncFlight) {
      if (!context.windowedSnapshot || rerun) context.syncAgain = true;
      return context.syncFlight;
    }
    if (context.windowedSnapshot && !rerun && context.syncNotBefore > now()) return context.refresh();
    if (context.windowedSnapshot) context.syncNotBefore = now() + WINDOW_REFRESH_MS;
    context.syncFlight = run().finally(() => {
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
    outbox.retryable(owner2).then(async (operations) => {
      if (context.stopped || state2.scope !== owner2 || context.generation !== generation) return;
      if (!operations.length) return;
      const next = Math.min(...operations.map((row) => row.next_attempt_at || 0));
      const deadline = Math.max(context.cooldownUntil || 0, context.readPauseUntil || 0, await outbox.cooldown(owner2));
      if (context.stopped || state2.scope !== owner2 || context.generation !== generation) return;
      const delay = Math.min(MAX_TIMER_DELAY, Math.max(100, next - now(), deadline - now()));
      clearTimeout(context.timer);
      context.timer = setTimeout(() => {
        if (!context.stopped) void sync({ rerun: true });
      }, delay);
      context.timer?.unref?.();
    }).catch((error2) => {
      if (!context.stopped && state2.scope === owner2 && context.generation === generation) {
        state2.error = error2.message;
        emit2();
      }
    });
  }
  return { sync, scheduleRetry, scheduleHistory };
}
async function unmanaged(context, path, options3, guard) {
  try {
    guard();
    return await context.request(path, options3);
  } catch (error2) {
    if ([401, 403].includes(error2.status)) await context.invalidate({ forget: true });
    throw error2;
  }
}
async function mutateMemo(context, path, options3, guard) {
  const value = await context.memos.mutate(path, options3, guard);
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
  } catch (error2) {
    if (["OFFLINE_RESPONSE_INVALID", "OFFLINE_SCOPE_CHANGED", "OFFLINE_CACHE_CHANGED"].includes(error2.code)) throw error2;
    context.state.error = error2.message;
    context.state.errorStage = "cache";
    context.emit();
    return value;
  }
}
function labelRequestOptions(path, options3, features) {
  return features.labelsV1 && path.startsWith("/note-entries") ? { ...options3, headers: { ...options3.headers, "X-Note-Labels-Version": "1" } } : options3;
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
async function offlineDispatch(context, mutate, path, input = {}, readRetried = false) {
  const { state: state2, cache: cache2, features } = context;
  const { offlineGuard: guard = () => {
  }, requireNetwork = false, ...options3 } = input;
  guard();
  const method2 = (options3.method || "GET").toUpperCase(), route2 = writableRoute(path, options3, features);
  const memo = features.memos && memoRoute(path);
  const noteRoute = noteMutationRoute(path, options3, features);
  if (noteRoute) return context.noteMutations.mutate(path, options3, noteRoute, guard);
  if (path === "/auth/me" && method2 === "GET") return options3.context || options3.signal ? context.authenticate(options3) : context.verify();
  if (["/auth/login", "/auth/logout"].includes(path) && method2 === "POST") {
    const value = await context.request(path, labelRequestOptions(path, options3, features));
    await context.invalidate({ forget: true });
    return value;
  }
  if (route2) return mutate(path, options3, route2, guard);
  if (memo && method2 === "PUT") return mutateMemo(context, path, options3, guard);
  if (method2 !== "GET" || !offlineReadRoute(path)) return unmanaged(context, path, options3, guard);
  if (offlineReadRoute(path).kind === "todo") context.lastTodoPath = path;
  try {
    if (context.online() && state2.identity) await context.verifyScope();
    guard();
    const owner2 = state2.scope, generation = context.generation;
    const baseline = owner2 ? await (memo ? context.memos.fence(path) : cache2.fence(path)) : void 0;
    guard();
    const value = await context.request(path, labelRequestOptions(path, options3, features));
    guard();
    if (owner2 !== state2.scope || generation !== context.generation) throw fail4("身份范围已变化，本次读取已取消。", "OFFLINE_SCOPE_CHANGED");
    if (offlineReadRoute(path).kind === "todo") state2.partial = false;
    if (!state2.scope) return value;
    const projection = await rememberRead(context, path, value, baseline, memo);
    return requireNetwork ? value : projection;
  } catch (error2) {
    if ([401, 403].includes(error2.status)) {
      await context.invalidate({ forget: true });
      throw error2;
    }
    if (error2.code === "OFFLINE_CACHE_CHANGED" && !readRetried) return offlineDispatch(context, mutate, path, input, true);
    if (requireNetwork || !networkFailure(error2)) throw error2;
    return readCachedOffline(context, path, guard);
  }
}
function mutationActions(context) {
  const { state: state2, cache: cache2, now, uuid: uuid5, outbox } = context;
  async function mutate(path, options3, route2, guard) {
    guard();
    if (!state2.scope || !state2.identity) throw fail4("请先联网读取此工作台，再保存离线内容。", "OFFLINE_SCOPE_REQUIRED");
    const owner2 = state2.scope, generation = context.generation;
    const active5 = () => {
      guard();
      if (owner2 !== state2.scope || generation !== context.generation)
        throw fail4("身份范围已变化，本次修改未保存，输入已保留。", "OFFLINE_SCOPE_CHANGED");
    };
    const body4 = checkedBody(route2, options3, uuid5), id2 = route2.id || body4.id;
    const old = await cache2.entity(route2.type + ":" + id2), base = old?.server || null, visible3 = offlineValue(old);
    active5();
    if (route2.create && route2.type === "todo" && visible3) {
      if (!visible3.deleted_at && !visible3.deleted && visible3.date === body4.date && visible3.text === body4.text && (visible3.template_id || void 0) === (body4.template_id || void 0)) return structuredClone(visible3);
      throw fail4(visible3.date ? `此待办已安排到 ${visible3.date}，原未来待办仍保留。` : "该待办标识已使用，原未来待办仍保留。", "TODO_ID_IN_USE");
    }
    if (!route2.create && !visible3) throw fail4("此事项尚未保存在本机，请联网读取后再操作。", "OFFLINE_CACHE_MISS");
    const stamp4 = new Date(now()).toISOString(), method2 = options3.method.toUpperCase();
    const local = {
      ...visible3,
      ...body4,
      id: id2,
      created_at: visible3?.created_at || stamp4,
      updated_at: stamp4,
      deleted_at: method2 === "DELETE" ? stamp4 : route2.restore ? null : visible3?.deleted_at || null,
      ...route2.create ? { completed: false, ...route2.type === "template" ? { completed_days: 0, habit_status: "todo" } : {} } : {},
      ...route2.restore ? { deleted: false } : {}
    };
    if (body4.template_id) {
      const template = offlineValue(await cache2.entity("template:" + body4.template_id));
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
      body: body4,
      base,
      local,
      ...route2.type === "unscheduled_todo" ? { protocol: 4 } : {},
      assertActive: active5
    });
    active5();
    await context.refresh();
    context.broadcast();
    context.readPauseUntil = 0;
    if (context.online()) context.scheduleRetry();
    return structuredClone(entity.local);
  }
  const call = (path, input, readRetried) => offlineDispatch(context, mutate, path, input, readRetried);
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
    const timer = setInterval(sync, context.windowedSnapshot ? WINDOW_REFRESH_MS : 3e5);
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
      clearTimeout(context.historyTimer);
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
  return { start, stop: () => {
    context.stopped = true;
    clearTimeout(context.historyTimer);
    stop();
  }, broadcast };
}
async function readTodoMonthSnapshot(context, month) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000")) return null;
  if (context.syncFlight) {
    let timer;
    const completed = await Promise.race([
      context.syncFlight.then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), 5e3);
      })
    ]);
    clearTimeout(timer);
    if (!completed) return null;
  }
  const owner2 = context.state.scope, generation = context.generation;
  if (!owner2 || context.state.verifiedScope !== owner2) return null;
  const result = await context.db.transaction(["entities", "meta"], "readonly", async (tx) => {
    let snapshot = await tx.get("meta", entityKey(owner2, "snapshot-v2"));
    const progress = await tx.get("meta", entityKey(owner2, "snapshot-v2-progress"));
    if (progress?.value?.partial && progress.value.index?.scope_id === owner2 && (progress.value.verified_at || 0) >= (snapshot?.value?.verified_at || 0)) {
      if (!progress.value.index.dates.filter((row) => row.date.startsWith(month + "-")).every((row) => progress.value.covered_dates.includes(row.date))) return null;
      snapshot = progress;
    }
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
    const [operations, conflicts] = await Promise.all([tx.getAll("outbox"), tx.getAll("conflicts")]);
    if (operations.some((op) => op.scope === token.scope && ids.includes(op.entity_id) && !["done", "archived"].includes(op.status)) || conflicts.some((conflict) => conflict.scope === token.scope && conflict.resolved_at === null && ids.includes(conflict.operation?.entity_id || conflict.entity_id))) return "pending";
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
    const day9 = await tx.get("meta", entityKey(token.scope, "get:/todos?date=" + encodeURIComponent(todo.date)));
    if (!active5()) throw fail4("数据范围已变化。", "OFFLINE_SCOPE_CHANGED");
    return Array.isArray(day9?.data?.items) ? "saved" : "refresh";
  });
}
async function acceptTodoNote(context, type, row, token) {
  const active5 = () => token && context.state.scope === token.scope && context.state.verifiedScope === token.scope && context.generation === token.generation;
  if (!active5() || !["todo", "unscheduled_todo"].includes(type) || !row?.id || !Number.isSafeInteger(row.version)) return "refresh";
  const id2 = type + ":" + row.id, key = entityKey(token.scope, id2);
  const result = await context.db.transaction(["entities", "outbox", "conflicts"], "readwrite", async (tx) => {
    if (!active5()) return "refresh";
    const [operations, conflicts] = await Promise.all([tx.getAll("outbox"), tx.getAll("conflicts")]);
    if (operations.some((op) => op.scope === token.scope && op.entity_id === id2 && !["done", "archived"].includes(op.status)) || conflicts.some((conflict) => conflict.scope === token.scope && conflict.resolved_at === null && (conflict.operation?.entity_id || conflict.entity_id) === id2)) return "pending";
    const old = await tx.get("entities", key);
    if (!old?.server) return "missing";
    if (old.dirty) return "pending";
    if (old.server.version > row.version) return "refresh";
    const server = { ...old.server, version: row.version, updated_at: row.updated_at || old.server.updated_at };
    if (row.note) server.note = row.note;
    else delete server.note;
    if (typeof row.text === "string" && row.text) server.text = row.text;
    await tx.put("entities", { ...old, server });
    return "saved";
  });
  if (result === "saved" && active5()) {
    await context.refresh();
    context.broadcast();
  }
  return result;
}
async function todoSettled(context, type, todoId) {
  const owner2 = context.state.scope;
  if (!owner2) return true;
  const id2 = type + ":" + todoId;
  const [pending, conflicts] = await Promise.all([context.outbox.list(owner2), context.outbox.conflicts.list(owner2)]);
  return !pending.some((op) => op.entity_id === id2) && !conflicts.some((row) => (row.operation?.entity_id || row.entity_id) === id2);
}
function createOfflineRuntime(options3) {
  const context = runtimeContext(options3);
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
      const deadline = Math.min(context.now() + STORED_COOLDOWN_MAX_MS, retryUntil(context.now(), delay));
      context.cooldownUntil = Math.max(context.cooldownUntil || 0, deadline);
      await context.outbox.setCooldown(token.scope, context.cooldownUntil, active5);
      active5();
      if (!context.stopped) context.scheduleRetry();
    } catch {
    }
  }
  async function callWithRateLimit(path, options4) {
    const token = captureRateLimitContext();
    try {
      return await context.call(path, options4);
    } catch (error2) {
      if (error2.status === 429) await recordRateLimit(token, error2.retryAfterMs);
      throw error2;
    }
  }
  return {
    call: callWithRateLimit,
    sync: context.sync,
    start: context.start,
    stop: context.stop,
    refresh: context.refresh,
    async downloadDate(date2) {
      if (!context.windowedSnapshot) throw fail4("请更新页面后下载历史日期。", "OFFLINE_UPGRADE_REQUIRED");
      await context.verifyScope();
      const result = await context.snapshotV2.pull({ historyDate: date2 });
      await context.refresh();
      return result;
    },
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
    acceptTodoNote: (type, row, token) => acceptTodoNote(context, type, row, token),
    todoSettled: (type, id2) => todoSettled(context, type, id2),
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
async function offlineRequest(path, options3, request2, onIdentity, assertActive = () => {
}) {
  if (!initialization) initialization = openOfflineDB().then((db) => {
    singleton = createOfflineRuntime({ db, request: request2, onIdentity, scopeProbe: true, scopeReuseMs: 3e4, windowedSnapshot: true });
    for (const callback of readyListeners) callback(singleton);
    return singleton;
  });
  let runtime2;
  try {
    runtime2 = await initialization;
  } catch {
    assertActive();
    if (writableRoute(path, options3, OFFLINE_FEATURES) || noteMutationRoute(path, options3, OFFLINE_FEATURES) || OFFLINE_FEATURES.memos && memoRoute(path) && options3.method?.toUpperCase() === "PUT")
      throw fail4("浏览器无法保存本机数据，本次修改未保存；输入已保留。", "OFFLINE_STORAGE_UNAVAILABLE");
    return request2(path, options3);
  }
  assertActive();
  const managed = offlineReadRoute(path) || writableRoute(path, options3, OFFLINE_FEATURES) || noteMutationRoute(path, options3, OFFLINE_FEATURES) || ["/auth/me", "/auth/login", "/auth/logout"].includes(path);
  if (!managed) return runtime2.call(path, { ...options3, offlineGuard: assertActive });
  const { envelope: envelope2 = false, ...opts } = options3;
  const value = await runtime2.call(path, { ...opts, offlineGuard: assertActive });
  return envelope2 ? { data: value } : value;
}
var READ_PAUSE_MAX_MS, OFFLINE_FEATURES, scopePattern, uuidPattern5, networkFailure, fail4, today, offlineError, SCOPE_INDEX, SCOPE_ONLY, singleton, initialization, readyListeners;
var init_runtime = __esm({
  "web/offline/runtime.mjs"() {
    init_db();
    init_cache();
    init_outbox();
    init_sync();
    init_window_sync();
    init_note_mutations();
    init_drafts();
    init_conflict_draft_guards();
    init_memos();
    init_retry_after();
    READ_PAUSE_MAX_MS = 15 * 6e4;
    OFFLINE_FEATURES = Object.freeze({ todos: true, notes: true, memos: true, snapshotV2: true, labelsV1: true });
    scopePattern = /^[a-f0-9]{64}$/;
    uuidPattern5 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
    networkFailure = (error2) => error2?.code === "NETWORK_UNAVAILABLE" || error2?.code === "OFFLINE_NETWORK";
    fail4 = (message, code) => Object.assign(new Error(message), { code });
    today = (now) => new Date(now() + 8 * 36e5).toISOString().slice(0, 10);
    offlineError = () => fail4("当前离线，此操作需联网；输入内容已保留。", "OFFLINE_NETWORK");
    SCOPE_INDEX = "/workbench-snapshot/index", SCOPE_ONLY = "/workbench-snapshot/scope";
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
function apiOptions(options3) {
  const opts = { credentials: "same-origin", ...options3, headers: { Accept: "application/json", ...options3.headers || {} } };
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
  } catch (error2) {
    if (isRequestAbort(error2)) throw error2;
    throw Object.assign(new Error("暂时无法连接网站，请检查网络后重试。"), { code: "NETWORK_UNAVAILABLE" });
  }
  if (response.ok && !["GET", "HEAD"].includes((opts.method || "GET").toUpperCase())) {
    if (["/auth/login", "/auth/logout", "/auth/password"].includes(path)) resetSessionIndexes();
    else clearArticleIndexes();
  }
  let text;
  try {
    text = await response.text();
  } catch (error2) {
    if (isRequestAbort(error2)) throw error2;
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
function apiFailure(path, response, payload, epoch, identity5, suppressAuthRedirect = false) {
  const current3 = epoch === runtime.sessionEpoch && identity5 === (state.me?.id ?? null);
  const ownerOnly = response.status === 401 && state.me?.publicBusiness === true;
  if (response.status === 401 && path !== "/auth/login" && current3 && !suppressAuthRedirect && !ownerOnly) {
    state.me = null;
    closeModal();
    sessionEnded();
  }
  const message = ownerOnly ? "这个操作只有网站所有者能用。" : payload.error?.message || (response.status === 409 ? "记录已更新，请刷新后重新编辑。" : "操作失败，请稍后重试。");
  const error2 = new Error(message);
  error2.status = response.status;
  error2.code = payload.error?.code;
  if (error2.code === "OPENAI_REVIEW_IN_FLIGHT" && typeof payload.error?.run_id === "string") error2.run_id = payload.error.run_id;
  if (error2.code === "OPENAI_CONNECTIVITY_IN_FLIGHT" && typeof payload.error?.test_id === "string") error2.test_id = payload.error.test_id;
  if (response.status === 429) {
    const serverTime = Date.parse(response.serverDate);
    error2.retryAfterMs = retryAfterDelay(parseRetryAfter(response.retryAfter, Number.isFinite(serverTime) ? serverTime : Date.now()));
  }
  if (response.status === 401 && !current3) error2.staleSession = true;
  return error2;
}
async function apiNetwork(path, options3 = {}) {
  const epoch = runtime.sessionEpoch, identity5 = state.me?.id ?? null;
  const rateLimitContext = captureOfflineRateLimitContext();
  const { envelope: envelope2 = false, context, suppressAuthRedirect = false, ...requestOptions } = options3;
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
    const error2 = apiFailure(path, response, payload, epoch, identity5, suppressAuthRedirect);
    if (error2.status === 429 && epoch === runtime.sessionEpoch && identity5 === (state.me?.id ?? null))
      await recordOfflineRateLimit(rateLimitContext, error2.retryAfterMs);
    throw error2;
  }
  return envelope2 ? payload : payload.data;
}
function api(path, options3 = {}) {
  const epoch = runtime.sessionEpoch, identity5 = state.me?.id ?? null;
  const active5 = () => {
    if (epoch !== runtime.sessionEpoch || identity5 !== (state.me?.id ?? null) || options3.signal?.aborted || options3.context?.controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
  };
  return offlineRequest(path, options3, apiNetwork, (me) => {
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
function toast(message, error2 = false) {
  const node3 = document.createElement("div");
  node3.className = `toast${error2 ? " error" : ""}`;
  node3.setAttribute("role", error2 ? "alert" : "status");
  node3.textContent = message;
  $("#toasts").append(node3);
  while ($("#toasts").children.length > 3) $("#toasts").firstElementChild.remove();
  setTimeout(() => node3.remove(), error2 ? 8e3 : 4500);
}

// web/pages/todo-note-field.mjs
init_dom();
function todoNoteField(item, { pending = false, editing = null, error: error2 = "", date: date2 = "", future = false, hasDraft = false } = {}) {
  const active5 = editing?.id === item.id;
  const alert = error2 && (active5 || hasDraft) ? `<span class="todo-note-error" role="alert">${e(error2)}</span>` : "";
  const marker = future ? ` data-future="1"` : "";
  if (active5) {
    const editable = pending ? "false" : "true";
    return `<span class="todo-note-hit todo-note-text todo-note-input" data-todo-note-input role="textbox" contenteditable="${editable}" enterkeyhint="done" spellcheck="false" aria-multiline="false" aria-label="备注" data-id="${e(item.id)}" data-date="${e(date2)}"${marker}>${e(editing.text ?? "")}</span>${alert}`;
  }
  const label = hasDraft ? "恢复备注草稿" : item.note ? "编辑备注" : "添加备注";
  const text = hasDraft ? label : item.note ? `<span class="todo-note-text">${e(item.note)}</span>` : "";
  return `<button class="todo-note-hit${item.note ? "" : " is-empty"}" type="button" data-action="todo-note" data-id="${e(item.id)}" data-date="${e(date2)}"${marker} aria-label="${label}"${pending ? " disabled" : ""}>${text}</button>${alert}`;
}

// shared/todo-period.mjs
var DAY = 864e5;
var parse = (date2) => Date.parse(date2 + "T00:00:00Z");
var iso2 = (time3) => new Date(time3).toISOString().slice(0, 10);
function weekOf(date2) {
  const time3 = parse(date2), weekday2 = (new Date(time3).getUTCDay() + 6) % 7;
  const thursday = new Date(time3 + (3 - weekday2) * DAY), year = thursday.getUTCFullYear();
  const week = 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, "0")}`;
}
var monthOf = (date2) => date2.slice(0, 7);
function weekStart(period) {
  const [year, week] = [Number(period.slice(0, 4)), Number(period.slice(6))];
  const jan4 = Date.UTC(year, 0, 4), weekday2 = (new Date(jan4).getUTCDay() + 6) % 7;
  return iso2(jan4 - weekday2 * DAY + (week - 1) * 7 * DAY);
}
function validPeriod(value) {
  if (typeof value !== "string") return false;
  if (/^\d{4}-W\d{2}$/.test(value)) return Number(value.slice(6)) >= 1 && weekOf(weekStart(value)) === value;
  if (/^\d{4}-\d{2}$/.test(value)) return Number(value.slice(5)) >= 1 && Number(value.slice(5)) <= 12 && value >= "2000-01";
  return false;
}
var nextMonth = (month) => {
  const [year, value] = [Number(month.slice(0, 4)), Number(month.slice(5))];
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, "0")}`;
};
function periodChoices(today2) {
  return {
    week: weekOf(today2),
    next_week: weekOf(iso2(parse(today2) + 7 * DAY)),
    month: monthOf(today2),
    next_month: nextMonth(monthOf(today2))
  };
}
var PERIOD_GROUPS = [["week", "本周"], ["next_week", "下周"], ["month", "本月"], ["next_month", "下个月"], ["none", "不定"]];
function periodGroup(period, today2) {
  if (!validPeriod(period)) return "none";
  const choices = periodChoices(today2);
  if (period.includes("W")) return period <= choices.week ? "week" : period === choices.next_week ? "next_week" : "month";
  return period <= choices.month ? "month" : "next_month";
}
function periodPast(period, today2) {
  if (!validPeriod(period)) return false;
  return period.includes("W") ? period < weekOf(today2) : period < monthOf(today2);
}
var RECURRENCES = ["week", "month"];
var periodFits = (period, recurrence) => validPeriod(period) && recurrence === "week" === period.includes("W");
function nextPeriod(period, recurrence, today2) {
  if (recurrence === "week") {
    const now2 = weekOf(today2), base2 = validPeriod(period) && period.includes("W") && period > now2 ? period : now2;
    return weekOf(iso2(parse(weekStart(base2)) + 7 * DAY));
  }
  const now = monthOf(today2), base = validPeriod(period) && !period.includes("W") && period > now ? period : now;
  return nextMonth(base);
}
var daysUntil = (due, today2) => Math.round((parse(due) - parse(today2)) / DAY);
var DUE_LEAD = 3;
var dueSoon = (due, today2) => typeof due === "string" && daysUntil(due, today2) <= DUE_LEAD;
function dueLabel(due, today2) {
  const days = daysUntil(due, today2), day9 = `${Number(due.slice(5, 7))}/${Number(due.slice(8))}`;
  return days > 0 ? `${day9} 截止 · 还剩 ${days} 天` : days === 0 ? `今天截止` : `${day9} 截止 · 已过期 ${-days} 天`;
}
function dueGroup(due, today2) {
  const choices = periodChoices(today2), week = weekOf(due);
  if (week <= choices.week) return "week";
  if (week === choices.next_week) return "next_week";
  return monthOf(due) <= choices.month ? "month" : "next_month";
}

// shared/todo-parse-hint.mjs
var TODO_PARSE_HINT = /明天|明早|明晚|后天|下周|下星期|下个?月|本周|这周|周[一二三四五六日天末]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|\d{1,2}\s*[号日]|\d{1,2}\s*月|\d{1,2}[/.-]\d{1,2}|每天|每日|天天|每晚|每早|\d+\s*次|[一二两三四五六七八九十]+\s*次|月底|月初|不限次|次数不限|无限次|随时记|礼拜|星期|周末|每周|每个?月|下下|月中|[上中下]旬|年底|年前|年后|过年|春节|国庆|元旦|圣诞|节前|节后|之前|以前|截止|期限|[号日底]前|本月|这个?月/;

// shared/todo-assist-hint.mjs
var NOTE_SUGGEST_HINT = new RegExp(TODO_PARSE_HINT.source + "|要去|得去|该去|想去|打算|准备|记得|别忘|计划|回头|改天|抽空|找时间|有空|约了|预约|报名|提醒|截止|之前|以前|月底|月初|年底|周末|安排|啥时候|什么时候|哪天|要不要|该不该|得把|还得|还没|找个|找人|联系|预订|续费|退订");
var TODO_COMMAND_HINT = new RegExp("删掉|删了|删除|去掉|取消|不用了|不做了|不去了|不看了|不买了|作废|做完了|完成了|搞定了|办完了|办好了|弄完了|看完了|买好了|交了|已经.{0,24}[了完]|退订了|改到|挪到|推到|延到|延后|推迟|提前到|移到|换到|放到");

// web/pages/todo-command.mjs
init_api();
init_format();
async function commandCandidates(dayItems = []) {
  const today2 = dayItems.filter((row) => !row.deleted_at && !row.completed).map((row) => ({ row, item: { id: row.id, text: row.text, where: "today", date: row.date } }));
  let future = [];
  try {
    const data3 = await api("/unscheduled-todos");
    future = (data3.items || []).filter((row) => !row.deleted_at && !row.deleted && !row.completed).map((row) => ({ row, item: { id: row.id, text: row.text, where: "future", ...row.period ? { period: row.period } : {} } }));
  } catch {
  }
  const all = [...today2, ...future].slice(0, 150);
  return { rows: new Map(all.map(({ row, item }) => [item.id, { ...row, where: item.where }])), items: all.map(({ item }) => item) };
}
async function runTodoCommand(proposal, rows) {
  const row = rows.get(proposal.id);
  if (!row) throw new Error("这条待办已经找不到了，请刷新后再说一次");
  const id2 = encodeURIComponent(row.id), today2 = bjtDate();
  if (row.where === "today") {
    if (proposal.action === "complete") {
      await api(`/todos/${id2}`, { method: "PATCH", body: { completed: true, version: row.version } });
      return { message: `已标为完成：${row.text}` };
    }
    if (proposal.action === "delete") {
      const saved = await api(`/todos/${id2}`, { method: "DELETE", body: { date: row.date, version: row.version } });
      return { message: `已删除：${row.text}`, undo: () => api(
        `/todos/${id2}/restore`,
        { method: "POST", body: { date: row.date, version: saved.version } }
      ) };
    }
    await api("/todos", { method: "POST", body: { id: crypto.randomUUID(), date: proposal.date, text: row.text } });
    await api(`/todos/${id2}`, { method: "DELETE", body: { date: row.date, version: row.version } });
    return { message: `已改到 ${proposal.date}：${row.text}` };
  }
  if (proposal.action === "complete") {
    await api(`/unscheduled-todos/${id2}/complete-today`, { method: "POST", body: { date: today2, version: row.version } });
    return { message: `已标为完成：${row.text}` };
  }
  if (proposal.action === "delete") {
    const saved = await api(`/unscheduled-todos/${id2}`, { method: "DELETE", body: { version: row.version } });
    return { message: `已删除：${row.text}`, undo: () => api(
      `/unscheduled-todos/${id2}/restore`,
      { method: "POST", body: { version: saved.version } }
    ) };
  }
  if (proposal.date) {
    await api(`/unscheduled-todos/${id2}/move`, { method: "POST", body: { date: proposal.date, version: row.version } });
    return { message: `已改到 ${proposal.date}：${row.text}` };
  }
  const body4 = { period: proposal.period, version: row.version };
  if (row.recurrence && periodFits(proposal.period, row.recurrence)) body4.recurrence = row.recurrence;
  await api(`/unscheduled-todos/${id2}/period`, { method: "PATCH", body: body4 });
  return { message: `已改到 ${proposal.periodLabel || proposal.period}：${row.text}` };
}

// web/pages/todo-smart.mjs
init_api();
init_format();
var WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
var FUTURE_SCOPE = "future";
var smart = { sentence: "", date: "", status: "", proposal: null, error: "", busy: false, sequence: 0, rows: null, done: null };
var hooks = null;
var el = (tag2, className, text) => {
  const node3 = document.createElement(tag2);
  if (className) node3.className = className;
  if (text !== void 0) node3.textContent = text;
  return node3;
};
var shiftDay = (date2, days) => new Date(Date.parse(date2 + "T00:00:00Z") + days * 864e5).toISOString().slice(0, 10);
function smartDayLabel(date2, today2 = bjtDate()) {
  if (date2 === today2) return "今天";
  if (date2 === shiftDay(today2, 1)) return "明天";
  if (date2 === shiftDay(today2, 2)) return "后天";
  const weekday2 = WEEKDAYS[(/* @__PURE__ */ new Date(date2 + "T00:00:00Z")).getUTCDay()];
  return `${date2.slice(0, 4) === today2.slice(0, 4) ? "" : date2.slice(0, 4) + "年"}${Number(date2.slice(5, 7))}月${Number(date2.slice(8))}日 周${weekday2}`;
}
function smartTodoText(proposal) {
  return proposal.text;
}
function smartTodoNote(proposal) {
  return proposal.count ? `0/${proposal.count} 次` : "";
}
var countLabel = (proposal) => proposal.count === "∞" ? "不限次数" : proposal.count ? `${proposal.count} 次` : "";
var FUTURE_LABEL = {
  this_week: "本周",
  next_week: "下周",
  this_month: "本月",
  next_month: "下个月",
  every_week: "每周重复",
  every_month: "每月重复"
};
function smartTarget(proposal, scope) {
  if (proposal.kind === "daily") return "daily";
  if (proposal.when === "day" && proposal.date) return scope !== FUTURE_SCOPE && proposal.date === scope ? "today" : "day";
  if (FUTURE_LABEL[proposal.when] || proposal.when === "deadline") return "future";
  return scope === FUTURE_SCOPE ? "future" : "today";
}
function smartPlace(proposal, scope, today2 = bjtDate()) {
  const target = smartTarget(proposal, scope);
  if (target === "daily") return "存为常用并加到今天";
  if (target === "today") return `加到 ${smartDayLabel(scope === FUTURE_SCOPE ? today2 : scope, today2)}`;
  if (target === "day") return `加到 ${smartDayLabel(proposal.date, today2)}`;
  if (proposal.when === "deadline") return `加到 未来 · ${Number(proposal.due_date.slice(5, 7))}/${Number(proposal.due_date.slice(8))} 截止`;
  return `加到 未来 · ${FUTURE_LABEL[proposal.when] || "不定"}`;
}
function smartTodoWanted(text) {
  return TODO_PARSE_HINT.test(text) || TODO_COMMAND_HINT.test(text);
}
function smartTodoReady(text, scope) {
  return smart.status === "ready" && smart.sentence === text && !smart.busy && (scope === void 0 || smart.date === scope);
}
function smartTodoActive(scope) {
  return Boolean(smart.status) && smart.date === scope;
}
function clearSmartTodo() {
  smart.sequence++;
  Object.assign(smart, { sentence: "", date: "", status: "", proposal: null, error: "", busy: false, rows: null, done: null });
}
async function startSmartTodo(day9, sentence, given) {
  hooks = given;
  const sequence5 = ++smart.sequence;
  Object.assign(smart, { sentence, date: day9.date, status: "reading", proposal: null, error: "", busy: false });
  hooks.repaint();
  try {
    if (TODO_COMMAND_HINT.test(sentence) && hooks.commandItems) {
      const { rows, items } = await commandCandidates(hooks.commandItems(day9));
      const reading = items.length ? await api("/todo-command", { method: "POST", body: { text: sentence, items } }) : null;
      if (sequence5 !== smart.sequence) return;
      if (reading?.needs_model && reading.action !== "none") {
        Object.assign(smart, { status: "ready", proposal: { ...reading, kind: "command" }, rows });
        hooks.repaint();
        return;
      }
      if (!TODO_PARSE_HINT.test(sentence)) {
        clearSmartTodo();
        hooks.repaint();
        await hooks.plain(day9, sentence);
        return;
      }
    }
    const context = day9.date === FUTURE_SCOPE ? "future" : "today";
    const data3 = await api("/todo-parse", { method: "POST", body: { text: sentence, context } });
    if (sequence5 !== smart.sequence) return;
    if (!data3.needs_model) {
      clearSmartTodo();
      hooks.repaint();
      await hooks.plain(day9, sentence, data3);
      return;
    }
    smart.status = "ready";
    smart.proposal = data3;
  } catch (error2) {
    if (sequence5 !== smart.sequence) return;
    smart.status = "error";
    smart.error = error2?.message || "没能读懂这句话";
  }
  hooks.repaint();
}
async function confirmSmartTodo(day9) {
  const proposal = smart.proposal;
  if (!proposal || smart.busy || !hooks || smart.date !== day9.date) return;
  smart.busy = true;
  smart.error = "";
  hooks.repaint();
  if (proposal.kind === "command") return confirmCommand(day9, proposal);
  const text = smartTodoText(proposal), note = smartTodoNote(proposal), sequence5 = smart.sequence, target = smartTarget(proposal, day9.date);
  try {
    if (target === "daily") await hooks.saveDaily(day9, text, note);
    else if (target === "today") {
      const date2 = day9.date === FUTURE_SCOPE ? bjtDate() : day9.date;
      if (day9.date === FUTURE_SCOPE) await hooks.saveElsewhere(day9, { id: crypto.randomUUID(), date: date2, text }, "今天", note);
      else await hooks.save(day9, { id: crypto.randomUUID(), date: date2, text }, note);
    } else if (target === "day") await hooks.saveElsewhere(day9, { id: crypto.randomUUID(), date: proposal.date, text }, smartDayLabel(proposal.date), note);
    else await hooks.saveFuture(day9, proposal, smartPlace(proposal, day9.date).replace(/^加到 /, ""));
    if (sequence5 === smart.sequence) clearSmartTodo();
  } catch (error2) {
    if (sequence5 === smart.sequence) {
      smart.busy = false;
      smart.error = error2?.message || "添加失败，请稍后再试";
    }
  }
  hooks.repaint();
}
async function confirmCommand(day9, proposal) {
  const sequence5 = smart.sequence;
  try {
    const result = await runTodoCommand(proposal, smart.rows);
    if (sequence5 !== smart.sequence) return;
    hooks.consume?.(day9, smart.sentence);
    Object.assign(smart, { status: "done", busy: false, proposal: null, rows: null, done: result });
    hooks.refresh?.();
    const shown2 = smart.sequence;
    setTimeout(() => {
      if (smart.sequence === shown2 && smart.status === "done") {
        clearSmartTodo();
        hooks?.repaint();
      }
    }, result.undo ? 1e4 : 4e3);
  } catch (error2) {
    if (sequence5 === smart.sequence) {
      smart.busy = false;
      smart.error = error2?.message || "没能完成，请稍后再试";
    }
  }
  hooks.repaint();
}
async function undoCommand() {
  const done3 = smart.done;
  if (!done3?.undo || smart.busy) return;
  smart.busy = true;
  hooks.repaint();
  try {
    await done3.undo();
    Object.assign(smart, { busy: false, done: { message: "已撤销" } });
    hooks.refresh?.();
  } catch (error2) {
    smart.busy = false;
    smart.error = error2?.message || "没能撤销";
  }
  hooks.repaint();
}
var COMMAND_VERB = { delete: "删掉", complete: "标为完成", reschedule: "改到" };
var PERIOD_NAME = (period, today2) => {
  if (!period) return "";
  const choices = periodChoices(today2);
  return { [choices.week]: "本周", [choices.next_week]: "下周", [choices.month]: "本月", [choices.next_month]: "下个月" }[period] || period;
};
function commandSummary(proposal) {
  const place = proposal.where === "today" ? "今日" : "未来", today2 = bjtDate();
  const target = proposal.action !== "reschedule" ? "" : proposal.date ? smartDayLabel(proposal.date, today2) : PERIOD_NAME(proposal.period, today2);
  return [[`${COMMAND_VERB[proposal.action]}${target ? " " + target : ""}`, "todo-smart-day"], [`${place} · ${proposal.text}`, "todo-smart-text"]];
}
async function plainSmartTodo(day9) {
  const sentence = smart.sentence;
  clearSmartTodo();
  hooks.repaint();
  await hooks.plain(day9, sentence);
}
function summary(proposal, scope) {
  const text = smartTodoText(proposal), count3 = countLabel(proposal);
  const parts2 = [[smartPlace(proposal, scope), "todo-smart-day"], [text, "todo-smart-text"]];
  if (count3) parts2.push([`计数：${count3}`, "todo-smart-count"]);
  return parts2;
}
function hint(proposal, scope) {
  if (proposal.kind === "command") return proposal.action === "delete" ? "删除后 10 秒内可以撤销。" : "确认后才会改。";
  if (proposal.kind === "daily") return proposal.count ? "常用里一点就能加到当天，计数会自动从 0 开始。" : "常用里一点就能加到当天，不会自动每天出现。";
  if (smartTarget(proposal, scope) !== "future") return "";
  if (proposal.when === "deadline") return "截止前三天起，每天都会出现在今日，直到你点完成。";
  if (proposal.recurrence) return `做完后会自动出现${proposal.recurrence === "week" ? "下周" : "下个月"}的一条。`;
  return "";
}
function paintSmartTodo(root3, day9) {
  const future = day9.date === FUTURE_SCOPE, id2 = future ? "todo-smart-future" : "todo-smart";
  const form = root3.querySelector(future ? "#todo-future-form" : "#todo-form");
  let row = root3.querySelector("#" + id2);
  if (!smart.status || smart.date !== day9.date || !form) {
    row?.remove();
    return;
  }
  if (!row) {
    row = el("div", "todo-smart");
    row.id = id2;
    row.setAttribute("role", "status");
  }
  if (form.nextElementSibling !== row) form.after(row);
  const key = [smart.sequence, smart.status, smart.busy, smart.error, smart.done?.message || ""].join("|");
  if (row.dataset.key === key) return;
  row.dataset.key = key;
  const parts2 = [];
  if (smart.status === "reading") parts2.push(el("span", "todo-smart-wait", "正在看这句话…"));
  else if (smart.status === "done") parts2.push(el("p", "todo-smart-line", smart.done?.message || ""));
  else if (smart.status === "ready") {
    parts2.push(el("span", "todo-smart-kicker", smart.proposal.kind === "command" ? "AI 理解为：处理已有的待办" : "AI 理解为"));
    const line = el("p", "todo-smart-line");
    const pieces = smart.proposal.kind === "command" ? commandSummary(smart.proposal) : summary(smart.proposal, day9.date);
    for (const [text, className] of pieces) line.append(el("span", className, text));
    parts2.push(line);
    const tip = hint(smart.proposal, day9.date);
    if (tip) parts2.push(el("p", "todo-smart-hint", tip));
  } else parts2.push(el("p", "todo-smart-error", `${smart.error}，可以按原文添加。`));
  if (smart.error && smart.status === "ready") parts2.push(el("p", "todo-smart-error", smart.error));
  const actions2 = el("div", "todo-smart-actions"), button2 = (label, className, run) => {
    const node3 = el("button", className, label);
    node3.type = "button";
    node3.disabled = smart.busy;
    node3.addEventListener("click", run);
    actions2.append(node3);
  };
  const command = smart.proposal?.kind === "command";
  if (smart.status === "done") {
    if (smart.done?.undo) button2(smart.busy ? "正在撤销…" : "撤销", "btn text", () => void undoCommand());
    button2("关闭", "btn text", () => {
      clearSmartTodo();
      hooks?.repaint();
    });
    parts2.push(actions2);
    row.replaceChildren(...parts2);
    return;
  }
  if (smart.status === "ready") button2(smart.busy ? command ? "正在处理…" : "正在添加…" : "确认", "btn primary", () => void confirmSmartTodo(day9));
  if (smart.status !== "reading") button2("按原文添加", "btn text", () => void plainSmartTodo(day9));
  button2("取消", "btn text", () => {
    clearSmartTodo();
    hooks?.repaint();
  });
  parts2.push(actions2);
  row.replaceChildren(...parts2);
}

// shared/todo-period-words.mjs
var WORDS = {
  week: [
    "本周",
    "这周",
    "这个周",
    "本礼拜",
    "这礼拜",
    "这个礼拜",
    "本星期",
    "这星期",
    "这个星期",
    "这一周",
    "这一个礼拜",
    "这一个星期",
    "周末",
    "这周末",
    "本周末",
    "这个周末",
    "这礼拜末"
  ],
  // 每周 / 每月 are repeating plans, not this week or this month: the words stay in the text.
  every_week: ["每周", "每一周", "每个周", "每礼拜", "每个礼拜", "每一个礼拜", "每星期", "每个星期", "每一个星期", "每周末", "每个周末"],
  next_week: [
    "下周",
    "下个周",
    "下一周",
    "下礼拜",
    "下个礼拜",
    "下一个礼拜",
    "下星期",
    "下个星期",
    "下一个星期",
    "下周内",
    "下礼拜内",
    "下周末",
    "下个周末"
  ],
  month: [
    "本月",
    "这月",
    "这个月",
    "这一个月",
    "月底",
    "月末",
    "这个月底",
    "本月底",
    "这个月末",
    "本月末",
    "月中",
    "中旬",
    "下旬",
    "这个月中旬",
    "本月中旬",
    "这个月下旬",
    "本月下旬"
  ],
  every_month: ["每月", "每个月", "每一个月", "每月底", "每个月底", "每月末", "每个月末", "每月初", "每个月初"],
  next_month: [
    "下月",
    "下个月",
    "下一个月",
    "下月初",
    "下个月初",
    "下月底",
    "下个月底",
    "下月末",
    "下个月末",
    "下月中",
    "下个月中",
    "下月中旬",
    "下个月中旬",
    "下月下旬",
    "下个月下旬",
    "下个月上旬",
    "下月上旬"
  ]
};
var PERIOD_WORDS = WORDS;
var ENTRIES = Object.entries(WORDS).flatMap(([key, words]) => words.map((word) => [word, key])).sort((a, b) => b[0].length - a[0].length);
var PATTERN = new RegExp(`(${ENTRIES.map(([word]) => word).join("|")})(?:之前|以前|之内|以内|前|内)?`, "g");
var DAY_AFTER = /^[一二三四五六日天1-7]/;
var EDGE = /^[\s,，.。、;；:：!！~～-]+|[\s,，.。、;；:：!！~～-]+$/g;
function readPeriodWords(sentence) {
  const source = String(sentence ?? "");
  for (const match of source.matchAll(PATTERN)) {
    const after = source.slice(match.index + match[0].length);
    if (DAY_AFTER.test(after) && !/^一(起|下|趟|次|个|些|块|直)/.test(after)) continue;
    if (/(上|上个|上一个|前)$/.test(source.slice(0, match.index))) continue;
    const key = ENTRIES.find(([word]) => word === match[1])[1];
    const rest = (source.slice(0, match.index) + " " + source.slice(match.index + match[0].length)).replace(/\s+/g, " ").replace(EDGE, "").trim();
    return { period: key, text: key.startsWith("every_") ? source.trim() : rest || source.trim() };
  }
  return null;
}

// shared/todo-times.mjs
var MAX_TIMES = 7;
var DIGIT = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7 };
var SPAN = "(一周|一个?礼拜|一个?星期|每周|每个?礼拜|每个?星期|一个?月|每个?月)?";
var TIMES = new RegExp(`${SPAN}\\s*([2-7两二三四五六七])\\s*(?:次|回|遍)`);
var EDGE2 = /^[\s,，.。、;；:：!！~～-]+|[\s,，.。、;；:：!！~～-]+$/g;
function readTimes(sentence) {
  const source = String(sentence ?? ""), match = TIMES.exec(source);
  if (!match) return null;
  const span = match[1] || "", every = !span ? null : /月/.test(span) ? "every_month" : "every_week";
  const keep = span.startsWith("每") ? span : "";
  const text = (source.slice(0, match.index) + keep + source.slice(match.index + match[0].length)).replace(/\s+/g, " ").replace(EDGE2, "").trim();
  return { times: DIGIT[match[2]], every, text: text || source.trim() };
}
var currentPeriod = (recurrence, today2) => recurrence === "week" ? periodChoices(today2).week : monthOf(today2);
var live2 = (item) => item && !item.deleted_at && !item.deleted && ["week", "month"].includes(item.recurrence) && validPeriod(item.period);
var extraOf = (item, recurrence) => item && !item.deleted_at && !item.deleted && !item.recurrence && (item.completed === true || item.completed === 1) && validPeriod(item.period) && (recurrence === "week" ? /W/.test(item.period) : !/W/.test(item.period));
function repeatGroups(items, today2) {
  const groups = /* @__PURE__ */ new Map();
  for (const item of items) {
    if (!live2(item)) continue;
    const key = item.recurrence + "|" + item.text.trim();
    if (!groups.has(key)) groups.set(key, { key, text: item.text.trim(), recurrence: item.recurrence, copies: [] });
    groups.get(key).copies.push(item);
  }
  for (const group of groups.values()) {
    const now = currentPeriod(group.recurrence, today2);
    group.current = now;
    group.done = group.copies.filter((item) => item.period > now);
    group.open = group.copies.filter((item) => item.period <= now).sort((a, b) => a.period < b.period ? -1 : a.period > b.period ? 1 : 0);
    group.times = group.copies.length;
    group.extras = items.filter((item) => extraOf(item, group.recurrence) && item.text.trim() === group.text);
    group.extra = group.extras.filter((item) => item.period === now).length;
  }
  return [...groups.values()];
}
function daysLeft(recurrence, today2) {
  const date2 = /* @__PURE__ */ new Date(today2 + "T00:00:00Z");
  if (recurrence === "week") return 7 - (date2.getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(date2.getUTCFullYear(), date2.getUTCMonth() + 1, 0)).getUTCDate();
  return last - date2.getUTCDate() + 1;
}
function needsNudge(group, today2) {
  const left = group.open.length, days = daysLeft(group.recurrence, today2);
  return left > 0 && (days <= (group.recurrence === "week" ? 2 : 3) || left >= days);
}
var timesLabel = (group) => {
  const span = group.recurrence === "week" ? "本周" : "本月", extra = group.extra || 0;
  if (group.open.length) return `${span} ${group.done.length}/${group.times}`;
  return extra ? `${span} ${group.times + extra}/${group.times}，多做了 ${extra} 次` : `${span}做够了 ${group.times}/${group.times}`;
};
var leftLabel = (group) => `${group.recurrence === "week" ? "本周" : "本月"}还差 ${group.open.length} 次`;

// web/pages/unscheduled-todos.mjs
init_api();
init_dom();
init_state();
init_todos_state();
init_format();
init_runtime();
var ADD_CHOICES = [...PERIOD_GROUPS.slice(0, 4), ["every_week", "每周"], ["every_month", "每月"], PERIOD_GROUPS[4]];
var REPEAT_OF = { every_week: "week", every_month: "month" }, REPEAT_LABEL = { week: "每周", month: "每月" };
function choiceValue(choice, today2 = bjtDate()) {
  const choices = periodChoices(today2), recurrence = REPEAT_OF[choice] || null;
  const period = recurrence === "week" ? choices.week : recurrence === "month" ? choices.month : choices[choice] || null;
  return { period, recurrence };
}
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
  noteError: "",
  picking: {},
  open: "",
  newPeriod: "none",
  manualPeriod: false,
  dues: {}
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
    noteError: "",
    picking: {},
    open: "",
    newPeriod: "none",
    manualPeriod: false,
    dues: {}
  });
  return cache;
}
var visible = () => Boolean(state.me) && state.page === "todos" && state.todoPanel === "future";
var onTodos = () => Boolean(state.me) && state.page === "todos";
function renderUnscheduledTodos() {
  const v = current();
  return `<section id="todo-future" aria-label="未来待办" ${visible() ? "" : "hidden"}>
<form id="todo-future-form" class="daily-todo-form"><label class="sr-only" for="todo-future-text">未来待办</label>
<input id="todo-future-text" class="input" name="text" maxlength="500" required autocomplete="off" placeholder="还没确定日期的事" value="${e(v.draft)}">
<label class="sr-only" for="todo-future-period">大概什么时候</label><select id="todo-future-period" class="input todo-future-period" name="period">` + ADD_CHOICES.map(([key, label]) => `<option value="${key}" ${v.newPeriod === key ? "selected" : ""}>${label}</option>`).join("") + `</select>
<button class="btn primary" type="submit" ${v.pending ? "disabled" : ""}>添加</button></form>
<p id="todo-future-heard" class="todo-future-heard" aria-live="polite">${e(heardText(v))}</p>
<p class="todo-future-help">可以直接说「下周看电影」「每周跑步」「每周两次总结数据」「12月16号之前退订会员」；勾选＝做完了，移到今日；点 ▾ 定日子、改时间或截止日。</p>
<p id="todo-future-status" class="daily-todo-status" role="status"></p><p id="todo-future-error" class="form-message" role="alert"></p>
<ul id="todo-future-items" class="daily-todo-items"></ul></section>`;
}
function futureTodoView() {
  return current();
}
function futureRepainting() {
  return paintingFuture;
}
var shiftDay2 = (date2, days) => new Date(Date.parse(date2 + "T00:00:00Z") + days * 864e5).toISOString().slice(0, 10);
var shortDay = (date2) => `${Number(date2.slice(5, 7))}/${Number(date2.slice(8))}`;
function futureQuickDates(today2 = bjtDate()) {
  const weekday2 = (/* @__PURE__ */ new Date(today2 + "T00:00:00Z")).getUTCDay();
  const third = weekday2 === 5 ? ["周日", shiftDay2(today2, 2)] : weekday2 === 6 ? ["下周六", shiftDay2(today2, 7)] : ["周末", shiftDay2(today2, (6 - weekday2 + 7) % 7 || 7)];
  return [["今天", today2], ["明天", shiftDay2(today2, 1)], third];
}
var GROUP_LABEL = Object.fromEntries(PERIOD_GROUPS);
var WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function dateField(item, v, off) {
  const id2 = e(item.id);
  return `<div class="todo-future-schedule"><input class="input" type="date" data-future-date-id="${id2}" value="${e(v.dates[item.id] || "")}" aria-label="为 ${e(item.text)} 选择日期" ${off}><button class="btn small" type="button" data-action="todo-future-schedule" data-id="${id2}" ${v.pending ? "disabled" : ""}>${v.uncertain[item.id] ? "核实移动结果" : "移至该日期"}</button></div>`;
}
function futurePanel(item, v, off) {
  const id2 = e(item.id), today2 = bjtDate(), choices = periodChoices(today2), mine = item.period || null;
  const days = futureQuickDates(today2).map(([label, date2]) => {
    const name = label === "周末" ? WEEK[6] : label;
    return `<button class="btn small" type="button" data-action="todo-future-quick" data-id="${id2}" data-date="${date2}" aria-label="把 ${e(item.text)} 移到${name}（${shortDay(date2)}）" ${off}>${name} <span class="todo-future-day">${shortDay(date2)}</span></button>`;
  }).join("") + `<button class="btn small text" type="button" data-action="todo-future-pick" data-id="${id2}" ${off}>选日期…</button>`;
  const repeats = [["", "不重复"], ["week", "每周"], ["month", "每月"]].map(([value, label]) => {
    const on = (item.recurrence || "") === value;
    return `<button class="btn small${on ? " is-on" : ""}" type="button" data-action="todo-future-repeat" data-id="${id2}" data-repeat="${value}" aria-pressed="${on}" ${off}>${label}</button>`;
  }).join("");
  const periods = PERIOD_GROUPS.map(([key, label]) => {
    const value = key === "none" ? "" : choices[key], on = (mine || "") === value;
    return `<button class="btn small${on ? " is-on" : ""}" type="button" data-action="todo-future-period" data-id="${id2}" data-period="${value}" aria-pressed="${on}" ${off}>${label}</button>`;
  }).join("");
  return `<div class="todo-future-panel" id="todo-future-panel-${id2}"><div class="todo-future-panel-row"><span class="todo-future-panel-label">定具体日子</span><div class="todo-future-chips">${days}</div></div>` + (v.picking[item.id] ? dateField(item, v, off) : "") + `<div class="todo-future-panel-row"><span class="todo-future-panel-label">大概什么时候</span><div class="todo-future-chips">${periods}</div></div><div class="todo-future-panel-row"><span class="todo-future-panel-label">重复</span><div class="todo-future-chips">${repeats}</div></div>` + (item.recurrence ? timesRow(item, 1, off) : "") + `<div class="todo-future-panel-row"><span class="todo-future-panel-label">截止日（前三天起每天出现在今日）</span><div class="todo-future-schedule"><input class="input" type="date" data-future-due-id="${id2}" value="${e(v.dues[item.id] ?? item.due_date ?? "")}" aria-label="${e(item.text)} 的截止日" ${off}><button class="btn small" type="button" data-action="todo-future-due" data-id="${id2}" ${off}>设为截止日</button>` + (item.due_date ? `<button class="btn small text" type="button" data-action="todo-future-due-clear" data-id="${id2}" ${off}>去掉</button>` : "") + `</div></div><div class="todo-future-panel-foot"><button class="btn small text" type="button" data-action="todo-edit-text" data-id="${id2}" data-future="1" ${off}>修改文字</button><button class="btn small text danger" type="button" data-action="todo-future-delete" data-id="${id2}" ${off}>删除</button></div></div>`;
}
function quickScheduleUnscheduledTodo(id2, date2) {
  if (!validTodoDate(date2)) return;
  current().dates[id2] = date2;
  return scheduleUnscheduledTodo(id2);
}
function pickUnscheduledTodoDate(id2) {
  current().picking[id2] = true;
  paintUnscheduledTodos();
  $(`[data-future-date-id="${CSS.escape(id2)}"]`)?.focus();
}
function toggleUnscheduledTodoPanel(id2) {
  const v = current();
  v.open = v.open === id2 ? "" : id2;
  paintUnscheduledTodos();
}
function timesRow(item, times, off) {
  const span = item.recurrence === "week" ? "每周" : "每月", id2 = e(item.id);
  const chips = Array.from({ length: MAX_TIMES }, (_, i) => i + 1).map((n) => `<button class="btn small${n === times ? " is-on" : ""}" type="button" data-action="todo-future-times" data-id="${id2}" data-times="${n}" aria-pressed="${n === times}" ${off}>${n} 次</button>`).join("");
  return `<div class="todo-future-panel-row"><span class="todo-future-panel-label">${span}做几次（日子不固定，做一次勾一次）</span><div class="todo-future-chips">${chips}</div></div>`;
}
function groupRow(group) {
  const v = current(), lead = group.open[0] || group.copies[0], busy2 = v.pending || group.copies.some((x) => v.uncertain[x.id]), off = busy2 ? "disabled" : "";
  const full = !group.open.length, check2 = `future-check-${lead.id}`, open = v.open === lead.id;
  const panel2 = `<div class="todo-future-panel" id="todo-future-panel-${e(lead.id)}">${timesRow(lead, group.times, off)}<div class="todo-future-panel-foot"><button class="btn small text danger" type="button" data-action="todo-future-delete-all" data-id="${e(lead.id)}" ${off}>删除</button></div></div>`;
  return `<li class="daily-todo-row todo-future-times-row${full ? " is-complete" : ""}${open ? " is-open" : ""}"><label class="daily-todo-check" for="${e(check2)}"><input id="${e(check2)}" type="checkbox" ${full ? `data-future-extra-id="${e(lead.id)}" ${off} aria-label="${e(group.text)} 又做了一次（已做够）"` : `data-future-todo-id="${e(lead.id)}" ${off} aria-label="${e(group.text)} 做了一次"`}></label><div class="daily-todo-main"><label class="daily-todo-text" for="${e(check2)}">${e(group.text)}</label><span class="todo-future-repeat">${REPEAT_LABEL[group.recurrence]} ${group.times} 次</span><span class="todo-future-times${full ? " is-full" : ""}">${timesLabel(group)}</span></div><button class="icon-button todo-future-more" type="button" data-action="todo-future-menu" data-id="${e(lead.id)}" aria-expanded="${open}" aria-controls="todo-future-panel-${e(lead.id)}" aria-label="安排 ${e(group.text)}">▾</button>` + (open ? panel2 : "") + `</li>`;
}
function futureRow(item) {
  if (item.group) return groupRow(item.group);
  const v = current(), busy2 = v.pending || v.uncertain[item.id], off = busy2 ? "disabled" : "", check2 = `future-check-${item.id}`, open = v.open === item.id;
  const note = todoNoteField(item, { pending: busy2, editing: v.noteEdit, error: v.noteError, future: true });
  const badge = item.recurrence ? `<span class="todo-future-repeat">${REPEAT_LABEL[item.recurrence] || ""}</span>` : "";
  const today2 = bjtDate(), due = item.due_date ? `<span class="todo-future-due${dueSoon(item.due_date, today2) ? " is-soon" : ""}${daysUntil(item.due_date, today2) < 0 ? " is-over" : ""}">${dueLabel(item.due_date, today2)}</span>` : "";
  const late = !item.recurrence && !item.due_date && periodPast(item.period, today2) ? `<span class="todo-future-late">${item.period.includes("W") ? "上周" : "上个月"}没做完</span>` : "";
  return `<li class="daily-todo-row${item.completed ? " is-complete" : ""}${open ? " is-open" : ""}"><label class="daily-todo-check" for="${e(check2)}"><input id="${e(check2)}" type="checkbox" data-future-todo-id="${e(item.id)}" ${item.completed ? "checked" : ""} ${off}></label><div class="daily-todo-main"><label class="daily-todo-text" for="${e(check2)}">${e(item.text)}</label>${badge}${due}${late}${note}</div><button class="icon-button todo-future-more" type="button" data-action="todo-future-menu" data-id="${e(item.id)}" aria-expanded="${open}" aria-controls="todo-future-panel-${e(item.id)}" aria-label="安排 ${e(item.text)}">▾</button>` + (v.uncertain[item.id] ? dateField(item, v, "") : open ? futurePanel(item, v, off) : "") + `</li>`;
}
function futureGroups(items, today2 = bjtDate()) {
  const groups = new Map(PERIOD_GROUPS.map(([key]) => [key, []]));
  for (const item of items) groups.get(item.due_date ? dueGroup(item.due_date, today2) : periodGroup(item.period, today2)).push(item);
  for (const rows of groups.values()) rows.sort((a, b) => (a.due_date || "9999") < (b.due_date || "9999") ? -1 : (a.due_date || "9999") > (b.due_date || "9999") ? 1 : 0);
  return [...groups].filter(([, rows]) => rows.length);
}
function collapseTimes(rows, today2 = bjtDate()) {
  const multi = repeatGroups(rows, today2).filter((group) => group.times > 1), taken = /* @__PURE__ */ new Map();
  for (const group of multi) for (const copy of [...group.copies, ...group.extras]) taken.set(copy.id, group);
  const out = [], seen = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const group = taken.get(row.id);
    if (!group) {
      out.push(row);
      continue;
    }
    if (seen.has(group.key) || !group.copies.includes(row)) continue;
    seen.add(group.key);
    out.push({ id: (group.open[0] || group.copies[0]).id, text: group.text, period: group.current, group });
  }
  return out;
}
function paintUnscheduledTodos() {
  paintingFuture = true;
  try {
    paintFutureList();
    paintDueList();
  } finally {
    paintingFuture = false;
  }
}
function paintFutureList() {
  const v = current(), root3 = $("#todo-future");
  if (!root3) return;
  root3.hidden = !visible();
  const input = $("#todo-future-text", root3), button2 = $("#todo-future-form button", root3), status = $("#todo-future-status", root3), error2 = $("#todo-future-error", root3), list3 = $("#todo-future-items", root3);
  if (input && document.activeElement !== input && input.value !== v.draft) input.value = v.draft;
  if (button2) button2.disabled = v.pending;
  if (status) status.textContent = v.notice || (v.loading && !v.loaded ? "" : v.loaded && v.items.length === 0 ? "还没有未来待办。" : "");
  if (error2) error2.textContent = v.error;
  const live3 = document.activeElement;
  const keep = live3?.matches?.('[data-todo-note-input][data-future="1"]') && live3.isConnected && v.noteEdit?.id === live3.dataset.id;
  const rows = collapseTimes(v.items.filter((x) => !x.deleted_at && !x.deleted)), groups = futureGroups(rows), only = groups.length === 1 && groups[0][0] === "none";
  if (list3 && !keep) list3.innerHTML = groups.map(([key, items]) => (only ? "" : `<li class="todo-future-group" role="presentation">${GROUP_LABEL[key]}<span class="todo-future-count">${items.length}</span></li>`) + items.map(futureRow).join("")).join("");
  paintSmartTodo(root3, { date: FUTURE_SCOPE });
}
function dueTodos(items, today2 = bjtDate()) {
  return items.filter((x) => !x.deleted_at && !x.deleted && !x.completed && dueSoon(x.due_date, today2)).sort((a, b) => a.due_date < b.due_date ? -1 : 1);
}
function paintDueList() {
  const list3 = $("#todo-due");
  if (!list3) return;
  const v = current(), today2 = bjtDate(), show = !state.todoPanel && (!state.todoDate || state.todoDate === today2);
  const due = show ? dueTodos(v.items, today2) : [], dueIds = new Set(due.map((x) => x.id));
  const nudges = show ? repeatGroups(v.items, today2).filter((group) => needsNudge(group, today2) && !group.open.some((x) => dueIds.has(x.id))) : [];
  const html = due.map((item) => {
    const check2 = `due-check-${item.id}`, busy2 = v.pending || v.uncertain[item.id], over = daysUntil(item.due_date, today2) < 0;
    return `<li class="daily-todo-row todo-due-row${over ? " is-over" : ""}"><label class="daily-todo-check" for="${e(check2)}"><input id="${e(check2)}" type="checkbox" data-future-todo-id="${e(item.id)}" ${busy2 ? "disabled" : ""}></label><div class="daily-todo-main"><label class="daily-todo-text" for="${e(check2)}">${e(item.text)}</label><span class="todo-future-due is-soon${over ? " is-over" : ""}">${dueLabel(item.due_date, today2)}</span></div></li>`;
  }).join("") + nudges.map((group) => {
    const lead = group.open[0], check2 = `due-check-${lead.id}`, busy2 = v.pending || v.uncertain[lead.id];
    return `<li class="daily-todo-row todo-due-row todo-due-times"><label class="daily-todo-check" for="${e(check2)}"><input id="${e(check2)}" type="checkbox" data-future-todo-id="${e(lead.id)}" ${busy2 ? "disabled" : ""} aria-label="${e(group.text)} 做了一次"></label><div class="daily-todo-main"><label class="daily-todo-text" for="${e(check2)}">${e(group.text)}</label><span class="todo-future-due is-soon">${leftLabel(group)}${group.times > 1 ? `（${group.done.length}/${group.times}）` : ""}</span></div></li>`;
  }).join("");
  if (list3.innerHTML !== html) list3.innerHTML = html;
  list3.hidden = !html;
}
async function loadDueTodos() {
  if (!onTodos() || state.todoPanel || state.todoDate && state.todoDate !== bjtDate()) return;
  const v = current(), key = v.owner;
  if (v.loading || v.loaded) return paintDueList();
  v.loading = true;
  try {
    const data3 = await api("/unscheduled-todos");
    if (v.owner !== key || owner() !== key || !Array.isArray(data3.items)) return;
    v.items = data3.items;
    v.loaded = true;
  } catch {
  } finally {
    if (v.owner === key && owner() === key) {
      v.loading = false;
      paintUnscheduledTodos();
    }
  }
}
function refreshFutureTodos() {
  current().loaded = false;
  void loadUnscheduledTodos();
  void loadDueTodos();
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
  } catch (error2) {
    if (v.owner === key && owner() === key && !error2.staleSession && error2.name !== "AbortError") v.error = error2.message;
  } finally {
    if (v.owner === key && owner() === key) {
      v.loading = false;
      paintUnscheduledTodos();
    }
  }
}
var GROUP_NAME = Object.fromEntries(ADD_CHOICES);
function heardText(v) {
  if (smartTodoActive(FUTURE_SCOPE)) return "";
  const times = readTimes(v.draft);
  if (times && REPEAT_OF[v.newPeriod]) {
    const span = v.newPeriod === "every_week" ? "周" : "月";
    return `认出「每${span} ${times.times} 次」，会存成「${times.text}」：本${span}做 ${times.times} 次，做一次勾一次，下${span === "周" ? "周" : "个月"}重新算`;
  }
  const heard = readPeriodWords(v.draft);
  if (!heard || v.newPeriod !== heard.period) return "";
  return REPEAT_OF[heard.period] ? `认出「${GROUP_NAME[heard.period]}」重复，做完会自动出现${heard.period === "every_week" ? "下周" : "下个月"}的一条` : `认出「${GROUP_NAME[heard.period]}」，会存成「${heard.text}」`;
}
function paintHeard(v) {
  const select = $("#todo-future-period"), line = $("#todo-future-heard");
  if (select && select.value !== v.newPeriod) select.value = v.newPeriod;
  if (line) line.textContent = heardText(v);
}
function inputUnscheduledTodo(el3) {
  if (el3.id === "todo-future-text") {
    const v = current();
    v.draft = el3.value;
    if (!v.manualPeriod) v.newPeriod = readPeriodWords(el3.value)?.period || readTimes(el3.value)?.every || "none";
    paintHeard(v);
  }
  if (el3.id === "todo-future-period") {
    const v = current();
    v.newPeriod = el3.value;
    v.manualPeriod = true;
    paintHeard(v);
  }
  if (el3.dataset?.futureDateId) current().dates[el3.dataset.futureDateId] = el3.value;
  if (el3.dataset?.futureDueId) current().dues[el3.dataset.futureDueId] = el3.value;
}
function moved(row, date2, source, todo, complete = false) {
  const completed = complete ? true : row.completed;
  return source?.id === row.id && source.text === row.text && source.version === row.version + 1 && source.completed === completed && typeof source.deleted_at === "string" && todo?.id === row.id && todo.date === date2 && todo.text === row.text && todo.deleted_at === null && Number.isSafeInteger(todo.version) && todo.version >= 1 && todo.completed === completed && Number.isFinite(Date.parse(todo.created_at)) && Number.isFinite(Date.parse(todo.updated_at));
}
function unchanged(row, source) {
  return source?.id === row.id && source.text === row.text && source.version === row.version && source.completed === row.completed && source.deleted_at === null;
}
async function verifyFutureMove(row, date2, { readSource, readDay, guard = () => {
}, complete = false }) {
  try {
    const source = await readSource(row.id);
    guard();
    const day9 = await readDay(date2);
    guard();
    const todo = Array.isArray(day9?.items) ? day9.items.find((item) => item.id === row.id) : null;
    if (moved(row, date2, source, todo, complete)) return { state: "confirmed", source, todo };
    const compatible = !todo || todo.date === date2 && todo.text === row.text && (complete || todo.completed === row.completed) && todo.deleted_at === null && !todo.template_id;
    return unchanged(row, source) && day9?.date === date2 && Array.isArray(day9.items) && compatible ? { state: "retryable" } : { state: "unknown", source };
  } catch {
    return { state: "unknown" };
  }
}
async function planFutureMove(row, date2, { checkReady, move, readSource, readDay, guard = () => {
}, priorUncertain = false, complete = false }) {
  if (!validTodoDate(date2)) return { state: "not_started", reason: "请选择有效日期" };
  try {
    await checkReady(row);
    guard();
  } catch (error2) {
    if (error2.staleSession) return { state: "cancelled" };
    if (priorUncertain) return { state: "unknown" };
    if (error2.status === 429 || error2.code === "NETWORK_UNAVAILABLE" || error2.name === "AbortError")
      return { state: "not_started", reason: error2.message || "请稍后重试" };
    try {
      const source = await readSource(row.id);
      guard();
      if (source?.id === row.id && source.deleted_at === null) return { state: "failed", reason: error2.message || "暂时无法核对数据" };
    } catch {
    }
    return { state: "not_started", reason: error2.message || "暂时无法核对数据" };
  }
  try {
    const result2 = await move(row.id, { date: date2, version: row.version });
    guard();
    if (moved(row, date2, result2?.source, result2?.todo, complete)) return { state: "confirmed", ...result2 };
  } catch (error2) {
    if (error2.staleSession) return { state: "unknown" };
    if (error2.status === 429) return priorUncertain ? { state: "unknown" } : { state: "not_started", reason: error2.message || "请求较多，请稍后重试" };
    if (!priorUncertain && error2.status >= 400 && error2.status < 500 && ![408, 425].includes(error2.status)) {
      try {
        const source = await readSource(row.id);
        guard();
        if (source?.id === row.id && source.deleted_at === null) return { state: "failed", reason: error2.message || "请稍后重试" };
      } catch {
      }
    }
  }
  const result = await verifyFutureMove(row, date2, { readSource, readDay, guard, complete });
  return result.state === "retryable" ? { state: "unknown" } : result;
}
function timedNetwork(path, options3 = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12e3);
  return apiNetwork(path, { ...options3, signal: controller.signal }).finally(() => clearTimeout(timer));
}
function formatMovedDate(date2) {
  const [, month, day9] = date2.split("-");
  return `${Number(month)}月${Number(day9)}日`;
}
async function scheduleUnscheduledTodo(id2, { complete = false } = {}) {
  if (!onTodos()) return;
  const v = current(), key = v.owner, row = v.items.find((item) => item.id === id2 && !item.deleted_at && !item.deleted);
  if (!row || v.pending) return;
  const unresolved2 = v.uncertain[id2], original = unresolved2?.row || structuredClone(row), finishing = unresolved2?.complete ?? complete, date2 = unresolved2?.date || (finishing ? bjtDate() : v.dates[id2] || "");
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
  const readDay = (day9) => timedNetwork("/todos?date=" + encodeURIComponent(day9));
  const services = {
    guard,
    readSource,
    readDay,
    complete: finishing,
    move: (sourceId, body4) => timedNetwork("/unscheduled-todos/" + encodeURIComponent(sourceId) + (finishing ? "/complete-today" : "/move"), { method: "POST", body: body4 }),
    async checkReady(item) {
      guard();
      const index = await timedNetwork("/workbench-snapshot/scope");
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
      const latest2 = await offline.queue();
      guard();
      if (pending(latest2)) throw new Error("该待办有未同步内容，请同步后重试");
    }
  };
  try {
    let result;
    if (unresolved2) {
      result = await verifyFutureMove(original, date2, services);
      if (result.state === "retryable") result = await planFutureMove(original, date2, { ...services, priorUncertain: true });
    } else result = await planFutureMove(original, date2, services);
    if (v.owner !== key || owner() !== key) return;
    try {
      guard();
    } catch {
      return;
    }
    if (result.state === "confirmed") {
      delete v.uncertain[id2];
      v.items = v.items.filter((item) => item.id !== id2);
      if (result.next?.id && !v.items.some((item) => item.id === result.next.id)) v.items = [...v.items, result.next];
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
        const day9 = todosState.days.get(date2);
        if (day9) {
          mergeTodo(day9, result.todo);
          day9.revision++;
        }
      }
      const note = cacheStatus === "pending" ? "；本地仍有待处理内容，请在设置中处理" : cacheStatus === "saved" ? "" : "；本地缓存待刷新";
      toast(`已移至 ${formatMovedDate(date2)}${note}`);
    } else if (result.state === "failed") {
      toast(`移动失败，原项已保留：${result.reason}`, true);
    } else if (result.state === "not_started") {
      toast(`未执行移动：${result.reason}`, true);
    } else if (result.state === "cancelled") {
      return;
    } else {
      v.uncertain[id2] = { row: original, date: date2, complete: finishing };
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
var bridge = null;
function setFutureBridge(given) {
  bridge = given;
}
var FUTURE_DAY = { date: FUTURE_SCOPE };
var done = (v, typed, message) => {
  if (v.draft.trim() === typed) {
    v.draft = "";
    v.newPeriod = "none";
    v.manualPeriod = false;
    paintHeard(v);
  }
  const input = $("#todo-future-text");
  if (input && input.value.trim() === typed) input.value = "";
  if (message) {
    v.notice = message;
    toast(message);
  }
};
var futureHooks = {
  repaint: () => paintUnscheduledTodos(),
  plain: (day9, text) => addTyped(text, "none"),
  commandItems: () => bridge?.todayItems?.() || [],
  consume: (day9, sentence) => done(current(), sentence),
  refresh: () => {
    refreshFutureTodos();
    bridge?.refreshToday?.();
  },
  async saveElsewhere(day9, request2, label, note) {
    const v = current();
    await bridge.toDay(request2, note);
    done(v, smartSentence(v), `已添加到 ${label}`);
  },
  async saveDaily(day9, text, note) {
    const v = current();
    await bridge.daily(text, note);
    done(v, smartSentence(v), "已存为常用并加到今天");
  },
  async saveFuture(day9, proposal, label) {
    const v = current();
    await addFutureTodo(proposal);
    done(v, smartSentence(v), `已加到 ${label}`);
  }
};
var smartSentence = (v) => v.smartTyped || "";
async function submitUnscheduledTodo({ data: data3 }) {
  if (!visible()) return;
  const v = current(), typed = String(data3.text || "").trim();
  if (v.pending) return;
  if (!typed || typed.length > 500) {
    v.error = "请填写 1–500 字的内容。";
    paintUnscheduledTodos();
    return;
  }
  const times = readTimes(typed);
  if (times && (times.every || readPeriodWords(typed)?.period?.startsWith("every_") || REPEAT_OF[data3.period])) return addTyped(typed, String(data3.period || "none"));
  if (!v.manualPeriod && smartTodoReady(typed, FUTURE_SCOPE)) return confirmSmartTodo(FUTURE_DAY);
  if (!v.manualPeriod && smartTodoWanted(typed)) {
    v.smartTyped = typed;
    v.error = "";
    return startSmartTodo(FUTURE_DAY, typed, futureHooks);
  }
  return addTyped(typed, String(data3.period || "none"));
}
async function addTyped(typed, choice) {
  const v = current(), key = v.owner, heard = readPeriodWords(typed);
  if (choice === "none" && !v.manualPeriod && heard) choice = heard.period;
  const counted = readTimes(typed);
  if (choice === "none" && !v.manualPeriod && counted?.every) choice = counted.every;
  const { period, recurrence } = choiceValue(choice), times = recurrence && counted ? counted.times : 1;
  const text = times > 1 ? counted.text : heard && heard.period === choice ? heard.text : typed;
  if (!v.request || v.request.text !== text) v.request = { id: crypto.randomUUID(), text };
  const submitted = v.request;
  v.pending = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const row = await api("/unscheduled-todos", { method: "POST", body: submitted });
    if (v.owner !== key || owner() !== key) return;
    v.items = [...v.items.filter((x) => x.id !== row.id), period ? { ...row, period, ...recurrence ? { recurrence } : {} } : row];
    v.request = null;
    done(v, typed);
    if (period) void addMeta(row.id, recurrence ? { period, recurrence } : { period }, key);
    for (let i = 1; i < times; i++) await addFutureTodo({ text, period, recurrence });
    if (times > 1) toast(`已加：${text}，${recurrence === "week" ? "每周" : "每月"} ${times} 次`);
  } catch (error2) {
    if (v.owner === key && owner() === key && !error2.staleSession) v.error = error2.message;
  } finally {
    if (v.owner === key && owner() === key) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
async function addFutureTodo(proposal) {
  const counted = proposal.recurrence && readTimes(proposal.text);
  if (counted && counted.times > 1) {
    const one = { ...proposal, text: counted.text };
    let first = null;
    for (let i = 0; i < counted.times; i++) {
      const row = await addOne(one);
      first ??= row;
    }
    return first;
  }
  return addOne(proposal);
}
async function addOne(proposal) {
  const v = current(), key = v.owner, change3 = { period: proposal.period || null };
  if (proposal.recurrence) change3.recurrence = proposal.recurrence;
  if (proposal.due_date) change3.due_date = proposal.due_date;
  const row = await api("/unscheduled-todos", { method: "POST", body: { id: crypto.randomUUID(), text: proposal.text } });
  if (v.owner !== key || owner() !== key) return row;
  v.items = [...v.items.filter((x) => x.id !== row.id), { ...row, ...Object.fromEntries(Object.entries(change3).filter(([, value]) => value)) }];
  paintUnscheduledTodos();
  if (change3.period || change3.recurrence || change3.due_date) void addMeta(row.id, change3, key);
  return row;
}
var transient = (error2) => error2.status === 404 || error2.status === 409 || error2.status === 429 || error2.status >= 500 || error2.code === "NETWORK_UNAVAILABLE" || !error2.status;
var same2 = (saved, change3) => Object.entries(change3).every(([name, value]) => (saved[name] ?? null) === value);
async function addMeta(id2, change3, key) {
  const v = current(), live3 = () => v.owner === key && owner() === key, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let last = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt) await wait(Math.min(400 * attempt, 2e3));
    const row = v.items.find((x) => x.id === id2);
    if (!row || !live3()) return;
    try {
      const saved = await api("/unscheduled-todos/" + encodeURIComponent(id2));
      if (!live3()) return;
      if (same2(saved, change3)) {
        v.items = v.items.map((x) => x.id === id2 ? saved : x);
        paintUnscheduledTodos();
        return;
      }
      const updated = await api("/unscheduled-todos/" + encodeURIComponent(id2) + "/period", { method: "PATCH", body: { ...change3, version: saved.version } });
      if (live3()) {
        v.items = v.items.map((x) => x.id === id2 ? updated : x);
        paintUnscheduledTodos();
      }
      return;
    } catch (error2) {
      last = error2;
      if (error2.staleSession || !transient(error2)) break;
    }
  }
  undo(id2, key, last);
}
function undo(id2, key, error2) {
  const v = current();
  if (v.owner !== key || owner() !== key) return;
  v.items = v.items.map((x) => {
    if (x.id !== id2) return x;
    const { period, recurrence, due_date, ...rest } = x;
    return rest;
  });
  v.error = `时间没保存上，这条先放在「不定」，可以点 ▾ 再选一次（${error2?.message || "请稍后再试"}）`;
  paintUnscheduledTodos();
}
async function change(id2, method2, body4) {
  if (!visible()) return;
  const v = current(), key = v.owner, row = v.items.find((x) => x.id === id2);
  if (!row || v.pending) return;
  v.pending = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const updated = await api("/unscheduled-todos/" + encodeURIComponent(id2), { method: method2, body: { ...body4, version: row.version } });
    if (v.owner === key && owner() === key) v.items = v.items.map((x) => x.id === id2 ? updated : x);
  } catch (error2) {
    if (v.owner === key && owner() === key && !error2.staleSession) v.error = error2.message;
  } finally {
    if (v.owner === key && owner() === key) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
function toggleUnscheduledTodo(el3) {
  return el3.checked ? scheduleUnscheduledTodo(el3.dataset.futureTodoId, { complete: true }) : change(el3.dataset.futureTodoId, "PATCH", { completed: false });
}
function deleteUnscheduledTodo(id2) {
  const v = current();
  if (v.open === id2) v.open = "";
  return change(id2, "DELETE", {});
}
function setUnscheduledTodoRepeat(id2, repeat) {
  const v = current(), row = v.items.find((x) => x.id === id2);
  if (!row) return;
  const recurrence = repeat || null, choices = periodChoices(bjtDate());
  const period = !recurrence ? row.period || null : periodFits(row.period, recurrence) ? row.period : recurrence === "week" ? choices.week : choices.month;
  return savePeriod(id2, { period, recurrence });
}
function setUnscheduledTodoDue(id2, clear = false) {
  const v = current(), row = v.items.find((x) => x.id === id2);
  if (!row) return;
  const value = clear ? null : v.dues[id2] ?? row.due_date ?? "";
  if (!clear && !validTodoDate(value)) {
    v.error = "请先选一个截止日。";
    paintUnscheduledTodos();
    return;
  }
  delete v.dues[id2];
  return savePeriod(id2, { period: row.period || null, due_date: value });
}
function setUnscheduledTodoPeriod(id2, period) {
  const row = current().items.find((x) => x.id === id2);
  if (!row) return;
  return savePeriod(id2, { period: period || null });
}
async function savePeriod(id2, change3) {
  if (!visible()) return;
  const v = current(), key = v.owner, row = v.items.find((x) => x.id === id2);
  if (!row || v.pending) return;
  if (same2(row, change3)) {
    v.open = "";
    paintUnscheduledTodos();
    return;
  }
  v.pending = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const updated = await api("/unscheduled-todos/" + encodeURIComponent(id2) + "/period", { method: "PATCH", body: { ...change3, version: row.version } });
    if (v.owner === key && owner() === key) {
      v.items = v.items.map((x) => x.id === id2 ? updated : x);
      v.open = "";
    }
  } catch (error2) {
    if (v.owner === key && owner() === key && !error2.staleSession) v.error = error2.message;
  } finally {
    if (v.owner === key && owner() === key) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
async function setUnscheduledTodoTimes(id2, times) {
  const v = current(), key = v.owner, row = v.items.find((x) => x.id === id2);
  if (!row || !row.recurrence || v.pending || !Number.isInteger(times) || times < 1 || times > MAX_TIMES) return;
  const group = repeatGroups(v.items, bjtDate()).find((g) => g.copies.some((x) => x.id === id2));
  if (!group) return;
  if (times === group.times) {
    v.open = "";
    paintUnscheduledTodos();
    return;
  }
  v.pending = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    if (times > group.times) {
      v.pending = false;
      for (let i = group.times; i < times; i++) {
        await addOne({ text: group.text, period: group.current, recurrence: group.recurrence });
        if (v.owner !== key || owner() !== key) return;
      }
    } else {
      const drop = [...group.open].reverse().concat([...group.done].reverse()).slice(0, group.times - times);
      for (const copy of drop) await removeCopy(copy, key);
    }
    if (v.owner === key && owner() === key) {
      v.open = "";
      toast(`改成${group.recurrence === "week" ? "每周" : "每月"} ${times} 次`);
    }
  } catch (error2) {
    if (v.owner === key && owner() === key && !error2.staleSession) v.error = error2.message;
  } finally {
    if (v.owner === key && owner() === key) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
async function removeCopy(copy, key) {
  const v = current(), latest2 = v.items.find((x) => x.id === copy.id) || copy;
  const updated = await api("/unscheduled-todos/" + encodeURIComponent(copy.id), { method: "DELETE", body: { version: latest2.version } });
  if (v.owner === key && owner() === key) v.items = v.items.map((x) => x.id === copy.id ? updated : x);
}
async function deleteUnscheduledTodoTimes(id2) {
  const v = current(), key = v.owner;
  if (v.pending) return;
  const group = repeatGroups(v.items, bjtDate()).find((g) => g.copies.some((x) => x.id === id2));
  if (!group) return deleteUnscheduledTodo(id2);
  v.pending = true;
  v.error = "";
  v.open = "";
  paintUnscheduledTodos();
  try {
    for (const copy of [...group.copies, ...group.extras]) await removeCopy(copy, key);
  } catch (error2) {
    if (v.owner === key && owner() === key && !error2.staleSession) v.error = error2.message;
  } finally {
    if (v.owner === key && owner() === key) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
}
async function addUnscheduledTodoExtra(el3) {
  const v = current(), key = v.owner, id2 = el3.dataset.futureExtraId, today2 = bjtDate();
  const group = repeatGroups(v.items, today2).find((g) => g.copies.some((x) => x.id === id2));
  if (!group || group.open.length || v.pending) {
    el3.checked = false;
    return;
  }
  v.pending = true;
  v.error = "";
  paintUnscheduledTodos();
  try {
    const made = await api("/unscheduled-todos", { method: "POST", body: { id: crypto.randomUUID(), text: group.text } });
    if (v.owner !== key || owner() !== key) return;
    v.items = [...v.items.filter((x) => x.id !== made.id), { ...made, completed: true, period: group.current }];
    await addMeta(made.id, { period: group.current }, key);
    const pause2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let attempt = 0; ; attempt++) {
      const latest2 = await api("/unscheduled-todos/" + encodeURIComponent(made.id));
      try {
        const row = await api("/unscheduled-todos/" + encodeURIComponent(made.id), { method: "PATCH", body: { completed: true, version: latest2.version } });
        if (v.owner === key && owner() === key) v.items = v.items.map((x) => x.id === row.id ? row : x);
        break;
      } catch (error2) {
        if (attempt >= 5 || !transient(error2)) throw error2;
        await pause2(500 * (attempt + 1));
      }
    }
    const todo = await api("/todos", { method: "POST", body: { id: crypto.randomUUID(), date: today2, text: group.text } });
    await api("/todos/" + encodeURIComponent(todo.id), { method: "PATCH", body: { completed: true, version: todo.version } });
    if (v.owner === key && owner() === key) toast(`又做了一次：${group.text}`);
  } catch (error2) {
    if (v.owner === key && owner() === key && !error2.staleSession) v.error = error2.message;
  } finally {
    if (v.owner === key && owner() === key) {
      v.pending = false;
      paintUnscheduledTodos();
    }
  }
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
var PAGE_REDIRECTS = Object.freeze({
  overview: "review",
  dashboard: "review",
  articles: "review",
  reviews: "review",
  reminders: "ai-reports",
  "ai-diagnosis": "ai-reports",
  memos: "notes"
});
var ROUTE_MANAGED_PARAMS = Object.freeze([
  "date",
  "notes_category",
  "memo_view",
  "period",
  "article_scope",
  "q",
  "ai_tab",
  "diagnosis_tab",
  "openai_run",
  "todo_panel",
  "tab",
  "account",
  ...Object.keys(defaultFilters()),
  "list_page",
  "page_size",
  "top_n",
  "top_platform",
  "columns"
]);
var REVIEW_ONLY_PARAMS = Object.freeze([
  "review_view",
  "review_date",
  "review_period",
  "review_article",
  "review_version",
  "review_compare",
  "review_section"
]);
function mobilePage(page) {
  return PAGE_REDIRECTS[page] || page;
}
function isMobileLayout() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") return window.matchMedia("(max-width: 767px)").matches;
  return Number.isFinite(window.innerWidth) && window.innerWidth < 768;
}
function pageRouteParams() {
  if (state.page === "todos") return { date: state.todoDate || "", todo_panel: state.todoPanel || "" };
  if (state.page === "notes") {
    return { date: dailyNotesRouteDate(), notes_category: dailyNotesRouteCategory() === "work" ? "work" : "" };
  }
  if (state.page === "ai-reports") return { date: state.aiDailyDate || "", ai_tab: state.aiDailyTab || "reports", account: state.account || "V字" };
  if (state.page === "settings") return { tab: state.settingsTab };
  if (state.page === "review") return { account: state.account || "V字" };
  return {};
}
function updateRoute(push = false, { exitReviewArchive = false } = {}) {
  const page = mobilePage(state.page), redirected = page !== state.page;
  if (redirected) state.page = page;
  state.filters.status = "published";
  const u = new URL(location.href);
  u.searchParams.set("page", state.page);
  if (u.hash === "#openai-review-panel") u.hash = "";
  const activeParams = pageRouteParams();
  for (const key of ROUTE_MANAGED_PARAMS) u.searchParams.delete(key);
  for (const [key, value] of Object.entries(activeParams)) {
    if (value) u.searchParams.set(key, value);
  }
  if (state.page !== "review") {
    for (const key of REVIEW_ONLY_PARAMS) u.searchParams.delete(key);
  } else if (exitReviewArchive && u.searchParams.get("review_section") === "archive") {
    u.searchParams.delete("review_section");
  }
  history[push && !redirected ? "pushState" : "replaceState"]({}, "", u);
  storage.set("haoduoyu.account", state.account);
}
function resolvedSettingsTab(raw, tabParam) {
  if (Object.hasOwn(legacyPages, raw)) return legacyPages[raw];
  if (tabParam === "keys" || tabParam === "openai") return "ai";
  return Object.hasOwn(settingsTabs, tabParam) ? tabParam : "todo";
}
function readRoute() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("page");
  const isLegacySettings = Object.hasOwn(legacyPages, raw);
  const mapped = mobilePage(raw);
  state.page = isLegacySettings ? "settings" : nav.some((n) => n.id === mapped) ? mapped : "review";
  const legacyWeekly = state.page === "review" && (params.get("review_section") === "weekly" || params.get("review_view") === "weekly");
  if (legacyWeekly) state.page = "ai-reports";
  if (state.page === "notes") {
    setDailyNotesRouteDate(params.get("date"));
    setDailyNotesRouteCategory(params.get("notes_category"));
  }
  state.aiDailyTab = legacyWeekly ? "weekly" : ["reports", "weekly"].includes(params.get("ai_tab")) ? params.get("ai_tab") : "reports";
  state.aiDailyDate = state.page === "ai-reports" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoDate = state.page === "todos" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoPanel = state.page === "todos" && ["history", "templates", "future"].includes(params.get("todo_panel")) ? params.get("todo_panel") : "";
  state.settingsTab = resolvedSettingsTab(raw, params.get("tab"));
  state.account = params.get("account")?.trim() || "V字";
  state.filters = defaultFilters();
  for (const key of Object.keys(state.filters)) if (params.has(key)) state.filters[key] = params.get(key);
  const allowed = {
    sort: ["published_at", "reads", "likes", "comments", "approvals", "latest_as_of", "duration"],
    order: ["asc", "desc"],
    platform: ["", "toutiao", "zhihu", "wechat", "other"],
    topic: ["", "insurance", "entertainment", "unknown"],
    data_status: ["", "no_snapshot", "missing_reads", "missing_likes", "missing_comments", "incomplete", "zero_reads", "date_unverified"],
    mode: ["", ...Object.keys(modeLabels)],
    group: ["", "account", "mode"]
  };
  for (const [key, values] of Object.entries(allowed)) if (!values.includes(state.filters[key])) state.filters[key] = defaultFilters()[key];
  const int = (key, def, max) => /^\d+$/.test(params.get(key) || "") && Number(params.get(key)) > 0 && Number(params.get(key)) <= max ? Number(params.get(key)) : def;
  state.listPage = int("list_page", 1, 1e6);
  state.pageSize = int("page_size", 20, 200);
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
function detailInfo(reason, label, id2) {
  return `<button class="icon-button inline-info" data-action="detail-info" data-reason="${e(reason)}" aria-label="${e(label)}" aria-expanded="false" aria-controls="detail-info-${e(id2)}">${icon("info", 14)}</button>`;
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
  if (["notes", "ideas", "memos", "reminders", "ai-reports", "ai-diagnosis"].includes(state.page) || state.page === "settings" && state.settingsTab === "workspace") return "";
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
function dashboardInfo(kind, label, id2 = "") {
  return `<button class="icon-button inline-info" data-action="dashboard-info" data-kind="${e(kind)}" data-id="${e(id2)}" aria-label="${e(label)}" aria-expanded="false" aria-controls="info-${e(kind)}-${e(id2)}">${icon("info", 14)}</button>`;
}
function platformColor(platform) {
  return `var(--p-${["toutiao", "zhihu", "wechat"].includes(platform) ? platform : "other"})`;
}
function freshness(c, now = Date.now()) {
  const stamp4 = [c.as_of, c.collected_at].find((v) => v && Number.isFinite(Date.parse(v)));
  if (!stamp4) return { kind: "unknown", label: "数据新鲜度未知" };
  const days = Math.floor((Date.parse(bjtDate(now)) - Date.parse(bjtDate(stamp4))) / 864e5);
  return days < 0 ? { kind: "unknown", label: "数据日期待核实" } : { kind: days <= 1 ? "up" : days <= 3 ? "warn" : "danger", label: `数据截至 ${time(
    stamp4,
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
function field(name, label, type = "text", value = "", options3 = "", full = false) {
  return `<div class="form-field${full ? " full" : ""}"><label for="field-${e(name)}">${label}</label><input id="field-${e(name)}" class="input" name="${e(name)}" type="${type}" value="${e(value)}" ${options3}></div>`;
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
    const identity5 = identities[0];
    const query = new URLSearchParams({ action: "home", __biz: identity5 });
    profile_url = `https://mp.weixin.qq.com/mp/profile_ext?${query}`;
    platform_identity = `wechat:biz:${identity5}`;
  } else unsupported();
  if (expectedPlatform && expectedPlatform !== platform) invalid3("主页链接与所选平台不一致，请修改平台或主页链接");
  return { platform, profile_url, platform_identity };
}
var hasAccountProfileInput = (body4) => Object.hasOwn(body4, "profile_url");
var hasAccountProfileValue = (body4) => hasAccountProfileInput(body4) && body4.profile_url !== "" && body4.profile_url !== null;

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
  const head = `<div class="section-heading"><div><h2>AI 接入凭证</h2><p class="hint">供自动化工具按账号范围读取或录入数据；凭据创建后仅显示一次。</p></div><div class="head-actions"><a href="/api-docs" class="btn small" target="_blank" rel="noopener noreferrer">${icon("link", 14)}接入文档</a><button type="button" class="btn primary small" data-action="new-key">${icon("plus", 14)}创建凭证</button></div></div>`;
  return `<section class="card">${head}${keys.length ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>凭证名称</th><th>账号范围</th><th>权限</th><th>最近使用</th><th>状态</th><th></th></tr></thead><tbody>` + keys.map((k) => {
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
  }).join("") + "</tbody></table></div>" : empty("暂无凭证", "供自动化工具按账号范围读取或录入数据。")}</section>`;
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
  const logoutSection = state.me && !state.me.publicBusiness ? `<div class="detail-section security-logout"><h3>工作台会话</h3><p class="hint">退出当前账号登录状态。</p><button class="btn" type="button" data-action="logout">${icon("logout", 14)}退出登录</button></div>` : "";
  return `<section class="card panel security-panel"><h2>登录与安全</h2><p class="muted security-context">当前登录：${e(state.me.username)}</p><form id="password-form"><div class="form-field"><label for="current-password">当前密码</label><input class="input" type="password" id="current-password" name="currentPassword" autocomplete="current-password" required></div><div class="form-field field-spaced"><label for="new-password">新密码</label><input class="input" type="password" id="new-password" name="newPassword" autocomplete="new-password" minlength="12" required><span class="hint">至少 12 位</span></div><div class="form-field field-spaced"><label for="confirm-password">再次输入新密码</label><input class="input" type="password" id="confirm-password" name="confirmPassword" autocomplete="new-password" minlength="12" required></div><p class="form-message" role="alert"></p><div class="form-actions"><button class="btn primary" type="submit">更新密码</button></div></form><div class="detail-section"><h3>数据导出</h3><a class="btn" href="/api/v1/export" download>${icon("download", 14)}导出发布记录 CSV</a></div>${logoutSection}</section>`;
}
function renderAudit(audit, keys = []) {
  const actors = [...new Set(audit.map((r) => r.actor))], groups = [];
  const actor = (value) => state.me?.id && value === "user:" + state.me.id ? "我" : keys.find((k) => value === "key:" + k.id)?.name || `${String(
    value
  ).startsWith("user:") ? "用户" : String(value).startsWith("key:") ? "未识别凭据" : "未知来源"} ${num(actors.indexOf(value) + 1)}`;
  for (const row of audit) {
    const day22 = Number.isFinite(Date.parse(row.created_at)) ? bjtDate(row.created_at) : "日期未知", label = auditLabel(row.action), last = groups.at(-1);
    if (last && day22 !== "日期未知" && last.day === day22 && last.actor === row.actor && last.label === label) last.rows.push(row);
    else groups.push({ day: day22, actor: row.actor, label, rows: [row] });
  }
  let day9 = "";
  return `<section class="card panel"><h2>最近操作</h2><div class="audit-list">${groups.map((g) => {
    const heading = day9 === g.day ? "" : `<h3>${e(g.day === bjtDate() ? "今天" : g.day === bjtDate(Date.now() - 864e5) ? "昨天" : g.day)}</h3>`;
    day9 = g.day;
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
  ).map(([key, label]) => `<option value="${key}" ${a.platform === key ? "selected" : ""}>${label}</option>`).join(
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
  } catch (error2) {
    result.textContent = `格式未通过：${error2.message}`;
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

// web/core/todo-note-drafts.mjs
init_state();
function draftKey(day9, id2) {
  return state.me?.id ? `haoduoyu:todo-note:${JSON.stringify([state.me.id, day9.date, id2])}` : "";
}
function dailyTodoDraft(day9, id2) {
  if (day9.noteDrafts.has(id2)) return day9.noteDrafts.get(id2);
  const key = draftKey(day9, id2);
  try {
    const stored = key && JSON.parse(sessionStorage.getItem(key));
    if (stored && typeof stored.text === "string" && typeof stored.base === "string" && (stored.text !== stored.base || stored.check === true)) {
      const draft = { id: id2, text: stored.text, base: stored.base, check: stored.check === true };
      day9.noteDrafts.set(id2, draft);
      return draft;
    }
  } catch {
  }
  return null;
}
function persistDailyTodoDraft(day9, draft) {
  const key = draftKey(day9, draft.id);
  if (!key) return;
  try {
    if (!draft.check && draft.text === draft.base) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify({ text: draft.text, base: draft.base, check: draft.check }));
  } catch {
  }
}

// web/core/todo-count.mjs
var tally = /^\s*(\d{1,3})\/(\d{1,3}|∞) ?次[\s·]*/;
var TODO_COUNT_MAX = 99;
var TODO_COUNT_OPEN_MAX = 999;
function read(text) {
  const match = tally.exec(text);
  if (!match) return null;
  const done3 = Number(match[1]), target = match[2] === "∞" ? null : Number(match[2]);
  if (target !== null && (target < 1 || target > TODO_COUNT_MAX || done3 > target)) return null;
  return { done: done3, target, length: match[0].length };
}
function todoCount(note) {
  const text = String(note ?? ""), first = read(text);
  if (!first) return null;
  let rest = text.slice(first.length);
  for (let stale = read(rest); stale; stale = read(rest)) rest = rest.slice(stale.length);
  return { done: first.done, target: first.target, rest: rest.trim() };
}
function todoCountNote(done3, target, rest = "") {
  return `${done3}/${target ?? "∞"} 次${rest ? ` · ${rest}` : ""}`;
}
function todoCountChange(note, action, target = 0) {
  const current3 = todoCount(note), text = String(note ?? "").trim();
  if (action === "set") {
    if (target !== null && (!Number.isInteger(target) || target < 1 || target > TODO_COUNT_MAX)) return null;
    const done3 = current3?.done ?? 0;
    return todoCountNote(target === null ? done3 : Math.min(done3, target), target, current3 ? current3.rest : text);
  }
  if (!current3) return null;
  if (action === "clear") return current3.rest;
  const limit = current3.target ?? TODO_COUNT_OPEN_MAX;
  if (action === "add") return current3.done < limit ? todoCountNote(current3.done + 1, current3.target, current3.rest) : null;
  if (action === "undo") return current3.done > 0 ? todoCountNote(current3.done - 1, current3.target, current3.rest) : null;
  return null;
}

// web/core/todo-live-refresh.mjs
function watchVisibleTodoDay({ window: window2, document: document2, selection, read: read2, apply, now = Date.now }) {
  let running = false, composing = false, after = 0, stopped = false;
  const begin = () => {
    composing = true;
  };
  const end = () => {
    composing = false;
  };
  async function refresh() {
    if (running || composing || stopped || now() < after || document2.visibilityState !== "visible" || window2.navigator.onLine === false) return;
    const current3 = selection();
    if (!current3) return;
    running = true;
    after = now() + 5e3;
    try {
      const data3 = await read2(current3.date);
      if (!stopped && !composing && document2.visibilityState === "visible" && selection()?.key === current3.key) apply(current3, data3);
    } catch (error2) {
      after = now() + Math.max(2e4, Number(error2?.retryAfterMs) || 0);
    } finally {
      running = false;
    }
  }
  const timer = window2.setInterval(refresh, 2e4);
  window2.addEventListener("focus", refresh);
  window2.addEventListener("online", refresh);
  document2.addEventListener("visibilitychange", refresh);
  document2.addEventListener("compositionstart", begin, true);
  document2.addEventListener("compositionend", end, true);
  return () => {
    stopped = true;
    window2.clearInterval(timer);
    window2.removeEventListener("focus", refresh);
    window2.removeEventListener("online", refresh);
    document2.removeEventListener("visibilitychange", refresh);
    document2.removeEventListener("compositionstart", begin, true);
    document2.removeEventListener("compositionend", end, true);
  };
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
      const date2 = `${month}-${String(i).padStart(2, "0")}`;
      days[date2] = snapshot.days[date2] || [];
    }
  }
  for (const day9 of loaded) {
    if (!snapshot?.days || day9.pending || day9.readAt > snapshot.verified_at) days[day9.date] = day9.items;
  }
  return days;
}
async function loadTodoMonth(snapshot, controller, expired, deps) {
  const { monthDays, seed, active: active5, now, limits, isCurrent, changed: changed2 } = deps;
  const valid3 = () => snapshot.controller === controller && !controller.signal.aborted && active5(snapshot.owner);
  const count3 = monthDays(snapshot.month);
  const dates = Array.from({ length: count3 }, (_, i) => `${snapshot.month}-${String(i + 1).padStart(2, "0")}`);
  const revisions = new Map(snapshot.revisions);
  try {
    const initial = await seed(snapshot.month, snapshot.owner, { refresh: expired });
    if (!valid3()) return;
    if (initial) for (const [date2, items] of Object.entries(initial)) {
      if (dates.includes(date2) && Array.isArray(items) && !snapshot.fresh.has(date2) && (snapshot.revisions.get(date2) || 0) === (revisions.get(date2) || 0)) {
        snapshot.days.set(date2, items);
        snapshot.fresh.add(date2);
      }
    }
    for (let start = 0; start < dates.length; start += 5) {
      const batch = dates.slice(start, start + 5).filter((date2) => !snapshot.fresh.has(date2));
      if (!batch.length) continue;
      const context = { controller, pending: /* @__PURE__ */ new Map() };
      const results = await Promise.allSettled(batch.map(async (date2) => {
        const revision2 = revisions.get(date2) || 0;
        const value = await deps.read(date2, context);
        if (!Array.isArray(value?.items)) throw new Error("月记录读取不完整，请重试");
        if (valid3()) {
          if ((snapshot.revisions.get(date2) || 0) === revision2) snapshot.days.set(date2, value.items);
          snapshot.fresh.add(date2);
        }
        return value;
      }));
      if (!valid3()) return;
      let failure3;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "rejected") {
          const error2 = result.reason || new Error("月记录读取失败，请重试");
          if (!failure3 || error2?.status === 429 && (failure3.status !== 429 || (error2.retryAfterMs || 6e4) > (failure3.retryAfterMs || 6e4))) failure3 = error2;
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
  } catch (error2) {
    if (valid3()) snapshot.error = error2.message || "月记录读取失败，请重试";
  } finally {
    if (snapshot.controller === controller) {
      snapshot.controller = null;
      snapshot.loading = false;
      if (isCurrent(snapshot) && active5(snapshot.owner)) changed2(snapshot);
    }
  }
}
function createTodoMonthLoader({ read: read2, seed, active: active5, changed: changed2 = () => {
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
        changed: changed2,
        isCurrent: (value) => current3 === value
      });
    }
    return snapshot;
  }
  function update(nextOwner, date2, items) {
    if (owner2 !== nextOwner || !Array.isArray(items)) return false;
    const snapshot = months.get(date2.slice(0, 7));
    if (!snapshot || JSON.stringify(snapshot.days.get(date2)) === JSON.stringify(items)) return false;
    snapshot.days.set(date2, items);
    snapshot.revisions.set(date2, (snapshot.revisions.get(date2) || 0) + 1);
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
function templateUnavailable(store, day9, id2) {
  return !store.loaded || !day9.loaded || day9.loading || day9.adding || store.pending.has(id2) || todoTemplateAdded(day9, id2) || [...day9.removals.values()].some((ticket2) => ticket2.phase === "restoring" && ticket2.item.template_id === id2);
}
function inlineTodoTemplateContent(store) {
  const day9 = todoDay(), label = day9.date === bjtDate() ? "今日已添加" : "当日已添加";
  const status = "";
  const error2 = store.error ? `<p class="form-message" role="alert">${e(store.error)}
<button class="btn text small" data-action="todo-reload">重新读取</button></p>` : "";
  return status + error2 + store.items.map((item) => {
    const added = todoTemplateAdded(day9, item.id);
    return `<button type="button" class="todo-template-chip${added ? " is-added" : ""}" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="${e(added ? item.text + "，" + label : "添加：" + item.text)}" ${templateUnavailable(store, day9, item.id) ? "disabled" : ""}>
<span class="todo-template-chip-text">${e(item.text)}</span>${added ? `<span class="todo-template-chip-status">${label}</span>` : ""}</button>`;
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
  const day9 = todoDay();
  const added = (id2) => todoTemplateAdded(day9, id2);
  const addedLabel = day9.date === bjtDate() ? "今日已添加" : "当日已添加";
  return store.items.map((item) => `<li class="todo-template-row" data-template-id="${e(item.id)}">
<div class="todo-template-line"><button class="todo-template-use" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="添加：${e(item.text)}" ${templateUnavailable(store, day9, item.id) ? "disabled" : ""}>${e(item.text)}</button>
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
    const node3 = $("#" + id2, root3);
    if (node3 && node3.innerHTML !== html) node3.innerHTML = html;
  }
}
function templateReadActive(store, owner2, sequence5, version2, date2) {
  return templateSessionActive(owner2) && store.sequence === sequence5 && version2 === runtime.renderVersion && state.page === "todos" && date2 === todoDate();
}
async function loadTodoTemplates({ ensure = false } = {}) {
  if (state.page !== "todos" || !state.me) return;
  const store = templateState(), date2 = todoDate(), version2 = runtime.renderVersion;
  if (ensure && (store.loaded && !store.error && !store.loading || store.loading && store.readDate === date2 && store.readVersion === version2)) return;
  const owner2 = store.owner, sequence5 = ++store.sequence, revision2 = store.revision;
  store.readDate = date2;
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
    if (!templateReadActive(store, owner2, sequence5, version2, date2)) return;
    if (revision2 !== store.revision) return loadTodoTemplates();
    store.items = data3.items;
    if (archived) store.archived = archived.items;
    store.loaded = true;
  } catch (error2) {
    if (templateReadActive(store, owner2, sequence5, version2, date2) && !isRequestAbort(error2) && !error2.staleSession) store.error = error2.message;
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
  } catch (error2) {
    if (templateSessionActive(owner2)) store.error = error2.status === 404 ? "常用待办可能仍在同步，请稍后重试。" : error2.message;
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
async function templateWriteError(error2, store, owner2, editing = null) {
  if (!templateSessionActive(owner2) || isRequestAbort(error2) || error2.staleSession) return;
  store.error = error2.message;
  if (error2.status === 409) {
    store.error = "这项常用待办已更新，草稿已保留，请核对后再保存。";
    await loadTodoTemplates();
    if (!templateSessionActive(owner2) || !editing || store.editing !== editing) return;
    const latest2 = store.items.find((item) => item.id === editing.id);
    if (latest2) editing.version = latest2.version;
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
  } catch (error2) {
    if (!templateSessionActive(owner2)) return;
    await templateWriteError(error2, store, owner2);
    if (!templateSessionActive(owner2)) return;
    if (error2.status === 410) {
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
  const editing = store.editing?.id === id2 ? store.editing : null;
  const version2 = remove ? item.version : editing?.version;
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
  } catch (error2) {
    if (templateSessionActive(owner2)) await templateWriteError(error2, store, owner2, editing);
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
init_runtime();
init_modal();
function todoBusy(day9, id2) {
  return day9.updates.has(id2) || day9.noteCompletions.has(id2) || day9.removals.has(id2) || day9.templateWrites.has(id2);
}
function todoActionContext({ id: id2, date: date2, owner: owner2 = todoOwner() }) {
  if (!state.me || state.page !== "todos" || !validTodoDate(date2) || date2 !== todoDate() || !todoSessionActive(owner2)) return null;
  const day9 = todoDay(date2), item = day9.items.find((row) => row.id === id2);
  return item ? { day: day9, item, owner: owner2 } : null;
}
function canOpenTodoMenu({ id: id2, date: date2, anchor }) {
  const context = todoActionContext({ id: id2, date: date2 });
  return Boolean(context && anchor?.isConnected && !context.item.deleted_at && !todoBusy(context.day, id2));
}
function openTodoMenu({ target, id: id2, date: date2, anchor }) {
  date2 ||= target?.dataset.date;
  anchor ||= target?.closest(".daily-todo-row");
  if (!canOpenTodoMenu({ id: id2, date: date2, anchor })) return;
  const { item, owner: owner2 } = todoActionContext({ id: id2, date: date2 });
  const trigger = target || $('[data-action="todo-menu"]', anchor);
  if (!trigger) return;
  const attributes = `data-id="${e(id2)}" data-date="${e(date2)}" data-owner="${e(owner2)}" role="menuitem"`;
  const commonAction = item.template_active ? "todo-remove-template" : "todo-make-template";
  const commonLabel = item.template_active ? "取消常用待办" : "添加为常用待办";
  const count3 = todoCount(item.note);
  const limit = count3?.target === null ? "不限" : `${count3?.target} 次`;
  const counting = count3 ? `<button data-action="todo-count-set" ${attributes}>修改次数（${limit}）</button>
${count3.done ? `<button data-action="todo-count-undo" ${attributes}>撤回一次</button>` : ""}
<button data-action="todo-count-clear" ${attributes}>取消计次</button>` : `<button data-action="todo-count-set" ${attributes}>设置次数</button>`;
  popover(trigger, `<button data-action="todo-edit-text" ${attributes}>修改文字</button>
${counting}<button data-action="${commonAction}" ${attributes}>${commonLabel}</button>
<button data-action="todo-delete" ${attributes}>删除</button>`, { menu: true, label: "事项操作" });
}
async function changeTodoCount(options3, action, target = 0) {
  const context = todoActionContext({ ...options3, owner: options3.owner || todoOwner() });
  if (!context || todoBusy(context.day, context.item.id) || context.day.countWrites?.has(context.item.id)) return false;
  const { day: day9, item, owner: owner2 } = context, note = todoCountChange(item.note, action, target);
  if (note === null) return false;
  (day9.countWrites ||= /* @__PURE__ */ new Set()).add(item.id);
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}/note`, { method: "PATCH", body: { note, version: item.version } });
    if (!todoSessionActive(owner2)) return false;
    mergeTodo(day9, saved);
    return true;
  } catch (error2) {
    if (isRequestAbort(error2) || !todoSessionActive(owner2)) return false;
    setTodoNotice(day9, error2.status === 404 ? "这项待办可能仍在同步，请稍后再记。" : error2.message || "没有记上，请重试");
    return false;
  } finally {
    day9.countWrites.delete(item.id);
    if (todoSessionActive(owner2)) paintTodos();
  }
}
function openTodoCount({ id: id2, date: date2, owner: owner2 }) {
  const context = todoActionContext({ id: id2, date: date2, owner: owner2 || todoOwner() });
  if (!context) return;
  const count3 = todoCount(context.item.note);
  openModal("设置次数", `<form id="todo-count-form" data-id="${e(id2)}" data-date="${e(date2)}" data-owner="${e(context.owner)}">
<p class="muted">${e(context.item.text)}</p>
<label class="todo-count-open"><input type="checkbox" name="open" value="1"${count3 && count3.target === null ? " checked" : ""}>
  不限次数，只记做了几次</label>
<label for="todo-count-target">一共要做几次</label>
<input class="input" id="todo-count-target" name="target" type="number" inputmode="numeric" min="1" max="${TODO_COUNT_MAX}" step="1"
  value="${count3?.target ?? ""}">
<p class="muted">每做一次点“+1”，备注自动显示“2/5 次”；不限次数时显示“3/∞ 次”。完成仍由你点左边的圆圈。</p>
<p class="form-message" role="alert"></p>
<div class="form-actions"><button class="btn primary" type="submit">确定</button></div></form>`);
}
async function submitTodoCount({ form, data: data3 }) {
  const target = data3.open ? null : Number(data3.target);
  const message = form.querySelector(".form-message"), button2 = form.querySelector("button[type=submit]");
  if (target !== null && (!Number.isInteger(target) || target < 1 || target > TODO_COUNT_MAX)) {
    message.textContent = `请填 1 到 ${TODO_COUNT_MAX} 之间的整数，或勾选“不限次数”`;
    return;
  }
  if (button2.disabled) return;
  button2.disabled = true;
  message.textContent = "";
  const saved = await changeTodoCount({ id: form.dataset.id, date: form.dataset.date, owner: form.dataset.owner }, "set", target);
  if (saved) closeModal();
  else {
    button2.disabled = false;
    message.textContent = "没有保存，请重试";
  }
}
function readNote(node3) {
  const raw = node3?.value ?? node3?.textContent;
  return String(raw ?? "").replace(/\r?\n/g, "").slice(0, 4e3);
}
function placeNoteCaret(node3) {
  if (!node3) return;
  node3.focus();
  const selection = window.getSelection?.();
  if (!selection || !node3.isContentEditable) {
    const end = node3.value?.length || 0;
    node3.setSelectionRange?.(end, end);
    return;
  }
  const range2 = document.createRange();
  range2.selectNodeContents(node3);
  range2.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range2);
}
function rememberNote(node3) {
  const text = readNote(node3);
  const shown2 = node3.isContentEditable ? node3.textContent : node3.value;
  if (shown2 !== text) {
    if (node3.isContentEditable) node3.textContent = text;
    else node3.value = text;
    placeNoteCaret(node3);
  }
  if (node3.dataset.future === "1") {
    const view3 = futureTodoView();
    if (view3.noteEdit?.id === node3.dataset.id) view3.noteEdit.text = text;
    return;
  }
  const day9 = todoDay(node3.dataset.date);
  const draft = day9.noteEdit;
  if (draft?.id !== node3.dataset.id || draft.text === text) return;
  draft.text = text;
  draft.error = "";
  if (draft.save) draft.check = true;
  persistDailyTodoDraft(day9, draft);
}
function watchTodoNotes() {
  if (watchTodoNotes.ready || typeof document === "undefined") return;
  watchTodoNotes.ready = true;
  document.addEventListener("beforeinput", (event) => {
    const node3 = event.target;
    if (!node3?.matches?.("[data-todo-note-input]")) return;
    if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      event.preventDefault();
      node3.blur();
    }
  });
  document.addEventListener("paste", (event) => {
    const node3 = event.target?.closest?.("[data-todo-note-input]");
    if (!node3) return;
    event.preventDefault();
    const text = (event.clipboardData?.getData("text/plain") || "").replace(/\r?\n/g, "");
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range2 = selection.getRangeAt(0);
    range2.deleteContents();
    range2.insertNode(document.createTextNode(text));
    range2.collapse(false);
    node3.dispatchEvent(new Event("input", { bubbles: true }));
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
      const node3 = event.target;
      if (node3.dataset.future !== "1") void commitTodoNote(node3, { retry: true });
      node3.blur();
    }
  });
}
function openFutureNote(options3) {
  const view3 = futureTodoView(), id2 = options3.id || options3.target?.dataset.id;
  const item = view3.items.find((row) => row.id === id2 && !row.deleted_at && !row.deleted);
  if (!item || view3.pending || view3.uncertain[id2]) return;
  view3.noteEdit = { id: item.id, text: item.note || "", base: item.note || "" };
  view3.noteError = "";
  paintUnscheduledTodos();
  placeNoteCaret(document.querySelector(`#todo-future [data-todo-note-input][data-id="${CSS.escape(item.id)}"]`));
}
function openTodoNote(options3) {
  watchTodoNotes();
  if (options3.target?.dataset.future === "1") return openFutureNote(options3);
  const context = todoActionContext({ ...options3, date: options3.date || options3.target?.dataset.date, owner: options3.owner || options3.target?.dataset.owner });
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { item, day: day9 } = context;
  const draft = dailyTodoDraft(day9, item.id) || { id: item.id, text: item.note || "", base: item.note || "" };
  day9.noteDrafts.set(item.id, draft);
  day9.noteEdit = draft;
  paintTodos();
  placeNoteCaret(document.querySelector(`[data-todo-note-input][data-id="${CSS.escape(item.id)}"]`));
}
var NOTE_RETRY_DELAYS = [0, 500, 1500];
var noteConflict = (error2) => error2?.status === 409;
var pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function settleQueuedTodo(type, id2) {
  const offline = getOfflineRuntime();
  if (!offline?.todoSettled) return true;
  for (let i = 0; i < 24; i++) {
    try {
      if (await offline.todoSettled(type, id2)) return true;
    } catch {
      return false;
    }
    if (i === 0) void offline.sync?.().catch?.(() => {
    });
    await pause(250);
  }
  return false;
}
async function rememberSavedNote(type, row) {
  const offline = getOfflineRuntime();
  if (!offline?.acceptTodoNote || !row) return;
  try {
    await offline.acceptTodoNote(type, row, offline.captureRateLimitContext?.());
  } catch {
  }
}
async function saveNoteFresh({ id: id2, text, base, version: version2, latest: latest2, type = "todo", active: active5 = () => true }) {
  const settled = await settleQueuedTodo(type, id2);
  if (!active5()) throw new DOMException("请求已取消", "AbortError");
  if (!settled && type === "todo") throw new Error("这项待办上一步还在同步，请等几秒再点一次。");
  const fresh = type === "todo" ? await latest2() : await latest2().catch(() => null);
  if (type === "todo" && (!fresh || fresh.deleted_at || !Number.isSafeInteger(fresh.version))) {
    throw Object.assign(new Error("这项待办暂不可用"), { status: 404 });
  }
  if (!active5()) throw new DOMException("请求已取消", "AbortError");
  if (fresh && Number.isSafeInteger(fresh.version)) {
    if ((fresh.note || "") === text) {
      if (type === "todo") await rememberSavedNote(type, fresh);
      return fresh;
    }
    if ((fresh.note || "") !== base) return { changedElsewhere: true, fresh };
    version2 = fresh.version;
  }
  const saved = await sendNote({ id: id2, text, base, version: version2, latest: latest2, active: active5 });
  if (active5() && saved && !saved.changedElsewhere) await rememberSavedNote(type, saved);
  return saved;
}
async function sendNote({ id: id2, text, base, version: version2, latest: latest2, active: active5 }) {
  let lastError = null;
  for (const delay of [null, ...NOTE_RETRY_DELAYS]) {
    if (delay !== null) {
      await pause(delay);
      const fresh = await latest2().catch(() => null);
      if (!fresh) throw lastError;
      if ((fresh.note || "") === text) return fresh;
      if ((fresh.note || "") !== base) return { changedElsewhere: true, fresh };
      version2 = fresh.version;
    }
    if (!active5()) throw new DOMException("请求已取消", "AbortError");
    try {
      return await api(`/todos/${encodeURIComponent(id2)}/note`, { method: "PATCH", body: { note: text, version: version2 } });
    } catch (error2) {
      if (!noteConflict(error2)) throw error2;
      lastError = error2;
    }
  }
  throw lastError;
}
var elsewhereMessage = (note) => note ? `这条备注刚在别处改成了「${note}」。你写的还在框里，点空白会用你的版本保存。` : "这条备注刚在别处被清空了。你写的还在框里，点空白会用你的版本保存。";
var noteFailure = (error2) => error2.status === 404 ? "这项待办可能仍在同步，请稍后重试；备注内容已保留。" : noteConflict(error2) ? "这项待办正在别处更新，备注还没存上，内容已保留。稍后点空白再存一次。" : error2.message || "保存失败，请重试";
async function commitFutureNote(input) {
  if (futureRepainting()) return;
  const view3 = futureTodoView(), item = view3.items.find((row) => row.id === input.dataset.id);
  if (!item || view3.noteEdit?.id !== item.id || view3.noteEdit.committing) return;
  const text = readNote(input);
  if (text === (item.note || "")) {
    view3.noteEdit = null;
    view3.noteError = "";
    paintUnscheduledTodos();
    return;
  }
  view3.noteEdit.committing = true;
  view3.noteEdit.text = text;
  try {
    const saved = await saveNoteFresh({
      id: item.id,
      text,
      base: view3.noteEdit.base ?? (item.note || ""),
      version: item.version,
      type: "unscheduled_todo",
      latest: async () => (await api("/unscheduled-todos"))?.items?.find((row) => row.id === item.id)
    });
    if (saved.changedElsewhere) {
      Object.assign(item, saved.fresh);
      if (!saved.fresh.note) delete item.note;
      if (view3.noteEdit?.id === item.id) {
        view3.noteEdit.committing = false;
        view3.noteEdit.base = saved.fresh.note || "";
      }
      view3.noteError = elsewhereMessage(saved.fresh.note);
    } else {
      Object.assign(item, saved);
      if (!saved.note) delete item.note;
      if (view3.noteEdit?.id === item.id) view3.noteEdit = null;
      view3.noteError = "";
    }
  } catch (error2) {
    if (isRequestAbort(error2)) return;
    if (view3.noteEdit?.id === item.id) {
      view3.noteEdit.committing = false;
      view3.noteError = noteFailure(error2);
    }
  }
  paintUnscheduledTodos();
  if (view3.noteEdit?.id === item.id) document.querySelector(`#todo-future [data-todo-note-input][data-id="${CSS.escape(item.id)}"]`)?.focus();
}
function finishDailyTodoNote(day9, draft) {
  if (day9.noteEdit === draft) day9.noteEdit = null;
  day9.noteDrafts.delete(draft.id);
}
async function storeDailyTodoNote(day9, item, owner2, draft, text) {
  const active5 = () => todoSessionActive(owner2);
  try {
    const saved = await saveNoteFresh({
      id: item.id,
      text,
      base: draft.base,
      version: item.version,
      active: active5,
      latest: async () => {
        const data3 = await api(`/todos?date=${encodeURIComponent(day9.date)}`, { requireNetwork: true });
        return data3?.items?.find((row) => row.id === item.id);
      }
    });
    if (!active5()) return false;
    mergeTodo(day9, saved.changedElsewhere ? saved.fresh : saved);
    day9.revision++;
    if (saved.changedElsewhere) {
      const note = saved.fresh.note;
      draft.error = note ? `另一设备已保存「${note}」。你的草稿仍在，请先核对两个版本。` : "另一设备已清空备注。你的草稿仍在，请先核对。";
      return false;
    }
    draft.base = text;
    draft.check = false;
    persistDailyTodoDraft(day9, draft);
    if (draft.text !== text) return false;
    finishDailyTodoNote(day9, draft);
    return true;
  } catch (error2) {
    if (active5()) draft.error = `备注未保存，草稿已保留。按回车可重试。${error2?.message ? " " + error2.message : ""}`;
    return false;
  } finally {
    draft.save = null;
    if (active5()) paintTodos();
  }
}
function saveDailyTodoNote(day9, item, owner2) {
  const draft = dailyTodoDraft(day9, item.id);
  if (!draft) return true;
  if (draft.save) return draft.save;
  if (!draft.check && draft.text === draft.base) {
    finishDailyTodoNote(day9, draft);
    return true;
  }
  draft.error = "";
  draft.save = storeDailyTodoNote(day9, item, owner2, draft, draft.text);
  return draft.save;
}
async function commitTodoNote(input, { retry = false } = {}) {
  if (input?.dataset?.future === "1") return commitFutureNote(input);
  if (todoRepainting()) return;
  const context = todoActionContext({ id: input.dataset.id, date: input.dataset.date });
  if (!context || context.day.noteEdit?.id !== context.item.id) return;
  const { day: day9, item, owner: owner2 } = context;
  rememberNote(input);
  if (day9.noteEdit.error && !retry) return;
  if (await saveDailyTodoNote(day9, item, owner2) && todoSessionActive(owner2)) paintTodos();
}
async function submitTodoNote({ form, data: data3 }) {
  const context = todoActionContext({ id: form.dataset.id, date: form.dataset.date, owner: form.dataset.owner });
  if (!context) return;
  const button2 = form.querySelector("button[type=submit]"), message = form.querySelector(".form-message");
  if (button2.disabled) return;
  button2.disabled = true;
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
  } catch (error2) {
    message.textContent = error2.status === 404 ? "这项待办可能仍在同步，请稍后重试；备注内容已保留。" : error2.message || "保存失败，请重试";
  } finally {
    button2.disabled = false;
  }
}
function textTarget({ id: id2, date: date2, owner: owner2, future }) {
  if (future === "1") {
    const view3 = futureTodoView(), item = view3.items.find((row) => row.id === id2 && !row.deleted_at && !row.deleted);
    return item && !view3.pending && !view3.uncertain[id2] ? { item, view: view3 } : null;
  }
  const context = todoActionContext({ id: id2, date: date2, owner: owner2 || todoOwner() });
  return context && !context.item.deleted_at && !todoBusy(context.day, id2) ? context : null;
}
function openTodoText(options3) {
  const target = textTarget(options3);
  if (!target) return;
  const { item } = target, future = options3.future === "1" ? "1" : "";
  openModal("修改文字", `<form id="todo-text-form" data-id="${e(item.id)}" data-date="${e(options3.date || "")}" data-owner="${e(options3.owner || todoOwner())}"
data-future="${future}" data-base="${e(item.text)}">
<label for="todo-text-input">待办内容</label>
<input class="input" id="todo-text-input" name="text" maxlength="500" required value="${e(item.text)}" autocomplete="off">
<p class="muted">只改文字，勾选状态、备注和日期都不变。</p>
<p class="form-message" role="alert"></p>
<div class="form-actions"><button class="btn primary" type="submit">保存</button></div></form>`);
  const input = document.getElementById("todo-text-input");
  input?.focus();
  input?.select?.();
}
async function sendText({ id: id2, text, base, type, latest: latest2, active: active5 }) {
  const settled = await settleQueuedTodo(type, id2);
  if (!active5()) throw new DOMException("请求已取消", "AbortError");
  if (!settled && type === "todo") throw new Error("这项待办上一步还在同步，请等几秒再保存。");
  let lastError = null;
  for (const delay of NOTE_RETRY_DELAYS) {
    if (delay) await pause(delay);
    const fresh = await latest2().catch(() => null);
    if (!fresh || fresh.deleted_at || !Number.isSafeInteger(fresh.version)) throw lastError || Object.assign(new Error("这项待办暂不可用"), { status: 404 });
    if (!active5()) throw new DOMException("请求已取消", "AbortError");
    if (fresh.text === text) return fresh;
    if (fresh.text !== base) return { changedElsewhere: true, fresh };
    try {
      return await api(`/todos/${encodeURIComponent(id2)}/text`, { method: "PATCH", body: { text, version: fresh.version } });
    } catch (error2) {
      if (!noteConflict(error2)) throw error2;
      lastError = error2;
    }
  }
  throw lastError;
}
async function submitTodoText({ form, data: data3 }) {
  const options3 = { ...form.dataset }, target = textTarget(options3);
  const message = form.querySelector(".form-message"), button2 = form.querySelector("button[type=submit]");
  const text = String(data3.text ?? "").replace(/\r?\n/g, " ").trim();
  if (!target) {
    message.textContent = "这项待办暂时不能修改，请稍后再试。";
    return;
  }
  if (!text || text.length > 500) {
    message.textContent = "待办内容需要 1 至 500 个字";
    return;
  }
  if (button2.disabled) return;
  const { item } = target, future = options3.future === "1", base = form.dataset.base;
  if (text === item.text) {
    closeModal();
    return;
  }
  const owner2 = target.owner, active5 = () => future || todoSessionActive(owner2);
  button2.disabled = true;
  message.textContent = "";
  try {
    const saved = await sendText({
      id: item.id,
      text,
      base,
      type: future ? "unscheduled_todo" : "todo",
      active: active5,
      latest: future ? async () => (await api("/unscheduled-todos"))?.items?.find((row2) => row2.id === item.id) : async () => (await api(`/todos?date=${encodeURIComponent(target.day.date)}`, { requireNetwork: true }))?.items?.find((row2) => row2.id === item.id)
    });
    if (!active5()) return;
    const row = saved.changedElsewhere ? saved.fresh : saved;
    if (future) {
      Object.assign(item, row);
      if (!row.note) delete item.note;
      paintUnscheduledTodos();
    } else {
      mergeTodo(target.day, row);
      target.day.revision++;
      paintTodos();
    }
    if (saved.changedElsewhere) {
      form.dataset.base = row.text;
      message.textContent = `这项待办刚在别处改成了「${row.text}」。你写的还在框里，再点保存会用你的版本。`;
      return;
    }
    await rememberSavedNote(future ? "unscheduled_todo" : "todo", row);
    closeModal();
  } catch (error2) {
    if (isRequestAbort(error2)) return;
    message.textContent = error2.status === 404 ? "这项待办可能仍在同步，请稍后重试；你写的内容已保留。" : noteConflict(error2) ? "这项待办正在别处更新，还没存上，内容已保留。稍后再点保存。" : error2.message || "保存失败，请重试";
  } finally {
    button2.disabled = false;
  }
}
function renderTodoUndo(day9) {
  return [...day9.removals.entries()].map(([id2, ticket2]) => {
    const label = ticket2.phase === "deleting" ? "删除中…" : ticket2.phase === "restoring" ? "恢复中…" : "已删除";
    return `<div class="todo-undo-entry"><span>${label}：${e(ticket2.item.text)}</span>
<button class="btn text small" data-action="todo-restore" data-id="${e(id2)}" data-date="${e(day9.date)}"
data-owner="${e(todoOwner())}" ${ticket2.phase === "ready" ? "" : "disabled"}>撤销</button></div>`;
  }).join("");
}
function expireTodoUndo(day9, id2, ticket2, owner2) {
  clearTimeout(ticket2.timer);
  ticket2.timer = setTimeout(() => {
    if (!todoSessionActive(owner2) || day9.removals.get(id2) !== ticket2 || ticket2.phase !== "ready") return;
    day9.removals.delete(id2);
    paintTodos();
  }, 8e3);
  ticket2.timer?.unref?.();
}
async function todoActionFailure(day9, error2, owner2) {
  if (!todoSessionActive(owner2) || isRequestAbort(error2) || error2.staleSession) return;
  day9.error = error2.message;
  if ([404, 409].includes(error2.status) && day9.date === todoDate()) {
    day9.error = "这项计划已更新，请核对最新内容后再操作。";
    await loadTodos();
  }
}
async function deleteTodo(options3) {
  const context = todoActionContext(options3);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day: day9, item, owner: owner2 } = context, ticket2 = { item, phase: "deleting", timer: null };
  day9.removals.set(item.id, ticket2);
  day9.error = "";
  day9.notice = "";
  day9.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "DELETE", body: { date: day9.date, version: item.version } });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day9, saved);
    ticket2.item = saved;
    ticket2.phase = "ready";
    expireTodoUndo(day9, item.id, ticket2, owner2);
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error2) {
    if (!todoSessionActive(owner2)) return;
    day9.removals.delete(item.id);
    await todoActionFailure(day9, error2, owner2);
    if (todoSessionActive(owner2) && item.template_id && [404, 409].includes(error2.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner2)) {
      day9.revision++;
      paintTodos();
    }
  }
}
async function restoreTodo({ id: id2, date: date2, owner: owner2 = todoOwner() }) {
  if (!state.me || state.page !== "todos" || date2 !== todoDate() || !todoSessionActive(owner2)) return;
  const day9 = todoDay(date2), ticket2 = day9.removals.get(id2);
  if (!ticket2 || ticket2.phase !== "ready") return;
  clearTimeout(ticket2.timer);
  ticket2.phase = "restoring";
  mergeTodo(day9, ticket2.item);
  day9.error = "";
  day9.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(id2)}/restore`, {
      method: "POST",
      body: { date: date2, version: ticket2.item.version }
    });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day9, saved);
    day9.removals.delete(id2);
    setTodoNotice(day9, "已恢复");
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error2) {
    if (!todoSessionActive(owner2)) return;
    if (error2.status === 409) day9.removals.delete(id2);
    else {
      ticket2.phase = "ready";
      expireTodoUndo(day9, id2, ticket2, owner2);
    }
    await todoActionFailure(day9, error2, owner2);
    if (todoSessionActive(owner2) && ticket2.item.template_id && [404, 409].includes(error2.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner2)) {
      day9.revision++;
      paintTodos();
    }
  }
}
function todoTemplateRequest(day9, item) {
  let request2 = day9.templateLinks.get(item.id);
  if (!request2 || request2.version !== item.version || request2.template_version !== (item.template_version || 0)) {
    request2 = {
      date: day9.date,
      version: item.version,
      template_id: item.template_id || crypto.randomUUID(),
      template_version: item.template_version || 0
    };
    day9.templateLinks.set(item.id, request2);
  }
  return request2;
}
async function changeTodoTemplate(options3, remove = false) {
  const context = todoActionContext(options3);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day: day9, item, owner: owner2 } = context;
  if (remove !== Boolean(item.template_active) || templateState().pending.has(item.template_id)) return;
  day9.templateWrites.add(item.id);
  day9.error = "";
  day9.notice = "";
  day9.revision++;
  paintTodos();
  try {
    const saved = await api(remove ? `/todo-templates/${encodeURIComponent(item.template_id)}` : `/todos/${encodeURIComponent(item.id)}/template`, {
      method: remove ? "DELETE" : "POST",
      body: remove ? { version: item.template_version } : todoTemplateRequest(day9, item)
    });
    if (!todoSessionActive(owner2)) return;
    if (remove) templateState().items = templateState().items.filter((row) => row.id !== item.template_id);
    else {
      mergeTodo(day9, saved.todo);
      mergeTodoTemplate(saved.template);
    }
    day9.templateLinks.delete(item.id);
    setTodoNotice(day9, remove ? "已取消常用，事项已保留" : "已添加为常用");
    refreshOpenTodoTemplates();
    if (remove && day9.date === todoDate()) await loadTodos();
  } catch (error2) {
    if (todoSessionActive(owner2)) {
      await todoActionFailure(day9, error2, owner2);
      if (todoSessionActive(owner2) && [404, 409].includes(error2.status)) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day9.templateWrites.delete(item.id);
      day9.revision++;
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
  const error2 = $("#todo-preferences-error");
  if (error2) error2.textContent = prefs.error;
}
async function loadTodoPreferences(context) {
  const prefs = todoPreferences(), owner2 = todoOwner();
  try {
    const saved = await api("/todo-preferences", { context });
    if (!todoSessionActive(owner2)) return;
    receiveTodoPreferences(saved.completed_mode, saved.version);
    prefs.error = "";
  } catch (error2) {
    if (todoSessionActive(owner2) && !isRequestAbort(error2) && !error2.staleSession) prefs.error = error2.message;
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
  } catch (error2) {
    if (!todoSessionActive(owner2) || isRequestAbort(error2) || error2.staleSession) return;
    prefs.error = error2.message;
    if (error2.status === 409) {
      try {
        const latest2 = await api("/todo-preferences");
        if (!todoSessionActive(owner2)) return;
        prefs.mode = latest2.completed_mode;
        prefs.version = latest2.version;
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
  read: (date2, context) => api(`/todos?date=${encodeURIComponent(date2)}`, { context }),
  active: (owner2) => owner2 === monthOwner() && todoSessionActive(todoOwner()),
  async seed(month, owner2, { refresh = false } = {}) {
    const loaded = [];
    if (todosState.owner === todoOwner()) for (const [date2, day9] of todosState.days) {
      const stamp4 = monthDayOwners.get(day9);
      if (date2.startsWith(month + "-") && day9.loaded && stamp4?.owner === owner2 && (!refresh || todoPending(day9))) {
        loaded.push({ date: date2, items: monthDayItems(day9), readAt: stamp4.at, pending: todoPending(day9) });
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
    const node3 = $("#todo-calendar");
    if (node3) {
      node3.dataset.month = "";
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
var TODO_WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function todoDayTitle(date2) {
  return `${Number(date2.slice(5, 7))}月${Number(date2.slice(8))}日 ${TODO_WEEKDAYS[(/* @__PURE__ */ new Date(date2 + "T00:00:00Z")).getUTCDay()]}`;
}
function todoCalendarMonth(date2) {
  if (todosState.calendarDate !== date2 || !validTodoDate(`${todosState.calendarMonth}-01`)) {
    todosState.calendarDate = date2;
    todosState.calendarMonth = date2.slice(0, 7);
  }
  return todosState.calendarMonth;
}
function todoCalendarDay(date2, selected) {
  const today2 = date2 === bjtDate(), active5 = date2 === selected;
  const items = (monthSnapshot.month === date2.slice(0, 7) && monthSnapshot.owner === monthOwner() ? monthSnapshot.days.get(date2) || [] : []).filter((item) => !item.deleted_at);
  const shown2 = items.filter((item) => calendarStatus === "all" || Boolean(item.completed) === (calendarStatus === "done"));
  const loaded = monthSnapshot.owner === monthOwner() && monthSnapshot.month === date2.slice(0, 7) && monthSnapshot.days.has(date2);
  const done3 = items.filter((item) => item.completed).length;
  const tone = !items.length ? " is-blank" : done3 === items.length ? " is-all-done" : "";
  const content2 = shown2.slice(0, 4).map((item) => `<span class="todo-calendar-task${item.completed ? " is-complete" : ""}">${item.completed ? "✓" : "○"} ${e(item.text)}</span>`).join("");
  const more = shown2.length > 4 ? `<span class="todo-calendar-more">还有 ${shown2.length - 4} 项</span>` : "";
  const count3 = loaded && items.length ? `${done3}/${items.length}` : "";
  return `<button class="todo-calendar-day${active5 ? " is-selected" : ""}${today2 ? " is-today" : ""}${loaded ? tone : ""}" type="button"
data-action="todo-calendar-date" data-date="${e(date2)}" aria-label="${e(date2)}${count3 ? `，完成 ${count3}` : ""}" aria-pressed="${active5}"
${today2 ? 'aria-current="date"' : ""}><span class="todo-calendar-day-head"><strong>${Number(date2.slice(-2))}</strong><small>${count3}</small></span>${content2}${more}</button>`;
}
function todoCalendar(date2) {
  const month = todoCalendarMonth(date2), first = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`), last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const blanks = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: last.getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const cells = [...Array(blanks).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const index = Math.max(0, cells.indexOf(date2));
  const weekIndex = Math.floor(index / 7);
  const visible3 = todosState.calendarView === "week" ? cells.slice(weekIndex * 7, weekIndex * 7 + 7) : cells;
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7).filter(Boolean));
  const all = [...monthSnapshot.days.values()].flat().filter((item) => !item.deleted_at), done3 = all.filter((item) => item.completed).length;
  const currentSnapshot = monthSnapshot.month === month && monthSnapshot.owner === monthOwner();
  const activeDays = [...monthSnapshot.days.values()].filter((items) => items.some((item) => !item.deleted_at)).length;
  const stats2 = !currentSnapshot || monthSnapshot.loading ? `<p class="todo-calendar-loading" role="status">正在读取本月待办…</p>` : monthSnapshot.error ? `<p role="alert">部分日期未加载：${e(monthSnapshot.error)} <button class="btn text small" type="button" data-todo-calendar-retry>重试缺失日期</button></p>` : `<div class="todo-calendar-stats">${[["总任务", all.length], ["已完成", done3], ["未完成", all.length - done3], ["活跃天数", activeDays], ["完成率", `${all.length ? Math.round(done3 / all.length * 100) : 0}%`]].map(([label, value]) => `<span><small>${label}</small><strong>${value}</strong></span>`).join("")}</div>`;
  return `<aside class="todo-calendar-sidebar"><label for="todo-calendar-month-input">月份</label><input id="todo-calendar-month-input" type="month" class="input" data-todo-calendar-month value="${e(month)}">
<label for="todo-calendar-week">周日期</label><select id="todo-calendar-week" class="input" data-todo-calendar-week>${weeks.map((week, i) => `<option value="${week[0]}" ${i === weekIndex ? "selected" : ""}>${week[0].slice(5)} — ${week.at(-1).slice(5)}</option>`).join("")}</select>
<label for="todo-calendar-status">任务状态</label><select id="todo-calendar-status" class="input" data-todo-calendar-status><option value="all" ${calendarStatus === "all" ? "selected" : ""}>全部任务</option><option value="open" ${calendarStatus === "open" ? "selected" : ""}>未完成</option><option value="done" ${calendarStatus === "done" ? "selected" : ""}>已完成</option></select></aside>
<div class="todo-calendar-main"><div class="todo-calendar-head"><div class="todo-calendar-navigation"><button class="icon-button" type="button" data-action="todo-calendar-prev" aria-label="上一${todosState.calendarView === "week" ? "周" : "月"}" ${month === "0001-01" ? "disabled" : ""}>‹</button><span id="todo-calendar-month" aria-live="polite">${Number(month.slice(0, 4))}年${Number(month.slice(5))}月</span><button class="icon-button" type="button" data-action="todo-calendar-next" aria-label="下一${todosState.calendarView === "week" ? "周" : "月"}" ${month === "9999-12" ? "disabled" : ""}>›</button><button class="btn" type="button" data-action="todo-today">今天</button></div><div class="todo-calendar-views"><button type="button" class="btn" data-todo-calendar-view="week" aria-pressed="${todosState.calendarView === "week"}">周</button><button type="button" class="btn" data-todo-calendar-view="month" aria-pressed="${todosState.calendarView !== "week"}">月</button></div></div>${stats2}
<div class="todo-calendar-scroll"><div class="todo-calendar-grid" role="group" aria-labelledby="todo-calendar-month">
${["一", "二", "三", "四", "五", "六", "日"].map((day9) => `<span class="todo-calendar-weekday" aria-hidden="true">周${day9}</span>`).join("")}
${visible3.map((day9) => day9 ? todoCalendarDay(day9, date2) : '<span class="todo-calendar-blank" aria-hidden="true"></span>').join("")}</div></div></div>`;
}
function moveTodoMonth(offset) {
  if (!todosVisible()) return;
  if (state.todoPanel === "templates" && $("#todo-templates")?.dataset.loaded !== "true") void loadTodoTemplates();
  const day9 = todoDay(), month = todoCalendarMonth(day9.date);
  if (todosState.calendarView === "week") {
    const anchor = day9.date.startsWith(month) ? day9.date : `${month}-01`;
    const weekDate = /* @__PURE__ */ new Date(`${anchor}T00:00:00Z`);
    weekDate.setUTCDate(weekDate.getUTCDate() + offset * 7);
    const next = weekDate.toISOString().slice(0, 10);
    if (validTodoDate(next)) selectTodoDate(next);
    return;
  }
  const date2 = /* @__PURE__ */ new Date(`${month}-01T00:00:00Z`);
  date2.setUTCMonth(date2.getUTCMonth() + offset);
  const nextMonth2 = date2.toISOString().slice(0, 7);
  if (!validTodoDate(`${nextMonth2}-01`)) return;
  todosState.calendarMonth = nextMonth2;
  const calendar = $("#todo-calendar"), action = document.activeElement?.dataset?.action;
  if (!calendar) return;
  paintTodoCalendar(day9.date);
  void loadTodoMonth2(nextMonth2);
  if (["todo-calendar-prev", "todo-calendar-next"].includes(action)) $(`[data-action="${action}"]`, calendar)?.focus();
}
function paintTodoCalendar(date2) {
  const calendar = $("#todo-calendar"), month = todoCalendarMonth(date2), today2 = bjtDate();
  if (!calendar) return;
  const title = $(".todo-day-title");
  if (title) title.textContent = todoDayTitle(date2);
  if (!calendar.dataset.viewBound) {
    calendar.addEventListener("click", (event) => {
      const retry = event.target.closest("[data-todo-calendar-retry]");
      if (retry) {
        void loadTodoMonth2(todoCalendarMonth(todoDay().date));
        return;
      }
      const button2 = event.target.closest("[data-todo-calendar-view]");
      if (!button2) return;
      todosState.calendarView = button2.dataset.todoCalendarView;
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
  calendar.innerHTML = todoCalendar(date2);
  calendar.dataset.month = month;
  calendar.dataset.today = today2;
  if (focusedDate) $(`[data-date="${CSS.escape(focusedDate)}"]`, calendar)?.focus();
}
async function loadTodoMonth2(month) {
  const snapshot = monthLoader.open(month, monthOwner());
  monthSnapshot = snapshot;
  if (todosVisible()) {
    const node3 = $("#todo-calendar");
    if (node3) {
      node3.dataset.month = "";
      paintTodoCalendar(todoDay().date);
    }
  }
  await snapshot.promise;
}
function todoDateControls(date2) {
  return `<div id="todo-date-bar" ${state.todoPanel ? "hidden" : ""}>
<div class="daily-todo-dates" role="group" aria-label="待办日期">
<button class="btn" type="button" data-action="todo-prev" aria-label="前一天">‹</button>
<label for="todo-date" class="sr-only">选择待办日期</label><input class="input" id="todo-date" type="date" value="${e(date2)}">
<button class="btn" type="button" data-action="todo-next" aria-label="后一天">›</button>
<button class="btn text" type="button" data-action="todo-today">今天</button></div></div>`;
}
function todoCountButton(item, day9, pending) {
  const count3 = todoCount(item.note);
  if (!count3 || day9.noteEdit?.id === item.id) return "";
  const full = count3.target !== null && count3.done >= count3.target;
  const so = count3.target === null ? `${count3.done} 次` : `${count3.done}/${count3.target} 次`;
  return `<button class="todo-count-add btn small" type="button" data-action="todo-count-add" data-id="${e(item.id)}" data-date="${e(day9.date)}"
aria-label="${full ? `已记满 ${count3.target} 次` : `记一次，目前 ${so}`}" ${pending || full ? "disabled" : ""}>${full ? "已满" : "+1"}</button>`;
}
function todoRow(item, day9) {
  const pending = todoBusy(day9, item.id);
  const completed = day9.updates.has(item.id) ? day9.updates.get(item.id) : item.completed;
  const removal = day9.removals.get(item.id), deleted2 = removal ? removal.phase !== "restoring" : Boolean(item.deleted_at);
  if (deleted2) return "";
  const draft = dailyTodoDraft(day9, item.id), hasDraft = draft && (draft.save || draft.check || draft.text !== draft.base);
  if (completed && !hasDraft && todoCompletedMode() === "hide" && state.todoPanel !== "history") return "";
  const note = todoNoteField(item, { date: day9.date, pending, editing: day9.noteEdit, error: draft?.error, hasDraft });
  const check2 = `todo-check-${e(item.id)}`;
  return `<li class="daily-todo-row${completed ? " is-complete" : ""}" data-id="${e(item.id)}" data-date="${e(day9.date)}">
<label class="daily-todo-check" for="${check2}"><input id="${check2}" type="checkbox" data-todo-id="${e(item.id)}" data-date="${e(day9.date)}"
${completed ? "checked" : ""} aria-disabled="${pending}"></label>
<div class="daily-todo-main"><label class="daily-todo-text" for="${check2}">${e(item.text)}</label>
${note}</div>${todoCountButton(item, day9, pending)}
<button class="todo-row-menu icon-button" type="button" data-action="todo-menu" data-id="${e(item.id)}" data-date="${e(day9.date)}"
aria-label="事项操作" aria-haspopup="menu" aria-expanded="false" ${pending ? "disabled" : ""}>⋯</button></li>`;
}
function todoForm(day9) {
  const label = day9.date === bjtDate() ? "今天想完成什么？" : "这一天的计划";
  return `<form id="todo-form" class="daily-todo-form" data-date="${e(day9.date)}" aria-label="添加 ${e(day9.date)} 的计划">
<label for="todo-text" class="sr-only">${label}</label><input id="todo-text" class="input" name="text" maxlength="500" required
autocomplete="off" placeholder="${label}" value="${e(day9.draft)}" >
<button class="btn primary" type="submit" ${day9.adding ? "disabled" : ""}>添加</button></form>`;
}
function todoCaption(day9) {
  const today2 = day9.date === bjtDate();
  return `<time datetime="${e(day9.date)}" title="北京时间">${today2 ? "今天 · " : ""}${e(day9.date)}</time>`;
}
function floatingTodoSupported() {
  return typeof window !== "undefined" && typeof window.documentPictureInPicture?.requestWindow === "function";
}
function todoHeading(day9) {
  const selected = state.todoPanel || "today";
  return `<span id="todo-caption" hidden>${todoCaption(day9)}</span><nav class="todo-page-tabs" aria-label="待办页面">
${[["today", "今日"], ["future", "未来待办"], ["history", "日历"], ["templates", "常用"]].map(([panel2, label]) => `<button class="btn todo-page-tab" type="button" data-action="todo-panel" data-panel="${panel2 === "today" ? "" : panel2}"
  aria-current="${selected === panel2 ? "page" : "false"}" ${panel2 === "templates" ? 'aria-label="管理常用"' : ""}>${label}</button>`).join("")}</nav>`;
}
function renderTodoHistory(day9) {
  return `<section id="todo-history" class="todo-view" aria-label="待办日历" ${state.todoPanel === "history" ? "" : "hidden"}>
<div id="todo-calendar" class="daily-todo-calendar" data-month="${todoCalendarMonth(day9.date)}" data-today="${bjtDate()}">
${todoCalendar(day9.date)}</div><h3 class="notes-read-title todo-day-title">${e(todoDayTitle(day9.date))}</h3></section>`;
}
function paintTodoPanels(root3) {
  const panel2 = state.todoPanel || "";
  for (const [id2, value] of [["todo-main", ""], ["todo-history", "history"], ["todo-templates", "templates"], ["todo-future", "future"]]) {
    const node3 = $("#" + id2, root3);
    if (node3) node3.hidden = id2 === "todo-main" ? ["templates", "future"].includes(panel2) : panel2 !== value;
  }
  const dateBar = $("#todo-date-bar", root3);
  if (dateBar) dateBar.hidden = Boolean(panel2);
  root3?.querySelectorAll('[data-action="todo-panel"]').forEach((button2) => {
    button2.setAttribute("aria-current", button2.dataset.panel === panel2 ? "page" : "false");
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
    void loadDueTodos();
    await loadTodos();
    if (state.todoPanel === "history") void loadTodoMonth2(todoCalendarMonth(todoDay().date));
  }
  const selector = state.todoPanel === "future" ? "#todo-future-text" : state.todoPanel ? state.todoPanel === "history" ? "#todo-calendar-month-input" : "#todo-template-text" : "#todo-text";
  $(selector)?.focus();
}
function todoPending(day9) {
  return Boolean(day9.adding || day9.updates.size || day9.noteCompletions.size || day9.templateWrites.size || [...day9.removals.values()].some((ticket2) => ticket2.phase !== "ready") || todoPreferences().pending);
}
function todoStatus(day9) {
  if (todoPending(day9) || day9.error || todoPreferences().error) return "";
  return day9.loading && !day9.loaded ? "" : day9.notice;
}
function paintTodoSaving(root3, day9) {
  const busy2 = todoPending(day9);
  root3.setAttribute("aria-busy", String(busy2));
  if (!busy2) {
    clearTimeout(savingTimers.get(day9));
    savingTimers.delete(day9);
    savingTimes.delete(day9);
    return;
  }
  if (!savingTimes.has(day9)) {
    savingTimes.set(day9, Date.now());
    savingTimers.set(day9, setTimeout(() => {
      if (todosVisible() && todoDay() === day9) paintTodos();
    }, 900));
  } else if (Date.now() - savingTimes.get(day9) >= 900) $("#todo-status", root3).textContent = "正在同步…";
}
function pendingTodo(day9) {
  return day9.adding && day9.submitting ? `<li class="todo-pending-row" aria-label="待添加">
<span class="todo-pending-marker" aria-hidden="true"></span><span>${e(day9.submitting.text)}</span></li>` : "";
}
function todoFeedback(day9) {
  const error2 = [day9.error, todoPreferences().error].filter(Boolean).join(" ");
  return error2 ? `${e(error2)} ${day9.failedCreate ? `<span>「${e(day9.failedCreate.text)}」</span>
<button class="btn text small" data-action="todo-retry-add">重试添加</button>` : ""} <button class="btn text small" data-action="todo-reload">重新读取</button>` : "";
}
function todoHistoryEmpty(day9) {
  return state.todoPanel === "history" && day9.loaded && !day9.items.some((item) => !item.deleted_at) ? "这一天还没有待办。" : "";
}
function renderTodos() {
  const day9 = todoDay();
  return `<section id="daily-todos" class="daily-todos daily-todos-primary" data-date="${e(day9.date)}" aria-label="每日计划">
<div id="todo-heading" class="daily-todo-toolbar">${todoHeading(day9)}</div>
${renderTodoHistory(day9)}<div id="todo-main" ${["templates", "future"].includes(state.todoPanel) ? "hidden" : ""}>${todoDateControls(day9.date)}<div id="todo-form-top"></div>${state.todoPanel === "history" ? "" : todoForm(day9)}${renderInlineTodoTemplates()}
<div id="todo-feedback" class="form-message" role="alert">${todoFeedback(day9)}</div>
<p id="todo-status" class="daily-todo-status" role="status">${todoStatus(day9)}</p>
<div id="todo-undo" class="todo-undo" role="status">${renderTodoUndo(day9)}</div>
<p id="todo-history-empty" class="daily-todo-status">${todoHistoryEmpty(day9)}</p>
<ul id="todo-due" class="daily-todo-items todo-due-items" aria-label="快到期的未来待办" hidden></ul>
<ul id="todo-items" class="daily-todo-items">${day9.items.map((item) => todoRow(item, day9)).join("")}${pendingTodo(day9)}</ul><div id="todo-form-bottom"></div>${state.todoPanel === "history" ? todoForm(day9) : ""}</div>
${renderTodoTemplates()}${renderUnscheduledTodos()}</section>`;
}
function todosVisible() {
  return Boolean(state.me) && state.page === "todos";
}
function monthDayItems(day9) {
  return day9.items.filter((item) => {
    const removal = day9.removals.get(item.id);
    return !removal || removal.phase === "restoring";
  }).map((item) => day9.updates.has(item.id) ? { ...item, completed: day9.updates.get(item.id) } : item);
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
  const day9 = todoDay(), checkbox = document.activeElement?.dataset?.todoId;
  const stamp4 = monthDayOwners.get(day9);
  if (day9.loaded && stamp4?.owner === monthOwner()) {
    if (stamp4.revision !== day9.revision) {
      stamp4.at = Date.now();
      stamp4.revision = day9.revision;
    }
    if (monthLoader.update(monthOwner(), day9.date, monthDayItems(day9))) {
      const calendar = $("#todo-calendar");
      if (calendar) calendar.dataset.month = "";
    }
  }
  const menu = document.activeElement?.dataset?.action === "todo-menu" ? document.activeElement.dataset.id : null;
  if (root3.dataset.date !== day9.date) {
    const active5 = document.activeElement;
    const action = active5?.dataset?.action;
    const refocus = active5?.closest?.("#todo-date-bar") ? active5.id === "todo-date" ? "#todo-date" : ["todo-prev", "todo-next", "todo-today"].includes(action) ? `#todo-date-bar [data-action="${action}"]` : "" : "";
    root3.outerHTML = renderTodos();
    if (refocus) $(refocus)?.focus({ preventScroll: true });
    paintTodoTemplates();
    return;
  }
  const form = $("#todo-form", root3), formSlot = $(state.todoPanel === "history" ? "#todo-form-bottom" : "#todo-form-top", root3);
  if (form && formSlot && formSlot.nextElementSibling !== form) formSlot.after(form);
  const liveNote = document.activeElement?.matches?.("[data-todo-note-input]:not([data-future])") ? document.activeElement : null;
  const keepNote = liveNote?.isConnected && day9.noteEdit?.id === liveNote.dataset.id;
  const parts2 = {
    "todo-caption": todoCaption(day9),
    "todo-status": todoStatus(day9),
    "todo-undo": renderTodoUndo(day9),
    "todo-items": day9.items.map((item) => todoRow(item, day9)).join("") + pendingTodo(day9),
    "todo-feedback": todoFeedback(day9),
    "todo-history-empty": todoHistoryEmpty(day9)
  };
  for (const [id2, html] of Object.entries(parts2)) {
    if (id2 === "todo-items" && keepNote) continue;
    const node3 = $("#" + id2, root3);
    if (node3 && node3.innerHTML !== html) node3.innerHTML = html;
  }
  paintTodoCalendar(day9.date);
  const input = $("#todo-text", root3), button2 = $("#todo-form button[type=submit]", root3);
  const prompt = day9.date === bjtDate() ? "今天想完成什么？" : "这一天的计划", label = $('label[for="todo-text"]', root3);
  if (input && input.value !== day9.draft) input.value = day9.draft;
  if (input) {
    input.readOnly = false;
    input.placeholder = prompt;
  }
  if (label) label.textContent = prompt;
  if (button2) {
    button2.disabled = day9.adding;
    button2.textContent = "添加";
    button2.setAttribute("aria-busy", String(day9.adding));
  }
  paintTodoSaving(root3, day9);
  paintTodoPanels(root3);
  paintUnscheduledTodos();
  const focus = checkbox ? `[data-todo-id="${CSS.escape(checkbox)}"]` : menu ? `[data-action="todo-menu"][data-id="${CSS.escape(menu)}"]` : "";
  if (focus) ($(focus, root3) || $("[data-todo-id]", root3) || $("#todo-text", root3))?.focus();
  paintTodoTemplates();
  paintSmartTodo(root3, day9);
}
function todoReadActive(owner2, version2, date2, day9, sequence5) {
  return todoSessionActive(owner2) && version2 === runtime.renderVersion && todoDate() === date2 && day9.sequence === sequence5 && todosVisible();
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
  void loadDueTodos();
  const day9 = todoDay(), date2 = day9.date, owner2 = todoOwner(), priorScope = getOfflineRuntime()?.state.scope || null, version2 = runtime.renderVersion;
  const sequence5 = ++day9.sequence, revision2 = day9.revision;
  day9.loading = true;
  day9.error = "";
  paintTodos();
  try {
    const data3 = await api(`/todos?date=${encodeURIComponent(date2)}`, { context });
    if (!todoReadActive(owner2, version2, date2, day9, sequence5) || priorScope && priorScope !== getOfflineRuntime()?.state.scope) return;
    if (day9.revision !== revision2) return loadTodos(context);
    receiveTodoPreferences(data3.completed_mode, data3.preferences_version);
    day9.items = data3.items;
    day9.loaded = true;
    monthDayOwners.set(day9, { owner: monthOwner(), at: Date.now(), revision: day9.revision });
    if (date2 === bjtDate()) void carryUnfinishedTodos(day9, owner2);
    if (monthSnapshot.owner === monthOwner() && monthSnapshot.month === date2.slice(0, 7) && !monthSnapshot.loading) {
      monthSnapshot.days.set(date2, data3.items);
      const calendar = $("#todo-calendar");
      if (calendar) calendar.dataset.month = "";
    }
    if (state.todoPanel === "templates") paintTodoTemplates();
  } catch (error2) {
    if (todoReadActive(owner2, version2, date2, day9, sequence5) && !isRequestAbort(error2) && !error2.staleSession) day9.error = error2.message;
  } finally {
    if (todoSessionActive(owner2) && day9.sequence === sequence5) {
      const visible3 = todoReadActive(owner2, version2, date2, day9, sequence5);
      day9.loading = false;
      paintTodos();
      if (visible3 && state.todoPanel === "history") void loadTodoMonth2(todoCalendarMonth(date2));
      if (!visible3 && todoObservers.size && date2 === bjtDate()) void loadFloatingToday();
    }
  }
}
var carriedDays = /* @__PURE__ */ new Map();
async function carryUnfinishedTodos(day9, owner2) {
  if (carriedDays.get(owner2) === day9.date) return;
  carriedDays.set(owner2, day9.date);
  try {
    const result = await apiNetwork("/todo-carry", { method: "POST", body: {} });
    if (!todoSessionActive(owner2) || !result?.carried?.length || day9.date !== bjtDate()) return;
    day9.revision++;
    setTodoNotice(day9, `已把前几天没做完的 ${result.carried.length} 项移到今天`);
    void loadTodos();
  } catch (error2) {
    if (carriedDays.get(owner2) === day9.date && !error2?.staleSession) carriedDays.delete(owner2);
  }
}
function inputTodo(target) {
  const date2 = target.form?.dataset.date;
  if (target.id === "todo-text" && validTodoDate(date2)) {
    todoDay(date2).draft = target.value;
    notifyTodoChanges();
  }
}
function showTodoFailure(day9, error2) {
  if (isRequestAbort(error2) || error2.staleSession) return;
  day9.error = /preceding local version/.test(error2.message || "") ? "这项待办上一步还在同步，请等几秒再点一次。" : error2.message;
}
function setTodoNotice(day9, text) {
  const owner2 = todoOwner(), version2 = ++day9.noticeVersion;
  day9.notice = text;
  const timer = setTimeout(() => {
    if (!todoSessionActive(owner2) || day9.noticeVersion !== version2) return;
    day9.notice = "";
    if (day9.date === todoDate()) paintTodos();
  }, 2500);
  timer?.unref?.();
}
async function saveTodo(day9, request2, templateId = "") {
  const owner2 = todoOwner(), submittedDraft = day9.draft;
  day9.adding = true;
  day9.submitting = request2;
  day9.failedCreate = null;
  day9.error = "";
  day9.notice = "";
  day9.revision++;
  paintTodos();
  try {
    const item = await api("/todos", { method: "POST", body: request2 });
    if (!todoSessionActive(owner2)) return;
    mergeTodo(day9, item);
    if (monthSnapshot.owner === monthOwner() && monthSnapshot.month === day9.date.slice(0, 7)) {
      monthSnapshot.days.set(day9.date, [...day9.items]);
      const calendar = $("#todo-calendar");
      if (calendar) calendar.dataset.month = "";
    }
    if (templateId) day9.templateCreates.delete(templateId);
    else {
      if (day9.draft === submittedDraft && submittedDraft.trim() === request2.text) day9.draft = "";
      day9.create = null;
    }
    setTodoNotice(day9, "已添加");
  } catch (error2) {
    if (todoSessionActive(owner2)) {
      day9.failedCreate = request2;
      showTodoFailure(day9, error2);
      if (error2.status === 410) {
        if (templateId) day9.templateCreates.delete(templateId);
        else day9.create = null;
        day9.error = "原事项已被删除，输入已保留，可再次添加。";
      }
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day9.adding = false;
      day9.submitting = null;
      day9.revision++;
      paintTodos();
    }
  }
}
async function retryTodoCreate() {
  const day9 = todoDay();
  if (todosVisible() && day9.failedCreate && !day9.adding)
    await saveTodo(day9, day9.failedCreate, day9.failedCreate.template_id || "");
}
async function submitTodo({ form, data: data3 }) {
  if (!todosVisible() || !validTodoDate(form.dataset.date)) return;
  const day9 = todoDay(form.dataset.date), text = String(data3.text || "").trim();
  if (day9.adding) return;
  day9.draft = String(data3.text || "");
  if (day9.date !== todoDate()) {
    paintTodos();
    return;
  }
  if (!text || text.length > 500) {
    day9.error = "请填写 1–500 字的计划。";
    paintTodos();
    return;
  }
  if (smartTodoReady(text)) return confirmSmartTodo(day9);
  if (smartTodoWanted(text)) return startSmartTodo(day9, text, smartHooks);
  await addTypedTodo(day9, text);
}
async function addTypedTodo(day9, text) {
  if (!day9.create || day9.create.text !== text) day9.create = { id: crypto.randomUUID(), date: day9.date, text };
  await saveTodo(day9, day9.create);
}
var smartHooks = {
  repaint: () => paintTodos(),
  plain: (day9, text) => addTypedTodo(day9, text),
  // "删掉每周看电影" handles an existing to-do: the shown day's rows plus 未来待办.
  commandItems: (day9) => day9.items,
  consume: (day9, sentence) => {
    if (day9.draft.trim() === sentence) day9.draft = "";
    const input = $("#todo-text");
    if (input && input.value.trim() === sentence) input.value = "";
  },
  refresh: () => {
    void loadTodos();
    refreshFutureTodos();
  },
  async save(day9, request2, note) {
    await saveTodo(day9, request2);
    if (day9.failedCreate === request2) {
      day9.failedCreate = null;
      throw new Error(day9.error || "添加失败，请稍后再试");
    }
    day9.draft = "";
    day9.error = "";
    await startCount(day9, day9.items.find((row) => row.id === request2.id), note);
    paintTodos();
  },
  async saveElsewhere(day9, request2, label, note) {
    await addToOtherDay(request2, note);
    day9.draft = "";
    setTodoNotice(day9, `已添加到 ${label}`);
  },
  async saveFuture(day9, proposal, label) {
    await addFutureTodo(proposal);
    day9.draft = "";
    setTodoNotice(day9, `已加到未来待办 · ${label}`);
  },
  async saveDaily(day9, text, note) {
    const template = await api("/todo-templates", { method: "POST", body: { id: crypto.randomUUID(), text } });
    refreshOpenTodoTemplates();
    day9.draft = "";
    await submitTodoTemplate(template);
    if (day9.failedCreate?.template_id === template.id) throw new Error("已存为常用，但没能加到今天，可以在常用里点一下");
    await startCount(day9, day9.items.find((row) => row.template_id === template.id && !row.deleted_at), note);
    paintTodos();
  }
};
async function addToOtherDay(request2, note) {
  let item = await api("/todos", { method: "POST", body: request2 });
  if (note) item = await countNote(item, note);
  const other = todoDay(item.date);
  if (other.loaded) {
    mergeTodo(other, item);
    other.revision++;
  }
  if (monthSnapshot.owner === monthOwner() && monthSnapshot.month === item.date.slice(0, 7)) {
    monthSnapshot.days.set(item.date, [...(monthSnapshot.days.get(item.date) || []).filter((row) => row.id !== item.id), item]);
    monthLoader.update(monthOwner(), item.date, monthSnapshot.days.get(item.date));
    const calendar = $("#todo-calendar");
    if (calendar) calendar.dataset.month = "";
  }
  return item;
}
setFutureBridge({
  todayItems: () => todoDay(bjtDate()).items,
  refreshToday: () => {
    if (todoDay(bjtDate()).loaded) void loadTodos();
  },
  toDay: (request2, note) => addToOtherDay(request2, note),
  daily: (text, note) => smartHooks.saveDaily(todoDay(bjtDate()), text, note)
});
async function startCount(day9, item, note) {
  if (!note || !item) return;
  try {
    mergeTodo(day9, await countNote(item, note));
    day9.revision++;
  } catch {
    setTodoNotice(day9, "已添加，但计数没设上，可以在“⋯”里设置次数");
  }
}
async function countNote(item, note, tries = 8) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await api(`/todos/${item.id}/note`, { method: "PATCH", body: { note, version: item.version } });
    } catch (error2) {
      if (error2?.status !== 404 || attempt >= tries) throw error2;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
}
async function submitTodoTemplate(template) {
  if (!todosVisible()) return;
  const day9 = todoDay();
  if (day9.adding || todoTemplateAdded(day9, template.id)) return;
  let request2 = day9.templateCreates.get(template.id);
  if (!request2 || request2.text !== template.text) {
    request2 = { id: crypto.randomUUID(), date: day9.date, text: template.text, template_id: template.id };
    day9.templateCreates.set(template.id, request2);
  }
  await saveTodo(day9, request2, template.id);
}
async function toggleTodo(target, { floating = false } = {}) {
  if (!(floating ? Boolean(state.me) : todosVisible())) return;
  const day9 = todoDay(target.dataset.date), owner2 = todoOwner();
  const id2 = target.dataset.todoId;
  let item = day9.items.find((row) => row.id === id2);
  if (!item || item.deleted_at || day9.date !== (floating ? bjtDate() : todoDate())) return;
  if (todoBusy(day9, item.id)) {
    target.checked = day9.updates.has(item.id) ? day9.updates.get(item.id) : item.completed;
    return;
  }
  const completed = target.checked;
  const note = saveDailyTodoNote(day9, item, owner2);
  if (note !== true) {
    day9.noteCompletions.add(id2);
    target.checked = item.completed;
    paintTodos();
    const saved = await note;
    if (!todoSessionActive(owner2)) return;
    day9.noteCompletions.delete(id2);
    if (!saved) {
      day9.error = "备注还未存好，本次操作未提交。草稿已保留。";
      paintTodos();
      return;
    }
    item = day9.items.find((row) => row.id === id2);
    if (!item || item.deleted_at || day9.date !== (floating ? bjtDate() : todoDate())) {
      paintTodos();
      return;
    }
  }
  day9.updates.set(item.id, completed);
  day9.error = "";
  day9.notice = "";
  day9.revision++;
  paintTodos();
  try {
    const updated = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "PATCH", body: { completed, version: item.version } });
    if (todoSessionActive(owner2)) {
      mergeTodo(day9, updated);
      if (updated.template_id) refreshOpenTodoTemplates();
    }
  } catch (error2) {
    if (!todoSessionActive(owner2)) return;
    day9.updates.set(item.id, item.completed);
    showTodoFailure(day9, error2);
    if (error2.status === 409 && (floating || day9.date === todoDate())) {
      if (floating) await loadFloatingToday();
      else await loadTodos();
      if (todoSessionActive(owner2)) {
        day9.error ||= "这项计划已更新，已重新读取，请核对后再操作。";
        if (item.template_id) refreshOpenTodoTemplates();
      }
    }
  } finally {
    if (todoSessionActive(owner2)) {
      day9.updates.delete(item.id);
      day9.revision++;
      paintTodos();
    }
  }
}
async function loadFloatingToday() {
  if (!state.me) return;
  const date2 = bjtDate(), day9 = todoDay(date2), owner2 = todoOwner();
  const sequence5 = ++day9.sequence, revision2 = day9.revision;
  const current3 = () => todoSessionActive(owner2) && date2 === bjtDate() && day9.sequence === sequence5;
  day9.loading = true;
  day9.error = "";
  paintTodos();
  try {
    const data3 = await api(`/todos?date=${encodeURIComponent(date2)}`);
    if (!current3()) return;
    if (day9.revision !== revision2) {
      void loadFloatingToday();
      return;
    }
    receiveTodoPreferences(data3.completed_mode, data3.preferences_version);
    day9.items = data3.items;
    day9.loaded = true;
  } catch (error2) {
    if (current3() && !isRequestAbort(error2) && !error2.staleSession) day9.error = error2.message;
  } finally {
    if (current3()) {
      day9.loading = false;
      paintTodos();
    }
  }
}
function selectTodoDate(date2) {
  if (!validTodoDate(date2) || state.page !== "todos") return;
  state.todoDate = date2;
  todosState.calendarDate = date2;
  todosState.calendarMonth = date2.slice(0, 7);
  updateRoute(true);
  paintTodos();
  loadTodos();
}
function moveTodoDate(offset) {
  const date2 = /* @__PURE__ */ new Date(`${todoDate()}T00:00:00Z`);
  date2.setUTCDate(date2.getUTCDate() + offset);
  selectTodoDate(date2.toISOString().slice(0, 10));
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
  watchVisibleTodoDay({
    window,
    document,
    selection() {
      if (!state.me || state.page !== "todos" || ["future", "templates"].includes(state.todoPanel) || document.activeElement?.matches?.("[data-todo-note-input]") || document.querySelector("#overlay > *, .popover")) return null;
      const day9 = todoDay(), offline = getOfflineRuntime()?.state;
      if (document.activeElement?.id === "todo-text" && document.activeElement.value !== day9.draft) return null;
      if (!day9.loaded || day9.loading || day9.noteEdit || todoPending(day9) || offline?.pending || offline?.conflicts) return null;
      return { date: day9.date, day: day9, key: JSON.stringify([monthOwner(), runtime.renderVersion, day9.date, day9.sequence, day9.revision]) };
    },
    read: (date2) => api("/todos?date=" + encodeURIComponent(date2)),
    apply({ date: date2, day: day9 }, data3) {
      if (!Array.isArray(data3?.items) || JSON.stringify(day9.items) === JSON.stringify(data3.items)) return;
      day9.items = data3.items;
      monthDayOwners.set(day9, { owner: monthOwner(), at: Date.now(), revision: day9.revision });
      if (monthSnapshot.owner === monthOwner() && monthSnapshot.month === date2.slice(0, 7)) monthSnapshot.days.set(date2, data3.items);
      paintTodos();
    }
  });
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
      const node3 = $("#todo-calendar");
      if (node3) {
        node3.dataset.month = "";
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
  const page = (category, date2) => {
    const key = category + ":" + date2;
    if (!views.has(key)) views.set(key, { active: "", revision: 0, collapseRequested: false, explicit: false });
    return views.get(key);
  };
  function activate(category, date2, key) {
    const view3 = page(category, date2);
    view3.active = key;
    view3.revision++;
    view3.collapseRequested = false;
    view3.explicit = false;
    return view3;
  }
  function requestCollapse(category, date2, key, revision2, { explicit = false } = {}) {
    const view3 = page(category, date2);
    if (view3.active !== key || view3.revision !== revision2) return;
    view3.collapseRequested = true;
    view3.explicit = explicit;
  }
  function sync(category, date2, items, legacy2, { focused = false, composing = false } = {}) {
    const view3 = page(category, date2), item = view3.active === "legacy" ? legacy2 : items.find((value) => value.id === view3.active);
    if (view3.active && !item) activate(category, date2, "");
    else if (view3.collapseRequested && (noteEditorCanCollapse(item) || view3.explicit && item && !item.pending) && !composing && (!focused || view3.explicit)) {
      activate(category, date2, "");
    }
    return view3;
  }
  const clear = () => views.clear();
  return { page, activate, requestCollapse, sync, clear };
}

// web/pages/note-suggest.mjs
init_api();
init_format();
var readings = /* @__PURE__ */ new Map();
var repaint = () => {
};
function setNoteSuggestRepaint(callback) {
  repaint = callback;
}
var FUTURE = { this_week: "本周", next_week: "下周", this_month: "本月", next_month: "下个月", every_week: "每周", every_month: "每月" };
function whenLabel(todo, today2 = bjtDate()) {
  if (todo.when === "day" && todo.date) return smartDayLabel(todo.date, today2);
  if (todo.when === "deadline" && todo.due_date) return `${Number(todo.due_date.slice(5, 7))}/${Number(todo.due_date.slice(8))} 之前`;
  return FUTURE[todo.when] || "今天";
}
async function suggestForNote(item, labels4) {
  const text = String(item?.serverText ?? item?.draft ?? "").trim(), key = `${item?.id}:${item?.version}`;
  if (!item?.id || [...text].length < 4 || readings.get(item.id)?.key === key) return;
  const reading = { key, status: "reading", todo: null, todos: [], picked: [], labels: [], done: {}, error: "" };
  readings.set(item.id, reading);
  repaint();
  try {
    const data3 = await api("/note-suggest", { method: "POST", body: { text, labels: labels4, current: item.labels || [] } });
    if (readings.get(item.id) !== reading) return;
    const todos = Array.isArray(data3.todos) ? data3.todos.filter((todo) => todo?.text) : data3.todo ? [data3.todo] : [];
    if (!data3.needs_model || !todos.length && !data3.labels?.length) {
      readings.delete(item.id);
      repaint();
      return;
    }
    Object.assign(reading, {
      status: "ready",
      todo: todos.length === 1 ? todos[0] : null,
      todos: todos.length > 1 ? todos : [],
      picked: todos.map(() => true),
      labels: data3.labels || []
    });
  } catch {
    readings.delete(item.id);
  }
  repaint();
}
function paintNoteSuggestion(node3, item) {
  const reading = readings.get(item.id);
  let box = node3.querySelector(":scope > .note-suggest");
  if (!reading || item.deleted) {
    box?.remove();
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.className = "note-suggest";
    box.setAttribute("role", "status");
    node3.append(box);
  }
  const key = JSON.stringify([reading.status, reading.done, reading.error, reading.busy, reading.picked]);
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const make = (tag2, className, text) => {
    const node4 = document.createElement(tag2);
    node4.className = className;
    if (text) node4.textContent = text;
    return node4;
  };
  const head = make("p", "note-suggest-head", reading.status === "reading" ? "AI 正在看这条…" : "AI 看了这条");
  if (reading.status !== "reading") {
    const close = make("button", "note-suggest-close", "×");
    close.type = "button";
    close.dataset.noteSuggest = "dismiss";
    close.dataset.noteSuggestId = item.id;
    close.setAttribute("aria-label", reading.done.todo || reading.done.labels ? "关闭" : "忽略");
    head.append(close);
  }
  const parts2 = [head];
  const row = (tag2, text, when, action, label, done3) => {
    const line = make("div", "note-suggest-item");
    const body4 = make("span", "note-suggest-text", text);
    if (when) body4.append(make("em", "", when));
    line.append(make("span", "note-suggest-tag", tag2), body4);
    if (done3) line.append(make("span", "note-suggest-done", done3));
    else {
      const button2 = make("button", "note-suggest-btn", label);
      button2.type = "button";
      button2.disabled = Boolean(reading.busy);
      button2.dataset.noteSuggest = action;
      button2.dataset.noteSuggestId = item.id;
      line.append(button2);
    }
    parts2.push(line);
  };
  if (reading.status !== "reading") {
    if (reading.todo) {
      const text = reading.todo.inferred ? `要不要${reading.todo.text}？` : reading.todo.text;
      const when = reading.todo.inferred && reading.todo.when === "none" ? "" : whenLabel(reading.todo);
      row(reading.todo.inferred ? "灵感" : "待办", text, when, "todo", "加到待办", reading.done.todo ? `✓ 已加到 ${reading.done.todo}` : "");
    }
    if (reading.todos.length) {
      const list3 = make("div", "note-suggest-list");
      reading.todos.forEach((todo, index) => {
        const line = make("div", "note-suggest-item note-suggest-pick");
        const on = reading.picked[index] !== false, added = reading.done.todos?.[index];
        if (added) line.append(make("span", "note-suggest-done", "✓"));
        else {
          const pick = make("button", "note-suggest-check", on ? "☑" : "☐");
          pick.type = "button";
          pick.disabled = Boolean(reading.busy || reading.done.todos);
          pick.setAttribute("aria-pressed", String(on));
          pick.setAttribute("aria-label", (on ? "不要 " : "要 ") + todo.text);
          pick.dataset.noteSuggest = "pick";
          pick.dataset.noteSuggestId = item.id;
          pick.dataset.noteSuggestIndex = String(index);
          line.append(pick);
        }
        const body4 = make("span", "note-suggest-text", todo.text);
        body4.append(make("em", "", whenLabel(todo)));
        line.append(body4);
        list3.append(line);
      });
      const head2 = make("div", "note-suggest-item");
      head2.append(make("span", "note-suggest-tag", "待办"), make("span", "note-suggest-text", `这段话里有 ${reading.todos.length} 件事`));
      const count3 = reading.picked.filter(Boolean).length;
      if (reading.done.todos) head2.append(make("span", "note-suggest-done", `✓ 已加 ${Object.keys(reading.done.todos).length} 件`));
      else {
        const button2 = make("button", "note-suggest-btn", count3 ? `加 ${count3} 件到待办` : "先勾要哪几件");
        button2.type = "button";
        button2.disabled = Boolean(reading.busy) || !count3;
        button2.dataset.noteSuggest = "todos";
        button2.dataset.noteSuggestId = item.id;
        head2.append(button2);
      }
      parts2.push(head2, list3);
    }
    if (reading.labels.length) row("标签", reading.labels.join("、"), "", "labels", "贴上", reading.done.labels ? "✓ 已贴上" : "");
    if (reading.error) parts2.push(make("p", "note-suggest-error", reading.error));
  }
  box.replaceChildren(...parts2);
}
async function addTodo(todo) {
  if (FUTURE[todo.when] || todo.when === "deadline") await addFutureTodo(todo);
  else {
    const date2 = todo.when === "day" && todo.date ? todo.date : bjtDate();
    await api("/todos", { method: "POST", body: { id: crypto.randomUUID(), date: date2, text: todo.text } });
  }
  return FUTURE[todo.when] || todo.when === "deadline" ? `未来 · ${whenLabel(todo)}` : whenLabel(todo);
}
async function actOnNoteSuggestion(target, { relabel, current: current3 }) {
  const id2 = target.dataset.noteSuggestId, reading = readings.get(id2), action = target.dataset.noteSuggest;
  if (!reading || reading.busy) return;
  if (action === "dismiss") {
    readings.delete(id2);
    repaint();
    return;
  }
  if (action === "pick") {
    const index = Number(target.dataset.noteSuggestIndex);
    if (reading.done.todos || !Number.isInteger(index) || !reading.todos[index]) return;
    reading.picked = reading.picked.map((on, at) => at === index ? !on : on);
    repaint();
    return;
  }
  reading.busy = true;
  reading.error = "";
  repaint();
  try {
    if (action === "todo" && reading.todo) {
      reading.done = { ...reading.done, todo: await addTodo(reading.todo) };
    } else if (action === "todos" && reading.todos.length) {
      const added = { ...reading.addedTodos || {} };
      try {
        for (const [index, todo] of reading.todos.entries())
          if (reading.picked[index] !== false && !added[index]) added[index] = await addTodo(todo);
      } finally {
        reading.addedTodos = added;
      }
      reading.done = { ...reading.done, todos: added };
    } else if (action === "labels") {
      const merged = [.../* @__PURE__ */ new Set([...current3(id2) || [], ...reading.labels])];
      if (!await relabel(id2, merged)) throw new Error("标签没贴上，可以点「编辑」手动选");
      reading.done = { ...reading.done, labels: true };
    }
  } catch (error2) {
    reading.error = error2?.message || "没能完成，请稍后再试";
  }
  reading.busy = false;
  repaint();
}

// web/core/note-entries-state.mjs
init_daily_notes_state();
init_document();
var uuidPattern6 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var blocked = (item) => ["conflict", "unknown"].includes(item.phase);
var timestamp3 = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
var noteValue = (value) => isLocalDocument(value) ? documentValue(value) : value;
var persistedVersion = (item) => item.localBacked ? item.localVersion : item.version;
var savedText = (item) => item.localBacked ? item.durableText : item.serverText;
var savedPhase = (item) => item.localBacked ? item.localQueued ? "queued" : "cached" : item.version ? "saved" : "empty";
var labelsOf = (value) => Array.isArray(value?.labels) ? value.labels : value?.label ? [value.label] : [];
var equalLabels = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
var validLabels = (labels4) => Array.isArray(labels4) && labels4.every(validNoteLabel) && new Set(labels4).size === labels4.length;
var validLegacyLabels = (labels4, category) => validLabels(labels4) && (category === "life" || labels4.length === 0) && labels4.every(validCustomNoteLabel);
var localFailure = (error2) => error2.localNotSaved === true || /^OFFLINE_(?:STORAGE|CACHE|INVALID|SCOPE)/.test(error2.code || "");
function validNoteLabel(value) {
  return typeof value === "string" && value.isWellFormed() && value === value.trim().normalize("NFC") && [...value].length >= 1 && [...value].length <= 32 && !/[\u0000-\u001f\u007f]/.test(value);
}
function validCustomNoteLabel(value) {
  return typeof value === "string" && value.isWellFormed() && value === value.trim().normalize("NFC") && [...value].length >= 1 && [...value].length <= 32 && !/[\u0000-\u001f\u007f]/.test(value) && !["生活", "工作"].includes(value);
}
function checkedLocalDocument(value, category, date2, id2) {
  const { local, server } = documentState(value);
  if (!local || !uuidPattern6.test(local.id) || id2 && local.id !== id2 || local.category !== category || local.date !== date2 || typeof local.text !== "string" || dailyNotesBytes(local.text) > DAILY_NOTES_MAX_BYTES || !Number.isSafeInteger(local.version) || local.version < 1 || typeof local.deleted !== "boolean" || typeof local.can_edit !== "boolean" || local.label != null && (category !== "life" || !validCustomNoteLabel(local.label))) throw new Error("本机记录读取不完整，草稿已保留。");
  if (server) checkedEntry(server, category, date2, local.id);
  return value;
}
function checkedEntry(value, category, date2, id2) {
  if (isLocalDocument(value)) return checkedLocalDocument(value, category, date2, id2);
  if (!value || !uuidPattern6.test(value.id) || id2 && value.id !== id2 || value.category !== category || value.date !== date2 || typeof value.text !== "string" || dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES || !Number.isSafeInteger(value.version) || value.version < 1 || typeof value.deleted !== "boolean" || typeof value.can_edit !== "boolean" || !timestamp3(value.created_at) || !timestamp3(value.updated_at) || typeof value.content_hash !== "string" || !value.content_hash || [2, 3].includes(value.labels_version) && !Array.isArray(value.labels) || value.labels !== void 0 && !(value.labels_version === 3 ? validLabels(value.labels) : validLegacyLabels(value.labels, category)) || value.label != null && (category !== "life" || !validCustomNoteLabel(value.label))) {
    throw new Error("记录读取不完整，请重新核对。");
  }
  return value;
}
function checkedCollection(value, category, date2) {
  if (!value || value.category !== category || value.date !== date2 || !Array.isArray(value.entries) || value.entries.length > 200 || typeof value.can_edit !== "boolean") throw new Error("记录列表不完整，请重新读取。");
  const ids = /* @__PURE__ */ new Set();
  for (const raw of value.entries) {
    checkedEntry(raw, category, date2);
    const entry = noteValue(raw);
    if (entry.deleted || ids.has(entry.id)) throw new Error("记录列表不完整，请重新读取。");
    ids.add(entry.id);
  }
  return value;
}
function createEntriesContext({
  category,
  load: load2,
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
    options: { load: load2, loadEntry, loadOperation, loadVerified, put, remove, restore, onSaved, discardUnsent, prepareDelete, finishDelete, uuid: uuid5 }
  };
  const emit2 = () => {
    if (!context.disposed) onChange();
  };
  const page = (date2) => {
    if (!validDailyNotesDate(date2)) throw new Error("请选择有效日期。");
    if (!pages.has(date2)) pages.set(date2, {
      category,
      date: date2,
      ids: [],
      loaded: false,
      loading: false,
      canEdit: false,
      error: "",
      sequence: 0,
      composerId: ""
    });
    return pages.get(date2);
  };
  const entry = (id2) => entries.get(id2);
  const stopTimer = (item) => {
    if (item.timer !== null) clearTimer(item.timer);
    item.timer = null;
  };
  function makeEntry(id2, date2, canEdit) {
    return {
      id: id2,
      category,
      date: date2,
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
  const { load: load2, loadEntry } = context.options;
  async function read2(date2, options3 = {}) {
    const current3 = page(date2), sequence5 = ++current3.sequence;
    const epochs = new Map(current3.ids.map((id2) => [id2, entry(id2)?.writeEpoch]));
    current3.loading = true;
    current3.error = "";
    emit2();
    try {
      const value = checkedCollection(await load2(date2, options3), category, date2);
      if (context.disposed || sequence5 !== current3.sequence) return;
      current3.canEdit = value.can_edit;
      current3.labelsComplete = [2, 3].includes(value.labels_version);
      const found = /* @__PURE__ */ new Set();
      for (const raw of value.entries) {
        const visible3 = noteValue(raw);
        found.add(visible3.id);
        let item = entry(visible3.id);
        if (!item) {
          item = makeEntry(visible3.id, date2, visible3.can_edit);
          entries.set(visible3.id, item);
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
      await Promise.all(current3.ids.filter((id2) => !found.has(id2) && persistedVersion(entry(id2)) > 0 && (entry(id2).dirty || entry(id2).localBacked) && !entry(id2).pending).map((id2) => readOne(id2, options3)));
    } catch (error2) {
      if (!context.disposed && sequence5 === current3.sequence) current3.error = error2.message;
    } finally {
      if (!context.disposed && sequence5 === current3.sequence) {
        current3.loading = false;
        emit2();
        for (const id2 of current3.ids) schedule(entry(id2));
      }
    }
  }
  async function readOne(id2, options3 = {}) {
    const item = entry(id2);
    if (!item || context.disposed) return;
    const sequence5 = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true;
    emit2();
    try {
      const value = checkedEntry(await loadEntry(id2, options3), category, item.date, id2);
      if (!context.disposed && sequence5 === item.sequence && !item.pending && epoch === item.writeEpoch) merge(item, value);
    } catch (error2) {
      if (!context.disposed && sequence5 === item.sequence) {
        item.error = error2.message;
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
  function start(date2, { label = "", labels: labels4 = label ? [label] : [] } = {}) {
    const current3 = page(date2);
    if (!validLabels(labels4, context.category)) throw new Error("标签无效。");
    if (context.disposed || !current3.loaded || !current3.canEdit || date2 !== dailyNotesToday()) return;
    const existing = entry(current3.composerId);
    if (existing && persistedVersion(existing) === 0 && !existing.deleted && existing.label === label) return existing;
    const id2 = uuid5();
    if (!uuidPattern6.test(id2) || entries.has(id2)) throw new Error("暂时无法新建记录，请重试。");
    const item = makeEntry(id2, date2, current3.canEdit);
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
      const valid3 = ["put", "delete", "restore"].includes(operation2.kind) && uuidPattern6.test(operation2.saveId) && Number.isSafeInteger(operation2.version) && operation2.version >= 0 && (operation2.kind !== "put" || typeof operation2.text === "string" && dailyNotesBytes(operation2.text) <= DAILY_NOTES_MAX_BYTES && (!operation2.labels || validLabels(operation2.labels, category)) && (!operation2.label || category === "life" && validCustomNoteLabel(operation2.label)) && (!operation2.expectedLabel || category === "life" && validCustomNoteLabel(operation2.expectedLabel)));
      item.pending = valid3 ? {
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
      item.error = valid3 ? "已找回未确认的原保存，请手动核对结果；不会自动重发。" : "旧保存凭据不完整，草稿已保留供查看或导出。";
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
        const list3 = checkedCollection(await loadVerified(item.date), category, item.date);
        if (context.disposed || entry(id2) !== item || item.writeEpoch !== snapshot.epoch || item.draft !== snapshot.draft || !equalLabels(item.labels, snapshot.labels) || item.pending || item.composing || !item.canEdit || item.deleted || item.discarding) return;
        if (list3.entries.some(isLocalDocument)) throw new Error("无法确认线上最新状态");
        const same3 = list3.entries.find((value) => value.id === id2);
        if (same3 && same3.text === snapshot.draft && equalLabels(labelsOf(same3), snapshot.labels)) {
          item.error = "线上已有这条记录，无需重复发送；本机草稿仍保留。";
          return;
        }
        if (list3.entries.some((value) => value.id !== id2 && value.text === snapshot.draft)) {
          item.error = "线上有内容相同的其他记录，请先核对；本机草稿仍保留。";
          return;
        }
        if (!list3.can_edit || same3 && (same3.version !== item.recoveredBaseline.version || !item.recoveredBaseline.contentHash || same3.content_hash !== item.recoveredBaseline.contentHash) || !same3 && snapshot.version !== 0) {
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
      } catch (error2) {
        item.discarding = false;
        item.phase = "error";
        item.error = "本机草稿未能清理，内容已保留：" + error2.message;
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
    } catch (error2) {
      item.discarding = false;
      item.phase = "error";
      item.error = "本机草稿未能核对，内容已保留：" + error2.message;
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
      const body4 = { version: operation2.version, save_id: operation2.saveId };
      const options3 = operation2.uncertain ? { offlineUnknown: true } : void 0;
      const raw = operation2.kind === "delete" ? await remove(item.id, body4, options3) : operation2.kind === "restore" ? await restore(item.id, body4, options3) : await put(item.id, {
        ...body4,
        category: item.category,
        date: item.date,
        text: operation2.text,
        ...operation2.labels ? { labels: operation2.labels } : operation2.label ? { label: operation2.label } : {}
      }, options3);
      if (context.disposed || item.pending !== operation2) return;
      const value = checkedEntry(raw, category, item.date, item.id);
      if (isLocalDocument(value)) {
        acceptedLocal(item, value, operation2);
        return;
      }
      if (!matches2(value, operation2)) throw new Error("保存响应需要重新核对。");
      accepted(item, value, operation2);
      return value;
    } catch (error2) {
      if (context.disposed || item.pending !== operation2) return;
      if (localFailure(error2)) {
        item.pending = operation2.uncertain ? operation2 : null;
        item.phase = operation2.uncertain ? "unknown" : "error";
        item.error = operation2.uncertain ? "原保存仍待核对，本机接管未完成：" + error2.message : error2.message;
        emit2();
      } else if (error2.status === 409 && (!error2.code || ["VERSION_CONFLICT", "NOTE_ENTRY_DELETED"].includes(error2.code))) {
        item.pending = null;
        item.phase = "conflict";
        item.error = error2.message || "这条记录已有新版本，草稿已保留。";
        emit2();
        await context.readOne(item.id);
      } else if (error2.status >= 400 && error2.status < 500) {
        item.pending = null;
        item.phase = "error";
        item.error = error2.message;
        if ([401, 403].includes(error2.status)) item.canEdit = false;
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
  const { load: load2, loadEntry, loadOperation } = context.options;
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
      } catch (error2) {
        if (error2.status !== 404 || receipt.found || operation2.version !== 0 || operation2.kind !== "put") throw error2;
        const collection = checkedCollection(await load2(item.date), category, item.date);
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
    } catch (error2) {
      if (!context.disposed && item.pending === operation2) {
        item.error = "核对失败，草稿已保留：" + error2.message;
        if ([401, 403].includes(error2.status)) item.canEdit = false;
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
function createNoteEntriesStore(options3) {
  const context = createEntriesContext(options3);
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
  const date2 = /* @__PURE__ */ new Date(month + "-01T12:00:00Z");
  date2.setUTCMonth(date2.getUTCMonth() + delta2);
  const value = date2.toISOString().slice(0, 7);
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
  for (let day9 = 1; day9 <= last.getUTCDate(); day9++)
    weeks[Math.floor((offset + day9 - 1) / 7)][(offset + day9 - 1) % 7] = month + "-" + String(day9).padStart(2, "0");
  return weeks;
}
function checkedNoteMonth(data3, month) {
  const fail6 = () => {
    throw new Error("月记录不完整，请联网重试。");
  };
  if (!validNoteMonth(month) || !data3 || data3.month !== month || data3.complete !== true || ![1, 2, 3].includes(data3.labels_version) || !Array.isArray(data3.days) || data3.days.length > 31) fail6();
  const result = /* @__PURE__ */ new Map(), ids = /* @__PURE__ */ new Set();
  let total = 0;
  for (const day9 of data3.days) {
    if (!day9 || !validDailyNotesDate(day9.date) || !day9.date.startsWith(month + "-") || result.has(day9.date) || !Array.isArray(day9.items)) fail6();
    const items = day9.items.map((item) => {
      if (!item || typeof item.entity_id !== "string" || ids.has(item.entity_id) || !["note_entry", "legacy_daily_note"].includes(item.source) || !["life", "work"].includes(item.category) || data3.labels_version === 1 && (!Object.hasOwn(item, "label") || item.label !== null && (item.category !== "life" || !validCustomNoteLabel(item.label))) || data3.labels_version >= 2 && (!Array.isArray(item.labels) || item.labels.some((label) => data3.labels_version === 3 ? !validNoteLabel(label) : item.category !== "life" || !validCustomNoteLabel(label)) || new Set(item.labels).size !== item.labels.length) || typeof item.text !== "string" || !item.text || !Object.hasOwn(item, "created_at") || item.created_at !== null && !Number.isFinite(Date.parse(item.created_at)) || item.source === "legacy_daily_note" && item.created_at !== null || !Number.isFinite(Date.parse(item.updated_at))) fail6();
      ids.add(item.entity_id);
      total++;
      const displayLabels = data3.labels_version === 3 ? item.labels : item.labels?.length ? item.labels : item.label ? [item.label] : [item.category === "work" ? "工作" : "生活"];
      return { ...item, displayLabels, displayLabel: displayLabels.join("、") };
    });
    result.set(day9.date, items);
  }
  if (total > 2e3) fail6();
  return result;
}

// web/notes-month-controller.mjs
init_daily_notes_state();
function renderNotesMonthMarkup() {
  return '<details id="notes-month-panel" class="notes-month-panel"><summary>月历与历史</summary><div class="notes-month-controls"><button class="btn" type="button" data-notes-month-step="-1" aria-label="上个月">‹</button><label>月份 <input id="notes-month-input" class="input" type="month"></label><button class="btn" type="button" data-notes-month-step="1" aria-label="下个月">›</button><label>分类 <select id="notes-month-category" class="input"><option value="">全部</option><option value="life">生活</option><option value="work">工作</option></select></label><button class="btn text" type="button" data-notes-month-refresh>刷新</button></div><p id="notes-month-status" role="status" aria-live="polite"></p><div class="notes-month-weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div id="notes-month-grid" class="notes-month-grid"></div><h3 id="notes-month-day-title"></h3><div id="notes-month-history" class="notes-entry-list"></div></details>';
}
function mountNotesMonth(root3, { request: request2, selectDate, identity: identity5 }) {
  const panel2 = root3.querySelector("#notes-month-panel");
  if (!panel2) return () => {
  };
  const find = (selector) => panel2.querySelector(selector), doc = root3.ownerDocument;
  const identityNow = typeof identity5 === "function" ? identity5 : () => identity5, expected = identityNow();
  let disposed = false, sequence5 = 0, days = /* @__PURE__ */ new Map(), loaded = "", selected = dailyNotesToday(), month = selected.slice(0, 7), category = "";
  const active5 = () => !disposed && root3.isConnected && identityNow() === expected;
  const visibleRows = (date2) => (days.get(date2) || []).filter((item) => !category || item.category === category);
  find("#notes-month-input").value = month;
  function node3(tag2, text, className = "") {
    const result = doc.createElement(tag2);
    result.textContent = text;
    if (className) result.className = className;
    return result;
  }
  function paintHistory() {
    const rows = visibleRows(selected), list3 = find("#notes-month-history");
    list3.replaceChildren();
    find("#notes-month-day-title").textContent = selected + " · " + rows.length + " 条记录";
    for (const item of rows) {
      const card3 = node3("article", "", "note-entry note-entry-saved"), head = node3("div", "", "note-entry-head");
      head.append(node3("span", item.displayLabel + (item.source === "legacy_daily_note" ? " · 原有记录" : "")));
      const time3 = node3("time", new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.updated_at)));
      time3.dateTime = item.updated_at;
      head.append(time3);
      card3.append(head, node3("div", item.text || "这条记录没有文字。", "note-entry-reader"));
      const open = node3("button", "查看当天", "btn text");
      open.type = "button";
      open.addEventListener("click", () => {
        if (active5()) void selectDate(selected, item.category);
      });
      card3.append(open);
      list3.append(card3);
    }
    if (!rows.length) list3.append(node3("p", "这一天没有符合分类的已同步记录。", "notes-empty"));
  }
  function paint4() {
    const grid = find("#notes-month-grid");
    grid.replaceChildren();
    for (const date2 of noteMonthWeeks(month).flat()) {
      if (!date2) {
        grid.append(node3("span", ""));
        continue;
      }
      const count3 = visibleRows(date2).length, button2 = node3("button", String(Number(date2.slice(-2))) + (count3 ? " · " + count3 : ""), "btn");
      button2.type = "button";
      button2.dataset.notesMonthDate = date2;
      button2.setAttribute("aria-label", date2 + "，" + count3 + " 条记录");
      button2.setAttribute("aria-pressed", String(date2 === selected));
      button2.classList.toggle("has-records", count3 > 0);
      grid.append(button2);
    }
    paintHistory();
  }
  async function load2(force = false) {
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
      paint4();
    } catch (error2) {
      if (!active5() || current3 !== sequence5) return;
      find("#notes-month-status").textContent = error2.message || "月记录读取失败，请重试。";
    }
  }
  function toggle() {
    if (panel2.open) void load2();
  }
  function change3(event) {
    if (!active5()) return;
    if (event.target.id === "notes-month-input") {
      if (!validNoteMonth(event.target.value)) {
        find("#notes-month-status").textContent = "请选择有效月份。";
        return;
      }
      month = event.target.value;
      void load2();
    } else if (event.target.id === "notes-month-category") {
      category = event.target.value;
      if (loaded === month) paint4();
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
        void load2();
      } catch (error2) {
        find("#notes-month-status").textContent = error2.message;
      }
    } else if (target.dataset.notesMonthDate) {
      selected = target.dataset.notesMonthDate;
      paint4();
    } else void load2(true);
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
  return '<section id="daily-notes" class="daily-notes" aria-label="碎碎念" data-category="' + category + '"><div class="segmented" role="group" aria-label="碎碎念视图"><button type="button" data-notes-view="today" aria-pressed="true">今日碎碎念</button><button type="button" data-notes-view="history" aria-pressed="false">时间轴</button><button type="button" data-notes-view="labels" aria-pressed="false">标签</button></div><section id="notes-history" hidden aria-label="碎碎念时间轴"><div class="notes-calendar-layout"><aside class="notes-calendar-filters"><div class="notes-month-row"><button type="button" class="notes-month-step" data-notes-month="prev" aria-label="上个月" title="上个月">‹</button><label class="notes-month-field"><span class="sr-only">月份</span><input type="month" id="notes-history-month" class="input"></label><button type="button" class="notes-month-step" data-notes-month="next" aria-label="下个月" title="下个月">›</button></div><label hidden>周次 <select id="notes-history-week" class="input"><option value="">全部周次</option></select></label><label class="notes-label-field"><span class="sr-only">标签</span><select id="notes-history-label" class="input"><option value="">全部标签</option></select></label><label hidden>日期 <select id="notes-history-date" class="input"></select></label><button type="button" class="notes-timeline-order" data-history-order="desc" aria-label="切换时间轴排序">↓ 新到旧</button></aside><div class="notes-calendar-main"><section id="body-summary" class="body-summary" hidden aria-label="大小便周小结" aria-live="polite"></section><p id="notes-history-summary" class="notes-calendar-summary"></p><p id="notes-history-status" role="status" aria-live="polite"></p><div id="notes-history-list" class="notes-entry-list"></div></div></div></section><section id="notes-labels" hidden aria-label="标签管理"><div class="notes-categories"><label><span class="sr-only">新标签名称</span><input id="notes-new-label" class="input" maxlength="64" placeholder="新标签"></label><button class="btn text" type="button" data-notes-action="create-label">添加标签</button></div><p id="notes-label-status" role="status" aria-live="polite"></p><ul id="notes-label-list"></ul><section id="notes-label-backfill" class="notes-backfill" hidden aria-live="polite" aria-label="给旧碎碎念补标签"></section></section><div id="notes-today"><div class="notes-toolbar"><div class="notes-date-controls"><button class="btn" type="button" data-notes-action="previous" aria-label="前一天">‹</button><label class="notes-date-label"><span class="sr-only">选择碎碎念日期</span><input id="notes-date" class="input" type="date" max="' + dailyNotesToday() + '"></label><button class="btn" type="button" data-notes-action="next" aria-label="后一天">›</button><button class="btn text" type="button" data-notes-action="today">今天</button></div><section id="daily-score" class="daily-score is-open" aria-label="今日打分"><button id="daily-score-chip" class="daily-score-chip" type="button" data-daily-score-toggle aria-expanded="false" hidden></button><span id="daily-score-trend" class="daily-score-trend"></span><div class="daily-score-picker"><span class="daily-score-label" id="daily-score-label">今日打分</span><span class="daily-score-end" aria-hidden="true">很糟</span><div class="daily-score-scale" role="group" aria-label="1 到 10 分，1 很糟，10 很好">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => '<button type="button" data-daily-score="' + score + '" aria-pressed="false">' + score + "</button>").join("") + '</div><span class="daily-score-end" aria-hidden="true">很好</span></div><span id="daily-score-status" class="notes-status" role="status" aria-live="polite"></span></section><form id="diary-title-form" class="diary-title-card" aria-label="日记小标题"><div class="diary-title-fields"><label for="diary-title-input">日记小标题</label><input class="input" id="diary-title-input" type="text" maxlength="40" placeholder="写四五个字，可留空" autocomplete="off" disabled><button class="btn" type="submit" disabled>保存</button></div><button class="btn text" type="button" data-diary-title-login hidden>登录填写小标题</button><span class="notes-status" role="status" aria-live="polite"></span></form><div class="notes-entry-toolbar"><button class="btn notes-add-entry" type="button" data-notes-action="new" hidden>＋ 写一条</button><button class="btn text" type="button" data-notes-action="login" hidden>所有者登录</button></div><span id="notes-status" class="notes-status" role="status" aria-live="polite"></span></div><div class="notes-published"><div id="notes-entry-list" class="notes-entry-list"></div><article id="notes-legacy-saved" class="note-entry note-entry-saved notes-legacy-saved" hidden><div class="note-entry-head"><time class="note-entry-time" hidden></time><span class="note-entry-status"></span></div><div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><button class="btn text note-entry-edit" type="button" data-notes-action="edit-legacy">查看原有记录</button><button class="btn text" type="button" data-notes-action="export-legacy" hidden>导出保留的原有草稿</button></article></div><div id="notes-drafts" class="notes-drafts" hidden></div><p id="notes-entry-message" class="notes-message" role="alert" hidden></p><section id="notes-composer" class="notes-composer" aria-label="当前编辑的碎碎念" hidden><div class="notes-composer-heading"><button class="btn text" type="button" data-notes-action="collapse">取消</button></div><div id="notes-active-entry"></div>' + legacyEditorMarkup() + '</section><p id="notes-entry-empty" class="notes-empty" hidden>这一天还没有记录。</p><div id="notes-unpublished" class="notes-entry-list"></div></div></section>';
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
function paintTime(time3, value) {
  const actual = noteEntryTime(value);
  time3.textContent = actual;
  time3.hidden = !actual;
  if (actual) {
    time3.dateTime = value;
    time3.title = "修改时间（北京时间）：" + new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  } else {
    time3.removeAttribute("datetime");
    time3.removeAttribute("title");
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
function paintDailyNotes(root3, item, { compatibility = false, editing = false } = {}) {
  if (!root3) return;
  const find = (selector) => root3.querySelector(selector), editor = find("#notes-editor"), reader = find("#notes-reader");
  const retained = retainedLegacy(item);
  editor.dataset.date = item.date;
  editor.dataset.category = root3.dataset.category || dailyNotesRouteCategory();
  editor.hidden = !editing || !item.loaded || item.deleted && !retained;
  editor.readOnly = true;
  editor.disabled = false;
  paintEditorValue(editor, item.draft);
  reader.hidden = !item.loaded || editing && (!item.deleted || retained);
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
  return '<p class="note-entry-message" role="alert" hidden></p><div class="note-entry-actions"><button class="btn note-entry-send" type="button" data-note-entry-action="save" aria-label="发送"></button><span class="note-entry-send-feedback" role="status" aria-live="polite"></span><button class="btn text" type="button" data-note-entry-action="restore" hidden>恢复</button><button class="btn text" type="button" data-note-entry-action="delete">删除</button></div><div class="note-entry-confirm notes-confirm" hidden><p>删除这条记录？</p><button class="btn" type="button" data-note-entry-action="cancel-delete">取消</button><button class="btn" type="button" data-note-entry-action="confirm-delete">确认删除</button></div><div class="note-entry-resolution notes-resolution" hidden><button class="btn" type="button" data-note-entry-action="check">核对保存结果</button><button class="btn" type="button" data-note-entry-action="retry" hidden>重试原保存</button><div class="note-entry-conflict" hidden><p>服务器上的文字：</p><pre></pre><button class="btn" type="button" data-note-entry-action="use-server">采用服务器内容</button><button class="btn" type="button" data-note-entry-action="use-draft">用此草稿保存</button></div></div>';
}
var IDEA_LABEL = "想法池";
function createEntryElement(item, editing) {
  const node3 = document.createElement("article");
  node3.className = "note-entry " + (editing ? "note-entry-editing" : "note-entry-saved");
  node3.dataset.noteEntry = item.id;
  node3.dataset.category = item.category;
  node3.innerHTML = '<div class="note-entry-head"><span class="note-entry-label"></span><time class="note-entry-time"></time><span class="note-entry-status" role="status" aria-live="polite"></span></div>' + (editing ? '<label class="sr-only" for="entry-' + e(item.id) + '">碎碎念内容</label><textarea id="entry-' + e(item.id) + '" class="note-entry-editor" data-note-entry-editor="' + e(item.id) + '" placeholder="写下一点想说的话…" rows="3"></textarea><fieldset class="note-entry-labels"><legend>标签（可多选）</legend><div class="note-entry-label-options"></div></fieldset><div class="note-entry-reader" hidden></div>' + entryControlsMarkup() : '<div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><span class="note-entry-send-feedback" role="status" aria-live="polite"></span><button class="btn text note-entry-idea" type="button" data-note-idea="open" data-nav="ideas" hidden>💡 在想法池 →</button><button class="btn text note-entry-more" type="button" data-note-more aria-label="更多：放进想法池、转成待办" aria-haspopup="menu" hidden>⋯</button><button class="btn text note-entry-edit" type="button" data-note-entry-action="edit">编辑</button>');
  return node3;
}
function paintEntrySummary(node3, item) {
  node3.dataset.category = item.category;
  node3.querySelector(".note-entry-label").textContent = !item.labelKnown || !item.labelComplete ? "标签待联网核实" : (item.labels || []).join("、");
  paintTime(node3.querySelector("time"), item.updatedAt);
  const status = node3.querySelector(".note-entry-status");
  status.textContent = statuses[item.phase] || (item.deleted ? "已删除" : item.version ? "已保存" : "未发送");
  status.dataset.phase = item.phase;
  const message = node3.querySelector(".note-entry-message");
  message.textContent = item.error;
  message.hidden = !item.error;
}
function paintSavedEntry(node3, item) {
  paintEntrySummary(node3, item);
  node3.querySelector(".note-entry-send-feedback").textContent = item.manualSubmitted && !item.dirty && item.phase === "saved" ? "发送成功" : "";
  const draft = noteDraftNeedsAttention(item), body4 = node3.querySelector(".note-entry-reader");
  body4.textContent = item.deleted ? "这条记录已删除。" : displayedText(item);
  body4.classList.toggle("note-entry-draft-label", draft);
  node3.dataset.draft = String(draft);
  const edit = node3.querySelector('[data-note-entry-action="edit"]');
  edit.hidden = !item.canEdit && !draft;
  edit.textContent = draft ? "继续编辑草稿" : item.deleted ? "查看" : "编辑";
  const idea = node3.querySelector("[data-note-idea]"), more = node3.querySelector("[data-note-more]");
  const inPool = (item.labels || []).includes(IDEA_LABEL);
  const ready = item.canEdit && !item.deleted && !draft && item.labelKnown && item.labelComplete && item.version > 0;
  idea.hidden = !inPool || item.deleted;
  more.hidden = !ready;
  more.disabled = Boolean(item.pending) || item.dirty;
  more.dataset.inPool = inPool ? "1" : "";
  paintNoteSuggestion(node3, item);
}
function paintEntryEditor(node3, item, confirmId, labels4, labelsVerified) {
  paintEntrySummary(node3, item);
  const find = (selector) => node3.querySelector(selector), editor = find("textarea");
  editor.dataset.date = item.date;
  editor.dataset.category = item.category;
  editor.hidden = item.deleted;
  editor.readOnly = !item.canEdit;
  editor.disabled = ["delete", "restore"].includes(item.pending?.kind);
  paintEditorValue(editor, item.draft);
  const fieldset = find(".note-entry-labels"), options3 = find(".note-entry-label-options");
  fieldset.hidden = item.deleted;
  fieldset.disabled = !item.canEdit || !item.labelComplete || !labelsVerified || Boolean(item.pending);
  fieldset.title = item.labelComplete && labelsVerified ? "" : "请联网核实标签状态后再修改。";
  const available = [.../* @__PURE__ */ new Set([...labels4, ...item.labels || []])];
  if (JSON.stringify([...options3.querySelectorAll("input")].map((input) => input.value)) !== JSON.stringify(available)) {
    options3.replaceChildren(...available.map((value) => {
      const label = document.createElement("label"), input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.dataset.noteLabel = item.id;
      label.append(input, document.createTextNode(value));
      return label;
    }));
  }
  for (const input of options3.querySelectorAll("input")) input.checked = (item.labels || []).includes(input.value);
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
function paintActiveEditor(root3, store, active5, legacy2, confirmId, labels4, labelsVerified) {
  const host = root3.querySelector("#notes-active-entry");
  if (!editorNodes.has(root3)) editorNodes.set(root3, /* @__PURE__ */ new Map());
  const nodes = editorNodes.get(root3), item = store.entry(active5);
  host.hidden = !item;
  if (item) {
    if (!nodes.has(active5)) nodes.set(active5, createEntryElement(item, true));
    const node3 = nodes.get(active5);
    if (host.firstElementChild !== node3) host.replaceChildren(node3);
    paintEntryEditor(node3, item, confirmId, labels4, labelsVerified);
  }
  root3.querySelector("#notes-legacy-card").hidden = active5 !== "legacy";
  paintDailyNotes(root3, legacy2, { compatibility: true, editing: active5 === "legacy" });
}
function paintLegacySummary(root3, legacy2, active5) {
  const node3 = root3.querySelector("#notes-legacy-saved"), draft = retainedLegacy(legacy2);
  let label = node3.querySelector(".note-entry-label");
  if (!label) {
    label = document.createElement("span");
    label.className = "note-entry-label";
    node3.querySelector(".note-entry-head").prepend(label);
  }
  label.textContent = root3.dataset.category === "work" ? "工作" : "生活";
  node3.hidden = active5 === "legacy" || !(legacy2.version > 0 || draft);
  paintTime(node3.querySelector("time"), legacy2.updatedAt);
  node3.querySelector(".note-entry-reader").textContent = draft ? legacy2.draft : legacy2.deleted ? "原有记录已删除。" : legacy2.serverText;
  node3.querySelector(".note-entry-status").textContent = draft ? statuses[legacy2.phase] || "保留的原有草稿" : "原有记录 · 只读";
  node3.querySelector(".note-entry-status").dataset.phase = legacy2.phase;
  node3.querySelector(".note-entry-message").textContent = legacy2.error;
  node3.querySelector(".note-entry-message").hidden = !legacy2.error;
  const edit = node3.querySelector('[data-notes-action="edit-legacy"]');
  edit.hidden = false;
  edit.textContent = draft ? "查看保留的原有草稿" : "查看原有记录";
  node3.querySelector('[data-notes-action="export-legacy"]').hidden = !draft;
}
function paintRetainedDrafts(root3, current3, drafts) {
  const box = root3.querySelector("#notes-drafts");
  const retained = [...new Set(drafts.filter((value) => value.date !== current3.date || value.category !== current3.category).map((value) => value.category + ":" + value.date))];
  box.hidden = !retained.length;
  box.innerHTML = "<span>保留的草稿：</span>" + retained.map((key) => {
    const [category, date2] = key.split(":");
    return '<button class="btn text" type="button" data-notes-draft-category="' + e(category) + '" data-notes-date="' + e(date2) + '">' + (category === "work" ? "工作 " : "生活 ") + e(date2) + "</button>";
  }).join("");
}
function paintOtherLegacy(root3, list3, legacy2, category) {
  let node3 = root3.querySelector("#notes-legacy-other");
  if (!node3) {
    node3 = document.createElement("article");
    node3.id = "notes-legacy-other";
    node3.className = "note-entry note-entry-saved notes-legacy-saved";
    node3.innerHTML = '<div class="note-entry-head"><span class="note-entry-label"></span><time class="note-entry-time" hidden></time><span class="note-entry-status"></span></div><div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><button class="btn text note-entry-edit" type="button" data-notes-action="edit-other-legacy">查看原有记录</button><button class="btn text" type="button" data-notes-action="export-other-legacy" hidden>导出保留的原有草稿</button>';
  }
  list3.append(node3);
  const draft = legacy2 && retainedLegacy(legacy2);
  node3.hidden = !legacy2 || !(legacy2.version > 0 || draft);
  if (!legacy2) return;
  node3.querySelector(".note-entry-label").textContent = category === "work" ? "工作" : "生活";
  paintTime(node3.querySelector("time"), legacy2.updatedAt);
  node3.querySelector(".note-entry-reader").textContent = draft ? legacy2.draft : legacy2.deleted ? "原有记录已删除。" : legacy2.serverText;
  node3.querySelector(".note-entry-status").textContent = draft ? statuses[legacy2.phase] || "保留的原有草稿" : "原有记录 · 只读";
  const message = node3.querySelector(".note-entry-message");
  message.textContent = legacy2.error;
  message.hidden = !legacy2.error;
  const edit = node3.querySelector('[data-notes-action="edit-other-legacy"]');
  edit.dataset.legacyCategory = category;
  edit.textContent = draft ? "查看保留的原有草稿" : "查看原有记录";
  const exportButton = node3.querySelector('[data-notes-action="export-other-legacy"]');
  exportButton.dataset.legacyCategory = category;
  exportButton.hidden = !draft;
}
function paintNoteEntries(root3, store, current3, legacy2, {
  drafts = [],
  confirmId = "",
  active: active5 = "",
  otherLegacy = null,
  otherCategory = "",
  labels: labels4 = [],
  labelsVerified = true
} = {}) {
  const find = (selector) => root3.querySelector(selector), list3 = find("#notes-entry-list");
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
  const nodes = new Map([...list3.children, ...unpublished2.children].filter((node3) => node3.dataset.noteEntry).map((node3) => [node3.dataset.noteEntry, node3])), wanted = new Set(saved.map((item) => item.id));
  for (const [id2, node3] of nodes) if (!wanted.has(id2)) node3.remove();
  for (const item of saved) {
    const node3 = nodes.get(item.id) || createEntryElement(item, false);
    (noteDraftNeedsAttention(item) ? unpublished2 : list3).append(node3);
    paintSavedEntry(node3, item);
    node3.dataset.sortTime = item.createdAt || item.localCreatedAt || "";
  }
  paintActiveEditor(root3, store, active5, legacy2, confirmId, labels4, labelsVerified);
  paintLegacySummary(root3, legacy2, active5);
  (retainedLegacy(legacy2) ? unpublished2 : list3).append(root3.querySelector("#notes-legacy-saved"));
  root3.querySelector("#notes-legacy-saved").dataset.sortTime = legacy2.updatedAt || "";
  paintOtherLegacy(root3, list3, otherLegacy, otherCategory);
  root3.querySelector("#notes-legacy-other").dataset.sortTime = otherLegacy?.updatedAt || "";
  if (otherLegacy && retainedLegacy(otherLegacy)) unpublished2.append(root3.querySelector("#notes-legacy-other"));
  const composer = find("#notes-composer"), activeItem = active5 === "legacy" ? legacy2 : store.entry(active5);
  composer.hidden = !activeItem;
  composer.dataset.active = active5;
  find(".notes-published").hidden = Boolean(activeItem);
  unpublished2.hidden = Boolean(activeItem);
  find('[data-notes-action="new"]').hidden = !canEdit || current3.date !== dailyNotesToday() || Boolean(activeItem);
  find('[data-notes-action="collapse"]').disabled = Boolean(activeItem?.pending || activeItem?.composing);
  const ordered2 = [...list3.children].sort((a, b) => String(a.dataset.sortTime || "").localeCompare(String(b.dataset.sortTime || "")));
  list3.append(...ordered2);
  find("#notes-entry-empty").hidden = !(current3.allLoaded ?? current3.loaded) || Boolean(activeItem) || saved.length > 0 || legacy2.version > 0 || noteDraftNeedsAttention(legacy2) || Boolean(otherLegacy && (otherLegacy.version > 0 || noteDraftNeedsAttention(otherLegacy)));
  const unresolved2 = items.some(noteDraftNeedsAttention) || noteDraftNeedsAttention(legacy2);
  const status = find("#notes-status");
  status.textContent = !current3.loaded && current3.loading ? "" : current3.error ? "读取失败" : unresolved2 ? "有未发送内容" : canEdit ? "" : current3.loaded ? "公开只读" : "";
  status.hidden = canEdit && !current3.error && !unresolved2;
  paintRetainedDrafts(root3, current3, drafts);
}

// web/diary-title-controller.mjs
init_api();
var checked3 = (value, date2) => {
  if (value?.date !== date2 || typeof value.title !== "string" || !Number.isSafeInteger(value.version) || value.version < 0)
    throw new Error("小标题读取结果不完整。");
  return value;
};
async function saveDiaryTitle(session) {
  const day9 = session.date(), p = session.page(day9), who = session.owner(), title = p.draft.trim();
  if (!session.visible() || session.isGuest() || p.denied || !p.loaded || p.loading || p.saving || title === p.base) return;
  p.saving = true;
  p.status = "保存中…";
  session.paint();
  try {
    if (p.attempt && p.attempt.title !== title) {
      const last = p.attempt, live3 = checked3(await session.get(day9), day9);
      if (!session.active(who, day9, p)) return;
      p.attempt = null;
      session.adopt(p, live3);
      if (live3.version !== last.version && live3.title !== last.title) {
        p.status = "另一处已更新，输入保留，请核对后再保存";
        return;
      }
    }
    p.attempt ??= { title, version: p.version, save_id: session.uuid() };
    const data3 = checked3(await session.request("/diary-titles/" + day9, { method: "PUT", body: p.attempt, suppressAuthRedirect: true }), day9);
    if (session.active(who, day9, p)) {
      p.base = data3.title;
      p.draft = data3.title;
      p.version = data3.version;
      p.attempt = null;
      p.status = "已保存";
    }
  } catch (error2) {
    if (!session.active(who, day9, p)) return;
    if (error2.status === 409) {
      try {
        const data3 = checked3(await session.get(day9), day9);
        if (!session.active(who, day9, p)) return;
        session.adopt(p, data3);
        p.attempt = null;
        p.status = "另一处已更新，输入保留，请核对后再保存";
      } catch {
        p.status = "暂时无法核对，输入已保留";
      }
    } else {
      if (error2.status >= 400 && error2.status < 500) p.attempt = null;
      p.status = error2.status >= 400 && error2.status < 500 ? error2.message || "没有保存，输入已保留" : "保存结果待核对，输入已保留";
    }
  } finally {
    if (session.active(who, day9, p)) {
      p.saving = false;
      session.paint();
    }
  }
}
function createDiaryTitleController({ identity: identity5, date: date2, visible: visible3, isGuest, root: root3, onLogin, uuid: uuid5 = () => crypto.randomUUID(), request: request2 = apiNetwork }) {
  let owner2, pages = /* @__PURE__ */ new Map();
  function page(day9) {
    const current3 = identity5();
    if (current3 !== owner2) {
      owner2 = current3;
      pages = /* @__PURE__ */ new Map();
    }
    if (!pages.has(day9)) pages.set(day9, { base: "", draft: "", version: 0, loaded: false, loading: false, saving: false, attempt: null, status: "", denied: false });
    return pages.get(day9);
  }
  function paint4() {
    if (!visible3()) return;
    const node3 = root3();
    if (!node3) return;
    const value = page(date2()), guest = isGuest(), locked = guest || value.denied;
    const editor = node3.querySelector(".diary-title-fields"), login = node3.querySelector("[data-diary-title-login]");
    node3.hidden = guest;
    editor.hidden = locked;
    login.hidden = true;
    const field2 = node3.querySelector("input"), button2 = node3.querySelector("[type=submit]");
    if (field2.value !== value.draft) field2.value = value.draft;
    field2.disabled = !value.loaded || value.saving || locked;
    button2.disabled = field2.disabled || value.draft.trim() === value.base;
    const status = node3.querySelector("[role=status]");
    const message = guest ? "" : value.denied ? "仅网站所有者可填写" : value.status || (!value.loaded && value.loading ? "正在读取…" : "");
    if (status.textContent !== message) status.textContent = message;
  }
  const get = (day9) => request2("/diary-titles/" + day9, { suppressAuthRedirect: true });
  const active5 = (who, day9, p) => identity5() === who && owner2 === who && pages.get(day9) === p;
  function adopt(p, value) {
    const changed2 = p.draft !== p.base;
    p.base = value.title;
    p.version = value.version;
    p.loaded = true;
    if (!changed2) p.draft = p.base;
  }
  async function load2(day9) {
    const p = page(day9), who = owner2;
    if (isGuest() || p.loading || p.saving) {
      paint4();
      return;
    }
    p.loading = true;
    paint4();
    try {
      const data3 = checked3(await get(day9), day9);
      if (active5(who, day9, p)) {
        if (p.attempt && data3.title === p.attempt.title && data3.version >= p.attempt.version) {
          p.attempt = null;
          p.status = "已保存";
        } else if (p.attempt && data3.version !== p.attempt.version) {
          p.attempt = null;
          p.status = "另一处已更新，输入保留，请核对后再保存";
        }
        adopt(p, data3);
        p.denied = false;
      }
    } catch (error2) {
      if (active5(who, day9, p)) {
        p.denied = [401, 403].includes(error2.status);
        p.status = p.denied ? "" : "小标题未读到，可切换日期后重试";
      }
    } finally {
      if (active5(who, day9, p)) {
        p.loading = false;
        paint4();
      }
    }
  }
  function edit(value) {
    const p = page(date2());
    if (!p.loaded || p.saving || isGuest()) return;
    p.draft = value;
    if (p.status === "已保存") p.status = "";
    paint4();
  }
  const session = { date: date2, page, owner: () => owner2, visible: visible3, isGuest, paint: paint4, active: active5, get, adopt, request: request2, uuid: uuid5 };
  async function save() {
    await saveDiaryTitle(session);
  }
  return { paint: paint4, load: load2, edit, save, login: onLogin };
}

// web/pages/ideas.mjs
init_api();
init_dom();
init_format();
init_entry();
init_modal();
var FILTERS = [["all", "全部"], ["idea", "想法"], ["todo", "已转待办"], ["landed", "已落地"]];
var view = { items: [], total: 0, truncated: false, filter: "all", open: /* @__PURE__ */ new Set(), loaded: false, readOnly: false, error: "" };
var day4 = (value) => value ? `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日` : "";
var stamp2 = (line) => /^\s*✅/.test(line);
function titleIndex(lines) {
  const index = lines.findIndex((line) => line.trim() && !stamp2(line));
  return index >= 0 ? index : lines.findIndex((line) => line.trim());
}
function ideaTitle(text) {
  const lines = String(text || "").split("\n"), index = titleIndex(lines);
  return index >= 0 ? lines[index].trim() : "（空）";
}
function ideaBody(text) {
  const lines = String(text || "").split("\n"), index = titleIndex(lines);
  return lines.slice(index + 1).filter((line) => !/^\s*(状态|优先级)[：:]/.test(line)).join("\n").trim();
}
function todoTextFor(text) {
  return ideaTitle(text).replace(/^想法\s*[^：:]{0,4}[：:]\s*/, "").slice(0, 500) || ideaTitle(text).slice(0, 500);
}
function todoLine(todo) {
  const when = todo.kind === "future" ? "未来待办" : smartDayLabel(todo.date, bjtDate());
  return `<li class="idea-todo${todo.completed ? " done" : ""}${todo.deleted ? " gone" : ""}"><span class="idea-todo-mark" aria-hidden="true">${todo.deleted ? "×" : todo.completed ? "✓" : "○"}</span><span class="idea-todo-text">${e(todo.text)}</span><em>${todo.deleted ? "已删除" : e(when)}</em></li>`;
}
function card(item, readOnly) {
  const body4 = ideaBody(item.text), open = view.open.has(item.id), long = body4.length > 120 || body4.split("\n").length > 3;
  const stars = item.priority ? `<span class="idea-stars" aria-label="优先级 ${item.priority} 星">${"⭐".repeat(Math.min(item.priority, 5))}</span>` : "";
  const landed = item.status === "landed" ? `<span class="idea-landed-at">${e(day4(bjtDate(item.landed_at || Date.now())))}落地</span>` : "";
  return `<article class="idea-card" data-status="${e(item.status)}" data-idea="${e(item.id)}">
<header class="idea-card-head"><span class="idea-status idea-status-${e(item.status)}">${e(item.label)}</span>${stars}
<time datetime="${e(item.created_at)}">${e(day4(item.date))}</time>${landed}</header>
<h3 class="idea-title">${item.status === "landed" ? '<span class="idea-done-mark" aria-label="已落地">✅</span> ' : ""}${e(ideaTitle(item.text))}</h3>
${body4 ? `<p class="idea-body${long && !open ? " clamped" : ""}">${e(body4)}</p>${long ? `<button class="btn text small" type="button" data-action="idea-expand" data-id="${e(item.id)}">${open ? "收起" : "展开"}</button>` : ""}` : ""}
${item.todos.length ? `<ul class="idea-todos" aria-label="关联的待办">${item.todos.map(todoLine).join("")}</ul>` : ""}
${readOnly ? "" : `<footer class="idea-card-foot"><a class="btn text small" href="/?page=notes&date=${e(item.date)}${item.category === "work" ? "&notes_category=work" : ""}" data-nav="notes" data-notes-date="${e(item.date)}" data-notes-category="${item.category === "work" ? "work" : "life"}">在碎碎念里看</a>
${item.status === "landed" ? "" : `<button class="btn small primary" type="button" data-action="idea-todo" data-id="${e(item.id)}">转成待办</button>`}</footer>`}
</article>`;
}
function renderIdeas(state2 = view) {
  if (!state2.loaded && !state2.error) return '<section class="ideas-page" aria-busy="true"><p class="muted">正在读取想法池…</p></section>';
  if (state2.error) return `<section class="ideas-page"><p class="form-message" role="alert">${e(state2.error)}</p>
<button class="btn" type="button" data-action="ideas-reload">重新读取</button></section>`;
  const counts = Object.fromEntries(FILTERS.map(([id2]) => [id2, id2 === "all" ? state2.items.length : state2.items.filter((item) => item.status === id2).length]));
  const shown2 = state2.items.filter((item) => state2.filter === "all" || item.status === state2.filter).map((item, index) => [item, index]).sort(([a, i], [b, j]) => (a.status === "landed") - (b.status === "landed") || i - j).map(([item]) => item);
  const tabs = FILTERS.map(([id2, label]) => `<button type="button" role="tab" aria-selected="${state2.filter === id2}" data-action="ideas-filter" data-filter="${id2}">${label}<span>${counts[id2]}</span></button>`).join("");
  const empty3 = state2.items.length ? `<p class="ideas-empty">这一栏还没有想法。</p>` : `<div class="ideas-empty"><p>想法池还是空的。</p><p class="muted">在碎碎念里点一条下面的「放进想法池」，它就会出现在这里。</p></div>`;
  return `<section class="ideas-page">
<p class="ideas-intro">${state2.readOnly ? "这里只展示已放进想法池的条目。编辑请使用管理员入口。" : "碎碎念里贴了「想法池」标签的都在这里。想好了就「转成待办」，待办都做完，想法就算落地了。"}</p>
<div class="ideas-filters" role="tablist" aria-label="按状态看">${tabs}</div>
${state2.truncated ? `<p class="muted">只显示最新的 ${state2.items.length} 条（共 ${state2.total} 条）。</p>` : ""}
<div class="ideas-list">${shown2.length ? shown2.map((item) => card(item, state2.readOnly)).join("") : empty3}</div>
</section>`;
}
function paint() {
  replacePageContent(renderIdeas());
}
async function loadIdeas(context) {
  view.error = "";
  try {
    const data3 = await api("/ideas", { context });
    Object.assign(view, {
      items: data3.items || [],
      total: data3.total || 0,
      truncated: Boolean(data3.truncated),
      readOnly: data3.readOnly === true,
      loaded: true
    });
  } catch (error2) {
    if (error2?.name === "AbortError") throw error2;
    view.error = error2?.message || "想法池没读出来，请稍后再试。";
  }
  return renderIdeas();
}
function setIdeasFilter(filter) {
  if (FILTERS.some(([id2]) => id2 === filter)) {
    view.filter = filter;
    paint();
  }
}
function toggleIdea(id2) {
  if (view.open.has(id2)) view.open.delete(id2);
  else view.open.add(id2);
  paint();
}
async function reloadIdeas() {
  view.loaded = false;
  paint();
  await loadIdeas();
  paint();
}
function openIdeaTodo(id2) {
  const item = view.items.find((row) => row.id === id2);
  if (!item) return;
  const today2 = bjtDate(), tomorrow = bjtDate(Date.now() + 864e5);
  openModal("转成待办", `<form id="idea-todo-form" data-id="${e(id2)}">
<p class="muted idea-todo-source">来自想法：${e(ideaTitle(item.text))}</p>
<label for="idea-todo-text">待办内容</label>
<input class="input" id="idea-todo-text" name="text" maxlength="500" required value="${e(todoTextFor(item.text))}" autocomplete="off">
<p class="muted idea-todo-ai" role="status">AI 正在帮你精简成一句话…</p>
<fieldset class="idea-todo-when"><legend>什么时候做</legend>
<label><input type="radio" name="when" value="future" checked> 未来待办（先不定日子）</label>
<label><input type="radio" name="when" value="${today2}"> 今天</label>
<label><input type="radio" name="when" value="${tomorrow}"> 明天</label>
<label><input type="radio" name="when" value="pick"> 选日子 <input class="input" type="date" name="date" min="${today2}" aria-label="选日子"></label>
</fieldset>
<p class="muted">待办做完后，这条想法会自动显示「已落地」。原来的碎碎念不会被改动。</p>
<p class="form-message" role="alert"></p>
<div class="form-actions"><button class="btn primary" type="submit">转成待办</button></div></form>`);
  void condense(id2, item.text);
}
async function condense(id2, text) {
  const form = () => document.querySelector(`#idea-todo-form[data-id="${CSS.escape(id2)}"]`);
  const start = form()?.querySelector("#idea-todo-text")?.value;
  let note = "";
  try {
    const data3 = await api("/ideas/todo-text", { method: "POST", body: { text } });
    if (data3?.needs_model && data3.todo) {
      const input = form()?.querySelector("#idea-todo-text");
      if (input && input.value === start) {
        input.value = data3.todo;
        note = "AI 精简过了，可以直接改。";
      } else note = "";
    }
  } catch {
    note = "";
  }
  const status = form()?.querySelector(".idea-todo-ai");
  if (status) {
    status.textContent = note;
    status.hidden = !note;
  }
}
function openNoteTodo(text) {
  const today2 = bjtDate(), tomorrow = bjtDate(Date.now() + 864e5);
  openModal("转成待办", `<form id="idea-todo-form" data-id="" data-mode="note">
<p class="muted idea-todo-source">来自碎碎念：${e(ideaTitle(text).slice(0, 60))}</p>
<label for="idea-todo-text">待办内容</label>
<input class="input" id="idea-todo-text" name="text" maxlength="500" required value="${e(todoTextFor(text))}" autocomplete="off">
<p class="muted idea-todo-ai" role="status">AI 正在帮你精简成一句话…</p>
<fieldset class="idea-todo-when"><legend>什么时候做</legend>
<label><input type="radio" name="when" value="${today2}" checked> 今天</label>
<label><input type="radio" name="when" value="${tomorrow}"> 明天</label>
<label><input type="radio" name="when" value="future"> 未来待办（先不定日子）</label>
<label><input type="radio" name="when" value="pick"> 选日子 <input class="input" type="date" name="date" min="${today2}" aria-label="选日子"></label>
</fieldset>
<p class="form-message" role="alert"></p>
<div class="form-actions"><button class="btn primary" type="submit">转成待办</button></div></form>`);
  void condense("", text);
}
async function submitIdeaTodo({ form, data: data3 }) {
  const id2 = form.dataset.id, message = form.querySelector(".form-message"), button2 = form.querySelector("button[type=submit]");
  const text = String(data3.text ?? "").replace(/\r?\n/g, " ").trim();
  const date2 = data3.when === "pick" ? data3.date : data3.when;
  if (!text || text.length > 500) {
    message.textContent = "待办内容需要 1 至 500 个字";
    return;
  }
  if (date2 !== "future" && !/^\d{4}-\d{2}-\d{2}$/.test(date2 || "")) {
    message.textContent = "请选一个日子";
    return;
  }
  if (button2.disabled) return;
  button2.disabled = true;
  message.textContent = "";
  let todo = null;
  try {
    todo = date2 === "future" ? await api("/unscheduled-todos", { method: "POST", body: { id: crypto.randomUUID(), text } }) : await api("/todos", { method: "POST", body: { id: crypto.randomUUID(), date: date2, text } });
    if (form.dataset.mode === "note") {
      closeModal();
      toast(date2 === "future" ? "已转成未来待办" : `已加到${smartDayLabel(date2, bjtDate())}的待办`);
      return;
    }
    await settleQueuedTodo(date2 === "future" ? "unscheduled_todo" : "todo", todo.id);
    let linked2 = null;
    for (let attempt = 0; !linked2; attempt++) {
      try {
        linked2 = await api(`/ideas/${encodeURIComponent(id2)}/todos`, { method: "POST", body: { todo_id: todo.id } });
      } catch (error2) {
        if (error2?.status !== 404 || attempt >= 5) throw error2;
        await new Promise((done3) => setTimeout(done3, 800));
      }
    }
    const index = view.items.findIndex((row) => row.id === id2);
    if (index >= 0) view.items[index] = linked2;
    closeModal();
    paint();
    toast(date2 === "future" ? "已转成未来待办" : `已加到${smartDayLabel(date2, bjtDate())}的待办`);
  } catch (error2) {
    message.textContent = todo ? "待办已经建好了，但没能和这条想法连上。请稍后在想法池里刷新看看。" : error2?.message || "没转成，请稍后再试。";
  } finally {
    button2.disabled = false;
  }
}

// web/body-summary-controller.mjs
init_api();
var BODY_SUMMARY_LABEL = "大小便记录";
var STATS = [["bowel", "排便"], ["normal", "正常"], ["loose", "偏稀"], ["hard", "偏硬"], ["accidents", "漏出"], ["discomfort", "不舒服"]];
var REFRESH_MS = 5 * 6e4;
var view2 = { data: null, loadedAt: 0, loading: null, busy: "", error: "", contextOpen: false };
var el2 = (tag2, className, text) => {
  const node3 = document.createElement(tag2);
  if (className) node3.className = className;
  if (text !== void 0) node3.textContent = text;
  return node3;
};
var short = (date2) => `${Number(date2.slice(5, 7))}/${Number(date2.slice(8))}`;
var time2 = (stamp4) => {
  const value = Date.parse(stamp4);
  return Number.isFinite(value) ? new Date(value + 8 * 36e5).toISOString().slice(5, 16).replace("T", " ").replace("-", "/") : "";
};
function paintBodySummary(root3, label) {
  const section = root3.querySelector("#body-summary");
  if (!section) return;
  const wasHidden = section.hidden;
  section.hidden = label !== BODY_SUMMARY_LABEL;
  if (section.hidden) return;
  if (!view2.loading && (!view2.data || Date.now() - view2.loadedAt > REFRESH_MS)) return void load(section);
  if (wasHidden || !section.childElementCount) draw(section);
}
async function load(section) {
  view2.error = "";
  view2.loading = (async () => {
    try {
      view2.data = await api("/body-summary");
      view2.loadedAt = Date.now();
      if (view2.data.configured && !view2.data.last) await generate(section, "last", false);
    } catch (error2) {
      view2.error = error2.message || "小结读取失败";
    } finally {
      view2.loading = null;
      draw(section);
    }
  })();
  draw(section);
}
async function generate(section, week, redo) {
  view2.busy = week;
  view2.error = "";
  draw(section);
  try {
    const saved = await api("/body-summary", { method: "POST", body: { week, redo } });
    view2.data = { ...view2.data, [week]: saved };
  } catch (error2) {
    view2.error = error2.message || "生成失败，请稍后再试";
  } finally {
    view2.busy = "";
    draw(section);
  }
}
async function saveContext(section, text) {
  view2.busy = "context";
  view2.error = "";
  draw(section);
  try {
    const saved = await api("/body-summary/context", { method: "PUT", body: { text } });
    view2.data = { ...view2.data, context: saved.text };
    view2.contextOpen = false;
  } catch (error2) {
    view2.error = error2.message || "保存失败";
  } finally {
    view2.busy = "";
    draw(section);
  }
}
function shown(data3) {
  const current3 = data3?.current, last = data3?.last;
  return current3 && !current3.empty ? current3 : last;
}
function stats(summary3) {
  const row = el2("div", "body-summary-stats"), compare3 = [];
  const weeks = summary3.previous_weeks >= 2 ? summary3.previous_weeks : 0;
  for (const [key, name] of STATS) {
    const value = summary3.stats?.[key];
    if (value === null || value === void 0) continue;
    const chip = el2("span", "body-summary-stat");
    chip.append(el2("span", "", name), el2("b", "", `${value} 次`));
    row.append(chip);
    const before = weeks ? summary3.previous?.[key] : null;
    if (before !== null && before !== void 0) compare3.push(`${name} ${Math.round(before)}`);
  }
  return compare3.length ? [row, el2("p", "body-summary-compare", `前 ${weeks} 周平均每周：${compare3.join(" · ")}`)] : [row];
}
function body2(summary3) {
  const nodes = [];
  if (summary3.alerts?.length) {
    const box = el2("div", "body-summary-alert");
    box.setAttribute("role", "alert");
    box.append(el2("strong", "", "建议联系医生"), ...summary3.alerts.map((text) => el2("p", "", text)));
    nodes.push(box);
  }
  nodes.push(el2("p", "body-summary-headline", summary3.headline), ...stats(summary3));
  for (const part of summary3.sections || []) {
    const block = el2("div", "body-summary-section"), list3 = el2("ul");
    list3.append(...part.points.map((point) => el2("li", "", point)));
    block.append(el2("h4", "", part.title), list3);
    nodes.push(block);
  }
  return nodes;
}
function contextEditor(section) {
  const details = el2("details", "body-summary-context");
  details.open = view2.contextOpen;
  details.addEventListener("toggle", () => {
    view2.contextOpen = details.open;
  });
  const area = el2("textarea", "input");
  area.maxLength = 600;
  area.rows = 3;
  area.value = view2.data?.context || "";
  area.placeholder = "写给 AI 的背景：长期情况、你的习惯说法等。只用于生成小结。";
  const save = el2("button", "btn text", view2.busy === "context" ? "保存中…" : "保存说明");
  save.type = "button";
  save.disabled = Boolean(view2.busy);
  save.addEventListener("click", () => saveContext(section, area.value));
  details.append(el2("summary", "", "背景说明"), area, save);
  return details;
}
function draw(section) {
  const data3 = view2.data, summary3 = shown(data3);
  const head = el2("div", "body-summary-head"), title = el2("h3", "", "大小便周小结");
  const meta = el2("span", "body-summary-meta", summary3 ? `${short(summary3.week_start)}–${short(summary3.week_end)}${summary3.complete ? "" : " · 本周未完"}` : "");
  head.append(title, meta);
  const parts2 = [head];
  if (data3?.configured) parts2.push(el2("p", "body-summary-how", "AI 每周自动整理一次，打开就有，不用点；点「更新到今天」会重新生成本周的。"));
  if (view2.loading && !data3) parts2.push(el2("p", "body-summary-note", "正在读取…"));
  else if (data3 && !data3.configured) parts2.push(el2("p", "body-summary-note", "服务器还没有配置 AI，暂时不能生成小结。"));
  else if (view2.busy === "last" || view2.busy === "current") parts2.push(el2("p", "body-summary-note", "正在整理记录，大约需要半分钟…"));
  else if (summary3?.empty) parts2.push(el2("p", "body-summary-note", "这一周没有相关记录。"));
  else if (summary3) parts2.push(...body2(summary3));
  if (view2.error) parts2.push(el2("p", "body-summary-error", view2.error));
  if (data3?.configured) {
    const actions2 = el2("div", "body-summary-actions");
    const refresh = el2("button", "btn text", "更新到今天");
    refresh.type = "button";
    refresh.disabled = Boolean(view2.busy || view2.loading);
    refresh.addEventListener("click", () => generate(section, "current", true));
    const stamp4 = summary3?.generated_at ? el2("span", "body-summary-meta", `生成于 ${time2(summary3.generated_at)}`) : null;
    actions2.append(...[stamp4, refresh].filter(Boolean));
    parts2.push(actions2, contextEditor(section));
  }
  parts2.push(el2("p", "body-summary-foot", "只整理你写下的记录，不是诊断。"));
  section.replaceChildren(...parts2);
}

// web/pages/label-backfill.mjs
init_api();
var current2 = null, repaint2 = () => {
};
function setLabelBackfillRepaint(callback) {
  repaint2 = callback;
}
function labelBackfillState() {
  return current2;
}
async function findOldNotes(label) {
  const reading = { label, status: "reading", items: [], picked: [], done: [], message: "", busy: false };
  current2 = reading;
  repaint2();
  try {
    const data3 = await api("/note-entries/label-backfill", { method: "POST", body: { label } });
    if (current2 !== reading) return;
    reading.items = Array.isArray(data3.items) ? data3.items : [];
    reading.picked = reading.items.map(() => true);
    reading.status = data3.off ? "off" : reading.items.length ? "ready" : "empty";
  } catch (error2) {
    if (current2 !== reading) return;
    reading.status = "error";
    reading.message = error2?.message || "没能读完旧碎碎念，请稍后再试";
  }
  repaint2();
}
var short2 = (text) => {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > 80 ? value.slice(0, 80) + "…" : value;
};
var day5 = (date2) => `${Number(date2.slice(5, 7))}/${Number(date2.slice(8))}`;
function paintLabelBackfill(root3) {
  const box = root3.querySelector("#notes-label-backfill");
  if (!box) return;
  const reading = current2;
  box.hidden = !reading;
  if (!reading) {
    box.replaceChildren();
    return;
  }
  const key = JSON.stringify([reading.label, reading.status, reading.picked, reading.done, reading.busy, reading.message]);
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const make = (tag2, className, text) => {
    const node3 = document.createElement(tag2);
    if (className) node3.className = className;
    if (text) node3.textContent = text;
    return node3;
  };
  const button2 = (className, text, action, extra = {}) => {
    const node3 = make("button", className, text);
    node3.type = "button";
    node3.dataset.labelBackfill = action;
    for (const [name, value] of Object.entries(extra)) node3.dataset[name] = value;
    return node3;
  };
  const head = make("p", "notes-backfill-head");
  const count3 = reading.picked.filter(Boolean).length, added = reading.done.filter(Boolean).length;
  const title = {
    reading: `AI 在翻以前的碎碎念，看哪些该贴「${reading.label}」…`,
    empty: `最近半年的碎碎念里，没找到明显该贴「${reading.label}」的。`,
    off: "AI 读碎碎念现在是关闭的（设置里的待办模型），没法帮忙找。",
    error: reading.message,
    ready: added ? `已给 ${added} 条贴上「${reading.label}」` : `这 ${reading.items.length} 条可能该贴「${reading.label}」，勾掉不要的再贴：`
  }[reading.status];
  head.append(make("span", "", title));
  if (reading.status === "ready" && !added) {
    const apply = button2("note-suggest-btn", count3 ? `贴上 ${count3} 条` : "先勾要哪几条", "apply");
    apply.disabled = reading.busy || !count3;
    head.append(apply);
  }
  if (reading.status !== "reading") {
    const close = button2("note-suggest-close", "×", "close");
    close.setAttribute("aria-label", "关闭");
    head.append(close);
  }
  const parts2 = [head];
  if (reading.status === "ready") {
    const list3 = make("ul", "notes-backfill-list");
    reading.items.forEach((item, index) => {
      const line = make("li");
      if (reading.done[index] === true) line.append(make("span", "note-suggest-done", "✓"));
      else {
        const on = reading.picked[index] !== false;
        const pick = button2("note-suggest-check", on ? "☑" : "☐", "pick", { labelBackfillIndex: String(index) });
        pick.disabled = reading.busy || added > 0;
        pick.setAttribute("aria-pressed", String(on));
        pick.setAttribute("aria-label", (on ? "不贴 " : "贴 ") + short2(item.text));
        line.append(pick);
      }
      const body4 = make("span", "note-suggest-text", short2(item.text));
      body4.prepend(make("small", "", `${day5(item.date)} · ${item.category === "work" ? "工作" : "生活"}`));
      line.append(body4);
      list3.append(line);
    });
    parts2.push(list3);
  }
  if (reading.status === "ready" && reading.message) parts2.push(make("p", "note-suggest-error", reading.message));
  box.replaceChildren(...parts2);
}
async function actOnLabelBackfill(target, { addLabel }) {
  const reading = current2, action = target.dataset.labelBackfill;
  if (!reading) return;
  if (action === "close") {
    current2 = null;
    repaint2();
    return;
  }
  if (reading.busy || reading.status !== "ready") return;
  if (action === "pick") {
    const index = Number(target.dataset.labelBackfillIndex);
    if (!Number.isInteger(index) || !reading.items[index] || reading.done.some(Boolean)) return;
    reading.picked = reading.picked.map((on, at) => at === index ? !on : on);
    repaint2();
    return;
  }
  if (action !== "apply") return;
  reading.busy = true;
  reading.message = "";
  repaint2();
  let failed = 0;
  for (const [index, item] of reading.items.entries()) {
    if (reading.picked[index] === false || reading.done[index]) continue;
    let ok = false;
    try {
      ok = await addLabel(item, reading.label);
    } catch {
      ok = false;
    }
    reading.done[index] = ok;
    if (!ok) failed++;
    if (current2 !== reading) return;
    repaint2();
  }
  reading.busy = false;
  if (failed) reading.message = `${failed} 条没贴上，可以去那天的碎碎念点「编辑」手动勾选。`;
  repaint2();
}

// web/daily-notes-controller.mjs
init_api();
init_state();
init_daily_notes_state();
init_popover();
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
var diaryTitle = createDiaryTitleController({
  identity: notesIdentityNow,
  date: dailyNotesRouteDate,
  visible: () => notesVisible() && !notesRefreshPaused,
  isGuest: () => !state.me || state.me.publicBusiness === true,
  root: () => document.querySelector("#diary-title-form"),
  onLogin: () => renderLogin()
});
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
    const timer = setTimeout(() => {
      sendFeedbackTimers.delete(item);
      if (expected !== notesIdentityNow() || item.manualSubmitted !== attempt) return;
      item.manualSubmitted = null;
      paintDailyNotesPage();
    }, 2500);
    sendFeedbackTimers.set(item, timer);
  }
}
function captureNotesDrafts(legacy2, entries, category) {
  const offline = getOfflineRuntime();
  if (!offline || !hydrationReady.has(entries) || entryIdentities.get(entries) !== notesIdentityNow()) return;
  const rows = [];
  for (const [kind, values] of [["legacy", legacy2.pages.values()], ["note_entry", entries.entries.values()]]) for (const item of values) {
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
async function hydrateNotesDrafts(legacy2, entries, category) {
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
    const item = legacy2.page(raw.date);
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
  await captureNotesDrafts(legacy2, entries, category);
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
  const identity5 = notesIdentityNow(), revision2 = notesDraftRevision;
  if (visibleArchiveFlight?.identity === identity5 && visibleArchiveFlight.revision === revision2) return visibleArchiveFlight.promise;
  const promise = (async () => {
    const offline = getOfflineRuntime();
    if (!offline) return [];
    const snapshots = await offline.retainedDraftRecords("note_entry");
    const controller = new AbortController(), tombstones = /* @__PURE__ */ new Map();
    const active5 = () => !controller.signal.aborted && identity5 === notesIdentityNow();
    const ids = [...new Set(snapshots.map((row) => row.data?.id).filter((id2) => /^[a-f0-9-]{36}$/i.test(id2 || "")))];
    let timer, next = 0;
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
        timer = setTimeout(() => {
          controller.abort();
          resolve();
        }, 2e3);
      })
    ]).finally(() => clearTimeout(timer));
    const rows = uniqueRetainedDrafts(snapshots.map((record) => record.data).filter((row) => !row || !matchesDeletedEntry(row, tombstones.get(row.id))));
    return identity5 === notesIdentityNow() ? rows.map((raw) => ({ raw, record: snapshots.find((record) => record.data === raw) })) : [];
  })();
  visibleArchiveFlight = { identity: identity5, revision: revision2, promise };
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
  const button2 = document.createElement("button");
  button2.type = "button";
  button2.className = className;
  button2.textContent = text;
  button2.disabled = archiveBusy;
  button2.addEventListener("click", onClick);
  return button2;
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
  const same3 = ({ data: data3 }) => data3?.category === row.category && data3?.date === row.date && data3?.draft === row.draft;
  if (expected === notesIdentityNow() && !remaining.some(same3) && item && legacyRecoveryGuard.unchanged(item) && item.draft === row.draft && !item.pending && !item.remote) {
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
  let removed4 = 0, editing = 0, failed = 0;
  try {
    const records = [...await offline.retainedDraftRecords("legacy"), ...await offline.retainedDraftRecords("note_entry")];
    for (const record of records.filter((record2) => key === "all" || archiveGroupKey(record2) === key)) {
      if (expected !== notesIdentityNow()) return;
      if (archiveRecordBusy(record)) {
        editing++;
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
      editing && `${editing} 份正在编辑或等待确认，已保留。`,
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
  const summary3 = document.createElement("summary");
  box.append(summary3);
  const tools = document.createElement("div");
  tools.className = "notes-retained-tools";
  box.append(tools);
  const status = document.createElement("p");
  status.className = "notes-retained-status";
  status.setAttribute("role", "status");
  box.append(status);
  const body4 = document.createElement("div");
  body4.className = "notes-retained-texts";
  box.append(body4);
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
  const request2 = async (path, options3) => {
    active5();
    const value = await api(path, options3);
    active5();
    return value;
  };
  const noteRequest = async (path, options3 = {}) => {
    active5();
    if (options3.method && options3.method !== "GET") {
      const date2 = options3.body?.date || dailyNotesRouteDate();
      await noteRequest("/note-entries?category=" + category + "&date=" + encodeURIComponent(date2));
    }
    const value = await apiNetwork(path, { ...options3, headers: { ...options3.headers, "X-Note-Labels-Version": "3" } });
    active5();
    if (value?.labels_version !== 3) throw Object.assign(
      new Error("服务器尚不支持多标签，草稿已保留。"),
      { code: "NOTE_LABELS_VERSION", localNotSaved: !options3.method || options3.method === "GET" }
    );
    return value;
  };
  const noteRead = async (path) => {
    const cached = await request2(path, { headers: { "X-Note-Labels-Version": "1" } });
    if (isLocalDocument(cached) || cached?.entries?.some(isLocalDocument)) return cached;
    try {
      return await noteRequest(path);
    } catch (error2) {
      if (error2.code === "NETWORK_UNAVAILABLE") return cached;
      throw error2;
    }
  };
  const noteWrite = async (path, options3) => {
    try {
      return await noteRequest(path, options3);
    } catch (error2) {
      if (error2.code !== "NETWORK_UNAVAILABLE") throw error2;
      const body4 = options3.body || {}, labels4 = body4.labels;
      if (labels4)
        throw Object.assign(new Error("多标签修改需要联网，草稿已保留。"), { code: "OFFLINE_MULTI_LABEL", localNotSaved: true });
      const { labels: ignored, ...legacyBody } = body4;
      return request2(path, { ...options3, offlineUnknown: true, body: legacyBody, headers: { "X-Note-Labels-Version": "1" } });
    }
  };
  return { request: request2, noteRequest, noteRead, noteWrite };
}
function publishNotesChange(expected, category, stores) {
  if (expected !== notesIdentityNow()) return;
  const { legacy: legacy2, entries } = stores;
  for (const item of entries.entries.values()) entryDraftRevision(item);
  scheduleSendFeedback(entries, expected);
  const revision2 = ++notesDraftRevision, saved = captureNotesDrafts(legacy2, entries, category);
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
  const changed2 = () => publishNotesChange(expected, category, stores);
  const readOnly = async () => {
    throw Object.assign(new Error("原有逐日记录只读，草稿可导出。"), { code: "LEGACY_READ_ONLY" });
  };
  const legacy2 = createDailyNotesStore({
    delay: 400,
    load: async (date2) => ({ ...await request2("/daily-notes?date=" + encodeURIComponent(date2) + suffix("&")), can_edit: false }),
    put: readOnly,
    restore: readOnly,
    remove: readOnly,
    onChange: changed2,
    onSaved: changed2
  });
  stores.legacy = legacy2;
  const entries = createNoteEntriesStore({
    category,
    manualSave: true,
    multiLabels: true,
    load: (date2) => noteRead("/note-entries?category=" + category + "&date=" + encodeURIComponent(date2)),
    loadVerified: (date2) => noteRequest("/note-entries?category=" + category + "&date=" + encodeURIComponent(date2)),
    loadEntry: (id2) => noteRead("/note-entries/" + encodeURIComponent(id2)),
    loadOperation: (id2) => noteRequest("/note-entries/operations/" + encodeURIComponent(id2)),
    put: (id2, body4, options3) => noteWrite("/note-entries/" + encodeURIComponent(id2), { ...options3, method: "PUT", body: body4 }),
    remove: (id2, body4, options3) => noteWrite("/note-entries/" + encodeURIComponent(id2), { ...options3, method: "DELETE", body: body4 }),
    restore: (id2, body4, options3) => noteRequest("/note-entries/" + encodeURIComponent(id2) + "/restore", { ...options3, method: "POST", body: body4 }),
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
    finishDelete: async ({ row, snapshots }, result) => {
      const offline = getOfflineRuntime();
      if (offline && expected === notesIdentityNow()) {
        await offline.flushDrafts();
        await offline.purgeUserDeletedNoteDrafts(row, snapshots, result, () => expected === notesIdentityNow());
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
    onChange: changed2,
    onSaved: () => {
      changed2();
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
    const { legacy: legacy2, entries } = openCategoryNotes(category, next);
    entryIdentities.set(entries, next);
    notesStores.set(category, legacy2);
    entryStores.set(category, entries);
  }
  if (select) {
    notesStore = notesStores.get(category);
    entryStore = entryStores.get(category);
  }
  return notesStores.get(category);
}
async function readMixedNotes(date2) {
  const expected = notesIdentityNow();
  ensureDailyNotesStore();
  for (const category of ["life", "work"]) ensureDailyNotesStore(category, false);
  const pairs = ["life", "work"].map((category) => ({ category, legacy: notesStores.get(category), entries: entryStores.get(category) }));
  await Promise.all([...pairs.flatMap(({ legacy: legacy2, entries }) => [legacy2.read(date2), entries.read(date2)]), readDailyScore(date2, expected), diaryTitle.load(date2)]);
  if (expected !== notesIdentityNow()) return;
  await Promise.all(pairs.map(({ category, legacy: legacy2, entries }) => hydrateNotesDrafts(legacy2, entries, category)));
  if (expected === notesIdentityNow() && date2 === dailyNotesRouteDate()) paintDailyNotesPage();
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
  diaryTitle.paint();
  if (!notesVisible() || notesRefreshPaused) return;
  const root3 = document.querySelector("#daily-notes");
  if (!root3 || !notesStore || !entryStore) return;
  root3.querySelector("#notes-today").hidden = notesView !== "today";
  root3.querySelector("#notes-history").hidden = notesView !== "history";
  root3.querySelector("#notes-labels").hidden = notesView !== "labels";
  for (const button2 of root3.querySelectorAll("[data-notes-view]"))
    button2.setAttribute("aria-pressed", String(button2.dataset.notesView === notesView));
  const date2 = dailyNotesRouteDate(), category = dailyNotesRouteCategory(), legacy2 = notesStore.page(date2), current3 = entryStore.page(date2);
  root3.querySelector("#notes-label-status").textContent = notesLabelMessage;
  const archivedNames = new Set(notesArchivedLabels.map((row) => row.name));
  const activeLabels = [.../* @__PURE__ */ new Set(["生活", "工作", ...notesLabels])].filter((name) => !archivedNames.has(name));
  const paintLabels = (selector, names, action, buttonText) => {
    const list3 = root3.querySelector(selector);
    list3.replaceChildren(...names.map((name) => {
      const item = document.createElement("li"), text = document.createElement("span"), button2 = document.createElement("button");
      text.textContent = name;
      button2.type = "button";
      button2.className = "btn text";
      button2.dataset.notesAction = action;
      button2.dataset.labelName = name;
      button2.textContent = buttonText;
      button2.setAttribute("aria-label", buttonText + "标签 " + name);
      button2.disabled = notesLabelBusy || !notesLabelsVerified;
      item.append(text);
      if (name !== "生活" && name !== "工作") {
        const find = document.createElement("button");
        find.type = "button";
        find.className = "btn text notes-label-find";
        find.dataset.notesAction = "find-label";
        find.dataset.labelName = name;
        find.textContent = "找旧的";
        find.setAttribute("aria-label", "让 AI 找以前该贴「" + name + "」的碎碎念");
        find.disabled = !notesLabelsVerified;
        item.append(find);
      }
      item.append(button2);
      return item;
    }));
  };
  paintLabels("#notes-label-list", activeLabels, "delete-label", "删除");
  paintLabelBackfill(root3);
  root3.querySelector('[data-notes-action="create-label"]').disabled = notesLabelBusy || !notesLabelsVerified;
  const otherCategory = category === "life" ? "work" : "life";
  const otherStore = entryStores.get(otherCategory), otherLegacy = notesStores.get(otherCategory)?.page(date2);
  const otherPage = otherStore?.page(date2);
  const mixedStore = { entry: (id2) => entryStore.entry(id2) || otherStore?.entry(id2) };
  const mixed = {
    ...current3,
    ids: [...current3.ids, ...otherPage?.ids || []],
    error: joinNotesErrors([
      current3.error,
      otherPage?.error && (otherCategory === "work" ? "工作：" : "生活：") + otherPage.error,
      legacy2.error && (category === "work" ? "工作原记录：" : "生活原记录：") + legacy2.error,
      otherLegacy?.error && (otherCategory === "work" ? "工作原记录：" : "生活原记录：") + otherLegacy.error
    ]),
    loading: current3.loading || Boolean(otherPage?.loading) || legacy2.loading || Boolean(otherLegacy?.loading),
    allLoaded: current3.loaded && Boolean(otherPage?.loaded) && legacy2.loaded && Boolean(otherLegacy?.loaded) && !current3.error && !otherPage?.error && !legacy2.error && !otherLegacy?.error
  };
  mixed.ids.sort((a, b) => {
    const first = mixedStore.entry(a), second = mixedStore.entry(b);
    return String(first?.createdAt || first?.localCreatedAt || "").localeCompare(String(second?.createdAt || second?.localCreatedAt || "")) || a.localeCompare(b);
  });
  const host = root3.querySelector("#notes-composer"), view3 = editorViews.page(category, date2), active5 = view3.active;
  const field2 = active5 === "legacy" ? root3.querySelector("#notes-editor") : host.querySelector('[data-note-entry-editor="' + active5 + '"]');
  const selected = editorViews.sync(
    category,
    date2,
    mixed.ids.map((id2) => mixedStore.entry(id2)).filter(Boolean),
    legacy2,
    { focused: host.contains(document.activeElement), composing: field2?.dataset.composing === "true" }
  );
  paintNoteEntries(
    root3,
    mixedStore,
    mixed,
    legacy2,
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
  } catch (error2) {
    if (expected !== notesIdentityNow() || sequence5 !== notesLabelSequence) return;
    notesLabelsVerified = false;
    notesLabelMessage = "标签状态读取失败，请联网后重新打开标签管理：" + (error2.message || "请稍后重试。");
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
  const expected = notesIdentityNow(), intent = notesArchiveIntent, date2 = dailyNotesRouteDate();
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
        await readMixedNotes(date2);
      }
    }
  } catch (error2) {
    ++notesLabelSequence;
    if (expected === notesIdentityNow()) notesLabelMessage = "删除结果未确认，请重试或重新打开标签管理核实：" + (error2.message || "请联网后重试。");
  } finally {
    notesLabelBusy = false;
    if (expected === notesIdentityNow()) paintDailyNotesPage();
  }
}
async function createNoteLabel(root3) {
  if (notesLabelBusy || !notesLabelsVerified) return;
  const input = root3.querySelector("#notes-new-label"), label = input.value.trim().normalize("NFC");
  if (!validCustomNoteLabel(label)) {
    notesLabelMessage = "标签须为 1–32 个字符，且不能叫生活或工作。";
    paintDailyNotesPage();
    return;
  }
  if (notesArchivedLabels.some((row) => row.name === label)) {
    notesLabelMessage = "该标签名称暂不可用。";
    paintDailyNotesPage();
    return;
  }
  if (!notesLabelIntent || notesLabelIntent.name !== label) notesLabelIntent = { name: label, save_id: crypto.randomUUID() };
  const expected = notesIdentityNow(), intent = notesLabelIntent;
  ++notesLabelSequence;
  notesLabelBusy = true;
  notesLabelMessage = "正在添加标签…";
  paintDailyNotesPage();
  try {
    const saved = await apiNetwork("/note-entries/labels", { method: "POST", body: intent, headers: { "X-Note-Labels-Version": "2" } });
    if (expected !== notesIdentityNow()) return;
    if (saved?.labels_version !== 2 || saved.name !== label) throw new Error("标签保存结果尚未核实，请重试原请求。");
    notesLabels = [.../* @__PURE__ */ new Set([...notesLabels, label])];
    notesLabelIntent = null;
    notesLabelMessage = "";
    input.value = "";
    void findOldNotes(label);
  } catch (error2) {
    if (expected === notesIdentityNow()) notesLabelMessage = "添加失败，输入已保留，可重试：" + (error2.message || "请联网后重试。");
  } finally {
    notesLabelBusy = false;
    if (expected === notesIdentityNow()) paintDailyNotesPage();
  }
}
var scoreTrend = /* @__PURE__ */ new Map(), scoreTrendMonths = /* @__PURE__ */ new Set(), scoreOpen = false;
var scoreDayBefore = (date2, days) => new Date(Date.parse(date2 + "T00:00:00Z") - days * 864e5).toISOString().slice(0, 10);
function scoreTrendSvg(date2) {
  const days = Array.from({ length: 7 }, (_, index) => scoreDayBefore(date2, 6 - index));
  const points = days.map((day9, index) => scoreTrend.has(day9) ? { x: 6 + index * 12, y: 21 - (scoreTrend.get(day9) - 1) * 2, day: day9 } : null);
  if (points.filter(Boolean).length < 2) return "";
  let lines = "";
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    if (from && to) lines += '<line x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '"/>';
  }
  const dots = points.filter(Boolean).map((point) => '<circle cx="' + point.x + '" cy="' + point.y + '" r="' + (point.day === date2 ? 3 : 2) + '"/>').join("");
  const spoken = days.filter((day9) => scoreTrend.has(day9)).map((day9) => day9.slice(5) + " " + scoreTrend.get(day9) + " 分").join("，");
  return '<svg width="84" height="24" viewBox="0 0 84 24" role="img" aria-label="近 7 天打分：' + spoken + '">' + lines + dots + "</svg>";
}
async function readScoreTrend(date2, expected = notesIdentityNow()) {
  const months = [.../* @__PURE__ */ new Set([date2.slice(0, 7), scoreDayBefore(date2, 6).slice(0, 7)])].filter((month) => !scoreTrendMonths.has(month));
  try {
    for (const month of months) {
      const data3 = await api("/daily-scores?month=" + encodeURIComponent(month));
      if (expected !== notesIdentityNow()) return;
      for (const item of data3.items || []) scoreTrend.set(item.date, item.score);
      scoreTrendMonths.add(month);
    }
  } catch {
  }
  if (expected === notesIdentityNow() && date2 === dailyNotesRouteDate()) paintDailyScore();
}
function paintDailyScore() {
  const root3 = document.querySelector("#daily-score");
  if (!root3) return;
  const date2 = scoreRecord.date || dailyNotesRouteDate();
  const label = root3.querySelector("#daily-score-label");
  if (label) label.textContent = date2 === dailyNotesToday() ? "今日打分" : date2 + " 打分";
  const scored = scoreRecord.score != null, open = !scored || scoreOpen || scoreRecord.pending != null;
  root3.classList.toggle("is-open", open);
  const chip = root3.querySelector("#daily-score-chip");
  if (chip) {
    chip.hidden = !scored;
    chip.textContent = (date2 === dailyNotesToday() ? "今日 " : date2.slice(5) + " ") + scoreRecord.score + " 分";
    chip.setAttribute("aria-expanded", String(open));
    chip.setAttribute("aria-label", chip.textContent + (scoreRecord.canEdit === false ? "" : "，点击修改"));
    chip.disabled = scoreRecord.canEdit === false;
  }
  const trend = root3.querySelector("#daily-score-trend");
  if (trend) {
    if (scored) scoreTrend.set(date2, scoreRecord.score);
    trend.innerHTML = scoreTrendSvg(date2);
  }
  for (const button2 of root3.querySelectorAll("[data-daily-score]")) {
    button2.setAttribute("aria-pressed", String(Number(button2.dataset.dailyScore) === scoreRecord.score));
    button2.disabled = scoreRecord.canEdit === false || scoreRecord.pending != null;
  }
  const status = root3.querySelector("#daily-score-status");
  if (status) status.textContent = scoreRecord.status === "已保存" ? "" : scoreRecord.status || "";
}
async function readDailyScore(date2, expected = notesIdentityNow()) {
  try {
    const data3 = await api("/daily-scores?date=" + encodeURIComponent(date2));
    if (expected !== notesIdentityNow() || date2 !== dailyNotesRouteDate()) return;
    scoreRecord = { date: date2, score: data3.score ?? null, version: data3.version || 0, status: "", saveId: "", pending: null, canEdit: data3.can_edit !== false };
    scoreOpen = false;
    if (data3.score != null) scoreByDate.set(date2, data3.score);
    else scoreTrend.delete(date2);
    void readScoreTrend(date2, expected);
  } catch (error2) {
    if (expected === notesIdentityNow()) scoreRecord = { date: date2, score: null, version: 0, status: error2.message || "打分读取失败", saveId: "", pending: null, canEdit: false };
  }
  paintDailyScore();
}
async function saveDailyScore(date2, score) {
  if (!Number.isInteger(score) || score < 1 || score > 10 || scoreRecord.canEdit === false) return;
  const current3 = scoreRecord.date === date2 ? scoreRecord : { date: date2, score: null, version: 0, saveId: "", canEdit: true };
  const saveId = current3.pending === score && current3.saveId ? current3.saveId : crypto.randomUUID();
  scoreRecord = { ...current3, date: date2, status: "保存中…", saveId, pending: score };
  paintDailyScore();
  const expected = notesIdentityNow();
  try {
    const saved = await api("/daily-scores/" + date2, { method: "PUT", body: { score, version: current3.version || 0, save_id: saveId } });
    if (expected !== notesIdentityNow()) return;
    scoreRecord = { date: date2, score: saved.score, version: saved.version, status: "已保存", saveId: "", pending: null, canEdit: saved.can_edit !== false };
    scoreByDate.set(date2, saved.score);
    scoreOpen = false;
  } catch (error2) {
    if (expected !== notesIdentityNow()) return;
    if (error2.status === 409) await readDailyScore(date2, expected);
    if (expected !== notesIdentityNow()) return;
    scoreRecord = { ...scoreRecord, status: error2.message || "保存失败，可再点一次", pending: null, saveId };
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
var WEEKDAYS2 = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function dayTitle(date2) {
  return `${Number(date2.slice(5, 7))}月${Number(date2.slice(8))}日 ${WEEKDAYS2[(/* @__PURE__ */ new Date(date2 + "T00:00:00Z")).getUTCDay()]}`;
}
function dayLine(date2, count3) {
  const score = scoreByDate.get(date2);
  return [dayTitle(date2), count3 ? count3 + " 条" : "", score ? "打分 " + score : ""].filter(Boolean).join(" · ");
}
var node = (tag2, className, text) => {
  const value = document.createElement(tag2);
  if (className) value.className = className;
  if (text !== void 0) value.textContent = text;
  return value;
};
var rowLabels = (row) => (row.displayLabels || [row.displayLabel]).filter(Boolean);
var byTime = (direction) => (a, b) => direction * String(a.updated_at || "").localeCompare(String(b.updated_at || ""));
function historyCard(row) {
  const article = node("article", "notes-read-entry");
  const head = node("div", "notes-read-head");
  head.append(node("span", "notes-read-time", monthTime(row.updated_at)), node("span", "notes-read-tags", rowLabels(row).join(" · ")));
  article.append(head, node("div", "notes-read-text", row.text));
  return article;
}
function timelineDay(date2, items) {
  const button2 = node("button", "notes-tl-day");
  button2.type = "button";
  button2.dataset.historyOpen = date2;
  button2.setAttribute("aria-label", dayLine(date2, items.length) + "，打开这一天");
  const when = node("span", "notes-tl-date");
  when.append(node("span", "notes-tl-num", String(Number(date2.slice(8)))), node("span", "notes-tl-week", dayTitle(date2).split(" ")[1]));
  const card3 = node("span", "notes-tl-card");
  card3.append(node("span", "notes-tl-preview", items.map((row) => `${monthTime(row.updated_at)} ${row.text}`).join("\n")));
  const score = scoreByDate.get(date2), tags = [...new Set(items.flatMap(rowLabels))].join(" · ");
  card3.append(node("span", "notes-tl-foot", [tags, items.length + " 条", score ? score + "分" : ""].filter(Boolean).join(" · ")));
  button2.append(when, node("span", "notes-tl-dot"), card3);
  return button2;
}
function paintTimeline(list3, shown2, order, open) {
  const direction = order === "asc" ? 1 : -1;
  if (open) {
    const rows = (historyDays.get(open) || []).filter(shown2).sort(byTime(1));
    const back = node("button", "notes-read-back", "← 返回时间轴");
    back.type = "button";
    back.dataset.historyBack = "1";
    list3.replaceChildren(back, node("h3", "notes-read-title", dayLine(open, rows.length)), ...rows.map(historyCard));
    return rows;
  }
  const groups = [...historyDays.entries()].sort(([a], [b]) => direction * a.localeCompare(b)).map(([date2, items]) => [date2, items.filter(shown2).sort(byTime(1))]).filter(([, items]) => items.length);
  const wrap = node("div", "notes-tl");
  wrap.append(...groups.map(([date2, items]) => timelineDay(date2, items)));
  list3.replaceChildren(wrap);
  return groups.flatMap(([, items]) => items);
}
function paintHistoryRows(root3) {
  const label = root3.querySelector("#notes-history-label").value;
  paintBodySummary(root3, label);
  historyDate = root3.querySelector("#notes-history-date").value;
  const list3 = root3.querySelector("#notes-history-list");
  const shown2 = (item) => !label || rowLabels(item).includes(label);
  const order = root3.dataset.historySort === "asc" ? "asc" : "desc";
  const orderButton = root3.querySelector("[data-history-order]");
  orderButton.dataset.historyOrder = order;
  orderButton.textContent = order === "asc" ? "↑ 旧到新" : "↓ 新到旧";
  const open = historyDays.has(root3.dataset.historyOpenDay) ? root3.dataset.historyOpenDay : "";
  orderButton.hidden = Boolean(open);
  const rows = paintTimeline(list3, shown2, order, open);
  const total = [...historyDays.values()].flat().filter(shown2).length;
  root3.querySelector("#notes-history-summary").textContent = `${Number(historyMonth.slice(5))}月${label ? `「${label}」` : ""}共 ${total} 条`;
  root3.querySelector("#notes-history-status").textContent = rows.length ? "" : label ? "这个月没有这个标签的记录。" : "这个月还没有记录（未同步的内容在当天页面查看）。";
}
function applyHistoryMonth(root3, month, days, chosenDate) {
  const weeks = noteMonthWeeks(month), dates = weeks.flat().filter(Boolean);
  const dateSelect = root3.querySelector("#notes-history-date"), labelSelect = root3.querySelector("#notes-history-label");
  const oldLabel = labelSelect.value, oldDate = dateSelect.value;
  const picked = dates.includes(chosenDate) ? chosenDate : dates.includes(oldDate) ? oldDate : dates[0];
  const withNotes = dates.filter((date2) => (days.get(date2) || []).length);
  const selected = (days.get(picked) || []).length || !withNotes.length ? picked : withNotes.filter((date2) => date2 <= picked).at(-1) || withNotes[0];
  if (historyMonth !== month) root3.dataset.historyOpenDay = "";
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
  } catch (error2) {
    if (!active5()) return;
    status.textContent = "月记录读取失败，保留当前内容：" + (error2.message || "请联网重试。");
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
function shiftedNotesDate(date2, delta2) {
  return new Date(Date.parse(date2 + "T12:00:00Z") + delta2 * 864e5).toISOString().slice(0, 10);
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
      const date2 = root3.querySelector("#notes-history-date"), dates = noteMonthWeeks(historyMonth)[week - 1];
      if (dates && !dates.includes(date2.value)) date2.value = dates.find(Boolean);
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
    const category = dailyNotesRouteCategory(), date2 = dailyNotesRouteDate();
    const revision2 = editorViews.page(category, date2).revision;
    await entries.save(id2);
    if (item.phase === "saved" && !item.dirty) void suggestForNote(item, notesLabels);
    if (!item.dirty && !item.pending && ["saved", "queued", "cached"].includes(item.phase)) {
      editorViews.requestCollapse(category, date2, id2, revision2, { explicit: true });
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
    const view3 = editorViews.page(item.category, item.date), revision2 = view3.revision;
    notesConfirmEntry = "";
    await entries.deleteEntry(id2);
    if ((!entries.entry(id2) || entries.entry(id2).deleted && !entries.entry(id2).pending) && view3.active === id2 && view3.revision === revision2)
      editorViews.activate(item.category, item.date, "");
    paintDailyNotesPage();
  } else if (action === "check") {
    if (item.phase === "unknown") await entries.reconcile(id2);
    else await entries.readOne(id2);
  } else if (action === "retry") await entries.retryPending(id2);
  else if (action === "use-server") entries.useServer(id2);
  else if (action === "use-draft") await entries.useDraft(id2);
}
function historyViewClick(root3, target) {
  const { historyOpen, historyBack, historyOrder } = target.dataset;
  if (!historyOpen && !historyBack && !historyOrder) return false;
  if (historyOpen || historyBack) root3.dataset.historyOpenDay = historyOpen || "";
  if (historyOrder) root3.dataset.historySort = historyOrder === "asc" ? "desc" : "asc";
  if (historyMonth) paintHistoryRows(root3);
  if (historyOpen || historyBack) root3.querySelector("#notes-history-list")?.scrollIntoView?.({ block: "start" });
  return true;
}
async function handleNotesClick(event) {
  if (!notesVisible() || notesRefreshPaused) return;
  const root3 = document.querySelector("#daily-notes");
  const target = event.target.closest("[data-notes-action],[data-notes-date],[data-notes-category],[data-note-entry-action],[data-notes-view],[data-notes-month],[data-history-order],[data-history-open],[data-history-back],[data-daily-score],[data-daily-score-toggle]");
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
  if (historyViewClick(root3, target)) return;
  if (target.dataset.notesMonth) {
    const month = historyMonth || dailyNotesToday().slice(0, 7);
    await loadHistory(shiftNoteMonth(month, target.dataset.notesMonth === "prev" ? -1 : 1));
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
  const store = ensureDailyNotesStore(), entries = entryStore, date2 = dailyNotesRouteDate();
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
    if (["life", "work"].includes(category)) exportLegacyDraft(notesStores.get(category).page(date2), category);
    return;
  }
  const action = target.dataset.notesAction;
  if (action === "new") {
    const item = entries.start(date2);
    if (item) openEditor(item.id);
  } else if (action === "create-label") await createNoteLabel(root3);
  else if (action === "find-label" && target.dataset.labelName) await findOldNotes(target.dataset.labelName);
  else if (action === "delete-label" && confirmLabelDeletion(target.dataset.labelName)) await deleteNoteLabel(target.dataset.labelName);
  else if (action === "edit-legacy") openEditor("legacy");
  else if (action === "collapse") {
    const { active: active5, revision: revision2 } = editorViews.page(dailyNotesRouteCategory(), date2);
    editorViews.requestCollapse(dailyNotesRouteCategory(), date2, active5, revision2, { explicit: true });
    paintDailyNotesPage();
  } else if (action === "previous" || action === "next") await selectDailyNotesDate(shiftedNotesDate(date2, action === "previous" ? -1 : 1));
  else if (action === "login") renderLogin();
  else if (action === "today") await selectDailyNotesDate(dailyNotesToday());
  else if (action === "export-legacy") exportLegacyDraft(store.page(date2), dailyNotesRouteCategory());
  else if (action === "export-drafts") await exportDraftArchive();
}
function registerDailyNotesSurfaceEvents() {
  document.addEventListener("click", (event) => {
    void handleNotesClick(event);
  });
  setNoteSuggestRepaint(() => paintDailyNotesPage());
  setLabelBackfillRepaint(() => paintDailyNotesPage());
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-label-backfill]");
    if (!target || !target.closest("#daily-notes")) return;
    event.preventDefault();
    void actOnLabelBackfill(target, { addLabel: addLabelToOldNote });
  });
  document.addEventListener("click", (event) => {
    const more = event.target.closest("[data-note-more]");
    if (more && more.closest("#daily-notes")) {
      event.preventDefault();
      openNoteMenu(more);
      return;
    }
    const todo = event.target.closest("[data-note-todo]");
    if (todo) {
      event.preventDefault();
      closePopover({ restoreFocus: false });
      noteToTodo(todo.dataset.noteId);
      return;
    }
    const target = event.target.closest('[data-note-idea="add"]');
    if (!target || !(target.dataset.noteId || target.closest("#daily-notes"))) return;
    event.preventDefault();
    closePopover({ restoreFocus: false });
    void putInIdeaPool(target);
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-note-suggest]");
    if (!target) return;
    event.preventDefault();
    const find = (id2) => [...entryStores.values()].map((store) => [store, store.entry(id2)]).find(([, item]) => item) || [];
    void actOnNoteSuggestion(target, {
      current: (id2) => find(id2)[1]?.labels,
      async relabel(id2, labels4) {
        const [store, item] = find(id2);
        if (!store || !notesLabelsVerified || !store.relabelDraft(id2, labels4)) return false;
        await store.save(id2);
        paintDailyNotesPage();
        return item.phase === "saved" && !item.dirty;
      }
    });
  });
  window.addEventListener("beforeunload", (event) => {
    if (notesIdentity !== notesIdentityNow() || !notesStore) return;
    if (retainedDrafts().some((item) => item.dirty || item.pending || item.phase === "unknown")) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}
function registerDailyNotesEvents() {
  if (notesEventsRegistered) return;
  notesEventsRegistered = true;
  registerNotesInputEvents();
  document.addEventListener("input", (event) => {
    if (event.target.id === "diary-title-input") diaryTitle.edit(event.target.value);
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "diary-title-form") return;
    event.preventDefault();
    void diaryTitle.save();
  });
  document.addEventListener("click", (event) => {
    if (notesVisible() && !notesRefreshPaused && event.target.closest("[data-diary-title-login]")) diaryTitle.login();
  });
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
    } catch (error2) {
      event.detail.waitUntil(Promise.reject(error2));
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
  registerDailyNotesSurfaceEvents();
}
var findNote = (id2) => [...entryStores.values()].map((source) => [source, source.entry(id2)]).find(([, row]) => row) || [];
function openNoteMenu(trigger) {
  const id2 = trigger.closest("[data-note-entry]")?.dataset.noteEntry;
  if (!id2 || trigger.disabled) return;
  const attr = 'data-note-id="' + id2.replace(/[^0-9a-f-]/gi, "") + '"';
  popover(trigger, (trigger.dataset.inPool ? "" : `<button type="button" role="menuitem" data-note-idea="add" ${attr}>💡 放进想法池</button>`) + `<button type="button" role="menuitem" data-note-todo ${attr}>✓ 转成待办</button>`, { menu: true, label: "这条碎碎念" });
}
function noteToTodo(id2) {
  const [, item] = findNote(id2);
  if (item) openNoteTodo(String(item.serverText ?? item.draft ?? ""));
}
async function addLabelToOldNote(row, label) {
  const store = entryStores.get(row.category);
  if (!store || !notesLabelsVerified) return false;
  if (!store.entry(row.id)) await store.read(row.date);
  const item = store.entry(row.id);
  if (!item || item.deleted) return false;
  if ((item.labels || []).includes(label)) return true;
  if (!store.relabelDraft(row.id, [.../* @__PURE__ */ new Set([...item.labels || [], label])])) return false;
  await store.save(row.id);
  return !item.dirty && ["saved", "queued", "cached"].includes(item.phase);
}
async function putInIdeaPool(target) {
  const id2 = target.dataset.noteId || target.closest("[data-note-entry]")?.dataset.noteEntry;
  const [store, item] = [...entryStores.values()].map((source) => [source, source.entry(id2)]).find(([, row]) => row) || [];
  if (!store || !item || target.disabled) return;
  const labels4 = [.../* @__PURE__ */ new Set([...item.labels || [], IDEA_LABEL])];
  target.disabled = true;
  if (!notesLabelsVerified || !store.relabelDraft(id2, labels4)) {
    item.error = "现在放不进想法池：请联网后再试，或点「编辑」手动勾选「想法池」标签。";
    paintDailyNotesPage();
    return;
  }
  await store.save(id2);
  if (item.phase !== "saved" && item.phase !== "queued" && item.phase !== "cached") item.error ||= "没放进去，请点「编辑」手动勾选「想法池」标签。";
  paintDailyNotesPage();
}
async function loadDailyNotes() {
  registerDailyNotesEvents();
  setDailyNotesRouteDate(dailyNotesRouteDate());
  ensureDailyNotesStore();
  const date2 = dailyNotesRouteDate(), expected = notesIdentityNow();
  void readNoteLabels();
  await readMixedNotes(date2);
  if (expected !== notesIdentityNow()) return;
  const historyRoot = document.querySelector("#daily-notes");
  if (notesView === "history" && (!historyMonth || historyRoot?.dataset.historyLoadedMonth !== historyMonth))
    void loadHistory(historyMonth, historyDate);
}
function selectedFloatingEntry(store, id2, date2) {
  const item = id2 && store?.entry(id2);
  return item && item.date === date2 && !item.deleted ? item : null;
}
function floatingNotesSnapshot() {
  if (notesIdentity !== notesIdentityNow()) return null;
  const date2 = dailyNotesToday(), store = entryStores.get(floatingNoteCategory), page = entryStores.get("life")?.page(date2);
  const item = selectedFloatingEntry(store, floatingNoteId, floatingNoteDate);
  const entries = [], errors = [];
  for (const category of ["life", "work"]) {
    const source = entryStores.get(category), current3 = source?.page(date2);
    if (current3?.error) errors.push(current3.error);
    for (const id2 of current3?.ids || []) {
      const value = source.entry(id2);
      if (value && !value.deleted && (value.version || value.localVersion || value.dirty || value.pending)) entries.push(value);
    }
    const legacy2 = notesStores.get(category)?.page(date2);
    if (legacy2?.error) errors.push(legacy2.error);
    if (legacy2 && (!legacy2.deleted || legacy2.dirty || legacy2.pending) && (legacy2.version || legacy2.dirty || legacy2.pending))
      entries.push({
        id: "legacy-" + category,
        category,
        legacy: true,
        draft: legacy2.dirty ? legacy2.draft : legacy2.serverText,
        updatedAt: legacy2.updatedAt
      });
  }
  entries.sort((a, b) => String(a.createdAt || a.localCreatedAt || a.updatedAt || "").localeCompare(
    String(b.createdAt || b.localCreatedAt || b.updatedAt || "")
  ));
  const archived = new Set(notesArchivedLabels.map((row) => row.name));
  return {
    date: date2,
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
  const date2 = dailyNotesToday(), expected = notesIdentityNow();
  void readNoteLabels();
  await readMixedNotes(date2);
  if (expected === notesIdentityNow()) {
    floatingNoteEntry(false);
    paintDailyNotesPage();
  }
}
function floatingNoteEntry(create = false) {
  if (!state.me || notesIdentity !== notesIdentityNow() || notesRefreshPaused) return null;
  const date2 = dailyNotesToday(), store = entryStores.get(floatingNoteCategory);
  if (!store) return null;
  const selected = selectedFloatingEntry(store, floatingNoteId, floatingNoteDate);
  if (selected) return selected;
  const page = store.page(date2);
  const candidate = page.ids.map((id2) => store.entry(id2)).find((item2) => item2 && !item2.version && !item2.localVersion && (item2.dirty || item2.pending || ["unknown", "conflict", "error", "oversize"].includes(item2.phase)));
  const item = candidate || (create ? store.start(date2) : null);
  if (item) {
    floatingNoteId = item.id;
    floatingNoteDate = date2;
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
  if (item.phase === "saved" && !item.dirty) void suggestForNote(item, notesLabels);
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

// web/ui/segmented.mjs
init_constants();
init_dom();
function segmented(action, items, selected, label, attribute = "tab", classes = "") {
  return `<div class="segmented${classes ? " " + e(classes) : ""}" role="group" aria-label="${e(label)}">${items.map(([value, text]) => `<button type="button" class="btn" data-action="${e(action)}" data-${e(attribute)}="${e(value)}" aria-pressed="${selected === value}">${e(
    text
  )}</button>`).join("")}</div>`;
}
function platformFilter(action, selected, label = "平台") {
  return segmented(action, [["", "全部"], ...Object.entries(platforms)], selected, label, "platform");
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
  const item = nav.find((entry) => entry.id === "review");
  return navigationLink({ ...item, account: state.account || "V字" }, mobile);
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
  const items = nav.filter((item) => item.id !== "settings").map((item) => item.id === "review" ? mediaNavigation(true) : navigationLink(item, true));
  return `<nav class="mobile-nav workbench-navigation" aria-label="切换模块">${items.join("")}</nav>`;
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
  const editing = document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
  const keyboard = editing ? Math.max(0, (window.innerHeight || height) - height - top) : 0;
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
function renderTodoSettings() {
  return `<section class="card panel todo-settings" aria-label="今日待办设置">${renderTodoPreferences()}</section>`;
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
  let out = "", list3 = "", paragraph = [], code = false;
  const flushParagraph = () => {
    if (paragraph.length) {
      out += "<p>" + paragraph.map(inline).join("<br>") + "</p>";
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list3) {
      out += `</${list3}>`;
      list3 = "";
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
      if (list3 !== type) {
        closeList();
        list3 = type;
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

// web/core/work-reminders-state.mjs
function visibleWorkReminders(items = []) {
  return items.filter((row) => row.source_key !== "tencent.daily-summary");
}

// web/pages/ai-decisions.mjs
init_dom();
var DECISION_HEADING = /待你拍板/;
var plain2 = (line) => line.replace(/^[\s#>*_]+|[\s*_:：]+$/g, "").trim();
var isHeading = (line) => /^#{1,6}\s/.test(line) || /^\s*\*\*[^*]+\*\*\s*[:：]?\s*$/.test(line) || /^\s*[^\s\d-].{0,12}[:：]\s*$/.test(line);
var ENDS_SECTION = /^\s*(已按你的决定执行|已执行)/;
var NOTHING = /^(?:今天|今日|目前|暂时|这次)?[，,\s]*(?:没有|无|暂无)(?:需要|要)?(?:你)?(?:拍板|决定)(?:的事|的事情|事项)?[。.！!]*$/;
function decisionsFrom(summary3) {
  const lines = String(summary3 ?? "").split(/\r?\n/);
  const start = lines.findIndex((line) => DECISION_HEADING.test(line) && (isHeading(line) || plain2(line).length <= 12));
  if (start < 0) return null;
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (isHeading(line) || ENDS_SECTION.test(line)) break;
    const item = /^\s*(?:\d{1,2}[.、)]|[-*•])\s+(.*)$/.exec(line);
    if (NOTHING.test(plain2(item ? item[1] : line))) continue;
    if (item) items.push(item[1]);
    else if (line.trim() && items.length) items[items.length - 1] += line.trim();
    else if (line.trim()) items.push(line.trim());
  }
  return items;
}
function dayDecisions(items = []) {
  return visibleWorkReminders(items).map((row) => ({ row, decisions: decisionsFrom(row.summary) }));
}
function decisionCount(items = []) {
  return dayDecisions(items).reduce((sum, { decisions }) => sum + (decisions?.length || 0), 0);
}
function openDecisionCount(items = []) {
  return dayDecisions(items).reduce((sum, { decisions }) => sum + (decisions || []).filter((item) => !decisionStatus(item).status).length, 0);
}
var STATUS = /\s*(?:[【（(\[]\s*(已采纳|已否决|待定)\s*[】）)\]]|[—\-→:：]\s*(已采纳|已否决|待定)\s*[。.]?\s*$)/;
var STATUS_CLASS = { 已采纳: "is-yes", 已否决: "is-no", 待定: "is-wait" };
function decisionStatus(text) {
  const match = STATUS.exec(text);
  if (!match) return { text, status: "" };
  return { text: (text.slice(0, match.index) + text.slice(match.index + match[0].length)).trim(), status: match[1] || match[2] };
}
var list = (decisions) => `<ol class="ai-decision-list">${decisions.map((item) => {
  const { text, status } = decisionStatus(item);
  return `<li class="ai-report-markdown${status ? " " + STATUS_CLASS[status] : ""}">${status ? `<span class="ai-decision-status">${status}</span>` : ""}${renderSafeMarkdown(text)}</li>`;
}).join("")}</ol>`;
var NONE = '<p class="muted">没有要你拍板的事。</p>';
var OTHER_SHAPE = '<p class="muted">这份提醒没有单列「待你拍板」，详细内容在「AI汇报」。</p>';
var dayBody = (items) => {
  const parts2 = dayDecisions(items).map(({ decisions }) => decisions === null ? OTHER_SHAPE : decisions.length ? list(decisions) : "");
  return [...new Set(parts2.filter(Boolean))].join("") || NONE;
};
function decisionCards(items = []) {
  return `<article class="card field-spaced ai-decision-card">${dayBody(items)}</article>`;
}
var WEEK2 = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function decisionHistory(days = []) {
  const rows = days.filter((day9) => visibleWorkReminders(day9.items).length).map((day9) => {
    const count3 = decisionCount(day9.items), week = WEEK2[(/* @__PURE__ */ new Date(day9.date + "T00:00:00Z")).getUTCDay()];
    return `<div class="notes-tl-day ai-decision-day"><span class="notes-tl-date"><span class="notes-tl-num">${Number(day9.date.slice(8))}</span><span class="notes-tl-week">${week}</span></span><span class="notes-tl-dot"></span><div class="notes-tl-card">${dayBody(day9.items)}<span class="notes-tl-foot">${Number(day9.date.slice(5, 7))}月${Number(day9.date.slice(8))}日 · ${count3 ? `${count3} 件` : "无待拍板"}</span></div></div>`;
  });
  return rows.length ? `<div class="notes-tl">${rows.join("")}</div>` : '<p class="muted">前 7 天没有提醒。</p>';
}

// web/pages/ai-reports.mjs
init_dom();
init_daily_notes_state();
function renderAiReports() {
  return `<section id="ai-reports" aria-label="AI 日报">
    <div class="ai-board">
      <section class="ai-panel ai-decision-top" aria-labelledby="ai-decision-title">
        <p id="ai-reminder-status" role="status"></p><div id="ai-reminder-list"></div>
        <details class="ai-decision-more"><summary data-ai-decision-history>看前 7 天的待拍板</summary>
        <div id="ai-decision-history"></div></details>
      </section>
      <section class="ai-panel ai-report-panel" aria-labelledby="ai-report-panel-title">
      <header class="ai-panel-head"><h2 id="ai-report-panel-title">汇报</h2>
      <div class="page-tabs segmented ai-daily-tabs" role="group" aria-label="汇报类型">
        <button class="btn" type="button" data-ai-daily-tab="reports" aria-pressed="true">日报</button>
        <button class="btn" type="button" data-ai-daily-tab="weekly" aria-pressed="false">周报</button>
      </div></header>
      <section data-ai-daily-panel="reports">
      <div class="ai-calendar-layout"><button class="btn ai-calendar-step" type="button" data-ai-report-month="-1" aria-label="上个月">‹</button>
        <div class="ai-calendar-body"><h2 id="ai-report-date-title" aria-live="polite"></h2><div id="ai-report-calendar"></div></div>
        <button class="btn ai-calendar-step" type="button" data-ai-report-month="1" aria-label="下个月">›</button></div>
      <p id="ai-report-list-status" role="status"></p>
      <div id="ai-report-dayhead"></div><div id="ai-report-list" aria-live="polite"></div><div id="ai-experiments" class="content-review ai-experiments"></div>
      </section>
      <section data-ai-daily-panel="weekly" hidden><p id="ai-weekly-status" role="status"></p>
        <div id="ai-weekly-list" class="content-review"></div></section>
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
  const date2 = /^\d{4}-\d{2}-\d{2}$/.test(firstLine) ? /* @__PURE__ */ new Date(`${firstLine}T00:00:00Z`) : null;
  if (!date2 || !Number.isFinite(date2.getTime()) || date2.toISOString().slice(0, 10) !== firstLine)
    return { workDate: null, body: content2 };
  return { workDate: firstLine, body: content2.slice(firstLine.length).replace(/^\r?\n/, "") };
}
function reportDay(row) {
  const { workDate } = reportContent(row.content);
  const date2 = new Date(row.created_at);
  if (workDate) return workDate;
  if (!Number.isFinite(date2.getTime())) return "";
  const parts2 = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date2).map((part) => [part.type, part.value]));
  return `${parts2.year}-${parts2.month}-${parts2.day}`;
}
function reportShownDay(row) {
  const day9 = reportDay(row);
  return day9 ? new Date(Date.parse(day9 + "T00:00:00Z") + 864e5).toISOString().slice(0, 10) : "";
}
var shortDay2 = (date2) => `${Number(date2.slice(5, 7))}月${Number(date2.slice(8))}日`;
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
  for (let day9 = 1; day9 <= days; day9++) {
    const date2 = `${visibleMonth2}-${String(day9).padStart(2, "0")}`;
    calendar += `<button type="button" class="btn text" data-ai-report-select="${date2}" aria-label="${date2}" ${date2 === selectedDate2 ? 'aria-current="date"' : ""}>${day9}</button>`;
  }
  root3.querySelector("#ai-report-calendar").innerHTML = calendar + "</div>";
}
function paintAiReports(items, error2 = "", loading = false, selectedDate2 = dailyNotesToday(), visibleMonth2 = selectedDate2.slice(0, 7)) {
  const root3 = document.querySelector("#ai-reports");
  if (!root3) return;
  const status = root3.querySelector("#ai-report-list-status");
  status.textContent = error2 || (loading || items.length ? "" : "暂无汇报");
  paintAiCalendar(selectedDate2, visibleMonth2);
  const rows = [];
  const groups = { "Grok bot": [], Gemini: [], GPT: [], "其他作者": [] };
  for (const row of items) {
    const date2 = new Date(row.created_at);
    const validDate = Number.isFinite(date2.getTime());
    const submissionDay = validDate ? dateFormatter.format(date2) : "日期未知";
    const { body: body4 } = reportContent(row.content);
    const stamp4 = validDate ? `${submissionDay} ${timeFormatter.format(date2)}（北京时间）` : String(row.created_at ?? "未知");
    const author = String(row.author ?? "");
    const group = reportGroup(author);
    groups[group].push(`<article class="card field-spaced ai-report-card" title="提交于 ${e(stamp4)}"><p><strong class="${reportAuthorClass(author)}">${e(author)}：</strong></p><div class="ai-report-markdown">${renderSafeMarkdown(body4)}</div></article>`);
  }
  for (const [name, entries] of Object.entries(groups)) {
    if (name === "其他作者" && !entries.length) continue;
    const heading = name === "其他作者" ? `<h3 class="${reportAuthorClass(name)}">${name}</h3>` : "";
    rows.push(`<section>${heading}${entries.length ? entries.join("") : "<p>暂无汇报</p>"}</section>`);
  }
  root3.querySelector("#ai-report-list").innerHTML = loading || error2 ? "" : rows.join("");
}
function paintAiDailyReminders(data3, error2 = "", loading = false) {
  const root3 = document.querySelector("#ai-reports");
  if (!root3) return;
  root3.querySelector("#ai-reminder-status").textContent = error2 || (loading ? "正在读取工作提醒…" : "");
  const items = visibleWorkReminders(data3?.items || []), count3 = items.length ? decisionCount(items) : 0;
  const date2 = data3?.date || dailyNotesToday(), day9 = date2 === dailyNotesToday() ? `今天 · ${reportDayTitle(date2)}` : reportDayTitle(date2);
  const open = items.length ? openDecisionCount(items) : 0;
  const box = root3.querySelector("#ai-reminder-list");
  if (loading || error2) {
    box.innerHTML = "";
    return;
  }
  if (!open) {
    box.innerHTML = `<h2 class="ai-decision-head" id="ai-decision-title">待拍板<span>${e(day9)}</span></h2><p class="ai-decision-done"><span aria-hidden="true">✓</span> ${count3 ? "今天的都拍完了" : "今天没有要你拍板的事"}</p>`;
    return;
  }
  box.innerHTML = `<h2 class="ai-decision-head" id="ai-decision-title">待拍板 <b>${open}</b><span>${e(day9)}</span></h2><p class="ai-decision-how">看完去和 Grok 说就行；完整内容在下面的日报里。</p>` + decisionCards(items);
}
function paintDecisionHistory(days, { loading = false, error: error2 = "" } = {}) {
  const box = document.querySelector("#ai-decision-history");
  if (!box) return;
  box.innerHTML = error2 ? `<p class="body-summary-error">${e(error2)}</p>` : loading ? '<p class="muted">正在读取…</p>' : decisionHistory(days);
}
var WEEKDAYS3 = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function reportDayTitle(date2) {
  return `${Number(date2.slice(5, 7))}月${Number(date2.slice(8))}日 ${WEEKDAYS3[(/* @__PURE__ */ new Date(date2 + "T00:00:00Z")).getUTCDay()]}`;
}
function reportPreview(markdown) {
  return String(markdown ?? "").replace(/```[\s\S]*?```/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^[\s#>*+-]+/gm, "").replace(/[*_`~|]/g, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 2).join(" ");
}
function paintAiReportTimeline(items, month, { loading = false, error: error2 = "" } = {}) {
  const root3 = document.querySelector("#ai-reports");
  if (!root3) return;
  paintAiCalendar(`${month}-01`, month);
  const days = /* @__PURE__ */ new Map();
  for (const row of items) {
    const day9 = reportShownDay(row);
    if (day9.startsWith(month)) days.set(day9, [...days.get(day9) || [], row]);
  }
  root3.querySelector("#ai-report-list-status").textContent = error2 || (loading ? "" : days.size ? "" : "这个月还没有汇报");
  const head = root3.querySelector("#ai-report-dayhead");
  if (head) head.innerHTML = "";
  const today2 = dailyNotesToday(), pinned = days.get(today2) || [];
  days.delete(today2);
  const rows = [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date2, list3]) => {
    const preview = list3.map((row) => `${reportGroup(row.author)}：${reportPreview(reportContent(row.content).body)}`).join("\n");
    const authors = [...new Set(list3.map((row) => reportGroup(row.author)))].join(" · ");
    const covered = [...new Set(list3.map(reportDay))].sort().map(shortDay2).join("、");
    return `<button type="button" class="notes-tl-day" data-ai-report-open="${date2}" aria-label="${e(reportDayTitle(date2))}的汇报，打开"><span class="notes-tl-date"><span class="notes-tl-num">${Number(date2.slice(8))}</span><span class="notes-tl-week">${reportDayTitle(date2).split(" ")[1]}</span></span><span class="notes-tl-dot"></span><span class="notes-tl-card"><span class="notes-tl-preview">${e(preview)}</span><span class="notes-tl-foot">汇报 ${e(covered)} · ${e(authors)} · ${list3.length} 份</span></span></button>`;
  });
  const top = month === today2.slice(0, 7) ? todayReports(today2, pinned) : "";
  root3.querySelector("#ai-report-list").innerHTML = loading || error2 ? "" : top + (rows.length ? `${top ? '<h3 class="ai-today-more">更早</h3>' : ""}<div class="notes-tl">${rows.join("")}</div>` : "");
  if (!loading && !error2 && top) root3.querySelector("#ai-report-list-status").textContent = "";
}
function todayReports(today2, list3) {
  const yesterday = new Date(Date.parse(today2 + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
  const head = `<h3 class="ai-today-title">今天 · ${e(reportDayTitle(today2))}</h3><p class="notes-read-sub">汇报的是昨天（${e(reportDayTitle(yesterday))}）做的事</p>`;
  if (!list3.length) return `<section class="ai-today">${head}<p class="muted">今天的汇报还没到。</p></section>`;
  const order = ["Grok bot", "Gemini", "GPT", "其他作者"];
  const sorted = [...list3].sort((a, b) => order.indexOf(reportGroup(a.author)) - order.indexOf(reportGroup(b.author)) || String(a.created_at).localeCompare(String(b.created_at)));
  return `<section class="ai-today">${head}${sorted.map((row) => `<article class="ai-today-report"><p><strong class="${reportAuthorClass(row.author)}">${e(String(row.author ?? ""))}：</strong></p><div class="ai-report-markdown">${renderSafeMarkdown(reportContent(row.content).body)}</div></article>`).join("")}</section>`;
}
function paintAiReportDayHead(date2) {
  const head = document.querySelector("#ai-reports #ai-report-dayhead");
  if (head) head.innerHTML = date2 ? `<button type="button" class="notes-read-back" data-ai-report-back="1">← 返回时间轴</button><h3 class="notes-read-title">${e(reportDayTitle(date2))} 的汇报</h3><p class="notes-read-sub">汇报的是前一天（${e(reportDayTitle(new Date(Date.parse(date2 + "T00:00:00Z") - 864e5).toISOString().slice(0, 10)))}）做的事</p>` : "";
}

// shared/review-publish-state.mjs
function reviewPublishState(row) {
  if (row?.publish_status === "pending") return "pending";
  if (row?.publish_status === "unmatched") return "unmatched";
  return "published";
}
function reviewPublishLabel(row) {
  return { pending: "待发布", published: "已发布", unmatched: "未能对上" }[reviewPublishState(row)];
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
function finiteNumber(value) {
  if (!["number", "string"].includes(typeof value) || typeof value === "string" && !value.trim()) return null;
  const number3 = Number(value);
  return Number.isFinite(number3) ? number3 : null;
}
function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const stamp4 = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp4) && new Date(stamp4).toISOString().slice(0, 10) === value ? value : "";
}
var clock = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function parts(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !calendarDate(match[1]) || +match[2] > 23 || +match[3] > 59 || +match[4] > 59 || match[5] !== "Z" && (+match[5].slice(1, 3) > 23 || +match[5].slice(4, 6) > 59)) return null;
  const stamp4 = Date.parse(value);
  return Number.isFinite(stamp4) ? Object.fromEntries(clock.formatToParts(stamp4).map((part) => [part.type, part.value])) : null;
}
function day6(value) {
  if (calendarDate(value)) return value;
  const p = parts(value);
  return p ? calendarDate(`${p.year.padStart(4, "0")}-${p.month}-${p.day}`) : "";
}
function reviewDateTime(value) {
  if (calendarDate(value)) return value;
  const p = parts(value);
  return p ? `${day6(value)} ${p.hour}:${p.minute}` : "";
}
function shiftDay3(value, amount) {
  const date2 = day6(value);
  return date2 && Number.isInteger(amount) ? new Date(Date.parse(`${date2}T00:00:00Z`) + amount * 864e5).toISOString().slice(0, 10) : "";
}
function median(values = []) {
  const sorted = values.map(finiteNumber).filter((value) => value !== null).sort((a, b) => a - b);
  const middle2 = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle2] : (sorted[middle2 - 1] + sorted[middle2]) / 2 : null;
}
var nonnegative = (value) => {
  const n = finiteNumber(value);
  return n !== null && n >= 0 ? n : null;
};
var rate = (value) => {
  const n = nonnegative(value);
  return n !== null && n <= 100 ? n : null;
};
var validAge = (snapshot) => {
  const n = finiteNumber(snapshot.age_hours);
  return n !== null && Number.isInteger(n) && n >= 12 && n <= 72;
};
function select24hSnapshot(snapshots = [], articleId) {
  return array(snapshots).filter((snapshot) => snapshot && (articleId === void 0 || id(snapshot.article_id) === id(articleId)) && validAge(snapshot)).sort((a, b) => Math.abs(Number(a.age_hours) - 24) - Math.abs(Number(b.age_hours) - 24) || Number(a.age_hours) - Number(b.age_hours) || compare(id(a.snapshot_date), id(b.snapshot_date)) || compare(id(a.id), id(b.id)))[0] ?? null;
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
  const version2 = finiteNumber(article?.playbook_version_used);
  const specified = parsed(article?.applied_rule_ids, null);
  if (version2 === null || !Array.isArray(specified)) return [];
  const playbook2 = array(playbooks).filter((item) => item.account === article.account && finiteNumber(item.version) === version2).sort((a, b) => compare(id(a.id), id(b.id)))[0];
  if (!playbook2) return [];
  const rules2 = normalizeRules(playbook2.rules ?? playbook2.rules_json);
  return rules2.filter((rule) => specified.includes(rule.rule_id));
}
function newestFirst(a, b, when) {
  const x = when(a), y = when(b);
  const dateOrder = compare(day6(y), day6(x));
  if (dateOrder) return dateOrder;
  const aTimed = Boolean(parts(x)), bTimed = Boolean(parts(y));
  return (aTimed && bTimed ? Date.parse(y) - Date.parse(x) : Number(bTimed) - Number(aTimed)) || compare(id(a.id), id(b.id));
}
function recentArticles(a, b) {
  return newestFirst(a, b, (row) => row.published_at);
}
function activityTime(row) {
  return reviewPublishState(row) === "pending" ? row?.draft_saved_at || row?.created_at || null : row?.published_at ?? null;
}
function activityArticles(a, b) {
  return newestFirst(a, b, activityTime);
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
      const samples = baselineRows.filter((item) => item.account === row.account && item.reads_24h !== null && reviewPublishState(item) === "published").sort(recentArticles).slice(0, 30);
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
function enrichArticle(article, snapshots = [], playbooks = [], reports = [], articles = [article]) {
  const cohort = [...array(articles).filter((item) => id(item.id) !== id(article.id)), article];
  return enrichArticles({ articles: cohort, snapshots, playbooks, reports }).find((item) => id(item.id) === id(article.id));
}
function weekBounds(now = (/* @__PURE__ */ new Date()).toISOString(), week = "this") {
  const today2 = day6(now instanceof Date ? now.toISOString() : now);
  if (!today2) throw new TypeError("now must be a valid date or explicit ISO timestamp");
  if (!["this", "last"].includes(week)) throw new TypeError("week must be this or last");
  const weekday2 = (/* @__PURE__ */ new Date(`${today2}T00:00:00Z`)).getUTCDay();
  const start = shiftDay3(today2, -(weekday2 + 6) % 7 - (week === "last" ? 7 : 0));
  return { today: today2, start, end: shiftDay3(start, 6), previousStart: shiftDay3(start, -7), previousEnd: shiftDay3(start, -1) };
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
  const label = week === "last" ? "上周" : "本周";
  const judged = current3.judged_count;
  return `${label}发布 ${current3.count} 篇，${judged ? `可判定 ${judged} 篇，爆款 ${current3.hits} 篇、扑街 ${current3.flops} 篇` : "暂无有效 24h 阅读样本"}。`;
}
function firstSentence(markdown) {
  if (typeof markdown !== "string") return "";
  const text = markdown.replace(/^\s{0,3}(?:#{1,6}\s+|>\s?)/gm, "").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/<[^>]*>/g, "").replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim();
  const ending = /[。！？!?][”’"')）]*|\.(?=\s|$)/.exec(text);
  return ending ? text.slice(0, ending.index + ending[0].length) : text;
}
function weeklyConclusion(reports, account3, bounds, week) {
  const report = array(reports).filter((item) => item?.account === account3 && item.period_type === "weekly" && day6(item.period_start) === bounds.start && day6(item.period_end) === bounds.end).sort((a, b) => compare(id(b.created_at), id(a.created_at)) || compare(id(a.id), id(b.id)))[0];
  return firstSentence(report?.summary_md) || `${week === "last" ? "上周" : "本周"}尚未生成周报`;
}
function buildOverview(data3 = {}, options3 = {}) {
  const { account: account3, week = "this", range: range2 = "7d", now = (/* @__PURE__ */ new Date()).toISOString() } = options3;
  if (!["7d", "30d"].includes(range2)) throw new TypeError("range must be 7d or 30d");
  const bounds = weekBounds(now, week), allRows = enrichArticles(data3, { account: account3 });
  const counted = (row) => reviewPublishState(row) === "published";
  const cohort = (start, end) => allRows.filter((row) => {
    if (!counted(row)) return false;
    const published = day6(row.published_at);
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
  const trendDays = range2 === "30d" ? 30 : 7;
  const trend = Array.from({ length: trendDays }, (_, index) => {
    const date2 = shiftDay3(bounds.today, index - trendDays + 1), daily = cohort(date2, date2), result = { date: date2, count: daily.length, published_count: daily.length };
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
  const articleIds = new Set(allRows.filter(counted).map((row) => id(row.id)));
  const dates = array(data3.snapshots).filter((snapshot) => articleIds.has(id(snapshot.article_id))).map((snapshot) => day6(snapshot.snapshot_date)).filter(Boolean).sort();
  const latest2 = dates.at(-1) ?? null;
  const elapsed = latest2 ? Math.round((Date.parse(`${bounds.today}T00:00:00Z`) - Date.parse(`${latest2}T00:00:00Z`)) / 864e5) : null;
  const publishedRows = allRows.filter(counted);
  if (publishedRows.length && (latest2 === null || elapsed > 2)) alerts.push({
    code: "collection_interruption",
    count: publishedRows.length,
    last_snapshot_date: latest2,
    days_since_snapshot: elapsed,
    message: latest2 ? `最近快照为 ${latest2}，距今 ${elapsed} 个上海日历日，已超过 2 日采集间隔。` : "已有文章但尚无有效日期的采集快照，无法确认采集连续性。"
  });
  const summary3 = summarySentence(current3, week);
  const conclusion = weeklyConclusion(data3.reports, account3, bounds, week);
  return { account: account3 ?? null, week, range: range2, ...bounds, rows, previousRows, current: current3, previous, changes, trend, alerts, summary: summary3, conclusion };
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
  const first = using.map((row) => day6(row.published_at)).filter(Boolean).sort()[0] || null;
  const withRows = using.filter(measured);
  const others = first ? rows.filter((row) => !(row.applied_rule_ids || []).includes(ruleId) && measured(row) && day6(row.published_at) >= first) : [];
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
function splitPattern(label) {
  const text = String(label ?? "").trim(), match = /^([A-Za-z]{1,3}\d{1,3})[\s·:：.、-]+(\S[\s\S]*)$/.exec(text);
  return match ? { code: match[1], name: match[2].trim() } : { code: "", name: text };
}
function patternStats(rows = [], labels4 = {}) {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const label = row.title_pattern || labels4[row.id];
    if (!label || !measured(row)) continue;
    const { code, name } = splitPattern(label);
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
  return [...groups.entries()].map(([pattern, { code, items }]) => ({
    pattern,
    code,
    count: items.length,
    reads: mid(items.map((row) => row.reads_24h)),
    ctr: mid(items.map((row) => row.ctr_24h)),
    hits: items.filter((row) => row.verdict === "爆").length,
    articles: [...items].sort((x, y) => y.reads_24h - x.reads_24h).map((row) => ({ id: row.id, title: row.title || "", reads: row.reads_24h, verdict: row.verdict || "" }))
  })).sort((x, y) => y.count - x.count || (y.reads ?? 0) - (x.reads ?? 0));
}
function weeklyPeriod(today2) {
  const at = /* @__PURE__ */ new Date(today2 + "T00:00:00Z"), weekday2 = at.getUTCDay();
  let back = (weekday2 - 5 + 7) % 7;
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
var namedPattern = (pattern, names) => names?.has(pattern) ? `${names.get(pattern)}（${pattern}）` : pattern;

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
  let out = "", plain3 = 0, pos = 0;
  let linkMiddle = text.indexOf("]("), linkEnd = linkMiddle < 0 ? -1 : text.indexOf(")", linkMiddle + 2);
  const emit2 = (end, html) => {
    out += e(text.slice(plain3, pos)) + html;
    pos = end;
    plain3 = end;
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
        const label = text.slice(pos + 1, linkMiddle), href = safeReviewUrl(text.slice(linkMiddle + 2, linkEnd));
        emit2(linkEnd + 1, href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : e(label));
        continue;
      }
    }
    pos++;
  }
  return out + e(text.slice(plain3));
}
function renderReviewMarkdown(value) {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  let list3 = false, code = false, out = "";
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (list3) {
        out += "</ul>";
        list3 = false;
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
      if (!list3) {
        out += "<ul>";
        list3 = true;
      }
      out += `<li>${inline2(item[1])}</li>`;
      continue;
    }
    if (list3) {
      out += "</ul>";
      list3 = false;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const h = Math.min(heading[1].length + 1, 5);
      out += `<h${h}>${inline2(heading[2])}</h${h}>`;
    } else if (line.trim()) out += /^>\s?/.test(line) ? `<blockquote>${inline2(line.replace(/^>\s?/, ""))}</blockquote>` : `<p>${inline2(line)}</p>`;
  }
  return out + (list3 ? "</ul>" : "") + (code ? "</code></pre>" : "");
}

// web/pages/review-ai.mjs
init_dom();
var AI_FEATURE_LABELS = {
  weekly: "周报",
  titles: "标题归类",
  benchmarks: "爆文拆解",
  diagnosis: "单篇文章分析",
  body: "大小便周小结",
  todo: "一句话加待办"
};
var AI_FEATURES_SHOWN = [
  ["body", "每周把碎碎念里的大小便记录整理成一段小结。"],
  ["todo", "把“明天下午取快递”这样的一句话拆成日期和事项，确认后才添加。"],
  ["diagnosis", "内容复盘里，对单篇文章做一次分析。"]
];
var SMALL_MODEL = /mini|nano|lite|flash|small/i;
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
function patternHtml(pattern, names) {
  return names.has(pattern) ? `${e(names.get(pattern))} <small class="review-pattern-code">${e(pattern)}</small>` : e(pattern);
}
var button = (label, action, attrs = "", kind = "btn small") => `<button class="${kind}" type="button" data-ai-action="${action}" ${attrs}>${e(label)}</button>`;
function onceOptions(ai2, feature) {
  if (ai2?.options !== feature) return "";
  const models = ai2.models?.length ? ai2.models : [];
  return `<div class="review-ai-once" role="group" aria-label="仅这一次的模型和强度"><label>模型<select class="input" data-ai-once="model">
    <option value="">按设置</option>${models.map((id2) => `<option value="${e(id2)}"${ai2.once?.model === id2 ? " selected" : ""}>${e(id2)}</option>`).join("")}</select></label>
    <label>强度<select class="input" data-ai-once="effort"><option value="">按设置</option>${AI_EFFORT_LABELS.slice(1).map(([id2, label]) => `<option value="${id2}"${ai2.once?.effort === id2 ? " selected" : ""}>${label}</option>`).join("")}</select></label>
    <span class="review-note">${ai2.modelsError ? e(ai2.modelsError) : models.length ? "只对这一次生效" : "正在读取模型列表…"}</span></div>`;
}
function runControls(ai2, feature, label) {
  const working = busy(ai2, feature);
  return `<div class="review-ai-run">${button(
    working ? "正在生成…" : label,
    "run",
    `data-ai-feature="${feature}"${working || ai2?.busy ? " disabled" : ""}`,
    "btn small primary"
  )}
    ${button("⚙", "options", `data-ai-feature="${feature}" aria-label="这一次用别的模型或强度" aria-expanded="${ai2?.options === feature}"`, "btn small review-ai-gear")}
    ${onceOptions(ai2, feature)}</div>`;
}
function notice(ai2, feature) {
  const message = ai2?.messages?.[feature];
  return message ? `<p class="review-ai-message${message.error ? " is-error" : ""}" role="${message.error ? "alert" : "status"}">${e(message.text)}</p>` : "";
}
function unavailable(ai2) {
  if (!ai2 || ai2.status === "loading") return '<p class="review-note" role="status">正在读取 AI 结果…</p>';
  if (ai2.status === "error") return `<p class="review-ai-message is-error" role="alert">${e(ai2.error || "AI 结果读取失败")} ${button("重试", "reload")}</p>`;
  if (!ai2.data?.configured) return '<p class="review-note">服务器还没有配置 API 密钥和默认模型，AI 功能暂不可用。</p>';
  return "";
}
function evidenceLine(live3) {
  if (!live3.n_with) return live3.tagged ? `已有 ${live3.tagged} 篇用了这条，数据还没满 24 小时。` : "还没有文章标明用了这条。";
  const compare3 = live3.n_without ? `；同期没用的 ${live3.n_without} 篇：阅读 ${reads(live3.reads_without)}，点击率 ${rate2(live3.ctr_without)}` : "";
  return `用了的 ${live3.n_with} 篇：阅读中位数 ${reads(live3.reads_with)}，点击率 ${rate2(live3.ctr_with)}${compare3}。`;
}
function ruleCard(rule, ai2) {
  const working = ai2?.busy === "rule:" + rule.rule_id, canWrite = Boolean(rule.playbook.content_hash);
  const attrs = `data-rule-id="${e(rule.rule_id)}" data-playbook-id="${e(rule.playbook.id)}"${working || ai2?.busy || !canWrite ? " disabled" : ""}`;
  const trial = rule.status === "trial", live3 = rule.live;
  const actions2 = trial ? `${button("采纳", "rule-status", `data-status="kept" ${attrs}`, "btn small primary")}
      ${button("放弃", "rule-status", `data-status="dropped" ${attrs}`)}${live3.ready ? "" : '<span class="review-note">样本还少，建议先继续观察</span>'}` : `${button("同意试验", "rule-status", `data-status="trial" ${attrs}`, "btn small primary")}${button("不采纳", "rule-status", `data-status="dropped" ${attrs}`)}`;
  const progress = trial ? `<div class="review-exp-progress"><span class="review-exp-bar"><i class="review-exp-fill review-exp-fill-${Math.min(
    6,
    live3.n_with
  )}"></i></span>
      <strong>${live3.n_with}/${live3.needed} 篇</strong>${live3.ready ? '<span class="review-exp-ready">可以下结论</span>' : ""}</div>
      <p class="review-exp-evidence">${e(evidenceLine(live3))}</p>` : "";
  return `<article class="review-exp-card${trial ? " is-trial" : ""}"><p class="review-exp-text">${e(rule.text || rule.rule_id)}</p>${progress}
    <div class="review-exp-actions">${actions2}</div><span
      class="review-exp-id">${e(rule.rule_id)} · ${e(rule.playbook.account)} v${e(rule.playbook.version)}</span></article>`;
}
function renderExperiments(data3, vm2, { compact: compact2 = false } = {}) {
  const ai2 = vm2.ai, rows = enrichArticles(data3, { account: vm2.account });
  const rules2 = experiments(data3.playbooks, rows, { explicit: ai2?.data?.candidates || {} });
  const waiting = rules2.filter((rule) => rule.status === "candidate").slice(0, 8), running = rules2.filter((rule) => rule.status === "trial");
  if (compact2 && !waiting.length && !running.length) return "";
  const message = ai2?.messages?.rules;
  const group = (title, hint2, items, none) => `<div class="review-exp-group"><h3>${title} <small>${items.length} 条</small></h3>${items.length ? `<p class="review-note">${hint2}</p><div class="review-exp-list">${items.map((rule) => ruleCard(
    rule,
    ai2
  )).join("")}</div>` : `<p class="review-note">${none}</p>`}</div>`;
  return `<section class="review-exp" aria-label="小改试验"><div class="review-exp-head"><h2>小改试验</h2></div>
    ${message ? `<p class="review-ai-message${message.error ? " is-error" : ""}" role="${message.error ? "alert" : "status"}">${e(message.text)}</p>` : ""}
    ${group("待你确认", "同意后进入试验；之后的文章标明用了它，数据会自动对比。", waiting, ai2?.status === "ready" ? "没有新的小改建议。" : "正在读取…")}
    ${group("进行中的试验", `每条攒够 ${running[0]?.live.needed ?? 6} 篇有数据的文章再下结论；阅读取发布后约 24 小时。`, running, "没有进行中的试验。")}</section>`;
}
function weeklySection(vm2) {
  const ai2 = vm2.ai;
  if (!ai2 || ai2.status === "loading") return '<p class="review-note">正在读取历史周报…</p>';
  if (ai2.status === "error") return `<p class="review-ai-message is-error" role="alert">${e(ai2.error || "历史周报读取失败")} ${button("重试", "reload")}</p>`;
  const reports = ai2.data?.weekly || [];
  const body4 = (report) => `<div class="review-markdown review-weekly-body">${renderReviewMarkdown(report.summary_md || "")}</div>
    <p class="review-note">${e(report.period_start)} 至 ${e(report.period_end)} · ${e(report.model || "")}${report.effort ? " · 强度" + e(AI_EFFORT_LABELS.find(([id2]) => id2 === report.effort)?.[1] || "") : ""}</p>`;
  return `<details class="review-ai-block review-weekly-old"><summary>历史周报</summary>
    <p class="review-note">独立周报已停止生成，日常汇报与决策请在这里查看。</p>${reports.length ? reports.map((report) => `<details
      class="review-weekly-old"><summary>${e(report.period_start)} 至 ${e(report.period_end)}</summary>${body4(report)}</details>`).join("") : '<p class="review-note">暂无历史周报。</p>'}</details>`;
}
function patternSection(data3, vm2) {
  const ai2 = vm2.ai, gate = unavailable(ai2), rows = enrichArticles(data3, { account: vm2.account });
  const labels4 = ai2?.data?.titles || {}, stats2 = patternStats(rows, labels4), pending = ai2?.data?.pending?.titles || 0, names = namesOf(data3);
  const article = (item) => `<li><a class="review-title-button" href="?${e(new URLSearchParams({
    page: "review",
    account: vm2.account,
    review_section: "articles",
    review_article: item.id
  }))}">${e(item.title || "未命名文章")}</a>
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
  const table2 = stats2.length ? `<div class="review-pattern-list">${stats2.map(block).join("")}</div>
    <p class="review-note">每个套路下面的“例”是其中阅读最高的一篇，点开可以看全部文章。只统计有 24 小时数据的文章；少于 3 篇的套路仅供参考。</p>` : '<p class="review-note">还没有归类好的标题。</p>';
  return `<section class="review-ai-block" aria-label="标题套路"><div class="review-ai-head"><h2>标题套路</h2>
    <span class="review-note">${pending ? `${pending} 篇还没归类` : "全部已归类"}</span></div>
    ${gate || (pending ? runControls(ai2, "titles", `归类 ${Math.min(pending, 60)} 篇`) : "")}${notice(ai2, "titles")}${table2}</section>`;
}
function renderReportReview(data3, vm2) {
  return `<div class="review-weekly-page">${weeklySection(vm2)}</div>`;
}
function benchmarkAiBar(vm2) {
  const ai2 = vm2.ai, gate = unavailable(ai2), pending = ai2?.data?.pending?.benchmarks || 0;
  return `<div class="review-ai-block review-ai-bar"><div class="review-ai-head"><h2>爆文拆解</h2>
    <span class="review-note">${gate ? "" : pending ? `${pending} 篇还没拆解 · 只根据标题和阅读量` : "全部已拆解 · 只根据标题和阅读量"}</span></div>
    ${gate || (pending ? runControls(ai2, "benchmarks", `拆解 ${Math.min(pending, 30)} 篇`) : "")}${notice(ai2, "benchmarks")}</div>`;
}
function renderBenchmarkBreakdown(data3, vm2) {
  const notes = vm2.ai?.data?.benchmarks || {}, accounts = new Map((data3.benchmarkAccounts || []).map((item) => [String(item.id), item.name]));
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
  const list3 = items.map((item) => {
    const url = safe(item.url), title = e(item.title || "未命名文章");
    return `<li class="review-breakdown-item"><div class="review-breakdown-title">${url ? `<a href="${e(url)}" target="_blank"
      rel="noopener noreferrer">${title}</a>` : title}
      <span class="review-note">${e(accounts.get(String(item.benchmark_account_id)) || "")} · 阅读 ${e(reads(item.reads))}${used.has(String(item.id)) ? " · 已仿写" : ""}</span></div>
      ${benchmarkAiNote(vm2, item.id)}</li>`;
  }).join("");
  return `${benchmarkAiBar(vm2)}${list3 ? `<ul class="review-breakdown-list">${list3}</ul>` : ""}`;
}
function benchmarkAiNote(vm2, id2) {
  const note = vm2.ai?.data?.benchmarks?.[id2];
  if (!note) return "";
  const part = (label, value) => value ? `<span><b>${label}</b>${e(value)}</span>` : "";
  return `<div class="review-ai-note">${part("套路", note.pattern)}${part("钩子", note.hook)}${part("题材", note.topic)}${part("可套用", note.template)}</div>`;
}
function titlePattern(vm2, row, data3) {
  const own3 = row.title_pattern, label = own3 || vm2.ai?.data?.titles?.[row.id], names = namesOf(data3);
  const shown2 = names.has(label) ? names.get(label) : label, origin = own3 ? "已登记的标题套路" : "AI 归类";
  return label ? `<span class="review-pattern-tag${own3 ? "" : " is-ai"}" title="${e(origin + (shown2 === label ? "" : "：" + label))}">${e(shown2)}</span>` : "";
}
function smallHint(chosen, models) {
  if (chosen === "off" || chosen && SMALL_MODEL.test(chosen)) return "";
  const pick = models.find((id2) => SMALL_MODEL.test(id2));
  return pick ? ` 建议选小模型，比如 ${e(pick)}，更快也更省。` : " 建议选名字带 mini 的小模型，更快也更省。";
}
function renderAiSettings(ai2) {
  if (!ai2 || ai2.status === "loading") return '<section id="ai-settings" class="ai-settings"><p role="status">正在读取 AI 设置…</p></section>';
  if (ai2.status === "error") return `<section id="ai-settings" class="ai-settings"><p role="alert">${e(ai2.error || "读取失败")}</p>${button(
    "重试",
    "reload"
  )}</section>`;
  const data3 = ai2.data, draft = ai2.draft || data3.settings, models = ai2.models || [];
  const modelSelect = (feature, value) => {
    const list3 = [.../* @__PURE__ */ new Set([...value && value !== "off" ? [value] : [], ...models])];
    const off = feature === "todo" ? `<option value="off"${value === "off" ? " selected" : ""}>关闭（按原文添加）</option>` : "";
    return `<select class="input" data-ai-setting="model" data-ai-feature="${feature}" aria-label="${AI_FEATURE_LABELS[feature]}的模型">
      <option value="">服务器默认${data3.default_model ? `（${e(data3.default_model)}）` : ""}</option>${list3.map((id2) => `<option value="${e(id2)}"${id2 === value ? " selected" : ""}>${e(id2)}</option>`).join("")}${off}</select>`;
  };
  const effortSelect = (feature, value) => `<select class="input" data-ai-setting="effort" data-ai-feature="${feature}"
    aria-label="${AI_FEATURE_LABELS[feature]}的强度">
    ${AI_EFFORT_LABELS.map(([id2, label]) => `<option value="${id2}"${id2 === value ? " selected" : ""}>${label}</option>`).join("")}</select>`;
  const rows = AI_FEATURES_SHOWN.filter(([feature]) => draft.features[feature]).map(([feature, note]) => `<tr><th scope="row">${AI_FEATURE_LABELS[feature]}
    <span class="ai-feature-note">${e(note)}${feature === "todo" ? smallHint(draft.features.todo.model, models) : ""}</span></th>
    <td data-label="模型">${modelSelect(feature, draft.features[feature].model)}</td><td data-label="强度">${effortSelect(
    feature,
    draft.features[feature].effort
  )}</td></tr>`).join("");
  const status = { succeeded: "成功", failed: "失败", running: "进行中" };
  const time3 = (value) => value ? new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value)) : "";
  const runs = (data3.runs || []).map((run) => `<tr><td>${e(time3(run.started_at))}</td><td>${e(AI_FEATURE_LABELS[run.feature] || run.feature)}</td><td>${e(run.model || "")}${run.effort ? " · " + e(run.effort) : ""}</td>
    <td class="${run.status === "failed" ? "ai-run-failed" : ""}">${status[run.status] || run.status}${run.effort_ignored ? "（该模型不支持强度，已忽略）" : ""}${run.message ? "：" + e(run.message) : ""}</td>
    <td>${known(run.input_tokens) ? `${run.input_tokens} / ${run.output_tokens ?? "—"}` : "—"}</td></tr>`).join("");
  const message = ai2.messages?.settings;
  return `<section id="ai-settings" class="ai-settings" aria-label="AI 设置">
    ${data3.configured ? "" : '<p role="alert">服务器还没有配置 API 密钥和默认模型。密钥只保存在服务器后台，不会出现在网页里。</p>'}
    <form id="ai-settings-form"><h2>每个功能用哪个模型</h2>
    <p class="ai-default-model">默认模型：<b>${e(data3.default_model || "未设置")}</b><span class="muted">没单独选的功能都用它；它在服务器后台设置。</span></p>
    <div class="ai-settings-table-wrap"><table class="ai-settings-table"><thead><tr><th>功能</th><th>模型</th><th>强度</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="muted">${ai2.modelsError ? e(ai2.modelsError) : models.length ? "模型列表来自你的 API 账号。强度只对支持推理强度的模型有效，不支持时会自动忽略。" : "正在读取模型列表…"}</p>
    <label class="ai-settings-limit">每日最多调用次数<input class="input" type="number" min="0" max="200" step="1" inputmode="numeric"
      data-ai-setting="daily_limit" value="${draft.daily_limit}"></label>
    <p class="muted">今天已用 ${data3.usage.used} / ${data3.usage.limit} 次。到上限后当天不再调用；单篇文章分析另有每天 20 篇的上限。</p>
    <div class="form-actions"><button class="btn primary" type="submit"${ai2.busy === "settings" || !ai2.dirty ? " disabled" : ""}>${ai2.busy === "settings" ? "正在保存…" : "保存"}</button>
    <span role="${message?.error ? "alert" : "status"}" class="${message?.error ? "ai-run-failed" : "muted"}">${e(message?.text || (ai2.dirty ? "有未保存的修改" : ""))}</span></div></form>
    <h2>最近运行</h2>${runs ? `<div class="ai-settings-table-wrap"><table
      class="ai-runs-table"><thead><tr><th>时间</th><th>功能</th><th>模型</th><th>结果</th><th>输入 / 输出 token</th></tr></thead><tbody>${runs}</tbody></table></div>
    <p class="muted">这里显示 token 用量；折合金额请以 OpenAI 后台账单为准。</p>` : '<p class="muted">最近三天没有运行记录。</p>'}</section>`;
}

// web/review-ai-controller.mjs
init_api();
var ai = { status: "idle", messages: {} }, account = "", ticket = 0;
var listeners = /* @__PURE__ */ new Set();
var emit = () => {
  for (const listener of listeners) listener();
};
var request = (path, options3 = {}) => apiNetwork(path, { ...options3, suppressAuthRedirect: true });
var reviewAiView = () => ai;
function watchReviewAi(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function resetReviewAi() {
  ticket++;
  ai = { status: "idle", messages: {} };
  account = "";
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
  } catch (error2) {
    if (current3 !== ticket) return;
    ai = quiet ? ai : { ...ai, status: "error", error: error2.message || "AI 结果读取失败" };
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
  } catch (error2) {
    ai = { ...ai, models: [], modelsLoading: false, modelsError: error2.message || "模型列表读取失败，可稍后再试" };
  }
  emit();
}
function loadReviewAiModels() {
  return loadModels();
}
var say = (key, text, error2 = false) => {
  ai = { ...ai, messages: { ...ai.messages, [key]: text ? { text, error: error2 } : null } };
};
var done2 = {
  titles: (data3) => data3.labelled ? `已归类 ${data3.labelled} 篇${data3.remaining ? `，还剩 ${data3.remaining} 篇` : ""}。` : "没有需要归类的标题。",
  benchmarks: (data3) => data3.done ? `已拆解 ${data3.done} 篇${data3.remaining ? `，还剩 ${data3.remaining} 篇` : ""}。` : "没有需要拆解的爆文。"
};
async function runFeature(feature, once = {}) {
  if (ai.busy || !done2[feature]) return;
  ai = { ...ai, busy: feature, options: "" };
  say(feature, "");
  emit();
  try {
    const body4 = { account, ...once.model ? { model: once.model } : {}, ...once.effort ? { effort: once.effort } : {} };
    const result = await request("/review/ai/" + feature, { method: "POST", body: body4 });
    say(feature, done2[feature](result));
  } catch (error2) {
    say(feature, error2.message || "没有完成，请稍后重试。", true);
  }
  ai = { ...ai, busy: "", once: {} };
  await loadReviewAi(account, { force: true });
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
  } catch (error2) {
    say("rules", error2.status === 409 ? "规则刚刚被更新过，已重新读取，请再点一次。" : error2.message || "没有保存，请重试。", true);
    if (error2.status === 409) context.reload?.();
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
  } catch (error2) {
    say("settings", error2.message || "保存失败，请重试", true);
  }
  ai = { ...ai, busy: "" };
  emit();
}

// web/experiments-panel-controller.mjs
init_state();
var data = null, sequence2 = 0, registered = false, panelError = false;
var account2 = () => state.account || "V字";
var root = () => document.querySelector("#ai-experiments");
function paint2() {
  const node3 = root();
  if (!node3 || state.page !== "ai-reports") return;
  node3.innerHTML = data ? renderReportReview(data, { account: account2(), ai: reviewAiView() }) : panelError ? '<p role="alert">复盘资料读取失败。 <button type="button" class="btn small" data-retry-review>重试</button></p>' : '<p role="status">正在读取复盘资料…</p>';
}
function register() {
  if (registered) return;
  registered = true;
  watchReviewAi(paint2);
  document.addEventListener("change", (event) => {
    if (state.page === "ai-reports" && event.target.closest?.("#ai-experiments")) reviewAiInput(event.target);
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#ai-experiments [data-retry-review]")) {
      void loadExperimentsPanel();
      return;
    }
    const target = event.target.closest?.("#ai-experiments [data-ai-action]");
    if (!target || state.page !== "ai-reports" || !data) return;
    reviewAiClick(target, {
      account: account2(),
      playbooks: () => data.playbooks,
      reload: () => void loadExperimentsPanel(),
      applyPlaybook: (saved) => {
        data = { ...data, playbooks: data.playbooks.map((item) => String(item.id) === String(saved.id) ? { ...item, ...saved } : item) };
      }
    });
  });
}
async function loadExperimentsPanel() {
  register();
  const ticket2 = ++sequence2, session = runtime.sessionEpoch;
  data = null;
  panelError = false;
  paint2();
  void loadReviewAi(account2());
  const current3 = () => ticket2 === sequence2 && session === runtime.sessionEpoch && state.page === "ai-reports";
  data = {};
  if (current3()) paint2();
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
function finiteNumber2(value) {
  if (typeof value !== "number" && typeof value !== "string" || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number3 = Number(value);
  return Number.isFinite(number3) ? number3 : null;
}
function calendarDate2(date2) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date2)) return "";
  const stamp4 = Date.parse(`${date2}T00:00:00Z`);
  return Number.isFinite(stamp4) && new Date(stamp4).toISOString().slice(0, 10) === date2 ? date2 : "";
}
var shanghaiClock = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function shanghaiParts(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !calendarDate2(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59 || match[6] !== "Z" && (Number(match[6].slice(1, 3)) > 23 || Number(match[6].slice(4, 6)) > 59)) return null;
  const stamp4 = Date.parse(value);
  if (!Number.isFinite(stamp4)) return null;
  return Object.fromEntries(shanghaiClock.formatToParts(stamp4).map((part) => [part.type, part.value]));
}
function day7(value) {
  if (typeof value !== "string") return "";
  if (calendarDate2(value)) return value;
  const parts2 = shanghaiParts(value);
  return parts2 ? calendarDate2(`${parts2.year.padStart(4, "0")}-${parts2.month}-${parts2.day}`) : "";
}
function reviewDateTime2(value) {
  if (typeof value !== "string") return "";
  if (calendarDate2(value)) return value;
  const parts2 = shanghaiParts(value), date2 = day7(value);
  return parts2 && date2 ? `${date2} ${parts2.hour}:${parts2.minute}` : "";
}
function shiftDay4(value, amount) {
  const date2 = day7(value);
  if (!date2 || !Number.isFinite(amount)) return "";
  return new Date(Date.parse(`${date2}T00:00:00Z`) + amount * 864e5).toISOString().slice(0, 10);
}
function list2(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
}
function object3(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function rules(value) {
  return list2(parseJson(value, [])).filter((rule) => rule && typeof rule === "object" && typeof rule.rule_id === "string");
}
function normalizeReviewData(input = {}) {
  return {
    benchmarkAccounts: list2(input.benchmarkAccounts || input["benchmark-accounts"]).filter(Boolean),
    benchmarkArticles: list2(input.benchmarkArticles || input["benchmark-articles"]).filter(Boolean),
    notes: list2(input.notes).filter(Boolean),
    accountHealth: list2(input.accountHealth || input["account-health"]).filter(Boolean),
    articles: list2(input.articles).filter(Boolean).map((article) => ({ ...article, image_count: finiteNumber2(article.image_count) })),
    snapshots: list2(input.snapshots).filter(Boolean).map((snapshot) => {
      const normalized = { ...snapshot };
      for (const field2 of SNAPSHOT_NUMBERS) normalized[field2] = finiteNumber2(snapshot[field2]);
      for (const field2 of SNAPSHOT_JSON) normalized[field2] = parseJson(snapshot[field2]);
      return normalized;
    }),
    reports: list2(input.reports).filter(Boolean).map((report) => ({
      ...report,
      verdicts: object3(parseJson(report.verdicts, {})),
      findings: object3(parseJson(report.findings, {})),
      metrics: object3(parseJson(report.metrics, {}))
    })),
    prompts: list2(input.prompts || input["prompts/current"]).filter(Boolean),
    playbooks: list2(input.playbooks).filter(Boolean).map((playbook2) => ({ ...playbook2, rules: rules(playbook2.rules) }))
  };
}
function latestSnapshots(snapshots = [], cutoff = "9999-12-31") {
  const result = /* @__PURE__ */ new Map();
  for (const snapshot of list2(snapshots)) {
    const date2 = day7(snapshot.snapshot_date);
    if (!date2 || date2 > cutoff || snapshot.article_id === null || snapshot.article_id === void 0) continue;
    const key = String(snapshot.article_id);
    const previous = result.get(key);
    if (!previous || date2 > day7(previous.snapshot_date) || date2 === day7(previous.snapshot_date) && String(snapshot.id || "") > String(previous.id || "")) result.set(key, snapshot);
  }
  return result;
}
function verdictMap(reports = [], { end = "9999-12-31", periodType } = {}) {
  const result = /* @__PURE__ */ new Map();
  const ordered2 = list2(reports).filter((report) => (!periodType || report.period_type === periodType) && day7(report.period_end) && day7(report.period_end) <= end).sort((a, b) => day7(a.period_end).localeCompare(day7(b.period_end)) || String(a.id || "").localeCompare(String(b.id || "")));
  for (const report of ordered2) {
    for (const [id2, raw] of Object.entries(object3(parseJson(report.verdicts, {})))) {
      const entry = typeof raw === "string" ? { verdict: raw } : object3(raw);
      if (!["爆", "中", "扑"].includes(entry.verdict)) continue;
      result.set(String(id2), { verdict: entry.verdict, reason: typeof entry.reason === "string" ? entry.reason : "", report_id: report.id });
    }
  }
  return result;
}
function articleRows(data3 = {}, { start = "", end = "9999-12-31", periodType } = {}) {
  const snapshots = latestSnapshots(data3.snapshots, end);
  const verdicts2 = verdictMap(data3.reports, { end, periodType });
  return list2(data3.articles).filter((article) => {
    const published = day7(article.published_at);
    return published && (!start || published >= start) && published <= end;
  }).map((article) => ({
    ...article,
    snapshot: snapshots.get(String(article.id)) || null,
    verdict: verdicts2.get(String(article.id))?.verdict || "",
    reason: verdicts2.get(String(article.id))?.reason || ""
  })).sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)) || String(a.id).localeCompare(String(b.id)));
}
function aggregate(rows = []) {
  const result = { count: rows.length, hits: 0, flops: 0, judged_count: 0, hit_rate: null, coverage: {}, partial: {} };
  for (const field2 of [...SUM_FIELDS, ...AVG_FIELDS]) {
    const values = rows.map((row) => finiteNumber2(row.snapshot?.[field2])).filter((value) => value !== null);
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
    const now = finiteNumber2(current3[field2]);
    const before = finiteNumber2(previous[field2]);
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
  const duration3 = day7(start) && day7(end) ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 864e5) + 1 : 0;
  const previousEnd = duration3 > 0 ? shiftDay4(start, -1) : "";
  const previousStart = duration3 > 0 ? shiftDay4(start, -duration3) : "";
  const rows = articleRows(data3, { start, end, periodType });
  const previousRows = duration3 > 0 ? articleRows(data3, { start: previousStart, end: previousEnd, periodType }) : [];
  const current3 = aggregate(rows), previous = aggregate(previousRows);
  return { start, end, previousStart, previousEnd, rows, previousRows, current: current3, previous, changes: compareMetrics(current3, previous) };
}
function dailySummary(data3, date2) {
  const previousDate = shiftDay4(date2, -1);
  const result = periodSummary(data3, { start: date2, end: date2, periodType: "daily" });
  const recentRows = articleRows(data3, { start: shiftDay4(date2, -2), end: date2 });
  const previousRecentRows = articleRows(data3, { start: shiftDay4(date2, -3), end: previousDate });
  const recent = aggregate(recentRows), previousRecent = aggregate(previousRecentRows);
  const stats2 = { published_count: result.current.count, total_reads: result.current.reads, average_ctr: result.current.ctr, recent_hits: recent.hits };
  const previousStats = { published_count: result.previous.count, total_reads: result.previous.reads, average_ctr: result.previous.ctr, recent_hits: previousRecent.hits };
  return { ...result, date: date2, previousDate, recentRows, stats: stats2, previousStats, statChanges: compareMetrics(stats2, previousStats) };
}
function groupPerformance(rows = [], field2 = "topic_category") {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = typeof row[field2] === "string" && row[field2].trim() ? row[field2] : "未分类";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([name, members]) => {
    const summary3 = aggregate(members);
    return { name, ...summary3, average_reads: summary3.coverage.reads ? summary3.reads / summary3.coverage.reads : null, rows: members };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
function dailySeries(data3 = {}, { start = "", end = "9999-12-31" } = {}) {
  const dates = [...new Set(list2(data3.snapshots).map((snapshot) => day7(snapshot.snapshot_date)).filter((date2) => date2 && date2 >= start && date2 <= end))].sort();
  const articles = new Map(list2(data3.articles).map((article) => [String(article.id), article]));
  return dates.map((date2) => {
    const sameDay = list2(data3.snapshots).filter((snapshot) => day7(snapshot.snapshot_date) === date2);
    const snapshots = latestSnapshots(sameDay, date2);
    const rows = [...snapshots.entries()].filter(([id2]) => articles.has(id2)).map(([id2, snapshot]) => ({ ...articles.get(id2), snapshot }));
    return { date: date2, ...aggregate(rows) };
  });
}
function diffRules(previous, current3) {
  const before = new Map(rules(previous?.rules ?? previous).map((rule) => [rule.rule_id, rule]));
  const after = new Map(rules(current3?.rules ?? current3).map((rule) => [rule.rule_id, rule]));
  const added = [], removed4 = [], unchanged2 = [], changed2 = [];
  for (const [id2, rule] of before) {
    const next = after.get(id2);
    if (!next) removed4.push(rule);
    else if (String(rule.text || "") !== String(next.text || "") || String(rule.section || "") !== String(next.section || "")) {
      removed4.push(rule);
      added.push(next);
      changed2.push({ before: rule, after: next });
    } else unchanged2.push(next);
  }
  for (const [id2, rule] of after) if (!before.has(id2)) added.push(rule);
  return { added, removed: removed4, unchanged: unchanged2, changed: changed2 };
}
function metricDiscrepancies(report = {}, computed = {}) {
  const metrics2 = object3(parseJson(report.metrics, {}));
  const aliases2 = {
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
    const field2 = aliases2[key] || key;
    const authorValue = finiteNumber2(value), calculated = finiteNumber2(computed[field2]);
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
  for (const report of list2(data3.reports)) {
    if (report.period_type !== type) continue;
    const start = day7(report.period_start), end = day7(report.period_end);
    if (!start || !end || start > end) continue;
    periods.set(`${start}/${end}`, { start, end, label: start === end ? end : `${start} — ${end}`, report });
  }
  if (!periods.size) {
    const dates = [...new Set([...list2(data3.snapshots).map((snapshot) => day7(snapshot.snapshot_date)), ...list2(data3.articles).map((article) => day7(article.published_at))].filter(Boolean))].sort().reverse();
    const duration3 = type === "weekly" ? 7 : type === "three_day" ? 3 : 1;
    for (const end of dates) {
      const start = shiftDay4(end, -(duration3 - 1));
      periods.set(`${start}/${end}`, { start, end, label: start === end ? end : `${start} — ${end}`, report: null });
    }
  }
  return [...periods.values()].sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start));
}

// web/pages/review-weekly.mjs
init_dom();
var day8 = (date2) => /^\d{4}-\d{2}-\d{2}$/.test(String(date2)) ? `${Number(date2.slice(5, 7))}月${Number(date2.slice(8))}日` : String(date2 ?? "");
var range = (report) => `${day8(report.period_start)} 至 ${day8(report.period_end)}`;
function currentWeekStart(now) {
  const today2 = day7(now || (/* @__PURE__ */ new Date()).toISOString());
  if (!today2) return "";
  const weekday2 = (/* @__PURE__ */ new Date(`${today2}T00:00:00Z`)).getUTCDay();
  const offset = weekday2 === 0 ? -6 : 1 - weekday2;
  return shiftDay4(today2, offset);
}
function weeklyReviews(reports = [], account3) {
  return reports.filter((report) => report && report.period_type === "weekly" && report.account === account3 && !report.deleted_at).sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)) || String(b.created_at).localeCompare(String(a.created_at)));
}
function weeklyPreview(markdown) {
  const line = String(markdown ?? "").split(/\r?\n/).map((text) => text.trim()).find((text) => text && !/^#{1,6}\s/.test(text)) || "";
  const plain3 = line.replace(/[*_`>#]/g, "").replace(/^[-\d.、\s]+/, "").trim();
  return plain3.length > 90 ? plain3.slice(0, 90) + "…" : plain3;
}
var body3 = (report) => `<div class="review-markdown review-weekly-body">${renderReviewMarkdown(report.summary_md || "")}</div>`;
function renderWeeklyReview(data3, vm2) {
  const [latest2, ...older] = weeklyReviews(data3.reports, vm2.account);
  if (!latest2) return "";
  const weekStart2 = currentWeekStart(vm2.now);
  const isCurrentWeek = weekStart2 && String(latest2.period_end || "") >= weekStart2;
  const heading = isCurrentWeek ? "本周复盘" : "上周复盘";
  const pendingBadge = isCurrentWeek ? "" : '<span class="review-weekly-badge">本周周报待周日生成</span>';
  const earlier = older.length ? `<details class="review-weekly-older"><summary>往期周复盘（${older.length} 份）</summary><div class="review-weekly-tl">${older.map((report) => `<details class="review-weekly-week"><summary><span class="review-weekly-date">${e(range(report))}</span><span class="review-weekly-preview">${e(weeklyPreview(report.summary_md))}</span></summary>${body3(report)}</details>`).join("")}</div></details>` : "";
  return `<section class="review-weekly" aria-label="周复盘"><div class="review-weekly-latest"><div class="review-weekly-head"><h3 class="review-weekly-title">${e(heading)}</h3><span class="review-weekly-date">${e(range(latest2))}</span>${pendingBadge}</div>${body3(latest2)}${earlier}</div></section>`;
}

// web/ai-reports-controller.mjs
init_api();
init_state();
init_daily_notes_state();
var AI_DAILY_TABS = Object.freeze(["reports", "weekly"]);
var sequence3 = 0, registered2 = false, selectedDate = "", visibleMonth = "", pageSession = null;
var allReports = null, openReportDay = "";
function selectDailyTab(name) {
  if (name === "reminders") name = "reports";
  if (!AI_DAILY_TABS.includes(name)) return;
  state.aiDailyTab = name;
  const root3 = document.querySelector("#ai-reports");
  if (!root3) return;
  root3.dataset.aiTab = name;
  for (const button2 of root3.querySelectorAll("[data-ai-daily-tab]"))
    button2.setAttribute("aria-pressed", String(button2.dataset.aiDailyTab === name));
  for (const panel2 of root3.querySelectorAll("[data-ai-daily-panel]"))
    panel2.hidden = panel2.dataset.aiDailyPanel !== name;
  if (name === "weekly") void loadWeekly();
}
var weeklyRead = null;
async function readAllReviewReports(current3) {
  const items = [];
  for (let offset = 0; ; offset += 100) {
    const data3 = await api("/review/reports?offset=" + offset);
    if (!current3()) return null;
    if (!Array.isArray(data3?.items) || typeof data3.has_more !== "boolean") throw new Error("周报读取不完整，请稍后重试。");
    items.push(...data3.items);
    if (!data3.has_more || !data3.items.length) return items;
  }
}
async function loadWeekly() {
  const root3 = document.querySelector("#ai-reports");
  const box = root3?.querySelector("#ai-weekly-list"), status = root3?.querySelector("#ai-weekly-status");
  if (!box || weeklyRead?.session === runtime.sessionEpoch && weeklyRead.loaded) return;
  const session = runtime.sessionEpoch, current3 = () => session === runtime.sessionEpoch && state.page === "ai-reports";
  weeklyRead = { session, loaded: false };
  status.textContent = "正在读取周报…";
  try {
    const reports = await readAllReviewReports(current3);
    if (!reports || !current3()) return;
    const html = renderWeeklyReview({ reports }, { account: state.account || "V字", now: (/* @__PURE__ */ new Date()).toISOString() });
    const live3 = document.querySelector("#ai-reports #ai-weekly-list");
    if (!live3) return;
    live3.innerHTML = html;
    document.querySelector("#ai-reports #ai-weekly-status").textContent = html ? "" : "还没有周报，小小鱼每周日写。";
    weeklyRead.loaded = true;
  } catch (error2) {
    weeklyRead = null;
    if (current3()) document.querySelector("#ai-reports #ai-weekly-status").textContent = error2.message || "周报读取失败，请稍后重试。";
  }
}
function aiReportsYesterday(today2 = dailyNotesToday()) {
  const date2 = /* @__PURE__ */ new Date(today2 + "T00:00:00Z");
  date2.setUTCDate(date2.getUTCDate() - 1);
  return date2.toISOString().slice(0, 10);
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
function reportsForDailyDate(items, date2) {
  return sortAiReports(items.filter((row) => reportDay(row) === aiReportsYesterday(date2)));
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
  const session = runtime.sessionEpoch;
  if (pageSession !== session || resetDate) {
    pageSession = session;
    allReports = null;
    openReportDay = "";
    weeklyRead = null;
    selectedDate = validDailyNotesDate(state.aiDailyDate) ? state.aiDailyDate : dailyNotesToday();
    visibleMonth = selectedDate.slice(0, 7);
  }
  if (!selectedDate) selectedDate = dailyNotesToday();
  if (!visibleMonth) visibleMonth = selectedDate.slice(0, 7);
  const ticket2 = ++sequence3, date2 = selectedDate;
  const current3 = () => ticket2 === sequence3 && session === runtime.sessionEpoch && state.page === "ai-reports";
  if (!allReports) paintAiReportTimeline([], visibleMonth, { loading: true });
  paintAiDailyReminders(null, "", true);
  selectDailyTab(state.aiDailyTab || "reports");
  const report = readAllAiReports(api, current3).then((items) => {
    if (current3() && items) {
      allReports = items;
      paintReports();
    }
  }).catch((error2) => {
    if (current3()) paintAiReportTimeline([], visibleMonth, { error: error2.message || "读取失败，请稍后重试。" });
  });
  const reminders = api("/work-reminders?date=" + encodeURIComponent(date2)).then((data3) => {
    if (current3()) paintAiDailyReminders(data3);
  }).catch((error2) => {
    if (current3()) paintAiDailyReminders(null, error2.message || "提醒读取失败，请稍后重试");
  });
  void loadExperimentsPanel();
  await Promise.all([report, reminders]);
}
async function loadDecisionHistory(button2) {
  const base = selectedDate || dailyNotesToday(), session = runtime.sessionEpoch;
  const dates = Array.from({ length: 7 }, (_, index) => new Date(Date.parse(base + "T00:00:00Z") - (index + 1) * 864e5).toISOString().slice(0, 10));
  if (button2.dataset.loaded === "1" || button2.closest("details")?.open) return;
  button2.dataset.loaded = "1";
  paintDecisionHistory([], { loading: true });
  try {
    const days = await Promise.all(dates.map((date2) => api("/work-reminders?date=" + encodeURIComponent(date2)).then((data3) => ({ date: date2, items: data3.items || [] }))));
    if (session === runtime.sessionEpoch) paintDecisionHistory(days);
  } catch (error2) {
    if (session === runtime.sessionEpoch) {
      delete button2.dataset.loaded;
      paintDecisionHistory([], { error: error2.message || "读取失败，请稍后再试" });
    }
  }
}
function paintReports() {
  if (!allReports) return;
  const root3 = document.querySelector("#ai-reports");
  root3?.classList.toggle("ai-report-day-open", Boolean(openReportDay));
  if (!openReportDay) {
    paintAiReportDayHead("");
    paintAiReportTimeline(allReports, visibleMonth);
    return;
  }
  paintAiReports(sortAiReports(allReports.filter((row) => reportShownDay(row) === openReportDay)), "", false, selectedDate, visibleMonth);
  paintAiReportDayHead(openReportDay);
}
function moveMonth(offset) {
  const d = /* @__PURE__ */ new Date(visibleMonth + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + offset);
  if (!Number.isFinite(d.getTime())) return;
  const next = d.toISOString().slice(0, 7);
  if (validDailyNotesDate(next + "-01")) {
    visibleMonth = next;
    openReportDay = "";
    paintAiCalendar(selectedDate, visibleMonth);
    paintReports();
  }
}
function registerAiReportEvents() {
  if (registered2) return;
  registered2 = true;
  document.addEventListener("click", (event) => {
    if (state.page !== "ai-reports") return;
    const tab = event.target.closest?.("[data-ai-daily-tab]")?.dataset.aiDailyTab;
    if (tab) {
      selectDailyTab(tab);
      updateRoute();
    } else if (event.target.closest?.("[data-openai-diary-refresh]")) void loadAiReports();
    else if (event.target.closest?.("[data-ai-decision-history]")) void loadDecisionHistory(event.target.closest("[data-ai-decision-history]"));
    else if (event.target.closest?.("[data-ai-report-month]")) moveMonth(Number(event.target.closest("[data-ai-report-month]").dataset.aiReportMonth));
    else if (event.target.closest?.("[data-ai-report-open],[data-ai-report-back]")) {
      openReportDay = event.target.closest("[data-ai-report-open]")?.dataset.aiReportOpen || "";
      paintReports();
      document.querySelector("#ai-report-dayhead")?.scrollIntoView?.({ block: "nearest" });
    } else {
      const day9 = event.target.closest?.("[data-ai-report-select]")?.dataset.aiReportSelect;
      if (day9 && validDailyNotesDate(day9)) {
        selectedDate = day9;
        visibleMonth = day9.slice(0, 7);
        state.aiDailyDate = day9;
        updateRoute();
        void loadAiReports();
      }
    }
  });
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
  const latest2 = /* @__PURE__ */ new Map(), scopes = applicableScopes(account3);
  for (const book of [...books].filter((book2) => book2.status === "active").sort(newest)) {
    const scope = scopeOf(book.account);
    if (!latest2.has(scope)) latest2.set(scope, book);
  }
  const current3 = [...latest2.values()].map((book) => ({
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
  const scopes = applicableScopes(account3), latest2 = /* @__PURE__ */ new Map();
  for (const prompt of [...prompts].filter((prompt2) => prompt2.status === "active" && scopes.includes(prompt2.scope)).sort(newest)) {
    const key = `${prompt.scope}:${prompt.prompt_key}`;
    if (!latest2.has(key)) latest2.set(key, prompt);
  }
  return [...latest2.values()].sort((a, b) => scopes.indexOf(a.scope) - scopes.indexOf(b.scope) || String(a.prompt_key).localeCompare(String(b.prompt_key)));
}

// web/pages/review-traffic-card.mjs
init_dom();
var valid2 = (value, max = Infinity) => {
  const n = finiteNumber2(value);
  return n !== null && n >= 0 && n <= max ? n : null;
};
var count = (value) => {
  const n = valid2(value);
  return n === null ? "—" : n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
};
var percent = (value) => {
  const n = valid2(value, 100);
  return n === null ? "—" : `${n.toFixed(1)}%`;
};
var duration2 = (value) => {
  const n = valid2(value);
  if (n === null) return "—";
  const seconds = Math.round(n);
  return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
};
var money = (value) => {
  const n = valid2(value);
  return n === null ? "—" : `¥${n.toFixed(2)}`;
};
var scaleOf = (values) => {
  const numbers = values.map(finiteNumber2).filter((n) => n !== null && n >= 0);
  return numbers.length && numbers.every((n) => n <= 1) ? 100 : 1;
};
var pct = (value, scale2) => {
  const n = finiteNumber2(value);
  if (n === null || n < 0) return null;
  const scaled = n * scale2;
  return scaled <= 100 ? scaled : null;
};
function trafficSourceList(value) {
  if (!value || typeof value !== "object") return [];
  const pairs = Array.isArray(value) ? value.map((item) => [item?.name, item?.rate ?? item?.value]) : Object.entries(value);
  const scale2 = scaleOf(pairs.map(([, rate3]) => rate3));
  return pairs.map(([name, rate3]) => [typeof name === "string" ? name.trim() : "", pct(rate3, scale2)]).filter(([name, rate3]) => name && rate3 !== null).sort((a, b) => b[1] - a[1]);
}
function completionCurvePoints(value) {
  if (!Array.isArray(value)) return [];
  const raw = value.map((item) => Array.isArray(item) ? [item[0], item[1]] : [item?.at ?? item?.read_rate ?? item?.x, item?.remain ?? item?.jump_rate ?? item?.y]);
  const xScale = scaleOf(raw.map(([x]) => x)), yScale = scaleOf(raw.map(([, y]) => y));
  const points = raw.map(([x, y]) => [pct(x, xScale), pct(y, yScale)]).filter(([x, y]) => x !== null && y !== null).sort((a, b) => a[0] - b[0]);
  return points.length >= 2 ? points : [];
}
function remainAt(points, at) {
  let best = null;
  for (const point of points) if (!best || Math.abs(point[0] - at) < Math.abs(best[0] - at)) best = point;
  return best ? best[1] : null;
}
function curveSection(points) {
  if (!points.length) return "";
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${(100 - y).toFixed(1)}`).join(" ");
  const early = remainAt(points, 10), half = remainAt(points, 50), end = points[points.length - 1][1];
  const facts = [
    early !== null ? `读到 10% 已走 <b>${(100 - early).toFixed(0)}%</b>` : "",
    half !== null ? `读到一半还剩 <b>${half.toFixed(0)}%</b>` : "",
    `读到结尾还剩 <b>${end.toFixed(0)}%</b>`
  ].filter(Boolean).join('<span aria-hidden="true">·</span>');
  return `<div class="review-traffic-block"><h4>读者在哪里走的</h4><svg class="review-retention" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="读者流失曲线"><line x1="50" y1="0" x2="50" y2="100" class="review-retention-mid"/><path d="${path}" class="review-retention-line"/></svg><div class="review-retention-axis"><span>开头</span><span>一半</span><span>结尾</span></div><p class="review-traffic-facts">${facts}</p></div>`;
}
function sourcesSection(list3) {
  if (!list3.length) return "";
  const top = list3.slice(0, 4);
  return `<div class="review-traffic-block"><h4>展现从哪来</h4><ul class="review-source-list">${top.map(([name, rate3]) => `<li><span class="review-source-name">${e(name)}</span><svg class="review-source-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="review-source-track" width="100" height="6" rx="3"/><rect class="review-source-fill" width="${Math.max(1, rate3).toFixed(1)}" height="6" rx="3"/></svg><b>${rate3.toFixed(1)}%</b></li>`).join("")}</ul></div>`;
}
function shareOf(map, pick) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return null;
  const entries = Object.entries(map).map(([k, v]) => [k, finiteNumber2(v)]).filter(([, v]) => v !== null && v >= 0);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (!total) return null;
  return pick(entries, total);
}
function audienceFacts(value) {
  if (!value || typeof value !== "object") return [];
  const age = value.age ?? value.fansage, gender = value.gender ?? value.fansgender, province = value.province ?? value.fansprovince;
  const facts = [];
  const male = shareOf(gender, (entries, total) => {
    const hit = entries.find(([k]) => k === "男" || k === "male");
    return hit ? hit[1] / total * 100 : null;
  });
  if (male !== null) facts.push(`男性 ${male.toFixed(0)}%`);
  const topAge = shareOf(age, (entries, total) => {
    const [name, v] = [...entries].sort((a, b) => b[1] - a[1])[0];
    return { name, share: v / total * 100 };
  });
  if (topAge) {
    const raw = topAge.name.trim();
    const label = raw.startsWith(">") ? `${raw.slice(1)} 岁以上` : raw.startsWith("<") ? `${raw.slice(1)} 岁以下` : `${raw} 岁`;
    facts.push(`${label}最多（${topAge.share.toFixed(0)}%）`);
  }
  const provinces = shareOf(province, (entries) => [...entries].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k));
  if (provinces?.length) facts.push(`${provinces.join("、")}读者最多`);
  return facts;
}
function audienceSection(facts) {
  if (!facts.length) return "";
  return `<div class="review-traffic-block"><h4>谁在读</h4><p class="review-traffic-facts">${facts.map(e).join('<span aria-hidden="true">·</span>')}</p></div>`;
}
function renderTrafficCard(snapshots, articleId) {
  const matching = (Array.isArray(snapshots) ? snapshots : []).filter((s) => String(s?.article_id) === String(articleId));
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
  if (valid2(snapshot?.revenue) !== null) secondary.push(["收益", money(snapshot.revenue)]);
  const extra = curveSection(completionCurvePoints(snapshot?.completion_curve)) + sourcesSection(trafficSourceList(snapshot?.traffic_sources)) + audienceSection(audienceFacts(snapshot?.audience));
  return `<section class="review-traffic-card" aria-label="文章流量数据">${snapshot ? `<div class="review-traffic-date">数据日期 ${e(snapshot.snapshot_date)}</div>` : ""}<dl class="review-traffic-primary">${primary.map(([label, value, subLabel, subValue]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd><div class="review-traffic-fan">${e(subLabel)} <span>${e(subValue)}</span></div></div>`).join("")}</dl><dl class="review-traffic-secondary is-${secondary.length}">${secondary.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl>` + (extra ? `<div class="review-traffic-extra">${extra}</div>` : "") + `</section>`;
}

// web/core/review-trends.mjs
var ROLLING_DAYS = 7;
var ROLLING_MIN_SAMPLES = 3;
var DAY_MS = 864e5, BEIJING_OFFSET_MS = 8 * 36e5;
var instant = (value) => typeof value === "string" && value.includes("T") && day7(value) ? Date.parse(value) : null;
var stamp3 = (value) => Number.isFinite(instant(value)) ? instant(value) : null;
var number = (value, max = Infinity) => {
  const n = finiteNumber2(value);
  return n !== null && n >= 0 && n <= max ? n : null;
};
var statusOf = (row) => row.publication_status ?? row.publish_status ?? row.status;
var unpublishedStatuses = ["draft", "drafting", "illustrated", "draft_saved", "scheduled", "pending", "failed", "unpublished", "deleted", "retracted", "unmatched"];
var unpublished = (row) => unpublishedStatuses.includes(statusOf(row));
var confirmed = (row) => statusOf(row) === "published";
function trendBounds({ range: range2 = "30d", from = "", to = "", now = (/* @__PURE__ */ new Date()).toISOString() } = {}) {
  const today2 = day7(now);
  if (!today2 || stamp3(now) === null) throw new TypeError("趋势需要带时区的当前时间。");
  if (!["7d", "30d", "custom"].includes(range2)) throw new TypeError("请选择近 7 天、近 30 天或自定义日期。");
  const start = range2 === "custom" ? from : shiftDay4(today2, range2 === "30d" ? -29 : -6);
  const end = range2 === "custom" ? to : today2;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || day7(start) !== start || !/^\d{4}-\d{2}-\d{2}$/.test(end) || day7(end) !== end)
    throw new TypeError("请选择有效的开始日期和结束日期。");
  const days = (Date.parse(end) - Date.parse(start)) / DAY_MS + 1;
  if (days < 1) throw new TypeError("结束日期不能早于开始日期。");
  if (end > today2) throw new TypeError("结束日期不能晚于今天。");
  if (days > 366) throw new TypeError("自定义范围最多 366 天。");
  return { range: range2, start, end, today: today2, days };
}
function summarize(rows) {
  const sample = (key, max) => rows.map((row) => number(row.sample24h?.[key], max)).filter((value) => value !== null);
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const reads3 = sample("reads"), ctr = sample("ctr", 100), completion = sample("completion_rate", 100), seconds = sample("avg_read_seconds");
  const judged = rows.filter((row) => row.verdict), verdicts2 = (name) => judged.filter((row) => row.verdict === name).length;
  const hits = verdicts2("爆");
  const unknown = rows.filter((row) => !confirmed(row)).length;
  const dates = rows.map((row) => day7(row.sample24h?.snapshot_date)).filter(Boolean).sort();
  const ages = rows.map((row) => number(row.sample24h?.age_hours)).filter((value) => value !== null);
  return {
    record_count: rows.length,
    published_count: unknown ? null : rows.length,
    confirmed_count: rows.length - unknown,
    unverified_count: unknown,
    median_reads: median(reads3),
    median_ctr: median(ctr),
    average_reads: mean(reads3),
    average_ctr: mean(ctr),
    average_completion: mean(completion),
    average_seconds: mean(seconds),
    hits: judged.length || !rows.length ? hits : null,
    middles: verdicts2("中"),
    flops: verdicts2("扑"),
    hit_rate: judged.length ? hits / judged.length * 100 : null,
    coverage: {
      average_reads: reads3.length,
      average_ctr: ctr.length,
      average_completion: completion.length,
      average_seconds: seconds.length,
      hits: judged.length,
      hit_rate: judged.length,
      published_count: rows.length - unknown,
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
function reviewTrends(data3 = {}, options3 = {}) {
  const { account: account3 = "V字", verdict = "", now = (/* @__PURE__ */ new Date()).toISOString() } = options3;
  const bounds = trendBounds({ ...options3, now }), nowMs = stamp3(now);
  const source = (data3.articles || []).filter((row) => row.account === account3);
  const past = (row) => day7(row.published_at) && day7(row.published_at) <= bounds.today && (stamp3(row.published_at) === null || stamp3(row.published_at) <= nowMs);
  const articles = source.filter((row) => !unpublished(row) && past(row));
  const byId = new Map(articles.map((row) => [String(row.id), row]));
  const snapshots = (data3.snapshots || []).filter((snapshot) => {
    const row = byId.get(String(snapshot.article_id)), date2 = day7(snapshot.snapshot_date);
    if (!row || !date2 || date2 > bounds.today || date2 < day7(row.published_at)) return false;
    const published = stamp3(row.published_at), hours = number(snapshot.age_hours);
    return published === null || hours === null || hours <= (nowMs - published) / 36e5 + 1;
  });
  const rows = enrichArticles({ ...data3, articles, snapshots }, { account: account3, baselineData: data3 }).map((row) => {
    const published = stamp3(row.published_at), age = number(row.sample24h?.age_hours);
    const elapsed = published === null ? null : (nowMs - published) / 36e5;
    return {
      ...row,
      trend_provisional: elapsed !== null && elapsed < 24 || age !== null && age < 24,
      trend_unknown_age: published === null && age === null && day7(row.published_at) >= shiftDay4(bounds.today, -1)
    };
  });
  const pool = rows.filter((row) => !verdict || row.verdict === verdict);
  const between = (start, end) => pool.filter((row) => day7(row.published_at) >= start && day7(row.published_at) <= end);
  const selected = between(bounds.start, bounds.end);
  const previous = { start: shiftDay4(bounds.start, -bounds.days), end: shiftDay4(bounds.start, -1) };
  const rolling = (date2, key) => {
    const values = between(shiftDay4(date2, 1 - ROLLING_DAYS), date2).map((row) => row[key]).filter((value) => value !== null);
    return values.length >= ROLLING_MIN_SAMPLES ? median(values) : null;
  };
  const first = selected.map((row) => day7(row.published_at)).sort()[0];
  const plot = { start: first || bounds.start, end: bounds.end };
  const startMs = Date.parse(`${plot.start}T00:00:00Z`);
  plot.days = (Date.parse(`${plot.end}T00:00:00Z`) - startMs) / DAY_MS + 1;
  const series = Array.from({ length: bounds.days }, (_, index) => {
    const date2 = shiftDay4(bounds.start, index);
    return {
      date: date2,
      position: date2 < plot.start ? null : ((Date.parse(`${date2}T00:00:00Z`) - startMs) / DAY_MS + 0.5) / plot.days,
      ...summarize(between(date2, date2)),
      rolling_reads: rolling(date2, "reads_24h"),
      rolling_ctr: rolling(date2, "ctr_24h")
    };
  });
  const points = selected.map((row) => {
    const date2 = day7(row.published_at), published = stamp3(row.published_at);
    const position = published === null ? ((Date.parse(`${date2}T00:00:00Z`) - startMs) / DAY_MS + 0.5) / plot.days : (published + BEIJING_OFFSET_MS - startMs) / (plot.days * DAY_MS);
    return {
      id: row.id,
      title: row.title || "",
      date: date2,
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
  const summary3 = summarize(selected);
  return {
    ...bounds,
    account: account3,
    verdict,
    previous,
    plot,
    kpis: headline(summary3, summarize(between(previous.start, previous.end))),
    points,
    series,
    top: points.filter((point) => point.reads !== null).sort((a, b) => b.reads - a.reads)[0] || null,
    thresholds: basis ? { hit: basis.high_threshold, flop: basis.low_threshold, method: basis.method, sample_count: basis.sample_count } : null,
    rolling: { days: ROLLING_DAYS, min_samples: ROLLING_MIN_SAMPLES },
    rows: selected,
    summary: summary3,
    excluded: {
      unpublished: source.filter(unpublished).length,
      pending: source.filter((row) => statusOf(row) === "pending").length,
      unmatched: source.filter((row) => statusOf(row) === "unmatched").length,
      undated: source.filter((row) => !unpublished(row) && !day7(row.published_at)).length,
      future: source.filter((row) => !unpublished(row) && day7(row.published_at) && !past(row)).length
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
var options = (values, selected) => values.map(([value, label]) => `<option value="${e(value)}"${value === selected ? " selected" : ""}>${e(label)}</option>`).join("");
function controls({ range: range2, from, to, today: today2 }) {
  const dates = range2 === "custom" ? `<label>开始日期<input class="input" type="date" data-review-trend="from"
    value="${e(from)}" max="${e(today2)}"></label><label>结束日期<input class="input" type="date"
    data-review-trend="to" value="${e(to)}" max="${e(today2)}"></label>` : "";
  return `<div class="review-filters review-trend-controls"><label>时间范围<select class="input" data-review-trend="range"
    >${options(RANGES, range2)}</select></label>${dates}
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
  const plotted = series.filter((day9) => day9.position !== null), step = Math.ceil(plotted.length / 6);
  return plotted.filter((_, index) => (plotted.length - 1 - index) % step === 0);
}
function readout(point) {
  if (!point) return "";
  const when = point.timed ? reviewDateTime2(point.published_at) : point.date;
  return `${when}《${point.title || "未命名"}》阅读 ${reads2(point.reads)} · 点击率 ${percent2(point.ctr)}${point.verdict ? ` · ${point.verdict}` : ""}${point.provisional ? " · 不满 24 小时的数据，暂定" : ""}`;
}
function figure(result, { key, rolling, kind, title, hint: hint2, format, tick, height, threshold, daily = true }) {
  const plotted = result.series.filter((day9) => day9.position !== null);
  const points = result.points.filter((point) => point[key] !== null), curve = plotted.filter((day9) => day9[rolling] !== null);
  const head = `<div class="review-trend-figure-head"><h3>${e(title)}</h3><span class="review-note">${e(hint2)}</span></div>`;
  if (!points.length && !curve.length) return `<section class="review-trend-figure">${head}
    <p class="review-trend-empty" role="status">当前范围没有可绘制的有效数据。缺失值不补零。</p></section>`;
  const top = 16, bottom = height - 30;
  const values = [...points.map((point) => point[key]), ...curve.map((day9) => day9[rolling]), ...known2(threshold) ? [threshold] : []];
  const { y, ticks } = scale(values, kind, top, bottom), x = (position) => `${(position * 100).toFixed(2)}%`;
  const grid = ticks.map((mark) => `<line class="review-trend-grid" x1="0" x2="100%" y1="${y(mark).toFixed(2)}" y2="${y(mark).toFixed(2)}"/>
    <text x="-8" y="${(y(mark) + 4).toFixed(2)}" text-anchor="end">${e(tick(mark))}</text>`).join("");
  const days = dateLabels(result.series).map((day9) => `<text x="${x(day9.position)}" y="${height - 8}" text-anchor="middle">${e(day9.date.slice(5))}</text>`).join("");
  const hitLine = known2(threshold) ? `<line class="review-trend-threshold" x1="0" x2="100%" y1="${y(threshold).toFixed(2)}" y2="${y(threshold).toFixed(2)}"/>` : "";
  const hitLabel = known2(threshold) ? `<text class="review-trend-threshold-label" x="100%" y="${(y(threshold) - 6).toFixed(2)}"
    text-anchor="end">爆款线 ${e(format(threshold))}</text>` : "";
  const order = { 爆: 2, 扑: 1 }, dots = [...points].sort((a, b) => (order[a.verdict] || 0) - (order[b.verdict] || 0)).map((point) => `<circle class="review-trend-dot ${VERDICT_CLASS[point.verdict] || "unjudged"}${point.provisional ? " provisional" : ""}"
      cx="${x(point.position)}" cy="${y(point[key]).toFixed(2)}" r="${point.verdict === "爆" ? 5.5 : 4.5}"
      data-review-row="${e(point.id)}" data-trend-readout="${e(readout(point))}"><title>${e(readout(point))}</title></circle>`).join("");
  let previous = null, lines = "";
  for (const day9 of plotted) {
    if (day9[rolling] === null) {
      previous = null;
      continue;
    }
    const now = { x: x(day9.position), y: y(day9[rolling]).toFixed(2) };
    if (previous) lines += `<line class="review-trend-line" x1="${previous.x}" y1="${previous.y}" x2="${now.x}" y2="${now.y}"/>`;
    previous = now;
  }
  const best = [...points].sort((a, b) => b[key] - a[key])[0];
  const resting = best ? `最高：${readout(best)}` : "";
  const latest2 = curve.at(-1);
  const curveLabel = latest2 ? `最新近 ${result.rolling.days} 天中位数 ${format(latest2[rolling])}` : "样本不足以画出走势线";
  return `<section class="review-trend-figure">${head}<div class="review-trend-chart"><svg height="${height}" role="img"
    aria-label="${e(title)}：${points.length} 篇文章按北京时间发布时间排列，${curveLabel}。${daily ? "逐日数字见下方表格。" : ""}"
    >${grid}${hitLine}${dots}${lines}${hitLabel}${days}</svg></div>
    <p class="review-trend-readout" data-trend-readout-target data-default="${e(resting)}">${e(resting)}</p></section>`;
}
function legend(result, { showLine = true } = {}) {
  const item = (mark, label) => `<li><i class="review-trend-key ${mark}" aria-hidden="true"></i>${e(label)}</li>`;
  return `<ul class="review-trend-legend">${item("hit", "爆")}${item("middle", "中")}${item("flop", "扑")}
    ${result.summary.provisional_count || result.summary.unknown_age_count ? item("provisional", "不满 24 小时的数据，暂定") : ""}
    ${showLine ? item("line", `近 ${result.rolling.days} 天中位数`) : ""}</ul>`;
}
function quadrantFigure(result) {
  const points = result.points.filter((point) => known2(point.reads) && known2(point.ctr));
  const head = '<div class="review-trend-figure-head"><h3>本期每篇文章卡在哪</h3><span class="review-note">横轴点击率、纵轴阅读；右上是爆款区，左下说明标题封面没人点</span></div>';
  if (!points.length) return `<section class="review-trend-figure review-quadrant-figure">${head}
    <p class="review-trend-empty" role="status">当前范围没有可绘制的有效数据。缺失值不补零。</p></section>`;
  const height = 270, top = 18, bottom = height - 34;
  const hitThreshold = result.thresholds?.hit;
  const ctrKpi = (result.kpis || []).find((tile) => tile.key === "median_ctr");
  const ctrLine = known2(ctrKpi?.previous) ? ctrKpi.previous : known2(result.summary.median_ctr) ? result.summary.median_ctr : null;
  const ctrLineLabel = known2(ctrKpi?.previous) ? `上期点击率中位 ${percent2(ctrKpi.previous)}` : known2(ctrLine) ? `本期点击率中位 ${percent2(ctrLine)}` : "";
  const ctrMax = Math.max(20, Math.ceil((Math.max(...points.map((point) => point.ctr), ctrLine ?? 0) + 2) / 5) * 5);
  const readValues = [...points.map((point) => point.reads), ...known2(hitThreshold) ? [hitThreshold] : []];
  const { y, ticks } = scale(readValues, "log", top, bottom);
  const x = (value) => `${(Math.min(1, Math.max(0, value / ctrMax)) * 100).toFixed(2)}%`;
  const ctrStep = ctrMax <= 25 ? 5 : 10;
  const ctrTicks = [];
  for (let mark = 0; mark <= ctrMax; mark += ctrStep) ctrTicks.push(mark);
  const grid = ticks.map((mark) => `<line class="review-trend-grid" x1="0" x2="100%" y1="${y(mark).toFixed(2)}" y2="${y(mark).toFixed(2)}"/>
    <text x="-8" y="${(y(mark) + 4).toFixed(2)}" text-anchor="end">${e(readsTick(mark))}</text>`).join("");
  const xLabels = ctrTicks.map((mark, index) => {
    const dense = ctrTicks.length > 6 && index % 2 === 1 && index < ctrTicks.length - 1;
    return `<text${dense ? ' class="review-quad-dense-tick"' : ""} x="${x(mark)}" y="${height - 10}" text-anchor="middle">${e(percentTick(mark))}</text>`;
  }).join("");
  const hitY = known2(hitThreshold) ? y(hitThreshold) : null;
  const ctrPct = known2(ctrLine) ? Math.min(100, Math.max(0, ctrLine / ctrMax * 100)) : null;
  const zones = hitY !== null && ctrPct !== null ? `<rect class="review-quad-zone is-hot" x="${ctrPct.toFixed(2)}%" y="${top}" width="${(100 - ctrPct).toFixed(2)}%" height="${Math.max(0, hitY - top).toFixed(2)}"/>
       <rect class="review-quad-zone is-cold" x="0%" y="${hitY.toFixed(2)}" width="${ctrPct.toFixed(2)}%" height="${Math.max(0, bottom - hitY).toFixed(2)}"/>` : "";
  const hitLine = hitY !== null ? `<line class="review-trend-threshold" x1="0" x2="100%" y1="${hitY.toFixed(2)}" y2="${hitY.toFixed(2)}"/>` : "";
  const hitLabelAbove = hitY !== null && hitY - top >= 26;
  const hitLabelY = hitY !== null ? hitLabelAbove ? hitY - 6 : hitY + 14 : top;
  const hitLabel = hitY !== null ? `<text class="review-trend-threshold-label" x="100%" y="${hitLabelY.toFixed(2)}" text-anchor="end">爆款线 ${e(reads2(hitThreshold))}</text>` : "";
  const vLine = ctrPct !== null ? `<line class="review-quad-ctr-line" x1="${ctrPct.toFixed(2)}%" x2="${ctrPct.toFixed(2)}%" y1="${top}" y2="${bottom}"/>` : "";
  const vLabelAnchor = ctrPct !== null && ctrPct > 72 ? "end" : "start";
  const vLabelX = ctrPct !== null ? ctrPct > 72 ? Math.max(8, ctrPct - 1.2) : Math.min(92, ctrPct + 1.2) : 0;
  const vLabel = ctrPct !== null ? `<text class="review-quad-ctr-label" x="${vLabelX.toFixed(2)}%" y="${top + 12}" text-anchor="${vLabelAnchor}">${e(ctrLineLabel)}</text>` : "";
  const hotLabelY = hitY !== null ? hitLabelAbove && hitY - top < 48 ? top + 12 : Math.min(hitY - 22, top + 28) : top + 28;
  const showHotCorner = hitY !== null && hitY - top >= 24 && ctrPct !== null && ctrPct <= 84;
  const quadLabels = hitY !== null && ctrPct !== null ? `${showHotCorner ? `<text class="review-quad-label is-hot" x="99%" y="${Math.max(top + 12, hotLabelY).toFixed(2)}" text-anchor="end">标题好 · 推得动</text>` : ""}
       <text class="review-quad-label is-cold" x="1%" y="${bottom - 8}">标题没人点</text>
       <text class="review-quad-label" x="99%" y="${bottom - 8}" text-anchor="end">有人点 · 没推起来</text>` : "";
  const order = { 爆: 2, 扑: 1 };
  const dots = [...points].sort((a, b) => (order[a.verdict] || 0) - (order[b.verdict] || 0)).map((point) => `<circle class="review-trend-dot ${VERDICT_CLASS[point.verdict] || "unjudged"}${point.provisional ? " provisional" : ""}"
      cx="${x(point.ctr)}" cy="${y(point.reads).toFixed(2)}" r="${point.verdict === "爆" ? 6.5 : 5}"
      data-review-row="${e(point.id)}" data-trend-readout="${e(readout(point))}"><title>${e(readout(point))}</title></circle>`).join("");
  const best = [...points].sort((a, b) => b.reads - a.reads)[0];
  const resting = best ? `最高：${readout(best)}` : "";
  return `<section class="review-trend-figure review-quadrant-figure">${head}<div class="review-trend-chart"><svg height="${height}" role="img"
    aria-label="本期每篇文章卡在哪：共 ${points.length} 篇有点击率与阅读数据的文章，横轴为点击率，纵轴为 24 小时阅读。"
    >${zones}${grid}${hitLine}${vLine}${quadLabels}${dots}${hitLabel}${vLabel}${xLabels}</svg></div>
    ${quadrantGuides(hitY, hitThreshold, ctrPct, ctrLineLabel)}
    <p class="review-trend-readout" data-trend-readout-target data-default="${e(resting)}">${e(resting)}</p></section>`;
}
function quadrantGuides(hitY, hitThreshold, ctrPct, ctrLineLabel) {
  const lines = [
    hitY === null ? "" : `<li class="review-quad-guide-hit">爆款线 ${e(reads2(hitThreshold))}</li>`,
    ctrPct === null ? "" : `<li class="review-quad-guide-median">${e(ctrLineLabel)}</li>`
  ].join("");
  if (!lines) return "";
  const zones = hitY !== null && ctrPct !== null ? '<li class="review-quad-guide-zone is-hot">右上 · 标题好、推得动</li><li class="review-quad-guide-zone is-cold">左下 · 标题没人点</li><li class="review-quad-guide-zone">右下 · 有人点、没推起来</li>' : "";
  return `<ul class="review-quadrant-guides" aria-label="象限图标注">${lines}${zones}</ul>`;
}
function rankedList(result) {
  const items = [...result.points].sort((a, b) => (known2(b.reads) ? 1 : 0) - (known2(a.reads) ? 1 : 0) || (b.reads ?? -1) - (a.reads ?? -1));
  const head = '<div class="review-trend-figure-head"><h3>本期文章排行</h3><span class="review-note">按 24 小时阅读排序 · 点击任意一行打开详情</span></div>';
  if (!items.length) return `<section class="review-cockpit-rank">${head}
    <p class="review-trend-empty" role="status">当前范围没有已发布文章。</p></section>`;
  const maxReads = Math.max(10, result.thresholds?.hit || 0, ...items.map((item) => item.reads || 0));
  const maxLog = Math.log10(maxReads);
  const rows = items.map((item, index) => {
    const verdictKey = VERDICT_CLASS[item.verdict] || "unjudged";
    const verdictLabel = item.verdict || "未判";
    const pct2 = known2(item.reads) && item.reads > 0 ? Math.max(4, Math.min(100, Math.round(Math.log10(Math.max(item.reads, 1)) / maxLog * 100))) : 0;
    const when = item.timed ? reviewDateTime2(item.published_at).slice(5) : item.date.slice(5);
    return `<li class="review-rank-item" data-review-row="${e(item.id)}">
      <span class="review-rank-num">${index + 1}</span>
      <span class="review-rank-chip ${verdictKey}">${e(verdictLabel)}</span>
      <button type="button" class="review-rank-title" data-review-article="${e(item.id)}" title="${e(item.title || "未命名")}">${e(item.title || "未命名")}</button>
      <svg class="review-rank-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect class="review-rank-bar-track" width="100" height="8" rx="4"/><rect class="review-rank-bar-fill ${verdictKey}${item.provisional ? " provisional" : ""}" width="${pct2}" height="8" rx="4"/></svg>
      <span class="review-rank-reads"><small class="review-rank-metric-label">阅读 </small>${e(reads2(item.reads))}</span>
      <span class="review-rank-ctr"><small class="review-rank-metric-label">点击 </small>${e(percent2(item.ctr))}</span>
      <span class="review-rank-meta">${e(when)}${item.provisional ? " · 不满 24h 暂定" : ""}</span>
    </li>`;
  }).join("");
  return `<section class="review-cockpit-rank" aria-label="本期文章排行">${head}<ol class="review-rank-list">${rows}</ol></section>`;
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
    <p>所用快照日期：${dates}。${ages}资料读取时间：${e(reviewDateTime2(result.loaded_at) || "未记录")}（北京时间）。
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
function renderCockpitMethod(data3, vm2, window2) {
  const now = vm2.now || (/* @__PURE__ */ new Date()).toISOString();
  return method(reviewTrends(data3, { account: vm2.account, range: "custom", from: window2.start, to: window2.end, now }));
}
function renderCockpitTrends(data3, vm2, window2) {
  const now = vm2.now || (/* @__PURE__ */ new Date()).toISOString();
  const result = reviewTrends(data3, { account: vm2.account, range: "custom", from: window2.start, to: window2.end, now });
  const pending = result.points.filter((point) => point.provisional && (known2(point.reads) || known2(point.ctr))).length;
  const held = (result.excluded?.pending || 0) + (result.excluded?.unmatched || 0);
  const shortWindow = result.days <= 14;
  const note = `按发布日期统计，阅读取发布后约 24 小时的数据。${pending ? `空心点 ${pending} 篇只有发布后不满 24 小时的数据，为暂定。` : ""}${held ? `另有 ${held} 篇待发布或未能对上，不进入阅读和点击率。` : ""}${result.end === day7(now) ? "今天尚未结束。" : ""}${shortWindow ? "缺失不补零；切换到「近30天」可看中位数走势线。" : `缺失不补零；黑线为当天及此前共 7 天中位数，不足 ${result.rolling.min_samples} 篇时断开。`}`;
  if (shortWindow) {
    return `<section class="review-trends review-cockpit-trends" aria-label="本期文章表现分析">${legend(result, { showLine: false })}
      ${quadrantFigure(result)}
      ${rankedList(result)}
      <p class="review-note review-trend-note">${e(note)}</p></section>`;
  }
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
function renderReviewTrends(data3, vm2) {
  const now = vm2.now || (/* @__PURE__ */ new Date()).toISOString(), today2 = day7(now), t = vm2.trends || {};
  const range2 = RANGES.some(([id2]) => id2 === t.range) ? t.range : "30d";
  const from = range2 === "custom" ? t.from || "" : shiftDay4(today2, range2 === "30d" ? -29 : -6);
  const to = range2 === "custom" ? t.to || "" : today2;
  const filters = controls({ range: range2, from, to, today: today2 });
  let result;
  try {
    result = reviewTrends(data3, { account: vm2.account, range: range2, from, to, now });
  } catch (error2) {
    return `<section class="review-trends" aria-label="数据趋势"><div class="review-panel-head"><h2>数据趋势</h2></div>${filters}
      <p role="alert">${e(error2.message)}</p></section>`;
  }
  const s = result.summary, pending = s.provisional_count + s.unknown_age_count;
  const note = `按发布日期统计，阅读取发布后约 24 小时的数据。${pending ? `空心点 ${pending} 篇只有发布后不满 24 小时的数据，为暂定。` : ""}${result.end === today2 ? "今天尚未结束。" : ""}${result.kpis.some((tile) => known2(tile.previous)) ? "" : "上一个同样长的周期还没有数据，暂不对比。"}`;
  return `<section class="review-trends" aria-label="数据趋势"><div class="review-panel-head"><div><h2>数据趋势</h2>
    <span class="review-note">${e(vm2.account)} · ${result.start} 至 ${result.end}</span></div>${filters}</div>
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
function nextFence(fence, line) {
  if (!fence) {
    const match = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (!match) return null;
    const marker = match[1];
    if (marker[0] === "`" && match[2].includes("`")) return null;
    return { char: marker[0], length: marker.length };
  }
  const close = line.trim().match(/^(`{3,}|~{3,})$/);
  return close && close[1][0] === fence.char && close[1].length >= fence.length ? null : fence;
}
function rulesIntroMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const intro = [];
  let fence = null;
  for (const line of lines) {
    const wasInFence = fence !== null;
    fence = nextFence(fence, line);
    if (!wasInFence && !fence) {
      if (/^##\s/.test(line) || /^#{1,6}\s+.*提示词/.test(line)) break;
      if (/^#\s/.test(line) || /^\s*[-*_]{3,}\s*$/.test(line)) continue;
    }
    intro.push(line);
  }
  return intro.join("\n").trim();
}
function playbookPromptBlocks(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let current3 = null, fence = null;
  const flush = () => {
    const content2 = current3?.lines.join("\n").trim();
    if (content2) blocks.push({ title: current3.title, content: content2 });
    current3 = null;
  };
  for (const line of lines) {
    const wasInFence = fence !== null;
    fence = nextFence(fence, line);
    if (wasInFence || fence) {
      if (current3) current3.lines.push(line);
      continue;
    }
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
function promptBadge(title = "", key = "") {
  if (key === "longform_write" || /写文|写文章/.test(title)) return ["写文", "is-hit"];
  if (key === "image" || /配图|海报/.test(title)) return ["配图", "is-blue"];
  if (key === "transfer_chat" || /转移|转写/.test(title)) return ["转移对话", "is-purple"];
  if (key === "weitoutiao_write" || /微头条/.test(title)) return ["微头条", "is-hit"];
  if (key === "article_diagnosis" || /诊断/.test(title)) return ["AI 诊断", "is-blue"];
  return ["提示词", ""];
}
function charCountLabel(content2) {
  const chars = String(content2 || "").replace(/\s+/g, "").length;
  return chars ? `约 ${chars.toLocaleString("zh-CN")} 字` : "";
}
function copyButton(action, id2 = "") {
  const marker = id2 ? ` data-prompt-id="${e(id2)}"` : "";
  return `<button type="button" class="btn" data-review-action="${action}"${marker}>复制完整提示词</button>`;
}
function card2(title, note, time3, content2, action, key = "") {
  const long = String(content2).split("\n").length > 10 || String(content2).length > 600;
  const [since, updated] = Array.isArray(time3) ? time3 : [time3, ""];
  const when = since || updated ? `<p class="review-note">${since ? `生效 ${e(since)}` : ""}${since && updated ? " · " : ""}${updated ? `最后更新 ${e(updated)}` : ""} · 北京时间</p>` : "";
  const [badgeText, tone] = promptBadge(title, key);
  const chars = charCountLabel(content2);
  return `<article class="review-prompt-card"><div class="review-prompt-head"><div class="review-prompt-heading"><div class="review-v13-rule-meta"><span class="review-prompt-badge ${tone}">${e(badgeText)}</span><h2>${e(title)}</h2><span class="review-note">${e(note)}</span>${chars ? `<span class="review-prompt-chars">${e(chars)}</span>` : ""}</div>${when}</div><div class="review-prompt-copy-actions">${action}<span class="review-note" role="status" aria-live="polite" data-prompt-copy-status></span></div></div><pre class="review-prompt-source${long ? " is-folded" : ""}">${e(content2)}</pre>` + // Folding only limits what is shown; the element still holds the whole prompt for copying.
  (long ? '<button type="button" class="btn text review-prompt-toggle" data-review-action="toggle-prompt" aria-expanded="false">展开全文</button>' : "") + "</article>";
}
function displayedPrompts(data3) {
  const order = ["longform_write", "image", "weitoutiao_write", "transfer_chat"];
  const prompts = (data3.prompts || []).filter((row) => row.prompt_key !== "article_diagnosis").slice().sort((a, b) => {
    const ai2 = order.indexOf(a.prompt_key), bi = order.indexOf(b.prompt_key);
    return Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0) || (ai2 < 0 ? order.length : ai2) - (bi < 0 ? order.length : bi) || String(a.prompt_key).localeCompare(String(b.prompt_key), "zh");
  });
  const shown2 = new Set(prompts.map((row) => String(row.content_md || "").trim()));
  const extras = (data3.playbooks || []).flatMap((book) => playbookPromptBlocks(book.content_md).filter((block) => !shown2.has(block.content)).map((block) => ({ ...block, book })));
  return { prompts, extras };
}
function promptPageUpdateRows(data3) {
  const { prompts, extras } = displayedPrompts(data3);
  return [...prompts, ...new Set(extras.map((block) => block.book))];
}
function renderPromptPage(data3, vm2) {
  const { prompts, extras } = displayedPrompts(data3);
  const cards = prompts.map((prompt) => card2(
    labels3[prompt.prompt_key] || prompt.title || prompt.prompt_key,
    [prompt.title, "v" + prompt.version, scopeLabel(prompt.scope)].filter(Boolean).join(" · "),
    [reviewDateTime2(prompt.created_at) || "未记录", reviewDateTime2(prompt.updated_at)],
    prompt.content_md || "",
    copyButton("copy-prompt", prompt.id),
    prompt.prompt_key
  ));
  for (const block of extras) cards.push(card2(block.title, "规则手册中的提示词", "", block.content, copyButton("copy-prompt-block")));
  const parts2 = [
    prompts.length ? `独立版本 ${prompts.length} 份` : "",
    extras.length ? `规则手册内置 ${extras.length} 份` : ""
  ].filter(Boolean).join(" · ");
  const summaryBar = `<div class="review-prompt-summary"><span>共 <strong>${cards.length}</strong> 份提示词</span><span class="review-note">${e(parts2)}</span></div>`;
  return `<div class="review-prompt-page">${summaryBar}${cards.join("")}</div>`;
}

// web/core/review-overview-metrics.mjs
function instant2(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day7(value)) return null;
  const stamp4 = Date.parse(value);
  return Number.isFinite(stamp4) ? stamp4 : null;
}
function metricSample(rows, valueOf, maximum = Infinity) {
  const entries = rows.map((row) => ({ value: finiteNumber2(valueOf(row)), hours: finiteNumber2(row.sample24h?.age_hours) })).filter(({ value, hours: hours2 }) => value !== null && value >= 0 && value <= maximum && hours2 !== null);
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
  const weekday2 = (/* @__PURE__ */ new Date(`${today2}T00:00:00Z`)).getUTCDay();
  return shiftDay4(today2, -((weekday2 + 6) % 7));
}
function metricWindow(range2, today2) {
  const monday = mondayOf(today2);
  if (range2 === "24h") return { rolling: true };
  if (range2 === "30d") return {
    start: shiftDay4(today2, -29),
    end: today2,
    label: "较前30天",
    previous: { start: shiftDay4(today2, -59), end: shiftDay4(today2, -30), closed: true }
  };
  if (range2 === "last") return {
    start: shiftDay4(monday, -7),
    end: shiftDay4(monday, -1),
    closed: true,
    label: "较上上周",
    previous: { start: shiftDay4(monday, -14), end: shiftDay4(monday, -8), closed: true }
  };
  return { start: monday, end: today2, label: "较上周", previous: { start: shiftDay4(monday, -7), end: shiftDay4(monday, -1), closed: true } };
}
function publishedIn(row, bounds, nowMs) {
  const publishedDay = day7(row.published_at);
  const publishedMs = instant2(row.published_at);
  if (bounds.rolling) return publishedMs !== null && publishedMs >= nowMs - 864e5 && publishedMs <= nowMs;
  return Boolean(publishedDay && publishedDay >= bounds.start && publishedDay <= bounds.end && (bounds.closed || publishedMs === null || publishedMs <= nowMs));
}
function summarize2(rows) {
  const hits = rows.filter((row) => row.verdict === "爆").length;
  const middle2 = rows.filter((row) => row.verdict === "中").length;
  const flops = rows.filter((row) => row.verdict === "扑").length;
  const unknownVerdicts = rows.length > 0 && hits + middle2 + flops === 0;
  const reads3 = metricSample(rows, (row) => row.reads_24h);
  const ctr = metricSample(rows, (row) => row.ctr_24h, 100);
  const seconds = metricSample(rows, (row) => row.sample24h?.avg_read_seconds);
  const completion = metricSample(rows, (row) => row.completion_24h, 100);
  const judged = metricSample(rows, (row) => row.verdict ? row.reads_24h : null);
  return {
    count: rows.length,
    observedCount: rows.filter((row) => row.sample24h).length,
    hits: unknownVerdicts ? null : hits,
    middle: unknownVerdicts ? null : middle2,
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
  for (let date2 = bounds.start; date2 <= bounds.end; date2 = shiftDay4(date2, 1)) {
    const dayRows = rows.filter((row) => publishedIn(row, { start: date2, end: date2, closed: true }, nowMs));
    days.push({ date: date2, ...summarize2(dayRows) });
  }
  return days;
}
function reviewOverviewMetrics(data3, { account: account3, range: range2 = "24h", now = (/* @__PURE__ */ new Date()).toISOString() } = {}) {
  const nowMs = instant2(now);
  if (nowMs === null) throw new TypeError("now must be an explicit ISO timestamp");
  const bounds = metricWindow(range2, day7(now));
  const rows = enrichArticles(data3, { account: account3 });
  const published = rows.filter((row) => reviewPublishState(row) === "published");
  const pendingCount = rows.filter((row) => reviewPublishState(row) === "pending" && publishedIn({ published_at: row.draft_saved_at || row.created_at }, bounds, nowMs)).length;
  const unmatchedCount = rows.filter((row) => reviewPublishState(row) === "unmatched").length;
  const current3 = summarize2(published.filter((row) => publishedIn(row, bounds, nowMs)));
  if (!bounds.previous) return { ...current3, pendingCount, unmatchedCount };
  const previous = summarize2(published.filter((row) => publishedIn(row, bounds.previous, nowMs)));
  return {
    ...current3,
    pendingCount,
    unmatchedCount,
    previous,
    comparisonLabel: bounds.label,
    window: { start: bounds.start, end: bounds.end },
    series: dailySeries2(published, bounds, nowMs)
  };
}
function reviewDuration(value) {
  const n = finiteNumber2(value);
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
  const number3 = finiteNumber2(observation?.snapshot?.[key]);
  if (number3 === null || number3 < 0) return "—";
  if (key === "ctr" || key === "completion_rate") return number3 <= 100 ? `${number3.toFixed(1)}%` : "—";
  if (key === "avg_read_seconds") return reviewDuration(number3);
  return number3 >= 1e4 ? `${(number3 / 1e4).toFixed(1)} 万` : number3.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}

// web/core/review-list-observation.mjs
function instant3(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day7(value)) return null;
  const stamp4 = Date.parse(value);
  return Number.isFinite(stamp4) ? stamp4 : null;
}
var compare2 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function reviewListObservation(row, snapshots = [], now = (/* @__PURE__ */ new Date()).toISOString()) {
  if (row.sample24h) return { kind: "sample", snapshot: row.sample24h, reads: row.reads_24h, hours: finiteNumber2(row.sample24h.age_hours) };
  const published = instant3(row.published_at);
  const candidates = (Array.isArray(snapshots) ? snapshots : []).filter((snapshot) => String(snapshot?.article_id) === String(row.id)).map((snapshot) => {
    const explicitAge = finiteNumber2(snapshot.age_hours);
    const observed = instant3(snapshot.observed_at) ?? instant3(snapshot.snapshot_date);
    const computedAge = published !== null && observed !== null ? (observed - published) / 36e5 : null;
    const hours = explicitAge !== null && Number.isInteger(explicitAge) && explicitAge >= 0 ? explicitAge : explicitAge === null ? computedAge : null;
    const reads3 = finiteNumber2(snapshot.reads);
    return { snapshot, hours, observed, reads: reads3 !== null && reads3 >= 0 ? reads3 : null };
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
  const hours = finiteNumber2(value);
  return hours === null ? "" : String(Number(hours.toFixed(4)));
}

// web/pages/review-article-list.mjs
init_dom();
var weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
var verdicts = ["爆", "中", "扑"];
var verdictClass = { 爆: "hit", 中: "middle", 扑: "flop" };
var percentageKeys = /* @__PURE__ */ new Set(["ctr", "completion_rate"]);
var LATEST_METRICS = /* @__PURE__ */ new Set(["completion_rate", "avg_read_seconds"]);
var metricColumns = [
  ["reads", "24h 阅读", true],
  ["ctr", "点击率", true],
  ["completion_rate", "完读率", true],
  ["avg_read_seconds", "阅读时长", true],
  ["impressions", "展现量", false],
  ["fan_reads", "粉丝阅读", false],
  ["fan_impressions", "粉丝展现", false]
];
var DENSITIES = ["compact", "full"];
var columnsFor = (density) => [["published", "文章", true], ["funnel", "卡在哪", false], ...metricColumns.filter(([, , core]) => density === "full" || core).map(([key, label]) => [key, label, true])];
var columns = columnsFor("full");
var TABLE_VIEW = "@table";
var reviewSortKeys = columns.filter(([, , sortable]) => sortable).map(([key]) => key);
function weekday(date2) {
  return (/* @__PURE__ */ new Date(date2 + "T00:00:00Z")).getUTCDay();
}
function articleListDate(value) {
  const when = reviewDateTime2(value);
  if (!when) return "—";
  return [when.slice(5, 10), weekdays[weekday(when.slice(0, 10))], when.slice(11)].filter(Boolean).join(" ");
}
function articlePatternDimensions(tags) {
  const dimensions = tags?.dimensions || [];
  const title = dimensions.find((name) => /标题/.test(name));
  const article = dimensions.find((name) => name !== title && /文章|正文|篇章/.test(name));
  if (!title && !article && dimensions.length === 2) return dimensions;
  return [title, article];
}
function patternValue(tags, id2, dimension) {
  if (!dimension || !Object.hasOwn(tags?.tags || {}, id2)) return "";
  const entry = tags.tags[id2];
  return entry && Object.hasOwn(entry, dimension) && typeof entry[dimension] === "string" ? entry[dimension].trim() : "";
}
var PATTERN_ORDER = {
  title: ["中外交锋", "引用外媒", "身份反差", "细节引大案"],
  article: ["两方对决", "人物来路", "败局复盘", "预期反转"]
};
var PATTERN_PRESENTATION = {
  title: {
    "中外交锋": { aliases: ["谁跟谁较劲"] },
    "引用外媒": { aliases: ["别人怎么说"] },
    "身份反差": { aliases: ["谁做了什么"] },
    "细节引大案": { aliases: ["一件小事引出大事"] }
  },
  article: {
    "两方对决": { aliases: ["双方怎么争", "历史名场面与暗战纪实", "脑洞怪题与硬核剥笋流"] },
    "人物来路": { aliases: ["一个人怎么走到这一步", "市井切片与江湖高人传"] },
    "败局复盘": { aliases: ["事情怎么搞砸的", "商业败局与作死复盘流"] },
    "预期反转": { aliases: ["为什么跟想的不一样"] }
  }
};
var PATTERN_RETIRED = ["赛博罪案与猫鼠博弈流", "草根江湖与赛博淘金流", "隐形冠军与暴利商战流"];
var PATTERN_ORPHANS = ["悬念问答", "暴利数字", "败局揭底"];
var PATTERN_OTHER = "其他";
var PATTERN_ALIASES = Object.fromEntries(Object.entries(PATTERN_PRESENTATION).map(([kind, entries]) => [kind, new Map(Object.entries(entries).flatMap(([name, { aliases: aliases2 = [] }]) => aliases2.map((alias) => [alias, name])))]));
var RETIRED_PATTERNS = new Set(PATTERN_RETIRED);
var ORPHAN_PATTERNS = new Set(PATTERN_ORPHANS);
function patternKind(tags, dimension) {
  if (!dimension) return "";
  const [title, article] = articlePatternDimensions(tags);
  return dimension === title ? "title" : dimension === article ? "article" : "";
}
function displayPattern(kind, name) {
  if (!name) return "";
  const aliased = PATTERN_ALIASES[kind]?.get(name);
  if (aliased) return aliased;
  if (RETIRED_PATTERNS.has(name) || ORPHAN_PATTERNS.has(name)) return PATTERN_OTHER;
  return name;
}
function availableDimensions(tags, rows) {
  return articlePatternDimensions(tags).map((dimension) => rows.some((row) => patternValue(tags, row.id, dimension)) ? dimension : "");
}
var middle = (values) => {
  const list3 = values.filter(Number.isFinite).sort((a, b) => a - b);
  const center = Math.floor(list3.length / 2);
  if (!list3.length) return null;
  return list3.length % 2 ? list3[center] : (list3[center - 1] + list3[center]) / 2;
};
function metricSnapshot(observation, key) {
  if (!LATEST_METRICS.has(key) || finiteNumber2(observation?.snapshot?.[key]) !== null) return observation?.snapshot;
  return observation?.latest?.snapshot || observation?.snapshot;
}
function metricValue(observation, key) {
  const value = finiteNumber2(metricSnapshot(observation, key)?.[key]);
  if (value === null || value < 0) return null;
  return percentageKeys.has(key) && value > 100 ? null : value;
}
function summary2(rows, observations) {
  const counts = verdicts.map((verdict) => rows.filter((row) => row.verdict === verdict).length);
  const judged = counts.reduce((total, count3) => total + count3, 0);
  const pick = (key, fallback) => middle(rows.map((row) => {
    const observed = observations ? metricValue(observations.get(row.id), key) : null;
    if (observed !== null) return observed;
    return fallback ? finiteNumber2(row[fallback]) : null;
  }));
  return {
    counts,
    judged,
    hitRate: judged ? 100 * counts[0] / judged : null,
    reads: pick("reads", "reads_24h"),
    impressions: pick("impressions"),
    ctr: pick("ctr", "ctr_24h"),
    completion_rate: pick("completion_rate"),
    avg_read_seconds: pick("avg_read_seconds"),
    fan_reads: pick("fan_reads"),
    fan_impressions: pick("fan_impressions")
  };
}
function groupBy(rows, keyFor2) {
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = keyFor2(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}
var tailRank = (name) => name === "未分类" ? 2 : name === PATTERN_OTHER ? 1 : 0;
var byPerformance = (a, b) => tailRank(a.name) - tailRank(b.name) || (a.rows.length < 5) - (b.rows.length < 5) || (b.hitRate ?? -1) - (a.hitRate ?? -1) || (b.reads ?? -1) - (a.reads ?? -1) || a.name.localeCompare(b.name, "zh-CN");
function patternGroupEntry(name, groupRows, rawNames, kind, observations) {
  const presentation = PATTERN_PRESENTATION[kind]?.[name] || {};
  const observed = new Set(groupRows.map((row) => rawNames.get(row)).filter(Boolean));
  const legacyNames2 = (presentation.aliases || []).filter((alias) => observed.has(alias));
  if (name === PATTERN_OTHER) {
    for (const orphan of PATTERN_ORPHANS) if (observed.has(orphan)) legacyNames2.push(orphan);
  }
  const retired = name === PATTERN_OTHER ? PATTERN_RETIRED.filter((item) => observed.has(item)) : [];
  const note = retired.length ? `旧备用名，须重打：${retired.join("、")}` : presentation.note || "";
  return { name, rows: groupRows, legacyNames: legacyNames2, note, ...summary2(groupRows, observations) };
}
function articlePatternGroups(rows, tags, dimension, observations) {
  const kind = patternKind(tags, dimension);
  const rawNames = new Map(rows.map((row) => [row, patternValue(tags, row.id, dimension)]));
  const grouped = groupBy(rows, (row) => displayPattern(kind, rawNames.get(row)) || "未分类");
  const listed = new Set(PATTERN_ORDER[kind] || []);
  const entries = [...listed].map((name) => patternGroupEntry(name, grouped.get(name) || [], rawNames, kind, observations));
  const rest = [...grouped.entries()].filter(([name, list3]) => !listed.has(name) && list3.length).map(([name, list3]) => patternGroupEntry(name, list3, rawNames, kind, observations)).sort(byPerformance);
  return [...entries, ...rest];
}
function articleWeekGroups(rows, observations) {
  return [...groupBy(rows, (row) => {
    const date2 = day7(row.published_at);
    return date2 ? shiftDay4(date2, -((weekday(date2) + 6) % 7)) : "";
  })].map(([start, rows2]) => ({ start, end: shiftDay4(start, 6), rows: rows2, ...summary2(rows2, observations) }));
}
function filterDate(value, from, today2) {
  const date2 = day7(value);
  return !from || Boolean(date2 && date2 >= from && date2 <= today2);
}
function filterArticles(rows, filters, tags, now) {
  const range2 = ["7d", "30d", "all"].includes(filters.range) ? filters.range : "30d";
  const today2 = day7(now), from = range2 === "all" ? "" : shiftDay4(today2, range2 === "7d" ? -6 : -29);
  const query = (filters.query || "").trim().toLocaleLowerCase();
  const matchesTitle = (row) => !query || (row.title || "").toLocaleLowerCase().includes(query);
  const pattern = filters.pattern;
  const kind = patternKind(tags, pattern?.dimension);
  const patternName = displayPattern(kind, pattern?.name);
  return {
    range: range2,
    published: rows.filter((row) => reviewPublishState(row) === "published" && filterDate(row.published_at, from, today2) && matchesTitle(row) && (!filters.verdict || row.verdict === filters.verdict) && (!pattern || displayPattern(kind, patternValue(tags, row.id, pattern.dimension)) === patternName)),
    drafts: rows.filter((row) => reviewPublishState(row) === "pending" && matchesTitle(row)).sort(activityArticles)
  };
}
function compareNullable(left, right, direction) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (left - right) * direction;
}
function sortReviewArticles(rows, observations, sort) {
  const direction = sort?.direction === "ascending" ? 1 : -1;
  const key = sort?.key || "published";
  if (key === "published") {
    return [...rows].sort((a, b) => Number(!day7(a.published_at)) - Number(!day7(b.published_at)) || -direction * recentArticles(a, b));
  }
  return [...rows].sort((a, b) => compareNullable(metricValue(observations.get(a.id), key), metricValue(observations.get(b.id), key), direction) || recentArticles(a, b));
}
var choose = (choices, value) => choices.map(([id2, label]) => `<option value="${e(id2)}"${id2 === value ? " selected" : ""}>${e(label)}</option>`).join("");
function viewControls(dimensions, group, count3, density) {
  const views = [[TABLE_VIEW, "全部文章"], [dimensions[0], "标题套路"], [dimensions[1], "文章套路"]];
  const densityButton = (value, label) => `<button type="button" class="btn" data-review-density="${value}" aria-pressed="${density === value}">${label}</button>`;
  return `<div class="segmented review-view-switch" role="group" aria-label="文章列表显示方式">` + views.map(([value, label]) => `<button type="button" class="btn" data-review-view="${e(value || "")}" aria-pressed="${Boolean(value) && group === value}"${value ? "" : ' disabled title="还没有套路标签"'}>${label}</button>`).join("") + `</div><div class="review-view-actions"><span class="review-view-count">已发布 <b>${count3}</b> 篇${dimensions.some(Boolean) ? "" : " · 还没有套路标签"}</span><div class="segmented review-density-switch" role="group" aria-label="显示多少指标">${densityButton("compact", "精简")}${densityButton("full", "完整")}</div><button class="btn text" type="button" data-review-action="toggle-fullscreen" aria-pressed="false">全屏展示</button></div>`;
}
function articleFilters(filters, range2) {
  const dates = choose([["7d", "近 7 天"], ["30d", "近 30 天"], ["all", "全部时间"]], range2);
  const choices = choose([["", "全部判定"], ...verdicts.map((verdict) => [verdict, "只看" + verdict])], filters.verdict || "");
  const pattern = filters.pattern;
  return `<div class="review-filters review-article-filters"><select class="input" data-review-filter="range" aria-label="发布时间">${dates}</select><select class="input" data-review-filter="verdict" aria-label="表现判定">${choices}</select><input type="search" class="input review-article-search" data-review-search aria-label="标题关键词" value="${e(filters.query || "")}" placeholder="搜索标题">` + (pattern ? `<button type="button" class="btn review-pattern-filter" data-review-pattern-clear aria-label="移除套路筛选：${e(pattern.dimension)} · ${e(pattern.name)}">${e(pattern.name)} ×</button>` : "") + "</div>";
}
var medianText = (value, key) => formatReviewListMetric({ snapshot: { [key]: value } }, key);
var countsHtml = (counts) => verdicts.map((label, i) => `<span class="review-count-pill ${verdictClass[label]}">${label} <b>${counts[i]}</b></span>`).join("");
function summaryStrip(stats2, total, density) {
  const rate3 = stats2.hitRate === null ? "—" : `${stats2.hitRate.toFixed(1)}%`;
  const item = (label, value) => `<span class="review-summary-item">${label} <b>${e(value)}</b></span>`;
  const extra = density === "full" ? item("展现中位", medianText(stats2.impressions, "impressions")) + item("粉丝阅读中位", medianText(stats2.fan_reads, "fan_reads")) + item("粉丝展现中位", medianText(stats2.fan_impressions, "fan_impressions")) : "";
  return `<div class="review-article-summary" aria-label="当前筛选汇总"><span class="review-summary-total">${total} 篇</span>${countsHtml(stats2.counts)}${item("爆率", rate3)}${item("阅读中位", medianText(stats2.reads, "reads"))}${item("点击中位", medianText(stats2.ctr, "ctr"))}${item("完读中位", medianText(stats2.completion_rate, "completion_rate"))}${item("时长中位", medianText(stats2.avg_read_seconds, "avg_read_seconds"))}${extra}</div>`;
}
function titleButton(row) {
  const title = e(row.title || "未命名文章");
  return `<button type="button" class="review-title-button" data-review-article="${e(row.id)}" aria-haspopup="dialog" title="${title}">${title}</button>`;
}
function draftBox(rows) {
  if (!rows.length) return "";
  return `<details class="review-article-drafts" data-review-keep-open="drafts"><summary>草稿箱 ${rows.length} 篇</summary><ul>${rows.map((row) => `<li><time>${e(articleListDate(row.draft_saved_at || row.created_at))}</time>${titleButton(row)}</li>`).join("")}</ul></details>`;
}
function patternButton(tags, row, dimension, kind) {
  const name = displayPattern(kind, patternValue(tags, row.id, dimension));
  if (!name) return "";
  return `<button type="button" class="review-pattern-label is-${kind}" data-review-pattern="${e(name)}" data-review-dimension="${e(dimension)}" title="${kind === "title" ? "标题套路" : "文章套路"}：${e(name)}，点击只看这一类">${e(name)}</button>`;
}
function renderDetailPatterns(row, tags) {
  const labels4 = ["标题套路", "文章套路"];
  return `<dl class="review-detail-patterns">${articlePatternDimensions(tags).map((dimension, index) => {
    const raw = patternValue(tags, row.id, dimension);
    const shown2 = displayPattern(patternKind(tags, dimension), raw) || raw;
    return `<div><dt>${labels4[index]}</dt><dd>${e(shown2 || "—")}</dd></div>`;
  }).join("")}</dl>`;
}
function verdictChip(row, observation) {
  if (observation.kind === "longtail") return '<span title="发布 72 小时后才有数据" class="review-article-verdict longtail review-tag">长尾</span>';
  if (row.verdict && verdictClass[row.verdict]) {
    return `<span class="review-tag ${verdictClass[row.verdict]} review-article-verdict">${e(row.verdict)}</span>`;
  }
  return '<span class="review-article-verdict unjudged" aria-label="未判定"></span>';
}
function readsBar(readsValue, maxLog, verdictKey, provisional) {
  if (readsValue === null || readsValue <= 0 || maxLog <= 0) return "";
  const pct2 = Math.max(6, Math.min(100, Math.round(Math.log10(Math.max(readsValue, 1)) / maxLog * 100)));
  return `<svg class="review-rank-bar review-article-bar" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true"><rect class="review-rank-bar-track" width="100" height="4" rx="2"/><rect class="review-rank-bar-fill ${verdictKey}${provisional ? " provisional" : ""}" width="${pct2}" height="4" rx="2"/></svg>`;
}
function verdictMixBar(counts) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (!total) return "";
  const hitW = Math.round(counts[0] / total * 100);
  const midW = Math.round(counts[1] / total * 100);
  const flopW = Math.max(0, 100 - hitW - midW);
  return `<svg class="review-mix-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="review-mix-hit" x="0" width="${hitW}" height="6"/><rect class="review-mix-middle" x="${hitW}" width="${midW}" height="6"/><rect class="review-mix-flop" x="${hitW + midW}" width="${flopW}" height="6"/></svg>`;
}
function metricCell(observation, key) {
  const text = e(formatReviewListMetric({ snapshot: metricSnapshot(observation, key) }, key));
  if (!LATEST_METRICS.has(key) || text === "—" || metricSnapshot(observation, key) === observation?.snapshot) return text;
  const hours = observation?.latest?.hours;
  if (hours === null || hours === void 0) return text;
  const title = `24 小时数据里还没有，这是发布后 ${e(reviewObservationHours(hours))} 小时的采集`;
  return `<span class="review-latest-value" title="${title}">${text}</span>`;
}
var FUNNEL_STEPS = [
  ["ctr", "点击低", 0.7, "点击率不到中位数的七成：标题和封面没让人想点"],
  ["completion_rate", "完读低", 0.8, "完读率不到中位数的八成：读者半路走了，看正文"],
  ["impressions", "展现少", 0.5, "展现量不到中位数的一半：平台没怎么推"]
];
function funnelDiagnosis(observation, stats2) {
  if (!observation || observation.kind === "immature") return null;
  const checked4 = FUNNEL_STEPS.filter(([key]) => finiteNumber2(stats2?.[key]) !== null && metricValue(observation, key) !== null);
  if (!checked4.length) return null;
  const weak = checked4.filter(([key, , ratio]) => metricValue(observation, key) < stats2[key] * ratio);
  return { weak: weak.map(([key, label, , reason]) => ({ key, label, reason })) };
}
function funnelCell(observation, stats2) {
  const result = funnelDiagnosis(observation, stats2);
  if (!result) return '<span class="review-funnel-none">—</span>';
  if (!result.weak.length) return '<span class="review-funnel-ok" title="点击、完读、展现都不低于中位数的标准">正常</span>';
  return result.weak.map((step) => `<span class="review-funnel-tag is-${e(step.key)}" title="${e(step.reason)}">${e(step.label)}</span>`).join("");
}
function rowHtml(row, observation, tags, dimensions, maxLog, cols, stats2) {
  const published = articleListDate(row.published_at);
  const patterns = [patternButton(tags, row, dimensions[0], "title"), patternButton(tags, row, dimensions[1], "article")].filter(Boolean);
  const identity5 = `<div class="review-article-identity">${verdictChip(row, observation)}<div class="review-article-main">${titleButton(row)}<div class="review-article-meta"><span class="review-article-date">${e(published)}</span>${patterns.map((item) => '<span aria-hidden="true">·</span>' + item).join("")}</div></div></div>`;
  const readsFormatted = observation.kind === "immature" ? "未满24h" : e(formatReviewListMetric(observation, "reads"));
  const readsVal = metricValue(observation, "reads");
  const vKey = verdictClass[row.verdict] || "unjudged";
  const provisional = observation.hours !== null && observation.hours < 24;
  const readsCell = (observation.hours === null ? readsFormatted : `<span title="发布后 ${e(reviewObservationHours(observation.hours))} 小时">${readsFormatted}</span>`) + readsBar(readsVal, maxLog, vKey, provisional);
  const cell = (key) => key === "published" ? identity5 : key === "reads" ? readsCell : key === "funnel" ? funnelCell(observation, stats2) : metricCell(observation, key);
  return `<tr data-review-row="${e(row.id)}">${cols.map(([key, label]) => `<td data-label="${label}" class="review-cell-${key}">${cell(key)}</td>`).join("")}</tr>`;
}
function table(headers, bodies, density) {
  return `<div class="review-table-wrap"><table class="review-table review-articles-table is-${density}"><caption class="review-sr-only">文章表现</caption><thead><tr>${headers}</tr></thead>${bodies}</table></div>`;
}
function columnHeaders(sort, cols) {
  return cols.map(([key, label, sortable]) => {
    const text = key === "published" ? "文章 / 发布时间" : label;
    const note = LATEST_METRICS.has(key) ? '<sup class="review-latest-mark" title="24 小时数据没有这一项时，取最近一次采集">*</sup>' : "";
    if (!sortable) return `<th scope="col" class="review-cell-${key}">${text}</th>`;
    const direction = sort?.key === key ? sort.direction : !sort && key === "published" ? "descending" : "";
    const arrow = direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "";
    return `<th scope="col" class="review-cell-${key}"${direction ? ` aria-sort="${direction}"` : ""}><button type="button" data-review-sort="${key}">${text}${note}<span aria-hidden="true">${arrow}</span></button></th>`;
  }).join("");
}
function weekBody(week, lines, cols) {
  const date2 = week.start ? `${week.start.slice(5).replace("-", "月")}日 – ${week.end.slice(5).replace("-", "月")}日` : "发布时间未提供";
  return `<tbody><tr class="review-week-summary"><th scope="rowgroup" colspan="${cols.length}"><div><strong class="review-week-label">${date2}</strong><span class="review-week-count">${week.rows.length} 篇</span>${countsHtml(week.counts)}<span class="review-week-stat">阅读中位 <b>${e(medianText(week.reads, "reads"))}</b></span><span class="review-week-stat">点击中位 <b>${e(medianText(week.ctr, "ctr"))}</b></span></div></th></tr>${lines(week.rows)}</tbody>`;
}
function patternGroup(group, dimension, headers, lines, density) {
  const few = group.rows.length > 0 && group.rows.length < 5 ? '<span class="review-sample-badge" title="少于 5 篇，结论先别当真">样本少</span>' : "";
  const rate3 = group.hitRate === null ? "—" : `${group.hitRate.toFixed(1)}%`;
  const annotations = [
    group.legacyNames.length ? `含旧名：${group.legacyNames.join("、")}` : "",
    group.note
  ].filter(Boolean).map((note) => `<span class="review-group-count">${e(note)}</span>`).join("");
  const figure2 = (label, value, css = "") => `<div${css ? ` class="${css}"` : ""}><dt>${label}</dt><dd>${e(value)}</dd></div>`;
  const full = density === "full" ? figure2("展现中位", medianText(group.impressions, "impressions")) + figure2("粉丝阅读中位", medianText(group.fan_reads, "fan_reads")) + figure2("粉丝展现中位", medianText(group.fan_impressions, "fan_impressions")) : "";
  return `<details class="review-article-group" data-review-keep-open="${e(JSON.stringify([dimension, group.name]))}"><summary><span class="review-article-group-name">${e(group.name)}</span>${annotations}<span class="review-group-count">${group.rows.length} 篇</span>${few}<span class="review-group-mix">${verdictMixBar(group.counts)}${countsHtml(group.counts)}</span><dl class="review-article-group-figures">${figure2("爆率", rate3, group.hitRate > 0 ? "is-hitrate is-positive" : "is-hitrate")}${figure2("阅读中位", medianText(group.reads, "reads"))}${figure2("点击中位", medianText(group.ctr, "ctr"))}${figure2("完读中位", medianText(group.completion_rate, "completion_rate"))}${figure2("时长中位", medianText(group.avg_read_seconds, "avg_read_seconds"))}${full}</dl></summary>${group.rows.length ? table(headers, `<tbody>${lines(group.rows)}</tbody>`, density) : ""}</details>`;
}
function latestObservation(snapshots) {
  let best = null;
  for (const snapshot of snapshots || []) {
    if (finiteNumber2(snapshot?.completion_rate) === null && finiteNumber2(snapshot?.avg_read_seconds) === null) continue;
    const hours = finiteNumber2(snapshot.age_hours);
    const rank = [hours ?? -1, String(snapshot.snapshot_date || ""), String(snapshot.id || "")];
    if (!best || rank[0] > best.rank[0] || rank[0] === best.rank[0] && (rank[1] > best.rank[1] || rank[1] === best.rank[1] && rank[2] > best.rank[2]))
      best = { snapshot, hours, rank };
  }
  return best ? { snapshot: best.snapshot, hours: best.hours } : null;
}
function articleDensity(value) {
  return DENSITIES.includes(value) ? value : "compact";
}
function renderArticleList(rows, vm2, snapshots, flagged, tag2) {
  const now = vm2.now || (/* @__PURE__ */ new Date()).toISOString(), filters = { ...vm2.filters };
  if (filters.pattern) {
    const { dimension, name } = filters.pattern;
    filters.pattern = { dimension, name: displayPattern(patternKind(vm2.tags, dimension), name) };
  }
  const density = articleDensity(filters.density), cols = columnsFor(density);
  const dimensions = availableDimensions(vm2.tags, rows.filter((row) => reviewPublishState(row) === "published"));
  const group = filters.group && dimensions.includes(filters.group) ? filters.group : TABLE_VIEW;
  const { published, drafts, range: range2 } = filterArticles(rows, filters, vm2.tags, now);
  const status = draftBox(drafts) + flagged;
  const top = `<div class="review-view-row">${viewControls(dimensions, group, published.length, density)}</div>` + articleFilters(filters, range2) + (status ? `<div class="review-article-status">${status}</div>` : "");
  if (!published.length) return top + '<div class="review-empty"><strong>当前筛选下没有文章</strong></div>';
  const byArticle = groupBy(snapshots || [], (snapshot) => String(snapshot.article_id));
  const observations = new Map(published.map((row) => {
    const own3 = byArticle.get(String(row.id));
    return [row.id, { ...reviewListObservation(row, own3, now), latest: latestObservation(own3) }];
  }));
  const ordered2 = sortReviewArticles(published, observations, filters.sort);
  const maxReads = Math.max(10, ...ordered2.map((row) => metricValue(observations.get(row.id), "reads") ?? 0));
  const maxLog = Math.log10(maxReads);
  const stats2 = summary2(ordered2, observations);
  const lines = (list3) => list3.map((row) => rowHtml(row, observations.get(row.id), vm2.tags, dimensions, maxLog, cols, stats2)).join("");
  const headers = columnHeaders(filters.sort, cols);
  const note = '<p class="review-latest-note">「卡在哪」和当前筛选里所有文章的中位数比：点击率不到七成标「点击低」（看标题封面），完读率不到八成标「完读低」（看正文），展现量不到一半标「展现少」（平台没怎么推）。鼠标停在标签上看原因。</p><p class="review-latest-note">* 头条 24 小时数据常常还没有完读率和阅读时长，缺的时候取最近一次采集（鼠标停在数字上看是发布后几小时）；其余指标都是发布后 24 小时。</p>';
  const head = summaryStrip(stats2, ordered2.length, density);
  if (group !== TABLE_VIEW) {
    const groups = articlePatternGroups(ordered2, vm2.tags, group, observations);
    const shown2 = filters.pattern ? groups.filter((entry) => entry.rows.length) : groups;
    return top + head + `<div class="review-article-groups">${shown2.map((entry) => patternGroup(entry, group, headers, lines, density)).join("")}</div>` + note;
  }
  const bodies = filters.sort ? `<tbody>${lines(ordered2)}</tbody>` : articleWeekGroups(ordered2, observations).map((week) => weekBody(week, lines, cols)).join("");
  return top + head + table(headers, bodies, density) + note;
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
    const label = title || (rawUrl ? "参考文章" : "自选题");
    value = url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : e(label);
  }
  return `<div class="review-imitation"><span>仿</span><div>${value}</div></div>`;
}

// web/pages/review-remarks.mjs
init_dom();
var ARTICLE_REMARK_KIND = "article_note";
var linked = (note, id2) => {
  const ids = Array.isArray(note.related_article_ids) ? note.related_article_ids : parseJson(note.related_article_ids, []);
  return Array.isArray(ids) && ids.some((value) => String(value) === String(id2));
};
function articleRemarks(notes = [], id2) {
  return notes.filter((note) => note && note.kind === ARTICLE_REMARK_KIND && !note.deleted_at && linked(note, id2)).sort((a, b) => String(b.note_date).localeCompare(String(a.note_date)) || String(b.created_at).localeCompare(String(a.created_at)));
}
var shortDate = (date2) => /^\d{4}-\d{2}-\d{2}$/.test(String(date2)) ? `${Number(date2.slice(5, 7))}月${Number(date2.slice(8))}日` : "";
function renderArticleRemarks(row, notes) {
  const items = articleRemarks(notes, row.id);
  if (!items.length) return "";
  return `<section class="review-remarks" aria-label="备注"><h3>备注</h3><ul>${items.map((note) => `<li><p class="review-remark-head"><span class="review-note">${e(shortDate(note.note_date))}</span><strong>${e(note.title)}</strong></p>${note.body_md ? `<div class="review-remark-body">${renderReviewMarkdown(note.body_md)}</div>` : ""}</li>`).join("")}</ul></section>`;
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
  const n = finiteNumber2(value);
  if (n === null || n < 0) return "";
  return n >= 1e4 ? `${(n / 1e4).toFixed(1)} 万` : n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}
function articleLink(article, account3) {
  const external2 = safeUrl2(article.url);
  const local = `?page=review&account=${encodeURIComponent(account3)}&review_article=${encodeURIComponent(article.id)}`;
  return `<a href="${e(external2 || local)}"${external2 ? ' target="_blank" rel="noopener noreferrer"' : ""}>${e(article.title || "未命名文章")}</a>`;
}
function latestSnapshot(snapshots, articleId) {
  return (snapshots || []).filter((row) => String(row.article_id) === String(articleId)).sort((a, b) => String(b.snapshot_date || "").localeCompare(String(a.snapshot_date || "")))[0] || null;
}
function metricText(snapshot) {
  if (!snapshot) return "—";
  const parts2 = [];
  for (const [label, key] of [["阅读", "reads"], ["点赞", "likes"], ["评论", "comments"], ["收藏", "favorites"], ["分享", "shares"], ["展现", "impressions"]]) {
    const text = number2(snapshot[key]);
    if (text) parts2.push(`${label} ${text}`);
  }
  const ctr = finiteNumber2(snapshot.ctr);
  if (ctr !== null && ctr >= 0) parts2.push(`点击率 ${ctr.toFixed(1)}%`);
  return parts2.length ? parts2.join(" · ") : "—";
}
function renderBenchmarkLibrary(data3 = {}, account3 = "") {
  const accounts = new Map((data3.benchmarkAccounts || []).filter((item) => item.account === account3).map((item) => [String(item.id), item]));
  const ownArticles = (data3.articles || []).filter((item) => item.account === account3);
  const verdictById = new Map(enrichArticles(data3, { account: account3 }).map((row) => [String(row.id), row.verdict]));
  const samples = (data3.benchmarkArticles || []).filter((item) => item.account === account3 && accounts.has(String(item.benchmark_account_id))).map((item) => ({
    item,
    published: reviewDateTime2(item.published_at),
    used: ownArticles.filter((article) => article.reference_article_id != null && String(article.reference_article_id) === String(item.id))
  })).filter((row) => row.used.length).sort((a, b) => {
    const dayOrder = b.published.slice(0, 10).localeCompare(a.published.slice(0, 10));
    if (dayOrder) return dayOrder;
    const aTimed = a.published.length > 10, bTimed = b.published.length > 10;
    return Number(bTimed) - Number(aTimed) || (aTimed && bTimed ? Date.parse(b.item.published_at) - Date.parse(a.item.published_at) : 0) || String(a.item.id).localeCompare(String(b.item.id));
  });
  if (!samples.length) return '<section class="review-benchmark-library"><h2>爆文库</h2><p class="review-note">暂无已仿写爆文</p></section>';
  const usedPairs = samples.flatMap((entry) => entry.used);
  const pendingCount = usedPairs.filter((article) => reviewPublishState(article) === "pending").length;
  const verdictOf = (article) => article.verdict || verdictById.get(String(article.id)) || "";
  const hits = usedPairs.filter((article) => verdictOf(article) === "爆").length;
  const middles = usedPairs.filter((article) => verdictOf(article) === "中").length;
  const flops = usedPairs.filter((article) => verdictOf(article) === "扑").length;
  const judged = hits + middles + flops;
  const hitRate = judged ? `${(100 * hits / judged).toFixed(1)}%` : "—";
  const sampleReadsMed = number2(median(samples.map((entry) => entry.item.reads))) || "—";
  const ownSnapshots = usedPairs.filter((article) => reviewPublishState(article) === "published").map((article) => latestSnapshot(data3.snapshots, article.id)).filter(Boolean);
  const ownReadsMed = number2(median(ownSnapshots.map((snapshot) => snapshot.reads))) || "—";
  const ownCtrRaw = median(ownSnapshots.map((snapshot) => snapshot.ctr).filter((value) => {
    const n = finiteNumber2(value);
    return n !== null && n >= 0 && n <= 100;
  }));
  const ownCtrMed = ownCtrRaw !== null ? `${ownCtrRaw.toFixed(1)}%` : "—";
  const verdictPills = judged ? `<div class="review-lib-kpi-pills"><span class="review-count-pill hit">爆 <b>${e(hits)}</b></span><span class="review-count-pill middle">中 <b>${e(middles)}</b></span><span class="review-count-pill flop">扑 <b>${e(flops)}</b></span></div>` : "<strong>—</strong>";
  const kpis = `<div class="review-sub-kpis review-library-kpis"><article class="review-sub-kpi"><span>已仿写篇数</span><strong>${e(usedPairs.length)} 篇</strong><small>对应 ${e(samples.length)} 篇对标样本${pendingCount ? ` · 待发布 ${e(pendingCount)} 篇` : ""}</small></article><article class="review-sub-kpi"><span>仿写表现</span>${verdictPills}<small>${judged ? `爆率 ${e(hitRate)} · 已判定 ${e(judged)} 篇` : "暂无已判定样本"}</small></article><article class="review-sub-kpi"><span>样本阅读中位</span><strong>${e(sampleReadsMed)}</strong><small>参考爆文基准</small></article><article class="review-sub-kpi"><span>仿写阅读中位</span><strong>${e(ownReadsMed)}</strong><small>${ownCtrMed !== "—" ? `点击率中位 ${e(ownCtrMed)}` : "按最新已采快照"}</small></article></div>`;
  const headers = ["对标账号", "样本标题", "样本发布时间", "样本阅读", "仿写标题", "仿写发布时间", "仿写数据"];
  const cellClasses = [
    "review-lib-cell-account",
    "review-lib-cell-sample",
    "review-lib-cell-sample-time",
    "review-lib-cell-sample-reads",
    "review-lib-cell-own",
    "review-lib-cell-own-time",
    "review-lib-cell-metrics"
  ];
  const body4 = samples.flatMap(({ item, published, used }) => used.map((article, index) => {
    const owner2 = accounts.get(String(item.benchmark_account_id));
    const target = safeUrl2(item.url);
    const title = e(item.title || "未命名文章");
    const reads3 = number2(item.reads);
    const state2 = reviewPublishState(article);
    const verdict = verdictOf(article);
    const verdictClass2 = verdict === "爆" ? "hit" : verdict === "扑" ? "flop" : "middle";
    const chip = state2 === "pending" ? '<span class="review-lib-chip is-pending">待发布</span>' : state2 === "unmatched" ? '<span class="review-lib-chip is-unmatched">未对上</span>' : ["爆", "中", "扑"].includes(verdict) ? `<span class="review-lib-chip ${verdictClass2}">${e(verdict)}</span>` : "";
    const imitation = state2 === "pending" ? "待发布" : state2 === "unmatched" ? "未能对上" : metricText(latestSnapshot(data3.snapshots, article.id));
    const cells = [
      e(owner2.name || "未命名账号"),
      target ? `<a href="${e(target)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title,
      e(published || "未记录"),
      e(reads3 || "—"),
      `${chip}${articleLink(article, account3)}`,
      e(reviewDateTime2(article.draft_saved_at || article.created_at) || "未记录"),
      e(imitation)
    ];
    const id2 = index === 0 ? ` id="review-benchmark-${e(encodeURIComponent(item.id))}"` : "";
    return `<tr${id2} tabindex="-1">${cells.map((cell, cellIndex) => `<td class="${cellClasses[cellIndex]}" data-label="${headers[cellIndex]}">${cell}</td>`).join("")}</tr>`;
  })).join("");
  return `<section class="review-benchmark-library"><div class="review-library-head"><h2>爆文库</h2><span class="review-note">已仿写样本与我方表现对照</span></div>${kpis}<div class="review-benchmark-table-wrap"><table class="review-benchmark-table"><thead><tr>${headers.map((label, cellIndex) => `<th scope="col" class="${cellClasses[cellIndex]}">${label}</th>`).join("")}</tr></thead><tbody>${body4}</tbody></table></div></section>`;
}

// web/pages/content-review.mjs
init_dom();
var REVIEW_VIEWS = [["overview", "总览"], ["articles", "文章库"], ["playbook", "手册"]];
var percentageKeys2 = /* @__PURE__ */ new Set(["ctr", "completion_rate", "ctr_24h", "completion_24h", "hit_rate", "flop_rate", "median_ctr"]);
function reviewNumber(value, key = "") {
  const n = finiteNumber2(value);
  if (n === null) return "—";
  if (percentageKeys2.has(key)) return `${n.toFixed(1)}%`;
  return Math.abs(n) >= 1e4 ? `${(n / 1e4).toFixed(1)} 万` : n.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}
var empty2 = (title, text = "") => `<div class="review-empty"><strong>${e(title)}</strong>${text ? `<p>${e(text)}</p>` : ""}</div>`;
var panel = (title, body4, note = "", css = "") => `<section class="review-panel ${css}"><div class="review-panel-head"><h2>${e(title)}</h2>${note ? `<span class="review-note">${e(note)}</span>` : ""}</div>${body4}</section>`;
var options2 = (rows, value) => rows.map(([id2, label]) => `<option value="${e(id2)}"${String(id2) === String(value) ? " selected" : ""}>${e(label)}</option>`).join("");
var firstSentence2 = (value) => String(value || "").replace(/^#+\s*/gm, "").trim().match(/^[\s\S]*?[。！？!?](?:[”」』])?|^[^\n]+/)?.[0] || "";
function external(url, label) {
  const safe = safeReviewUrl(url);
  return safe ? `<a href="${e(safe)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : '<span class="review-note">未提供原文链接</span>';
}
function publishBadge(row) {
  const state2 = reviewPublishState(row);
  return `<span class="review-publish review-publish-${state2}">${e(reviewPublishLabel(row))}</span>`;
}
function tag(verdict) {
  if (!["爆", "中", "扑"].includes(verdict)) return "";
  const css = verdict === "爆" ? "hit" : verdict === "扑" ? "flop" : "middle";
  return `<span class="review-tag ${css}">${e(verdict)}</span>`;
}
function delta(value, key) {
  const n = finiteNumber2(typeof value === "object" && value ? value.delta : value);
  return n === null ? '<span class="review-change">较前一周 —</span>' : `<span class="review-change">较前一周 ${n > 0 ? "+" : n < 0 ? "−" : ""}${e(percentageKeys2.has(key) ? Math.abs(n).toFixed(1) : reviewNumber(Math.abs(n)))}${percentageKeys2.has(key) ? " 个百分点" : ""}</span>`;
}
function chart(points, { small = false } = {}) {
  if (!points.some((p) => finiteNumber2(p.ctr_24h) !== null || finiteNumber2(p.reads_24h) !== null)) return empty2("暂无趋势数据", "采集后显示阅读与 CTR 中位数。");
  const width = 720, height = small ? 120 : 180, left = 28, right = 692, top = 18, bottom = top + height;
  const x = (i) => left + (points.length < 2 ? (right - left) / 2 : i / (points.length - 1) * (right - left));
  const max = (key) => Math.max(1, ...points.map((p) => finiteNumber2(p[key]) ?? 0));
  let lines = "", dots = "";
  for (const [key, css, label] of [["reads_24h", "reads", "阅读"], ["ctr_24h", "ctr", "CTR"]]) {
    let segment = [];
    const flush = () => {
      if (segment.length) lines += `<polyline class="review-line-${css}" points="${segment.join(" ")}"/>`;
      segment = [];
    };
    points.forEach((p, i) => {
      const n = finiteNumber2(p[key]);
      if (n === null) {
        flush();
        return;
      }
      const px = x(i).toFixed(2), py = (bottom - n / max(key) * height).toFixed(2);
      segment.push(`${px},${py}`);
      dots += `<circle class="review-point review-point-${css}" cx="${px}" cy="${py}" r="3" tabindex="0"><title>${e(p.date)} · ${label} ${e(reviewNumber(
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
function collapsed(title, body4, id2 = "") {
  return `<details class="review-panel review-extra"${id2 ? ` id="${e(id2)}"` : ""}><summary>${e(
    title
  )}</summary>${body4}</details>`;
}
var REVIEW_SECTIONS = [["cockpit", "驾驶舱"], ["articles", "文章详情"], ["benchmarks", "对标账号"], ["rules", "规则"], ["prompts", "提示词"], ["library", "爆文库"]];
var REVIEW_SECTION_GROUPS = [
  ["all", "", ["cockpit", "articles", "benchmarks", "library", "rules", "prompts"]]
];
function activeSection(vm2) {
  const raw = vm2.secondary === "review" ? "rules" : vm2.secondary === "trends" ? "cockpit" : vm2.secondary;
  if (REVIEW_SECTIONS.some(([id2]) => id2 === raw)) return raw;
  if (vm2.view === "articles") return "articles";
  if (vm2.view === "playbook") return "rules";
  return "cockpit";
}
function v13Accounts(data3) {
  const accounts = data3.benchmarkAccounts || [];
  if (!accounts.length) return empty2("暂无对标账号");
  const benchmarkArticles = data3.benchmarkArticles || [];
  const ownArticles = data3.articles || [];
  const accountBySampleId = new Map(benchmarkArticles.map((item) => [String(item.id), String(item.benchmark_account_id)]));
  const imitatedByAccount = /* @__PURE__ */ new Map();
  for (const article of ownArticles) {
    if (article.reference_article_id == null) continue;
    const ownerId = accountBySampleId.get(String(article.reference_article_id));
    if (ownerId) imitatedByAccount.set(ownerId, (imitatedByAccount.get(ownerId) || 0) + 1);
  }
  const totalImitations = [...imitatedByAccount.values()].reduce((sum, count3) => sum + count3, 0);
  const topAccount = accounts.map((account3) => ({ name: account3.name || "未命名账号", count: imitatedByAccount.get(String(account3.id)) || 0 })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count)[0] || null;
  const kpis = [
    `<article class="review-sub-kpi"><span>对标账号</span><strong>${e(reviewNumber(accounts.length))} 个</strong><small>当前账号参考库</small></article>`,
    `<article class="review-sub-kpi"><span>已仿写篇数</span><strong>${e(reviewNumber(totalImitations))} 篇</strong><small>已关联样本引用</small></article>`,
    topAccount ? `<article class="review-sub-kpi"><span>主力对标</span><strong>${e(topAccount.name)}</strong><small>仿写 ${e(reviewNumber(topAccount.count))} 篇</small></article>` : "",
    benchmarkArticles.length ? `<article class="review-sub-kpi"><span>已建档样本</span><strong>${e(reviewNumber(benchmarkArticles.length))} 篇</strong><small>爆文库可复用样本</small></article>` : ""
  ].filter(Boolean).join("");
  const cards = accounts.map((account3) => {
    const topic = String(account3.topic_focus || "").trim();
    const rawPatterns = parseJson(account3.title_patterns, []);
    const patterns = Array.isArray(rawPatterns) ? rawPatterns.filter((item) => typeof item === "string" && item.trim()) : [];
    const structure = String(account3.structure_notes_md || "").trim();
    const structureParts = structure.includes("\n") ? [structure] : structure.split(/(?<=。)(?=\S)/u);
    const details = [
      topic ? `<section class="review-account-feature is-topic"><h4>选题方向</h4><div class="review-markdown">${renderReviewMarkdown(topic)}</div></section>` : "",
      patterns.length ? `<section class="review-account-feature is-title"><h4>标题特点</h4><div class="review-markdown">${patterns.map((item) => renderReviewMarkdown(item)).join("")}</div></section>` : "",
      structure ? `<details class="review-account-feature review-account-more"><summary><h4>其他特点</h4></summary><div
        class="review-markdown">${structureParts.map((part) => renderReviewMarkdown(part)).join("")}</div></details>` : ""
    ].join("");
    const profile = safeReviewUrl(account3.profile_url);
    const name = e(account3.name || "未命名账号");
    const fans = finiteNumber2(account3.fans);
    const imitated = imitatedByAccount.get(String(account3.id)) || 0;
    const pills = [
      fans !== null && fans > 0 ? `<span class="review-account-pill">${e(reviewNumber(fans))} 粉</span>` : "",
      imitated > 0 ? `<span class="review-account-pill is-hit">已仿写 ${e(reviewNumber(imitated))} 篇</span>` : ""
    ].filter(Boolean).join("");
    const cadence = String(account3.posting_cadence || "").trim();
    const cadenceHtml = cadence ? `<p class="review-account-cadence${/封号|停用/.test(cadence) ? " is-stopped" : ""}">${e(cadence)}</p>` : "";
    const link = profile ? `<a class="review-account-link" href="${e(profile)}" target="_blank" rel="noopener noreferrer">${name}</a>` : name;
    const pillRow = pills ? `<div class="review-account-pills">${pills}</div>` : "";
    const features = details || "<p>暂无特点记录</p>";
    return `<section class="review-v13-benchmark-group"><div class="review-v13-group-head"><h3>${link}</h3>${pillRow}</div>${cadenceHtml}<div class="review-v13-account-features">${features}</div></section>`;
  }).join("");
  return `<div class="review-benchmarks-panel"><div class="review-sub-kpis review-benchmarks-kpis">${kpis}</div><div class="review-benchmark-cards">${cards}</div></div>`;
}
function sectionBody(selected, data3, vm2, rows) {
  if (selected === "articles") return articleListPanel(rows, vm2, data3);
  if (selected === "benchmarks") return v13Accounts(data3);
  if (selected === "rules") return playbook(data3, vm2);
  if (selected === "prompts") return promptPage(data3, vm2);
  if (selected === "library") return renderBenchmarkLibrary(data3, vm2.account);
  return overview(data3, vm2);
}
var SECTION_ROWS = {
  cockpit: (d) => d.articles,
  articles: (d) => d.articles,
  benchmarks: (d) => d.benchmarkAccounts,
  library: (d) => d.benchmarkArticles,
  rules: (d) => d.playbooks,
  prompts: promptPageUpdateRows
};
function lastUpdated(rows = []) {
  let best = "";
  for (const row of rows || []) {
    const value = row?.updated_at || row?.created_at;
    if (typeof value === "string" && Number.isFinite(Date.parse(value)) && (!best || Date.parse(value) > Date.parse(best))) best = value;
  }
  return best;
}
function sectionUpdated(data3, id2) {
  return lastUpdated(SECTION_ROWS[id2]?.(data3) || []);
}
function updatedLine(data3, selected) {
  const times = REVIEW_SECTIONS.map(([id2, label2]) => [label2, sectionUpdated(data3, id2)]).filter(([, time4]) => time4);
  if (!times.length) return "";
  const [label, time3] = times.reduce((a, b) => Date.parse(b[1]) > Date.parse(a[1]) ? b : a);
  const own3 = sectionUpdated(data3, selected);
  return `<p class="review-updated-line"><span>内容复盘最近更新 <time datetime="${e(time3)}">${e(reviewDateTime2(time3))}</time><span class="review-note">（${e(label)}）</span></span>` + (own3 ? `<span class="review-section-updated">本页最近更新 <time datetime="${e(own3)}">${e(reviewDateTime2(own3))}</time></span>` : "") + `<span class="review-note">北京时间</span></p>`;
}
function archives(data3, vm2, rows, override, archive = "") {
  const selected = activeSection(vm2);
  const body4 = override ?? sectionBody(selected, data3, vm2, rows);
  const labelById = new Map(REVIEW_SECTIONS);
  const tabHtml = (id2) => `<button type="button" id="review-secondary-${id2}" role="tab" data-review-secondary="${id2}" aria-controls="review-secondary-panel" aria-selected="${selected === id2}" tabindex="${selected === id2 ? "0" : "-1"}">${e(labelById.get(id2) || id2)}</button>`;
  const groupsHtml = REVIEW_SECTION_GROUPS.flatMap(([, , ids]) => ids).map(tabHtml).join("");
  return `<section class="review-secondary"><div class="review-secondary-bar"><div class="review-secondary-tabs" role="tablist" aria-label="内容复盘">${groupsHtml}</div>${archive}</div>${updatedLine(data3, selected)}<div class="review-secondary-panel" id="review-secondary-panel" role="tabpanel" aria-labelledby="review-secondary-${selected}">${body4}</div></section>`;
}
function metricChange(label, current3, previous, prefix = "") {
  const delta2 = metricDelta(current3, previous);
  const head = prefix ? `${label} ${prefix}` : label;
  if (delta2 === null) return `<small class="review-stat-change">${e(head)} —</small>`;
  if (delta2 === 0) return `<small class="review-stat-change">${e(head)} 持平</small>`;
  const tone = delta2 > 0 ? " up" : " down";
  return `<small class="review-stat-change${tone}">${e(head)} ${delta2 > 0 ? "+" : ""}${delta2}%</small>`;
}
function statCard(label, body4, change3) {
  return `<article class="review-stat"><span>${label}</span>${body4}${change3}</article>`;
}
function overview(data3, vm2) {
  const range2 = ["this", "last", "30d"].includes(vm2.filters?.metricsRange) ? vm2.filters.metricsRange : "this";
  const current3 = reviewOverviewMetrics(data3, { account: vm2.account, range: range2, now: vm2.now || (/* @__PURE__ */ new Date()).toISOString() });
  const noSample = range2 !== "last" && current3.observedCount === 0;
  const value = (formatted) => noSample ? '<strong class="review-stat-empty">数据未满24h</strong>' : `<strong>${e(formatted)}</strong>`;
  const earlier = current3.previous || {};
  const change3 = (left, right, prefix = "") => current3.comparisonLabel ? metricChange(current3.comparisonLabel, left, right, prefix) : "";
  const publishSummary = `<div class="review-publish-summary" role="status" aria-label="发布状态">
    <span class="review-publish review-publish-pending">待发布 <strong>${e(current3.pendingCount ?? 0)}</strong></span>
    <span class="review-publish review-publish-published">已发布 <strong>${e(current3.count)}</strong></span>
    ${current3.unmatchedCount || 0 ? `<span class="review-publish review-publish-unmatched">未能对上 <strong>${e(current3.unmatchedCount)}</strong></span>` : ""}
    <span class="review-note">阅读、点击率、爆 / 中 / 扑只统计已发布。待发布在草稿箱里，不进入这些数字。</span></div>`;
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
  return `<section class="review-overview-metrics" aria-label="文章指标"><div class="review-filters"><label>统计时间<select class="input" data-review-filter="metricsRange">${options2([["this", "本周"], ["last", "上周"], ["30d", "近30天"]], range2)}</select></label><button class="btn text review-inline-refresh" type="button" data-review-action="refresh">刷新</button></div><div class="review-stats">${cards}</div>${publishSummary}${renderCockpitTrends(data3, vm2, current3.window)}</section>` + weeklyLink(data3, vm2);
}
function weeklyLink(data3, vm2) {
  const [latest2] = weeklyReviews(data3.reports, vm2.account);
  if (!latest2) return "";
  const week = `${String(latest2.period_start || "").slice(5).replace("-", "月")}日–${String(latest2.period_end || "").slice(5).replace("-", "月")}日`;
  return `<p class="review-weekly-link"><a href="?page=ai-reports&amp;ai_tab=weekly&amp;account=${encodeURIComponent(vm2.account)}">看周复盘（${e(week)}）→</a></p>`;
}
function articleListPanel(rows, vm2, data3) {
  return `<section class="review-panel review-articles-panel" data-review-articles-expanded="true">
<h2 class="review-articles-heading review-sr-only">文章列表</h2>
<div id="review-article-library" class="review-article-library">${articleLibrary(rows, vm2, data3)}</div></section>`;
}
function articleLibrary(rows, vm2, data3) {
  const unmatchedRows = rows.filter((row) => reviewPublishState(row) === "unmatched");
  const flaggedItem = (row) => `<li><button type="button" class="review-title-button" data-review-article="${e(row.id)}" aria-haspopup="dialog">${publishBadge(row)} ${e(row.title || "未命名文章")}</button></li>`;
  const flagged = unmatchedRows.length ? `<details class="review-unmatched" data-review-keep-open="unmatched"><summary>未能对上 ${e(unmatchedRows.length)} 篇</summary><p>这些记录对不上草稿箱里的同一篇，没有计入发文、阅读和点击率。</p><ul>${unmatchedRows.map(flaggedItem).join("")}</ul></details>` : "";
  return renderArticleList(rows, vm2, data3.snapshots, flagged, tag);
}
var sections = [["keep_topic", "保留选题"], ["drop_topic", "放弃选题"], ["title", "标题"], ["body", "正文"], ["audience", "读者"], ["checklist", "发布检查"]];
var statuses2 = [["candidate", "待验证"], ["trial", "试用中"], ["kept", "有效"], ["dropped", "无效"], ["hold", "观察中"]];
function evidence(value) {
  if (value === null || value === void 0 || value === "") return "—";
  if (typeof value !== "object") return String(value);
  if (!value.metric) return "—";
  const labels4 = { ctr: "CTR", ctr_24h: "CTR", reads: "阅读", reads_24h: "阅读", completion_rate: "完读率", completion_24h: "完读率", avg_read_seconds: "平均阅读时长" };
  const key = value.metric, label = labels4[key] || key;
  return `命中 ${reviewNumber(value.n_with)} 篇，${label} ${reviewNumber(value.with_median, key)}；未命中 ${reviewNumber(value.n_without)} 篇，${label} ${reviewNumber(value.without_median, key)}`;
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
  const body4 = overridden ? `<details class="review-overridden-rule">
    <summary>已被${e(scopeLabel(overridden))}覆盖 · 查看原文</summary>${text}</details>` : `${rule.overridesScopes?.length ? '<p class="review-note">当前生效 · 覆盖上层同 ID 规则</p>' : ""}${text}`;
  return `<article class="review-v13-rule-row" id="review-rule-${id2}" data-rule-state="${state2}">
    <span class="review-v13-rule-id">${e(rule.rule_id || index)}</span>
    <div class="review-v13-rule-text review-markdown">${body4}</div>
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
  const intro = content2 ? `<details class="review-v13-intro"><summary>版本说明</summary><div class="review-markdown">${renderReviewMarkdown(content2)}</div></details>` : "";
  const groupedCounts = [];
  const groups = v13RuleGroups.map(([id2, label]) => {
    const group = rules2.filter((rule) => rule.section === id2);
    if (group.length) groupedCounts.push([id2, label, group.length]);
    return `<details class="review-v13-rule-group${group.length ? "" : " is-empty"}" data-rule-section="${e(id2)}"${group.length ? " open" : ""}><summary><span class="review-rule-group-label">${e(label)}</span> · ${ruleCountLabel(group)}</summary>${group.map((rule, index) => v13RuleRow(rule, index + 1, `${scope}:${book.id}`)).join("")}</details>`;
  }).join("");
  const ungrouped = rules2.filter((rule) => !v13RuleGroups.some(([id2]) => id2 === rule.section));
  if (ungrouped.length) groupedCounts.push(["other", "其他", ungrouped.length]);
  const other = ungrouped.length ? `<details class="review-v13-rule-group" data-rule-section="other" open><summary><span class="review-rule-group-label">其他</span> · ${ruleCountLabel(ungrouped)}</summary>${ungrouped.map((rule, index) => v13RuleRow(rule, index + 1, `${scope}:${book.id}`)).join("")}</details>` : "";
  const chips = groupedCounts.length ? `<div class="review-rule-section-chips">${groupedCounts.map(([id2, label, count3]) => `<span class="review-rule-chip" data-rule-section="${e(id2)}">${e(label)} <b>${e(count3)}</b></span>`).join("")}</div>` : "";
  return `<section class="review-v13-rules">
    <div class="review-v13-rule-meta"><h2>${e(title)}</h2>
    ${ownLayer ? ruleBookTimes(book) : '<span class="review-note review-rule-meta-pill">生效于 —</span>'}</div>
    ${chips}${intro}${groups}${other}</section>`;
}
function ruleBookTimes(book) {
  const since = reviewDateTime2(book.created_at) || day7(book.published_on) || "—", updated = reviewDateTime2(book.updated_at || book.created_at);
  return `<span class="review-note review-rule-meta-pill">生效 ${e(since)}</span>` + (updated ? `<span class="review-note review-rule-meta-pill">最后更新 ${e(updated)}</span>` : "");
}
var byLastUpdate = (a, b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0);
function promptPage(data3, vm2) {
  return renderPromptPage(data3, vm2);
}
function playbook(data3, vm2) {
  const books = currentPlaybooks(data3.playbooks, vm2.account);
  const layers = applicableScopes(vm2.account).map((scope) => {
    const matches2 = books.filter((book) => book.rules.some((rule) => scopeOf(rule.scope ?? book.account) === scope) || scopeOf(book.account) === scope);
    if (!matches2.length) return "";
    const layerRules = matches2.flatMap((book) => book.rules.filter((rule) => scopeOf(rule.scope ?? book.account) === scope));
    return `<details class="review-rule-layer" data-rule-scope="${e(scope)}"${scope === scopeOf(vm2.account) ? " open" : ""}>
      <summary class="review-rule-layer-title">${e(scopeLabel(scope))}<span class="review-note"> · ${ruleCountLabel(layerRules)}</span></summary>
      ${matches2.slice().sort(byLastUpdate).map((book) => renderRuleBook(book, scope)).join("")}</details>`;
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
function legacyArticleRecord(row) {
  const fields4 = [["topic_category", "选题分类"], ["title_pattern", "旧标题套路"], ["playbook_version_used", "手册版本"]];
  const values = fields4.filter(([key]) => row[key] != null && String(row[key]).trim());
  return values.length ? `<details class="review-article-legacy"><summary>旧记录</summary><dl>${values.map(([key, label]) => `<div><dt>${label}</dt><dd>${e(row[key])}</dd></div>`).join("")}</dl></details>` : "";
}
function drawer(data3, rows, vm2) {
  if (!vm2.article) return "";
  const row = rows.find((r) => String(r.id) === String(vm2.article));
  const close = '<button class="btn text review-drawer-close" type="button" data-review-action="close-article" aria-label="关闭文章详情">关闭 <span aria-hidden="true">×</span></button>';
  if (!row) return `<div class="review-drawer-overlay"><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1">${close}<h2 id="review-detail-title">未找到文章</h2><p>文章可能已移除或不属于当前账号。</p></aside></div>`;
  const basis = verdictBasis(row);
  const originalTitle = row.original_draft_title && row.original_draft_title !== row.title ? `<p class="review-note"><strong>原稿标题</strong> ${e(row.original_draft_title)}</p>` : "";
  return `<div class="review-drawer-overlay"><button class="review-drawer-backdrop" type="button" data-review-action="close-article" tabindex="-1" aria-label="关闭文章详情"></button><aside class="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-detail-title" tabindex="-1"><div class="review-drawer-header"><span class="review-note">文章详情</span>${close}</div><div class="review-detail-heading"><span class="review-note">${publishBadge(row)} ${e(reviewPublishState(row) === "pending" ? reviewDateTime2(row.draft_saved_at || row.created_at) || "入草稿时间未提供" : reviewDateTime2(row.published_at) || "发布时间未提供")} · 上海时间</span><h2 id="review-detail-title">${e(row.title || "未命名文章")}</h2>${originalTitle}${reviewPublishState(row) === "pending" ? '<p class="review-note">这篇还在草稿箱，阅读和点击率不计入统计。发布后会更新这一行。</p>' : reviewPublishState(row) === "unmatched" ? '<p class="review-unmatched-note">这篇没能对上草稿箱里的同一篇，没有计入发文、阅读和点击率。</p>' : ""}<div class="review-detail-links">${tag(row.verdict)}${external(row.url, "查看原文 ↗")}</div></div>${renderTrafficCard(data3.snapshots, row.id)}` + (basis ? `<p class="review-verdict-basis"><strong>判定依据</strong> ${e(basis)}</p>` : "") + renderDetailPatterns(row, vm2.tags) + renderImitation(row, data3, vm2.account) + renderArticleRemarks(row, data3.notes) + legacyArticleRecord(row) + "</aside></div>";
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
function renderContentReviewContent(data3, vm2) {
  data3 = scopedReviewData(data3, vm2.account);
  const archive = "";
  if (vm2.loading) return archive + '<p class="review-status" role="status" aria-live="polite">正在读取完整数据…</p>';
  if (vm2.error) return archive + `<div class="review-empty" role="alert"><strong>内容复盘读取失败</strong><p>${e(vm2.error)}</p><button class="btn" type="button" data-review-action="refresh">重新读取</button></div>`;
  const rows = enrichArticles(data3, { account: vm2.account });
  const hasData = ["articles", "snapshots", "reports", "playbooks", "benchmarkAccounts", "benchmarkArticles", "notes", "prompts"].some((key) => (data3[key] || []).length);
  const selected = activeSection(vm2);
  const quiet = !hasData && !["articles", "trends"].includes(selected);
  const body4 = archives(data3, vm2, rows, quiet ? empty2("暂无内容复盘数据") + '<button class="btn text" type="button" data-review-action="refresh">刷新</button>' : void 0, archive);
  return `<div class="review-body"${vm2.article ? " inert" : ""}>${body4}</div>${drawer(data3, rows, vm2)}`;
}

// web/ai-settings-controller.mjs
init_state();
var registered3 = false;
var visible2 = () => state.page === "settings" && state.settingsTab === "ai";
function paint3() {
  const node3 = document.querySelector("#ai-settings");
  if (!visible2() || !node3) return;
  const active5 = document.activeElement, focus = node3.contains(active5) && active5.dataset.aiSetting ? [
    active5.dataset.aiSetting,
    active5.dataset.aiFeature || ""
  ] : null;
  node3.outerHTML = renderAiSettings(reviewAiView());
  if (focus) document.querySelector(`#ai-settings [data-ai-setting="${focus[0]}"]${focus[1] ? `[data-ai-feature="${focus[1]}"]` : ""}`)?.focus({ preventScroll: true });
}
function register2() {
  if (registered3) return;
  registered3 = true;
  watchReviewAi(paint3);
  document.addEventListener("change", (event) => {
    if (visible2() && event.target.closest?.("#ai-settings") && reviewAiInput(event.target)) paint3();
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "ai-settings-form") return;
    event.preventDefault();
    if (visible2()) void saveReviewAiSettings();
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest?.("#ai-settings [data-ai-action]");
    if (target && visible2()) reviewAiClick(target, { account: state.account || "V字" });
  });
}
function aiSettingsPage() {
  register2();
  return renderAiSettings(reviewAiView().status === "idle" ? { status: "loading" } : reviewAiView());
}
async function loadAiSettings() {
  register2();
  await loadReviewAi(state.account || "V字", { force: true });
  if (reviewAiView().data?.configured) void loadReviewAiModels();
}

// web/review-controller.mjs
var resources = ["articles", "snapshots", "reports", "playbooks", "benchmark-accounts", "benchmark-articles", "notes", "account-health", "prompts/current"];
var data2 = normalizeReviewData(), sequence4 = 0, registered4 = false, identity4 = "", pageContext2;
var vm = {
  account: "V字",
  view: "overview",
  secondary: "cockpit",
  week: "this",
  date: "",
  start: "",
  end: "",
  periods: [],
  filters: {},
  article: "",
  version: "",
  compare: "",
  loading: true,
  error: ""
};
var root2 = () => typeof document === "undefined" ? null : document.querySelector("#content-review");
function staleRead(message = "复盘资料在读取时发生变化，请重新读取。") {
  return Object.assign(new Error(message), { code: "READ_REVISION_CHANGED" });
}
var REVIEW_PAGE_AHEAD = 3;
async function readReviewCollection(read2, resource, selectedAccount, current3 = () => true) {
  if (!resources.includes(resource)) throw new Error("未知的复盘资料类型。");
  const items = [], seen = /* @__PURE__ */ new Set(), foreignIds = /* @__PURE__ */ new Set();
  const accountQuery = resource === "playbooks" ? "" : `account=${encodeURIComponent(selectedAccount)}&`;
  let revision2;
  const fetchPage = (offset) => read2(`/review/${resource}?${accountQuery}offset=${offset}` + (revision2 === void 0 ? "" : `&read_revision=${encodeURIComponent(revision2)}`));
  const accept = (page) => {
    if (!Array.isArray(page?.items) || typeof page.has_more !== "boolean" || page.items.length > 100 || page.has_more && page.items.length !== 100) throw new Error("复盘分页资料不完整，请重新读取。");
    if (page.read_revision !== void 0) {
      if (revision2 !== void 0 && revision2 !== page.read_revision) throw staleRead();
      revision2 = page.read_revision;
    }
    for (const row of page.items) {
      if (!row || typeof row !== "object" || row.id === null || row.id === void 0 || seen.has(String(row.id)))
        throw staleRead("复盘资料存在重复或无效记录，请重新读取。");
      seen.add(String(row.id));
      if (!["snapshots", "playbooks", "prompts/current"].includes(resource) && row.account !== selectedAccount) {
        foreignIds.add(String(row.id));
        continue;
      }
      items.push(row);
    }
    return page.has_more;
  };
  const first = await fetchPage(0);
  if (!current3()) return null;
  for (let offset = 100, more = accept(first); more; offset += 100 * REVIEW_PAGE_AHEAD) {
    const pages = await Promise.all(Array.from({ length: REVIEW_PAGE_AHEAD }, (_, index) => fetchPage(offset + index * 100)));
    if (!current3()) return null;
    for (const page of pages) if (more) more = accept(page);
  }
  return { items, read_revision: revision2, foreignIds };
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
    } catch (error2) {
      if (!current3()) return null;
      if (error2.code !== "READ_REVISION_CHANGED" || attempt) throw error2;
    }
  }
}
function reviewRoute(href, defaultAccount = vm.account) {
  const p = new URL(href).searchParams, legacy2 = p.get("review_view");
  const requested = p.get("tab") || (legacy2 === "playbooks" ? "playbook" : legacy2);
  const view3 = REVIEW_VIEWS.some(([id2]) => id2 === requested) ? requested : "overview";
  const section = p.get("review_section");
  const benchmark = p.get("review_benchmark") || "";
  const listed = REVIEW_SECTIONS.some(([id2]) => id2 === section) ? section : "";
  const secondary = benchmark ? "library" : listed || (section === "trends" ? "cockpit" : "") || (section === "review" || section === "playbook" || view3 === "playbook" ? "rules" : view3 === "articles" ? "articles" : "cockpit");
  const trendRange = p.get("review_trend_range");
  const trends = {
    range: ["7d", "30d", "custom"].includes(trendRange) ? trendRange : "30d",
    from: p.get("review_trend_from") || "",
    to: p.get("review_trend_to") || ""
  };
  return {
    account: p.get("account")?.trim() || defaultAccount,
    view: view3,
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
  if (!url.searchParams.has("tab")) url.searchParams.set("tab", vm.view);
  history.replaceState({}, "", url);
}
function syncViewFromRoute() {
  vm = { ...vm, ...route(), loading: false, error: "" };
}
function focusBenchmark(id2) {
  if (!id2) return;
  const node3 = document.getElementById(`review-benchmark-${encodeURIComponent(id2)}`);
  if (!node3 || !root2()?.contains(node3)) return;
  node3.scrollIntoView({ block: "start" });
  node3.focus({ preventScroll: true });
}
var searchTimer;
var returnFocusId = "", returnScroll = 0;
function syncReviewFullscreen() {
  const node3 = root2(), button2 = node3?.querySelector('[data-review-action="toggle-fullscreen"]');
  if (!button2) return;
  const active5 = node3.classList.contains("review-list-fullscreen");
  button2.textContent = active5 ? "退出全屏" : "全屏展示";
  button2.setAttribute("aria-pressed", String(active5));
}
async function toggleReviewFullscreen() {
  const node3 = root2();
  if (!node3) return;
  if (node3.classList.contains("review-list-fullscreen")) {
    node3.classList.remove("review-list-fullscreen");
    if (document.fullscreenElement === node3) await document.exitFullscreen().catch(() => {
    });
  } else {
    node3.classList.add("review-list-fullscreen");
    if (node3.requestFullscreen) await node3.requestFullscreen().catch(() => {
    });
  }
  syncReviewFullscreen();
}
var aiContext = () => ({
  account: vm.account,
  playbooks: () => data2.playbooks,
  reload: () => void loadContentReview(pageContext2),
  applyPlaybook: (saved) => {
    data2 = { ...data2, playbooks: data2.playbooks.map((item) => String(item.id) === String(saved.id) ? { ...item, ...saved } : item) };
  }
});
function paintContentReviewPage() {
  const node3 = root2();
  if (!node3) return;
  vm.ai = reviewAiView();
  const focused = document.activeElement;
  const aiSelection = focused?.dataset?.aiOnce;
  const search = focused?.matches("[data-review-search]") ? focused : null;
  const open = new Set([...node3.querySelectorAll("[data-review-keep-open][open]")].map((el3) => el3.dataset.reviewKeepOpen));
  node3.innerHTML = renderContentReviewContent(data2, vm);
  for (const details of node3.querySelectorAll("[data-review-keep-open]")) {
    details.open = open.has(details.dataset.reviewKeepOpen);
  }
  if (aiSelection) node3.querySelector(`[data-ai-once="${aiSelection}"]`)?.focus({ preventScroll: true });
  const nextSearch = search && node3.querySelector("[data-review-search]");
  if (nextSearch) {
    nextSearch.value = search.value;
    nextSearch.focus({ preventScroll: true });
    if (search.selectionStart !== null) nextSearch.setSelectionRange(search.selectionStart, search.selectionEnd, search.selectionDirection);
  }
  syncReviewFullscreen();
  const dialog = node3.querySelector('[role="dialog"]');
  for (const child of node3.children) if (child !== dialog?.parentElement && dialog) child.inert = true;
  if (dialog) dialog.querySelector(".review-drawer-close")?.focus({ preventScroll: true });
}
async function loadContentReview(context) {
  registerEvents();
  pageContext2 = context;
  const [{ apiNetwork: apiNetwork2 }, { state: state2, runtime: runtime2 }] = await Promise.all([Promise.resolve().then(() => (init_api(), api_exports)), Promise.resolve().then(() => (init_state(), state_exports))]);
  const requested = route(), currentIdentity = `${runtime2.sessionEpoch}:${state2.me?.id || ""}:${requested.account}`;
  if (identity4 !== currentIdentity) {
    clearTimeout(searchTimer);
    data2 = normalizeReviewData();
    vm.filters = savedArticleView();
    vm.tags = null;
    identity4 = currentIdentity;
  }
  vm = { ...vm, ...requested, archiveAllowed: false, loading: true, error: "" };
  paintContentReviewPage();
  const ticket2 = ++sequence4, epoch = runtime2.sessionEpoch;
  const current3 = () => ticket2 === sequence4 && epoch === runtime2.sessionEpoch && state2.page === "review" && route().account === requested.account && Boolean(root2());
  const read2 = (path) => apiNetwork2(path, context ? { context } : {});
  try {
    const result = await readContentReviewDataWithRetry(read2, requested.account, current3);
    if (!current3() || !result) return;
    data2 = result;
    syncViewFromRoute();
    paintContentReviewPage();
    focusBenchmark(vm.benchmark);
    void loadReviewAi(requested.account, { force: true });
    void loadArticleTags(read2, requested.account, current3);
  } catch (error2) {
    if (!current3() || error2.name === "AbortError") return;
    vm.loading = false;
    vm.error = error2.message || "读取失败，请稍后重试。";
    paintContentReviewPage();
  }
}
async function loadArticleTags(read2, account3, current3) {
  try {
    const tags = await read2("/review/ai/tags?account=" + encodeURIComponent(account3));
    if (!current3()) return;
    vm.tags = tags && Array.isArray(tags.dimensions) ? tags : null;
    paintContentReviewPage();
  } catch {
    if (current3()) {
      vm.tags = null;
      paintContentReviewPage();
    }
  }
}
function closeArticle() {
  vm.article = "";
  writeRoute({ article: "" });
  paintContentReviewPage();
  const node3 = [...root2()?.querySelectorAll("[data-review-article]") || []].find((el3) => el3.dataset.reviewArticle === returnFocusId);
  node3?.focus({ preventScroll: true });
  window.scrollTo({ top: returnScroll, behavior: "instant" });
}
function changeTrend(target) {
  const key = target.dataset.reviewTrend;
  if (!["range", "from", "to"].includes(key)) return;
  const today2 = day7((/* @__PURE__ */ new Date()).toISOString());
  vm.trends = { ...vm.trends, [key]: target.value };
  if (key === "range" && vm.trends.range === "custom") {
    vm.trends.from ||= shiftDay4(today2, -6);
    vm.trends.to ||= today2;
  }
  writeRoute({ ...Object.fromEntries(Object.entries(vm.trends).map(([name, value]) => [`trend_${name}`, value])), trend_metric: "" });
  paintContentReviewPage();
  root2()?.querySelector(`[data-review-trend="${key}"]`)?.focus({ preventScroll: true });
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
async function reviewWrite(path, options3) {
  const { apiNetwork: apiNetwork2 } = await Promise.resolve().then(() => (init_api(), api_exports));
  return apiNetwork2(path, options3 || {});
}
async function copyPromptText(button2, text) {
  const status = button2.closest(".review-prompt-card")?.querySelector("[data-prompt-copy-status]");
  button2.disabled = true;
  if (status) status.textContent = "正在复制…";
  try {
    if (!navigator.clipboard?.writeText) throw new Error("当前浏览器不支持剪贴板，请从页面上的全文手动复制。");
    await navigator.clipboard.writeText(text);
    if (status?.isConnected) status.textContent = "已复制完整提示词。";
  } catch (error2) {
    if (status?.isConnected) status.textContent = error2.message || "复制失败，请从页面上的全文手动复制。";
  } finally {
    if (button2.isConnected) button2.disabled = false;
  }
}
async function copyPromptButton(button2) {
  const status = button2.closest(".review-prompt-card, .review-current-prompt")?.querySelector("[data-prompt-copy-status]");
  button2.disabled = true;
  if (status) status.textContent = "正在复制…";
  try {
    await copyReviewPrompt(data2.prompts, vm.account, button2.dataset.promptId);
    if (status?.isConnected) status.textContent = "已复制完整提示词。";
  } catch (error2) {
    if (status?.isConnected) status.textContent = error2.message;
  } finally {
    if (button2.isConnected) button2.disabled = false;
  }
}
function describeTrendPoint(event, leaving) {
  const point = event.target.closest?.("[data-trend-readout]");
  const target = point?.closest(".review-trend-figure")?.querySelector("[data-trend-readout-target]");
  if (target && root2()?.contains(target)) target.textContent = leaving ? target.dataset.default : point.dataset.trendReadout;
}
function onReviewClick(event) {
  const node3 = root2();
  const benchmarkLink = event.target.closest?.("a[data-review-benchmark]");
  if (benchmarkLink && node3?.contains(benchmarkLink)) {
    event.preventDefault();
    vm.article = "";
    vm.secondary = "library";
    vm.benchmark = benchmarkLink.dataset.reviewBenchmark;
    writeRoute({ section: "library", article: "", benchmark: vm.benchmark });
    paintContentReviewPage();
    focusBenchmark(vm.benchmark);
    return;
  }
  if (event.target.closest?.("a")) return;
  const target = event.target.closest?.("button,[data-review-row]");
  if (!target || !node3?.contains(target)) return;
  if (target.dataset.reviewAction === "toggle-fullscreen") {
    void toggleReviewFullscreen();
    return;
  }
  if (target.dataset.reviewAction === "show-health") {
    vm.view = "overview";
    vm.secondary = "attention";
    vm.article = "";
    writeRoute({ view: "overview", section: "attention", article: "" });
    paintContentReviewPage();
    const history2 = node3.querySelector("#review-health-history");
    history2?.scrollIntoView({ behavior: "smooth", block: "start" });
    history2?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.reviewAction === "refresh") {
    void loadContentReview(pageContext2);
    return;
  }
  if (vm.loading || vm.error) return;
  if (target.dataset.reviewView) {
    chooseArticleView(target.dataset.reviewView);
    return;
  }
  if (changeArticleList(target)) return;
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
  if (target.dataset.reviewAction === "copy-prompt-block") {
    void copyPromptText(target, target.closest(".review-prompt-card")?.querySelector("pre")?.textContent || "");
    return;
  }
  if (target.dataset.reviewSecondary) {
    vm.secondary = target.dataset.reviewSecondary;
    vm.benchmark = "";
    writeRoute({ section: vm.secondary, benchmark: "" });
    paintContentReviewPage();
    root2()?.querySelector(`#review-secondary-${vm.secondary}`)?.focus({ preventScroll: true });
    return;
  }
  if (target.dataset.reviewWeek) {
    vm.week = target.dataset.reviewWeek;
    writeRoute({ week: vm.week });
    paintContentReviewPage();
    root2()?.querySelector(`[data-review-week="${vm.week}"]`)?.focus({ preventScroll: true });
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
    vm.article = article;
    vm.benchmark = "";
    writeRoute({ article, benchmark: "" });
    paintContentReviewPage();
  }
}
function onReviewKeydown(event) {
  const node3 = root2();
  if (!node3?.contains(event.target)) return;
  const dialog = node3.querySelector('[role="dialog"]');
  if (dialog) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeArticle();
      return;
    }
    if (event.key === "Tab") {
      const focusable = [...dialog.querySelectorAll('button:not([disabled]),a[href],summary,[tabindex="0"]')].filter((el3) => !el3.hidden && el3.getClientRects().length);
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
  if (event.key === "Escape" && node3.classList.contains("review-list-fullscreen")) {
    event.preventDefault();
    void toggleReviewFullscreen();
    return;
  }
  if (event.target.matches("[data-review-secondary]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const ids = REVIEW_SECTION_GROUPS.flatMap(([, , groupIds]) => groupIds);
    const current3 = vm.secondary === "review" ? "rules" : vm.secondary, index = Math.max(0, ids.indexOf(current3));
    vm.secondary = event.key === "Home" ? ids[0] : event.key === "End" ? ids.at(-1) : ids[(index + (event.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    vm.benchmark = "";
    writeRoute({ section: vm.secondary, benchmark: "" });
    paintContentReviewPage();
    root2()?.querySelector(`#review-secondary-${vm.secondary}`)?.focus({ preventScroll: true });
    return;
  }
  if (event.target.matches("[data-review-view]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const enabled = [...node3.querySelectorAll("[data-review-view]:not([disabled])")];
    const index = enabled.indexOf(event.target), step = event.key === "ArrowRight" ? 1 : -1;
    const next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1) : enabled[(index + step + enabled.length) % enabled.length];
    if (next) chooseArticleView(next.dataset.reviewView);
  }
}
function registerEvents() {
  if (registered4 || typeof document === "undefined") return;
  registered4 = true;
  watchReviewAi(() => {
    if (root2() && !vm.loading) paintContentReviewPage();
  });
  document.addEventListener("fullscreenchange", () => {
    const node3 = root2();
    if (node3?.classList.contains("review-list-fullscreen") && !document.fullscreenElement && node3.dataset.nativeFullscreen === "true") {
      node3.classList.remove("review-list-fullscreen");
      node3.dataset.nativeFullscreen = "";
    } else if (node3 && document.fullscreenElement === node3) node3.dataset.nativeFullscreen = "true";
    syncReviewFullscreen();
  });
  document.addEventListener("input", onArticleSearch);
  document.addEventListener("compositionend", onArticleSearch);
  document.addEventListener("click", onReviewClick);
  document.addEventListener("mouseover", (event) => describeTrendPoint(event, false));
  document.addEventListener("mouseout", (event) => describeTrendPoint(event, true));
  document.addEventListener("change", (event) => {
    const target = event.target;
    const node3 = root2();
    if (!node3?.contains(target) || vm.loading || vm.error) return;
    if (reviewAiInput(target)) return;
    if (target.dataset.reviewTrend) {
      changeTrend(target);
      return;
    }
    if (!target.dataset.reviewFilter) return;
    const key = target.dataset.reviewFilter;
    vm.filters[key] = target.value;
    paintContentReviewPage();
    const filterRoot = target.closest(".review-trends") ? root2()?.querySelector(".review-trends") : root2();
    filterRoot?.querySelector(`[data-review-filter="${key}"]`)?.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", onReviewKeydown);
  window.addEventListener("popstate", () => {
    if (!root2()) return;
    const next = route();
    if (next.account !== vm.account) void loadContentReview(pageContext2);
    else {
      syncViewFromRoute();
      paintContentReviewPage();
      focusBenchmark(vm.benchmark);
    }
  });
}
var ARTICLE_VIEW_KEY = "haoduoyu-review-article-view";
var ARTICLE_DENSITY_KEY = "haoduoyu-review-article-density";
function savedArticleView() {
  try {
    return { group: localStorage.getItem(ARTICLE_VIEW_KEY) || "", density: articleDensity(localStorage.getItem(ARTICLE_DENSITY_KEY)) };
  } catch {
    return {};
  }
}
function chooseArticleDensity(value) {
  vm.filters.density = articleDensity(value);
  try {
    localStorage.setItem(ARTICLE_DENSITY_KEY, vm.filters.density);
  } catch {
  }
  paintContentReviewPage();
  root2()?.querySelector(`[data-review-density="${CSS.escape(vm.filters.density)}"]`)?.focus({ preventScroll: true });
}
function chooseArticleView(value) {
  vm.filters.group = value;
  try {
    localStorage.setItem(ARTICLE_VIEW_KEY, value);
  } catch {
  }
  paintContentReviewPage();
  root2()?.querySelector(`[data-review-view="${CSS.escape(value)}"]`)?.focus({ preventScroll: true });
}
function changeArticleList(target) {
  const { reviewSort, reviewPattern, reviewDimension, reviewPatternClear, reviewDensity } = target.dataset;
  if (reviewDensity !== void 0) {
    chooseArticleDensity(reviewDensity);
    return true;
  }
  if (reviewSortKeys.includes(reviewSort)) {
    const current3 = vm.filters.sort;
    const ascending = current3?.key === reviewSort && current3.direction === "descending";
    const group = target.closest("[data-review-keep-open]")?.dataset.reviewKeepOpen;
    vm.filters.sort = { key: reviewSort, direction: ascending ? "ascending" : "descending" };
    paintContentReviewPage();
    const container = group ? [...root2().querySelectorAll("[data-review-keep-open]")].find((el3) => el3.dataset.reviewKeepOpen === group) : root2();
    container?.querySelector(`[data-review-sort="${reviewSort}"]`)?.focus({ preventScroll: true });
    return true;
  }
  if (reviewPattern === void 0 && reviewPatternClear === void 0) return false;
  vm.filters.pattern = reviewPattern === void 0 ? null : { dimension: reviewDimension, name: reviewPattern };
  paintContentReviewPage();
  const selector = vm.filters.pattern ? "[data-review-pattern-clear]" : "[data-review-search]";
  root2()?.querySelector(selector)?.focus({ preventScroll: true });
  return true;
}
function onArticleSearch(event) {
  const target = event.target;
  if (!target.matches?.("[data-review-search]") || !root2()?.contains(target)) return;
  clearTimeout(searchTimer);
  if (event.isComposing) return;
  const query = target.value;
  searchTimer = setTimeout(() => {
    vm.filters.query = query;
    if (!vm.loading && !vm.error) paintContentReviewPage();
  }, 200);
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
var reviewHomeHref = "?page=review&account=V%E5%AD%97";
var PAGE_HEADERS = {
  review: ["内容复盘", "数据表现与爆款方法沉淀"],
  todos: ["每日待办", "今日任务与日程安排"],
  notes: ["碎碎念", "随时记录想法与状态"],
  ideas: ["想法池", "碎碎念里的灵感，想好了就转成待办"],
  "ai-reports": ["AI 日报", "待拍板、日报和周报"],
  settings: ["设置", "待办偏好、AI 配置与账号安全"]
};
function renderPageHeader() {
  const [defaultTitle, defaultSub] = PAGE_HEADERS[state.page] || PAGE_HEADERS.review;
  const title = defaultTitle, subtitle = defaultSub;
  const name = state.account || "V字";
  const account3 = ["review", "ai-reports"].includes(state.page) ? `<span class="page-account-pill"><span aria-label="当前账号">${e(name)}</span></span>` : "";
  const actions2 = account3 ? `<div class="head-actions">${account3}</div>` : "";
  return `<div class="heading-left"><div class="page-head-titles"><h1>${e(title)}</h1><p class="page-head-sub">${e(subtitle)}</p></div></div>${actions2}`;
}
function mainContent() {
  const settingsChoices = state.me?.publicBusiness ? { todo: settingsTabs.todo, ai: settingsTabs.ai } : settingsTabs;
  const tabs = state.page === "settings" ? segmented("settings-tab", Object.entries(settingsChoices), state.settingsTab, "设置分类", "tab", "page-tabs") : "";
  return `<div id="page-header" class="page-head">${renderPageHeader()}</div>${tabs}<div id="page-content"></div>` + (state.page === "settings" ? '<section class="card panel settings-offline-card" aria-label="本地待处理"><h2>本地待处理</h2><p class="hint">后台会自动同步；如有冲突，可在这里查看和处理。</p><div id="offline-settings-entry"></div></section>' : "");
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
  if (state.page === "settings" && (!Object.hasOwn(settingsTabs, state.settingsTab) || state.me?.publicBusiness && !["todo", "ai"].includes(state.settingsTab)))
    state.settingsTab = "todo";
  stopPageEntry();
  closePopover({ restoreFocus: false });
  if (reuseShell()) {
    renderPage();
    return;
  }
  $("#app").innerHTML = `<div class="shell" data-session="${runtime.sessionEpoch}" data-user="${e(state.me.id)}"><aside id="site-nav" class="sidebar" aria-label="主要导航"><div class="sidebar-brand"><a href="?page=review&amp;account=${e(encodeURIComponent(state.account || "V字"))}" class="brand" data-nav="review"><span class="brand-mark">${icon("fish", 27)}</span><span class="brand-title">好多鱼工作台</span></a><button class="icon-button mobile-menu" data-action="menu" aria-label="关闭导航" aria-expanded="false" aria-controls="site-nav">${icon(
    "close"
  )}</button></div><nav class="nav-list" tabindex="0" aria-label="模块导航">${sidebarNavigation()}</nav><div class="sidebar-bottom">${settingsNavigation()}</div></aside>${renderSidebarResizer()}<div class="workspace"><header class="mobile-bar"><span>好多鱼工作台</span><a class="icon-button mobile-settings-trigger" href="?page=settings&amp;tab=todo" data-nav="settings" aria-label="设置">${icon("settings", 20)}</a></header><main id="main" class="content" tabindex="-1">${mainContent()}</main>${mobileNavigation()}</div></div>`;
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
  const same3 = target === state.page && (page !== "settings" || state.settingsTab === "todo") && (page !== "todos" || !state.todoDate && !state.todoPanel);
  if (same3 && !$("#overlay")?.firstChild && !runtime.activePopover) {
    setMenu(false);
    return;
  }
  navigate(page);
}
function navigate(page, tab) {
  page = mobilePage(page);
  const legacy2 = Object.hasOwn(legacyPages, page) ? legacyPages[page] : null;
  if (legacy2) page = "settings";
  if (!nav.some((n) => n.id === page)) return;
  state.page = page;
  if (page === "todos") {
    state.todoDate = "";
    state.todoPanel = "";
  }
  if (page === "settings") {
    const resolved = tab === "keys" || tab === "openai" ? "ai" : tab === "workspace" ? "todo" : tab;
    state.settingsTab = legacy2 || (Object.hasOwn(settingsTabs, resolved) ? resolved : "todo");
  }
  updateRoute(true, { exitReviewArchive: true });
  closeModal();
  renderShell();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function pageLoading(page) {
  if (page === "review") return renderContentReview();
  if (page === "todos") return renderTodos();
  if (page === "notes") return renderDailyNotes();
  if (page === "ai-reports") return renderAiReports();
  if (page === "ideas") return renderIdeas();
  return skeleton();
}
function setPageBody(html, page) {
  if (page === "review") {
    if (html) replacePageContent(html, true);
    else paintContentReviewPage();
  } else if (page === "todos") paintTodos();
  else if (page === "notes") paintDailyNotesPage();
  else if (page === "ai-reports") return;
  else replacePageContent(html, true);
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
    let html = "";
    switch (page) {
      case "todos":
        html = renderTodos();
        break;
      case "notes":
        await loadDailyNotes();
        break;
      case "ai-reports":
        await loadAiReports({ resetDate: true });
        break;
      case "ideas":
        html = await loadIdeas(context);
        break;
      case "review":
        await loadContentReview(context);
        break;
      case "settings":
        if (state.settingsTab === "todo") {
          await loadTodoPreferences(context);
          html = renderTodoSettings();
        } else if (state.settingsTab === "ai") {
          const keys = state.me?.publicBusiness ? null : await api("/api-keys", { context });
          html = `${aiSettingsPage()}${keys ? `<div class="settings-keys-card">${renderKeys(keys)}</div>` : ""}`;
          void loadAiSettings();
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
        counter.hidden = true;
        counter.textContent = "";
      }
    }
  } catch (err) {
    if (!isRequestAbort(err) && !err.staleSession && version2 === runtime.renderVersion && state.me) setPageBody(`<div class="card error-panel" role="alert"><span class="empty-icon">${icon("info", 23)}</span><h3>本次数据读取失败</h3><p>${e(err.message)}</p><button class="btn" data-action="refresh">${icon("refresh")}重新加载</button></div>`, page);
  } finally {
    if (version2 === runtime.renderVersion) $("#page-content")?.setAttribute("aria-busy", "false");
  }
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
    sessionStarted();
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
  const listen = (target, name, handler, options3 = true) => {
    target.addEventListener(name, handler, options3);
    listeners2.push(() => target.removeEventListener(name, handler, options3));
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
  if (state2.historyIncomplete) return "近期离线可用 · 历史按需";
  if (state2.historyRemaining) return `历史同步中（剩 ${state2.historyRemaining} 天）`;
  if (state2.pending) return `待同步（${state2.pending} 条）`;
  return "查看同步状态";
}
function textNode(document2, tag2, text, className) {
  const node3 = document2.createElement(tag2);
  node3.textContent = text;
  if (className) node3.className = className;
  return node3;
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
  for (const [choice, label] of [["use-local", localLabel], ["use-server", "用线上"], ["keep-both", "两份都留"]]) {
    const button2 = textNode(document2, "button", label, "btn text");
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
        const result = await runtime2.resolve(conflict.key, choice, {
          signal: controller.signal,
          expected: conflictDecisionToken(conflict),
          copyConfirmed: localLabel === "另存本地副本"
        });
        requests.message(conflict.key, result.blocked ? result.resolution_message : "");
      } catch (error2) {
        requests.message(conflict.key, error2.name === "AbortError" ? "本次选择已取消，原文仍保留。" : error2.message);
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
  let label = "";
  if (page === "settings" && !state2.online) label = "设置需联网后使用。";
  if (page === "todos" && state2.partial) label = "当前仅显示本机已保存的事项，完整列表需联网读取。";
  if (page === "dashboard" && !state2.online && state2.cachedAt) label = "数据截至 " + new Date(state2.cachedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  if (label && header) {
    if (!banner) {
      banner = textNode(document2, "p", "", "offline-page-note");
      banner.id = "offline-page-note";
      header.append(banner);
    }
    if (banner.textContent !== label) banner.textContent = label;
  } else banner?.remove();
  const content2 = document2.querySelector("#page-content");
  if (content2) {
    const unavailable2 = page === "settings" && !state2.online;
    content2.inert = unavailable2;
    if (unavailable2 || content2.dataset.offlineHidden === "true") content2.hidden = unavailable2;
    content2.dataset.offlineHidden = String(unavailable2);
  }
}
function historyControls(document2, runtime2, history2, refresh) {
  const root3 = document2.createDocumentFragment();
  root3.append(textNode(document2, "p", "自动离线仅保存最近 60 天；较早历史按需下载。本机历史可能不完整，已有历史和待提交内容均保留。"));
  const input = document2.createElement("input");
  input.type = "date";
  input.value = history2.date;
  input.setAttribute("aria-label", "要离线保存的历史日期");
  input.addEventListener("change", () => {
    history2.date = input.value;
  });
  const download = textNode(document2, "button", "保存这一天供离线查看", "btn text");
  download.type = "button";
  download.disabled = history2.busy;
  const message = textNode(document2, "p", history2.message);
  download.addEventListener("click", async () => {
    if (!input.value || history2.busy) return;
    history2.date = input.value;
    history2.busy = true;
    history2.message = "正在保存所选日期…";
    void refresh();
    try {
      const result = await runtime2.downloadDate(history2.date);
      history2.message = result.status === "synced" ? "所选日期已保存；其他历史仍需按需下载。" : "同步已暂停或其他页面正在处理，请稍后再试。";
    } catch (error2) {
      history2.message = error2.message;
    } finally {
      history2.busy = false;
      await refresh();
    }
  });
  root3.append(input, download, message);
  return root3;
}
function mountRuntimeUI(runtime2, { document: document2, window: window2 }) {
  let state2 = { ...runtime2.state }, expanded = false, rendering = 0;
  const history2 = { date: "", message: "", busy: false };
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
  const button2 = textNode(document2, "button", "", "btn text offline-settings-toggle");
  button2.type = "button";
  button2.setAttribute("aria-controls", "offline-queue");
  button2.setAttribute("aria-expanded", "false");
  const panel2 = document2.createElement("section");
  panel2.id = "offline-queue";
  panel2.className = "offline-queue";
  panel2.setAttribute("aria-label", "本机待同步内容与冲突");
  panel2.hidden = true;
  root3.append(button2, panel2);
  async function refreshQueue() {
    if (!expanded) return;
    const sequence5 = ++rendering, queue = await runtime2.queue();
    if (sequence5 !== rendering || !expanded) return;
    const title = textNode(document2, "h2", "同步状态");
    const details = document2.createDocumentFragment();
    if (state2.historyIncomplete) details.append(historyControls(document2, runtime2, history2, refreshQueue));
    if (state2.historyRemaining) details.append(textNode(
      document2,
      "p",
      `已保存的日期可离线读取，另有 ${state2.historyRemaining} 天历史正在分批补齐；历史尚未全部同步完成。`
    ));
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
    const label = state2.conflicts ? `查看待处理项（${state2.conflicts} 项冲突）` : state2.pending ? `查看待处理项（${state2.pending} 项）` : "查看待处理项";
    root3.hidden = !state2.identity;
    if (button2.textContent !== label) button2.textContent = label;
    root3.dataset.phase = state2.conflicts ? "conflict" : state2.phase;
    pageAnnotation(document2, state2);
  }
  button2.addEventListener("click", () => {
    expanded = !expanded;
    panel2.hidden = !expanded;
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
function node2(doc, tag2, text = "", className = "") {
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
  const main = node2(doc, "main", "", "floating-main");
  const head = node2(doc, "header", "", "floating-head");
  head.append(node2(doc, "time", "", "floating-date"));
  const close = node2(doc, "button", "", "floating-close");
  close.type = "button";
  close.setAttribute("aria-label", "关闭便签");
  head.append(close);
  close.addEventListener("click", () => pip.close());
  const tabs = node2(doc, "nav", "", "floating-tabs");
  tabs.setAttribute("aria-label", "便签内容");
  for (const [id2, text] of [["todos", "今日待办"], ["notes", "今日碎碎念"]]) {
    const button2 = node2(doc, "button", text);
    button2.type = "button";
    button2.dataset.tab = id2;
    tabs.append(button2);
  }
  const offline = node2(doc, "p", "", "floating-offline");
  offline.setAttribute("role", "status");
  const todo = node2(doc, "section", "", "floating-panel");
  todo.dataset.panel = "todos";
  todo.append(node2(doc, "h2", "⌄  今日待办", "floating-group-title"));
  const todoMessage = node2(doc, "p", "", "floating-message");
  todoMessage.setAttribute("role", "alert");
  const todoList = node2(doc, "ul", "", "floating-list");
  todo.append(todoMessage, todoList);
  const notes = node2(doc, "section", "", "floating-panel");
  notes.dataset.panel = "notes";
  notes.hidden = true;
  notes.append(node2(doc, "h2", "⌄  今日碎碎念", "floating-group-title"));
  const noteList = node2(doc, "ul", "", "floating-note-list");
  const newNote = node2(doc, "button", "写一条");
  newNote.type = "button";
  const notesInput = node2(doc, "textarea");
  notesInput.placeholder = "写下一点想说的话…";
  notesInput.setAttribute("aria-label", "碎碎念内容");
  notesInput.rows = 5;
  const labels4 = node2(doc, "fieldset", "", "floating-labels");
  labels4.append(node2(doc, "legend", "标签（可多选）"));
  const options3 = node2(doc, "div");
  labels4.append(options3);
  const noteMessage = node2(doc, "p", "", "floating-message");
  noteMessage.setAttribute("role", "status");
  const noteActions = node2(doc, "div", "", "floating-actions");
  const send = node2(doc, "button", "发送");
  send.type = "button";
  const check2 = node2(doc, "button", "核对保存结果");
  check2.type = "button";
  check2.hidden = true;
  const retry = node2(doc, "button", "重试原保存");
  retry.type = "button";
  retry.hidden = true;
  noteActions.append(send, check2, retry);
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
    options: options3,
    noteMessage,
    send,
    check: check2,
    retry
  };
}
function paintTodo(view3) {
  const day9 = todoDay(bjtDate());
  view3.head.querySelector("time").textContent = day9.date;
  view3.todoMessage.textContent = day9.error || (!day9.loaded && day9.loading ? "正在读取待办…" : "");
  const fragment = view3.doc.createDocumentFragment();
  for (const item of day9.items) {
    const removal = day9.removals.get(item.id);
    if (item.deleted_at || removal && removal.phase !== "restoring") continue;
    const li = node2(view3.doc, "li"), label = node2(view3.doc, "label"), check2 = node2(view3.doc, "input");
    check2.type = "checkbox";
    check2.dataset.todoId = item.id;
    check2.dataset.date = day9.date;
    check2.checked = day9.updates.has(item.id) ? day9.updates.get(item.id) : Boolean(item.completed);
    check2.disabled = !day9.loaded || todoBusy(day9, item.id);
    label.append(check2, node2(view3.doc, "span", item.text));
    li.append(label);
    if (check2.checked) li.classList.add("is-complete");
    fragment.append(li);
  }
  if (!day9.items.some((item) => !item.deleted_at) && day9.loaded) fragment.append(node2(view3.doc, "li", "今天还没有待办。", "floating-empty"));
  view3.todoList.replaceChildren(fragment);
}
function paintNotes(view3) {
  const snap = floatingNotesSnapshot(), item = snap?.item, page = snap?.page;
  const previousDate = Boolean(item && item.date !== snap?.date);
  const text = item?.draft || "";
  const fragment = view3.doc.createDocumentFragment();
  for (const record of snap?.entries || []) {
    const row = node2(view3.doc, "li");
    const content2 = record.legacy ? node2(view3.doc, "div") : node2(view3.doc, "button");
    if (!record.legacy) {
      content2.type = "button";
      content2.dataset.noteId = record.id;
      content2.dataset.category = record.category;
    }
    const time3 = record.createdAt || record.localCreatedAt || record.updatedAt;
    const caption = time3 && Number.isFinite(Date.parse(time3)) ? new Intl.DateTimeFormat(
      "zh-CN",
      { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
    ).format(new Date(time3)) : "";
    content2.append(
      node2(view3.doc, "small", [caption, record.legacy ? "原有记录 · 只读" : record.dirty ? "草稿" : ""].filter(Boolean).join(" · ")),
      node2(view3.doc, "span", record.dirty ? record.draft : record.draft ?? record.serverText ?? "")
    );
    row.append(content2);
    fragment.append(row);
  }
  view3.noteList.replaceChildren(fragment);
  view3.newNote.disabled = !page?.loaded || !page.canEdit;
  if ((view3.doc.activeElement !== view3.notesInput || !view3.doc.hasFocus()) && view3.notesInput.value !== text)
    view3.notesInput.value = text;
  view3.notesInput.disabled = !page?.loaded || !page.canEdit || item?.canEdit === false;
  view3.notesInput.readOnly = Boolean(view3.frozen);
  view3.labels.disabled = Boolean(view3.frozen) || !snap?.labelsVerified || !page?.canEdit || Boolean(item?.pending) || item?.labelComplete === false;
  const current3 = [...view3.options.querySelectorAll("input")].map((input) => input.value);
  const available = [.../* @__PURE__ */ new Set([...snap?.labels || [], ...item?.labels || []])];
  if (JSON.stringify(current3) !== JSON.stringify(available)) {
    const fragment2 = view3.doc.createDocumentFragment();
    for (const name of available) {
      const label = node2(view3.doc, "label"), input = node2(view3.doc, "input");
      input.type = "checkbox";
      input.value = name;
      label.append(input, node2(view3.doc, "span", name));
      fragment2.append(label);
    }
    view3.options.replaceChildren(fragment2);
  }
  for (const input of view3.options.querySelectorAll("input")) input.checked = Boolean(item?.labels?.includes(input.value));
  const blocked2 = item?.pending || item?.composing || ["unknown", "conflict", "oversize"].includes(item?.phase);
  view3.send.disabled = Boolean(view3.frozen) || !item?.dirty || Boolean(blocked2) || !item.canEdit || previousDate;
  view3.check.hidden = item?.phase !== "unknown";
  view3.check.disabled = Boolean(view3.frozen || item?.pending?.checking);
  view3.retry.hidden = item?.phase !== "unknown" || !item?.pending?.retryReady;
  view3.retry.disabled = Boolean(view3.frozen);
  view3.newNote.disabled ||= Boolean(view3.frozen);
  view3.noteMessage.textContent = item?.error || snap?.error || page?.error || snap?.draftError || snap?.labelError || (previousDate ? `此草稿属于 ${item.date}，请在原日期处理；点击“写一条”可继续今日记录。` : !page?.loaded ? "正在读取碎碎念…" : !page.canEdit ? "当前身份为只读。" : item?.phase === "queued" ? "已存本机，待同步。" : "");
}
function bindOfflineStatus(view3, active5) {
  let unsubscribe = () => {
  };
  const stop = onOfflineRuntime((runtime2) => {
    unsubscribe();
    unsubscribe = runtime2.subscribe((value) => {
      if (active5()) view3.offline.textContent = [
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
  const view3 = makeView(pip), owner2 = todoOwner();
  let alive = true, tab = "todos", notesLoaded = false, composing = false, date2 = bjtDate();
  const active5 = () => alive && !pip.closed && todoSessionActive(owner2);
  const paint4 = () => {
    if (active5()) {
      paintTodo(view3);
      if (tab === "notes") paintNotes(view3);
    }
  };
  const stopTodos = observeTodoChanges(paint4), stopNotes = observeFloatingNotes(paint4);
  const stopRuntime = bindOfflineStatus(view3, active5);
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
    if (tab === "notes" && view3.notesInput.value !== (current3?.draft || "")) editFloatingNote(view3.notesInput.value);
    view3.frozen = true;
    paint4();
    event.detail.onFailure?.(() => {
      view3.frozen = false;
      if (active5()) paint4();
    });
  };
  const reset = () => {
    if (alive) pip.close();
  };
  const focus = () => {
    if (active5()) {
      void loadFloatingToday();
      if (tab === "notes") void loadFloatingNotes();
    }
  };
  const timer = setInterval(() => {
    if (!active5()) {
      if (alive) pip.close();
      return;
    }
    if (date2 !== bjtDate()) {
      if (hasFloatingNoteDraft()) toast("前一天仍有未发送内容，请确认保存后再关闭主页面。");
      date2 = bjtDate();
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
      editFloatingNote(view3.notesInput.value, false);
      composing = false;
    }
    markFloatingNoteComposing(false);
    const draft = hasFloatingNoteDraft();
    alive = false;
    clearInterval(timer);
    stopTodos();
    stopNotes();
    stopRuntime();
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("haoduoyu:before-refresh", beforeRefresh2);
    window.removeEventListener("haoduoyu-todos-reset", reset);
    pip.removeEventListener("focus", focus);
    if (activeWindow === pip) activeWindow = null;
    if (draft && todoSessionActive(owner2)) toast("未发送内容仍在当前页面，请确认保存后再关闭主页面。");
  }
  view3.tabs.addEventListener("click", (event) => {
    const button2 = event.target.closest("button[data-tab]");
    if (!button2) return;
    tab = button2.dataset.tab;
    view3.todo.hidden = tab !== "todos";
    view3.notes.hidden = tab !== "notes";
    for (const control of view3.tabs.querySelectorAll("button")) control.setAttribute("aria-pressed", String(control === button2));
    if (tab === "notes" && !notesLoaded) {
      notesLoaded = true;
      void loadFloatingNotes();
    }
    paint4();
  });
  view3.todoList.addEventListener("change", (event) => {
    const input = event.target;
    if (input.dataset.todoId) void toggleTodo(input, { floating: true });
  });
  view3.newNote.addEventListener("click", () => {
    newFloatingNote();
    paint4();
    view3.notesInput.focus();
  });
  view3.noteList.addEventListener("click", (event) => {
    const button2 = event.target.closest("[data-note-id]");
    if (button2) selectFloatingNote(button2.dataset.noteId, button2.dataset.category);
  });
  view3.notesInput.addEventListener("compositionstart", () => {
    composing = true;
    markFloatingNoteComposing(true);
  });
  view3.notesInput.addEventListener("input", (event) => {
    editFloatingNote(view3.notesInput.value, composing || event.isComposing);
    if (composing || event.isComposing) markFloatingNoteComposing(true);
  });
  view3.notesInput.addEventListener("compositionend", () => {
    composing = false;
    editFloatingNote(view3.notesInput.value);
    markFloatingNoteComposing(false);
  });
  view3.options.addEventListener("change", () => {
    labelFloatingNote([...view3.options.querySelectorAll("input:checked")].map((input) => input.value));
    paint4();
  });
  view3.send.addEventListener("click", () => {
    void sendFloatingNote();
  });
  view3.check.addEventListener("click", () => {
    void checkFloatingNote();
  });
  view3.retry.addEventListener("click", () => {
    void checkFloatingNote(true);
  });
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("haoduoyu:before-refresh", beforeRefresh2);
  window.addEventListener("haoduoyu-todos-reset", reset);
  pip.addEventListener("focus", focus);
  pip.addEventListener("pagehide", cleanup, { once: true });
  view3.tabs.querySelector('[data-tab="todos"]').setAttribute("aria-pressed", "true");
  paint4();
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
    } catch (error2) {
      activeWindow = null;
      pip.close();
      throw error2;
    }
  } catch (error2) {
    toast("无法打开置顶便签：" + (error2?.message || "请稍后重试。"), true);
  } finally {
    opening = false;
  }
}

// web/actions.mjs
init_api();
init_constants();
init_dom();
init_format();
init_session_index_state();
init_state();
init_login();
init_modal();
init_popover();
function actionCloseModal({}) {
  closeModal();
}
function actionMenu({}) {
  setMenu(!$(".shell").classList.contains("menu-open"));
}
function actionSettingsTab({ target }) {
  if (Object.hasOwn(settingsTabs, target.dataset.tab)) {
    navigate("settings", target.dataset.tab);
    $("[data-action=settings-tab][data-tab=" + state.settingsTab + "]")?.focus();
  }
}
function actionDetailInfo({ target }) {
  popover(target, `<p>${e(target.dataset.reason)}</p>`, { label: target.getAttribute("aria-label") });
}
function actionPageMenu({ target }) {
  popover(target, '<button data-action="refresh" role="menuitem">刷新数据</button><a href="/api/v1/export" download role="menuitem">导出发布记录 CSV</a><a href="/api-docs" target="_blank" rel="noopener noreferrer" role="menuitem">接入文档 ↗</a>', { menu: true, label: "页面操作" });
}
function actionKeyHelp({ target }) {
  popover(target, "<p>供自动化工具按账号范围读取或录入数据；凭据创建后仅显示一次。</p>", { label: "AI 凭据用途" });
}
async function actionLogout({}) {
  await api("/auth/logout", { method: "POST" });
  state.me = null;
  renderLogin();
}
function actionRefresh({}) {
  clearArticleIndexes();
  renderPage();
}
function actionNewKey({}) {
  keyModal();
}
function actionRevokeKey({ target, id: id2 }) {
  openModal("撤销 AI 凭证", `<p class="revoke-context">撤销「${e(target.dataset.name)}」后凭证立即失效，已有数据保留。</p><form id="revoke-form" data-id="${e(id2)}">${formEnd("确认撤销")}</form>`);
}
async function actionCopyToken({}) {
  const token = $("#created-token").textContent;
  try {
    await navigator.clipboard.writeText(token);
    toast("凭证已复制，请在安全位置保存。");
  } catch {
    const range2 = document.createRange();
    range2.selectNodeContents($("#created-token"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range2);
    toast("已选中凭证，请手动复制。");
  }
}
var actions = {
  "todo-floating": openFloatingWorkbench,
  "todo-menu": openTodoMenu,
  "todo-note": openTodoNote,
  "todo-count-set": ({ target }) => openTodoCount(target.dataset),
  "todo-count-add": ({ target }) => void changeTodoCount(target.dataset, "add"),
  "todo-count-undo": ({ target }) => void changeTodoCount(target.dataset, "undo"),
  "todo-count-clear": ({ target }) => void changeTodoCount(target.dataset, "clear"),
  "todo-edit-text": ({ target }) => openTodoText(target.dataset),
  "ideas-filter": ({ target }) => setIdeasFilter(target.dataset.filter),
  "idea-expand": ({ target }) => toggleIdea(target.dataset.id),
  "idea-todo": ({ target }) => openIdeaTodo(target.dataset.id),
  "ideas-reload": () => reloadIdeas(),
  "todo-delete": ({ target }) => deleteTodo(target.dataset),
  "todo-restore": ({ target }) => restoreTodo(target.dataset),
  "todo-make-template": ({ target }) => changeTodoTemplate(target.dataset),
  "todo-remove-template": ({ target }) => changeTodoTemplate(target.dataset, true),
  "todo-template-use": ({ id: id2 }) => useTodoTemplate(id2),
  "todo-template-edit": ({ id: id2 }) => editTodoTemplate(id2),
  "todo-template-archive": ({ id: id2 }) => archiveTodoTemplate(id2),
  "todo-template-restore-archive": ({ id: id2 }) => archiveTodoTemplate(id2, true),
  "todo-template-delete": ({ id: id2 }) => writeTodoTemplate(id2, void 0, true),
  "todo-panel": ({ target }) => setTodoPanel(target.dataset.panel),
  "todo-future-delete": ({ id: id2 }) => deleteUnscheduledTodo(id2),
  "todo-future-schedule": ({ id: id2 }) => scheduleUnscheduledTodo(id2),
  "todo-future-quick": ({ id: id2, target }) => quickScheduleUnscheduledTodo(id2, target.dataset.date),
  "todo-future-pick": ({ id: id2 }) => pickUnscheduledTodoDate(id2),
  "todo-future-menu": ({ id: id2 }) => toggleUnscheduledTodoPanel(id2),
  "todo-future-period": ({ id: id2, target }) => setUnscheduledTodoPeriod(id2, target.dataset.period),
  "todo-future-repeat": ({ id: id2, target }) => setUnscheduledTodoRepeat(id2, target.dataset.repeat),
  "todo-future-times": ({ id: id2, target }) => setUnscheduledTodoTimes(id2, Number(target.dataset.times)),
  "todo-future-delete-all": ({ id: id2 }) => deleteUnscheduledTodoTimes(id2),
  "todo-future-due": ({ id: id2 }) => setUnscheduledTodoDue(id2),
  "todo-future-due-clear": ({ id: id2 }) => setUnscheduledTodoDue(id2, true),
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
  "close-modal": actionCloseModal,
  "menu": actionMenu,
  "settings-tab": actionSettingsTab,
  "detail-info": actionDetailInfo,
  "page-menu": actionPageMenu,
  "key-help": actionKeyHelp,
  "logout": actionLogout,
  "refresh": actionRefresh,
  "new-key": actionNewKey,
  "revoke-key": actionRevokeKey,
  "copy-token": actionCopyToken
};

// web/forms.mjs
init_requests();
init_api();
init_dom();
init_state();
init_login();
init_modal();
async function submitLoginForm({ data: data3 }) {
  await api("/auth/login", { method: "POST", body: { username: data3.username, password: data3.password } });
  await init({ freshLogin: true });
}
async function submitAccountForm({ form, data: data3, values }) {
  const id2 = form.dataset.id, epoch = runtime.sessionEpoch, ticket2 = runtime.modalRequestVersion;
  const profile = String(data3.profile_url || "").trim();
  const body4 = id2 ? { name: data3.name.trim(), active: values.has("active") } : {};
  if (profile || id2 && (state.accountProfiles || []).some((row) => row.account_id === id2)) body4.profile_url = profile;
  const signature2 = JSON.stringify(body4);
  if (form.accountSaveSignature !== signature2) {
    form.accountSaveSignature = signature2;
    form.accountSaveKey = crypto.randomUUID();
  }
  const saved = await api(id2 ? `/accounts/${encodeURIComponent(id2)}` : "/accounts", {
    method: id2 ? "PUT" : "POST",
    body: body4,
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
  "login-form": submitLoginForm,
  "key-form": submitKeyForm,
  "revoke-form": submitRevokeForm,
  "password-form": submitPasswordForm
};
async function handleFormSubmit(event) {
  const form = event.target;
  if (form.id === "idea-todo-form") {
    event.preventDefault();
    await submitIdeaTodo({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
  if (form.id === "todo-text-form") {
    event.preventDefault();
    await submitTodoText({ form, data: Object.fromEntries(new FormData(form)) });
    return;
  }
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
  if (!form.matches("#login-form,#key-form,#password-form,#revoke-form")) return;
  event.preventDefault();
  const button2 = $("button[type=submit]", form), message = $(".form-message", form), values = new FormData(form), data3 = Object.fromEntries(
    values
  );
  if (button2?.disabled) return;
  if (message) message.textContent = "";
  if (button2) button2.disabled = true;
  try {
    const handler = forms[form.id];
    if (handler) await handler({ form, data: data3, values });
  } catch (err) {
    if (err.staleSession || isRequestAbort(err)) return;
    if (message && message.isConnected) message.textContent = err.message;
    else toast(err.message, true);
  } finally {
    if (button2?.isConnected) button2.disabled = false;
  }
}

// web/events.mjs
init_requests();
init_dom();
init_state();
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
    if (target.dataset.notesCategory || target.dataset.notesDate) {
      if (target.dataset.notesCategory) setDailyNotesRouteCategory(target.dataset.notesCategory);
      if (target.dataset.notesDate) setDailyNotesRouteDate(target.dataset.notesDate);
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
  const el3 = event.target;
  if (el3.id === "todo-completed-mode") {
    changeTodoCompletedMode(el3.value);
    return;
  }
  if (el3.dataset?.futureTodoId) {
    toggleUnscheduledTodo(el3);
    return;
  }
  if (el3.dataset?.futureExtraId) {
    addUnscheduledTodoExtra(el3);
    return;
  }
  if (el3.dataset?.futureDateId || el3.dataset?.futureDueId) {
    inputUnscheduledTodo(el3);
    return;
  }
  if (el3.dataset?.todoId) {
    toggleTodo(el3);
    return;
  }
  if (el3.id === "todo-date") {
    selectTodoDate(el3.value);
    return;
  }
  if (el3.id === "global-account" || el3.id === "overview-account") {
    state.account = el3.value;
    state.listPage = 1;
    updateRoute();
    renderShell();
  }
}
function handleToggle(event) {
  if (event.target.id === "todo-templates" && event.target.isConnected && event.target.open) loadTodoTemplates();
}
function handleInput(event) {
  const el3 = event.target;
  inputUnscheduledTodo(el3);
  inputTodo(el3);
  inputTodoTemplate(el3);
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
    )).filter((el3) => el3.getClientRects().length);
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
  const fail6 = (error2) => Promise.allSettled(failures.map((callback) => Promise.resolve().then(() => callback(error2))));
  try {
    page.dispatchEvent(new page.CustomEvent("haoduoyu:before-refresh", { detail }));
  } catch (error2) {
    dispatchError = error2;
  }
  collecting = false;
  const results = await Promise.allSettled(pending);
  const rejected = results.find((result) => result.status === "rejected");
  if (dispatchError || rejected) {
    const error2 = dispatchError || rejected.reason;
    await fail6(error2);
    throw error2;
  }
  return fail6;
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
    } catch (error2) {
      if (onFailure) await onFailure(error2);
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
  function notice2() {
    const waiting = registration?.waiting, previousActive = registration?.active;
    if (!waiting || !registration.active || button2) return;
    button2 = document2.createElement("button");
    button2.type = "button";
    button2.className = "sw-update-notice";
    button2.textContent = "有新版本";
    button2.setAttribute("aria-label", "有新版本，点此更新");
    button2.setAttribute("aria-live", "polite");
    listen(button2, "click", updateAction(page, button2, () => {
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
    document2.body.append(button2);
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
      button2?.remove();
    } };
  } catch {
    for (const remove of cleanups) remove();
    return null;
  }
}

// web/main.mjs
startOfflineUI();
registerEvents2();
startServiceWorker();
init();
