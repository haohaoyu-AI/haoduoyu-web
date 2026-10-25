import {e} from '../core/dom.mjs';

const button = (action, label, extra = '') => '<button type="button" class="btn" data-memo-action="' +
  action + '" ' + extra + '>' + label + '</button>';
export function renderMemos() {
  return '<section id="memos" data-pane="groups" aria-label="长期备忘录">' +
    '<div class="memo-toolbar"><div class="memo-mobile-back">' + button('back-groups', '‹ 分组') +
    button('back-notes', '‹ 笔记') + '</div><span id="memo-status" role="status" aria-live="polite">正在读取…</span>' +
    '<div class="memo-toolbar-actions">' + button('refresh', '刷新') + button('trash', '回收站', 'hidden') +
    button('recovery', '本机草稿', 'hidden') + button('login', '所有者登录', 'hidden') + '</div></div>' +
    '<p id="memo-error" class="memo-message" role="alert" hidden></p>' +
    '<div id="memo-operation" class="memo-message" hidden><p id="memo-operation-text" role="status"></p>' +
    button('operation-check', '核对操作结果') + button('operation-retry', '重试同一操作', 'hidden') + '</div>' +
    '<div id="memo-drafts" class="memo-drafts" hidden></div>' +
    '<section id="memo-recovery" class="memo-recovery" aria-label="找回本机草稿" hidden><div class="memo-panel-head">' +
    '<h2>找回本机草稿</h2>' + button('close-recovery', '关闭') + '</div><p id="memo-recovery-status" role="status"></p>' +
    '<div id="memo-recovery-list"></div><div id="memo-recovery-detail" hidden><p id="memo-recovery-selected"></p>' +
    '<label for="memo-recovery-copy">草稿文字（可选中复制）</label>' +
    '<textarea id="memo-recovery-copy" readonly></textarea>' + button('restore-draft', '恢复此草稿并核对') + '</div></section>' +
    '<section id="memo-dialog" class="memo-dialog" aria-labelledby="memo-dialog-heading" hidden>' +
    '<h3 id="memo-dialog-heading"></h3><p id="memo-dialog-description"></p>' +
    '<label id="memo-dialog-label" for="memo-dialog-title">名称</label>' +
    '<input id="memo-dialog-title" class="input" maxlength="120" autocomplete="off">' +
    '<div class="memo-dialog-actions">' + button('cancel', '取消') + button('confirm', '确认') + '</div></section>' +
    '<div class="memo-layout"><aside class="memo-groups" aria-label="分组">' +
    '<div class="memo-panel-head"><h2 id="memo-groups-heading">分组</h2>' + button('new-group', '＋ 分组', 'hidden') + '</div>' +
    '<div id="memo-group-list" class="memo-list"></div></aside>' +
    '<aside class="memo-notes" aria-label="笔记列表"><div class="memo-panel-head"><h2 id="memo-group-heading">笔记</h2>' +
    button('new-note', '＋ 笔记', 'hidden') + '</div><div id="memo-group-actions" class="memo-group-actions" hidden>' +
    button('rename-group', '重命名分组') + button('delete-group', '删除分组') + button('restore-group', '恢复分组', 'hidden') +
    '</div><div id="memo-note-list" class="memo-list"></div></aside>' +
    '<article class="memo-editor" aria-label="笔记内容"><p id="memo-empty" class="memo-empty">选择一篇笔记，长期记录常用信息。</p>' +
    '<div id="memo-document" hidden><label for="memo-title" class="sr-only">笔记标题</label>' +
    '<input id="memo-title" class="memo-title" maxlength="120" placeholder="笔记标题" autocomplete="off">' +
    '<h2 id="memo-read-title" class="memo-read-title" hidden></h2>' +
    '<label for="memo-body" class="sr-only">笔记正文</label>' +
    '<textarea id="memo-body" class="memo-body" placeholder="写下需要长期记住的信息…"></textarea>' +
    '<div id="memo-read-body" class="memo-read-body" tabindex="0" hidden></div>' +
    '<div class="memo-document-footer"><span id="memo-detail"></span><div id="memo-note-actions" hidden>' +
    button('save', '立即保存') + button('delete-note', '删除笔记') + button('restore-note', '恢复笔记', 'hidden') + '</div></div>' +
    '<p id="memo-note-error" class="memo-message" role="alert" hidden></p>' +
    '<div id="memo-resolution" class="memo-resolution" hidden>' + button('check', '核对服务器结果') +
    button('retry', '重试同一保存', 'hidden') + '<div id="memo-conflict" hidden><h3>服务器上的内容</h3>' +
    '<pre id="memo-remote"></pre>' + button('use-server', '采用服务器内容') +
    button('use-draft', '用此草稿保存到新版本') + '</div></div></div></article></div></section>';
}
const phases = {dirty: '等待自动保存', saving: '正在保存…', unknown: '保存结果待核对', conflict: '版本冲突 · 草稿已保留',
  offline: '离线 · 草稿保留在本机', error: '暂未保存 · 草稿已保留', oversize: '正文超过 64 KiB', loading: '正在读取…'};
