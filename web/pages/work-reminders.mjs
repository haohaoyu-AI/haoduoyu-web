import {e} from '../core/dom.mjs';
import {bjtDate} from '../core/format.mjs';

export function renderWorkReminders() {
  return '<section id="work-reminders" aria-label="每日工作提醒"><div class="reminder-toolbar">' +
    '<label for="reminder-date" class="sr-only">提醒日期</label><input id="reminder-date" class="input" type="date">' +
    '<button type="button" class="btn text" data-reminder-today>今天</button></div>' +
    '<p id="reminder-error" role="alert" hidden></p><div id="reminder-list" aria-live="polite"></div></section>';
}
export function paintWorkReminders(data, error = '') {
  const root = document.querySelector('#work-reminders');
  if (!root) return;
  const date = data?.date || bjtDate(), field = root.querySelector('#reminder-date');
  if (document.activeElement !== field) field.value = date;
  const message = root.querySelector('#reminder-error');
  message.hidden = !error; message.textContent = error;
  const rows = data?.items || [];
  root.querySelector('#reminder-list').innerHTML = data?.loading ? '<p role="status">正在读取…</p>' : rows.length ? rows.map(row =>
    '<article class="card reminder-card"><time datetime="' + e(row.updated_at) + '">' +
    e(new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false})
      .format(new Date(row.updated_at))) + '</time><p>' + e(row.summary) + '</p></article>').join('') :
    '<div class="card reminder-empty">暂无工作提醒</div>';
}
