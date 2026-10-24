import { beginPageRequests, isRequestAbort } from "./core/requests.mjs";
import { api } from "./core/api.mjs";
import { legacyPages, nav, settingsTabs } from "./core/constants.mjs";
import { $, $$, e, icon } from "./core/dom.mjs";
import { num, rowsForAccount } from "./core/format.mjs";
import { readRoute, updateRoute } from "./core/router.mjs";
import { resetSessionIndexes } from "./core/session-index-state.mjs";
import { runtime, state } from "./core/state.mjs";
import { storage } from "./core/storage.mjs";
import { articleDraft, renderArticles } from "./pages/articles.mjs";
import { renderDashboardSummary } from "./pages/dashboard.mjs";
import { renderLogin } from "./pages/login.mjs";
import { renderReviews } from "./pages/reviews.mjs";
import { renderAccounts, renderAudit, renderKeys, renderSecurity } from "./pages/settings.mjs";
import { loadTodos, paintTodos, renderTodos } from "./pages/todos.mjs";
import { pageHeader, skeleton } from "./ui/components.mjs";
import { replacePageContent, stopPageEntry } from "./ui/entry.mjs";
import { setMenu, syncMenu } from "./ui/menu.mjs";
import { closeModal } from "./ui/modal.mjs";
import { closePopover } from "./ui/popover.mjs";
import { segmented } from "./ui/segmented.mjs";
import { toast } from "./ui/toast.mjs";
function mainContent() {
  return `<div id="page-header" class="page-head">${pageHeader()}</div>${state.page === "settings" ? segmented("settings-tab", Object.entries(
    state.me?.publicBusiness ? { accounts: settingsTabs.accounts } : settingsTabs), state.settingsTab,
    "设置分类", "tab", "page-tabs") : ""}<div id="page-content"></div>`;
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
  const navLink = (n) => `<a href="?page=${e(n.id)}${n.id === "settings" ? "&amp;tab=accounts" : ""}" data-nav="${e(n.id)}" class="nav-item ${n.
  id === state.page ? "active" : ""}" ${n.id === state.page ? 'aria-current="page"' : ""}>${icon(n.icon, 18)}${e(n.label)}</a>`;
  $("#app").innerHTML = `<div class="shell" data-session="${runtime.sessionEpoch}" data-user="${e(state.me.id)}"><aside id="site-nav" \
class="sidebar" aria-label="主要导航"><div class="sidebar-brand"><a \
href="?page=todos" class="brand" data-nav="todos"><span class="brand-mark">${icon("fish", 27)}</span><span class="brand-title">好多鱼图文</span></a>\
<button class="icon-button mobile-menu" data-action="menu" aria-label="关闭导航" aria-expanded="false" aria-controls="site-nav">${icon(
  "close")}</button></div><nav class="nav-list">${nav.filter((n) => n.id !== "settings").map(navLink).join("")}</nav><div \
class="sidebar-bottom">${navLink(nav.find((n) => n.id === "settings"))}<div \
class="user-row"><span class="avatar">${e((state.me.username || "我").slice(0, 1).toUpperCase())}</span><span class="user-name">${e(state.
  me.username)}</span>${state.me.publicBusiness ? "" : `<button class="logout" data-action="logout" title="退出登录" \
aria-label="退出登录">${icon("logout", 16)}</button>`}</div></div>\
</aside><div class="workspace"><header class="mobile-bar"><button class="icon-button" data-action="menu" aria-label="打开导航" \
aria-expanded="false" aria-controls="site-nav">${icon("menu", 20)}</button><span>好多鱼图文</span></header><main id="main" class="content" \
tabindex="-1">${mainContent()}</main>${mobileNavigation()}</div></div>`;
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
        data = await api(`/overview?period=${state.overviewPeriod}&top_n=${state.topN}&top_platform=${encodeURIComponent(state.topPlatform)}`,
        { context });
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
        state.accounts).length : null;
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
  navigate,
  navigateLink,
  reloadFilteredPage,
  renderPage,
  renderShell
};
