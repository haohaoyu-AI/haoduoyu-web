import {exact, idOf, versionOf, bodyText, plain, currentVersion, queryOnly, fail, invalid, unsupported, digest} from './common.mjs';
const limit = {groups: 32, notes: 200};
const sort = (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
function titleOf(value) {
  if (!plain(value) || /[\r\n\t]/.test(value) || !value.trim() || [...value.trim()].length > 120) throw invalid('标题须为 1–120 字单行文字。');
  return value.trim();
}
export async function memosRoute(c) {
  const {path, method, body: b} = c; queryOnly(c.url.searchParams);
  if (method === 'GET' && path === '/memos') {
    const groups = c.list('memo_group').sort(sort), notes = c.list('memo_note').sort(sort);
    if (groups.length > limit.groups || notes.length > limit.notes) throw fail(413, 'MEMOS_LIMIT', '备忘录超过完整读取上限。');
    return {groups: groups.map(group => ({...group, active_note_count: notes.filter(note => note.group_id === group.id && !note.deleted_at).length})),
      notes: notes.map(({body, ...row}) => row), can_edit: true, draft_scope: c.ownerId};
  }
  const operation = /^\/memos\/operations\/([^/]+)$/.exec(path);
  if (method === 'GET' && operation) {
    const receipt = await c.receipt('memo', idOf(operation[1])); return receipt ? {found: true, ...receipt} : {found: false};
  }
  if (path === '/memos/trash/clear') throw fail(405, 'LOCAL_SOFT_DELETE_ONLY', '本机版只保留可恢复删除，不执行永久清空。');
  const match = /^\/memos\/(groups|notes)\/([^/]+)(\/restore)?$/.exec(path);
  if (!match) throw unsupported();
  const kind = match[1], table = kind === 'groups' ? 'memo_group' : 'memo_note', id = idOf(match[2]), restore = Boolean(match[3]), row = c.get(table, id);
  const count = groupId => c.list('memo_note').filter(note => note.group_id === groupId && !note.deleted_at).length;
  const view = value => ({...value, can_edit: true, ...(kind === 'groups' ? {active_note_count: count(value.id)} : {})});
  if (method === 'GET' && !restore) { if (!row) throw fail(404, 'NOT_FOUND', '本机备忘录不存在。'); return view(row); }
  if (!['PUT', 'DELETE', 'POST'].includes(method) || restore !== (method === 'POST')) throw unsupported();
  exact(b, ['version', 'save_id', ...(method === 'PUT' ? ['title', 'position', ...(kind === 'notes' ? ['group_id', 'body'] : [])] : []),
    ...(method === 'DELETE' && kind === 'groups' ? ['confirm_title', 'confirm_note_count'] : [])]);
  versionOf(b.version, method === 'PUT' ? 0 : 1); const saveId = idOf(b.save_id);
  let content;
  if (method === 'PUT') {
    const title = titleOf(b.title);
    if (!Number.isSafeInteger(b.position) || b.position < 0 || b.position > 1000000) throw invalid('排序位置无效。');
    content = {title, position: b.position, ...(kind === 'notes' ? {group_id: idOf(b.group_id), body: bodyText(b.body)} : {})};
  }
  if (method === 'DELETE' && kind === 'groups' && (typeof b.confirm_title !== 'string' || !Number.isSafeInteger(b.confirm_note_count) || b.confirm_note_count < 0 || b.confirm_note_count > limit.notes)) throw invalid();
  return c.commit('memo', saveId, {method, path, ...b}, async () => {
    currentVersion(row, b.version, {allowMissing: method === 'PUT', allowDeleted: method !== 'PUT'});
    if (restore && !row.deleted_at || method === 'DELETE' && row.deleted_at) throw fail(409, 'VERSION_CONFLICT', '删除状态已变化，请重新核对。');
    if (method === 'PUT' && !row && c.list(table).length >= limit[kind]) throw fail(409, 'MEMOS_LIMIT', '备忘录已达上限，回收站也计入。');
    if (kind === 'notes' && (method === 'PUT' || restore)) {
      if (row && method === 'PUT' && row.group_id !== content.group_id) throw invalid('已有笔记所属分组不可更改。');
      const group = c.get('memo_group', row?.group_id || content.group_id);
      if (!group || group.deleted_at) throw fail(409, 'MEMO_GROUP_UNAVAILABLE', '分组不存在或已删除，请先恢复。');
    }
    if (method === 'DELETE' && kind === 'groups' && (row.title !== b.confirm_title || count(id) !== b.confirm_note_count)) throw fail(409, 'MEMO_DELETE_CONFIRMATION', '分组名称或笔记数量已变化，请重新确认。');
    const value = {...(content || row), id, version: b.version + 1, change_seq: await c.revision(),
      created_at: row?.created_at || c.stamp, updated_at: c.stamp, deleted_at: method === 'DELETE' ? c.stamp : null};
    await c.history(table, row); await c.put(table, id, value);
    const receipt = {kind, id, version: value.version, change_seq: value.change_seq, deleted_at: value.deleted_at, entity_hash: await digest(value)};
    return {response: view(value), checks: [{kind: table, id, version: value.version}], receipt};
  });
}
