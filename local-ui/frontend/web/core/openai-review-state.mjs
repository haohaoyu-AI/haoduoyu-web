export const OPENAI_TABS = Object.freeze(['reminders', 'reports']);
// /auth/me supplies either the existing public-business identity or a signed-in session.
// The server remains authoritative for the configured access mode and permissions.
export const openAiSessionAvailable = me => Boolean(me?.id);
export const openAiRunActive = run => ['running'].includes(run?.status);
export const openAiRunFinished = run => ['succeeded', 'failed'].includes(run?.status) || Boolean(run?.released_at);
export function openAiPendingRunSettled(previous, next) {
  const run = next.run;
  return Boolean(previous.pendingId && run?.id === previous.pendingId &&
    ['succeeded', 'failed', 'cancelled', 'uncertain'].includes(run.status) &&
    (previous.run?.id !== run.id || previous.run?.status !== run.status));
}
export function openAiRunDay(run) {
  const date = new Date(run?.created_at);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function openAiDiaryLink(run) {
  const query = new URLSearchParams({page: 'ai-diagnosis', diagnosis_tab: 'reports', date: openAiRunDay(run)});
  if (run?.id) query.set('openai_run', run.id);
  return '?' + query;
}
export function openAiRunsForDate(items, date) {
  return items.filter(run => openAiRunDay(run) === date).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)));
}
export async function readOpenAiRuns(read, date = '', current = () => true) {
  const items = [], seen = new Set();
  for (let offset = 0; ;) {
    const query = new URLSearchParams({offset: String(offset)});
    if (date) query.set('date', date);
    const page = await read('/openai-review/runs?' + query);
    if (!current()) return null;
    if (!Array.isArray(page?.items) || typeof page.has_more !== 'boolean' || page.has_more && !page.items.length)
      throw new Error('分析记录读取不完整，请重新读取。');
    for (const row of page.items) {
      if (!row.id || seen.has(row.id)) throw new Error('分析记录在读取时发生变化，请重新读取。');
      seen.add(row.id); items.push(row);
    }
    if (!page.has_more) return date ? openAiRunsForDate(items, date) : items;
    offset += page.items.length;
  }
}
export function openAiDraft(saved, retained = null) {
  const text = typeof retained?.text === 'string' ? retained.text : saved.instructions;
  const dirty = text !== saved.instructions;
  return {saved, text, dirty, baseVersion: retained?.version ?? saved.version,
    conflict: dirty && retained?.version !== saved.version, saving: false, error: '', message: ''};
}
export function editOpenAiDraft(draft, text) {
  return {...draft, text, dirty: text !== draft.saved.instructions, message: ''};
}
export async function saveOpenAiDraft(draft, request) {
  if (draft.saving || draft.conflict || !draft.dirty) return draft;
  const result = {...draft, saving: false, message: '', error: ''};
  try {
    const saved = await request('/openai-review/config', {
      method: 'PATCH', body: {instructions: draft.text, version: draft.saved.version}
    });
    return {...openAiDraft(saved), message: '已保存。下次分析使用这份指令。'};
  } catch (error) {
    return {...result, conflict: error.status === 409, error: error.status === 409 ?
      '指令已在别处更新。你的修改已保留，请读取最新版本并比较后再保存。' : error.message || '保存失败，修改已保留。'};
  }
}
