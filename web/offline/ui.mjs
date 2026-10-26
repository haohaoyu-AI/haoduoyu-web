import {onOfflineRuntime} from './runtime.mjs';

export function offlineStatusLabel(state) {
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
  const text = value.text ?? value.body ?? value.title;
  if (typeof value.completed === 'boolean') return `${text || ''}\n日期：${value.date || ''}` +
    `\n完成：${value.completed ? '是' : '否'}\n版本：${value.version || ''}`;
  return typeof text === 'string' ? text : JSON.stringify(value, null, 2);
}
function queueRows(document, queue, runtime, refresh) {
  const root = document.createDocumentFragment();
  if (!queue.operations.length && !queue.conflicts.length) root.append(textNode(document, 'p', '本机内容已同步。'));
  const labels = {queued: '等待同步', sending: '同步中', unknown: '结果待核对', paused: '需联网核实身份',
    blocked: '需处理', conflict: '有冲突'};
  for (const operation of queue.operations) {
    const item = textNode(document, 'p', `${labels[operation.status] || '等待同步'} · ${readable(operation.local)}`,
      'offline-queue-row');
    if (operation.error) item.append(textNode(document, 'span', ' · ' + operation.error));
    root.append(item);
  }
  for (const conflict of queue.conflicts) {
    const item = document.createElement('article'); item.className = 'offline-conflict';
    item.append(textNode(document, 'h3', '两份内容已保留'), textNode(document, 'p', '本机内容'),
      textNode(document, 'pre', readable(conflict.local)), textNode(document, 'p', '线上内容'),
      textNode(document, 'pre', readable(conflict.remote)));
    if (conflict.needs_followup) item.append(textNode(document, 'p', '选择已记下，两份内容仍保留，等待后续处理。', 'offline-followup'));
    const actions = document.createElement('div'); actions.className = 'offline-conflict-actions';
    for (const [choice, label] of [['use-local', '用本地'], ['use-server', '用线上'], ['keep-both', '两份都留']]) {
      const button = textNode(document, 'button', label, 'btn text'); button.type = 'button';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await runtime.resolve(conflict.key, choice); await refresh(); }
        catch (error) { item.append(textNode(document, 'p', error.message)); }
        finally { button.disabled = false; }
      });
      actions.append(button);
    }
    item.append(actions); root.append(item);
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
    panel.replaceChildren(textNode(document, 'h2', '同步队列'), queueRows(document, queue, runtime, refreshQueue));
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
    if (expanded) void refreshQueue();
  });
  const unsubscribe = runtime.subscribe(next => {
    state = next; mount(); if (expanded) void refreshQueue();
    window.dispatchEvent(new CustomEvent('haoduoyu-offline-status', {detail: {pending: state.pending, conflicts: state.conflicts}}));
  });
  const observer = new MutationObserver(mount); observer.observe(document.body, {childList: true, subtree: true});
  const stop = runtime.start({window, document}); mount();
  return () => { unsubscribe(); observer.disconnect(); stop(); root.remove(); };
}
export function startOfflineUI({document = globalThis.document, window = globalThis.window} = {}) {
  if (!document?.body || !window) return () => {};
  let stop = () => {};
  const unsubscribe = onOfflineRuntime(runtime => { stop(); stop = mountRuntimeUI(runtime, {document, window}); });
  return () => { unsubscribe(); stop(); };
}
