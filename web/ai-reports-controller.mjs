import {api} from './core/api.mjs';
import {runtime,state} from './core/state.mjs';
import {paintAiReports} from './pages/ai-reports.mjs';

let sequence = 0, registered = false, pending = null, offset = 0, pageSession = null;
export async function loadAiReports() {
  registerAiReportEvents();
  const session = runtime.sessionEpoch;
  if (pageSession !== session) { pageSession = session; offset = 0; pending = null; }
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
  document.addEventListener('input', event => {
    if (event.target.closest?.('#ai-report-form') && pending && !pending.sending) pending = null;
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'ai-report-form' || state.page !== 'ai-reports') return;
    event.preventDefault();
    const form = event.target, author = form.elements.author.value.trim(), content = form.elements.content.value.trim();
    const message = form.querySelector('#ai-report-message'), button = form.querySelector('button[type="submit"]');
    if (!author || !content) { message.hidden = false; message.textContent = '请填写署名和实际工作。'; return; }
    if (pending?.sending) return;
    if (!pending || pending.session !== runtime.sessionEpoch || pending.author !== author || pending.content !== content)
      pending = {id:crypto.randomUUID(),author,content,session:runtime.sessionEpoch};
    const submission = pending, session = runtime.sessionEpoch;
    submission.sending = true; button.disabled = true; form.elements.author.disabled = true;
    form.elements.content.disabled = true; message.hidden = true;
    try {
      await api('/ai-reports/' + submission.id, {method:'PUT',body:{author,content}});
      pending = null;
      if (form.isConnected && session === runtime.sessionEpoch && state.page === 'ai-reports') {
        form.elements.content.value = '';
        offset = 0; await loadAiReports();
      }
    } catch (error) {
      if (form.isConnected && session === runtime.sessionEpoch && state.page === 'ai-reports') {
        message.textContent = error.message || '提交失败，请重试。'; message.hidden = false;
      }
    } finally {
      submission.sending = false;
      if (form.isConnected) { button.disabled = false; form.elements.author.disabled = false; form.elements.content.disabled = false; }
    }
  });
}
