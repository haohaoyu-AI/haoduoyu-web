import {e} from '../core/dom.mjs';
import {dailyNotesBytes, dailyNotesToday, dailyNotesRouteCategory} from '../core/daily-notes-state.mjs';

export function renderDailyNotes() {
  const category = dailyNotesRouteCategory();
  return '<section id="daily-notes" class="daily-notes" aria-label="碎碎念" data-category="' + category + '">' +
    '<div class="notes-categories segmented" role="group" aria-label="碎碎念分类">' + ['life', 'work'].map(value =>
      '<button type="button" data-notes-category="' + value + '" aria-pressed="' + (value === category) + '">' +
      (value === 'work' ? '工作碎碎念' : '生活碎碎念') + '</button>').join('') + '</div>' +
    '<p class="notes-legacy-notice muted"' + (category === 'work' ? ' hidden' : '') +
    '>原有碎碎念保留在此兼容默认项，未自动分析或分类。</p>' +
    '<div class="notes-toolbar"><div class="notes-date-controls">' +
    '<button class="btn" type="button" data-notes-action="previous" aria-label="前一天">‹</button>' +
    '<label class="notes-date-label"><span class="sr-only">选择碎碎念日期</span>' +
    '<input id="notes-date" class="input" type="date" max="' + dailyNotesToday() + '"></label>' +
    '<button class="btn" type="button" data-notes-action="next" aria-label="后一天">›</button>' +
    '<button class="btn text" type="button" data-notes-action="today">今天</button></div>' +
    '<span id="notes-status" class="notes-status" role="status" aria-live="polite">正在读取…</span></div>' +
    '<div id="notes-drafts" class="notes-drafts" hidden></div>' +
    '<p id="notes-message" class="notes-message" role="alert" hidden></p>' +
    '<div class="notes-sheet"><label for="notes-editor" class="sr-only">这一天的碎碎念</label>' +
    '<textarea id="notes-editor" class="notes-editor" placeholder="写下一点想说的话…" hidden></textarea>' +
    '<div id="notes-reader" class="notes-reader" tabindex="0"></div>' +
    '<p id="notes-empty" class="notes-empty" hidden>这一天还没有留下文字。</p></div>' +
    '<div class="notes-footer"><span id="notes-detail" class="notes-detail"></span>' +
    '<button class="btn" type="button" data-notes-action="login" hidden>所有者登录</button>' +
    '<div id="notes-write-actions" class="notes-write-actions" hidden>' +
    '<button class="btn" type="button" data-notes-action="save">立即保存</button>' +
    '<button class="btn" type="button" data-notes-action="restore" hidden>恢复这一天</button>' +
    '<button class="btn text" type="button" data-notes-action="delete">删除这一天</button></div></div>' +
    '<div id="notes-delete-confirm" class="notes-confirm" hidden><p>删除这一天的文字？</p>' +
    '<button class="btn" type="button" data-notes-action="cancel-delete">取消</button>' +
    '<button class="btn" type="button" data-notes-action="confirm-delete">确认删除</button></div>' +
    '<div id="notes-resolution" class="notes-resolution" hidden>' +
    '<button class="btn" type="button" data-notes-action="check">核对服务器版本</button>' +
    '<button class="btn" type="button" data-notes-action="retry" hidden>重试同一保存</button>' +
    '<div id="notes-conflict-actions" hidden><p>服务器上的文字：</p><pre id="notes-remote"></pre>' +
    '<button class="btn" type="button" data-notes-action="use-server">采用服务器内容</button>' +
    '<button class="btn" type="button" data-notes-action="use-draft">用此草稿保存到新版本</button></div></div>' +
    '<aside class="notes-history" aria-label="已有碎碎念的日期"><h2>最近的文字</h2>' +
    '<div id="notes-dates"></div><p id="notes-dates-error" role="status"></p>' +
    '<button class="btn text" type="button" data-notes-action="more" hidden>更早的日期</button></aside></section>';
}

const statuses = {loading: '正在读取…', dirty: '等待保存', saving: '正在保存…', conflict: '草稿有冲突',
  unknown: '保存结果待核对', error: '暂未保存', oversize: '文字过长'};
export function paintDailyNotes(root, item, {drafts = [], dates = [], hasMore = false, datesLoading = false, datesError = ''} = {}) {
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
  find('#notes-status').textContent = !item.loaded && item.loading ? '正在读取…' :
    item.canEdit && ['dirty', 'saving', 'saved'].includes(item.phase) ? '自动保存' : actual;
  find('#notes-status').setAttribute('aria-label', actual);
  find('#notes-status').dataset.phase = item.phase;
  find('#notes-message').hidden = !item.error;
  find('#notes-message').textContent = item.error;
  find('#notes-detail').textContent = item.canEdit ? dailyNotesBytes(item.draft) + ' / 65536 字节 · 自动保存' : '所有访客都能阅读';
  find('#notes-write-actions').hidden = !item.loaded || !item.canEdit;
  find('[data-notes-action="login"]').hidden = !item.loaded || item.canEdit;
  const blocked = Boolean(item.pending) || ['conflict', 'unknown'].includes(item.phase);
  find('[data-notes-action="save"]').disabled = blocked || !item.dirty;
  find('[data-notes-action="restore"]').hidden = !item.deleted;
  find('[data-notes-action="restore"]').disabled = blocked || item.dirty;
  find('[data-notes-action="delete"]').disabled = blocked || item.deleted || item.version === 0;
  find('[data-notes-action="next"]').disabled = item.date >= dailyNotesToday();
  const draftBox = find('#notes-drafts');
  const retained = drafts.filter(value => value.date !== item.date || ['conflict', 'unknown', 'oversize', 'error'].includes(value.phase));
  draftBox.hidden = !retained.length;
  draftBox.innerHTML = '<span>本页签保留的未保存草稿：</span>' + retained.map(value =>
    '<button class="btn text" type="button" data-notes-date="' + e(value.date) + '">' + e(value.date) + '</button>').join('');
  find('#notes-resolution').hidden = !['conflict', 'unknown'].includes(item.phase) && !(item.phase === 'error' && !item.loaded);
  find('[data-notes-action="check"]').disabled = item.loading || Boolean(item.pending?.checking);
  find('[data-notes-action="retry"]').hidden = item.phase !== 'unknown' || !item.pending?.retryReady || !item.canEdit;
  find('#notes-conflict-actions').hidden = item.phase !== 'conflict' || !item.remote;
  find('#notes-remote').textContent = item.remote?.deleted ? '（这一天已删除）' : item.remote?.text || '（空白）';
  find('[data-notes-action="use-draft"]').disabled = item.remote?.can_edit !== true;
  find('#notes-dates').innerHTML = dates.map(value => '<button class="btn text notes-day' +
    (value === item.date ? ' notes-day-current' : '') + '" type="button" data-notes-date="' + e(value) + '">' + e(value) + '</button>').join('');
  const more = find('[data-notes-action="more"]');
  more.hidden = !hasMore; more.disabled = datesLoading;
  more.textContent = datesLoading ? '正在读取…' : '更早的日期';
  find('#notes-dates-error').textContent = datesError || (!datesLoading && !dates.length ? '还没有已保存的文字。可用上方日期选择任意过去的一天。' : '');
}
