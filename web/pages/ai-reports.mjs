import {e} from '../core/dom.mjs';
import {dailyNotesToday} from '../core/daily-notes-state.mjs';
import {renderSafeMarkdown} from '../core/safe-markdown.mjs';
import {visibleWorkReminders} from '../core/work-reminders-state.mjs';
import {decisionCards,decisionCount,decisionHistory,openDecisionCount} from './ai-decisions.mjs';

export function renderAiReports() {
  // 待拍板 sits on top of the page (no tab of its own); below it, 日报 and 周报 switch.
  return `<section id="ai-reports" aria-label="AI 日报">
    <div>
      <section class="ai-decision-top" aria-labelledby="ai-decision-title">
        <p id="ai-reminder-status" role="status"></p><div id="ai-reminder-list"></div>
        <details class="ai-decision-more"><summary data-ai-decision-history>看前 7 天的待拍板</summary>
        <div id="ai-decision-history"></div></details>
      </section>
      <div class="page-tabs segmented ai-daily-tabs" role="group" aria-label="汇报类型">
        <button class="btn" type="button" data-ai-daily-tab="reports" aria-pressed="true">日报</button>
        <button class="btn" type="button" data-ai-daily-tab="weekly" aria-pressed="false">周报</button>
      </div>
      <section data-ai-daily-panel="reports">
      <div class="ai-calendar-layout"><button class="btn ai-calendar-step" type="button" data-ai-report-month="-1" aria-label="上个月">‹</button>
        <div class="ai-calendar-body"><h2 id="ai-report-date-title" aria-live="polite"></h2><div id="ai-report-calendar"></div></div>
        <button class="btn ai-calendar-step" type="button" data-ai-report-month="1" aria-label="下个月">›</button></div>
      <p id="ai-report-list-status" role="status"></p>
      <div id="ai-report-dayhead"></div><div id="ai-report-list" aria-live="polite"></div><div id="ai-experiments" class="content-review ai-experiments"></div>
      </section>
      <section data-ai-daily-panel="weekly" hidden><p id="ai-weekly-status" role="status"></p>
        <div id="ai-weekly-list" class="content-review"></div></section>
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

/** The day a report is shown on: the morning after the work day it reports, the same rule as the day view. */
export function reportShownDay(row) {
  const day = reportDay(row);
  return day ? new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10) : '';
}
const shortDay = date => `${Number(date.slice(5,7))}月${Number(date.slice(8))}日`;

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

export function paintAiCalendar(selectedDate, visibleMonth = selectedDate.slice(0,7), selector = '#ai-reports') {
  const root = document.querySelector(selector);
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
    groups[group].push(`<article class="card field-spaced ai-report-card" title="提交于 ${e(stamp)}">` +
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
  const items = visibleWorkReminders(data?.items || []), count = items.length ? decisionCount(items) : 0;
  const date = data?.date || dailyNotesToday(), day = date === dailyNotesToday() ? `今天 · ${reportDayTitle(date)}` : reportDayTitle(date);
  const open = items.length ? openDecisionCount(items) : 0;
  const box = root.querySelector('#ai-reminder-list');
  if (loading || error) { box.innerHTML = ''; return; }
  // Nothing waiting (none today, or Grok has marked every one 已采纳 / 已否决 / 待定): one quiet line.
  if (!open) {
    box.innerHTML = `<p class="ai-decision-done" id="ai-decision-title"><span aria-hidden="true">✓</span> ${e(day)} · ` +
      `${count ? '今天的都拍完了' : '今天没有要你拍板的事'}</p>`;
    return;
  }
  box.innerHTML = `<h2 class="ai-decision-head" id="ai-decision-title">待拍板 <b>${open}</b><span> · ${e(day)}</span></h2>` +
    '<p class="ai-decision-how">看完去和 Grok 说就行；完整内容在下面的日报里。</p>' + decisionCards(items);
}
/** Earlier days of 待拍板, loaded only when asked for. */
export function paintDecisionHistory(days, {loading = false, error = ''} = {}) {
  const box = document.querySelector('#ai-decision-history');
  if (!box) return;
  box.innerHTML = error ? `<p class="body-summary-error">${e(error)}</p>` : loading ? '<p class="muted">正在读取…</p>' :
    decisionHistory(days);
}

const WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六'];
/** "11月13日 周五", the same date wording as the notes timeline. */
export function reportDayTitle(date) {
  return `${Number(date.slice(5,7))}月${Number(date.slice(8))}日 ${WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()]}`;
}
/** Plain first lines of a Markdown report, for the timeline card. */
export function reportPreview(markdown) {
  return String(markdown ?? '').replace(/```[\s\S]*?```/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^[\s#>*+-]+/gm, '').replace(/[*_`~|]/g, '')
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 2).join(' ');
}
/** AI reports as a diary timeline: one row per work day in the month, newest first; a row opens that day. */
export function paintAiReportTimeline(items, month, {loading = false, error = ''} = {}) {
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  paintAiCalendar(`${month}-01`, month);
  const days = new Map();
  for (const row of items) {
    const day = reportShownDay(row);
    if (day.startsWith(month)) days.set(day, [...(days.get(day) || []), row]);
  }
  root.querySelector('#ai-report-list-status').textContent = error || (loading ? '' : days.size ? '' : '这个月还没有汇报');
  const head = root.querySelector('#ai-report-dayhead');
  if (head) head.innerHTML = '';
  const today = dailyNotesToday(), pinned = days.get(today) || [];
  days.delete(today);
  const rows = [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, list]) => {
    const preview = list.map(row => `${reportGroup(row.author)}：${reportPreview(reportContent(row.content).body)}`).join('\n');
    const authors = [...new Set(list.map(row => reportGroup(row.author)))].join(' · ');
    const covered = [...new Set(list.map(reportDay))].sort().map(shortDay).join('、');
    return `<button type="button" class="notes-tl-day" data-ai-report-open="${date}" aria-label="${e(reportDayTitle(date))}的汇报，打开">` +
      `<span class="notes-tl-date"><span class="notes-tl-num">${Number(date.slice(8))}</span>` +
      `<span class="notes-tl-week">${reportDayTitle(date).split(' ')[1]}</span></span><span class="notes-tl-dot"></span>` +
      `<span class="notes-tl-card"><span class="notes-tl-preview">${e(preview)}</span>` +
      `<span class="notes-tl-foot">汇报 ${e(covered)} · ${e(authors)} · ${list.length} 份</span></span></button>`;
  });
  const top = month === today.slice(0, 7) ? todayReports(today, pinned) : '';
  root.querySelector('#ai-report-list').innerHTML = loading || error ? '' :
    top + (rows.length ? `${top ? '<h3 class="ai-today-more">更早</h3>' : ''}<div class="notes-tl">${rows.join('')}</div>` : '');
  if (!loading && !error && top) root.querySelector('#ai-report-list-status').textContent = '';
}
/** Today's reports, open in full above the timeline; they cover yesterday's work. */
function todayReports(today, list) {
  const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const head = `<h3 class="ai-today-title">今天 · ${e(reportDayTitle(today))}</h3>` +
    `<p class="notes-read-sub">汇报的是昨天（${e(reportDayTitle(yesterday))}）做的事</p>`;
  if (!list.length) return `<section class="ai-today">${head}<p class="muted">今天的汇报还没到。</p></section>`;
  const order = ['Grok bot', 'Gemini', 'GPT', '其他作者'];
  const sorted = [...list].sort((a, b) => order.indexOf(reportGroup(a.author)) - order.indexOf(reportGroup(b.author)) ||
    String(a.created_at).localeCompare(String(b.created_at)));
  return `<section class="ai-today">${head}${sorted.map(row => `<article class="ai-today-report">` +
    `<p><strong class="${reportAuthorClass(row.author)}">${e(String(row.author ?? ''))}：</strong></p>` +
    `<div class="ai-report-markdown">${renderSafeMarkdown(reportContent(row.content).body)}</div></article>`).join('')}</section>`;
}
/** Back link and title above one opened day. */
export function paintAiReportDayHead(date) {
  const head = document.querySelector('#ai-reports #ai-report-dayhead');
  if (head) head.innerHTML = date ? '<button type="button" class="notes-read-back" data-ai-report-back="1">← 返回时间轴</button>' +
    `<h3 class="notes-read-title">${e(reportDayTitle(date))} 的汇报</h3>` +
    `<p class="notes-read-sub">汇报的是前一天（${e(reportDayTitle(new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)))}）做的事</p>` : '';
}
