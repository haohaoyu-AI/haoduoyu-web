import { beginPageRequests, isRequestAbort } from "./core/requests.mjs";
import { api } from "./core/api.mjs";
import { legacyPages, nav, settingsTabs } from "./core/constants.mjs";
import { $, e, icon } from "./core/dom.mjs";
import { num, rowsForAccount } from "./core/format.mjs";
import { readRoute, updateRoute } from "./core/router.mjs";
import { resetSessionIndexes } from "./core/session-index-state.mjs";
import { runtime, state } from "./core/state.mjs";
import { storage } from "./core/storage.mjs";
import { articleDraft, renderArticles } from "./pages/articles.mjs";
import { renderDashboard } from "./pages/dashboard.mjs";
import { renderLogin } from "./pages/login.mjs";
import { renderReviews } from "./pages/reviews.mjs";
import { renderAccounts, renderAudit, renderKeys, renderSecurity } from "./pages/settings.mjs";
import { pageHeader, skeleton } from "./ui/components.mjs";
import { replacePageContent, stopPageEntry } from "./ui/entry.mjs";
import { syncMenu } from "./ui/menu.mjs";
import { closeModal } from "./ui/modal.mjs";
import { closePopover } from "./ui/popover.mjs";
import { segmented } from "./ui/segmented.mjs";
import { toast } from "./ui/toast.mjs";
function renderShell() {
  stopPageEntry();
  closePopover({ restoreFocus: false });
  const navLink = (n) => `<a href="?page=${e(n.id)}${n.id === "settings" ? "&amp;tab=accounts" : ""}" data-nav="${e(n.id)}" class="nav-item ${n.
  id === state.page ? "active" : ""}" ${n.id === state.page ? 'aria-current="page"' : ""}>${icon(n.icon, 18)}${e(n.label)}</a>`;
  $("#app").innerHTML = `<div class="shell"><aside id="site-nav" class="sidebar" aria-label="主要导航"><div class="sidebar-brand"><a href="?page\
=dashboard" class="brand" data-nav="dashboard"><span class="brand-mark">${icon("fish", 27)}</span><span class="brand-title">好多鱼图文</span></a>\
<button class="icon-button mobile-menu" data-action="menu" aria-label="关闭导航" aria-expanded="false" aria-controls="site-nav">${icon("\
close")}</button></div><nav class="nav-list">${nav.slice(0, 3).map(navLink).join("")}</nav><div class="sidebar-bottom">${navLink(nav[3])}<di\
v class="user-row"><span class="avatar">${e((state.me.username || "我").slice(0, 1).toUpperCase())}</span><span class="user-name">${e(state.
  me.username)}</span><button class="logout" data-action="logout" title="退出登录" aria-label="退出登录">${icon("logout", 16)}</butt\
on></div></div></aside><div class="workspace"><header class="mobile-bar"><button class="icon-button" data-action="menu" aria-label="打开导航" ar\
ia-expanded="false" aria-controls="site-nav">${icon("menu", 20)}</button><span>好多鱼图文</span></header><main id="main" class="content" tabindex\
="-1"><div id="page-header" class="page-head">${pageHeader()}</div>${state.page === "settings" ? `${segmented("settings-tab", Object.entries(
  settingsTabs), state.settingsTab, "设置分类", "tab", "page-tabs")}` : ""}<div id="page-content">${skeleton()}</div></main></div></div>`;
  syncMenu();
  renderPage();
}
function navigate(page, tab) {
  const legacy = Object.hasOwn(legacyPages, page) ? legacyPages[page] : null;
  if (legacy) page = "settings";
  if (!nav.some((n) => n.id === page)) return;
  state.page = page;
  if (page === "settings") state.settingsTab = legacy || tab || "accounts";
  if (page === "dashboard") state.account = "";
  updateRoute(true);
  closeModal();
  renderShell();
  window.scrollTo({ top: 0, behavior: "instant" });
}
async function renderPage() {
  stopPageEntry();
  closePopover({ restoreFocus: false });
  const version = ++runtime.renderVersion, page = state.page;
  const context = beginPageRequests();
  const counter = $("#page-count");
  if (counter) counter.hidden = true;
  replacePageContent(skeleton());
  $("#page-content")?.setAttribute("aria-busy", "true");
  try {
    let html = "", data;
    switch (page) {
      case "dashboard":
        data = await api(`/overview?period=${state.overviewPeriod}&top_n=${state.topN}&top_platform=${encodeURIComponent(state.topPlatform)}`,
        { context });
        if (version !== runtime.renderVersion) return;
        state.dashboard = data;
        html = renderDashboard(data);
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
      replacePageContent(html, true);
      if (counter?.isConnected) {
        const count = page === "articles" ? state.articleMeta?.total : page === "settings" && state.settingsTab === "accounts" ? rowsForAccount(
        state.accounts).length : null;
        counter.hidden = count == null;
        counter.textContent = count == null ? "" : num(count);
      }
    }
  } catch (err) {
    if (!isRequestAbort(err) && !err.staleSession && version === runtime.renderVersion && state.me) replacePageContent(`<div class="card err\
or-panel" role="alert"><span class="empty-icon">${icon("info", 23)}</span><h3>本次数据读取失败</h3><p>${e(err.message)}</p><button c\
lass="btn" data-action="refresh">${icon("refresh")}重新加载</button></div>`);
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
    state.accounts = accounts.sort((a, b) => ["toutiao", "zhihu", "wechat", "other"].indexOf(a.platform) - ["toutiao", "zhihu", "wechat", "o\
ther"].indexOf(b.platform));
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
  reloadFilteredPage,
  renderPage,
  renderShell
};
