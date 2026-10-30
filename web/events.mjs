import {inputUnscheduledTodo,toggleUnscheduledTodo} from "./pages/unscheduled-todos.mjs";
import { changeReconciliationFilters } from "./pages/article-reconciliation.mjs";
import { isRequestAbort } from "./core/requests.mjs";
import { applyArticleFilters, handleResponsiveLayout, navigate, navigateLink, publishedArticleLinks, reloadFilteredPage, renderPage, renderShell,
  renderMediaOverview } from "./controller.mjs";
import { $, $$, e } from "./core/dom.mjs";
import { readRoute, updateRoute } from "./core/router.mjs";
import { runtime, state } from "./core/state.mjs";
import { articleDraft, articleFilterPanel, viewDraft } from "./pages/articles.mjs";
import { handleArticleVerificationChange } from "./pages/article-verification.mjs";
import { renderDashboard } from "./pages/dashboard.mjs";
import { inputTodo, registerTodosClock, selectTodoDate, setTodoPanel, toggleTodo } from "./pages/todos.mjs";
import { inputTodoTemplate, loadTodoTemplates } from "./pages/todo-templates.mjs";
import { canOpenTodoMenu, openTodoMenu } from "./pages/todo-actions.mjs";
import { changeTodoCompletedMode } from "./pages/todo-preferences.mjs";
import { registerTodoGestures } from "./ui/todo-gestures.mjs";
import { replacePageContent } from "./ui/entry.mjs";
import { closeMobileMenuOutside, setMenu, syncMenu, trapMobileMenuFocus } from "./ui/menu.mjs";
import { closeModal } from "./ui/modal.mjs";
import { closePopover } from "./ui/popover.mjs";
import { toast } from "./ui/toast.mjs";
import { actions } from "./actions.mjs";
import { handleFormSubmit } from "./forms.mjs";
import {setDailyNotesRouteCategory} from "./core/daily-notes-state.mjs";
import {closeMediaNavigation} from "./ui/workbench.mjs";
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
    if (target.dataset.notesCategory) { setDailyNotesRouteCategory(target.dataset.notesCategory); navigate("notes"); }
    else navigateLink(target.dataset.nav);
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
  if (el.dataset?.futureTodoId) {
    toggleUnscheduledTodo(el);
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
    select.innerHTML = '<option value="">账号总体</option>' + state.reviewArticles.filter((a) => a.account_id === el.value).map((a) =>
       `<option value="${e(a.id)}">${e(a.title)}</option>`).join("");
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
      items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (i + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.
      length]?.focus();
      return;
    }
  }
  if (event.key === "Escape" && $(".shell")?.classList.contains("menu-open")) {
    event.preventDefault();
    setMenu(false);
    return;
  }
  if (event.key === "Escape" && state.page === "todos" && state.todoPanel && !$("#overlay").firstChild) {
    event.preventDefault(); void setTodoPanel(""); return;
  }
  if (!$("#overlay").firstChild) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
  }
  if (event.key === "Tab") {
    const nodes = $$('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]', $(
      "#overlay")).filter((el) => el.getClientRects().length);
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
function registerEvents() {
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
export {
  registerEvents
};
