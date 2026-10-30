import {e} from '../core/dom.mjs';

const button = (action, label, extra = '') => '<button type="button" class="btn" data-memo-action="' +
  action + '" ' + extra + '>' + label + '</button>';
export function renderMemos() {
  return '<section id="memos" data-pane="groups" aria-label="长期备忘录">' +
    '<div class="memo-toolbar"><div class="memo-mobile-back">' + button('back-notes', '‹ 返回笔记') +
    '</div>' +
    '<div class="memo-toolbar-actions">' + button('exit-trash', '‹ 返回工作台设置', 'hidden') + button('login', '所有者登录', 'hidden') + '</div></div>' +
    button('empty-trash', '清空回收站', 'hidden') +
    '<p id="memo-error" class="memo-message" role="alert" hidden></p>' +
    '<div id="memo-operation" class="memo-message" hidden><p id="memo-operation-text" role="status"></p>' +
    button('operation-check', '核对操作结果') + button('operation-retry', '重试同一操作', 'hidden') + '</div>' +
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
    button('new-note', '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 4H5v16h12v-7M8 16l1-3 8-8 2 2-8 8-3 1ZM18 13v6m-3-3h6"/></svg>', 'hidden aria-label="新建笔记" title="新建笔记"') + '</div>' +
    '<div id="memo-group-list" class="memo-list"></div></aside>' +
    '<div id="memo-resizer" class="memo-resizer" role="separator" tabindex="0" aria-orientation="vertical" ' +
    'aria-label="调整笔记列表宽度" aria-controls="memo-group-list memo-document" aria-valuemin="160" aria-valuemax="480" aria-valuenow="240" ' +
    'title="拖动调整列表与正文比例；方向键微调，Home / End 到边界"></div>' +
    '<article class="memo-editor" aria-label="笔记内容"><div id="memo-save-notice" class="memo-save-notice" hidden>' +
    '<span id="memo-status" role="status" aria-live="polite" hidden></span>' +
    '<span id="memo-note-error" role="alert" hidden></span><div id="memo-drafts" class="memo-drafts" hidden></div>' +
    button('recovery', '找回本机草稿', 'hidden') + '</div><p id="memo-empty" class="memo-empty">选择一篇笔记，长期记录常用信息。</p>' +
    '<div id="memo-document" hidden><div class="memo-document-heading"><div class="memo-heading-title">' +
    '<label for="memo-title" class="sr-only">笔记标题</label>' +
    '<input id="memo-title" class="memo-title" maxlength="120" placeholder="笔记标题" autocomplete="off">' +
    '<h2 id="memo-read-title" class="memo-read-title" hidden></h2>' +
    '<time id="memo-edited-at" class="memo-edited-at" hidden></time></div>' +
    button('fullscreen', '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" aria-hidden="true">' +
    '<path d="M14 4h6v6m0-6-7 7M10 20H4v-6m0 6 7-7" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'aria-label="放大正文" title="放大正文" aria-expanded="false"') + '</div>' +
    '<label for="memo-body" class="sr-only">笔记正文</label>' +
    '<textarea id="memo-body" class="memo-body" placeholder="写下需要长期记住的信息…"></textarea>' +
    '<div id="memo-read-body" class="memo-read-body" tabindex="0" hidden></div>' +
    '<div class="memo-document-footer"><span id="memo-detail"></span><div id="memo-note-actions" hidden>' +
    '<details class="memo-document-menu"><summary aria-label="笔记操作">⋯</summary><div class="memo-context-actions">' +
    button('save', '立即保存') + button('delete-note', '删除笔记') + button('restore-note', '恢复笔记', 'hidden') +
    '</div></details></div></div>' +
    '<div id="memo-resolution" class="memo-resolution" hidden>' + button('check', '核对服务器结果') +
    button('retry', '重试同一保存', 'hidden') + '<div id="memo-conflict" hidden><h3>服务器上的内容</h3>' +
    '<pre id="memo-remote"></pre>' + button('use-server', '采用服务器内容') +
    button('use-draft', '用此草稿保存到新版本') + '</div></div></div></article></div><dialog id="memo-fullscreen" aria-label="备忘录正文全屏"></dialog></section>';
}
const phases = {dirty: '等待自动保存', saving: '正在保存…', unknown: '保存结果待核对', conflict: '版本冲突 · 草稿已保留',
  queued: '已保存到本机 · 等待同步',
  offline: '离线 · 草稿保留在本机', error: '暂未保存 · 草稿已保留', oversize: '正文超过 64 KiB', loading: ''};
const active = (rows, trash) => rows.filter(row => Boolean(row.deleted_at) === trash);
function paintEditedTime(node, item) {
  const local = item.localQueued && item.localUpdatedAt;
  const value = local || item.updated_at;
  const timestamp = value && Date.parse(value);
  node.hidden = !Number.isFinite(timestamp);
  node.dateTime = node.hidden ? '' : value;
  node.textContent = node.hidden ? '' : new Intl.DateTimeFormat('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false}).format(timestamp);
}
function listButton(kind, row, current, subtitle = '') {
  return '<button type="button" class="memo-list-item' + (row.id === current ? ' is-selected' : '') + '" data-memo-' + kind +
    '="' + e(row.id) + '" aria-pressed="' + (row.id === current) + '"><span>' + e(row.title) + '</span>' +
    (subtitle ? '<small>' + e(subtitle) + '</small>' : '') + '</button>';
}
function flatNoteRow(note, store) {
  const s = store.state, group = s.groups.find(row => row.id === note.group_id);
  const deleted = Boolean(note.deleted_at || group?.deleted_at), extra = ' data-memo-target="' + e(note.id) + '"';
  const control = !s.canEdit ? '' : s.trash ? button('restore-note', '恢复', extra) :
    button('delete-note', '×', extra + ' aria-label="删除' + e(note.title) + '" title="移至回收站"');
  const removed = note.deleted_at || group?.deleted_at;
  const days = removed ? Math.max(0,30-Math.floor((Date.now()-Date.parse(removed))/86400000)) : 0;
  const retention = s.trash ? '<small class="memo-retention">' +
    (days ? '30天恢复期 · 剩余' + days + '天' : '已超过30天') + '</small>' : '';
  return '<div class="memo-flat-row">' + listButton('note', note, s.noteId) + control + retention + '</div>';
}
function paintLists(root, store) {
  const s = store.state, find = q => root.querySelector(q);
  find('#memo-groups-heading').textContent = s.trash ? '回收站' : '';
  find('#memo-groups-heading').hidden = !s.trash || Boolean(root.closest('.workbench-settings'));
  const notes = s.notes.filter(note => {
    const group = s.groups.find(row => row.id === note.group_id);
    return Boolean(note.deleted_at || group?.deleted_at) === s.trash;
  });
  const html = notes.map(note => flatNoteRow(note, store)).join('') ||
    '<p class="memo-empty">' + (s.trash ? '回收站是空的。' : '点 ＋ 开始记录。') + '</p>';
  const list = find('#memo-group-list');
  if (list.innerHTML !== html) list.innerHTML = html;
  find('[data-memo-action="new-note"]').hidden = !s.canEdit || s.trash;
  root.querySelectorAll('.memo-flat-row button,[data-memo-action="new-note"]').forEach(button => {
    button.disabled = Boolean(s.operation?.pending);
  });
}
function paintDrafts(root, store) {
  const drafts = [...store.drafts.values()].filter(item =>
    ['unknown', 'conflict', 'offline', 'error'].includes(item.phase) || item.id !== store.state.noteId && (item.dirty || item.pending));
  const box = root.querySelector('#memo-drafts');
  box.hidden = store.state.trash || !store.state.canEdit || !drafts.length;
  box.innerHTML = '<span>本机保留的草稿：</span>' + drafts.map(item =>
    '<button type="button" class="btn text" data-memo-draft="' + e(item.id) + '">' + e(item.title || '未命名笔记') + '</button>').join('');
}
function paintDocument(root, store) {
  const s = store.state, item = store.drafts.get(s.noteId), find = q => root.querySelector(q);
  find('#memo-empty').hidden = Boolean(item);
  find('#memo-empty').textContent = s.trash ? '选择笔记查看' : '选择一篇笔记';
  find('#memo-document').hidden = !item;
  if (!item) { find('#memo-note-error').hidden = true; find('#memo-note-error').textContent = ''; return; }
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
  paintEditedTime(find('#memo-edited-at'), item);
  find('#memo-detail').textContent = deleted ? '已删除 · 可恢复' : s.canEdit ? '' : '公开只读';
  find('#memo-note-actions').hidden = !s.canEdit;
  find('[data-memo-action="save"]').hidden = deleted;
  find('[data-memo-action="save"]').disabled = !item.dirty || Boolean(item.pending) || item.phase === 'conflict';
  root.querySelector('#memo-note-actions [data-memo-action="delete-note"]').hidden = true;
  const restore = root.querySelector('#memo-note-actions [data-memo-action="restore-note"]');
  restore.hidden = !deleted; restore.disabled = Boolean(s.operation?.pending || item.pending);
  const expanded = find('#memo-fullscreen').open, zoom = find('[data-memo-action="fullscreen"]');
  zoom.setAttribute('aria-label', expanded ? '退出全屏' : '放大正文');
  zoom.setAttribute('title', expanded ? '退出全屏' : '放大正文');
  zoom.setAttribute('aria-expanded', String(expanded));
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
  const actual = phases[item?.phase] || '已保存', routine = ['dirty', 'saving', 'saved', 'loading'].includes(item?.phase) || !item;
  find('#memo-status').textContent = s.loading ? '' : !s.canEdit ? '公开只读' : routine ? '自动保存' : actual;
  find('#memo-status').hidden = s.loading || s.trash || s.canEdit && routine;
  find('#memo-status').setAttribute('aria-label', actual);
  find('#memo-status').dataset.phase = item?.phase || 'saved';
  find('#memo-error').hidden = !s.error && !s.storageError;
  find('#memo-error').textContent = [s.error, s.storageError].filter(Boolean).join(' ');
  find('[data-memo-action="login"]').hidden = s.canEdit || s.loading;
  if (!s.canEdit) find('#memo-recovery').hidden = true;
  find('[data-memo-action="exit-trash"]').hidden = !s.trash || root.closest('.workbench-settings') !== null;
  find('[data-memo-action="back-notes"]').hidden = s.pane !== 'editor';
  const operation = s.operation;
  find('#memo-operation').hidden = !operation?.error && operation?.phase !== 'unknown';
  find('#memo-operation-text').textContent = operation?.error || (operation?.phase === 'saving' ? '正在保存操作…' : '操作结果待核对');
  find('[data-memo-action="operation-check"]').hidden = operation?.phase !== 'unknown';
  find('[data-memo-action="operation-retry"]').hidden = operation?.phase !== 'unknown' || !operation?.retryReady;
  paintLists(root, store); paintDrafts(root, store); paintDocument(root, store);
  const recovery = find('[data-memo-action="recovery"]');
  recovery.hidden = !s.canEdit || s.trash || find('#memo-drafts').hidden && find('#memo-note-error').hidden &&
    !['error', 'offline', 'unknown', 'conflict'].includes(item?.phase);
  find('#memo-save-notice').hidden = find('#memo-status').hidden && find('#memo-note-error').hidden &&
    find('#memo-drafts').hidden && recovery.hidden;
}
