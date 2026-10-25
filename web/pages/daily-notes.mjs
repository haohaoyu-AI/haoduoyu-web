import {e} from '../core/dom.mjs';
import {dailyNotesBytes, dailyNotesToday, dailyNotesRouteCategory} from '../core/daily-notes-state.mjs';

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
    '<p id="notes-entry-empty" class="notes-empty" hidden>这一天还没有记录。</p>' +
    '<div id="notes-entry-list" class="notes-entry-list"></div>' +
    '<article id="notes-legacy-card" class="note-entry notes-legacy-card" hidden>' +
    '<div class="note-entry-head"><span class="note-entry-time">原有记录</span>' +
    '<span id="notes-legacy-status" class="note-entry-status" role="status" aria-live="polite"></span></div>' +
    '<p id="notes-message" class="notes-message" role="alert" hidden></p>' +
    '<div class="notes-sheet"><label for="notes-editor" class="sr-only">这一天的碎碎念</label>' +
    '<textarea id="notes-editor" class="notes-editor" placeholder="写下一点想说的话…" hidden></textarea>' +
    '<div id="notes-reader" class="notes-reader" tabindex="0"></div>' +
    '<p id="notes-empty" class="notes-empty" hidden>这一天还没有留下文字。</p></div>' +
    '<div class="notes-footer"><span id="notes-detail" class="notes-detail"></span>' +
    '<div id="notes-write-actions" class="notes-write-actions" hidden>' +
    '<button class="btn" type="button" data-notes-action="save">立即保存</button>' +
    '<button class="btn" type="button" data-notes-action="restore" hidden>恢复这一天</button>' +
    '<button class="btn text" type="button" data-notes-action="delete">删除原有记录</button></div></div>' +
    '<div id="notes-delete-confirm" class="notes-confirm" hidden><p>删除原有记录？</p>' +
    '<button class="btn" type="button" data-notes-action="cancel-delete">取消</button>' +
    '<button class="btn" type="button" data-notes-action="confirm-delete">确认删除</button></div>' +
    '<div id="notes-resolution" class="notes-resolution" hidden>' +
    '<button class="btn" type="button" data-notes-action="check">核对服务器版本</button>' +
    '<button class="btn" type="button" data-notes-action="retry" hidden>重试同一保存</button>' +
    '<div id="notes-conflict-actions" hidden><p>服务器上的文字：</p><pre id="notes-remote"></pre>' +
    '<button class="btn" type="button" data-notes-action="use-server">采用服务器内容</button>' +
    '<button class="btn" type="button" data-notes-action="use-draft">用此草稿保存到新版本</button></div></div></article>' +
    '<aside class="notes-history" aria-label="已有碎碎念的日期"><h2>最近的文字</h2>' +
    '<div id="notes-dates"></div><p id="notes-dates-error" role="status"></p>' +
    '<button class="btn text" type="button" data-notes-action="more" hidden>更早的日期</button></aside></section>';
}

const statuses = {loading: '正在读取…', dirty: '等待保存', saving: '正在保存…', conflict: '草稿有冲突',
  unknown: '保存结果待核对', error: '暂未保存', oversize: '文字过长'};
