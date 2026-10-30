import {renderMemos} from './memos.mjs';
import {renderTodoPreferences} from './todo-preferences.mjs';

export function renderWorkbenchSettings() {
  return `<section class="workbench-settings">${renderMemos()}</section>`;
}

export function renderTodoSettings() {
  return `<section class="card panel todo-settings"><h2>今日待办</h2>${renderTodoPreferences()}</section>`;
}
