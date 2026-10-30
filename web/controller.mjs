import { beginPageRequests, isRequestAbort } from "./core/requests.mjs";
import { api } from "./core/api.mjs";
import { legacyPages, nav, settingsTabs } from "./core/constants.mjs";
import { $, $$, e, icon } from "./core/dom.mjs";
import { num, rowsForAccount } from "./core/format.mjs";
import { readRoute, updateRoute, mobilePage } from "./core/router.mjs";
import { resetSessionIndexes } from "./core/session-index-state.mjs";
import { runtime, state } from "./core/state.mjs";
import { storage } from "./core/storage.mjs";
import { articleDraft, renderArticles } from "./pages/articles.mjs";
import { renderDashboardSummary } from "./pages/dashboard.mjs";
import { renderLogin } from "./pages/login.mjs";
import { renderReviews } from "./pages/reviews.mjs";
import { renderAccounts, renderAudit, renderKeys, renderSecurity } from "./pages/settings.mjs";
import { loadTodos, paintTodos, renderTodos } from "./pages/todos.mjs";
import { loadTodoPreferences } from "./pages/todo-preferences.mjs";
import { renderDailyNotes } from "./pages/daily-notes.mjs";
import { loadDailyNotes, paintDailyNotesPage } from "./daily-notes-controller.mjs";
import { renderMemos } from "./pages/memos.mjs";
import { loadMemos, paintMemosPage } from "./memos-controller.mjs";
import { skeleton } from "./ui/components.mjs";
import { replacePageContent, stopPageEntry } from "./ui/entry.mjs";
import { setMenu, syncMenu } from "./ui/menu.mjs";
import { closeModal } from "./ui/modal.mjs";
import { closePopover } from "./ui/popover.mjs";
import { segmented } from "./ui/segmented.mjs";
import { toast } from "./ui/toast.mjs";
import {mobileNavigation, sidebarNavigation, settingsNavigation, syncWorkbenchNavigation, renderSidebarResizer, setupSidebarResize,
  renderMediaTabs, mobileSettingsMenu, syncMobileViewport, setupMobileViewport} from "./ui/workbench.mjs";
