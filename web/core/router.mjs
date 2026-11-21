import { defaultFilters, legacyPages, modeLabels, nav, settingsTabs } from "./constants.mjs";
import { state } from "./state.mjs";
import { storage } from "./storage.mjs";
import { dailyNotesRouteDate, setDailyNotesRouteDate, dailyNotesRouteCategory, setDailyNotesRouteCategory } from "./daily-notes-state.mjs";
import { validTodoDate } from "./todos-state.mjs";

const PAGE_REDIRECTS = Object.freeze({
  overview: "review",
  dashboard: "review",
  articles: "review",
  reviews: "review",
  reminders: "ai-reports",
  "ai-diagnosis": "ai-reports",
  memos: "notes"
});
const ROUTE_MANAGED_PARAMS = Object.freeze([
  "date", "notes_category", "memo_view", "period", "article_scope", "q",
  "ai_tab", "diagnosis_tab", "openai_run", "todo_panel", "tab", "account",
  ...Object.keys(defaultFilters()), "list_page", "page_size", "top_n", "top_platform", "columns"
]);
const REVIEW_ONLY_PARAMS = Object.freeze([
  "review_view", "review_date", "review_period", "review_article", "review_version", "review_compare", "review_section"
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
  state.aiDailyTab = legacyWeekly ? "reports" : ["reminders", "reports"].includes(params.get("ai_tab")) ? params.get("ai_tab") : "reports";
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
  const int = (key, def, max) => /^\d+$/.test(params.get(key) || "") && Number(params.get(key)) > 0 && Number(params.get(key)) <= max
    ? Number(params.get(key)) : def;
  state.listPage = int("list_page", 1, 1e6);
  state.pageSize = int("page_size", 20, 200);
}
export {
  isMobileLayout,
  mobilePage,
  readRoute,
  updateRoute
};
