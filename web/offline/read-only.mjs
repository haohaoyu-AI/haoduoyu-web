const day = value => typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const missing = () => Object.assign(new Error('此内容尚未完整缓存在本机，请联网读取。'), {code: 'OFFLINE_CACHE_MISS'});
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const legacyNames = ['snapshot', 'snapshot-v2', 'snapshot-progress', 'snapshot-v2-progress'];
const valid = (row, scope) => row?.value?.index?.complete === true && row.value.index.scope_id === scope;
const latest = rows => rows.sort((a,b)=>(b.value.verified_at||0)-(a.value.verified_at||0))[0]||null;
async function snapshotEvidence(tx, scope) {
  const rows = new Map();
  for (const row of await tx.getAll('meta')) {
    let key; try { key = JSON.parse(row.key); } catch { continue; }
    if (!Array.isArray(key) || key.length !== 2 || key[0] !== scope || typeof key[1] !== 'string') continue;
    if (legacyNames.includes(key[1]) || legacyNames.some(name => key[1] === name + '-archive') ||
        key[1] === 'snapshot-v2-window' || key[1].startsWith('snapshot-v2-date:')) rows.set(key[1], row);
  }
  return rows;
}
function windowProof(name, row, scope) {
  const value = row?.value, coverage = value?.coverage;
  if (!valid(row,scope) || value.partial !== true || !Array.isArray(value.index.entities) ||
      value.index.snapshot_format !== 'haoduoyu-workbench-snapshot-v2' || value.index.projection !== 'current' ||
      value.index.timezone !== 'Asia/Shanghai' || !hash(value.index.manifest_hash) || !hash(value.index.global_content_hash) ||
      !Number.isFinite(value.verified_at) || value.verified_at < 0 || !coverage ||
      Object.keys(coverage).sort().join(',') !== 'from,to' || !day(coverage.from) || !day(coverage.to) ||
      coverage.from > coverage.to) return false;
  if (name === 'snapshot-v2-window')
    return (Date.parse(coverage.to)-Date.parse(coverage.from))/86400000 < 60;
  return name === 'snapshot-v2-date:' + coverage.from && coverage.from === coverage.to;
}
function limitedProof(row, date) {
  return {...row,value:{...row.value,partial:true,limited:true,
    ...(row.value.coverage?{}:{coverage:{from:date,to:date}})}};
}
function legacyProof(rows, scope, date) {
  const complete = latest(legacyNames.slice(0,2).map(name=>rows.get(name)).filter(row=>valid(row,scope)));
  const partial = latest(legacyNames.slice(2).map(name=>rows.get(name)).filter(row=>valid(row,scope)&&row.value.partial===true));
  if (partial && (partial.value.verified_at||0)>=(complete?.value?.verified_at||0))
    return date && partial.value.covered_dates?.includes(date) ? partial : null;
  return complete;
}
// Both snapshot versions contain the common note and reminder projection. Only
// use complete metadata belonging to this scope; prefer the newest evidence.
export async function latestCompleteSnapshot(tx, scope, date) {
  const rows = await snapshotEvidence(tx,scope);
  const limited = [...rows.keys()].some(name=>!legacyNames.includes(name));
  if (!limited) return legacyProof(rows,scope,date);
  if (!day(date)) return null;
  const candidates = [];
  for (const [name,row] of rows) {
    if (windowProof(name,row,scope)) {
      if (date>=row.value.coverage.from && date<=row.value.coverage.to) candidates.push(limitedProof(row,date));
    } else if ((legacyNames.includes(name) || name.endsWith('-archive')) && valid(row,scope) &&
        Array.isArray(row.value.index.entities) && Number.isFinite(row.value.verified_at) &&
        hash(row.value.index.manifest_hash) && hash(row.value.index.global_content_hash) &&
        (!name.includes('progress')&&row.value.partial!==true || row.value.covered_dates?.includes(date)))
      candidates.push(limitedProof(row,date));
  }
  return latest(candidates);
}
// A window includes every undated entity. This proof is deliberately separate
// from date/history completeness and cannot certify a historical date list.
export async function latestGlobalSnapshot(tx, scope) {
  const rows = await snapshotEvidence(tx,scope);
  const candidates = [...rows].filter(([name,row])=>windowProof(name,row,scope)&&hash(row.value.index.global_content_hash))
    .map(([,row])=>({...row,value:{...row.value,partial:true,limited:true,global_complete:true}}));
  if (candidates.length) return latest(candidates);
  const full = [...rows.keys()].every(name=>legacyNames.includes(name)) ? legacyProof(rows,scope) : null;
  return full?.value?.index?.snapshot_format==='haoduoyu-workbench-snapshot-v2' &&
    Array.isArray(full.value.index.entities) && hash(full.value.index.global_content_hash) ? full : null;
}
export function snapshotExcludesEntity(snapshot, row) {
  const marker = row?.window_exclusion, value = snapshot?.value;
  return Boolean(value?.index && marker && row.server && !row.dirty && hash(marker.manifest_hash) &&
    marker.manifest_hash === value.index.manifest_hash &&
    marker.version === row.server.version && marker.updated_at === row.server.updated_at && marker.date === row.server.date &&
    marker.snapshot_hash === (row.snapshot_hash??null));
}
export function matchesSnapshotEntity(expected, row, date) {
  const server = row?.server, actualDate = server?.entity_type === 'unscheduled_todo' ? null : server?.date;
  return Boolean(expected && server && !row.remote_missing && expected.date === date && actualDate === date &&
    hash(expected.content_hash) && row.snapshot_hash === expected.content_hash && server.content_hash === expected.content_hash &&
    server.entity_id === row.entity_id && server.updated_at === expected.updated_at && server.deleted_at === expected.deleted_at);
}
export function snapshotHasUnverifiedRows(snapshot, rows, date) {
  if (!snapshot?.value?.limited) return false;
  const expected = new Set(snapshot.value.index.entities.map(row=>row.entity_id));
  return rows.some(row=>!row.dirty && !row.remote_missing && row.server &&
    (row.server.entity_type==='unscheduled_todo'?null:row.server.date)===date &&
    !expected.has(row.entity_id) && !snapshotExcludesEntity(snapshot,row));
}
export function readOnlyRoute(path) {
  const url = new URL(path, 'https://offline.invalid'), query = url.searchParams;
  if (url.origin !== 'https://offline.invalid' || url.hash) return null;
  if (url.pathname === '/work-reminders' && [...query.keys()].every(key => key === 'date') &&
      query.getAll('date').length === 1 && day(query.get('date'))) return {kind: 'reminders', date: query.get('date')};
  if (!['/note-entries/dates', '/daily-notes/dates'].includes(url.pathname) ||
      [...query.keys()].some(key => !['category', 'before', 'page_size'].includes(key) || query.getAll(key).length !== 1) ||
      query.has('category') && !['life', 'work'].includes(query.get('category')) ||
      query.has('before') && !day(query.get('before'))) return null;
  const size = query.get('page_size') || '30';
  if (!/^[1-9]\d*$/.test(size) || Number(size) > 100) return null;
  return {kind: 'dates', source: url.pathname.startsWith('/daily-notes') ? 'legacy' : 'note_entry',
    category: query.get('category') || 'life', before: query.get('before'), size: Number(size)};
}
function matches(entity, route) {
  if (route.kind === 'reminders') return entity.entity_id.startsWith('work-reminder:');
  return route.source === 'legacy' ? entity.entity_id.startsWith('legacy-' + route.category + ':') :
    entity.entity_id.startsWith('note-entry:');
}
export async function readOnlySnapshot({db, scope, route, getScope, getGeneration}) {
  const generation = getGeneration();
  const result = await db.transaction(['entities', 'meta'], 'readonly', async tx => {
    const snapshot = await latestCompleteSnapshot(tx, scope, route.kind==='reminders'?route.date:undefined), index = snapshot?.value?.index;
    if (index?.complete !== true || index.scope_id !== scope) throw missing();
    const expectedById=new Map(index.entities.map(row=>[row.entity_id,row]));
    const available = (await tx.getAll('entities')).filter(row => row.scope === scope && matches(row,route));
    if (snapshotHasUnverifiedRows(snapshot,available,route.date)) throw missing();
    const rows = available.filter(row=>!snapshot.value.partial || row.dirty ||
      matchesSnapshotEntity(expectedById.get(row.entity_id),row,route.date)&&!expectedById.get(row.entity_id)?.deleted_at);
    for (const expected of index.entities.filter(row => matches(row, route) && !row.deleted_at&&
      (route.kind!=='reminders'||row.date===route.date))) {
      if (!rows.some(row => row.entity_id === expected.entity_id && row.server)) throw missing();
    }
    const active = rows.filter(row => row.dirty || !row.remote_missing).map(row => route.source === 'note_entry' && row.dirty ? row.local : row.server)
      .filter(row => row && !row.deleted && !row.deleted_at);
    let data;
    if (route.kind === 'reminders') {
      const items = active.filter(row => row.date === route.date).map(row => {
        if (typeof row.summary !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw missing();
        return {id: row.id || row.source_id, date: row.date, summary: row.summary, source_key: row.source_key,
          version: row.version, updated_at: row.updated_at};
      });
      data = {date: route.date, can_edit: false, items, snapshot_complete: true};
    } else {
      const dates = [...new Set(active.filter(row => row.category === route.category && day(row.date) &&
        (route.source !== 'legacy' || typeof row.text === 'string' && row.text !== '') &&
        (!route.before || row.date < route.before)).map(row => row.date))].sort().reverse();
      const selected = dates.slice(0, route.size), has_more = dates.length > route.size;
      data = {dates: selected, has_more, next_before: has_more ? selected.at(-1) : null, snapshot_complete: true};
    }
    return {data, saved_at: snapshot.value.verified_at || null};
  });
  if (scope !== getScope() || generation !== getGeneration()) throw missing();
  return result;
}
