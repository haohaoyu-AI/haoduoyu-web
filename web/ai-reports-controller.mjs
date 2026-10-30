import {api} from './core/api.mjs';
import {runtime,state} from './core/state.mjs';
import {paintAiReports} from './pages/ai-reports.mjs';

let sequence = 0, registered = false, offset = 0, pageSession = null;
export async function loadAiReports() {
  registerAiReportEvents();
  const session = runtime.sessionEpoch;
  if (pageSession !== session) { pageSession = session; offset = 0; }
  const ticket = ++sequence, requestedOffset = offset;
  const current = () => ticket === sequence && session === runtime.sessionEpoch && state.page === 'ai-reports';
  paintAiReports([], '', true);
  try {
    const data = await api('/ai-reports?offset=' + requestedOffset);
    if (current()) paintAiReports(data.items || [], '', false, requestedOffset, data.has_more === true);
  } catch (error) {
    if (current()) paintAiReports([], error.message || '读取失败，请稍后重试。', false, requestedOffset);
  }
}
function registerAiReportEvents() {
  if (registered) return;
  registered = true;
  document.addEventListener('click', event => {
    if (state.page !== 'ai-reports') return;
    if (event.target.closest?.('[data-ai-report-prev]') && offset > 0) { offset -= 100; void loadAiReports(); }
    else if (event.target.closest?.('[data-ai-report-next]')) { offset += 100; void loadAiReports(); }
  });
}
