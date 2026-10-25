import {e} from '../core/dom.mjs';

const button = (action, label, extra = '') => '<button type="button" class="btn" data-memo-action="' +
  action + '" ' + extra + '>' + label + '</button>';
export function renderMemos() {
  return '<section id="memos" data-pane="groups" aria-label="长期备忘录">' +
    '<div class="memo-toolbar"><div class="memo-mobile-back">' + button('back-notes', '‹ 返回目录') +
    '</div><span id="memo-status" role="status" aria-live="polite">正在读取…</span>' +
    '<div class="memo-toolbar-actions">' + button('exit-trash', '返回备忘录', 'hidden') + button('login', '所有者登录', 'hidden') + '</div></div>' +
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
    '<div class="memo-layout"><aside class="memo-library" aria-label="备忘录目录">' +
    '<div class="memo-panel-head"><h2 id="memo-groups-heading">目录</h2>' +
    button('new-group', '＋', 'hidden aria-label="新建分组"') + '</div>' +
    '<div id="memo-group-list" class="memo-list"></div></aside>' +
    '<article class="memo-editor" aria-label="笔记内容"><p id="memo-empty" class="memo-empty">选择一篇笔记，长期记录常用信息。</p>' +
    '<div id="memo-document" hidden><label for="memo-title" class="sr-only">笔记标题</label>' +
    '<input id="memo-title" class="memo-title" maxlength="120" placeholder="笔记标题" autocomplete="off">' +
    '<h2 id="memo-read-title" class="memo-read-title" hidden></h2>' +
    '<label for="memo-body" class="sr-only">笔记正文</label>' +
    '<textarea id="memo-body" class="memo-body" placeholder="写下需要长期记住的信息…"></textarea>' +
    '<div id="memo-read-body" class="memo-read-body" tabindex="0" hidden></div>' +
    '<div class="memo-document-footer"><span id="memo-detail"></span><div id="memo-note-actions" hidden>' +
    '<details class="memo-document-menu"><summary aria-label="笔记操作">⋯</summary><div class="memo-context-actions">' +
    button('save', '立即保存') + button('delete-note', '删除笔记') + button('restore-note', '恢复笔记', 'hidden') +
    '</div></details></div></div>' +
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
function groupTree(group, notes, store) {
  const s = store.state, open = s.groupId === group.id, label = e(group.title);
  const extra = ' data-memo-target="' + e(group.id) + '"';
  const controls = !s.canEdit ? '' : s.trash ? (group.deleted_at ? button('restore-group', '恢复分组', extra) : '') :
    button('new-note', '＋', extra + ' aria-label="在' + label + '中新建笔记"') +
    '<details class="memo-group-menu"><summary aria-label="' + label + '的分组操作">⋯</summary>' +
    '<div class="memo-context-actions">' + button('rename-group', '重命名', extra) +
    button('delete-group', '删除分组', extra) + '</div></details>';
  const pending = Boolean(s.operation?.pending);
  return '<div class="memo-tree-group"><div class="memo-tree-heading">' +
    '<button type="button" class="memo-group-select' + (open ? ' is-selected' : '') + '" data-memo-group="' + e(group.id) +
    '" aria-expanded="' + open + '" aria-controls="memo-children-' + e(group.id) + '"' +
    (pending ? ' disabled' : '') + '><span>' + label + '</span></button>' + controls + '</div>' +
    '<div id="memo-children-' + e(group.id) + '" class="memo-tree-notes"' + (open ? '' : ' hidden') + '>' +
    (notes.map(row => listButton('note', row, s.noteId)).join('') || '<p class="memo-empty">还没有笔记，点 ＋ 开始记录。</p>') +
    '</div></div>';
}
function paintLists(root, store) {
  const s = store.state, find = q => root.querySelector(q);
  find('#memo-groups-heading').textContent = s.trash ? '回收站' : '目录';
  const groups = s.groups.filter(group => s.trash ? group.deleted_at ||
    s.notes.some(note => note.group_id === group.id && note.deleted_at) : !group.deleted_at);
  const html = groups.map(group => groupTree(group, s.notes.filter(note => note.group_id === group.id &&
    (s.trash ? note.deleted_at || group.deleted_at : !note.deleted_at)), store)).join('') ||
    '<p class="memo-empty">' + (s.trash ? '回收站是空的。' : '点右上角 ＋ 新建分组。') + '</p>';
  const tree = find('#memo-group-list');
  if (tree.innerHTML !== html) tree.innerHTML = html;
  find('[data-memo-action="new-group"]').hidden = !s.canEdit || s.trash;
  find('[data-memo-action="new-group"]').disabled = Boolean(s.operation?.pending);
  root.querySelectorAll('[data-memo-action="new-note"]').forEach(button => { button.disabled = Boolean(s.operation?.pending); });
}
function paintDrafts(root, store) {
  const drafts = [...store.drafts.values()].filter(item =>
    ['unknown', 'conflict', 'offline', 'error'].includes(item.phase) || item.id !== store.state.noteId && (item.dirty || item.pending));
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
    if (input.dataset.composing !== 'true' && input.value !== item[field]) input.value = item[field] || '';
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
  const actual = phases[item?.phase] || '已保存', routine = ['dirty', 'saving', 'saved'].includes(item?.phase) || !item;
  find('#memo-status').textContent = s.loading ? '正在读取…' : !s.canEdit ? '公开只读' : routine ? '自动保存' : actual;
  find('#memo-status').setAttribute('aria-label', actual);
  find('#memo-status').dataset.phase = item?.phase || 'saved';
  find('#memo-error').hidden = !s.error && !s.storageError;
  find('#memo-error').textContent = [s.error, s.storageError].filter(Boolean).join(' ');
  find('[data-memo-action="login"]').hidden = s.canEdit || s.loading;
  if (!s.canEdit) find('#memo-recovery').hidden = true;
  find('[data-memo-action="exit-trash"]').hidden = !s.trash;
  find('[data-memo-action="back-notes"]').hidden = s.pane !== 'editor';
  const operation = s.operation;
  find('#memo-operation').hidden = !operation?.error && operation?.phase !== 'unknown';
  find('#memo-operation-text').textContent = operation?.error || (operation?.phase === 'saving' ? '正在保存操作…' : '操作结果待核对');
  find('[data-memo-action="operation-check"]').hidden = operation?.phase !== 'unknown';
  find('[data-memo-action="operation-retry"]').hidden = operation?.phase !== 'unknown' || !operation?.retryReady;
  paintLists(root, store); paintDrafts(root, store); paintDocument(root, store);
}
