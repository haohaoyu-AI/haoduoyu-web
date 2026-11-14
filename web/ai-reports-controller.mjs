import {loadExperimentsPanel} from './experiments-panel-controller.mjs';
import {OPENAI_TABS, openAiSessionAvailable, readOpenAiRuns} from './core/openai-review-state.mjs';
import {updateRoute} from './core/router.mjs';
import {api, apiNetwork} from './core/api.mjs';
import {runtime,state} from './core/state.mjs';
import {dailyNotesToday,validDailyNotesDate} from './core/daily-notes-state.mjs';
import {paintAiReports,paintAiDailyReminders,paintAiCalendar,paintOpenAiDiary,reportDay,reportShownDay,paintAiReportTimeline,
  paintDecisionHistory,paintAiReportDayHead}
  from './pages/ai-reports.mjs';

let sequence = 0, registered = false, selectedDate = '', visibleMonth = '', pageSession = null;
// Reports read for the timeline, and the work day opened from it ('' shows the list).
let allReports = null, openReportDay = '';

function selectDailyTab(name) {
  if (!OPENAI_TABS.includes(name)) return;
  state.aiDailyTab = name;
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  root.dataset.aiTab = name; // The day calendar is for reminders; reports use the timeline.
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
    pageSession = session; allReports = null; openReportDay = '';
    selectedDate = validDailyNotesDate(state.aiDailyDate) ? state.aiDailyDate : dailyNotesToday();
    visibleMonth = selectedDate.slice(0,7);
  }
  if (!selectedDate) selectedDate = dailyNotesToday();
  if (!visibleMonth) visibleMonth = selectedDate.slice(0,7);
  const ticket = ++sequence, date = selectedDate;
  const current = () => ticket === sequence && session === runtime.sessionEpoch && state.page === 'ai-reports';
  if (!allReports) paintAiReportTimeline([], visibleMonth, {loading:true});
  paintAiDailyReminders(null, '', true);
  selectDailyTab(state.aiDailyTab || 'reports');
  const report = readAllAiReports(api, current).then(items => {
    if (current() && items) { allReports = items; paintReports(); }
  }).catch(error => {
    if (current()) paintAiReportTimeline([], visibleMonth, {error:error.message || '读取失败，请稍后重试。'});
  });
  const reminders = api('/work-reminders?date=' + encodeURIComponent(date)).then(data => {
    if (current()) paintAiDailyReminders(data);
  }).catch(error => {
    if (current()) paintAiDailyReminders(null, error.message || '提醒读取失败，请稍后重试');
  });
  void loadExperimentsPanel();
  await Promise.all([report, reminders]);
}

/** The seven days before the shown one, read only on request so opening the page stays one reminder read. */
async function loadDecisionHistory(button) {
  const base = selectedDate || dailyNotesToday(), session = runtime.sessionEpoch;
  const dates = Array.from({length: 7}, (_, index) => new Date(Date.parse(base + 'T00:00:00Z') - (index + 1) * 86400000).toISOString().slice(0, 10));
  button.hidden = true; paintDecisionHistory([], {loading: true});
  try {
    const days = await Promise.all(dates.map(date => api('/work-reminders?date=' + encodeURIComponent(date))
      .then(data => ({date, items: data.items || []}))));
    if (session === runtime.sessionEpoch) paintDecisionHistory(days);
  } catch (error) {
    if (session === runtime.sessionEpoch) { button.hidden = false; paintDecisionHistory([], {error: error.message || '读取失败，请稍后再试'}); }
  }
}
/** The timeline for the visible month, or the opened work day's reports in reading view. */
function paintReports() {
  if (!allReports) return;
  const root = document.querySelector('#ai-reports');
  root?.classList.toggle('ai-report-day-open', Boolean(openReportDay));
  if (!openReportDay) { paintAiReportDayHead(''); paintAiReportTimeline(allReports, visibleMonth); return; }
  paintAiReports(sortAiReports(allReports.filter(row => reportShownDay(row) === openReportDay)), '', false, selectedDate, visibleMonth);
  paintAiReportDayHead(openReportDay);
}
function moveMonth(offset) {
  const d = new Date(visibleMonth + '-01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + offset);
  if (!Number.isFinite(d.getTime())) return;
  const next = d.toISOString().slice(0, 7);
  if (validDailyNotesDate(next + '-01')) { visibleMonth = next; openReportDay = ''; paintAiCalendar(selectedDate, visibleMonth); paintReports(); }
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
    else if (event.target.closest?.('[data-ai-decision-history]')) void loadDecisionHistory(event.target.closest('[data-ai-decision-history]'));
    else if (event.target.closest?.('[data-ai-report-month]')) moveMonth(Number(event.target.closest('[data-ai-report-month]').dataset.aiReportMonth));
    else if (event.target.closest?.('[data-ai-report-open],[data-ai-report-back]')) {
      openReportDay = event.target.closest('[data-ai-report-open]')?.dataset.aiReportOpen || '';
      paintReports(); document.querySelector('#ai-report-dayhead')?.scrollIntoView?.({block:'nearest'});
    }
    else {
      const day = event.target.closest?.('[data-ai-report-select]')?.dataset.aiReportSelect;
      if (day && validDailyNotesDate(day)) { selectedDate = day; visibleMonth = day.slice(0,7);
        state.aiDailyDate = day; state.openAiRun = ''; updateRoute(); void loadAiReports(); }
    }
  });
}
