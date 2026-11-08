import {exact, idOf, versionOf, dateOf, bodyText, plain, currentVersion, queryOnly, fail, invalid, unsupported, digest, byCreated} from './common.mjs';
const categoryOf = (value = 'life') => { if (!['life', 'work'].includes(value)) throw invalid('碎碎念分类无效。'); return value; };
const builtins = ['生活', '工作'];
function labelOf(value, allowBuiltins = true) {
  if (!plain(value)) throw invalid('标签无效。');
  const label = value.trim().normalize('NFC');
  if (!label || [...label].length > 32 || /[\u0000-\u001f\u007f]/.test(label) || !allowBuiltins && builtins.includes(label)) throw invalid('标签须为 1–32 字。');
  return label;
}
function protocolFor(headers) {
  const value = typeof headers.get === 'function' ? headers.get('X-Note-Labels-Version') : Object.entries(headers).find(([key]) => key.toLowerCase() === 'x-note-labels-version')?.[1];
  if (value !== undefined && value !== null && !['1', '2', '3'].includes(String(value))) throw invalid('标签版本无效。');
  return Number(value || 3);
}
function view(row, protocol) {
  const {labels, ...rest} = row;
  const legacy = row.category === 'life' ? labels.filter(label => !builtins.includes(label)) : [];
  return {...rest, deleted: Boolean(row.deleted_at), can_edit: true, labels_version: protocol,
    ...(protocol === 1 ? {label: legacy[0] || null} : {labels: protocol === 3 ? labels : legacy})};
}
function dateList(c, kind, q) {
  queryOnly(q, ['category', 'before', 'page_size']);
  const category = categoryOf(q.get('category') ?? undefined), before = q.has('before') ? dateOf(q.get('before')) : null;
  const size = q.get('page_size') || '30';
  if (!/^[1-9]\d*$/.test(size) || Number(size) > 100) throw invalid('日期列表每页最多 100 项。');
  const dates = [...new Set(c.list(kind).filter(row => row.category === category && !row.deleted_at && (!before || row.date < before)).map(row => row.date))].sort().reverse();
  const page = dates.slice(0, Number(size)), has_more = dates.length > Number(size);
  return {dates: page, has_more, next_before: has_more ? page.at(-1) : null};
}
async function ensureLabels(c, labels, previous = []) {
  const existing = c.list('label').filter(row => !builtins.includes(row.name));
  const missing = labels.filter(name => !builtins.includes(name) && !c.get('label', name));
  if (existing.length + missing.length > 200) throw fail(409, 'NOTES_LIMIT', '自建标签已达 200 个上限。');
  for (const name of labels) {
    const current = c.get('label', name);
    if (current?.deleted_at || current?.archived_at && !previous.includes(name)) throw fail(409, 'LABEL_UNAVAILABLE', '标签已删除或归档，请重新核对。');
  }
  for (const name of missing) await c.put('label', name, {name, created_at: c.stamp, archived_at: null, deleted_at: null, version: 1});
}
async function labelsRoute(c, protocol) {
  queryOnly(c.url.searchParams);
  if (c.method === 'GET') {
    const rows = c.list('label');
    return {labels_version: protocol,
      labels: rows.filter(row => !builtins.includes(row.name) && !row.deleted_at).map(({name, created_at}) => ({name, created_at})),
      archived_labels: rows.filter(row => row.archived_at || row.deleted_at).map(row => ({name: row.name, archived_at: row.archived_at || row.deleted_at}))};
  }
  if (c.method !== 'POST') throw unsupported();
  const b = c.body, action = b.action || 'create';
  if (!['create', 'archive', 'restore', 'delete'].includes(action)) throw invalid();
  exact(b, ['name', 'save_id', ...(Object.hasOwn(b, 'action') ? ['action'] : [])]);
  const name = labelOf(b.name, action !== 'create'), saveId = idOf(b.save_id);
  const result = await c.commit('note-label', saveId, {path: c.path, ...b}, async () => {
    let row = c.get('label', name), response;
    if (action === 'create') {
      if (row?.deleted_at || row?.archived_at) throw fail(409, 'LABEL_UNAVAILABLE', '标签名称已被保留，请先恢复。');
      await ensureLabels(c, [name]); row = c.get('label', name);
      response = {name, created_at: row.created_at};
    } else {
      if (!row && !builtins.includes(name)) throw fail(404, 'NOT_FOUND', '标签不存在。');
      row ||= {name, created_at: c.stamp, archived_at: null, deleted_at: null, version: 0};
      if (action === 'delete' && (row.deleted_at || row.archived_at)) throw fail(409, 'LABEL_UNAVAILABLE', '标签已被移除或归档。');
      const old = {...row};
      row = {...row, version: row.version + 1, archived_at: action === 'restore' ? null : c.stamp,
        deleted_at: action === 'delete' ? c.stamp : action === 'restore' ? null : row.deleted_at};
      await c.put('history', 'label:' + name + ':' + old.version, {kind: 'label', ...old});
      await c.put('label', name, row);
      // Soft deletion only: retain previous label associations in immutable local history.
      if (action === 'delete' && !builtins.includes(name)) {
        for (const note of c.list('note_entry').filter(note => note.labels.includes(name))) {
          await c.history('note_entry', note);
          const value = {...note, labels: note.labels.filter(label => label !== name), version: note.version + 1, change_seq: await c.revision()};
          delete value.content_hash; value.content_hash = await digest(value);
          await c.put('note_entry', note.id, value);
        }
      }
      response = action === 'delete' ? {name, deleted: true, mode: builtins.includes(name) ? 'builtin-hidden' : 'deleted'} : {name, archived_at: row.archived_at};
    }
    return {response, receipt: {name, action}};
  });
  return {...result, labels_version: protocol};
}
async function monthRoute(c, protocol) {
  if (c.method !== 'GET') throw unsupported();
  const q = c.url.searchParams; queryOnly(q, ['month']); const month = q.get('month');
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw invalid('月份无效。');
  const rows = c.list('note_entry').filter(row => row.date.startsWith(month + '-') && !row.deleted_at), days = new Map();
  if (rows.length > 2000) throw fail(413, 'NOTES_MONTH_LIMIT', '该月记录超过完整读取上限。');
  for (const row of rows.sort(byCreated)) {
    if (!days.has(row.date)) days.set(row.date, []);
    const displayed = view(row, protocol);
    days.get(row.date).push({entity_id: 'note-entry:' + row.id, source: 'note_entry', category: row.category, text: row.text,
      created_at: row.created_at, updated_at: row.updated_at, ...(protocol === 1 ? {label: displayed.label} : {labels: displayed.labels})});
  }
  const result = {format: 'haoduoyu-note-month-v1', month, complete: true, labels_version: protocol,
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({date, items}))};
  if (new TextEncoder().encode(JSON.stringify(result)).length > 1048576) throw fail(413, 'NOTES_MONTH_LIMIT', '该月正文超过完整读取上限。');
  return result;
}

