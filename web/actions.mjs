import {deleteUnscheduledTodo} from "./pages/unscheduled-todos.mjs";
import { cancelModalRequests } from "./core/requests.mjs";
import { navigate, publishedArticleLinks, reloadFilteredPage, renderPage, renderShell, renderMediaOverview } from "./controller.mjs";
import { api } from "./core/api.mjs";
import { defaultColumns, defaultFilters, settingsTabs } from "./core/constants.mjs";
import { $, e } from "./core/dom.mjs";
import { time } from "./core/format.mjs";
import { bjtDate } from "./core/format.mjs";
import { updateRoute } from "./core/router.mjs";
import { clearArticleIndexes } from "./core/session-index-state.mjs";
import { runtime, state } from "./core/state.mjs";
import { articleDraft, articleFilterPanel, articleMenu, articleModal } from "./pages/articles.mjs";
import { refreshArticleVerification, retryArticleVerification } from "./pages/article-verification.mjs";
import { dashboardInfoBody, renderDashboard } from "./pages/dashboard.mjs";
import { articleDetail } from "./pages/detail.mjs";
import { renderLogin } from "./pages/login.mjs";
import { reviewModal, reviewRecordsModal } from "./pages/reviews.mjs";
import { accountModal, keyModal } from "./pages/settings.mjs";
import { moveTodoDate, moveTodoMonth, refreshTodos, selectTodoDate, setTodoPanel, retryTodoCreate } from "./pages/todos.mjs";
import { cancelTodoTemplateEdit, editTodoTemplate, useTodoTemplate, writeTodoTemplate } from "./pages/todo-templates.mjs";
import { changeTodoTemplate, deleteTodo, openTodoMenu, restoreTodo } from "./pages/todo-actions.mjs";
import { field, formEnd, renderSnapshot } from "./ui/components.mjs";
import { replacePageContent } from "./ui/entry.mjs";
import { setMenu } from "./ui/menu.mjs";
import { closeModal, openModal } from "./ui/modal.mjs";
import { popover } from "./ui/popover.mjs";
import { toast } from "./ui/toast.mjs";
import {requestMemoTool} from "./memos-controller.mjs";
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
  openModal("保存常用视图", `<form id="save-view-form">${field("name", '视图名称 <span class="required">*</span>', "text", "", 'maxlength="80" \
required')}${formEnd("保存视图")}</form>`);
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
  state.filters = { ...defaultFilters(), status: "published",
    platform: action === "all-top" ? state.topPlatform : target.dataset.platform,
     ...action === "all-top" ? { sort: "reads", order: "desc" } : {} };
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
  const records = ['dashboard','articles'].includes(state.page) ?
    '<button data-action="media-records" role="menuitem">查看数据记录</button>' : '';
  popover(target, '<button data-action="refresh" role="menuitem">刷新数据</button>' + records + '<a href="/api/v1/export" download role="menuitem">导出发布记录 CSV\
</a><a href="/api-docs" target="_blank" rel="noopener noreferrer" role="menuitem">接入文档 ↗</a>', { menu: true, label: "页面操作" });
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
    if ($('#media-records')) { await reviewRecordsModal(); return; }
    updateRoute(true);
    const version = runtime.renderVersion + 1;
    await renderPage();
    if (version === runtime.renderVersion && !$("#overlay").firstChild && document.activeElement === document.body) $(
      "[data-action=review-tab][data-tab=" + state.reviewTab + "]")?.focus();
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
  if (row) openModal("数据记录详情", `${renderSnapshot(row)}<p class="cell-sub record-context">${e(row.date ? "统计日期：" + row.
  date : "数据截至：" + time(row.as_of))}${row.updated_at ? " · 更新于 " + e(time(row.updated_at)) : ""}</p>`);
  return;
}
function actionRevokeKey({ target, id }) {
  openModal("撤销 AI 凭证", `<p class="revoke-context">撤销「${e(target.dataset.name)}」后凭证立即失效，已有数据保留。</p><form id="revoke-form" data-id="${e(
    id)}">${formEnd("确认撤销")}</form>`);
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
const actions = {
  "media-menu": ({event}) => {
    event.preventDefault(); navigate('dashboard');
  },
  "notes-menu": ({event}) => {
    if (state.page !== 'notes') {
      event.preventDefault(); navigate('notes'); document.querySelector('.mobile-notes-nav').open = true;
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
  "todo-template-delete": ({ id }) => writeTodoTemplate(id, undefined, true),
  "memo-tools": ({target}) => {
    if (target.dataset.tool === "trash") navigate("settings", "workspace");
    else { requestMemoTool(target.dataset.tool); navigate("memos"); }
  },
  "todo-panel": ({target}) => setTodoPanel(target.dataset.panel),
  "todo-future-delete": ({id}) => deleteUnscheduledTodo(id),
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
export {
  actions
};
