import { api } from "../core/api.mjs";
import { $, e } from "../core/dom.mjs";
import { isRequestAbort } from "../core/requests.mjs";
import { state } from "../core/state.mjs";
import { todoDay, todoOwner, todoSessionActive, todosState } from "../core/todos-state.mjs";
import { paintTodos } from "./todos.mjs";
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
<option value="hide" ${mode === "hide" ? "selected" : ""}>隐藏已完成</option></select>
<p id="todo-preferences-error" class="form-message" role="alert">${e(prefs.error)}</p></div>`;
}
function paintTodoPreferences() {
  const input = $("#todo-completed-mode"), prefs = todoPreferences();
  if (!input) return;
  input.value = todoCompletedMode();
  input.disabled = Boolean(prefs.pending) || !prefs.loaded;
  const error = $("#todo-preferences-error");
  if (error) error.textContent = prefs.error;
}
async function loadTodoPreferences(context) {
  const prefs = todoPreferences(), owner = todoOwner();
  try {
    const saved = await api("/todo-preferences", { context });
    if (!todoSessionActive(owner)) return;
    receiveTodoPreferences(saved.completed_mode, saved.version);
    prefs.error = "";
  } catch (error) {
    if (todoSessionActive(owner) && !isRequestAbort(error) && !error.staleSession) prefs.error = error.message;
  } finally {
    if (todoSessionActive(owner)) paintTodoPreferences();
  }
}
async function changeTodoCompletedMode(mode) {
  if (!state.me || !(state.page === "todos" || state.page === "settings" && state.settingsTab === "todo") ||
    !["strike", "hide"].includes(mode)) return;
  const prefs = todoPreferences(), owner = todoOwner();
  if (prefs.pending || !prefs.loaded || mode === prefs.mode) {
    paintTodoPreferences();
    return;
  }
  prefs.pending = mode;
  prefs.error = "";
  paintTodos();
  paintTodoPreferences();
  try {
    const saved = await api("/todo-preferences", { method: "PATCH", body: { completed_mode: mode, version: prefs.version } });
    if (!todoSessionActive(owner)) return;
    prefs.mode = saved.completed_mode;
    prefs.version = saved.version;
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
      paintTodoPreferences();
    }
  }
}
export {
  changeTodoCompletedMode, loadTodoPreferences, paintTodoPreferences, receiveTodoPreferences, renderTodoPreferences, todoCompletedMode, todoPreferences
};
