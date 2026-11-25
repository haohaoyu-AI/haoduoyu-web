import { e } from "../core/dom.mjs";

export function todoNoteField(item, { pending = false, editing = null, error = "", date = "", future = false, hasDraft = false } = {}) {
  const active = editing?.id === item.id;
  const alert = error && (active || hasDraft) ? `<span class="todo-note-error" role="alert">${e(error)}</span>` : "";
  const marker = future ? ` data-future="1"` : "";
  if (active) {
    const editable = pending ? "false" : "true";
    return `<span class="todo-note-hit todo-note-text todo-note-input" data-todo-note-input role="textbox" contenteditable="${editable}" ` +
      `enterkeyhint="done" spellcheck="false" aria-multiline="false" aria-label="备注" data-id="${e(item.id)}" data-date="${e(date)}"${marker}>` +
      `${e(editing.text ?? "")}</span>${alert}`;
  }
  const label = hasDraft ? "恢复备注草稿" : item.note ? "编辑备注" : "添加备注";
  const text = hasDraft ? label : item.note ? `<span class="todo-note-text">${e(item.note)}</span>` : "";
  return `<button class="todo-note-hit${item.note ? "" : " is-empty"}" type="button" data-action="todo-note" data-id="${e(item.id)}" ` +
    `data-date="${e(date)}"${marker} aria-label="${label}"${pending ? " disabled" : ""}>${text}</button>${alert}`;
}