export async function notesRoute(c, headers) {
  const {path, method, body: b, url} = c, q = url.searchParams, protocol = protocolFor(headers);
  if (path === '/note-entries/labels') return labelsRoute(c, protocol);
  if (path === '/note-entries/month') return monthRoute(c, protocol);
  if (method === 'GET' && ['/note-entries/dates', '/daily-notes/dates'].includes(path)) return dateList(c, path.startsWith('/daily') ? 'legacy_note' : 'note_entry', q);
  if (method === 'GET' && ['/note-entries', '/daily-notes'].includes(path)) {
    queryOnly(q, ['date', 'category']); const date = q.has('date') ? dateOf(q.get('date')) : c.today, category = categoryOf(q.get('category') ?? undefined);
    if (path === '/daily-notes') {
      const row = c.get('legacy_note', category + ':' + date);
      return row ? {date, text: row.deleted_at ? '' : row.text, version: row.version, updated_at: row.updated_at, deleted: Boolean(row.deleted_at), can_edit: false} :
        {date, text: '', version: 0, updated_at: null, deleted: false, can_edit: false};
    }
    const rows = c.list('note_entry').filter(row => row.date === date && row.category === category && !row.deleted_at).sort(byCreated);
    if (rows.length > 200) throw fail(413, 'NOTES_LIMIT', '该日记录超过完整读取上限。');
    return {date, category, labels_version: protocol, entries: rows.map(row => view(row, protocol)), can_edit: true};
  }
  const operation = /^\/note-entries\/operations\/([^/]+)$/.exec(path);
  if (method === 'GET' && operation) {
    queryOnly(q); const receipt = await c.receipt('note-entry', idOf(operation[1]));
    if (!receipt) return {found: false, labels_version: protocol};
    const row = c.get('note_entry', receipt.id);
    if (!row) throw fail(503, 'LOCAL_RECEIPT_INVALID', '本机保存收据对应记录缺失。');
    const shown = view(row, protocol);
    return {found: true, ...receipt, labels_version: protocol, ...(protocol === 1 ? {label: shown.label} : {labels: shown.labels})};
  }
  const match = /^\/note-entries\/([^/]+)(\/restore)?$/.exec(path);
  if (!match) throw unsupported();
  const id = idOf(match[1]), restore = Boolean(match[2]), row = c.get('note_entry', id);
  if (method === 'GET' && !restore) {
    queryOnly(q); if (!row) throw fail(404, 'NOT_FOUND', '本机碎碎念不存在。'); return view(row, protocol);
  }
  if (!['PUT', 'DELETE', 'POST'].includes(method) || restore !== (method === 'POST')) throw unsupported();
  exact(b, method === 'PUT' ? ['version', 'save_id', 'category', 'date', 'text', ...(Object.hasOwn(b, 'labels') ? ['labels'] : []), ...(Object.hasOwn(b, 'label') ? ['label'] : [])] : ['version', 'save_id']);
  versionOf(b.version, method === 'PUT' ? 0 : 1); const saveId = idOf(b.save_id);
  let labels, text, category, date;
  if (method === 'PUT') {
    category = categoryOf(b.category); date = dateOf(b.date); text = bodyText(b.text);
    if (Object.hasOwn(b, 'labels') && Object.hasOwn(b, 'label')) throw invalid();
    if (Object.hasOwn(b, 'labels')) {
      if (!Array.isArray(b.labels) || b.labels.length > (protocol === 3 ? 202 : 200)) throw invalid();
      labels = b.labels.map(label => labelOf(label, protocol === 3)).sort();
      if (new Set(labels).size !== labels.length || protocol !== 3 && category !== 'life' && labels.length) throw invalid();
    } else if (Object.hasOwn(b, 'label')) {
      if (category !== 'life') throw invalid(); labels = [labelOf(b.label, false)];
    } else labels = row?.labels || [category === 'work' ? '工作' : '生活'];
    // Legacy clients cannot erase built-in associations that they cannot see.
    if (protocol !== 3) labels = [...new Set([...(row?.labels || [category === 'work' ? '工作' : '生活']).filter(label => builtins.includes(label)), ...labels])].sort();
  }
  const result = await c.commit('note-entry', saveId, {method, path, ...b}, async () => {
    currentVersion(row, b.version, {allowMissing: method === 'PUT', allowDeleted: method !== 'PUT'});
    if (method === 'PUT' && row && (row.category !== category || row.date !== date)) throw invalid('已有记录的日期与分类不可更改。');
    if (restore && !row.deleted_at || method === 'DELETE' && row.deleted_at) throw fail(409, 'VERSION_CONFLICT', '删除状态已变化。');
    if (method === 'PUT' && !row && date !== c.today) throw fail(400, 'NOTES_TODAY_ONLY', '只能新增北京时间当天的碎碎念。');
    if (method === 'PUT' && !row || restore) {
      if (c.list('note_entry').filter(note => note.category === (row?.category || category) && note.date === (row?.date || date) && !note.deleted_at).length >= 200)
        throw fail(409, 'NOTES_LIMIT', '该日碎碎念已达 200 条。');
    }
    if (method === 'PUT') await ensureLabels(c, labels, row?.labels || []);
    const value = {id, category: row?.category || category, date: row?.date || date, text: method === 'PUT' ? text : row.text,
      labels: method === 'PUT' ? labels : row.labels, version: b.version + 1, change_seq: await c.revision(),
      created_at: row?.created_at || c.stamp, updated_at: c.stamp, deleted_at: method === 'DELETE' ? c.stamp : null};
    value.content_hash = await digest(value);
    await c.history('note_entry', row); await c.put('note_entry', id, value);
    const receipt = {id, version: value.version, deleted_at: value.deleted_at, change_seq: value.change_seq, content_hash: value.content_hash};
    return {response: value, checks: [{kind: 'note_entry', id, version: value.version}], receipt};
  });
  return view(result, protocol);
}
