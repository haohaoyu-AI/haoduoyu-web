import { beginPageRequests, isRequestAbort } from "./core/requests.mjs";
import { api } from "./core/api.mjs";
import { retryUntil } from "./core/retry-after.mjs";
import { legacyPages, nav, settingsTabs } from "./core/constants.mjs";
import { $, $$, e, icon } from "./core/dom.mjs";
import { num } from "./core/format.mjs";
import { readRoute, updateRoute, mobilePage } from "./core/router.mjs";
import { resetSessionIndexes } from "./core/session-index-state.mjs";
import { runtime, state } from "./core/state.mjs";
import { storage } from "./core/storage.mjs";
import { renderLogin, renderInitializationError } from "./pages/login.mjs";
import { renderAudit, renderKeys, renderSecurity } from "./pages/settings.mjs";
import { loadTodos, paintTodos, renderTodos } from "./pages/todos.mjs";
import { loadTodoPreferences } from "./pages/todo-preferences.mjs";
import { renderDailyNotes } from "./pages/daily-notes.mjs";
import { loadDailyNotes, paintDailyNotesPage } from "./daily-notes-controller.mjs";
import { skeleton } from "./ui/components.mjs";
import { replacePageContent, stopPageEntry } from "./ui/entry.mjs";
import { setMenu, syncMenu } from "./ui/menu.mjs";
import { closeModal } from "./ui/modal.mjs";
import { closePopover } from "./ui/popover.mjs";
import { segmented } from "./ui/segmented.mjs";
import {mobileNavigation, sidebarNavigation, settingsNavigation, syncWorkbenchNavigation, renderSidebarResizer, setupSidebarResize,
  syncMobileViewport, setupMobileViewport} from "./ui/workbench.mjs";
import {renderTodoSettings} from "./pages/workbench-settings.mjs";
import {renderAiReports} from "./pages/ai-reports.mjs";
import {loadAiReports} from "./ai-reports-controller.mjs";
import {renderContentReview} from "./pages/content-review.mjs";
import {renderReviewArchiveShell} from "./pages/review-archive.mjs";
import {archiveHref, canAccessReviewArchive} from "./core/review-archive-state.mjs";
const reviewHomeHref = "?page=review&account=V%E5%AD%97";
import {aiSettingsPage, loadAiSettings} from "./ai-settings-controller.mjs";
import {loadContentReview, paintContentReviewPage} from "./review-controller.mjs";
import {loadReviewArchive, reviewArchiveActive} from "./review-archive-controller.mjs";

