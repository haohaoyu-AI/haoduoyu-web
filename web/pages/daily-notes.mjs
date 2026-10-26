import {e} from '../core/dom.mjs';
import {dailyNotesBytes, dailyNotesToday, dailyNotesRouteCategory} from '../core/daily-notes-state.mjs';
import {noteDraftNeedsAttention, noteEditorCanCollapse} from '../core/notes-editor-view.mjs';

function legacyEditorMarkup() {
  return '<article id="notes-legacy-card" class="note-entry note-entry-editing notes-legacy-card" hidden>' +
    '<div class="note-entry-head"><span class="note-entry-time">原有记录 <time id="notes-legacy-time" hidden></time></span>' +
    '<span id="notes-legacy-status" class="note-entry-status" role="status" aria-live="polite"></span></div>' +
    '<p id="notes-message" class="notes-message" role="alert" hidden></p>' +
    '<div class="notes-sheet"><label for="notes-editor" class="sr-only">原有记录内容</label>' +
    '<textarea id="notes-editor" class="notes-editor" placeholder="写下一点想说的话…" hidden></textarea>' +
    '<div id="notes-reader" class="notes-reader"></div><p id="notes-empty" hidden>这条记录没有文字。</p></div>' +
    '<div class="notes-footer"><span id="notes-detail" class="notes-detail"></span>' +
    '<div id="notes-write-actions" class="notes-write-actions" hidden>' +
    '<button class="btn" type="button" data-notes-action="save">立即保存</button>' +
    '<button class="btn" type="button" data-notes-action="restore" hidden>恢复原有记录</button>' +
    '<button class="btn text" type="button" data-notes-action="delete">删除原有记录</button></div></div>' +
    '<div id="notes-delete-confirm" class="notes-confirm" hidden><p>删除原有记录？</p>' +
    '<button class="btn" type="button" data-notes-action="cancel-delete">取消</button>' +
    '<button class="btn" type="button" data-notes-action="confirm-delete">确认删除</button></div>' +
    '<div id="notes-resolution" class="notes-resolution" hidden>' +
    '<button class="btn" type="button" data-notes-action="check">核对服务器版本</button>' +
    '<button class="btn" type="button" data-notes-action="retry" hidden>重试同一保存</button>' +
    '<div id="notes-conflict-actions" hidden><p>服务器上的文字：</p><pre id="notes-remote"></pre>' +
    '<button class="btn" type="button" data-notes-action="use-server">采用服务器内容</button>' +
    '<button class="btn" type="button" data-notes-action="use-draft">用此草稿保存到新版本</button></div></div></article>';
}
export function renderDailyNotes() {
  const category = dailyNotesRouteCategory();
  return '<section id="daily-notes" class="daily-notes" aria-label="碎碎念" data-category="' + category + '">' +
    '<div class="notes-categories segmented" role="group" aria-label="碎碎念分类">' + ['life', 'work'].map(value =>
      '<button type="button" data-notes-category="' + value + '" aria-pressed="' + (value === category) + '">' +
      (value === 'work' ? '工作碎碎念' : '生活碎碎念') + '</button>').join('') + '</div>' +
    '<div class="notes-toolbar"><div class="notes-date-controls">' +
    '<button class="btn" type="button" data-notes-action="previous" aria-label="前一天">‹</button>' +
    '<label class="notes-date-label"><span class="sr-only">选择碎碎念日期</span>' +
    '<input id="notes-date" class="input" type="date" max="' + dailyNotesToday() + '"></label>' +
    '<button class="btn" type="button" data-notes-action="next" aria-label="后一天">›</button>' +
    '<button class="btn text" type="button" data-notes-action="today">今天</button></div>' +
    '<span id="notes-status" class="notes-status" role="status" aria-live="polite">正在读取…</span></div>' +
    '<div id="notes-drafts" class="notes-drafts" hidden></div>' +
    '<p id="notes-entry-message" class="notes-message" role="alert" hidden></p>' +
    '<div class="notes-entry-toolbar"><button class="btn notes-add-entry" type="button" data-notes-action="new" hidden>＋ 写一条</button>' +
    '<button class="btn text" type="button" data-notes-action="login" hidden>所有者登录</button></div>' +
    '<section id="notes-composer" class="notes-composer" aria-label="当前编辑的碎碎念" hidden>' +
    '<div class="notes-composer-heading"><span>正在编辑</span>' +
    '<button class="btn text" type="button" data-notes-action="collapse">收起</button></div>' +
    '<div id="notes-active-entry"></div>' + legacyEditorMarkup() + '</section>' +
    '<p id="notes-entry-empty" class="notes-empty" hidden>这一天还没有记录。</p>' +
    '<div id="notes-entry-list" class="notes-entry-list"></div>' +
    '<article id="notes-legacy-saved" class="note-entry note-entry-saved notes-legacy-saved" hidden>' +
    '<div class="note-entry-head"><span>原有记录 <time hidden></time></span><span class="note-entry-status"></span></div>' +
    '<div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p>' +
    '<button class="btn text note-entry-edit" type="button" data-notes-action="edit-legacy">编辑</button></article></section>';
}

