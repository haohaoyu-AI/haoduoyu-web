import {OPENAI_TABS, openAiSessionAvailable, readOpenAiRuns} from './core/openai-review-state.mjs';
import {updateRoute} from './core/router.mjs';
import {api, apiNetwork} from './core/api.mjs';
import {runtime,state} from './core/state.mjs';
import {dailyNotesToday,validDailyNotesDate} from './core/daily-notes-state.mjs';
import {paintAiReports,paintAiDailyReminders,paintAiCalendar,paintOpenAiDiary,reportDay} from './pages/ai-reports.mjs';

let sequence = 0, registered = false, selectedDate = '', visibleMonth = '', pageSession = null;

function selectDailyTab(name) {
  if (!OPENAI_TABS.includes(name)) return;
  state.aiDailyTab = name;
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  for (const button of root.querySelectorAll('[data-ai-daily-tab]'))
    button.setAttribute('aria-pressed', String(button.dataset.aiDailyTab === name));
  for (const panel of root.querySelectorAll('[data-ai-daily-panel]'))
    panel.hidden = panel.dataset.aiDailyPanel !== name;
}

export function aiReportsYesterday(today = dailyNotesToday()) {
  const date = new Date(today + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function reportRank(author) {
  const value = String(author ?? '');
  if (/gpt/i.test(value)) return 0;
  if (/(?:^|[^a-z0-9])bot(?:$|[^a-z0-9])/i.test(value)) return 1;
  if (/gemini/i.test(value)) return 2;
  return 3;
}
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function sortAiReports(items) {
  return [...items].sort((a, b) => reportRank(a.author) - reportRank(b.author) ||
    compareText(String(a.author ?? '').toLowerCase(), String(b.author ?? '').toLowerCase()) ||
    compareText(String(a.created_at ?? ''), String(b.created_at ?? '')) ||
    compareText(String(a.id ?? ''), String(b.id ?? '')));
}
export function reportsForDailyDate(items, date) {
  return sortAiReports(items.filter(row => reportDay(row) === aiReportsYesterday(date)));
}

// Reports are paginated by submission time, not work date, so read every page
// before filtering. This keeps all entries for a day, including later submissions.
export async function readAllAiReports(read, current = () => true) {
  const items = [], seen = new Set();
  for (let offset = 0; ; offset += 100) {
    const data = await read('/ai-reports?offset=' + offset);
    if (!current()) return null;
    if (!Array.isArray(data?.items) || typeof data.has_more !== 'boolean' ||
        data.items.length > 100 || data.has_more && data.items.length !== 100)
      throw new Error('汇报读取不完整，请稍后重试。');
    for (const row of data.items) if (!seen.has(row.id)) { seen.add(row.id); items.push(row); }
    if (!data.has_more) return items;
  }
}

export async function loadAiReports({resetDate = false} = {}) {
  registerAiReportEvents();
  const session = runtime.sessionEpoch;
  if (pageSession !== session || resetDate) {
    pageSession = session;
    selectedDate = validDailyNotesDate(state.aiDailyDate) ? state.aiDailyDate : dailyNotesToday();
    visibleMonth = selectedDate.slice(0,7);
  }
  if (!selectedDate) selectedDate = dailyNotesToday();
  if (!visibleMonth) visibleMonth = selectedDate.slice(0,7);
  const ticket = ++sequence, date = selectedDate;
  const current = () => ticket === sequence && session === runtime.sessionEpoch && state.page === 'ai-reports';
  paintAiReports([], '', true, date, visibleMonth);
  paintAiDailyReminders(null, '', true);
  selectDailyTab(state.aiDailyTab || 'reminders');
  const report = readAllAiReports(api, current).then(items => {
    if (current() && items) paintAiReports(reportsForDailyDate(items, date), '', false, date, visibleMonth);
  }).catch(error => {
    if (current()) paintAiReports([], error.message || '读取失败，请稍后重试。', false, date, visibleMonth);
  });
  const reminders = api('/work-reminders?date=' + encodeURIComponent(date)).then(data => {
    if (current()) paintAiDailyReminders(data);
  }).catch(error => {
    if (current()) paintAiDailyReminders(null, error.message || '提醒读取失败，请稍后重试');
  });
  await Promise.all([report, reminders]);
}

function moveMonth(offset) {
  const d = new Date(visibleMonth + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + offset);
  if (!Number.isFinite(d.getTime())) return;
  const next = d.toISOString().slice(0, 7);
  if (validDailyNotesDate(next + '-01')) { visibleMonth = next; paintAiCalendar(selectedDate, visibleMonth); }
}
function registerAiReportEvents() {
  if (registered) return;
  registered = true;
  document.addEventListener('click', event => {
    if (state.page !== 'ai-reports') return;
    const tab = event.target.closest?.('[data-ai-daily-tab]')?.dataset.aiDailyTab;
    if (tab) {
      selectDailyTab(tab); updateRoute();
      if (tab === 'openai') void loadAiReports();
    } else if (event.target.closest?.('[data-openai-diary-refresh]')) void loadAiReports();
    else if (event.target.closest?.('[data-ai-report-month]')) moveMonth(Number(event.target.closest('[data-ai-report-month]').dataset.aiReportMonth));
    else {
      const day = event.target.closest?.('[data-ai-report-select]')?.dataset.aiReportSelect;
      if (day && validDailyNotesDate(day)) { selectedDate = day; visibleMonth = day.slice(0,7);
        state.aiDailyDate = day; state.openAiRun = ''; updateRoute(); void loadAiReports(); }
    }
  });
}