const PAGE_HEADERS = {
  review: ["内容复盘", "数据表现与爆款方法沉淀"],
  todos: ["每日待办", "今日任务与日程安排"],
  notes: ["碎碎念", "随时记录想法与状态"],
  "ai-reports": ["AI 日报", "待拍板事项与每日 AI 汇报"],
  settings: ["设置", "待办偏好、AI 配置与账号安全"]
};
function renderPageHeader() {
  const [defaultTitle, defaultSub] = PAGE_HEADERS[state.page] || PAGE_HEADERS.review;
  const archive = state.page === "review" && reviewArchiveActive();
  const title = archive ? "V字档案" : defaultTitle;
  const subtitle = archive ? "历史归档、导入与对比（仅 V字）" : defaultSub;
  // One pill for the account and, on 内容复盘 for the owner, the 档案 entry (or the way back from it).
  const name = state.account || "V字";
  const archiveLink = state.page === "review" && name === "V字" && canAccessReviewArchive(state.me, name)
    ? (archive ? `<a class="page-account-link" href="${e(reviewHomeHref)}">‹ 返回复盘</a>`
      : `<a class="page-account-link" href="${e(archiveHref)}">档案 ›</a>`) : "";
  const account = ["review", "ai-reports"].includes(state.page)
    ? `<span class="page-account-pill${archiveLink ? " has-link" : ""}"><span aria-label="当前账号">${e(name)}</span>${archiveLink}</span>` : "";
  const login = state.page === "settings" && state.me?.publicBusiness
    ? '<a class="btn small" href="?page=login">管理员登录</a>' : "";
  const actions = account || login ? `<div class="head-actions">${account}${login}</div>` : "";
  return `<div class="heading-left"><div class="page-head-titles"><h1>${e(title)}</h1><p class="page-head-sub">${e(subtitle)}</p></div></div>${actions}`;
}
function mainContent() {
  const settingsChoices = state.me?.publicBusiness ? {todo: settingsTabs.todo, ai: settingsTabs.ai} : settingsTabs;
  const tabs = state.page === "settings" ? segmented("settings-tab", Object.entries(settingsChoices), state.settingsTab, "设置分类", "tab", "page-tabs") : "";
  return `<div id="page-header" class="page-head">${renderPageHeader()}</div>${tabs}<div id="page-content"></div>${state.page === "settings" ? '<section class="card panel settings-offline-card" aria-label="本地待处理"><h2>本地待处理</h2><p class="hint">后台会自动同步；如有冲突，可在这里查看和处理。</p><div id="offline-settings-entry"></div></section>' : ""}`;
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
  if (state.page === "settings" && (!Object.hasOwn(settingsTabs, state.settingsTab) ||
    state.me?.publicBusiness && !["todo", "ai"].includes(state.settingsTab)))
    state.settingsTab = "todo";
  stopPageEntry();
  closePopover({ restoreFocus: false });
  if (reuseShell()) {
    renderPage();
    return;
  }
  $("#app").innerHTML = `<div class="shell" data-session="${runtime.sessionEpoch}" data-user="${e(state.me.id)}"><aside id="site-nav" \
class="sidebar" aria-label="主要导航"><div class="sidebar-brand"><a \
href="?page=review&amp;account=${e(encodeURIComponent(state.account || "V字"))}" class="brand" data-nav="review">\
<span class="brand-mark">${icon("fish", 27)}</span><span class="brand-title">好多鱼工作台</span></a>\
<button class="icon-button mobile-menu" data-action="menu" aria-label="关闭导航" aria-expanded="false" aria-controls="site-nav">${icon(
  "close")}</button></div><nav class="nav-list" tabindex="0" aria-label="模块导航">${sidebarNavigation()}</nav><div \
class="sidebar-bottom">${settingsNavigation()}${state.me.publicBusiness ? "" : `<div \
class="user-row"><span class="avatar">${e((state.me.username || "我").slice(0, 1).toUpperCase())}</span><span class="user-name">${e(state.
  me.username)}</span>${state.me.publicBusiness ? "" : `<button class="logout" data-action="logout" title="退出登录" \
aria-label="退出登录">${icon("logout", 16)}</button>`}</div>`}</div>\
</aside>${renderSidebarResizer()}<div class="workspace"><header class="mobile-bar"><span>好多鱼工作台</span>\
<a class="icon-button mobile-settings-trigger" href="?page=settings&amp;tab=todo" data-nav="settings" \
aria-label="设置">${icon("settings", 20)}</a></header>\
<main id="main" class="content" \
tabindex="-1">${mainContent()}</main>${mobileNavigation()}</div></div>`;
  syncMenu();
  setupSidebarResize();
  setupMobileViewport();
  renderPage();
}
function redirectMobileArticlePage() {
  const page = mobilePage(state.page);
  if (page === state.page) return false;
  state.page = page; updateRoute();
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
  const same = target === state.page && (target !== "review" || !reviewArchiveActive()) &&
    (page !== "settings" || state.settingsTab === "todo") && (page !== "todos" || !state.todoDate && !state.todoPanel);
  if (same && !$("#overlay")?.firstChild && !runtime.activePopover) {
    setMenu(false);
    return;
  }
  navigate(page);
}
function navigate(page, tab) {
  page = mobilePage(page);
  const legacy = Object.hasOwn(legacyPages, page) ? legacyPages[page] : null;
  if (legacy) page = "settings";
  if (!nav.some((n) => n.id === page)) return;
  state.page = page;
  if (page === "todos") { state.todoDate = ""; state.todoPanel = ""; }
  if (page === "settings") {
    const resolved = tab === "keys" || tab === "openai" ? "ai" : tab === "workspace" ? "todo" : tab;
    state.settingsTab = legacy || (Object.hasOwn(settingsTabs, resolved) ? resolved : "todo");
  }
  updateRoute(true, {exitReviewArchive:true});
  closeModal();
  renderShell();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function pageLoading(page) {
  if (page === "review" && reviewArchiveActive()) return renderReviewArchiveShell(canAccessReviewArchive(state.me,state.account));
  if (page === "review") return renderContentReview();
  if (page === "todos") return renderTodos();
  if (page === "notes") return renderDailyNotes();
  if (page === "ai-reports") return renderAiReports();
  return skeleton();
}
function setPageBody(html, page) {
  if (page === "review") {
    if (html) replacePageContent(html, true);
    else if (!reviewArchiveActive()) paintContentReviewPage();
  }
  else if (page === "todos") paintTodos();
  else if (page === "notes") paintDailyNotesPage();
  else if (page === "ai-reports") return;
  else replacePageContent(html, true);
}
async function renderPage() {
  if (redirectMobileArticlePage()) { renderShell(); return; }
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
    let html = "";
    switch (page) {
      case "todos":
        html = renderTodos();
        break;
      case "notes":
        await loadDailyNotes();
        break;
      case "ai-reports":
        await loadAiReports({resetDate:true});
        break;
      case "review":
        if (reviewArchiveActive()) await loadReviewArchive(context);
        else await loadContentReview(context);
        break;
      case "settings":
        if (state.settingsTab === "todo") { await loadTodoPreferences(context); html = renderTodoSettings(); }
        else if (state.settingsTab === "ai") {
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
    if (version === runtime.renderVersion && state.me) {
      setPageBody(html, page);
      if (counter?.isConnected) {
        counter.hidden = true;
        counter.textContent = "";
      }
    }
  } catch (err) {
    if (!isRequestAbort(err) && !err.staleSession && version === runtime.renderVersion && state.me) setPageBody(`<div class="card ` +
      `error-panel" role="alert"><span class="empty-icon">${icon("info", 23)}</span><h3>本次数据读取失败</h3><p>${e(err.message)}</p>` +
      `<button class="btn" data-action="refresh">${icon("refresh")}重新加载</button></div>`, page);
  } finally {
    if (version === runtime.renderVersion) $("#page-content")?.setAttribute("aria-busy", "false");
  }
}
async function init({ freshLogin = false } = {}) {
  resetSessionIndexes();
  const initEpoch = runtime.sessionEpoch;
  try {
    try {
      const views = JSON.parse(storage.get("haoduoyu.views") || "[]");
      state.savedViews = Array.isArray(views) ? views.filter((v) => typeof v?.id === "string" && typeof v.name === "string" && v.filters && typeof v.
      filters === "object" && Array.isArray(v.columns)).slice(-20) : [];
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
    state.accounts = accounts.sort((a, b) => ["toutiao", "zhihu", "wechat", "other"].indexOf(a.platform) - ["toutiao", "zhihu", "wechat",
       "other"].indexOf(b.platform));
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
        retrying = true; void init();
      }, {status: err.status});
    }
  }
}
export {
  init,
  handleResponsiveLayout,
  navigate,
  navigateLink,
  renderPage,
  renderShell
};
