import {validDailyNotesDate} from './daily-notes-state.mjs';
import {validCustomNoteLabel} from './note-entries-state.mjs';

export function validNoteMonth(month) {
  return typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) && validDailyNotesDate(month + '-01');
}
export function shiftNoteMonth(month, delta) {
  if (!validNoteMonth(month) || !Number.isInteger(delta)) throw new Error('请选择有效月份。');
  const date = new Date(month + '-01T12:00:00Z'); date.setUTCMonth(date.getUTCMonth() + delta);
  const value = date.toISOString().slice(0, 7);
  if (!validNoteMonth(value)) throw new Error('请选择有效月份。');
  return value;
}
export function noteMonthWeeks(month) {
  if (!validNoteMonth(month)) throw new Error('请选择有效月份。');
  const first = new Date(month + '-01T12:00:00Z'), offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  const weeks = Array.from({length:Math.ceil((offset + last.getUTCDate()) / 7)}, () => Array(7).fill(null));
  for (let day = 1; day <= last.getUTCDate(); day++)
    weeks[Math.floor((offset + day - 1) / 7)][(offset + day - 1) % 7] = month + '-' + String(day).padStart(2, '0');
  return weeks;
}
export function checkedNoteMonth(data, month) {
  const fail = () => { throw new Error('月记录不完整，请联网重试。'); };
  if (!validNoteMonth(month) || !data || data.month !== month || data.complete !== true || data.labels_version !== 1 ||
      !Array.isArray(data.days) || data.days.length > 31) fail();
  const result = new Map(), ids = new Set(); let total = 0;
  for (const day of data.days) {
    if (!day || !validDailyNotesDate(day.date) || !day.date.startsWith(month + '-') || result.has(day.date) ||
        !Array.isArray(day.items)) fail();
    const items = day.items.map(item => {
      if (!item || typeof item.entity_id !== 'string' || ids.has(item.entity_id) ||
          !['note_entry', 'legacy_daily_note'].includes(item.source) || !['life','work'].includes(item.category) ||
          !Object.hasOwn(item, 'label') || item.label !== null && (item.category !== 'life' || !validCustomNoteLabel(item.label)) ||
          typeof item.text !== 'string' || !item.text || !Object.hasOwn(item, 'created_at') ||
          item.created_at !== null && !Number.isFinite(Date.parse(item.created_at)) ||
          item.source === 'legacy_daily_note' && item.created_at !== null ||
          !Number.isFinite(Date.parse(item.updated_at))) fail();
      ids.add(item.entity_id); total++; return {...item, displayLabel:item.label || (item.category === 'work' ? '工作' : '生活')};
    });
    result.set(day.date, items);
  }
  if (total > 2000) fail();
  return result;
}
