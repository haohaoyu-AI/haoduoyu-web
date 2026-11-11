import { e } from "../core/dom.mjs";

export function todoNoteField(item, { pending = false, editing = null, error = "", date = "", future = false } = {}) {
  const active = editing?.id === item.id;
  const alert = error && active ? `<span class="todo-note-error" role="alert">${e(error)}</span>` : "";
  const marker = future ? ` data-future="1"` : "";
  if (active) {
    return `<input class="todo-note-input" data-todo-note-input type="text" maxlength="4000" enterkeyhint="done" autocomplete="off" ` +
      `spellcheck="false" aria-label="备注" data-id="${e(item.id)}" data-date="${e(date)}"${marker} value="${e(editing.text ?? "")}"` +
      `${pending ? " disabled" : ""}>${alert}`;
  }
  const text = item.note ? `<span class="todo-note-text">${e(item.note)}</span>` : "";
  const label = item.note ? "编辑备注" : "添加备注";
  return `<button class="todo-note-hit${item.note ? "" : " is-empty"}" type="button" data-action="todo-note" data-id="${e(item.id)}" ` +
    `data-date="${e(date)}"${marker} aria-label="${label}"${pending ? " disabled" : ""}>${text}</button>`;
}
