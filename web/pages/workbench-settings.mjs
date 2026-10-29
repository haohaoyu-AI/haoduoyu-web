import {icon} from '../core/dom.mjs';
import {renderMemos} from './memos.mjs';
import {renderTodoPreferences} from './todo-preferences.mjs';

export function renderWorkbenchSettings() {
  return `<section class="workbench-settings"><div class="section-heading"><h2>回收站</h2>
<button class="btn text" data-action="memo-tools" data-tool="recovery">${icon('refresh')}找回未保存内容</button></div>
<p class="trash-policy">删除后30天内可恢复；超过30天归档保留，仍可恢复。</p>${renderMemos()}
<section class="card panel todo-settings"><h2>今日待办</h2>${renderTodoPreferences()}</section></section>`;
}
