import {exact, idOf, versionOf, dateOf, textOf, plain, currentVersion, queryOnly, fail, invalid, unsupported, byCreated} from './common.mjs';
const check = (kind, row) => ({kind, id: row.id, version: row.version});
const boolean = value => { if (typeof value !== 'boolean') throw invalid(); return value; };
function linked(c, row) {
  if (!row) throw fail(404, 'NOT_FOUND', '本机待办不存在。');
  const value = {...row};
  delete value.created_template_id;
  if (!value.note) delete value.note;
  if (row.template_id) {
    const template = c.get('template', row.template_id);
    value.template_version = template?.version || 0;
    value.template_active = Boolean(template && !template.deleted_at && !template.archived_at);
  }
  return value;
}
function templateView(c, row) {
  const start = new Date(c.today + 'T00:00:00Z'); start.setUTCDate(start.getUTCDate() - 29);
  const dates = new Set(c.list('todo').filter(todo => todo.template_id === row.id && todo.completed && !todo.deleted_at && todo.date >= start.toISOString().slice(0, 10) && todo.date <= c.today).map(todo => todo.date));
  return {...row, completed_days: dates.size, habit_status: dates.size >= 21 ? 'habit' : 'todo'};
}
const next = (c, row, changes) => ({...row, ...changes, version: row.version + 1, updated_at: c.stamp});
const initial = (c, value) => ({...value, version: 1, created_at: c.stamp, updated_at: c.stamp, deleted_at: null});
async function save(c, kind, row) { await c.history(kind, c.get(kind, row.id)); await c.put(kind, row.id, row); return row; }
const commit = (c, kind, id, body, work) => c.commit('todo', c.method + ':' + c.path + ':' + (body.version ?? 'create:' + id), {method: c.method, path: c.path, ...body}, work);