export function paintDailyNotes(root, item, {drafts = [], dates = [], hasMore = false, datesLoading = false, datesError = '', compatibility = false} = {}) {
  if (!root) return;
  root.dataset.date = item.date;
  const find = selector => root.querySelector(selector);
  const date = find('#notes-date'), editor = find('#notes-editor'), reader = find('#notes-reader');
  if (date.value !== item.date) date.value = item.date;
  editor.dataset.date = item.date;
  editor.hidden = !item.loaded || !item.canEdit;
  editor.disabled = ['delete', 'restore'].includes(item.pending?.kind);
  if (editor.dataset.composing !== 'true' && editor.value !== item.draft) editor.value = item.draft;
  reader.hidden = !item.loaded || item.canEdit || !item.serverText;
  reader.textContent = item.serverText;
  find('#notes-empty').hidden = !item.loaded || item.canEdit || Boolean(item.serverText);
  const actual = statuses[item.phase] || (item.canEdit ? '已保存' : '公开只读');
  const status = find(compatibility ? '#notes-legacy-status' : '#notes-status');
  status.textContent = !item.loaded && item.loading ? '正在读取…' :
    item.canEdit && ['dirty', 'saving', 'saved'].includes(item.phase) ? '自动保存' : actual;
  status.setAttribute('aria-label', actual);
  status.dataset.phase = item.phase;
  find('#notes-message').hidden = !item.error;
  find('#notes-message').textContent = item.error;
  find('#notes-detail').textContent = item.canEdit ? dailyNotesBytes(item.draft) + ' / 65536 字节 · 自动保存' : '所有访客都能阅读';
  find('#notes-write-actions').hidden = !item.loaded || !item.canEdit;
  if (!compatibility) find('[data-notes-action="login"]').hidden = !item.loaded || item.canEdit;
  const blocked = Boolean(item.pending) || ['conflict', 'unknown'].includes(item.phase);
  find('[data-notes-action="save"]').disabled = blocked || !item.dirty;
  find('[data-notes-action="restore"]').hidden = !item.deleted;
  find('[data-notes-action="restore"]').disabled = blocked || item.dirty;
  find('[data-notes-action="delete"]').disabled = blocked || item.deleted || item.version === 0;
  find('[data-notes-action="next"]').disabled = item.date >= dailyNotesToday();
  if (!compatibility) {
  const draftBox = find('#notes-drafts');
  const retained = drafts.filter(value => value.date !== item.date || ['conflict', 'unknown', 'oversize', 'error'].includes(value.phase));
  draftBox.hidden = !retained.length;
  draftBox.innerHTML = '<span>本页签保留的未保存草稿：</span>' + retained.map(value =>
    '<button class="btn text" type="button" data-notes-date="' + e(value.date) + '">' + e(value.date) + '</button>').join('');
  }
  find('#notes-resolution').hidden = !['conflict', 'unknown'].includes(item.phase) && !(item.phase === 'error' && !item.loaded);
  find('[data-notes-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find('[data-notes-action="retry"]').hidden = item.phase !== 'unknown' || !item.pending?.retryReady || !item.canEdit;
  find('#notes-conflict-actions').hidden = item.phase !== 'conflict' || !item.remote;
  find('#notes-remote').textContent = item.remote?.deleted ? '（这一天已删除）' : item.remote?.text || '（空白）';
  find('[data-notes-action="use-draft"]').disabled = item.remote?.can_edit !== true;
  if (!compatibility) {
  find('#notes-dates').innerHTML = dates.map(value => '<button class="btn text notes-day' +
    (value === item.date ? ' notes-day-current' : '') + '" type="button" data-notes-date="' + e(value) + '">' + e(value) + '</button>').join('');
  const more = find('[data-notes-action="more"]');
  more.hidden = !hasMore; more.disabled = datesLoading;
  more.textContent = datesLoading ? '正在读取…' : '更早的日期';
  find('#notes-dates-error').textContent = datesError || (!datesLoading && !dates.length ? '还没有已保存的文字。可用上方日期选择任意过去的一天。' : '');
  }
}

export function noteEntryTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(value));
}
function createEntryElement(item) {
  const node = document.createElement('article');
  node.className = 'note-entry'; node.dataset.noteEntry = item.id;
  node.innerHTML = '<div class="note-entry-head"><time class="note-entry-time"></time>' +
    '<span class="note-entry-status" role="status" aria-live="polite"></span></div>' +
    '<label class="sr-only" for="entry-' + e(item.id) + '">碎碎念内容</label>' +
    '<textarea id="entry-' + e(item.id) + '" class="note-entry-editor" data-note-entry-editor="' + e(item.id) +
    '" placeholder="写下一点想说的话…" rows="3"></textarea>' +
    '<div class="note-entry-reader"></div><p class="note-entry-message" role="alert" hidden></p>' +
    '<div class="note-entry-actions"><button class="btn text" type="button" data-note-entry-action="save" hidden>重试保存</button>' +
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
  return node;
}
function paintEntry(node, item, confirmId) {
  const find = selector => node.querySelector(selector), editor = find('textarea'), time = find('time');
  const actualTime = noteEntryTime(item.createdAt);
  time.textContent = actualTime || '新记录';
  if (actualTime) { time.dateTime = item.createdAt; time.title = '记录时间（北京时间）'; }
  else { time.removeAttribute('datetime'); time.removeAttribute('title'); }
  const phase = statuses[item.phase] || (item.deleted ? '已删除' : item.version ? '已保存' : '写下后自动保存');
  const status = find('.note-entry-status'); status.textContent = phase; status.dataset.phase = item.phase;
  editor.dataset.date = item.date; editor.dataset.category = item.category;
  editor.hidden = !item.canEdit || item.deleted;
  editor.disabled = ['delete', 'restore'].includes(item.pending?.kind);
  if (editor.dataset.composing !== 'true' && editor.value !== item.draft) {
    const active = document.activeElement === editor, start = editor.selectionStart, end = editor.selectionEnd,
      direction = editor.selectionDirection, scroll = editor.scrollTop;
    editor.value = item.draft;
    if (active) { editor.setSelectionRange(Math.min(start, item.draft.length), Math.min(end, item.draft.length), direction); editor.scrollTop = scroll; }
  }
  const reader = find('.note-entry-reader'); reader.textContent = item.deleted ? '这条记录已删除。' : item.serverText;
  reader.hidden = item.canEdit && !item.deleted;
  const message = find('.note-entry-message'); message.textContent = item.error; message.hidden = !item.error;
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

// Update each tile in place. A save acknowledgement never replaces an active textarea.
export function paintNoteEntries(root, store, current, legacy, {drafts = [], dates = [], hasMore = false,
  datesLoading = false, datesError = '', confirmId = ''} = {}) {
  const find = selector => root.querySelector(selector), list = find('#notes-entry-list');
  root.dataset.date = current.date;
  const dateInput = find('#notes-date'); if (dateInput.value !== current.date) dateInput.value = current.date;
  find('[data-notes-action="next"]').disabled = current.date >= dailyNotesToday();
  const canEdit = current.loaded && current.canEdit;
  find('[data-notes-action="new"]').hidden = !canEdit;
  find('[data-notes-action="login"]').hidden = !current.loaded || current.canEdit;
  find('#notes-entry-message').textContent = current.error; find('#notes-entry-message').hidden = !current.error;
  const items = current.ids.map(id => store.entry(id)).filter(Boolean);
  const nodes = new Map([...list.children].map(node => [node.dataset.noteEntry, node]));
  const wanted = new Set(items.map(item => item.id));
  for (const [id, node] of nodes) if (!wanted.has(id)) node.remove();
  let cursor = list.firstElementChild;
  for (const item of items) {
    const node = nodes.get(item.id) || createEntryElement(item);
    if (node === cursor) cursor = cursor.nextElementSibling;
    else list.insertBefore(node, cursor);
    paintEntry(node, item, confirmId);
  }
  const legacyVisible = legacy.version > 0 || legacy.dirty || legacy.pending || ['unknown', 'conflict', 'error'].includes(legacy.phase);
  find('#notes-legacy-card').hidden = !legacyVisible;
  find('#notes-entry-empty').hidden = !current.loaded || items.length > 0 || legacyVisible;
  const unresolved = items.filter(item => ['error', 'unknown', 'conflict', 'oversize'].includes(item.phase));
  const status = find('#notes-status');
  status.textContent = !current.loaded && current.loading ? '正在读取…' : current.error ? '读取失败' :
    unresolved.length ? '有草稿待处理' : canEdit ? '自动保存' : current.loaded ? '公开只读' : '正在读取…';
  const draftBox = find('#notes-drafts');
  const retained = [...new Set(drafts.filter(value => value.date !== current.date || value.category !== current.category)
    .map(value => value.category + ':' + value.date))];
  draftBox.hidden = !retained.length;
  draftBox.innerHTML = '<span>保留的草稿：</span>' + retained.map(key => {
    const [category, date] = key.split(':');
    return '<button class="btn text" type="button" data-notes-draft-category="' + e(category) + '" data-notes-date="' + e(date) + '">' +
      (category === 'work' ? '工作 ' : '生活 ') + e(date) + '</button>';
  }).join('');
  find('#notes-dates').innerHTML = dates.map(date => '<button class="btn text notes-day' +
    (date === current.date ? ' notes-day-current' : '') + '" type="button" data-notes-date="' + e(date) + '">' + e(date) + '</button>').join('');
  const more = find('[data-notes-action="more"]'); more.hidden = !hasMore; more.disabled = datesLoading;
  more.textContent = datesLoading ? '正在读取…' : '更早的日期';
  find('#notes-dates-error').textContent = datesError || (!datesLoading && !dates.length ? '还没有已保存的记录。' : '');
}
