import {renderTodoPreferences} from './todo-preferences.mjs';

export function renderTodoSettings() {
  return `<section class="card panel todo-settings" aria-label="今日待办设置">${renderTodoPreferences()}</section>`;
}
