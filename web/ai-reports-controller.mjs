import {api} from './core/api.mjs';
import {runtime,state} from './core/state.mjs';
import {dailyNotesToday,validDailyNotesDate} from './core/daily-notes-state.mjs';
import {paintAiReports,reportDay} from './pages/ai-reports.mjs';

let sequence = 0, registered = false, selectedDate = '', pageSession = null;

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
  if (pageSession !== session || resetDate) { pageSession = session; selectedDate = aiReportsYesterday(); }
  if (!selectedDate || selectedDate > dailyNotesToday()) selectedDate = aiReportsYesterday();
  const ticket = ++sequence, date = selectedDate;
  const current = () => ticket === sequence && session === runtime.sessionEpoch && state.page === 'ai-reports';
  paintAiReports([], '', true, date);
  try {
    const items = await readAllAiReports(api, current);
    if (current() && items) paintAiReports(sortAiReports(items.filter(row => reportDay(row) === date)), '', false, date);
  } catch (error) {
    if (current()) paintAiReports([], error.message || '读取失败，请稍后重试。', false, date);
  }
}

function moveDate(days) {
  const d = new Date(selectedDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  const next = d.toISOString().slice(0, 10);
  if (validDailyNotesDate(next) && next <= dailyNotesToday()) { selectedDate = next; void loadAiReports(); }
}
function registerAiReportEvents() {
  if (registered) return;
  registered = true;
  document.addEventListener('click', event => {
    if (state.page !== 'ai-reports') return;
    if (event.target.closest?.('[data-ai-report-previous]')) moveDate(-1);
    else if (event.target.closest?.('[data-ai-report-next]')) moveDate(1);
    else if (event.target.closest?.('[data-ai-report-today]')) { selectedDate = dailyNotesToday(); void loadAiReports(); }
  });
  document.addEventListener('change', event => {
    if (state.page !== 'ai-reports' || event.target.id !== 'ai-report-date') return;
    const value = event.target.value;
    if (validDailyNotesDate(value) && value <= dailyNotesToday()) { selectedDate = value; void loadAiReports(); }
    else event.target.value = selectedDate;
  });
}
