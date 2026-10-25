import { bjtDate } from "./format.mjs";
import { runtime, state } from "./state.mjs";
const todosState = { owner: "", days: new Map(), today: "", calendarMonth: "", calendarDate: "" };
function todoOwner() {
  return JSON.stringify([runtime.sessionEpoch, state.me?.id ?? null]);
}
function resetTodos() {
  todosState.owner = todoOwner();
  todosState.days.clear();
  todosState.today = bjtDate();
  todosState.calendarMonth = "";
  todosState.calendarDate = "";
  todosState.preferences = { mode: "strike", version: 0, loaded: false, pending: null, error: "" };
}
function validTodoDate(date) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function todoDate() {
  return state.page === "todos" && state.todoPanel !== "templates" && validTodoDate(state.todoDate) ? state.todoDate : bjtDate();
}
function todoDay(date = todoDate()) {
  if (todosState.owner !== todoOwner()) resetTodos();
  if (!todosState.days.has(date)) {
    todosState.days.set(date, { date, items: [], draft: "", create: null, adding: false, loading: false, loaded: false,
      error: "", notice: "", noticeVersion: 0, revision: 0, sequence: 0, updates: new Map(), templateCreates: new Map(),
      removals: new Map(), templateLinks: new Map(), templateWrites: new Set() });
  }
  return todosState.days.get(date);
}
function syncTodoDay(now = Date.now()) {
  if (todosState.owner !== todoOwner()) resetTodos();
  const today = bjtDate(now), changed = todosState.today !== today;
  todosState.today = today;
  return changed;
}
function todoSessionActive(owner) {
  return Boolean(state.me) && owner === todoOwner() && owner === todosState.owner;
}
function mergeTodo(day, item) {
  const index = day.items.findIndex((row) => row.id === item.id);
  if (index < 0) day.items.push(item);
  else if (day.items[index].version <= item.version) day.items[index] = item;
}
export { mergeTodo, resetTodos, syncTodoDay, todoDate, todoDay, todoOwner, todoSessionActive, todosState, validTodoDate };
