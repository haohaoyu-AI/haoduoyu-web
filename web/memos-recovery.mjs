import {e} from './core/dom.mjs';

let recoveries = [], selectedRecovery = -1;
export function resetMemoRecovery() { recoveries = []; selectedRecovery = -1; }
function recoverable(raw) {
  return raw && typeof raw.id === 'string' && typeof raw.title === 'string' && typeof raw.body === 'string' &&
    raw.body.length <= 262144 && (raw.dirty || raw.pending || raw.phase === 'conflict');
}
function snapshots(storage, ownerId) {
  const prefix = 'haoduoyu.memos.drafts.v1.' + ownerId, rows = [], seen = new Set();
  const keys = [];
  for (let index = 0; index < Math.min(storage.length, 1000); index++) {
    const key = storage.key(index);
    if (key === prefix || key?.startsWith(prefix + '.')) keys.push(key);
    if (keys.length === 200) break;
  }
  for (const key of keys) {
    try {
      const text = storage.getItem(key);
      if (!text || text.length > 8 * 1024 * 1024) continue;
      const value = JSON.parse(text);
      if (!Array.isArray(value.drafts)) continue;
      for (const raw of value.drafts.slice(0, 200).filter(recoverable)) {
        const fingerprint = JSON.stringify([raw.id, raw.title, raw.body, raw.version, raw.pending?.body?.save_id || '']);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint); rows.push({raw, savedAt: value.saved_at || raw.updated_at || '', key});
      }
    } catch { /* A malformed local snapshot cannot replace the current draft. */ }
  }
  return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 100);
}
function label(row, index) {
  const timestamp = Date.parse(row.savedAt), date = Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : '保存时间未知';
  return (index + 1) + '. ' + (row.raw.title || '未命名笔记') + ' · ' + date + ' · 版本 ' + row.raw.version;
}
export function openMemoRecovery(root, store, ownerId) {
  if (!store.state.canEdit || !ownerId || !root) return;
  resetMemoRecovery();
  const find = q => root.querySelector(q);
  try { recoveries = snapshots(window.localStorage, ownerId); }
  catch { store.state.error = '无法读取此浏览器保存的草稿。'; }
  find('#memo-recovery').hidden = false;
  find('#memo-recovery-detail').hidden = true;
  find('#memo-recovery-list').innerHTML = recoveries.map((row, index) =>
    '<button type="button" class="memo-recovery-item" data-memo-recovery="' + index + '">' + e(label(row, index)) + '</button>').join('');
  find('#memo-recovery-status').textContent = recoveries.length ?
    '仅显示此所有者在本机保留的最近 100 份草稿。选择后可复制文字；恢复前会核对服务器版本。' : '此浏览器没有找到可恢复的草稿。';
}
export function selectMemoRecovery(root, index) {
  const row = recoveries[index];
  if (!root || !row || !Number.isSafeInteger(index)) return;
  selectedRecovery = index;
  root.querySelector('#memo-recovery-detail').hidden = false;
  root.querySelector('#memo-recovery-selected').textContent = label(row, index);
  root.querySelector('#memo-recovery-copy').value = row.raw.title + '\n\n' + row.raw.body;
  root.querySelector('#memo-recovery-copy').focus();
}
export async function restoreMemoRecovery(root, store) {
  const row = recoveries[selectedRecovery];
  if (!row || !store.state.canEdit) return;
  await store.recoverDraft(row.raw);
  root.querySelector('#memo-recovery-status').textContent = store.state.error ||
    '草稿已取回编辑区。请核对保存状态；存在服务器新版本时不会自动覆盖。';
}
