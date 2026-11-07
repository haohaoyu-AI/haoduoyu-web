import {renderOpenAiRun, openAiLogin} from './openai-review.mjs';
import {e} from '../core/dom.mjs';
import {dailyNotesToday} from '../core/daily-notes-state.mjs';
import {renderSafeMarkdown} from '../core/safe-markdown.mjs';

export function renderAiReports() {
  return `<section id="ai-reports" aria-label="AI 日报">
    <div>
      <div class="page-tabs segmented ai-daily-tabs" role="group" aria-label="AI 日报模块">
        <button class="btn" type="button" data-ai-daily-tab="reminders" aria-pressed="true">每日提醒</button>
        <button class="btn" type="button" data-ai-daily-tab="reports" aria-pressed="false">AI汇报</button>
        <button class="btn" type="button" data-ai-daily-tab="openai" aria-pressed="false">OpenAI API</button>
      </div>
      <div class="ai-calendar-layout"><button class="btn ai-calendar-step" type="button" data-ai-report-month="-1" aria-label="上个月">‹</button>
        <div class="ai-calendar-body"><h2 id="ai-report-date-title" aria-live="polite"></h2><div id="ai-report-calendar"></div></div>
        <button class="btn ai-calendar-step" type="button" data-ai-report-month="1" aria-label="下个月">›</button></div>
      <section data-ai-daily-panel="reminders"><p id="ai-reminder-status" role="status"></p><div id="ai-reminder-list"></div></section>
      <section data-ai-daily-panel="openai" hidden><p class="hint">按实际运行的北京时间归档，同一天的每次分析分别保留。</p>
        <p id="openai-diary-status" role="status" aria-live="polite"></p><div id="openai-diary-list"></div>
        <button class="btn" type="button" data-openai-diary-refresh>刷新分析记录</button></section>
      <section data-ai-daily-panel="reports" hidden><p id="ai-report-list-status" role="status"></p>
      <div id="ai-report-list" aria-live="polite"></div>
      </section>
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

// Only explicit known names are mapped. Unrecognized historical names remain visible.
export function reportGroup(author) {
  const name = String(author ?? '').trim().toLowerCase();
  if (['grok bot', 'grok bot-小小鱼'].includes(name)) return 'Grok bot';
  if (name === 'gemini') return 'Gemini';
  if (['gpt', 'chatgpt', 'chatgpt-dot小鱼'].includes(name)) return 'GPT';
  return '其他作者';
}

export function reportAuthorClass(author) {
  const colors = {'Grok bot': 'grok', Gemini: 'gemini', GPT: 'gpt', '其他作者': 'other'};
  return `ai-report-author ai-report-author--${colors[reportGroup(author)]}`;
}

export function paintAiCalendar(selectedDate, visibleMonth = selectedDate.slice(0,7)) {
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  root.querySelector('#ai-report-date-title').textContent = `${Number(visibleMonth.slice(0, 4))}年${Number(visibleMonth.slice(5, 7))}月`;
  const first = new Date(`${visibleMonth}-01T00:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  let calendar = '<div class="ai-calendar-grid">' + ['日','一','二','三','四','五','六'].map(d => `<span>${d}</span>`).join('');
  calendar += '<span></span>'.repeat(first.getUTCDay());
  for (let day = 1; day <= days; day++) {
    const date = `${visibleMonth}-${String(day).padStart(2, '0')}`;
    calendar += `<button type="button" class="btn text" data-ai-report-select="${date}" aria-label="${date}" ` +
      `${date === selectedDate ? 'aria-current="date"' : ''}>${day}</button>`;
  }
  root.querySelector('#ai-report-calendar').innerHTML = calendar + '</div>';
}

export function paintAiReports(items, error = '', loading = false, selectedDate = dailyNotesToday(), visibleMonth = selectedDate.slice(0,7)) {
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  const status = root.querySelector('#ai-report-list-status');
  status.textContent = error || (loading || items.length ? '' : '暂无汇报');
  paintAiCalendar(selectedDate, visibleMonth);
  const rows = [];
  const groups = { 'Grok bot': [], Gemini: [], GPT: [], '其他作者': [] };
  for (const row of items) {
    const date = new Date(row.created_at);
    const validDate = Number.isFinite(date.getTime());
    const submissionDay = validDate ? dateFormatter.format(date) : '日期未知';
    const {body} = reportContent(row.content);
    const stamp = validDate ? `${submissionDay} ${timeFormatter.format(date)}（北京时间）` : String(row.created_at ?? '未知');
    const author = String(row.author ?? '');
    const group = reportGroup(author);
    groups[group].push(`<article class="card field-spaced" style="overflow-wrap:anywhere" title="提交于 ${e(stamp)}">` +
      `<p><strong class="${reportAuthorClass(author)}">${e(author)}：</strong></p>` +
      `<div class="ai-report-markdown">${renderSafeMarkdown(body)}</div></article>`);
  }
  for (const [name, entries] of Object.entries(groups)) {
    if (name === '其他作者' && !entries.length) continue;
    const heading = name === '其他作者' ? `<h3 class="${reportAuthorClass(name)}">${name}</h3>` : '';
    rows.push(`<section>${heading}${entries.length ? entries.join('') : '<p>暂无汇报</p>'}</section>`);
  }
  root.querySelector('#ai-report-list').innerHTML = loading || error ? '' : rows.join('');
}

export function paintAiDailyReminders(data, error = '', loading = false) {
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  root.querySelector('#ai-reminder-status').textContent = error || (loading ? '正在读取工作提醒…' : '');
  const items = data?.items || [];
  root.querySelector('#ai-reminder-list').innerHTML = items.length ? items.map(row =>
    `<article class="card field-spaced" style="overflow-wrap:anywhere">` +
    `<div class="ai-report-markdown">${renderSafeMarkdown(row.summary)}</div></article>`).join('') :
    loading || error ? '' : '<p>暂无工作提醒</p>';
}

export function paintOpenAiDiary(items = [], {error = '', loading = false, owner = true} = {}) {
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  root.querySelector('#openai-diary-status').textContent = error || (loading ? '正在读取分析记录…' : '');
  root.querySelector('#openai-diary-list').innerHTML = !owner ? openAiLogin : loading || error ? '' :
    items.length ? items.map(renderOpenAiRun).join('') : '<p>这一天没有 OpenAI API 分析记录。</p>';
}
