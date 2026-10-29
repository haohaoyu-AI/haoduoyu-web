import {e} from '../core/dom.mjs';
import {dailyNotesToday, dailyNotesRouteCategory} from '../core/daily-notes-state.mjs';
import {noteDraftNeedsAttention, noteEditorCanCollapse} from '../core/notes-editor-view.mjs';
import {renderNotesMonthMarkup} from '../notes-month-controller.mjs';

function legacyEditorMarkup() {
  return '<article id="notes-legacy-card" class="note-entry note-entry-editing notes-legacy-card" hidden>' +
    '<div class="note-entry-head"><time id="notes-legacy-time" class="note-entry-time" hidden></time>' +
    '<span id="notes-legacy-status" class="note-entry-status" role="status" aria-live="polite"></span></div>' +
    '<p id="notes-message" class="notes-message" role="alert" hidden></p>' +
    '<div class="notes-sheet"><label for="notes-editor" class="sr-only">原有记录内容</label>' +
    '<textarea id="notes-editor" class="notes-editor" aria-label="原有记录或保留草稿，只读" readonly hidden></textarea>' +
    '<div id="notes-reader" class="notes-reader"></div><p id="notes-empty" hidden>这条记录没有文字。</p></div>' +
    '<div class="notes-footer"><span id="notes-detail" class="notes-detail"></span>' +
    '<button class="btn text" type="button" data-notes-action="export-legacy" hidden>导出保留的原有草稿</button>' +
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
    '<div class="segmented" role="group" aria-label="碎碎念视图">' +
    '<button type="button" data-notes-view="today" aria-pressed="true">今日碎碎念</button>' +
    '<button type="button" data-notes-view="history" aria-pressed="false">历史</button>' +
    '<button type="button" data-notes-view="labels" aria-pressed="false">标签</button></div>' +
    '<section id="notes-history" hidden aria-label="碎碎念历史">' +
    '<div class="notes-calendar-layout"><aside class="notes-calendar-filters">' +
    '<label>月份 <input type="month" id="notes-history-month" class="input"></label>' +
    '<div class="notes-calendar-month-actions"><button type="button" class="notes-month-step" data-notes-month="prev" aria-label="上个月" title="上个月">▲</button>' +
    '<button type="button" class="notes-month-step" data-notes-month="next" aria-label="下个月" title="下个月">▼</button></div>' +
    '<label hidden>周次 <select id="notes-history-week" class="input"><option value="">全部周次</option></select></label>' +
    '<label>标签 <select id="notes-history-label" class="input"><option value="">全部标签</option></select></label>' +
    '<label hidden>日期 <select id="notes-history-date" class="input"></select></label></aside>' +
    '<div class="notes-calendar-main"><div class="notes-history-views" role="group" aria-label="历史显示方式"><button type="button" data-history-display="calendar" aria-pressed="true">日历</button><button type="button" data-history-display="timeline" aria-pressed="false">时间轴</button><button type="button" class="notes-timeline-order" data-history-order="desc" aria-label="切换时间轴排序" hidden>时间：从新到旧</button></div><p id="notes-history-summary" class="notes-calendar-summary"></p>' +
    '<p id="notes-history-status" role="status" aria-live="polite"></p>' +
    '<div class="notes-calendar-weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span>' +
    '<span>四</span><span>五</span><span>六</span><span>日</span></div>' +
    '<div id="notes-history-grid" class="notes-calendar-grid"></div>' +
    '<div id="notes-history-list" class="notes-entry-list"></div></div></div></section>' +
    '<section id="notes-labels" hidden aria-label="标签管理">' +
    '<div class="notes-categories"><label><span class="sr-only">新标签名称</span><input id="notes-new-label" class="input" maxlength="64" placeholder="新标签"></label>' +
    '<button class="btn text" type="button" data-notes-action="create-label">添加标签</button>' +
    '<span id="notes-label-status" role="status" aria-live="polite"></span></div><ul id="notes-label-list"></ul></section>' +
    '<div id="notes-today">' +
    '<div class="notes-toolbar"><div class="notes-date-controls">' +
    '<button class="btn" type="button" data-notes-action="previous" aria-label="前一天">‹</button>' +
    '<label class="notes-date-label"><span class="sr-only">选择碎碎念日期</span>' +
    '<input id="notes-date" class="input" type="date" max="' + dailyNotesToday() + '"></label>' +
    '<button class="btn" type="button" data-notes-action="next" aria-label="后一天">›</button>' +
    '<button class="btn text" type="button" data-notes-action="today">今天</button></div>' +
    '<span id="notes-status" class="notes-status" role="status" aria-live="polite"></span></div>' +
    '<div id="notes-drafts" class="notes-drafts" hidden></div>' +
    '<p id="notes-entry-message" class="notes-message" role="alert" hidden></p>' +
    '<div class="notes-entry-toolbar"><button class="btn notes-add-entry" type="button" data-notes-action="new" hidden>＋ 写一条</button>' +
    '<button class="btn text" type="button" data-notes-action="login" hidden>所有者登录</button></div>' +
    '<section id="notes-composer" class="notes-composer" aria-label="当前编辑的碎碎念" hidden>' +
    '<label>分类 <select id="notes-compose-label" class="input"><option value="生活">生活</option><option value="工作">工作</option></select></label>' +
    '<div class="notes-composer-heading" hidden><button class="btn text" type="button" data-notes-action="collapse">收起</button></div>' +
    '<div id="notes-active-entry"></div>' + legacyEditorMarkup() + '</section>' +
    '<p id="notes-entry-empty" class="notes-empty" hidden>这一天还没有记录。</p>' +
    '<div id="notes-unpublished" class="notes-entry-list"></div><details class="notes-published"><summary>已发布记录</summary><div id="notes-entry-list" class="notes-entry-list"></div>' +
    '<article id="notes-legacy-saved" class="note-entry note-entry-saved notes-legacy-saved" hidden>' +
    '<div class="note-entry-head"><time class="note-entry-time" hidden></time><span class="note-entry-status"></span></div>' +
    '<div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p>' +
    '<button class="btn text note-entry-edit" type="button" data-notes-action="edit-legacy">查看原有记录</button>' +
    '<button class="btn text" type="button" data-notes-action="export-legacy" hidden>导出保留的原有草稿</button></article></details></div></section>';
}