const statuses = {loading: '正在读取…', dirty: '等待保存', saving: '正在保存…', conflict: '草稿有冲突',
  unknown: '保存结果待核对', error: '暂未保存', oversize: '文字过长'};
export function noteEntryTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(value));
}
function paintTime(time, value, fallback = '') {
  const actual = noteEntryTime(value);
  time.textContent = actual ? '修改 ' + actual : fallback; time.hidden = !actual && !fallback;
  if (actual) { time.dateTime = value; time.title = '修改时间（北京时间）：' + new Date(value).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'}); }
  else { time.removeAttribute('datetime'); time.removeAttribute('title'); }
}
function paintEditorValue(editor, text) {
  if (editor.dataset.composing === 'true' || editor.value === text) return;
  const active = typeof document !== 'undefined' && document.activeElement === editor,
    start = editor.selectionStart, end = editor.selectionEnd, direction = editor.selectionDirection, scroll = editor.scrollTop;
  editor.value = text;
  if (active) { editor.setSelectionRange(Math.min(start, text.length), Math.min(end, text.length), direction); editor.scrollTop = scroll; }
}
export function paintDailyNotes(root, item, {compatibility = false, editing = false} = {}) {
  if (!root) return;
  const find = selector => root.querySelector(selector), editor = find('#notes-editor'), reader = find('#notes-reader');
  editor.dataset.date = item.date; editor.dataset.category = root.dataset.category || dailyNotesRouteCategory();
  editor.hidden = !editing || !item.loaded || item.deleted;
  editor.readOnly = !item.canEdit; editor.disabled = ['delete', 'restore'].includes(item.pending?.kind);
  paintEditorValue(editor, item.draft);
  reader.hidden = !item.loaded || editing && !item.deleted; reader.textContent = item.deleted ? '原有记录已删除。' : item.serverText;
  find('#notes-empty').hidden = !item.loaded || item.canEdit || Boolean(item.serverText);
  const status = find(compatibility ? '#notes-legacy-status' : '#notes-status');
  status.textContent = statuses[item.phase] || (item.deleted ? '已删除' : item.canEdit ? '已保存' : '公开只读');
  status.dataset.phase = item.phase;
  find('#notes-message').hidden = !item.error; find('#notes-message').textContent = item.error;
  find('#notes-detail').textContent = item.canEdit ? dailyNotesBytes(item.draft) + ' / 65536 字节 · 自动保存' : '所有访客都能阅读';
  find('#notes-write-actions').hidden = !editing || !item.loaded || !item.canEdit;
  const blocked = Boolean(item.pending) || ['conflict', 'unknown'].includes(item.phase);
  find('[data-notes-action="save"]').disabled = blocked || !item.dirty;
  find('[data-notes-action="restore"]').hidden = !item.deleted;
  find('[data-notes-action="restore"]').disabled = blocked || item.dirty;
  find('[data-notes-action="delete"]').disabled = blocked || item.deleted || item.version === 0;
  find('#notes-resolution').hidden = !['conflict', 'unknown'].includes(item.phase) && item.phase !== 'error';
  find('[data-notes-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find('[data-notes-action="retry"]').hidden = item.phase !== 'unknown' || !item.pending?.retryReady || !item.canEdit;
  find('#notes-conflict-actions').hidden = item.phase !== 'conflict' || !item.remote;
  find('#notes-remote').textContent = item.remote?.deleted ? '（原有记录已删除）' : item.remote?.text || '（空白）';
  find('[data-notes-action="use-draft"]').disabled = item.remote?.can_edit !== true;
  if (compatibility) paintTime(find('#notes-legacy-time'), item.updatedAt);
}
function entryControlsMarkup() {
  return '<p class="note-entry-message" role="alert" hidden></p><div class="note-entry-actions">' +
    '<button class="btn text" type="button" data-note-entry-action="save" hidden>重试保存</button>' +
    '<button class="btn text" type="button" data-note-entry-action="restore" hidden>恢复</button>' +
    '<button class="btn text" type="button" data-note-entry-action="delete">删除</button></div>' +
    '<div class="note-entry-confirm notes-confirm" hidden><p>删除这条记录？</p>' +
    '<button class="btn" type="button" data-note-entry-action="cancel-delete">取消</button>' +
    '<button class="btn" type="button" data-note-entry-action="confirm-delete">确认删除</button></div>' +
    '<div class="note-entry-resolution notes-resolution" hidden><button class="btn" type="button" data-note-entry-action="check">核对保存结果</button>' +
    '<button class="btn" type="button" data-note-entry-action="retry" hidden>重试原保存</button>' +
    '<div class="note-entry-conflict" hidden><p>服务器上的文字：</p><pre></pre>' +
    '<button class="btn" type="button" data-note-entry-action="use-server">采用服务器内容</button>' +
    '<button class="btn" type="button" data-note-entry-action="use-draft">用此草稿保存</button></div></div>';
}
function createEntryElement(item, editing) {
  const node = document.createElement('article');
  node.className = 'note-entry ' + (editing ? 'note-entry-editing' : 'note-entry-saved'); node.dataset.noteEntry = item.id;
  node.innerHTML = '<div class="note-entry-head"><time class="note-entry-time"></time>' +
    '<span class="note-entry-status" role="status" aria-live="polite"></span></div>' + (editing ?
    '<label class="sr-only" for="entry-' + e(item.id) + '">碎碎念内容</label>' +
    '<textarea id="entry-' + e(item.id) + '" class="note-entry-editor" data-note-entry-editor="' + e(item.id) +
    '" placeholder="写下一点想说的话…" rows="3"></textarea><div class="note-entry-reader" hidden></div>' + entryControlsMarkup() :
    '<div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p>' +
    '<button class="btn text note-entry-edit" type="button" data-note-entry-action="edit">编辑</button>');
  return node;
}
function paintEntrySummary(node, item) {
  paintTime(node.querySelector('time'), item.updatedAt, item.version ? '' : '新记录');
  const status = node.querySelector('.note-entry-status');
  status.textContent = statuses[item.phase] || (item.deleted ? '已删除' : item.version ? '已保存' : '写下后自动保存');
  status.dataset.phase = item.phase;
  const message = node.querySelector('.note-entry-message'); message.textContent = item.error; message.hidden = !item.error;
}
function paintSavedEntry(node, item) {
  paintEntrySummary(node, item);
  const draft = noteDraftNeedsAttention(item), body = node.querySelector('.note-entry-reader');
  body.textContent = item.deleted ? '这条记录已删除。' : draft ? item.draft : item.serverText;
  body.classList.toggle('note-entry-draft-label', draft); node.dataset.draft = String(draft);
  const edit = node.querySelector('[data-note-entry-action="edit"]'); edit.hidden = !item.canEdit && !draft;
  edit.textContent = draft ? '继续编辑草稿' : item.deleted ? '查看' : '编辑';
}
function paintEntryEditor(node, item, confirmId) {
  paintEntrySummary(node, item);
  const find = selector => node.querySelector(selector), editor = find('textarea');
  editor.dataset.date = item.date; editor.dataset.category = item.category;
  editor.hidden = item.deleted; editor.readOnly = !item.canEdit;
  editor.disabled = ['delete', 'restore'].includes(item.pending?.kind); paintEditorValue(editor, item.draft);
  const reader = find('.note-entry-reader'); reader.textContent = item.deleted ? '这条记录已删除。' : item.serverText;
  reader.hidden = !item.deleted;
  find('.note-entry-actions').hidden = !item.canEdit;
  const busy = Boolean(item.pending) || ['conflict', 'unknown'].includes(item.phase);
  const save = find('[data-note-entry-action="save"]'); save.hidden = !['error', 'oversize'].includes(item.phase);
  save.disabled = busy || !item.dirty || item.phase === 'oversize';
  find('[data-note-entry-action="delete"]').hidden = item.deleted;
  find('[data-note-entry-action="delete"]').disabled = busy;
  find('[data-note-entry-action="restore"]').hidden = !item.deleted;
  find('[data-note-entry-action="restore"]').disabled = busy;
  find('.note-entry-confirm').hidden = confirmId !== item.id;
  find('.note-entry-resolution').hidden = !['unknown', 'conflict'].includes(item.phase) && item.phase !== 'error';
  find('[data-note-entry-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find('[data-note-entry-action="retry"]').hidden = item.phase !== 'unknown' || !item.pending?.retryReady || !item.canEdit;
  find('.note-entry-conflict').hidden = item.phase !== 'conflict' || !item.remote;
  find('.note-entry-conflict pre').textContent = item.remote?.deleted ? '（这条记录已删除）' : item.remote?.text || '（空白）';
  find('[data-note-entry-action="use-draft"]').disabled = !item.remote?.can_edit || item.remote?.deleted;
}
const editorNodes = new WeakMap();
function paintActiveEditor(root, store, active, legacy, confirmId) {
  const host = root.querySelector('#notes-active-entry');
  if (!editorNodes.has(root)) editorNodes.set(root, new Map());
  const nodes = editorNodes.get(root), item = store.entry(active);
  host.hidden = !item;
  if (item) {
    if (!nodes.has(active)) nodes.set(active, createEntryElement(item, true));
    const node = nodes.get(active);
    if (host.firstElementChild !== node) host.replaceChildren(node);
    paintEntryEditor(node, item, confirmId);
  }
  root.querySelector('#notes-legacy-card').hidden = active !== 'legacy';
  paintDailyNotes(root, legacy, {compatibility: true, editing: active === 'legacy'});
}
function paintLegacySummary(root, legacy, active) {
  const node = root.querySelector('#notes-legacy-saved'), draft = noteDraftNeedsAttention(legacy);
  node.hidden = active === 'legacy' || !(legacy.version > 0 || draft);
  paintTime(node.querySelector('time'), legacy.updatedAt);
  node.querySelector('.note-entry-reader').textContent = legacy.deleted ? '原有记录已删除。' : draft ? legacy.draft : legacy.serverText;
  node.querySelector('.note-entry-status').textContent = statuses[legacy.phase] || (legacy.deleted ? '已删除' : '已保存');
  node.querySelector('.note-entry-message').textContent = legacy.error;
  node.querySelector('.note-entry-message').hidden = !legacy.error;
  const edit = node.querySelector('[data-notes-action="edit-legacy"]'); edit.hidden = !legacy.canEdit && !draft;
  edit.textContent = draft ? '继续编辑草稿' : legacy.deleted ? '查看' : '编辑';
}
function paintRetainedDrafts(root, current, drafts) {
  const box = root.querySelector('#notes-drafts');
  const retained = [...new Set(drafts.filter(value => value.date !== current.date || value.category !== current.category)
    .map(value => value.category + ':' + value.date))];
  box.hidden = !retained.length;
  box.innerHTML = '<span>保留的草稿：</span>' + retained.map(key => {
    const [category, date] = key.split(':');
    return '<button class="btn text" type="button" data-notes-draft-category="' + e(category) + '" data-notes-date="' + e(date) + '">' +
      (category === 'work' ? '工作 ' : '生活 ') + e(date) + '</button>';
  }).join('');
}

// Saved cards contain plain text; the single active field is kept intact across acknowledgements.
export function paintNoteEntries(root, store, current, legacy, {drafts = [], confirmId = '', active = ''} = {}) {
  const find = selector => root.querySelector(selector), list = find('#notes-entry-list');
  root.dataset.date = current.date;
  const dateInput = find('#notes-date'); if (dateInput.value !== current.date) dateInput.value = current.date;
  find('[data-notes-action="next"]').disabled = current.date >= dailyNotesToday();
  const canEdit = current.loaded && current.canEdit;
  find('[data-notes-action="new"]').hidden = !canEdit;
  find('[data-notes-action="login"]').hidden = !current.loaded || current.canEdit;
  find('#notes-entry-message').textContent = current.error; find('#notes-entry-message').hidden = !current.error;
  const items = current.ids.map(id => store.entry(id)).filter(Boolean);
  const saved = items.filter(item => item.id !== active && (item.version > 0 || noteDraftNeedsAttention(item)));
  const nodes = new Map([...list.children].map(node => [node.dataset.noteEntry, node])), wanted = new Set(saved.map(item => item.id));
  for (const [id, node] of nodes) if (!wanted.has(id)) node.remove();
  let cursor = list.firstElementChild;
  for (const item of saved) {
    const node = nodes.get(item.id) || createEntryElement(item, false);
    if (node === cursor) cursor = cursor.nextElementSibling;
    else list.insertBefore(node, cursor);
    paintSavedEntry(node, item);
  }
  paintActiveEditor(root, store, active, legacy, confirmId); paintLegacySummary(root, legacy, active);
  const composer = find('#notes-composer'), activeItem = active === 'legacy' ? legacy : store.entry(active);
  composer.hidden = !activeItem; composer.dataset.active = active;
  find('[data-notes-action="collapse"]').disabled = !noteEditorCanCollapse(activeItem);
  find('#notes-entry-empty').hidden = !current.loaded || Boolean(activeItem) || saved.length > 0 || legacy.version > 0 || noteDraftNeedsAttention(legacy);
  const unresolved = items.some(noteDraftNeedsAttention) || noteDraftNeedsAttention(legacy);
  find('#notes-status').textContent = !current.loaded && current.loading ? '正在读取…' : current.error ? '读取失败' :
    unresolved ? '有草稿待保存' : canEdit ? '自动保存' : current.loaded ? '公开只读' : '正在读取…';
  paintRetainedDrafts(root, current, drafts);
}
