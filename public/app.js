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
  uuid: uuid2 = () => crypto.randomUUID(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = 700
}) {
  const context = { pages: /* @__PURE__ */ new Map(), disposed: false, options: { load, put, remove, restore, onSaved, uuid: uuid2 } };
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
  const matches2 = (value, operation) => value.version === operation.version + 1 && (operation.kind === "delete" ? value.deleted === true : operation.kind === "restore" ? value.deleted === false : value.deleted === false && value.text === operation.text);
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
  Object.assign(context, { page, emit, stopTimer, adopt, schedule, matches: matches2, accepted, dispose });
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
  const { page, emit, stopTimer, matches: matches2, accepted } = context;
  const { put, remove, restore, uuid: uuid2 } = context.options;
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
      if (!matches2(value, operation)) throw new Error("保存响应需要重新核对。");
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
    return send(item, { kind: "put", text: item.draft, version: item.version, saveId: uuid2() });
  }
  async function deletePage(date) {
    const item = page(date);
    if (context.disposed || !item.canEdit || !item.loaded || item.pending || ["conflict", "unknown"].includes(item.phase) || item.version === 0 || item.deleted) return;
    return send(item, { kind: "delete", text: item.draft, version: item.version, saveId: uuid2() });
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
    return send(item, { kind: "restore", text: "", version: item.version, saveId: uuid2() });
  }
  return { save, deletePage, restorePage, retryPending };
}
function createResolutionActions(context) {
  const { page, emit, stopTimer, adopt, matches: matches2, accepted } = context;
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
      if (matches2(value, operation)) accepted(item, value, operation);
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
  if (state.page === "notes") return '<div class="heading-left"><h1>' + (dailyNotesRouteCategory() === "work" ? "工作碎碎念" : "生活碎碎念") + "</h1></div>";
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
  const today2 = bjtDate(now), changed2 = todosState.today !== today2;
  todosState.today = today2;
  return changed2;
}
function todoSessionActive(owner) {
  return Boolean(state.me) && owner === todoOwner() && owner === todosState.owner;
}
function mergeTodo(day3, item) {
  const index = day3.items.findIndex((row) => row.id === item.id);
  if (index < 0) day3.items.push(item);
  else if (day3.items[index].version <= item.version) day3.items[index] = item;
}
function todoTemplateAdded(day3, id) {
  return day3.items.some((item) => item.date === day3.date && item.template_id === id && !item.deleted_at);
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
  const schedule = (operation) => new Promise((resolve, reject) => {
    queue.push({ operation, resolve, reject });
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
function localDocument({ local, server = null, operation = null, conflict = null }) {
  const { content_hash, change_seq, ...value } = structuredClone(local);
  const document2 = Object.freeze({ ...value, [localMarker]: true });
  documents.set(document2, {
    local: value,
    server: structuredClone(server),
    operation: structuredClone(operation),
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
function checkedResponse(route, value) {
  const invalid = () => fail("碎碎念读取结果不完整，未覆盖本机内容。", "OFFLINE_RESPONSE_INVALID");
  if (route.kind === "note_entry") {
    if (!isNoteApiRow(value) || value.id !== route.id) throw invalid();
    return structuredClone(value);
  }
  if (!isObject(value) || value.category !== route.category || value.date !== route.date || typeof value.can_edit !== "boolean" || !Array.isArray(value.entries) || value.entries.length > 200) throw invalid();
  const ids = /* @__PURE__ */ new Set();
  for (const row of value.entries) {
    if (!isNoteApiRow(row) || row.category !== route.category || row.date !== route.date || row.deleted || row.can_edit !== value.can_edit || ids.has(row.id)) throw invalid();
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
function serverFence(rows, route, owner) {
  return JSON.stringify(rows.filter((row) => row.scope === owner && inRoute(row, route)).map((row) => [row.entity_id, row.server || null, row.api_server || null, row.remote_missing === true]).sort((a, b) => a[0].localeCompare(b[0])));
}
function localValue(entity, capability) {
  const row = entity.dirty ? entity.local : entity.server;
  if (!row || !uuidPattern.test(row.id || row.source_id) || !["life", "work"].includes(row.category) || !validDay(row.date) || !Number.isSafeInteger(row.version) || row.version < 1) throw missing();
  if (!removed(row) && typeof row.text !== "string") throw missing();
  return {
    id: row.id || row.source_id,
    category: row.category,
    date: row.date,
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
  if (!entity.dirty && server?.version === local.version && server.deleted === local.deleted && (server.deleted || server.text === local.text)) return { ...structuredClone(server), can_edit: capability === true };
  const pending = operations2.filter((row) => row.entity_id === entity.entity_id && liveOperation(row)).sort((a, b) => a.seq - b.seq).at(-1);
  const conflict = conflicts.find((row) => row.key === entity.conflict && row.resolved_at === null) || conflicts.filter((row) => row.entity_id === entity.entity_id && row.resolved_at === null).at(-1) || null;
  return localDocument({
    local,
    server: entity.dirty ? server : null,
    operation: entity.dirty ? pending || null : null,
    conflict: entity.dirty ? conflict : null
  });
}
function notesContext({ db, getScope, getGeneration = () => 0, now = Date.now }) {
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
  return { db, capture, load, capabilityKey, now };
}
function readingMethods(context) {
  const { db, capture, load, capabilityKey } = context;
  async function capability() {
    const owner = capture();
    const record = await db.transaction(["meta"], "readonly", (tx) => tx.get("meta", capabilityKey(owner.scope)));
    owner.active();
    return record?.scope === owner.scope && typeof record.can_edit === "boolean" ? record.can_edit : null;
  }
  async function read(path, route = noteReadRoute(path)) {
    if (!route) throw missing();
    const owner = capture();
    const result = await db.transaction(["entities", "outbox", "conflicts", "meta"], "readonly", async (tx) => {
      owner.active();
      const rows = await load(tx, owner.scope), cap = await tx.get("meta", capabilityKey(owner.scope));
      const capability2 = cap?.scope === owner.scope ? cap.can_edit : null;
      const cached = await tx.get("meta", entityKey(owner.scope, "get:" + path));
      const snapshot = await tx.get("meta", entityKey(owner.scope, "snapshot"));
      const complete = snapshot?.value?.index?.complete === true && snapshot.value.index.scope_id === owner.scope;
      const entities = rows.entities.filter((row) => inRoute(row, route) && (row.dirty || !row.remote_missing && row.server));
      if (route.kind === "note_entry") {
        if (!entities.length) throw missing();
        owner.active();
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
      owner.active();
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
    owner.active();
    return result;
  }
  async function fence(pathOrRoute) {
    const route = typeof pathOrRoute === "string" ? noteReadRoute(pathOrRoute) : pathOrRoute, owner = capture();
    if (!route) throw missing();
    const result = await db.transaction(["entities"], "readonly", async (tx) => serverFence(await tx.getAll("entities"), route, owner.scope));
    owner.active();
    return result;
  }
  return { read, capability, fence };
}
function writingMethods(context) {
  const { db, capture, capabilityKey, now } = context;
  async function write(path, route, value, { baseline } = {}) {
    route ||= noteReadRoute(path);
    if (!route) throw missing();
    const owner = capture(), data = checkedResponse(route, value);
    const incoming = route.kind === "note_entry" ? [data] : data.entries;
    await db.transaction(["entities", "meta"], "readwrite", async (tx) => {
      owner.active();
      const rows = await tx.getAll("entities");
      if (baseline !== void 0 && baseline !== serverFence(rows, route, owner.scope))
        throw fail("本机刚确认了新版本，请重新读取完整记录。", "OFFLINE_CACHE_CHANGED");
      const found = new Set(incoming.map((row) => "note-entry:" + row.id));
      if (route.kind === "note_entries") for (const old of rows) {
        if (old.scope === owner.scope && inRoute(old, route) && !found.has(old.entity_id))
          await tx.put("entities", { ...old, remote_missing: true });
      }
      for (const row of incoming) {
        const entity_id = "note-entry:" + row.id, key = entityKey(owner.scope, entity_id);
        const old = await tx.get("entities", key);
        if (Math.max(old?.server?.version || 0, old?.api_server?.version || 0) > row.version)
          throw fail("读取结果早于本机已确认版本，原文已保留。", "OFFLINE_CACHE_CHANGED");
        await tx.put("entities", { ...old, key, scope: owner.scope, entity_id, server: row, api_server: row, remote_missing: false });
      }
      await tx.put("meta", { key: entityKey(owner.scope, "get:" + path), scope: owner.scope, path, data, saved_at: now() });
      await tx.put("meta", { key: capabilityKey(owner.scope), scope: owner.scope, can_edit: data.can_edit, verified_at: now() });
      owner.active();
    });
    owner.active();
    const result = await context.read(path, route);
    owner.active();
    return result.data;
  }
  async function captureAcknowledged() {
    const owner = capture();
    const count = await db.transaction(["entities"], "readwrite", async (tx) => {
      owner.active();
      let count2 = 0;
      for (const entity of await tx.getAll("entities")) {
        if (entity.scope !== owner.scope || !noteEntity(entity) || !isNoteApiRow(entity.server) || entity.api_server?.version > entity.server.version) continue;
        await tx.put("entities", { ...entity, api_server: structuredClone(entity.server) });
        count2++;
      }
      owner.active();
      return count2;
    });
    owner.active();
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
    const active4 = rows.filter((row) => row.dirty || !row.remote_missing).map((row) => route.source === "note_entry" && row.dirty ? row.local : row.server).filter((row) => row && !row.deleted && !row.deleted_at);
    let data;
    if (route.kind === "reminders") {
      const items = active4.filter((row) => row.date === route.date).map((row) => {
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
      const dates = [...new Set(active4.filter((row) => row.category === route.category && day(row.date) && (route.source !== "legacy" || typeof row.text === "string" && row.text !== "") && (!route.before || row.date < route.before)).map((row) => row.date))].sort().reverse();
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
  const fields2 = ["id", "name", "platform", "active", "account_name", "position", "created_at", "updated_at"];
  return value.map((row) => Object.fromEntries(fields2.filter((key) => row[key] !== void 0).map((key) => [key, row[key]])));
}
function checkedResponse2(route, value) {
  const invalid = () => Object.assign(new Error("读取结果不完整，未覆盖本机数据。"), { code: "OFFLINE_RESPONSE_INVALID" });
  if (value === void 0 || value === null) throw invalid();
  if (["todo", "template"].includes(route.kind) && (!Array.isArray(value.items) || value.items.some((row) => !row || !uuidPattern2.test(row.id) || !Number.isSafeInteger(row.version) || row.version < 1 || typeof row.text !== "string" || !row.text.trim() || row.text.length > 500 || !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.updated_at)) || route.kind === "todo" && (row.date !== route.date || typeof row.completed !== "boolean" || row.deleted_at !== null))))
    throw invalid();
  return route.kind === "accounts" ? safeAccounts(value) : clone(value);
}
function belongs(row, route) {
  const value = offlineValue(row);
  return row.entity_id.startsWith(route.kind + ":") && value && (route.kind !== "todo" || value.date === route.date);
}
function serverFence2(rows, route, owner) {
  if (!["todo", "template"].includes(route.kind)) return null;
  return JSON.stringify(rows.filter((row) => row.scope === owner && belongs(row, route)).map((row) => [row.entity_id, row.server || null, row.remote_missing === true]).sort((a, b) => a[0].localeCompare(b[0])));
}
function overlay(value, route, entities, dirtyOnly) {
  if (!["todo", "template"].includes(route.kind)) return value;
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
      const identity3 = safeIdentity(me);
      await db.transaction(["meta"], "readwrite", (tx) => tx.put("meta", { key, identity: identity3, scope, verified_at: now() }));
      return identity3;
    },
    forgetIdentity: () => db.transaction(["meta"], "readwrite", (tx) => tx.delete("meta", key))
  };
}
async function legacySnapshot(db, owner, route) {
  return db.transaction(["entities", "meta"], "readonly", async (tx) => {
    const snapshot = await tx.get("meta", entityKey(owner, "snapshot"));
    if (snapshot?.value?.index?.complete !== true || snapshot.value.index.scope_id !== owner) throw missing3();
    const entity = await tx.get("entities", entityKey(owner, "legacy-" + route.category + ":" + route.date));
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
function createOfflineCache({ db, getScope, now = Date.now, getGeneration = () => 0 }) {
  const notes = createNotesCache({ db, getScope, now, getGeneration });
  const scope = () => {
    const value = getScope();
    if (!value) throw Object.assign(new Error("请先联网核实当前身份，本机内容已保留。"), { code: "OFFLINE_SCOPE_REQUIRED" });
    return value;
  };
  async function write(path, value, { baseline } = {}) {
    const route = offlineReadRoute(path);
    if (!route) return value;
    if (["note_entries", "note_entry"].includes(route.kind)) return notes.write(path, route, value, { baseline });
    const owner = scope(), generation = getGeneration(), data = checkedResponse2(route, value), key = entityKey(owner, "get:" + path);
    const active4 = () => {
      if (scope() !== owner || getGeneration() !== generation)
        throw Object.assign(new Error("身份范围已变化，本次读取未保存。"), { code: "OFFLINE_SCOPE_CHANGED" });
    };
    await db.transaction(["meta", "entities"], "readwrite", async (tx) => {
      active4();
      const rows = await tx.getAll("entities");
      if (baseline !== void 0 && baseline !== serverFence2(rows, route, owner))
        throw Object.assign(new Error("本机刚同步了新版本，请重新读取完整列表。"), { code: "OFFLINE_CACHE_CHANGED" });
      await tx.put("meta", { key, scope: owner, path, data, saved_at: now() });
      if (!["todo", "template"].includes(route.kind)) {
        active4();
        return;
      }
      const found = new Set(data.items.map((row) => row.id));
      for (const old of rows) {
        if (old.scope === owner && belongs(old, route) && !found.has(offlineValue(old).id))
          await tx.put("entities", { ...old, remote_missing: true });
      }
      for (const row of data.items) {
        const entity_id = route.kind + ":" + row.id, storageKey = entityKey(owner, entity_id);
        const old = await tx.get("entities", storageKey);
        if (old?.server?.version > row.version)
          throw Object.assign(new Error("读取结果早于本机已确认版本，请重新读取。"), { code: "OFFLINE_CACHE_CHANGED" });
        await tx.put("entities", {
          ...old,
          key: storageKey,
          scope: owner,
          entity_id,
          server: row,
          remote_missing: false,
          ...route.kind === "todo" ? { needs_api_refresh: false } : {}
        });
      }
      active4();
    });
    const result = overlay(route.kind === "accounts" ? value : data, route, await entities(owner), true);
    active4();
    return result;
  }
  const entities = (owner) => db.transaction(["entities"], "readonly", async (tx) => (await tx.getAll("entities")).filter((row) => row.scope === owner));
  async function read(path) {
    const route = offlineReadRoute(path);
    if (!route) throw missing3();
    if (["note_entries", "note_entry"].includes(route.kind)) return notes.read(path, route);
    const owner = scope(), generation = getGeneration();
    const cached = await db.transaction(["meta"], "readonly", (tx) => tx.get("meta", entityKey(owner, "get:" + path)));
    if (["reminders", "dates"].includes(route.kind)) {
      try {
        return await readOnlySnapshot({ db, scope: owner, route, getScope, getGeneration });
      } catch (error) {
        if (error.code !== "OFFLINE_CACHE_MISS" || !cached) throw error;
      }
    }
    if (!cached || cached.data === void 0) {
      if (route.kind === "legacy") {
        const result2 = await legacySnapshot(db, owner, route);
        if (scope() !== owner || getGeneration() !== generation) throw missing3();
        return result2;
      }
      const local = route.kind === "todo" ? (await entities(owner)).filter((row) => row.dirty && belongs(row, route)) : [];
      if (!local.length) throw missing3();
      const data = {
        date: route.date,
        today: new Date(now() + 8 * 36e5).toISOString().slice(0, 10),
        completed_mode: "strike",
        preferences_version: 0,
        items: [],
        offline_partial: true
      };
      if (scope() !== owner || getGeneration() !== generation) throw missing3();
      return { data: overlay(data, route, local, false), saved_at: null };
    }
    const result = route.kind === "legacy" ? { ...clone(cached.data), can_edit: false } : overlay(clone(cached.data), route, await entities(owner), false);
    if (scope() !== owner || getGeneration() !== generation) throw missing3();
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

// web/offline/conflict.mjs
function createConflictStore({ db, now = Date.now, canDispatch = () => true }) {
  async function record({ operation, remote = null, reason = "version" }) {
    return db.transaction(["entities", "outbox", "conflicts"], "readwrite", async (tx) => {
      const current = await tx.get("outbox", operation.key);
      if (!current || current.scope !== operation.scope) throw new Error("Offline operation is no longer current");
      if (!canDispatch(operation) || !canDispatch(current)) return null;
      if (current.claim_owner !== operation.claim_owner || ["archived", "conflict"].includes(current.status)) {
        throw new Error("Offline conflict claim changed");
      }
      const entity = await tx.get("entities", entityKey(operation.scope, operation.entity_id));
      const key = entityKey(operation.scope, "conflict:" + operation.id);
      const conflict = {
        key,
        scope: operation.scope,
        entity_id: operation.entity_id,
        operation: current,
        local: entity?.local || operation.local,
        remote,
        reason,
        created_at: now(),
        resolved_at: null
      };
      await tx.put("conflicts", conflict);
      await tx.put("outbox", { ...current, status: "conflict", error: reason });
      if (entity) await tx.put("entities", { ...entity, conflict: key, dirty: true });
      return conflict;
    });
  }
  const list = (scope) => db.transaction(["conflicts"], "readonly", async (tx) => (await tx.getAll("conflicts")).filter((value) => value.scope === scope && value.resolved_at === null));
  async function resolve(key, choice2, { scope } = {}) {
    if (!["use-server", "use-local", "keep-both"].includes(choice2)) throw new TypeError("Unknown conflict choice");
    return db.transaction(["conflicts", "outbox", "entities"], "readwrite", async (tx) => {
      const conflict = await tx.get("conflicts", key);
      if (!conflict || conflict.scope !== scope) throw new Error("Conflict scope does not match");
      if (conflict.resolved_at !== null) return { ...conflict, already_resolved: true };
      const entity = await tx.get("entities", entityKey(scope, conflict.entity_id));
      if (entity?.conflict !== key || JSON.stringify(entity.local) !== JSON.stringify(conflict.local)) {
        return { ...conflict, needs_followup: true };
      }
      if (choice2 !== "use-server") {
        const pending = { ...conflict, requested_choice: choice2, needs_followup: true };
        await tx.put("conflicts", pending);
        return pending;
      }
      const resolved = { ...conflict, choice: choice2, needs_followup: false, resolved_at: now() };
      await tx.put("conflicts", resolved);
      if (choice2 === "use-server") {
        for (const operation of await tx.getAll("outbox")) {
          if (operation.scope === scope && operation.entity_id === conflict.entity_id) {
            await tx.put("outbox", { ...operation, status: "archived" });
          }
        }
        if (entity) await tx.put("entities", {
          ...entity,
          server: conflict.remote,
          local: conflict.remote,
          dirty: false,
          conflict: null
        });
      }
      return resolved;
    });
  }
  return { record, list, resolve };
}

// web/offline/outbox.mjs
var RETRY_DELAYS = Object.freeze([5e3, 15e3, 6e4, 3e5]);
var prefixes = {
  todo: "todo:",
  template: "template:",
  note_entry: "note-entry:",
  memo_note: "memo-note:",
  memo_group: "memo-group:"
};
var uuidPattern3 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var active2 = (operation) => !["acked", "archived"].includes(operation.status);
var deleted = (value) => Boolean(value && (value.deleted || value.deleted_at));
var ordered = (rows) => rows.sort((a, b) => a.seq - b.seq);
var needsUpgrade = () => Object.assign(new Error("此本机操作需新版页面处理，原内容已保留。"), { code: "OFFLINE_UPGRADE_REQUIRED" });
function canonicalRoute(operation) {
  const { entity_type: type, source_id: id, entity_id, method, path } = operation;
  if (!uuidPattern3.test(id) || entity_id !== prefixes[type] + id) return false;
  const base = type === "todo" ? "/todos" : type === "template" ? "/todo-templates" : type === "note_entry" ? "/note-entries" : "/memos/" + (type === "memo_note" ? "notes" : "groups");
  if (["todo", "template"].includes(type)) {
    if (method === "POST") return path === base || type === "todo" && path === base + "/" + id + "/restore";
    return ["PATCH", "DELETE"].includes(method) && path === base + "/" + id;
  }
  return (method === "PUT" || type === "note_entry" && method === "DELETE") && path === base + "/" + id;
}
function dispatchCapabilities(options2) {
  const types2 = new Set(options2.enabledTypes || Object.keys(prefixes));
  const protocols = new Set(options2.supportedProtocols || [1]);
  const canDispatch = (operation) => {
    const protocol = operation?.protocol === void 0 ? 1 : operation.protocol;
    return Boolean(operation && Object.hasOwn(prefixes, operation.entity_type) && types2.has(operation.entity_type) && Number.isSafeInteger(protocol) && protocol === 1 && protocols.has(protocol) && !Object.hasOwn(operation, "depends_on") && canonicalRoute(operation));
  };
  const requireDispatch = (operation) => {
    if (!canDispatch(operation)) throw needsUpgrade();
  };
  return { canDispatch, requireDispatch };
}
function identity(input, uuid2) {
  const prefix = prefixes[input.entity_type];
  if (!prefix) throw new TypeError("This entity is read-only offline");
  const raw = input.entity_id || input.body?.id || uuid2();
  const id = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  if (!uuidPattern3.test(id)) throw new TypeError("Offline entity requires a stable UUID");
  return { id: id.toLowerCase(), entity_id: prefix + id.toLowerCase() };
}
function operationFor(input, uuid2, time2) {
  const initialStatus = input.initial_status || "queued";
  if (!["queued", "unknown"].includes(initialStatus)) throw new TypeError("Invalid initial offline operation status");
  if (initialStatus === "unknown" && (!uuidPattern3.test(input.body?.save_id) || !input.entity_id))
    throw new TypeError("Unknown operation import requires its original save_id and entity identity");
  const { id, entity_id } = identity(input, uuid2), type = input.entity_type;
  const method = input.method?.toUpperCase();
  const base = type === "todo" ? "/todos" : type === "template" ? "/todo-templates" : type === "note_entry" ? "/note-entries" : "/memos/" + (type === "memo_note" ? "notes" : "groups");
  const restore = type === "todo" && method === "POST" && input.path === base + "/" + id + "/restore";
  const create = ["todo", "template"].includes(type) && method === "POST" && !restore;
  const allowed = type === "todo" ? ["POST", "PATCH", "DELETE"] : type === "template" ? ["POST", "PATCH", "DELETE"] : type === "note_entry" ? ["PUT", "DELETE"] : ["PUT"];
  if (!allowed.includes(method)) throw new TypeError("Unsupported offline mutation");
  const path = create ? base : base + "/" + id + (restore ? "/restore" : "");
  if (input.path && input.path !== path) throw new TypeError("Offline mutation path does not match its entity");
  const body = structuredClone(input.body || {});
  if (typeof body.text === "string") {
    body.text = ["todo", "template"].includes(type) ? body.text.trim() : body.text.replace(/\r\n?/g, "\n");
  }
  if (typeof body.title === "string") body.title = body.title.trim();
  if (typeof body.body === "string") body.body = body.body.replace(/\r\n?/g, "\n");
  if (create) {
    if (body.id && body.id.toLowerCase() !== id) throw new TypeError("Client UUID cannot change");
    body.id = id;
  }
  const expected = create ? 0 : body.version;
  if (!Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER) {
    throw new TypeError("Offline mutation requires an expected version");
  }
  const saveId = body.save_id || uuid2();
  if (!uuidPattern3.test(saveId)) throw new TypeError("Offline save_id requires a UUID");
  if (!["todo", "template"].includes(type)) body.save_id = saveId.toLowerCase();
  else delete body.save_id;
  const operation = {
    id: uuid2(),
    scope: input.scope,
    entity_type: type,
    entity_id,
    source_id: id,
    protocol: input.protocol === void 0 ? 1 : input.protocol,
    method,
    path,
    body,
    expected_version: expected,
    save_id: saveId.toLowerCase(),
    created_at: time2,
    attempts: 0,
    next_attempt_at: 0,
    status: initialStatus,
    base: input.base || null,
    local: { ...structuredClone(input.local || body), id, version: expected + 1 },
    claim_owner: null,
    error: null
  };
  operation.key = entityKey(input.scope, "operation:" + operation.id);
  if (Object.hasOwn(input, "depends_on")) operation.depends_on = structuredClone(input.depends_on);
  assertOfflineData(operation);
  return operation;
}
async function digest(value) {
  const canonical2 = (node) => Array.isArray(node) ? node.map(canonical2) : node && typeof node === "object" ? Object.fromEntries(Object.keys(node).sort().map((key) => [key, canonical2(node[key])])) : node;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical2(value)));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value2) => value2.toString(16).padStart(2, "0")).join("");
}
async function memoHash(row, kind) {
  const fields2 = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at"];
  if (kind === "memo_note") fields2.push("group_id", "body");
  return digest(Object.fromEntries(fields2.map((field2) => [field2, row[field2]])));
}
function desired(operation, remote) {
  if (!remote || remote.id !== operation.source_id) return false;
  if (operation.method === "DELETE") return deleted(remote);
  if (deleted(remote)) return false;
  const keys = operation.entity_type === "todo" ? operation.path.endsWith("/restore") ? ["date"] : operation.method === "POST" ? ["date", "text", ...operation.body.template_id ? ["template_id"] : []] : ["completed"] : operation.entity_type === "template" ? ["text"] : Object.keys(operation.body).filter((key) => !["version", "save_id"].includes(key));
  return keys.every((key) => remote[key] === operation.body[key]);
}
function expectedFields(operation, remote) {
  const base = operation.base;
  if (!base) return true;
  const fields2 = operation.entity_type === "todo" ? deleted(remote) ? ["date"] : ["date", "text"] : [];
  return fields2.every((key) => base[key] === void 0 || remote[key] === base[key]);
}
function completeNoteRow(remote) {
  const time2 = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
  return remote && uuidPattern3.test(remote.id) && ["life", "work"].includes(remote.category) && /^\d{4}-\d{2}-\d{2}$/.test(remote.date) && typeof remote.text === "string" && typeof remote.deleted === "boolean" && remote.can_edit === true && /^[a-f0-9]{64}$/.test(remote.content_hash) && Number.isSafeInteger(remote.change_seq) && remote.change_seq >= 0 && time2(remote.created_at) && time2(remote.updated_at) && (remote.deleted_at === null || time2(remote.deleted_at)) && remote.deleted === (remote.deleted_at !== null);
}
function validAcknowledgement(operation, remote) {
  if (operation.entity_type === "note_entry" && !completeNoteRow(remote)) return false;
  if (operation.entity_type === "template" && operation.method === "DELETE") {
    return remote?.id === operation.source_id && remote.deleted === true;
  }
  if (operation.path.endsWith("/restore") && remote?.version === operation.expected_version) {
    return desired(operation, remote) && expectedFields(operation, remote);
  }
  return Number.isSafeInteger(remote?.version) && remote.version === operation.expected_version + 1 && desired(operation, remote) && expectedFields(operation, remote);
}
function createContext(options2) {
  const { db, request, getScope, now = Date.now, uuid: uuid2 = () => crypto.randomUUID(), timeout = 2e4 } = options2;
  const owner = uuid2();
  const state2 = { phase: "idle", pending: 0, unsupported: 0, error: null };
  const { canDispatch, requireDispatch } = dispatchCapabilities(options2);
  const conflicts = createConflictStore({ db, now, canDispatch });
  const leaseKey = (scope) => entityKey(scope, "outbox-lease");
  const checkScope = (scope) => {
    if (getScope() !== scope) throw Object.assign(new Error("Offline identity changed"), { code: "OFFLINE_SCOPE_CHANGED" });
  };
  const list = (scope) => db.transaction(["outbox"], "readonly", async (tx) => ordered((await tx.getAll("outbox")).filter((value) => value.scope === scope && active2(value))));
  const retryable = async (scope) => {
    const first = /* @__PURE__ */ new Map();
    for (const row of await list(scope)) if (!first.has(row.entity_id)) first.set(row.entity_id, row);
    return [...first.values()].filter((row) => canDispatch(row) && ["queued", "unknown", "sending"].includes(row.status));
  };
  async function lease(scope) {
    checkScope(scope);
    return db.transaction(["meta"], "readwrite", async (tx) => {
      const old = await tx.get("meta", leaseKey(scope));
      if (old && old.owner !== owner && old.expires_at > now()) return false;
      await tx.put("meta", { key: leaseKey(scope), owner, expires_at: now() + 9e4 });
      return true;
    });
  }
  async function network(scope, path, opts = {}) {
    checkScope(scope);
    if (!await lease(scope)) throw new Error("Offline sync lease changed");
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
  return {
    db,
    request,
    getScope,
    now,
    uuid: uuid2,
    timeout,
    owner,
    conflicts,
    state: state2,
    leaseKey,
    checkScope,
    list,
    lease,
    network,
    canDispatch,
    requireDispatch,
    retryable
  };
}
async function replayOperation(tx, operation, input, all) {
  const replay = all.find((value) => value.save_id === operation.save_id);
  if (!replay) return null;
  if (replay.entity_id !== operation.entity_id || replay.path !== operation.path || replay.method !== operation.method || JSON.stringify(replay.body) !== JSON.stringify(operation.body)) throw new Error("Offline save_id cannot change its original request");
  const entity = await tx.get("entities", entityKey(input.scope, replay.entity_id));
  if (!entity) throw new Error("Offline operation entity is missing");
  if (input.initial_status === "unknown" && replay.status === "queued") {
    await tx.put("outbox", { ...replay, status: "unknown" });
    return { operation: { ...replay, status: "unknown" }, entity };
  }
  return { operation: replay, entity };
}
async function noteCapacity(tx, operation, old) {
  if (operation.entity_type !== "note_entry" || operation.expected_version !== 0 || operation.status === "unknown" || old) return;
  let count = 0;
  for (const entity of await tx.getAll("entities")) {
    const row = entity.dirty ? entity.local : entity.server;
    if (entity.scope === operation.scope && entity.entity_id.startsWith("note-entry:") && (entity.dirty || !entity.remote_missing) && row?.category === operation.body.category && row?.date === operation.body.date && !deleted(row)) count++;
  }
  if (count >= 200) throw Object.assign(new Error("本机当日记录已达 200 条，草稿已保留。"), { code: "OFFLINE_CACHE_LIMIT" });
}
function storageMethods(context) {
  const { db, checkScope, uuid: uuid2, now, owner } = context;
  async function enqueue(input) {
    input.assertActive?.();
    checkScope(input.scope);
    const operation = operationFor(input, uuid2, now());
    context.requireDispatch(operation);
    return db.transaction(["entities", "outbox", "meta"], "readwrite", async (tx) => {
      checkScope(input.scope);
      input.assertActive?.();
      const all = (await tx.getAll("outbox")).filter((value) => value.scope === input.scope);
      const replay = await replayOperation(tx, operation, input, all);
      if (replay) {
        input.assertActive?.();
        return replay;
      }
      const rows = all.filter(active2);
      if (rows.length >= 1e3) throw new Error("Offline queue is full; this edit was not saved");
      const previous = ordered(rows.filter((value) => value.entity_id === operation.entity_id)).at(-1);
      const conflict = rows.some((value) => value.entity_id === operation.entity_id && value.status === "conflict");
      if (conflict || previous && operation.expected_version !== previous.expected_version + 1) {
        throw new Error("Offline edits must use the preceding local version");
      }
      const sequenceKey = entityKey(input.scope, "outbox-sequence");
      const sequence = (await tx.get("meta", sequenceKey))?.value || 0;
      operation.seq = sequence + 1;
      const key = entityKey(input.scope, operation.entity_id), old = await tx.get("entities", key);
      await noteCapacity(tx, operation, old);
      const visible2 = old?.dirty ? old.local : old?.server || operation.base;
      operation.base = operation.base || old?.server || null;
      operation.local = {
        ...visible2,
        ...operation.local,
        ...operation.entity_type === "todo" && operation.path === "/todos" ? { completed: false } : {},
        ...operation.path.endsWith("/restore") ? { deleted: false, deleted_at: null } : {},
        ...operation.method === "DELETE" ? { deleted: true } : {}
      };
      const entity = {
        ...old,
        key,
        scope: input.scope,
        entity_id: operation.entity_id,
        server: old?.server || operation.base,
        local: operation.local,
        dirty: true
      };
      input.assertActive?.();
      await tx.put("entities", entity);
      await tx.put("outbox", operation);
      await tx.put("meta", { key: sequenceKey, value: operation.seq });
      input.assertActive?.();
      return { operation, entity };
    });
  }
  async function update(operation, fields2) {
    if (!context.canDispatch(operation)) return null;
    return db.transaction(["outbox", "meta"], "readwrite", async (tx) => {
      const current = await tx.get("outbox", operation.key);
      const held = await tx.get("meta", context.leaseKey(operation.scope));
      if (!context.canDispatch(current) || held?.owner !== owner || !["queued", "unknown", "sending"].includes(current.status)) return null;
      if (!Object.hasOwn(fields2, "claim_owner") && current.claim_owner !== owner) return null;
      const result = { ...current, ...fields2 };
      await tx.put("outbox", result);
      return result;
    });
  }
  async function acknowledge(operation, remote) {
    context.requireDispatch(operation);
    if (operation.entity_type === "note_entry" && !completeNoteRow(remote)) throw new Error("Incomplete note acknowledgement");
    checkScope(operation.scope);
    await db.transaction(["entities", "outbox"], "readwrite", async (tx) => {
      checkScope(operation.scope);
      const current = await tx.get("outbox", operation.key);
      if (!context.canDispatch(current) || current.claim_owner !== owner || !["sending", "unknown"].includes(current.status)) {
        throw new Error("Offline operation claim changed");
      }
      const key = entityKey(operation.scope, operation.entity_id), entity = await tx.get("entities", key);
      const confirmed = operation.entity_type === "template" && operation.method === "DELETE" ? { ...operation.base, ...entity.server, ...remote, version: operation.expected_version + 1 } : remote;
      await tx.delete("outbox", operation.key);
      const remaining = (await tx.getAll("outbox")).some((value) => value.scope === operation.scope && value.entity_id === operation.entity_id && active2(value));
      await tx.put("entities", {
        ...entity,
        server: confirmed,
        local: remaining ? entity.local : confirmed,
        dirty: remaining,
        conflict: null
      });
    });
  }
  return { enqueue, update, acknowledge };
}
function remoteMethods(context) {
  const { network } = context;
  async function readRemote(operation) {
    const scope = operation.scope, type = operation.entity_type;
    if (type === "note_entry" || type === "memo_note") {
      try {
        return await network(scope, operation.path);
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    }
    if (type === "memo_group") {
      const index2 = await network(scope, "/memos");
      if (index2?.can_edit !== true || !Array.isArray(index2.groups)) throw new Error("Invalid memo index");
      const row2 = index2.groups.find((value) => value.id === operation.source_id);
      return row2 ? { ...row2, can_edit: true } : null;
    }
    const path = type === "template" ? "/todo-templates" : "/todos?date=" + (operation.body.date || operation.base?.date || operation.local.date);
    const index = await network(scope, path);
    if (!Array.isArray(index?.items)) throw new Error("Incomplete offline entity index");
    const row = index.items.find((value) => value.id === operation.source_id);
    if (row || type === "template") return row || null;
    const day3 = operation.body.date || operation.base?.date || operation.local.date;
    const snapshot = await network(scope, "/workbench-snapshot?date=" + day3);
    if (snapshot?.complete !== true || snapshot.scope_id !== scope || !Array.isArray(snapshot.data?.todos)) {
      throw new Error("Todo absence could not be verified completely");
    }
    return snapshot.data.todos.find((value) => value.source_id === operation.source_id) ? { ...snapshot.data.todos.find((value) => value.source_id === operation.source_id), id: operation.source_id } : null;
  }
  return { readRemote };
}
function receiptMethods(context) {
  const { network, readRemote } = context;
  async function receiptRead(operation) {
    const note = operation.entity_type === "note_entry", scope = operation.scope;
    const receiptPath = (note ? "/note-entries" : "/memos") + "/operations/" + operation.save_id;
    const receipt = await network(scope, receiptPath);
    if (!receipt || typeof receipt.found !== "boolean") throw new Error("Invalid offline save receipt");
    const remote = await readRemote(operation);
    if (receipt.found) {
      const hash = note ? remote?.content_hash : remote && await memoHash(remote, operation.entity_type);
      const expectedHash = note ? receipt.content_hash : receipt.entity_hash;
      const kind = operation.entity_type === "memo_note" ? "notes" : "groups";
      if (receipt.id === operation.source_id && receipt.version === operation.expected_version + 1 && (note || receipt.kind === kind) && remote?.can_edit === true && remote.version === receipt.version && hash === expectedHash && desired(operation, remote)) {
        return { result: "ack", remote };
      }
      return { result: "conflict", remote };
    }
    if (!remote && operation.expected_version === 0) {
      const path = note ? "/note-entries?category=" + operation.body.category + "&date=" + operation.body.date : "/memos";
      const index = await network(scope, path);
      if (index?.can_edit !== true) throw new Error("Offline editor capability could not be verified");
      const rows = note ? index.entries : operation.entity_type === "memo_note" ? index.notes : index.groups;
      if (!Array.isArray(rows) || rows.some((value) => value.id === operation.source_id)) {
        throw new Error("Offline create absence could not be verified");
      }
      return { result: "retry", remote };
    }
    if (remote?.can_edit === true && !deleted(remote) && remote.version === operation.expected_version) {
      return { result: "retry", remote };
    }
    return { result: "conflict", remote };
  }
  return { receiptRead };
}
function processingMethods(context) {
  const { receiptRead, readRemote, acknowledge, update, network, conflicts, now, owner } = context;
  async function reconcile(operation) {
    if (!["todo", "template"].includes(operation.entity_type)) return receiptRead(operation);
    const remote = await readRemote(operation);
    if (remote && remote.version === operation.expected_version + 1 && desired(operation, remote) && expectedFields(operation, remote)) return { result: "ack", remote };
    if (!remote && operation.expected_version === 0) return { result: "retry", remote };
    if (operation.path.endsWith("/restore") && remote?.version === operation.expected_version && deleted(remote)) {
      return { result: "retry", remote };
    }
    if (remote && !deleted(remote) && remote.version === operation.expected_version && expectedFields(operation, remote)) {
      return { result: "retry", remote };
    }
    return { result: "conflict", remote };
  }
  async function fail4(operation, error) {
    if ([409, 410, 404].includes(error.status)) {
      const current = await context.db.transaction(["outbox"], "readonly", (tx) => tx.get("outbox", operation.key));
      if (!context.canDispatch(current)) return;
      let remote = null;
      try {
        remote = await readRemote(operation);
      } catch {
      }
      return conflicts.record({ operation, remote, reason: deleted(remote) ? "deleted" : error.code || "version" });
    }
    const attempts = operation.attempts + 1;
    const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
    const status = [401, 403].includes(error.status) ? "paused" : error.status && error.status < 500 && error.status !== 429 ? "blocked" : "unknown";
    return update(operation, {
      status,
      attempts,
      next_attempt_at: now() + (error.status === 429 ? Math.max(6e4, delay) : delay),
      error: error.code || "OFFLINE_UNKNOWN"
    });
  }
  async function process(operation) {
    if (!context.canDispatch(operation)) return;
    try {
      const claimed = await update(operation, { claim_owner: owner });
      if (!claimed) return;
      if (["unknown", "sending"].includes(operation.status)) {
        const checked2 = await reconcile(claimed);
        if (checked2.result === "ack") return await acknowledge(claimed, checked2.remote);
        if (checked2.result === "conflict") return conflicts.record({
          operation: claimed,
          remote: checked2.remote,
          reason: deleted(checked2.remote) ? "deleted" : "version"
        });
      }
      const sending = await update(claimed, { status: "sending" });
      if (!sending) return;
      const remote = await network(operation.scope, operation.path, { method: operation.method, body: operation.body });
      if (!validAcknowledgement(operation, remote)) throw new Error("Invalid offline write acknowledgement");
      return await acknowledge(sending, remote);
    } catch (error) {
      return fail4({ ...operation, claim_owner: owner }, error);
    }
  }
  return { reconcile, fail: fail4, process };
}
function executionMethods(context) {
  const { getScope, lease, state: state2, list, checkScope, process, db, leaseKey, owner, now, retryable, canDispatch } = context;
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
        const operation = (await retryable(scope)).find((value) => value.next_attempt_at <= now());
        if (!operation) break;
        await process(operation);
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
        if ((await tx.get("meta", leaseKey(scope)))?.owner === owner) await tx.delete("meta", leaseKey(scope));
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
      for (const operation of await tx.getAll("outbox")) {
        if (operation.scope === scope && canDispatch(operation) && operation.status === "paused") {
          await tx.put("outbox", { ...operation, status: "unknown", next_attempt_at: 0, claim_owner: null });
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
  const { enqueue, drain, resume, list, state: state2, conflicts, canDispatch, retryable } = context;
  return { enqueue, drain, resume, list, state: state2, conflicts, canDispatch, retryable };
}

// web/offline/sync.mjs
var FORMAT = "haoduoyu-workbench-snapshot-v1";
var collections = ["todos", "life_notes", "work_notes", "work_reminders", "memo_groups", "memos"];
var types = /* @__PURE__ */ new Set(["todo", "life_note", "work_note", "work_reminder", "memo_group", "memo_note"]);
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
  "group_id"
]);
var hashPattern2 = /^[a-f0-9]{64}$/;
var datePattern = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
var supportedId = /^(?:todo|legacy-life|legacy-work|note-entry|work-reminder|memo-group|memo-note):/;
var SNAPSHOT_PULL_LIMITS = Object.freeze({
  maxEntities: 4e3,
  maxDates: 1e3,
  maxResponseBytes: 1048576,
  maxBatchBytes: 8388608,
  maxHashBytes: 8388608,
  maxRequests: 128
});
var stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
var canonical = (value) => JSON.stringify(stable(value));
var equal = (a, b) => canonical(a) === canonical(b);
var object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function fail2(code, message, status) {
  throw Object.assign(new Error(message), { code, ...status ? { status } : {} });
}
function requireValue(condition, message = "工作台快照内容不完整，未覆盖本地数据。") {
  if (!condition) fail2("OFFLINE_SNAPSHOT_INVALID", message);
}
function day2(value) {
  requireValue(typeof value === "string" && datePattern.test(value));
  const parsed = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  requireValue(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value);
  return value;
}
function stamp(value, nullable = false) {
  if (value === null && nullable) return;
  const parts = typeof value === "string" && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireValue(parts && Number(parts[2]) < 24 && Number(parts[3]) < 60 && Number(parts[4]) < 60 && Number.isFinite(Date.parse(value)) && (parts[5] === "Z" || Number(parts[5].slice(1, 3)) < 24 && Number(parts[5].slice(4)) < 60));
  day2(parts[1]);
}
function identity2(scope, getScope) {
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
      const input = encoder.encode(canonical(value));
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
function envelope(value, scope, limits) {
  if (object(value) && value.scope_id !== scope) fail2("OFFLINE_SCOPE_CHANGED", "快照身份范围与已核实范围不同，原本地内容已保留。");
  requireValue(object(value) && value.snapshot_format === FORMAT && value.projection === "current" && value.complete === true && value.scope_id === scope && value.timezone === "Asia/Shanghai" && hashPattern2.test(value.manifest_hash) && hashPattern2.test(value.global_content_hash) && Array.isArray(value.entities) && value.entities.length <= limits.maxEntities);
  stamp(value.generated_at);
  const seen = /* @__PURE__ */ new Set();
  let previous = "";
  for (const row of value.entities) {
    requireValue(object(row) && Object.keys(row).sort().join(",") === "content_hash,date,deleted_at,entity_id,entity_type,updated_at" && typeof row.entity_id === "string" && row.entity_id.length > 0 && row.entity_id.length <= 256 && !seen.has(row.entity_id) && row.entity_id > previous && types.has(row.entity_type) && hashPattern2.test(row.content_hash));
    if (row.date !== null) day2(row.date);
    stamp(row.updated_at);
    stamp(row.deleted_at, true);
    seen.add(row.entity_id);
    previous = row.entity_id;
  }
  return value;
}
async function indexFor(value, scope, limits, readBudget) {
  envelope(value, scope, limits);
  requireValue(Array.isArray(value.dates) && value.dates.length <= limits.maxDates && value.index_hash === value.manifest_hash);
  const represented = new Set(value.entities.filter((row) => row.date !== null).map((row) => row.date));
  let previous = "";
  for (const row of value.dates) {
    requireValue(object(row) && Object.keys(row).sort().join(",") === "content_hash,date" && day2(row.date) > previous && hashPattern2.test(row.content_hash) && represented.has(row.date));
    previous = row.date;
    represented.delete(row.date);
    requireValue(row.content_hash === await readBudget.hash({ scope_id: scope, entities: value.entities.filter((entity) => entity.date === row.date) }));
  }
  requireValue(represented.size === 0);
  requireValue(value.manifest_hash === await readBudget.hash({ snapshot_format: FORMAT, scope_id: scope, entities: value.entities }));
  requireValue(value.global_content_hash === await readBudget.hash({ scope_id: scope, entities: value.entities.filter((row) => row.date === null) }));
  return value;
}
function sameIndex(a, b) {
  return a.scope_id === b.scope_id && a.manifest_hash === b.manifest_hash && a.global_content_hash === b.global_content_hash && equal(a.entities, b.entities) && equal(a.dates, b.dates);
}
async function detailFor(value, date, index, limits, readBudget) {
  envelope(value, index.scope_id, limits);
  requireValue(value.date === date && value.manifest_hash === index.manifest_hash && value.global_content_hash === index.global_content_hash && equal(value.entities, index.entities) && object(value.data) && Object.keys(value.data).sort().join(",") === [...collections].sort().join(",") && hashPattern2.test(value.content_hash) && hashPattern2.test(value.date_content_hash));
  const expected = new Map(index.entities.filter((row) => row.date === null || row.date === date).map((row) => [row.entity_id, row])), records = [];
  for (const name of collections) {
    const rows = value.data[name];
    requireValue(Array.isArray(rows));
    let previous = "";
    for (const row of rows) {
      requireValue(object(row) && Object.keys(row).every((key) => recordKeys.has(key)) && row.entity_id > previous && expected.has(row.entity_id) && equal(metadata(row), expected.get(row.entity_id)) && typeof row.source === "string" && typeof row.source_id === "string" && Number.isSafeInteger(row.version) && row.version >= 1);
      stamp(row.created_at, true);
      if (row.change_seq !== void 0) requireValue(Number.isSafeInteger(row.change_seq) && row.change_seq >= 0);
      const { content_hash, ...content } = row;
      requireValue(content_hash === await readBudget.hash(content));
      previous = row.entity_id;
      expected.delete(row.entity_id);
      records.push(row);
    }
  }
  requireValue(expected.size === 0);
  const dateEntities = index.entities.filter((row) => row.date === date);
  requireValue(value.date_content_hash === await readBudget.hash({ scope_id: index.scope_id, entities: dateEntities }));
  requireValue(value.content_hash === await readBudget.hash({ snapshot_format: FORMAT, scope_id: index.scope_id, date, timezone: "Asia/Shanghai", data: value.data }));
  return records;
}
async function applySnapshot({ db, getScope, scope, key, index, initial, cached, records, now }) {
  await db.transaction(["entities", "meta"], "readwrite", async (tx) => {
    identity2(scope, getScope);
    const current = await tx.get("meta", key);
    if (!equal(current ?? null, initial.meta ?? null)) fail2("OFFLINE_SNAPSHOT_CHANGED", "其他页面已更新本地快照，请重新核对。");
    const all = (await tx.getAll("entities")).filter((row) => row.scope === scope), manifest = new Set(index.entities.map((row) => row.entity_id));
    for (const record of records.values()) {
      const storageKey = entityKey(scope, record.entity_id), old = await tx.get("entities", storageKey);
      if (old?.server?.version > record.version) fail2("OFFLINE_SNAPSHOT_CHANGED", "本地已确认较新版本，未覆盖该版本。");
      const server = { ...record, id: record.source_id }, sameVersion = old?.server?.version === record.version;
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
        snapshot_hash: record.content_hash,
        remote_missing: false,
        synced_at: now(),
        ...record.entity_type === "todo" ? { needs_api_refresh: !sameVersion || old?.needs_api_refresh === true } : {}
      });
    }
    for (const row of all) if (row.server && supportedId.test(row.entity_id) && !manifest.has(row.entity_id)) {
      if (!equal(row.server, cached.get(row.entity_id)?.server ?? null))
        fail2("OFFLINE_SNAPSHOT_CHANGED", "其他页面刚确认了记录，未把它判为线上缺失。");
      await tx.put("entities", { ...row, server: null, snapshot_hash: null, remote_missing: true, synced_at: now() });
    }
    identity2(scope, getScope);
    await tx.put("meta", { key, value: { index, verified_at: now() } });
  });
}
function createSnapshotSync({ db, request, getScope, now = Date.now, crypto: crypto2 = globalThis.crypto, limits = {} }) {
  if (!db?.transaction || typeof request !== "function" || typeof getScope !== "function") throw new TypeError("Snapshot sync dependencies required");
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
    const key = JSON.stringify([scope, "snapshot"]), readBudget = budget(limits, crypto2);
    const initial = await db.transaction(["entities", "meta"], "readonly", async (tx) => ({
      meta: await tx.get("meta", key),
      entities: (await tx.getAll("entities")).filter((row) => row.scope === scope)
    }));
    identity2(scope, getScope);
    async function get(path) {
      identity2(scope, getScope);
      readBudget.request();
      const value = await request(path);
      identity2(scope, getScope);
      readBudget.response(value);
      return value;
    }
    const index = await indexFor(await get("/workbench-snapshot/index"), scope, limits, readBudget);
    const previous = initial.meta?.value?.index;
    const oldDates = new Map(previous?.scope_id === scope ? previous.dates.map((row) => [row.date, row.content_hash]) : []);
    const dates = new Map(index.dates.map((row) => [row.date, row.content_hash]));
    const changed2 = new Set([.../* @__PURE__ */ new Set([...oldDates.keys(), ...dates.keys()])].filter((date) => oldDates.get(date) !== dates.get(date)));
    const cached = new Map(initial.entities.map((row) => [row.entity_id, row]));
    let needGlobal = !previous || previous.global_content_hash !== index.global_content_hash;
    for (const entity of index.entities) {
      const row = cached.get(entity.entity_id);
      if (!row?.server || row.snapshot_hash !== entity.content_hash) {
        if (entity.date === null) needGlobal = true;
        else changed2.add(entity.date);
      }
    }
    if (!changed2.size && needGlobal && index.entities.some((row) => row.date === null))
      changed2.add(probeDate === void 0 ? new Date(now() + 8 * 36e5).toISOString().slice(0, 10) : day2(probeDate));
    if (changed2.size + 2 > limits.maxRequests) fail2("OFFLINE_SNAPSHOT_LIMIT", "变化日期过多，未返回部分同步结果。", 413);
    const records = /* @__PURE__ */ new Map();
    for (const date of [...changed2].sort()) {
      const rows = await detailFor(await get("/workbench-snapshot?date=" + encodeURIComponent(date)), date, index, limits, readBudget);
      for (const row of rows) {
        if (records.has(row.entity_id)) requireValue(equal(records.get(row.entity_id), row));
        records.set(row.entity_id, row);
      }
    }
    const verified = await indexFor(await get("/workbench-snapshot/index"), scope, limits, readBudget);
    if (!sameIndex(index, verified)) fail2("OFFLINE_SNAPSHOT_CHANGED", "读取期间线上内容已变化，请稍后重新核对；本地内容已保留。");
    identity2(scope, getScope);
    await applySnapshot({ db, getScope, scope, key, index, initial, cached, records, now });
    state2.last_success = now();
    return { status: "synced", scope, changed_dates: [...changed2].sort(), entities: index.entities.length };
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
var uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var failure = (message, code = "OFFLINE_INVALID_MUTATION") => Object.assign(new Error(message), { code, localNotSaved: true });
function noteMutationRoute(path, options2, features) {
  const match = /^\/note-entries\/([a-f0-9-]{36})$/i.exec(path), method = (options2.method || "GET").toUpperCase();
  return features.notes && match && uuid.test(match[1]) && ["PUT", "DELETE"].includes(method) ? { type: "note_entry", id: match[1].toLowerCase(), method } : null;
}
function checked(body, method) {
  const fields2 = method === "PUT" ? ["category", "date", "text", "version", "save_id"] : ["version", "save_id"];
  if (!body || Object.keys(body).sort().join(",") !== fields2.sort().join(",") || !uuid.test(body.save_id) || !Number.isSafeInteger(body.version) || body.version < (method === "PUT" ? 0 : 1) || body.version >= Number.MAX_SAFE_INTEGER)
    throw failure("保存字段或原保存标识不完整，本次修改未保存。");
  if (method === "PUT") {
    const day3 = /* @__PURE__ */ new Date(body.date + "T00:00:00Z");
    if (!["life", "work"].includes(body.category) || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body.date) || !Number.isFinite(day3.getTime()) || day3.toISOString().slice(0, 10) !== body.date || typeof body.text !== "string" || !body.text.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.text) || new TextEncoder().encode(body.text.replace(/\r\n?/g, "\n")).byteLength > 65536)
      throw failure("分类、日期或正文无效，草稿已保留。");
  }
  return structuredClone(body);
}
function createNoteMutations(context) {
  async function mutate(path, options2, route, guard) {
    const { state: state2, cache, outbox, now } = context, owner = state2.scope, generation = context.generation;
    const active4 = () => {
      guard();
      if (!owner || owner !== state2.scope || generation !== context.generation)
        throw failure("身份范围已变化，本次修改未保存。", "OFFLINE_SCOPE_CHANGED");
    };
    active4();
    const body = checked(options2.body, route.method);
    if (!await cache.noteCapability()) throw failure("请先联网核实碎碎念编辑能力。", "OFFLINE_SCOPE_REQUIRED");
    active4();
    const stored = await cache.entity("note-entry:" + route.id), visible2 = offlineValue(stored);
    active4();
    if (route.method === "PUT" && body.version === 0 && !visible2) {
      const existing = await cache.entities();
      active4();
      if (existing.filter((row) => row.entity_id.startsWith("note-entry:") && (row.dirty ? row.local : row.server)?.category === body.category && (row.dirty ? row.local : row.server)?.date === body.date && !(row.dirty ? row.local : row.server)?.deleted && !(row.dirty ? row.local : row.server)?.deleted_at && (row.dirty || !row.remote_missing)).length >= 200)
        throw failure("本机该日记录已达 200 条，草稿已保留。", "OFFLINE_CACHE_LIMIT");
    }
    if (!options2.offlineUnknown && body.version !== (visible2?.version || 0))
      throw failure("本机已有更新，请重新读取后保存，草稿已保留。", "OFFLINE_CACHE_CHANGED");
    if (route.method === "DELETE" && !visible2) throw failure("此记录尚未保存在本机。", "OFFLINE_CACHE_MISS");
    if (visible2 && route.method === "PUT" && (visible2.category !== body.category || visible2.date !== body.date))
      throw failure("记录的分类和日期不可更改。");
    const stamp2 = new Date(now()).toISOString();
    const local = {
      ...visible2,
      ...body,
      id: route.id,
      can_edit: true,
      deleted: route.method === "DELETE",
      created_at: visible2?.created_at || stamp2,
      updated_at: stamp2,
      deleted_at: route.method === "DELETE" ? stamp2 : null
    };
    let result;
    try {
      result = await outbox.enqueue({
        scope: owner,
        entity_type: "note_entry",
        entity_id: route.id,
        method: route.method,
        path,
        body,
        base: stored?.server || null,
        local,
        initial_status: options2.offlineUnknown ? "unknown" : "queued",
        assertActive: active4
      });
    } catch (error) {
      error.localNotSaved = true;
      if (!error.code) error.code = "OFFLINE_STORAGE_UNAVAILABLE";
      throw error;
    }
    active4();
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
    const owner = getScope(), generation = getGeneration();
    if (!owner) return;
    const clean = rows.map(safeDraft);
    const active4 = () => {
      if (owner !== getScope() || generation !== getGeneration())
        throw Object.assign(new Error("身份范围已变化，旧草稿保持原范围。"), { code: "OFFLINE_SCOPE_CHANGED" });
    };
    await db.transaction(["meta"], "readwrite", async (tx) => {
      active4();
      for (const row of clean) {
        const identity3 = row.kind === "legacy" ? row.category + ":" + row.date : row.id;
        const key = entityKey(owner, "draft:" + row.kind + ":" + identity3 + ":" + draftOwner);
        if (unresolved(row)) await tx.put("meta", { key, scope: owner, draft_kind: row.kind, draft_owner: draftOwner, data: row, saved_at: now() });
        else if (row.kind === "note_entry") {
          await tx.delete("meta", key);
          for (const old of await tx.getAll("meta")) if (old.scope === owner && old.draft_kind === "note_entry" && old.data.id === row.id && old.data.draft === row.draft && !old.data.pending) await tx.delete("meta", old.key);
        }
      }
      active4();
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
    const owner = getScope(), generation = getGeneration();
    if (!owner) return [];
    const rows = await db.transaction(["meta"], "readonly", async (tx) => (await tx.getAll("meta")).filter((row) => row.scope === owner && row.draft_kind === kind).sort((a, b) => b.saved_at - a.saved_at).map((row) => row.data));
    return owner === getScope() && generation === getGeneration() ? rows : [];
  }
  return { capture, list, flush: () => Promise.all([...pending]) };
}

// web/offline/runtime.mjs
var OFFLINE_FEATURES = Object.freeze({ todos: true, notes: true, memos: false });
var scopePattern = /^[a-f0-9]{64}$/;
var uuidPattern4 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var networkFailure = (error) => error?.code === "NETWORK_UNAVAILABLE" || error?.code === "OFFLINE_NETWORK";
var fail3 = (message, code) => Object.assign(new Error(message), { code });
var today = (now) => new Date(now() + 8 * 36e5).toISOString().slice(0, 10);
var offlineError = () => fail3("当前离线，此操作需联网；输入内容已保留。", "OFFLINE_NETWORK");
async function identityProbe(context, path, options2 = {}) {
  const controller = new AbortController(), external = options2.signal;
  const abort = () => controller.abort(external.reason);
  if (external?.aborted) abort();
  else external?.addEventListener("abort", abort, { once: true });
  let timer;
  try {
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(fail3("身份范围核实暂未完成，本机内容已保留。", "OFFLINE_NETWORK"));
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
  if (["/todos", "/todo-templates"].includes(path) && method === "POST")
    return { type: path === "/todos" ? "todo" : "template", create: true };
  const match = /^\/(todos|todo-templates)\/([a-f0-9-]{36})(\/restore)?$/i.exec(path);
  if (!match || !uuidPattern4.test(match[2])) return null;
  if (match[3] && (method !== "POST" || match[1] !== "todos") || !match[3] && !["PATCH", "DELETE"].includes(method)) return null;
  return { type: match[1] === "todos" ? "todo" : "template", id: match[2].toLowerCase(), restore: Boolean(match[3]) };
}
function checkedBody(route, options2, uuid2) {
  const body = structuredClone(options2.body || {}), method = (options2.method || "GET").toUpperCase();
  const required = route.create ? route.type === "todo" ? ["id", "date", "text"] : ["id", "text"] : route.type === "todo" ? route.restore || method === "DELETE" ? ["date", "version"] : ["completed", "version"] : method === "DELETE" ? ["version"] : ["text", "version"];
  if (route.create && !body.id) body.id = uuid2();
  const allowed = [...required, ...route.create && route.type === "todo" ? ["template_id"] : []];
  if (required.some((key) => !Object.hasOwn(body, key)) || Object.keys(body).some((key) => !allowed.includes(key)))
    throw fail3("请求字段不完整，本次操作未保存。", "OFFLINE_INVALID_MUTATION");
  if (body.id && !uuidPattern4.test(body.id) || body.template_id && !uuidPattern4.test(body.template_id))
    throw fail3("事项标识无效，本次操作未保存。", "OFFLINE_INVALID_MUTATION");
  if (body.date && (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(body.date) || !Number.isFinite(Date.parse(body.date + "T00:00:00Z")) || (/* @__PURE__ */ new Date(body.date + "T00:00:00Z")).toISOString().slice(0, 10) !== body.date))
    throw fail3("请选择有效日期。", "OFFLINE_INVALID_MUTATION");
  if (Object.hasOwn(body, "text") && (typeof body.text !== "string" || !body.text.trim() || body.text.length > 500 || body.text.includes("\0")))
    throw fail3("请填写 1–500 字的内容。", "OFFLINE_INVALID_MUTATION");
  if (Object.hasOwn(body, "completed") && typeof body.completed !== "boolean")
    throw fail3("完成状态无效。", "OFFLINE_INVALID_MUTATION");
  if (!route.create && (!Number.isSafeInteger(body.version) || body.version < 1 || body.version >= Number.MAX_SAFE_INTEGER))
    throw fail3("版本无效，本次操作未保存。", "OFFLINE_INVALID_MUTATION");
  return body;
}
function runtimeContext(options2) {
  const {
    db,
    request,
    now = Date.now,
    uuid: uuid2 = () => crypto.randomUUID(),
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
  const cache = createOfflineCache({ db, getScope: () => state2.scope, getGeneration: () => context.generation, now });
  const context = {
    db,
    request,
    now,
    uuid: uuid2,
    online,
    onIdentity,
    features,
    state: state2,
    cache,
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
    if (opts?.method && !["GET", "HEAD"].includes(opts.method.toUpperCase()) && !writableRoute(path, opts, features) && !noteMutationRoute(path, opts, features))
      throw fail3("此本机操作需新版页面处理，原内容已保留。", "OFFLINE_UPGRADE_REQUIRED");
    if (!online() || !state2.verifiedScope || state2.verifiedScope !== state2.scope) throw offlineError();
    const owner = state2.scope, generation = context.generation;
    try {
      if (opts?.method && !["GET", "HEAD"].includes(opts.method.toUpperCase())) await context.verifyScope();
      if (!state2.verifiedScope || owner !== state2.scope || generation !== context.generation) throw offlineError();
      const result = await request(path, opts);
      if (owner !== state2.scope || generation !== context.generation) throw fail3("身份范围已变化。", "OFFLINE_SCOPE_CHANGED");
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
    uuid: uuid2,
    timeout: options2.timeout,
    enabledTypes: [...features.todos ? ["todo", "template"] : [], ...features.notes ? ["note_entry"] : []],
    supportedProtocols: [1]
  });
  context.snapshot = createSnapshotSync({ db, request: send, getScope: () => state2.scope, now });
  return context;
}
function identityActions(context) {
  const { cache, state: state2, emit, request, onIdentity } = context;
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
    if (forget) await cache.forgetIdentity();
    emit();
  }
  async function adopt(me, index, generation) {
    const identity3 = safeIdentity(me);
    if (generation !== context.generation) throw fail3("身份读取已过期。", "OFFLINE_SCOPE_CHANGED");
    if (!scopePattern.test(index?.scope_id) || index.complete !== true || index.projection !== "current")
      throw fail3("身份范围读取不完整，请联网重试。", "OFFLINE_SCOPE_REQUIRED");
    if (state2.scope && (state2.scope !== index.scope_id || identityFingerprint(state2.identity) !== identityFingerprint(identity3))) {
      await invalidate({ forget: true });
      throw fail3("当前身份范围已变化，原本机内容与队列已保留，请重新打开页面。", "OFFLINE_SCOPE_CHANGED");
    }
    await cache.saveIdentity(identity3, index.scope_id);
    if (generation !== context.generation || state2.scope && state2.scope !== index.scope_id) {
      await invalidate({ forget: true });
      throw fail3("身份核实已过期，原本机数据已保留。", "OFFLINE_SCOPE_CHANGED");
    }
    state2.scope = index.scope_id;
    state2.verifiedScope = index.scope_id;
    state2.identity = identity3;
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
      if (generation !== context.generation) throw fail3("身份核实已过期。", "OFFLINE_SCOPE_CHANGED");
      state2.verifiedScope = null;
      if ([401, 403].includes(error.status)) {
        await invalidate({ forget: true });
        throw error;
      }
      if (!networkFailure(error)) throw error;
      const cached = await cache.readIdentity();
      if (generation !== context.generation || !cached?.identity || !scopePattern.test(cached.scope)) throw error;
      if (liveIdentity && identityFingerprint(liveIdentity) !== identityFingerprint(cached.identity)) {
        await invalidate({ forget: true });
        throw fail3("当前身份已变化，请联网核实后重新打开。", "OFFLINE_SCOPE_CHANGED");
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
    const generation = context.generation, owner = state2.scope;
    try {
      const index = await identityProbe(context, "/workbench-snapshot/index");
      if (generation !== context.generation || state2.scope !== owner || index?.scope_id !== owner || index.complete !== true || index.projection !== "current") {
        await invalidate({ forget: true });
        throw fail3("身份范围已变化，本机内容与队列已保留。", "OFFLINE_SCOPE_CHANGED");
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
    const sequence = context.refreshSequence = (context.refreshSequence || 0) + 1;
    if (!state2.scope) {
      emit();
      return { ...state2 };
    }
    const owner = state2.scope, generation = context.generation;
    const [pending, conflicts] = await Promise.all([outbox.list(owner), outbox.conflicts.list(owner)]);
    if (sequence !== context.refreshSequence || owner !== state2.scope || generation !== context.generation) return { ...state2 };
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
    const owner = state2.scope, generation = context.generation;
    const result = { operations: await outbox.list(owner), conflicts: await outbox.conflicts.list(owner) };
    result.operations = result.operations.map((row) => outbox.canDispatch(row) ? row : { ...row, needs_upgrade: true });
    result.conflicts = result.conflicts.map((row) => outbox.canDispatch(row.operation) ? row : { ...row, needs_upgrade: true });
    return owner === state2.scope && generation === context.generation ? result : { operations: [], conflicts: [] };
  }
  async function resolve(key, choice2) {
    if (!state2.scope) throw fail3("请先核实身份。", "OFFLINE_SCOPE_REQUIRED");
    const conflict = (await outbox.conflicts.list(state2.scope)).find((row) => row.key === key);
    if (conflict && !outbox.canDispatch(conflict.operation)) throw fail3("此本机操作需新版页面处理，原内容已保留。", "OFFLINE_UPGRADE_REQUIRED");
    const result = await outbox.conflicts.resolve(key, choice2, { scope: state2.scope });
    await refresh();
    context.broadcast();
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
    if (!context.syncFlight) context.syncFlight = run2().finally(() => {
      context.syncFlight = null;
    });
    return context.syncFlight;
  }
  function scheduleRetry() {
    clearTimeout(context.timer);
    const owner = state2.scope;
    if (!owner) return;
    outbox.retryable(owner).then((operations2) => {
      if (context.stopped || state2.scope !== owner) return;
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
function mutationActions(context) {
  const { state: state2, cache, now, uuid: uuid2, outbox, features } = context;
  async function mutate(path, options2, route, guard) {
    guard();
    if (!state2.scope || !state2.identity) throw fail3("请先联网读取此工作台，再保存离线内容。", "OFFLINE_SCOPE_REQUIRED");
    const owner = state2.scope, generation = context.generation;
    const active4 = () => {
      guard();
      if (owner !== state2.scope || generation !== context.generation)
        throw fail3("身份范围已变化，本次修改未保存，输入已保留。", "OFFLINE_SCOPE_CHANGED");
    };
    const body = checkedBody(route, options2, uuid2), id = route.id || body.id;
    const old = await cache.entity(route.type + ":" + id), base = old?.server || null, visible2 = offlineValue(old);
    active4();
    if (!route.create && !visible2) throw fail3("此事项尚未保存在本机，请联网读取后再操作。", "OFFLINE_CACHE_MISS");
    const stamp2 = new Date(now()).toISOString(), method = options2.method.toUpperCase();
    const local = {
      ...visible2,
      ...body,
      id,
      created_at: visible2?.created_at || stamp2,
      updated_at: stamp2,
      deleted_at: method === "DELETE" ? stamp2 : route.restore ? null : visible2?.deleted_at || null,
      ...route.create ? { completed: false, ...route.type === "template" ? { completed_days: 0, habit_status: "todo" } : {} } : {},
      ...route.restore ? { deleted: false } : {}
    };
    if (body.template_id) {
      const template = offlineValue(await cache.entity("template:" + body.template_id));
      active4();
      if (!template || template.deleted) throw fail3("常用待办尚未保存在本机，请联网读取。", "OFFLINE_CACHE_MISS");
      local.template_version = template.version;
      local.template_active = true;
    }
    active4();
    const { entity } = await outbox.enqueue({
      scope: owner,
      entity_type: route.type,
      entity_id: id,
      method,
      path,
      body,
      base,
      local,
      assertActive: active4
    });
    active4();
    await context.refresh();
    context.broadcast();
    if (context.online()) context.scheduleRetry();
    return structuredClone(entity.local);
  }
  async function call(path, input = {}) {
    const { offlineGuard: guard = () => {
    }, ...options2 } = input;
    guard();
    const method = (options2.method || "GET").toUpperCase(), route = writableRoute(path, options2, features);
    const noteRoute = noteMutationRoute(path, options2, features);
    if (noteRoute) return context.noteMutations.mutate(path, options2, noteRoute, guard);
    if (path === "/auth/me" && method === "GET") return options2.context || options2.signal ? context.authenticate(options2) : context.verify();
    if (["/auth/login", "/auth/logout"].includes(path) && method === "POST") {
      const value = await context.request(path, options2);
      await context.invalidate({ forget: true });
      return value;
    }
    if (route) return mutate(path, options2, route, guard);
    if (method !== "GET" || !offlineReadRoute(path)) return unmanaged(context, path, options2, guard);
    if (offlineReadRoute(path).kind === "todo") context.lastTodoPath = path;
    try {
      if (context.online() && state2.identity) await context.verifyScope();
      guard();
      const owner = state2.scope, generation = context.generation;
      const baseline = owner ? await cache.fence(path) : void 0;
      guard();
      const value = await context.request(path, options2);
      if (owner !== state2.scope || generation !== context.generation) throw fail3("身份范围已变化，本次读取已取消。", "OFFLINE_SCOPE_CHANGED");
      if (offlineReadRoute(path).kind === "todo") state2.partial = false;
      if (!state2.scope) return value;
      try {
        return await cache.write(path, value, { baseline });
      } catch (error) {
        if (["OFFLINE_RESPONSE_INVALID", "OFFLINE_SCOPE_CHANGED", "OFFLINE_CACHE_CHANGED"].includes(error.code)) throw error;
        state2.error = error.message;
        context.emit();
        return value;
      }
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        await context.invalidate({ forget: true });
        throw error;
      }
      if (!networkFailure(error)) throw error;
      state2.verifiedScope = null;
      state2.online = false;
      const cached = await cache.read(path);
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
    if (writableRoute(path, options2, OFFLINE_FEATURES) || noteMutationRoute(path, options2, OFFLINE_FEATURES))
      throw fail3("浏览器无法保存本机数据，本次修改未保存；输入已保留。", "OFFLINE_STORAGE_UNAVAILABLE");
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
function apiFailure(path, response, payload, epoch, identity3) {
  const current = epoch === runtime.sessionEpoch && identity3 === (state.me?.id ?? null);
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
async function apiNetwork(path, options2 = {}) {
  const epoch = runtime.sessionEpoch, identity3 = state.me?.id ?? null;
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
  if (!response.ok) throw apiFailure(path, response, payload, epoch, identity3);
  return envelope2 ? payload : payload.data;
}
function api(path, options2 = {}) {
  const epoch = runtime.sessionEpoch, identity3 = state.me?.id ?? null;
  const active4 = () => {
    if (epoch !== runtime.sessionEpoch || identity3 !== (state.me?.id ?? null) || options2.signal?.aborted || options2.context?.controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
  };
  return offlineRequest(path, options2, apiNetwork, (me) => {
    if (state.me && state.me.id === me.id) state.me = me;
  }, active4);
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
  state.todoPanel = state.page === "todos" && ["history", "templates"].includes(params.get("todo_panel")) ? params.get("todo_panel") : "";
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
async function renderArticles(version = runtime.renderVersion, context) {
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
  if (version !== runtime.renderVersion || epoch !== runtime.sessionEpoch || account !== state.account) return "";
  const allowed = new Set(state.accounts.map((row) => row.id));
  if (!Array.isArray(payload.data) || payload.data.some((row) => row?.status !== "published" || !allowed.has(row.account_id) || account && row.account_id !== account)) {
    throw Object.assign(new Error("已发布文章读取未完成，请重新加载。"), { code: "ARTICLE_PAGE_INCOMPLETE" });
  }
  const articles = payload.data, meta = payload.meta || { total: articles.length, unfiltered_total: articles.length, has_more: false };
  state.articles = articles;
  state.articleMeta = meta;
  const content = articles.length ? articleTable(articles) : empty(
    meta.unfiltered_total ? "筛选无结果" : "暂无已发布文章",
    "",
    '<button class="btn" data-action="reset-filters">清空筛选</button>'
  );
  return `<section class="card article-list article-ledger article-ledger-list" aria-label="已发布文章详情"><form id="article-filters" class="filters">
<label class="search">${icon("search", 15)}<input class="input" name="q" value="${e(f.q)}"
placeholder="搜索标题或链接…" aria-label="搜索文章"></label>
${platformFilter("article-platform", f.platform, "文章平台")}${articleSelect("data_status", "数据状态", articleStatuses, f.data_status)}
<button type="button" class="btn" data-action="article-filter" aria-expanded="false" aria-controls="article-filter-popover">筛选 ▾</button>
</form>${filterChips(f)}${content}${articlePagination(meta)}</section>`;
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
  const context = beginModalRequests(), ticket = ++runtime.modalRequestVersion, version = runtime.renderVersion;
  let article = { account_id: state.account, production_mode: "unknown", status: "draft_saved" };
  if (id) article = await modalRequest(`/articles/${encodeURIComponent(id)}`, ticket, version, context);
  if (ticket !== runtime.modalRequestVersion || version !== runtime.renderVersion) return;
  const active4 = state.accounts.filter((account) => account.active || account.id === article.account_id);
  if (!active4.length) {
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
  )}：${e(num((d.trend || []).filter((day3) => day3.accounts.some((r) => r.account_id === a.id && r.metrics?.[state.trendMetric] != null)).length))}/${e(num((d.trend || []).length))}天有该指标；缺日处断开。</p>`).join("")}`;
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
  const identity3 = state.me?.id, generation = runtime.articleIndexGeneration;
  if (!identity3) throw Object.assign(new Error("索引会话已失效"), { staleIndex: true });
  const scope = context || backgroundRequests();
  const params = new URLSearchParams(Object.entries(Object.fromEntries(new URLSearchParams(query))).sort(([a], [b]) => a.localeCompare(b)));
  params.set("fields", "index");
  const key = identity3 + ":" + params.toString();
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
  if (generation !== runtime.articleIndexGeneration || identity3 !== state.me?.id) {
    if (!state.me || identity3 !== state.me.id) throw Object.assign(new Error("索引会话已失效"), { staleIndex: true });
    return articleIndex(query, context);
  }
  return rows;
}

// web/pages/reviews.mjs
async function renderReviews(version = runtime.renderVersion, context, { isCurrent = () => true, compactFilters = false } = {}) {
  const generation = runtime.articleIndexGeneration, tab = state.reviewTab, pending = tab === "pending", query = selectedQuery(), matches2 = (id) => !state.filters.platform || state.accounts.find((a) => a.id === id)?.platform === state.filters.platform;
  const [articles, rows, dueRows] = await Promise.all([articleIndex(query, context), pending ? [] : api(`/${tab === "observations" ? "observations" : "daily-metrics"}?${query}`, { context }), api(`/due-reviews${query ? "?" + query : ""}`, { context })]);
  if (version !== runtime.renderVersion || !isCurrent()) return "";
  if (generation !== runtime.articleIndexGeneration) return renderReviews(version, context, { isCurrent, compactFilters });
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
  openModal("数据记录", '<div id="media-records" role="status">正在读取…</div>', { drawer: true });
  const ticket = runtime.modalRequestVersion, version = runtime.renderVersion, context = beginModalRequests();
  const isCurrent = () => ticket === runtime.modalRequestVersion && version === runtime.renderVersion;
  try {
    const html = await renderReviews(version, context, { isCurrent, compactFilters: true });
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
  let day3 = "";
  return `<section class="card panel"><h2>最近操作</h2><div class="audit-list">${groups.map((g) => {
    const heading = day3 === g.day ? "" : `<h3>${e(g.day === bjtDate() ? "今天" : g.day === bjtDate(Date.now() - 864e5) ? "昨天" : g.day)}</h3>`;
    day3 = g.day;
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
      pending: /* @__PURE__ */ new Set(),
      readDate: "",
      readVersion: -1
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
function templateUnavailable(store, day3, id) {
  return !store.loaded || !day3.loaded || day3.loading || day3.adding || store.pending.has(id) || todoTemplateAdded(day3, id) || [...day3.removals.values()].some((ticket) => ticket.phase === "restoring" && ticket.item.template_id === id);
}
function inlineTodoTemplateContent(store) {
  const day3 = todoDay(), label3 = day3.date === bjtDate() ? "今日已添加" : "当日已添加";
  const status = store.loading && !store.loaded ? '<span class="todo-template-inline-status" role="status">正在读取常用待办…</span>' : "";
  const error = store.error ? `<p class="form-message" role="alert">${e(store.error)}
<button class="btn text small" data-action="todo-reload">重新读取</button></p>` : "";
  return status + error + store.items.map((item) => {
    const added = todoTemplateAdded(day3, item.id);
    return `<button type="button" class="todo-template-chip${added ? " is-added" : ""}" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="${e(added ? item.text + "，" + label3 : "添加：" + item.text)}" ${templateUnavailable(store, day3, item.id) ? "disabled" : ""}>
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
  const day3 = todoDay();
  const added = (id) => todoTemplateAdded(day3, id);
  const addedLabel = day3.date === bjtDate() ? "今日已添加" : "当日已添加";
  return store.items.map((item) => `<li class="todo-template-row" data-template-id="${e(item.id)}">
<div class="todo-template-line"><button class="todo-template-use" data-action="todo-template-use" data-id="${e(item.id)}"
aria-label="添加：${e(item.text)}" ${templateUnavailable(store, day3, item.id) ? "disabled" : ""}>${e(item.text)}</button>
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
    "todo-template-status": store.loading ? "正在读取…" : ""
  })) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
}
function templateReadActive(store, owner, sequence, version, date) {
  return templateSessionActive(owner) && store.sequence === sequence && version === runtime.renderVersion && state.page === "todos" && date === todoDate();
}
async function loadTodoTemplates({ ensure = false } = {}) {
  if (state.page !== "todos" || !state.me) return;
  const store = templateState(), date = todoDate(), version = runtime.renderVersion;
  if (ensure && (store.loaded && !store.error && !store.loading || store.loading && store.readDate === date && store.readVersion === version)) return;
  const owner = store.owner, sequence = ++store.sequence, revision = store.revision;
  store.readDate = date;
  store.readVersion = version;
  store.loading = true;
  store.error = "";
  paintTodoTemplates();
  try {
    const data = await api("/todo-templates");
    if (!templateReadActive(store, owner, sequence, version, date)) return;
    if (revision !== store.revision) return loadTodoTemplates();
    store.items = data.items;
    store.loaded = true;
  } catch (error) {
    if (templateReadActive(store, owner, sequence, version, date) && !isRequestAbort(error) && !error.staleSession) store.error = error.message;
  } finally {
    if (templateSessionActive(owner) && store.sequence === sequence) {
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
  if (item && !templateUnavailable(store, todoDay(), id)) await submitTodoTemplate(item);
}
function refreshOpenTodoTemplates() {
  const store = templateState();
  store.revision++;
  if (state.page === "todos") void loadTodoTemplates();
}

// web/pages/todo-actions.mjs
function todoBusy(day3, id) {
  return day3.updates.has(id) || day3.removals.has(id) || day3.templateWrites.has(id);
}
function todoActionContext({ id, date, owner = todoOwner() }) {
  if (!state.me || state.page !== "todos" || !validTodoDate(date) || date !== todoDate() || !todoSessionActive(owner)) return null;
  const day3 = todoDay(date), item = day3.items.find((row) => row.id === id);
  return item ? { day: day3, item, owner } : null;
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
function renderTodoUndo(day3) {
  return [...day3.removals.entries()].map(([id, ticket]) => {
    const label3 = ticket.phase === "deleting" ? "删除中…" : ticket.phase === "restoring" ? "恢复中…" : "已删除";
    return `<div class="todo-undo-entry"><span>${label3}：${e(ticket.item.text)}</span>
<button class="btn text small" data-action="todo-restore" data-id="${e(id)}" data-date="${e(day3.date)}"
data-owner="${e(todoOwner())}" ${ticket.phase === "ready" ? "" : "disabled"}>撤销</button></div>`;
  }).join("");
}
function expireTodoUndo(day3, id, ticket, owner) {
  clearTimeout(ticket.timer);
  ticket.timer = setTimeout(() => {
    if (!todoSessionActive(owner) || day3.removals.get(id) !== ticket || ticket.phase !== "ready") return;
    day3.removals.delete(id);
    paintTodos();
  }, 8e3);
  ticket.timer?.unref?.();
}
async function todoActionFailure(day3, error, owner) {
  if (!todoSessionActive(owner) || isRequestAbort(error) || error.staleSession) return;
  day3.error = error.message;
  if ([404, 409].includes(error.status) && day3.date === todoDate()) {
    day3.error = "这项计划已更新，请核对最新内容后再操作。";
    await loadTodos();
  }
}
async function deleteTodo(options2) {
  const context = todoActionContext(options2);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day: day3, item, owner } = context, ticket = { item, phase: "deleting", timer: null };
  day3.removals.set(item.id, ticket);
  day3.error = "";
  day3.notice = "";
  day3.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "DELETE", body: { date: day3.date, version: item.version } });
    if (!todoSessionActive(owner)) return;
    mergeTodo(day3, saved);
    ticket.item = saved;
    ticket.phase = "ready";
    expireTodoUndo(day3, item.id, ticket, owner);
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner)) return;
    day3.removals.delete(item.id);
    await todoActionFailure(day3, error, owner);
    if (todoSessionActive(owner) && item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner)) {
      day3.revision++;
      paintTodos();
    }
  }
}
async function restoreTodo({ id, date, owner = todoOwner() }) {
  if (!state.me || state.page !== "todos" || date !== todoDate() || !todoSessionActive(owner)) return;
  const day3 = todoDay(date), ticket = day3.removals.get(id);
  if (!ticket || ticket.phase !== "ready") return;
  clearTimeout(ticket.timer);
  ticket.phase = "restoring";
  mergeTodo(day3, ticket.item);
  day3.error = "";
  day3.revision++;
  paintTodos();
  try {
    const saved = await api(`/todos/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      body: { date, version: ticket.item.version }
    });
    if (!todoSessionActive(owner)) return;
    mergeTodo(day3, saved);
    day3.removals.delete(id);
    setTodoNotice(day3, "已恢复");
    if (saved.template_id) refreshOpenTodoTemplates();
  } catch (error) {
    if (!todoSessionActive(owner)) return;
    if (error.status === 409) day3.removals.delete(id);
    else {
      ticket.phase = "ready";
      expireTodoUndo(day3, id, ticket, owner);
    }
    await todoActionFailure(day3, error, owner);
    if (todoSessionActive(owner) && ticket.item.template_id && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
  } finally {
    if (todoSessionActive(owner)) {
      day3.revision++;
      paintTodos();
    }
  }
}
function todoTemplateRequest(day3, item) {
  let request = day3.templateLinks.get(item.id);
  if (!request || request.version !== item.version || request.template_version !== (item.template_version || 0)) {
    request = {
      date: day3.date,
      version: item.version,
      template_id: item.template_id || crypto.randomUUID(),
      template_version: item.template_version || 0
    };
    day3.templateLinks.set(item.id, request);
  }
  return request;
}
async function changeTodoTemplate(options2, remove = false) {
  const context = todoActionContext(options2);
  if (!context || context.item.deleted_at || todoBusy(context.day, context.item.id)) return;
  const { day: day3, item, owner } = context;
  if (remove !== Boolean(item.template_active) || templateState().pending.has(item.template_id)) return;
  day3.templateWrites.add(item.id);
  day3.error = "";
  day3.notice = "";
  day3.revision++;
  paintTodos();
  try {
    const saved = await api(remove ? `/todo-templates/${encodeURIComponent(item.template_id)}` : `/todos/${encodeURIComponent(item.id)}/template`, {
      method: remove ? "DELETE" : "POST",
      body: remove ? { version: item.template_version } : todoTemplateRequest(day3, item)
    });
    if (!todoSessionActive(owner)) return;
    if (remove) templateState().items = templateState().items.filter((row) => row.id !== item.template_id);
    else {
      mergeTodo(day3, saved.todo);
      mergeTodoTemplate(saved.template);
    }
    day3.templateLinks.delete(item.id);
    setTodoNotice(day3, remove ? "已取消常用，事项已保留" : "已添加为常用");
    refreshOpenTodoTemplates();
    if (remove && day3.date === todoDate()) await loadTodos();
  } catch (error) {
    if (todoSessionActive(owner)) {
      await todoActionFailure(day3, error, owner);
      if (todoSessionActive(owner) && [404, 409].includes(error.status)) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner)) {
      day3.templateWrites.delete(item.id);
      day3.revision++;
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
  const today2 = date === bjtDate(), active4 = date === selected;
  return `<button class="todo-calendar-day${active4 ? " is-selected" : ""}${today2 ? " is-today" : ""}" type="button"
data-action="todo-calendar-date" data-date="${e(date)}" aria-label="${e(date)}" aria-pressed="${active4}"
${today2 ? 'aria-current="date"' : ""}>${Number(date.slice(-2))}</button>`;
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
${["一", "二", "三", "四", "五", "六", "日"].map((day3) => `<span class="todo-calendar-weekday" aria-hidden="true">${day3}</span>`).join("")}
${'<span aria-hidden="true"></span>'.repeat(blanks)}${days.map((day3) => todoCalendarDay(day3, date)).join("")}</div>`;
}
function moveTodoMonth(offset) {
  if (!todosVisible()) return;
  if (state.todoPanel === "templates" && $("#todo-templates")?.dataset.loaded !== "true") void loadTodoTemplates();
  const day3 = todoDay(), date = /* @__PURE__ */ new Date(`${todoCalendarMonth(day3.date)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const month = date.toISOString().slice(0, 7);
  if (!validTodoDate(`${month}-01`)) return;
  todosState.calendarMonth = month;
  const calendar = $("#todo-calendar"), action = document.activeElement?.dataset?.action;
  if (!calendar) return;
  paintTodoCalendar(day3.date);
  if (["todo-calendar-prev", "todo-calendar-next"].includes(action)) $(`[data-action="${action}"]`, calendar)?.focus();
}
function paintTodoCalendar(date) {
  const calendar = $("#todo-calendar"), month = todoCalendarMonth(date), today2 = bjtDate();
  if (!calendar || calendar.dataset.month === month && calendar.dataset.today === today2) return;
  const focusedDate = document.activeElement?.dataset?.date;
  calendar.innerHTML = todoCalendar(date);
  calendar.dataset.month = month;
  calendar.dataset.today = today2;
  if (focusedDate) $(`[data-date="${CSS.escape(focusedDate)}"]`, calendar)?.focus();
}
function todoDateControls(date) {
  return `<div class="daily-todo-dates"><button class="btn small" data-action="todo-prev" aria-label="前一天">‹</button>
<label for="todo-date" class="sr-only">选择计划日期</label><input class="input" id="todo-date" type="date" value="${e(date)}">
<button class="btn small" data-action="todo-next" aria-label="后一天">›</button>
<button class="btn small" data-action="todo-today">今天</button></div>`;
}
function todoRow(item, day3) {
  const pending = todoBusy(day3, item.id);
  const completed = day3.updates.has(item.id) ? day3.updates.get(item.id) : item.completed;
  const removal = day3.removals.get(item.id), deleted2 = removal ? removal.phase !== "restoring" : Boolean(item.deleted_at);
  if (deleted2 || completed && todoCompletedMode() === "hide" && state.todoPanel !== "history") return "";
  return `<li class="daily-todo-row${completed ? " is-complete" : ""}" data-id="${e(item.id)}" data-date="${e(day3.date)}">
<label><input type="checkbox" data-todo-id="${e(item.id)}" data-date="${e(day3.date)}" ${completed ? "checked" : ""}
aria-disabled="${pending}"><span class="daily-todo-text">${e(item.text)}</span></label>

<button class="todo-row-menu icon-button" type="button" data-action="todo-menu" data-id="${e(item.id)}" data-date="${e(day3.date)}"
aria-label="事项操作" aria-haspopup="menu" aria-expanded="false" ${pending ? "disabled" : ""}>⋯</button></li>`;
}
function todoForm(day3) {
  const label3 = day3.date === bjtDate() ? "今天想完成什么？" : "这一天的计划";
  return `<form id="todo-form" class="daily-todo-form" data-date="${e(day3.date)}" aria-label="添加 ${e(day3.date)} 的计划">
<label for="todo-text" class="sr-only">${label3}</label><input id="todo-text" class="input" name="text" maxlength="500" required
autocomplete="off" placeholder="${label3}" value="${e(day3.draft)}" >
<button class="btn primary" type="submit" ${day3.adding ? "disabled" : ""}>添加</button></form>`;
}
function todoCaption(day3) {
  const today2 = day3.date === bjtDate();
  return `<time datetime="${e(day3.date)}" title="北京时间">${today2 ? "今天 · " : ""}${e(day3.date)}</time>`;
}
function todoHeading(day3) {
  return `<span id="todo-caption">${todoCaption(day3)}</span><div class="todo-view-links">
<button id="todo-return-today" class="btn text" data-action="todo-panel-close" ${state.todoDate && !state.todoPanel ? "" : "hidden"}>返回今日待办</button>
<button class="btn text" data-action="todo-panel" data-panel="history" aria-controls="todo-history"
aria-expanded="${state.todoPanel === "history"}">日历</button>
<button class="btn text" data-action="todo-panel" data-panel="templates" aria-controls="todo-templates"
aria-expanded="${state.todoPanel === "templates"}">管理常用</button></div>`;
}
function renderTodoHistory(day3) {
  return `<section id="todo-history" class="todo-view" aria-label="待办日历" ${state.todoPanel === "history" ? "" : "hidden"}>
<div class="todo-view-head"><h2>待办日历</h2><button class="btn" data-action="todo-panel-close">‹ 返回今日待办</button></div>
<div id="todo-calendar" class="daily-todo-calendar" data-month="${todoCalendarMonth(day3.date)}" data-today="${bjtDate()}">
${todoCalendar(day3.date)}</div>${todoDateControls(day3.date)}</section>`;
}
function paintTodoPanels(root) {
  const panel = state.todoPanel || "";
  for (const [id, value] of [["todo-main", ""], ["todo-history", "history"], ["todo-templates", "templates"]]) {
    const node = $("#" + id, root);
    if (node) node.hidden = id === "todo-main" ? panel === "templates" : panel !== value;
  }
  root?.querySelectorAll(".todo-list-options").forEach((node) => {
    node.hidden = panel === "history";
  });
  const back = $("#todo-return-today", root);
  if (back) back.hidden = !state.todoDate || Boolean(panel);
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
function todoPending(day3) {
  return Boolean(day3.adding || day3.updates.size || day3.templateWrites.size || [...day3.removals.values()].some((ticket) => ticket.phase !== "ready") || todoPreferences().pending);
}
function todoStatus(day3) {
  if (todoPending(day3) || day3.error || todoPreferences().error) return "";
  return day3.loading && !day3.loaded ? "正在读取…" : day3.notice;
}
function paintTodoSaving(root, day3) {
  const busy = todoPending(day3);
  root.setAttribute("aria-busy", String(busy));
  if (!busy) {
    clearTimeout(savingTimers.get(day3));
    savingTimers.delete(day3);
    savingTimes.delete(day3);
    return;
  }
  if (!savingTimes.has(day3)) {
    savingTimes.set(day3, Date.now());
    savingTimers.set(day3, setTimeout(() => {
      if (todosVisible() && todoDay() === day3) paintTodos();
    }, 900));
  } else if (Date.now() - savingTimes.get(day3) >= 900) $("#todo-status", root).textContent = "正在同步…";
}
function pendingTodo(day3) {
  return day3.adding && day3.submitting ? `<li class="todo-pending-row" aria-label="待添加">
<span class="todo-pending-marker" aria-hidden="true"></span><span>${e(day3.submitting.text)}</span></li>` : "";
}
function todoFeedback(day3) {
  const error = [day3.error, todoPreferences().error].filter(Boolean).join(" ");
  return error ? `${e(error)} ${day3.failedCreate ? `<span>「${e(day3.failedCreate.text)}」</span>
<button class="btn text small" data-action="todo-retry-add">重试添加</button>` : ""} <button class="btn text small" data-action="todo-reload">重新读取</button>` : "";
}
function todoHistoryEmpty(day3) {
  return state.todoPanel === "history" && day3.loaded && !day3.items.some((item) => !item.deleted_at) ? "这一天还没有待办。" : "";
}
function renderTodos() {
  const day3 = todoDay();
  return `<section id="daily-todos" class="daily-todos daily-todos-primary" data-date="${e(day3.date)}" aria-label="每日计划">
<div id="todo-heading" class="daily-todo-toolbar">${todoHeading(day3)}</div>
${renderTodoHistory(day3)}<div id="todo-main" ${state.todoPanel === "templates" ? "hidden" : ""}>${todoForm(day3)}${renderInlineTodoTemplates()}
<div id="todo-feedback" class="form-message" role="alert">${todoFeedback(day3)}</div>
<p id="todo-status" class="daily-todo-status" role="status">${todoStatus(day3)}</p>
<div id="todo-undo" class="todo-undo" role="status">${renderTodoUndo(day3)}</div>${renderTodoPreferences()}
<p id="todo-history-empty" class="daily-todo-status">${todoHistoryEmpty(day3)}</p>
<ul id="todo-items" class="daily-todo-items">${day3.items.map((item) => todoRow(item, day3)).join("")}${pendingTodo(day3)}</ul></div>
${renderTodoTemplates()}</section>`;
}
function todosVisible() {
  return Boolean(state.me) && state.page === "todos";
}
function paintTodos() {
  const root = $("#daily-todos");
  if (!root || !todosVisible()) return;
  const day3 = todoDay(), checkbox = document.activeElement?.dataset?.todoId;
  const menu = document.activeElement?.dataset?.action === "todo-menu" ? document.activeElement.dataset.id : null;
  if (root.dataset.date !== day3.date) {
    root.outerHTML = renderTodos();
    paintTodoTemplates();
    return;
  }
  const parts = {
    "todo-caption": todoCaption(day3),
    "todo-status": todoStatus(day3),
    "todo-undo": renderTodoUndo(day3),
    "todo-items": day3.items.map((item) => todoRow(item, day3)).join("") + pendingTodo(day3),
    "todo-feedback": todoFeedback(day3),
    "todo-history-empty": todoHistoryEmpty(day3)
  };
  for (const [id, html] of Object.entries(parts)) {
    const node = $("#" + id, root);
    if (node && node.innerHTML !== html) node.innerHTML = html;
  }
  paintTodoCalendar(day3.date);
  const input = $("#todo-text", root), button2 = $("#todo-form button[type=submit]", root);
  const prompt = day3.date === bjtDate() ? "今天想完成什么？" : "这一天的计划", label3 = $('label[for="todo-text"]', root);
  if (input && input.value !== day3.draft) input.value = day3.draft;
  if (input) {
    input.readOnly = false;
    input.placeholder = prompt;
  }
  if (label3) label3.textContent = prompt;
  if (button2) {
    button2.disabled = day3.adding;
    button2.textContent = "添加";
    button2.setAttribute("aria-busy", String(day3.adding));
  }
  paintTodoSaving(root, day3);
  paintTodoPanels(root);
  paintTodoPreferences();
  const focus = checkbox ? `[data-todo-id="${CSS.escape(checkbox)}"]` : menu ? `[data-action="todo-menu"][data-id="${CSS.escape(menu)}"]` : "";
  if (focus) ($(focus, root) || $("[data-todo-id]", root) || $("#todo-completed-mode", root))?.focus();
  paintTodoTemplates();
}
function todoReadActive(owner, version, date, day3, sequence) {
  return todoSessionActive(owner) && version === runtime.renderVersion && todoDate() === date && day3.sequence === sequence && todosVisible();
}
async function loadTodos(context) {
  if (!todosVisible()) return;
  void loadTodoTemplates({ ensure: true });
  const day3 = todoDay(), date = day3.date, owner = todoOwner(), version = runtime.renderVersion;
  const sequence = ++day3.sequence, revision = day3.revision;
  day3.loading = true;
  day3.error = "";
  paintTodos();
  try {
    const data = await api(`/todos?date=${encodeURIComponent(date)}`, { context });
    if (!todoReadActive(owner, version, date, day3, sequence)) return;
    if (day3.revision !== revision) return loadTodos(context);
    receiveTodoPreferences(data.completed_mode, data.preferences_version);
    day3.items = data.items;
    day3.loaded = true;
    if (state.todoPanel === "templates") paintTodoTemplates();
  } catch (error) {
    if (todoReadActive(owner, version, date, day3, sequence) && !isRequestAbort(error) && !error.staleSession) day3.error = error.message;
  } finally {
    if (todoReadActive(owner, version, date, day3, sequence)) {
      day3.loading = false;
      paintTodos();
    }
  }
}
function inputTodo(target) {
  const date = target.form?.dataset.date;
  if (target.id === "todo-text" && validTodoDate(date)) todoDay(date).draft = target.value;
}
function showTodoFailure(day3, error) {
  if (!isRequestAbort(error) && !error.staleSession) day3.error = error.message;
}
function setTodoNotice(day3, text) {
  const owner = todoOwner(), version = ++day3.noticeVersion;
  day3.notice = text;
  const timer = setTimeout(() => {
    if (!todoSessionActive(owner) || day3.noticeVersion !== version) return;
    day3.notice = "";
    if (day3.date === todoDate()) paintTodos();
  }, 2500);
  timer?.unref?.();
}
async function saveTodo(day3, request, templateId = "") {
  const owner = todoOwner(), submittedDraft = day3.draft;
  day3.adding = true;
  day3.submitting = request;
  day3.failedCreate = null;
  day3.error = "";
  day3.notice = "";
  day3.revision++;
  paintTodos();
  try {
    const item = await api("/todos", { method: "POST", body: request });
    if (!todoSessionActive(owner)) return;
    mergeTodo(day3, item);
    if (templateId) day3.templateCreates.delete(templateId);
    else {
      if (day3.draft === submittedDraft && submittedDraft.trim() === request.text) day3.draft = "";
      day3.create = null;
    }
    setTodoNotice(day3, "已添加");
  } catch (error) {
    if (todoSessionActive(owner)) {
      day3.failedCreate = request;
      showTodoFailure(day3, error);
      if (error.status === 410) {
        if (templateId) day3.templateCreates.delete(templateId);
        else day3.create = null;
        day3.error = "原事项已被删除，输入已保留，可再次添加。";
      }
    }
  } finally {
    if (todoSessionActive(owner)) {
      day3.adding = false;
      day3.submitting = null;
      day3.revision++;
      paintTodos();
    }
  }
}
async function retryTodoCreate() {
  const day3 = todoDay();
  if (todosVisible() && day3.failedCreate && !day3.adding)
    await saveTodo(day3, day3.failedCreate, day3.failedCreate.template_id || "");
}
async function submitTodo({ form, data }) {
  if (!todosVisible() || !validTodoDate(form.dataset.date)) return;
  const day3 = todoDay(form.dataset.date), text = String(data.text || "").trim();
  if (day3.adding) return;
  day3.draft = String(data.text || "");
  if (day3.date !== todoDate()) {
    paintTodos();
    return;
  }
  if (!text || text.length > 500) {
    day3.error = "请填写 1–500 字的计划。";
    paintTodos();
    return;
  }
  if (!day3.create || day3.create.text !== text) day3.create = { id: crypto.randomUUID(), date: day3.date, text };
  await saveTodo(day3, day3.create);
}
async function submitTodoTemplate(template) {
  if (!todosVisible()) return;
  const day3 = todoDay();
  if (day3.adding || todoTemplateAdded(day3, template.id)) return;
  let request = day3.templateCreates.get(template.id);
  if (!request || request.text !== template.text) {
    request = { id: crypto.randomUUID(), date: day3.date, text: template.text, template_id: template.id };
    day3.templateCreates.set(template.id, request);
  }
  await saveTodo(day3, request, template.id);
}
async function toggleTodo(target) {
  if (!todosVisible()) return;
  const day3 = todoDay(target.dataset.date), owner = todoOwner();
  const item = day3.items.find((row) => row.id === target.dataset.todoId);
  if (!item || item.deleted_at || day3.date !== todoDate()) return;
  if (todoBusy(day3, item.id)) {
    target.checked = day3.updates.has(item.id) ? day3.updates.get(item.id) : item.completed;
    return;
  }
  const completed = target.checked;
  day3.updates.set(item.id, completed);
  day3.error = "";
  day3.notice = "";
  day3.revision++;
  paintTodos();
  try {
    const updated = await api(`/todos/${encodeURIComponent(item.id)}`, { method: "PATCH", body: { completed, version: item.version } });
    if (todoSessionActive(owner)) {
      mergeTodo(day3, updated);
      setTodoNotice(day3, "已保存");
      if (updated.template_id) refreshOpenTodoTemplates();
    }
  } catch (error) {
    if (!todoSessionActive(owner)) return;
    day3.updates.set(item.id, item.completed);
    showTodoFailure(day3, error);
    if (error.status === 409 && day3.date === todoDate()) {
      day3.error = "这项计划已更新，已重新读取，请核对后再操作。";
      await loadTodos();
      if (todoSessionActive(owner) && item.template_id) refreshOpenTodoTemplates();
    }
  } finally {
    if (todoSessionActive(owner)) {
      day3.updates.delete(item.id);
      day3.revision++;
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
  function requestCollapse(category, date, key, revision, { explicit = false } = {}) {
    const view = page(category, date);
    if (view.active !== key || view.revision !== revision) return;
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

// web/pages/daily-notes.mjs
function legacyEditorMarkup() {
  return '<article id="notes-legacy-card" class="note-entry note-entry-editing notes-legacy-card" hidden><div class="note-entry-head"><time id="notes-legacy-time" class="note-entry-time" hidden></time><span id="notes-legacy-status" class="note-entry-status" role="status" aria-live="polite"></span></div><p id="notes-message" class="notes-message" role="alert" hidden></p><div class="notes-sheet"><label for="notes-editor" class="sr-only">原有记录内容</label><textarea id="notes-editor" class="notes-editor" aria-label="原有记录或保留草稿，只读" readonly hidden></textarea><div id="notes-reader" class="notes-reader"></div><p id="notes-empty" hidden>这条记录没有文字。</p></div><div class="notes-footer"><span id="notes-detail" class="notes-detail"></span><button class="btn text" type="button" data-notes-action="export-legacy" hidden>导出保留的原有草稿</button><div id="notes-write-actions" class="notes-write-actions" hidden><button class="btn" type="button" data-notes-action="save">立即保存</button><button class="btn" type="button" data-notes-action="restore" hidden>恢复原有记录</button><button class="btn text" type="button" data-notes-action="delete">删除原有记录</button></div></div><div id="notes-delete-confirm" class="notes-confirm" hidden><p>删除原有记录？</p><button class="btn" type="button" data-notes-action="cancel-delete">取消</button><button class="btn" type="button" data-notes-action="confirm-delete">确认删除</button></div><div id="notes-resolution" class="notes-resolution" hidden><button class="btn" type="button" data-notes-action="check">核对服务器版本</button><button class="btn" type="button" data-notes-action="retry" hidden>重试同一保存</button><div id="notes-conflict-actions" hidden><p>服务器上的文字：</p><pre id="notes-remote"></pre><button class="btn" type="button" data-notes-action="use-server">采用服务器内容</button><button class="btn" type="button" data-notes-action="use-draft">用此草稿保存到新版本</button></div></div></article>';
}
function renderDailyNotes() {
  const category = dailyNotesRouteCategory();
  return '<section id="daily-notes" class="daily-notes" aria-label="碎碎念" data-category="' + category + '"><div class="notes-categories segmented" role="group" aria-label="碎碎念分类">' + ["life", "work"].map((value) => '<button type="button" data-notes-category="' + value + '" aria-pressed="' + (value === category) + '">' + (value === "work" ? "工作碎碎念" : "生活碎碎念") + "</button>").join("") + '</div><div class="notes-toolbar"><div class="notes-date-controls"><button class="btn" type="button" data-notes-action="previous" aria-label="前一天">‹</button><label class="notes-date-label"><span class="sr-only">选择碎碎念日期</span><input id="notes-date" class="input" type="date" max="' + dailyNotesToday() + '"></label><button class="btn" type="button" data-notes-action="next" aria-label="后一天">›</button><button class="btn text" type="button" data-notes-action="today">今天</button></div><span id="notes-status" class="notes-status" role="status" aria-live="polite">正在读取…</span></div><div id="notes-drafts" class="notes-drafts" hidden></div><p id="notes-entry-message" class="notes-message" role="alert" hidden></p><div class="notes-entry-toolbar"><button class="btn notes-add-entry" type="button" data-notes-action="new" hidden>＋ 写一条</button><button class="btn text" type="button" data-notes-action="login" hidden>所有者登录</button></div><section id="notes-composer" class="notes-composer" aria-label="当前编辑的碎碎念" hidden><div class="notes-composer-heading"><span>正在编辑</span><button class="btn text" type="button" data-notes-action="collapse">收起</button></div><div id="notes-active-entry"></div>' + legacyEditorMarkup() + '</section><p id="notes-entry-empty" class="notes-empty" hidden>这一天还没有记录。</p><div id="notes-entry-list" class="notes-entry-list"></div><article id="notes-legacy-saved" class="note-entry note-entry-saved notes-legacy-saved" hidden><div class="note-entry-head"><time class="note-entry-time" hidden></time><span class="note-entry-status"></span></div><div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><button class="btn text note-entry-edit" type="button" data-notes-action="edit-legacy">查看原有记录</button><button class="btn text" type="button" data-notes-action="export-legacy" hidden>导出保留的原有草稿</button></article></section>';
}
var statuses = {
  loading: "正在读取…",
  dirty: "等待保存",
  saving: "正在保存…",
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
  const active4 = typeof document !== "undefined" && document.activeElement === editor, start = editor.selectionStart, end = editor.selectionEnd, direction = editor.selectionDirection, scroll = editor.scrollTop;
  editor.value = text;
  if (active4) {
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
  return '<p class="note-entry-message" role="alert" hidden></p><div class="note-entry-actions"><button class="btn text" type="button" data-note-entry-action="save" hidden>重试保存</button><button class="btn text" type="button" data-note-entry-action="restore" hidden>恢复</button><button class="btn text" type="button" data-note-entry-action="delete">删除</button></div><div class="note-entry-confirm notes-confirm" hidden><p>删除这条记录？</p><button class="btn" type="button" data-note-entry-action="cancel-delete">取消</button><button class="btn" type="button" data-note-entry-action="confirm-delete">确认删除</button></div><div class="note-entry-resolution notes-resolution" hidden><button class="btn" type="button" data-note-entry-action="check">核对保存结果</button><button class="btn" type="button" data-note-entry-action="retry" hidden>重试原保存</button><div class="note-entry-conflict" hidden><p>服务器上的文字：</p><pre></pre><button class="btn" type="button" data-note-entry-action="use-server">采用服务器内容</button><button class="btn" type="button" data-note-entry-action="use-draft">用此草稿保存</button></div></div>';
}
function createEntryElement(item, editing3) {
  const node = document.createElement("article");
  node.className = "note-entry " + (editing3 ? "note-entry-editing" : "note-entry-saved");
  node.dataset.noteEntry = item.id;
  node.innerHTML = '<div class="note-entry-head"><time class="note-entry-time"></time><span class="note-entry-status" role="status" aria-live="polite"></span></div>' + (editing3 ? '<label class="sr-only" for="entry-' + e(item.id) + '">碎碎念内容</label><textarea id="entry-' + e(item.id) + '" class="note-entry-editor" data-note-entry-editor="' + e(item.id) + '" placeholder="写下一点想说的话…" rows="3"></textarea><div class="note-entry-reader" hidden></div>' + entryControlsMarkup() : '<div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p><button class="btn text note-entry-edit" type="button" data-note-entry-action="edit">编辑</button>');
  return node;
}
function paintEntrySummary(node, item) {
  paintTime(node.querySelector("time"), item.updatedAt);
  const status = node.querySelector(".note-entry-status");
  status.textContent = statuses[item.phase] || (item.deleted ? "已删除" : item.version ? "已保存" : "写下后自动保存");
  status.dataset.phase = item.phase;
  const message = node.querySelector(".note-entry-message");
  message.textContent = item.error;
  message.hidden = !item.error;
}
function paintSavedEntry(node, item) {
  paintEntrySummary(node, item);
  const draft = noteDraftNeedsAttention(item), body = node.querySelector(".note-entry-reader");
  body.textContent = item.deleted ? "这条记录已删除。" : displayedText(item);
  body.classList.toggle("note-entry-draft-label", draft);
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
  save.hidden = !["error", "oversize"].includes(item.phase);
  save.disabled = busy || !item.dirty || item.phase === "oversize";
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
function paintActiveEditor(root, store, active4, legacy, confirmId) {
  const host = root.querySelector("#notes-active-entry");
  if (!editorNodes.has(root)) editorNodes.set(root, /* @__PURE__ */ new Map());
  const nodes = editorNodes.get(root), item = store.entry(active4);
  host.hidden = !item;
  if (item) {
    if (!nodes.has(active4)) nodes.set(active4, createEntryElement(item, true));
    const node = nodes.get(active4);
    if (host.firstElementChild !== node) host.replaceChildren(node);
    paintEntryEditor(node, item, confirmId);
  }
  root.querySelector("#notes-legacy-card").hidden = active4 !== "legacy";
  paintDailyNotes(root, legacy, { compatibility: true, editing: active4 === "legacy" });
}
function paintLegacySummary(root, legacy, active4) {
  const node = root.querySelector("#notes-legacy-saved"), draft = retainedLegacy(legacy);
  node.hidden = active4 === "legacy" || !(legacy.version > 0 || draft);
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
function paintRetainedDrafts(root, current, drafts) {
  const box = root.querySelector("#notes-drafts");
  const retained = [...new Set(drafts.filter((value) => value.date !== current.date || value.category !== current.category).map((value) => value.category + ":" + value.date))];
  box.hidden = !retained.length;
  box.innerHTML = "<span>保留的草稿：</span>" + retained.map((key) => {
    const [category, date] = key.split(":");
    return '<button class="btn text" type="button" data-notes-draft-category="' + e(category) + '" data-notes-date="' + e(date) + '">' + (category === "work" ? "工作 " : "生活 ") + e(date) + "</button>";
  }).join("");
}
function paintNoteEntries(root, store, current, legacy, { drafts = [], confirmId = "", active: active4 = "" } = {}) {
  const find = (selector) => root.querySelector(selector), list = find("#notes-entry-list");
  root.dataset.date = current.date;
  const dateInput = find("#notes-date");
  if (dateInput.value !== current.date) dateInput.value = current.date;
  find('[data-notes-action="next"]').disabled = current.date >= dailyNotesToday();
  const canEdit = current.loaded && current.canEdit;
  find('[data-notes-action="new"]').hidden = !canEdit;
  find('[data-notes-action="login"]').hidden = !current.loaded || current.canEdit;
  find("#notes-entry-message").textContent = current.error;
  find("#notes-entry-message").hidden = !current.error;
  const items = current.ids.map((id) => store.entry(id)).filter(Boolean);
  const saved = items.filter((item) => item.id !== active4 && (item.version > 0 || item.localVersion > 0 || noteDraftNeedsAttention(item)));
  const nodes = new Map([...list.children].map((node) => [node.dataset.noteEntry, node])), wanted = new Set(saved.map((item) => item.id));
  for (const [id, node] of nodes) if (!wanted.has(id)) node.remove();
  let cursor = list.firstElementChild;
  for (const item of saved) {
    const node = nodes.get(item.id) || createEntryElement(item, false);
    if (node === cursor) cursor = cursor.nextElementSibling;
    else list.insertBefore(node, cursor);
    paintSavedEntry(node, item);
  }
  paintActiveEditor(root, store, active4, legacy, confirmId);
  paintLegacySummary(root, legacy, active4);
  const composer = find("#notes-composer"), activeItem = active4 === "legacy" ? legacy : store.entry(active4);
  composer.hidden = !activeItem;
  composer.dataset.active = active4;
  find('[data-notes-action="collapse"]').disabled = !noteEditorCanCollapse(activeItem);
  find("#notes-entry-empty").hidden = !current.loaded || Boolean(activeItem) || saved.length > 0 || legacy.version > 0 || noteDraftNeedsAttention(legacy);
  const unresolved2 = items.some(noteDraftNeedsAttention) || noteDraftNeedsAttention(legacy);
  const status = find("#notes-status");
  status.textContent = !current.loaded && current.loading ? "正在读取…" : current.error ? "读取失败" : unresolved2 ? "有草稿待保存" : canEdit ? "自动保存" : current.loaded ? "公开只读" : "正在读取…";
  status.hidden = canEdit && !current.error && !unresolved2;
  paintRetainedDrafts(root, current, drafts);
}

// web/core/note-entries-state.mjs
var uuidPattern5 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var blocked = (item) => ["conflict", "unknown"].includes(item.phase);
var timestamp2 = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
var noteValue = (value) => isLocalDocument(value) ? documentValue(value) : value;
var persistedVersion = (item) => item.localBacked ? item.localVersion : item.version;
var savedText = (item) => item.localBacked ? item.durableText : item.serverText;
var savedPhase = (item) => item.localBacked ? item.localQueued ? "queued" : "cached" : item.version ? "saved" : "empty";
var localFailure = (error) => error.localNotSaved === true || /^OFFLINE_(?:STORAGE|CACHE|INVALID|SCOPE)/.test(error.code || "");
function checkedLocalDocument(value, category, date, id) {
  const { local, server } = documentState(value);
  if (!local || !uuidPattern5.test(local.id) || id && local.id !== id || local.category !== category || local.date !== date || typeof local.text !== "string" || dailyNotesBytes(local.text) > DAILY_NOTES_MAX_BYTES || !Number.isSafeInteger(local.version) || local.version < 1 || typeof local.deleted !== "boolean" || typeof local.can_edit !== "boolean") throw new Error("本机记录读取不完整，草稿已保留。");
  if (server) checkedEntry(server, category, date, local.id);
  return value;
}
function checkedEntry(value, category, date, id) {
  if (isLocalDocument(value)) return checkedLocalDocument(value, category, date, id);
  if (!value || !uuidPattern5.test(value.id) || id && value.id !== id || value.category !== category || value.date !== date || typeof value.text !== "string" || dailyNotesBytes(value.text) > DAILY_NOTES_MAX_BYTES || !Number.isSafeInteger(value.version) || value.version < 1 || typeof value.deleted !== "boolean" || typeof value.can_edit !== "boolean" || !timestamp2(value.created_at) || !timestamp2(value.updated_at) || typeof value.content_hash !== "string" || !value.content_hash) {
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
  uuid: uuid2 = () => crypto.randomUUID(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = 400
}) {
  if (!["life", "work"].includes(category)) throw new Error("请选择有效分类。");
  const pages = /* @__PURE__ */ new Map(), entries = /* @__PURE__ */ new Map();
  const context = {
    category,
    pages,
    entries,
    disposed: false,
    options: { load, loadEntry, loadOperation, put, remove, restore, onSaved, uuid: uuid2 }
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
    if (!context.disposed && !context.autosavePaused && item.canEdit && item.dirty && !item.pending && !item.loading && !item.composing && !blocked(item) && !["error", "oversize"].includes(item.phase) && (persistedVersion(item) > 0 || item.draft.trim())) {
      item.timer = setTimer(() => {
        item.timer = null;
        void context.save(item.id);
      }, delay);
    }
  }
  function merge(item, value) {
    if (isLocalDocument(value)) return context.mergeLocal(item, value);
    if (item.localBacked && !item.localConflict && value.version < item.localVersion) return;
    if (item.localQueued && !item.localConflict && (value.deleted !== item.deleted || !value.deleted && value.text !== item.durableText)) {
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
    const { local, server, operation, conflict } = documentState(value), draft = item.draft;
    if (server && server.version >= item.version) adopt(item, server, true);
    item.localVersion = local.version;
    item.durableText = local.deleted ? "" : local.text;
    item.localBacked = true;
    item.localQueued = Boolean(operation);
    item.localOperation = operation;
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
    const { local, operation, conflict, server } = documentState(value);
    if (local.version < persistedVersion(item) || item.pending) return;
    if (item.localQueued && !operation && !conflict) {
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
    const current = page(date), sequence = ++current.sequence;
    const epochs = new Map(current.ids.map((id) => [id, entry(id)?.writeEpoch]));
    current.loading = true;
    current.error = "";
    emit();
    try {
      const value = checkedCollection(await load(date, options2), category, date);
      if (context.disposed || sequence !== current.sequence) return;
      current.canEdit = value.can_edit;
      const found = /* @__PURE__ */ new Set();
      for (const raw of value.entries) {
        const visible2 = noteValue(raw);
        found.add(visible2.id);
        let item = entry(visible2.id);
        if (!item) {
          item = makeEntry(visible2.id, date, visible2.can_edit);
          entries.set(visible2.id, item);
          adopt(item, raw);
          if (!isLocalDocument(raw)) item.phase = "saved";
        } else if (!item.pending && item.writeEpoch === epochs.get(item.id)) merge(item, raw);
      }
      const retained = current.ids.filter((id) => {
        const item = entry(id);
        return found.has(id) || item.version === 0 || item.dirty || item.pending || item.deleted || item.localBacked || blocked(item) || item.writeEpoch !== epochs.get(id);
      });
      current.ids = [.../* @__PURE__ */ new Set([...retained, ...value.entries.map((raw) => noteValue(raw).id)])];
      current.loaded = true;
      await Promise.all(current.ids.filter((id) => !found.has(id) && persistedVersion(entry(id)) > 0 && (entry(id).dirty || entry(id).localBacked) && !entry(id).pending).map((id) => readOne(id, options2)));
    } catch (error) {
      if (!context.disposed && sequence === current.sequence) current.error = error.message;
    } finally {
      if (!context.disposed && sequence === current.sequence) {
        current.loading = false;
        emit();
        for (const id of current.ids) schedule(entry(id));
      }
    }
  }
  async function readOne(id, options2 = {}) {
    const item = entry(id);
    if (!item || context.disposed) return;
    const sequence = ++item.sequence, epoch = item.writeEpoch;
    item.loading = true;
    emit();
    try {
      const value = checkedEntry(await loadEntry(id, options2), category, item.date, id);
      if (!context.disposed && sequence === item.sequence && !item.pending && epoch === item.writeEpoch) merge(item, value);
    } catch (error) {
      if (!context.disposed && sequence === item.sequence) {
        item.error = error.message;
        if (!blocked(item)) item.phase = "error";
      }
    } finally {
      if (!context.disposed && sequence === item.sequence) {
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
  const { uuid: uuid2 } = context.options;
  function start(date) {
    const current = page(date);
    if (context.disposed || !current.loaded || !current.canEdit) return;
    const existing = entry(current.composerId);
    if (existing && persistedVersion(existing) === 0 && !existing.deleted) return existing;
    const id = uuid2();
    if (!uuidPattern5.test(id) || entries.has(id)) throw new Error("暂时无法新建记录，请重试。");
    const item = makeEntry(id, date, current.canEdit);
    entries.set(id, item);
    current.ids.push(id);
    current.composerId = id;
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
    if (!raw || raw.category !== category || !validDailyNotesDate(raw.date) || !uuidPattern5.test(raw.id) || typeof raw.draft !== "string" || raw.draft.length > 262144 || context.disposed) return;
    const current = page(raw.date);
    let item = entry(raw.id);
    if (item && (item.pending || item.composing || item.dirty)) return item;
    const pendingDurable = item && raw.pending?.saveId && raw.pending.saveId === item.localOperation?.save_id;
    if (item && persistedVersion(item) > 0 && raw.draft === savedText(item) && (!raw.pending || pendingDurable)) return item;
    if (!item) {
      item = makeEntry(raw.id, raw.date, current.canEdit);
      entries.set(item.id, item);
    }
    if (!current.ids.includes(item.id)) current.ids.push(item.id);
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
      const operation = raw.pending;
      const valid = ["put", "delete", "restore"].includes(operation.kind) && uuidPattern5.test(operation.saveId) && Number.isSafeInteger(operation.version) && operation.version >= 0 && (operation.kind !== "put" || typeof operation.text === "string" && dailyNotesBytes(operation.text) <= DAILY_NOTES_MAX_BYTES);
      item.pending = valid ? {
        kind: operation.kind,
        version: operation.version,
        saveId: operation.saveId,
        ...operation.kind === "put" ? { text: operation.text } : {},
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
  const { put, remove, restore, uuid: uuid2, onSaved } = context.options;
  const matches2 = (value, operation) => value.version === operation.version + 1 && (operation.kind === "delete" ? value.deleted : operation.kind === "restore" ? !value.deleted : !value.deleted && value.text === operation.text);
  function accepted(item, value, operation) {
    const preserve = operation.kind === "put" && item.draft !== operation.text;
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
  function acceptedLocal(item, value, operation) {
    const local = documentValue(value);
    if (!matches2(local, operation)) throw new Error("本机保存结果需要重新核对。");
    const preserve = operation.kind === "put" && item.draft !== operation.text;
    item.writeEpoch++;
    adopt(item, value, preserve);
    item.pending = null;
    emit();
    onSaved(item.date);
    schedule(item);
  }
  async function send(item, operation) {
    stopTimer(item);
    item.pending = operation;
    item.phase = "saving";
    item.error = "";
    item.writeEpoch++;
    emit();
    try {
      const body = { version: operation.version, save_id: operation.saveId };
      const options2 = operation.uncertain ? { offlineUnknown: true } : void 0;
      const raw = operation.kind === "delete" ? await remove(item.id, body, options2) : operation.kind === "restore" ? await restore(item.id, body, options2) : await put(item.id, { ...body, category: item.category, date: item.date, text: operation.text }, options2);
      if (context.disposed || item.pending !== operation) return;
      const value = checkedEntry(raw, category, item.date, item.id);
      if (isLocalDocument(value)) {
        acceptedLocal(item, value, operation);
        return;
      }
      if (!matches2(value, operation)) throw new Error("保存响应需要重新核对。");
      accepted(item, value, operation);
    } catch (error) {
      if (context.disposed || item.pending !== operation) return;
      if (localFailure(error)) {
        item.pending = operation.uncertain ? operation : null;
        item.phase = operation.uncertain ? "unknown" : "error";
        item.error = operation.uncertain ? "原保存仍待核对，本机接管未完成：" + error.message : error.message;
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
        operation.uncertain = true;
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
    return send(item, { kind: "put", version: persistedVersion(item), text: item.draft, saveId: uuid2() });
  }
  async function deleteEntry(id) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || item.pending || blocked(item) || item.deleted) return;
    if (!persistedVersion(item)) {
      stopTimer(item);
      const current = page(item.date);
      current.ids = current.ids.filter((value) => value !== id);
      entries.delete(id);
      if (current.composerId === id) current.composerId = "";
      emit();
      return;
    }
    return send(item, { kind: "delete", version: persistedVersion(item), saveId: uuid2() });
  }
  async function restoreEntry(id) {
    const item = entry(id);
    if (!item || context.disposed || !item.canEdit || !item.deleted || item.pending || blocked(item)) return;
    return send(item, { kind: "restore", version: persistedVersion(item), saveId: uuid2() });
  }
  return { matches: matches2, accepted, acceptedLocal, send, save, deleteEntry, restoreEntry };
}
function createEntryResolutionActions(context) {
  const { category, entry, emit, stopTimer, adopt, matches: matches2, accepted, acceptedLocal } = context;
  const { load, loadEntry, loadOperation } = context.options;
  async function reconcile(id) {
    const item = entry(id), operation = item?.pending;
    if (context.disposed || item?.phase !== "unknown" || !operation || operation.checking) return;
    operation.checking = true;
    operation.retryReady = false;
    emit();
    try {
      const receipt = await loadOperation(operation.saveId);
      if (context.disposed || item.pending !== operation) return;
      if (!receipt || typeof receipt.found !== "boolean" || receipt.found && (receipt.id !== id || receipt.version !== operation.version + 1 || typeof receipt.content_hash !== "string")) {
        throw new Error("保存凭据不完整。");
      }
      let value;
      try {
        value = checkedEntry(await loadEntry(id), category, item.date, id);
      } catch (error) {
        if (error.status !== 404 || receipt.found || operation.version !== 0 || operation.kind !== "put") throw error;
        const collection = checkedCollection(await load(item.date), category, item.date);
        value = collection.entries.find((raw) => noteValue(raw).id === id);
        if (isLocalDocument(value)) throw new Error("原保存结果仍由同步队列核实，本机内容已保留。");
        if (!value) {
          if (context.disposed || item.pending !== operation) return;
          item.canEdit = collection.can_edit;
          operation.retryReady = collection.can_edit;
          item.error = operation.retryReady ? "服务器尚未收到此保存，可重试；后续草稿已保留。" : "保存尚未确认，草稿已保留。";
          return;
        }
      }
      if (context.disposed || item.pending !== operation) return;
      if (isLocalDocument(value)) {
        if (documentState(value).operation?.save_id === operation.saveId) return acceptedLocal(item, value, operation);
        throw new Error("保存结果仍由同步队列核实，本机内容已保留。");
      }
      item.canEdit = value.can_edit;
      if (receipt.found && receipt.content_hash === value.content_hash && receipt.version === value.version && matches2(value, operation)) {
        accepted(item, value, operation);
      } else if (value.version > operation.version) {
        item.remote = value;
        item.pending = null;
        item.phase = "conflict";
        item.error = "服务器已有更新，草稿已保留，请核对后选择。";
      } else {
        item.remote = value;
        operation.retryReady = !receipt.found && value.can_edit && value.version === operation.version;
        item.error = operation.retryReady ? "服务器尚无新版本，可重试原保存；后续草稿已保留。" : "保存结果尚未确认，草稿已保留，请再次核对。";
      }
    } catch (error) {
      if (!context.disposed && item.pending === operation) {
        item.error = "核对失败，草稿已保留：" + error.message;
        if ([401, 403].includes(error.status)) item.canEdit = false;
      }
    } finally {
      operation.checking = false;
      emit();
    }
  }
  async function retryPending(id) {
    const item = entry(id), operation = item?.pending;
    if (context.disposed || item?.phase !== "unknown" || !item.canEdit || !operation?.retryReady || operation.checking) return;
    operation.retryReady = false;
    return context.send(item, operation);
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

// web/daily-notes-controller.mjs
var notesStore, entryStore, notesIdentity = "", notesEventsRegistered = false, notesConfirmDate = "", notesConfirmEntry = "", notesActiveCategory = "", notesRefreshPaused = false;
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
  const active4 = () => expected === notesIdentityNow();
  if (!offline || !active4()) return;
  const seen = hydratedDrafts.get(entries) || /* @__PURE__ */ new Set();
  hydratedDrafts.set(entries, seen);
  const entryDrafts = await offline.retainedDrafts("note_entry");
  if (!active4()) return;
  for (const raw of entryDrafts) {
    if (raw.category !== category || seen.has(raw.id)) continue;
    entries.restoreDraft(raw);
    seen.add(raw.id);
  }
  const legacyDrafts = await offline.retainedDrafts("legacy");
  if (!active4()) return;
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
    const body = document.createElement("div");
    body.className = "notes-retained-texts";
    box.append(body);
    box.addEventListener("toggle", async () => {
      if (!box.open || expected !== notesIdentityNow()) return;
      const current = await archivedDrafts();
      if (expected !== notesIdentityNow()) return;
      body.replaceChildren(...current.map((row) => {
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
function ensureDailyNotesStore() {
  const next = notesIdentityNow(), category = dailyNotesRouteCategory();
  if (notesIdentity !== next) {
    for (const store of [...notesStores.values(), ...entryStores.values()]) store.dispose();
    notesStores.clear();
    entryStores.clear();
    editorViews.clear();
    notesIdentity = next;
    notesConfirmDate = "";
    notesConfirmEntry = "";
    notesRefreshPaused = false;
  }
  if (notesActiveCategory !== category) {
    notesActiveCategory = category;
    notesConfirmDate = "";
    notesConfirmEntry = "";
  }
  if (!notesStores.has(category)) {
    const expected = next;
    const active4 = () => {
      if (notesIdentityNow() !== expected) {
        legacy.dispose();
        entries.dispose();
        throw new DOMException("请求已取消", "AbortError");
      }
    };
    const request = async (path, options2) => {
      active4();
      const value = await api(path, options2);
      active4();
      return value;
    };
    const suffix = (separator) => category === "work" ? separator + "category=work" : "";
    const changed2 = () => {
      if (expected !== notesIdentityNow()) return;
      void captureNotesDrafts(legacy, entries, category)?.catch(() => {
      });
      if (category === dailyNotesRouteCategory()) paintDailyNotesPage();
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
      onChange: changed2,
      onSaved: changed2
    });
    const entries = createNoteEntriesStore({
      category,
      load: (date, options2) => options2?.localOnly ? getOfflineRuntime().localRead("/note-entries?category=" + category + "&date=" + date) : request("/note-entries?category=" + category + "&date=" + encodeURIComponent(date)),
      loadEntry: (id, options2) => options2?.localOnly ? getOfflineRuntime().localRead("/note-entries/" + id) : request("/note-entries/" + encodeURIComponent(id)),
      loadOperation: (id) => request("/note-entries/operations/" + encodeURIComponent(id)),
      put: (id, body, options2) => request("/note-entries/" + encodeURIComponent(id), { ...options2, method: "PUT", body }),
      remove: (id, body, options2) => request("/note-entries/" + encodeURIComponent(id), { ...options2, method: "DELETE", body }),
      restore: (id, body, options2) => request("/note-entries/" + encodeURIComponent(id) + "/restore", { ...options2, method: "POST", body }),
      onChange: changed2,
      onSaved: changed2
    });
    entryIdentities.set(entries, expected);
    notesStores.set(category, legacy);
    entryStores.set(category, entries);
  }
  notesStore = notesStores.get(category);
  entryStore = entryStores.get(category);
  return notesStore;
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
  const date = dailyNotesRouteDate(), category = dailyNotesRouteCategory(), legacy = notesStore.page(date), current = entryStore.page(date);
  const host = root.querySelector("#notes-composer"), view = editorViews.page(category, date), active4 = view.active;
  const field2 = active4 === "legacy" ? root.querySelector("#notes-editor") : host.querySelector('[data-note-entry-editor="' + active4 + '"]');
  const selected = editorViews.sync(
    category,
    date,
    current.ids.map((id) => entryStore.entry(id)).filter(Boolean),
    legacy,
    { focused: host.contains(document.activeElement), composing: field2?.dataset.composing === "true" }
  );
  paintNoteEntries(root, entryStore, current, legacy, { drafts: retainedDrafts(), confirmId: notesConfirmEntry, active: selected.active });
  root.querySelector("#notes-delete-confirm").hidden = true;
}
async function selectDailyNotesDate(value) {
  if (!validDailyNotesDate(value) || value > dailyNotesToday()) return;
  ensureDailyNotesStore();
  notesConfirmDate = "";
  notesConfirmEntry = "";
  setDailyNotesRouteDate(value);
  updateRoute(true);
  const legacy = notesStore, entries = entryStore, category = dailyNotesRouteCategory(), expected = notesIdentityNow();
  paintDailyNotesPage();
  await Promise.all([legacy.read(value), entries.read(value)]);
  if (expected !== notesIdentityNow()) return;
  await hydrateNotesDrafts(legacy, entries, category);
  paintDailyNotesPage();
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
  const category = root.dataset.category, date = root.dataset.date, { active: active4, revision } = editorViews.page(category, date);
  setTimeout(() => {
    editorViews.requestCollapse(category, date, active4, revision);
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
  });
  document.addEventListener("focusout", requestEditorCollapse);
}
async function handleEntryAction(target, entries) {
  const id = target.closest("[data-note-entry]")?.dataset.noteEntry, item = entries.entry(id);
  if (!item) return;
  const action = target.dataset.noteEntryAction;
  if (action === "edit") openEditor(id);
  else if (action === "save") await entries.save(id);
  else if (action === "restore") await entries.restoreEntry(id);
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
  const target = event.target.closest("[data-notes-action],[data-notes-date],[data-notes-category],[data-note-entry-action]");
  if (!target || !root?.contains(target)) return;
  event.preventDefault();
  if (target.dataset.notesCategory) {
    setDailyNotesRouteCategory(target.dataset.notesCategory);
    updateRoute(true);
    renderShell();
    return;
  }
  if (target.dataset.notesDate) {
    if (target.dataset.notesDraftCategory && target.dataset.notesDraftCategory !== dailyNotesRouteCategory()) {
      setDailyNotesRouteCategory(target.dataset.notesDraftCategory);
      setDailyNotesRouteDate(target.dataset.notesDate);
      updateRoute(true);
      renderShell();
    } else await selectDailyNotesDate(target.dataset.notesDate);
    return;
  }
  const store = ensureDailyNotesStore(), entries = entryStore, date = dailyNotesRouteDate();
  if (target.dataset.noteEntryAction) {
    await handleEntryAction(target, entries);
    return;
  }
  const action = target.dataset.notesAction;
  if (action === "new") {
    const item = entries.start(date);
    if (item) openEditor(item.id);
  } else if (action === "edit-legacy") openEditor("legacy");
  else if (action === "collapse") {
    const { active: active4, revision } = editorViews.page(dailyNotesRouteCategory(), date);
    editorViews.requestCollapse(dailyNotesRouteCategory(), date, active4, revision, { explicit: true });
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
      if (notesVisible() && entryStore && hydrationReady.has(entryStore)) void entryStore.read(dailyNotesRouteDate(), { localOnly: true });
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
  const store = ensureDailyNotesStore(), entries = entryStore, date = dailyNotesRouteDate(), category = dailyNotesRouteCategory(), expected = notesIdentityNow();
  await Promise.all([store.read(date), entries.read(date)]);
  if (expected !== notesIdentityNow()) return;
  await hydrateNotesDrafts(store, entries, category);
  paintDailyNotesPage();
}

// web/pages/memos.mjs
var button = (action, label3, extra = "") => '<button type="button" class="btn" data-memo-action="' + action + '" ' + extra + ">" + label3 + "</button>";
function renderMemos() {
  return '<section id="memos" data-pane="groups" aria-label="长期备忘录"><div class="memo-toolbar"><div class="memo-mobile-back">' + button("back-notes", "‹ 返回笔记") + '</div><span id="memo-status" role="status" aria-live="polite">正在读取…</span><div class="memo-toolbar-actions">' + button("exit-trash", "‹ 返回工作台设置", "hidden") + button("login", "所有者登录", "hidden") + '</div></div><p id="memo-error" class="memo-message" role="alert" hidden></p><div id="memo-operation" class="memo-message" hidden><p id="memo-operation-text" role="status"></p>' + button("operation-check", "核对操作结果") + button("operation-retry", "重试同一操作", "hidden") + '</div><div id="memo-drafts" class="memo-drafts" hidden></div><section id="memo-recovery" class="memo-recovery" aria-label="找回本机草稿" hidden><div class="memo-panel-head"><h2>找回本机草稿</h2>' + button("close-recovery", "关闭") + '</div><p id="memo-recovery-status" role="status"></p><div id="memo-recovery-list"></div><div id="memo-recovery-detail" hidden><p id="memo-recovery-selected"></p><label for="memo-recovery-copy">草稿文字（可选中复制）</label><textarea id="memo-recovery-copy" readonly></textarea>' + button("restore-draft", "恢复此草稿并核对") + '</div></section><section id="memo-dialog" class="memo-dialog" aria-labelledby="memo-dialog-heading" hidden><h3 id="memo-dialog-heading"></h3><p id="memo-dialog-description"></p><label id="memo-dialog-label" for="memo-dialog-title">名称</label><input id="memo-dialog-title" class="input" maxlength="120" autocomplete="off"><div class="memo-dialog-actions">' + button("cancel", "取消") + button("confirm", "确认") + '</div></section><div class="memo-layout"><aside class="memo-library" aria-label="备忘录目录"><div class="memo-panel-head"><h2 id="memo-groups-heading">目录</h2>' + button("new-note", "＋", 'hidden aria-label="新建笔记"') + '</div><div id="memo-group-list" class="memo-list"></div></aside><div id="memo-resizer" class="memo-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整笔记列表宽度" aria-controls="memo-group-list memo-document" aria-valuemin="160" aria-valuemax="480" aria-valuenow="280" title="拖动调整列表与正文比例；方向键微调，Home / End 到边界"></div><article class="memo-editor" aria-label="笔记内容"><p id="memo-empty" class="memo-empty">选择一篇笔记，长期记录常用信息。</p><div id="memo-document" hidden><div class="memo-document-heading"><div class="memo-heading-title"><label for="memo-title" class="sr-only">笔记标题</label><input id="memo-title" class="memo-title" maxlength="120" placeholder="笔记标题" autocomplete="off"><h2 id="memo-read-title" class="memo-read-title" hidden></h2></div>' + button("fullscreen", '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" stroke-width="1.6"/></svg>', 'aria-label="放大正文" title="放大正文" aria-expanded="false"') + '</div><label for="memo-body" class="sr-only">笔记正文</label><textarea id="memo-body" class="memo-body" placeholder="写下需要长期记住的信息…"></textarea><div id="memo-read-body" class="memo-read-body" tabindex="0" hidden></div><div class="memo-document-footer"><span id="memo-detail"></span><div id="memo-note-actions" hidden><details class="memo-document-menu"><summary aria-label="笔记操作">⋯</summary><div class="memo-context-actions">' + button("save", "立即保存") + button("delete-note", "删除笔记") + button("restore-note", "恢复笔记", "hidden") + '</div></details></div></div><p id="memo-note-error" class="memo-message" role="alert" hidden></p><div id="memo-resolution" class="memo-resolution" hidden>' + button("check", "核对服务器结果") + button("retry", "重试同一保存", "hidden") + '<div id="memo-conflict" hidden><h3>服务器上的内容</h3><pre id="memo-remote"></pre>' + button("use-server", "采用服务器内容") + button("use-draft", "用此草稿保存到新版本") + '</div></div></div></article></div><dialog id="memo-fullscreen" aria-label="备忘录正文全屏"></dialog></section>';
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
var active3 = (rows, trash) => rows.filter((row) => Boolean(row.deleted_at) === trash);
function listButton(kind, row, current, subtitle = "") {
  return '<button type="button" class="memo-list-item' + (row.id === current ? " is-selected" : "") + '" data-memo-' + kind + '="' + e(row.id) + '" aria-pressed="' + (row.id === current) + '"><span>' + e(row.title) + "</span>" + (subtitle ? "<small>" + e(subtitle) + "</small>" : "") + "</button>";
}
function flatNoteRow(note, store) {
  const s = store.state, group = s.groups.find((row) => row.id === note.group_id);
  const deleted2 = Boolean(note.deleted_at || group?.deleted_at), extra = ' data-memo-target="' + e(note.id) + '"';
  const control = !s.canEdit ? "" : s.trash ? button("restore-note", "恢复", extra) : button("delete-note", "×", extra + ' aria-label="删除' + e(note.title) + '" title="移至回收站"');
  const removed2 = note.deleted_at || group?.deleted_at;
  const days = removed2 ? Math.max(0, 30 - Math.floor((Date.now() - Date.parse(removed2)) / 864e5)) : 0;
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
  find("#memo-detail").textContent = deleted2 ? "已删除 · 可恢复" : s.canEdit ? new TextEncoder().encode(item.body || "").length + " / 65536 字节 · 自动保存" : "公开只读";
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
  const actual = phases[item?.phase] || "已保存", routine = ["dirty", "saving", "saved"].includes(item?.phase) || !item;
  find("#memo-status").textContent = s.loading ? "正在读取…" : !s.canEdit ? "公开只读" : routine ? "自动保存" : actual;
  find("#memo-status").hidden = s.trash && !s.loading;
  find("#memo-status").setAttribute("aria-label", actual);
  find("#memo-status").dataset.phase = item?.phase || "saved";
  find("#memo-error").hidden = !s.error && !s.storageError;
  find("#memo-error").textContent = [s.error, s.storageError].filter(Boolean).join(" ");
  find('[data-memo-action="login"]').hidden = s.canEdit || s.loading;
  if (!s.canEdit) find("#memo-recovery").hidden = true;
  find('[data-memo-action="exit-trash"]').hidden = !s.trash || root.closest(".workbench-settings") !== null;
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
  }, uuid: uuid2 = () => globalThis.crypto.randomUUID(), delay = 700 } = options2;
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
  const context = { state: state2, drafts: /* @__PURE__ */ new Map(), request, ownerId, storage: storage2, uuid: uuid2, delay, disposed: false, hydrated: false, loadSequence: 0 };
  context.draftScope = options2.draftScope || uuid2();
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
  const timestamp3 = Date.parse(row.savedAt), date = Number.isFinite(timestamp3) ? new Date(timestamp3).toLocaleString() : "保存时间未知";
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
var settingsTrash = () => state.page === "settings" && state.settingsTab === "workspace";
var visible = () => (state.page === "memos" || settingsTrash()) && memoIdentity === currentIdentity();
function ensureStore() {
  const identity3 = currentIdentity();
  if (memoStore && memoIdentity === identity3) return memoStore;
  memoDeleteWait?.(true);
  memoDeleteWait = null;
  memoDeleting = "";
  memoEditorFocus = null;
  memoStore?.dispose();
  memoIdentity = identity3;
  memoDialog = null;
  resetMemoRecovery();
  const active4 = () => {
    if (currentIdentity() !== identity3) throw new DOMException("登录状态已经改变", "AbortError");
  };
  const request = async (path, options2) => {
    active4();
    const value = await api(path, options2);
    active4();
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
      if (identity3 === currentIdentity()) {
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
  setupMemoSplit(root);
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
  registerMemoSplitEvents();
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
    memoSplitRatio = Number.isFinite(saved) && saved >= 0.1 && saved <= 0.8 ? saved : 0.3;
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
  const active4 = mediaPages.has(state.page), name = mobile ? "mobile-nav-item" : "nav-item";
  return `<a href="?page=dashboard" data-nav="dashboard" class="${name} media-link${active4 ? " active" : ""}"
aria-label="好多鱼图文" ${active4 ? 'aria-current="page"' : ""}>${icon("articles", 18)}<span class="nav-label">${mobile ? "图文" : "好多鱼图文"}</span></a>`;
}
function renderMediaTabs() {
  if (!mediaPages.has(state.page)) return "";
  return '<nav class="media-page-tabs" aria-label="图文页面">' + [["dashboard", "数据总览"], ["articles", "文章详情"]].map(([page, label3]) => `<a href="?page=${page}" data-nav="${page}" class="btn media-page-tab${state.page === page ? " active" : ""}"
${state.page === page ? 'aria-current="page"' : ""}>${label3}</a>`).join("") + "</nav>";
}
function notesNavigation(mobile = false) {
  const active4 = state.page === "notes", name = mobile ? "mobile-notes-nav" : "notes-nav";
  return `<details class="${name}${active4 ? " active" : ""}" ${!mobile && active4 ? "open" : ""}>
<summary ${mobile ? 'data-action="notes-menu"' : ""} title="碎碎念" aria-label="碎碎念" aria-expanded="${!mobile && active4}">
${icon("edit", 18)}<span class="nav-label">碎碎念</span></summary><div class="notes-subnav">
${["life", "work"].map((category) => navigationLink({ id: "notes", category, icon: "edit", label: category === "work" ? "工作碎碎念" : "生活碎碎念" })).join("")}
</div></details>`;
}
function sidebarNavigation() {
  return mediaNavigation() + nav.filter((item) => !mediaPages.has(item.id) && item.id !== "settings").map((item) => item.id === "notes" ? notesNavigation() : navigationLink(item)).join("");
}
function settingsNavigation() {
  return navigationLink(nav.find((item) => item.id === "settings"));
}
function mobileNavigation() {
  const items = [["todos", "待办"], ["notes", "碎碎念"], ["memos", "备忘录"], ["reminders", "提醒"]];
  return `<nav class="mobile-nav workbench-navigation" aria-label="切换模块">${items.map(([id, label3]) => navigationLink({ ...nav.find((item) => item.id === id), label: label3, ...id === "notes" ? { category: dailyNotesRouteCategory() } : {} }, true)).join("")}${mediaNavigation(true)}</nav>`;
}
function mobileSettingsMenu() {
  return `<nav id="mobile-settings-menu" class="mobile-settings-menu" aria-label="设置菜单" hidden>
${settingsNavigation()}${state.me?.publicBusiness ? "" : `<button class="btn text" data-action="logout">${icon("logout", 18)}退出登录</button>`}</nav>`;
}
function syncWorkbenchNavigation() {
  const active4 = mediaPages.has(state.page);
  const notes = document.querySelector('.mobile-nav [data-nav="notes"]');
  if (notes) {
    notes.dataset.notesCategory = dailyNotesRouteCategory();
    notes.setAttribute("href", "?page=notes&notes_category=" + dailyNotesRouteCategory());
  }
  for (const link of document.querySelectorAll(".media-link")) {
    link.classList.toggle("active", active4);
    if (active4) link.setAttribute("aria-current", "page");
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
    mobile.classList.toggle("active", active4);
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
  const current = Number(handle.getAttribute("aria-valuenow")), step = event.shiftKey ? 32 : 16;
  const next = event.key === "Home" ? Number(handle.getAttribute("aria-valuemin")) : event.key === "End" ? Number(handle.getAttribute("aria-valuemax")) : current + (event.key === "ArrowRight" ? step : -step);
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
  root.querySelector("#reminder-list").innerHTML = data?.loading ? '<p role="status">正在读取…</p>' : rows.length ? rows.map((row) => '<article class="card reminder-card"><time datetime="' + e(row.updated_at) + '">' + e(new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(row.updated_at))) + "</time><p>" + e(row.summary) + "</p></article>").join("") : '<div class="card reminder-empty">暂无工作提醒</div>';
}

// web/work-reminders-controller.mjs
var reminderSequence = 0, reminderEvents = false;
async function loadWorkReminders() {
  registerReminderEvents();
  const sequence = ++reminderSequence, session = runtime.sessionEpoch, date = state.reminderDate || bjtDate();
  const current = () => sequence === reminderSequence && session === runtime.sessionEpoch && state.page === "reminders";
  paintWorkReminders({ date, items: [], loading: true });
  try {
    const data = await api("/work-reminders?date=" + encodeURIComponent(date));
    if (current()) paintWorkReminders(data);
  } catch (error) {
    if (current()) paintWorkReminders({ date, items: [] }, error.message || "提醒读取失败，请稍后重试");
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
async function loadArticleOverview(version, context) {
  const query = new URLSearchParams({ period: state.overviewPeriod, top_n: state.topN, top_platform: state.topPlatform });
  if (state.account) query.set("account_id", state.account);
  const data = await api(`/overview?${query}`, { context });
  if (version !== runtime.renderVersion) return "";
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
      case "reminders":
        await loadWorkReminders();
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
        if (state.settingsTab === "workspace") {
          await loadMemos();
          break;
        } else if (state.settingsTab === "accounts") {
          data = await api("/account-profiles", { context });
          if (version !== runtime.renderVersion) return;
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
function createArticleVerificationStore({ article, load, put, uuid: uuid2 = () => crypto.randomUUID(), onChange = () => {
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
        const matches2 = same(remote.verify_items, current.verify_items);
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
    if (busy || pending || !Number.isSafeInteger(index) || typeof done !== "boolean" || !Array.isArray(current.verify_items) || !current.verify_items[index] || typeof current.verify_items[index] !== "object") return;
    if (current.verify_items[index].done === done) return;
    const items = copy(current.verify_items);
    items[index].done = done;
    pending = { index, done, before: copy(current.verify_items), body: { version: current.version, verify_items: items }, key: uuid2() };
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
  const active4 = activeBinding();
  if (!active4 || target.dataset.articleId !== active4.articleId) return;
  const index = Number(target.dataset.articleVerifyIndex);
  const value = target.type === "checkbox" ? target.checked : target.value === "true" ? true : target.value === "false" ? false : null;
  if (typeof value === "boolean") {
    try {
      await active4.store.save(index, value);
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
  const canonical2 = `${parts[1]}T${parts[2]}:${parts[3] || "00"}.${(parts[4] || "").padEnd(3, "0")}`;
  const stamp2 = /* @__PURE__ */ new Date(`${canonical2}+08:00`);
  if (!Number.isFinite(stamp2.getTime()) || new Date(stamp2.getTime() + 8 * 36e5).toISOString().slice(0, 23) !== canonical2) {
    throw new Error(`${label3}请填写真实日期和时间。`);
  }
  if (original && raw === localDateTime(original)) return new Date(original).toISOString();
  return stamp2.toISOString();
}
function mergedObject(original, fields2) {
  if (original != null && !objectValue(original)) throw new Error("原记录的 JSON 字段无法安全编辑，请重新打开核对。");
  const result = original == null ? {} : structuredClone(original);
  for (const [key, value] of Object.entries(fields2)) {
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
async function saveArticleForm({ form, data }, { request = api, uuid: uuid2 = () => crypto.randomUUID() } = {}) {
  const cache = articleFormRecord(form), isCurrent = () => articleFormCurrent(form, cache);
  if (cache.saveAttempt) throw new Error("此表单已有保存请求，请关闭后核对文章列表或最新详情，不要重复新建。");
  const body = buildArticleFormPayload(data, cache.record), id = form.dataset.id || "";
  cache.saveAttempt = { id, body: structuredClone(body), key: uuid2(), phase: "saving" };
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
  toast(form.dataset.id ? "文章已更新。" : "文章已保存。");
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
  const id = form.dataset.id, epoch = runtime.sessionEpoch, ticket = runtime.modalRequestVersion;
  const profile = String(data.profile_url || "").trim();
  const body = id ? { name: data.name.trim(), active: values.has("active") } : { platform: data.platform, name: data.name.trim() };
  if (profile || id && (state.accountProfiles || []).some((row) => row.account_id === id)) body.profile_url = profile;
  const signature = JSON.stringify(body);
  if (form.accountSaveSignature !== signature) {
    form.accountSaveSignature = signature;
    form.accountSaveKey = crypto.randomUUID();
  }
  const saved = await api(id ? `/accounts/${encodeURIComponent(id)}` : "/accounts", {
    method: id ? "PUT" : "POST",
    body,
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
  toast(saved.profile_reused ? `该主页已关联「${saved.name}」，已使用现有账号。` : "运营账号已保存。");
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
  if (trapMobileMenuFocus(event)) return;
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
  const fail4 = (error) => Promise.allSettled(failures.map((callback) => Promise.resolve().then(() => callback(error))));
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
    await fail4(error);
    throw error;
  }
  return fail4;
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
  const version = document2.querySelector('meta[name="haoduoyu-shell-version"]')?.content;
  const cleanups = [];
  let registration, button2, optedIn = false, reloaded = false, destroyed = false;
  function listen(target, type, callback) {
    target.addEventListener(type, callback);
    cleanups.push(() => target.removeEventListener(type, callback));
  }
  function announce() {
    if (VERSION.test(version)) serviceWorker.controller?.postMessage({ type: "HAODUOYU_SHELL_CLIENT_VERSION", version });
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
  if (state2.phase === "syncing" || state2.pending) return "同步中";
  return "已同步";
}
function textNode(document2, tag, text, className) {
  const node = document2.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function readable(value) {
  if (!value) return "（线上已不存在）";
  const text = value.text ?? value.body ?? value.title;
  if (typeof value.completed === "boolean") return `${text || ""}
日期：${value.date || ""}
完成：${value.completed ? "是" : "否"}
版本：${value.version || ""}`;
  return typeof text === "string" ? text : JSON.stringify(value, null, 2);
}
function queueRows(document2, queue, runtime2, refresh) {
  const root = document2.createDocumentFragment();
  if (!queue.operations.length && !queue.conflicts.length) root.append(textNode(document2, "p", "本机内容已同步。"));
  const labels = {
    queued: "等待同步",
    sending: "同步中",
    unknown: "结果待核对",
    paused: "需联网核实身份",
    blocked: "需处理",
    conflict: "有冲突"
  };
  for (const operation of queue.operations) {
    const item = textNode(
      document2,
      "p",
      `${operation.needs_upgrade ? "需新版" : labels[operation.status] || "等待同步"} · ${readable(operation.local)}`,
      "offline-queue-row"
    );
    if (operation.error) item.append(textNode(document2, "span", " · " + operation.error));
    root.append(item);
  }
  for (const conflict of queue.conflicts) {
    const item = document2.createElement("article");
    item.className = "offline-conflict";
    item.append(
      textNode(document2, "h3", "两份内容已保留"),
      textNode(document2, "p", "本机内容"),
      textNode(document2, "pre", readable(conflict.local)),
      textNode(document2, "p", "线上内容"),
      textNode(document2, "pre", readable(conflict.remote))
    );
    if (conflict.needs_followup) item.append(textNode(document2, "p", "选择已记下，两份内容仍保留，等待后续处理。", "offline-followup"));
    if (conflict.needs_upgrade) {
      item.append(textNode(document2, "p", "此本机操作需新版页面处理，原内容已保留。"));
      root.append(item);
      continue;
    }
    const actions2 = document2.createElement("div");
    actions2.className = "offline-conflict-actions";
    for (const [choice2, label3] of [["use-local", "用本地"], ["use-server", "用线上"], ["keep-both", "两份都留"]]) {
      const button2 = textNode(document2, "button", label3, "btn text");
      button2.type = "button";
      button2.addEventListener("click", async () => {
        button2.disabled = true;
        try {
          await runtime2.resolve(conflict.key, choice2);
          await refresh();
        } catch (error) {
          item.append(textNode(document2, "p", error.message));
        } finally {
          button2.disabled = false;
        }
      });
      actions2.append(button2);
    }
    item.append(actions2);
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
  const content = document2.querySelector("#page-content");
  if (content) {
    const unavailable = page === "settings" && !state2.online;
    content.inert = unavailable;
    if (unavailable || content.dataset.offlineHidden === "true") content.hidden = unavailable;
    content.dataset.offlineHidden = String(unavailable);
  }
}
function mountRuntimeUI(runtime2, { document: document2, window: window2 }) {
  let state2 = { ...runtime2.state }, expanded = false, rendering = 0;
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
    const sequence = ++rendering, queue = await runtime2.queue();
    if (sequence !== rendering || !expanded) return;
    panel.replaceChildren(textNode(document2, "h2", "同步队列"), queueRows(document2, queue, runtime2, refreshQueue));
  }
  function mount() {
    if (!root.isConnected && document2.body) document2.body.append(root);
    root.hidden = !state2.identity;
    const label3 = offlineStatusLabel(state2);
    if (button2.textContent !== label3) button2.textContent = label3;
    root.dataset.phase = state2.conflicts ? "conflict" : state2.phase;
    pageAnnotation(document2, state2);
  }
  button2.addEventListener("click", () => {
    expanded = !expanded;
    panel.hidden = !expanded;
    button2.setAttribute("aria-expanded", String(expanded));
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