const statuses = {loading: '', dirty: '未发送', saving: '发送中…', conflict: '草稿有冲突',
  unknown: '保存结果待核对', error: '暂未保存', oversize: '文字过长', queued: '已存本机，待同步', cached: '本机缓存'};
function retainedLegacy(item) {
  return Boolean(item.dirty || item.pending || ['unknown', 'conflict', 'oversize', 'error'].includes(item.phase));
}
function displayedText(item) {
  if (item.dirty || item.phase !== 'queued' && noteDraftNeedsAttention(item)) return item.draft;
  return item.localBacked || item.localQueued || item.phase === 'queued' ? item.durableText ?? item.draft : item.serverText;
}
export function noteEntryTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(value));
}
function paintTime(time, value) {
  const actual = noteEntryTime(value);
  time.textContent = actual; time.hidden = !actual;
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
  const retained = retainedLegacy(item);
  editor.dataset.date = item.date; editor.dataset.category = root.dataset.category || dailyNotesRouteCategory();
  editor.hidden = !editing || !item.loaded || item.deleted && !retained;
  editor.readOnly = true; editor.disabled = false;
  paintEditorValue(editor, item.draft);
  reader.hidden = !item.loaded || editing && (!item.deleted || retained);
  reader.textContent = retained ? item.draft : item.deleted ? '原有记录已删除。' : item.serverText;
  find('#notes-empty').hidden = !item.loaded || Boolean(item.serverText || retained && item.draft);
  const status = find(compatibility ? '#notes-legacy-status' : '#notes-status');
  status.textContent = retained ? statuses[item.phase] || '保留的原有草稿' : item.deleted ? '原有记录已删除' : '原有记录 · 只读';
  status.dataset.phase = item.phase;
  find('#notes-message').hidden = !item.error; find('#notes-message').textContent = item.error;
  find('#notes-detail').textContent = retained ? '原有草稿已保留，仅供查看与导出，不会自动上传。' : '原有逐日记录，只读保留。';
  find('#notes-write-actions').hidden = true;
  for (const action of ['save', 'restore', 'delete', 'retry', 'use-server', 'use-draft', 'confirm-delete']) {
    const button = find('[data-notes-action="' + action + '"]'); button.hidden = true; button.disabled = true;
  }
  find('#notes-legacy-card [data-notes-action="export-legacy"]').hidden = !retained;
  find('#notes-delete-confirm').hidden = true;
  find('#notes-resolution').hidden = true;
  find('[data-notes-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find('#notes-conflict-actions').hidden = true;
  find('#notes-remote').textContent = item.remote?.deleted ? '（原有记录已删除）' : item.remote?.text || '（空白）';
  if (compatibility) paintTime(find('#notes-legacy-time'), item.updatedAt);
}
function entryControlsMarkup() {
  return '<p class="note-entry-message" role="alert" hidden></p><div class="note-entry-actions">' +
    '<button class="btn note-entry-send" type="button" data-note-entry-action="save" aria-label="发送">发送</button>' +
    '<span class="note-entry-send-feedback" role="status" aria-live="polite"></span>' +
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
  node.dataset.category = item.category;
  node.innerHTML = '<div class="note-entry-head"><span class="note-entry-label"></span><time class="note-entry-time"></time>' +
    '<span class="note-entry-status" role="status" aria-live="polite"></span></div>' + (editing ?
    '<label class="sr-only" for="entry-' + e(item.id) + '">碎碎念内容</label>' +
    '<textarea id="entry-' + e(item.id) + '" class="note-entry-editor" data-note-entry-editor="' + e(item.id) +
    '" placeholder="写下一点想说的话…" rows="3"></textarea><fieldset class="note-entry-labels"><legend>标签（可多选）</legend><div class="note-entry-label-options"></div></fieldset><div class="note-entry-reader" hidden></div>' + entryControlsMarkup() :
    '<div class="note-entry-reader"></div><p class="note-entry-message" role="status" hidden></p>' +
    '<span class="note-entry-send-feedback" role="status" aria-live="polite"></span>' +
    '<button class="btn text note-entry-edit" type="button" data-note-entry-action="edit">编辑</button>');
  return node;
}
function paintEntrySummary(node, item) {
  node.dataset.category = item.category;
  node.querySelector('.note-entry-label').textContent = item.category === 'work' ? '工作' :
    !item.labelKnown || !item.labelComplete ? '标签待联网核实' : item.labels?.length ? item.labels.join('、') : item.label || '生活';
  paintTime(node.querySelector('time'), item.updatedAt);
  const status = node.querySelector('.note-entry-status');
  status.textContent = statuses[item.phase] || (item.deleted ? '已删除' : item.version ? '已保存' : '未发送');
  status.dataset.phase = item.phase;
  const message = node.querySelector('.note-entry-message'); message.textContent = item.error; message.hidden = !item.error;
}
function paintSavedEntry(node, item) {
  paintEntrySummary(node, item);
  node.querySelector('.note-entry-send-feedback').textContent =
    item.manualSubmitted && !item.dirty && item.phase === 'saved' ? '发送成功' : '';
  const draft = noteDraftNeedsAttention(item), body = node.querySelector('.note-entry-reader');
  body.textContent = item.deleted ? '这条记录已删除。' : displayedText(item);
  body.classList.toggle('note-entry-draft-label', draft); node.dataset.draft = String(draft);
  const edit = node.querySelector('[data-note-entry-action="edit"]'); edit.hidden = !item.canEdit && !draft;
  edit.textContent = draft ? '继续编辑草稿' : item.deleted ? '查看' : '编辑';
}
function paintEntryEditor(node, item, confirmId, labels) {
  paintEntrySummary(node, item);
  const find = selector => node.querySelector(selector), editor = find('textarea');
  editor.dataset.date = item.date; editor.dataset.category = item.category;
  editor.hidden = item.deleted; editor.readOnly = !item.canEdit;
  editor.disabled = ['delete', 'restore'].includes(item.pending?.kind); paintEditorValue(editor, item.draft);
  const fieldset = find('.note-entry-labels'), options = find('.note-entry-label-options');
  fieldset.hidden = item.category !== 'life' || item.deleted;
  fieldset.disabled = !item.canEdit || !item.labelComplete || Boolean(item.pending);
  fieldset.title = item.labelComplete ? '' : '请联网读取完整标签后再修改。';
  const available = [...new Set([...labels, ...(item.labels || [])])];
  if (JSON.stringify([...options.querySelectorAll('input')].map(input => input.value)) !== JSON.stringify(available)) {
    options.replaceChildren(...available.map(value => {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.value = value; input.dataset.noteLabel = item.id;
      label.append(input, document.createTextNode(value)); return label;
    }));
  }
  for (const input of options.querySelectorAll('input')) input.checked = (item.labels || []).includes(input.value);

  const reader = find('.note-entry-reader'); reader.textContent = item.deleted ? '这条记录已删除。' : item.serverText;
  reader.hidden = !item.deleted;
  find('.note-entry-actions').hidden = !item.canEdit;
  const busy = Boolean(item.pending) || ['conflict', 'unknown'].includes(item.phase);
  const save = find('[data-note-entry-action="save"]'); save.hidden = item.deleted || !item.canEdit;
  save.textContent = item.pending ? '发送中…' : item.phase === 'error' ? '重试发送' : '发送';
  save.setAttribute('aria-label', save.textContent);
  save.disabled = busy || !item.dirty || item.composing || item.phase === 'oversize';
  const feedback = find('.note-entry-send-feedback');
  feedback.textContent = item.pending ? '发送中…' : !item.manualSubmitted || item.dirty ? '' :
    item.phase === 'queued' ? '已存本机，待同步' : item.phase === 'saved' ? '发送成功' : '';
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
function paintActiveEditor(root, store, active, legacy, confirmId, labels) {
  const host = root.querySelector('#notes-active-entry');
  if (!editorNodes.has(root)) editorNodes.set(root, new Map());
  const nodes = editorNodes.get(root), item = store.entry(active);
  host.hidden = !item;
  if (item) {
    if (!nodes.has(active)) nodes.set(active, createEntryElement(item, true));
    const node = nodes.get(active);
    if (host.firstElementChild !== node) host.replaceChildren(node);
    paintEntryEditor(node, item, confirmId, labels);
  }
  root.querySelector('#notes-legacy-card').hidden = active !== 'legacy';
  paintDailyNotes(root, legacy, {compatibility: true, editing: active === 'legacy'});
}
function paintLegacySummary(root, legacy, active) {
  const node = root.querySelector('#notes-legacy-saved'), draft = retainedLegacy(legacy);
  let label = node.querySelector('.note-entry-label');
  if (!label) { label = document.createElement('span'); label.className = 'note-entry-label'; node.querySelector('.note-entry-head').prepend(label); }
  label.textContent = root.dataset.category === 'work' ? '工作' : '生活';
  node.hidden = active === 'legacy' || !(legacy.version > 0 || draft);
  paintTime(node.querySelector('time'), legacy.updatedAt);
  node.querySelector('.note-entry-reader').textContent = draft ? legacy.draft : legacy.deleted ? '原有记录已删除。' : legacy.serverText;
  node.querySelector('.note-entry-status').textContent = draft ? statuses[legacy.phase] || '保留的原有草稿' : '原有记录 · 只读';
  node.querySelector('.note-entry-status').dataset.phase = legacy.phase;
  node.querySelector('.note-entry-message').textContent = legacy.error;
  node.querySelector('.note-entry-message').hidden = !legacy.error;
  const edit = node.querySelector('[data-notes-action="edit-legacy"]'); edit.hidden = false;
  edit.textContent = draft ? '查看保留的原有草稿' : '查看原有记录';
  node.querySelector('[data-notes-action="export-legacy"]').hidden = !draft;
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

function paintOtherLegacy(root, list, legacy, category) {
  let node = root.querySelector('#notes-legacy-other');
  if (!node) {
    node = document.createElement('article'); node.id = 'notes-legacy-other';
    node.className = 'note-entry note-entry-saved notes-legacy-saved';
    node.innerHTML = '<div class="note-entry-head"><span class="note-entry-label"></span><time class="note-entry-time" hidden></time>' +
      '<span class="note-entry-status"></span></div><div class="note-entry-reader"></div>' +
      '<p class="note-entry-message" role="status" hidden></p>' +
      '<button class="btn text note-entry-edit" type="button" data-notes-action="edit-other-legacy">查看原有记录</button>' +
      '<button class="btn text" type="button" data-notes-action="export-other-legacy" hidden>导出保留的原有草稿</button>';
  }
  list.append(node);
  const draft = legacy && retainedLegacy(legacy);
  node.hidden = !legacy || !(legacy.version > 0 || draft);
  if (!legacy) return;
  node.querySelector('.note-entry-label').textContent = category === 'work' ? '工作' : '生活';
  paintTime(node.querySelector('time'), legacy.updatedAt);
  node.querySelector('.note-entry-reader').textContent = draft ? legacy.draft : legacy.deleted ? '原有记录已删除。' : legacy.serverText;
  node.querySelector('.note-entry-status').textContent = draft ? statuses[legacy.phase] || '保留的原有草稿' : '原有记录 · 只读';
  const message = node.querySelector('.note-entry-message'); message.textContent = legacy.error; message.hidden = !legacy.error;
  const edit = node.querySelector('[data-notes-action="edit-other-legacy"]');
  edit.dataset.legacyCategory = category; edit.textContent = draft ? '查看保留的原有草稿' : '查看原有记录';
  const exportButton = node.querySelector('[data-notes-action="export-other-legacy"]');
  exportButton.dataset.legacyCategory = category; exportButton.hidden = !draft;
}

// Saved cards contain plain text; the single active field is kept intact across acknowledgements.
export function paintNoteEntries(root, store, current, legacy, {drafts = [], confirmId = '', active = '', otherLegacy = null, otherCategory = '', labels = []} = {}) {
  const find = selector => root.querySelector(selector), list = find('#notes-entry-list');
  root.dataset.date = current.date;
  const dateInput = find('#notes-date'); if (dateInput.value !== current.date) dateInput.value = current.date;
  find('[data-notes-action="next"]').disabled = current.date >= dailyNotesToday();
  const canEdit = current.loaded && current.canEdit;
  find('[data-notes-action="new"]').hidden = !canEdit;
  find('[data-notes-action="login"]').hidden = !current.loaded || current.canEdit;
  find('#notes-entry-message').textContent = current.error; find('#notes-entry-message').hidden = !current.error;
  const items = current.ids.map(id => store.entry(id)).filter(Boolean);
  const saved = items.filter(item => item.id !== active && (item.version > 0 || item.localVersion > 0 || noteDraftNeedsAttention(item)));
  const unpublished = find('#notes-unpublished');
  const nodes = new Map([...list.children, ...unpublished.children].filter(node => node.dataset.noteEntry).map(node => [node.dataset.noteEntry, node])), wanted = new Set(saved.map(item => item.id));
  for (const [id, node] of nodes) if (!wanted.has(id)) node.remove();
  for (const item of saved) {
    const node = nodes.get(item.id) || createEntryElement(item, false);
    (noteDraftNeedsAttention(item) ? unpublished : list).append(node);
    paintSavedEntry(node, item);
  }
  paintActiveEditor(root, store, active, legacy, confirmId, labels); paintLegacySummary(root, legacy, active);
  (retainedLegacy(legacy) ? unpublished : list).append(root.querySelector('#notes-legacy-saved'));
  paintOtherLegacy(root, list, otherLegacy, otherCategory);
  if (otherLegacy && retainedLegacy(otherLegacy)) unpublished.append(root.querySelector('#notes-legacy-other'));
  const composer = find('#notes-composer'), activeItem = active === 'legacy' ? legacy : store.entry(active);
  composer.hidden = !activeItem; composer.dataset.active = active;
  find('[data-notes-action="collapse"]').disabled = !noteEditorCanCollapse(activeItem);
  find('#notes-entry-empty').hidden = !(current.allLoaded ?? current.loaded) || Boolean(activeItem) || saved.length > 0 || legacy.version > 0 ||
    noteDraftNeedsAttention(legacy) || Boolean(otherLegacy && (otherLegacy.version > 0 || noteDraftNeedsAttention(otherLegacy)));
  const unresolved = items.some(noteDraftNeedsAttention) || noteDraftNeedsAttention(legacy);
  const status = find('#notes-status');
  status.textContent = !current.loaded && current.loading ? '' : current.error ? '读取失败' :
    unresolved ? '有未发送内容' : canEdit ? '' : current.loaded ? '公开只读' : '';
  status.hidden = canEdit && !current.error && !unresolved;
  paintRetainedDrafts(root, current, drafts);
}
