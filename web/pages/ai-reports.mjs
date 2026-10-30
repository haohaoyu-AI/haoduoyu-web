import {e} from '../core/dom.mjs';
import {dailyNotesToday} from '../core/daily-notes-state.mjs';

export function renderAiReports() {
  return `<section id="ai-reports" aria-label="AI 汇报">
    <div class="field-spaced"><h2>汇报记录</h2>
      <div class="notes-toolbar"><div class="notes-date-controls">
        <button class="btn" type="button" data-ai-report-previous aria-label="前一天">‹</button>
        <label class="notes-date-label"><span class="sr-only">选择汇报日期</span><input id="ai-report-date" class="input" type="date" max="${dailyNotesToday()}"></label>
        <button class="btn" type="button" data-ai-report-next aria-label="后一天">›</button>
        <button class="btn text" type="button" data-ai-report-today>今天</button>
      </div></div><p id="ai-report-list-status" role="status"></p>
      <div id="ai-report-list" aria-live="polite"></div>
    </div>
  </section>`;
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
});
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false
});

export function reportContent(value) {
  const content = String(value ?? '');
  const firstLine = content.split(/\r?\n/, 1)[0];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(firstLine) ? new Date(`${firstLine}T00:00:00Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== firstLine)
    return {workDate: null, body: content};
  return {workDate: firstLine, body: content.slice(firstLine.length).replace(/^\r?\n/, '')};
}

export function reportDay(row) {
  const {workDate} = reportContent(row.content);
  const date = new Date(row.created_at);
  if (workDate) return workDate;
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function paintAiReports(items, error = '', loading = false, selectedDate = dailyNotesToday()) {
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  const status = root.querySelector('#ai-report-list-status');
  status.textContent = error || (loading || items.length ? '' : '暂无汇报');
  const dateInput = root.querySelector('#ai-report-date');
  dateInput.value = selectedDate; dateInput.max = dailyNotesToday();
  root.querySelector('[data-ai-report-next]').disabled = selectedDate >= dailyNotesToday();
  const groups = new Map();
  for (const row of items) {
    const date = new Date(row.created_at);
    const validDate = Number.isFinite(date.getTime());
    const submissionDay = validDate ? dateFormatter.format(date) : '日期未知';
    const {workDate, body} = reportContent(row.content);
    const group = workDate ? `${Number(workDate.slice(0, 4))}年${Number(workDate.slice(5, 7))}月${Number(workDate.slice(8, 10))}日` : `提交日期 · ${submissionDay}`;
    const stamp = validDate ? `${submissionDay} ${timeFormatter.format(date)}（北京时间）` : String(row.created_at ?? '未知');
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(`<article class="card field-spaced" style="overflow-wrap:anywhere" title="提交于 ${e(stamp)}"><p><strong>${e(row.author)}：</strong><br><br>${e(body).replace(/\n/g, '<br>')}</p></article>`);
  }
  root.querySelector('#ai-report-list').innerHTML = [...groups].map(([group, rows]) =>
    `<h3 class="field-spaced">${e(group)}</h3>${rows.join('')}`).join('');
}
