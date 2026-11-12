// A counted to-do keeps its tally at the front of the ordinary note ("2/5 次 · 原备注"),
// so it syncs, backs up and shows in every client without a schema change.
const pattern = /^(\d{1,3})\/(\d{1,3}) 次(?: · ([\s\S]*))?$/;
export const TODO_COUNT_MAX = 99;
export function todoCount(note) {
  const match = pattern.exec(String(note ?? ""));
  if (!match) return null;
  const done = Number(match[1]), target = Number(match[2]);
  if (target < 1 || target > TODO_COUNT_MAX || done > target) return null;
  return { done, target, rest: match[3] || "" };
}
export function todoCountNote(done, target, rest = "") {
  return `${done}/${target} 次${rest ? ` · ${rest}` : ""}`;
}
/** The note after one counting action; null when the action does not apply. */
export function todoCountChange(note, action, target = 0) {
  const current = todoCount(note), text = String(note ?? "");
  if (action === "set") {
    if (!Number.isInteger(target) || target < 1 || target > TODO_COUNT_MAX) return null;
    return todoCountNote(Math.min(current?.done ?? 0, target), target, current ? current.rest : text);
  }
  if (!current) return null;
  if (action === "clear") return current.rest;
  if (action === "add") return current.done < current.target ? todoCountNote(current.done + 1, current.target, current.rest) : null;
  if (action === "undo") return current.done > 0 ? todoCountNote(current.done - 1, current.target, current.rest) : null;
  return null;
}
