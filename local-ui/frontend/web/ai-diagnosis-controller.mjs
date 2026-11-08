import {state, runtime} from './core/state.mjs';
import {updateRoute} from './core/router.mjs';
import {apiNetwork} from './core/api.mjs';
import {dailyNotesToday, validDailyNotesDate} from './core/daily-notes-state.mjs';
import {readOpenAiRuns, openAiSessionAvailable} from './core/openai-review-state.mjs';
import {paintAiCalendar, paintOpenAiDiary} from './pages/ai-reports.mjs';
import {loadOpenAiReview, stopOpenAiReviewTimers} from './openai-review-controller.mjs';
let registered = false, sequence = 0, visibleMonth = '';
export function renderAiDiagnosis() {
  return `<section id="ai-diagnosis" aria-label="AI诊断">
    <div class="page-tabs segmented" role="group" aria-label="AI诊断模块">
      <button class="btn" type="button" data-diagnosis-tab="help">求助API</button>
      <button class="btn" type="button" data-diagnosis-tab="reports">诊断报告</button></div>
    <section data-diagnosis-panel="help"><div class="card panel" id="openai-review-panel"></div></section>
    <section data-diagnosis-panel="reports" hidden>
      <div class="ai-calendar-layout"><button class="btn ai-calendar-step" type="button" data-diagnosis-month="-1" aria-label="上个月">‹</button>
        <div class="ai-calendar-body"><h2 id="ai-report-date-title" aria-live="polite"></h2><div id="ai-report-calendar"></div></div>
        <button class="btn ai-calendar-step" type="button" data-diagnosis-month="1" aria-label="下个月">›</button></div>
      <p class="hint">按北京时间归档，同一天每次诊断分别保留。</p>
      <p id="openai-diary-status" role="status" aria-live="polite"></p><div id="openai-diary-list"></div>
      <button class="btn" type="button" data-diagnosis-refresh>刷新诊断报告</button>
    </section></section>`;
}
function selectTab() {
  const root = document.querySelector('#ai-diagnosis');
  if (!root) return;
  for (const node of root.querySelectorAll('[data-diagnosis-tab]')) node.setAttribute('aria-pressed', String(node.dataset.diagnosisTab === state.diagnosisTab));
  for (const node of root.querySelectorAll('[data-diagnosis-panel]')) node.hidden = node.dataset.diagnosisPanel !== state.diagnosisTab;
}
export async function loadAiDiagnosis() {
  register(); state.diagnosisTab ||= 'help'; selectTab();
  const ticket = ++sequence, epoch = runtime.sessionEpoch;
  if (state.diagnosisTab === 'help') { await loadOpenAiReview(); return; }
  stopOpenAiReviewTimers();
  const date = validDailyNotesDate(state.aiDailyDate) ? state.aiDailyDate : dailyNotesToday();
  state.aiDailyDate = date; visibleMonth = date.slice(0,7);
  paintAiCalendar(date, visibleMonth, '#ai-diagnosis');
  const current = () => ticket === sequence && epoch === runtime.sessionEpoch && state.page === 'ai-diagnosis' && state.diagnosisTab === 'reports';
  const owner = openAiSessionAvailable(state.me);
  paintOpenAiDiary([], {owner, loading: owner});
  if (!owner) return;
  try {
    const items = await readOpenAiRuns(path => apiNetwork(path, {suppressAuthRedirect:true}), date, current);
    if (!current() || !items) return;
    paintOpenAiDiary(items);
    if (state.openAiRun) document.getElementById('openai-run-' + state.openAiRun)?.focus();
  } catch (error) { if (current()) paintOpenAiDiary([], {error:error.message || '诊断报告读取失败，请刷新重试。'}); }
}
function register() {
  if (registered) return; registered = true;
  document.addEventListener('openai-run-settled', event => {
    if (event.detail?.sessionEpoch !== runtime.sessionEpoch || event.detail?.userId !== state.me?.id ||
        state.page !== 'ai-diagnosis' || state.diagnosisTab !== 'reports') return;
    void loadAiDiagnosis();
  });
  document.addEventListener('click', event => {
    if (state.page !== 'ai-diagnosis') return;
    const tab = event.target.closest?.('[data-diagnosis-tab]')?.dataset.diagnosisTab;
    if (['help','reports'].includes(tab)) { state.diagnosisTab = tab; updateRoute(true); void loadAiDiagnosis(); return; }
    if (event.target.closest?.('[data-diagnosis-refresh]')) { void loadAiDiagnosis(); return; }
    const month = event.target.closest?.('[data-diagnosis-month]');
    if (month) {
      const date = new Date(visibleMonth + '-01T00:00:00Z'); date.setUTCMonth(date.getUTCMonth() + Number(month.dataset.diagnosisMonth));
      const next = date.toISOString().slice(0,7);
      if (validDailyNotesDate(next+'-01')) {visibleMonth = next; paintAiCalendar(state.aiDailyDate, visibleMonth, '#ai-diagnosis');} return;
    }
    const date = event.target.closest?.('[data-ai-report-select]')?.dataset.aiReportSelect;
    if (validDailyNotesDate(date)) {state.aiDailyDate = date; state.openAiRun = ''; updateRoute(true); void loadAiDiagnosis();}
  });
}