import {renderWorkbenchSettings, renderTodoSettings} from "./pages/workbench-settings.mjs";
import {renderWorkReminders} from "./pages/work-reminders.mjs";
import {loadWorkReminders} from "./work-reminders-controller.mjs";
import {renderAiReports} from "./pages/ai-reports.mjs";
import {loadAiReports} from "./ai-reports-controller.mjs";
function mainContent() {
  return `<div id="page-header" class="page-head"></div>${state.page === "settings" ? segmented("settings-tab", Object.entries(
    state.me?.publicBusiness ? {workspace: settingsTabs.workspace, accounts: settingsTabs.accounts, todo: settingsTabs.todo} : settingsTabs), state.settingsTab,
    "设置分类", "tab", "page-tabs") : ""}${renderMediaTabs()}<div id="page-content"></div>`;
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
  if (state.me?.publicBusiness && state.page === "settings" && !["workspace", "accounts", "todo"].includes(state.settingsTab))
    state.settingsTab = "workspace";
  stopPageEntry();
  closePopover({ restoreFocus: false });
  if (reuseShell()) {
    renderPage();
    return;
  }
  $("#app").innerHTML = `<div class="shell" data-session="${runtime.sessionEpoch}" data-user="${e(state.me.id)}"><aside id="site-nav" \
class="sidebar" aria-label="主要导航"><div class="sidebar-brand"><a \
href="?page=todos" class="brand" data-nav="todos"><span class="brand-mark">${icon("fish", 27)}</span><span class="brand-title">好多鱼工作台</span></a>\
<button class="icon-button mobile-menu" data-action="menu" aria-label="关闭导航" aria-expanded="false" aria-controls="site-nav">${icon(
  "close")}</button></div><nav class="nav-list" tabindex="0" aria-label="模块导航">${sidebarNavigation()}</nav><div \
class="sidebar-bottom">${settingsNavigation()}${state.me.publicBusiness ? "" : `<div \
class="user-row"><span class="avatar">${e((state.me.username || "我").slice(0, 1).toUpperCase())}</span><span class="user-name">${e(state.
  me.username)}</span>${state.me.publicBusiness ? "" : `<button class="logout" data-action="logout" title="退出登录" \
aria-label="退出登录">${icon("logout", 16)}</button>`}</div>`}</div>\
</aside>${renderSidebarResizer()}<div class="workspace"><header class="mobile-bar"><span>好多鱼工作台</span>\
<button class="icon-button mobile-settings-trigger" data-action="menu" aria-label="设置菜单" \
aria-expanded="false" aria-controls="mobile-settings-menu">${icon("settings", 20)}</button>${mobileSettingsMenu()}</header>\
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
  const same = target === state.page && (target !== "memos" || !state.memoView) &&
    (page !== "settings" || state.settingsTab === "workspace") && (page !== "todos" || !state.todoDate && !state.todoPanel);
  if (same && !$("#overlay")?.firstChild && !runtime.activePopover) {
    setMenu(false);
    return;
  }
  navigate(page);
}
function navigate(page, tab) {
  if (page === "reviews") page = "articles";
  if (page === "memos" && tab === "trash") { page = "settings"; tab = "workspace"; }
  const legacy = Object.hasOwn(legacyPages, page) ? legacyPages[page] : null;
  if (legacy) page = "settings";
  if (!nav.some((n) => n.id === page)) return;
  state.page = page;
  if (page === "memos") state.memoView = tab === "trash" ? "trash" : "";
  if (page === "todos") { state.todoDate = ""; state.todoPanel = ""; }
  if (page === "settings") state.settingsTab = legacy || tab || "workspace";
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
  if (page === "ai-reports") return renderAiReports();
  if (page === "settings" && state.settingsTab === "workspace") return renderWorkbenchSettings();
  return skeleton();
}
function setPageBody(html, page) {
  if (page === "todos") paintTodos();
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
async function loadArticleOverview(version, context) {
  const query = new URLSearchParams({period:state.overviewPeriod,top_n:state.topN,top_platform:state.topPlatform});
  if (state.account) query.set('account_id',state.account);
  const data = await api(`/overview?${query}`, {context});
  if (version !== runtime.renderVersion) return "";
  state.dashboard = data;
  return renderMediaOverview(data);
}
function renderMediaOverview(data) {
  return publishedArticleLinks(renderDashboardSummary(data));
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
      case "ai-reports":
        await loadAiReports();
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
        if (state.settingsTab === "workspace") { await loadMemos(); break; }
        else if (state.settingsTab === "todo") { await loadTodoPreferences(context); html = renderTodoSettings(); }
        else if (state.settingsTab === "accounts") {
          data = await api("/account-profiles", {context});
          if (version !== runtime.renderVersion) return;
          state.accountProfiles = data; html = renderAccounts();
        }
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
        const count = page === "articles" ? state.articleMeta?.total : page === "settings" && state.settingsTab === "accounts" ? state.accounts.length : null;
        counter.hidden = count == null;
        counter.textContent = count == null ? "" : num(count);
      }
    }
  } catch (err) {
    if (!isRequestAbort(err) && !err.staleSession && version === runtime.renderVersion && state.me) setPageBody(`<div class="card \
error-panel" role="alert"><span class="empty-icon">${icon("info", 23)}</span><h3>本次数据读取失败</h3><p>${e(err.message)}</p><button class="btn" \
data-action="refresh">${icon("refresh")}重新加载</button></div>`, page);
  } finally {
    if (version === runtime.renderVersion) $("#page-content")?.setAttribute("aria-busy", "false");
  }
}
async function reloadFilteredPage(focus = "[data-action=article-filter]") {
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
      state.savedViews = Array.isArray(views) ? views.filter((v) => typeof v?.id === "string" && typeof v.name === "string" && v.filters && typeof v.
      filters === "object" && Array.isArray(v.columns)).slice(-20) : [];
    } catch {
      state.savedViews = [];
    }
    const me = await api("/auth/me");
    if (initEpoch !== runtime.sessionEpoch) return;
    state.me = me;
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
    if (err.status !== 401) {
      renderLogin();
      toast(err.message, true);
    } else renderLogin();
  }
}
export {
  applyArticleFilters,
  init,
  handleResponsiveLayout,
  navigate,
  navigateLink,
  publishedArticleLinks,
  renderMediaOverview,
  reloadFilteredPage,
  renderPage,
  renderShell
};
