import {openFloatingWorkbench} from "./floating-workbench.mjs";
import {deleteUnscheduledTodo,pickUnscheduledTodoDate,quickScheduleUnscheduledTodo,scheduleUnscheduledTodo} from "./pages/unscheduled-todos.mjs";
import {setUnscheduledTodoDue,setUnscheduledTodoPeriod,setUnscheduledTodoRepeat,toggleUnscheduledTodoPanel} from "./pages/unscheduled-todos.mjs";
import { navigate, renderPage } from "./controller.mjs";
import { api } from "./core/api.mjs";
import { settingsTabs } from "./core/constants.mjs";
import { $, e } from "./core/dom.mjs";
import { bjtDate } from "./core/format.mjs";
import { clearArticleIndexes } from "./core/session-index-state.mjs";
import { state } from "./core/state.mjs";
import { renderLogin } from "./pages/login.mjs";
import { keyModal } from "./pages/settings.mjs";
import { moveTodoDate, moveTodoMonth, refreshTodos, selectTodoDate, setTodoPanel, retryTodoCreate } from "./pages/todos.mjs";
import { cancelTodoTemplateEdit, editTodoTemplate, useTodoTemplate, writeTodoTemplate, archiveTodoTemplate } from "./pages/todo-templates.mjs";
import { changeTodoCount, changeTodoTemplate, deleteTodo, openTodoCount, openTodoMenu, openTodoNote, restoreTodo } from "./pages/todo-actions.mjs";
import { formEnd } from "./ui/components.mjs";
import { setMenu } from "./ui/menu.mjs";
import { closeModal, openModal } from "./ui/modal.mjs";
import { popover } from "./ui/popover.mjs";
import { toast } from "./ui/toast.mjs";

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
  popover(target, '<button data-action="refresh" role="menuitem">刷新数据</button>' +
    '<a href="/api/v1/export" download role="menuitem">导出发布记录 CSV</a>' +
    '<a href="/api-docs" target="_blank" rel="noopener noreferrer" role="menuitem">接入文档 ↗</a>', { menu: true, label: "页面操作" });
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
function actionRevokeKey({ target, id }) {
  openModal("撤销 AI 凭证", `<p class="revoke-context">撤销「${e(target.dataset.name)}」后凭证立即失效，已有数据保留。</p>` +
    `<form id="revoke-form" data-id="${e(id)}">${formEnd("确认撤销")}</form>`);
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
}
const actions = {
  "todo-floating": openFloatingWorkbench,
  "todo-menu": openTodoMenu,
  "todo-note": openTodoNote,
  "todo-count-set": ({ target }) => openTodoCount(target.dataset),
  "todo-count-add": ({ target }) => void changeTodoCount(target.dataset, "add"),
  "todo-count-undo": ({ target }) => void changeTodoCount(target.dataset, "undo"),
  "todo-count-clear": ({ target }) => void changeTodoCount(target.dataset, "clear"),
  "todo-delete": ({ target }) => deleteTodo(target.dataset),
  "todo-restore": ({ target }) => restoreTodo(target.dataset),
  "todo-make-template": ({ target }) => changeTodoTemplate(target.dataset),
  "todo-remove-template": ({ target }) => changeTodoTemplate(target.dataset, true),
  "todo-template-use": ({ id }) => useTodoTemplate(id),
  "todo-template-edit": ({ id }) => editTodoTemplate(id),
  "todo-template-archive": ({ id }) => archiveTodoTemplate(id),
  "todo-template-restore-archive": ({ id }) => archiveTodoTemplate(id, true),
  "todo-template-delete": ({ id }) => writeTodoTemplate(id, undefined, true),
  "todo-panel": ({target}) => setTodoPanel(target.dataset.panel),
  "todo-future-delete": ({id}) => deleteUnscheduledTodo(id),
  "todo-future-schedule": ({id}) => scheduleUnscheduledTodo(id),
  "todo-future-quick": ({id, target}) => quickScheduleUnscheduledTodo(id, target.dataset.date),
  "todo-future-pick": ({id}) => pickUnscheduledTodoDate(id),
  "todo-future-menu": ({id}) => toggleUnscheduledTodoPanel(id),
  "todo-future-period": ({id, target}) => setUnscheduledTodoPeriod(id, target.dataset.period),
  "todo-future-repeat": ({id, target}) => setUnscheduledTodoRepeat(id, target.dataset.repeat),
  "todo-future-due": ({id}) => setUnscheduledTodoDue(id),
  "todo-future-due-clear": ({id}) => setUnscheduledTodoDue(id, true),
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
export {
  actions
};
