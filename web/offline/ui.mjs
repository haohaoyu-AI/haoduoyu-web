import {onOfflineRuntime} from './runtime.mjs';
import {conflictDecisionToken} from './conflict-decisions.mjs';

export function offlineStatusLabel(state) {
  if (state.unsupported) return '需新版';
  if (state.conflicts) return '有冲突';
  if (!state.online) return `离线（${state.pending || 0} 条待同步）`;
  if (state.phase === 'syncing' || state.pending) return '同步中';
  return '已同步';
}
function textNode(document, tag, text, className) {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
}
function readable(value) {
  if (!value) return '（线上已不存在）';
  const text = value.body !== undefined ? value.title + '\n' + value.body : value.text ?? value.title;
  if (typeof value.completed === 'boolean') return `${text || ''}\n日期：${value.date || ''}` +
    `\n完成：${value.completed ? '是' : '否'}\n版本：${value.version || ''}`;
  return typeof text === 'string' ? text : JSON.stringify(value, null, 2);
}
const absent = value => !value || value.deleted || value.deleted_at;
const selectedLocal = row => Object.hasOwn(row, 'review_local') ? row.review_local : row.local;
const selectedRemote = row => Object.hasOwn(row, 'review_remote') ? row.review_remote : row.remote;
export function conflictLocalChoiceLabel(conflict) {
  const local = selectedLocal(conflict), remote = selectedRemote(conflict), type = conflict.operation.entity_type;
  if (absent(local) && absent(remote)) return '确认删除结果';
  if (conflict.copy_required || absent(remote) || conflict.reason === 'MEMO_GROUP_UNAVAILABLE' ||
      type === 'todo' && (local?.date !== remote.date || local?.text !== remote.text) ||
      type === 'note_entry' && (local?.date !== remote.date || local?.category !== remote.category) ||
      type === 'memo_note' && local?.group_id !== remote.group_id) return '另存本地副本';
  return '用本地';
}
function conflictActions(document, conflict, runtime, refresh, requests) {
  const actions = document.createElement('div'); actions.className = 'offline-conflict-actions';
  const localLabel = conflictLocalChoiceLabel(conflict);
  for (const [choice, label] of [['use-local', localLabel], ['use-server', '用线上'], ['keep-both', '两份都留']]) {
    const button = textNode(document, 'button', label, 'btn text'); button.type = 'button';
    button.disabled = requests.busy(conflict.key);
    button.addEventListener('click', async () => {
      const controller = requests.begin(conflict.key);
      if (!controller) return;
      for (const control of actions.children) control.disabled = true;
      const cancel = textNode(document, 'button', '取消', 'btn text'); cancel.type = 'button';
      cancel.addEventListener('click', () => controller.abort()); actions.append(cancel);
      try {
        const result = await runtime.resolve(conflict.key, choice, {signal: controller.signal,
          expected: conflictDecisionToken(conflict), copyConfirmed: localLabel === '另存本地副本'});
        requests.message(conflict.key, result.blocked ? result.resolution_message : '');
      } catch (error) {
        requests.message(conflict.key, error.name === 'AbortError' ? '本次选择已取消，原文仍保留。' : error.message);
      } finally { requests.end(conflict.key, controller); cancel.remove(); await refresh(); }
    });
    actions.append(button);
  }
  return actions;
}
function conflictEvidence(document, conflict) {
  const history = document.createElement('details');
  history.append(textNode(document, 'summary', '先前对比（原文保留）'));
  for (const row of conflict.remote_history || []) history.append(textNode(document, 'pre', readable(row)));
  return history;
}
function queueRows(document, queue, runtime, refresh, requests) {
  const root = document.createDocumentFragment();
  if (!queue.operations.length && !queue.conflicts.length) root.append(textNode(document, 'p', '本机内容已同步。'));
  const labels = {queued: '等待同步', sending: '同步中', unknown: '结果待核对', paused: '需联网核实身份',
    blocked: '需处理', conflict: '有冲突'};
  for (const operation of queue.operations) {
    const item = textNode(document, 'p', `${operation.needs_upgrade ? '需新版' : labels[operation.status] || '等待同步'} · ${readable(operation.local)}`,
      'offline-queue-row');
    if (operation.error) item.append(textNode(document, 'span', ' · ' + operation.error));
    root.append(item);
  }
  for (const conflict of queue.conflicts) {
    const item = document.createElement('article'); item.className = 'offline-conflict';
    item.append(textNode(document, 'h3', '两份内容已保留'), textNode(document, 'p', '本机内容'),
      textNode(document, 'pre', readable(selectedLocal(conflict))), textNode(document, 'p', '线上内容'),
      textNode(document, 'pre', readable(selectedRemote(conflict))));
    if (conflict.remote_history?.length) item.append(conflictEvidence(document, conflict));
    if (conflict.resolution_message) item.append(textNode(document, 'p', conflict.resolution_message));
    if (requests.message(conflict.key)) item.append(textNode(document, 'p', requests.message(conflict.key)));
    if (conflict.needs_upgrade) {
      item.append(textNode(document, 'p', '此本机操作需新版页面处理，原内容已保留。'));root.append(item);continue;
    }
    if (conflict.resolution) {
      const labels = {queued: '选择已存本机，正在核对线上结果。', conflict: '新保存有冲突，请核对下方的新比较内容。',
        blocked: '新保存暂未完成，原文与选择仍保留。', paused: '需联网核实后继续，原文与选择仍保留。'};
      item.append(textNode(document, 'p', labels[conflict.resolution.state] || '正在核对线上结果。'));
      root.append(item); continue;
    }
    if (conflictLocalChoiceLabel(conflict) === '另存本地副本')
      item.append(textNode(document, 'p', '副本会使用新记录，原记录保持原状。'));
    item.append(conflictActions(document, conflict, runtime, refresh, requests)); root.append(item);
  }
  return root;
}
function pageAnnotation(document, state) {
  const page = new URL(document.defaultView.location.href).searchParams.get('page') || 'dashboard';
  const header = document.querySelector('#page-header');
  let banner = document.querySelector('#offline-page-note');
  let label = '';
  if (page === 'settings' && !state.online) label = '设置需联网后使用。';
  if (page === 'todos' && state.partial) label = '当前仅显示本机已保存的事项，完整列表需联网读取。';
  if (page === 'dashboard' && !state.online && state.cachedAt) label = '数据截至 ' +
    new Date(state.cachedAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false});
  if (label && header) {
    if (!banner) { banner = textNode(document, 'p', '', 'offline-page-note'); banner.id = 'offline-page-note'; header.append(banner); }
    if (banner.textContent !== label) banner.textContent = label;
  } else banner?.remove();
  const content = document.querySelector('#page-content');
  if (content) {
    const unavailable = page === 'settings' && !state.online;
    content.inert = unavailable;
    if (unavailable || content.dataset.offlineHidden === 'true') content.hidden = unavailable;
    content.dataset.offlineHidden = String(unavailable);
  }
}
function mountRuntimeUI(runtime, {document, window}) {
  let state = {...runtime.state}, expanded = false, rendering = 0;
  const pending = new Map(), messages = new Map(), requests = {
    busy: key => pending.has(key),
    begin(key) { if (pending.has(key)) return null; const controller = new AbortController(); pending.set(key, controller); return controller; },
    end(key, controller) { if (pending.get(key) === controller) pending.delete(key); },
    message(key, value) { if (value !== undefined) messages.set(key, value); return messages.get(key) || ''; },
    cancel() { for (const controller of pending.values()) controller.abort(); }
  };
  const root = document.createElement('aside'); root.className = 'offline-indicator'; root.setAttribute('aria-label', '同步状态');
  const button = textNode(document, 'button', '', 'offline-state-button'); button.type = 'button';
  button.setAttribute('aria-controls', 'offline-queue'); button.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('section'); panel.id = 'offline-queue'; panel.className = 'offline-queue';
  panel.setAttribute('aria-label', '本机待同步内容与冲突'); panel.hidden = true;
  root.append(button, panel);
  async function refreshQueue() {
    if (!expanded) return;
    const sequence = ++rendering, queue = await runtime.queue();
    if (sequence !== rendering || !expanded) return;
    panel.replaceChildren(textNode(document, 'h2', '同步队列'), queueRows(document, queue, runtime, refreshQueue, requests));
  }
  function mount() {
    if (!root.isConnected && document.body) document.body.append(root);
    root.hidden = !state.identity;
    const label = offlineStatusLabel(state);
    if (button.textContent !== label) button.textContent = label;
    root.dataset.phase = state.conflicts ? 'conflict' : state.phase;
    pageAnnotation(document, state);
  }
  button.addEventListener('click', () => {
    expanded = !expanded; panel.hidden = !expanded; button.setAttribute('aria-expanded', String(expanded));
    if (!expanded) requests.cancel();
    if (expanded) void refreshQueue();
  });
  const unsubscribe = runtime.subscribe(next => {
    state = next; mount(); if (expanded) void refreshQueue();
    window.dispatchEvent(new CustomEvent('haoduoyu-offline-status', {detail: {pending: state.pending, conflicts: state.conflicts}}));
  });
  const observer = new MutationObserver(mount); observer.observe(document.body, {childList: true, subtree: true});
  const stop = runtime.start({window, document}); mount();
  return () => { requests.cancel(); unsubscribe(); observer.disconnect(); stop(); root.remove(); };
}
export function startOfflineUI({document = globalThis.document, window = globalThis.window} = {}) {
  if (!document?.body || !window) return () => {};
  let stop = () => {};
  const unsubscribe = onOfflineRuntime(runtime => { stop(); stop = mountRuntimeUI(runtime, {document, window}); });
  return () => { unsubscribe(); stop(); };
}