export async function todosRoute(c) {
  const {path, method, body: b, url} = c, q = url.searchParams;
  if (path === '/todo-preferences') {
    queryOnly(q);
    const row = c.get('preference', 'todos') || {completed_mode: 'strike', version: 0};
    if (method === 'GET') return row;
    if (method !== 'PATCH') throw unsupported();
    exact(b, ['completed_mode', 'version']); versionOf(b.version, 0);
    if (!['strike', 'hide'].includes(b.completed_mode)) throw invalid();
    return commit(c, 'preference', 'todos', b, async () => {
      currentVersion(row, b.version);
      const value = {completed_mode: b.completed_mode, version: row.version + 1};
      await c.put('preference', 'todos', value);
      return {response: value, checks: [{kind: 'preference', id: 'todos', version: value.version}]};
    });
  }
  if (method === 'GET' && path === '/todos') {
    queryOnly(q, ['date']); const date = q.has('date') ? dateOf(q.get('date')) : c.today;
    const preferences = c.get('preference', 'todos') || {completed_mode: 'strike', version: 0};
    return {date, today: c.today, completed_mode: preferences.completed_mode, preferences_version: preferences.version,
      items: c.list('todo').filter(row => row.date === date && !row.deleted_at).sort(byCreated).map(row => linked(c, row))};
  }
  if (method === 'GET' && path === '/todo-templates') {
    queryOnly(q, ['archived']); if (q.has('archived') && q.get('archived') !== '1') throw invalid();
    const start = new Date(c.today + 'T00:00:00Z'); start.setUTCDate(start.getUTCDate() - 29);
    return {today: c.today, window_start: start.toISOString().slice(0, 10), items: c.list('template').filter(row => !row.deleted_at && Boolean(row.archived_at) === q.has('archived')).sort(byCreated).map(row => templateView(c, row))};
  }
  if (method === 'GET' && path === '/unscheduled-todos') {
    queryOnly(q); return {items: c.list('unscheduled_todo').filter(row => !row.deleted_at).sort(byCreated)};
  }
  const createKind = {'/todos': 'todo', '/todo-templates': 'template', '/unscheduled-todos': 'unscheduled_todo'}[path];
  if (createKind && method === 'POST') {
    exact(b, createKind === 'todo' ? ['id', 'text', 'date', ...(Object.hasOwn(b, 'template_id') ? ['template_id'] : [])] : ['id', 'text']);
    const id = idOf(b.id), text = textOf(b.text), date = createKind === 'todo' ? dateOf(b.date) : null;
    const templateId = b.template_id === undefined ? null : idOf(b.template_id);
    return commit(c, createKind, id, b, async () => {
      if (c.get(createKind, id)) throw fail(409, 'IDEMPOTENCY_CONFLICT', '本机标识已存在，未创建重复记录。');
      if (templateId) {
        const template = c.get('template', templateId);
        if (!template || template.deleted_at || template.archived_at) throw fail(409, 'TEMPLATE_UNAVAILABLE', '常用待办已删除或归档。');
      }
      const row = initial(c, {id, text, ...(date ? {date} : {}), ...(createKind !== 'template' ? {completed: false} : {archived_at: null}),
        ...(templateId ? {template_id: templateId, created_template_id: templateId} : {})});
      await save(c, createKind, row);
      return {response: createKind === 'template' ? templateView(c, row) : linked(c, row), checks: [check(createKind, row)]};
    });
  }
  const match = /^\/(todos|todo-templates|unscheduled-todos)\/([^/]+)(?:\/(restore|archive|note|template|move|complete-today))?$/.exec(path);
  if (!match) throw unsupported();
  const kind = {todos: 'todo', 'todo-templates': 'template', 'unscheduled-todos': 'unscheduled_todo'}[match[1]], id = idOf(match[2]), action = match[3] || '';
  const row = c.get(kind, id);
  if (method === 'GET' && !action && kind !== 'template') { queryOnly(q); return linked(c, row); }
  const deletion = method === 'DELETE' && !action, restoring = method === 'POST' && action === 'restore';
  const settingTemplate = kind === 'todo' && method === 'POST' && action === 'template';
  const moving = kind === 'unscheduled_todo' && method === 'POST' && ['move', 'complete-today'].includes(action);
  const archiving = kind === 'template' && method === 'POST' && action === 'archive';
  const patching = method === 'PATCH' && (!action || kind === 'todo' && action === 'note');
  if (!(deletion || restoring || settingTemplate || moving || archiving || patching)) throw unsupported();
  const fields = settingTemplate ? ['date', 'version', 'template_id', 'template_version'] : moving ? ['date', 'version'] :
    patching ? [kind === 'template' ? 'text' : action === 'note' ? 'note' : 'completed', 'version'] : kind === 'todo' ? ['date', 'version'] : ['version'];
  exact(b, fields); versionOf(b.version);
  if ('date' in b) dateOf(b.date);
  if (settingTemplate) { idOf(b.template_id); versionOf(b.template_version, 0); }
  if (patching) {
    if (kind === 'template') textOf(b.text);
    else if (action === 'note') { if (!plain(b.note) || b.note.length > 4000) throw invalid('备注最多 4000 字。'); }
    else boolean(b.completed);
  }
  return commit(c, kind, id, b, async () => {
    currentVersion(row, b.version, {allowDeleted: restoring});
    if (kind === 'todo' && b.date && row.date !== b.date) throw invalid('待办日期不匹配。');
    if (moving) {
      const complete = action === 'complete-today';
      if (complete && b.date !== c.today) throw fail(409, 'TODO_DAY_CHANGED', '北京时间日期已变化，请重新核对。');
      if (c.get('todo', id)) throw fail(409, 'IDEMPOTENCY_CONFLICT', '目标待办标识已存在，原项仍保留。');
      const todo = initial(c, {id, date: b.date, text: row.text, completed: complete || row.completed});
      const source = next(c, row, {completed: todo.completed, deleted_at: c.stamp, moved_to_date: b.date});
      await save(c, 'todo', todo); await save(c, kind, source);
      return {response: {todo: linked(c, todo), source}, checks: [check('todo', todo), check(kind, source)]};
    }
    if (settingTemplate) {
      const templateId = idOf(b.template_id), existing = c.get('template', templateId);
      if (row.template_id && row.template_id !== templateId || existing && !row.template_id) throw fail(409, 'IDEMPOTENCY_CONFLICT', '待办或模板标识已关联其他记录。');
      let template, todo = row;
      if (existing) {
        currentVersion(existing, b.template_version, {allowDeleted: true});
        if (existing.archived_at) throw fail(409, 'TEMPLATE_ARCHIVED', '请先恢复已归档模板。');
        template = existing.deleted_at ? next(c, existing, {deleted_at: null}) : existing;
      } else {
        if (b.template_version !== 0) throw fail(409, 'VERSION_CONFLICT', '模板版本不匹配。');
        template = initial(c, {id: templateId, text: row.text, archived_at: null});
        todo = next(c, row, {template_id: templateId}); await save(c, kind, todo);
      }
      await save(c, 'template', template);
      return {response: {todo: linked(c, todo), template: templateView(c, template)}, checks: [check(kind, todo), check('template', template)]};
    }
    let changes;
    if (kind === 'template' && (archiving || restoring)) {
      if (row.deleted_at) throw fail(409, 'TEMPLATE_DELETED', '已删除常用项需从原待办重新设为常用。');
      changes = {archived_at: archiving ? c.stamp : null};
    } else if (restoring) {
      if (!row.deleted_at) throw fail(409, 'VERSION_CONFLICT', '记录已经恢复。');
      if (kind === 'unscheduled_todo' && row.moved_to_date) throw fail(409, 'TODO_MOVED', '该项已移动到日期待办，不得重复恢复。');
      changes = {deleted_at: null};
    } else if (deletion) changes = {deleted_at: c.stamp};
    else changes = kind === 'template' ? {text: textOf(b.text)} : action === 'note' ? {note: b.note} : {completed: b.completed};
    const saved = await save(c, kind, next(c, row, changes));
    return {response: kind === 'template' ? deletion ? {id, deleted: true, version: saved.version} : templateView(c, saved) : linked(c, saved), checks: [check(kind, saved)]};
  });
}
