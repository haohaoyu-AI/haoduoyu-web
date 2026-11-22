import {loadExperimentsPanel} from './experiments-panel-controller.mjs';
import {updateRoute} from './core/router.mjs';
import {api, apiNetwork} from './core/api.mjs';
import {runtime,state} from './core/state.mjs';
import {dailyNotesToday,validDailyNotesDate} from './core/daily-notes-state.mjs';
import {renderWeeklyReview} from './pages/review-weekly.mjs';
import {paintAiReports,paintAiDailyReminders,paintAiCalendar,reportDay,reportShownDay,paintAiReportTimeline,
  paintDecisionHistory,paintAiReportDayHead}
  from './pages/ai-reports.mjs';

const AI_DAILY_TABS = Object.freeze(['reports', 'weekly']);
let sequence = 0, registered = false, selectedDate = '', visibleMonth = '', pageSession = null;
// Reports read for the timeline, and the work day opened from it ('' shows the list).
let allReports = null, openReportDay = '';

function selectDailyTab(name) {
  if (name === 'reminders') name = 'reports'; // 待拍板 is no longer a tab; it sits on top of the page.
  if (!AI_DAILY_TABS.includes(name)) return;
  state.aiDailyTab = name;
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  root.dataset.aiTab = name; // The day calendar is for reminders; reports use the timeline.
  for (const button of root.querySelectorAll('[data-ai-daily-tab]'))
    button.setAttribute('aria-pressed', String(button.dataset.aiDailyTab === name));
  for (const panel of root.querySelectorAll('[data-ai-daily-panel]'))
    panel.hidden = panel.dataset.aiDailyPanel !== name;
  if (name === 'weekly') void loadWeekly();
}

// 周报: the weekly reviews Grok writes into 内容复盘, read the same way and shown newest first.
let weeklyRead = null;
async function readAllReviewReports(current) {
  const items = [];
  for (let offset = 0; ; offset += 100) {
    const data = await api('/review/reports?offset=' + offset);
    if (!current()) return null;
    if (!Array.isArray(data?.items) || typeof data.has_more !== 'boolean') throw new Error('周报读取不完整，请稍后重试。');
    items.push(...data.items);
    if (!data.has_more || !data.items.length) return items;
  }
}
async function loadWeekly() {
  const root = document.querySelector('#ai-reports');
  const box = root?.querySelector('#ai-weekly-list'), status = root?.querySelector('#ai-weekly-status');
  if (!box || weeklyRead?.session === runtime.sessionEpoch && weeklyRead.loaded) return;
  const session = runtime.sessionEpoch, current = () => session === runtime.sessionEpoch && state.page === 'ai-reports';
  weeklyRead = {session, loaded:false};
  status.textContent = '正在读取周报…';
  try {
    const reports = await readAllReviewReports(current);
    if (!reports || !current()) return;
    const html = renderWeeklyReview({reports}, {account: state.account || 'V字', now: new Date().toISOString()});
    const live = document.querySelector('#ai-reports #ai-weekly-list');
    if (!live) return;
    live.innerHTML = html;
    document.querySelector('#ai-reports #ai-weekly-status').textContent = html ? '' : '还没有周报，小小鱼每周日写。';
    weeklyRead.loaded = true;
  } catch (error) {
    weeklyRead = null;
    if (current()) document.querySelector('#ai-reports #ai-weekly-status').textContent = error.message || '周报读取失败，请稍后重试。';
  }
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
    pageSession = session; allReports = null; openReportDay = ''; weeklyRead = null;
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
  // The 看前 7 天 line is a fold now: read once when it is opened, and keep the line so it can close again.
  if (button.dataset.loaded === '1' || button.closest('details')?.open) return;
  button.dataset.loaded = '1'; paintDecisionHistory([], {loading: true});
  try {
    const days = await Promise.all(dates.map(date => api('/work-reminders?date=' + encodeURIComponent(date))
      .then(data => ({date, items: data.items || []}))));
    if (session === runtime.sessionEpoch) paintDecisionHistory(days);
  } catch (error) {
    if (session === runtime.sessionEpoch) { delete button.dataset.loaded; paintDecisionHistory([], {error: error.message || '读取失败，请稍后再试'}); }
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
        state.aiDailyDate = day; updateRoute(); void loadAiReports(); }
    }
  });
}
