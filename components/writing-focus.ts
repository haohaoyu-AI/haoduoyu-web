/** UI-only session focus. Never repairs, retries or changes a writing run. */
export type FocusRow = { pipeline_state?: string | null; stages?: { stage: string; state: string }[]; task_id?: string | null; article_id?: string | null; state?: string | null; editorial_phase?: string | null };
export type WritingFocus = { seen: string[]; current: Record<string, { phase: string; open: boolean }> };
export const writingFocusId = (row: FocusRow) => row.task_id || row.article_id || null;
export function focusPhase(row: FocusRow) {
  if (row.state === 'text_saved' || row.pipeline_state === 'text_saved') return 'text_saved';
  if (row.state === 'finalized' || row.state === 'final_saved') {
    if (row.pipeline_state === 'submitted') return 'finalized';
    if (row.pipeline_state === 'dispatching') return 'handoff_running';
    if (row.state === 'final_saved' || ['ready', 'needs_connection', 'failed'].includes(row.pipeline_state || '')) return 'handoff_pending';
    return 'handoff_unknown';
  }
  if (row.state === 'outline_pending' && row.stages?.some(stage => stage.stage === 'outline' && stage.state === 'requested')) return 'outline_generating';
  if (row.state === 'approved' && row.stages?.some(stage => stage.stage === 'body' && stage.state === 'requested')) return 'body_generating';
  return row.state === 'review_pending' && row.editorial_phase ? row.editorial_phase : row.state || '';
}
export const isWritingTerminal = (phase: string) => ['text_saved', 'submitted', 'finalized', 'failed', 'revise', 'blocked'].includes(phase) || phase.endsWith('_failed');

export function reconcileWritingFocus(previous: WritingFocus | null, rows: FocusRow[], startedIds: string[] = []): WritingFocus {
  const ids = rows.flatMap(row => writingFocusId(row) ? [writingFocusId(row)!] : []);
  // The first successful read is history, including stale writing/failed records.
  if (!previous) previous = { seen: ids, current: {} };
  const current = { ...previous.current };
  for (const row of rows) {
    const id = writingFocusId(row);
    if (!id) continue;
    const phase = focusPhase(row);
    const before = current[id];
    if (startedIds.includes(id) && !before) {
      current[id] = { phase, open: !isWritingTerminal(phase) };
    } else if (before) {
      // Collapse only on this run's transition to a terminal state, not on polls.
      const changed = before.phase !== phase;
      current[id] = { phase, open: changed && isWritingTerminal(phase) ? false : changed && isWritingTerminal(before.phase) ? true : before.open };
    } else if (!previous.seen.includes(id) && !isWritingTerminal(phase)) {
      current[id] = { phase, open: true };
    }
  }
  const newActivity = ids.some(id => current[id] && !previous.current[id] && !isWritingTerminal(current[id].phase));
  if (newActivity) {
    for (const id of Object.keys(previous.current)) {
      if (current[id] && isWritingTerminal(current[id].phase) && !current[id].open) delete current[id];
    }
  }
  // Retain focus for visible rows only; disappearance is never reported as success.
  for (const id of Object.keys(current)) if (!ids.includes(id)) delete current[id];
  return { seen: [...new Set([...previous.seen, ...ids])].slice(-200), current };
}

const storageKey = 'writing-studio-focus-v1';
export function readWritingFocus(storage: Storage, now = Date.now()): WritingFocus | null {
  try {
    const saved = JSON.parse(storage.getItem(storageKey) || 'null');
    if (!saved || now - saved.at > 6 * 60 * 60 * 1000 || saved.at > now || !Number.isFinite(saved.at)) return null;
    const value = saved.value;
    if (!value || !Array.isArray(value.seen) || !value.seen.every((id: unknown) => typeof id === 'string') || !value.current || typeof value.current !== 'object' || Array.isArray(value.current)) return null;
    if (!Object.values(value.current).every(item => !!item && typeof item === 'object' && 'phase' in item && typeof item.phase === 'string' && 'open' in item && typeof item.open === 'boolean')) return null;
    return value;
  } catch { return null; }
}
export function saveWritingFocus(storage: Storage, value: WritingFocus | null) {
  try {
    if (value) storage.setItem(storageKey, JSON.stringify({ at: Date.now(), value }));
    else storage.removeItem(storageKey);
  } catch { /* Disabled browser storage must not block reading or navigation. */ }
}
