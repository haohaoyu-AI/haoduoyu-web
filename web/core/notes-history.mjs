import {validDailyNotesDate} from './daily-notes-state.mjs';

// Load both stores completely: failures must not masquerade as an empty day.
export async function loadNoteDay(request, date) {
  if (!validDailyNotesDate(date)) throw new Error('请选择有效日期。');
  const paths = ['life', 'work'].flatMap(category => [
    '/note-entries?category=' + category + '&date=' + date,
    '/daily-notes?date=' + date + '&category=' + category
  ]);
  const [lifeEntries, lifeLegacy, workEntries, workLegacy] = await Promise.all(paths.map(path => request(path)));
  return aggregateNoteDay(date, {lifeEntries, lifeLegacy, workEntries, workLegacy});
}

export function aggregateNoteDay(date, {lifeEntries, lifeLegacy, workEntries, workLegacy}) {
  if (!validDailyNotesDate(date)) throw new Error('请选择有效日期。');
  const result = [], ids = new Set();
  for (const [category, collection, legacy] of [['life', lifeEntries, lifeLegacy], ['work', workEntries, workLegacy]]) {
    if (!collection || collection.date !== date || collection.category !== category || !Array.isArray(collection.entries) ||
        collection.entries.length > 200 || !legacy || legacy.date !== date || !Number.isSafeInteger(legacy.version) ||
        typeof legacy.text !== 'string' || typeof legacy.deleted !== 'boolean') throw new Error('碎碎念读取不完整，请重试。');
    for (const entry of collection.entries) {
      if (!entry || typeof entry.id !== 'string' || !entry.id || entry.category !== category || entry.date !== date ||
          typeof entry.text !== 'string' || entry.deleted !== false || ids.has(entry.id) ||
          entry.label !== undefined && (category !== 'life' || typeof entry.label !== 'string' || !entry.label))
        throw new Error('碎碎念读取不完整，请重试。');
      ids.add(entry.id);
      result.push({key: 'note-entry:' + entry.id, kind: 'entry', category, label: entry.label || (category === 'work' ? '工作' : '生活'),
        date, time: entry.updated_at || null, entry});
    }
    if (legacy.version > 0 && !legacy.deleted && legacy.text) result.push({key: 'legacy-' + category + ':' + date,
      kind: 'legacy', category, label: category === 'work' ? '工作' : '生活', date,
      time: legacy.updated_at || null, entry: legacy});
  }
  // Stable keys distinguish identical text; absent legacy timestamps remain absent.
  result.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')) || a.key.localeCompare(b.key));
  return result;
}

export function filterNoteDay(rows, label = '') {
  return label ? rows.filter(row => row.label === label) : [...rows];
}

// Independent cursors avoid dropping dates that occur only in one store.
export async function loadNoteHistoryDates(request, {maxPagesPerSource = 20} = {}) {
  if (!Number.isInteger(maxPagesPerSource) || maxPagesPerSource < 1) throw new Error('日期读取范围无效。');
  const sources = ['note-entries', 'daily-notes'].flatMap(type => ['life', 'work'].map(category => ({type, category})));
  const pages = await Promise.all(sources.map(async ({type, category}) => {
    const dates = []; let before = null;
    for (let page = 0; page < maxPagesPerSource; page++) {
      const path = '/' + type + '/dates?category=' + category + '&page_size=100' + (before ? '&before=' + before : '');
      const result = await request(path);
      if (!result || !Array.isArray(result.dates) || result.dates.length > 100 || typeof result.has_more !== 'boolean' ||
          result.dates.some((date, i) => !validDailyNotesDate(date) || before && date >= before || i && date >= result.dates[i - 1]) ||
          result.has_more && (!result.dates.length || result.next_before !== result.dates.at(-1)) ||
          !result.has_more && result.next_before !== null) throw new Error('日期列表不完整，请重试。');
      dates.push(...result.dates);
      if (!result.has_more) return dates;
      before = result.next_before;
    }
    throw new Error('历史日期过多，无法完整读取，请缩小范围。');
  }));
  return [...new Set(pages.flat())].sort().reverse();
}
