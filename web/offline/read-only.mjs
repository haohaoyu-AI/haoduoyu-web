import {entityKey} from './db.mjs';

const day = value => typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const missing = () => Object.assign(new Error('此内容尚未完整缓存在本机，请联网读取。'), {code: 'OFFLINE_CACHE_MISS'});
// Both snapshot versions contain the common note and reminder projection. Only
// use complete metadata belonging to this scope; prefer the newest evidence.
export async function latestCompleteSnapshot(tx, scope, date) {
  const v1 = await tx.get('meta', entityKey(scope, 'snapshot'));
  const v2 = await tx.get('meta', entityKey(scope, 'snapshot-v2'));
  const valid = value => value?.value?.index?.complete === true && value.value.index.scope_id === scope;
  const candidates=[v1,v2].filter(valid);
  const complete=candidates.sort((a,b)=>(b.value.verified_at||0)-(a.value.verified_at||0))[0]||null;
  // Partial sync evidence proves only dates already verified and committed;
  // callers asking for the complete history never receive this evidence.
  const partials=[];
  for(const key of ['snapshot-progress','snapshot-v2-progress']) {
    const partial=await tx.get('meta',entityKey(scope,key));
    if(valid(partial)&&partial.value.partial===true)partials.push(partial);
  }
  const partial=partials.sort((a,b)=>(b.value.verified_at||0)-(a.value.verified_at||0))[0];
  if(partial&&(partial.value.verified_at||0)>=(complete?.value?.verified_at||0))
    return date&&partial.value.covered_dates?.includes(date)?partial:null;
  return complete;
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
    const rows = (await tx.getAll('entities')).filter(row => row.scope === scope && matches(row, route)&&
      (!snapshot.value.partial||row.dirty||expectedById.get(row.entity_id)?.date===route.date&&
        expectedById.get(row.entity_id)?.content_hash===row.snapshot_hash&&!expectedById.get(row.entity_id)?.deleted_at));
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
