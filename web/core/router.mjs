import { articleColumns, defaultColumns, defaultFilters, legacyPages, modeLabels, nav, settingsTabs,
  slotLabels, writerLabels } from "./constants.mjs";
import { state } from "./state.mjs";
import { storage } from "./storage.mjs";
import { dailyNotesRouteDate, setDailyNotesRouteDate, dailyNotesRouteCategory, setDailyNotesRouteCategory } from "./daily-notes-state.mjs";
import { validTodoDate } from "./todos-state.mjs";
function normalizeArticlePipelineFilters(filters) {
  const allowed = { status: ["published"], slot: ["", ...Object.keys(slotLabels)],
    writer: ["", ...Object.keys(writerLabels)],
    has_warnings: ["", "true", "false"], has_pending_verify: ["", "true", "false"] };
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
    if (state.openAiRun) u.searchParams.set("openai_run", state.openAiRun); else u.searchParams.delete("openai_run");
  } else if (state.page === "ai-reports") {
    u.searchParams.set("ai_tab", state.aiDailyTab || "reports");
    if (state.openAiRun) u.searchParams.set("openai_run", state.openAiRun);
    else u.searchParams.delete("openai_run");
  } else { u.searchParams.delete("ai_tab"); u.searchParams.delete("openai_run"); }
  if (state.page !== "ai-diagnosis") u.searchParams.delete("diagnosis_tab");
  if (state.page === "todos" && state.todoPanel) u.searchParams.set("todo_panel", state.todoPanel);
  else u.searchParams.delete("todo_panel");
  if (state.page === "settings") u.searchParams.set("tab", state.settingsTab);
  else u.searchParams.delete("tab");
  if (["review", "ai-reports"].includes(state.page)) u.searchParams.set("account", state.account || "V字");
  else u.searchParams.delete("account");
  for (const key of [...Object.keys(defaultFilters()), "list_page", "page_size", "top_n", "top_platform", "columns"])
    u.searchParams.delete(key);
  if (state.page !== "review") {
    for (const key of ["review_view", "review_date", "review_period", "review_article", "review_version", "review_compare", "review_section"])
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
  const legacyWeekly = state.page === "review" && (params.get("review_section") === "weekly" || params.get("review_view") === "weekly");
  if (legacyWeekly) state.page = "ai-reports";
  if (state.page === "notes") {
    setDailyNotesRouteDate(params.get("date")); setDailyNotesRouteCategory(params.get("notes_category"));
  }
  state.diagnosisTab = params.get("diagnosis_tab") === "reports" ? "reports" : "help";
  state.aiDailyTab = legacyWeekly ? "reports" : ["reminders", "reports"].includes(params.get("ai_tab")) ? params.get("ai_tab") : "reports";
  state.aiDailyDate = ["ai-reports", "ai-diagnosis"].includes(state.page) && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.openAiRun = state.page === "ai-diagnosis" && /^[a-zA-Z0-9-]{1,80}$/.test(params.get("openai_run") || "") ? params.get("openai_run") : "";
  state.memoView = state.page === "memos" && params.get("memo_view") === "trash" ? "trash" : "";
  if (state.memoView === "trash") { state.page = "settings"; state.memoView = ""; }
  state.reminderDate = state.page === "reminders" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoDate = state.page === "todos" && validTodoDate(params.get("date")) ? params.get("date") : "";
  state.todoPanel = state.page === "todos" && ["history", "templates", "future"].includes(params.get("todo_panel")) ? params.get("todo_panel") : "";
  state.settingsTab = (Object.hasOwn(legacyPages, raw) ? legacyPages[raw] : null) || (Object.hasOwn(settingsTabs, params.get("tab")) ? params.
  get("tab") : "workspace");
  if (raw === "memos" && params.get("memo_view") === "trash") state.settingsTab = "workspace";
  state.reviewTab = ["pending", "observations", "daily"].includes(params.get("tab")) ? params.get("tab") : "observations";
  state.overviewPeriod = ["yesterday", "7d", "30d"].includes(params.get("period")) ? params.get("period") : "yesterday";
  state.articleOverviewMode = "published";
  state.account = params.get("account")?.trim() || "V字";
  state.filters = defaultFilters();
  for (const key of Object.keys(state.filters)) if (params.has(key)) state.filters[key] = params.get(key);
  const allowed = { sort: ["published_at", "reads", "likes", "comments", "approvals", "latest_as_of", "duration"], order: ["asc", "desc"], platform: [
  "", "toutiao", "zhihu", "wechat", "other"], topic: ["", "insurance", "entertainment", "unknown"], data_status: ["", "no_snapshot",
     "missing_reads", "missing_likes", "missing_comments", "incomplete", "zero_reads", "date_unverified"], mode: ["", ...Object.keys(modeLabels)], group: [
  "", "account", "mode"] };
  for (const [key, values] of Object.entries(allowed)) if (!values.includes(state.filters[key])) state.filters[key] = defaultFilters()[key];
  normalizeArticlePipelineFilters(state.filters);
  const int = (key, def, max) => /^\d+$/.test(params.get(key) || "") && Number(params.get(key)) > 0 && Number(params.get(key)) <= max ? Number(
  params.get(key)) : def;
  state.listPage = int("list_page", 1, 1e6);
  state.pageSize = int("page_size", 20, 200);
  state.topN = int("top_n", 5, 100);
  state.topPlatform = ["toutiao", "zhihu", "wechat", "other"].includes(params.get("top_platform")) ? params.get("top_platform") : "";
  state.columns = new Set(params.has("columns") ? params.get("columns").split(",").filter((c) => Object.hasOwn(articleColumns, c)) : defaultColumns);
}
export {
  isMobileLayout,
  mobilePage,
  normalizeArticlePipelineFilters,
  readRoute,
  updateRoute
};