const active = (rows, trash) => rows.filter(row => Boolean(row.deleted_at) === trash);
function listButton(kind, row, current, subtitle = '') {
  return '<button type="button" class="memo-list-item' + (row.id === current ? ' is-selected' : '') + '" data-memo-' + kind +
    '="' + e(row.id) + '" aria-pressed="' + (row.id === current) + '"><span>' + e(row.title) + '</span>' +
    (subtitle ? '<small>' + e(subtitle) + '</small>' : '') + '</button>';
}
function paintLists(root, store) {
  const s = store.state, group = s.groups.find(row => row.id === s.groupId), find = q => root.querySelector(q);
  find('#memo-groups-heading').textContent = s.trash ? '已删除分组' : '分组';
  find('#memo-group-heading').textContent = group?.title || (s.trash ? '已删除笔记' : '笔记');
  find('#memo-group-list').innerHTML = active(s.groups, s.trash).map(row => listButton('group', row, s.groupId,
    row.active_note_count + ' 篇笔记')).join('') || '<p class="memo-empty">' + (s.trash ? '没有已删除分组' : '还没有分组') + '</p>';
  const notes = s.notes.filter(row => s.trash ? row.deleted_at || group?.deleted_at && row.group_id === group.id :
    !row.deleted_at && row.group_id === s.groupId && !group?.deleted_at);
  find('#memo-note-list').innerHTML = notes.map(row => listButton('note', row, s.noteId,
    s.trash ? s.groups.find(item => item.id === row.group_id)?.title || '' : '')).join('') ||
    '<p class="memo-empty">' + (s.trash ? '没有已删除笔记' : '这个分组还没有笔记') + '</p>';
  find('[data-memo-action="new-group"]').hidden = !s.canEdit || s.trash;
  find('[data-memo-action="new-note"]').hidden = !s.canEdit || s.trash || !group || Boolean(group.deleted_at);
  find('#memo-group-actions').hidden = !s.canEdit || !group;
  for (const action of ['rename-group', 'delete-group']) find('[data-memo-action="' + action + '"]').hidden = Boolean(group?.deleted_at);
  find('[data-memo-action="restore-group"]').hidden = !group?.deleted_at;
  const operationBlocked = Boolean(s.operation?.pending);
  const groupDirty = [...store.drafts.values()].some(item => item.group_id === s.groupId && (item.dirty || item.pending));
  for (const action of ['new-group', 'new-note', 'rename-group', 'delete-group', 'restore-group'])
    find('[data-memo-action="' + action + '"]').disabled = operationBlocked || action === 'delete-group' && groupDirty;
}
function paintDrafts(root, store) {
  const drafts = [...store.drafts.values()].filter(item => item.dirty || item.pending || ['unknown', 'conflict'].includes(item.phase));
  const box = root.querySelector('#memo-drafts');
  box.hidden = !store.state.canEdit || !drafts.length;
  box.innerHTML = '<span>本机保留的草稿：</span>' + drafts.map(item =>
    '<button type="button" class="btn text" data-memo-draft="' + e(item.id) + '">' + e(item.title || '未命名笔记') + '</button>').join('');
}
function paintDocument(root, store) {
  const s = store.state, item = store.drafts.get(s.noteId), find = q => root.querySelector(q);
  find('#memo-empty').hidden = Boolean(item);
  find('#memo-document').hidden = !item;
  if (!item) return;
  const group = s.groups.find(row => row.id === item.group_id), deleted = Boolean(item.deleted_at || group?.deleted_at);
  const editable = s.canEdit && !deleted;
  const operation = s.operation?.pending;
  const structureBusy = operation && (operation.kind === 'notes' && operation.id === item.id ||
    operation.kind === 'groups' && operation.id === item.group_id && operation.method === 'DELETE');
  for (const field of ['title', 'body']) {
    const input = find('#memo-' + field);
    input.hidden = !editable;
    input.disabled = Boolean(structureBusy || item.loading || item.pending && item.pending.method !== 'PUT');
    if (input.value !== item[field]) input.value = item[field] || '';
    find('#memo-read-' + field).hidden = editable;
    find('#memo-read-' + field).textContent = item[field] || (field === 'body' ? '这篇笔记还没有正文。' : '未命名笔记');
  }
  find('#memo-detail').textContent = deleted ? '已删除 · 可恢复' : s.canEdit ?
    new TextEncoder().encode(item.body || '').length + ' / 65536 字节 · 自动保存' : '公开只读';
  find('#memo-note-actions').hidden = !s.canEdit;
  find('[data-memo-action="save"]').hidden = deleted;
  find('[data-memo-action="save"]').disabled = !item.dirty || Boolean(item.pending) || item.phase === 'conflict';
  find('[data-memo-action="delete-note"]').hidden = deleted;
  find('[data-memo-action="delete-note"]').disabled = Boolean(item.pending) || item.dirty || Boolean(s.operation?.pending) || item.version === 0;
  find('[data-memo-action="restore-note"]').hidden = !item.deleted_at;
  find('[data-memo-action="restore-note"]').disabled = Boolean(group?.deleted_at || s.operation?.pending || item.pending);
  find('#memo-note-error').hidden = !item.error;
  find('#memo-note-error').textContent = item.error || '';
  find('#memo-resolution').hidden = !['unknown', 'conflict'].includes(item.phase);
  find('[data-memo-action="retry"]').hidden = item.phase !== 'unknown' || !item.pending?.retryReady;
  find('#memo-conflict').hidden = item.phase !== 'conflict' || !item.remote;
  find('#memo-remote').textContent = item.remote ? (item.remote.deleted_at ? '（已删除）\n' : '') +
    item.remote.title + '\n\n' + item.remote.body : '';
  find('[data-memo-action="use-draft"]').disabled = !s.canEdit || !item.remote || Boolean(item.remote.deleted_at || group?.deleted_at);
}
export function paintMemos(root, store) {
  if (!root) return;
  const s = store.state, item = store.drafts.get(s.noteId), find = q => root.querySelector(q);
  root.dataset.pane = s.pane;
  find('#memo-status').textContent = s.loading ? '正在读取…' : !s.canEdit ? '公开只读' : phases[item?.phase] || '已保存';
  find('#memo-error').hidden = !s.error && !s.storageError;
  find('#memo-error').textContent = [s.error, s.storageError].filter(Boolean).join(' ');
  find('[data-memo-action="login"]').hidden = s.canEdit || s.loading;
  find('[data-memo-action="trash"]').hidden = !s.canEdit;
  find('[data-memo-action="recovery"]').hidden = !s.canEdit;
  if (!s.canEdit) find('#memo-recovery').hidden = true;
  find('[data-memo-action="trash"]').textContent = s.trash ? '返回备忘录' : '回收站';
  find('[data-memo-action="trash"]').setAttribute('aria-pressed', String(s.trash));
  find('[data-memo-action="back-groups"]').hidden = s.pane === 'groups';
  find('[data-memo-action="back-notes"]').hidden = s.trash ? s.pane === 'notes' : s.pane !== 'editor';
  find('[data-memo-action="back-groups"]').textContent = s.trash ? '已删分组' : '‹ 分组';
  find('[data-memo-action="back-notes"]').textContent = s.trash ? '已删笔记' : '‹ 笔记';
  const operation = s.operation;
  find('#memo-operation').hidden = !operation?.pending && !operation?.error;
  find('#memo-operation-text').textContent = operation?.error || (operation?.phase === 'saving' ? '正在保存操作…' : '操作结果待核对');
  find('[data-memo-action="operation-check"]').hidden = operation?.phase !== 'unknown';
  find('[data-memo-action="operation-retry"]').hidden = operation?.phase !== 'unknown' || !operation?.retryReady;
  paintLists(root, store); paintDrafts(root, store); paintDocument(root, store);
}
