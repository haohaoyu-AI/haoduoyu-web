const prefixes = {unscheduled_todo: 'unscheduled_todo:', todo: 'todo:', template: 'template:', note_entry: 'note-entry:',
  memo_note: 'memo-note:', memo_group: 'memo-group:'};
const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const clientIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const removed = value => Boolean(value && (value.deleted || value.deleted_at));
const revision = value => Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
const plain = value => typeof value === 'string' && value.isWellFormed() &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const invalid = () => { throw new TypeError('冲突内容不完整，请保留原文并重新核对。'); };

function checkedDay(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const stamp = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) invalid();
  return value;
}
function shortText(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500 || value.includes('\0')) invalid();
  return value.trim();
}
function longText(value) {
  if (!plain(value)) invalid();
  value = value.replace(/\r\n?/g, '\n');
  if (new TextEncoder().encode(value).length > 65536) invalid();
  return value;
}
function memoContent(local, type) {
  if (!plain(local.title) || !local.title.trim() || [...local.title.trim()].length > 120 || /[\r\n\t]/.test(local.title) ||
      !Number.isSafeInteger(local.position) || local.position < 0 || local.position > 1000000) invalid();
  const value = {title: local.title.trim(), position: local.position};
  if (type === 'memo_note') {
    if (!uuidPattern.test(local.group_id)) invalid();
    Object.assign(value, {group_id: local.group_id.toLowerCase(), body: longText(local.body)});
  }
  return value;
}
function content(local, type) {
  if (!local || typeof local !== 'object' || Array.isArray(local)) invalid();
  if (local.version !== undefined && (!Number.isSafeInteger(local.version) || local.version < 0 ||
      local.version >= Number.MAX_SAFE_INTEGER)) invalid();
  if (type === 'unscheduled_todo') {
    if (typeof local.completed !== 'boolean') invalid();
    return {text: shortText(local.text), completed: local.completed};
  }
  if (type === 'todo') {
    if (typeof local.completed !== 'boolean') invalid();
    return {date: checkedDay(local.date), text: shortText(local.text), completed: local.completed};
  }
  if (type === 'template') return {text: shortText(local.text)};
  if (type === 'note_entry') {
    if (!['life', 'work'].includes(local.category)) invalid();
    return {category: local.category, date: checkedDay(local.date), text: longText(local.text)};
  }
  return memoContent(local, type);
}
function contextFor({conflict, remote, choice, uuid}) {
  const type = conflict?.operation?.entity_type, scope = conflict?.scope, prefix = prefixes[type];
  if (!prefix || !['use-server', 'use-local', 'keep-both'].includes(choice) || typeof scope !== 'string' || !scope) invalid();
  const entity = conflict.entity_id, pattern = ['todo', 'template', 'unscheduled_todo'].includes(type) ? clientIdPattern : uuidPattern;
  if (typeof entity !== 'string' || !entity.startsWith(prefix) || !pattern.test(entity.slice(prefix.length)) ||
      conflict.operation.scope !== undefined && conflict.operation.scope !== scope ||
      conflict.operation.entity_id !== undefined && conflict.operation.entity_id !== entity) invalid();
  const id = entity.slice(prefix.length).toLowerCase(), local = conflict.local;
  if (local?.id !== undefined && local.id.toLowerCase?.() !== id ||
      conflict.operation.source_id !== undefined && conflict.operation.source_id.toLowerCase?.() !== id) invalid();
  if (remote && (typeof remote !== 'object' || remote.id?.toLowerCase?.() !== id || !revision(remote.version))) invalid();
  const used = new Set([id, conflict.operation.save_id?.toLowerCase?.(), local?.group_id?.toLowerCase?.()]);
  const fresh = () => {
    const value = uuid();
    if (typeof value !== 'string' || !pattern.test(value) || used.has(value.toLowerCase())) invalid();
    used.add(value.toLowerCase()); return value.toLowerCase();
  };
  const reserve = values => { for (const value of values) if (typeof value === 'string') used.add(value.toLowerCase()); };
  return {type, scope, id, local, remote, choice, fresh, reserve};
}
function operation(context, id, method, path, body, value, base = null, deleted = false) {
  const local = {...value, id, version: (body.version || 0) + 1, can_edit: true, deleted, deleted_at: null};
  return {scope: context.scope, entity_type: context.type, entity_id: id, method, path,
    body, base: base ? structuredClone(base) : null, local};
}
function copyResult(context, id, operations) {
  return {mode: 'copy', target_id: id, operations,
    explanation: removed(context.local) ? '将删除前的本机内容另存为新记录，原记录保持原状。' : '将本机内容另存为新记录，原记录保持原状。'};
}
function todoPlan(context, value) {
  const {id, remote, local, choice, fresh} = context, path = '/todos/' + id;
  if (choice === 'use-local' && remote && !removed(remote) && remote.date === value.date && remote.text === value.text) {
    const method = removed(local) ? 'DELETE' : 'PATCH';
    const body = method === 'DELETE' ? {date: value.date, version: remote.version} : {completed: value.completed, version: remote.version};
    return {mode: 'replace', target_id: id,
      operations: [operation(context, id, method, path, body, value, remote, method === 'DELETE')]};
  }
  const target = fresh(), created = {...value, completed: false};
  const operations = [operation(context, target, 'POST', '/todos', {id: target, date: value.date, text: value.text}, created)];
  if (value.completed) operations.push(operation(context, target, 'PATCH', '/todos/' + target, {completed: true, version: 1}, value));
  return copyResult(context, target, operations);
}
function undatedPlan(context, value) {
  const {id, remote, local, choice, fresh} = context, path = '/unscheduled-todos/' + id;
  if (choice === 'use-local' && remote && !removed(remote) && remote.text === value.text) {
    const method = removed(local) ? 'DELETE' : 'PATCH';
    const body = method === 'DELETE' ? {version: remote.version} : {completed: value.completed, version: remote.version};
    return {mode: 'replace', target_id: id, operations: [operation(context, id, method, path, body, value, remote, method === 'DELETE')]};
  }
  const target = fresh(), created = {...value, completed: false};
  const operations = [operation(context, target, 'POST', '/unscheduled-todos', {id: target, text: value.text}, created)];
  if (value.completed) operations.push(operation(context, target, 'PATCH', '/unscheduled-todos/' + target, {completed: true, version: 1}, value));
  return copyResult(context, target, operations);
}
function templatePlan(context, value) {
  const {id, remote, local, choice, fresh} = context;
  if (choice === 'use-local' && remote && !removed(remote)) {
    const method = removed(local) ? 'DELETE' : 'PATCH', body = {version: remote.version};
    if (method === 'PATCH') body.text = value.text;
    return {mode: 'replace', target_id: id, operations: [
      operation(context, id, method, '/todo-templates/' + id, body, value, remote, method === 'DELETE')]};
  }
  const target = fresh();
  return copyResult(context, target, [operation(context, target, 'POST', '/todo-templates', {id: target, text: value.text}, value)]);
}
function notePlan(context, value) {
  const {id, remote, local, choice, fresh} = context;
  if (choice === 'use-local' && remote && !removed(remote) && remote.category === value.category && remote.date === value.date) {
    const method = removed(local) ? 'DELETE' : 'PUT', body = {version: remote.version, save_id: fresh()};
    if (method === 'PUT') Object.assign(body, value);
    return {mode: 'replace', target_id: id, operations: [
      operation(context, id, method, '/note-entries/' + id, body, value, remote, method === 'DELETE')]};
  }
  const target = fresh(), body = {...value, version: 0, save_id: fresh()};
  return copyResult(context, target, [operation(context, target, 'PUT', '/note-entries/' + target, body, value)]);
}
function liveMemoGroup(group) {
  return group && uuidPattern.test(group.id) && revision(group.version) && group.deleted_at === null && !group.deleted &&
    (group.position === undefined || Number.isSafeInteger(group.position) && group.position >= 0 && group.position <= 1000000);
}
function memoOperation(context, id, body, value, base = null) {
  const kind = context.type === 'memo_note' ? 'notes' : 'groups';
  const result = operation(context, id, 'PUT', '/memos/' + kind + '/' + id, body, value, base);
  if (context.type === 'memo_note') Object.assign(result, {protocol: 2, depends_on: ['memo-group:' + body.group_id]});
  return result;
}
function memoParentCopy(context, value, groups) {
  const live = groups.filter(liveMemoGroup).sort((a, b) => (a.position || 0) - (b.position || 0) || a.id.localeCompare(b.id));
  const operations = [];
  let parent = live[0]?.id.toLowerCase();
  if (!parent) {
    parent = context.fresh();
    const groupValue = {title: '本机冲突副本', position: 0};
    const groupBody = {...groupValue, version: 0, save_id: context.fresh()};
    operations.push(memoOperation({...context, type: 'memo_group'}, parent, groupBody, groupValue));
  }
  const target = context.fresh(), local = {...value, group_id: parent};
  const body = {...local, version: 0, save_id: context.fresh()};
  operations.push(memoOperation(context, target, body, local));
  return {...copyResult(context, target, operations),
    explanation: '原笔记所在位置已不可用，将本机正文另存为新笔记，原内容保留。'};
}
function memoPlan(context, value, groups) {
  const {id, remote, local, choice, fresh, type} = context;
  if (removed(local)) return {mode: 'blocked', operations: [], target_id: id,
    explanation: '本机保留的是删除意图；备忘录删除需联网确认，原文与冲突仍保留。'};
  if (type === 'memo_note' && !groups.some(group => group?.id === value.group_id && liveMemoGroup(group)))
    return memoParentCopy(context, value, groups);
  const replace = choice === 'use-local' && remote && !removed(remote) &&
    (type !== 'memo_note' || remote.group_id === value.group_id);
  const target = replace ? id : fresh(), body = {...value, version: replace ? remote.version : 0, save_id: fresh()};
  const operations = [memoOperation(context, target, body, value, replace ? remote : null)];
  return replace ? {mode: 'replace', target_id: target, operations} : copyResult(context, target, operations);
}

export function planConflictResolution({conflict, remote = null, choice, groups = [], uuid = () => crypto.randomUUID()}) {
  const context = contextFor({conflict, remote, choice, uuid});
  if (choice === 'use-server') return {mode: 'server', target_id: context.id, operations: []};
  if (choice === 'use-local' && removed(context.local) && (!remote || removed(remote)))
    return {mode: 'server', target_id: context.id, operations: [], explanation: '线上已删除，确认删除结果；删除前原文仍保留。'};
  if (!Array.isArray(groups)) invalid();
  context.reserve(groups.map(group => group?.id));
  const value = content(context.local, context.type);
  if (context.type === 'todo') return todoPlan(context, value);
  if (context.type === 'unscheduled_todo') return undatedPlan(context, value);
  if (context.type === 'template') return templatePlan(context, value);
  if (context.type === 'note_entry') return notePlan(context, value);
  return memoPlan(context, value, groups);
}
